# GLASSCO — Remnant vs Scrap: costing, IFRS, industry practice & build plan

**Status:** Design/decision doc — NOT yet built. For later discussion.
**Date:** 2026-07-10
**Owner decisions captured from Hassan + verified multi-agent research (IFRS adversarially checked).**

---

## 1. The problem

In the 2D cut-plan diagram, if an order uses (say) 20% of a sheet, the system marks the
remaining 80% as **wastage**. That is wrong: a large usable leftover is a **remnant**
(reusable stock, an asset), not waste. Only the kerf/trim + sub-threshold slivers are true
scrap. Current code (`binPacking.ts` `getScrapZones`) lumps ALL leftover as scrap and has no
remnant concept in the cut plan.

---

## 2. Decisions LOCKED (business rules)

| # | Rule | Value |
|---|------|-------|
| D1 | Remnant threshold | leftover **≥ 1.5 ft (18") on BOTH width AND height** = remnant; else scrap |
| D2 | Borderline band | leftover side near 18" (e.g. **15–21"**) → **alert** supervisor: "adjust cost?" |
| D3 | Remnant vs scrap decision | **Manual — supervisor decides on the spot** (data-collection phase); system auto-suggests from D1, supervisor can override |
| D4 | Remnant valuation | **Carry at ALLOCATED COST (remnant sqft × sheet MAP). NO NRV write-down.** (Hassan's call — keep simple.) |
| D5 | Instead of NRV | **Ageing + history/learning**: track remnant age, and learn which sizes usually get reused vs scrapped |
| D6 | "Full sheet cost" charge | Means **raise the effective per-sqft RATE** to recover the wasted strip — **NOT** invoice a literal 2nd sheet |
| D7 | Rate adjustment | **Manual per-sqft rate override** on the affected quotation line, with a transparent note |
| D8 | GL impact of the feature | **NONE** — only the SELLING rate (revenue) moves; COGS stays at delivery; GL posting untouched |

---

## 3. IFRS treatment (VERIFIED sound by adversarial review)

- **Rate uplift (extra charge to customer):** IFRS 15 — part of the **transaction price** of the
  single "supply of cut glass" performance obligation → **ordinary sales revenue at delivery**.
  No separate account, no liability, no deferral. Track only as a **non-GL "wastage recovery"
  memo tag** for analytics. GL at delivery: `Dr Receivable / Cr Sales–Cut Glass (41122)` at the
  uplifted rate. *Caveat: valid only if the uplift is agreed with the customer at/before the sale;
  if imposed after a fixed price, IFRS 15.18–21 contract-modification applies.*
- **Remnant:** IAS 2 — **inventory asset**. Carve its cost out of the sheet (remnant sqft × MAP).
  Per D4 we carry at **cost** (skip NRV); ageing + eventual write-off on actual scrapping keeps it
  roughly IAS-2-aligned. Do a **year-end ageing review** to write off clearly-dead remnants.
- **Scrap:** **normal** kerf/trim/sub-18" loss is **absorbed** into the good pieces' COGS (stays in
  WIP → COGS, no separate entry). Only **abnormal** loss (mis-cut, breakage) is expensed when
  incurred (IAS 2.16). *Note: glass kerf ≈ 0 (score line, no material removed) — true waste is the
  trim strip + sub-18" offcut.*
- **No double-count:** the uplift is a pure **revenue** leg; the sheet cost is a pure **cost** leg —
  two halves of gross margin. Guards: (i) never invoice/relieve a literal 2nd sheet; (ii) never net
  the surcharge against the scrap-loss account; (iii) customer must not take the scrap/remnant.

### Live COA facts surfaced (Glassco)
- Revenue: **41122 Sales — Cut Glass**, **41132 Cutting Charges**, **42111 Scrap Glass Sales**,
  **56113 Glass Breakage & Write-off**. (CLAUDE.md's "41110 Glass Processing Services" is stale —
  actual chains are 4112/4113.)
- Inventory/COGS helper (`glasscoGLHelpers.ts`): 11511 Glass Inventory, 11513 WIP, 11514
  WIP-Direct-Labour, 5113 Scrap & Wastage Loss, 5111 COGS — Glass.

---

## 4. ⭐ Cost-absorption rule (the key logic) + worked example

**Principle (recursive):** cost follows the material a job consumes.
- **sold pieces + normal scrap of that job = the job's COGS**
- **leftover that re-qualifies as remnant (≥18×18) = carved out at cost → inventory asset** (not the job's cost)
- **leftover that is scrap = absorbed into the job that created it** (normal loss)

### Worked example (Hassan's 70/30 → 50/50)
Sheet = **50 sqft**, MAP **Rs 200/sqft → sheet = Rs 10,000.**

**Order 1** cuts 70% (35 sqft); order complete. Remaining 30% (15 sqft) ≥18" → **remnant**.
- Order 1 glass COGS = 35 × 200 = **Rs 7,000**
- Remnant stock = 15 × 200 = **Rs 3,000** (at cost)

**Order 2** pulls the 15-sqft remnant (Rs 3,000). Uses 50% (7.5 sqft sold). Remaining 7.5 sqft:

- **Case A — remaining 7.5 sqft is SCRAP (fails 18"):**
  - Order 2 glass COGS = **Rs 3,000** (7.5 sold + 7.5 scrap **absorbed**) ← *scrap cost absorbed into 2nd order = YES*
  - New remnant = Rs 0
  - Effective cost = 3,000 ÷ 7.5 good sqft = **Rs 400/sqft (double)** → **this is exactly when the rate uplift applies** so the customer covers the absorbed scrap.
- **Case B — remaining 7.5 sqft still ≥18" (remnant):**
  - Order 2 glass COGS = 7.5 × 200 = **Rs 1,500**
  - New (smaller) remnant = 7.5 × 200 = **Rs 1,500** (asset, not absorbed) → no uplift needed.

**System logic that falls out of this:**
- Cut from remnant → leftover **≥18" = new remnant** (carve cost) → no uplift.
- Leftover **<18" = scrap** → absorbed into that order → **borderline alert → suggest rate uplift**.

---

## 5. Industry solution (VERIFIED, cited)

- **"Hard to find a matching order" → LiSEC Dynopt look-ahead:** merges upcoming queued orders +
  a scanned remnant/remake pool so leftovers are consumed by the NEXT jobs in the batch window
  (not a random future order). Gethke Glas: 20–30 remnants/day → "hardly any", waste −3%.
- **Dual threshold** (min dimension AND min area) + ~100mm physical safety floor. Glassco's 18"
  rule is an *economic-reusability* threshold (correct kind), stricter than the safety floor.
- **Ageing + write-off:** rule of thumb **12-month expiry**; quarterly rack reviews; untracked
  remnants "age out and get thrown away" — so age tracking is first-class.
- **Pricing:** minimum sqft-per-piece (2–3 sqft), bill the **bounding rectangle**, or **yield
  uplift = base_rate ÷ yield%** — the formal version of Glassco's "raise the effective rate."
- **Borderline alert + LEARN is NOT in packaged tools** → Glassco's differentiator (log decision +
  context + later reuse outcome → tune threshold per glass type from real data).

---

## 6. ⚠️ Two PRE-EXISTING GL bugs (flagged by verify — NOT caused by this feature)

Must be reviewed by Finance-Agent **before** wiring any remnant-capitalisation GL:
1. **WIP never relieved:** cutting debits WIP (11513), but delivery COGS **credits Glass Inventory
   (11511), not WIP** → WIP overstated, raw-glass driven negative. (`glasscoGLDelivery.ts` vs
   `glasscoGLCutting.ts`.)
2. **COA code collision:** `glasscoGLHelpers.ts` codes (11513/11514/5113) conflict with canonical
   `coa.glassco.ts` (11513 = Float Glass Reflective, WIP = 11521/11522, no 5113 leaf). Postings can
   resolve to the wrong account (FinanceService.ensureAccount matches by code).

Also: `glasscoGLCutting.ts` routes the ENTIRE scrapSqft value to 5113 at cutting (treats all scrap
as abnormal) — not strictly IAS 2.16 (normal kerf should stay absorbed). Tolerable if immaterial.

---

## 7. Build plan — 6 phases (GL-safe; only selling rate/inventory classification)

Mostly **wiring**, not greenfield — most infra already exists.

| Phase | What | New/changed | Risk |
|---|---|---|---|
| **A** | `cuttingConfig.ts` (18" / 15–21" band, single home) + pure `classifyLeftover()` in binPacking + Vitest | new file + binPacking types (`LeftoverKind`, `ScrapZone.{sqft,kind,autoKind}`, `SheetCuttingPlan.{remnantSqft,trueScrapSqft}`) | pure, safe |
| **B** | 2D diagram: leftover **green (remnant) / amber (borderline) / red (scrap)** + dims + legend + "Adjust cost?" banner | `CuttingDiagram.tsx` (reuse defect-zone overlay pattern) | visual only |
| **C** | Supervisor **marks** remnant/scrap → save `LeftoverDecision` WITH full context (sheet size, order size, dims) → create **Remnant** inventory record | new `LeftoverDecision` type + `InventoryService` persistence (+`createRemnantFromLeftover`) + `LeftoverReview.tsx` in CutterWorkbench End-Session + Supabase migration/RLS | new data |
| **D** | Borderline "Yes" → **per-line manual rate override** (revenue only) | `QuotationItem.{rateOverride,...}`; `deliveryInvoiceService` prefers per-line override | pricing, no GL |
| **E** | Quotation Wastage tab reads production decision → transparent **note** "rate adjusted due to unconventional sheet utilisation" | `QuotationWastageTab.tsx` | display |
| **F** | Admin threshold config page + `getRemnantSuggestion` learning upgrade (dimension-aware) | new `CuttingSettings.tsx` | optional |

**Recommended start:** Phase **A + B** (directly fixes the diagram complaint; zero GL/pricing risk).

### Existing infra to REUSE (don't rebuild)
`RemnantManager.tsx`, `Remnant`/`RemnantDimensions`/`RemnantHistoryEntry` types, `InventoryService`
remnant methods (`upsertRemnant`/`findFittingRemnants`/`getRemnantSuggestion`), `CuttingSession`
(has `remnantsCreated`/`scrapSqft`/`estimatedWastagePct`), `QuotationWastageTab` (`computeRateSuggestion`,
`wastageDecision`, `onSaveDecision`), `deliveryInvoiceService` wastage re-rate.

---

## 8. Open questions to confirm before building

1. Start **Phase A + B** now? (recommended)
2. The 2 GL bugs (§6) — investigate/fix now (separate Finance track) or later?
3. Remnant costing (§4) — bake into Phase C, or defer to a Finance phase after the GL bugs are fixed?
4. Ageing thresholds (§5): flag at 6 months, propose write-off at 12? (industry default)

---

## 9. Sources

- LiSEC Dynopt — https://www.lisec.com/solutions/software/detail/optimizations/dynopt
- Gethke Glas case — https://www.glassonline.com/lisec-reduction-of-remnant-glass-plates-and-broken-sheets-at-gethke-glas/
- CutPlan offcut management — https://cutplan.ai/en/blog/offcut-management-guide.html
- CutPlan glass optimization — https://cutplan.ai/en/blog/glass-cutting-optimization.html
- Pricing (minimum/bounding/waste) — wilsonglass.com FAQ, mmglass.net, cutwize.com/material-waste-calculator
- IFRS 15.47 (transaction price), 15.22–30 (distinct test), 15.31–38 (point-in-time), 15.18–21 (modifications)
- IAS 2.6/2.9 (inventory, NRV), 2.14 (joint/by-product cost allocation), 2.16(a) (abnormal loss), 2.28–33 (write-downs)

---

## 10. Related repo docs / memory
- `GLASSCO_PRODUCTION_FLOW_PLAN_2026-07-10.md` — production flow P1b–P5
- `GLASSCO_CUTTING_FLOOR_PLAN_2026-07-09.md` — cutting floor phases (this is Phase E scope there)
- binPacking + CuttingDiagram: `modules/glassco/core/`
- Cutting/delivery GL: `modules/procurement/services/glasscoGLCutting.ts`, `glasscoGLDelivery.ts`, `glasscoGLHelpers.ts`
