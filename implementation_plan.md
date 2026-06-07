# Implementation Plan: Property & Room Rental Management System (PRMS) — V1

## Overview

A cloud-hosted, mobile-first web application to manage ~100 rental rooms across 5 properties in Tawau, Sabah. The system replaces paper/Excel tracking with a real-time, role-gated single source of truth accessible from both Tawau and Kuala Lumpur.

**Scale:** 5 properties × ~20 rooms = ~100 units  
**Users:** 4 internal family/staff accounts (Super Admin, Admin, 2 Operators)  
**Geography:** Sabah + Kuala Lumpur (multi-location, real-time sync required)

---

## Confirmed Design Decisions

| Topic | Decision |
|---|---|
| Overdue trigger | Room flips 🔴 immediately when due date arrives and no payment logged |
| Grace period | None |
| Partial payments | 🟠 Orange state — room stays partially-paid until full amount is cleared |
| Deposit deductions | Informational display only in V1 (no ledger deduction workflow) |
| Room code format | `[House]-[Floor Letter]-[Room Number]` e.g. `1-A-1`, `1-B-3` |
| Occupancy model | Multiple occupants per room, but treated as a single billing unit |
| Arrears display | Total outstanding (current + past months) shown in payment modal |
| Reports | In-app table + CSV export |
| Tech stack | Open — recommendation below |

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend Framework** | React 19 + Vite 6 | Fast builds, SPA routing, massive ecosystem |
| **UI Components** | Shadcn/ui + Radix primitives | Accessible, unstyled-base components, fully customizable |
| **Styling** | Tailwind CSS v4 | Utility-first, mobile-first, pairs perfectly with Shadcn |
| **State Management** | Zustand | Lightweight, no boilerplate, ideal for small team apps |
| **Backend / DB** | Supabase (PostgreSQL) | Auth + RLS + Realtime WebSockets + Edge Functions, all-in-one |
| **ORM / Query** | Supabase JS SDK v2 | Type-safe queries, direct RLS-aware client |
| **Auth** | Supabase Auth (email + password) | Persistent sessions, RLS integration, no extra service needed |
| **Realtime** | Supabase Realtime (WebSocket) | Native Postgres WAL broadcast, zero extra infra |
| **Hosting** | Vercel | Zero-config Vite deploy, global CDN, free tier |
| **Calendar** | Google Calendar API via Supabase Edge Function | Serverless trigger, no always-on server needed |
| **Type Safety** | TypeScript | Prevents runtime errors in financial data handling |

---

## Database Schema

### Table: `properties`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
name          text NOT NULL              -- e.g. "House 1", "House 2"
address       text NOT NULL
created_at    timestamptz DEFAULT now()
```

### Table: `rooms`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
property_id   uuid REFERENCES properties(id) ON DELETE CASCADE
code          text NOT NULL              -- e.g. "1-A-1", "2-B-3"
floor         text NOT NULL              -- e.g. "A", "B"
room_number   text NOT NULL              -- e.g. "1", "2"
base_rent     numeric(10,2) NOT NULL    -- e.g. 450.00
status        text NOT NULL DEFAULT 'vacant'
              -- CHECK status IN ('occupied','vacant','maintenance')
notes         text
created_at    timestamptz DEFAULT now()
UNIQUE(property_id, code)
```

### Table: `tenants`
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
full_name           text NOT NULL
nric_passport       text NOT NULL UNIQUE
phone               text NOT NULL       -- format: +601xxxxxxxx
emergency_name      text
emergency_relation  text
emergency_phone     text
notes               text
created_at          timestamptz DEFAULT now()
created_by          uuid REFERENCES auth.users(id)
```

### Table: `leases`
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
room_id             uuid REFERENCES rooms(id) ON DELETE RESTRICT
tenant_id           uuid REFERENCES tenants(id) ON DELETE RESTRICT
monthly_rent        numeric(10,2) NOT NULL   -- can differ from base_rent
due_day             int NOT NULL             -- 1-31
move_in_date        date NOT NULL
expiry_date         date NOT NULL
status              text NOT NULL DEFAULT 'active'
                    -- CHECK status IN ('active','expired','terminated')
security_deposit    numeric(10,2) DEFAULT 0
utility_deposit     numeric(10,2) DEFAULT 0
notes               text
created_at          timestamptz DEFAULT now()
created_by          uuid REFERENCES auth.users(id)
-- Only one active lease per room at a time (enforced via partial unique index)
```

### Table: `payment_history`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
lease_id        uuid REFERENCES leases(id) ON DELETE RESTRICT
room_id         uuid REFERENCES rooms(id)     -- denormalized for queries
tenant_id       uuid REFERENCES tenants(id)
amount          numeric(10,2) NOT NULL
payment_method  text NOT NULL    -- CHECK IN ('cash', 'bank_transfer')
reference       text                          -- bank ref, cheque no., etc.
billing_month   date NOT NULL                 -- e.g. 2026-06-01 (always day 1)
paid_at         timestamptz DEFAULT now()
recorded_by     uuid REFERENCES auth.users(id)
notes           text
```

### Table: `audit_log`
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id      uuid REFERENCES auth.users(id)
action       text NOT NULL    -- e.g. "PAYMENT_LOGGED", "TENANT_CREATED"
target_type  text             -- e.g. "room", "tenant", "lease"
target_id    uuid
metadata     jsonb            -- before/after snapshot for edits
created_at   timestamptz DEFAULT now()
```

### Table: `user_profiles`
```sql
id        uuid PRIMARY KEY REFERENCES auth.users(id)
full_name text NOT NULL
role      text NOT NULL   -- CHECK IN ('super_admin','admin','operator')
```

### Derived Logic (computed at query time, not stored)

**Room billing status** per billing cycle is derived as:
```
total_paid  = SUM(payments where billing_month = current_cycle)
monthly_rent = active lease monthly_rent

status →
  'vacant'      if no active lease
  'maintenance' if room.status = 'maintenance'
  'paid'        if total_paid >= monthly_rent
  'partial'     if 0 < total_paid < monthly_rent AND due_day has passed
  'overdue'     if total_paid = 0 AND due_day has passed
  'upcoming'    if due_day has NOT yet passed (pre-cycle, tenant exists)
```

### Row-Level Security (RLS) Policies

| Table | Operator | Admin | Super Admin |
|---|---|---|---|
| `properties` | SELECT | SELECT | ALL |
| `rooms` | SELECT | ALL | ALL |
| `tenants` | SELECT | ALL | ALL |
| `leases` | SELECT | ALL | ALL |
| `payment_history` | INSERT, SELECT | ALL | ALL |
| `audit_log` | — | SELECT | ALL |
| `user_profiles` | SELECT (own only) | SELECT | ALL |

---

## Application Routes & Pages

```
/login                          — Public (unauthenticated)
/dashboard                      — Role-based landing page
/properties                     — Property list (Admin+)
/properties/:id                 — Single property room matrix
/rooms/:id                      — Room detail (with payment modal)
/tenants                        — Tenant roster (Admin+)
/tenants/new                    — Onboard tenant (Admin+)
/tenants/:id                    — Tenant profile + lease history
/leases/new                     — Create lease (Admin+)
/leases/:id                     — Lease detail + edit (Admin+)
/reports                        — Monthly report + CSV export (Admin+)
/audit-log                      — Audit log viewer (Super Admin only)
/settings                       — User management (Super Admin only)
```

---

## V1 Feature Breakdown

### Feature 1 — Login System
- Email + password auth via Supabase Auth
- Persistent session (no daily re-login for Operators)
- Redirect to `/dashboard` on success; redirect unauthenticated to `/login`
- **Files:** `src/pages/LoginPage.tsx`, `src/lib/supabase.ts`, `src/contexts/AuthContext.tsx`

### Feature 2 — Role-Based Access Control
- `user_profiles.role` checked on session load → stored in Zustand
- React Router protected route wrapper `<RoleGate allowedRoles={[...]} />`
- Nav items rendered conditionally per role
- **Files:** `src/components/RoleGate.tsx`, `src/store/authStore.ts`

### Feature 3 — Property List
- Card grid of all 5 properties with name, address, total rooms, occupancy %
- Admin+ can add/edit properties
- Links into per-property Room Matrix
- **Files:** `src/pages/PropertiesPage.tsx`, `src/components/PropertyCard.tsx`

### Feature 4 — Room Matrix (Core UI)
- Per-property grid of room cards
- Color-coded: 🔴 Overdue | 🟢 Paid | 🟠 Partial | ⚪ Vacant | 🟡 Maintenance
- Real-time subscription via Supabase Realtime on `payment_history` + `rooms` tables
- Tap/click on card opens Payment Modal (Operator) or Room Detail (Admin)
- Mobile-first: responsive grid (2 col on mobile, 4-5 col on tablet/desktop)
- **Files:** `src/pages/PropertyRoomMatrixPage.tsx`, `src/components/RoomCard.tsx`, `src/hooks/useRoomStatus.ts`

### Feature 5 — Tenant Profile
- Full tenant record: legal name, NRIC/Passport, phone, emergency contacts
- Lists all leases (historical + active) linked to that tenant
- Admin+ can edit; Operator can view
- **Files:** `src/pages/TenantProfilePage.tsx`, `src/pages/TenantListPage.tsx`, `src/components/TenantForm.tsx`

### Feature 6 — Lease Record
- Bind Tenant → Room with all contract fields
- Shows: monthly rent, due day, move-in, expiry, security deposit, utility deposit
- Admin can terminate/expire a lease
- Lease status badge: Active | Expired | Terminated
- **Files:** `src/pages/LeaseDetailPage.tsx`, `src/pages/NewLeasePage.tsx`, `src/components/LeaseForm.tsx`

### Feature 7 — Payment Logging
- Modal triggered by clicking a room card
- Pre-filled: Room Code, Tenant Name, Monthly Rent, Outstanding Balance (current + arrears)
- Inputs: Payment Method toggle (Cash / Bank Transfer), Amount, Reference (optional)
- On submit: inserts into `payment_history`, refreshes room status via Realtime
- Audit log entry created automatically
- **Files:** `src/components/PaymentModal.tsx`, `src/hooks/usePayment.ts`

### Feature 8 — Status System (5 States)
- Status derived at query time from payment data (no status column in `payment_history`)
- Supabase view `room_billing_status_v` computes current state per room per billing month
- Frontend reads from this view for the Room Matrix
- **Files:** `supabase/migrations/001_room_status_view.sql`

### Feature 9 — WhatsApp Receipt Link
- After successful payment submission, a "Send WhatsApp Receipt" button appears
- Generates `https://wa.me/+601xxxxxxx?text=...` with URL-encoded message
- Template: *"Hi [Name], RM [Amount] payment received for Room [Code] for [Month Year]. Thank you! – Management"*
- Opens in new tab (mobile: launches WhatsApp directly)
- **Files:** `src/utils/whatsapp.ts`, integrated into `PaymentModal.tsx`

### Feature 10 — Monthly Outstanding Rent Report
- In-app table: all rooms, tenants, rent due, amount paid, balance outstanding, status
- Filter by: Property, Month/Year, Status (Overdue / Partial / Paid)
- Summary totals: Total Due, Total Collected, Total Outstanding
- CSV export using `papaparse` library
- **Files:** `src/pages/ReportsPage.tsx`, `src/utils/exportCsv.ts`

### Feature 11 — Basic Audit Log
- Logs written on: Payment logged, Tenant created/edited, Lease created/terminated, Room status changed
- Super Admin view: searchable/filterable table with actor, action, target, timestamp
- **Files:** `src/pages/AuditLogPage.tsx`, `src/lib/audit.ts`

### Feature 12 — Role-Based Dashboard
- **Operator view:** Room Matrix grid of ALL properties (quick overview) + payment shortcut
- **Admin view:** Metric cards (occupancy rate, monthly revenue, overdue count, upcoming expirations) + quick links
- **Super Admin view:** Admin view + user management panel + audit log shortcut
- **Files:** `src/pages/DashboardPage.tsx`, `src/components/dashboard/`

---

## Phased Build Order

### Phase 1 — Foundation (Week 1)
- [ ] Initialize Vite + React + TypeScript + Tailwind CSS + Shadcn/ui project
- [ ] Configure Supabase project (create tables, RLS policies, views)
- [ ] Implement auth flow: Login page, AuthContext, session persistence
- [ ] Set up React Router with protected routes and RoleGate
- [ ] Create global layout: Sidebar nav (role-aware), header, mobile bottom nav

### Phase 2 — Core Data (Week 2)
- [ ] Properties CRUD (list, create, edit)
- [ ] Rooms CRUD (list within property, create, edit, status management)
- [ ] Tenants CRUD (list, create, view profile)
- [ ] Leases CRUD (create, view, terminate)
- [ ] Seed initial data (5 properties, room codes skeleton)

### Phase 3 — Room Matrix + Realtime (Week 3)
- [ ] Build Room Matrix grid with color-coded cards
- [ ] Implement `room_billing_status_v` Supabase view
- [ ] Connect Supabase Realtime subscription to Room Matrix
- [ ] Build Payment Modal (pre-fill, submit, WhatsApp link)
- [ ] Write audit log helper and attach to all mutations

### Phase 4 — Reports + Dashboard (Week 4)
- [ ] Monthly Outstanding Report page with filters
- [ ] CSV export
- [ ] Role-based Dashboard (Operator / Admin / Super Admin views)
- [ ] Audit Log viewer page

### Phase 5 — Polish + Deploy (Week 5)
- [ ] Mobile UX pass (touch targets, bottom sheet modals on mobile)
- [ ] Error states, loading skeletons, empty states
- [ ] Google Calendar Edge Function (lease expiry + move-in/out events)
- [ ] Deploy to Vercel, configure environment variables
- [ ] End-to-end test with real family accounts

---

## Verification Plan

### Automated / CLI
- `npx tsc --noEmit` — TypeScript type check (zero errors before deploy)
- `npm run build` — production build must complete without errors
- Supabase CLI: run migration dry-run before applying to production

### Manual Verification (per feature)
1. **Auth:** Login/logout with each role; confirm redirects and session persistence
2. **RLS:** Confirm Operator cannot access `/tenants/new` or `/reports` routes; confirm API calls return 403 for unauthorized roles
3. **Room Matrix:** Log a payment on Device A → confirm card turns green on Device B within 3 seconds (Realtime test)
4. **Payment Modal:** Submit a partial payment → confirm 🟠 Orange state; submit remaining balance → confirm 🟢 Green
5. **WhatsApp:** Tap receipt link on mobile → confirm WhatsApp opens with correct pre-filled message
6. **Report:** Generate monthly report → confirm CSV downloads with correct totals
7. **Audit Log:** Perform actions as Admin → confirm entries appear in Super Admin audit log view

---

## Open Items (Resolved)

| # | Question | Answer |
|---|---|---|
| 1 | Grace period for overdue? | None — flips 🔴 on due date midnight |
| 2 | Deposit deductions? | Informational only in V1 |
| 3 | Room code format? | `[HouseNo]-[FloorLetter]-[RoomNo]` e.g. `1-A-1` |
| 4 | Multiple occupants? | Yes, but single billing unit per room |
| 5 | Partial payment state? | 🟠 Orange |
| 6 | Arrears display? | Inside payment modal as total outstanding |
| 7 | Reports format? | In-app table + CSV export |

## Deferred to V2

- Google Calendar API integration (planned but deferred to keep V1 focused)
- Tenant-facing portal or self-service payment confirmation
- PDF report export
- SMS/email notifications (beyond WhatsApp deep links)
- Advanced analytics (occupancy trends, revenue forecasting)
- Deposit deduction workflow
