import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Home, User, CreditCard, CalendarDays, Wallet,
  Pencil, AlertTriangle, FileText, Phone
} from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import { formatRinggit } from '@/utils/exportCsv'
import { getLeaseStatusBadge } from '@/utils/leaseStatusConfig'
import { getTotalCollected, getUtilitiesCollected } from '@/utils/paymentUtils'
import { parseBillingMonthKey } from '@/utils/billingMonth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

import { useLeaseDetail } from '@/hooks/useLeaseDetail'
import { usePaymentHistory, type PaymentRecord } from '@/hooks/usePaymentHistory'
import { InfoGrid } from '@/components/leases/InfoGrid'
import { MethodBadge } from '@/components/leases/MethodBadge'
import { StatusInfo } from '@/components/leases/StatusInfo'
import { TerminateDialog } from '@/components/leases/TerminateDialog'
import { EditLeaseDialog } from '@/components/leases/EditLeaseDialog'
import { EditPaymentDialog } from '@/components/payments/EditPaymentDialog'
import { useUIStore } from '@/store/uiStore'

export function LeaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, isSuperAdmin } = useAuthStore()
  const { activeModal, openModal, closeModal } = useUIStore()
  const [editingPayment, setEditingPayment] = useState<PaymentRecord | null>(null)

  const { data: lease, isLoading } = useLeaseDetail(id!)
  const { data: payments, isLoading: paymentsLoading } = usePaymentHistory(id!)

  const totalPaid    = payments?.reduce((s, p) => s + getTotalCollected(p), 0) ?? 0
  const rentPaid     = payments?.reduce((s, p) => s + p.amount, 0) ?? 0
  const utilitiesPaid = payments?.reduce((s, p) => s + getUtilitiesCollected(p), 0) ?? 0
  const paymentCount = payments?.length ?? 0

  const badge = getLeaseStatusBadge(lease?.status ?? 'active')

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
                variant="outline" 
                onClick={() => openModal('edit-lease')}
                className="bg-card hover:bg-muted text-foreground border-border"
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => openModal('terminate-lease')}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border-0"
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
                <span className="text-emerald-400 font-medium">{formatRinggit(rentPaid)} rent</span>
                {utilitiesPaid > 0 && (
                  <span className="text-sky-400 font-medium">{formatRinggit(utilitiesPaid)} utilities</span>
                )}
                <span className="text-violet-300 font-medium">{formatRinggit(totalPaid)} total</span>
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
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2.5 border-b border-white/6 text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                <span>Billing Month</span>
                <span className="text-right hidden sm:block">Method</span>
                <span className="text-right hidden sm:block">Reference</span>
                <span className="text-right">Amount</span>
                {isAdmin() && <span className="text-right w-8" />}
              </div>

              {payments.map((payment, idx) => {
                const utilities = getUtilitiesCollected(payment)
                const total = getTotalCollected(payment)
                return (
                <div
                  key={payment.id}
                  className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center text-sm
                    ${idx !== payments.length - 1 ? 'border-b border-white/4' : ''}`}
                >
                  <div>
                    <p className="text-foreground font-medium">
                      {format(parseBillingMonthKey(payment.billing_month), 'MMMM yyyy')}
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
                    <span className="text-violet-300 font-semibold">{formatRinggit(total)}</span>
                    {utilities > 0 && (
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                        {formatRinggit(payment.amount)} rent · {formatRinggit(utilities)} utilities
                      </p>
                    )}
                  </div>
                  {isAdmin() && (
                    <div className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingPayment(payment)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )})}

              {/* Total row */}
              <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 border-t border-border bg-card">
                <span className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider">Total Collected</span>
                <div className="text-right">
                  <span className="font-bold text-violet-300">{formatRinggit(totalPaid)}</span>
                  {utilitiesPaid > 0 && (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      {formatRinggit(rentPaid)} rent · {formatRinggit(utilitiesPaid)} utilities
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {lease && (
        <TerminateDialog
          lease={lease}
          open={activeModal === 'terminate-lease'}
          onClose={closeModal}
          onDone={() => navigate('/leases')}
        />
      )}

      {lease && (
        <EditLeaseDialog
          lease={lease}
          open={activeModal === 'edit-lease'}
          onClose={closeModal}
        />
      )}
      {lease && editingPayment && (
        <EditPaymentDialog
          open={true}
          onClose={() => setEditingPayment(null)}
          payment={editingPayment}
          leaseId={lease.id}
          roomCode={lease.rooms?.code ?? '—'}
          canDelete={isSuperAdmin()}
        />
      )}
    </div>
  )
}
