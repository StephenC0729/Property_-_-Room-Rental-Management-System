import { z } from 'zod'

export const roomSchema = z.object({
  room_number: z.string().min(1, 'Room number is required').max(10),
  base_rent: z.coerce.number().min(0, 'Must be 0 or more'),
  status: z.enum(['vacant', 'maintenance']),
  notes: z.string().optional(),
})

export type RoomFormValues = z.infer<typeof roomSchema>
