import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Building2, Home, AlertCircle, CheckCircle2,
  TrendingUp, Wallet, CalendarX2, Users, ClipboardList,
  Settings, ArrowRight, CircleDot, Wrench,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useProperties } from '@/hooks/useProperties'
import { usePropertyRoomStats } from '@/hooks/usePropertyRoomStats'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'
import { formatRinggit } from '@/utils/exportCsv'
import { getCurrentBillingMonth, formatBillingMonth } from '@/utils/whatsapp'

// ─── Data hooks ───────────────────────────────────────────────────────────────
//
// useProperties and usePropertyRoomStats are imported from src/hooks/.
// The remaining hooks below are Dashboard-specific.

function useBillingSummary() {
  return useQuery({
    queryKey: ['dashboard', 'billing-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_billing_status_v')
        .select('billing_status')
      if (error) throw error
      const counts = { paid: 0, overdue: 0, partial: 0, vacant: 0, maintenance: 0, upcoming: 0 }
      data?.forEach(r => { counts[r.billing_status as keyof typeof counts]++ })
      return counts
    },
  })
}

function useMonthlyRevenue() {
  const billingMonth = format(getCurrentBillingMonth(), 'yyyy-MM-dd')
  return useQuery({
    queryKey: ['dashboard', 'monthly-revenue', billingMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_history')
        .select('amount')
        .eq('billing_month', billingMonth)
      if (error) throw error
      const total = data?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0
      return total
    },
  })
}

function useOutstandingBalance() {
  return useQuery({
    queryKey: ['dashboard', 'outstanding'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_billing_status_v')
        .select('outstanding_balance')
      if (error) throw error
      return data?.reduce((sum, r) => sum + Number(r.outstanding_balance), 0) ?? 0
    },
  })
}

function useExpiringLeases() {
  return useQuery({
    queryKey: ['dashboard', 'expiring-leases'],
    queryFn: async () => {
      const today = new Date()
      const in30 = new Date(today)
      in30.setDate(in30.getDate() + 30)
      const { count, error } = await supabase
        .from('leases')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .lte('expiry_date', format(in30, 'yyyy-MM-dd'))
        .gte('expiry_date', format(today, 'yyyy-MM-dd'))
      if (error) throw error
      return count ?? 0
    },
  })
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  color: string        // Tailwind text color
  bgColor: string      // Tailwind bg color for icon circle
  isLoading?: boolean
  sublabel?: string
}

function StatCard({ label, value, icon: Icon, color, bgColor, isLoading, sublabel }: StatCardProps) {
  return (
    <Card className="group relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-border dark:bg-card">
      <div className="flex items-start justify-between relative z-10">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          {isLoading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          )}
          {sublabel && <p className="mt-1 text-xs text-muted-foreground/70">{sublabel}</p>}
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${bgColor} border border-border group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
      </div>
      
      {/* Subtle bottom gradient glow on hover (dark mode only) */}
      <div className="absolute inset-x-0 -bottom-px h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 dark:block hidden" />
    </Card>
  )
}

function QuickAction({ to, icon: Icon, label, description, color }: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  color: string
}) {
  return (
    <Link to={to}>
      <Card className="group relative overflow-hidden flex items-center gap-4 p-4 transition-all duration-300 hover:shadow-md cursor-pointer dark:bg-card dark:border-border">
        {/* Subtle spotlight effect */}
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 bg-gradient-to-r ${color.replace('bg-', 'from-').replace('/30', '')} to-transparent`} />
        
        <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${color} border border-border`}>
          <Icon className="h-5 w-5 text-foreground dark:text-foreground" />
        </div>
        <div className="relative flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{label}</p>
          <p className="text-xs text-muted-foreground truncate transition-colors">{description}</p>
        </div>
        <ArrowRight className="relative h-4 w-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all duration-300" />
      </Card>
    </Link>
  )
}

// ─── Role-specific views ───────────────────────────────────────────────────────

function OperatorDashboard() {
  const { data: properties, isLoading: propsLoading } = useProperties()
  const { data: roomStats, isLoading: statsLoading } = usePropertyRoomStats()
  const { data: billing } = useBillingSummary()
  const totalOverdue = (billing?.overdue ?? 0) + (billing?.partial ?? 0)

  return (
    <div className="space-y-6">
      {/* Overdue alert */}
      {totalOverdue > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">
            <span className="font-semibold">{totalOverdue} room{totalOverdue !== 1 ? 's' : ''}</span> require
            payment attention across all properties.
          </p>
        </div>
      )}

      {/* Property grid */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Properties</h2>
        {propsLoading || statsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : !properties?.length ? (
          <Card className="p-8 text-center border-dashed">
            <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No properties set up yet.</p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map(property => {
              const stats = roomStats?.[property.id] ?? { overdue: 0, partial: 0, paid: 0, total: 0 }
              const alertCount = stats.overdue + stats.partial
              return (
                <Link key={property.id} to={`/properties/${property.id}`}>
                  <Card className="group p-5 transition-all duration-200 hover:shadow-md cursor-pointer dark:border-border dark:bg-card">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      {alertCount > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {alertCount} overdue
                        </Badge>
                      )}
                    </div>
                    <p className="font-semibold text-foreground">{property.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{property.address}</p>
                    <div className="mt-4 flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="h-3 w-3" /> {stats.paid} paid
                      </span>
                      {stats.overdue > 0 && (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertCircle className="h-3 w-3" /> {stats.overdue} overdue
                        </span>
                      )}
                      {stats.partial > 0 && (
                        <span className="flex items-center gap-1 text-orange-500">
                          <CircleDot className="h-3 w-3" /> {stats.partial} partial
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground/50 group-hover:text-primary transition-colors">
                      View rooms <ArrowRight className="h-3 w-3" />
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function AdminDashboard() {
  const billing = useBillingSummary()
  const revenue = useMonthlyRevenue()
  const outstanding = useOutstandingBalance()
  const expiring = useExpiringLeases()
  const totalOccupied = (billing.data?.paid ?? 0) + (billing.data?.overdue ?? 0) + (billing.data?.partial ?? 0) + (billing.data?.upcoming ?? 0)
  const totalRooms = totalOccupied + (billing.data?.vacant ?? 0) + (billing.data?.maintenance ?? 0)
  const occupancyPct = totalRooms > 0 ? Math.round((totalOccupied / totalRooms) * 100) : 0
  const currentMonth = formatBillingMonth(getCurrentBillingMonth())

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total Rooms"
          value={billing.isLoading ? '—' : totalRooms}
          icon={Home}
          color="text-foreground"
          bgColor="bg-muted"
          isLoading={billing.isLoading}
          sublabel="across all properties"
        />
        <StatCard
          label="Occupancy"
          value={billing.isLoading ? '—' : `${occupancyPct}%`}
          icon={Users}
          color="text-violet-300"
          bgColor="bg-violet-500/20"
          isLoading={billing.isLoading}
          sublabel={`${totalOccupied} of ${totalRooms} units`}
        />
        <StatCard
          label="Overdue / Partial"
          value={billing.isLoading ? '—' : (billing.data?.overdue ?? 0) + (billing.data?.partial ?? 0)}
          icon={AlertCircle}
          color={(billing.data?.overdue ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground'}
          bgColor={(billing.data?.overdue ?? 0) > 0 ? 'bg-destructive/10' : 'bg-muted'}
          isLoading={billing.isLoading}
          sublabel={`${billing.data?.overdue ?? 0} overdue, ${billing.data?.partial ?? 0} partial`}
        />
        <StatCard
          label={`Revenue — ${currentMonth}`}
          value={revenue.isLoading ? '—' : formatRinggit(revenue.data ?? 0)}
          icon={TrendingUp}
          color="text-emerald-400"
          bgColor="bg-emerald-500/20"
          isLoading={revenue.isLoading}
          sublabel="total collected this month"
        />
        <StatCard
          label="Outstanding Balance"
          value={outstanding.isLoading ? '—' : formatRinggit(outstanding.data ?? 0)}
          icon={Wallet}
          color={(outstanding.data ?? 0) > 0 ? 'text-orange-500' : 'text-muted-foreground'}
          bgColor={(outstanding.data ?? 0) > 0 ? 'bg-orange-500/10' : 'bg-muted'}
          isLoading={outstanding.isLoading}
          sublabel="unpaid + partial balances"
        />
        <StatCard
          label="Leases Expiring"
          value={expiring.isLoading ? '—' : expiring.data ?? 0}
          icon={CalendarX2}
          color={(expiring.data ?? 0) > 0 ? 'text-yellow-500' : 'text-muted-foreground'}
          bgColor={(expiring.data ?? 0) > 0 ? 'bg-yellow-500/10' : 'bg-muted'}
          isLoading={expiring.isLoading}
          sublabel="within the next 30 days"
        />
      </div>

      {/* Status breakdown - Segmented Progress Bar */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Room Status Breakdown</h2>
        <Card className="p-6 shadow-sm dark:bg-card dark:border-border">
          {billing.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-4 w-full rounded-full" />
              <div className="flex justify-between">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-4 w-16" />)}
              </div>
            </div>
          ) : (() => {
            const items = [
              { label: 'Paid', value: billing.data?.paid ?? 0, color: 'text-emerald-500', barColor: 'bg-emerald-500', dot: 'bg-emerald-500' },
              { label: 'Overdue', value: billing.data?.overdue ?? 0, color: 'text-destructive', barColor: 'bg-destructive', dot: 'bg-destructive' },
              { label: 'Partial', value: billing.data?.partial ?? 0, color: 'text-orange-500', barColor: 'bg-orange-500', dot: 'bg-orange-500' },
              { label: 'Vacant', value: billing.data?.vacant ?? 0, color: 'text-muted-foreground', barColor: 'bg-muted', dot: 'bg-muted-foreground/30' },
              { label: 'Maintenance', value: billing.data?.maintenance ?? 0, color: 'text-yellow-500', barColor: 'bg-yellow-500', dot: 'bg-yellow-500' },
            ]
            const total = items.reduce((sum, item) => sum + item.value, 0)
            
            return (
              <div className="space-y-6">
                {/* Visual Bar */}
                {total > 0 ? (
                  <div className="h-3 w-full flex rounded-full overflow-hidden bg-muted shadow-inner border border-border">
                    {items.map(item => item.value > 0 && (
                      <div 
                        key={item.label} 
                        style={{ width: `${(item.value / total) * 100}%` }} 
                        className={`${item.barColor} transition-all duration-1000 ease-out hover:brightness-110 cursor-pointer border-r border-background last:border-r-0`} 
                        title={`${item.label}: ${item.value}`} 
                      />
                    ))}
                  </div>
                ) : (
                  <div className="h-3 w-full rounded-full bg-muted border border-border" />
                )}

                {/* Legend & Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {items.map(item => (
                    <div key={item.label} className="text-center group">
                      <div className={`text-2xl font-bold ${item.color} group-hover:scale-110 transition-transform`}>
                        {item.value}
                      </div>
                      <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <span className={`h-2 w-2 rounded-full ${item.dot} shadow-[0_0_8px_currentColor]`} />
                        {item.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <QuickAction to="/properties" icon={Building2} label="View Room Matrix" description="Check all properties and log payments" color="bg-violet-500/30" />
          <QuickAction to="/tenants/new" icon={Users} label="Add New Tenant" description="Register a new tenant and lease" color="bg-indigo-500/30" />
          <QuickAction to="/reports" icon={TrendingUp} label="Monthly Report" description="View and export outstanding rent report" color="bg-emerald-500/30" />
          <QuickAction to="/leases/new" icon={ClipboardList} label="Create Lease" description="Bind a tenant to a room with a new contract" color="bg-blue-500/30" />
        </div>
      </div>

      {/* Property overview (same as operator but smaller) */}
      <OperatorDashboard />
    </div>
  )
}

function SuperAdminDashboard() {
  return (
    <div className="space-y-6">
      <AdminDashboard />

      {/* System panel */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">System</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <QuickAction to="/audit-log" icon={ClipboardList} label="Audit Log" description="Review all system actions and changes" color="bg-slate-500/30" />
          <QuickAction to="/settings" icon={Settings} label="User Management" description="Manage team accounts and access levels" color="bg-zinc-500/30" />
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard Page ───────────────────────────────────────────────────────

export function DashboardPage() {
  const { profile, role } = useAuthStore()
  const currentMonth = formatBillingMonth(getCurrentBillingMonth())

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8 relative">
      {/* Ambient glow (dark mode only) */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden dark:block hidden">
        <div className="absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full bg-indigo-600/10 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_reverse]" />
      </div>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between relative z-10">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {profile?.full_name.split(' ')[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentMonth} · {role === 'operator' ? 'Operator' : role === 'admin' ? 'Admin' : 'Super Admin'} Dashboard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 capitalize text-xs">
            {role?.replace('_', ' ')}
          </Badge>
          {(role === 'admin' || role === 'super_admin') && (
            <Button asChild size="sm" className="h-8 text-xs">
              <Link to="/properties">
                <Wrench className="mr-1.5 h-3.5 w-3.5" />
                Room Matrix
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Role-based content */}
      {role === 'operator' && <OperatorDashboard />}
      {role === 'admin' && <AdminDashboard />}
      {role === 'super_admin' && <SuperAdminDashboard />}
    </div>
  )
}
