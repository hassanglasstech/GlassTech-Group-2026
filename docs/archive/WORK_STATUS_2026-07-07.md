# Work status — 2026-07-07

Branch: **GT-Production** (feature/test; promote to `main` via merge, never force-push).
All items below verified `tsc 0` / `369 tests` / `vite build` clean and pushed to `origin/GT-Production`.

---

## Shipped today

### A. Dispatch unification (3 surfaces → one synced entity)
Finding: Production dispatch, the Dispatch Cockpit (`modules/dispatch/`), and Logistics all read/write ONE entity — `TemperingDispatch` → table `tempering_dispatches`. They were split-brain because the row never synced to the cloud.

| Step | Commit | What |
|------|--------|------|
| 1 · data-layer sync (ROOT bug) | `dcc0a1c` | `saveTemperingDispatches` + `saveGatePasses` were bare `safeSave` (no push) → never reached Supabase. Added `markDirty` + carry the full row as a `data` jsonb blob (tripId/gatePassId/receivedPieceIds/3-way-match round-trip); pull unwraps it. |
| 3 · cockpit event-fusion | `46c7b4f` | `useDispatchTrips` now fuses `dispatch_events` (GATE_OUT/IN_TRANSIT/RECEIVING/INVOICE_RECORDED) → cockpit shows real lifecycle, not just optimistic status. |
| 4 · dead-code delete | `46c7b4f` | Removed GeofenceAlert + CapacityValidator (inert). |
| 4b · vanity tabs | `beb72e1` | Logistics 7 tabs → 4 real (Gate/Security/Dispatches/Vehicle Trips). Removed Fleet Board, Route Map, Batch Advisor (rogue trip-creator) + orphaned TripProfitability. |
| 2a · event emission | `d6b56f8` | TemperingDispatchOut now emits CREATED → PIECES_LOADED (best-effort) so the event log is populated for the cockpit. |

### B. Production Cockpit (Production Board redesign)
| Phase | Commit | What |
|-------|--------|------|
| 1 · funnel + KPI header | `cd7e2ce` | Always-on strip: Cut→QC→Tempering→Received→Ready→Delivered funnel (pieces + sqft, click to filter), today throughput, per-vendor tempering load with SLA colour. Read-only, no GL. |
| 2a · bulk QC-pass | `ec803aa` | QCWorkbench multi-select + "Pass N". 40 pcs: ~42 clicks → 3. |
| 2b · mm-aware dispatch | `579e779` | TemperingDispatchOut mm chips + "Select all shown". 6mm batch: ~8+N → ~4. |

---

## ⚠️ Verified by build, NOT by runtime
The UI screens above are auth-gated (OTP login) and could not be exercised in the dev environment. **Test on the GT-Production Vercel preview before relying on them:**

- [ ] Production → **Production Board** → funnel/KPI strip shows, clicking a stage filters
- [ ] **QC Workbench** → select all + "Pass N" passes the batch
- [ ] Production → **Tempering Dispatch** → mm chips filter, "Select all shown" selects, dispatch + print works
- [ ] **Dispatch Cockpit** (`/dispatch-cockpit`) → a newly created tempering dispatch appears in the right column

---

## Pending / next

### Dispatch — Step 2 (remaining, money-path → preview-test each)
- Route the remaining writers through the event-sourced `DispatchService` (single source of truth): GateControl consolidation, DispatchWorkbench (add `p_changed_by`, don't pick an arbitrary trip), receiving-inward.
- `DispatchService.recordTransition` helper (row status via synced store + event) as the converge-point.

### Production Cockpit
- **2c** — overdue-by-vendor drill-through: click a vendor card in the funnel header → filtered actionable list.
- **2d** — revive the orphaned `InwardAuditView` as a batch **Receive from tempering** flow (received-back → Ready in one action). Riskiest — dead-code revival + a real transition; preview-test.
- **Phase 3** — consolidation: one name (kill "Workbench" vs "Production Board" vs the "Production" hub), merge the two production nav entries, make the funnel/process view the default.

### Not blind-deletable (need a decision)
- `TripProfitability` was deleted (orphaned). If trip P&L is wanted later, it's in git history.

---

## Key facts
- Repo: `github.com/hassanglasstech/GlassTech-Group-2026`. Branches: `main` (Vercel production) + `GT-Production` (this work).
- The Dispatch Cockpit lives in `modules/dispatch/` — the intended single read-write dispatch window (currently read-only).
- Migration headers that say "NOT YET APPLIED" are often stale — 086/093 ARE applied live; confirm with founder, don't trust the file header.
