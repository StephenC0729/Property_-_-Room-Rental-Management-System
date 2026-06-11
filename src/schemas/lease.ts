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
