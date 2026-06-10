-- Migration to add payment_date to payment_history table
-- This allows operators to backdate payments if they record them late.

ALTER TABLE public.payment_history
ADD COLUMN payment_date date DEFAULT CURRENT_DATE;

-- Populate existing rows with their paid_at date cast to date
UPDATE public.payment_history
SET payment_date = paid_at::date
WHERE payment_date IS NULL;

ALTER TABLE public.payment_history
ALTER COLUMN payment_date SET NOT NULL;
