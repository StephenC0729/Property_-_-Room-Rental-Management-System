export interface PaymentAmountFields {
  amount: number
  water_bill?: number | null
  electricity_bill?: number | null
  aircond_bill?: number | null
}

export function getUtilitiesCollected(payment: PaymentAmountFields): number {
  return (
    Number(payment.water_bill ?? 0) +
    Number(payment.electricity_bill ?? 0) +
    Number(payment.aircond_bill ?? 0)
  )
}

export function getTotalCollected(payment: PaymentAmountFields): number {
  return Number(payment.amount) + getUtilitiesCollected(payment)
}
