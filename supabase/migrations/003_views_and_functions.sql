-- ============================================================
-- PRMS Migration 003: Views, Functions & Triggers
-- Run this THIRD in Supabase SQL Editor
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- VIEW: room_billing_status_v
-- Computes live billing status for every room for the current
-- calendar month. The frontend Room Matrix reads from this view.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.room_billing_status_v AS
WITH
  -- Current billing month (always the 1st of the current month)
  current_billing_month AS (
    SELECT date_trunc('month', CURRENT_DATE)::date AS billing_month
  ),

  -- One active lease per room (enforced by partial unique index)
  active_leases AS (
    SELECT
      l.id              AS lease_id,
      l.room_id,
      l.tenant_id,
      l.monthly_rent,
      l.due_day,
      t.full_name       AS tenant_name,
      t.phone           AS tenant_phone
    FROM public.leases l
    JOIN public.tenants t ON t.id = l.tenant_id
    WHERE l.status = 'active'
  ),

  -- Total payments recorded for each room in the current billing month
  monthly_payments AS (
    SELECT
      ph.room_id,
      ph.lease_id,
      SUM(ph.amount) AS total_paid
    FROM public.payment_history ph
    CROSS JOIN current_billing_month cbm
    WHERE ph.billing_month = cbm.billing_month
    GROUP BY ph.room_id, ph.lease_id
  )

SELECT
  r.id                                          AS room_id,
  r.property_id,
  r.code                                        AS room_code,
  r.floor,
  r.room_number,
  r.base_rent,
  r.status                                      AS room_status,

  -- Lease & tenant info (NULL if vacant)
  al.lease_id,
  al.tenant_name,
  al.tenant_phone,
  al.monthly_rent,
  al.due_day,

  -- Payment totals
  COALESCE(mp.total_paid, 0)                    AS total_paid,
  GREATEST(
    COALESCE(al.monthly_rent, 0) - COALESCE(mp.total_paid, 0),
    0
  )                                             AS outstanding_balance,

  -- ── Billing status logic ──────────────────────────────────
  -- Priority order matters:
  --   1. Maintenance  (room physically offline)
  --   2. Vacant       (no active lease)
  --   3. Paid         (full amount received)
  --   4. Partial      (some payment but not full)
  --   5. Overdue      (nothing paid, due date has passed)
  --   6. Upcoming     (nothing paid, due date not yet reached)
  CASE
    WHEN r.status = 'maintenance'
      THEN 'maintenance'
    WHEN al.lease_id IS NULL
      THEN 'vacant'
    WHEN COALESCE(mp.total_paid, 0) >= al.monthly_rent
      THEN 'paid'
    WHEN COALESCE(mp.total_paid, 0) > 0
      THEN 'partial'
    WHEN EXTRACT(DAY FROM CURRENT_DATE) >= al.due_day
      THEN 'overdue'
    ELSE 'upcoming'
  END                                           AS billing_status

FROM public.rooms r
LEFT JOIN active_leases   al ON al.room_id = r.id
LEFT JOIN monthly_payments mp ON mp.room_id = r.id
                              AND mp.lease_id = al.lease_id;


-- ════════════════════════════════════════════════════════════
-- TRIGGER: auto-update rooms.status when lease changes
-- When a lease becomes active → room becomes 'occupied'
-- When a lease is terminated/expired → room becomes 'vacant'
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sync_room_status_on_lease_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Lease activated
  IF NEW.status = 'active' THEN
    UPDATE public.rooms SET status = 'occupied' WHERE id = NEW.room_id;

  -- Lease terminated or expired
  ELSIF NEW.status IN ('terminated', 'expired') THEN
    -- Only set to vacant if no OTHER active lease exists for this room
    IF NOT EXISTS (
      SELECT 1 FROM public.leases
      WHERE room_id = NEW.room_id
        AND status = 'active'
        AND id != NEW.id
    ) THEN
      UPDATE public.rooms SET status = 'vacant' WHERE id = NEW.room_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_room_status
  AFTER INSERT OR UPDATE OF status
  ON public.leases
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_room_status_on_lease_change();


-- ════════════════════════════════════════════════════════════
-- FUNCTION: get_monthly_report(target_month date)
-- Used by the Reports page to pull outstanding rent data
-- for any given month (defaults to current month).
-- Usage: SELECT * FROM get_monthly_report('2026-06-01');
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_monthly_report(target_month date DEFAULT date_trunc('month', CURRENT_DATE)::date)
RETURNS TABLE (
  property_name      text,
  room_code          text,
  floor              text,
  tenant_name        text,
  tenant_phone       text,
  monthly_rent       numeric,
  total_paid         numeric,
  outstanding        numeric,
  billing_status     text,
  payment_method     text,
  payment_reference  text,
  due_day            int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.name                          AS property_name,
    r.code                          AS room_code,
    r.floor,
    t.full_name                     AS tenant_name,
    t.phone                         AS tenant_phone,
    l.monthly_rent,
    COALESCE(SUM(ph.amount), 0)     AS total_paid,
    GREATEST(l.monthly_rent - COALESCE(SUM(ph.amount), 0), 0) AS outstanding,
    CASE
      WHEN r.status = 'maintenance' THEN 'maintenance'
      WHEN COALESCE(SUM(ph.amount), 0) >= l.monthly_rent THEN 'paid'
      WHEN COALESCE(SUM(ph.amount), 0) > 0 THEN 'partial'
      WHEN EXTRACT(DAY FROM CURRENT_DATE) >= l.due_day THEN 'overdue'
      ELSE 'upcoming'
    END                             AS billing_status,
    string_agg(DISTINCT ph.payment_method, ', ') AS payment_method,
    string_agg(DISTINCT ph.reference, ', ')      AS payment_reference,
    l.due_day
  FROM public.leases l
  JOIN public.rooms r      ON r.id = l.room_id
  JOIN public.properties p ON p.id = r.property_id
  JOIN public.tenants t    ON t.id = l.tenant_id
  LEFT JOIN public.payment_history ph
    ON ph.lease_id = l.id AND ph.billing_month = target_month
  WHERE l.status = 'active'
  GROUP BY p.name, r.code, r.floor, r.room_number, t.full_name, t.phone, l.monthly_rent, l.due_day, r.status
  ORDER BY p.name, r.floor, r.room_number;
$$;
