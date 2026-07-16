# GTK Projects ← Glassco / Nippon — Intercompany Project Procurement (God-Mode, 2026-07-16)

**The business:** GTK (aluminium fabricator) wins **projects** (facades, windows,
curtain walls). Each project's BOM needs **glass (Glassco)** + **hardware (Nippon)**.
GTK does not buy these outside — it procures them **intercompany at agreed rates**.
The moment GTK raises the demand, it must become a live **order inside Glassco /
Nippon Sales** *and* stay visible in **GTK's project/procurement** — one order, two
lenses, status synced both ways. On delivery: **intercompany invoice**; Glassco/
Nippon book AR + revenue + COGS, GTK books **project material cost + payable**;
group consolidation **eliminates** the intercompany leg.

Scope note: this is NOT "build all of GTK". It is exactly the **intercompany
project-material spine** (order → fulfil → invoice → project cost), plus the
customer price lists that price it.

---

## Industry standard this maps to (SAP / Oracle / NetSuite)
| Our piece | Discipline | Named as |
|---|---|---|
| GTK buys from Glassco/Nippon | **Intercompany Sales & Billing (IC)** | SAP IC billing · Oracle IC invoicing · NetSuite IC transactions |
| Goods move company→company | **Stock Transport Order (STO)** | SAP STO / plant-to-plant |
| Agreed rate | **Transfer pricing** (arm's-length / cost-plus) | = the customer price list |
| Project material + cost | **Project System (PS)** — project WIP → COGS | SAP PS · Oracle Projects |
| Group books | **Consolidation elimination** (IC AR/AP + IC profit) | IFRS 10 / group consol |

We are delivering **intercompany + project-cost accounting** — the exact scenario
big ERPs charge the most for — for a Pakistani group, on the existing stack.

---

## Already built — extend, don't rebuild
- **Invoice mirror** (`deliveryInvoiceService`, `client.mirrorCompany` → `mirrorTx` "AUTO-PURCHASE" KR in the buyer company: Dr cost/material, Cr payable-to-seller). So a Glassco→GTK invoice **already** posts GTK's purchase + payable.
- **Intercompany COA**: IC AR (GTK 11211 / GTI 11212), IC Revenue (41111/41112), Due-from-Group (1131x), Due-to-Factory (21131); `clientAccountResolver` already routes GTK/GTI customers to the IC AR leaves.
- **`/hub` IntercompanyHub** + `ICOTransferPanel` + `CrossCompanyStatusBoard` + `crossCompanyNotifService` (real-time cross-company channel).
- **GTK procurement side**: `Requisitions`, `ProcurementHub`.
- **Projects** (Project entity, `projectName` across quotations/invoices) + **Project Consumption** inventory view.
- **Glassco customer price lists** (`buildPriceListResolver`). Nippon still needs its own (the parked P1-3).

**The gap:** the mirror only fires at INVOICE time (too late to plan production); there is no project→IC-order raise; no order-time cross-visibility; no two-way status handshake; no project-tagged material cost; Nippon has no price list.

---

## Target flow — with the genius mechanisms 🧠
**① GTK — project demand.** From a GTK **project**, raise a **material demand** (glass lines → Glassco, hardware lines → Nippon), priced from the **agreed rate card**.

**② Order-time mirror (the key upgrade).** The demand instantly becomes a **Sales Order inside Glassco / Nippon** — 🧠 *at order time, not invoice time* — so the supplier can plan/cut/pick immediately. Same order object, tagged `intercompany + projectId`.

**③ Two lenses, one truth.** 🧠 The SAME order renders as a **Sales Order** in Glassco/Nippon and a **Project Purchase** in GTK's procurement/project view. Status is a single field → both sides always agree, **zero reconciliation**.

**④ Live status handshake.** 🧠 `crossCompanyNotifService` pushes every state change (Approved → Cut/Picked → QC → Dispatched → Delivered) to both companies in real time → GTK's project timeline updates as Glassco/Nippon work.

**⑤ Fulfil at agreed rates.** 🧠 GTK is a **customer with a transfer-price list** in Glassco + Nippon → line rates auto-apply, controlled centrally; the group MD sees IC margin, the buyer can't fiddle the rate.

**⑥ Deliver → IC invoice → project cost.** Delivery → seller books AR-GTK + IC-Revenue + COGS; 🧠 GTK books **project-tagged WIP / material-consumed** (not a generic payable) → the project's cost bucket grows in real time → **live project profitability** (contract value − glass − hardware − labour).

**⑦ Group elimination.** 🧠 IC AR↔AP, IC revenue↔purchase, and unrealised IC profit in unsold project stock are **tagged for elimination** → clean consolidated group P&L, no double-count. (Ties to the gate-pass design: the Glassco→GTK dispatch IS a gate-pass movement.)

---

## What makes it unique (the moat)
1. **Order-time intercompany mirror** — the supplier sees the group demand the instant it's raised and starts producing; most SME ERPs only mirror at billing.
2. **One order, two lenses, one status** — Sales in the seller, Project-Purchase in the buyer, single source of truth. No IC reconciliation ritual.
3. **Transfer-price list built in** — group-controlled rates, IC margin visible to MD, buyer can't override.
4. **Real-time project profitability** — every IC delivery rolls into the project's cost live; GTK sees margin as glass/hardware lands.
5. **Elimination-ready by construction** — group consolidation is clean because IC legs are tagged at source.
6. **All on one stack, one login group** — GTK/Glassco/Nippon staff each see their lens of the same object; no EDI/integration middleware.

---

## Finance (both books, IFRS-correct)
- **Glassco / Nippon (seller) @ delivery:** `Dr AR-GTK (IC 11211) / Cr IC-Revenue (41111)` + `Dr COGS / Cr Inventory`. (existing invoice + COGS path.)
- **GTK (buyer) @ receipt:** `Dr Project-WIP / Material-Consumed (tagged projectId) / Cr AP — Due-to-Glassco/Nippon`. (extend the current generic mirror to project-tagged WIP.)
- **GTK @ end-customer handover/invoice:** `Project-WIP → COGS`.
- **Group consolidation:** eliminate IC AR↔AP, IC revenue↔IC purchase, and unrealised IC profit sitting in GTK's unsold project stock.

---

## Phased plan (each = own verified, browser-tested slice)
- **P1 · Rates foundation** — Nippon customer price list (Glassco already has one) + GTK set up as a **customer with an agreed transfer-price rate card** in both. *(this is the parked price-list work, now with a clear driver)*
- **P2 · Project → IC order** — raise an intercompany material demand from a GTK project → creates the mirrored **Sales Order in Glassco/Nippon at order time** (not invoice time), tagged `intercompany + projectId`.
- **P3 · Two-way visibility + live status** — the order shows in GTK's project/procurement AND supplier Sales; state changes handshake both ways via `crossCompanyNotifService`.
- **P4 · Finance (project-tagged IC)** — extend the invoice mirror to post GTK **project-WIP + Due-to-Group AP** (project-tagged); COGS at delivery on the seller; add the **elimination tag**.
- **P5 · Project cost + group IC board** — GTK project profitability (contract − glass − hardware − labour) + a group IC reconciliation/elimination dashboard (extend IntercompanyHub / CrossCompanyStatusBoard).

**Recommended start:** P1 (rates) — nothing prices correctly without it, and it also clears the parked Nippon price-list item. Then P2 (the order-time mirror) is the heart of the feature.
