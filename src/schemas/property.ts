import { z } from 'zod'

export const propertySchema = z.object({
  name: z.string().min(1, 'Property name is required').max(100),
  address: z.string().min(1, 'Address is required').max(300),
})

export type PropertyFormValues = z.infer<typeof propertySchema>
