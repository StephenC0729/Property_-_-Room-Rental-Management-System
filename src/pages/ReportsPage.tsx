import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Download, TrendingUp, AlertCircle,
  CircleDot, Home, ChevronUp, ChevronDown, Filter, Wallet, Plus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatRinggit, exportToCsv } from '@/utils/exportCsv'
import { compareReportRoomRows, compareRoomNumbers, roomNumberFromCode } from '@/utils/roomUtils'
import { getTotalCollected, getUtilitiesCollected } from '@/utils/paymentUtils'
import { useBillingMonthOptions } from '@/hooks/useBillingMonthOptions'
import { BillingMonthPicker } from '@/components/billing/BillingMonthPicker'
import { useProperties } from '@/hooks/useProperties'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { QueryErrorState, getQueryErrorMessage } from '@/components/ui/query-error-state'
import { PaymentModal } from '@/components/rooms/PaymentModal'
import type { RoomBillingStatus, BillingStatus } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'property' | 'room' | 'tenant' | 'rent' | 'paid' | 'utilities' | 'total' | 'outstanding'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'overdue' | 'partial' | 'paid' | 'vacant'

interface ReportRow {
  lease_id:             string | null
  room_id:              string
  property_id:          string
  property_name:        string
  room_code:            string
  room_number:          string
  tenant_name:          string | null
  monthly_rent:         number
  total_paid:           number
  utilities_collected:  number
  total_collected:      number
  outstanding:          number
  status:               string
}

function reportRowToRoom(row: ReportRow): RoomBillingStatus & { property_id: string } {
  return {
    room_id: row.room_id,
    room_code: row.room_code,
    room_number: row.room_number,
    base_rent: row.monthly_rent,
    room_status: row.status === 'vacant' || row.status === 'maintenance' ? row.status : 'occupied',
    billing_status: row.status as BillingStatus,
    tenant_name: row.tenant_name,
    tenant_phone: null,
    lease_id: row.lease_id,
    monthly_rent: row.monthly_rent,
    due_day: null,
    total_paid: row.total_paid,
    utilities_collected: row.utilities_collected,
    total_collected: row.total_collected,
    outstanding_balance: row.outstanding,
    property_id: row.property_id,
  }
}

/** Normalize an ISO timestamp or date string to yyyy-MM-dd for comparison. */
function toDateKey(value: string): string {
  return value.slice(0, 10)
}

/**
 * True when billingMonth (yyyy-MM-dd, always the 1st) falls within the lease
 * period. Uses move_in_date / expiry_date when set; falls back to created_at
 * for the start when move_in is null (open-ended leases keep a null expiry).
 */
function isLeaseActiveInBillingMonth(
  lease: { move_in_date: string | null; expiry_date: string | null; created_at: string },
  billingMonth: string,
): boolean {
  const effectiveStart = lease.move_in_date ?? toDateKey(lease.created_at)
  if (effectiveStart > billingMonth) return false
  if (lease.expiry_date && lease.expiry_date < billingMonth) return false
  return true
}

// ─── Data hooks ───────────────────────────────────────────────────────────────
//
// useProperties is imported from src/hooks/useProperties.ts

/** For the current month, read directly from room_billing_status_v */
function useCurrentMonthReport() {
  return useQuery({
    queryKey: ['report', 'current-month'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_billing_status_v')
        .select('*')
      if (error) throw error
      return data as (RoomBillingStatus & { property_id: string })[]
    },
  })
}

/** For historical months: aggregate payment_history for a given billing_month
 *  and join with lease/room/tenant/property. */
function useHistoricalReport(billingMonth: string) {
  return useQuery({
    queryKey: ['report', billingMonth],
    queryFn: async () => {
      // Payments grouped by room/lease for this month
      const { data: payments, error: pErr } = await supabase
        .from('payment_history')
        .select('room_id, lease_id, amount, water_bill, electricity_bill, aircond_bill')
        .eq('billing_month', billingMonth)
      if (pErr) throw pErr

      // Leases active during the selected billing month. Date overlap is checked
      // client-side so we can coalesce move_in_date with created_at without
      // treating "both dates null" as matching every month in history.
      const { data: leases, error: lErr } = await supabase
        .from('leases')
        .select(`
          id, room_id, monthly_rent, move_in_date, expiry_date, created_at,
          tenants ( full_name ),
          rooms ( id, code, room_number, base_rent, property_id,
                  properties ( name ) )
        `)
      if (lErr) throw lErr

      const activeLeases = (leases ?? []).filter(l =>
        isLeaseActiveInBillingMonth(l, billingMonth)
      )

      // Sum payments per lease_id
      const paidMap: Record<string, number> = {}
      const utilitiesMap: Record<string, number> = {}
      const totalMap: Record<string, number> = {}
      payments?.forEach(p => {
        paidMap[p.lease_id] = (paidMap[p.lease_id] ?? 0) + p.amount
        const utilities = getUtilitiesCollected(p)
        utilitiesMap[p.lease_id] = (utilitiesMap[p.lease_id] ?? 0) + utilities
        totalMap[p.lease_id] = (totalMap[p.lease_id] ?? 0) + getTotalCollected(p)
      })

      type RoomRef = {
        id: string; code: string; room_number: string; base_rent: number; property_id: string;
        properties?: { name: string } | null
      }
      type TenantRef = { full_name: string }
      type LeaseRef = {
        id: string; room_id: string; monthly_rent: number;
        tenants?: TenantRef | null;
        rooms?: RoomRef | null
      }

      return (activeLeases as unknown as LeaseRef[]).map(l => {
        const paid       = paidMap[l.id] ?? 0
        const utilities  = utilitiesMap[l.id] ?? 0
        const total      = totalMap[l.id] ?? 0
        const rent       = l.monthly_rent
        const balance    = Math.max(0, rent - paid)
        const status     = paid >= rent ? 'paid' : paid > 0 || utilities > 0 ? 'partial' : 'overdue'
        return {
          lease_id:             l.id,
          room_id:              l.room_id,
          property_id:          l.rooms?.property_id ?? '',
          property_name:        l.rooms?.properties?.name ?? '—',
          room_code:            l.rooms?.code ?? '—',
          room_number:          l.rooms?.room_number ?? roomNumberFromCode(l.rooms?.code ?? ''),
          tenant_name:          l.tenants?.full_name ?? null,
          monthly_rent:         rent,
          total_paid:           paid,
          utilities_collected:  utilities,
          total_collected:      total,
          outstanding:          balance,
          status,
        } satisfies ReportRow
      })
    },
    enabled: true,
  })
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color, bgColor }:
  { label: string; value: string; sub?: string; icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string }) {
  return (
    <Card className="border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground/50">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bgColor}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </Card>
  )
}

// ─── Sort Header ──────────────────────────────────────────────────────────────

function SortTh({ label, sortKey, current, dir, onSort }:
  { label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onSort: (k: SortKey) => void }) {
  const active = current === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-white/70 transition-colors"
    >
      {label}
      {active
        ? dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        : <ChevronUp className="h-3 w-3 opacity-20" />}
    </button>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string; dot: string }> = {
  paid:        { label: 'Paid',        cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', dot: 'bg-emerald-400' },
  partial:     { label: 'Partial',     cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20',   dot: 'bg-orange-400' },
  overdue:     { label: 'Overdue',     cls: 'bg-red-500/10 text-red-400 border-red-500/20',             dot: 'bg-red-400' },
  vacant:      { label: 'Vacant',      cls: 'bg-muted text-muted-foreground/70 border-border',                 dot: 'bg-white/30' },
  maintenance: { label: 'Maintenance', cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',    dot: 'bg-yellow-400' },
  upcoming:    { label: 'Upcoming',    cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',          dot: 'bg-blue-400' },
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { options: monthOptions, currentMonthKey: currentMonth, getLabel: getMonthLabel } = useBillingMonthOptions()
  const { isOperator } = useAuthStore()

  const [selectedMonth,  setSelectedMonth]  = useState(currentMonth)
  const [propertyFilter, setPropertyFilter] = useState<string>('all')
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>('all')
  const [sortKey,        setSortKey]        = useState<SortKey>('room')
  const [sortDir,        setSortDir]        = useState<SortDir>('asc')
  const [paymentRoom,    setPaymentRoom]    = useState<(RoomBillingStatus & { property_id: string }) | null>(null)

  const isCurrentMonth = selectedMonth === currentMonth

  const { data: properties }  = useProperties()
  const { data: currentData, isLoading: currentLoading, isError: currentError, error: currentQueryError, refetch: refetchCurrent } = useCurrentMonthReport()
  const { data: histData, isLoading: histLoading, isError: histError, error: histQueryError, refetch: refetchHist } = useHistoricalReport(selectedMonth)

  // Merge current-month view data with property names
  const currentRows = useMemo((): ReportRow[] => {
    if (!currentData) return []
    const propMap = Object.fromEntries(properties?.map(p => [p.id, p.name]) ?? [])
    return currentData.map(r => ({
      lease_id:             r.lease_id,
      room_id:              r.room_id,
      property_id:          r.property_id,
      property_name:        propMap[r.property_id] ?? '—',
      room_code:            r.room_code,
      room_number:          r.room_number ?? roomNumberFromCode(r.room_code),
      tenant_name:          r.tenant_name,
      monthly_rent:         r.monthly_rent ?? 0,
      total_paid:           r.total_paid,
      utilities_collected:  r.utilities_collected ?? 0,
      total_collected:      r.total_collected ?? r.total_paid,
      outstanding:          r.outstanding_balance,
      status:               r.billing_status,
    }))
  }, [currentData, properties])

  const rawRows: ReportRow[] = isCurrentMonth ? currentRows : (histData ?? [])
  const isLoading = isCurrentMonth ? currentLoading : histLoading
  const isError = isCurrentMonth ? currentError : histError
  const queryError = isCurrentMonth ? currentQueryError : histQueryError
  const refetchReport = isCurrentMonth ? refetchCurrent : refetchHist

  // ── Filters ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = rawRows
    if (propertyFilter !== 'all') rows = rows.filter(r => r.property_id === propertyFilter)
    if (statusFilter   !== 'all') rows = rows.filter(r => r.status === statusFilter)
    return [...rows].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'property': {
          const propCmp = a.property_name.localeCompare(b.property_name)
          if (propCmp !== 0) return mul * propCmp
          return mul * compareRoomNumbers(a.room_number, b.room_number)
        }
        case 'room':         return mul * compareReportRoomRows(a, b)
        case 'tenant':       return mul * (a.tenant_name ?? '').localeCompare(b.tenant_name ?? '')
        case 'rent':         return mul * (a.monthly_rent - b.monthly_rent)
        case 'paid':         return mul * (a.total_paid - b.total_paid)
        case 'utilities':    return mul * (a.utilities_collected - b.utilities_collected)
        case 'total':        return mul * (a.total_collected - b.total_collected)
        case 'outstanding':  return mul * (a.outstanding - b.outstanding)
        default:             return 0
      }
    })
  }, [rawRows, propertyFilter, statusFilter, sortKey, sortDir])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const occupied = rawRows.filter(r => r.status !== 'vacant' && r.status !== 'maintenance')
    return {
      totalOutstanding:   occupied.reduce((s, r) => s + r.outstanding, 0),
      rentCollected:      occupied.reduce((s, r) => s + r.total_paid, 0),
      utilitiesCollected: occupied.reduce((s, r) => s + r.utilities_collected, 0),
      totalCollected:     occupied.reduce((s, r) => s + r.total_collected, 0),
      overdueCount:       occupied.filter(r => r.status === 'overdue').length,
      partialCount:       occupied.filter(r => r.status === 'partial').length,
      paidCount:          occupied.filter(r => r.status === 'paid').length,
    }
  }, [rawRows])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir(key === 'room' || key === 'property' || key === 'tenant' ? 'asc' : 'desc')
    }
  }

  // ── CSV Export ─────────────────────────────────────────────────────────────
  function handleExport() {
    const monthLabel = getMonthLabel(selectedMonth)
    exportToCsv(
      filtered.map(r => ({
        'Property':             r.property_name,
        'Room Code':            r.room_code,
        'Tenant':               r.tenant_name ?? '—',
        'Monthly Rent':         r.monthly_rent.toFixed(2),
        'Rent Paid (RM)':       r.total_paid.toFixed(2),
        'Utilities Paid (RM)':  r.utilities_collected.toFixed(2),
        'Total Collected (RM)': r.total_collected.toFixed(2),
        'Rent Outstanding (RM)': r.outstanding.toFixed(2),
        'Status':               r.status,
      })),
      `PRMS_Outstanding_${monthLabel.replace(' ', '_')}`
    )
  }

  const monthLabel = getMonthLabel(selectedMonth)

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/3 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Monthly Rent Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">{monthLabel} · Rent collection & total payments</p>
        </div>
        <Button
          onClick={handleExport}
          disabled={isLoading || !filtered.length}
          className="bg-emerald-600 hover:bg-emerald-500 text-foreground shadow-lg shadow-emerald-500/20 disabled:opacity-40"
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Controls row */}
      <div className="mb-5 flex flex-wrap gap-3">
        {/* Month picker */}
        <div className="flex items-center gap-2 min-w-[220px]">
          <span className="text-xs text-muted-foreground/70 shrink-0">Month</span>
          <BillingMonthPicker
            mode="search"
            value={selectedMonth}
            onChange={setSelectedMonth}
            options={monthOptions}
            className="flex-1"
          />
        </div>

        {/* Property filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
          <select
            value={propertyFilter}
            onChange={e => setPropertyFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground
                       focus:outline-none focus:border-violet-500/50 cursor-pointer"
          >
            <option value="all" className="bg-[#1a1a2e]">All Properties</option>
            {properties?.map(p => (
              <option key={p.id} value={p.id} className="bg-[#1a1a2e]">{p.name}</option>
            ))}
          </select>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {(['all', 'overdue', 'partial', 'paid'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-all ${
                statusFilter === s ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:text-white/70'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      {isLoading ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-6">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl bg-muted" />)}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-6">
          <StatCard label="Rent Outstanding" value={formatRinggit(stats.totalOutstanding)}
            icon={AlertCircle} color={stats.totalOutstanding > 0 ? 'text-red-400' : 'text-muted-foreground'}
            bgColor={stats.totalOutstanding > 0 ? 'bg-red-500/15' : 'bg-muted'}
            sub="unpaid rent this month" />
          <StatCard label="Rent Collected" value={formatRinggit(stats.rentCollected)}
            icon={TrendingUp} color="text-emerald-400" bgColor="bg-emerald-500/15"
            sub="rent payments received" />
          <StatCard label="Utilities Collected" value={formatRinggit(stats.utilitiesCollected)}
            icon={TrendingUp} color="text-sky-400" bgColor="bg-sky-500/15"
            sub="water, electric, aircond" />
          <StatCard label="Total Collected" value={formatRinggit(stats.totalCollected)}
            icon={Wallet} color="text-violet-300" bgColor="bg-violet-500/15"
            sub="rent + utilities" />
          <StatCard label="Overdue / Partial" value={`${stats.overdueCount + stats.partialCount}`}
            icon={CircleDot} color={stats.overdueCount > 0 ? 'text-orange-400' : 'text-muted-foreground'}
            bgColor={stats.overdueCount > 0 ? 'bg-orange-500/15' : 'bg-muted'}
            sub={`${stats.overdueCount} overdue, ${stats.partialCount} partial · ${stats.paidCount} paid`} />
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl bg-muted" />)}
        </div>
      ) : isError ? (
        <QueryErrorState
          title="Failed to load report"
          message={getQueryErrorMessage(queryError)}
          onRetry={() => refetchReport()}
        />
      ) : !filtered.length ? (
        <Card className="border-border bg-card p-12 text-center">
          <Home className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-base font-semibold text-muted-foreground">No data for {monthLabel}</h3>
          <p className="mt-1 text-sm text-muted-foreground/50">
            {statusFilter !== 'all'
              ? `No ${statusFilter} rooms for this period. Try "All" status.`
              : 'No rooms or leases found for this month.'}
          </p>
        </Card>
      ) : (
        <Card className="border-border bg-card overflow-hidden overflow-x-auto">
          {/* Table head */}
          <div className="grid min-w-[1000px] grid-cols-[1.4fr_auto_1fr_repeat(5,auto)_auto_auto] gap-x-4 px-4 py-3 border-b border-white/6 bg-card">
            <SortTh label="Property"    sortKey="property"    current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortTh label="Room"        sortKey="room"        current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortTh label="Tenant"      sortKey="tenant"      current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortTh label="Rent"        sortKey="rent"        current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortTh label="Rent Paid"   sortKey="paid"        current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortTh label="Utilities"   sortKey="utilities"   current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortTh label="Total"       sortKey="total"       current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortTh label="Outstanding" sortKey="outstanding" current={sortKey} dir={sortDir} onSort={handleSort} />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</span>
            {isOperator() && (
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-center">Log</span>
            )}
          </div>

          {/* Table rows */}
          {filtered.map((row, idx) => {
            const cfg = STATUS_CFG[row.status] ?? STATUS_CFG.vacant
            const canLog = isOperator() && row.lease_id && row.status !== 'vacant' && row.status !== 'maintenance'
            return (
              <div
                key={row.lease_id ?? row.room_id}
                className={`grid min-w-[1000px] grid-cols-[1.4fr_auto_1fr_repeat(5,auto)_auto_auto] gap-x-4 px-4 py-3 items-center
                  text-sm transition-colors hover:bg-card
                  ${idx !== filtered.length - 1 ? 'border-b border-white/4' : ''}`}
              >
                <span className="text-muted-foreground truncate text-xs">{row.property_name}</span>
                <span className="font-bold text-foreground whitespace-nowrap">{row.room_code}</span>
                <span className="text-white/70 truncate">{row.tenant_name ?? <span className="text-muted-foreground/50">—</span>}</span>
                <span className="text-muted-foreground text-right whitespace-nowrap">{formatRinggit(row.monthly_rent)}</span>
                <span className="text-emerald-400 text-right whitespace-nowrap font-medium">{formatRinggit(row.total_paid)}</span>
                <span className="text-sky-400 text-right whitespace-nowrap">{formatRinggit(row.utilities_collected)}</span>
                <span className="text-violet-300 text-right whitespace-nowrap font-semibold">{formatRinggit(row.total_collected)}</span>
                <span className={`text-right whitespace-nowrap font-bold ${row.outstanding > 0 ? 'text-red-400' : 'text-muted-foreground/70'}`}>
                  {formatRinggit(row.outstanding)}
                </span>
                <Badge className={`text-xs justify-center ${cfg.cls}`}>{cfg.label}</Badge>
                {isOperator() && (
                  <div className="flex justify-center">
                    {canLog ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                        title={`Log payment for ${monthLabel}`}
                        onClick={() => setPaymentRoom(reportRowToRoom(row))}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Totals row */}
          <div className="grid min-w-[1000px] grid-cols-[1.4fr_auto_1fr_repeat(5,auto)_auto_auto] gap-x-4 px-4 py-3.5 border-t border-border bg-card">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-3">
              {filtered.length} rooms shown
            </span>
            <span className="text-right text-sm font-semibold text-muted-foreground whitespace-nowrap">
              {formatRinggit(filtered.reduce((s, r) => s + r.monthly_rent, 0))}
            </span>
            <span className="text-right text-sm font-semibold text-emerald-400 whitespace-nowrap">
              {formatRinggit(filtered.reduce((s, r) => s + r.total_paid, 0))}
            </span>
            <span className="text-right text-sm font-semibold text-sky-400 whitespace-nowrap">
              {formatRinggit(filtered.reduce((s, r) => s + r.utilities_collected, 0))}
            </span>
            <span className="text-right text-sm font-semibold text-violet-300 whitespace-nowrap">
              {formatRinggit(filtered.reduce((s, r) => s + r.total_collected, 0))}
            </span>
            <span className="text-right text-sm font-bold text-red-400 whitespace-nowrap">
              {formatRinggit(filtered.reduce((s, r) => s + r.outstanding, 0))}
            </span>
            <span />
            {isOperator() && <span />}
          </div>
        </Card>
      )}

      {paymentRoom && (
        <PaymentModal
          open={true}
          onClose={() => setPaymentRoom(null)}
          room={paymentRoom}
          defaultBillingMonth={selectedMonth}
        />
      )}
    </div>
  )
}
