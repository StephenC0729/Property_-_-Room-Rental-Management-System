import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { expireOverdueLeases } from '@/lib/leases'
import type { RoomBillingStatus } from '@/types'

export function useRoomMatrix(propertyId: string) {
  return useQuery({
    queryKey: ['room-matrix', propertyId],
    queryFn: async () => {
      await expireOverdueLeases()
      const { data, error } = await supabase
        .from('room_billing_status_v')
        .select('*')
        .eq('property_id', propertyId)
        .order('room_number')
      if (error) throw error
      return data as RoomBillingStatus[]
    },
    enabled: !!propertyId,
  })
}
