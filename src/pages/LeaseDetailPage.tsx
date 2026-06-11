import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft, Home, User, CreditCard, CalendarDays, Wallet,
  AlertTriangle, CheckCircle2, FileText, Loader2, Phone, Pencil,
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
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import type { Lease, Tenant, Room, Property } from '@/types'

// ─── Types & Schema ────────────────────────────────────────────────────────────

const editLeaseSchema = z.object({
  monthly_rent:      z.coerce.number().min(0, 'Monthly rent must be 0 or greater'),
  due_day:           z.coerce.number().int().min(1).max(28),
  move_in_date:      z.string().optional(),
  expiry_date:       z.string().optional(),
  security_deposit:  z.coerce.number().min(0),
  utility_deposit:   z.coerce.number().min(0),
  notes:             z.string().optional(),
}).refine(d => {
  if (!d.move_in_date || !d.expiry_date) return true;
  return new Date(d.expiry_date) > new Date(d.move_in_date);
}, {
  message: 'Expiry must be after move-in date',
  path: ['expiry_date'],
})
type EditLeaseFormValues = z.infer<typeof editLeaseSchema>

interface PaymentRecord {
  id: string
  amount: number
  payment_method: 'cash' | 'bank_transfer'
  reference: string | null
  billing_month: string
  payment_date: string
  paid_at: string
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
          <dt className="text-xs text-muted-foreground/70">{label}</dt>
          <dd className={`text-sm font-semibold ${highlight ? 'text-violet-300' : 'text-foreground'}`}>
            {value ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function MethodBadge({ method }: { method: 'cash' | 'bank_transfer' }) {
  return method === 'cash'
    ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">💵 Cash</span>
    : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">🏦 Transfer</span>
}

function StatusInfo({ lease }: { lease: LeaseDetail }) {
  if (!lease.expiry_date) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        <p className="text-sm text-emerald-300">
          Active lease · <strong>No expiry date</strong>
        </p>
      </div>
    )
  }

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
      <DialogContent className="border-border bg-card text-foreground sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Terminate Lease
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <p className="text-white/70">
            You are about to terminate the lease for:
          </p>
          <div className="rounded-lg border border-border bg-card p-3 space-y-1">
            <p className="font-semibold text-foreground">{lease.tenants?.full_name}</p>
            <p className="text-muted-foreground text-xs">Room {lease.rooms?.code} · {lease.rooms?.properties?.name}</p>
          </div>
          <p className="text-muted-foreground">
            This will set the lease to <span className="text-red-400 font-medium">Terminated</span> and mark the room as <span className="text-foreground font-medium">Vacant</span>. This action cannot be undone.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-red-600 hover:bg-red-500 text-foreground"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Termination
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Lease Dialog ────────────────────────────────────────────────────────

function EditLeaseDialog({
  open, onClose, lease,
}: {
  open: boolean
  onClose: () => void
  lease: LeaseDetail
}) {
  const queryClient = useQueryClient()

  const form = useForm<EditLeaseFormValues>({
    resolver: zodResolver(editLeaseSchema),
    values: {
      monthly_rent: lease.monthly_rent,
      due_day: lease.due_day,
      move_in_date: lease.move_in_date || '',
      expiry_date: lease.expiry_date || '',
      security_deposit: lease.security_deposit,
      utility_deposit: lease.utility_deposit,
      notes: lease.notes || '',
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: EditLeaseFormValues) => {
      const payload = {
        ...values,
        move_in_date: values.move_in_date || null,
        expiry_date: values.expiry_date || null,
        notes: values.notes?.trim() || null,
      }
      const { error } = await supabase
        .from('leases')
        .update(payload)
        .eq('id', lease.id)
      if (error) throw error

      await logAudit({
        action: 'LEASE_UPDATED',
        target_type: 'lease',
        target_id: lease.id,
        metadata: payload,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leases'] })
      queryClient.invalidateQueries({ queryKey: ['room-matrix'] })
      toast.success('Lease updated successfully.')
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Lease Terms</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="monthly_rent" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Monthly Rent (RM)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" className="bg-muted border-border text-foreground focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="due_day" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Due Day (1-28)</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" max="28" className="bg-muted border-border text-foreground focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="move_in_date" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Move-in Date</FormLabel>
                  <FormControl>
                    <Input type="date" className="bg-muted border-border text-foreground focus:border-violet-500/60 cursor-pointer" onClick={e => e.currentTarget.showPicker?.()} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="expiry_date" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Expiry Date</FormLabel>
                  <FormControl>
                    <Input type="date" className="bg-muted border-border text-foreground focus:border-violet-500/60 cursor-pointer" onClick={e => e.currentTarget.showPicker?.()} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="security_deposit" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Security Deposit</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" className="bg-muted border-border text-foreground focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="utility_deposit" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Utility Deposit</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" className="bg-muted border-border text-foreground focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Notes</FormLabel>
                <FormControl>
                  <Input className="bg-muted border-border text-foreground focus:border-violet-500/60" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} className="bg-violet-600 hover:bg-violet-500 text-white">
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
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
  const [showEdit, setShowEdit] = useState(false)

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
      <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8 space-y-6 max-w-3xl">
        <Skeleton className="h-6 w-24 bg-white/10" />
        <Skeleton className="h-10 w-64 bg-white/10" />
        <Skeleton className="h-32 rounded-xl bg-muted" />
        <Skeleton className="h-48 rounded-xl bg-muted" />
      </div>
    )
  }

  if (!lease) {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Lease not found.</p>
          <Button asChild className="mt-4" variant="ghost"><Link to="/leases">← Back</Link></Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 right-1/4 h-[350px] w-[350px] rounded-full bg-violet-600/8 blur-[100px]" />
      </div>

      {/* Back */}
      <button onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white/70 transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> Leases
      </button>

      <div className="max-w-3xl space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge className={`text-xs ${badge.cls}`}>{badge.label}</Badge>
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {lease.tenants?.full_name ?? '—'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground/70 flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5" />
              {lease.rooms?.properties?.name ?? '—'} · Room {lease.rooms?.code ?? '—'}
            </p>
          </div>
          {isAdmin() && lease.status === 'active' && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEdit(true)}
                className="border border-border text-white/70 hover:bg-white/10 hover:text-foreground"
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTerminate(true)}
                className="border border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Terminate
              </Button>
            </div>
          )}
        </div>

        {/* Status alert */}
        <StatusInfo lease={lease} />

        {/* Lease details */}
        <Card className="border-border bg-card p-6 space-y-5">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <CreditCard className="h-4 w-4 text-violet-400" /> Financial Terms
          </h2>
          <InfoGrid items={[
            { label: 'Monthly Rent',      value: formatRinggit(lease.monthly_rent), highlight: true },
            { label: 'Due Day',           value: `Day ${lease.due_day} of each month` },
            { label: 'Security Deposit',  value: formatRinggit(lease.security_deposit) },
            { label: 'Utility Deposit',   value: formatRinggit(lease.utility_deposit) },
          ]} />
          <Separator className="bg-white/6" />
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-violet-400" /> Dates
          </h2>
          <InfoGrid items={[
            { label: 'Move-in Date',  value: lease.move_in_date ? format(new Date(lease.move_in_date), 'dd MMM yyyy') : '—' },
            { label: 'Expiry Date',   value: lease.expiry_date ? format(new Date(lease.expiry_date), 'dd MMM yyyy') : '—' },
            { label: 'Created',       value: format(new Date(lease.created_at), 'dd MMM yyyy') },
            { label: 'Duration',      value: lease.move_in_date && lease.expiry_date ? `${differenceInDays(new Date(lease.expiry_date), new Date(lease.move_in_date))} days` : '—' },
          ]} />
          {lease.notes && (
            <>
              <Separator className="bg-white/6" />
              <div>
                <p className="text-xs text-muted-foreground/70 mb-1">Notes</p>
                <p className="text-sm text-white/70">{lease.notes}</p>
              </div>
            </>
          )}
        </Card>

        {/* Tenant + Room cards */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="border-border bg-card p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Tenant
            </h2>
            <Link to={`/tenants/${lease.tenant_id}`} className="group">
              <p className="text-sm font-semibold text-foreground group-hover:text-violet-300 transition-colors">
                {lease.tenants?.full_name ?? '—'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> {lease.tenants?.nric_passport ?? '—'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                <Phone className="h-3 w-3" /> {lease.tenants?.phone ?? '—'}
              </p>
              <p className="text-xs text-violet-400 mt-2 group-hover:text-violet-300 transition-colors">
                View profile →
              </p>
            </Link>
          </Card>

          <Card className="border-border bg-card p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5" /> Room
            </h2>
            <Link to={`/properties/${lease.rooms?.property_id}`} className="group">
              <p className="text-sm font-semibold text-foreground group-hover:text-violet-300 transition-colors">
                {lease.rooms?.properties?.name ?? '—'} · Room {lease.rooms?.code ?? '—'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">Room No. {lease.rooms?.room_number}</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">Base rent: {formatRinggit(lease.rooms?.base_rent ?? 0)}</p>
              <p className="text-xs text-violet-400 mt-2 group-hover:text-violet-300 transition-colors">
                View room matrix →
              </p>
            </Link>
          </Card>
        </div>

        {/* Payment History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Wallet className="h-4 w-4" /> Payment History
            </h2>
            {paymentCount > 0 && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
                <span>{paymentCount} payment{paymentCount !== 1 ? 's' : ''}</span>
                <span className="text-emerald-400 font-medium">{formatRinggit(totalPaid)} total</span>
              </div>
            )}
          </div>

          {paymentsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl bg-muted" />)}
            </div>
          ) : !payments?.length ? (
            <Card className="border-border bg-card p-8 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground/70">No payments recorded yet.</p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                Log payments from the Room Matrix page.
              </p>
            </Card>
          ) : (
            <Card className="border-border bg-card overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 border-b border-white/6 text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
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
                    <p className="text-foreground font-medium">
                      {format(new Date(payment.billing_month), 'MMMM yyyy')}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      Paid {format(new Date(payment.payment_date ?? payment.paid_at), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <MethodBadge method={payment.payment_method} />
                  </div>
                  <div className="hidden sm:block text-xs text-muted-foreground/70 max-w-[120px] truncate text-right">
                    {payment.reference ?? '—'}
                  </div>
                  <div className="text-right">
                    <span className="text-emerald-400 font-semibold">{formatRinggit(payment.amount)}</span>
                  </div>
                </div>
              ))}

              {/* Total row */}
              <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 border-t border-border bg-card">
                <span className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider">Total Collected</span>
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

      <EditLeaseDialog
        open={showEdit}
        onClose={() => setShowEdit(false)}
        lease={lease}
      />
    </div>
  )
}
