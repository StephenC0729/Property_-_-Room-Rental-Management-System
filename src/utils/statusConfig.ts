import type { BillingStatus } from '@/types'

export const statusConfig: Record<BillingStatus, {
  label: string; cardBg: string; cardBorder: string; dot: string; textColor: string
}> = {
  paid:        { label: 'Paid',        cardBg: 'bg-emerald-500/10', cardBorder: 'border-emerald-500/30', dot: 'bg-emerald-400',  textColor: 'text-emerald-400' },
  overdue:     { label: 'Overdue',     cardBg: 'bg-red-500/10',     cardBorder: 'border-red-500/30',     dot: 'bg-red-400',      textColor: 'text-red-400' },
  partial:     { label: 'Partial',     cardBg: 'bg-orange-500/10',  cardBorder: 'border-orange-500/30',  dot: 'bg-orange-400',   textColor: 'text-orange-400' },
  vacant:      { label: 'Vacant',      cardBg: 'bg-card',   cardBorder: 'border-border',        dot: 'bg-white/25',     textColor: 'text-muted-foreground/70' },
  maintenance: { label: 'Maintenance', cardBg: 'bg-yellow-500/10',  cardBorder: 'border-yellow-500/30',  dot: 'bg-yellow-400',   textColor: 'text-yellow-400' },
  upcoming:    { label: 'Upcoming',    cardBg: 'bg-blue-500/10',    cardBorder: 'border-blue-500/30',    dot: 'bg-blue-400',     textColor: 'text-blue-400' },
}
