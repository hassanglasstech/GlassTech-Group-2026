# Architecture Gap Analysis — Intended vs Actual

**Date:** 2026-04-14

## Methodology
Compared actual codebase implementation against module interface contracts and standard ERP workflows.

---

## Gaps Found

### GAP-01: Quotation Rejection Workflow (Sales)
- **Intended:** Full reject → notify client → close pipeline
- **Actual:** `Rejected` status exists in gtkQuotationTypes.ts but no transition logic, no notification trigger, no dashboard tracking
- **Impact:** LOW — manual process works; no automation
- **Fix:** Add rejection handler with WhatsApp notification to client

### GAP-02: Offline Ghost Order Prevention (Production)
- **Intended:** MFG-1 prevents saving pieces for non-existent orders
- **Actual:** Check requires Supabase connectivity. When offline (localStorage-only mode), pieces can be saved without quotation validation
- **Impact:** MEDIUM — could create orphaned production data
- **Fix:** Add localStorage-level quotation existence check as fallback

### GAP-03: Period Closure Escalation (Finance)
- **Intended:** Standard ERP has exception workflow for posting to closed periods
- **Actual:** Hard block — no CFO override, no emergency posting mechanism
- **Impact:** LOW — period can be reopened manually, but no audit trail for why
- **Fix:** Add bypass_log entry for period reopening with mandatory reason

### GAP-04: Advance Overclaim CFO Override (Finance)
- **Intended:** FIN-1 blocks claims > 1.5x advance. Should have escalation path
- **Actual:** Hard rejection. No override mechanism documented
- **Impact:** LOW — edge case; vendor can issue new advance
- **Fix:** Add bypass_log integration for advance overclaim approval

### GAP-05: Duplicate Vendor Claim Prevention (NCR)
- **Intended:** One claim per NCR event
- **Actual:** ncrService.ts creates claims on NCR creation but no UNIQUE constraint preventing duplicate claims for same NCR
- **Impact:** MEDIUM — could result in double recovery GL entries
- **Fix:** Add UNIQUE constraint on ncr_claims(ncr_event_id)

### GAP-06: RealtimeService Unused (Factory)
- **Intended:** Live factory floor updates via WebSocket
- **Actual:** RealtimeService.ts (16.5 KB) exists but is not imported or used anywhere
- **Impact:** LOW — polling works; realtime is a performance improvement
- **Fix:** Wire RealtimeService to factory_events subscription for live dashboard

### GAP-07: Credit Note Approval Workflow (Sales)
- **Intended:** Credit notes should have approval gate (financial impact)
- **Actual:** creditNoteService.ts posts GL directly without approval step
- **Impact:** MEDIUM — any authorized user can issue credit notes
- **Fix:** Add Maker-Checker pattern (similar to JV workflow)

### GAP-08: Stock Reservation on Job Order (Production ↔ Procurement)
- **Intended:** Creating job order should reserve material stock
- **Actual:** No stock reservation mechanism. Stock check only at issue time (SCM-3)
- **Impact:** MEDIUM — two job orders could compete for same stock
- **Fix:** Use `reserved_qty` column on store_items (already exists, unused)

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
