-- ============================================================
-- PRMS Migration 019: Move-out Settlement + Cumulative Arrears
--
-- 1. lease_arrears_v   — cumulative rent due vs. paid, per lease,
--                        across ALL billing months (not just current).
-- 2. lease_settlements — captures the final balance, deposit applied,
--                        and any bad-debt write-off when a lease ends.
-- 3. RLS policies on the new table + security_invoker on the view.
--
-- Rent arrears only: utilities are recorded when paid and have no
-- "owed" concept in the schema, matching room_billing_status_v.
-- ============================================================


-- ─── 1. Cumulative arrears view ──────────────────────────────────────────────
-- months_billed counts billing-month starts from the lease start
-- (move_in_date, falling back to created_at) through the earlier of the
-- current month and the lease expiry month. rent_due = months * monthly_rent.

CREATE OR REPLACE VIEW public.lease_arrears_v AS
WITH cur AS (
  SELECT date_trunc('month', CURRENT_DATE)::date AS cur_month
),
bounds AS (
  SELECT
    l.id                                                              AS lease_id,
    l.room_id,
    l.tenant_id,
    l.monthly_rent,
    l.status,
    date_trunc('month', COALESCE(l.move_in_date, l.created_at::date))::date AS start_month,
    LEAST(
      (SELECT cur_month FROM cur),
      date_trunc('month', COALESCE(l.expiry_date, CURRENT_DATE))::date
    )                                                                 AS end_month
  FROM public.leases l
),
months AS (
  SELECT
    b.*,
    GREATEST(
      0,
      CASE
        WHEN b.end_month < b.start_month THEN 0
        ELSE (
          (EXTRACT(YEAR  FROM b.end_month) - EXTRACT(YEAR  FROM b.start_month)) * 12
        + (EXTRACT(MONTH FROM b.end_month) - EXTRACT(MONTH FROM b.start_month))
        )::int + 1
      END
    ) AS months_billed
  FROM bounds b
),
paid AS (
  SELECT lease_id, SUM(amount) AS rent_paid
  FROM public.payment_history
  GROUP BY lease_id
)
SELECT
  m.lease_id,
  m.room_id,
  m.tenant_id,
  m.monthly_rent,
  m.status,
  m.months_billed,
  (m.months_billed * m.monthly_rent)                                  AS rent_due,
  COALESCE(p.rent_paid, 0)                                            AS rent_paid,
  GREATEST(0, (m.months_billed * m.monthly_rent) - COALESCE(p.rent_paid, 0))
                                                                      AS rent_arrears
FROM months m
LEFT JOIN paid p ON p.lease_id = m.lease_id;

-- Respect the caller's RLS on underlying tables (see migration 016).
ALTER VIEW public.lease_arrears_v SET (security_invoker = on);

REVOKE ALL ON public.lease_arrears_v FROM anon;
REVOKE ALL ON public.lease_arrears_v FROM public;
GRANT SELECT ON public.lease_arrears_v TO authenticated;


-- ─── 2. lease_settlements table ──────────────────────────────────────────────
-- One settlement record per lease, written when the lease is moved out.

CREATE TABLE IF NOT EXISTS public.lease_settlements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id           uuid NOT NULL UNIQUE REFERENCES public.leases(id) ON DELETE RESTRICT,
  rent_outstanding   numeric(10,2) NOT NULL DEFAULT 0 CHECK (rent_outstanding   >= 0),
  other_deductions   numeric(10,2) NOT NULL DEFAULT 0 CHECK (other_deductions   >= 0),
  deposit_available  numeric(10,2) NOT NULL DEFAULT 0 CHECK (deposit_available  >= 0),
  deposit_applied    numeric(10,2) NOT NULL DEFAULT 0 CHECK (deposit_applied    >= 0),
  deposit_refunded   numeric(10,2) NOT NULL DEFAULT 0 CHECK (deposit_refunded   >= 0),
  amount_written_off numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount_written_off >= 0),
  outcome            text NOT NULL CHECK (outcome IN ('settled', 'partial', 'written_off')),
  reason             text,
  notes              text,
  settled_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  settled_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lease_settlements_lease_id_idx
  ON public.lease_settlements (lease_id);


-- ─── 3. RLS policies (mirror migration 002 patterns) ─────────────────────────

ALTER TABLE public.lease_settlements ENABLE ROW LEVEL SECURITY;

-- Admin+ can view settlements
CREATE POLICY "lease_settlements: admin read"
  ON public.lease_settlements FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'));

-- Admin+ can create settlements
CREATE POLICY "lease_settlements: admin insert"
  ON public.lease_settlements FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

-- Admin+ can correct a settlement
CREATE POLICY "lease_settlements: admin update"
  ON public.lease_settlements FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

-- Only Super Admin can delete a settlement record
CREATE POLICY "lease_settlements: super_admin delete"
  ON public.lease_settlements FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'super_admin');
