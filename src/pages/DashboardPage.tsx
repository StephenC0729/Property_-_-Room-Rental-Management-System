import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Building2, Home, AlertCircle, CheckCircle2, Clock,
  TrendingUp, Wallet, CalendarX2, Users, ClipboardList,
  Settings, ArrowRight, CircleDot, Wrench,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRinggit } from '@/utils/exportCsv'
import { getCurrentBillingMonth, formatBillingMonth } from '@/utils/whatsapp'
import type { Property } from '@/types'

// ─── Data hooks ───────────────────────────────────────────────────────────────

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
  const billingMonth = getCurrentBillingMonth().toISOString().slice(0, 10).replace(/-\d{2}$/, '-01')
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
        .lte('expiry_date', in30.toISOString().slice(0, 10))
        .gte('expiry_date', today.toISOString().slice(0, 10))
      if (error) throw error
      return count ?? 0
    },
  })
}

function useProperties() {
  return useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').order('name')
      if (error) throw error
      return data as Property[]
    },
  })
}

function usePropertyRoomStats() {
  return useQuery({
    queryKey: ['dashboard', 'property-room-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_billing_status_v')
        .select('property_id, billing_status')
      if (error) throw error
      // Group by property_id
      const map: Record<string, { overdue: number; partial: number; paid: number; total: number }> = {}
      data?.forEach(r => {
        if (!map[r.property_id]) map[r.property_id] = { overdue: 0, partial: 0, paid: 0, total: 0 }
        map[r.property_id].total++
        if (r.billing_status === 'overdue') map[r.property_id].overdue++
        if (r.billing_status === 'partial') map[r.property_id].partial++
        if (r.billing_status === 'paid') map[r.property_id].paid++
      })
      return map
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
    <Card className="relative overflow-hidden border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white/40 uppercase tracking-wider">{label}</p>
          {isLoading ? (
            <Skeleton className="mt-2 h-8 w-24 bg-white/10" />
          ) : (
            <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          )}
          {sublabel && <p className="mt-0.5 text-xs text-white/30">{sublabel}</p>}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bgColor}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
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
      <Card className="group flex items-center gap-4 border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm
                       hover:bg-white/[0.06] hover:border-white/15 transition-all duration-200 cursor-pointer">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-xs text-white/40 truncate">{description}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-white/50 transition-colors" />
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
        <h2 className="mb-3 text-sm font-semibold text-white/50 uppercase tracking-wider">Properties</h2>
        {propsLoading || statsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl bg-white/10" />)}
          </div>
        ) : !properties?.length ? (
          <Card className="border-white/8 bg-white/[0.03] p-8 text-center">
            <Building2 className="mx-auto mb-3 h-10 w-10 text-white/20" />
            <p className="text-sm text-white/40">No properties set up yet.</p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map(property => {
              const stats = roomStats?.[property.id] ?? { overdue: 0, partial: 0, paid: 0, total: 0 }
              const alertCount = stats.overdue + stats.partial
              return (
                <Link key={property.id} to={`/properties/${property.id}`}>
                  <Card className="group border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm
                                   hover:bg-white/[0.06] hover:border-white/15 transition-all duration-200 cursor-pointer">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/20">
                        <Building2 className="h-4 w-4 text-violet-400" />
                      </div>
                      {alertCount > 0 && (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/20 text-xs">
                          {alertCount} overdue
                        </Badge>
                      )}
                    </div>
                    <p className="font-semibold text-white">{property.name}</p>
                    <p className="text-xs text-white/30 mt-0.5 truncate">{property.address}</p>
                    <div className="mt-4 flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> {stats.paid} paid
                      </span>
                      {stats.overdue > 0 && (
                        <span className="flex items-center gap-1 text-red-400">
                          <AlertCircle className="h-3 w-3" /> {stats.overdue} overdue
                        </span>
                      )}
                      {stats.partial > 0 && (
                        <span className="flex items-center gap-1 text-orange-400">
                          <CircleDot className="h-3 w-3" /> {stats.partial} partial
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-xs text-white/20 group-hover:text-white/40 transition-colors">
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
          color="text-white"
          bgColor="bg-white/10"
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
          color={(billing.data?.overdue ?? 0) > 0 ? 'text-red-400' : 'text-white/40'}
          bgColor={(billing.data?.overdue ?? 0) > 0 ? 'bg-red-500/20' : 'bg-white/10'}
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
          color={(outstanding.data ?? 0) > 0 ? 'text-orange-400' : 'text-white/40'}
          bgColor={(outstanding.data ?? 0) > 0 ? 'bg-orange-500/20' : 'bg-white/10'}
          isLoading={outstanding.isLoading}
          sublabel="unpaid + partial balances"
        />
        <StatCard
          label="Leases Expiring"
          value={expiring.isLoading ? '—' : expiring.data ?? 0}
          icon={CalendarX2}
          color={(expiring.data ?? 0) > 0 ? 'text-yellow-400' : 'text-white/40'}
          bgColor={(expiring.data ?? 0) > 0 ? 'bg-yellow-500/20' : 'bg-white/10'}
          isLoading={expiring.isLoading}
          sublabel="within the next 30 days"
        />
      </div>

      {/* Status breakdown */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-white/50 uppercase tracking-wider">Room Status Breakdown</h2>
        <Card className="border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { label: 'Paid', value: billing.data?.paid ?? 0, color: 'text-emerald-400', dot: 'bg-emerald-400' },
              { label: 'Overdue', value: billing.data?.overdue ?? 0, color: 'text-red-400', dot: 'bg-red-400' },
              { label: 'Partial', value: billing.data?.partial ?? 0, color: 'text-orange-400', dot: 'bg-orange-400' },
              { label: 'Vacant', value: billing.data?.vacant ?? 0, color: 'text-white/40', dot: 'bg-white/30' },
              { label: 'Maintenance', value: billing.data?.maintenance ?? 0, color: 'text-yellow-400', dot: 'bg-yellow-400' },
            ].map(item => (
              <div key={item.label} className="text-center">
                <div className={`text-2xl font-bold ${item.color}`}>
                  {billing.isLoading ? <Skeleton className="mx-auto h-7 w-10 bg-white/10" /> : item.value}
                </div>
                <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-white/40">
                  <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-white/50 uppercase tracking-wider">Quick Actions</h2>
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
        <h2 className="mb-3 text-sm font-semibold text-white/50 uppercase tracking-wider">System</h2>
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
    <div className="min-h-screen bg-[#0a0a0f] p-4 md:p-6 lg:p-8">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/4 h-[400px] w-[400px] rounded-full bg-violet-600/10 blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 h-[300px] w-[300px] rounded-full bg-indigo-600/10 blur-[80px]" />
      </div>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {greeting}, {profile?.full_name.split(' ')[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-white/40">
            {currentMonth} · {role === 'operator' ? 'Operator' : role === 'admin' ? 'Admin' : 'Super Admin'} Dashboard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="border-violet-500/30 bg-violet-500/10 text-violet-300 capitalize text-xs">
            {role?.replace('_', ' ')}
          </Badge>
          {(role === 'admin' || role === 'super_admin') && (
            <Button asChild size="sm" className="bg-violet-600 hover:bg-violet-500 text-white h-8 text-xs">
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
