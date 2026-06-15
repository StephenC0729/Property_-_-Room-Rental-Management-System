import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { Loader2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { buildWhatsAppReceiptLink, getCurrentBillingMonth, formatBillingMonthKey } from '@/utils/whatsapp'
import { BILLING_MONTH_OPTIONS, parseBillingMonthKey } from '@/utils/billingMonth'
import { formatRinggit } from '@/utils/exportCsv'
import { getTotalCollected } from '@/utils/paymentUtils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { RoomBillingStatus } from '@/types'
import { paymentSchema, type PaymentFormValues } from '@/schemas/payment'
import { statusConfig } from '@/utils/statusConfig'
import { useRoomMatrix } from '@/hooks/useRoomMatrix'

export interface PaymentModalProps {
  room: (RoomBillingStatus & { property_id?: string }) | null
  open: boolean
  onClose: () => void
  /** Pre-select billing month (e.g. when logging from Reports for a past month). */
  defaultBillingMonth?: string
}

export function PaymentModal({ open, onClose, room, defaultBillingMonth }: PaymentModalProps) {
  const queryClient = useQueryClient()
  const useLiveMatrix = !defaultBillingMonth
  const { data: rooms } = useRoomMatrix(useLiveMatrix ? (room?.property_id ?? '') : '')
  const currentRoom = useLiveMatrix
    ? (rooms?.find(r => r.room_id === room?.room_id) ?? room)
    : room

  const currentBillingMonthKey = formatBillingMonthKey(getCurrentBillingMonth())
  const initialBillingMonth = defaultBillingMonth ?? currentBillingMonthKey
  const isPastMonth = initialBillingMonth !== currentBillingMonthKey

  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null)
  const [lastPayment, setLastPayment] = useState<{ amount: number; total: number; billingMonth: string } | null>(null)

  const defaultFormValues = useMemo((): PaymentFormValues => ({
    billing_month: initialBillingMonth,
    payment_method: 'cash',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    amount: room?.outstanding_balance ?? room?.monthly_rent ?? 0,
    reference: '',
    water_bill: 0,
    electricity_bill: 0,
    aircond_bill: 0,
  }), [initialBillingMonth, room?.outstanding_balance, room?.monthly_rent])

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema) as any,
    defaultValues: defaultFormValues,
  })

  const selectedBillingMonth = form.watch('billing_month')
  const recordingPastMonth = selectedBillingMonth !== currentBillingMonthKey

  useEffect(() => {
    if (room) {
      form.reset({
        billing_month: defaultBillingMonth ?? currentBillingMonthKey,
        payment_method: 'cash',
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        amount: room.outstanding_balance > 0 ? room.outstanding_balance : (room.monthly_rent ?? 0),
        reference: '',
        water_bill: 0,
        electricity_bill: 0,
        aircond_bill: 0,
      })
      setWhatsappUrl(null)
      setLastPayment(null)
    }
  }, [room?.room_id, form, room, defaultBillingMonth, currentBillingMonthKey])

  const mutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!room?.lease_id) throw new Error('No active lease for this room')
      const billingMonth = values.billing_month

      const leaseRes = await supabase.from('leases').select('tenant_id').eq('id', room.lease_id).single()
      if (leaseRes.error) throw leaseRes.error

      const { error } = await supabase.from('payment_history').insert({
        lease_id: room.lease_id,
        room_id: room.room_id,
        tenant_id: leaseRes.data.tenant_id,
        amount: values.amount,
        payment_method: values.payment_method,
        payment_date: values.payment_date,
        reference: values.reference || null,
        water_bill: values.water_bill || 0,
        electricity_bill: values.electricity_bill || 0,
        aircond_bill: values.aircond_bill || 0,
        billing_month: billingMonth,
      })
      if (error) throw error

      await logAudit({
        action: 'PAYMENT_LOGGED',
        target_type: 'room',
        target_id: room.room_id,
        metadata: {
          room_code: room.room_code,
          amount: values.amount,
          total_collected: getTotalCollected(values),
          method: values.payment_method,
          billing_month: billingMonth,
        },
      })

      return {
        rent: values.amount,
        total: getTotalCollected(values),
        billingMonth,
      }
    },
    onSuccess: ({ rent, total, billingMonth }) => {
      queryClient.invalidateQueries({ queryKey: ['room-matrix'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['properties', 'room-stats'] })
      queryClient.invalidateQueries({ queryKey: ['report'] })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      toast.success(
        total > rent
          ? `Payment recorded: ${formatRinggit(rent)} rent + ${formatRinggit(total - rent)} utilities.`
          : `Payment of ${formatRinggit(rent)} recorded.`
      )

      if (currentRoom?.tenant_phone) {
        setLastPayment({ amount: rent, total, billingMonth })
        setWhatsappUrl(buildWhatsAppReceiptLink({
          phone: currentRoom.tenant_phone,
          tenantName: currentRoom.tenant_name ?? 'Tenant',
          amount: total,
          roomCode: currentRoom.room_code,
          billingMonth: parseBillingMonthKey(billingMonth),
        }))
      } else {
        onClose()
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (!currentRoom) return null
  const cfg = statusConfig[currentRoom.billing_status]

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
            Room {currentRoom.room_code}
            <Badge className={`ml-1 text-xs border-current bg-current/10 ${cfg.textColor}`}>{cfg.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Room info summary */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tenant</span>
            <span className="font-medium text-foreground">{currentRoom.tenant_name ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Monthly Rent</span>
            <span className="font-medium text-foreground">{currentRoom.monthly_rent ? formatRinggit(currentRoom.monthly_rent) : '—'}</span>
          </div>
          {!isPastMonth && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rent Paid This Month</span>
                <span className="font-medium text-emerald-400">{formatRinggit(currentRoom.total_paid)}</span>
              </div>
              {(currentRoom.utilities_collected ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Utilities This Month</span>
                  <span className="font-medium text-sky-400">{formatRinggit(currentRoom.utilities_collected)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Collected</span>
                <span className="font-medium text-violet-300">{formatRinggit(currentRoom.total_collected ?? currentRoom.total_paid)}</span>
              </div>
              <Separator className="bg-white/8" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rent Outstanding</span>
                <span className={`text-lg font-bold ${currentRoom.outstanding_balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {formatRinggit(currentRoom.outstanding_balance)}
                </span>
              </div>
            </>
          )}
          {isPastMonth && (
            <p className="text-xs text-muted-foreground/70 pt-1">
              Backfilling a past month — amounts shown above reflect the current month only.
            </p>
          )}
        </div>

        {/* Post-payment WhatsApp button */}
        {whatsappUrl && lastPayment && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-2">
            <p className="text-sm font-medium text-emerald-400">
              ✓ {formatRinggit(lastPayment.total)} recorded!
              {lastPayment.total > lastPayment.amount && (
                <span className="block text-xs text-muted-foreground mt-1">
                  {formatRinggit(lastPayment.amount)} rent · {formatRinggit(lastPayment.total - lastPayment.amount)} utilities
                </span>
              )}
            </p>
            <Button asChild className="w-full bg-[#25D366] hover:bg-[#20bb5a] text-foreground font-semibold">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" /> Send WhatsApp Receipt
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="w-full text-muted-foreground hover:text-foreground">
              Close
            </Button>
          </div>
        )}

        {/* Payment form */}
        {!whatsappUrl && currentRoom.billing_status !== 'vacant' && currentRoom.billing_status !== 'maintenance' && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">
              <FormField control={form.control} name="billing_month" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Billing Month</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground
                                 focus:outline-none focus:border-violet-500/60 cursor-pointer"
                    >
                      {BILLING_MONTH_OPTIONS.map(m => (
                        <option key={m.value} value={m.value} className="bg-[#1a1a2e]">{m.label}</option>
                      ))}
                    </select>
                  </FormControl>
                  {recordingPastMonth && (
                    <p className="text-xs text-amber-400/90">
                      Recording for a past month — this won't change the current room matrix status.
                    </p>
                  )}
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
                            : 'border-border bg-muted text-muted-foreground hover:border-white/20 hover:text-muted-foreground'
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
                        className="bg-muted border-border text-foreground focus:border-violet-500/60 cursor-pointer h-12"
                        onClick={e => e.currentTarget.showPicker?.()}
                        {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="amount" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground">Rent Amount (RM)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0.01"
                        className="bg-muted border-border text-foreground text-lg font-semibold h-12 focus:border-violet-500/60
                                   [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        {...field} />
                    </FormControl>
                    <FormMessage />
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
                    <FormLabel className="text-muted-foreground text-xs">Water Bill</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="0.00"
                        className="bg-muted border-border text-foreground focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none h-9 text-sm"
                        {...field} />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="electricity_bill" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs">Electric</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="0.00"
                        className="bg-muted border-border text-foreground focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none h-9 text-sm"
                        {...field} />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="aircond_bill" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs">Aircond</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="0.00"
                        className="bg-muted border-border text-foreground focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none h-9 text-sm"
                        {...field} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>

              <Button type="submit" disabled={mutation.isPending}
                className="w-full h-11 bg-primary text-primary-foreground font-semibold shadow-lg shadow-violet-500/20">
                {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recording…</> : 'Record Payment'}
              </Button>
            </form>
          </Form>
        )}

        {(currentRoom.billing_status === 'vacant' || currentRoom.billing_status === 'maintenance') && (
          <p className="text-center text-sm text-muted-foreground/70 py-2">
            {currentRoom.billing_status === 'vacant' ? 'This room has no active tenant.' : 'This room is under maintenance.'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
