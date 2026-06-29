import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { Tenant } from '@/types'

export function FlagTenantDialog({
  open, onClose, tenant,
}: {
  open: boolean
  onClose: () => void
  tenant: Tenant
}) {
  const queryClient = useQueryClient()
  const isFlagged = tenant.is_flagged
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const nextFlagged = !isFlagged
      const { error } = await supabase
        .from('tenants')
        .update({
          is_flagged: nextFlagged,
          flag_reason: nextFlagged ? reason.trim() || null : null,
          flagged_at: nextFlagged ? new Date().toISOString() : null,
        })
        .eq('id', tenant.id)
      if (error) throw error

      await logAudit({
        action: 'TENANT_FLAGGED',
        target_type: 'tenant',
        target_id: tenant.id,
        metadata: {
          full_name: tenant.full_name,
          is_flagged: nextFlagged,
          flag_reason: nextFlagged ? reason.trim() || null : null,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      toast.success(isFlagged ? 'Tenant unflagged.' : 'Tenant flagged.')
      setReason('')
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${isFlagged ? 'text-emerald-400' : 'text-red-400'}`}>
            {isFlagged
              ? <><ShieldCheck className="h-5 w-5" /> Remove Risk Flag</>
              : <><AlertTriangle className="h-5 w-5" /> Flag Tenant</>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1 text-sm">
          <p className="text-white/70">
            <span className="font-semibold text-foreground">{tenant.full_name}</span>
          </p>
          {isFlagged ? (
            <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground space-y-1">
              <p>This tenant is currently flagged as a risk.</p>
              {tenant.flag_reason && <p className="text-white/70">Reason: {tenant.flag_reason}</p>}
              <p>Removing the flag clears the warning shown when creating a new lease.</p>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                Flagged tenants show a warning in the new-lease tenant picker (e.g. for absconding or repeat bad debt).
              </p>
              <Textarea
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Reason (e.g. Absconded with RM 1,200 unpaid)"
                className="bg-muted border-border text-foreground focus:border-violet-500/60 resize-y"
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={isFlagged
              ? 'bg-emerald-600 hover:bg-emerald-500 text-foreground'
              : 'bg-red-600 hover:bg-red-500 text-foreground'}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFlagged ? 'Remove Flag' : 'Flag Tenant'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
