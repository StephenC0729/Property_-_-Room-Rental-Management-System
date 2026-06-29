import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText, Plus, ChevronRight, Home, CalendarDays, Search } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { expireOverdueLeases } from '@/lib/leases'
import { formatRinggit } from '@/utils/exportCsv'
import { getLeaseStatusBadge } from '@/utils/leaseStatusConfig'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { QueryErrorState, getQueryErrorMessage } from '@/components/ui/query-error-state'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { Lease, Tenant, Room, Property } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

type LeaseStatus = 'active' | 'expired' | 'terminated'

interface LeaseWithDetails extends Lease {
  tenants?: Pick<Tenant, 'id' | 'full_name' | 'phone'> | null
  rooms?: (Pick<Room, 'id' | 'code'> & {
    properties?: Pick<Property, 'id' | 'name'> | null
  }) | null
}

const STATUS_TABS: { key: LeaseStatus | 'all'; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'active',     label: 'Active' },
  { key: 'expired',    label: 'Expired' },
  { key: 'terminated', label: 'Terminated' },
]

// ─── Data hook ─────────────────────────────────────────────────────────────────

function useLeases() {
  return useQuery({
    queryKey: ['leases'],
    queryFn: async () => {
      await expireOverdueLeases()
      const { data, error } = await supabase
        .from('leases')
        .select(`
          *,
          tenants ( id, full_name, phone ),
          rooms ( id, code, properties ( id, name ) )
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as LeaseWithDetails[]
    },
  })
}

// ─── Arrears hook ────────────────────────────────────────────────────────────

/** Map of lease_id -> cumulative rent arrears, for surfacing "behind" badges. */
function useArrearsMap() {
  return useQuery({
    queryKey: ['lease-arrears'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lease_arrears_v')
        .select('lease_id, rent_arrears')
      if (error) throw error
      const map: Record<string, number> = {}
      ;(data ?? []).forEach(r => {
        map[r.lease_id as string] = Number(r.rent_arrears ?? 0)
      })
      return map
    },
  })
}

// ─── Lease Row ─────────────────────────────────────────────────────────────────

function LeaseRow({ lease, arrears }: { lease: LeaseWithDetails; arrears: number }) {
  const status = lease.status as LeaseStatus
  const badge = getLeaseStatusBadge(status)
  const expiryDate = lease.expiry_date ? new Date(lease.expiry_date) : null
  const daysToExpiry = expiryDate ? differenceInDays(expiryDate, new Date()) : null
  const expiringWarning = status === 'active' && daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 30
  const behind = status === 'active' && arrears > 0
  const initials = lease.tenants?.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() ?? '?'

  return (
    <Link to={`/leases/${lease.id}`}>
      <div className="group flex items-center gap-4 rounded-xl border border-white/6 bg-card
                      px-4 py-3.5 hover:bg-white/[0.05] hover:border-border transition-all duration-150">
        {/* Avatar */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-sm font-semibold text-violet-300">
          {initials}
        </div>

        {/* Tenant + Room */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{lease.tenants?.full_name ?? '—'}</p>
          <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
            <Home className="h-3 w-3 shrink-0" />
            {lease.rooms?.properties?.name ?? '—'} · Room {lease.rooms?.code ?? '—'}
          </p>
          {behind && (
            <span className="mt-1 inline-flex items-center rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
              {formatRinggit(arrears)} behind
            </span>
          )}
        </div>

        {/* Rent */}
        <div className="hidden sm:block text-sm font-semibold text-foreground shrink-0">
          {formatRinggit(lease.monthly_rent)}
          <span className="text-xs text-muted-foreground/70 font-normal">/mo</span>
        </div>

        {/* Expiry */}
        <div className="hidden md:block text-xs text-muted-foreground/70 shrink-0">
          <div className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {expiryDate ? format(expiryDate, 'dd MMM yyyy') : '—'}
          </div>
          {expiringWarning && (
            <span className="text-yellow-400 font-medium">Expires in {daysToExpiry}d</span>
          )}
        </div>

        {/* Status */}
        <Badge className={`text-xs shrink-0 ${badge.cls}`}>{badge.label}</Badge>

        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
      </div>
    </Link>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function LeasesPage() {
  const [activeTab, setActiveTab] = useState<LeaseStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const { data: leases, isLoading, isError, error, refetch } = useLeases()
  const { data: arrearsMap } = useArrearsMap()

  const tabFiltered = leases?.filter(l =>
    activeTab === 'all' ? true : l.status === activeTab
  ) ?? []

  const filtered = tabFiltered.filter(l => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (l.tenants?.full_name && l.tenants.full_name.toLowerCase().includes(q)) ||
      (l.tenants?.phone && l.tenants.phone.includes(q)) ||
      (l.rooms?.code && l.rooms.code.toLowerCase().includes(q)) ||
      (l.rooms?.properties?.name && l.rooms.properties.name.toLowerCase().includes(q))
    )
  })

  const counts = leases?.reduce((acc, l) => {
    acc[l.status as LeaseStatus] = (acc[l.status as LeaseStatus] ?? 0) + 1
    return acc
  }, {} as Partial<Record<LeaseStatus, number>>) ?? {}

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 right-1/4 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leases</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? '—' : `${leases?.length ?? 0} total · ${(counts as Partial<Record<LeaseStatus, number>>).active ?? 0} active`}
          </p>
        </div>
        <Button asChild className="bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20">
          <Link to="/leases/new">
            <Plus className="mr-2 h-4 w-4" /> New Lease
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <Input
          placeholder="Search by tenant, room, property, or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/50 h-10"
        />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border border-border bg-card p-1 w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-white/70'
            }`}
          >
            {tab.label}
            {tab.key !== 'all' && ((counts as any)[tab.key] ?? 0) > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                activeTab === tab.key ? 'bg-white/20' : 'bg-white/10 text-muted-foreground/70'
              }`}>
                {(counts as any)[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl bg-muted" />)}
        </div>
      ) : isError ? (
        <QueryErrorState
          title="Failed to load leases"
          message={getQueryErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : !filtered.length ? (
        <Card className="border-border bg-card p-12 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          {search ? (
            <>
              <h3 className="text-base font-semibold text-muted-foreground">No results for "{search}"</h3>
              <p className="mt-1 text-sm text-muted-foreground/50">
                Try a different tenant name, room code, property, or phone number.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold text-muted-foreground">No {activeTab !== 'all' ? activeTab : ''} leases</h3>
              <p className="mt-1 text-sm text-muted-foreground/50">
                {activeTab === 'all' || activeTab === 'active'
                  ? 'Create a new lease to bind a tenant to a room.'
                  : `No ${activeTab} leases on record.`}
              </p>
            </>
          )}
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(lease => (
            <LeaseRow key={lease.id} lease={lease} arrears={arrearsMap?.[lease.id] ?? 0} />
          ))}
        </div>
      )}

      {/* Count footer */}
      {filtered.length > 0 && search && (
        <p className="mt-4 text-xs text-muted-foreground/50 text-center">
          Showing {filtered.length} of {tabFiltered.length}{activeTab !== 'all' ? ` ${activeTab}` : ''} leases
        </p>
      )}
    </div>
  )
}
