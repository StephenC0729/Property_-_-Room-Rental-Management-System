import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft, Search, Loader2, User, Home, CheckCircle2,
  Building2, CreditCard, CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { formatRinggit } from '@/utils/exportCsv'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import type { Tenant, Property, Room } from '@/types'

// ─── Schema ───────────────────────────────────────────────────────────────────

const leaseSchema = z.object({
  tenant_id:         z.string().uuid('Please select a tenant'),
  room_id:           z.string().uuid('Please select a room'),
  monthly_rent:      z.coerce.number().positive('Monthly rent must be greater than 0'),
  due_day:           z.coerce.number().int().min(1).max(28),
  move_in_date:      z.string().optional(),
  expiry_date:       z.string().optional(),
  security_deposit:  z.coerce.number().min(0),
  utility_deposit:   z.coerce.number().min(0),
  notes:             z.string().optional(),
}).refine(d => {
  if (!d.move_in_date || !d.expiry_date) return true;
  return new Date(d.expiry_date) > new Date(d.move_in_date);
}, {
  message: 'Expiry must be after move-in date',
  path: ['expiry_date'],
})
type LeaseFormValues = z.infer<typeof leaseSchema>

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useTenants() {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('*').order('full_name')
      if (error) throw error
      return data as Tenant[]
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

function useVacantRooms(propertyId: string | null) {
  return useQuery({
    queryKey: ['vacant-rooms', propertyId],
    queryFn: async () => {
      let q = supabase.from('rooms').select('*').eq('status', 'vacant').order('room_number')
      if (propertyId) q = q.eq('property_id', propertyId)
      const { data, error } = await q
      if (error) throw error
      return data as Room[]
    },
    enabled: true,
  })
}

// ─── Tenant Picker ─────────────────────────────────────────────────────────────

function TenantPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const { data: tenants } = useTenants()
  const selected = tenants?.find(t => t.id === value)
  const filtered = tenants?.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.full_name.toLowerCase().includes(q) || (t.nric_passport && t.nric_passport.toLowerCase().includes(q)) || (t.phone && t.phone.includes(q))
  }) ?? []

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">
            {selected.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{selected.full_name}</p>
            <p className="text-xs text-white/40">{selected.nric_passport ?? 'No NRIC'} · {selected.phone ?? 'No phone'}</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange('')} className="text-white/40 hover:text-white text-xs h-7">
          Change
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
        <Input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search tenant by name, NRIC, or phone…"
          className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-violet-500/60 h-10" />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-white/8 bg-white/[0.02] p-1">
        {!filtered.length ? (
          <p className="text-center text-xs text-white/25 py-4">
            {tenants?.length === 0 ? 'No tenants yet. Add a tenant first.' : 'No results.'}
          </p>
        ) : filtered.map(t => (
          <button key={t.id} type="button" onClick={() => onChange(t.id)}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/5 transition-colors">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/15 text-xs font-bold text-violet-300 shrink-0">
              {t.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white truncate">{t.full_name}</p>
              <p className="text-xs text-white/30 truncate">{t.nric_passport ?? 'No NRIC'}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Room Picker ───────────────────────────────────────────────────────────────

function RoomPicker({ value, onChange, onRentChange }: {
  value: string
  onChange: (id: string) => void
  onRentChange: (rent: number) => void
}) {
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const { data: properties } = useProperties()
  const { data: rooms } = useVacantRooms(propertyId)
  const selectedRoom = rooms?.find(r => r.id === value)

  if (selectedRoom) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20">
            <Home className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Room {selectedRoom.code}</p>
            <p className="text-xs text-white/40">Base rent: {formatRinggit(selectedRoom.base_rent)}</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange('')} className="text-white/40 hover:text-white text-xs h-7">
          Change
        </Button>
      </div>
    )
  }

  const filteredRooms = rooms ?? []

  return (
    <div className="space-y-3">
      {/* Property filter */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setPropertyId(null)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
            !propertyId ? 'border-violet-500/40 bg-violet-500/15 text-violet-300' : 'border-white/8 bg-white/[0.03] text-white/40 hover:border-white/15'
          }`}>
          All Properties
        </button>
        {properties?.map(p => (
          <button key={p.id} type="button" onClick={() => setPropertyId(p.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              propertyId === p.id ? 'border-violet-500/40 bg-violet-500/15 text-violet-300' : 'border-white/8 bg-white/[0.03] text-white/40 hover:border-white/15'
            }`}>
            {p.name}
          </button>
        ))}
      </div>

      {/* Room grid */}
      {!filteredRooms.length ? (
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-6 text-center">
          <Home className="mx-auto mb-2 h-8 w-8 text-white/15" />
          <p className="text-xs text-white/30">
            {propertyId ? 'No vacant rooms in this property.' : 'No vacant rooms available.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-52 overflow-y-auto rounded-xl border border-white/8 bg-white/[0.02] p-2">
          {filteredRooms.map(room => (
            <button key={room.id} type="button"
              onClick={() => { onChange(room.id); onRentChange(room.base_rent) }}
              className="rounded-lg border border-white/8 bg-white/[0.03] p-2.5 text-left
                         hover:border-violet-500/40 hover:bg-violet-500/10 transition-all">
              <p className="text-xs font-bold text-white">{room.code}</p>
              <p className="text-[10px] text-white/30 mt-0.5">{formatRinggit(room.base_rent)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Form field wrapper ───────────────────────────────────────────────────────

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[180px_1fr] gap-2 items-start">
      <label className="text-sm text-white/50 pt-2.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div>{children}</div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function NewLeasePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const prefillTenantId = searchParams.get('tenant')

  const form = useForm<LeaseFormValues>({
    resolver: zodResolver(leaseSchema),
    defaultValues: {
      tenant_id: prefillTenantId ?? '',
      room_id: '',
      monthly_rent: 0,
      due_day: 1,
      move_in_date: '',
      expiry_date: '',
      security_deposit: 0,
      utility_deposit: 0,
      notes: '',
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: LeaseFormValues) => {
      // Create the lease
      const { data: lease, error: leaseErr } = await supabase
        .from('leases')
        .insert({
          tenant_id:        values.tenant_id,
          room_id:          values.room_id,
          monthly_rent:     values.monthly_rent,
          due_day:          values.due_day,
          move_in_date:     values.move_in_date || null,
          expiry_date:      values.expiry_date || null,
          security_deposit: values.security_deposit,
          utility_deposit:  values.utility_deposit,
          notes:            values.notes?.trim() || null,
          status:           'active',
        })
        .select()
        .single()
      if (leaseErr) throw leaseErr

      // Mark room as occupied
      const { error: roomErr } = await supabase
        .from('rooms')
        .update({ status: 'occupied' })
        .eq('id', values.room_id)
      if (roomErr) throw roomErr

      await logAudit({
        action: 'LEASE_CREATED',
        target_type: 'lease',
        target_id: lease.id,
        metadata: { tenant_id: values.tenant_id, room_id: values.room_id, monthly_rent: values.monthly_rent },
      })
      return lease
    },
    onSuccess: (lease) => {
      queryClient.invalidateQueries({ queryKey: ['leases'] })
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      queryClient.invalidateQueries({ queryKey: ['room-matrix'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Lease created successfully.')
      navigate(`/leases/${lease.id}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const tenantId = form.watch('tenant_id')
  const roomId   = form.watch('room_id')

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4 md:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/3 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="mb-8">
        <button onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold text-white">New Lease</h1>
        <p className="mt-1 text-sm text-white/40">Assign a tenant to a vacant room with a new contract.</p>
      </div>

      <div className="max-w-2xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-5">

            {/* Step 1: Tenant */}
            <Card className="border-white/8 bg-white/[0.03] p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">1</div>
                <h2 className="text-sm font-semibold text-white/70 flex items-center gap-1.5">
                  <User className="h-4 w-4 text-violet-400" /> Select Tenant
                </h2>
                {tenantId && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-400" />}
              </div>
              <FormField control={form.control} name="tenant_id" render={({ field }) => (
                <FormItem>
                  <TenantPicker value={field.value} onChange={field.onChange} />
                  <FormMessage />
                </FormItem>
              )} />
            </Card>

            {/* Step 2: Room */}
            <Card className="border-white/8 bg-white/[0.03] p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">2</div>
                <h2 className="text-sm font-semibold text-white/70 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-violet-400" /> Select Vacant Room
                </h2>
                {roomId && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-400" />}
              </div>
              <FormField control={form.control} name="room_id" render={({ field }) => (
                <FormItem>
                  <RoomPicker
                    value={field.value}
                    onChange={field.onChange}
                    onRentChange={rent => form.setValue('monthly_rent', rent)}
                  />
                  <FormMessage />
                </FormItem>
              )} />
            </Card>

            {/* Step 3: Lease terms */}
            <Card className="border-white/8 bg-white/[0.03] p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300">3</div>
                <h2 className="text-sm font-semibold text-white/70 flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-violet-400" /> Lease Terms
                </h2>
              </div>

              <FieldRow label="Monthly Rent (RM)" required>
                <FormField control={form.control} name="monthly_rent" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input type="number" step="0.01" min="0"
                        className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </FieldRow>

              <FieldRow label="Due Day" required>
                <FormField control={form.control} name="due_day" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input type="number" min="1" max="28" placeholder="e.g. 1"
                        className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        {...field} />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-white/25">Day of each month rent is due (1–28)</p>
                  </FormItem>
                )} />
              </FieldRow>

              <Separator className="bg-white/8" />

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="move_in_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/50 text-xs flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" /> Move-in Date (Optional)
                    </FormLabel>
                    <FormControl>
                      <Input type="date"
                        className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 cursor-pointer"
                        onClick={e => e.currentTarget.showPicker?.()}
                        {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="expiry_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/50 text-xs flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" /> Lease Expiry Date (Optional)
                    </FormLabel>
                    <FormControl>
                      <Input type="date"
                        className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 cursor-pointer"
                        onClick={e => e.currentTarget.showPicker?.()}
                        {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <Separator className="bg-white/8" />

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="security_deposit" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/50 text-xs">Security Deposit (RM)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="0"
                        className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        {...field} />
                    </FormControl>
                    <p className="text-xs text-white/20">Informational only — not billed monthly</p>
                  </FormItem>
                )} />

                <FormField control={form.control} name="utility_deposit" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/50 text-xs">Utility Deposit (RM)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="0"
                        className="bg-white/5 border-white/10 text-white focus:border-violet-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        {...field} />
                    </FormControl>
                    <p className="text-xs text-white/20">Informational only — not billed monthly</p>
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/50 text-xs">Notes (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Any special conditions or remarks…"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-violet-500/60"
                      {...field} />
                  </FormControl>
                </FormItem>
              )} />
            </Card>

            <Separator className="bg-white/8" />

            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={() => navigate(-1)} className="text-white/40 hover:text-white">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending || !tenantId || !roomId}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold px-8 shadow-lg shadow-violet-500/20 disabled:opacity-40"
              >
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mutation.isPending ? 'Creating…' : 'Create Lease'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  )
}
