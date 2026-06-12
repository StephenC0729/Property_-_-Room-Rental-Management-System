import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Property } from '@/types'

/**
 * Fetches all properties ordered by name.
 * Shared across DashboardPage, PropertiesPage, NewLeasePage, and ReportsPage.
 * Query key: ['properties']
 */
export function useProperties() {
  return useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Property[]
    },
  })
}
