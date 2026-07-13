# Glassco — Procurement Rates + Dispatch/Service-Pool + QC-Vendor-Quality Plan
**Captured:** 2026-07-13 · Branch: GT-Production · Mode: God-mode build spec
**Status:** REQUIREMENTS CAPTURED — grounded phase plan appended after code audit (wf below).

> Founder (Hassan) spec, verbatim intent preserved. Build is phased; founder will
> separately decide which features to DELAY / gate behind pay tiers (see the
> single-entry go-live plan `GLASSCO_PROC_DISPATCH_QC_PLAN` sibling + entitlement notes).

---

## Workstream 1 — Procurement: Vendor rate charts + price lists

**Vendor categories (note: founder said "3" but listed 4 — treat as 4):**
| Category | Nature | Flow |
|---|---|---|
| **Raw Glass** | Supply (inbound purchase) | buy sheets → stock |
| **Tempering Plants** | Outsource service | send pieces out → get back |
| **Lamination** | Outsource service | send pieces out → get back |
| **Double Glazing** | Outsource service | send pieces out → get back |

Requirements:
1. **Rate chart** — items in ROWS, price in COLUMNS (one column per vendor in a category).
2. **Individual vendor price list** — each vendor also has its own standalone price list.
3. **Single source of truth** — update a vendor's price list → the comparison chart updates automatically.
4. **Comparative colouring** — within a category, highlight per item who is HIGH vs LOW rate (colour-coded, e.g. green=cheapest, red=dearest).
5. **Vendor business volume** — "kitna maal gaya" — overall, within one category show how much business is going to each vendor (spend / pieces / sqft per vendor).
6. **Remove seeded/hardcoded vendor names** already in code; vendors appear only after real vendors are added.

## Workstream 2 — Internal services rate chart

- Same rate-chart idea for **internal services** (glass processing charge-out rates), each with its own price list.
- **Placement:** service price list lives in its **relevant module** (industry/best practice), NOT lumped into Procurement. (Procurement rate charts = external vendors; internal service rate cards = the module that sells/consumes the service.)

## Workstream 3 — Dispatch: outbound-to-service → pool → return / deliver

Dispatch already has buttons: **to Tempering · to Double-Glaze · to Lamination · Return · Mark Deliver.**

Outbound flow:
1. User searches by **Order No.**
2. Shows orders/pieces that are **Ready-for-Tempering** in production.
3. On order-no entry, pick the **whole order** or **individual pieces**; pieces selectable **mm-wise** (by thickness) as a whole group or singly.
4. Add **multiple orders** this way → **Submit** → generates a **Delivery Challan / Gate Pass** (whichever is industry best-practice) → appears on the **Guard's screen**.
5. **Guard verifies** and lets the goods leave.
6. Dispatched pieces collect into an **"out at outsource-service" POOL**.
7. Dispatch captures **Expected Date of Return** (user input).

Return flow:
8. To bring goods back from service → search **only from that pool**; on return, pieces move to **Finished Goods / deliverable stock**.

Deliver flow:
9. If the same pieces go out for **delivery** from dispatch → show **only the pool pieces meant for delivery**.
10. **Direct-from-plant delivery:** Glassco does NOT deliver themselves. If goods went to the tempering plant and were **site-delivered directly from there**, need a **"Mark Deliver"** path (no physical return leg).

Open: confirm Challan vs Gate Pass as the guard-facing doc (best practice: **Gate Pass** for goods leaving the premises to a vendor; **Delivery Challan** for customer delivery). Likely BOTH: gate-pass for the guard on outbound-to-vendor, delivery-challan for customer site delivery.

## Workstream 4 — QC ↔ Vendor quality / breakage tracking (NO claim)

- Plant breakage/damage gets **no refund** and there is **no financial claim** — purely a **quality-tracking** need.
- Track **which vendor damages what kind of glass, and how.**
- **Defect taxonomy:** breakage, **bend**, **bubbles**, **scratches**, **chipping**.
- Capture point: **QC (at inward-receive from the vendor)** — record defect type + affected piece(s) + glass type (mm/spec) + **attribute to the vendor** the pieces were sent to.
- Output: a **vendor quality scorecard** (defect rate by vendor × glass type × defect type). No GL, no NCR-claim posting.

## God-mode "cherry" candidates (add if tasteful)
- **Vendor SLA / turnaround** — expected vs actual return date → per-vendor avg turnaround + late-flag.
- **"Money/goods out at service" WIP visibility** — how much stock is currently sitting at each vendor (pool aging).
- **Rate-comparison heatmap** — colour gradient across the whole item×vendor matrix.
- **Vendor scorecard = rate + quality + turnaround** combined into one ranking to pick the best vendor per job.

---

## Grounded phase plan
_Source: 5-agent code audit over `glasstech-multitenant/` (GT-Production), 2026-07-13. Every claim anchored to file:line._

### The two unblockers (do first — everything leans on them)
1. **De-seed vendors + extend `VendorType`** (S, code + one DELETE). Phantom PSG/AHM/LAKHANI seeds (`appService.ts:23-76,142-160`) + missing `Lamination`/`Double Glazing` categories (`constants.ts:128-138`) poison ALL 4 workstreams (fake vendors in the chart, hardcoded dispatch destinations, ghost scorecard rows).
2. **Fix vendor persistence asymmetry + verify `tempering_dispatches` id type** (M, code + 1 verify migration). `saveVendors` writes only `{id,company,data jsonb}` while `getVendors` reads flat columns, 0 sync triggers (`asyncSalesService.ts:506-533`) → rate edits silently don't round-trip. The rate chart cannot be single-source-of-truth until fixed. Also: baseline says `tempering_dispatches.id uuid` but app writes `CH-Glassco-NNNN` — confirm live before trusting WS3 persistence.

### What already exists (not starting from zero)
- **WS1:** vendor master (complete), per-vendor rate card + version history (partial, Tempering-only), business-volume metrics already computed but scattered, frozen per-mm rate snapshot on each dispatch (complete). GTK has a working item×rate table template (`vendor_rates`).
- **WS2:** Service-Rates tab with Cost/Sales/Vendor (`GlasscoProductMaster.tsx:579-643`, complete); pricing engine ALREADY reads rates from the master (`calculateAutoRate` `GlasscoUtils.ts:19-85`) so "edit rate → quote updates" already holds; a full customer-tier price-list engine is built but ORPHANED/unrouted (`GlasscoPriceLists.tsx` + live `price_lists`/`price_list_items`).
- **WS3:** one-window Dispatch-OUT (QC-passed pool by order, mm chips, partial+multi-order, atomic attach, auto gate-pass, GL-neutral — `TemperingDispatchOut.tsx:46-453`); `tempering_dispatches` table ALREADY pool-capable (`expected_return_date`/`actual_return_date`/`piece_ids`/`status`/`service_type` incl. Lam/DG — baseline `:2212-2238`); inward/return+FG putaway (partial); direct-from-plant Mark-Deliver COMPLETE (`ProductionContext.tsx:517-589`); piece status state-machine complete; gate-pass entry + authorize/markGateOut events (stub, no guard-facing verify).
- **WS4:** QC defect taxonomy w/ severity (`qcCodes.ts:33-53`, missing "bend"); QC Workbench pass/fail complete (post-cut scope); per-piece fault model w/ stage-of-origin + faultHistory; piece↔vendor bridge via dispatch `plantName` (partial — `dispatchId` cleared on receive); `update_piece_status_atomic` merges arbitrary `p_extra` jsonb (zero-migration vehicle for a defect record); NCR/claim engine exists but is claim/GL-oriented — exactly what founder does NOT want.

### Migrations (minimal)
| # | Migration | Type | Why |
|---|---|---|---|
| M0 | `DELETE` 8 seeded vendor rows (PSG/AHM/LAK + 5 Nippon) | Data | "only real vendors show" is false until they die |
| M1 | **Verify** live `tempering_dispatches.id` type + round-trip `data` col; ALTER to text only if live differs | Schema-verify (likely no-op) | app writes seq IDs; if truly uuid, cloud-persist silently diverges |
| M2 | *(optional WS4)* `vendor_quality_defects(piece_id,dispatch_id,vendor_id,glass_type,thickness,defect_type,qty,…)` + RLS — **no GL/claim columns by design** | Schema | clean scorecard vs jsonb scans |
No migration needed for: VendorType extension (free-text col), WS1 rate chart (derives from `vendors.rates[]`), WS2 (tables already live), guard screen (`gate_passes.status` already Pending/Allowed), return-date capture (columns exist).

### Phases (dispatch spine first — it's the daily operation AND the data source WS1/WS4 consume)

**Phase 0 — Foundation (days):** delete seeds + M0; extend VendorType (+Lamination/+Double Glazing, relabel Glass→"Raw Glass (supply)"); fix persistence asymmetry (make `saveVendors` write flat rate columns); verify M1; un-gate rate modal from Tempering-only; replace hardcoded vendor/destination strings with data-driven reads.
→ *Demo: registry starts empty; add real Tempering+Lamination vendor, enter price list, reload → rates survive from Supabase.*

**Phase 1 — WS3 dispatch → pool → return/deliver (the spine):** capture `expected_return_date` in operator flow; parameterize serviceType + vendor-type filter (to-Temper/DG/Lam, reuse same atomic RPC); build OUT-AT-SERVICE POOL view (derive from `status='Dispatched'` ⨝ `tempering_dispatches`, overdue tracking — powers pool-list + return-search + delivery-from-pool); return-from-pool by order-no search stamping `actual_return_date` → FG; delivery view scoped to returned-pool pieces; **finish dispatch unification Step 2** (route writes through `DispatchService.saveDispatch` — #1 reliability fix, relies on M1); keep Mark-Deliver as-is.
→ *Demo: dispatch mixed-mm order to real vendor w/ return date → pool w/ overdue → search pool, receive → deliverable FG → deliver. Or mark-deliver direct from plant.*

**Phase 2 — WS3 guard screen (short):** dedicated guard route over `gate_passes` — list Outward Pending, Verify→Allowed/Gate-Out (reuse `authorize_dispatch`/`markGateOut`), wire the dead Print button to `GatePassPrint`.
→ *Demo: dispatch creates pending pass → guard verifies → released → flows to cockpit.*

**Phase 3 — WS1 comparative rate chart + volume:** new RateChart view — pivot every `vendor.rates` in a category → item rows × vendor columns, cell=latest rate (single-source once Phase 0 fixed round-trip); per-row min/max comparative colouring (semantic tokens); per-category business-volume column (spend+pieces+sqft, consolidate existing aggregation `GlasscoVendorHub.tsx:515-743`).
→ *Demo: pick "Tempering" → matrix of thickness × vendors, cheapest green/dearest red, + volume column. Edit price list → chart updates live.*

**Phase 4 — WS2 internal service rate card:** align processing-revenue COA (41131/41132 seeded vs 41110 runtime — Finance sign-off); minimal path = promote Service-Rates tab into rows(service)×cols(thickness) matrix over `category='Service'` products (feeds `calculateAutoRate`); optional full path = mount orphan `GlasscoPriceLists` + wire tiered `price_list_items`; replace hardcoded Rs1000 APT flat with a rate lookup.
→ *Demo: service rate card whose edits flow into quotation pricing.*

**Phase 5 — WS4 QC↔vendor quality (pure, no-claim):** add "Bend/Roller-wave" + a `VendorDefectType` set (breakage/bend/bubble/scratch/chipping) separate from `NCRCause`; defect capture at inward-receive (a "Damaged by plant" toggle in `InwardAuditView` → defect picker, **resolve vendor from dispatch `plantName` BEFORE `dispatchId` is cleared** `ProductionContext.tsx:435`, persist via `p_extra` and/or M2); vendor quality scorecard (read-only, grouped plant×serviceType×glass-type×defect-type) as a tab in `GlasscoVendorHub`; **strip the financial debit-note** on tempering-return breakage + never call `ncrService` claim/GL from this path.
→ *Demo: flag 2 pieces bent-by-vendor → scorecard "Vendor X: 3.1% defect, mostly bend on 6mm" — zero ledger entry.*

### Best-practice calls
- **Gate Pass = custody/movement control** (company-owned goods leaving to a service vendor — tempering/lam/DG; GL-neutral; this is what the guard verifies). **Delivery Challan (GT-DC) = sale/handover to customer** (incl. direct-from-plant Mark-Deliver; coincides with COGS). Don't issue a challan for vendor-outbound; don't rely on a gate pass for customer delivery. Return-from-vendor = inward gate pass/goods-receipt, no challan.
- **Internal service rate card → Sales pricing surface** (charge-OUT rates drive quotes), NOT procurement (which holds what we PAY vendors). Two distinct rate objects: charge-out rate (Sales) vs internal floor cost rate (costing) — card owns charge-out, feeds floor cost as fallback.
- **QC→vendor defect attribution with no claim:** capture at inward-receive; attribute via outgoing dispatch's `plantName`+serviceType (resolve before `dispatchId` nulled); tag glass-type+thickness; write to jsonb and/or a `vendor_quality_defects` table with **no `amount`/`gl_entry_id`/`claim` columns** — the absence of financial columns IS the guarantee. Scorecard = pure read-model outside the ledger.

### God-mode cherries (optional)
- Vendor SLA/turnaround (expected-vs-actual return; `vendorSLATracker.ts:84-103` already computes TAT — lights up free once Phase 1 stamps actual_return_date).
- Goods-out-at-service WIP aging (`WIPAging.tsx:160-165`).
- **Combined vendor scorecard** (rate rank + quality rate + turnaround → one A–D grade) — the single most decision-useful artifact.
- Rate heatmap; "cheapest-but-not-worst" cross-check (flag when cheapest vendor also has highest defect rate).

### Founder decisions (2026-07-13)
1. **Categories (3 vs 4)** — ⏳ PENDING founder confirm after re-explain. Direction: ONE unified rate-comparison screen with a category selector; the 3 outsource services (Tempering/Lamination/Double-Glazing) pull service-rate + dispatch-volume data; **Raw Glass pulls purchase (PO/GRN) data** — same items×vendors UI, different data source + item taxonomy + volume metric per category.
2. **Docs / signed-copy tracking** — Plant gets a **separate Service Order** (our record) + **Gate Pass** on vendor-outbound. Customer's **signed Delivery Challan copy is REQUIRED back → a file/record is kept**, and there must be an **entry/status tracking whether the signed copy has returned or not** (NEW sub-feature on the customer-delivery flow).
3. **WS4 storage** — Claude's call → **normalized `vendor_quality_defects` table** (M2), no amount/GL/claim columns.
4. **Finance posture** — Build **proper full double-entry finance entries**, BUT make them **NON-BLOCKING**: a GL issue/absence must NEVER block module-wise operational work. `financeGLEnabled` flag governs on/off; when ON, posting is decoupled/fail-safe (fix every hard coupling: delivery-blocked-on-COGS-fail, invoice-requires-GL, tempering-inward-throws). COA 41131/41132-vs-41110 still needs a quick Finance alignment — non-blocking, doesn't hold operations. Ties to [single-entry go-live plan].
5. **QC defect = flexible REPORT, not a mandatory gate.** Must cover BOTH factory-returned pieces AND **direct-site-delivered-from-plant pieces** (which never physically return). QC **searches by piece-no / size → marks the issue against that piece → attributed to the vendor**. Taxonomy breakage/bend/bubble/scratch/chipping; no claim, no GL.
6. **WS2 = full price list** — mount the already-built `GlasscoPriceLists` engine; the price list is **kept updatable over time** and feeds quotation pricing.
