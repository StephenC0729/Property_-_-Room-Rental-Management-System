import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { format, isPast, differenceInDays } from 'date-fns'
import type { LeaseDetail } from '@/hooks/useLeaseDetail'

export function StatusInfo({ lease }: { lease: LeaseDetail }) {
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
