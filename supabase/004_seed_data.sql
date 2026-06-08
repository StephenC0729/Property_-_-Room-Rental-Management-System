-- ============================================================
-- PRMS Seed Data
-- Run this in the Supabase SQL Editor to populate dummy data
-- ============================================================

-- Seed Properties
INSERT INTO public.properties (id, name, address) VALUES
('b1981cb6-5c5b-4375-8025-063a8a65f973', 'Sunset Villa', '123 Sunset Boulevard, Georgetown, Penang'),
('f8f615f2-9cb8-47bc-ad73-d3c26fa321f4', 'Metro Suites', '45 Metro Avenue, KL Sentral, Kuala Lumpur');

-- Seed Rooms
INSERT INTO public.rooms (id, property_id, code, floor, room_number, base_rent, status) VALUES
('41d8e09f-683a-4ba4-9a8d-2d4e61394c25', 'b1981cb6-5c5b-4375-8025-063a8a65f973', '1-A-1', 'A', '1', 600.00, 'occupied'),
('9df1d62c-8ab5-46aa-bf7d-2b4742f1f0a5', 'b1981cb6-5c5b-4375-8025-063a8a65f973', '1-A-2', 'A', '2', 550.00, 'vacant'),
('7f6c3116-24a9-450b-8dfb-dfd21b77f240', 'b1981cb6-5c5b-4375-8025-063a8a65f973', '1-A-3', 'A', '3', 500.00, 'maintenance'),
('a37b3ef5-0cfb-4a55-83e8-5df26de767a9', 'f8f615f2-9cb8-47bc-ad73-d3c26fa321f4', '2-B-1', 'B', '1', 800.00, 'occupied'),
('e3b5e43a-8cb9-4a9f-a2e6-df0f3b43db0f', 'f8f615f2-9cb8-47bc-ad73-d3c26fa321f4', '2-B-2', 'B', '2', 800.00, 'occupied');

-- Seed Tenants
INSERT INTO public.tenants (id, full_name, nric_passport, phone, emergency_name, emergency_relation, emergency_phone) VALUES
('c8a41df5-1b2c-48c5-9276-805bfa881b21', 'Ahmad Bin Ismail', '900101-01-1234', '+60123456789', 'Ismail Bin Ali', 'Father', '+60198765432'),
('d14b434a-67a3-4b08-8e8e-d9a8e0f6b15c', 'Sarah Lee', '950505-14-5678', '+60171234567', 'Michael Lee', 'Brother', '+60176543210'),
('e5720c2a-9e76-4d7a-b9c1-5df7b6e9a6e1', 'Muthu Kumar', '880808-08-8888', '+60161112222', NULL, NULL, NULL);

-- Seed Leases
-- Ahmad in 1-A-1
INSERT INTO public.leases (id, room_id, tenant_id, monthly_rent, due_day, move_in_date, expiry_date, security_deposit, utility_deposit, status) VALUES
('1e99c15e-fb7e-49b5-9f5e-18d3a1e948c3', '41d8e09f-683a-4ba4-9a8d-2d4e61394c25', 'c8a41df5-1b2c-48c5-9276-805bfa881b21', 600.00, 1, '2026-01-01', '2026-12-31', 1200.00, 300.00, 'active');

-- Sarah in 2-B-1
INSERT INTO public.leases (id, room_id, tenant_id, monthly_rent, due_day, move_in_date, expiry_date, security_deposit, utility_deposit, status) VALUES
('5f1d7a9b-32f2-43f3-a6d1-4cb381b8d2e6', 'a37b3ef5-0cfb-4a55-83e8-5df26de767a9', 'd14b434a-67a3-4b08-8e8e-d9a8e0f6b15c', 800.00, 5, '2026-03-01', '2027-02-28', 1600.00, 400.00, 'active');

-- Muthu in 2-B-2 (Move-in today, expiring in a year)
INSERT INTO public.leases (id, room_id, tenant_id, monthly_rent, due_day, move_in_date, expiry_date, security_deposit, utility_deposit, status) VALUES
('b278f309-8d1e-450f-a3f8-6ef8f2f4c3a7', 'e3b5e43a-8cb9-4a9f-a2e6-df0f3b43db0f', 'e5720c2a-9e76-4d7a-b9c1-5df7b6e9a6e1', 800.00, 7, CURRENT_DATE, CURRENT_DATE + interval '1 year', 1600.00, 400.00, 'active');

-- Seed Payments for Current Month
-- Ahmad paid full rent via bank transfer
INSERT INTO public.payment_history (id, lease_id, room_id, tenant_id, amount, payment_method, reference, billing_month, payment_date) VALUES
('73d1f148-52c7-4328-9f33-1a48c48a9b2c', '1e99c15e-fb7e-49b5-9f5e-18d3a1e948c3', '41d8e09f-683a-4ba4-9a8d-2d4e61394c25', 'c8a41df5-1b2c-48c5-9276-805bfa881b21', 600.00, 'bank_transfer', 'MBB123456', date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE);

-- Sarah paid partial rent via cash
INSERT INTO public.payment_history (id, lease_id, room_id, tenant_id, amount, payment_method, reference, billing_month, payment_date) VALUES
('a8e9d3b4-1c2f-4a5d-b8e7-f9d2c4e6b1a3', '5f1d7a9b-32f2-43f3-a6d1-4cb381b8d2e6', 'a37b3ef5-0cfb-4a55-83e8-5df26de767a9', 'd14b434a-67a3-4b08-8e8e-d9a8e0f6b15c', 400.00, 'cash', NULL, date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE);

-- (Muthu has not paid yet, will appear as 'overdue')

-- Seed an Audit Log event
INSERT INTO public.audit_log (action, target_type, target_id, metadata, created_at) VALUES
('PROPERTY_CREATED', 'property', 'b1981cb6-5c5b-4375-8025-063a8a65f973', '{"name": "Sunset Villa"}', CURRENT_TIMESTAMP - interval '1 hour'),
('TENANT_CREATED', 'tenant', 'c8a41df5-1b2c-48c5-9276-805bfa881b21', '{"full_name": "Ahmad Bin Ismail"}', CURRENT_TIMESTAMP - interval '45 minutes'),
('LEASE_CREATED', 'lease', '1e99c15e-fb7e-49b5-9f5e-18d3a1e948c3', '{"tenant_id": "c8a41df5-1b2c-48c5-9276-805bfa881b21", "room_id": "41d8e09f-683a-4ba4-9a8d-2d4e61394c25", "monthly_rent": 600.0}', CURRENT_TIMESTAMP - interval '30 minutes'),
('PAYMENT_LOGGED', 'room', '41d8e09f-683a-4ba4-9a8d-2d4e61394c25', '{"amount": 600, "method": "bank_transfer", "room_code": "1-A-1", "billing_month": "2026-06-01"}', CURRENT_TIMESTAMP - interval '15 minutes');
