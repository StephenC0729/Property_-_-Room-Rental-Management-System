import { z } from 'zod'

export const editLeaseSchema = z.object({
  monthly_rent:      z.coerce.number().min(0, 'Monthly rent must be 0 or greater'),
  due_day:           z.coerce.number().int().min(1).max(28),
  move_in_date:      z.string().optional(),
  expiry_date:       z.string().optional(),
  security_deposit:  z.coerce.number().min(0),
  utility_deposit:   z.coerce.number().min(0),
  notes:             z.string().optional(),
}).refine(d => {
  if (!d.move_in_date || !d.expiry_date) return true;
  return new Date(d.expiry_date) > new Date(d.move_in_date);
}, {
  message: 'Expiry must be after move-in date',
  path: ['expiry_date'],
})

export type EditLeaseFormValues = z.infer<typeof editLeaseSchema>

export const settlementSchema = z.object({
  rent_outstanding: z.coerce.number().min(0, 'Must be 0 or greater'),
  other_deductions: z.coerce.number().min(0, 'Must be 0 or greater'),
  deposit_applied:  z.coerce.number().min(0, 'Must be 0 or greater'),
  outcome:          z.enum(['settled', 'partial', 'written_off']),
  reason:           z.string().optional(),
  notes:            z.string().optional(),
}).refine(
  d => d.outcome !== 'written_off' || (d.reason?.trim().length ?? 0) > 0,
  { message: 'A reason is required when writing off bad debt', path: ['reason'] },
)

export type SettlementFormValues = z.infer<typeof settlementSchema>
