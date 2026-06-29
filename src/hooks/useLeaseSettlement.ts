import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { LeaseSettlement } from '@/types'

/** Existing move-out settlement record for a lease, if any. */
export function useLeaseSettlement(leaseId: string | undefined) {
  return useQuery({
    queryKey: ['lease-settlement', leaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lease_settlements')
        .select('*')
        .eq('lease_id', leaseId!)
        .maybeSingle()
      if (error) throw error
      return data as LeaseSettlement | null
    },
    enabled: !!leaseId,
  })
}
