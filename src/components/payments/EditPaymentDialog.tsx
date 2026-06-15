import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { getTotalCollected } from '@/utils/paymentUtils'
import { useBillingMonthOptions } from '@/hooks/useBillingMonthOptions'
import { BillingMonthPicker } from '@/components/billing/BillingMonthPicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { PaymentRecord } from '@/hooks/usePaymentHistory'
import { editPaymentSchema, type EditPaymentFormValues } from '@/schemas/payment'

interface EditPaymentDialogProps {
  open: boolean
  onClose: () => void
  payment: PaymentRecord
  leaseId: string
  roomCode: string
  canDelete: boolean
}

export function EditPaymentDialog({
  open,
  onClose,
  payment,
  leaseId,
  roomCode,
  canDelete,
}: EditPaymentDialogProps) {
  const queryClient = useQueryClient()
  const { options: billingMonthOptions } = useBillingMonthOptions()

  const form = useForm<EditPaymentFormValues>({
    resolver: zodResolver(editPaymentSchema) as any,
    values: {
      billing_month: payment.billing_month.slice(0, 10),
      payment_method: payment.payment_method,
      payment_date: payment.payment_date?.slice(0, 10) ?? payment.paid_at.slice(0, 10),
      amount: payment.amount,
      reference: payment.reference ?? '',
      water_bill: payment.water_bill ?? 0,
      electricity_bill: payment.electricity_bill ?? 0,
      aircond_bill: payment.aircond_bill ?? 0,
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (values: EditPaymentFormValues) => {
      const payload = {
        billing_month: values.billing_month,
        payment_method: values.payment_method,
        payment_date: values.payment_date,
        amount: values.amount,
        reference: values.reference?.trim() || null,
        water_bill: values.water_bill || 0,
        electricity_bill: values.electricity_bill || 0,
        aircond_bill: values.aircond_bill || 0,
      }
      const { error } = await supabase
        .from('payment_history')
        .update(payload)
        .eq('id', payment.id)
      if (error) throw error

      await logAudit({
        action: 'PAYMENT_UPDATED',
        target_type: 'lease',
        target_id: leaseId,
        metadata: {
          payment_id: payment.id,
          room_code: roomCode,
          before: {
            billing_month: payment.billing_month,
            amount: payment.amount,
            total: getTotalCollected(payment),
          },
          after: {
            billing_month: values.billing_month,
            amount: values.amount,
            total: getTotalCollected(values),
          },
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', leaseId] })
      queryClient.invalidateQueries({ queryKey: ['room-matrix'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['properties', 'room-stats'] })
      queryClient.invalidateQueries({ queryKey: ['report'] })
      toast.success('Payment updated.')
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('payment_history')
        .delete()
        .eq('id', payment.id)
      if (error) throw error

      await logAudit({
        action: 'PAYMENT_DELETED',
        target_type: 'lease',
        target_id: leaseId,
        metadata: {
          payment_id: payment.id,
          room_code: roomCode,
          billing_month: payment.billing_month,
          amount: payment.amount,
          total: getTotalCollected(payment),
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', leaseId] })
      queryClient.invalidateQueries({ queryKey: ['room-matrix'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['properties', 'room-stats'] })
      queryClient.invalidateQueries({ queryKey: ['report'] })
      toast.success('Payment deleted.')
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleDelete() {
    if (!window.confirm('Delete this payment record? This cannot be undone.')) return
    deleteMutation.mutate()
  }

  const isPending = updateMutation.isPending || deleteMutation.isPending

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Payment · Room {roomCode}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(v => updateMutation.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="billing_month" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Billing Month</FormLabel>
                <FormControl>
                  <BillingMonthPicker
                    mode="compact"
                    value={field.value}
                    onChange={field.onChange}
                    options={billingMonthOptions}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="payment_method" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Payment Method</FormLabel>
                <div className="grid grid-cols-2 gap-2">
                  {(['cash', 'bank_transfer'] as const).map(method => (
                    <button key={method} type="button" onClick={() => field.onChange(method)}
                      className={`rounded-lg border py-2.5 text-sm font-medium transition-all ${
                        field.value === method
                          ? 'border-violet-500/60 bg-violet-500/20 text-violet-300'
                          : 'border-border bg-muted text-muted-foreground hover:border-white/20'
                      }`}>
                      {method === 'cash' ? '💵 Cash' : '🏦 Bank Transfer'}
                    </button>
                  ))}
                </div>
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="payment_date" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Payment Date</FormLabel>
                  <FormControl>
                    <Input type="date"
                      className="bg-muted border-border text-foreground focus:border-violet-500/60 cursor-pointer h-11"
                      onClick={e => e.currentTarget.showPicker?.()}
                      {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Rent (RM)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0"
                      className="bg-muted border-border text-foreground h-11 focus:border-violet-500/60
                                 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      {...field} />
                  </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground/50">Use 0 if the tenant only pays utilities.</p>
                  </FormItem>
                )} />
            </div>

            <FormField control={form.control} name="reference" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Reference <span className="text-muted-foreground/50">(optional)</span></FormLabel>
                <FormControl>
                  <Input placeholder="Bank ref, cheque number…"
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60"
                    {...field} />
                </FormControl>
              </FormItem>
            )} />

            <div className="grid grid-cols-3 gap-2">
              <FormField control={form.control} name="water_bill" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs">Water</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" placeholder="0.00"
                      className="bg-muted border-border text-foreground h-9 text-sm focus:border-violet-500/60
                                 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      {...field} />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="electricity_bill" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs">Electric</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" placeholder="0.00"
                      className="bg-muted border-border text-foreground h-9 text-sm focus:border-violet-500/60
                                 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      {...field} />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="aircond_bill" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs">Aircond</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" placeholder="0.00"
                      className="bg-muted border-border text-foreground h-9 text-sm focus:border-violet-500/60
                                 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      {...field} />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
              {canDelete && (
                <Button type="button" variant="destructive"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="w-full sm:w-auto sm:mr-auto bg-red-500/10 hover:bg-red-500/20 text-red-400 border-0">
                  {deleteMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete</>}
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}
                className="text-muted-foreground hover:text-foreground">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}
                className="bg-primary text-primary-foreground font-semibold">
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
