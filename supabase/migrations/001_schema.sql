-- ============================================================
-- PRMS Migration 001: Core Schema
-- Run this FIRST in Supabase SQL Editor
-- ============================================================

-- ─── Table: user_profiles ─────────────────────────────────────────────────────
-- Extends Supabase auth.users with role and display name.
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text NOT NULL,
  role       text NOT NULL CHECK (role IN ('super_admin', 'admin', 'operator')),
  created_at timestamptz DEFAULT now()
);

-- ─── Helper: get current user's role ─────────────────────────────────────────
-- Used by RLS policies to avoid repeated subqueries per row.
-- SECURITY DEFINER means it runs as the function owner (bypasses RLS on user_profiles).
-- NOTE: Must be defined AFTER user_profiles table exists.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$;

-- ─── Table: properties ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.properties (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,           -- e.g. "House 1"
  address    text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ─── Table: rooms ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  code        text NOT NULL,          -- e.g. "1-A-1"
  floor       text NOT NULL,          -- e.g. "A", "B"
  room_number text NOT NULL,          -- e.g. "1", "2"
  base_rent   numeric(10,2) NOT NULL CHECK (base_rent >= 0),
  status      text NOT NULL DEFAULT 'vacant'
              CHECK (status IN ('occupied', 'vacant', 'maintenance')),
  notes       text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (property_id, code)
);

-- ─── Table: tenants ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name          text NOT NULL,
  nric_passport      text NOT NULL UNIQUE,
  phone              text NOT NULL,    -- format: +601xxxxxxxx
  emergency_name     text,
  emergency_relation text,
  emergency_phone    text,
  notes              text,
  created_at         timestamptz DEFAULT now(),
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ─── Table: leases ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  monthly_rent     numeric(10,2) NOT NULL CHECK (monthly_rent >= 0),
  due_day          int NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  move_in_date     date NOT NULL,
  expiry_date      date NOT NULL,
  status           text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'expired', 'terminated')),
  security_deposit numeric(10,2) NOT NULL DEFAULT 0 CHECK (security_deposit >= 0),
  utility_deposit  numeric(10,2) NOT NULL DEFAULT 0 CHECK (utility_deposit >= 0),
  notes            text,
  created_at       timestamptz DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enforce: only ONE active lease per room at a time
CREATE UNIQUE INDEX IF NOT EXISTS leases_one_active_per_room
  ON public.leases (room_id)
  WHERE status = 'active';

-- ─── Table: payment_history ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id       uuid NOT NULL REFERENCES public.leases(id) ON DELETE RESTRICT,
  room_id        uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  amount         numeric(10,2) NOT NULL CHECK (amount >= 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer')),
  reference      text,                -- bank ref, cheque number, etc.
  water_bill     numeric(10,2) DEFAULT 0 CHECK (water_bill >= 0),
  electricity_bill numeric(10,2) DEFAULT 0 CHECK (electricity_bill >= 0),
  aircond_bill   numeric(10,2) DEFAULT 0 CHECK (aircond_bill >= 0),
  billing_month  date NOT NULL,       -- always day 1: e.g. 2026-06-01
  paid_at        timestamptz DEFAULT now(),
  recorded_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes          text,
  CONSTRAINT payment_history_total_positive_check CHECK (amount + COALESCE(water_bill, 0) + COALESCE(electricity_bill, 0) + COALESCE(aircond_bill, 0) > 0)
);

-- Index for fast billing month lookups (room matrix, reports)
CREATE INDEX IF NOT EXISTS payment_history_billing_month_idx
  ON public.payment_history (billing_month, room_id);

-- ─── Table: audit_log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL,          -- e.g. 'PAYMENT_LOGGED', 'TENANT_CREATED'
  target_type text,                   -- e.g. 'room', 'tenant', 'lease'
  target_id   uuid,
  metadata    jsonb,                  -- before/after snapshot for edits
  created_at  timestamptz DEFAULT now()
);

-- Index for Super Admin audit log page (sort by date desc)
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx
  ON public.audit_log (created_at DESC);
