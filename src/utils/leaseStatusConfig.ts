import type { LeaseStatus } from '@/types'

export const leaseStatusBadge: Record<LeaseStatus, { label: string; cls: string }> = {
  active:     { label: 'Active',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  expired:    { label: 'Expired',    cls: 'bg-muted text-muted-foreground/70 border-border' },
  terminated: { label: 'Terminated', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

const FALLBACK_BADGE = { label: '', cls: 'bg-muted text-muted-foreground/70 border-border' }

export function getLeaseStatusBadge(status: string): { label: string; cls: string } {
  const badge = leaseStatusBadge[status as LeaseStatus]
  if (badge) return badge
  return { ...FALLBACK_BADGE, label: status }
}
