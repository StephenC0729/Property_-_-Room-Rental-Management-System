import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText, Plus, ChevronRight, Home, User, CalendarDays } from 'lucide-react'
import { format, isPast, differenceInDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { formatRinggit } from '@/utils/exportCsv'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

const STATUS_BADGE: Record<LeaseStatus, { label: string; cls: string }> = {
  active:     { label: 'Active',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  expired:    { label: 'Expired',    cls: 'bg-white/5 text-white/30 border-white/10' },
  terminated: { label: 'Terminated', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

// ─── Data hook ─────────────────────────────────────────────────────────────────

function useLeases() {
  return useQuery({
    queryKey: ['leases'],
    queryFn: async () => {
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

// ─── Lease Row ─────────────────────────────────────────────────────────────────

function LeaseRow({ lease }: { lease: LeaseWithDetails }) {
  const status = lease.status as LeaseStatus
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.expired
  const expiryDate = new Date(lease.expiry_date)
  const daysToExpiry = differenceInDays(expiryDate, new Date())
  const expiringWarning = status === 'active' && daysToExpiry >= 0 && daysToExpiry <= 30
  const initials = lease.tenants?.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() ?? '?'

  return (
    <Link to={`/leases/${lease.id}`}>
      <div className="group flex items-center gap-4 rounded-xl border border-white/6 bg-white/[0.02]
                      px-4 py-3.5 hover:bg-white/[0.05] hover:border-white/10 transition-all duration-150">
        {/* Avatar */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-sm font-semibold text-violet-300">
          {initials}
        </div>

        {/* Tenant + Room */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{lease.tenants?.full_name ?? '—'}</p>
          <p className="text-xs text-white/35 flex items-center gap-1 mt-0.5">
            <Home className="h-3 w-3 shrink-0" />
            {lease.rooms?.properties?.name ?? '—'} · Room {lease.rooms?.code ?? '—'}
          </p>
        </div>

        {/* Rent */}
        <div className="hidden sm:block text-sm font-semibold text-white shrink-0">
          {formatRinggit(lease.monthly_rent)}
          <span className="text-xs text-white/30 font-normal">/mo</span>
        </div>

        {/* Expiry */}
        <div className="hidden md:block text-xs text-white/35 shrink-0">
          <div className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {format(expiryDate, 'dd MMM yyyy')}
          </div>
          {expiringWarning && (
            <span className="text-yellow-400 font-medium">Expires in {daysToExpiry}d</span>
          )}
        </div>

        {/* Status */}
        <Badge className={`text-xs shrink-0 ${badge.cls}`}>{badge.label}</Badge>

        <ChevronRight className="h-4 w-4 shrink-0 text-white/15 group-hover:text-white/40 transition-colors" />
      </div>
    </Link>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function LeasesPage() {
  const [activeTab, setActiveTab] = useState<LeaseStatus | 'all'>('all')
  const { data: leases, isLoading } = useLeases()

  const filtered = leases?.filter(l =>
    activeTab === 'all' ? true : l.status === activeTab
  ) ?? []

  const counts = leases?.reduce((acc, l) => {
    acc[l.status as LeaseStatus] = (acc[l.status as LeaseStatus] ?? 0) + 1
    return acc
  }, {} as Record<LeaseStatus, number>) ?? {}

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4 md:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 right-1/4 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Leases</h1>
          <p className="mt-1 text-sm text-white/40">
            {isLoading ? '—' : `${leases?.length ?? 0} total · ${counts.active ?? 0} active`}
          </p>
        </div>
        <Button asChild className="bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20">
          <Link to="/leases/new">
            <Plus className="mr-2 h-4 w-4" /> New Lease
          </Link>
        </Button>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1 w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {tab.label}
            {tab.key !== 'all' && counts[tab.key as LeaseStatus] > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                activeTab === tab.key ? 'bg-white/20' : 'bg-white/10 text-white/30'
              }`}>
                {counts[tab.key as LeaseStatus]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl bg-white/5" />)}
        </div>
      ) : !filtered.length ? (
        <Card className="border-white/8 bg-white/[0.03] p-12 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-white/15" />
          <h3 className="text-base font-semibold text-white/40">No {activeTab !== 'all' ? activeTab : ''} leases</h3>
          <p className="mt-1 text-sm text-white/25">
            {activeTab === 'all' || activeTab === 'active'
              ? 'Create a new lease to bind a tenant to a room.'
              : `No ${activeTab} leases on record.`}
          </p>
          {(activeTab === 'all' || activeTab === 'active') && (
            <Button asChild className="mt-6 bg-violet-600 hover:bg-violet-500 text-white self-center">
              <Link to="/leases/new"><Plus className="mr-2 h-4 w-4" /> New Lease</Link>
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(lease => <LeaseRow key={lease.id} lease={lease} />)}
        </div>
      )}
    </div>
  )
}
