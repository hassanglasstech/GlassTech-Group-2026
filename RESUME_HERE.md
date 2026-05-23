# RESUME HERE — Nippon Hardware Go-Live (Phase 5 in progress)

**Last updated:** 2026-05-23
**Active focus:** Nippon Hardware module (trading business, 5 vendors: KIN LONG / Soleron / SIWAY / Froise / Ningbo Widen)
**Branch:** `main` @ commit `1c957bc` (Vercel auto-deploys this)
**Master plan document:** [docs/testing/NIPPON_GO_LIVE_PLAN.md](docs/testing/NIPPON_GO_LIVE_PLAN.md) — keep this as the single source of truth for go-live progress.

---

## 🎯 IMMEDIATE NEXT STEP

**Phase 5 smoke test** — walk a complete Nippon transaction cycle and verify each step posts balanced GL. Hassan operates the browser; Claude observes + writes verification SQL.

But **3 P2 fixes were discovered today via the KIN LONG IMART verification** that you may want to address first (see "Today's findings" below).

---

## ✅ COMPLETED (this week)

### Day 0 — 2026-05-22 · commit `51c99c4`

- Migration `068_phase0_rls_inventory_tighten.sql` — closed anon INSERT/UPDATE/DELETE on inventory tables (products, vendors, store_items, stock_ledger, requisitions, purchase_orders, grn_sheet_entries, ledger, opening_balances). Migration 064 had closed financial tables, but procurement migrations 20260432-20260434 re-opened anon writes on inventory. The anon key is in the public JS bundle so this was a real "anyone can DELETE all 152 products" hole.
- `coa.nippon.ts` — added 3 leaves: `11431` Input GST Recoverable, `21141` GR/IR — Hardware Material, `31112` Opening Balance Equity.
- `ProcurementHub.tsx` — Logistics + SCM Dashboard tabs hidden for Nippon.
- `StockOverview.tsx` — fixed `¥` (yen) → `PKR`.

### Phase 1 — 2026-05-22 · commit `a8c4f21` (THE big one — accounting backbone)

- `grnGLService.ts` — added `orchestrateNipponGRN()` + `ACC_NIPPON` constants + `nipponInventoryAcc()` per-brand resolver + `nipponCreditAcc()` payment-mode router (Credit/Cash/Advance). Landed cost pro-rated into inventory per IAS-2.
- `NipponGoodsReceipt.tsx` — full handler rewrite: `useAuthStore` dual fallback, typed `ImportedItem` (no any[]), `isPosting` state with disabled+spinner buttons, validation block, unmatched-code warning, GL via orchestrator (BEFORE stock save so failed journal doesn't leave phantom stock). Vendor name + payment mode in footer UI.
- `OpeningBalance.tsx` — `OB_GL_NIPPON` map + Nippon branch in `getInventoryAccount` reading `product.mainCategory` → routes to per-brand inventory (KL=11511, Alum=11512, UPVC=11513, General=11514). New `getOBEquityCode()` returns `31112` for Nippon.
- `GoodsIssue.tsx` — `isNippon` branch with stock-transfer GL (decision A): Dr `11521` Hardware-Project-Issue / Cr `11514` Inventory at MAP. Cost-center mandate gated to non-Nippon (Nippon has no cost centers).

**Decisions used in Phase 1:** A1 (stock-transfer) + per-brand inventory + flat AP (21111) + with-local-purchase support.

### Phase 2 — 2026-05-22 · commit `3625b91` (de-glassify UX)

- `GRNRegister.tsx` — column set branches on `isGlassCompany`. Glass: Sheets / SqFt / Weight. Non-glass (Nippon/GTK/GTI): Qty / Value (PKR). Sheet-tag expand-row hidden for non-glass.
- `LogisticsModule.tsx` — defensive stub for non-glass companies (Nippon/GTK/GTI/Factory).
- `InventoryModule.tsx` — removed dead-code ternary rendering same `StockOverview` on both Nippon branches.

### Phase 3 — 2026-05-22 · commit `68dcb8b` (data plumbing)

- `asyncSalesService.getProducts` — no longer falls back to `'GTK'` when company empty; returns local cache instead.
- `inventoryService.saveStore` — throws on blank company instead of coercing to `''`.
- `inventoryService._sbSync` — wrapped in async + try/catch, shows toast on failure, filters blank-company rows. 14+ callers (requisitions, POs, vehicles, remnants, weight_master, etc.) auto-benefit.
- `PurchaseReturnModule.tsx` — explicit per-company AP/Inventory account map (was loose `code.startsWith('221')` pattern-match), `Date.now()` base-36 race-breaker on DN#, Supabase upsert on save.

### Phase 4 — 2026-05-23 · Hassan ran in parallel

- Migrations `20260521_nippon_clean_product_update.sql` (430 UPDATEs from curated Excel) and `20260521_nippon_insert_missing.sql` (INSERT missing with `ON CONFLICT DO NOTHING`) applied.
- 5 Nippon vendors confirmed in `vendors` table (after CSV cross-check):
  - `VEND-NIP-KL-001` Guangdong Kin Long Hardware Products Co., Ltd. — code KL
  - `VEND-NIP-SL-003` Soleron Building Materials (Hebei) Co., Ltd. — code SOL
  - `VEND-NIP-SW-004` SHANGHAI SIWAY BUILDING MATERIAL CO.LTD — code SIW
  - `VEND-NIP-NB-002` NINGBO WIDEN IMPORT AND EXPORT CO., LTD — code NB
  - `VEND-NIP-FR-005` Froise — code FR
- Massive auth overhaul (PKCE flow, email+password invite, change-password, login-history modal, 6-digit OTP, RBAC fixes).
- Catalogue page (`modules/nippon/pages/NipponCataloguePage.tsx`) with branding + PDF export.
- Grouped category view in StockOverview (Window/Door/Sliding etc.).
- Storage cap at 3.5MB + auto-sync pattern (clear localStorage after Supabase write).

---

## 🔍 TODAY'S FINDINGS — KIN LONG IMART verification (3 issues)

Logged in to https://imart.kinlong.com via Chrome extension and searched `CZS133`. Found 2 variants on KIN LONG (CZS133 + Y2CZS133), pulled detail page (product id `3333`). Comparison vs Nippon DB:

### P2 — Image URL has wrong path prefix
DB stores: `…/storage/v1/object/public/product-images/products/CZS133.png`
But CLAUDE.md rule: bucket is `product-images` with **NO `products/` subfolder** — files at root.

→ Likely 404 for every image. Verify with one curl/browser open of:
```
https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/CZS133.png
```
If that loads but the `/products/CZS133.png` version 404s, run the cleanup SQL below.

### P3 — Duplicate rows with same `profile_code='CZS133'`
- `NIP-KL-CZS133-B` — model_no "CZS133", material "Aluminium alloy", base_price 2400
- (another row) — model_no "KIN LONG HANDLE BLACK & WHITE TONGUE LENGTH=55MM", material NULL

Probably same product entered twice during the master-update migration. Find all duplicates:
```sql
SELECT profile_code, COUNT(*) AS cnt, ARRAY_AGG(id) AS ids
FROM products
WHERE company='Nippon' AND profile_code IS NOT NULL
GROUP BY profile_code HAVING COUNT(*) > 1
ORDER BY cnt DESC;
```

### P3 — Material spec incomplete
DB says only "Aluminium alloy". KIN LONG official: "Aluminum alloy **& Zinc alloy**" (handle body + lever). Worth correcting for catalogue accuracy. Not a blocker.

### Image URL fix SQL (run if P2 confirmed)
```sql
UPDATE products
SET image_url = REPLACE(image_url, '/product-images/products/', '/product-images/'),
    updated_at = now()
WHERE company = 'Nippon'
  AND image_url LIKE '%/product-images/products/%';
```

---

## 📋 NIPPON ACCOUNTING — POST-PHASE 1 CHEAT SHEET

Every Nippon transaction now produces balanced GL via `orchestrateNipponGRN()` / `GoodsIssue.tsx` Nippon branch / `OpeningBalance.tsx` Nippon branch / `deliveryInvoiceService.ts` trading branch:

| Transaction | Dr | Cr |
|---|---|---|
| GRN — Credit | per-brand Inventory 11511-14 | 21111 Payable Kin Long |
| GRN — Cash | per-brand Inventory | 11121 Bank — MCB |
| GRN — Advance settle | per-brand Inventory | 11411 Advance — Kin Long Vendors |
| Opening Balance | per-brand Inventory | 31112 Opening Balance Equity |
| Goods Issue (to GTK project) | 11521 Hardware-Project-Issue | per-brand Inventory at MAP |
| Goods Issue (to GTI project) | 11522 Hardware-Project-Issue | per-brand Inventory at MAP |
| Delivery Invoice | 11211 Receivable + 5114 COGS | 4120 Hardware Sales + 21211 GST + 11521 Project-Issue |
| Cash Receipt | 11121 Bank | 11211 Receivable |
| Purchase Return | 21111 Payable | 11514 Inventory |

Brand → inventory account routing (in `grnGLService.ts:nipponInventoryAcc`):
- `KIN LONG` brand → `11511` Kin Long Products Stock
- `main_category='UPVC'` → `11513` UPVC Hardware Stock
- `main_category='Aluminium Products'` → `11512` Aluminium Accessories Stock
- everything else → `11514` General Hardware Stock (default)

---

## ⏭️ PHASE 5 — FULL CYCLE SMOKE TEST (next session, Hassan operates)

Goal: Walk every step of Nippon's real transaction cycle. Confirm trial balance closes at every step.

```
1. Stock Balances → verify product count + image renders
2. Hardware GRN (manual) — receive 10 PCS of one item @ test price from KIN LONG
   → verify ledger row in Supabase: Dr 11511 / Cr 21111 = qty × rate
3. Quotation → create for client X, 5 PCS @ retail
4. Approve quote → SO auto-created
5. Goods Issue 5 PCS to SO → verify Dr 11521 / Cr 11511 at MAP
6. Delivery Invoice → verify Dr 11211 + 5114 / Cr 4120 + 21211 + 11521
7. Cash Receipt → verify Dr 11121 / Cr 11211
8. Final TB: SELECT * FROM erp_trial_balance('Nippon'); → must balance
```

### Phase 5 cleanup items (after smoke test passes)

- Delete `GoodsReceiptMIGO.tsx` (legacy; wizard replaced)
- Delete `NipponKinLongSeeder.tsx` (orphan code, no imports)
- Unify Vendor Hub chrome (`<VendorHubShell>` wrapper around the 3 company-specific vendor pages)
- Decide on zombie pages: `StockAging.tsx`, `VendorScorecard.tsx`, `SupplyChainDashboard.tsx` — hide for Nippon if no real data path
- Add `PeriodService.assertOpen()` guard on GRN/OB/Issue/PurchaseReturn save handlers (deferred from Phase 1)
- Write 6 Nippon inventory SIT tests (deferred from Phase 1 — `modules/__tests__/nippon_inventory_sit.test.ts`)
- Tag release: `git tag -a v1.0.0-nippon-go-live -m "Nippon hardware go-live cut"`

---

## 🛠️ ENVIRONMENT QUICK-REF

- **Supabase URL:** `https://wfytbcmazixddtwpbego.supabase.co`
- **Bucket for images:** `product-images` (root-level files, NO subfolder)
- **Image URL pattern:** `…/storage/v1/object/public/product-images/{filename}` — NOT `…/products/{filename}`
- **Vercel:** auto-deploys from `main`
- **Worktree:** `C:\Users\Hassa\Downloads\ERP\GlassTech-Group-2026\.claude\worktrees\zen-darwin-faed85` (branch `claude/zen-darwin-faed85` — same head as `main`)
- **Chrome browser extension** is installed and was used to verify CZS133 against KIN LONG IMART. Re-use via `mcp__Claude_in_Chrome__*` tools.

### Commands
```bash
# Run all tests (must be 318/318 green)
npm run test -- --run

# TypeScript check (only pre-existing P2/P3 strictness debt is acceptable)
npx tsc --noEmit

# Dev server
npm run dev

# Build
npm run build
```

### Verification SQL (run in Supabase after each phase)
```sql
-- Anon writes still closed (after migration 068)
SELECT COUNT(*) FROM information_schema.role_table_grants
 WHERE grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE')
   AND table_name IN ('products','store_items','stock_ledger','vendors','ledger');
-- Expected: 0

-- Nippon vendors loaded
SELECT id, name, data->>'code' AS code, data->>'brand' AS brand
  FROM vendors WHERE company='Nippon' ORDER BY data->>'code';
-- Expected: 5 rows (FR, KL, NB, SIW, SOL)

-- Nippon products
SELECT COUNT(*), COUNT(image_url) FROM products WHERE company='Nippon';
-- Expected: ~185 products, most with image_url

-- Image URL prefix audit (run before applying P2 fix above)
SELECT COUNT(*) FROM products
WHERE company='Nippon' AND image_url LIKE '%/product-images/products/%';
-- If > 0, run the REPLACE UPDATE SQL above to drop the 'products/' prefix.

-- After Phase 5: trial balance must close
SELECT * FROM erp_trial_balance('Nippon');
```

---

## 🔁 HOW TO START NEXT SESSION

1. `cd C:\Users\Hassa\Downloads\ERP\GlassTech-Group-2026` (or worktree path)
2. `git pull origin main` (always — Hassan may have committed parallel UX work)
3. `npm install` if `package.json` changed
4. `npm run test -- --run` — confirm 318/318 green baseline
5. Open this file (`RESUME_HERE.md`) — that's where you are
6. Open `docs/testing/NIPPON_GO_LIVE_PLAN.md` — that's where you're going

If Hassan says **"phase 5 start"** → walk the smoke test cycle.
If Hassan says **"image url fix kr do"** → run the P2 UPDATE SQL above + verify a few image loads.
If Hassan says **"duplicate products check kro"** → run the duplicate-detection SQL above + propose dedup strategy.
If Hassan says **"latest commits check kro"** → `git fetch && git log origin/main -10` (he commits a lot in parallel).

---

## 📞 5 NIPPON VENDORS — quick reference

| Code | Brand | Vendor ID | Full Name |
|---|---|---|---|
| KL | KIN LONG | VEND-NIP-KL-001 | Guangdong Kin Long Hardware Products Co., Ltd. |
| SOL | Soleron | VEND-NIP-SL-003 | Soleron Building Materials (Hebei) Co., Ltd. |
| SIW | SIWAY | VEND-NIP-SW-004 | SHANGHAI SIWAY BUILDING MATERIAL CO. LTD |
| NB | Ningbo Widen | VEND-NIP-NB-002 | NINGBO WIDEN IMPORT AND EXPORT CO., LTD |
| FR | Froise | VEND-NIP-FR-005 | Froise |

Note: `nipponInventoryAcc()` in `grnGLService.ts` currently only routes KIN LONG → 11511. Soleron / SIWAY / Ningbo Widen / Froise all default to `11514` General Hardware. If Hassan wants finer per-brand routing, refine that function — but ALL paths still post balanced GL.
