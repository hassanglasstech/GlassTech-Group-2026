# Flow-Command Map → Owner Command Board — God-mode Utility Audit + Plan (2026-07-08)

> Founder idea: a **live block-diagram flow map** — module blocks, flow lines, order **tokens
> that visibly move**, blocks **change colour on delay**, the owner **watches all day** and
> can **send a query to the supervisor at a stuck stage → supervisor replies.**
>
> He asked for a **brutal utility audit** + a genius plan if one exists. 5 expert critics
> (utility skeptic · process-mining/BPMN · andon-escalation · control-room infodesign ·
> feasibility) benchmarked it against Toyota Andon, SCADA/Ignition, Camunda Operate, Celonis,
> Signavio, FourKites/project44, PagerDuty/Opsgenie, ATC flight-strips, Kanban/LeanKit.
> **Mockup of the genius reduction:** artifact `owner-command-board-v1`.

## The brutal verdict — UNANIMOUS across all 5 lenses
**The animated "live flow + watch all day" version is a trap; a reduced, honest version is genuinely great. The real product is NOT the map — it's the Ask→Reply loop.**

### 5 kill-shots (every critic hit these independently)
1. **The animated live flow is a LIE against your data.** Cutters batch-key at shift-end →
   record-time, not real-time. A token gliding along a line *screams* "here right now."
   Owner queries "why stuck at QC?" → it cleared QC hours ago, just wasn't keyed → trust
   dies in a week. SCADA mimic-diagrams work only because they're wired to sub-second PLC
   sensors — you have a man keying at 6 PM. Animation over batch data is the single most
   dishonest rendering possible. **CUT the moving tokens.**
2. **"Watch all day" is the vanity tell.** No owner watches a flow animation after week 2 —
   the Control-Tower failure repeating. Value must be **push** (it taps him when a stage
   breaks), not **pull** (he stares hoping to catch a colour change). **CUT watch-all-day →
   daily post-shift digest + on-breach ping.**
3. **A boring "delayed orders list + Ask button" wins ~80% of the job** and costs ~5% of the
   build. The map only beats a list for (a) **department-level bottleneck read** ("which
   stage is the permanent constraint") and (b) a **non-analytical owner who reads spatial
   position faster than a table.** → **The map is the FRAME; the ranked list is the ENGINE.**
   Build both, welded together.
4. **"Order = one token crossing a block" is a category error.** An order's 40 pieces are
   smeared across Cut/QC/Tempering at once. → **Aggregate as COUNTS on nodes** (Camunda
   Operate pattern); position an order at its **trailing** (slowest) stage; drill-in for the
   list. Never render 200 dots.
5. **The Ask→Reply loop is the only genuinely NEW capability — and the highest-risk.**
   Supervisors aren't at a screen; Telegram/WhatsApp edge-functions exist but are **NOT
   live.** An in-app-only query rots unanswered → *worse than nothing*. **The loop's real
   dependency is a live phone channel, not the diagram.**

## The genius version (feasible under our data/org reality) — "Owner Command Board"
A deliberately **thin, exception-first** board. Three altitudes, no overlap:
Floor Overview (supervisor pieces) · Order Control Tower (MD per-order forensics) · **this
board = owner's department-bottleneck glance + escalation trigger.**

**Visual model** (steal Camunda Operate + ATC swimlanes; NOT free node-link, NOT Sankey):
- **Fixed left→right pipeline**, 7 nodes: Sales → Cutting → QC → Tempering (PSG/AHM/Lakhani
  sub-lanes) → Dispatch → Delivery. Static arrows. Learn the layout once.
- Each node = **count badge (orders / pcs) + oldest age**. **No moving tokens.**
- **Colour = age-in-stage vs that stage's dwell limit** (per-stage SLA), NOT count, NOT
  position — robust to stale timestamps. **3 states + grey**: calm / amber (near limit) /
  red (breached) / **grey = stale, not keyed since expected (a node can only be RED if data
  is fresh — freshness GATES alarm; kills cry-wolf)**. Colour + shape + position (colourblind).
- **Tempering = hatched "vendor estimate"** — the reddest node is the one you can act on least
  (outsourced); never let an estimate look like fact.
- **"as of last shift-close HH:MM"** on every node — the data weakness becomes honest UI.
- **Exception-first:** ~90% calm on a good day; only problems light up. A **ranked at-risk
  list welded underneath**, sharing the Ask button.

**The Ask→Reply loop (the actual product) — build THIS:**
- New table `stage_queries` (id, company, order_id, stage, from_user, to_role/assigned_to,
  question, status[raised→seen→answered→resolved], reply, asked_at, replied_at, sla_ack_at).
  RLS by company. This is the real deliverable — not the SVG.
- Owner taps a red order → **framed** question ("**What do you need to move this?**" — a help
  channel, NOT "why are you late?" — or supervisors game the data green + morale dies).
- Routes to **ONE named responsible person** (`stage_owners` config). Tempering routes to the
  internal **dispatch coordinator**, not the vendor.
- **Delivered to the phone via the existing Telegram edge-function** (Telegram > WhatsApp:
  free inline buttons, bot API, no Meta approval). Reply via message → webhook writes back.
- **Ack-SLA + auto-escalate** (PagerDuty pattern): no reply in N min → escalate to factory
  manager + re-ping. Node shows a `?` pip (open) → `!` (answered). Permanent thread = an
  accountability + vendor-SLA-dispute log (a real side-benefit).
- **Anti-surveillance discipline:** rate-limit the owner's open queries; make it bidirectional
  (floor raises blockers UP too); no per-supervisor response-time leaderboards to start.

## Phases (reuse the Control Tower `orderJourney` read model — do NOT fork)
| Phase | Scope |
|---|---|
| **O0** | Aggregate `orderJourney` by node + per-stage `daysInStage` / SLA + freshness → node model. |
| **O1** | Static pipeline board (count + oldest-age + 3-state-colour + grey-stale + "as of") + welded at-risk list. Exception-first. |
| **O2** | `stage_queries` table + `stage_owners` config + in-app Ask→Reply (honest degraded: reply in the supervisor's ERP notification bell next shift). |
| **O3** | **Activate the Telegram edge-function** — outbound query to phone + inbound reply webhook + ack-SLA escalation. ← the make-or-break; without it O2 is next-shift, not now. |
| **O4** | Post-shift daily digest push to the owner ("2 stages breached, 1 query unanswered"). |

## What we deliberately CUT from the original idea (and why)
- ❌ moving/animated tokens — dishonest over batch-keyed data.
- ❌ "watch all day" framing — replaced by push (digest + on-breach ping).
- ❌ one-token-per-order-crossing-a-block — replaced by node counts + trailing-stage position.
- ❌ colour-by-live-position — replaced by colour-by-age-vs-SLA, grey-when-stale.

**Single highest-value element (unanimous):** the **phone-routed Ask→Reply loop with an
ack-timer + audit trail.** It converts watching into action, fits the data reality, and is
worth more than the diagram it hangs on. If Telegram can't go live, ship the honest colour
board + list alone and defer the loop — don't ship a loop that rots.

## Verify + branch
Read-only board + one new table + one messaging channel. Per phase: `tsc 0 · vitest · build`
→ GT-Production → main after founder preview-test.
