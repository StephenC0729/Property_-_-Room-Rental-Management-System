-- ============================================================
-- PRMS Migration 020: Tenant risk flag
--
-- Lets admins flag a tenant (e.g. absconded / repeat bad debt) so the
-- new-lease tenant picker warns before re-leasing to them. NRIC is
-- already UNIQUE, so a flagged tenant is detectable on return.
--
-- No new RLS policies needed: the existing "tenants: admin update"
-- policy (migration 002) already governs these columns.
-- ============================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_flagged  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason text,
  ADD COLUMN IF NOT EXISTS flagged_at  timestamptz;

-- Partial index — flagged tenants are a small subset we filter/scan often.
CREATE INDEX IF NOT EXISTS tenants_is_flagged_idx
  ON public.tenants (is_flagged)
  WHERE is_flagged = true;
