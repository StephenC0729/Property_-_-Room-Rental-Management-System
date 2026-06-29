import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ArrearsRow {
  lease_id: string
  tenant_id: string | null
  tenant_name: string
  room_code: string
  property_name: string
  monthly_rent: number
  rent_arrears: number
  months_behind: number
}

export interface WriteOffRow {
  settlement_id: string
  lease_id: string
  tenant_name: string
  room_code: string
  property_name: string
  amount_written_off: number
  reason: string | null
  settled_at: string
}

export interface BadDebtReport {
  arrears: ArrearsRow[]
  writeOffs: WriteOffRow[]
  totalArrears: number
  totalWrittenOff: number
}

type LeaseJoin = {
  id: string
  tenant_id: string | null
  tenants?: { full_name: string } | null
  rooms?: { code: string; properties?: { name: string } | null } | null
}

/** Rent arrears (active leases) + written-off bad debt (settlements), with names. */
export function useBadDebtReport() {
  return useQuery({
    queryKey: ['bad-debt-report'],
    queryFn: async (): Promise<BadDebtReport> => {
      const [arrearsRes, leasesRes, settlementsRes] = await Promise.all([
        supabase
          .from('lease_arrears_v')
          .select('lease_id, tenant_id, monthly_rent, rent_arrears, status')
          .eq('status', 'active'),
        supabase
          .from('leases')
          .select('id, tenant_id, tenants ( full_name ), rooms ( code, properties ( name ) )'),
        supabase
          .from('lease_settlements')
          .select('id, lease_id, amount_written_off, reason, settled_at, leases ( id, tenant_id, tenants ( full_name ), rooms ( code, properties ( name ) ) )')
          .gt('amount_written_off', 0)
          .order('settled_at', { ascending: false }),
      ])

      if (arrearsRes.error) throw arrearsRes.error
      if (leasesRes.error) throw leasesRes.error
      if (settlementsRes.error) throw settlementsRes.error

      const leaseMap = new Map<string, LeaseJoin>()
      ;(leasesRes.data as unknown as LeaseJoin[] ?? []).forEach(l => leaseMap.set(l.id, l))

      const arrears: ArrearsRow[] = (arrearsRes.data ?? [])
        .filter(r => Number(r.rent_arrears) > 0)
        .map(r => {
          const lease = leaseMap.get(r.lease_id as string)
          const monthlyRent = Number(r.monthly_rent ?? 0)
          const rentArrears = Number(r.rent_arrears ?? 0)
          return {
            lease_id: r.lease_id as string,
            tenant_id: (r.tenant_id as string | null) ?? null,
            tenant_name: lease?.tenants?.full_name ?? '—',
            room_code: lease?.rooms?.code ?? '—',
            property_name: lease?.rooms?.properties?.name ?? '—',
            monthly_rent: monthlyRent,
            rent_arrears: rentArrears,
            months_behind: monthlyRent > 0 ? Math.ceil(rentArrears / monthlyRent) : 0,
          }
        })
        .sort((a, b) => b.rent_arrears - a.rent_arrears)

      type SettlementJoin = {
        id: string
        lease_id: string
        amount_written_off: number
        reason: string | null
        settled_at: string
        leases?: LeaseJoin | null
      }

      const writeOffs: WriteOffRow[] = (settlementsRes.data as unknown as SettlementJoin[] ?? []).map(s => ({
        settlement_id: s.id,
        lease_id: s.lease_id,
        tenant_name: s.leases?.tenants?.full_name ?? '—',
        room_code: s.leases?.rooms?.code ?? '—',
        property_name: s.leases?.rooms?.properties?.name ?? '—',
        amount_written_off: Number(s.amount_written_off ?? 0),
        reason: s.reason,
        settled_at: s.settled_at,
      }))

      return {
        arrears,
        writeOffs,
        totalArrears: arrears.reduce((sum, r) => sum + r.rent_arrears, 0),
        totalWrittenOff: writeOffs.reduce((sum, r) => sum + r.amount_written_off, 0),
      }
    },
  })
}
