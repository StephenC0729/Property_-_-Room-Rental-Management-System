-- ============================================================
-- PRMS Migration 017: Operator RLS hardening
--
-- - Restrict direct SELECT on tenants and payment_history
-- - Limit operator lease reads to active leases only
-- - Remove tenant_phone from room_billing_status_v
-- - Add SECURITY DEFINER helpers for display names, payment
--   totals (view), and payment-scoped tenant contact (RPC)
-- - Drop unused get_monthly_report() (SECURITY DEFINER bypass)
-- ============================================================


-- ─── Helper: tenant display name (view-safe, no PII beyond name) ─────────────

CREATE OR REPLACE FUNCTION public.get_tenant_display_name(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_tenant_id IS NULL THEN NULL
    WHEN public.get_my_role() IN ('admin', 'super_admin') THEN (
      SELECT full_name FROM public.tenants WHERE id = p_tenant_id
    )
    WHEN EXISTS (
      SELECT 1
      FROM public.leases l
      WHERE l.tenant_id = p_tenant_id
        AND l.status = 'active'
    ) THEN (
      SELECT full_name FROM public.tenants WHERE id = p_tenant_id
    )
    ELSE NULL
  END;
$$;


-- ─── Helper: monthly payment totals for a lease (view-safe aggregates) ───────

CREATE OR REPLACE FUNCTION public.lease_payment_totals_for_month(
  p_lease_id uuid,
  p_billing_month date
)
RETURNS TABLE (
  total_paid numeric,
  utilities_collected numeric,
  total_collected numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(ph.amount), 0),
    COALESCE(SUM(
      COALESCE(ph.water_bill, 0) +
      COALESCE(ph.electricity_bill, 0) +
      COALESCE(ph.aircond_bill, 0)
    ), 0),
    COALESCE(SUM(
      ph.amount +
      COALESCE(ph.water_bill, 0) +
      COALESCE(ph.electricity_bill, 0) +
      COALESCE(ph.aircond_bill, 0)
    ), 0)
  FROM public.payment_history ph
  WHERE ph.lease_id = p_lease_id
    AND ph.billing_month = p_billing_month;
$$;


-- ─── RPC: tenant contact for payment / WhatsApp receipt ─────────────────────

CREATE OR REPLACE FUNCTION public.get_tenant_contact_for_payment(p_lease_id uuid)
RETURNS TABLE (full_name text, phone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT t.full_name, t.phone
  FROM public.leases l
  JOIN public.tenants t ON t.id = l.tenant_id
  WHERE l.id = p_lease_id
    AND l.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active lease not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_display_name(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lease_payment_totals_for_month(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_contact_for_payment(uuid) TO authenticated;


-- ─── View: operator-safe room billing status (no tenant_phone) ───────────────

DROP VIEW IF EXISTS public.room_billing_status_v;

CREATE OR REPLACE VIEW public.room_billing_status_v AS
WITH
  current_billing_month AS (
    SELECT date_trunc('month', CURRENT_DATE)::date AS billing_month
  ),
  active_leases AS (
    SELECT
      l.id              AS lease_id,
      l.room_id,
      l.tenant_id,
      l.monthly_rent,
      l.due_day,
      public.get_tenant_display_name(l.tenant_id) AS tenant_name
    FROM public.leases l
    WHERE l.status = 'active'
  )

SELECT
  r.id                                          AS room_id,
  r.property_id,
  r.code                                        AS room_code,
  r.room_number,
  r.base_rent,
  r.status                                      AS room_status,

  al.lease_id,
  al.tenant_name,
  al.monthly_rent,
  al.due_day,

  COALESCE(mp.total_paid, 0)                    AS total_paid,
  COALESCE(mp.utilities_collected, 0)           AS utilities_collected,
  COALESCE(mp.total_collected, 0)               AS total_collected,

  CASE
    WHEN r.status = 'maintenance'
      THEN 'maintenance'
    WHEN al.lease_id IS NULL
      THEN 'vacant'
    WHEN COALESCE(mp.total_paid, 0) >= al.monthly_rent
      THEN 'paid'
    WHEN COALESCE(mp.total_paid, 0) > 0
      OR COALESCE(mp.utilities_collected, 0) > 0
      THEN 'partial'
    WHEN EXTRACT(DAY FROM CURRENT_DATE) >= al.due_day
      THEN 'overdue'
    ELSE 'upcoming'
  END                                           AS billing_status,

  GREATEST(0, COALESCE(al.monthly_rent, 0) - COALESCE(mp.total_paid, 0))
                                                AS outstanding_balance

FROM public.rooms r
CROSS JOIN current_billing_month cbm
LEFT JOIN active_leases al ON al.room_id = r.id
LEFT JOIN LATERAL public.lease_payment_totals_for_month(al.lease_id, cbm.billing_month) mp
  ON al.lease_id IS NOT NULL
ORDER BY r.room_number;

ALTER VIEW public.room_billing_status_v SET (security_invoker = on);

REVOKE ALL ON public.room_billing_status_v FROM anon;
REVOKE ALL ON public.room_billing_status_v FROM public;
GRANT SELECT ON public.room_billing_status_v TO authenticated;


-- ─── RLS: tenants — admin+ only for direct reads ─────────────────────────────

DROP POLICY IF EXISTS "tenants: all read" ON public.tenants;

CREATE POLICY "tenants: admin read"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'));


-- ─── RLS: leases — operators may read active leases only ─────────────────────

DROP POLICY IF EXISTS "leases: all read" ON public.leases;

CREATE POLICY "leases: read"
  ON public.leases FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('admin', 'super_admin')
    OR status = 'active'
  );


-- ─── RLS: payment_history — admin+ for reads; all may insert ─────────────────

DROP POLICY IF EXISTS "payment_history: all read" ON public.payment_history;

CREATE POLICY "payment_history: admin read"
  ON public.payment_history FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'));


-- ─── Remove unused SECURITY DEFINER report function ──────────────────────────

DROP FUNCTION IF EXISTS public.get_monthly_report(date);
