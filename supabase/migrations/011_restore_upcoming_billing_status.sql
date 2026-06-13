-- ============================================================
-- PRMS Migration 011: Restore upcoming/overdue billing logic
--
-- Migration 005 regressed room_billing_status_v by treating any
-- zero-payment occupied room as 'overdue'. Migration 010 kept
-- that regression while adding utility totals. This restores the
-- due_day-aware CASE from migration 003.
-- ============================================================

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
      SUM(ph.amount) AS total_paid,
      SUM(
        COALESCE(ph.water_bill, 0) +
        COALESCE(ph.electricity_bill, 0) +
        COALESCE(ph.aircond_bill, 0)
      ) AS utilities_collected,
      SUM(
        ph.amount +
        COALESCE(ph.water_bill, 0) +
        COALESCE(ph.electricity_bill, 0) +
        COALESCE(ph.aircond_bill, 0)
      ) AS total_collected
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
  COALESCE(mp.utilities_collected, 0)           AS utilities_collected,
  COALESCE(mp.total_collected, 0)               AS total_collected,

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
      OR COALESCE(mp.utilities_collected, 0) > 0
      THEN 'partial'
    WHEN EXTRACT(DAY FROM CURRENT_DATE) >= al.due_day
      THEN 'overdue'
    ELSE 'upcoming'
  END                                           AS billing_status,

  GREATEST(0, COALESCE(al.monthly_rent, 0) - COALESCE(mp.total_paid, 0))
                                                AS outstanding_balance

FROM public.rooms r
LEFT JOIN active_leases  al ON al.room_id  = r.id
LEFT JOIN monthly_payments mp ON mp.room_id = r.id AND mp.lease_id = al.lease_id
ORDER BY r.room_number;
