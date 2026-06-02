# Architecture Gap Analysis — Intended vs Actual

**Date:** 2026-04-14 (audit) · **Resolved:** 2026-05-18

## Methodology
Compared actual codebase implementation against module interface contracts and standard ERP workflows.

---

## Resolution Summary (2026-05-18)

All 8 gaps closed. Code fixes in `modules/`, SQL constraints in
`supabase/migrations/20260518_gap_fixes_constraints.sql`.

| GAP | Status | File(s) |
|-----|--------|---------|
| GAP-01 | ✅ Resolved | `modules/sales/companies/gtk/useGTKQuotation.ts` |
| GAP-02 | ✅ Resolved | `modules/production/services/productionService.ts` |
| GAP-03 | ✅ Resolved | `modules/finance/services/periodService.ts`, `modules/finance/pages/PeriodManager.tsx` |
| GAP-04 | ✅ Resolved | `modules/finance/services/financeService.ts` (settleAdvance) |
| GAP-05 | ✅ Resolved | `modules/production/services/ncrService.ts` + migration UNIQUE index |
| GAP-06 | ✅ Resolved | Already wired in `App.tsx` (start/stop) and `realtimeQueryBridge.ts` — stale gap |
| GAP-07 | ✅ Resolved | `modules/sales/services/creditNoteService.ts`, `modules/finance/components/CreditNoteModule.tsx` |
| GAP-08 | ✅ Resolved | `modules/sales/services/gtkJobOrderService.ts` + migration `reserve_stock`/`release_stock` RPC |

---

## Gaps Found

### GAP-01: Quotation Rejection Workflow (Sales) — ✅ RESOLVED
- **Intended:** Full reject → notify client → close pipeline
- **Actual:** `Rejected` status exists in gtkQuotationTypes.ts but no transition logic, no notification trigger, no dashboard tracking
- **Impact:** LOW — manual process works; no automation
- **Fix:** `updateStatus()` in `useGTKQuotation.ts` now fires `NotificationService.create()` with a WhatsApp-link template on transition to `Rejected`. Client phone is resolved via `SalesService.getClients()`.

### GAP-02: Offline Ghost Order Prevention (Production) — ✅ RESOLVED
- **Intended:** MFG-1 prevents saving pieces for non-existent orders
- **Actual:** Check requires Supabase connectivity. When offline (localStorage-only mode), pieces can be saved without quotation validation
- **Impact:** MEDIUM — could create orphaned production data
- **Fix:** `saveProductionPieces()` now falls back to `localStorage['gtk_erp_quotations']` + `localStorage['gtk_erp_gtk_job_orders']` when Supabase is unreachable, and throws `MFG-1 GhostOrderError (offline)` if any orderId is unknown to the local cache.

### GAP-03: Period Closure Escalation (Finance) — ✅ RESOLVED
- **Intended:** Standard ERP has exception workflow for posting to closed periods
- **Actual:** Hard block — no CFO override, no emergency posting mechanism
- **Impact:** LOW — period can be reopened manually, but no audit trail for why
- **Fix:** `PeriodService.openPeriod()` now requires a mandatory `reopenReason` when transitioning a `Closed` period back to `Open`; the reason + actor are inserted into `bypass_log` (rule `FIN-PERIOD-LOCK`). `PeriodManager.tsx` prompts the user when clicking Re-open.

### GAP-04: Advance Overclaim CFO Override (Finance) — ✅ RESOLVED
- **Intended:** FIN-1 blocks claims > 1.5x advance. Should have escalation path
- **Actual:** Hard rejection. No override mechanism documented
- **Impact:** LOW — edge case; vendor can issue new advance
- **Fix:** `FinanceService.settleAdvance()` accepts an optional `cfoOverride: { approver, reason }` parameter. With a valid override, the FIN-1 throw is suppressed and a `bypass_log` row is written (rule `FIN-1`). Without override, the original hard cap stands.

### GAP-05: Duplicate Vendor Claim Prevention (NCR) — ✅ RESOLVED
- **Intended:** One claim per NCR event
- **Actual:** ncrService.ts creates claims on NCR creation but no UNIQUE constraint preventing duplicate claims for same NCR
- **Impact:** MEDIUM — could result in double recovery GL entries
- **Fix:** `NCRService.createVendorClaim()` checks for any non-`Rejected` existing claim against the same `ncrId` and throws `DuplicateVendorClaimError`. Mirrored at the DB level by partial unique index `ncr_claims_one_active_per_ncr`.

### GAP-06: RealtimeService Unused (Factory) — ✅ RESOLVED (stale)
- **Intended:** Live factory floor updates via WebSocket
- **Actual at audit time:** RealtimeService.ts (16.5 KB) appeared unused
- **Actual now:** `App.tsx` calls `RealtimeService.start()` on login and `.stop()` on logout; `realtimeQueryBridge.ts` translates events into React Query invalidations. Factory-native tables (`factory_events`, `hse_incidents`, etc.) are subscribed via the `NATIVE_SUPABASE_TABLES` batch in `subscribeAll()`.
- **No code change required.**

### GAP-07: Credit Note Approval Workflow (Sales) — ✅ RESOLVED
- **Intended:** Credit notes should have approval gate (financial impact)
- **Actual:** creditNoteService.ts posts GL directly without approval step
- **Impact:** MEDIUM — any authorized user can issue credit notes
- **Fix:** Split `issueCreditNote` into a two-stage Maker-Checker flow:
  - `issueCreditNote()` now persists a `Pending Approval` record (no GL).
  - `approveCreditNote()` (different user) posts the reversing GL, COGS reversal, and balance reduction.
  - `rejectCreditNote()` records rejection reason. Approver/Rejecter MUST differ from maker — enforced in service + UI. `CreditNoteModule.tsx` exposes Approve/Reject buttons.

### GAP-08: Stock Reservation on Job Order (Production ↔ Procurement) — ✅ RESOLVED
- **Intended:** Creating job order should reserve material stock
- **Actual:** No stock reservation mechanism. Stock check only at issue time (SCM-3)
- **Impact:** MEDIUM — two job orders could compete for same stock
- **Fix:** New Postgres RPCs `reserve_stock(item_id, qty)` (atomic, throws `InsufficientFreeStock`) and `release_stock(item_id, qty)`. `convertQuotationToJobOrder()` calls `reserveJobOrderStock()` on creation; `updateJobOrderStatus()` calls `releaseJobOrderStock()` on Completed/Cancelled. CHECK constraint `store_items_reserved_lte_qty` prevents reservation exceeding physical quantity.

---

## Strengths (No Gaps)

| Area | Implementation |
|---|---|
| GL Double-Entry | FIN-3 assertion on every Posted entry — no imbalanced transactions possible |
| Maker-Checker JV | 4-eyes rule enforced with role + email validation |
| Three-Way Match | SCM-5 validates PO/GRN/Invoice within PKR 1 tolerance |
| QA Gate | SCM-1 blocks GRN posting without matching inspection_lots |
| Budget Control | SCM-2 prevents PO approval when budget exceeded |
| Negative Stock | 5 CHECK constraints at DB level — physically impossible |
| Intercompany | Atomic dual-company GL via SECURITY DEFINER RPCs |
| ETA Ripple | Trigger function auto-syncs SO ETA to linked PO |
| Agent HITL | ConfirmationCard prevents autonomous write operations |

---

## Validation Checklist

| Check | Result |
|---|---|
| Every module in dependency graph exists in codebase | PASS |
| Every contract references real Supabase tables | PASS |
| Every GL touch point maps to actual financeService call | PASS (10 GL posting paths traced) |
| DFDs match actual component logic | PASS |
| No circular dependencies found | PASS |
| RLS coverage gaps documented | PASS (Pattern B tables noted) |
