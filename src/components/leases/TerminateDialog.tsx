import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { LeaseDetail } from '@/hooks/useLeaseDetail'

export function TerminateDialog({
  open, onClose, lease, onDone,
}: {
  open: boolean
  onClose: () => void
  lease: LeaseDetail
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async () => {
      const { error: leaseErr } = await supabase
        .from('leases')
        .update({ status: 'terminated' })
        .eq('id', lease.id)
      if (leaseErr) throw leaseErr

      await logAudit({
        action: 'LEASE_TERMINATED',
        target_type: 'lease',
        target_id: lease.id,
        metadata: {
          tenant_name: lease.tenants?.full_name,
          room_code:   lease.rooms?.code,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leases'] })
      queryClient.invalidateQueries({ queryKey: ['room-matrix'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Lease terminated. Room is now vacant.')
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
            <AlertTriangle className="h-5 w-5" /> Terminate Lease
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <p className="text-white/70">
            You are about to terminate the lease for:
          </p>
          <div className="rounded-lg border border-border bg-card p-3 space-y-1">
            <p className="font-semibold text-foreground">{lease.tenants?.full_name}</p>
            <p className="text-muted-foreground text-xs">Room {lease.rooms?.code} · {lease.rooms?.properties?.name}</p>
          </div>
          <p className="text-muted-foreground">
            This will set the lease to <span className="text-red-400 font-medium">Terminated</span> and mark the room as <span className="text-foreground font-medium">Vacant</span>. This action cannot be undone.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-red-600 hover:bg-red-500 text-foreground"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Termination
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
