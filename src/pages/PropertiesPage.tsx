import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Building2, Plus, Pencil, ArrowRight,
  CheckCircle2, AlertCircle, CircleDot, Home, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { propertySchema, type PropertyFormValues } from '@/schemas/property'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { Property } from '@/types'

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
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
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
                  <FormLabel className="text-muted-foreground">Property Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. House 1"
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60"
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
                  <FormLabel className="text-muted-foreground">Full Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. No. 12, Jalan Bunga, Tawau, Sabah"
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">
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
  statsLoading: boolean
  isAdmin: boolean
  onEdit: (property: Property) => void
}

function PropertyCard({ property, stats, statsLoading, isAdmin, onEdit }: PropertyCardProps) {
  const alertCount = (stats?.overdue ?? 0) + (stats?.partial ?? 0)
  const occupancyPct = stats && stats.total > 0
    ? Math.round(((stats.total - stats.vacant - stats.maintenance) / stats.total) * 100)
    : 0

  return (
    <Card className="group relative overflow-hidden border-border bg-card backdrop-blur-sm
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
              <h3 className="font-semibold text-foreground leading-tight">{property.name}</h3>
              <p className="text-xs text-muted-foreground/70 mt-0.5 max-w-[200px] truncate">{property.address}</p>
            </div>
          </div>
          {isAdmin && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground/50 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-all"
              onClick={e => { e.preventDefault(); onEdit(property) }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Stats row */}
        {statsLoading ? (
          /* Still fetching room data */
          <div className="space-y-2">
            <Skeleton className="h-3 w-full bg-white/10" />
            <Skeleton className="h-3 w-2/3 bg-white/10" />
          </div>
        ) : stats ? (
          /* Has rooms — show full stats */
          <div className="space-y-3">
            {/* Occupancy bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground/70">Occupancy</span>
                <span className="text-xs font-medium text-muted-foreground">{occupancyPct}%</span>
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
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground/70">
                  <Home className="h-3 w-3" /> {stats.vacant} vacant
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              <span className="text-xs text-muted-foreground/50">{stats.total} total rooms</span>
              <Link
                to={`/properties/${property.id}`}
                className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium"
              >
                Manage Rooms <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ) : (
          /* No rooms added yet */
          <div className="flex flex-col items-center justify-center gap-3 py-4 rounded-xl border border-dashed border-border bg-white/[0.01]">
            <Home className="h-7 w-7 text-muted-foreground/50" />
            <div className="text-center">
              <p className="text-xs font-medium text-muted-foreground/70">No rooms added yet</p>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5">Click below to add your first room</p>
            </div>
            <Link
              to={`/properties/${property.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-600 px-3 py-1.5 text-xs font-medium text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add Rooms
            </Link>
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
  const { data: roomStats, isLoading: statsLoading } = usePropertyRoomStats()

  function openAdd() { setEditTarget(null); setDialogOpen(true) }
  function openEdit(p: Property) { setEditTarget(p); setDialogOpen(true) }
  function closeDialog() { setDialogOpen(false); setEditTarget(null) }

  const totalOverdue = properties?.reduce((sum, p) => {
    const s = roomStats?.[p.id]
    return sum + (s?.overdue ?? 0) + (s?.partial ?? 0)
  }, 0) ?? 0

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 right-1/4 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Properties</h1>
          <p className="mt-1 text-sm text-muted-foreground">
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
            <Skeleton key={i} className="h-52 rounded-xl bg-muted" />
          ))}
        </div>
      ) : !properties?.length ? (
        <Card className="border-border bg-card p-12 text-center">
          <Building2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold text-muted-foreground">No properties yet</h3>
          <p className="mt-1 text-sm text-muted-foreground/50">
            {isAdmin() ? 'Click "Add Property" to set up your first house.' : 'Ask your admin to add properties.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map(property => (
            <PropertyCard
              key={property.id}
              property={property}
              stats={roomStats?.[property.id]}
              statsLoading={statsLoading}
              isAdmin={isAdmin()}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      {(properties?.length ?? 0) > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-muted-foreground/50">
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
