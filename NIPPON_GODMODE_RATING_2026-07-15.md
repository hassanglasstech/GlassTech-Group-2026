# Nippon (Hardware Trading) — God-Mode Rating

**Date:** 2026-07-15 · **Branch:** GT-Production · **Method:** 5 parallel principal-level
auditors (sales/quote flow, finance/GL, product-master/import, prints/inventory/reliability,
shared-engine parity) doing real file reads + live Supabase (MCP, read-only) queries. Same
rubric + weights as [GLASSCO_GODMODE_RATING_2026-07-12.md](GLASSCO_GODMODE_RATING_2026-07-12.md).
Brutal, evidence-first — every finding cited to `file:line` or a live DB query.

> **Why this exists:** Nippon and Glassco are **one multitenant codebase**. So most of
> Glassco's 2026-07-12 P0s are *shared-engine* — they hit Nippon too. This audit rates Nippon
> to the identical standard, and separates **NIPPON-SPECIFIC** findings from **SHARED-ENGINE**
> ones (fix-once-benefit-all-companies).

---

## Overall: **4.4 / 10** as-audited → **~4.8** after this session's engine+parity fixes

Same tier as Glassco's 4.6 — **same engine, same disease.** Nippon is a real, mostly
end-to-end trading ERP (product master + import + image pipeline, quotation/SO with free
samples, delivery-invoice trading COGS, GRN, catalogue, prints, a real trading COA). But the
**money-trust layer underneath is broken in the same places as Glassco**, plus Nippon-specific
gaps: a GL model that posts to **phantom, non-existent account codes** and has **no hard COGS
gate**, importers that **report success before the cloud round-trip**, and delete/save/void
paths that **show a green toast when the cloud write silently failed**.

Crucially, **almost none of Nippon's finance risk has ever detonated**: live DB shows
**0 invoices, 0 ledger rows** for Nippon, and finance GL sits behind the default-OFF
`financeGLEnabled` flag. So for a **single-entry, flag-OFF go-live** (Sales + inventory, no GL),
Nippon is much closer to ready than the raw finance score implies — see "Go-live posture."

### Scorecard (weights identical to Glassco rating)

| # | Dimension | Weight | Grade (as-audited) | After today | One-line verdict |
|---|-----------|:---:|:---:|:---:|------------------|
| 5 | **Feature Completeness** | 12% | **6.8** | 6.8 | Real end-to-end trading flow; narrower scope than Glassco by design |
| 2 | **Security, Auth & RBAC** | 15% | **6.2** | 6.4 | Owner de-scoped + RLS role/module gates landed; UI deep-link leak fixed today |
| 3 | **Finance & GL Correctness** | 25% | **3.8** | 3.8 | Posts to phantom codes (4120/12210); no hard COGS gate — all latent (0 ledger, flag OFF) |
| 1 | **Architecture & Code Quality** | 8% | **3.8** | 3.9 | Two Product Masters, two Product types, 33 `as any`, cloned prints |
| 8 | **Ops, Build & Schema Governance** | 3% | **4.0** | 4.0 | COA constants ≠ live COA — no seed reconciliation |
| 7 | **Testing & QA** | 5% | **3.2** | 3.2 | 6 SIT tests, but they seed a COA that has codes prod lacks → false green |
| 4 | **Data Integrity & Persistence** | 20% | **3.4** | **4.6** | Delete/save/void/import silently swallowed cloud failures → **fixed today** |
| 6 | **Reliability, Error Handling & UX** | 12% | **3.5** | **4.6** | Green-toast-lies + print blank-screen + stuck dashboard → **fixed today** |

*Weighted as-audited = **4.38**. After this session's shared-engine + parity fixes = **~4.79**.
With the finance P0 COGS gate + COA reconcile (founder DB actions) and finance left OFF for
go-live → a defensible **~6.5–7** for single-user trading.*

---

## 🔴 GO-LIVE BLOCKERS (P0)

1. **[NIPPON, FINANCE] No hard COGS-at-delivery gate → revenue posts with COGS = 0.**
   For Nippon the pieces-gate is bypassed and `buildNipponTradingCOGSPlan` merely *excludes*
   unmatched lines (`console.warn` + `toast.warning`), returning `ledgerTx:null` if every line
   is unmatched. The main AR/Revenue GL always posts. Glassco `throw`s for the identical
   condition; Nippon does not. → A hardware line whose ref doesn't resolve to a store item
   (common: product never GRN'd) posts **Revenue in full, COGS = 0, inventory unrelieved** —
   gross profit overstated by the whole line. `deliveryInvoiceService.ts:131-164, 344-371`.
   *Latent: 0 Nippon invoices; only fires when `financeGLEnabled` is turned ON.*

2. **[NIPPON, FINANCE] Revenue + AR resolve to phantom account codes that don't exist in the
   live COA.** `ensureAccount` matches **by code only** and **auto-creates** any missing code
   (`financeService.ts:912-921`). The service asks for Revenue **4120** and AR **12210** — the
   live Nippon COA has **41124** (Wholesale Sales — General Hardware) and **1121 / 11213**
   (no 4120, 12210, 40, 50, 10, 122, 1221 — verified live). Result: phantom leaves are silently
   created under the real roots, so **totals balance but the canonical leaves read zero**, and
   AR **commingles every customer into one auto-created 12210 leaf** (named after client #1) →
   per-customer AR aging impossible. `deliveryInvoiceService.ts:374-382, 387-392`.
   *Latent: 0 ledger rows; detonates on first live invoice with GL ON.*

## 🟠 Serious (P1)

- **[SHARED-ENGINE, DATA] `ClientMaster` deleted clients via filtered-upsert — never removed
  the cloud row.** `saveClients(all.filter(c=>c.id!==id))` upserts the survivors but issues no
  DELETE, so the "deleted" client is re-materialised by the next `getClients`. **This is the
  exact "client delete kiya, green toast, wapas aa gaya" bug.** Not RLS, not stale session.
  `ClientMaster.tsx:106`. **← FIXED today** (now per-row `deleteClient` + error surfaced).
- **[SHARED-ENGINE, DATA] `_deleteRow` / `saveClients` swallowed cloud failures** (Logger +
  `_queueRetry`, no return) → callers showed green success on a failed cloud write; deletes
  "came back," saves lived only in localStorage. `asyncSalesService.ts:98-117, 170-201`.
  **← FIXED today** (both now return `{ error }`; every delete/save caller gates on it).
- **[SHARED-ENGINE, DATA] `getQuotations` / `getProducts` dropped local-only unsynced rows**
  (unlike `getClients`), so `warmCache` erased an approved SO whose stock was already
  decremented. `asyncSalesService.ts:455-456, 232-251`. **← FIXED today** (both now union
  `pendingLocal`).
- **[NIPPON, DATA] `handleVoid` returned stock before the cloud save and ignored the result**
  → cloud write fails, stock returned locally, order still Approved in cloud → re-void doubles
  the return. `useNipponQuotations.ts:540-551`. **← FIXED today** (save-cloud-first, then
  stock; gated on error).
- **[NIPPON, FINANCE] GRN is a non-atomic torn write; ignores `post_grn_atomic`.**
  `orchestrateNipponGRN → recordTransaction → saveLedger` fire-and-forget (`financeService.ts:601`
  not awaited), then separately writes stock. A server-side rejection (period lock/RLS/imbalance)
  is queued to retry while stock commits and a green "GL posted" toast shows → inventory-GL vs
  stock-ledger drift, AP understated. `NipponGoodsReceipt.tsx:176-244` · `grnGLService.ts:826-838`.
- **[NIPPON, FINANCE] Per-brand inventory debited at GRN, always credited to 11514 at delivery.**
  GRN debits KIN LONG→11511 / Aluminium→11512 / UPVC→11513; `buildNipponTradingCOGSPlan`
  hardcodes the credit to **11514** → 11511 never relieved (overstated), 11514 driven negative.
  `grnGLService.ts:708-716` vs `deliveryInvoiceService.ts:170,194`.
- **[SHARED-ENGINE, RELIABILITY] Print blank-screen on legacy data.** `item.pricePerUnit.toLocaleString()`
  / `item.amount.toLocaleString()` unguarded against the documented legacy `rate`-only shape,
  with no ErrorBoundary at the call site → whole SO screen white-screens.
  `NipponQuotationPrint.tsx:315-316` · `NipponSalesOrderPrint.tsx:314-315`. **← FIXED today**
  (`?? item.rate ?? 0`).
- **[SHARED-ENGINE, RELIABILITY] Dashboard boot had no `try/finally`** → any rejected load left
  every company's home stuck on the spinner forever. `Dashboard.tsx:26-48`. **← FIXED today.**
- **[NIPPON, IMPORT] Importers report "Imported ✓" before the cloud round-trip** (fire-and-forget
  `SalesService.saveProducts`), and a base64 image-upload failure is only `Logger.warn` → "185
  imported" while the cloud got a subset. `NipponDirectImporter.tsx:278,313` · `NipponSmartImporter.tsx:430`.
- **[NIPPON, IMPORT] Partial-sheet re-import silently overwrites enriched rows** (by-id REPLACE,
  not field-merge) → a slim `description+unit` re-upload wipes `base_price`, `brand`, specs and
  the 4 surviving `image_url`s to 0/''. `NipponDirectImporter.tsx:264-278` · `NipponProductMaster.tsx:527`.
- **[NIPPON, IMPORT] Smart importer appends with no dedup** (ephemeral `NIP-IMP-<ts>` ids) →
  a full duplicate product set on every run. `NipponSmartImporter.tsx:333,406`.
- **[NIPPON, SECURITY] Inventory deep-link mounted glass-only modules for Nippon** — only the
  tab buttons were company-gated, not the content blocks; `#/...?invtab=mrp` mounted GlasscoMRP /
  RemnantManager / WeightMaster. `InventoryModule.tsx:283-324`. **← FIXED today** (content blocks
  now company-gated). *(Data was always RLS-isolated; this was a UI-surface leak.)*
- **[SHARED-ENGINE, TYPE] `saveProductionPieces`, `getProductionPiecesPage`, `SyncService`
  silent-success, `owner` over-scope — all FIXED** since 2026-07-12 (verified live +
  `file:line` in the parity sweep). These no longer affect either app.

## 🟢 Genuinely strong (credit where due)

- **Security is real now:** `auth_user_is_super()` drops `owner` (verified live); RLS role/module
  gates landed (`auth_can_write`); every sales fetch pushes `.eq('company', activeCompany())`.
  ammar (owner, Nippon-only) gets **no** cross-company DB access.
- **Invoice write IS atomic** (`post_invoice_atomic` with server-side balance asserts +
  duplicate guard); COGS/inventory/tax **leaves that exist** (51114 / 11514 / 21211) post
  correctly; maker-checker is satisfied (rows are DR/KR, not gated JV).
- **Base64→bucket→public-URL swap works and degrades gracefully** (live DB: 0 base64, 4 http,
  181 empty) — "products never persist" is fixed at the engine.
- **Company gating in Stock/OpeningBalance is airtight** — no sqft/sheet/weight/glass leak into
  Nippon (auditor-verified `file:line`).
- **Catalogue page is solid** — broken-image fallback + empty-state + company guard.

---

## Go-live posture (single-entry, finance-OFF)

For the **immediate go-live** (Sales quotations/SOs + inventory, `financeGLEnabled = OFF`):
- The two **finance P0s do NOT fire** (no GL is posted). They become blockers only when GL is
  switched on — so they are **deferrable**, not launch-blocking, for single-entry.
- The **data/reliability P1s that WERE launch-blocking are fixed today** (client delete, quote
  save FK surfacing, void double-return, unsynced-row loss, print crash, stuck dashboard).
- **Remaining launch-relevant items:** importer false-success + partial-overwrite (F1/F2) and
  Smart-importer dedup (F4) — these bite the **next bulk product import**, not day-one selling.

---

## What I changed this session (shared-engine + parity — verified: tsc clean, 226 tests green)

**Shared-engine (fix-once, every company benefits — GTK/GTI/Glassco/Nippon):**
1. `_deleteRow` → returns `{ error }`; `deleteClient/deleteProduct/deleteQuotation` propagate it.
2. `saveClients` → returns `{ error }` (mirrors `saveQuotations`).
3. `getQuotations` + `getProducts` → union local-only unsynced rows (mirror `getClients`).
4. `ClientMaster.handleDelete` → per-row `deleteClient` (kills the filtered-upsert resurrection)
   + error-gated; `handleSave` → gated on cloud error.
5. `Dashboard` boot → `try/catch/finally` (no more stuck spinner, any company).
6. Nippon print scalar guards (`?? rate ?? 0`) — blank-screen fix.

**Nippon parity/hardening:**
7. `useNipponQuotations` — client-push gated (clearer than the raw FK error), `handleDelete`
   gated, `handleVoid` reordered to save-cloud-first + gated.
8. `NipponProductForm` — image-upload failure degrades gracefully (save product without image).
9. `InventoryModule` — glass-only content blocks company-gated (deep-link leak closed).

## Recommended next (not done — needs founder DB action or sign-off)

**Founder DB (I cannot write — MCP is read-only):**
- **Do NOT enable `financeGLEnabled` for Nippon** until P0-1 (COGS gate) + P0-2 (COA codes) are fixed.
- **Reconcile the Nippon COA**: either seed 4120/12210/etc., or (better) point the service at the
  live leaves (41124 revenue, 51114 COGS, 11213/1121 AR, per-brand 11511-11514 relief).

**Code (next session, needs finance sign-off per CLAUDE.md "never change GL without review"):**
- Add the hard COGS gate for Nippon (mirror Glassco's `throw`, behind `financeGLEnabled`).
- Route Nippon GRN through `post_grn_atomic`; credit inventory per-brand at delivery.
- Importers: field-MERGE on re-import (don't blank enriched rows); Smart-importer dedup by code;
  await the cloud save before declaring success.
- Delete dead code: `system/companies/nippon/NipponProductMaster.tsx`, `NipponCatalogPrint.tsx`,
  `NipponJobCardPrint.tsx` (+ its `NipponPrintTemplate` case).

*Bottom line: Nippon grades the same tier as Glassco because they share an engine whose money-
trust layer was the weak point. The shared-engine data/reliability holes are fixed this session
(lifting BOTH apps); Nippon's finance model is latent-but-wrong and must stay flag-OFF until its
two P0s are closed. Flag-OFF single-user trading go-live is within reach at ~6.5–7.*
