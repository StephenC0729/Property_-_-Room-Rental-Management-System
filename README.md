# Property & Room Rental Management System (PRMS)

A mobile-first web application for managing rental properties, rooms, tenants, leases, and monthly rent collection. Built for a small internal team managing ~100 rooms across multiple properties in Tawau, Sabah, with real-time sync between Tawau and Kuala Lumpur.

## Features

- **Room matrix** — color-coded grid per property (`paid`, `overdue`, `partial`, `vacant`, `maintenance`, `upcoming`)
- **Payment logging** — record rent and utility bills (water, electricity, aircond) with WhatsApp receipt links
- **Tenant & lease management** — onboard tenants, create leases, terminate or auto-expire overdue leases
- **Monthly reports** — filterable outstanding rent report with CSV export
- **Role-based access** — Operator, Admin, and Super Admin with route and RLS enforcement
- **Audit log** — tracks payments, tenant/lease changes, and user management actions
- **Realtime updates** — room matrix refreshes live when payments are logged on another device

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| UI | Shadcn/ui, Radix, Tailwind CSS v4 |
| Data fetching | TanStack React Query |
| Client state | Zustand |
| Backend | Supabase (PostgreSQL, Auth, RLS, Realtime) |
| Forms | React Hook Form + Zod |
| Routing | React Router v7 |

## Roles

| Role | Access |
|---|---|
| **Operator** | Dashboard, properties, room matrix, log payments |
| **Admin** | + tenants, leases, reports |
| **Super Admin** | + audit log, team/user settings |

## Prerequisites

- Node.js 18+
- npm
- A [Supabase](https://supabase.com) project (see [supabase/SETUP.md](supabase/SETUP.md))

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Find these values in your Supabase project under **Settings → API**.

### 3. Set up the database

Follow the full guide in **[supabase/SETUP.md](supabase/SETUP.md)** to:

1. Create your Supabase project
2. Run database migrations (in order)
3. Create user accounts and assign roles
4. Enable Realtime on `payment_history` and `rooms`
5. Deploy the `remove-team-member` edge function

Migrations live in `supabase/migrations/` and must be applied in numeric order:

```
001_schema.sql
002_rls_policies.sql
003_views_and_functions.sql
005_remove_floor_column.sql
006_make_tenant_fields_optional.sql
007_make_lease_dates_optional.sql
008_add_payment_date.sql
009_add_foreign_key_indexes.sql
010_add_collection_totals_to_billing_view.sql
011_restore_upcoming_billing_status.sql
012_secure_audit_log_insert.sql
013_utilities_count_in_partial_status.sql
014_fix_get_monthly_report_no_floor.sql
015_expire_overdue_leases.sql
```

> **Note:** There is no `004` migration — numbering jumps from `003` to `005`. Do not rewrite or squash applied migrations on an existing database; add new files (e.g. `016_*.sql`) for future schema changes.

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Unauthenticated users are redirected to `/login`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |

## Project Structure

```
src/
  pages/           Route-level screens (dashboard, properties, tenants, leases, reports, …)
  components/      UI primitives (shadcn), layout, domain components (rooms, leases, payments)
  hooks/           React Query hooks (room matrix, properties, payments, …)
  lib/             Supabase client, auth, audit logging, lease helpers
  schemas/         Zod validation schemas
  store/           Zustand stores (auth, UI modals)
  utils/           Billing, WhatsApp receipts, CSV export, status config
  types/           Shared TypeScript types

supabase/
  migrations/      Incremental SQL migrations (apply in order)
  functions/       Edge functions (e.g. remove-team-member)
  SETUP.md         Step-by-step Supabase setup guide
```

## Routes

| Path | Access | Description |
|---|---|---|
| `/login` | Public | Email + password sign-in |
| `/dashboard` | All roles | Role-based landing page |
| `/properties` | All roles | Property list |
| `/properties/:id` | All roles | Room matrix for a property |
| `/tenants` | Admin+ | Tenant roster |
| `/tenants/new` | Admin+ | Onboard a tenant |
| `/tenants/:id` | Admin+ | Tenant profile |
| `/leases` | Admin+ | Lease list |
| `/leases/new` | Admin+ | Create a lease |
| `/leases/:id` | Admin+ | Lease detail |
| `/reports` | Admin+ | Monthly outstanding rent report |
| `/audit-log` | Super Admin | Audit trail |
| `/settings` | Super Admin | Team management |

## Billing Status Logic

Room billing status is computed at query time (via the `room_billing_status_v` view), not stored on the room:

1. **Maintenance** — room marked offline
2. **Vacant** — no active lease
3. **Paid** — rent fully collected for the current billing month
4. **Partial** — some rent or utility payment recorded, but rent not fully paid
5. **Overdue** — nothing paid and the lease due day has passed
6. **Upcoming** — nothing paid, but the due day has not yet arrived

There is no grace period — a room flips to overdue on the due date if rent is unpaid.

## Further Reading

- [supabase/SETUP.md](supabase/SETUP.md) — Supabase project setup, migrations, Realtime, edge functions
- [implementation_plan.md](implementation_plan.md) — V1 design decisions, schema reference, and feature breakdown

## Deployment

The frontend is designed to deploy to [Vercel](https://vercel.com) (or any static host). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in your hosting provider.

Before deploying, verify the build succeeds:

```bash
npm run build
```
