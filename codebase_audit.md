# PRMS — Full Codebase Audit

## Overall Assessment

The project is in **good shape** — clean architecture, well-organized file structure, consistent design language, and solid use of React Query + Supabase. The patterns are professional and maintainable. Below are specific issues and improvements organized from most impactful to least.

---

## 🔴 High Priority — Bugs & Correctness Issues

### 1. Auth state is persisted in localStorage via Zustand, but never re-validated on load
**File:** [`authStore.ts`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/store/authStore.ts)

The `profile` and `role` are persisted across sessions via `zustand/persist`. When the app loads, it renders immediately with the stale localStorage role **before** `supabase.auth.getSession()` resolves. This means:
- A revoked or deleted user can still see their old role for a brief moment (or if auth fails silently).
- `isLoading: true` is the initial state but the `profile` from localStorage is already populated — so any `isLoading` check doesn't hide role-gated UI.

**Fix:** Don't persist `profile`/`role`. Instead, always derive the session from Supabase on mount, and show a full-screen loading state until the session check completes.

---

### 2. `logAudit` in Settings uses the wrong action enum for user actions
**File:** [`SettingsPage.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/pages/SettingsPage.tsx#L84)

```typescript
// Line 84
action: 'TENANT_UPDATED', // closest existing action; ideally USER_REMOVED
```

And on line 145, role changes also use `'TENANT_UPDATED'`. User management operations are being logged as tenant updates — the Audit Log UI will display these as "Tenant Updated" events, which is misleading for Super Admins reviewing the log.

**Fix:** Add `USER_ROLE_CHANGED` and `USER_REMOVED` to the `AuditAction` type and the `ACTION_CONFIG` in `AuditLogPage.tsx`.

---

### 3. Historical report query is too narrow — filters on both `move_in_date` and `expiry_date`
**File:** [`ReportsPage.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/pages/ReportsPage.tsx#L100)

```typescript
.lte('move_in_date', billingMonth)
.gte('expiry_date',  billingMonth)
```

This silently excludes leases where either date is `null` (optional fields). A tenant with no move-in or no expiry date will never appear in historical reports. This could result in **missing revenue data** in the report.

**Fix:** Use an OR filter: include leases that were active during the billing month regardless of whether those dates are set, or add a fallback using the lease `created_at`.

---

### 4. `RoomPicker` may show a stale selected room after property filter changes
**File:** [`NewLeasePage.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/pages/NewLeasePage.tsx#L149)

When the user selects a room, then changes the property filter, the selected `room_id` remains in the form but the `rooms` list refetches. If the selected room is no longer in `rooms`, `selectedRoom` is `undefined` and the picker silently shows the empty state — but the form still holds the old `room_id` value. The user may submit a lease for a room they can't see.

**Fix:** When `propertyId` changes in `RoomPicker`, call `onChange('')` to clear the selection.

---

### 5. `useRealtimeSubscription` has a stale closure bug
**File:** [`useRealtimeSubscription.ts`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/hooks/useRealtimeSubscription.ts#L23)

```typescript
useEffect(() => {
  callbacksRef.current = subscriptions.map(s => s.callback)
}) // ← No dependency array — runs after every render
```

The `callbacksRef` is updated every render, which is intentional. But the channel setup effect only depends on `channelName`. If the number of subscriptions changes (e.g., additional subscriptions are conditionally added), the channel won't be re-created. This is a subtle correctness issue but low risk given current usage.

---

## 🟠 Medium Priority — Code Quality & Maintainability

### 6. Duplicated `useProperties` hook across multiple pages
**Files:** `DashboardPage.tsx`, `PropertiesPage.tsx`, `NewLeasePage.tsx`, `ReportsPage.tsx`

All four files define their own `useProperties()` function with identical query keys and query functions. Same for `usePropertyRoomStats` (Dashboard + PropertiesPage).

**Fix:** Extract shared hooks to `src/hooks/useProperties.ts`, `usePropertyRoomStats.ts` etc. This removes ~80 lines of duplication and ensures consistent query keys.

---

### 7. `uiStore.ts` uses `any` for `modalData`
**File:** [`uiStore.ts`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/store/uiStore.ts#L16)

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
modalData: any
```

This is suppressed with `eslint-disable`, but it means modal consumers have to cast the data themselves (e.g., `modalData as Property` in PropertiesPage). This is type-unsafe.

**Fix:** Use a discriminated union per modal type:
```typescript
type ModalState =
  | { type: 'edit-room'; data: Room }
  | { type: 'payment'; data: RoomBillingStatus }
  | { type: null; data: null }
  // etc.
```

---

### 8. `STATUS_BADGE` config is defined locally inside `LeaseDetailPage` on every render
**File:** [`LeaseDetailPage.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/pages/LeaseDetailPage.tsx#L36)

And `statusBadge` in `TenantProfilePage.tsx` line 202. Both inline objects that never change. They should be module-level constants.

---

### 9. `NotFoundPage` is a near-empty stub
**File:** [`NotFoundPage.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/pages/NotFoundPage.tsx)

Currently 94 bytes — almost certainly just a `<p>404</p>`. When users hit a broken URL, they get a jarring, unstyled page with no navigation.

**Fix:** Give it a proper design with a "Go to Dashboard" button, matching the app's theme.

---

### 10. `MONTH_OPTIONS` constant is rebuilt every module evaluation
**File:** [`ReportsPage.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/pages/ReportsPage.tsx#L48)

```typescript
const MONTH_OPTIONS = buildMonthOptions() // Called once at module load time
```

This is actually fine for correctness, but means it's computed once when the module is first loaded. If the app runs past midnight into a new month, `MONTH_OPTIONS` is stale until a hard refresh. Low risk, but worth noting.

**Fix:** Move it inside `useMemo()` within the component.

---

## 🟡 Low Priority — UX & Feature Gaps

### 11. No mobile navigation for Super Admin routes (Audit Log, Settings)
**File:** [`AppLayout.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/components/layout/AppLayout.tsx#L147)

```typescript
{visibleItems.slice(0, 5).map(...)} // ← Only first 5 items shown in mobile nav
```

Super Admin has 7 nav items (Dashboard, Properties, Tenants, Leases, Reports, Audit Log, Settings). The mobile bottom nav only shows the first 5, so **Audit Log and Settings are invisible on mobile for Super Admins**. They'd have to navigate via direct URL.

**Fix:** Add a "More" button or a mobile drawer/sheet for the overflow items.

---

### 12. Audit Log is hard-capped at 50 entries with no pagination
**File:** [`AuditLogPage.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/pages/AuditLogPage.tsx#L93)

```typescript
const PAGE_SIZE = 50
```

There's a notice at the bottom saying "use date range to narrow results", but no actual pagination. Busy systems with many operations will hit this limit constantly.

**Fix:** Add "Load more" (cursor-based pagination) or proper page controls using Supabase's `.range()`.

---

### 13. `TenantProfilePage` shows "Notes" field as `<Input>` (single line) but `NewTenantPage` likely has a `<Textarea>`
**File:** [`TenantProfilePage.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/pages/TenantProfilePage.tsx#L175)

The edit form renders notes as `<Input>` (single-line), while notes are likely multi-line text for tenants. This truncates the content.

---

### 14. Property address is truncated in `PropertyCard` with no way to see full text
**File:** [`PropertiesPage.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/pages/PropertiesPage.tsx#L209)

```tsx
<p className="text-xs text-muted-foreground/70 mt-0.5 max-w-[200px] truncate">
  {property.address}
</p>
```

Long addresses are silently cut off with no tooltip or expand affordance. This is inconvenient for users needing to verify the address.

**Fix:** Add a `title={property.address}` tooltip, or use the `Tooltip` component already available in the project.

---

### 15. Operator role sees a "Room Matrix" button on Dashboard but cannot access Tenants/Leases — no guidance
**File:** [`DashboardPage.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/pages/DashboardPage.tsx#L459)

```tsx
{(role === 'admin' || role === 'super_admin') && (
  <Button asChild ...> Room Matrix </Button>
)}
```

The button is correctly gated. But the `OperatorDashboard` (visible to operators) shows property cards with "View rooms →" links — these work fine. The Operator experience is functional, just slightly sparse. Consider adding a "Contact admin" or help note for operators.

---

### 16. `LeaseDetailPage` back button uses `navigate(-1)` (browser history), not a fixed route
**Files:** `LeaseDetailPage.tsx`, `NewLeasePage.tsx`, `TenantProfilePage.tsx`

Using `navigate(-1)` is problematic if a user navigated directly to the URL (e.g., from a bookmark or shared link) — clicking "Back" would take them out of the app entirely.

**Fix:** Use a `Link` component pointing to the parent route (e.g., `/leases`, `/tenants`), with `navigate(-1)` as a fallback only.

---

## 🔵 Security & Infrastructure Observations

### 17. Supabase anon key is in the frontend (expected, but document it)
This is by design with Supabase — the anon key is safe to expose. But make sure Row Level Security (RLS) is enabled on **all** tables, especially `user_profiles` (a malicious user with the anon key could query or modify other profiles without RLS).

### 18. Password change uses client-side validation only
**File:** [`SettingsPage.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/pages/SettingsPage.tsx#L244)

```typescript
const { error } = await supabase.auth.updateUser({ password: new_password })
```

This is correct — Supabase enforces password strength server-side. No action needed.

### 19. `user_profiles` can be deleted by Super Admin without deleting the Supabase Auth user
**File:** [`SettingsPage.tsx`](file:///Users/stephen/GitHub/Property_&_ Room Rental Management System/src/pages/SettingsPage.tsx#L81)

The warning is shown in the UI. Consider making this a two-step process or blocking it entirely in favor of a Supabase-level workflow. This is a UX/ops risk, not a security bug per se.

---

## 📋 Summary Table

| # | Category | Severity | File | Issue |
|---|----------|----------|------|-------|
| 1 | Bug | 🔴 High | `authStore.ts` | Stale role from localStorage before session resolved |
| 2 | Bug | 🔴 High | `SettingsPage.tsx` | Wrong audit action used for user management events |
| 3 | Bug | 🔴 High | `ReportsPage.tsx` | Historical report silently excludes leases with null dates |
| 4 | Bug | 🟠 Medium | `NewLeasePage.tsx` | Stale `room_id` in form after property filter change |
| 5 | Bug | 🟠 Medium | `useRealtimeSubscription.ts` | Stale closure on subscription count changes |
| 6 | DX | 🟠 Medium | Multiple pages | Duplicated `useProperties` and `usePropertyRoomStats` hooks |
| 7 | Type Safety | 🟠 Medium | `uiStore.ts` | `any` type for `modalData` |
| 8 | Quality | 🟡 Low | `LeaseDetailPage.tsx` | `STATUS_BADGE` defined inline every render |
| 9 | UX | 🟡 Low | `NotFoundPage.tsx` | 404 page is unstyled stub |
| 10 | Quality | 🟡 Low | `ReportsPage.tsx` | `MONTH_OPTIONS` stale after midnight |
| 11 | UX | 🟡 Low | `AppLayout.tsx` | Super Admin routes hidden on mobile nav |
| 12 | UX | 🟡 Low | `AuditLogPage.tsx` | Hard 50-item cap, no pagination |
| 13 | UX | 🟡 Low | `TenantProfilePage.tsx` | Notes uses single-line `<Input>` |
| 14 | UX | 🟡 Low | `PropertiesPage.tsx` | Address truncated with no tooltip |
| 15 | UX | 🟡 Low | `DashboardPage.tsx` | Operator dashboard lacks contextual guidance |
| 16 | UX | 🟡 Low | Multiple pages | `navigate(-1)` breaks on direct URL access |
| 17 | Security | 🔵 Info | Supabase | Confirm RLS enabled on all tables |
| 18 | Security | ✅ OK | `SettingsPage.tsx` | Password change is server-validated |
| 19 | Ops | 🔵 Info | `SettingsPage.tsx` | Profile delete doesn't remove Auth user |
