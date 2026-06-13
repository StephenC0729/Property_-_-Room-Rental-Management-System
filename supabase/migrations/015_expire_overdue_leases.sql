-- ============================================================
-- PRMS Migration 015: Auto-expire leases past expiry_date
--
-- Active leases with a set expiry_date in the past are moved to
-- 'expired'. trg_sync_room_status then frees the room when no
-- other active lease exists for that room.
-- ============================================================

CREATE OR REPLACE FUNCTION public.expire_overdue_leases()
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

GRANT EXECUTE ON FUNCTION public.expire_overdue_leases() TO authenticated;
