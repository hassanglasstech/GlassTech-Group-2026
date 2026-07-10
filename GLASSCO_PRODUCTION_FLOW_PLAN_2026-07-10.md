# GLASSCO — END-TO-END PRODUCTION FLOW (Sales Order → Delivery)

Founder spec (2026-07-10). The piece must flow, connected via APIs, across:
**Job Orders → Cutting Supervisor → Cutter → Service stations (Polish / R-D / Notch) → QC → onward.**

## Target flow + who does what
| Screen | Shows | Actions allowed | NOT allowed |
|---|---|---|---|
| **Job Orders** (production) | Confirmed SOs + live piece progress. **No amount.** | Set JO **Active / Pending / Hold / Void** (Void only if the SO itself is voided) | **No cutter assign** (that's the supervisor) |
| **Cutting Supervisor** | **Only pending / current** JOs (completed drop off) | Assign cutter: **whole-JO / whole-mm / single piece** (already built) | — |
| **Cutter** | **Only JOs assigned to me that are still incomplete** — assigned **pcs + sizes + 2D plan + image** | **Cut** a piece → Done; **Break** a piece (if it breaks) | cut others' work |
| **Polish / R-D / Notch station** | JO-list of JOs that have pieces **available for that service** | Open JO → mark each piece **Done** → piece moves to the **next** required service or QC | — |

## Current state (what exists) + the "data not linked" check
- **Pieces** are created at approval and link to their order by `piece.orderId === order.orderNo || order.id`. Every screen (JobOrders, SupervisorJobBoard, CutterWorkbench, service screens) reads the SAME `ProductionService.getProductionPiecesAsync()` + `AsyncSalesService.getQuotations()`. So the join logic IS sound.
- **After Cut**, CutterWorkbench auto-routes the piece: `deriveServiceBuckets(orderItem)` → if services needed → `Service-Pending` (+ `pendingServices`), else `QC-Pending`. So cut→service routing exists.
- **Service screens** exist: `ServiceStationScreen` (per-operator), `ServiceFloorPage`, `QCWorkbench`.
- **The likely "not showing linked data" causes** (to verify against live data, since the join is correct in code):
  1. Pieces **not generated at approval** for some orders → those JOs show 0 pieces everywhere.
  2. `orderId` format drift (`SO-Glassco-…` vs `SO-GLS-…`) → 21 orphan pieces seen in the backup; a mismatched orderId hides a piece from its order.
  3. Service screens filter by a service bucket that `deriveServiceBuckets` names differently than the quotation's `selectedServices` codes (T/G, R/D, P/E, Notch) → pieces sit in Service-Pending but never appear on a station.
  → **P5 verifies all three on the running app.**

## Phases (each: build → verify → commit → promote)

### P1 — Job Orders section
- ✅ Removed **amount** column + **cutter-assign** (`0423872`).
- **P1b:** Add JO **status control** (Active / Pending / Hold / Void). Store a `jobStatus` on the order (data jsonb via `saveQuotations`). Void auto-derived when SO status = Void; Active/Pending/Hold are set here. Log changes.

### P2 — Cutting Supervisor filter
- Show **only Active** JOs that still have Pending-Cut pieces (Hold/Pending JOs hidden from the assign pool). Completed already drop off (board filters on Pending-Cut). Small filter add to `SupervisorJobBoard`.

### P3 — Cutter screen
- Assigned-only + incomplete: already filtered (`cutQueue`).
- Add **Image** to the cutter's per-JO view (reuse the design images; supervisor JO-detail already has the Image tab).
- Add a **Break** action next to Cut: piece → `Broken` (or QC-Failed→Recut per the fault flow) via `update_piece_status_atomic`, capturing which size broke.

### P4 — Service stations (Polish / R-D / Notch)
- Per station: **JO-list** of orders with pieces in `Service-Pending` whose `pendingServices` include this station's service.
- Open JO → list the **available-for-this-service pieces** (sizes) → mark **Done** → remove that service from `pendingServices`; when none remain → route to the **next** service or `QC-Pending`. All via `update_piece_status_atomic` (status-only, no GL).
- Verify `ServiceStationScreen` / `serviceRouting` already do this; fill gaps. This is the biggest remaining build.

### P5 — End-to-end data-linkage verification
- Confirm pieces are generated at approval (spot-check an approved order → pieces exist with correct `orderId`).
- Walk one order Cut → Service → QC across screens; confirm each screen shows the piece at the right stage.
- Fix orderId format drift + any service-bucket naming mismatch found.

## Status
- ✅ **P1** — amount + cutter-assign removal (`0423872`).
- ✅ **P1b** — JO status control (Active/Pending/Hold, Void auto-derived) on Job Orders (`78ef69e`).
- ✅ **P2** — Cutting Supervisor shows only effectively-Active JOs (`78ef69e`).
- ✅ **P3** — Cutter Break action (Pending-Cut → Broken) + per-JO design-image drawer (`78ef69e`).
- ✅ **P4** — Service Floor is now JO-grouped per service tab (Polish/Grind/Notch/Holes); open a JO → clear its pieces → auto-route to next service or QC (`4a5d16b`).
- ⏳ **P5** — end-to-end linkage verify on the running app (founder testing). Requires DB migrations 094 + 095 applied (cut transition). Watch for: orderId format drift (SO-Glassco vs SO-GLS) hiding pieces, and service-bucket naming (P/E,R/D,Notch → Polishing/Grinding/Notching) mismatches.

### DB dependencies (must be applied on live Supabase)
- **094** — `update_piece_status_atomic` last_updated timestamptz cast (fixed "Cut failed: … type text").
- **095** — `_piece_transition_allowed` gains Pending-Cut → Cut (fixed "invalid_transition Pending-Cut→Cut").
