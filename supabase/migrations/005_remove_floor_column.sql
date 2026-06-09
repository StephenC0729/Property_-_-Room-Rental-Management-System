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
