# GLASSCO GO-LIVE — BACKUP DATA MIGRATION PLAN

**Source:** `Glasstech_ERP_BACKUP_2026-07-09_AUTO (6).json` (3.78 MB, meta.version 1.0, AutoBackup)
**Target:** `glasstech-multitenant` (Supabase = source of truth), company scope = **Glassco**
**Author:** God-mode analysis, 2026-07-09
**Status:** PLAN — awaiting founder sign-off on the 3 decisions in §7 before build.

---

## 1. Executive summary (read this first)

The backup is a full dump of the **old standalone** app. Three hard truths drive the entire plan:

1. **It is a MULTI-company backup, not "just Glassco."** Sales/Production/Inventory data is cleanly `Glassco`, but HR is split across `GTK/Glassco/Factory` and Finance/COA spans all 5 companies. We import **only the Glassco slice** (+ re-tag HR — see §7).
2. **It is in the OLD backup format** (camelCase entity keys: `store`, `productionPieces`, `dispatches`, `costCenters`). The current app's restorer (`AppService.importDatabaseFromFile`) expects **snake_case table keys** (`store_items`, `production_pieces`, `tempering_dispatches`, `cost_centers`) **and** matching current column shapes. **Feeding this backup to the built-in restorer as-is will SILENTLY SKIP the biggest entities** (4,946 production pieces, all stock, all dispatches, cost centers, …) and/or error on column mismatch. → We need a **transform layer**, not the raw restorer.
3. **The app SEEDS its own COA and tempering vendors on init** (`GlasscoCOA`, `DEFAULT_TEMPERING_VENDORS` = PSG/AHM/LAKHANI with the exact same IDs). Importing the backup's `accounts`/`vendors` would **duplicate/conflict**. → We SKIP those and rely on the seed.

**The safe path:** a one-time **transform-and-import** that (a) selects the Glassco slice, (b) reshapes each old record into the *current TypeScript model*, (c) coerces types + maps enums + re-tags company, then (d) **persists through the app's own module services** (`SalesService.saveQuotations`, `HRService.saveEmployees`, `InventoryService.saveStore`, `ProductionService`…). Those services already know the current row shape (the `data` jsonb wrapping + company scoping + Supabase push), so we never hand-write SQL columns.

---

## 2. What's in the backup (verified counts + verdict)

| Entity (backup key) | Count | Company split | Verdict |
|---|--:|---|---|
| `clients` | 7 | Glassco 7 | **IMPORT** (2 orphan client refs — see §5) |
| `quotations` (+items) | 582 | Glassco 582 (Approved 355 / Draft 226 / Voided 1) | **IMPORT** (heavy coercion) |
| `products` | 59 | Glassco 52 / **GTK 7** | **IMPORT 52** (drop 7 GTK aluminium profiles) |
| `store` (stock) | 39 | Glassco 39 | **IMPORT** → `store_items` (all qty = 0) |
| `vendors` | 6 | Glassco 3 / **undefined 3** | **SKIP** (app seeds PSG/AHM/LAKHANI) — optional rate merge |
| `productionPieces` | 4,946 | *(no company field)* → Glassco | **IMPORT** (derive company, map status enum) |
| `dispatches` | 7 | Glassco 7 | **IMPORT** → `tempering_dispatches` |
| `warehouseSpots` | 3 | Glassco 3 | **IMPORT** (small) |
| `employees` | 35 | GTK 18 / Glassco 11 / Factory 6 | **IMPORT — DECISION §7.1** (default: re-tag all → Glassco) |
| `attendance` | 478 | (by employee) | **IMPORT** (follows employee scoping) |
| `loans` | 15 | (by employee) | **IMPORT** |
| `payroll` | 11 | (by employee) | **IMPORT** |
| `requisitions` | 4 | GTK 4 (all HR: Loan/Advance/Skip/Overtime) | **IMPORT** (re-tag → Glassco) |
| `accounts` (COA) | 310 | Glassco 77 (+ 233 other cos) | **SKIP** (app seeds GlasscoCOA) — verify parity |
| `costCenters` | 12 | GTK/GTI/Nippon/Factory (**no Glassco**) | **SKIP / create fresh** Glassco cost centers |
| `ledger` (GL) | 2 | 1 GTK + 1 Glassco | **SKIP** — GL history is empty → **fresh start w/ opening balances** |
| `activityLogs` | 2 | — | Skip (audit noise) |
| Empty (0 rows) | — | `projects, pettyCash, recurringExpenses, financialEvents, mappingRules, glConfig, stockLedger, inspectionLots, remnants, handlingUnits, gatePasses, jobOrders` | Nothing to do |

**Net go-live payload:** ~6,150 records across 12 entities (dominated by 4,946 pieces + 582 quotes + 478 attendance).

---

## 3. The format gap (why the built-in restorer is not enough)

`AppService.importDatabaseFromFile` restores `data[table] ?? data[gtk_erp_key]`. This backup's keys are neither — they're the **old camelCase entity names**. Mapping of what breaks:

| Backup key | Current table the restorer wants | Restorer result as-is |
|---|---|---|
| `store` | `store_items` | **SKIPPED** |
| `productionPieces` | `production_pieces` | **SKIPPED** (4,946 lost) |
| `dispatches` | `tempering_dispatches` | **SKIPPED** (also a rename) |
| `costCenters` | `cost_centers` | SKIPPED |
| `warehouseSpots` / `purchaseOrders` / `jobOrders` / `gatePasses` | `warehouse_spots` / `purchase_orders` / … | SKIPPED |
| `employees, attendance, loans, payroll, accounts, ledger, clients, quotations, products, vendors, requisitions` | same word | **attempted** — but old row-shape ≠ current columns → column-mismatch errors or fields landing outside the `data` jsonb |

**Conclusion:** even for the "matching name" tables, a raw `upsert(oldRows)` is unsafe because current tables store most fields inside a **`data` jsonb column** (confirmed by migrations `038/039/084` *"…data column…"* + `020_fix_cost_centers_data_column`). Old rows carry those fields at top level → they won't persist correctly. **Use the transform importer + module services.**

---

## 4. Import architecture

```
backup JSON ─► [1] select Glassco slice ─► [2] transform to current TS model
            ─► [3] coerce/normalise/enum-map ─► [4] persist via module service
            ─► service wraps into `data` jsonb + sets company + pushes to Supabase (upsert by id)
```

**Build a one-time `MigrationImporter`** (admin-gated tool OR a `node`/browser script that imports the module services). Do **NOT** extend `importDatabaseFromFile` — keep the migration logic separate and disposable.

**Persistence targets (reuse existing services — they already handle `data` jsonb + company + sync):**

| Entity | Service.method | Notes |
|---|---|---|
| clients | `SalesService.saveClients` / `AsyncSalesService.saveClients` | upsert by id |
| products | `SalesService.saveProducts` | Glassco only |
| quotations | `SalesService.saveQuotations` (Glassco path via `useGlasscoQuotations` model) | keep old `id`/`orderNo` |
| store_items | `InventoryService.saveStore` | qty 0 opening |
| production_pieces | `ProductionService` save (or `update_piece_status_atomic` for status) | batch 500 |
| tempering_dispatches | dispatch service (`modules/dispatch`) | link `pieceIds` |
| employees/attendance/loans/payroll | `HRService.saveEmployees` etc. | `data` jsonb (per prior fix) |
| requisitions | procurement service | HR-type reqs |

**Ordering (FK/logical deps):**
1. employees → (attendance, loans, payroll, requisitions)
2. clients → quotations → productionPieces → dispatches
3. products, store_items, warehouseSpots (independent masters)

**Idempotency:** every write is `upsert onConflict id`. Re-running the importer is safe (no dupes). Keep the **old IDs** (e.g. `QT-GLS-26-0002`, piece `2265/1`, order `SO-GLS-0126-2278`) so piece→order and dispatch→piece links survive. New documents created after go-live continue the *new* format (`GT-QUT-GLS-…`) via `AppService.generateSequenceID` — the two coexist.

---

## 5. Data-quality fixes (apply inside the transform — non-negotiable)

| # | Issue | Rows | Fix |
|---|---|--:|---|
| Q1 | Quote item `qty` (and `inchW/sootW/inchH`) are **strings** | 2,127 / 3,839 items | `Number()` coerce; guard `NaN → 0` |
| Q2 | Quote status `"Voided"` (old) | 1 | map → `"Void"` (current enum) |
| Q3 | 2 orphan `clientId` (`BP-100563`, `BP-601901`) | 2 quotes | create placeholder client **"Unknown (migrated)"** per id, OR park those 2 as Draft w/ note |
| Q4 | `productionPieces` have **no `company`** | 4,946 | derive `"Glassco"` |
| Q5 | Piece `status` values | 4,946 | map to `PieceStatus` enum: Cut/Service-Pending/QC-Pending/QC-Passed/Dispatched/Delivered — verify each against `modules/shared/constants.ts`; unknowns → `Hold` + log |
| Q6 | 21 pieces reference an `orderId` with **no matching quote** (`SO-Glassco-…` vs `SO-GLS-…` format drift) | 21 | normalise order-no format; if still orphan, import piece but flag `orphanOrder=true` |
| Q7 | Employee `department` casing: `ALU/Alu`, `Site/site` | — | normalise to canonical set |
| Q8 | 3 vendors `company=undefined` | 3 | → `"Glassco"` (only if importing vendors; default is SKIP) |
| Q9 | Employee `id` is an epoch-ms string; attendance/loans/payroll FK to it | — | preserve verbatim (do not regenerate) |

**Financial reality:** GL history is effectively empty (2 rows). Do **not** try to reconstruct COGS/AR from transactions. Instead seed **opening balances** as of go-live date (AR from quotes' `receivedAmount` vs total; stock at 0/opening; WIP for in-flight pieces if the accountant wants it). This is a Finance-Agent task, done **after** the operational import.

---

## 6. Phased runbook

### P0 — Pre-flight (no writes)
- [ ] **Full backup of current cloud** — run `AppService.exportDatabaseToFile()` (authoritative snapshot for rollback).
- [ ] Confirm the Glassco slate is empty/known (fresh go-live) — if not, `GlasscoDataWiper` scoped to Glassco after sign-off.
- [ ] Founder signs off §7 decisions.
- [ ] **Dry-run**: importer runs in `validateOnly` mode → prints a reconciliation report (per-entity in/out counts, coercions applied, rows dropped, orphans) with **zero writes**. Founder reviews.

### P1 — Masters
- [ ] employees (35, re-tagged per §7.1) → verify count + codes
- [ ] clients (7, +2 placeholders) 
- [ ] products (52 Glassco)
- [ ] store_items (39, qty 0) 
- [ ] warehouseSpots (3)
- [ ] **Verify** COA parity: does `GlasscoCOA` seed cover the accounts Glassco quotes/GL reference? If gaps, add — do **not** bulk-import the 77 backup rows.
- [ ] Create Glassco cost centers (none in backup) — minimal set the app needs.

### P2 — Transactions
- [ ] quotations 582 (+items, coerced) — verify Approved/Draft counts (355/226) + totals
- [ ] production_pieces 4,946 (batched, status-mapped) — verify status histogram
- [ ] tempering_dispatches 7 (+ piece links)
- [ ] attendance 478, loans 15, payroll 11
- [ ] requisitions 4

### P3 — Verify & reconcile
- [ ] Row counts in Supabase == expected (per §2 payload)
- [ ] **Piece→Order integrity**: 4,925 pieces resolve to a quote orderNo; 21 flagged
- [ ] **Quote math**: sum(item.amount) == displayed total for N samples; `receivedAmount` preserved
- [ ] **Stock**: 39 rows, all Glassco, units SqFt, qty 0
- [ ] **HR**: 35 employees, attendance FKs resolve, payroll nets recompute
- [ ] **Opening balances** posted by accountant (separate) — trial balance = 0
- [ ] Spot-check 3 quotation prints + 1 job/piece flow + 1 dispatch in the live UI
- [ ] Re-run importer once → **zero new rows** (idempotency proof)

---

## 7. Decisions the founder must confirm (before build)

**7.1 — HR company scoping (default chosen: re-tag all 35 → Glassco).**
Old app was single-tenant; the GTK/Factory tags on employees are legacy noise. Options: (a) **re-tag all 35 → Glassco** ✅ default, (b) import only the 11 Glassco-tagged, (c) keep tags separate for a future GTK/Factory go-live. *Reversible* — we can re-scope later; nothing else depends on it.

**7.2 — COA: rely on seeded `GlasscoCOA`, skip the 77 backup rows.** ✅ default. (Confirm the seed covers every account code the imported quotes/GL touch; patch gaps rather than bulk-import.)

**7.3 — GL history: fresh start with opening balances (skip the 2 backup ledger rows).** ✅ default. Accountant posts opening AR / stock / WIP as of go-live date.

*(Optional)* vendors — skip (app seeds identical PSG/AHM/LAKHANI). Merge backup rate history only if the old app's rates diverged.

---

## 8. Risks & rollback

| Risk | Sev | Mitigation |
|---|---|---|
| Raw restorer silently drops pieces/stock/dispatches | **P1** | Do not use it; transform importer + services (this plan) |
| Old row-shape lands outside `data` jsonb → invisible in UI | **P1** | Persist via module services, never raw upsert; verify a row renders in UI in P3 |
| 4,946-piece upsert timeout/quota | P2 | batch (500), retry with `withRetry`; run online |
| Wrong company scoping baked in | P2 | dry-run report + reversible re-tag |
| Financial mis-statement from fake GL | **P1** | No derived GL; opening balances by accountant only |
| ID/format drift breaks new-doc numbering | P3 | keep old IDs for history; new docs use `generateSequenceID` |

**Rollback:** P0 full backup exists → on failure, `GlasscoDataWiper` (Glassco scope) + `importDatabaseFromFile(P0 snapshot)`. Because every write is upsert-by-id into a clean slate, partial failure is re-runnable, not corrupting.

---

## 9. What we deliberately DO NOT import
Seeded COA + tempering vendors (app provides), all non-Glassco data (GTK/GTI/Nippon/Factory COA & the 7 GTK products), GL ledger history (start fresh), activity logs, and the 12 empty entities. Cost centers are **created fresh** for Glassco (backup has none).

---

## 10. Next step
On founder sign-off of §7, build the disposable `MigrationImporter` (transform + service persistence + `validateOnly` dry-run), run P0 dry-run, review the reconciliation report, then execute P1→P3. Estimated build: the importer + dry-run report is the bulk of the work; the run itself is minutes.
