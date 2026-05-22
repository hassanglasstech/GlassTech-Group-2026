# Nippon Go-Live — Material Management Phase Plan

**Author:** God Mode Audit (Consultant Team Lead) | **Date:** 2026-05-22
**Status:** Phase 1 pending decisions · Phase 2 in progress · Phases 3-6 queued
**Scope:** `modules/procurement/*` (Material Management) for Nippon hardware go-live

This document is the master plan. After every phase, append the verification
output and check off the acceptance criteria. Keep this file as the
single source of truth for Nippon go-live readiness.

---

## Day 0 — Foundation (DONE ✅)

Commit `51c99c4 fix(security,nippon): God Mode Day 1 — close anon write hole + Nippon COA gaps`

1. **Migration 068** — closed anon INSERT/UPDATE/DELETE on inventory tables
   (products, vendors, store_items, stock_ledger, requisitions,
   purchase_orders, grn_sheet_entries, ledger, opening_balances).
2. **coa.nippon.ts** — added 3 accounts: `11431` Input GST Recoverable,
   `21141` GR/IR Hardware Material, `31112` Opening Balance Equity.
3. **ProcurementHub.tsx** — hid Logistics + SCM Dashboard tabs for Nippon.
4. **StockOverview.tsx** — fixed `¥` → `PKR`.

Verification: 318/318 tests passing · migration 068 applied in Supabase
· anon-write verify query returns 0 rows.

---

## 🚦 Phase-1 Decisions (Hassan input required)

These 4 calls drive every accounting code path. Defaults shown.

| # | Question | Options | Recommendation |
|---|---|---|---|
| **A** | Nippon Goods Issue accounting | (A) Stock-transfer: Dr Project-Issue / Cr Inventory<br>(B) Immediate COGS at issue<br>(C) Wait for delivery (no GL at issue) | **A** — cleanest for trading; respects matching principle |
| **B** | Brand-level inventory accounts | (1) Per-brand (KL=11511, Alum=11512, UPVC=11513, Gen=11514)<br>(2) All in 11514 General | **1** — COA already split; gives visibility |
| **C** | Vendor AP sub-accounts | (1) 4 separate AP leafs per supplier<br>(2) Flat 21111 + Vendor Master sub-ledger | **2** — simpler; sub-ledger gives traceability |
| **D** | Local PKR purchases | Yes / No (only imports) | TBD by Hassan |

---

## PHASE 1 — Accounting Backbone (8-10 hours · BLOCKER)

**Goal:** Day-1 trial balance closes. Inventory ↔ AP ↔ GL stay in sync.

### Items

| # | Task | File | Hrs |
|---|---|---|---|
| 1.1 | Build `orchestrateNipponGRN()` | `modules/procurement/services/grnGLService.ts` (extend) | 2 |
| 1.2 | Wire `NipponGoodsReceipt.tsx` → orchestrator (also fixes auth, loading state, `any[]`, fire-and-forget) | `modules/procurement/components/inventory/NipponGoodsReceipt.tsx` | 2 |
| 1.3 | Extend `OB_GL` map for Nippon; auto-set unit from product | `modules/procurement/components/inventory/OpeningBalance.tsx` | 1.5 |
| 1.4 | Wire `GoodsIssue.tsx` GL posting per decision A; gate cost-center for Nippon; fix race condition L59 | `modules/procurement/components/inventory/GoodsIssue.tsx` | 2 |
| 1.5 | Add `PeriodService.assertOpen()` guard | NipponGoodsReceipt, OpeningBalance, GoodsIssue, PurchaseReturn | 0.5 |
| 1.6 | New SIT tests (6 Nippon GL cases) | `modules/__tests__/nippon_inventory_sit.test.ts` (new) | 2 |

### Acceptance

- [ ] `npm run test -- --run` → 324/324 (was 318)
- [ ] Manual smoke: post 1 Nippon GRN → verify ledger row in Supabase
- [ ] `SELECT * FROM erp_trial_balance('Nippon');` balanced

### Risk if skipped
Day-1 trial balance shows zero inventory, zero AP. **Books unusable.**

---

## PHASE 2 — De-Glassify the UX (4-6 hours · IN PROGRESS)

**Goal:** Nippon storekeeper sees only what's relevant. No glass clutter.

### Items

| # | Task | File | Hrs | Status |
|---|---|---|---|---|
| 2.1 | GRNRegister: column set per company; hide sheet-entry expand-row for non-glass | `modules/procurement/components/inventory/GRNRegister.tsx` | 1 | ✅ |
| 2.2 | LogisticsModule: defensive stub for non-glass | `modules/procurement/pages/LogisticsModule.tsx` | 0.5 | ✅ |
| 2.3 | NipponKinLongSeeder — verified orphan (no imports anywhere). Defer deletion to Phase 5 cleanup. | `modules/procurement/components/inventory/NipponKinLongSeeder.tsx` | 0.25 | ✅ (no-op) |
| 2.4 | VendorHub: wrap in common `<VendorHubShell>` for consistent chrome | 3 files | 1.5 | DEFERRED → Phase 5 (cosmetic) |
| 2.5 | Hide zombie pages for Nippon (StockAging, VendorScorecard, SupplyChainDashboard) after confirming no wired data | various | 0.5 | DEFERRED → Phase 5 (needs investigation) |
| 2.6 | Default Inventory tab → "Stock Balances" for Nippon | `modules/procurement/pages/InventoryModule.tsx` | 0.25 | ✅ (already `overview` by default) |
| 2.7 | Verify Nippon quote-row dropdown shows brand + image + qty | `modules/sales/companies/nippon/useNipponQuotations.ts` | 0.5 | ✅ (verified via RESUME_HERE — already in place) |
| **Bonus** | Remove dead-code ternary in InventoryModule (same StockOverview rendered both sides for Nippon) | `modules/procurement/pages/InventoryModule.tsx` | 0.1 | ✅ |

### Acceptance

- [ ] Login as Nippon → walk every Inventory tab → no glass references visible
- [ ] No "0 Sheets / 0 SqFt" placeholders anywhere
- [ ] Vendor pages feel consistent across company switcher
- [ ] All 318+ tests still passing

### Risk if skipped
Storekeeper confusion → wrong entries, mis-clicks → data corrected by accountant later.

---

## PHASE 3 — Data Plumbing & Sync Hardening (3-5 hours)

**Goal:** Saves go to cloud. No silent failures. No data islands.

### Items

| # | Task | File | Hrs |
|---|---|---|---|
| 3.1 | Fix GTK fallback in `getProducts` | `modules/sales/services/asyncSalesService.ts:184` | 0.25 |
| 3.2 | Reject empty-company writes (no `\|\| ''` coercion) | `modules/procurement/services/inventoryService.ts:389` | 0.5 |
| 3.3 | Replace `_sbSync` calls with `_inventoryUpsert` (14+ tables) | `modules/procurement/services/inventoryService.ts` | 1.5 |
| 3.4 | PurchaseReturn: move to service layer + Supabase sync + RPC-based DN number + fix loose account lookup + post balanced GL | `modules/procurement/components/inventory/PurchaseReturnModule.tsx` + `inventoryService.ts` | 1.5 |
| 3.5 | Retry-queue wiring for failed Supabase upserts | `inventoryService.ts` + `SyncService.ts` | 0.5 |

### Acceptance

- [ ] Turn off internet → save → toast "saved offline, will sync"
- [ ] Turn on internet → row appears in Supabase ≤30s
- [ ] Two tabs save same row simultaneously → no duplicates, no GL imbalance

### Risk if skipped
Silent data loss during go-live week. User believes saved, cloud rejected.

---

## PHASE 4 — Nippon Data Load (1-2 hours, Hassan operates)

**Goal:** 152 products + 4 vendors + opening balances all in Supabase with clean GL.

### Sequence

1. **Pre-flight orphan check.** Run:
   ```sql
   SELECT DISTINCT material_id FROM stock_ledger WHERE company='Nippon'
   EXCEPT SELECT id FROM products WHERE company='Nippon';
   ```
2. **Seed 4 vendors** (KIN LONG, Soleron, HuangXing, SIWAY) — append INSERT to v2 SQL or run separately.
3. **Convert `Nippon_Replace_All_v2.sql` from DELETE+INSERT to UPSERT** (idempotent, orphan-safe).
4. **Empty `product-images` bucket → upload 113 images.**
5. **Run upserted v2 SQL.**
6. **Verify counts:** 152 products · 4 vendors · 113 image_url.
7. **OpeningBalance UI** — enter 152 product opening qty + cost (CSV import path).
8. **Trial balance:** `SELECT * FROM erp_trial_balance('Nippon')` → balanced.

### Acceptance

- [ ] Products = 152
- [ ] Vendors = 4
- [ ] Store items = 152 (all qty > 0)
- [ ] Stock ledger = 152 opening rows
- [ ] GL: Σ Dr Inventory = Σ Cr Opening Balance Equity = Σ opening stock value
- [ ] Trial balance closes (Σ Dr = Σ Cr)

---

## PHASE 5 — Full Cycle Smoke Test + Cleanup (3-4 hours)

**Goal:** Real GRN → Stock → Issue → Sale → Invoice → Receipt cycle. Books tie at every step.

### Smoke Test Sequence

| Step | Action | Expected GL |
|---|---|---|
| 1 | Post Nippon GRN: 10 PCS handles @ 500 PKR from KIN LONG | Dr 11514 / Cr 21111 = 5000 |
| 2 | Stock balances UI shows qty 10, MAP 500 | — |
| 3 | Create quotation for client X: 5 PCS @ 800 PKR | (no GL) |
| 4 | Approve → SO created | (no GL) |
| 5 | Goods Issue 5 PCS to SO | Dr 11521 / Cr 11514 (per decision A) |
| 6 | Generate delivery invoice | Dr 11211 / Cr 41121 / Cr 21211; Dr 51111 / Cr 11521 |
| 7 | Customer pays full amount | Dr 11121 / Cr 11211 |
| 8 | Final trial balance | Σ Dr = Σ Cr; remaining inventory = 5 × MAP |

### Cleanup

- [ ] Delete `GoodsReceiptMIGO.tsx` (legacy, wizard replaced)
- [ ] Delete `NipponKinLongSeeder.tsx` if Phase 4 load worked
- [ ] Update `RESUME_HERE.md` with post-Phase 5 status
- [ ] Tag release: `git tag -a v1.0.0-nippon-go-live -m "Nippon hardware go-live cut"`

---

## PHASE 6 — Hypercare (First Week Live)

**Goal:** Catch real issues before they compound.

| Item | Frequency | Owner |
|---|---|---|
| `erp_trial_balance('Nippon')` check | Daily 11pm | Cron + email alert if imbalance > 1 PKR |
| Physical stock spot-check (5 items) | Daily | Warehouse staff |
| Variance review (`store_items.quantity` vs physical) | Daily | Hassan |
| Alert thresholds (stock < minLevel, advance > 30d unsettled, period > 10th unclosed) | Continuous | `alertService` already wired |
| Issue retro / P3 backlog review | Weekly Friday | Hassan |

---

## Dependency Graph

```
4 DECISIONS (Hassan)
        │
        ▼
PHASE 1 — Accounting Backbone
        │
        ├──→ PHASE 2 — UX (can run parallel with Phase 3)
        │
        └──→ PHASE 3 — Data Plumbing
                    │
                    ▼
            PHASE 4 — Data Load (Hassan operates Supabase + UI)
                    │
                    ▼
            PHASE 5 — Full Cycle SIT + Cleanup
                    │
                    ▼
            PHASE 6 — Hypercare
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Trial balance imbalance Day 1 | HIGH if Phase 1 skipped | Catastrophic | Phase 1 is non-negotiable |
| Storekeeper confusion (glass UI) | MEDIUM | Wrong entries | Phase 2 mandatory |
| Silent data loss (cloud sync fail) | LOW-MED | Lost transactions | Phase 3 retry queue |
| Wrong MAP calculation | LOW | Wrong COGS | Single `applyMAPOnGRN` everywhere |
| Migration 068 locks out users | LOW | Module unusable | Day 1 verify query already green |
| Concurrent edits (single-user mode) | VERY LOW | n/a | Defer to multi-user epic |

---

## Working Style

Each phase loop:
1. Hassan decisions / approvals (5 min)
2. Code (Claude — parallel agents where safe)
3. Tests run automatically — green/red surfaced
4. Manual smoke test (Hassan, browser)
5. Verification SQL (Hassan, Supabase)
6. Commit + push (on Hassan signal)
7. Next phase

---

## Phase Status Log

| Phase | Started | Completed | Commit | Notes |
|---|---|---|---|---|
| Day 0 | 2026-05-22 | 2026-05-22 | `51c99c4` | Migration 068 applied; verified |
| Phase 1 | — | — | — | Waiting on 4 decisions |
| Phase 2 | 2026-05-22 | 2026-05-22 | (this commit) | Core 3 fixes done. UX polish (2.4/2.5) deferred → Phase 5 |
| Phase 3 | — | — | — | — |
| Phase 4 | — | — | — | — |
| Phase 5 | — | — | — | — |
| Phase 6 | — | — | — | — |
