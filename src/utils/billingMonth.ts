import { format, startOfMonth, subMonths } from 'date-fns'
import { formatBillingMonthKey, getCurrentBillingMonth } from '@/utils/whatsapp'

export interface BillingMonthOption {
  value: string
  label: string
}

/** First month with production data (Jan 2025). */
export const EARLIEST_BILLING_MONTH = '2025-01-01'

/** Build yyyy-MM-01 options from `fromKey` through `toDate` (newest first). */
export function buildBillingMonthRange(
  fromKey: string = EARLIEST_BILLING_MONTH,
  toDate: Date = getCurrentBillingMonth(),
): BillingMonthOption[] {
  const from = startOfMonth(parseBillingMonthKey(fromKey))
  const to = startOfMonth(toDate)
  const options: BillingMonthOption[] = []

  for (let d = to; d >= from; d = subMonths(d, 1)) {
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

export function getBillingMonthLabel(
  value: string,
  options: BillingMonthOption[],
): string {
  return options.find(o => o.value === value)?.label ?? value
}

/** Filter month options by label, value prefix, or yyyy-MM fragment. */
export function filterBillingMonthOptions(
  options: BillingMonthOption[],
  query: string,
): BillingMonthOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options.slice(0, 6)

  return options.filter(o => {
    const valuePrefix = o.value.slice(0, 7).toLowerCase()
    return (
      o.label.toLowerCase().includes(q) ||
      valuePrefix.includes(q) ||
      o.value.toLowerCase().startsWith(q)
    )
  })
}

/** Resolve free-text input to a billing month key within `options`, or null. */
export function resolveBillingMonthQuery(
  query: string,
  options: BillingMonthOption[],
): string | null {
  const q = query.trim().toLowerCase()
  if (!q) return null

  const exactLabel = options.find(o => o.label.toLowerCase() === q)
  if (exactLabel) return exactLabel.value

  const yyyyMm = q.match(/^(\d{4})-(\d{1,2})$/)
  if (yyyyMm) {
    const key = `${yyyyMm[1]}-${yyyyMm[2].padStart(2, '0')}-01`
    if (options.some(o => o.value === key)) return key
  }

  const matches = filterBillingMonthOptions(options, query)
  if (matches.length === 1) return matches[0].value

  return null
}
