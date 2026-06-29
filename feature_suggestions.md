# PRMS — Feature Suggestions

Feature ideas organized by impact on the core rent-collection workflow. This is an internal tool for a small family team managing ~100 rooms, so scope and simplicity matter — not every suggestion needs to be built.

---

## 🟢 High Value — Reinforce the Core Workflow

### 1. Automated Overdue Reminders (WhatsApp)
The app already generates WhatsApp receipt links. Extend this to outbound reminders: a one-tap **"Send Reminder"** button on overdue/partial rooms that opens a pre-filled WhatsApp message (tenant name, room code, outstanding amount, due date). Optionally, generate a daily digest message for admins summarizing all overdue rooms across all properties.

**Why:** This is the single biggest lever for actually collecting rent faster. The infrastructure (WhatsApp utils, billing status) is already in place.

---

### 2. Partial Payment Follow-Up (Promise-to-Pay)
The billing status already has a `partial` state. Add the ability to record a **promise-to-pay date** and an **expected remaining amount** on a partial payment. The room matrix and report could then surface "promised" rooms differently from "just partial".

**Why:** Right now a partial payment shows as orange and nothing happens next. A follow-up date gives operators a concrete action item.

---

### 3. Dashboard Collection Trend Charts
A month-over-month bar or line chart of total collected vs. outstanding rent. The data already exists in `payment_history` — it just needs aggregating. Gives the Super Admin a quick portfolio health read without exporting a CSV every month.

**Why:** Zero new data required. Pure visualization of existing data.

---

### 4. Receipt Generation (PDF / Print View)
Beyond the WhatsApp link, generate a proper printable receipt with property name, room code, tenant name, amount paid, utilities, payment date, and reference number. Could be a simple browser print stylesheet or a PDF via a library like `jsPDF`.

**Why:** Tenants occasionally want documentation; useful for the team's own records and any audit queries.

---

## 🟡 Medium Value — Fill Lifecycle Gaps

### 5. Lease Renewal Flow
Currently leases expire or are terminated with no built-in renewal path. Add a **"Renew Lease"** action on active/expiring leases that pre-fills a new lease form with the same room, tenant, and rent — just new dates. Optionally flag leases expiring within 30 days with a warning badge.

**Why:** Renewal is one of the most frequent admin operations; re-entering everything from scratch is error-prone.

---

### 6. Deposit Tracking & Move-Out Settlement
The `Lease` type already stores `security_deposit` and `utility_deposit`, but there is no move-out flow. Add a **move-out settlement screen** that lets an admin record deductions (unpaid rent, damages) and calculate the refund amount, with an audit log entry.

**Why:** The data model is half there. Without a settlement record, the team tracks deposit refunds manually outside the system.

---

### 7. Document / Photo Attachments
Attach tenant ID scans, signed lease PDFs, and room condition photos via Supabase Storage. Surface them on `TenantProfilePage` and `LeaseDetailPage`. The NRIC/passport and emergency-contact fields already exist — documents are the natural complement.

**Why:** Eliminates the need for a separate folder or WhatsApp thread to store tenant documents.

---

### 8. Tenant Ledger / Account Statement
A per-tenant timeline of all payments, outstanding balances, and lease history across all their leases. `TenantProfilePage` already shows leases — adding a full payment ledger makes it a true account statement that can be exported or shared.

**Why:** Useful when a tenant disputes a balance or requests a statement.

---

## 🔵 Nice-to-Have — Convenience & Polish

### 9. Bulk / Batch Payment Entry
For operators collecting from many rooms on the same rent day, a batch-entry mode that lets them log multiple payments in one session without reopening the modal for each room.

**Why:** On busy collection days, repeating the modal 20 times is tedious. High frequency, low-hanging UX win.

---

### 10. Expense Tracking → Net Income Report
Track maintenance and repair expenses per property alongside rent income. The Reports page could then show *net profit* per property, not just collections.

**Why:** Gives the owner a true P&L view rather than just a receivables report.

---

### 11. Global Search / Command Palette
A keyboard-accessible global search (e.g., `Cmd/Ctrl + K`) to jump directly to a room, tenant, or lease by name/code. With ~100 rooms and growing tenant history, navigation-by-search is faster than drilling through menus.

**Why:** Pure UX speed improvement; no new data or backend work required.

---

### 12. Expected vs. Collected Reconciliation
Automatically show the *expected* rent total for a billing month (sum of all active lease `monthly_rent`) alongside the *collected* total. The billing status view nearly computes this already — surfacing the gap as a headline figure makes the shortfall immediately obvious without manually subtracting.

**Why:** Turns the report from "what was paid" to "what was missed and by how much."

---

## Implementation Notes

- **Follow the existing three-layer pattern** for any write operations: role gate (`RoleGate`), audit log (`logAudit`), and Supabase RLS policy. Every existing feature does this — new ones should too.
- **Scope creep risk.** This is a focused internal tool. Features 1–4 reinforce the core; 5–8 are natural extensions of what already exists; 9–12 are conveniences. Prioritize by how often the team actually hits the gap.
- **Realtime.** Any new tables that need live updates (e.g., expense entries, follow-up dates) should have Realtime enabled in Supabase and be wired into `useRealtimeSubscription`.
