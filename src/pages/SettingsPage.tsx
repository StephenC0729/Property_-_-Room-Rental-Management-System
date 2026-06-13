import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Users, Shield, UserX, Check, Loader2,
  Key, User, AlertTriangle, ChevronDown, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { nameSchema, passwordSchema, type NameFormValues, type PasswordFormValues } from '@/schemas/settings'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { QueryErrorState, getQueryErrorMessage } from '@/components/ui/query-error-state'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import type { UserProfile, UserRole } from '@/types'

// ─── Role config ───────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<UserRole, { label: string; cls: string; description: string }> = {
  super_admin: {
    label: 'Super Admin',
    cls: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
    description: 'Full access — user management, audit log, all CRUD',
  },
  admin: {
    label: 'Admin',
    cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
    description: 'Manage properties, rooms, tenants, leases, reports',
  },
  operator: {
    label: 'Operator',
    cls: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
    description: 'View properties and log rent payments only',
  },
}

const ROLES: UserRole[] = ['super_admin', 'admin', 'operator']

// ─── Data hook ─────────────────────────────────────────────────────────────────

function useTeamMembers() {
  return useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('full_name')
      if (error) throw error
      return data as UserProfile[]
    },
  })
}

// ─── Remove Access Dialog ─────────────────────────────────────────────────────

function RemoveDialog({
  open, onClose, member, onDone,
}: {
  open: boolean
  onClose: () => void
  member: UserProfile | null
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async () => {
      if (!member) return
      const { error } = await supabase.from('user_profiles').delete().eq('id', member.id)
      if (error) throw error
      await logAudit({
        action: 'USER_REMOVED',
        target_type: 'user_profile',
        target_id: member.id,
        metadata: { full_name: member.full_name },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
      toast.success(`Access revoked for ${member?.full_name}.`)
      onClose()
      onDone()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-red-400 flex items-center gap-2">
            <UserX className="h-5 w-5" /> Revoke Access
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <p className="text-white/70">Remove <span className="font-semibold text-foreground">{member?.full_name}</span> from the system?</p>
          <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground space-y-1">
            <p>· Their profile will be deleted from PRMS</p>
            <p>· Their Supabase Auth account will remain (delete it manually if needed)</p>
            <p>· They will lose all access immediately</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="bg-red-600 hover:bg-red-500 text-foreground">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Revoke Access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Member Row ────────────────────────────────────────────────────────────────

function MemberRow({ member, currentUserId }: { member: UserProfile; currentUserId: string }) {
  const queryClient = useQueryClient()
  const [showRemove, setShowRemove] = useState(false)
  const isSelf = member.id === currentUserId
  const cfg = ROLE_CONFIG[member.role]
  const initials = member.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

  const roleMutation = useMutation({
    mutationFn: async (newRole: UserRole) => {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', member.id)
      if (error) throw error
      await logAudit({
        action: 'USER_ROLE_CHANGED',
        target_type: 'user_profile',
        target_id: member.id,
        metadata: { full_name: member.full_name, old_role: member.role, new_role: newRole },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
      toast.success(`Role updated for ${member.full_name}.`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="flex items-center gap-4 py-4 border-b border-border/50 last:border-0">
      {/* Avatar */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{member.full_name}</p>
          {isSelf && <Badge className="text-[10px] px-1.5 h-4 bg-muted text-muted-foreground/70 border-border">You</Badge>}
        </div>
        <p className="text-xs text-muted-foreground/70 mt-0.5">{cfg.description}</p>
      </div>

      {/* Role selector */}
      <div className="shrink-0">
        {!isSelf ? (
          <DropdownMenu>
            <DropdownMenuTrigger>
              <div className="h-8 px-2 flex items-center gap-2 hover:bg-muted border border-transparent hover:border-border transition-colors rounded-md text-sm font-medium text-muted-foreground/80 cursor-pointer">
                <Badge className={`text-[10px] px-1.5 h-5 ${cfg.cls}`}>{cfg.label}</Badge>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              {ROLES.map(r => (
                <DropdownMenuItem 
                  key={r} 
                  className="text-xs py-1.5 cursor-pointer"
                  onClick={() => roleMutation.mutate(r)}
                  disabled={roleMutation.isPending}
                >
                  <div className={`w-2 h-2 rounded-full mr-2 ${ROLE_CONFIG[r].cls.split(' ')[0]}`} />
                  {ROLE_CONFIG[r].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Badge className={`text-xs ${cfg.cls}`}>{cfg.label}</Badge>
        )}
      </div>

      {/* Remove button */}
      {!isSelf && (
        <Button size="icon" variant="ghost" onClick={() => setShowRemove(true)}
          className="h-7 w-7 text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 shrink-0">
          <UserX className="h-3.5 w-3.5" />
        </Button>
      )}

      <RemoveDialog
        open={showRemove}
        onClose={() => setShowRemove(false)}
        member={member}
        onDone={() => {}}
      />
    </div>
  )
}

// ─── My Account ────────────────────────────────────────────────────────────────

function MyAccountSection() {
  const { profile, setProfile } = useAuthStore()
  const queryClient = useQueryClient()
  const [showPwForm, setShowPwForm] = useState(false)

  const nameForm = useForm<NameFormValues>({ resolver: zodResolver(nameSchema), defaultValues: { full_name: profile?.full_name || '' } })
  const pwForm = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema), defaultValues: { new_password: '', confirm_password: '' } })

  const nameMutation = useMutation({
    mutationFn: async ({ full_name }: { full_name: string }) => {
      const { error } = await supabase.from('user_profiles').update({ full_name }).eq('id', profile!.id)
      if (error) throw error
    },
    onSuccess: (_, { full_name }) => {
      if (profile) setProfile({ ...profile, full_name })
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
      toast.success('Name updated.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const pwMutation = useMutation({
    mutationFn: async ({ new_password }: { new_password: string; confirm_password: string }) => {
      const { error } = await supabase.auth.updateUser({ password: new_password })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Password changed successfully.')
      pwForm.reset()
      setShowPwForm(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Card className="border-border bg-card p-6 space-y-5">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
          <User className="h-3.5 w-3.5 text-violet-400" />
        </div>
        <h2 className="text-sm font-semibold text-white/70">My Account</h2>
      </div>

      {/* Name */}
      <Form {...nameForm}>
        <form onSubmit={nameForm.handleSubmit(v => nameMutation.mutate(v))} className="flex items-end gap-3">
          <FormField control={nameForm.control} name="full_name" render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel className="text-muted-foreground text-xs">Display Name</FormLabel>
              <FormControl>
                <Input className="bg-muted border-border text-foreground focus:border-violet-500/60 h-9" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <Button type="submit" size="sm" disabled={nameMutation.isPending}
            className="bg-violet-600 hover:bg-violet-500 text-white h-9 shrink-0">
            {nameMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </Button>
        </form>
      </Form>

      <Separator className="bg-white/6" />

      {/* Password */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Key className="h-3.5 w-3.5 text-violet-400" /> Password
          </p>
          <Button size="sm" variant="ghost" onClick={() => setShowPwForm(v => !v)}
            className="text-xs text-muted-foreground hover:text-foreground h-7">
            {showPwForm ? 'Cancel' : 'Change Password'}
          </Button>
        </div>

        {showPwForm && (
          <Form {...pwForm}>
            <form onSubmit={pwForm.handleSubmit(v => pwMutation.mutate(v))} className="space-y-3">
              <FormField control={pwForm.control} name="new_password" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs">New Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Min. 8 characters"
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60 h-9"
                      {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={pwForm.control} name="confirm_password" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs">Confirm Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Repeat new password"
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/60 h-9"
                      {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" size="sm" disabled={pwMutation.isPending}
                className="bg-violet-600 hover:bg-violet-500 text-white">
                {pwMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Update Password
              </Button>
            </form>
          </Form>
        )}
      </div>
    </Card>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { profile } = useAuthStore()
  const { data: members, isLoading, isError, error, refetch } = useTeamMembers()

  const roleCounts = members?.reduce((acc, m) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1
    return acc
  }, {} as Record<UserRole, number>) ?? {}

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/4 h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[120px]" />
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">User management and account settings</p>
      </div>

      <div className="max-w-2xl space-y-6">

        {/* Team Members */}
        <Card className="border-border bg-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
                <Users className="h-3.5 w-3.5 text-violet-400" />
              </div>
              <h2 className="text-sm font-semibold text-white/70">Team Members</h2>
            </div>
            <div className="flex gap-1.5">
              {(Object.keys(roleCounts) as UserRole[]).map((role) => (
                <Badge key={role} className={`text-xs ${ROLE_CONFIG[role].cls}`}>
                  {(roleCounts as any)[role]} {ROLE_CONFIG[role].label}
                </Badge>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full bg-white/10" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32 bg-white/10" />
                    <Skeleton className="h-3 w-48 bg-white/10" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <QueryErrorState
              title="Failed to load team members"
              message={getQueryErrorMessage(error)}
              onRetry={() => refetch()}
            />
          ) : !members?.length ? (
            <p className="text-sm text-muted-foreground/70 text-center py-4">No team members found.</p>
          ) : (
            <div>
              {members.map(m => (
                <MemberRow key={m.id} member={m} currentUserId={profile?.id ?? ''} />
              ))}
            </div>
          )}
        </Card>

        {/* Add new member instructions */}
        <Card className="border-blue-500/15 bg-blue-500/5 p-5">
          <div className="flex gap-3">
            <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-blue-300">Adding a new team member</p>
              <ol className="text-xs text-blue-300/70 space-y-1.5 list-decimal list-inside">
                <li>Go to <span className="text-muted-foreground font-medium">Supabase Dashboard → Authentication → Users</span></li>
                <li>Click <span className="text-muted-foreground font-medium">"Invite user"</span> and enter their email</li>
                <li>They will receive an email invite to set their password</li>
                <li>Once they sign in, their profile will appear in the list above</li>
                <li>Assign their role using the dropdown on this page</li>
              </ol>
            </div>
          </div>
        </Card>

        {/* Role reference */}
        <Card className="border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
              <Shield className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <h2 className="text-sm font-semibold text-white/70">Role Permissions</h2>
          </div>
          <div className="space-y-3">
            {ROLES.map(role => {
              const cfg = ROLE_CONFIG[role]
              const permissions: Record<UserRole, string[]> = {
                super_admin: ['All Admin permissions', 'User management', 'Audit log access', 'System settings'],
                admin:       ['Manage properties & rooms', 'Manage tenants & leases', 'View reports & export CSV', 'Log payments'],
                operator:    ['View property room matrix', 'Log rent payments', 'Send WhatsApp receipts'],
              }
              return (
                <div key={role} className="flex gap-4 rounded-xl border border-white/6 bg-card p-3.5">
                  <Badge className={`text-xs shrink-0 h-fit mt-0.5 ${cfg.cls}`}>{cfg.label}</Badge>
                  <ul className="space-y-1">
                    {permissions[role].map(p => (
                      <li key={p} className="flex items-center gap-1.5 text-xs text-white/45">
                        <Check className="h-3 w-3 text-emerald-400 shrink-0" /> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </Card>

        {/* My Account */}
        <MyAccountSection />

        {/* Danger zone */}
        <Card className="border-red-500/15 bg-red-500/5 p-5">
          <div className="flex gap-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-300">Danger Zone</p>
              <p className="text-xs text-red-300/60 mt-1">
                To permanently delete a Supabase Auth account, go to{' '}
                <span className="text-muted-foreground font-medium">Dashboard → Authentication → Users</span>{' '}
                and delete from there. Removing a member here only revokes their PRMS access.
              </p>
            </div>
          </div>
        </Card>

      </div>
    </div>
  )
}
