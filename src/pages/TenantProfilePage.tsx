import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft, Pencil, Loader2, User, Phone, CreditCard,
  AlertCircle, Home, FileText, Check, X, CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, isPast } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { useAuthStore } from '@/store/authStore'
import { formatRinggit } from '@/utils/exportCsv'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import type { Tenant, Lease, Room } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LeaseWithRoom extends Lease {
  rooms?: (Room & { properties?: { name: string } | null }) | null
}

interface TenantDetail extends Tenant {
  leases?: LeaseWithRoom[]
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const editSchema = z.object({
  full_name:          z.string().min(2, 'Full name is required'),
  nric_passport:      z.string().optional(),
  phone:              z.string().refine(v => !v || /^\+?[0-9\s\-()]{8,20}$/.test(v), 'Invalid phone').optional(),
  emergency_name:     z.string().optional(),
  emergency_relation: z.string().optional(),
  emergency_phone:    z.string().optional(),
  notes:              z.string().optional(),
})
type EditFormValues = z.infer<typeof editSchema>

// ─── Data hook ─────────────────────────────────────────────────────────────────

function useTenantDetail(id: string) {
  return useQuery({
    queryKey: ['tenants', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select(`
          *,
          leases (
            id, status, monthly_rent, due_day,
            move_in_date, expiry_date, security_deposit, utility_deposit, notes, created_at,
            rooms (
              id, code, room_number, base_rent, status,
              property_id,
              properties ( name )
            )
          )
        `)
        .eq('id', id)
        .order('created_at', { referencedTable: 'leases', ascending: false })
        .single()
      if (error) throw error
      return data as TenantDetail
    },
    enabled: !!id,
  })
}

// ─── Edit Inline Form ─────────────────────────────────────────────────────────

function EditTenantForm({ tenant, onDone }: { tenant: Tenant; onDone: () => void }) {
  const queryClient = useQueryClient()

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    values: {
      full_name:          tenant.full_name,
      nric_passport:      tenant.nric_passport ?? '',
      phone:              tenant.phone ?? '',
      emergency_name:     tenant.emergency_name ?? '',
      emergency_relation: tenant.emergency_relation ?? '',
      emergency_phone:    tenant.emergency_phone ?? '',
      notes:              tenant.notes ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: EditFormValues) => {
      const { error } = await supabase.from('tenants').update({
        full_name:          values.full_name.trim(),
        nric_passport:      values.nric_passport?.trim() || null,
        phone:              values.phone?.trim() || null,
        emergency_name:     values.emergency_name?.trim() || null,
        emergency_relation: values.emergency_relation?.trim() || null,
        emergency_phone:    values.emergency_phone?.trim() || null,
        notes:              values.notes?.trim() || null,
      }).eq('id', tenant.id)
      if (error) throw error
      await logAudit({ action: 'TENANT_UPDATED', target_type: 'tenant', target_id: tenant.id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      toast.success('Tenant updated.')
      onDone()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">
        {/* Personal fields */}
        <FormField control={form.control} name="full_name" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-white/50 text-xs">Full Name</FormLabel>
            <FormControl>
              <Input className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 h-9" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid sm:grid-cols-2 gap-3">
          <FormField control={form.control} name="nric_passport" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white/50 text-xs">NRIC / Passport <span className="text-white/30">(optional)</span></FormLabel>
              <FormControl>
                <Input className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 h-9" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="phone" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white/50 text-xs">Phone <span className="text-white/30">(optional)</span></FormLabel>
              <FormControl>
                <Input className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 h-9" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <Separator className="bg-white/8" />

        {/* Emergency fields */}
        <p className="text-xs font-medium text-white/35">Emergency Contact</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <FormField control={form.control} name="emergency_name" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white/50 text-xs">Name</FormLabel>
              <FormControl>
                <Input className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 h-9" {...field} />
              </FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="emergency_relation" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white/50 text-xs">Relation</FormLabel>
              <FormControl>
                <Input className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 h-9" {...field} />
              </FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="emergency_phone" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white/50 text-xs">Phone</FormLabel>
              <FormControl>
                <Input className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 h-9" {...field} />
              </FormControl>
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-white/50 text-xs">Notes</FormLabel>
            <FormControl>
              <Input className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 h-9" {...field} />
            </FormControl>
          </FormItem>
        )} />

        <div className="flex gap-2 pt-1">
          <Button type="submit" size="sm" disabled={mutation.isPending}
            className="bg-violet-600 hover:bg-violet-500 text-white">
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDone} className="text-white/40 hover:text-white">
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}

// ─── Lease Card ────────────────────────────────────────────────────────────────

function LeaseCard({ lease }: { lease: LeaseWithRoom }) {
  const isActive = lease.status === 'active'
  const isExpired = !isActive && lease.expiry_date && isPast(new Date(lease.expiry_date))
  const room = lease.rooms

  const statusBadge = {
    active:     { label: 'Active',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
    expired:    { label: 'Expired',    cls: 'bg-white/5 text-white/30 border-white/10' },
    terminated: { label: 'Terminated', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  }[lease.status] ?? { label: lease.status, cls: 'bg-white/5 text-white/30 border-white/10' }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isActive ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/6 bg-white/[0.02]'}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-white/30" />
          <span className="text-sm font-semibold text-white">
            {room?.properties?.name ?? '—'} · Room {room?.code ?? '—'}
          </span>
        </div>
        <Badge className={`text-xs ${statusBadge.cls}`}>{statusBadge.label}</Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-white/35">Monthly Rent</p>
          <p className="font-semibold text-white">{formatRinggit(lease.monthly_rent)}</p>
        </div>
        <div>
          <p className="text-white/35">Due Day</p>
          <p className="font-semibold text-white">Day {lease.due_day}</p>
        </div>
        <div>
          <p className="text-white/35">Move In</p>
          <p className="font-semibold text-white">{lease.move_in_date ? format(new Date(lease.move_in_date), 'dd MMM yyyy') : '—'}</p>
        </div>
        <div>
          <p className="text-white/35">Expires</p>
          <p className={`font-semibold ${isExpired && isActive ? 'text-red-400' : 'text-white'}`}>
            {lease.expiry_date ? format(new Date(lease.expiry_date), 'dd MMM yyyy') : '—'}
          </p>
        </div>
      </div>

      {(lease.security_deposit > 0 || lease.utility_deposit > 0) && (
        <div className="flex gap-4 text-xs border-t border-white/5 pt-3">
          <span className="text-white/30">Security deposit: <span className="text-white/60">{formatRinggit(lease.security_deposit)}</span></span>
          <span className="text-white/30">Utility deposit: <span className="text-white/60">{formatRinggit(lease.utility_deposit)}</span></span>
        </div>
      )}

      {isActive && (
        <div className="pt-1">
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs text-violet-400 hover:text-violet-300 px-0">
            <Link to={`/leases/${lease.id}`}>
              <FileText className="mr-1 h-3 w-3" /> View Full Lease
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | null; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-white/35 flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span className="text-sm text-white font-medium text-right max-w-[60%] truncate">{value ?? '—'}</span>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function TenantProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuthStore()
  const [isEditing, setIsEditing] = useState(false)

  const { data: tenant, isLoading } = useTenantDetail(id!)

  const activeLease = tenant?.leases?.find(l => l.status === 'active')
  const pastLeases  = tenant?.leases?.filter(l => l.status !== 'active') ?? []
  const initials    = tenant?.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() ?? '?'

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] p-4 md:p-6 lg:p-8 space-y-6">
        <Skeleton className="h-6 w-24 bg-white/10" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full bg-white/10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40 bg-white/10" />
            <Skeleton className="h-4 w-28 bg-white/10" />
          </div>
        </div>
        <Skeleton className="h-48 rounded-xl bg-white/5" />
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/40">Tenant not found.</p>
          <Button asChild className="mt-4" variant="ghost">
            <Link to="/tenants">← Back to Tenants</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4 md:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/4 h-[350px] w-[350px] rounded-full bg-violet-600/8 blur-[100px]" />
      </div>

      {/* Back */}
      <button onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> Tenants
      </button>

      <div className="max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-500/20 text-lg font-bold text-violet-300">
              {initials}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{tenant.full_name}</h1>
              <p className="text-sm text-white/35 mt-0.5 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Added {format(new Date(tenant.created_at), 'dd MMM yyyy')}
              </p>
            </div>
          </div>
          {isAdmin() && !isEditing && (
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}
              className="text-white/40 hover:text-white border border-white/10 hover:border-white/20">
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>

        {/* Active lease banner */}
        {activeLease && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-sm text-emerald-300">
              Currently in <span className="font-semibold">Room {activeLease.rooms?.code}</span> — {activeLease.rooms?.properties?.name} · {formatRinggit(activeLease.monthly_rent)}/month
            </p>
            <Button asChild size="sm" variant="ghost" className="ml-auto text-emerald-400 hover:text-emerald-300 text-xs h-7">
              <Link to={`/leases/${activeLease.id}`}>View Lease</Link>
            </Button>
          </div>
        )}

        {/* Profile info / Edit form */}
        <Card className="border-white/8 bg-white/[0.03] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white/60">Profile Details</h2>
          </div>

          {isEditing ? (
            <EditTenantForm tenant={tenant} onDone={() => setIsEditing(false)} />
          ) : (
            <>
              <div className="mb-2">
                <InfoRow label="Full Name" value={tenant.full_name} icon={User} />
                <InfoRow label="NRIC / Passport" value={tenant.nric_passport} icon={CreditCard} />
                <InfoRow label="Phone" value={tenant.phone} icon={Phone} />
                {tenant.notes && <InfoRow label="Notes" value={tenant.notes} />}
              </div>

              {(tenant.emergency_name || tenant.emergency_phone) && (
                <>
                  <Separator className="bg-white/6 my-3" />
                  <p className="text-xs font-medium text-white/30 flex items-center gap-1.5 mb-2">
                    <AlertCircle className="h-3.5 w-3.5" /> Emergency Contact
                  </p>
                  <InfoRow label="Name" value={tenant.emergency_name ?? null} />
                  <InfoRow label="Relation" value={tenant.emergency_relation ?? null} />
                  <InfoRow label="Phone" value={tenant.emergency_phone ?? null} />
                </>
              )}
            </>
          )}
        </Card>

        {/* Lease History */}
        <div>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            Lease History <span className="text-white/20 font-normal normal-case">({tenant.leases?.length ?? 0} total)</span>
          </h2>

          {!tenant.leases?.length ? (
            <Card className="border-white/8 bg-white/[0.03] p-8 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-white/15" />
              <p className="text-sm text-white/30">No leases yet.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeLease && <LeaseCard key={activeLease.id} lease={activeLease} />}
              {pastLeases.map(l => <LeaseCard key={l.id} lease={l} />)}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
