import { supabase } from '@/lib/supabase'
import type { AuditAction } from '@/types'

interface LogAuditParams {
  action: AuditAction
  target_type?: string
  target_id?: string
  metadata?: Record<string, unknown>
}

/**
 * Writes an entry to the audit_log table.
 * Silently fails — audit logging must never block core operations.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('audit_log').insert({
      user_id: user?.id ?? null,
      action: params.action,
      target_type: params.target_type ?? null,
      target_id: params.target_id ?? null,
      metadata: params.metadata ?? null,
    })
  } catch {
    // Audit log failure must never crash the app
    console.warn('[audit] Failed to write audit log entry:', params)
  }
}
