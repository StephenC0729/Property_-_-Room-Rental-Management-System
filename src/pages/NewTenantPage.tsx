import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, User, Phone, CreditCard, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { tenantSchema, type TenantFormValues } from '@/schemas/tenant'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form'

// ─── Form Section ─────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
        <Icon className="h-3.5 w-3.5 text-violet-400" />
      </div>
      <h2 className="text-sm font-semibold text-white/70">{title}</h2>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function NewTenantPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const form = useForm<TenantFormValues>({
    resolver: zodResolver(tenantSchema),
    defaultValues: {
      full_name: '', nric_passport: '', phone: '',
      emergency_name: '', emergency_relation: '', emergency_phone: '', notes: '',
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: TenantFormValues) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.from('tenants').insert({
        full_name:          values.full_name.trim(),
        nric_passport:      values.nric_passport?.trim() || null,
        phone:              values.phone?.trim() || null,
        emergency_name:     values.emergency_name?.trim() || null,
        emergency_relation: values.emergency_relation?.trim() || null,
        emergency_phone:    values.emergency_phone?.trim() || null,
        notes:              values.notes?.trim() || null,
        created_by:         user?.id ?? null,
      }).select().single()
      if (error) throw error
      await logAudit({ action: 'TENANT_CREATED', target_type: 'tenant', target_id: data.id, metadata: { full_name: data.full_name } })
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      toast.success(`${data.full_name} added successfully.`)
      navigate(`/tenants/${data.id}`)
    },
    onError: (err: Error) => {
      if (err.message.includes('unique') || err.message.includes('nric_passport')) {
        form.setError('nric_passport', { message: 'This NRIC/Passport is already registered.' })
      } else {
        toast.error(err.message)
      }
    },
  })

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/3 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white/70 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold text-foreground">Add New Tenant</h1>
        <p className="mt-1 text-sm text-muted-foreground">Register a new tenant. A lease can be created after.</p>
      </div>

      <div className="max-w-2xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-6">

            {/* Personal Info */}
            <Card className="border-border bg-card p-6">
              <SectionHeader icon={User} title="Personal Information" />
              <div className="space-y-4">
                <FormField control={form.control} name="full_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Full Name <span className="text-red-400">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="As per NRIC / passport"
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60"
                        {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="nric_passport" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground">NRIC / Passport No. <span className="text-muted-foreground/50">(optional)</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                          <Input placeholder="e.g. 901234-12-5678"
                            className="pl-10 bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60"
                            {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground">Phone Number <span className="text-muted-foreground/50">(optional)</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                          <Input placeholder="+60123456789"
                            className="pl-10 bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60"
                            {...field} />
                        </div>
                      </FormControl>
                      <FormDescription className="text-muted-foreground/50 text-xs">Include country code: +60…</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
            </Card>

            {/* Emergency Contact */}
            <Card className="border-border bg-card p-6">
              <SectionHeader icon={AlertCircle} title="Emergency Contact" />
              <p className="text-xs text-muted-foreground/50 mb-4">Optional — but strongly recommended.</p>
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="emergency_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground">Contact Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Ahmad bin Ibrahim"
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60"
                          {...field} />
                      </FormControl>
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="emergency_relation" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground">Relationship</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Father, Spouse, Sibling"
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60"
                          {...field} />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="emergency_phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground">Emergency Phone</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                        <Input placeholder="+60198765432"
                          className="pl-10 bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60"
                          {...field} />
                      </div>
                    </FormControl>
                  </FormItem>
                )} />
              </div>
            </Card>

            {/* Notes */}
            <Card className="border-border bg-card p-6">
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Additional Notes <span className="text-muted-foreground/50">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Any special notes about this tenant…"
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60"
                      {...field} />
                  </FormControl>
                </FormItem>
              )} />
            </Card>

            <Separator className="bg-white/8" />

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="bg-primary text-primary-foreground font-semibold px-8 shadow-lg shadow-violet-500/20"
              >
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mutation.isPending ? 'Saving…' : 'Add Tenant'}
              </Button>
            </div>

          </form>
        </Form>
      </div>
    </div>
  )
}
