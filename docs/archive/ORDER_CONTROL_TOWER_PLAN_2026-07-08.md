# Order Control Tower — Plan (2026-07-08)

> Founder ask (paraphrased): *"An MD/manager who never goes to the floor and takes no
> updates should SEE — on one visual screen — every client order travelling through the
> business: where it is now, where it goes next, and its whole past→future path. If a
> stage is delayed he sees it and calls that dept. He also sees the order's FINANCE
> movement (advance in, balance pending) and whether TRANSPORT for the delivery date is
> booked. Every workflow's current + next step, so he catches a delay before it happens
> and knows which stage's planning is still pending."*
>
> **Mockups:** artifact `control-tower-v1` (full, interactive — pick an order → its journey)
> + an inline journey-strip preview. This doc is the build plan behind them.

## What it is
A **read-only executive control tower** (track-and-trace) over the **order-to-cash**
value stream. Not a new data model — a cross-module *read* that stitches Sales +
Production + Tempering + Dispatch + Finance into one order-centric journey. Two views:

1. **Pipeline overview** — all orders as cards, grouped/filterable by client, each with a
   mini stage-progress bar + a health dot (on-track / delayed / payment-risk / plan-pending).
   Answers "how many orders, which client, where is each."
2. **Order journey** (pick an order) — a horizontal flow of stages showing **past ✓ /
   current ◉ / next ○ / future ·**, with two parallel sub-tracks (Finance, Transport) and a
   **Next actions** list. Answers "where exactly, what's pending, who do I call."

Level: MD / manager / factory-incharge. Lives as a new route (e.g. `/control-tower`) or a
tab on the MD dashboard. **Read-only** — it never writes; it points you at the dept to call.

## The 10-stage journey (physical track)
`Quotation → Approved → Cutting → Services → QC → Tempering(@plant) → Received → Ready →
Dispatch → Delivered`. Derived per order from the **production_pieces** rollup + the
tempering dispatch, NOT a new status field:

| Stage | Derived from |
|---|---|
| Quotation / Approved | `Quotation.status` (Draft→Approved→Invoiced→…) |
| Cutting | pieces `Pending-Cut` / `Cut` |
| Services | pieces `Service-Pending` (+ `pendingServices[]`) |
| QC | pieces `QC-Pending/QC-Failed/QC-Passed` |
| Tempering | pieces `Dispatched/Tempered` + `TemperingDispatch{plantName, expectedReturnDate}` |
| Received | pieces `Received-From-Tempering` |
| Ready | pieces `Ready to Dispatch` |
| Dispatch | `gate_passes` / dispatch record |
| Delivered | pieces `Delivered` / `Quotation.actualDeliveryDate` |

"Current stage" = the earliest stage that still has pieces not yet advanced (the trailing
edge — the thing holding the order back). "Next" = the following stage.

## Finance track (parallel lane)
From `Quotation.receivedAmount` + `invoiceNo` + receipts/AR (ledger):
- **Advance %** = `receivedAmount / orderValue`; **Balance** = `value − received` (pending).
- **Invoice raised?** = `invoiceNo` present. Balance-due-on-delivery note.
- Payment-risk flag: deep in production with **0 advance**.

## Transport track (parallel lane)
- **Delivery date** = `Quotation.dueDate` / committed date.
- **Transport booked?** = a dispatch/vehicle booking exists for that date (DispatchService /
  DispatchPlanner / gate pass). **Gate pass ready?** = `gatePassId`.

## The two intelligence layers (what makes it a *control* tower, not a status list)
1. **Delay detection** → red. Order stuck at a stage past its expected onward move:
   tempering `expectedReturnDate < today` and not received; or stage-age > threshold; or
   `dueDate` near while the trailing stage is far behind. Surfaces "Stuck N days at [stage]
   — call [dept/vendor]".
2. **Planning-pending detection** → amber. The *next* step isn't set up yet, so a delay is
   about to happen: delivery within N days but **transport not booked**; QC-passed but
   tempering not yet dispatched; invoice not raised. Surfaces "Plan [next] now."

Both reuse the andon discipline from the floor board: **calm by default, only problems
light up**; colour **+ glyph + position**; honest "as of HH:MM" (no fake "Live").

## Phases
| Phase | Scope |
|---|---|
| **C0** | Read layer: `orderJourneyService` — join quotations + piece rollup + dispatches + finance + gate passes into an `OrderJourney[]` model (one object per order). Pure read, company-scoped. |
| **C1** | Pipeline overview view (order cards by client + mini-progress + health dot) + client filter + KPIs. |
| **C2** | Per-order journey timeline (past/now/next/future flow). |
| **C3** | Finance + Transport sub-tracks on the journey. |
| **C4** | Delay + planning-pending detection engine → "Next actions" + a top-level "orders needing attention" list. |
| **C5** | (optional) Wazir daily exec briefing ("3 orders delayed, 2 need transport booked, PKR X balance due today") via `claude-proxy`, human-in-loop. |

Recommended order **C0 → C1 → C2 → C3 → C4 → C5**; each independently shippable +
preview-testable. C0 is the keystone (every view reads the one `OrderJourney` model).

## Relationship to the Floor Board
Complementary, different altitude:
- **Floor Overview board** = *shop-floor* view (pieces, benches, plants) for the supervisor.
- **Order Control Tower** = *order-to-cash* view (orders, money, delivery) for the MD.
They share the piece/dispatch data; the Control Tower rolls it up to the order + adds the
finance and transport lanes the supervisor doesn't need.

## Verify + branch
Every phase: `tsc 0 · vitest · vite build` → commit to **GT-Production**; promote to `main`
after founder preview-test. Read-only + cross-module reads only — no GL, no writes.
