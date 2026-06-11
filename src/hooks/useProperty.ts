import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Property } from '@/types'

export function useProperty(id: string) {
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
