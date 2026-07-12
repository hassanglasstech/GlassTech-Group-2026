# Production Floor-Overview Board — Plan (2026-07-08)

> Founder ask: *"Production Workbench ko aisa banao ke aik half me factory ki info ho
> (cutting / services / tempering-ready blocks), dusre half me tempering plants ke
> blocks vendor-name se. Screen dekh ke, bina click kiye, pata chal jaye kya cutting
> pe hai aur kis cutter ki bench pe, services bench pe kya chal raha hai, aur kis
> plant me kaunsa maal gaya aur kab aayega. Colors + blocks. Click → details.
> Aur Production WB view-only ho — koi edit na ho."*
>
> **Mockup (see it first):** interactive artifact `floor-overview-v1` — two-panel board,
> clickable blocks → piece detail drawer, honest `as of HH:MM` freshness.
> This doc is the build plan behind that mockup.

## Where it lives (decided)
A **4th read-only `WorkbenchView='floor'`** inside the existing Production Workbench —
NOT a new route. It inherits the `ProductionProvider` data (pieces / jobOrders /
dispatches), the role gate, URL/filter state, and the already-mounted **CockpitHeader**
funnel (the natural top strip). New component:
`modules/production/companies/glassco/components/workbench/FloorOverview.tsx` (pure
props-in: `pieces`, `dispatches`, `jobOrders`, `floorStaff`). Build ON the shipped
CockpitHeader + reuse `KpiTile`/`StatusBadge`/`statusColors` tokens; copy the stage
grouping from CockpitHeader/FactoryVisualBoard rather than importing the dark-themed
factory components.

Touch points to register the view: `ViewToggle.tsx` (union L15 + opts L49 + restore
guard L37) and the `Workbench.tsx` render switch (add a `view==='floor'` branch).

---

## Data model — everything the board needs already exists
No new tables. All derived from `ProductionPiece` + `TemperingDispatch` (+ `Quotation`,
`FloorStaff`). Track 2.1 (`d06f617`) already added the per-piece `assignedCutter`,
`prevCutters`, `assignedBy`, `blockedReason`, `faultHistory` used below.

### Left panel — FACTORY (derive floor location from `piece.status`)
| Block | Piece `status` | Grouped by | Shows |
|---|---|---|---|
| **Cutting — by bench** | `Pending-Cut` (to cut), `Cut` (just cut) | effective cutter = `piece.assignedCutter` ?? job `Quotation.assignedCutter`; `cutBy` for done | one card per cutter + a **Pool (unassigned)** card; pending count + short-ref chips |
| **Services bench** | `Service-Pending` | `pendingServices[]` → Polishing / Grinding / Notching / Holes | count per service |
| **QC** | `QC-Pending`, `QC-Failed` | — | Pending count; **Recut** count (QC-Failed + `fault.disposal==='Recut'`) flagged rose |
| **Ready** | `Ready to Dispatch`, `Received-From-Tempering` | — | shippable count |
| **Exceptions overlay** | `Hold`, `Broken`, `Returned` | — | small badge, not a column |

### Right panel — TEMPERING PLANTS (from `TemperingDispatch`)
- Group active dispatches (`status ∈ {Dispatched, Scheduled}`, `serviceType` Tempering)
  by **`plantName`** (= the vendor name; there is no separate `vendor` field — confirmed
  by `vendors.find(v => v.name === d.plantName)`).
- Per plant block: `out = Σ pieceIds`, `sqft = Σ totalSqFt`, **sent** = `date`,
  **expected back** = `expectedReturnDate`, **SLA color** from days-vs-ETA
  (on-time / due-today / overdue), received-back = `receivedPieceIds`.
- Piece→plant join for the drawer: `piece.dispatchId === dispatch.id`.

### Short ref code (`3.1`) — `<last4-of-order>/<pieceNo>`
`${(order.orderNo ?? piece.orderId).slice(-4)}/${piece.itemIndex + 1}` — resolve the
order via `jobOrders.find(j => j.orderNo === p.orderId || j.id === p.orderId)` (both
join forms exist). New shared helper `pieceRefLabel(piece, order)`; apply at the 4
long-id render sites (ListView `Workbench.tsx`, GridView, `PieceCard`, `PieceDetailPanel`
header) + the new FloorOverview chips. (Keep the raw `p.id` only on the print tag/barcode.)

### Freshness (honest)
Header shows **`as of HH:MM`**, never "Live" (cutters batch-key at shift-end). Per-lane
"last logged" from `max(lastUpdated)`; stale wash on lanes not touched this shift.

---

## Read-only conversion (`1.4`) — make the Workbench view-only
All writes funnel through `handleUpdatePieceStatus` (RPC `update_piece_status_atomic`).
Strip exactly these; keep everything else (search, filters, lenses, detail read, print):
- **KanbanBoard** — drag-and-drop status move (`onDragEnd` mutation) + the whole DnD
  apparatus (sensors, `DragOverlay`, droppable columns); the **bulk-move bar**
  (`BulkActionBar` + `useBulkSelection`); piece **select checkboxes** in `PieceCard`.
- **PieceDetailPanel** — `moveToStatus` + the action footer (`→ next`, `Hold`, `NCR`).
  Keep the **Print tag** button (read-only, opens a print window; no DB write).
- **Workbench page** — already no direct mutations.

Net: removing those three `handleUpdatePieceStatus` call sites + their surrounding UI
makes the board fully view-only. (Kanban then becomes read-only columns — fine as a view;
the *doing* lives in the Production module screens: Cutter WB, Service Floor, QC WB,
Tempering Dispatch, Recut Pool.)

---

## Phases
| Phase | Scope | Risk |
|---|---|---|
| **F0** | `pieceRefLabel()` helper + apply at the 4 long-id sites (short ref everywhere) | tiny |
| **F1** | `FloorOverview.tsx` read-only two-panel board (factory buckets + plant blocks, colors, block form, `as of HH:MM`) + wire as `WorkbenchView='floor'` and make it the default view | medium |
| **F2** | Click-through: block → detail drawer (piece list w/ short ref, spec, cutter/plant, ETA) reusing the read-only PieceDetailPanel where possible | small |
| **F3** | Strip the Workbench write surfaces (Kanban DnD + bulk bar + detail action footer) → fully view-only | small-med |
| **F4** | Freshness layer (per-lane last-logged + stale wash) + at-risk (due-date/ETA) accents | small |

Recommended order: **F0 → F1 → F2 → F3 → F4** (each independently shippable + preview-testable).

## Not in scope here (separate)
Cutter self-login cutover (D1b), Wazir auto shift-report (was Track 3.4), tablets/real-time
"cutting now" (needs hardware — freshness layer is the honest substitute).

## Verify + branch
Every phase: `tsc 0 · vitest · vite build` then commit to **GT-Production**; promote to
`main` only after the founder preview-tests (auth-gated Glassco screens).

---

## God-mode critique synthesis (2026-07-08) — mockup v1 → v2 (andon)
5 expert critics (MES/andon · flat-glass floor-control · info-design/glanceability ·
lean/visual-management · adversarial-honesty) benchmarked the v1 mockup against real
systems (Toyota Andon, MPDV HYDRA, Siemens Opcenter, SAP DM, Tulip, A+W Cantor, LiSEC
GPS.prod, Softsolution Optima, Glaston, FeneVision; ISA-101 / Stephen Few). **Unanimous
verdict:** v1 was a well-styled WIP *counter*, not an *andon overview* — colour encoded
stage taxonomy, not health, so the eye landed on the biggest benign number, not the fire.

**These principles are now REQUIRED in the F1 build (baked into mockup v2):**
1. **Invert the colour economy (ISA-101).** Blocks are calm/near-monochrome by default;
   saturated colour + heavier weight are RESERVED for abnormal state (overdue plant /
   due-today / recut / broken / over-WIP / starved). Stage identity = a small dot only.
2. **Andon exception band** (Broken / Hold / Returned / Recut): a thin "floor clean" line
   when zero, a loud red band (glyph + count, click→pieces) when non-zero. Derive from
   `status ∈ {Broken,Hold,Returned}` + `fault.disposal==='Recut'`.
3. **Cutter cards = assigned QUEUE, not live bench** (honesty). Split **"To cut N /
   Cut today M"**, header "keyed at shift-end", per-lane last-logged stamp + **stale wash**.
   Never imply real-time hand-work (cut times are record-time).
4. **Bottleneck flag** on the WIP funnel (largest WIP stage; sqft-weighted optional).
   **Delivered leaves the funnel** → muted "shipped today + yield% + broke" stat (stock≠flow).
5. **Tempering plants:** sort reddest-first; hero **days-countdown** "■ +1d LATE / ▲ DUE
   TODAY / ● back in 2d / ◌ NO ETA"; **real return ratio** `receivedPieceIds/pieceIds`
   ("6 of 10 back · 4 still out") — NOT a fabricated %; **missing `expectedReturnDate` = a
   first-class "no ETA" state, never green**; thickness/coating mix chips (Low-E flagged).
6. **Colour-blind safe:** every urgency state carries colour **+ glyph (● ▲ ■ ◌) + position**.
7. **Order shipping-readiness** roll-up (glass supervisor's #1 question — "kaunsi delivery
   aaj ja sakti hai"): per-order completeness % + blocking stage + due, top-N by risk.
8. **Aging** ("oldest 3d") on Services/QC lanes; **at-risk** accent from job due-date.

**Feasibility / must-not-lie (adversarial critic):**
- Derive funnel + panel totals from ONE `groupBy(status)` over `pieces` — never two
  hand-summed constants (they drift). Pin recut accounting: a QC-Failed→Recut piece counts
  in exactly ONE lane.
- Short-ref `<last4>/<n>` is a **display label only** (collides) — keep raw `piece.id` as the
  data key / drawer row key. Cap the drawer list (50 + "show all").
- Read-only structurally: FloorOverview receives props only; **no `handleUpdatePieceStatus`
  in scope**, not a disabled button.
- Guard date math against null/invalid `expectedReturnDate`.

**Mockup:** artifact `floor-overview-v2-andon` (redeployed) — calm board where only Lakhani
(overdue) + the exception band light up. v1 kept in version history.
