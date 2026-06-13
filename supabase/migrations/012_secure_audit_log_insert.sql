-- ============================================================
-- PRMS Migration 012: Secure audit_log INSERT
--
-- Previously any authenticated user could insert rows with an
-- arbitrary user_id, forging the audit trail. This migration
-- stamps user_id from auth.uid() via trigger and tightens RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_audit_log_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_set_user_id ON public.audit_log;

CREATE TRIGGER trg_audit_log_set_user_id
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.set_audit_log_user_id();

DROP POLICY IF EXISTS "audit_log: all insert" ON public.audit_log;

CREATE POLICY "audit_log: all insert"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
