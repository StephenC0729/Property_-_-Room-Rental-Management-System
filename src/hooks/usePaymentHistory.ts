import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PaymentRecord {
  id: string
  amount: number
  payment_method: 'cash' | 'bank_transfer'
  reference: string | null
  billing_month: string
  payment_date: string
  paid_at: string
}

export function usePaymentHistory(leaseId: string) {
  return useQuery({
    queryKey: ['payments', leaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_history')
        .select('*')
        .eq('lease_id', leaseId)
        .order('payment_date', { ascending: false })
      if (error) throw error
      return data as PaymentRecord[]
    },
    enabled: !!leaseId,
  })
}
