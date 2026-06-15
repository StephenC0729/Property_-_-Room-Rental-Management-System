import { format, startOfMonth, subMonths } from 'date-fns'
import { formatBillingMonthKey } from '@/utils/whatsapp'

export interface BillingMonthOption {
  value: string
  label: string
}

/** Build yyyy-MM-01 options for the last N months (current month included). */
export function buildBillingMonthOptions(count = 13): BillingMonthOption[] {
  const options: BillingMonthOption[] = []
  for (let i = 0; i < count; i++) {
    const d = startOfMonth(subMonths(new Date(), i))
    options.push({
      value: formatBillingMonthKey(d),
      label: format(d, 'MMMM yyyy'),
    })
  }
  return options
}

/** Parse a billing month key (yyyy-MM-dd) as a local calendar date. */
export function parseBillingMonthKey(key: string): Date {
  const [year, month, day] = key.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

export const BILLING_MONTH_OPTIONS = buildBillingMonthOptions()
