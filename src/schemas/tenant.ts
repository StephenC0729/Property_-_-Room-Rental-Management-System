import { z } from 'zod'

export const tenantSchema = z.object({
  full_name:          z.string().min(2, 'Full name is required'),
  nric_passport:      z.string().optional(),
  phone:              z.string().refine(v => !v || /^\+?[0-9\s\-()]{8,20}$/.test(v), 'Enter a valid phone number').optional(),
  emergency_name:     z.string().optional(),
  emergency_relation: z.string().optional(),
  emergency_phone:    z.string().optional(),
  notes:              z.string().optional(),
})

export type TenantFormValues = z.infer<typeof tenantSchema>
