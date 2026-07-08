# Work Status — 2026-07-08

Branch `GT-Production` (test); promote to `main` after founder preview/live-test.

## Shipped today (all tsc 0 · 369 tests · build clean)
| Commit | What |
|---|---|
| `4fe8f4b` | Cutter-workbench queue filter (name normalize `sameName`) + desktop layout cap + clearer privileged empty-state |
| `af6d966` | **Service operator station screens** — polish / grinding / hole-notch (`/station/*`), mobile-first, reuse ServiceFloorView marking; hub "Operator Stations" section |
| `fe84576` | **Cutting Supervisor screen** (`/production/cutting-supervisor`) — all-benches monitor + assign the unassigned pool & recut pool |
| `1edf1a1` | **Device PIN auth** — magic-link/OTP once, then a 4–6 digit device PIN unlock (no re-login); additive to biometric + remember-token. ⚠ AUTH — founder must LIVE-TEST login before main |

Earlier this session (production overhaul, all on GT-Production, some promoted to main `f0902e1`):
Track 2.1 piece data-model (`d06f617`) · D2 Reassign job (`ed1ea8a`) · D1 on-behalf attribution (`61429e6`) · D3 recut→supervisor pool (`99ae574`).

## Designed (mockups + plans) — NOT built yet
- **Floor Overview** andon board (`PRODUCTION_FLOOR_BOARD_PLAN_2026-07-08.md`, artifact `floor-overview-v2-andon`) + roster benches refinement.
- **Order Control Tower** (`ORDER_CONTROL_TOWER_PLAN_2026-07-08.md`, artifact `control-tower-v1`).
- **Owner Command Board** (`OWNER_COMMAND_BOARD_AUDIT_2026-07-08.md`, artifact `owner-command-board-v1`) — flow-command map audited down to an honest exception-first board + Ask→Reply loop (needs Telegram live).

## Pending / next
- Live-test the auth PIN + the new worker screens on the glassco role (preview).
- Provision `glassco_service` / supervisor roles for the operator/supervisor accounts.
- Build the designed boards when the founder chooses.
