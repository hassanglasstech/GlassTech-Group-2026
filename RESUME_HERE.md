# RESUME HERE — Nippon Hardware Go-Live in progress

**Last updated:** 2026-05-21
**Active focus:** Nippon Hardware module (trading business, KIN LONG + 3 other suppliers)
**Branch:** `main` @ commit `1037649` (Vercel auto-deploys this)

---

## 🎯 IMMEDIATE NEXT STEP

**Hassan was about to run the FINAL Nippon master replacement.** Three deliverables sit in `C:\Users\Hassa\Downloads\`:

| File | Purpose |
|---|---|
| `Nippon_Images_Final.zip` | 113 product images, named EXACTLY by product ID |
| `Nippon_Replace_All_v2.sql` | DELETE old + INSERT 152 fresh products |
| `Nippon_Migration_README.md` | Full step-by-step |
| `Nippon_Missing_Images.csv` | 39 products still needing photos |

**Run order (10 min total):**
1. Supabase Dashboard → Storage → `product-images` bucket → select all → Delete
2. Drop 113 files from `Nippon_Images_Final.zip` into the empty bucket
3. Run `Nippon_Replace_All_v2.sql` in SQL Editor

Expected after: 152 Nippon products, 113 with image_url, 4 brands captured (KIN LONG / Soleron / HuangXing / SIWAY).

---

## 📊 PRODUCT INVENTORY — SOURCE OF TRUTH

| Brand | Products | With image | Missing |
|---|---:|---:|---:|
| KIN LONG | 141 | 113 | 28 |
| Soleron | 7 | 0 | 7 |
| HuangXing | 2 | 0 | 2 |
| SIWAY | 2 | 0 | 2 |
| **TOTAL** | **152** | **113** | **39** |

Master file: `C:\Users\Hassa\Downloads\Nippon_Hardware_Complete.zip` (Excel + 143 source images).

The 113 mapped images came from parsing `xl/drawings/oneCellAnchor` records in the master xlsx — NOT from the `images/` folder which was a stale subset.

---

## 🗂️ FILES WE PRODUCED THIS SESSION

### Local Excel deliverables (in `C:\Users\Hassa\Downloads\`)
- `Nippon_Replace_All_v2.sql` — FINAL SQL to run
- `Nippon_Images_Final.zip` — FINAL images to upload
- `Nippon_Missing_Images.csv` — 39 photo-pending products
- `Nippon_Migration_README.md` — workflow doc
- `Nippon_Hardware_Complete.zip` — original master (Hassan provided)
- `Nippon_Products_CLEAN.xlsx` — earlier cleaned 446-product file (now superseded)
- `Nippon_Bulk_Import_V2_2026-05-20.xlsx` — pre-master bulk importer file (superseded)
- `Nippon_Image_Fix_FINAL.sql` — earlier image URL fix (applied; rolled into v2 logic)

### Working temp dir (do NOT delete — has the extraction state)
- `C:\Users\Hassa\AppData\Local\Temp\nippon_complete\`
  - `Nippon_Hardware_Master.xlsx` (the actual master)
  - `_xlsx_unzip/` (manual xlsx extraction)
  - `final_images/` (113 renamed photos)
  - `proper_extract.mjs` + `build_final.mjs` (extraction + SQL gen scripts)
  - `image_mappings.json` (product_id → image filename map)
- `C:\Users\Hassa\AppData\Local\Temp\nippon_work\` — older session, has `node_modules` (xlsx + exceljs + node-unrar-js)

---

## 🚀 DEPLOYED FIXES — ALREADY ON PROD

### 8 Nippon go-live phases + 13 commits today

| Commit | What |
|---|---|
| `1037649` | **Remove Brand column from print** (was last commit) |
| `7729f31` | Migration: correct image_url to real `product-images` bucket at root |
| `695ea32` | OB form fully de-glassified — pcs/rate flow, no sheet-size for Nippon |
| `d5253a7` | `activeCompany()` helper — fetches respect appStore.selectedCompany (was always GTK) |
| `ee14920` | Storage bucket image routing migration (older) |
| `66676bd` | Nippon prints — real brand + taller dropdown + compact editor |
| `c6fe3e4` | Finance accounts upsert deadlock fix |
| `7b4f2a0` | Quote row dropdown sources from storeItems (not products master) |
| `cb95e87` | `erp_trial_balance` RPC + 4 timeout indexes |
| `6bc942f` | localStorage quota fallback + JSONB-aware alert queries |
| `cdc771a` | Payroll numeric coercion + JSONB schema mappers + FK orphan filter |
| `9112ee2` | Batched product upsert + main_category persist + non-glass OB form |
| `8431bc4` | Inventory tabs cleanup + quote dropdown qty lookup |
| `7eb2c98` | Bulk Import (no-AI) + cascading category filter + 406 v_alert_unread fix |
| `8b05429` | Phase 0-4 audit + 6 SIT tests + UAT runbook |

### Test suite status
- `npm run test -- --run` → **318/318 passing**
- `npx tsc --noEmit` → only pre-existing P2/P3 strictness warnings in Nippon files (none from today's changes)
- Production build (`npm run build`) → clean, all chunks emitted

### Sales SIT (Nippon-specific GL tests)
File: `modules/__tests__/nippon_sit.test.ts` — 6 tests covering:
- N-01: Revenue posts to HARDWARE SALES INCOME (4120), not GLASS PROCESSING
- N-02: 17% GST creates 3-line balanced GL
- N-03: Invoice succeeds with zero production pieces (trading bypass)
- N-04: COGS = Σ(qty × MAP), balanced Dr 5114 / Cr 11514
- N-05: COGS plan null when no store match (no phantom GL)
- N-06: Full cycle trial balance closes

---

## 🔧 KEY CODE PATHS — CRITICAL FILES

### Sales side
- `modules/sales/companies/nippon/NipponProductMaster.tsx` — product master UI, has Bulk Import (green tab) + Smart Import (AI, red tab)
- `modules/sales/companies/nippon/components/NipponDirectImporter.tsx` — no-AI bulk importer with image extraction via ExcelJS
- `modules/sales/companies/nippon/NipponQuotationManager.tsx` — quote editor
- `modules/sales/companies/nippon/useNipponQuotations.ts` — quote hook
- `modules/sales/services/deliveryInvoiceService.ts` — invoice generation, has Nippon trading-COGS branch + revenue chain branch
- `modules/sales/services/asyncSalesService.ts` — all 12+ fetch methods use `activeCompany()` helper

### Inventory side
- `modules/procurement/components/inventory/StockOverview.tsx` — cascading Main → Sub filter
- `modules/procurement/components/inventory/OpeningBalance.tsx` — 38 isGlassCompany gates, fully Nippon-aware
- `modules/procurement/components/inventory/NipponGoodsReceipt.tsx` — GRN intake. ⚠ **NO GL POSTING YET** (P1 deferred — see Known Gaps below)
- `modules/procurement/pages/InventoryModule.tsx` — tab visibility per company

### Print
- `modules/nippon/prints/NipponQuotationPrint.tsx` — Brand col REMOVED
- `modules/nippon/prints/NipponSalesOrderPrint.tsx` — Brand col REMOVED

### Shared
- `modules/shared/services/utils.ts` — `safeSave` with quota fallback (strips imageUrl on 5MB hit)
- `modules/shared/components/ErrorBoundary.tsx` — stale-chunk auto-reload
- `src/services/SyncService.ts` — JSONB push mappers fixed for tag_master / departments / cost_centers; payroll numeric coercion; FK orphan pre-flight

### COA
- `modules/finance/constants/coa.nippon.ts` — 218 lines, trading COA with Hardware Inventory + Hardware Sales chain

---

## 📋 KNOWN GAPS / DEFERRED P1

### 🛑 `NipponGoodsReceipt` — missing GL posting
Currently updates `store_items` + `material_ledger` but does NOT call `FinanceService.postJournal`. Every hardware GRN silently skips:
```
Dr Hardware Inventory (11514) / Cr Accounts Payable (21111-21113)
```
Result: Inventory account stays at 0, AP never reflects vendor balance. **Blocker for accurate trial balance.**

Fix path: mirror what `GTKStoreReceipt.tsx` does (it calls `FinanceService.settleAdvance` after GRN). Need to add same GL call after `InventoryService.saveStore`.

### ⚠️ GRN Register columns are glass-centric for Nippon
`modules/procurement/components/inventory/GRNRegister.tsx` shows Sheets / SqFt / Weight columns — all zero for hardware. Should switch to Qty / Unit / Value for non-glass.

### ⚠️ Goods Issue requires Cost Center
`GoodsIssue.tsx:32` validates `!issueData.costCenterId` — Nippon may not have cost centers configured, blocking the tab.

### ⚠️ 39 products without images
Listed in `Nippon_Missing_Images.csv`. Need photos from suppliers (Soleron + HuangXing + SIWAY) + KIN LONG newer items.

### ⚠️ Prices set at RMB × 50 → PKR
The conversion rate is hardcoded in `Nippon_Replace_All_v2.sql`. If actual FX rate differs, run:
```sql
UPDATE products SET base_price = ROUND(base_price * <new_rate> / 50),
       cost_price = ROUND(cost_price * <new_rate> / 50)
WHERE company = 'Nippon';
```

### Pre-existing P2/P3 (deferred to post-go-live sprint)
- 619 pre-existing TS strictness errors (any-types, missing imports in NipponQuotationManager) — documented in `docs/testing/NIPPON_AUDIT.md`
- Smart Import (AI) tab — gemini-proxy edge function fails CORS because it imports `_shared/auth.ts` which doesn't exist in dashboard-deployed functions. **Workaround: use Bulk Import (green tab) which has no AI dependency.**

---

## 🌐 SUPABASE PROJECT INFO

- **URL:** `https://wfytbcmazixddtwpbego.supabase.co`
- **Project ID:** `wfytbcmazixddtwpbego`
- **Bucket for images:** `product-images` (public, root-level files, no subfolder)
- **Image URL pattern:**
  ```
  https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/{filename}
  ```
- **Anon key:** embedded in public JS bundle (`eyJhbGc...` extracted to `/tmp/nippon_work/bundle.js` line where appears)

### `products` table schema (JSONB-hybrid)
Has both flat columns AND a `data` jsonb. Flat columns we use:
`id, company, category, sub_category, main_category, description, model_no, brand, image_url, finish_color, direction, material, unit, cost_price, base_price, hs_code, updated_at`

---

## 🇵🇰 LOCAL TERM GLOSSARY (Hassan's trade terms)

| Term | Means |
|---|---|
| Pati / Patti / Roll Pati | Gear rail / rolling rail |
| Stay (Lahori / Latoo / Pig / Bottom) | Friction stay variants — local names |
| Jali (Fiber Jali, SS Jali) | Mesh / netting |
| ESPG / Gear Set | Espagnolette / multi-point lock |
| Stoper / Local Stoper | Door / window stopper |
| Kaplar | Cup-shaped gasket |
| Tower Bolt / Towerbolt | Sliding door bolt |
| Sliding Keeps / Openable Keeps | Strike plates |
| Lift & Slide | Heavy-duty sliding door system |
| Slicon / Slicon Pouch | Silicone (typo) |
| Cockuspur | Cockspur (typo) |
| Cousion | Cushion (typo) |
| Screew | Screw (typo) |

---

## 🔍 USEFUL CONSOLE COMMANDS (for Hassan in DevTools)

### See what's bloating localStorage
```js
console.table(Object.entries(localStorage)
  .map(([k,v]) => ({ key: k, kb: (v.length/1024).toFixed(1) + ' KB' }))
  .sort((a,b) => parseFloat(b.kb) - parseFloat(a.kb))
  .slice(0, 15));
```

### Clear local cache (force fresh Supabase fetch on reload)
```js
['gtk_erp_products','gtk_erp_store','gtk_erp_stock_ledger',
 'gtk_erp_quotations','gtk_erp_invoices','gtk_erp_clients',
 'gtk_erp_vendors','gtk_erp_grn_sheet_entries','gt_error_log']
  .forEach(k => localStorage.removeItem(k));
(async () => {
  const dbs = await indexedDB.databases();
  for (const db of dbs) indexedDB.deleteDatabase(db.name);
  setTimeout(() => location.reload(), 1000);
})();
```

### After deploy — flush stale chunks
```
Ctrl + Shift + R  (Windows)
```

---

## 🤝 CONTINUE FROM HERE

If Hassan says "ye SQL run kar diya" → ask which one (the v2) and confirm verification counts (152 / 113 / 4 brands).

If Hassan reports a fresh error after running SQL → check console first (image 404s mean bucket upload incomplete; FK errors mean RLS or schema issue).

If Hassan wants to wire `NipponGoodsReceipt` GL posting → mirror `GTKStoreReceipt.tsx` pattern, post `Dr Hardware Inventory / Cr AP` using `FinanceService.postJournal()`. This is the next P1 to close.

If Hassan wants to fix `GRNRegister` glass-centric columns → gate the Sheets / SqFt / Weight columns behind `company === 'Glassco'` like we did for StockOverview and OpeningBalance.

**Test discipline:** Before any commit, run `npx tsc --noEmit` and `npm run test -- --run`. 318/318 must stay green. New features add new SIT tests (mirror `nippon_sit.test.ts` pattern).
