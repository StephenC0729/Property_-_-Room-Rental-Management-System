import { z } from 'zod'

export const paymentSchema = z.object({
  payment_method: z.enum(['cash', 'bank_transfer']),
  payment_date: z.string().min(1, 'Payment date is required'),
  amount: z.coerce.number().min(0, 'Amount must be 0 or greater'),
  reference: z.string().optional(),
  water_bill: z.coerce.number().min(0).optional(),
  electricity_bill: z.coerce.number().min(0).optional(),
  aircond_bill: z.coerce.number().min(0).optional(),
})

export type PaymentFormValues = z.infer<typeof paymentSchema>
