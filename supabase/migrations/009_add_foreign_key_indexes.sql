-- ============================================================
-- PRMS Migration 009: Add Foreign Key Indexes
-- Improves query performance for JOINs across core tables
-- ============================================================

-- Table: rooms (Property relation)
CREATE INDEX IF NOT EXISTS idx_rooms_property_id ON public.rooms(property_id);

-- Table: leases (Room and Tenant relations)
CREATE INDEX IF NOT EXISTS idx_leases_room_id ON public.leases(room_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant_id ON public.leases(tenant_id);

-- Table: payment_history (Lease, Room, and Tenant relations)
CREATE INDEX IF NOT EXISTS idx_payment_history_lease_id ON public.payment_history(lease_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_tenant_id ON public.payment_history(tenant_id);
