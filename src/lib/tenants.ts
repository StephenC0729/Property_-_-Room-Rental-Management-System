import { supabase } from '@/lib/supabase'

export interface TenantContact {
  full_name: string
  phone: string | null
}

/** Fetch tenant contact for an active lease (payment / WhatsApp receipt). */
export async function getTenantContactForPayment(leaseId: string): Promise<TenantContact | null> {
  const { data, error } = await supabase.rpc('get_tenant_contact_for_payment', {
    p_lease_id: leaseId,
  })

  if (error) throw error

  const row = data?.[0] as TenantContact | undefined
  return row ?? null
}
