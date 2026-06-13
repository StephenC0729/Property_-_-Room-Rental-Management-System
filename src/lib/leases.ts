import { supabase } from '@/lib/supabase'

/** Mark active leases past expiry_date as expired (no-op when none due). */
export async function expireOverdueLeases(): Promise<void> {
  const { error } = await supabase.rpc('expire_overdue_leases')
  if (error) {
    console.warn('[leases] Failed to expire overdue leases:', error.message)
  }
}
