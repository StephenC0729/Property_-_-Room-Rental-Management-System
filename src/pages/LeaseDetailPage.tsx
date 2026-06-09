import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Home, User, CreditCard, CalendarDays, Wallet,
  AlertTriangle, CheckCircle2, FileText, Loader2, Phone,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, isPast, differenceInDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { useAuthStore } from '@/store/authStore'
import { formatRinggit } from '@/utils/exportCsv'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import type { Lease, Tenant, Room, Property } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PaymentRecord {
  id: string
  amount: number
  payment_method: 'cash' | 'bank_transfer'
  reference: string | null
  billing_month: string
  payment_date: string
  created_at: string
}

interface LeaseDetail extends Lease {
  tenants?: (Tenant & { properties?: null }) | null
  rooms?: (Room & { properties?: Pick<Property, 'id' | 'name'> | null }) | null
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useLeaseDetail(id: string) {
  return useQuery({
    queryKey: ['leases', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leases')
        .select(`
          *,
          tenants ( * ),
          rooms (
            id, code, room_number, base_rent, status,
            properties ( id, name, address )
          )
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as LeaseDetail
    },
    enabled: !!id,
  })
}

function usePaymentHistory(leaseId: string) {
  return useQuery({
    queryKey: ['payments', leaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_history')
        .select('*')
        .eq('lease_id', leaseId)
        .order('payment_date', { ascending: false })
      if (error) throw error
      return data as PaymentRecord[]
    },
    enabled: !!leaseId,
  })
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function InfoGrid({ items }: { items: { label: string; value: string | number | null; highlight?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {items.map(({ label, value, highlight }) => (
        <div key={label} className="space-y-1">
          <dt className="text-xs text-white/35">{label}</dt>
          <dd className={`text-sm font-semibold ${highlight ? 'text-violet-300' : 'text-white'}`}>
            {value ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function MethodBadge({ method }: { method: 'cash' | 'bank_transfer' }) {
  return method === 'cash'
    ? <span className="inline-flex items-center gap-1 text-xs text-white/50">💵 Cash</span>
    : <span className="inline-flex items-center gap-1 text-xs text-white/50">🏦 Transfer</span>
}

function StatusInfo({ lease }: { lease: LeaseDetail }) {
  const expiryDate = new Date(lease.expiry_date)
  const daysLeft = differenceInDays(expiryDate, new Date())
  const isExpired = isPast(expiryDate)

  if (lease.status === 'terminated') {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
        <p className="text-sm text-red-300">This lease has been <strong>terminated</strong>. The room is now vacant.</p>
      </div>
    )
  }
  if (lease.status === 'expired' || (lease.status === 'active' && isExpired)) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-orange-500/20 bg-orange-500/8 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
        <p className="text-sm text-orange-300">This lease <strong>expired on {format(expiryDate, 'dd MMM yyyy')}</strong>. Consider renewing or terminating.</p>
      </div>
    )
  }
  if (daysLeft <= 30) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-yellow-500/20 bg-yellow-500/8 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
        <p className="text-sm text-yellow-300">This lease expires in <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong> — {format(expiryDate, 'dd MMM yyyy')}.</p>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
      <p className="text-sm text-emerald-300">
        Active lease · Expires <strong>{format(expiryDate, 'dd MMM yyyy')}</strong> ({daysLeft} days remaining)
      </p>
    </div>
  )
}

// ─── Terminate Dialog ─────────────────────────────────────────────────────────

function TerminateDialog({
  open, onClose, lease, onDone,
}: {
  open: boolean
  onClose: () => void
  lease: LeaseDetail
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async () => {
      const { error: leaseErr } = await supabase
        .from('leases')
        .update({ status: 'terminated' })
        .eq('id', lease.id)
      if (leaseErr) throw leaseErr

      const { error: roomErr } = await supabase
        .from('rooms')
        .update({ status: 'vacant' })
        .eq('id', lease.room_id)
      if (roomErr) throw roomErr

      await logAudit({
        action: 'LEASE_TERMINATED',
        target_type: 'lease',
        target_id: lease.id,
        metadata: {
          tenant_name: lease.tenants?.full_name,
          room_code:   lease.rooms?.code,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leases'] })
      queryClient.invalidateQueries({ queryKey: ['room-matrix'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Lease terminated. Room is now vacant.')
      onClose()
      onDone()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="border-white/10 bg-[#111118] text-white sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Terminate Lease
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <p className="text-white/70">
            You are about to terminate the lease for:
          </p>
          <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3 space-y-1">
            <p className="font-semibold text-white">{lease.tenants?.full_name}</p>
            <p className="text-white/40 text-xs">Room {lease.rooms?.code} · {lease.rooms?.properties?.name}</p>
          </div>
          <p className="text-white/50">
            This will set the lease to <span className="text-red-400 font-medium">Terminated</span> and mark the room as <span className="text-white font-medium">Vacant</span>. This action cannot be undone.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/40 hover:text-white">
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-red-600 hover:bg-red-500 text-white"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Termination
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function LeaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuthStore()
  const [showTerminate, setShowTerminate] = useState(false)

  const { data: lease, isLoading } = useLeaseDetail(id!)
  const { data: payments, isLoading: paymentsLoading } = usePaymentHistory(id!)

  const totalPaid    = payments?.reduce((s, p) => s + p.amount, 0) ?? 0
  const paymentCount = payments?.length ?? 0

  const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    active:     { label: 'Active',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
    expired:    { label: 'Expired',    cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
    terminated: { label: 'Terminated', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  }
  const badge = STATUS_BADGE[lease?.status ?? 'active'] ?? STATUS_BADGE.active

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] p-4 md:p-6 lg:p-8 space-y-6 max-w-3xl">
        <Skeleton className="h-6 w-24 bg-white/10" />
        <Skeleton className="h-10 w-64 bg-white/10" />
        <Skeleton className="h-32 rounded-xl bg-white/5" />
        <Skeleton className="h-48 rounded-xl bg-white/5" />
      </div>
    )
  }

  if (!lease) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/40">Lease not found.</p>
          <Button asChild className="mt-4" variant="ghost"><Link to="/leases">← Back</Link></Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4 md:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 right-1/4 h-[350px] w-[350px] rounded-full bg-violet-600/8 blur-[100px]" />
      </div>

      {/* Back */}
      <button onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> Leases
      </button>

      <div className="max-w-3xl space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge className={`text-xs ${badge.cls}`}>{badge.label}</Badge>
            </div>
            <h1 className="text-2xl font-bold text-white">
              {lease.tenants?.full_name ?? '—'}
            </h1>
            <p className="mt-1 text-sm text-white/35 flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5" />
              {lease.rooms?.properties?.name ?? '—'} · Room {lease.rooms?.code ?? '—'}
            </p>
          </div>
          {isAdmin() && lease.status === 'active' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTerminate(true)}
              className="border border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Terminate
            </Button>
          )}
        </div>

        {/* Status alert */}
        <StatusInfo lease={lease} />

        {/* Lease details */}
        <Card className="border-white/8 bg-white/[0.03] p-6 space-y-5">
          <h2 className="text-sm font-semibold text-white/50 flex items-center gap-1.5">
            <CreditCard className="h-4 w-4 text-violet-400" /> Financial Terms
          </h2>
          <InfoGrid items={[
            { label: 'Monthly Rent',      value: formatRinggit(lease.monthly_rent), highlight: true },
            { label: 'Due Day',           value: `Day ${lease.due_day} of each month` },
            { label: 'Security Deposit',  value: formatRinggit(lease.security_deposit) },
            { label: 'Utility Deposit',   value: formatRinggit(lease.utility_deposit) },
          ]} />
          <Separator className="bg-white/6" />
          <h2 className="text-sm font-semibold text-white/50 flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-violet-400" /> Dates
          </h2>
          <InfoGrid items={[
            { label: 'Move-in Date',  value: format(new Date(lease.move_in_date), 'dd MMM yyyy') },
            { label: 'Expiry Date',   value: format(new Date(lease.expiry_date), 'dd MMM yyyy') },
            { label: 'Created',       value: format(new Date(lease.created_at), 'dd MMM yyyy') },
            { label: 'Duration',      value: `${differenceInDays(new Date(lease.expiry_date), new Date(lease.move_in_date))} days` },
          ]} />
          {lease.notes && (
            <>
              <Separator className="bg-white/6" />
              <div>
                <p className="text-xs text-white/35 mb-1">Notes</p>
                <p className="text-sm text-white/70">{lease.notes}</p>
              </div>
            </>
          )}
        </Card>

        {/* Tenant + Room cards */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="border-white/8 bg-white/[0.03] p-4">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Tenant
            </h2>
            <Link to={`/tenants/${lease.tenant_id}`} className="group">
              <p className="text-sm font-semibold text-white group-hover:text-violet-300 transition-colors">
                {lease.tenants?.full_name ?? '—'}
              </p>
              <p className="text-xs text-white/35 mt-1 flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> {lease.tenants?.nric_passport ?? '—'}
              </p>
              <p className="text-xs text-white/35 mt-0.5 flex items-center gap-1">
                <Phone className="h-3 w-3" /> {lease.tenants?.phone ?? '—'}
              </p>
              <p className="text-xs text-violet-400 mt-2 group-hover:text-violet-300 transition-colors">
                View profile →
              </p>
            </Link>
          </Card>

          <Card className="border-white/8 bg-white/[0.03] p-4">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5" /> Room
            </h2>
            <Link to={`/properties/${lease.rooms?.property_id}`} className="group">
              <p className="text-sm font-semibold text-white group-hover:text-violet-300 transition-colors">
                {lease.rooms?.properties?.name ?? '—'} · Room {lease.rooms?.code ?? '—'}
              </p>
              <p className="text-xs text-white/35 mt-1">Room No. {lease.rooms?.room_number}</p>
              <p className="text-xs text-white/35 mt-0.5">Base rent: {formatRinggit(lease.rooms?.base_rent ?? 0)}</p>
              <p className="text-xs text-violet-400 mt-2 group-hover:text-violet-300 transition-colors">
                View room matrix →
              </p>
            </Link>
          </Card>
        </div>

        {/* Payment History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
              <Wallet className="h-4 w-4" /> Payment History
            </h2>
            {paymentCount > 0 && (
              <div className="flex items-center gap-3 text-xs text-white/30">
                <span>{paymentCount} payment{paymentCount !== 1 ? 's' : ''}</span>
                <span className="text-emerald-400 font-medium">{formatRinggit(totalPaid)} total</span>
              </div>
            )}
          </div>

          {paymentsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl bg-white/5" />)}
            </div>
          ) : !payments?.length ? (
            <Card className="border-white/8 bg-white/[0.03] p-8 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-white/15" />
              <p className="text-sm text-white/30">No payments recorded yet.</p>
              <p className="text-xs text-white/20 mt-1">
                Log payments from the Room Matrix page.
              </p>
            </Card>
          ) : (
            <Card className="border-white/8 bg-white/[0.03] overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 border-b border-white/6 text-xs font-medium text-white/30 uppercase tracking-wider">
                <span>Billing Month</span>
                <span className="text-right hidden sm:block">Method</span>
                <span className="text-right hidden sm:block">Reference</span>
                <span className="text-right">Amount</span>
              </div>

              {payments.map((payment, idx) => (
                <div
                  key={payment.id}
                  className={`grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 items-center text-sm
                    ${idx !== payments.length - 1 ? 'border-b border-white/4' : ''}`}
                >
                  <div>
                    <p className="text-white font-medium">
                      {format(new Date(payment.billing_month), 'MMMM yyyy')}
                    </p>
                    <p className="text-xs text-white/30 mt-0.5">
                      Paid {format(new Date(payment.payment_date ?? payment.created_at), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <MethodBadge method={payment.payment_method} />
                  </div>
                  <div className="hidden sm:block text-xs text-white/30 max-w-[120px] truncate text-right">
                    {payment.reference ?? '—'}
                  </div>
                  <div className="text-right">
                    <span className="text-emerald-400 font-semibold">{formatRinggit(payment.amount)}</span>
                  </div>
                </div>
              ))}

              {/* Total row */}
              <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 border-t border-white/8 bg-white/[0.02]">
                <span className="text-xs text-white/30 font-medium uppercase tracking-wider">Total Collected</span>
                <span className="text-right font-bold text-emerald-400">{formatRinggit(totalPaid)}</span>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Terminate Dialog */}
      <TerminateDialog
        open={showTerminate}
        onClose={() => setShowTerminate(false)}
        lease={lease}
        onDone={() => navigate('/leases')}
      />
    </div>
  )
}
