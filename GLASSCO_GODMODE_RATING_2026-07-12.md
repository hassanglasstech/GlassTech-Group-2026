# GlassTech ERP — God-Mode Rating

**Date:** 2026-07-12 · **Branch audited:** GT-Production · **Method:** 8 parallel principal-level
auditors, each doing real file reads + live Supabase (MCP) queries. Every finding below is cited to
`file:line` or a live DB query. Brutal, evidence-first — no benefit of the doubt.

---

## Overall: **4.6 / 10** — "Deep and genuinely built, but not yet production-trustworthy for money."

This is **not** a UI shell. It is a real, mostly end-to-end ERP with live persistence, atomic
transactions, server-enforced double-entry, and a mature AI layer — the *feature depth* is a 7.4.
But the **trust layer underneath the money is broken in specific, fixable ways**: a sync engine that
reports success on rejected writes, a payroll→GL path that silently never posts, RBAC that is pure
client-side theater below the company boundary, and a production deploy running 6 weeks / 1,374
commits behind all the recent fixes. The average across dimensions is dragged down by exactly the
things an ERP cannot get wrong: data integrity, reliability, and financial correctness.

> **Score reconciliation:** the "~8/10" from last session was for the **Supabase DB security/schema
> sub-track only** (RLS lockdown 096–103 + baseline). That slice still grades well (Security = 5.8,
> and the DB-side isolation genuinely landed). This 4.6 is the **whole application** — a broader,
> harsher question that pulls in code paths, sync, HR→GL, testing, and the deploy pipeline.

### Scorecard

| # | Dimension | Grade | One-line verdict |
|---|-----------|:-----:|------------------|
| 5 | **Feature Completeness** | **7.4** | Real, mostly end-to-end ERP; docs *understate* what's built |
| 2 | **Security, Auth & RBAC** | **5.8** | Tenant isolation now DB-enforced; role/module RBAC is client-only theater |
| 3 | **Finance & GL Correctness** | **4.5** | Double-entry + atomic invoices sound; payroll→WIP silently not posting |
| 1 | **Architecture & Code Quality** | **4.2** | Good instincts, but company-resolution duplicated & drifting; 1,792 `any` |
| 8 | **Ops, Build & Schema Governance** | **4.2** | Honest first step, but pipeline not load-bearing; prod 6 wks stale |
| 7 | **Testing & QA** | **3.8** | Real GL tests, but sync/isolation/state-machine untested; CI misses active branch |
| 4 | **Data Integrity & Persistence** | **3.6** | Sync layer marks *failed* pushes as success → silent data loss |
| 6 | **Reliability, Error Handling & UX** | **3.2** | Great ErrorBoundary over a sync engine that loses data behind a green toast |

*Weighted overall (Finance 25%, Data 20%, Security 15%, Reliability 12%, Features 12%, Architecture 8%,
Testing 5%, Ops 3%) = **4.64**. Simple average = 4.59.*

---

## 🔴 GO-LIVE BLOCKERS (P0) — must fix before real money flows

These are the ones that corrupt books or lose data on **day one**:

1. **SyncService marks failed pushes as SUCCESS.** On a `401/403/42501` (stale session / RLS) or a
   `400` schema mismatch, `pushTable()` `return`s from inside the `try` without throwing, resolves
   `true`, and the wrapper calls `clearPending()` + shows `toast.success('All data synced ✓')`. The
   change survives only in localStorage and is wiped by the next pull. **This is the structural root
   of every "green toast but data didn't persist" report.**
   `src/services/SyncService.ts:1609-1623, 1770-1841`

2. **Payroll GL never posts (Maker-Checker swallow).** `hrService.savePayroll` builds the WIP-Direct-
   Labour JV with `status:'Posted'` but **no `createdBy:'system-auto'`**, so the maker-checker gate
   (`enforce_jv_maker_checker`) throws on every payroll run — caught by a bare `console.warn`. Wages
   show "paid", but WIP-Direct-Labour and Salary Payable are **permanently understated**. The team
   already hit and fixed this exact bug once in `ncrService.ts` and never propagated it (GRN GL,
   overhead, intercompany, loans all still vulnerable).
   `modules/hr/services/hrService.ts:429-502` · `modules/production/services/ncrService.ts:330-345`

3. **Payroll double-posts on two uncoordinated paths.** `PayrollManagement.tsx` (on approval) debits
   Salary Expense / credits `2211`; `hrService.savePayroll` (on "Mark Paid") independently posts to
   WIP `11523` / credits a **different** payable `21311`. Same month → two journals, two payable
   accounts, never reconciled. Books corrupt on the first cycle.
   `modules/hr/pages/PayrollManagement.tsx:333-416` vs `modules/hr/services/hrService.ts:382-503`

4. **`saveProductionPieces` is fire-and-forget.** The shared write path for cut/QC/dispatch/approve
   fires `supabase.upsert(...).then(...)` **without `await`** — resolves before cloud confirmation,
   despite an in-file comment claiming it was fixed.
   `modules/production/services/productionService.ts:502-505` (vs comment at `:289-291`)

5. **Offline fallback leaks cross-tenant data.** `pullTable()` does `select('*')` with **no
   `.eq('company')`** and writes all companies' rows into one shared `gtk_erp_*` key; ~30
   `asyncSalesService.get*` methods fall back to that unfiltered cache on any Supabase error → a
   Glassco user sees Nippon invoices/clients the moment Supabase blips.
   `src/services/SyncService.ts:1633-1648` · `modules/sales/services/asyncSalesService.ts` (~30 sites)

6. **AI agent posts invoices bypassing GL.** `agentTools.ts` `create_invoice` inserts straight into
   `invoices` and **never calls `financeService.postJournal()`** — invoice with a balance, no
   Dr AR / Cr Revenue, silently breaking the trial balance. Errors swallowed.
   `modules/factory/components/agent/agentTools.ts:673-684`

7. **Wazir AI leaks cross-company financials.** `query_business` branches for `production_status`,
   `attendance_today`, `cash_position` run with **zero company filter**; others make it optional.
   An AI answer can mix another company's AR/AP/stock into the session.
   `modules/wazir/services/wazirService.ts:286, 295, 304-306`

8. **`getProductionPiecesPage` corrupts pieces.** The `row.data && typeof row.data==='object'`
   ternary treats the live default `data '{}'::jsonb` as truthy and **discards status/specs/order_id**
   for any row that went through the atomic status RPC (the normal case). Live-used by the Warehouse
   view. `modules/production/services/productionService.ts:358-361` · `WarehouseModule.tsx:39`

9. **Payment-receipt torn write.** The Dr Cash / Cr AR leg posts via ordinary `saveLedger`, *then* a
   separate call to the atomic `process_payment_receipt` RPC. If one lands and the other fails, the
   ledger shows cash collected while the invoice balance never updates — on the **most frequent
   transaction in the app**. `modules/sales/components/SalesOrders.tsx:452-503`

10. **RBAC below the company boundary is client-only theater.** No RLS policy references role or a
    permissions table (verified live). Any authenticated user (down to `glassco_cutter`) with a valid
    JWT can read/write `ledger, accounts, invoices, clients, employees` for their company directly via
    the Supabase REST API. Role→module scoping exists **only** in `App.tsx` route guards.
    `modules/auth/authStore.ts:81-96` · `App.tsx:210-226`

11. **Deployed production is 6 weeks / 1,374 commits stale.** `main` (which Vercel auto-deploys) last
    moved 2026-05-31; `GT-Production` is today. Every persistence/auth/security *frontend* fix from the
    last 6 weeks is **not on the live URL**, and CI (`ci.yml`) triggers only on `[multitenant, main]`
    — **never on `GT-Production`**, so none of that work has been through the gate.

---

## 🟠 Serious (P1)

- **`owner` role silently bypasses `allowed_companies`.** `auth_user_is_super()` whitelists
  `owner` → full 5-company access. A real prod account (`ammarsheikh569@…`, `allowed_companies=['Nippon']`)
  has live RLS access to *all* companies' financials. Either split `owner` from the super tier or stop
  offering company-scoping on owner accounts. (baseline schema `:4035-4048`, live-verified)
- **`user_profiles` + `access_logs` are world-readable to any authenticated user** (`USING (true)`).
  Every cutter can read the full roster (emails, roles, allowed_companies) and the cross-company login
  audit trail — PII / org-structure disclosure + a ready phishing list.
- **`activeCompany()` copy-pasted across 5+ services** with a priority order that **disagrees** with
  `authStore.getActiveCompany()` — two sources of truth that can resolve different tenants.
- **`profile.company` reads a column that doesn't exist** on the live `user_profiles` → always
  `undefined`, always falls through to role-default. The "BUG-1 fix" rests partly on a phantom column.
- **Optimistic-locking infra is dead code.** `update_with_version` RPC + `versionedUpdate.ts` (covers
  6 tables) is wired to one hook (`useUpdateProductionPiece`) that **no page imports**. Every real
  money-table write is blind last-write-wins.
- **Nippon COGS has no hard gate** (Glassco does): unmatched lines post revenue with COGS=0 (toast
  warning only) → overstated gross profit.
- **`post_grn_atomic` built but never called** — GRN GL still runs the older multi-step path.
- **Contradictory toast pairs** on quotation save (error "Cloud sync failed" + success "Saved" fire
  together), masking failures. **Dashboard boot has no try/catch** → stuck spinner forever on any
  rejection.
- **Testing is a thin crust:** ~5 of 14 test files test a hand-duplicated "shadow model," not real
  code (payroll, RBAC, concurrency, piece-state machine). Sync, company-isolation, and the piece-state
  machine have **zero real coverage**. `canTransitionTo` exists only in a test file — no runtime guard
  blocks `Delivered→Cut`.
- **`prune_activity_log` is orphaned** — `activity_log` at 178k rows, +2,880/day, nothing scheduled to
  prune it (no pg_cron, no external cron).
- **1,792 `any`/`as any`** across `modules/` (despite `strict:true` + "NEVER use any"), worst in
  `financeService.ts`, `agentTools.ts`, `inventoryService.ts`.

---

## 🟢 What's genuinely strong (credit where due)

- **Feature depth is real (7.4).** Sales, Production (2D bin-packing cut-plan, cutter→QC→tempering
  piece lifecycle via `update_piece_status_atomic`), Procurement/Inventory, Finance (server-computed
  trial balance), and **Wazir AI** (real agentic tool-loop, not a stub) are end-to-end wired.
- **Several stale docs UNDERSTATE the build:** Nippon GRN *has* GL posting, remnant/scrap *is* built,
  cutter Break/Image *is* implemented, service-station routing *is* live. Code is ahead of CLAUDE.md.
- **Double-entry is enforced server-side** by a real Postgres trigger (`enforce_ledger_balance`), not
  just client-side — not bypassable by a direct upsert. Invoice/credit-note/void RPCs are truly atomic.
- **Nippon vs Glassco GL chains are correctly separated** (4120 vs 41110), and the `COGS × qty` bug is
  genuinely fixed in both chains.
- **DB tenant isolation genuinely landed** (096–103): anon locked out, RLS on all tables, functions
  pinned, views `security_invoker`, a real self-escalation hole closed.
- **Edge functions are production-grade:** JWT required, anon key rejected, CORS allowlist, DB-driven
  rate limits. All LLM calls route through `claude-proxy` (no browser→Anthropic).
- **Nightly backup with a heartbeat check** (fails if backup is empty) + a real ErrorBoundary /
  crash-report stack.

---

## Recommended fix sequence (before Glassco go-live)

**Phase 1 — stop the bleeding (P0 data/money):**
1. SyncService: make `401/403/42501/400` **throw** (not `return`), keep the pending flag, add a
   real sync-status indicator + forced re-login on auth errors (wire `safeSupabase`/`onAuthStateChange`
   — the recovery code already exists as dead code).
2. `await` the upsert in `saveProductionPieces`.
3. Payroll: collapse to **one** idempotent poster with `createdBy:'system-auto'`; propagate the
   `system-auto` fix to GRN/overhead/intercompany/loan JVs.
4. Add `.eq('company')` (or a client-side re-filter) to `pullTable` + the offline fallbacks; fix the
   Wazir + `agentTools.create_invoice` isolation/GL bypass.
5. Fix `getProductionPiecesPage` jsonb-default corruption.

**Phase 2 — trust & governance:**
6. Promote GT-Production → main (get the fixes actually deployed) and make CI run on GT-Production.
7. Add role/permission RLS (or accept company-only and document it); split `owner` from super; scope
   `user_profiles`/`access_logs` SELECT to the viewer's company.
8. Real tests for sync, company-isolation, and the piece-state machine; add a runtime transition guard.
9. Complete the schema baseline (`db pull` once Docker is available) so `db push` is safe.

---

*Bottom line: the ambition and breadth here are well above what one developer usually ships — but the
grade is held down by the boring, unglamorous trust layer. Fix the ~11 P0s (most are small, localized
edits) and this app moves from ~4.6 to a defensible ~7 for a single-company go-live.*
