import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Home, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { getCurrentBillingMonth } from '@/utils/whatsapp'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { Room, RoomBillingStatus, BillingStatus } from '@/types'
import { useProperty } from '@/hooks/useProperty'
import { useRoomMatrix } from '@/hooks/useRoomMatrix'
import { statusConfig } from '@/utils/statusConfig'
import { RoomDialog } from '@/components/rooms/RoomDialog'
import { PaymentModal } from '@/components/rooms/PaymentModal'
import { RoomCard } from '@/components/rooms/RoomCard'

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

  const counts = rooms?.reduce((acc, r) => {
    acc[r.billing_status] = (acc[r.billing_status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>) ?? {}

  const billingMonth = format(getCurrentBillingMonth(), 'MMMM yyyy')
  const isLoading = propLoading || roomsLoading

  function openAddRoom() { setEditRoom(null); setRoomDialogOpen(true) }
  function openEditRoom(room: RoomBillingStatus) {
    const parts = room.room_code.split('-')
    const roomNum = parts.length > 1 ? parts.slice(1).join('-') : room.room_code
    setEditRoom({
      id: room.room_id,
      property_id: id!,
      code: room.room_code,
      room_number: roomNum,
      base_rent: room.base_rent,
      status: room.room_status,
      notes: null,
      created_at: '',
    })
    setRoomDialogOpen(true)
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 left-0 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      {/* Back + header */}
      <div className="mb-6">
        <Link to="/properties" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white/70 transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Properties
        </Link>
        <div className="flex items-start justify-between">
          <div>
            {propLoading
              ? <Skeleton className="h-7 w-40 bg-white/10" />
              : <>
                  <h1 className="text-2xl font-bold text-foreground">{property?.name}</h1>
                  <p className="mt-0.5 text-sm text-muted-foreground/70 max-w-xs truncate">{property?.address}</p>
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
          <Badge className="bg-muted text-muted-foreground border-border text-xs">{rooms!.length} rooms · {billingMonth}</Badge>
          {counts.paid        && <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">{counts.paid} paid</Badge>}
          {counts.overdue     && <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">{counts.overdue} overdue</Badge>}
          {counts.partial     && <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-xs">{counts.partial} partial</Badge>}
          {counts.vacant      && <Badge className="bg-muted text-muted-foreground/70 border-border text-xs">{counts.vacant} vacant</Badge>}
          {counts.maintenance && <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-xs">{counts.maintenance} maintenance</Badge>}
        </div>
      )}

      {/* Room grid */}
      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {[...Array(20)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl bg-muted" />)}
        </div>
      ) : !(rooms?.length) ? (
        <Card className="border-border bg-card p-12 text-center">
          <Home className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold text-muted-foreground">No rooms yet</h3>
          <p className="mt-1 text-sm text-muted-foreground/50">
            {isAdmin() ? 'Click "Add Room" to set up rooms for this property.' : 'No rooms have been configured.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {rooms!.map(room => (
            <RoomCard
              key={room.room_id}
              room={room}
              isAdmin={isAdmin()}
              onPay={() => setPaymentRoom(room)}
              onEdit={() => openEditRoom(room)}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="mt-8 flex flex-wrap gap-4 text-xs text-muted-foreground/50">
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

      {paymentRoom && <PaymentModal open={!!paymentRoom} onClose={() => setPaymentRoom(null)} room={paymentRoom!} />}
    </div>
  )
}
