-- ============================================================
-- PRMS Migration 014: Fix get_monthly_report floor reference
--
-- Migration 005 dropped rooms.floor but left the function from
-- migration 003 referencing r.floor. Migrations 010/013 replace
-- the function again; this ensures a working definition even
-- if those were skipped.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_monthly_report(date);

CREATE OR REPLACE FUNCTION public.get_monthly_report(target_month date DEFAULT date_trunc('month', CURRENT_DATE)::date)
RETURNS TABLE (
  property_name         text,
  room_code             text,
  tenant_name           text,
  tenant_phone          text,
  monthly_rent          numeric,
  total_paid            numeric,
  utilities_collected   numeric,
  total_collected       numeric,
  outstanding           numeric,
  billing_status        text,
  payment_method        text,
  payment_reference     text,
  due_day               int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.name                          AS property_name,
    r.code                          AS room_code,
    t.full_name                     AS tenant_name,
    t.phone                         AS tenant_phone,
    l.monthly_rent,
    COALESCE(SUM(ph.amount), 0)     AS total_paid,
    COALESCE(SUM(
      COALESCE(ph.water_bill, 0) +
      COALESCE(ph.electricity_bill, 0) +
      COALESCE(ph.aircond_bill, 0)
    ), 0)                           AS utilities_collected,
    COALESCE(SUM(
      ph.amount +
      COALESCE(ph.water_bill, 0) +
      COALESCE(ph.electricity_bill, 0) +
      COALESCE(ph.aircond_bill, 0)
    ), 0)                           AS total_collected,
    GREATEST(l.monthly_rent - COALESCE(SUM(ph.amount), 0), 0) AS outstanding,
    CASE
      WHEN r.status = 'maintenance' THEN 'maintenance'
      WHEN COALESCE(SUM(ph.amount), 0) >= l.monthly_rent THEN 'paid'
      WHEN COALESCE(SUM(ph.amount), 0) > 0
        OR COALESCE(SUM(
          COALESCE(ph.water_bill, 0) +
          COALESCE(ph.electricity_bill, 0) +
          COALESCE(ph.aircond_bill, 0)
        ), 0) > 0 THEN 'partial'
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
  GROUP BY p.name, r.code, r.room_number, t.full_name, t.phone, l.monthly_rent, l.due_day, r.status
  ORDER BY p.name, r.room_number;
$$;
