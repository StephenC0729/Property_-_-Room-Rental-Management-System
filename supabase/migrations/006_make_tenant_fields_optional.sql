-- ============================================================
-- PRMS Migration 006: Make Tenant NRIC and Phone optional
-- Run this in the Supabase SQL Editor
-- ============================================================

ALTER TABLE public.tenants
  ALTER COLUMN nric_passport DROP NOT NULL,
  ALTER COLUMN phone DROP NOT NULL;
