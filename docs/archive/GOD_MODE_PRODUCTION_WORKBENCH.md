# God-Mode Production Workbench — Plan + Honest Self-Review

> Founder vision: a live "factory top-floor overview" for the Glassco cutting
> floor — stand in one screen and see who's cutting what, what's at QC, what's
> recut, without walking the floor. Branch: `GT-Production` (test).
> Status: **PLAN ONLY** (no repo code yet). Mockup published as a claude.ai artifact.

---

## The vision (8 points)

1. Piece ref-code shown as `<last-4-of-order>/<piece-index>` (e.g. `2456/3`) — not the whole SO number.
2. Job order enters Production → assign a cutter from there.
3. Cutter Workbench: click a cutter's card → their assigned + in-progress work.
4. Partial job reassigned to another cutter → shows on BOTH cutters' screens.
5. Cut pieces pool → QC clears job-wise, then piece-wise.
6. NCR / recut / issues → QC reports → on the workbench + on the assigned cutter's table.
7. Uncut-pieces pool → supervisor distributes to cutters.
8. All of it in a visually understandable "top floor" board.

## Design (build ON the shipped Cockpit / Service Floor / CutterWorkbench)

~70% of the machinery already exists. God-mode ≈ (a) one display helper, (b) a
few nullable piece fields, (c) one aggregating view (a 4th `WorkbenchView='floor'`
on `/production/workbench` — no new route), (d) two thin write wrappers.

Data model (no GL, no new table, `piece.id` untouched — short code is display-only):
```ts
// ProductionPiece — add (all nullable, ride existing p_extra passthrough)
assignedCutter?: string;  prevCutters?: string[];  assignedAt?: string;  assignedBy?: string;
```

---

## ⚠️ HONEST SELF-REVIEW — "can someone report everything WITHOUT walking the floor?"

Four reporter personas (shift supervisor, MD briefing, planner, quality manager)
each wrote their report from the board alone. **All four were blocked on the
questions their job turns on.**

### Straight answer: **NO — not yet.**
The board reports the **delivery/backlog picture** honestly, but NOT the
**cutting-floor picture**. It is a truthful *state-of-record* view, not yet a
*report-without-walking* view.

### The honesty problem — strike "Live"
Cutters have no tablets; they batch-key "today's routine" at a shared terminal at
shift-end. So `cutAt`/`lastUpdated` are **record-time, not physical-event time**.
- At 2pm a cutter showing 0 cuts may have cut 40 (not keyed); one showing 40 may have gone home. **Board can't tell stale from idle.**
- No honest mid-shift run-rate; funnel is undercounted before shift-end (counts keystrokes, not glass).
- **Fix:** kill the "Live" badge → `as of HH:MM`, a per-cutter "last logged 11:40am" stamp, per-piece last-seen age, and a staleness wash on lanes not updated this shift.

### 24 deduped gaps, **9 blockers**. Three are structural blind-spots:
1. **Service-Floor stage is missing** — real flow is `Cut → Service (polish/grind/notch) → QC`; the board shows `Cut → QC`. All four personas flagged it.
2. **Thickness/type blind** — lives on the order item, not the piece → planner can't load-balance by mm.
3. **Per-piece assignment is fiction today** — assignment is job-level (`Quotation.assignedCutter`). The advertised "ghosted reassigned piece on both lanes" **cannot be computed** until `assignedCutter/prevCutters` move onto `ProductionPiece`.

Other blockers: no freshness stamp (#1), no due-date/at-risk (#3), no in-progress vs idle (#7, honest proxy = freshness), no blocked-reason (#8), no cause-of-pile (#10), no raw-glass availability so a starved cutter looks busy (#11), defect code never shown so QC can't say WHY it failed (#15).

### The upgrade — state board → report board
| Add | Cost |
|---|---|
| (a) Freshness layer — `as of HH:MM`, per-cutter last-logged, stale wash; kill "Live" | Cheap (existing `lastUpdated`) — **do first** |
| (b) Per-piece aging + per-cutter idle-proxy + HR `attendance` on lane | Cheap |
| (c) Due-date join + AT-RISK strip + order ready-to-ship gate | Cheap join (+ `commitmentType` field) |
| (d) Service-Floor lane (`Service-Pending` + `pendingServices`) + tempering vendor/return-date | Cheap-ish / medium |
| (e) Wazir auto shift-report (Haiku via `claude-proxy`, human-in-loop) | Medium — the artefact that literally answers "report without walking" |

Also cheap/existing: defect code on fail chip, `PieceFault.costImpact` in NCR header, thickness/type join, `FloorStaff.avgSqftPerHour` → ETA-to-clear on lane.
Needs data-model change: per-piece `assignedCutter/prevCutters`, `fault.origin`, `faultHistory[]`, `commitmentType`, `blockedReason`.
Genuinely hard (no tablets): true real-time "cutting now" + physical cut timestamps — freshness layer is the honest substitute.

### Revised phasing
| Phase | Scope |
|---|---|
| **Phase 0 — data-model truth** (NEW, prerequisite) | per-piece `assignedCutter/assignedAt/assignedBy/prevCutters`; `faultHistory[]`; `fault.origin`; `commitmentType`; `blockedReason`. Without per-piece assignment the board's headline feature is fake. |
| Phase 1 — short ref-code `pieceRefLabel()` + funnel/pools/lanes wired to piece-level fields | cheapest visible win |
| **Phase 2 — read-only Floor View** | MUST add on day one: **freshness layer + Service-Floor lane + thickness join + defect-code on chip.** Else it ships "confidently wrong". |
| Phase 3 — at-risk + material + attribution | due-date/ready-to-ship, raw-glass availability, attendance, quality rate/cost/attribution, cutter-rate ETA |
| Phase 4 — Wazir shift-report | automated "report without walking", human-in-loop |

**Bottom line:** with the freshness layer + Service-Floor lane, Phase 2 honestly
reports delivery, backlog, aging, and recorded throughput *with visible
staleness*. It still will NOT certify who's actively cutting, what's truly
at-risk, why a piece failed, or whether a quiet cutter is starved/absent — those
need Phase 0 (data) + Phase 3 (joins). The board should say so on its face.

---

## Founder decisions needed (gate Phase 3/4)
1. **Cutter terminal:** one shared floor touchscreen (cutters self-log at shift-end) OR supervisor records everyone's routine?
2. **Reassignment lifetime:** partial job Imran→Bilal — stays on Imran's lane until (a) Bilal's first cut, (b) whole job cut, or (c) forever (audit)?
3. **Recut default cutter:** back to original cutter, to supervisor's uncut pool, or always a senior cutter?

## Mockup
Concept board (cutter swim-lanes + pools + NCR + short codes, hover-trace-a-job)
published as a claude.ai artifact — note: it currently shows the *aspirational*
"Live" + ghosted-reassignment which this review flags as not-yet-truthful; a v2
should adopt the freshness layer + Service-Floor lane.

## Next step
Start **Phase 0 (data-model truth)** — the foundation everything else needs — or
build the **honest mockup v2** first.
