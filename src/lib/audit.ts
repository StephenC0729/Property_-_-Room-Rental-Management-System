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
    // user_id is set by DB trigger (trg_audit_log_set_user_id) — never trust client input.
    const { error } = await supabase.from('audit_log').insert({
      action: params.action,
      target_type: params.target_type ?? null,
      target_id: params.target_id ?? null,
      metadata: params.metadata ?? null,
    })

    if (error) {
      console.warn('[audit] Failed to write audit log entry:', error.message, params)
    }
  } catch (err) {
    // Audit log failure must never crash the app
    console.warn('[audit] Failed to write audit log entry:', err, params)
  }
}
