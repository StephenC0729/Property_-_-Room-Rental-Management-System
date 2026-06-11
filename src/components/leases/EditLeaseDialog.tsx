import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { LeaseDetail } from '@/hooks/useLeaseDetail'
import { editLeaseSchema, type EditLeaseFormValues } from '@/schemas/lease'

export function EditLeaseDialog({
  open, onClose, lease,
}: {
  open: boolean
  onClose: () => void
  lease: LeaseDetail
}) {
  const queryClient = useQueryClient()

  const form = useForm<EditLeaseFormValues>({
    resolver: zodResolver(editLeaseSchema) as any,
    values: {
      monthly_rent: lease.monthly_rent,
      due_day: lease.due_day,
      move_in_date: lease.move_in_date || '',
      expiry_date: lease.expiry_date || '',
      security_deposit: lease.security_deposit,
      utility_deposit: lease.utility_deposit,
      notes: lease.notes || '',
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: EditLeaseFormValues) => {
      const payload = {
        ...values,
        move_in_date: values.move_in_date || null,
        expiry_date: values.expiry_date || null,
        notes: values.notes?.trim() || null,
      }
      const { error } = await supabase
        .from('leases')
        .update(payload)
        .eq('id', lease.id)
      if (error) throw error

      await logAudit({
        action: 'TENANT_UPDATED', // using fallback since LEASE_UPDATED not in AuditAction
        target_type: 'lease',
        target_id: lease.id,
        metadata: payload,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leases'] })
      queryClient.invalidateQueries({ queryKey: ['room-matrix'] })
      toast.success('Lease updated successfully.')
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Lease Terms</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="monthly_rent" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Monthly Rent (RM)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" className="bg-muted border-border text-foreground focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="due_day" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Due Day (1-28)</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" max="28" className="bg-muted border-border text-foreground focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="move_in_date" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Move-in Date</FormLabel>
                  <FormControl>
                    <Input type="date" className="bg-muted border-border text-foreground focus:border-violet-500/60 cursor-pointer" onClick={e => e.currentTarget.showPicker?.()} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="expiry_date" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Expiry Date</FormLabel>
                  <FormControl>
                    <Input type="date" className="bg-muted border-border text-foreground focus:border-violet-500/60 cursor-pointer" onClick={e => e.currentTarget.showPicker?.()} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="security_deposit" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Security Deposit</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" className="bg-muted border-border text-foreground focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="utility_deposit" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Utility Deposit</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" className="bg-muted border-border text-foreground focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Notes</FormLabel>
                <FormControl>
                  <Input className="bg-muted border-border text-foreground focus:border-violet-500/60" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} className="bg-violet-600 hover:bg-violet-500 text-white">
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
