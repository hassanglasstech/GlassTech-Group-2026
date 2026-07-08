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
