import { supabase } from '@/lib/supabase'
import type { UserRole } from '@/types'

/** Mark active leases past expiry_date as expired (admin+ only; no-op for operators). */
export async function expireOverdueLeases(role?: UserRole | null): Promise<void> {
  if (role && role !== 'admin' && role !== 'super_admin') return

  const { error } = await supabase.rpc('expire_overdue_leases')
  if (error) {
    console.warn('[leases] Failed to expire overdue leases:', error.message)
  }
}
