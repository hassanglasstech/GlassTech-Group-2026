# Prod WB & Prod module refinement — 2026-07-07

Branch: **GT-Production**. Verify gate for everything shipped: `tsc 0` / `369 tests` / `vite build` clean, pushed.

## Goal (founder direction)
- **Production Workbench** (`/production/workbench`, "Production Board") → a **pure READ-ONLY consolidated info board** that only DISPLAYS what is moving in production.
- **Production Module** (`/production` hub → GlasscoProductionHub) → home of the **entire production workflow** (all the doing: cutting, services, QC, tempering, receive, deliver).

## Audit finding (why it wasn't already so)
The hub-vs-board split already exists structurally, BUT the **Workbench is secretly load-bearing** — it is the ONLY reachable UI for 4 transitions, because their intended module screens are DEAD/orphaned:
- `ServiceFloorView` (service marking) — was orphaned (never routed/imported).
- `InwardAuditView` (receive-back + direct delivery) — orphaned (never routed/imported).
- `handleCuttingOutput` (Cut→Service/QC routing) — was uncalled.

So the Workbench cannot be made read-only until those 4 transitions have module homes.

## Transition coverage — 4 Workbench-only transitions

| Transition | Module owner | Status |
|---|---|---|
| Cut → QC-Pending / Service-Pending | CutterWorkbench auto-route + Service Floor | ✅ **DONE (A1)** |
| QC-Passed → Ready to Dispatch | TemperingDispatchOut "Skip tempering" | ✅ **DONE (A2)** |
| Received/Tempered → Ready (tempering AP GL) | InwardAuditView (receive-back) | 🔴 **HELD (A3)** |
| Delivery + COGS → Delivered | InwardAuditView (direct delivery) | 🔴 **HELD (A3)** |

## Done today
- **A1 — Service Floor workflow** (`65a38fb`): new `serviceRouting.ts` (`deriveServiceBuckets`: P/E,P/F→Polishing / R/D→Grinding / Notch→Notching / holes→Holes); `CutterWorkbench.cutPiece` now auto-routes a cut piece to Service-Pending(+pendingServices) or QC-Pending; new routed `ServiceFloorPage` (`/production/service-floor`) revives `ServiceFloorView` (mark each service done w/ worker+sqft → decrement pendingServices → QC-Pending when last clears); `GlasscoProductionHub` Floor Stations now shows Cutter → Service Floor → QC → Tempering Dispatch → Dispatch. Status-only, no GL.
- **A2 — QC-Passed → Ready** (`2151cf1`): "Skip tempering → Ready to Dispatch" button on `TemperingDispatchOut` (pool = QC-Passed); atomic RPC, mirrors once. Status-only, no GL.

---

## HELD — A3: revive InwardAuditView (receive-back + delivery). MONEY-PATH.
The backing logic already exists in `ProductionContext`:
- `handleInwardPiece` (ProductionContext.tsx:434-487): receive a returned piece → Ready to Dispatch (or Tempered if lam/DG); on the LAST piece of a dispatch posts tempering AP GL via `postTemperingInwardGL` (Dr WIP / Cr AP-Tempering 22113), priced from the dispatch's frozen `ratesByMm`.
- `executeDirectDelivery` (ProductionContext.tsx:495-543): COGS-first (`postDeliveryCOGS` Dr COGS / Cr Glass Inventory at MAP), then Site-Delivery challan + mark pieces `Delivered`.

To revive: build a routed page (e.g. `/production/inward`) that mounts `ProductionProvider` and renders `InwardAuditView` with its ~11 context props (jobOrders, pieces, dispatches, clients, activeInwardDispatchId/setter, inwardAuditablePieces, selectedPiecesForDelivery, togglePieceForDelivery, setIsDirectDeliveryModalOpen, handleInwardPiece, openBinModal) **plus** render the Direct-Delivery modal + bin/spot modal (InwardAuditView only sets their open flags — the modal components must be rendered by the page). Add a hub card "Receive / Inward". 

⚠️ **Because this posts COGS (delivery) and tempering AP (receive), build it then PREVIEW-TEST with a login before promoting to main — do NOT ship blind.**

## HELD — Phase B: make the Workbench read-only
Do ONLY after A3 (else the 2 remaining transitions break). Remove exactly these WRITE surfaces from the Workbench (audit-confirmed):
1. The **Kanban view** entirely — its purpose is drag-to-transition (`KanbanBoard.onDragEnd` → handleUpdatePieceStatus; the bulk-move `BulkActionBar`). Drop the `view==='kanban'` branch + the Kanban option in `ViewToggle`.
2. The **PieceDetailPanel action footer** (PieceDetailPanel.tsx:326-363) — the next-state / Hold / NCR buttons + `moveToStatus`. Keep the Details/History/Photos tabs + Print tag.
3. **PieceCard** bulk-select checkbox + `BulkActionBar`.

What REMAINS is already pure display and forms the consolidated info board with no new UI: `CockpitHeader` (funnel + throughput + vendor SLA), `AgingAlertsBanner`, `ListView`/`GridView`, `LensesSidebar`/`FilterChips`/`SearchBar`, and the read-only detail tabs.

---

## Preview-test checklist for what IS shipped (do before promoting to main)
- [ ] Production hub shows the new cards: Service Floor, Tempering Dispatch (Cutter → Service Floor → QC → Tempering → Dispatch).
- [ ] Cutter Workbench: cutting a piece now advances it (to Service Floor if it has services, else QC) instead of leaving it at "Cut".
- [ ] Service Floor (`/production/service-floor`): Service-Pending pieces appear per service tab; marking a service decrements it and the piece reaches QC when the last clears.
- [ ] Tempering Dispatch: "Skip tempering → Ready to Dispatch" moves selected QC-Passed pieces to Ready.

## Key files
- `modules/production/companies/glassco/serviceRouting.ts`
- `modules/production/companies/glassco/pages/ServiceFloorPage.tsx`
- `modules/production/companies/glassco/pages/CutterWorkbench.tsx` (auto-route after cut)
- `modules/production/pages/TemperingDispatchOut.tsx` (skip-tempering)
- `modules/production/companies/glassco/pages/GlasscoProductionHub.tsx` (cards)
- Held: `modules/production/components/InwardAuditView.tsx`, `modules/production/companies/glassco/pages/Workbench.tsx` + `components/workbench/{KanbanBoard,PieceDetailPanel,PieceCard}.tsx`
