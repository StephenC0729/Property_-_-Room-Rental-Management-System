-- ============================================================
-- PRMS Migration 018: Secure expire_overdue_leases()
--
-- Previously any authenticated user could invoke a SECURITY DEFINER
-- function that UPDATEs leases. Split into an internal impl plus
-- an admin-gated public RPC. Optional pg_cron job runs the impl
-- daily so leases expire even when only operators use the app.
-- ============================================================


-- ─── Internal implementation (not granted to app roles) ──────────────────────

CREATE OR REPLACE FUNCTION public._expire_overdue_leases_impl()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE public.leases
  SET status = 'expired'
  WHERE status = 'active'
    AND expiry_date IS NOT NULL
    AND expiry_date < CURRENT_DATE;

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public._expire_overdue_leases_impl() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._expire_overdue_leases_impl() FROM authenticated;
REVOKE ALL ON FUNCTION public._expire_overdue_leases_impl() FROM anon;


-- ─── Public RPC: admin+ only ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_overdue_leases()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions to expire leases'
      USING ERRCODE = '42501';
  END IF;

  RETURN public._expire_overdue_leases_impl();
END;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_leases() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_overdue_leases() TO authenticated;


-- ─── Optional daily schedule via pg_cron ─────────────────────────────────────
-- Enable the pg_cron extension in Supabase Dashboard → Database → Extensions
-- if this block raises a notice instead of scheduling.

DO $cron$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace n
    JOIN pg_catalog.pg_extension e ON e.extname = 'pg_cron'
    WHERE n.nspname = 'cron'
  ) THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prms-expire-overdue-leases') THEN
      PERFORM cron.unschedule((
        SELECT jobid FROM cron.job WHERE jobname = 'prms-expire-overdue-leases'
      ));
    END IF;

    PERFORM cron.schedule(
      'prms-expire-overdue-leases',
      '5 0 * * *',
      $$SELECT public._expire_overdue_leases_impl()$$
    );
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled — enable it in Supabase Dashboard to auto-expire leases daily.';
  END IF;
EXCEPTION
  WHEN insufficient_privilege OR undefined_object OR invalid_schema_name THEN
    RAISE NOTICE 'pg_cron unavailable — enable the extension in Supabase Dashboard to auto-expire leases daily. Until then, an admin session triggers expiry.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule lease expiry job: %', SQLERRM;
END
$cron$;
