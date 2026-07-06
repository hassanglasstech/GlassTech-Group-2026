# GlassTech ERP — Go-Live Punch List

> Interactive version: [GO_LIVE_CHECKLIST.html](GO_LIVE_CHECKLIST.html) (open by double-clicking the file — tick + notes auto-save in the browser).
> This `.md` is the plain-text mirror for git / review. Tick `- [ ]` → `- [x]` as items complete.

**Readiness:** Conditionally ready for a disciplined **single-operator** go-live (Glassco + Nippon). **Not** ready for multi-user, nor for GTK/GTI/Factory as real trading entities.

**Legend:** `P1` go-live/high · `P2` important, workaround exists · `P3` minor/cleanup · effort `S` hours · `M` ~a day · `L` multi-day

---

## A · Go-live blockers (before real users rely on it)

- [ ] **A1** `P1` `S` — **Apply/verify migration 094 on live Supabase**
  - Why: CN server-side FOR-UPDATE lock; without it a credit note after a receipt (or 2nd device) can over-credit AR past zero + double-count receipt. Client half already live.
  - Where: `094_cn_atomic_live_balance_recheck.sql` · HASSAN_ACTION_ITEMS.md:9 (unchecked)
- [ ] **A2** `P1` `S` — **Run founder UAT — 6 browser scenarios**
  - Why: quotation save-persist (Glassco+Nippon), company-switch isolation, multi-qty COGS≠5x, Service-Only toggle, GL-Posted tab locked, finance report re-scope on switch.
  - Where: HASSAN_ACTION_ITEMS.md:11-18
- [ ] **A3** `P1` `M` — **Nippon Phase-5 full-cycle smoke test**
  - Why: GRN→quote→SO→issue→invoice→receipt; Trial Balance closes at every step.
  - Where: RESUME_HERE.md:130-144
- [ ] **A4** `P1` `S` — **Custom SMTP for OTP emails (or hide OTP login)**
  - Why: OTP relies on Supabase built-in sender (~2-4/hr, no deliverability) → lockouts under load. Email+password path exists, so hiding OTP button is an OK shortcut.
  - Where: supabase/config.toml (no smtp) · LoginPage.tsx:161,510
- [ ] **A5** `P1` `M` — **Schedule + monitor off-site backup + one restore drill**
  - Why: Live financials, bus-factor 1. Silent backup failure is found only when a restore is needed.
  - Where: GODMODE P1 #15 · scripts/nightly-export.js
- [ ] **A6** `P3` `S` — **Tag release v1.0.0-nippon-go-live after smoke+deploy**
  - Why: Named rollback point once smoke test is green.
  - Where: RESUME_HERE.md:154

## B · Financial correctness / data integrity

- [ ] **B1** `P1` `M` — **Double-invoice: post_invoice_atomic patch flat status/items + unique index on invoices(order_id)**
  - Why: getQuotations rebuilds status from flat r.status → cloud 'Approved' beats data.status 'Invoiced' → invoiced order re-appears invoiceable, can invoice twice → double revenue + COGS. Most dangerous open money bug.
  - Where: 042_atomic_rpcs.sql:188 · asyncSalesService.ts:355
- [ ] **B2** `P1` `S` — **Decide costing rule for Nippon stock sold before received (un-costed COGS=0)**
  - Why: Unreceived item MAP 0 → COGS 0 → margin overstated, 11514 can go negative. Founder decision: cost 0 / flag / Service-Only.
  - Where: deliveryInvoiceService.ts:138 · HASSAN_ACTION_ITEMS.md:24
- [ ] **B3** `P2` `M` — **GTKStoreReceipt GL imbalance (credit total, debit OK-only) — also mounted for Glassco**
  - Why: Any damaged/short line → voucher fails LedgerImbalanceError forever & damaged value vanishes. Blocks live Glassco receipts too. Add double-click guard.
  - Where: GTKStoreReceipt.tsx:270,324 · InventoryModule.tsx:355
- [ ] **B4** `P2` `S` — **Nippon trading COGS never reduces store_items.totalValue (storeUpdates empty)**
  - Why: Sub-ledger totalValue overstates GL 11514 by cumulative COGS; MAP inflates. Breaks stock↔GL recon.
  - Where: deliveryInvoiceService.ts:559,642
- [ ] **B5** `P2` `M` — **reverseDeliveryCOGS is glass-only → Nippon CN never restores store subledger**
  - Why: Match keyed to glass inventory acct + category 'Raw'; Nippon uses 11514 + hardware cats. Each Nippon CN drifts stock↔GL.
  - Where: glasscoGLDelivery.ts:390
- [ ] **B6** `P2` `M` — **3-way-match Override pays PO total, skips MIRO AP entry**
  - Why: >2% mismatch: sets Matched, pays PO total (not invoice amt), no GL → GR/IR open forever, AP negative, vendor overpaid.
  - Where: ThreeWayMatching.tsx:306
- [ ] **B7** `P2` `M` — **Tempering inward double-counts cost (RAW MAP bump + WIP debit)**
  - Why: Tempering charge added to raw store MAP AND Dr WIP 11513 → cost hits P&L via inflated MAP-COGS and sits in WIP forever.
  - Where: glasscoGLService.ts:262
- [ ] **B8** `P2` `M` — **Per-client AR all share code 12210 → ensureAccount merges into one**
  - Why: 2nd client's AR debits post to 1st client's account. Total AR right, per-client statements meaningless.
  - Where: deliveryInvoiceService.ts:357 · financeService.ts:907
- [ ] **B9** `P2` `M` — **Purchase-return credits Inventory at user rate×qty; stock clamps at MAP; no movement row**
  - Why: Return over on-hand / non-MAP rate desyncs inventory GL vs subledger, no audit trail.
  - Where: PurchaseReturnModule.tsx:250
- [ ] **B10** `P2` `M` — **GRN MIGO rollback restores only localStorage; cloud stock rows remain**
  - Why: Async upserts fire before GL validation; 'rolled back' GRN leaves 101 receipt + qty in Supabase. Needs post_grn_atomic RPC or explicit DELETEs.
  - Where: GoodsReceiptMIGO.tsx:746
- [ ] **B11** `P2` `S` — **isTaxEnabled treats fetch error as tax-OFF → GST-free (illegal) invoice**
  - Why: Transient RLS/network blip forces gst=0, understates Sales Tax Payable, legally wrong invoice.
  - Where: taxSettingsService.ts · deliveryInvoiceService.ts:288
- [ ] **B12** `P2` `S` — **Add PeriodService.assertOpen guards + fix period fail-open**
  - Why: Nippon GRN never checks isPeriodOpen; and isPeriodOpen returns true when 0 periods configured → fiscal lock inert, back-dated postings possible.
  - Where: periodService.ts:71 · NipponGoodsReceipt.tsx
- [ ] **B13** `P2` `S` — **Dashboard/Insights GL loop skips whole line on unresolved account**
  - Why: 'if(!a) continue' before accumulating → balanced entry counts one side → false 'GL off'; both unresolved → imbalance shows 'Balanced'.
  - Where: dashboardMetricsService.ts:198
- [ ] **B14** `P2` `S` — **Insights revenue/DSO/collection include Voided invoices**
  - Why: rev90/clientRev iterate invoices unfiltered; voided large invoice inflates revenue trend, disagrees with GL.
  - Where: dashboardMetricsService.ts:241
- [ ] **B15** `P2` `M` — **ReportsHub GST/Sales selects nonexistent grand_total → blank; no reload on switch**
  - Why: Live table uses total_amount → query blank (swallowed). Report useEffects empty-deps → wrong company after switch.
  - Where: ReportsHub.tsx:743,900 · ProjectProfitability.tsx:58
- [ ] **B16** `P2` `S` — **AR-aging filters status 'Void' but app writes 'Voided'**
  - Why: JS fallback (production path) misses 'Voided' → voided invoices inflate aging buckets.
  - Where: financeService.ts:1264
- [ ] **B17** `P2` `M` — **Ledger sync drops data JSONB (req_id) → paid reqs/advances read outstanding forever**
  - Why: TABLE_COLUMNS.ledger omits data/req_id, no pull mapper → postParkedPV can't flip req to Paid.
  - Where: SyncService.ts:189
- [ ] **B18** `P2` `M` — **Requisitions two cloud writers + pull mapper ignores r.data → double GRN/advance-settle**
  - Why: Pull reads req un-received → can GRN + advance-settle twice, double-posting AP.
  - Where: SyncService.ts:1056
- [ ] **B19** `P2` `S` — **Invoice GL mirror writes localStorage only; _cache.ledger stale → same-session void loses COGS**
  - Why: getLedger returns _cache; post invoice then void same session → reverseDeliveryCOGS can't find COGS.
  - Where: deliveryInvoiceService.ts:626
- [ ] **B20** `P2` `M` — **Super-admin PERMANENT DELETE of a sales order deletes nothing in Supabase**
  - Why: saveQuotations/saveProductionPieces are upsert-only → order + pieces resurrect on next pull.
  - Where: SalesOrders.tsx:222 · productionService.ts:256
- [ ] **B21** `P2` `S` — **Nippon/generic quotation delete is a no-op**
  - Why: filtered upsert never deletes; toast says deleted but quote survives & re-lists. Route via AsyncSalesService.deleteQuotation.
  - Where: useNipponQuotations.ts:427 · useQuotations.ts:221
- [ ] **B22** `P2` `L` — **Intercompany invoice mirror heuristic + strict-RLS-hostile**
  - Why: Name-substring auto-purchase can misfire; getAccounts filtered to active company (mirror no-ops); target-company insert rejected by 086 → invoice aborts.
  - Where: deliveryInvoiceService.ts:446-458
- [ ] **B23** `P2` `M` — **Factory Desk MIS hardcodes 'Glassco', includes Parked/Draft, 0.65 GP heuristic**
  - Why: Management screen: 0 for non-Glassco, counts unposted vouchers, shows fabricated 0.65× gross profit.
  - Where: FinancialStatementsMobile.tsx:86,87,121
- [ ] **B24** `P2` `S` — **Legacy CN approve path has no GL-<cnId> duplicate guard**
  - Why: Two rapid Approve clicks both post GL-<cnId>, doubling AR/revenue reversal until next cloud pull.
  - Where: creditNoteService.ts:328 · financeService.ts:941
- [ ] **B25** `P2` `M` — **CN reject/void validates local status then unconditional cloud upsert**
  - Why: No conditional UPDATE on status, no realtime on credit_notes → register vs ledger disagree.
  - Where: creditNoteService.ts:410,509
- [ ] **B26** `P2` `M` — **GeneralLedger edit/post of server-only doc = silent no-op but alerts 'Success'**
  - Why: Maps over boot-company cache; cold/other-device/post-switch doc matches nothing → user thinks it posted.
  - Where: GeneralLedger.tsx:194,214
- [ ] **B27** `P2` `S` — **Atomic CN/void RPC bypasses fiscal-period-close gate**
  - Why: approveCreditNote/voidInvoice have no PeriodService check → CN/void into closed period corrupts finalized statements.
  - Where: creditNoteService.ts:305
- [ ] **B28** `P3` `S` — **Voucher can Post with amount lines that have no G/L account**
  - Why: isBalanced only checks Σdr===Σcr>0; accountId '' passes → one-sided posting; TB drops empty line.
  - Where: GeneralLedger.tsx:175
- [ ] **B29** `P3` `S` — **Thickness/material match by name.includes (6 matches 16mm; fallback store[0])**
  - Why: Substring + first-item fallback prices tempering/COGS at wrong material's MAP.
  - Where: glasscoGLService.ts:143 · glasscoGLHelpers.ts:155
- [ ] **B30** `P3` `S` — **Nippon manual-serial uniqueness read-then-write, no DB constraint**
  - Why: No partial unique index on (company, manual_serial); two devices mint same serial, upsert overwrites one quote.
  - Where: useNipponQuotations.ts:332
- [ ] **B31** `P2` `M` — **Write 6 Nippon inventory SIT tests**
  - Why: Nippon inventory GL chain (GRN/GoodsIssue/OpeningBalance) has no automated GL-balance proof.
  - Where: missing nippon_inventory_sit.test.ts

## C · Security

- [ ] **C1** `P2` `S` — **Verify 068 anon-write REVOKE is live (COUNT=0 check)**
  - Why: Anon key ships in public JS bundle. If not revoked, anyone can wipe products/store_items/ledger via REST.
  - Where: RESUME_HERE.md:185-188 · task #56
- [ ] **C2** `P3` `S` — **Fix MIGRATION_GUIDE / APPLY_MIGRATION_NOW (they end with GRANT ALL TO anon)**
  - Why: Re-running these guides re-opens the exact anon holes 085/086/092 closed. Drop the block or mark superseded.
  - Where: MIGRATION_GUIDE.md:147-154 · APPLY_MIGRATION_NOW.md:103-110
- [ ] **C3** `P3` `M` — **Maker-checker identity enforced server-side (not client string)**
  - Why: actor = fullName||email; 090 checks only status, not createdBy vs auth.uid() → maker can approve own CN.
  - Where: CreditNoteModule.tsx:30 · 090_...sql:75-84
- [ ] **C4** `P3` `S` — **090 CN/void RPCs need company predicate (super-admin cross-company hazard)**
  - Why: UPDATE WHERE id=... with no AND company=...; super-admin bypasses RLS → company switch between load & click can void another company's doc. Fix before applying 090/094.
  - Where: 090_...sql:99,174,213

## D · Per-company completeness

- [ ] **D1** `P2` `L` — **GTK production is a 15-line placeholder** (no fabrication flow) — build or remove from switcher. `modules/system/pages/GTKProduction.tsx` · task #54
- [ ] **D2** `P2` `L` — **GTI is a pure stub (COA aliases GTK)** → would post to GTK's chart. Build COA or remove from switcher. `coa.gti.ts` · coa.index.ts:18
- [ ] **D3** `P2` `M` — **Factory hub dashboard renders hardcoded mock metrics** (`{expenses:500000,...}`). `FactoryProduction.tsx:54`
- [ ] **D4** `P2` `M` — **Generic (GTK/GTI) approve flow still has pre-Phase-2 hazards** (ghost pieces, serial-only filter, LS-snapshot id). `useQuotations.ts:210`
- [ ] **D5** `P2` `S` — **getQuotations empty-cloud fallback returns full unfiltered local cache** → Nippon sees cached Glassco rows. `asyncSalesService.ts:377`
- [ ] **D6** `P3` `S` — **Nippon image URL fix + dedup duplicate product rows (DB data).** RESUME_HERE.md:69-101
- [ ] **D7** `P3` `S` — **Optional: finer per-brand Nippon inventory routing** (only KIN LONG→11511; others commingle 11514). `grnGLService.ts`

## E · Scale & multi-user

- [ ] **E1** `P2` `M` — **Company-scope the SyncService boot/full-table pull** (unfiltered select(*) across all tables — cold-boot latency + cross-company cache). `SyncService.ts:1601`
- [ ] **E2** `P1` `L` — **Row-level dirty-set + delete propagation on PO/requisitions/store_items/production_pieces** (whole-array upsert → 2nd user resurrects/clobbers). GODMODE P0 #3/#5
- [ ] **E3** `P2` `L` — **Wire optimistic locking to the 5 unprotected tables** (043 version cols exist; only production_pieces uses it). `versionedUpdate.ts`
- [ ] **E4** `P2` `L` — **Replace full-table loads / all-time LS mirror with pagination + server aggregation** (088 RPCs only fallback). `financeService.ts:203`

> Full scale/multi-user architecture roadmap in the **Appendix** below.

## F · Tech-debt / code quality

- [ ] **F1** `P2` `L` — **Tenant registry + consolidate 3 quotation impls** (~189 company-string branches). GODMODE:9,14
- [ ] **F2** `P2` `L` — **Replace inline-copy tests with real-logic tests + add E2E smoke.** GODMODE P1 #13
- [ ] **F3** `P3` `S` — **Delete dead GoodsReceiptMIGO.tsx** (1582 lines; confirm no importers).
- [ ] **F4** `P3` `L` — **Decompose god-files** (TestSuite 1897, Requisitions 1837, financeService 1628, MIGO 1582, UserAccessManager 1532).
- [ ] **F5** `P3` `M` — **Finish logging discipline — 21 console.log left** (CLAUDE.md bans in prod).
- [ ] **F6** `P3` `S` — **Orphaned desktop FinancialStatements.tsx wrong COA prefixes** (bug re-enters if re-wired).
- [ ] **F7** `P3` `M` — **Unify Vendor Hub chrome + hide zombie pages for Nippon** (StockAging, VendorScorecard, SupplyChainDashboard).

---

## Top 5 next actions (recommended order)

1. `A1`+`A2`+`A3` — Apply/verify 094, run UAT (6 scenarios), Nippon Phase-5 smoke. **The go-live "verified" gate.**
2. `A4` — OTP → SMTP or hide button. Login reliability.
3. `B1` — Double-invoice fix (flat status + unique index). Biggest open money bug.
4. `B3` — GTKStoreReceipt imbalance (also mounted for Glassco).
5. `B2` + `B4` + `B5` — Un-costed rule + two Nippon stock↔GL fixes. Trustworthy Nippon P&L.

---

## Appendix — Scale / Multi-user foundations (fix NOW, cheap now / expensive later)

**Root cause:** whole-table array cache is the write-of-record → every save pushes the whole array (last-write-wins) → silent data loss with 2+ users. Shift to **row-level writes + server-authoritative money mutations.**

### Tier 0 — cheap + hard blockers (do first)
- [ ] `ledger` business-key UNIQUE constraint (idempotency) — `S`
- [ ] `UNIQUE(company, order_id)` on invoices (stop double-invoice) — `S`
- [ ] Server-side `updated_at` (DEFAULT now() + trigger; stop client clock) — `S`
- [ ] Don't swallow push errors as success (42501/FK → keep queued) — `S`
- [ ] Company-scope + bound the boot pull (= E1) — `M`
- [ ] Realtime: add company filter + verify realtime RLS — `M`

### Tier 1 — sync spine rework (before real concurrency)
- [ ] Row-level dirty tracking (upsert only changed rows) — `M` — highest leverage
- [ ] Wire optimistic locking to the 6 version-controlled tables (= E3) — `M`
- [ ] Soft-delete tombstones on all deletable tables (= E2) — `M`
- [ ] Single sync mutex (serialize push/pull/interval/reconnect) — `M`

### Tier 2 — money posting server-side (before multiple GL posters)
- [ ] Fold receipt GL into process_payment_receipt (atomic + deterministic id) — `M`
- [ ] Create post_grn_atomic RPC (GRN is the only major money event with zero server atomicity) — `L`
- [ ] Move COGS reversal into credit_note/void RPC — `M`
- [ ] Credit-limit + one-invoice-per-order in RPC under FOR UPDATE — `M`

### Tier 3 — multitenancy structure (BEFORE scaffolding GTK/GTI/Factory)
- [ ] Tenant/company-config registry (replace ~187 string branches; generalize coa.index.ts COMPANY_COA) — `L`
- [ ] Consolidate 3 forked quotation impls into one config-driven engine — `L`

### Tier 4 — RLS coverage + security (before first non-super user)
- [ ] Extend strict RLS from ~28 → all company-scoped tables + CI gate + default-deny; role enforcement server-side — `M`
- [ ] Verify/apply 088 aggregation RPCs + pagination on list fetches — `S/M`

### Architectural decisions to make now
1. **Money posting server-side:** ALL money mutations behind atomic RPCs (invoice/CN/void done; add receipt + GRN). Non-negotiable for multi-user.
2. **localStorage-mirror:** keep offline-first but scope to active-company + recent window, move to IndexedDB, stop using it as write-of-record.
3. **Tenant registry BEFORE** GTK/GTI/Factory scaffolding (task #54) — else duplication triples.

### Directory refactors
- `modules/shared/config/companyConfig.ts` — tenant registry (generalize `coa.index.ts`).
- Merge `modules/sales/companies/{glassco,nippon}/use*Quotations.ts` → one `useQuotations` + config; keep only print templates per-company.
- Same convention for ProductMaster / projects / production hubs (31 dispatch files).
