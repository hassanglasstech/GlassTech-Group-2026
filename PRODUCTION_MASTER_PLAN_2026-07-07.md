# Production Refinement — Master Plan (2026-07-07)

> **Single source of truth.** Consolidates the two parallel plans:
> `PROD_WB_AND_MODULE_REFINEMENT_2026-07-07.md` (module-owns-workflow → Workbench read-only)
> and `GOD_MODE_PRODUCTION_WORKBENCH.md` (Workbench → live factory top-floor board).
> Branch: `GT-Production` (test). Work this doc phase-by-phase.

## The unified goal (both docs are two halves of ONE thing)
- **Production MODULE** (`/production` hub) = the complete workflow — all the *doing*.
- **Production Workbench** (`/production/workbench`) = a **READ-ONLY "factory top-floor" board** — stand in one screen and see who's cutting what, what's at QC, what's recut, what's at tempering, what's shippable — **without walking the floor**.

The two connect: move every WRITE out of the Workbench into the module → the Workbench becomes a pure board → then enrich that board into the floor overview. (The Service Floor that the God-mode review flagged as the "#1 missing stage" is already built — see below.)

---

## Where we are — DONE (GT-Production)
| Item | Commit | Note |
|---|---|---|
| Cut → auto-route + **Service Floor** workflow | `65a38fb` | = God-mode "#1 missing stage", now a real module screen |
| QC-Passed → Ready ("skip tempering") | `2151cf1` | 2nd of 4 Workbench-only transitions |
| Receive-back + Delivery (A3, `InwardReceivePage`) | `1d90590` | present as a dark route — **money-path, PREVIEW-TEST before main** |
| Cockpit funnel/KPI header · bulk QC-pass · mm-aware dispatch | `cd7e2ce`/`ec803aa`/`579e779` | board display + crafted flows |

So **3 of the 4** Workbench-only transitions now have module homes (Cut→QC ✓, QC→Ready ✓, receive/deliver = A3 pending preview-test).

---

## Phase plan

### TRACK 1 — Module owns the workflow → unlock the read-only Workbench
| Phase | Scope | Status |
|---|---|---|
| 1.1 | Service Floor (cut auto-routes to Service-Pending/QC; per-service marking) | ✅ done |
| 1.2 | QC-Passed → Ready (skip-tempering) | ✅ done |
| 1.3 | Receive-back (tempering AP GL) + Delivery (COGS) — `InwardReceivePage` | ⏳ code present, **preview-test** |
| 1.4 | **Workbench → read-only**: remove Kanban view + bulk-move bar + PieceDetailPanel action footer; keep CockpitHeader + List/Grid + lenses + read-only detail | ⛔ after 1.3 verified |

### TRACK 2 — Data-model truth (prerequisite for the floor board)
| Phase | Scope | Status |
|---|---|---|
| 2.1 | Add nullable piece fields (ride existing `p_extra`): `assignedCutter`, `prevCutters[]`, `assignedAt`, `assignedBy`, `faultHistory[]`, `fault.origin`, `commitmentType`, `blockedReason`. Without per-piece assignment the board's "ghosted reassigned piece on both lanes" headline is fiction. No GL, no new table, `piece.id` untouched. | ✅ `d06f617` — types + both pull mappers lift from `data` jsonb; push mappers untouched (RPC owns `data`). **Data-model only — no write flow yet** (that's D1/D2). tsc 0 · 369 tests · build clean. |

### TRACK 3 — Floor overview board (the God-mode vision, on the now read-only Workbench)
| Phase | Scope | Status |
|---|---|---|
| 3.1 | Short ref-code `pieceRefLabel()` = `<last4-of-order>/<index>` (e.g. `2456/3`); wire funnel/pools/cutter-lanes to piece-level fields | ⬜ |
| 3.2 | **Read-only Floor View** (4th `WorkbenchView='floor'`, no new route). MUST ship together: **freshness layer** (kill "Live" → `as of HH:MM` + per-cutter "last logged", per-piece last-seen age, stale wash on un-updated lanes) · **Service-Floor lane** · **thickness/mm join** · **defect-code on the fail chip**. Else it "ships confidently wrong". | ⬜ |
| 3.3 | At-risk & attribution: due-date / ready-to-ship gate + AT-RISK strip · raw-glass availability (starved-cutter) · HR `attendance` on lane · quality rate/cost/attribution · `FloorStaff.avgSqftPerHour` → ETA-to-clear | ⬜ |
| 3.4 | Wazir auto shift-report (Haiku via `claude-proxy`, human-in-loop) — the artefact that literally answers "report without walking the floor" | ⬜ |

---

## Founder decisions — ANSWERED (2026-07-07)
1. **Cutter data entry = DUAL model + transition.**
   - **Now (transition):** the supervisor enters piece updates in the ERP (time-to-time / evening batch), **each stamped with a timestamp**. When the supervisor logs a piece **on behalf of a cutter**, it is **attributed to that cutter and appears in that cutter's own account/screen** — so each cutter sees their own work even before self-logging.
   - **Later (once the supervisor has run + tested it):** a **separate cutter login screen (smartphone-first)** where each cutter updates their own pieces directly. Both paths write the same per-piece cutter attribution; the cutter screen is a filtered "my pieces" view.
2. **Reassignment = a "Reassign" option on the job order** (just like the existing assign). The system **offers the remaining (un-cut) pieces** of that job to the new cutter. The **previous cutter keeps the job in their screen/history with their partial cuts** — their completed portion stays theirs; only the remainder moves.
3. **Recut / rejected piece → the supervisor's pool** (supervisor redistributes; NOT auto-back to the original cutter).

### Resulting work items (mapped to tracks)
- ✅ **D1 → cutter data entry — SHIPPED (`61429e6`):** (a) **supervisor logs-on-behalf** — when a privileged user cuts via the act-as-cutter picker, the piece is CREDITED to that cutter (`cutBy`) while `assignedBy`/`assignedAt` record the real operator (via the cut RPC's `p_extra`); a new **"My Cuts Today"** section on CutterWorkbench shows the (effective) cutter's credited pieces with a "logged by X" chip → the entry surfaces on the cutter's account even before self-login. Cut-queue cards show a "reassigned to you from X" badge (D2 tie-in). (b) **cutter self-login screen** = structurally already in place — CutterWorkbench is role-gated to `glassco_cutter`, and for a non-privileged cutter `cutterName = actorName` so the queue + My Cuts Today are automatically their own pieces (the my-pieces filter). Cutover = provision cutter logins + supervisor sign-off after preview test. **Auth-gated — preview-test on GT-Production.**
- ✅ **D2 → Reassign job flow — SHIPPED (`ed1ea8a`):** on the Job Orders screen, changing an already-assigned cutter → a different one is now an explicit Reassign (confirm shows remaining un-cut pcs that move vs already-cut that stay). `ProductionService.reassignRemainingPieces` stamps each un-cut piece's per-piece `assignedCutter` + appends the outgoing cutter to `prevCutters[]` + `assignedAt`/`assignedBy`, via a same-status `update_piece_status_atomic` no-op (carries the fields in `data` jsonb). Job-level `Quotation.assignedCutter` still updates (drives the Cutter Workbench queue). "Reassigned from X → Y" history chip surfaces the previous cutter. No status change, no GL. tsc 0 · 369 tests · build clean. **Auth-gated — preview-test on GT-Production.**
- **D3 →** **Recut → supervisor pool:** a recut/rejected piece is routed to the supervisor's uncut/redistribute pool (a pool bucket keyed off unassigned/`assignedCutter=null` or a `blockedReason`), from where the supervisor reassigns.

## Honest caveat (from the God-mode self-review — keep it truthful)
Cutters have **no tablets**; they batch-key at shift-end, so `cutAt`/`lastUpdated` are **record-time, not physical-event time**. Therefore the board can honestly report **delivery, backlog, aging, and recorded throughput WITH visible staleness** — but it will NOT certify "who is actively cutting right now", true at-risk, or a starved/absent cutter until tablets + Phase 2.1 data exist. **The board must say `as of HH:MM` on its face, never "Live".**

## Recommended order
1.3 (preview-test A3) → 1.4 (Workbench read-only) → 2.1 (piece data-model) → 3.1 → 3.2 → founder decisions → 3.3 → 3.4.

## Source docs (detail)
- `PROD_WB_AND_MODULE_REFINEMENT_2026-07-07.md` — Track 1 detail (transition coverage, InwardAuditView/Phase-B file refs).
- `GOD_MODE_PRODUCTION_WORKBENCH.md` — Track 2/3 detail (8-point vision, 24 gaps / 9 blockers, freshness layer, mockup).
