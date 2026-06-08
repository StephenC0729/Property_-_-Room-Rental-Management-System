-- ============================================================
-- PRMS Migration 002: Row-Level Security (RLS) Policies
-- Run this SECOND in Supabase SQL Editor
-- ============================================================

-- ─── Enable RLS on all tables ─────────────────────────────────────────────────
ALTER TABLE public.user_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log       ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════
-- user_profiles
-- ════════════════════════════════════════════════════════════

-- Any authenticated user can read their OWN profile
CREATE POLICY "user_profiles: read own"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admin+ can read ALL profiles (for user management pages)
CREATE POLICY "user_profiles: admin read all"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'));

-- Only Super Admin can create/update/delete profiles
CREATE POLICY "user_profiles: super_admin all"
  ON public.user_profiles FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');


-- ════════════════════════════════════════════════════════════
-- properties
-- ════════════════════════════════════════════════════════════

-- All authenticated users can view properties
CREATE POLICY "properties: all read"
  ON public.properties FOR SELECT
  TO authenticated
  USING (true);

-- Only Admin+ can create or update properties
CREATE POLICY "properties: admin write"
  ON public.properties FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

CREATE POLICY "properties: admin update"
  ON public.properties FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

-- Only Super Admin can delete properties
CREATE POLICY "properties: super_admin delete"
  ON public.properties FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'super_admin');


-- ════════════════════════════════════════════════════════════
-- rooms
-- ════════════════════════════════════════════════════════════

-- All authenticated users can view rooms
CREATE POLICY "rooms: all read"
  ON public.rooms FOR SELECT
  TO authenticated
  USING (true);

-- Admin+ can create and update rooms
CREATE POLICY "rooms: admin insert"
  ON public.rooms FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

CREATE POLICY "rooms: admin update"
  ON public.rooms FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

-- Only Super Admin can delete rooms
CREATE POLICY "rooms: super_admin delete"
  ON public.rooms FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'super_admin');


-- ════════════════════════════════════════════════════════════
-- tenants
-- ════════════════════════════════════════════════════════════

-- All authenticated users can view tenants
CREATE POLICY "tenants: all read"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (true);

-- Admin+ can create and update tenants
CREATE POLICY "tenants: admin insert"
  ON public.tenants FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

CREATE POLICY "tenants: admin update"
  ON public.tenants FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

-- Only Super Admin can delete tenants
CREATE POLICY "tenants: super_admin delete"
  ON public.tenants FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'super_admin');


-- ════════════════════════════════════════════════════════════
-- leases
-- ════════════════════════════════════════════════════════════

-- All authenticated users can view leases
CREATE POLICY "leases: all read"
  ON public.leases FOR SELECT
  TO authenticated
  USING (true);

-- Admin+ can create and update leases
CREATE POLICY "leases: admin insert"
  ON public.leases FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

CREATE POLICY "leases: admin update"
  ON public.leases FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

-- Only Super Admin can delete leases
CREATE POLICY "leases: super_admin delete"
  ON public.leases FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'super_admin');


-- ════════════════════════════════════════════════════════════
-- payment_history
-- ════════════════════════════════════════════════════════════

-- All authenticated users can view payment history
CREATE POLICY "payment_history: all read"
  ON public.payment_history FOR SELECT
  TO authenticated
  USING (true);

-- ALL authenticated users (including Operators) can log payments
CREATE POLICY "payment_history: all insert"
  ON public.payment_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Only Admin+ can update payment records (e.g. fix a mistake)
CREATE POLICY "payment_history: admin update"
  ON public.payment_history FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.get_my_role() IN ('admin', 'super_admin'));

-- Only Super Admin can delete payment records
CREATE POLICY "payment_history: super_admin delete"
  ON public.payment_history FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'super_admin');


-- ════════════════════════════════════════════════════════════
-- audit_log
-- ════════════════════════════════════════════════════════════

-- Admin+ can view audit logs
CREATE POLICY "audit_log: admin read"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'));

-- All authenticated users can write audit entries (the app does this automatically)
CREATE POLICY "audit_log: all insert"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Only Super Admin can delete audit entries
CREATE POLICY "audit_log: super_admin delete"
  ON public.audit_log FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'super_admin');
