import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Wallet, UserPlus, UserCog, FileText, FileX, Home,
  Building2, Search, RefreshCw, ChevronDown, Shield, UserMinus,
} from 'lucide-react'
import { format, formatDistanceToNow, subDays, startOfDay } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState, getQueryErrorMessage } from '@/components/ui/query-error-state'
import type { AuditLog, AuditAction } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry extends AuditLog {
  user_profiles?: { full_name: string; role: string } | null
}

type DateRange = 'today' | '7d' | '30d' | 'all'

// ─── Action config ─────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<AuditAction, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
  dot: string
}> = {
  PAYMENT_LOGGED:      { label: 'Payment Logged',      icon: Wallet,      color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', dot: 'bg-emerald-400' },
  TENANT_CREATED:      { label: 'Tenant Added',        icon: UserPlus,    color: 'text-blue-400',    bgColor: 'bg-blue-500/15',    dot: 'bg-blue-400' },
  TENANT_UPDATED:      { label: 'Tenant Updated',      icon: UserCog,     color: 'text-violet-400',  bgColor: 'bg-violet-500/15',  dot: 'bg-violet-400' },
  LEASE_CREATED:       { label: 'Lease Created',       icon: FileText,    color: 'text-indigo-400',  bgColor: 'bg-indigo-500/15',  dot: 'bg-indigo-400' },
  LEASE_UPDATED:       { label: 'Lease Updated',       icon: FileText,    color: 'text-indigo-400',  bgColor: 'bg-indigo-500/15',  dot: 'bg-indigo-400' },
  LEASE_TERMINATED:    { label: 'Lease Terminated',    icon: FileX,       color: 'text-red-400',     bgColor: 'bg-red-500/15',     dot: 'bg-red-400' },
  ROOM_STATUS_CHANGED: { label: 'Room Updated',        icon: Home,        color: 'text-yellow-400',  bgColor: 'bg-yellow-500/15',  dot: 'bg-yellow-400' },
  PROPERTY_CREATED:    { label: 'Property Added',      icon: Building2,   color: 'text-teal-400',    bgColor: 'bg-teal-500/15',    dot: 'bg-teal-400' },
  PROPERTY_UPDATED:    { label: 'Property Updated',    icon: Building2,   color: 'text-teal-400',    bgColor: 'bg-teal-500/15',    dot: 'bg-teal-400' },
  USER_ROLE_CHANGED:   { label: 'Role Changed',        icon: Shield,      color: 'text-violet-400',  bgColor: 'bg-violet-500/15',  dot: 'bg-violet-400' },
  USER_REMOVED:        { label: 'User Removed',        icon: UserMinus,   color: 'text-red-400',     bgColor: 'bg-red-500/15',     dot: 'bg-red-400' },
}

const ALL_ACTIONS = Object.keys(ACTION_CONFIG) as AuditAction[]

const DATE_RANGE_OPTIONS: { key: DateRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: 'Last 7 days' },
  { key: '30d',   label: 'Last 30 days' },
  { key: 'all',   label: 'All time' },
]

// ─── Metadata formatter ────────────────────────────────────────────────────────

function formatMetadata(action: AuditAction, meta: Record<string, unknown> | null): string {
  if (!meta) return ''
  switch (action) {
    case 'PAYMENT_LOGGED':
      return [
        meta.room_code ? `Room ${meta.room_code}` : null,
        meta.amount    ? `RM ${Number(meta.amount).toFixed(2)}` : null,
        meta.method    ? String(meta.method).replace('_', ' ') : null,
      ].filter(Boolean).join(' · ')

    case 'TENANT_CREATED':
    case 'TENANT_UPDATED':
      return meta.full_name ? String(meta.full_name) : ''

    case 'LEASE_CREATED':
    case 'LEASE_UPDATED':
      return [
        meta.room_code ? `Room ${meta.room_code}` : null,
        meta.monthly_rent ? `RM ${Number(meta.monthly_rent).toFixed(2)}/mo` : null,
      ].filter(Boolean).join(' · ')

    case 'LEASE_TERMINATED':
      return [
        meta.tenant_name ? String(meta.tenant_name) : null,
        meta.room_code   ? `Room ${meta.room_code}` : null,
      ].filter(Boolean).join(' · ')

    case 'ROOM_STATUS_CHANGED':
      return meta.code ? `Room ${meta.code}` : ''

    case 'PROPERTY_CREATED':
    case 'PROPERTY_UPDATED':
      return meta.name ? String(meta.name) : ''

    case 'USER_ROLE_CHANGED':
      return [
        meta.full_name ? String(meta.full_name) : null,
        meta.old_role && meta.new_role
          ? `${String(meta.old_role).replace('_', ' ')} → ${String(meta.new_role).replace('_', ' ')}`
          : null,
      ].filter(Boolean).join(' · ')

    case 'USER_REMOVED':
      return meta.full_name ? String(meta.full_name) : ''

    default:
      return ''
  }
}

// ─── Data hook ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

function useAuditLog(dateRange: DateRange, actionFilter: AuditAction | 'all') {
  return useQuery({
    queryKey: ['audit-log', dateRange, actionFilter],
    queryFn: async () => {
      // Step 1: Fetch audit entries WITHOUT a join
      // (audit_log.user_id → auth.users, not public.user_profiles,
      //  so PostgREST can't auto-join — we do it manually below)
      let q = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      // Date range
      if (dateRange !== 'all') {
        const days = dateRange === 'today' ? 0 : dateRange === '7d' ? 7 : 30
        const from = startOfDay(subDays(new Date(), days)).toISOString()
        q = q.gte('created_at', from)
      }

      // Action filter
      if (actionFilter !== 'all') {
        q = q.eq('action', actionFilter)
      }

      const { data: entries, error: entriesError } = await q
      if (entriesError) throw entriesError
      if (!entries?.length) return [] as AuditEntry[]

      // Step 2: Fetch user profiles for the unique user_ids found
      const userIds = [...new Set(entries.map(e => e.user_id).filter(Boolean))]
      const profileMap: Record<string, { full_name: string; role: string }> = {}

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name, role')
          .in('id', userIds)

        profiles?.forEach(p => {
          profileMap[p.id] = { full_name: p.full_name, role: p.role }
        })
      }

      // Step 3: Merge profile data onto each entry
      return entries.map(e => ({
        ...e,
        user_profiles: e.user_id ? (profileMap[e.user_id] ?? null) : null,
      })) as AuditEntry[]
    },
    refetchInterval: 30_000,   // auto-refresh every 30s
  })
}

// ─── Audit Entry Row ───────────────────────────────────────────────────────────

function AuditRow({ entry, isLast }: { entry: AuditEntry; isLast: boolean }) {
  const cfg = ACTION_CONFIG[entry.action] ?? {
    label: entry.action, icon: Shield,
    color: 'text-muted-foreground', bgColor: 'bg-muted', dot: 'bg-white/20',
  }
  const Icon = cfg.icon
  const metaStr = formatMetadata(entry.action, entry.metadata)
  const ts = new Date(entry.created_at)

  return (
    <div className="flex gap-4">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${cfg.bgColor} shrink-0`}>
          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 min-h-[16px] bg-white/6" />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${!isLast ? 'pb-4' : 'pb-1'}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
            {metaStr && (
              <span className="text-sm text-muted-foreground truncate max-w-xs">{metaStr}</span>
            )}
          </div>
          <time
            dateTime={entry.created_at}
            title={format(ts, 'dd MMM yyyy HH:mm:ss')}
            className="text-xs text-muted-foreground/50 shrink-0"
          >
            {formatDistanceToNow(ts, { addSuffix: true })}
          </time>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {/* Actor */}
          <span className="text-xs text-muted-foreground/70">
            by{' '}
            <span className="text-white/55 font-medium">
              {entry.user_profiles?.full_name ?? 'System'}
            </span>
          </span>

          {/* Role badge */}
          {entry.user_profiles?.role && (
            <Badge className="text-[10px] h-4 px-1.5 bg-violet-500/10 text-violet-400 border-violet-500/20 capitalize">
              {entry.user_profiles.role.replace('_', ' ')}
            </Badge>
          )}

          {/* Exact time on hover-friendly small screen */}
          <span className="text-xs text-muted-foreground/50 hidden sm:inline">
            {format(ts, 'dd MMM yyyy, HH:mm')}
          </span>
        </div>

        {/* Raw metadata (collapsed preview) */}
        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <details className="mt-1 group">
            <summary className="text-[10px] text-muted-foreground/50 cursor-pointer hover:text-muted-foreground transition-colors list-none flex items-center gap-1 w-fit">
              <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" /> metadata
            </summary>
            <pre className="mt-1 rounded-lg border border-white/6 bg-card p-2 text-[10px] text-muted-foreground/70 overflow-x-auto">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function AuditLogPage() {
  const [dateRange,    setDateRange]    = useState<DateRange>('7d')
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all')
  const [search,       setSearch]       = useState('')

  const { data: entries, isLoading, isFetching, isError, error, refetch } = useAuditLog(dateRange, actionFilter)

  // Client-side search (target_id or metadata values)
  const filtered = useMemo(() => {
    if (!entries) return []
    if (!search.trim()) return entries
    const q = search.toLowerCase()
    return entries.filter(e =>
      e.target_id?.includes(q) ||
      e.user_profiles?.full_name.toLowerCase().includes(q) ||
      (e.metadata && JSON.stringify(e.metadata).toLowerCase().includes(q))
    )
  }, [entries, search])

  // Group by date for visual date separators
  const grouped = useMemo(() => {
    const groups: { date: string; entries: AuditEntry[] }[] = []
    let currentDate = ''
    filtered.forEach(e => {
      const d = format(new Date(e.created_at), 'dd MMM yyyy')
      if (d !== currentDate) {
        currentDate = d
        groups.push({ date: d, entries: [] })
      }
      groups[groups.length - 1].entries.push(e)
    })
    return groups
  }, [filtered])

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 right-1/3 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? '—' : `${filtered.length} events · auto-refreshes every 30s`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="border border-border text-muted-foreground hover:text-foreground hover:border-white/20"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search user, metadata…"
            className="pl-10 w-56 bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/50 h-9"
          />
        </div>

        {/* Date range */}
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {DATE_RANGE_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setDateRange(opt.key)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                dateRange === opt.key ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:text-white/70'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Action type filter */}
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value as AuditAction | 'all')}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground
                     focus:outline-none focus:border-violet-500/50 cursor-pointer"
        >
          <option value="all" className="bg-[#1a1a2e]">All Actions</option>
          {ALL_ACTIONS.map(a => (
            <option key={a} value={a} className="bg-[#1a1a2e]">{ACTION_CONFIG[a].label}</option>
          ))}
        </select>
      </div>

      {/* Action type legend */}
      <div className="mb-6 flex flex-wrap gap-2">
        {ALL_ACTIONS.map(a => {
          const cfg = ACTION_CONFIG[a]
          const count = entries?.filter(e => e.action === a).length ?? 0
          if (!count) return null
          return (
            <button key={a} onClick={() => setActionFilter(actionFilter === a ? 'all' : a)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${
                actionFilter === a
                  ? `${cfg.bgColor} border-current ${cfg.color}`
                  : 'border-border bg-card text-muted-foreground/70 hover:border-white/15 hover:text-muted-foreground'
              }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
              <span className="opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Timeline */}
      {isLoading ? (
        <Card className="border-border bg-card p-6 space-y-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-8 w-8 rounded-full bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48 bg-white/10" />
                <Skeleton className="h-3 w-32 bg-white/10" />
              </div>
            </div>
          ))}
        </Card>
      ) : isError ? (
        <QueryErrorState
          title="Failed to load audit log"
          message={getQueryErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : !filtered.length ? (
        <Card className="border-border bg-card p-12 text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-base font-semibold text-muted-foreground">No audit events</h3>
          <p className="mt-1 text-sm text-muted-foreground/50">
            {search ? 'No matching events for your search.' : 'No activity recorded in this time period.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-white/6" />
                <span className="text-xs font-medium text-muted-foreground/50 px-2">{group.date}</span>
                <div className="h-px flex-1 bg-white/6" />
              </div>

              <Card className="border-border bg-card px-5 py-4">
                {group.entries.map((entry, idx) => (
                  <AuditRow
                    key={entry.id}
                    entry={entry}
                    isLast={idx === group.entries.length - 1}
                  />
                ))}
              </Card>
            </div>
          ))}

          {/* Load more notice */}
          {(entries?.length ?? 0) >= PAGE_SIZE && (
            <p className="text-center text-xs text-muted-foreground/50 py-2">
              Showing the most recent {PAGE_SIZE} events. Use the date range filter to narrow results.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
