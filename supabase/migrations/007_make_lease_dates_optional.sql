-- PRMS Migration 007: Make lease dates optional
-- Allows older tenants without agreements to be entered with no move_in_date or expiry_date.

ALTER TABLE public.leases 
  ALTER COLUMN move_in_date DROP NOT NULL,
  ALTER COLUMN expiry_date DROP NOT NULL;
