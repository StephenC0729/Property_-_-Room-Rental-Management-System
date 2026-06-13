-- ============================================================
-- PRMS Migration 005: Remove floor column & update view
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Step 1: Drop the dependent view first
DROP VIEW IF EXISTS public.room_billing_status_v;

-- Step 2: Drop the floor column from the rooms table
ALTER TABLE public.rooms DROP COLUMN IF EXISTS floor;

-- Step 3: Recreate the billing status view without floor
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
      t.full_name       AS tenant_name,
      t.phone           AS tenant_phone
    FROM public.leases l
    JOIN public.tenants t ON t.id = l.tenant_id
    WHERE l.status = 'active'
  ),
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
  r.room_number,
  r.base_rent,
  r.status                                      AS room_status,

  al.lease_id,
  al.tenant_name,
  al.tenant_phone,
  al.monthly_rent,
  al.due_day,

  COALESCE(mp.total_paid, 0)                    AS total_paid,

  CASE
    WHEN r.status = 'maintenance'              THEN 'maintenance'
    WHEN al.lease_id IS NULL                   THEN 'vacant'
    WHEN COALESCE(mp.total_paid, 0) = 0        THEN 'overdue'
    WHEN mp.total_paid >= al.monthly_rent      THEN 'paid'
    ELSE                                            'partial'
  END                                           AS billing_status,

  GREATEST(0, COALESCE(al.monthly_rent, 0) - COALESCE(mp.total_paid, 0))
                                                AS outstanding_balance

FROM public.rooms r
LEFT JOIN active_leases  al ON al.room_id  = r.id
LEFT JOIN monthly_payments mp ON mp.room_id = r.id AND mp.lease_id = al.lease_id
ORDER BY r.room_number;

-- Step 4: Recreate get_monthly_report without the dropped floor column
DROP FUNCTION IF EXISTS public.get_monthly_report(date);

CREATE OR REPLACE FUNCTION public.get_monthly_report(target_month date DEFAULT date_trunc('month', CURRENT_DATE)::date)
RETURNS TABLE (
  property_name      text,
  room_code          text,
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
  GROUP BY p.name, r.code, r.room_number, t.full_name, t.phone, l.monthly_rent, l.due_day, r.status
  ORDER BY p.name, r.room_number;
$$;
