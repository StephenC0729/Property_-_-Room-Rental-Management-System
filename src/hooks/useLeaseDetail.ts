import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Lease, Tenant, Room, Property } from '@/types'

export interface LeaseDetail extends Lease {
  tenants?: (Tenant & { properties?: null }) | null
  rooms?: (Room & { properties?: Pick<Property, 'id' | 'name'> | null }) | null
}

export function useLeaseDetail(id: string) {
  return useQuery({
    queryKey: ['leases', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leases')
        .select(`
          *,
          tenants ( * ),
          rooms (
            id, code, room_number, base_rent, status,
            properties ( id, name, address )
          )
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as LeaseDetail
    },
    enabled: !!id,
  })
}
