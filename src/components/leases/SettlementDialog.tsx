import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { useAuthStore } from '@/store/authStore'
import { formatRinggit } from '@/utils/exportCsv'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useLeaseArrears } from '@/hooks/useLeaseArrears'
import { settlementSchema, type SettlementFormValues } from '@/schemas/lease'
import type { LeaseDetail } from '@/hooks/useLeaseDetail'
import type { SettlementOutcome } from '@/types'

const NUMBER_INPUT_CLS =
  'bg-muted border-border text-foreground focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none'

const OUTCOME_OPTIONS: { value: SettlementOutcome; label: string; hint: string }[] = [
  { value: 'settled',     label: 'Settled',     hint: 'Balance fully cleared' },
  { value: 'partial',     label: 'Partial',     hint: 'Balance remains, expect to recover' },
  { value: 'written_off', label: 'Write off',   hint: 'Record remaining as bad debt' },
]

export function SettlementDialog({
  open, onClose, lease, onDone,
}: {
  open: boolean
  onClose: () => void
  lease: LeaseDetail
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const userId = useAuthStore(s => s.profile?.id ?? null)
  const { data: arrears, isLoading: arrearsLoading } = useLeaseArrears(open ? lease.id : undefined)

  const depositAvailable = (lease.security_deposit ?? 0) + (lease.utility_deposit ?? 0)

  const form = useForm<SettlementFormValues>({
    resolver: zodResolver(settlementSchema) as never,
    defaultValues: {
      rent_outstanding: 0,
      other_deductions: 0,
      deposit_applied: 0,
      outcome: 'settled',
      reason: '',
      notes: '',
    },
  })

  // Seed defaults once arrears load (or when the dialog re-opens).
  useEffect(() => {
    if (!open || arrearsLoading) return
    const outstanding = arrears?.rent_arrears ?? 0
    form.reset({
      rent_outstanding: outstanding,
      other_deductions: 0,
      deposit_applied: Math.min(depositAvailable, outstanding),
      outcome: outstanding <= depositAvailable ? 'settled' : 'written_off',
      reason: '',
      notes: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, arrearsLoading, arrears?.rent_arrears])

  const rentOutstanding = Number(form.watch('rent_outstanding')) || 0
  const otherDeductions = Number(form.watch('other_deductions')) || 0
  const depositApplied = Number(form.watch('deposit_applied')) || 0
  const outcome = form.watch('outcome')

  const totalOwed = rentOutstanding + otherDeductions
  const clampedDepositApplied = Math.min(Math.max(0, depositApplied), depositAvailable)
  const depositRefunded = Math.max(0, depositAvailable - clampedDepositApplied)
  const remaining = Math.max(0, totalOwed - clampedDepositApplied)
  const amountWrittenOff = outcome === 'written_off' ? remaining : 0

  const mutation = useMutation({
    mutationFn: async (values: SettlementFormValues) => {
      const { error: settleErr } = await supabase.from('lease_settlements').insert({
        lease_id:           lease.id,
        rent_outstanding:   values.rent_outstanding,
        other_deductions:   values.other_deductions,
        deposit_available:  depositAvailable,
        deposit_applied:    clampedDepositApplied,
        deposit_refunded:   depositRefunded,
        amount_written_off: amountWrittenOff,
        outcome:            values.outcome,
        reason:             values.reason?.trim() || null,
        notes:              values.notes?.trim() || null,
        settled_by:         userId,
      })
      if (settleErr) throw settleErr

      const { error: leaseErr } = await supabase
        .from('leases')
        .update({ status: 'terminated' })
        .eq('id', lease.id)
      if (leaseErr) throw leaseErr

      await logAudit({
        action: 'LEASE_SETTLED',
        target_type: 'lease',
        target_id: lease.id,
        metadata: {
          tenant_name:        lease.tenants?.full_name,
          room_code:          lease.rooms?.code,
          outcome:            values.outcome,
          rent_outstanding:   values.rent_outstanding,
          deposit_applied:    clampedDepositApplied,
          deposit_refunded:   depositRefunded,
          amount_written_off: amountWrittenOff,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leases'] })
      queryClient.invalidateQueries({ queryKey: ['room-matrix'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['lease-arrears'] })
      queryClient.invalidateQueries({ queryKey: ['lease-settlement', lease.id] })
      toast.success('Lease settled. Room is now vacant.')
      onClose()
      onDone()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Move Out &amp; Settle Lease
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-card p-3 mb-1">
          <p className="font-semibold text-foreground">{lease.tenants?.full_name}</p>
          <p className="text-muted-foreground text-xs">
            Room {lease.rooms?.code} · {lease.rooms?.properties?.name}
          </p>
        </div>

        {arrearsLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-9 rounded-lg bg-muted" />
            <Skeleton className="h-9 rounded-lg bg-muted" />
            <Skeleton className="h-20 rounded-lg bg-muted" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4 py-1">
              {arrears && (
                <p className="text-xs text-muted-foreground/70">
                  Cumulative arrears across {arrears.months_billed} billing month
                  {arrears.months_billed !== 1 ? 's' : ''}: rent due {formatRinggit(arrears.rent_due)},
                  paid {formatRinggit(arrears.rent_paid)}.
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="rent_outstanding" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground">Rent Outstanding (RM)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" className={NUMBER_INPUT_CLS} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="other_deductions" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground">Other Deductions (RM)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" className={NUMBER_INPUT_CLS} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="deposit_applied" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">
                    Deposit Applied (RM) · {formatRinggit(depositAvailable)} available
                  </FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" max={depositAvailable} className={NUMBER_INPUT_CLS} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="outcome" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Outcome</FormLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {OUTCOME_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => field.onChange(opt.value)}
                        title={opt.hint}
                        className={`rounded-lg border px-2 py-2 text-xs font-medium transition-all ${
                          field.value === opt.value
                            ? 'border-violet-500/40 bg-violet-500/15 text-violet-300'
                            : 'border-border bg-card text-muted-foreground hover:border-white/15'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              {outcome === 'written_off' && (
                <FormField control={form.control} name="reason" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground">Write-off Reason</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Tenant absconded" className="bg-muted border-border text-foreground focus:border-violet-500/60" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} className="bg-muted border-border text-foreground focus:border-violet-500/60 resize-y" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Live summary */}
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total owed</span>
                  <span className="text-foreground font-medium">{formatRinggit(totalOwed)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deposit applied</span>
                  <span className="text-foreground font-medium">{formatRinggit(clampedDepositApplied)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deposit refunded to tenant</span>
                  <span className="text-emerald-400 font-medium">{formatRinggit(depositRefunded)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5">
                  <span className="text-muted-foreground">
                    {outcome === 'written_off' ? 'Bad debt written off' : 'Balance remaining'}
                  </span>
                  <span className={`font-bold ${remaining > 0 ? 'text-red-400' : 'text-muted-foreground/70'}`}>
                    {formatRinggit(outcome === 'written_off' ? amountWrittenOff : remaining)}
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground/70">
                This terminates the lease and frees the room. This action cannot be undone.
              </p>

              <DialogFooter className="pt-1">
                <Button type="button" variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">
                  Cancel
                </Button>
                <Button type="submit" disabled={mutation.isPending} className="bg-red-600 hover:bg-red-500 text-foreground">
                  {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm Settlement
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
