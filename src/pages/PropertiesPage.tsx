import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Building2, Plus, Pencil, ArrowRight,
  CheckCircle2, AlertCircle, CircleDot, Home, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { Property } from '@/types'

// ─── Schema ───────────────────────────────────────────────────────────────────

const propertySchema = z.object({
  name: z.string().min(1, 'Property name is required').max(100),
  address: z.string().min(1, 'Address is required').max(300),
})
type PropertyFormValues = z.infer<typeof propertySchema>

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useProperties() {
  return useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Property[]
    },
  })
}

function usePropertyRoomStats() {
  return useQuery({
    queryKey: ['properties', 'room-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_billing_status_v')
        .select('property_id, billing_status')
      if (error) throw error
      const map: Record<string, {
        paid: number; overdue: number; partial: number
        vacant: number; maintenance: number; total: number
      }> = {}
      data?.forEach(r => {
        if (!map[r.property_id]) {
          map[r.property_id] = { paid: 0, overdue: 0, partial: 0, vacant: 0, maintenance: 0, total: 0 }
        }
        map[r.property_id].total++
        const s = r.billing_status as keyof typeof map[string]
        if (s in map[r.property_id]) (map[r.property_id][s] as number)++
      })
      return map
    },
  })
}

// ─── Property Form Dialog ─────────────────────────────────────────────────────

interface PropertyDialogProps {
  open: boolean
  onClose: () => void
  editProperty?: Property | null
}

function PropertyDialog({ open, onClose, editProperty }: PropertyDialogProps) {
  const queryClient = useQueryClient()

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    values: editProperty
      ? { name: editProperty.name, address: editProperty.address }
      : { name: '', address: '' },
  })

  const mutation = useMutation({
    mutationFn: async (values: PropertyFormValues) => {
      if (editProperty) {
        const { error } = await supabase
          .from('properties')
          .update(values)
          .eq('id', editProperty.id)
        if (error) throw error
        await logAudit({ action: 'PROPERTY_UPDATED', target_type: 'property', target_id: editProperty.id, metadata: values })
      } else {
        const { data, error } = await supabase
          .from('properties')
          .insert(values)
          .select()
          .single()
        if (error) throw error
        await logAudit({ action: 'PROPERTY_CREATED', target_type: 'property', target_id: data.id, metadata: values })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      toast.success(editProperty ? 'Property updated.' : 'Property added.')
      form.reset()
      onClose()
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="border-white/10 bg-[#111118] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            {editProperty ? 'Edit Property' : 'Add New Property'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60">Property Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. House 1"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-violet-500/60"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60">Full Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. No. 12, Jalan Bunga, Tawau, Sabah"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-violet-500/60"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={onClose} className="text-white/50 hover:text-white">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="bg-violet-600 hover:bg-violet-500 text-white"
              >
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editProperty ? 'Save Changes' : 'Add Property'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Property Card ─────────────────────────────────────────────────────────────

interface PropertyCardProps {
  property: Property
  stats?: { paid: number; overdue: number; partial: number; vacant: number; maintenance: number; total: number }
  isAdmin: boolean
  onEdit: (property: Property) => void
}

function PropertyCard({ property, stats, isAdmin, onEdit }: PropertyCardProps) {
  const alertCount = (stats?.overdue ?? 0) + (stats?.partial ?? 0)
  const occupancyPct = stats && stats.total > 0
    ? Math.round(((stats.total - stats.vacant - stats.maintenance) / stats.total) * 100)
    : 0

  return (
    <Card className="group relative overflow-hidden border-white/8 bg-white/[0.03] backdrop-blur-sm
                     hover:bg-white/[0.05] hover:border-white/12 transition-all duration-200">
      {/* Subtle top accent */}
      <div className={`absolute inset-x-0 top-0 h-[2px] ${alertCount > 0 ? 'bg-red-500/60' : 'bg-violet-500/40'}`} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15">
              <Building2 className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white leading-tight">{property.name}</h3>
              <p className="text-xs text-white/35 mt-0.5 max-w-[200px] truncate">{property.address}</p>
            </div>
          </div>
          {isAdmin && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-white/20 hover:text-white/60 opacity-0 group-hover:opacity-100 transition-all"
              onClick={e => { e.preventDefault(); onEdit(property) }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Stats row */}
        {stats ? (
          <div className="space-y-3">
            {/* Occupancy bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-white/30">Occupancy</span>
                <span className="text-xs font-medium text-white/60">{occupancyPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                  style={{ width: `${occupancyPct}%` }}
                />
              </div>
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-2">
              {stats.paid > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> {stats.paid} paid
                </span>
              )}
              {stats.overdue > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                  <AlertCircle className="h-3 w-3" /> {stats.overdue} overdue
                </span>
              )}
              {stats.partial > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400">
                  <CircleDot className="h-3 w-3" /> {stats.partial} partial
                </span>
              )}
              {stats.vacant > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/30">
                  <Home className="h-3 w-3" /> {stats.vacant} vacant
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              <span className="text-xs text-white/25">{stats.total} total rooms</span>
              <Link
                to={`/properties/${property.id}`}
                className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                View Room Matrix <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full bg-white/10" />
            <Skeleton className="h-3 w-2/3 bg-white/10" />
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function PropertiesPage() {
  const { isAdmin } = useAuthStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Property | null>(null)

  const { data: properties, isLoading } = useProperties()
  const { data: roomStats } = usePropertyRoomStats()

  function openAdd() { setEditTarget(null); setDialogOpen(true) }
  function openEdit(p: Property) { setEditTarget(p); setDialogOpen(true) }
  function closeDialog() { setDialogOpen(false); setEditTarget(null) }

  const totalOverdue = properties?.reduce((sum, p) => {
    const s = roomStats?.[p.id]
    return sum + (s?.overdue ?? 0) + (s?.partial ?? 0)
  }, 0) ?? 0

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4 md:p-6 lg:p-8">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 right-1/4 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Properties</h1>
          <p className="mt-1 text-sm text-white/40">
            {isLoading ? '—' : `${properties?.length ?? 0} properties`}
            {totalOverdue > 0 && (
              <span className="ml-2 text-red-400">· {totalOverdue} need attention</span>
            )}
          </p>
        </div>
        {isAdmin() && (
          <Button
            onClick={openAdd}
            className="bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Property
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : !properties?.length ? (
        <Card className="border-white/8 bg-white/[0.03] p-12 text-center">
          <Building2 className="mx-auto mb-4 h-12 w-12 text-white/15" />
          <h3 className="text-lg font-semibold text-white/40">No properties yet</h3>
          <p className="mt-1 text-sm text-white/25">
            {isAdmin() ? 'Click "Add Property" to set up your first house.' : 'Ask your admin to add properties.'}
          </p>
          {isAdmin() && (
            <Button onClick={openAdd} className="mt-6 bg-violet-600 hover:bg-violet-500 text-white">
              <Plus className="mr-2 h-4 w-4" /> Add First Property
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map(property => (
            <PropertyCard
              key={property.id}
              property={property}
              stats={roomStats?.[property.id]}
              isAdmin={isAdmin()}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      {(properties?.length ?? 0) > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-white/25">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Paid</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Overdue</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400" /> Partial</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-white/20" /> Vacant</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-400" /> Maintenance</span>
        </div>
      )}

      <PropertyDialog open={dialogOpen} onClose={closeDialog} editProperty={editTarget} />
    </div>
  )
}
