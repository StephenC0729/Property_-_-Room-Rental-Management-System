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
import type { Room } from '@/types'
import { roomSchema, type RoomFormValues } from '@/schemas/room'
import { buildRoomCode } from '@/utils/roomUtils'

export interface RoomDialogProps {
  open: boolean
  onClose: () => void
  propertyId: string
  propertyName: string
  /** Pass an existing room to enter edit mode */
  editRoom?: Room | null
}

export function RoomDialog({ open, onClose, propertyId, propertyName, editRoom }: RoomDialogProps) {
  const queryClient = useQueryClient()

  const form = useForm<RoomFormValues>({
    resolver: zodResolver(roomSchema) as any,
    values: editRoom
      ? {
          room_number: editRoom.room_number,
          base_rent: editRoom.base_rent,
          status: editRoom.status === 'occupied' ? 'vacant' : editRoom.status as 'vacant' | 'maintenance',
          notes: editRoom.notes ?? '',
        }
      : { room_number: '', base_rent: 0, status: 'vacant', notes: '' },
  })

  const roomNumber = form.watch('room_number')
  const codePreview = roomNumber ? buildRoomCode(propertyName, roomNumber) : '—'

  const mutation = useMutation({
    mutationFn: async (values: RoomFormValues) => {
      const code = buildRoomCode(propertyName, values.room_number)
      const payload = {
        property_id: propertyId,
        code,
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
      <DialogContent className="border-border bg-card text-foreground sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editRoom ? `Edit Room ${editRoom.code}` : 'Add New Room'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4 py-1">

            {/* Room Number */}
            <FormField control={form.control} name="room_number" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Room No.</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. R1, 1, 2A"
                    maxLength={10}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Code preview */}
            <div className="rounded-lg border border-border bg-card px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground/70">Room Code Preview</span>
              <span className="text-sm font-bold text-violet-300 tracking-wide">{codePreview}</span>
            </div>

            {/* Rent amount per month */}
            <FormField control={form.control} name="base_rent" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground">Rent Amount Per Month (RM)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 450"
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60
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
                  <FormLabel className="text-muted-foreground">Initial Status</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {(['vacant', 'maintenance'] as const).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => field.onChange(s)}
                        className={`rounded-lg border py-2.5 text-sm font-medium capitalize transition-all ${
                          field.value === s
                            ? s === 'vacant'
                              ? 'border-white/30 bg-white/10 text-foreground'
                              : 'border-yellow-500/40 bg-yellow-500/15 text-yellow-300'
                            : 'border-border bg-card text-muted-foreground/70 hover:border-white/15'
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
                <FormLabel className="text-muted-foreground">Notes <span className="text-muted-foreground/50">(optional)</span></FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Window facing garden"
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )} />

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">
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
