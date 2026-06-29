# PRMS — Codebase Audit

## Overall Assessment

The project is in **excellent shape** — clean architecture, well-organized file structure, consistent design language, solid use of React Query + Supabase, and proper role-based access enforcement at both the UI and DB level. The patterns are professional and maintainable.

---

## 🟠 Medium Priority — Correctness & Robustness

### 1. Historical report includes terminated/expired leases with no expiry date
**File:** [`ReportsPage.tsx`](src/pages/ReportsPage.tsx) — `useHistoricalReport`

The historical report fetches **all** leases from the database and filters them client-side using `isLeaseActiveInBillingMonth()`. That function checks `move_in_date` / `expiry_date` / `created_at`, but it does **not** check `lease.status`. A lease terminated mid-month with no `expiry_date` set (or an `expiry_date` after the billing month) will still appear in old reports as "overdue", inflating the outstanding balance shown for that period.

**Fix:** Add `.in('status', ['active', 'expired', 'terminated'])` with a status-aware date filter, or preferably filter out leases where `status = 'terminated'` and `expiry_date` falls before the billing month start.

---

### 2. Current-month supplement utility breakdown is keyed by `room_id`; historical is keyed by `lease_id`
**File:** [`ReportsPage.tsx`](src/pages/ReportsPage.tsx) — `useCurrentMonthSupplement`

If a room had a tenant changeover mid-month (old lease ended, new lease started), the current-month supplement aggregates both tenants' utility payments together under the same `room_id`. The historical path avoids this by keying on `lease_id`. The mismatch means a changeover month could attribute the wrong utility amounts to the wrong tenant in the current-month view.

**Fix:** Key the supplement breakdown by `lease_id` instead of `room_id`, and join it against the current-month report data using the `lease_id` field already present in `RoomBillingStatus`.

---

### 3. `useRealtimeSubscription` has a minor stale closure risk on subscription count changes
**File:** [`useRealtimeSubscription.ts`](src/hooks/useRealtimeSubscription.ts)

The channel setup effect depends on `channelName` and `configKey` (a JSON-serialized representation of the subscription configs). This correctly handles config changes. However, if the **number** of subscriptions changes without any config value changing (an edge case with dynamic subscription lists), the channel won't be recreated and the index-based `callbacksRef.current[index]` lookup could mis-route events. Currently low risk given fixed subscription counts in usage.

**Fix:** Include `subscriptions.length` in the `configKey` (or the effect dependency array) as a guard.

---

## 🟡 Low Priority — UX & Feature Gaps

### 4. `<select>` dropdown options have hardcoded dark background color
**Files:** [`ReportsPage.tsx`](src/pages/ReportsPage.tsx), [`AuditLogPage.tsx`](src/pages/AuditLogPage.tsx)

```tsx
<option value="all" className="bg-[#1a1a2e]">All Properties</option>
```

The `bg-[#1a1a2e]` literal is a hardcoded dark color. In light mode, the native `<option>` elements will render with a dark background that clashes with the light theme. The rest of the app correctly uses theme tokens (`bg-card`, `text-foreground`, etc.).

**Fix:** Remove the hardcoded `className` from `<option>` elements — native browser styling handles option backgrounds correctly. Replace the raw `<select>` with a Radix `<Select>` component (already available in the project under `src/components/ui/select.tsx`) which renders a fully themed custom dropdown.

---

### 5. Operator dashboard is sparse — no contextual guidance for operators
**File:** [`DashboardPage.tsx`](src/pages/DashboardPage.tsx)

Operators see property cards with "View rooms" links, which work fine. But there is no indication of what they can or cannot do (e.g., that they cannot access Tenants or Leases). A new operator may try to find those sections and be confused by the lack of nav items.

**Fix:** Add a brief onboarding note or role description card to the operator dashboard view explaining their scope (e.g., "Log rent payments from the room matrix").

---

## 🔵 Infrastructure & Quality

### 6. No automated tests
**Scope:** Entire project

There is no test runner (Vitest, Jest, etc.) in `package.json`. The billing-status logic (`isLeaseActiveInBillingMonth`, `paymentUtils`, `billingMonth`, `roomUtils`) is pure TypeScript and high-value — exactly the kind of code where a mistake causes silent revenue miscalculation.

**Fix:** Add Vitest + React Testing Library. Start with unit tests for the pure utility functions (`src/utils/`) and integration tests for the React Query hooks. A small suite covering edge cases (null dates, tenant changeover, partial payments) would give high confidence.

---

### 7. No CI pipeline
**Scope:** Repository root

There is no GitHub Actions (or equivalent) configuration. A type error or lint regression introduced in a PR would only be caught if someone runs `npm run build` locally.

**Fix:** Add a `.github/workflows/ci.yml` that runs `npm run build` and `npm run lint` on every push and pull request. This is a one-time ~15-line file and eliminates an entire class of preventable breakage.

---

## 🔵 Security — Verify

### 8. Confirm RLS is enabled on all tables
**Scope:** Supabase dashboard

The anon key is intentionally public in a Supabase project — this is by design. But it means any unauthenticated user who knows the project URL could query tables without RLS. In particular, `user_profiles` (which contains team names and roles) should have RLS that restricts reads to authenticated users only.

**Action:** In the Supabase dashboard under **Table Editor**, confirm Row Level Security is toggled **on** for every table: `user_profiles`, `properties`, `rooms`, `tenants`, `leases`, `payment_history`, `audit_log`.

---

## ✅ Previously Fixed Issues

The following were flagged in an earlier audit and have since been resolved:

| # | Issue | Resolution |
|---|-------|------------|
| — | Stale auth role from `localStorage` before session resolved | `authStore` no longer persists `profile`/`role`; `isInitialized` flag added |
| — | Wrong audit action used for user management events | `USER_ROLE_CHANGED` and `USER_REMOVED` now used correctly in `SettingsPage` and `AuditLogPage` |
| — | Historical report silently excluded leases with null dates | `isLeaseActiveInBillingMonth()` added with `created_at` fallback |
| — | Stale `room_id` in form after property filter change | `handlePropertyChange()` in `RoomPicker` calls `onChange('')` to clear the selection |
| — | Duplicated `useProperties` / `usePropertyRoomStats` hooks | Extracted to `src/hooks/useProperties.ts` and `src/hooks/usePropertyRoomStats.ts` |
| — | `any` type for `modalData` in `uiStore` | Replaced with a fully typed discriminated union (`ModalDataMap` / `ModalSlice`) |
| — | `STATUS_BADGE` config defined inline per render | Extracted to `src/utils/leaseStatusConfig.ts` shared utility |
| — | `NotFoundPage` was an unstyled stub | Now a fully designed page with "Go to Dashboard" button |
| — | `MONTH_OPTIONS` stale after midnight | `useBillingMonthOptions` wraps in `useMemo` keyed on `currentMonthKey` |
| — | Super Admin routes (Audit Log, Settings) hidden on mobile nav | `MobileBottomNav` now has a "More" overflow sheet for items beyond the 4-tab limit |
| — | Audit Log hard-capped at 50 entries with no pagination | Full prev/next pagination implemented using Supabase `.range()` |
| — | Tenant `notes` field rendered as single-line `<Input>` | Updated to `<Textarea rows={3} />` |
| — | Property address truncated with no way to see full text | Now uses `<TruncatedText>` component (shows full value in tooltip) |
| — | `navigate(-1)` breaks on direct URL entry | `useSmartBack(fallbackPath)` hook checks `location.key === 'default'` before falling back |
| — | Removing a team member left the Supabase Auth user intact | Now goes through the `remove-team-member` Edge Function which deletes the Auth user server-side |
