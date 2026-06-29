import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, Ban, Download, Home, TrendingDown, Users,
} from 'lucide-react'
import { format } from 'date-fns'
import { formatRinggit, exportToCsv } from '@/utils/exportCsv'
import { useBadDebtReport, type ArrearsRow } from '@/hooks/useBadDebtReport'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState, getQueryErrorMessage } from '@/components/ui/query-error-state'

function StatCard({ label, value, sub, icon: Icon, color, bgColor }: {
  label: string; value: string; sub?: string
  icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string
}) {
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

function agingBucket(months: number): { label: string; cls: string } {
  if (months >= 3) return { label: `${months} mo`, cls: 'bg-red-500/15 text-red-400 border-red-500/25' }
  if (months === 2) return { label: '2 mo', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/25' }
  return { label: '1 mo', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25' }
}

const TD = 'px-3 py-2.5 align-middle'
const TH = 'px-3 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap border-b border-white/6'

export function BadDebtPage() {
  const { data, isLoading, isError, error, refetch } = useBadDebtReport()

  const arrears = data?.arrears ?? []
  const writeOffs = data?.writeOffs ?? []

  const aging = useMemo(() => {
    const buckets = { one: 0, two: 0, threePlus: 0 }
    arrears.forEach((r: ArrearsRow) => {
      if (r.months_behind >= 3) buckets.threePlus += 1
      else if (r.months_behind === 2) buckets.two += 1
      else buckets.one += 1
    })
    return buckets
  }, [arrears])

  function handleExport() {
    exportToCsv(
      [
        ...arrears.map(r => ({
          Type: 'Arrears (active)',
          Property: r.property_name,
          Room: r.room_code,
          Tenant: r.tenant_name,
          'Monthly Rent (RM)': r.monthly_rent.toFixed(2),
          'Amount (RM)': r.rent_arrears.toFixed(2),
          'Months Behind': r.months_behind,
          Date: '',
          Reason: '',
        })),
        ...writeOffs.map(r => ({
          Type: 'Written off (bad debt)',
          Property: r.property_name,
          Room: r.room_code,
          Tenant: r.tenant_name,
          'Monthly Rent (RM)': '',
          'Amount (RM)': r.amount_written_off.toFixed(2),
          'Months Behind': '',
          Date: format(new Date(r.settled_at), 'yyyy-MM-dd'),
          Reason: r.reason ?? '',
        })),
      ],
      'PRMS_Bad_Debt',
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/3 h-[400px] w-[400px] rounded-full bg-red-600/8 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bad Debt &amp; Arrears</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Outstanding rent on active leases and debt written off at move-out
          </p>
        </div>
        <Button
          onClick={handleExport}
          disabled={isLoading || (!arrears.length && !writeOffs.length)}
          className="bg-emerald-600 hover:bg-emerald-500 text-foreground shadow-lg shadow-emerald-500/20 disabled:opacity-40"
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Stat cards */}
      {isLoading ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl bg-muted" />)}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
          <StatCard label="Outstanding Arrears" value={formatRinggit(data?.totalArrears ?? 0)}
            icon={AlertCircle} color={(data?.totalArrears ?? 0) > 0 ? 'text-red-400' : 'text-muted-foreground'}
            bgColor={(data?.totalArrears ?? 0) > 0 ? 'bg-red-500/15' : 'bg-muted'}
            sub="unpaid rent, active leases" />
          <StatCard label="Written Off" value={formatRinggit(data?.totalWrittenOff ?? 0)}
            icon={TrendingDown} color="text-orange-400" bgColor="bg-orange-500/15"
            sub="bad debt at move-out" />
          <StatCard label="Tenants Behind" value={`${arrears.length}`}
            icon={Users} color="text-yellow-400" bgColor="bg-yellow-500/15"
            sub={`${aging.threePlus} are 3+ months`} />
          <StatCard label="Written-off Leases" value={`${writeOffs.length}`}
            icon={Ban} color="text-red-400" bgColor="bg-red-500/15"
            sub="lifetime" />
        </div>
      )}

      {isError ? (
        <QueryErrorState
          title="Failed to load bad debt report"
          message={getQueryErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl bg-muted" />)}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active arrears */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Outstanding Arrears
              </h2>
              <span className="text-xs text-muted-foreground/50">
                {arrears.length} active lease{arrears.length !== 1 ? 's' : ''} behind
              </span>
            </div>
            {!arrears.length ? (
              <Card className="border-border bg-card p-8 text-center">
                <Home className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground/70">No active leases are behind on rent.</p>
              </Card>
            ) : (
              <Card className="border-border bg-card overflow-hidden overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className={`${TH} text-left`}>Property</th>
                      <th className={`${TH} text-left`}>Room</th>
                      <th className={`${TH} text-left`}>Tenant</th>
                      <th className={`${TH} text-right`}>Monthly Rent</th>
                      <th className={`${TH} text-center`}>Behind</th>
                      <th className={`${TH} text-right`}>Arrears</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arrears.map(r => {
                      const bucket = agingBucket(r.months_behind)
                      return (
                        <tr key={r.lease_id} className="border-b border-white/4 hover:bg-white/[0.02] transition-colors">
                          <td className={`${TD} text-muted-foreground text-xs max-w-[140px]`}>
                            <span className="block truncate">{r.property_name}</span>
                          </td>
                          <td className={`${TD} font-bold text-foreground whitespace-nowrap`}>{r.room_code}</td>
                          <td className={`${TD}`}>
                            <Link to={`/leases/${r.lease_id}`} className="text-white/70 hover:text-violet-300 transition-colors">
                              {r.tenant_name}
                            </Link>
                          </td>
                          <td className={`${TD} text-right text-muted-foreground whitespace-nowrap`}>
                            {formatRinggit(r.monthly_rent)}
                          </td>
                          <td className={`${TD} text-center`}>
                            <Badge className={`text-xs ${bucket.cls}`}>{bucket.label}</Badge>
                          </td>
                          <td className={`${TD} text-right font-bold text-red-400 whitespace-nowrap`}>
                            {formatRinggit(r.rent_arrears)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-card/60">
                      <td colSpan={5} className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Total outstanding
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-red-400 whitespace-nowrap">
                        {formatRinggit(data?.totalArrears ?? 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </Card>
            )}
          </section>

          {/* Written off */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Ban className="h-4 w-4 text-orange-400" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Written Off (Bad Debt)
              </h2>
              <span className="text-xs text-muted-foreground/50">
                {writeOffs.length} settlement{writeOffs.length !== 1 ? 's' : ''}
              </span>
            </div>
            {!writeOffs.length ? (
              <Card className="border-border bg-card p-8 text-center">
                <Ban className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground/70">No bad debt has been written off yet.</p>
              </Card>
            ) : (
              <Card className="border-border bg-card overflow-hidden overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className={`${TH} text-left`}>Property</th>
                      <th className={`${TH} text-left`}>Room</th>
                      <th className={`${TH} text-left`}>Tenant</th>
                      <th className={`${TH} text-left`}>Reason</th>
                      <th className={`${TH} text-right`}>Settled</th>
                      <th className={`${TH} text-right`}>Written Off</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writeOffs.map(r => (
                      <tr key={r.settlement_id} className="border-b border-white/4 hover:bg-white/[0.02] transition-colors">
                        <td className={`${TD} text-muted-foreground text-xs max-w-[140px]`}>
                          <span className="block truncate">{r.property_name}</span>
                        </td>
                        <td className={`${TD} font-bold text-foreground whitespace-nowrap`}>{r.room_code}</td>
                        <td className={`${TD}`}>
                          <Link to={`/leases/${r.lease_id}`} className="text-white/70 hover:text-violet-300 transition-colors">
                            {r.tenant_name}
                          </Link>
                        </td>
                        <td className={`${TD} text-muted-foreground/70 text-xs max-w-[200px]`}>
                          <span className="block truncate" title={r.reason ?? ''}>{r.reason ?? '—'}</span>
                        </td>
                        <td className={`${TD} text-right text-muted-foreground/70 text-xs whitespace-nowrap`}>
                          {format(new Date(r.settled_at), 'dd MMM yyyy')}
                        </td>
                        <td className={`${TD} text-right font-bold text-orange-400 whitespace-nowrap`}>
                          {formatRinggit(r.amount_written_off)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-card/60">
                      <td colSpan={5} className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Total written off
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-orange-400 whitespace-nowrap">
                        {formatRinggit(data?.totalWrittenOff ?? 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </Card>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
