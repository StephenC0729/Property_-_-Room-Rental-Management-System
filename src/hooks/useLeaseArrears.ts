import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { LeaseArrears } from '@/types'

/** Cumulative rent arrears for a single lease, read from lease_arrears_v. */
export function useLeaseArrears(leaseId: string | undefined) {
  return useQuery({
    queryKey: ['lease-arrears', leaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lease_arrears_v')
        .select('*')
        .eq('lease_id', leaseId!)
        .maybeSingle()
      if (error) throw error
      return data as LeaseArrears | null
    },
    enabled: !!leaseId,
  })
}
