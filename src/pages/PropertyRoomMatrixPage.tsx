import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft, Home, AlertCircle, CheckCircle2, CircleDot,
  Wrench, MessageCircle, Loader2, Plus, Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { useAuthStore } from '@/store/authStore'
import { buildWhatsAppReceiptLink, getCurrentBillingMonth } from '@/utils/whatsapp'
import { formatRinggit } from '@/utils/exportCsv'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import type { Property, Room, RoomBillingStatus, BillingStatus } from '@/types'

// ─── Status config ────────────────────────────────────────────────────────────

const statusConfig: Record<BillingStatus, {
  label: string; cardBg: string; cardBorder: string; dot: string; textColor: string
}> = {
  paid:        { label: 'Paid',        cardBg: 'bg-emerald-500/10', cardBorder: 'border-emerald-500/30', dot: 'bg-emerald-400',  textColor: 'text-emerald-400' },
  overdue:     { label: 'Overdue',     cardBg: 'bg-red-500/10',     cardBorder: 'border-red-500/30',     dot: 'bg-red-400',      textColor: 'text-red-400' },
  partial:     { label: 'Partial',     cardBg: 'bg-orange-500/10',  cardBorder: 'border-orange-500/30',  dot: 'bg-orange-400',   textColor: 'text-orange-400' },
  vacant:      { label: 'Vacant',      cardBg: 'bg-white/[0.03]',   cardBorder: 'border-white/8',        dot: 'bg-white/25',     textColor: 'text-white/30' },
  maintenance: { label: 'Maintenance', cardBg: 'bg-yellow-500/10',  cardBorder: 'border-yellow-500/30',  dot: 'bg-yellow-400',   textColor: 'text-yellow-400' },
  upcoming:    { label: 'Upcoming',    cardBg: 'bg-blue-500/10',    cardBorder: 'border-blue-500/30',    dot: 'bg-blue-400',     textColor: 'text-blue-400' },
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useProperty(id: string) {
  return useQuery({
    queryKey: ['properties', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', id).single()
      if (error) throw error
      return data as Property
    },
    enabled: !!id,
  })
}

function useRoomMatrix(propertyId: string) {
  return useQuery({
    queryKey: ['room-matrix', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_billing_status_v')
        .select('*')
        .eq('property_id', propertyId)
        .order('floor')
        .order('room_number')
      if (error) throw error
      return data as RoomBillingStatus[]
    },
    enabled: !!propertyId,
  })
}

// ─── Room CRUD ────────────────────────────────────────────────────────────────

const roomSchema = z.object({
  floor: z.string().min(1, 'Floor is required').max(5),
  room_number: z.string().min(1, 'Room number is required').max(10),
  base_rent: z.coerce.number().min(0, 'Must be 0 or more'),
  status: z.enum(['vacant', 'maintenance']),
  notes: z.string().optional(),
})
type RoomFormValues = z.infer<typeof roomSchema>

/** Derives a room code from the property name + floor + room number.
 *  "House 1" + "A" + "2" → "1-A-2"
 */
function buildRoomCode(propertyName: string, floor: string, roomNumber: string): string {
  const houseNum = propertyName.match(/\d+/)?.[0] ?? '1'
  return `${houseNum}-${floor.toUpperCase()}-${roomNumber}`
}

interface RoomDialogProps {
  open: boolean
  onClose: () => void
  propertyId: string
  propertyName: string
  /** Pass an existing room to enter edit mode */
  editRoom?: Room | null
}

function RoomDialog({ open, onClose, propertyId, propertyName, editRoom }: RoomDialogProps) {
  const queryClient = useQueryClient()

  const form = useForm<RoomFormValues>({
    resolver: zodResolver(roomSchema),
    values: editRoom
      ? {
          floor: editRoom.floor,
          room_number: editRoom.room_number,
          base_rent: editRoom.base_rent,
          status: editRoom.status === 'occupied' ? 'vacant' : editRoom.status as 'vacant' | 'maintenance',
          notes: editRoom.notes ?? '',
        }
      : { floor: '', room_number: '', base_rent: 0, status: 'vacant', notes: '' },
  })

  const floor = form.watch('floor')
  const roomNumber = form.watch('room_number')
  const codePreview = floor && roomNumber
    ? buildRoomCode(propertyName, floor, roomNumber)
    : '—'

  const mutation = useMutation({
    mutationFn: async (values: RoomFormValues) => {
      const code = buildRoomCode(propertyName, values.floor, values.room_number)
      const payload = {
        property_id: propertyId,
        code,
        floor: values.floor.toUpperCase(),
        room_number: values.room_number,
        base_rent: values.base_rent,
        status: editRoom?.status === 'occupied' ? 'occupied' : values.status,
        notes: values.notes || null,
      }

      if (editRoom) {
        const { error } = await supabase.from('rooms').update(payload).eq('id', editRoom.id)
        if (error) throw error
        await logAudit({ action: 'ROOM_STATUS_CHANGED', target_type: 'room', target_id: editRoom.id, metadata: payload })
      } else {
        const { data, error } = await supabase.from('rooms').insert(payload).select().single()
        if (error) throw error
        await logAudit({ action: 'ROOM_STATUS_CHANGED', target_type: 'room', target_id: data.id, metadata: payload })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-matrix', propertyId] })
      toast.success(editRoom ? 'Room updated.' : 'Room added.')
      form.reset()
      onClose()
    },
    onError: (err: Error) => {
      toast.error(err.message.includes('unique') ? 'A room with this code already exists.' : err.message)
    },
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="border-white/10 bg-[#111118] text-white sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">
            {editRoom ? `Edit Room ${editRoom.code}` : 'Add New Room'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4 py-1">

            {/* Floor + Room Number side-by-side */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="floor" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60">Floor</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. A"
                      maxLength={5}
                      className="bg-white/5 border-white/10 text-white uppercase placeholder:text-white/20 focus:border-violet-500/60"
                      {...field}
                      onChange={e => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="room_number" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60">Room No.</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 1"
                      maxLength={10}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-violet-500/60"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Code preview */}
            <div className="rounded-lg border border-white/8 bg-white/[0.03] px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-white/35">Room Code Preview</span>
              <span className="text-sm font-bold text-violet-300 tracking-wide">{codePreview}</span>
            </div>

            {/* Base rent */}
            <FormField control={form.control} name="base_rent" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/60">Base Rent (RM)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 450"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-violet-500/60
                               [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Status (only show if not currently occupied — occupied is managed via leases) */}
            {(!editRoom || editRoom.status !== 'occupied') && (
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60">Initial Status</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {(['vacant', 'maintenance'] as const).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => field.onChange(s)}
                        className={`rounded-lg border py-2.5 text-sm font-medium capitalize transition-all ${
                          field.value === s
                            ? s === 'vacant'
                              ? 'border-white/30 bg-white/10 text-white'
                              : 'border-yellow-500/40 bg-yellow-500/15 text-yellow-300'
                            : 'border-white/8 bg-white/[0.03] text-white/30 hover:border-white/15'
                        }`}
                      >
                        {s === 'vacant' ? '⚪ Vacant' : '🔧 Maintenance'}
                      </button>
                    ))}
                  </div>
                </FormItem>
              )} />
            )}

            {/* Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/60">Notes <span className="text-white/25">(optional)</span></FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Window facing garden"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-violet-500/60"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )} />

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={onClose} className="text-white/40 hover:text-white">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="bg-violet-600 hover:bg-violet-500 text-white"
              >
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editRoom ? 'Save Changes' : 'Add Room'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Payment form schema ───────────────────────────────────────────────────────

const paymentSchema = z.object({
  payment_method: z.enum(['cash', 'bank_transfer']),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  reference: z.string().optional(),
})
type PaymentFormValues = z.infer<typeof paymentSchema>

// ─── Payment Modal ─────────────────────────────────────────────────────────────

interface PaymentModalProps {
  room: RoomBillingStatus | null
  open: boolean
  onClose: () => void
}

function PaymentModal({ room, open, onClose }: PaymentModalProps) {
  const queryClient = useQueryClient()
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null)
  const [lastPayment, setLastPayment] = useState<{ amount: number } | null>(null)

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_method: 'cash',
      amount: room?.outstanding_balance ?? room?.monthly_rent ?? 0,
      reference: '',
    },
  })

  useEffect(() => {
    if (room) {
      form.reset({
        payment_method: 'cash',
        amount: room.outstanding_balance > 0 ? room.outstanding_balance : (room.monthly_rent ?? 0),
        reference: '',
      })
      setWhatsappUrl(null)
      setLastPayment(null)
    }
  }, [room?.room_id])

  const mutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!room?.lease_id) throw new Error('No active lease for this room')
      const billingMonth = getCurrentBillingMonth().toISOString().slice(0, 10)

      const leaseRes = await supabase.from('leases').select('tenant_id').eq('id', room.lease_id).single()
      if (leaseRes.error) throw leaseRes.error

      const { error } = await supabase.from('payment_history').insert({
        lease_id: room.lease_id,
        room_id: room.room_id,
        tenant_id: leaseRes.data.tenant_id,
        amount: values.amount,
        payment_method: values.payment_method,
        reference: values.reference || null,
        billing_month: billingMonth,
      })
      if (error) throw error

      await logAudit({
        action: 'PAYMENT_LOGGED',
        target_type: 'room',
        target_id: room.room_id,
        metadata: { room_code: room.room_code, amount: values.amount, method: values.payment_method, billing_month: billingMonth },
      })

      return values.amount
    },
    onSuccess: (amount) => {
      queryClient.invalidateQueries({ queryKey: ['room-matrix'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`Payment of ${formatRinggit(amount)} recorded.`)
      setLastPayment({ amount })
      if (room?.tenant_phone) {
        setWhatsappUrl(buildWhatsAppReceiptLink({
          phone: room.tenant_phone,
          tenantName: room.tenant_name ?? 'Tenant',
          amount,
          roomCode: room.room_code,
          billingMonth: getCurrentBillingMonth(),
        }))
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (!room) return null
  const cfg = statusConfig[room.billing_status]

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="border-white/10 bg-[#111118] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
            Room {room.room_code}
            <Badge className={`ml-1 text-xs border-current bg-current/10 ${cfg.textColor}`}>{cfg.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Room info summary */}
        <div className="rounded-lg border border-white/8 bg-white/[0.03] p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/40">Tenant</span>
            <span className="font-medium text-white">{room.tenant_name ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Monthly Rent</span>
            <span className="font-medium text-white">{room.monthly_rent ? formatRinggit(room.monthly_rent) : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Paid This Month</span>
            <span className="font-medium text-emerald-400">{formatRinggit(room.total_paid)}</span>
          </div>
          <Separator className="bg-white/8" />
          <div className="flex justify-between">
            <span className="text-white/40">Outstanding</span>
            <span className={`text-lg font-bold ${room.outstanding_balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {formatRinggit(room.outstanding_balance)}
            </span>
          </div>
        </div>

        {/* Post-payment WhatsApp button */}
        {whatsappUrl && lastPayment && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-2">
            <p className="text-sm font-medium text-emerald-400">✓ {formatRinggit(lastPayment.amount)} recorded!</p>
            <Button asChild className="w-full bg-[#25D366] hover:bg-[#20bb5a] text-white font-semibold">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" /> Send WhatsApp Receipt
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="w-full text-white/40 hover:text-white">
              Close
            </Button>
          </div>
        )}

        {/* Payment form */}
        {!whatsappUrl && room.billing_status !== 'vacant' && room.billing_status !== 'maintenance' && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">
              <FormField control={form.control} name="payment_method" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60">Payment Method</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {(['cash', 'bank_transfer'] as const).map(method => (
                      <button key={method} type="button" onClick={() => field.onChange(method)}
                        className={`rounded-lg border py-2.5 text-sm font-medium transition-all ${
                          field.value === method
                            ? 'border-violet-500/60 bg-violet-500/20 text-violet-300'
                            : 'border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white/60'
                        }`}>
                        {method === 'cash' ? '💵 Cash' : '🏦 Bank Transfer'}
                      </button>
                    ))}
                  </div>
                </FormItem>
              )} />

              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60">Amount (RM)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0.01"
                      className="bg-white/5 border-white/10 text-white text-lg font-semibold h-12 focus:border-violet-500/60
                                 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="reference" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60">Reference <span className="text-white/25">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Bank ref, cheque number…"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-violet-500/60"
                      {...field} />
                  </FormControl>
                </FormItem>
              )} />

              <Button type="submit" disabled={mutation.isPending}
                className="w-full h-11 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold shadow-lg shadow-violet-500/20">
                {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recording…</> : 'Record Payment'}
              </Button>
            </form>
          </Form>
        )}

        {(room.billing_status === 'vacant' || room.billing_status === 'maintenance') && (
          <p className="text-center text-sm text-white/30 py-2">
            {room.billing_status === 'vacant' ? 'This room has no active tenant.' : 'This room is under maintenance.'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Room Card ─────────────────────────────────────────────────────────────────

interface RoomCardProps {
  room: RoomBillingStatus
  isAdmin: boolean
  onPay: () => void
  onEdit: () => void
}

function RoomCard({ room, isAdmin, onPay, onEdit }: RoomCardProps) {
  const cfg = statusConfig[room.billing_status]
  const canPay = room.billing_status !== 'vacant' && room.billing_status !== 'maintenance'

  return (
    <div className={`group relative w-full rounded-xl border p-3 transition-all duration-150 ${cfg.cardBg} ${cfg.cardBorder}`}>
      {/* Edit button (Admin only, hover) */}
      {isAdmin && (
        <button
          onClick={onEdit}
          className="absolute top-1.5 right-1.5 h-5 w-5 rounded flex items-center justify-center
                     text-white/0 group-hover:text-white/40 hover:!text-white hover:bg-white/10 transition-all"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}

      {/* Status dot + code */}
      <div className="flex items-center justify-between mb-2 pr-4">
        <span className="text-xs font-bold text-white/70">{room.room_code}</span>
        <span className={`h-2 w-2 rounded-full ${cfg.dot} ${canPay ? 'animate-pulse' : ''}`} />
      </div>

      {/* Tenant name */}
      <p className={`text-xs truncate font-medium ${room.tenant_name ? 'text-white/80' : cfg.textColor}`}>
        {room.tenant_name ?? cfg.label}
      </p>

      {/* Balance */}
      {room.monthly_rent && (
        <p className={`text-xs mt-0.5 font-semibold ${cfg.textColor}`}>
          {room.outstanding_balance > 0 ? `RM ${room.outstanding_balance.toFixed(0)} due` : 'Cleared ✓'}
        </p>
      )}

      {/* Tap overlay for payment */}
      {canPay && (
        <button
          onClick={onPay}
          className="absolute inset-0 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
          aria-label={`Log payment for ${room.room_code}`}
        />
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function PropertyRoomMatrixPage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin } = useAuthStore()
  const queryClient = useQueryClient()

  const [paymentRoom, setPaymentRoom] = useState<RoomBillingStatus | null>(null)
  const [roomDialogOpen, setRoomDialogOpen] = useState(false)
  const [editRoom, setEditRoom] = useState<Room | null>(null)

  const { data: property, isLoading: propLoading } = useProperty(id!)
  const { data: rooms, isLoading: roomsLoading } = useRoomMatrix(id!)

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`room-matrix-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_history' }, () => {
        queryClient.invalidateQueries({ queryKey: ['room-matrix', id] })
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `property_id=eq.${id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['room-matrix', id] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, queryClient])

  // Group by floor
  const floorGroups = rooms?.reduce<Record<string, RoomBillingStatus[]>>((acc, room) => {
    if (!acc[room.floor]) acc[room.floor] = []
    acc[room.floor].push(room)
    return acc
  }, {}) ?? {}

  const counts = rooms?.reduce((acc, r) => {
    acc[r.billing_status] = (acc[r.billing_status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>) ?? {}

  const billingMonth = format(getCurrentBillingMonth(), 'MMMM yyyy')
  const isLoading = propLoading || roomsLoading

  function openAddRoom() { setEditRoom(null); setRoomDialogOpen(true) }
  function openEditRoom(room: RoomBillingStatus) {
    // Reconstruct a Room object from RoomBillingStatus for the edit dialog
    setEditRoom({
      id: room.room_id,
      property_id: room.property_id ?? id!,
      code: room.room_code,
      floor: room.floor,
      room_number: room.room_code.split('-')[2] ?? '',
      base_rent: room.base_rent,
      status: room.room_status,
      notes: null,
      created_at: '',
    })
    setRoomDialogOpen(true)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4 md:p-6">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 left-0 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      {/* Back + header */}
      <div className="mb-6">
        <Link to="/properties" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Properties
        </Link>
        <div className="flex items-start justify-between">
          <div>
            {propLoading
              ? <Skeleton className="h-7 w-40 bg-white/10" />
              : <>
                  <h1 className="text-2xl font-bold text-white">{property?.name}</h1>
                  <p className="mt-0.5 text-sm text-white/35 max-w-xs truncate">{property?.address}</p>
                </>
            }
          </div>
          {isAdmin() && (
            <Button onClick={openAddRoom} className="bg-violet-600 hover:bg-violet-500 text-white" size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Room
            </Button>
          )}
        </div>
      </div>

      {/* Summary badges */}
      {!isLoading && (rooms?.length ?? 0) > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Badge className="bg-white/5 text-white/50 border-white/10 text-xs">{rooms!.length} rooms · {billingMonth}</Badge>
          {counts.paid        && <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">{counts.paid} paid</Badge>}
          {counts.overdue     && <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">{counts.overdue} overdue</Badge>}
          {counts.partial     && <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-xs">{counts.partial} partial</Badge>}
          {counts.vacant      && <Badge className="bg-white/5 text-white/30 border-white/10 text-xs">{counts.vacant} vacant</Badge>}
          {counts.maintenance && <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-xs">{counts.maintenance} maintenance</Badge>}
        </div>
      )}

      {/* Room grid */}
      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {[...Array(20)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl bg-white/5" />)}
        </div>
      ) : !(rooms?.length) ? (
        <Card className="border-white/8 bg-white/[0.03] p-12 text-center">
          <Home className="mx-auto mb-4 h-12 w-12 text-white/15" />
          <h3 className="text-lg font-semibold text-white/40">No rooms yet</h3>
          <p className="mt-1 text-sm text-white/25">
            {isAdmin() ? 'Click "Add Room" to set up rooms for this property.' : 'No rooms have been configured.'}
          </p>
          {isAdmin() && (
            <Button onClick={openAddRoom} className="mt-6 bg-violet-600 hover:bg-violet-500 text-white">
              <Plus className="mr-2 h-4 w-4" /> Add First Room
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(floorGroups).sort().map(([floor, floorRooms]) => (
            <div key={floor}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-white/30 uppercase tracking-wider">Floor {floor}</span>
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-xs text-white/20">{floorRooms.length} rooms</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                {floorRooms.map(room => (
                  <RoomCard
                    key={room.room_id}
                    room={room}
                    isAdmin={isAdmin()}
                    onPay={() => setPaymentRoom(room)}
                    onEdit={() => openEditRoom(room)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="mt-8 flex flex-wrap gap-4 text-xs text-white/20">
        {(Object.entries(statusConfig) as [BillingStatus, typeof statusConfig[BillingStatus]][])
          .filter(([k]) => k !== 'upcoming')
          .map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${cfg.dot}`} /> {cfg.label}
            </span>
          ))}
        <span className="text-white/10">· Tap a room to log payment{isAdmin() ? ' · Hover + pencil to edit' : ''}</span>
      </div>

      {/* Dialogs */}
      {property && (
        <RoomDialog
          open={roomDialogOpen}
          onClose={() => { setRoomDialogOpen(false); setEditRoom(null) }}
          propertyId={id!}
          propertyName={property.name}
          editRoom={editRoom}
        />
      )}

      <PaymentModal
        room={paymentRoom}
        open={!!paymentRoom}
        onClose={() => setPaymentRoom(null)}
      />
    </div>
  )
}
