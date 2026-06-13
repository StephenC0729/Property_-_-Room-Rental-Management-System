import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PropertyRoomStats {
  paid: number
  overdue: number
  partial: number
  upcoming: number
  vacant: number
  maintenance: number
  total: number
}

/**
 * Returns a map of property_id → room billing status counts for the current
 * billing month. Used by DashboardPage (operator view) and PropertiesPage.
 * Query key: ['properties', 'room-stats']
 */
export function usePropertyRoomStats() {
  return useQuery({
    queryKey: ['properties', 'room-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_billing_status_v')
        .select('property_id, billing_status')
      if (error) throw error

      const map: Record<string, PropertyRoomStats> = {}
      data?.forEach(r => {
        if (!map[r.property_id]) {
          map[r.property_id] = { paid: 0, overdue: 0, partial: 0, upcoming: 0, vacant: 0, maintenance: 0, total: 0 }
        }
        map[r.property_id].total++
        const s = r.billing_status as keyof PropertyRoomStats
        if (s in map[r.property_id]) (map[r.property_id][s] as number)++
      })
      return map
    },
  })
}
