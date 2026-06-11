import { Pencil } from 'lucide-react'
import type { RoomBillingStatus } from '@/types'
import { statusConfig } from '@/utils/statusConfig'

export interface RoomCardProps {
  room: RoomBillingStatus
  isAdmin: boolean
  onPay: () => void
  onEdit: () => void
}

export function RoomCard({ room, isAdmin, onPay, onEdit }: RoomCardProps) {
  const cfg = statusConfig[room.billing_status]
  const canPay = room.billing_status !== 'vacant' && room.billing_status !== 'maintenance'

  return (
    <div className={`group relative w-full rounded-xl border p-3 transition-all duration-150 ${cfg.cardBg} ${cfg.cardBorder}`}>
      {/* Edit button (Admin only, hover) */}
      {isAdmin && (
        <button
          onClick={onEdit}
          className="absolute top-1.5 right-1.5 h-5 w-5 rounded flex items-center justify-center
                     text-white/0 group-hover:text-muted-foreground hover:!text-foreground hover:bg-white/10 transition-all"
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
          className="absolute inset-0 rounded-xl cursor-pointer hover:bg-muted transition-colors"
          aria-label={`Log payment for ${room.room_code}`}
        />
      )}
    </div>
  )
}
