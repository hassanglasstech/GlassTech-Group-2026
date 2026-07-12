# GLASSCO — CUTTING-FLOOR SCREENS + 2D CUT PLAN + ADMIN SETTINGS

Founder ask (2026-07-09): supervisor & cutter mobile+PC screens; JO list → assign per-piece / whole-mm; JO image tab; 2D cutting-optimizer tab (select sheet from material master → efficient cut plan → # sheets needed); admin settings for standard-sqft logic + wastage config (with change logs).

## Big picture: ~80% already exists → this is REORG + GAP-FILL + CONFIG
| # | Requirement | Already exists? | Gap to build |
|---|---|---|---|
| R1 | Supervisor: **JO list** (order-no last4, mm-wise pcs, total sqft, due date) | Partial — `CuttingSupervisorScreen` is a *piece-pool* view, not JO-list; `JobOrders.tsx` exists | **New JO-list grouping** (group pieces by order → mm-wise pcs + sqft + due) |
| R2 | Click JO → detail; **mm-wise pcs**; assign a piece OR **whole mm** to a cutter | Per-piece assign exists (`reassignRemainingPieces`) | **JO-detail tabbed panel** + **assign-whole-mm** bulk action |
| R3 | Assigned details on **cutter screen** (pc no + sizes) | `CutterWorkbench` shows assigned pieces | Ensure **sizes** shown; mobile-first polish |
| R4 | JO **image** accessible (a tab) | `AttachmentsTab`, piece `attachedImage`/`designFile` | Surface as a **tab** in JO-detail + cutter |
| R5 | **2D cutting diagram** tab: pick sheet (material master) → cut plan → **# sheets req** | **Fully built:** `binPacking.packPieces`, `CuttingDiagram.SheetSVG`, quotation wastage tab | **Wire** into JO-detail + cutter; sheet dropdown from products; show sheets-required |
| R6 | Same diagram in a **Glassco quotation tab** | **Exists** — GlasscoEditor `wastage` tab | Reference/keep consistent |
| R7 | Mobile + PC compatible | Screens are responsive-ish | Verify both breakpoints |
| R8 | Admin setting: **standard-sqft logic** (populate current, log on change) | Logic is **hardcoded** (billed-sqft rounding + high-wastage zones 55-60"W /115-120"H in GlasscoEditor + `useQuotationWastage`) | **NEW:** config table + admin UI + change log; read logic from config |
| R9 | Admin setting: **wastage width/height** marked per sheet | `WASTAGE_TOLERANCE` const + zone thresholds hardcoded | **NEW:** same config store + logs |

## Phased, step-by-step build

### Phase A — Supervisor Job-Order list + detail (R1, R2, R4)
1. `useCuttingJobs` selector: group `production_pieces` by `orderId` → per-JO: order-no last4, due date (from quotation), mm-wise `{thk: {pcs, sqft}}`, total sqft, status roll-up.
2. `SupervisorJobList` component: card/row per JO (order-no · mm×pcs chips · total sqft · due-date, colour by delay). Reuse cockpit styling.
3. `JobOrderDetailPanel` (tabbed): **Tab 1 Assign** (mm groups; per-piece "Assign to…" + "Assign whole mm →cutter" bulk), **Tab 2 Image** (attachedImage/designFile viewer), **Tab 3 Cut Plan** (Phase D).
4. Wire into `CuttingSupervisorScreen` as a second view mode (Benches ↔ Jobs toggle) — keep the existing pool view.

### Phase B — Whole-mm / bulk assignment (R2)
5. Extend `ProductionService.reassignRemainingPieces` usage: "assign all Pending-Cut pieces of thickness X in this JO to cutter Y" (loop the atomic RPC; one toast).

### Phase C — Cutter screen enrichment (R3, R4)
6. `CutterWorkbench`: ensure each assigned piece shows **piece-no + W×H + thk + services**; add **Image** view + **Cut Plan** tab (mobile-first, big touch targets).

### Phase D — 2D cut-plan integration (R5) — mostly wiring
7. Shared `CutPlanTab`: sheet-size dropdown sourced from **Material Master** (products where category Raw/Glass → sheetSize) filtered to the JO's thickness; on select → `packPieces(pieces, sheetW, sheetH)` → render `SheetSVG` per sheet + **"N sheets of 84×144 required, wastage X%"**. Used by both supervisor JO-detail and cutter screen.
8. Confirm parity with the quotation `wastage` tab (same engine, no divergence).

### Phase E — Admin settings: standard-sqft + wastage config (R8, R9) — the real new backend
9. New table `glassco_cut_settings` (or a `settings` jsonb row): `{ sqftRounding, minBilledSqft, highWastageZones:[{wMin,wMax},{hMin,hMax}], wastageTolerance:{plain,reflective,...} }`. **RLS + company=Glassco.**
10. Seed it from the CURRENT hardcoded values (so behaviour is unchanged on day 1).
11. Admin screen (Admin module → Glassco Cutting Settings): edit the above; **every change writes a `settings_change_log` row** (who/when/old→new).
12. Refactor `useQuotationWastage` + billed-sqft calc + `WASTAGE_TOLERANCE` to READ from config (fallback to constants if unset). No behaviour change until edited.

### Phase F — Responsive + verify + promote
13. Mobile (375) + PC breakpoints for supervisor JO-list, JO-detail tabs, cutter screen, cut-plan SVG (scroll/zoom).
14. Verify gate (tsc + tests + build), preview smoke on MT server, commit per-phase, promote to main.

## Open questions for founder (non-blocking — sensible defaults chosen)
- **Assignment granularity:** default = per-piece + per-mm within a JO. (Whole-JO one-click also easy to add.)
- **Cut-plan authority:** cutter picks the sheet & sees the plan (advisory). Auto-suggest best sheet = later enhancement.
- **Settings scope:** Glassco-only for now (GTK/GTI later).

## Sequencing
A → B → C → D → E → F. A–D are mostly reorg/wiring of existing engine (fast). E is the genuinely new backend (config + logs). Each phase: build → verify → commit → promote.
