import { useMemo } from 'react'
import {
  buildBillingMonthRange,
  getBillingMonthLabel,
  type BillingMonthOption,
} from '@/utils/billingMonth'
import { formatBillingMonthKey, getCurrentBillingMonth } from '@/utils/whatsapp'

export function useBillingMonthOptions() {
  const currentMonthKey = formatBillingMonthKey(getCurrentBillingMonth())

  const options = useMemo(
    () => buildBillingMonthRange(),
    [currentMonthKey],
  )

  return {
    options,
    currentMonthKey,
    getLabel: (value: string) => getBillingMonthLabel(value, options),
  }
}

export type { BillingMonthOption }
