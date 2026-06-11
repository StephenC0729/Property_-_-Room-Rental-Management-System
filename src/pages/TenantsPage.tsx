import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Plus, User, Phone, CreditCard, Home, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { Tenant } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TenantWithLease extends Tenant {
  leases?: {
    id: string
    status: string
    monthly_rent: number
    rooms?: { code: string } | null
  }[]
}

// ─── Data hook ─────────────────────────────────────────────────────────────────

function useTenants() {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select(`
          *,
          leases (
            id,
            status,
            monthly_rent,
            rooms ( code )
          )
        `)
        .order('full_name')
      if (error) throw error
      return data as TenantWithLease[]
    },
  })
}

// ─── Tenant Row ────────────────────────────────────────────────────────────────

function TenantRow({ tenant }: { tenant: TenantWithLease }) {
  const activeLease = tenant.leases?.find(l => l.status === 'active')
  const roomCode = activeLease?.rooms?.code ?? null

  return (
    <Link to={`/tenants/${tenant.id}`}>
      <div className="group flex items-center gap-4 rounded-xl border border-white/6 bg-card
                      px-4 py-3.5 hover:bg-white/[0.05] hover:border-border transition-all duration-150">
        {/* Avatar */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-sm font-semibold text-violet-300">
          {tenant.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
        </div>

        {/* Name + NRIC */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{tenant.full_name}</p>
          <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
            <CreditCard className="h-3 w-3 shrink-0" />
            <span className="truncate">{tenant.nric_passport ?? '—'}</span>
          </p>
        </div>

        {/* Phone */}
        <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground/70 min-w-0">
          <Phone className="h-3 w-3 shrink-0" />
          <span className="truncate">{tenant.phone ?? '—'}</span>
        </div>

        {/* Room badge */}
        <div className="shrink-0">
          {roomCode ? (
            <Badge className="bg-violet-500/15 text-violet-300 border-violet-500/25 text-xs gap-1">
              <Home className="h-3 w-3" /> {roomCode}
            </Badge>
          ) : (
            <Badge className="bg-muted text-muted-foreground/50 border-border text-xs">No active room</Badge>
          )}
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
      </div>
    </Link>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function TenantsPage() {
  const [search, setSearch] = useState('')
  const { data: tenants, isLoading } = useTenants()

  const filtered = tenants?.filter(t => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      t.full_name.toLowerCase().includes(q) ||
      (t.nric_passport && t.nric_passport.toLowerCase().includes(q)) ||
      (t.phone && t.phone.includes(q))
    )
  }) ?? []

  const activeCount = tenants?.filter(t => t.leases?.some(l => l.status === 'active')).length ?? 0

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 right-1/3 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenants</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? '—' : `${tenants?.length ?? 0} tenants · ${activeCount} with active lease`}
          </p>
        </div>
        <Button asChild className="bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20">
          <Link to="/tenants/new">
            <Plus className="mr-2 h-4 w-4" /> Add Tenant
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <Input
          placeholder="Search by name, NRIC, or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/50 h-10"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl bg-muted" />)}
        </div>
      ) : !filtered.length ? (
        <Card className="border-border bg-card p-12 text-center">
          <User className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          {search ? (
            <>
              <h3 className="text-base font-semibold text-muted-foreground">No results for "{search}"</h3>
              <p className="mt-1 text-sm text-muted-foreground/50">Try a different name, NRIC, or phone number.</p>
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold text-muted-foreground">No tenants yet</h3>
              <p className="mt-1 text-sm text-muted-foreground/50">Click "Add Tenant" to register your first tenant.</p>
            </>
          )}
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(tenant => <TenantRow key={tenant.id} tenant={tenant} />)}
        </div>
      )}

      {/* Count footer */}
      {filtered.length > 0 && search && (
        <p className="mt-4 text-xs text-muted-foreground/50 text-center">
          Showing {filtered.length} of {tenants?.length ?? 0} tenants
        </p>
      )}
    </div>
  )
}
