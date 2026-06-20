-- ============================================================
-- PRMS Migration 016: Secure room_billing_status_v (RLS invoker)
--
-- Views default to SECURITY DEFINER and run as the owner, bypassing
-- RLS on underlying tables. This view joins rooms, leases, tenants,
-- and payment_history — set security_invoker so queries respect the
-- caller's RLS policies. Restrict API access to authenticated only.
-- ============================================================

ALTER VIEW public.room_billing_status_v SET (security_invoker = on);

REVOKE ALL ON public.room_billing_status_v FROM anon;
REVOKE ALL ON public.room_billing_status_v FROM public;
GRANT SELECT ON public.room_billing_status_v TO authenticated;
