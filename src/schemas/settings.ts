import { z } from 'zod'

export const nameSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
})

export type NameFormValues = z.infer<typeof nameSchema>

export const passwordSchema = z.object({
  new_password:     z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine(d => d.new_password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

export type PasswordFormValues = z.infer<typeof passwordSchema>
