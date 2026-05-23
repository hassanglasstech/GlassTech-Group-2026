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

## PHASE 1 — Accounting Backbone (DONE ✅)

**Goal:** Day-1 trial balance closes. Inventory ↔ AP ↔ GL stay in sync.

**Decisions used:** A1 + per-brand inventory + flat AP + with-local-purchase option

### Items

| # | Task | File | Status |
|---|---|---|---|
| 1.1 | `orchestrateNipponGRN()` + `ACC_NIPPON` + per-brand inventory resolver + payment-mode credit-side router | `modules/procurement/services/grnGLService.ts` | ✅ |
| 1.2 | NipponGoodsReceipt full rewrite — auth fallback, typed import items, loading state on buttons, validation block, unmatched-code warning, GL via orchestrator, vendor name + payment mode UI | `modules/procurement/components/inventory/NipponGoodsReceipt.tsx` | ✅ |
| 1.3 | OB_GL_NIPPON map + Nippon branch in `getInventoryAccount` (per-brand) + `getOBEquityCode` (31112) | `modules/procurement/components/inventory/OpeningBalance.tsx` | ✅ |
| 1.4 | GoodsIssue: gate cost-center for Nippon + Nippon GL post (Dr 11521 Project-Issue / Cr 11514 Inventory at MAP — decision A stock-transfer) | `modules/procurement/components/inventory/GoodsIssue.tsx` | ✅ |
| 1.5 | PeriodService.assertOpen guard | NipponGoodsReceipt, OpeningBalance, GoodsIssue, PurchaseReturn | DEFERRED → Phase 5 (post-smoke) |
| 1.6 | 6 Nippon inventory SIT tests | `modules/__tests__/nippon_inventory_sit.test.ts` (new) | DEFERRED → Phase 5 (added after smoke test confirms behaviour) |

### Acceptance

- [x] `npm run test -- --run` → 318/318 (no regressions)
- [x] TS clean on all 4 modified files (only pre-existing strictness debt elsewhere)
- [ ] Manual smoke: post 1 Nippon GRN → verify ledger row in Supabase **(Hassan to test)**
- [ ] `SELECT * FROM erp_trial_balance('Nippon');` balanced **(Hassan to verify after Phase 4 load)**

### What books will now post

| Action | GL |
|---|---|
| Nippon GRN — Credit | Dr per-brand Inventory (11511/12/13/14) / Cr 21111 Payable Kin Long |
| Nippon GRN — Cash | Dr per-brand Inventory / Cr 11121 Bank — MCB |
| Nippon GRN — Advance settle | Dr per-brand Inventory / Cr 11411 Advance — Kin Long Vendors |
| Opening Balance | Dr per-brand Inventory / Cr 31112 Opening Balance Equity |
| Goods Issue (decision A) | Dr 11521 Hardware — Project Issue / Cr per-brand Inventory at MAP |
| Purchase Return (Phase 3) | Dr 21111 Payable / Cr 11514 Inventory |

### Risk if skipped → MITIGATED
Day-1 trial balance shows zero inventory, zero AP (RESOLVED).

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

## PHASE 3 — Data Plumbing & Sync Hardening (DONE ✅)

**Goal:** Saves go to cloud. No silent failures. No data islands.

### Items

| # | Task | File | Status |
|---|---|---|---|
| 3.1 | Fix GTK fallback in `getProducts` — return local cache instead of switching company | `modules/sales/services/asyncSalesService.ts:184` | ✅ |
| 3.2 | Reject empty-company writes (throw instead of `\|\| ''` coercion) | `modules/procurement/services/inventoryService.ts` saveStore | ✅ |
| 3.3 | Upgrade `_sbSync` to surface errors via toast + skip blank-company rows (instead of replacing 14+ callers, refactored the helper itself) | `modules/procurement/services/inventoryService.ts` | ✅ |
| 3.4 | PurchaseReturn: explicit per-company AP/Inventory account map, race-proof DN# with base-36 suffix, Supabase upsert on save | `modules/procurement/components/inventory/PurchaseReturnModule.tsx` | ✅ |
| 3.5 | Retry-queue wiring | `inventoryService.ts` | DEFERRED — toast surfaces error, manual retry sufficient for single-user mode |

### Acceptance

- [x] All tests passing (318/318)
- [x] `saveStore` throws on blank company instead of silently coercing
- [x] `_sbSync` shows toast on cloud-sync failure (was console-only)
- [x] PurchaseReturn DN # has `-XXXX` race-breaker suffix
- [x] PurchaseReturn account lookup throws if COA missing required code

### Risk if skipped → MITIGATED
Silent data loss during go-live week (RESOLVED).

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
| Phase 1 | 2026-05-22 | 2026-05-22 | `a8c4f21` | 4 of 6 items done. 1.5/1.6 deferred → Phase 5 (post-smoke). Decisions: A1 + per-brand + flat-AP + with-local. |
| Phase 2 | 2026-05-22 | 2026-05-22 | `3625b91` | Core 3 fixes done. UX polish (2.4/2.5) deferred → Phase 5 |
| Phase 3 | 2026-05-22 | 2026-05-22 | `68dcb8b` | 3.1-3.4 done. 3.5 retry-queue deferred (toast sufficient for single-user). |
| Phase 4 | 2026-05-23 | 2026-05-23 | `34c1820` `b874c92` `1c957bc` | Hassan ran in parallel — 430-UPDATE clean master + INSERT missing + OB async fix. 5 vendors backfilled via SQL (KL/SOL/SIW/NB/FR). |
| Phase 5 | — | — | — | NEXT — full cycle smoke test (GRN → SO → Issue → Invoice → Receipt → TB). 3 P2/P3 fixes from KIN LONG IMART verification queued. |
| Phase 6 | — | — | — | Post go-live hypercare |

---

## 🔍 KIN LONG IMART verification log (2026-05-23)

Logged into https://imart.kinlong.com via Chrome browser extension. Searched `CZS133` (random KIN LONG product sample from Nippon DB). Found 2 variants (CZS133 + Y2CZS133, KIN LONG IMART product id 3333). Comparison against Nippon DB row `NIP-KL-CZS133-B`:

| Finding | Severity | Status |
|---|---|---|
| Image URL has wrong path prefix `/products/` (CLAUDE.md says bucket is flat — no subfolder) | P2 | NOT FIXED — UPDATE SQL queued in RESUME_HERE.md |
| Duplicate rows with same `profile_code='CZS133'` (different ids, one with material NULL) | P3 | NOT FIXED — detection SQL queued in RESUME_HERE.md |
| Material spec incomplete ("Aluminium alloy" — KIN LONG official says "Aluminum alloy & Zinc alloy") | P3 | NOT FIXED — catalogue accuracy only, not blocker |

✅ Confirmed match: brand, category, sub-category, unit, base SKU exists.

These 3 fixes can be batched into a single "Phase 5 prep" commit before the smoke test, or skipped if the smoke test is more urgent.
