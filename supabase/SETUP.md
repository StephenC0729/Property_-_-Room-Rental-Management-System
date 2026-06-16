# Supabase Setup Guide

## Step 1 — Create Your Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create a free account)
2. Click **"New project"**
3. Fill in:
   - **Name:** `prms` (or any name you prefer)
   - **Database Password:** Choose a strong password and **save it somewhere safe**
   - **Region:** `Southeast Asia (Singapore)` — closest to both Tawau and KL
4. Click **"Create new project"** and wait ~2 minutes for provisioning

---

## Step 2 — Get Your API Credentials

1. In your project dashboard, go to **Settings → API**
2. Copy the following two values:

| Field | Where to find it |
|---|---|
| **Project URL** | Under "Project URL" — looks like `https://xxxx.supabase.co` |
| **Anon / Public Key** | Under "Project API keys" → `anon` `public` |

3. Open `.env.local` in this project and paste them in:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> ⚠️ Never share `.env.local` or commit it to GitHub. It is already in `.gitignore`.

---

## Step 3 — Run the Database Migrations

Go to your Supabase project → **SQL Editor** → click **"New query"**.

Run the three migration files **in order**, one at a time:

### Migration 1: Core Schema
Copy and paste the full contents of:
```
supabase/migrations/001_schema.sql
```
Click **Run**. You should see: `Success. No rows returned.`

### Migration 2: RLS Policies
Copy and paste the full contents of:
```
supabase/migrations/002_rls_policies.sql
```
Click **Run**.

### Migration 3: Views, Triggers & Functions
Copy and paste the full contents of:
```
supabase/migrations/003_views_and_functions.sql
```
Click **Run**.

---

## Step 4 — Create Your First User Account (Super Admin)

Supabase Auth doesn't automatically create a `user_profiles` record — you need to do this manually for the first account.

1. In Supabase, go to **Authentication → Users → Add user**
2. Fill in your email and password
3. Copy the **User UID** shown (it's a UUID like `abc123...`)
4. Go back to **SQL Editor** and run:

```sql
INSERT INTO public.user_profiles (id, full_name, role)
VALUES (
  'PASTE-YOUR-UID-HERE',   -- replace this
  'Your Name',
  'super_admin'
);
```

Repeat for each family member, using their role:

```sql
-- Admin (Cousin)
INSERT INTO public.user_profiles (id, full_name, role)
VALUES ('COUSIN-UID', 'Cousin Name', 'admin');

-- Operator (Dad)
INSERT INTO public.user_profiles (id, full_name, role)
VALUES ('DAD-UID', 'Dad Name', 'operator');

-- Operator (Mom)
INSERT INTO public.user_profiles (id, full_name, role)
VALUES ('MOM-UID', 'Mom Name', 'operator');
```

---

## Step 5 — Enable Realtime on Required Tables

The Room Matrix requires live updates. Enable Realtime on these tables:

1. Go to **Database → Replication** (or **Database → Tables**)
2. Click **"Supabase Realtime"** toggle for:
   - ✅ `payment_history`
   - ✅ `rooms`

---

## Step 6 — Verify Everything Works

Run this test query in the SQL Editor to confirm the billing view is set up:

```sql
SELECT * FROM public.room_billing_status_v LIMIT 5;
```

It will return empty rows for now (no rooms seeded yet), but it should run **without errors**.

Then start the dev server:

```bash
npm run dev
```

Navigate to `http://localhost:5173` — you should be redirected to `/login`. 
Try logging in with your Super Admin credentials.

---

## Step 7 — Deploy the Remove Team Member Edge Function

Removing Admin or Operator accounts from **Settings** requires a Supabase Edge Function
(`remove-team-member`). It deletes the Auth user server-side; the `user_profiles` row
is removed automatically via `ON DELETE CASCADE`.

Super Admin accounts **cannot** be removed from the app — delete those manually in
**Authentication → Users** if needed.

### Option A — Supabase CLI (recommended)

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) if you have not already
2. Log in and link your project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

3. Deploy the function:

```bash
supabase functions deploy remove-team-member
```

JWT verification is enabled in `supabase/config.toml` — only authenticated callers
can invoke the function; the function itself checks that the caller is a Super Admin.

### Option B — Supabase Dashboard

1. Go to **Edge Functions → Create a new function**
2. Name it `remove-team-member`
3. Paste the contents of `supabase/functions/remove-team-member/index.ts`
4. Deploy

### Verify deployment

From the Supabase dashboard, open **Edge Functions** and confirm `remove-team-member`
is listed and active. Removing an Admin or Operator from **Settings → Team Members**
should delete them from **Authentication → Users** as well.

---

## What Was Created

| Object | Type | Purpose |
|---|---|---|
| `user_profiles` | Table | Stores name + role for each auth user |
| `properties` | Table | The 5 houses |
| `rooms` | Table | ~100 individual rental units |
| `tenants` | Table | Tenant personal records |
| `leases` | Table | Binding between tenant ↔ room |
| `payment_history` | Table | Immutable payment ledger |
| `audit_log` | Table | Who did what and when |
| `get_my_role()` | Function | Fast role lookup used by RLS policies |
| `room_billing_status_v` | View | Live billing status per room (drives the Room Matrix) |
| `sync_room_status_on_lease_change` | Trigger | Auto-flips room to occupied/vacant when lease changes |
| `get_monthly_report()` | Function | Powers the Reports page for any given month |
| `remove-team-member` | Edge Function | Deletes Admin/Operator Auth accounts from Settings (Super Admin only) |
