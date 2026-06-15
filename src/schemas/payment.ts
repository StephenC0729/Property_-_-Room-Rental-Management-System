import { z } from 'zod'
import { getTotalCollected } from '@/utils/paymentUtils'

const paymentFields = {
  billing_month: z.string().min(1, 'Billing month is required'),
  payment_method: z.enum(['cash', 'bank_transfer']),
  payment_date: z.string().min(1, 'Payment date is required'),
  amount: z.coerce.number().min(0, 'Amount must be 0 or greater'),
  reference: z.string().optional(),
  water_bill: z.coerce.number().min(0).optional(),
  electricity_bill: z.coerce.number().min(0).optional(),
  aircond_bill: z.coerce.number().min(0).optional(),
}

export const paymentSchema = z.object(paymentFields).refine(
  (data) => getTotalCollected(data) > 0,
  {
    message: 'Enter rent and/or utility amounts — total must be greater than RM 0.00',
    path: ['amount'],
  },
)

export type PaymentFormValues = z.infer<typeof paymentSchema>

export const editPaymentSchema = z.object(paymentFields).refine(
  (data) => getTotalCollected(data) > 0,
  {
    message: 'Enter rent and/or utility amounts — total must be greater than RM 0.00',
    path: ['amount'],
  },
)

export type EditPaymentFormValues = z.infer<typeof editPaymentSchema>
