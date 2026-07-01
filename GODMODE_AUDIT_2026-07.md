# GlassTech ERP — Enterprise Grade Audit (God-Mode, 2026-07-02)

**Overall: 4.0 / 10 — Tier: SMB-MVP (single-operator, single-company). NOT enterprise-grade, NOT multi-user-safe as-is.**
17-agent audit (8 dimensions × audit + adversarial verify + synthesis). Every finding evidence-backed to file:line.

## Scorecard
| # | Dimension | Score | Verdict |
|---|---|---|---|
| 1 | Architecture & Code Structure | 4/10 | Real modular skeleton + centralized GL, but ~189 hardcoded company-string branches (no tenant registry), duplicate `GlassCo` literal orphans AI-agent writes, 3 parallel quotation impls, no ESLint (1,395 `any`). |
| 2 | Data Integrity & Transaction Safety | 5/10 | Invoice posting genuinely atomic (server RPC + balance trigger); everything else whole-array last-write-wins, swallowed cloud failures, no delete propagation. |
| 3 | Scalability & Performance | 3/10 | Loads entire per-company tables into browser memory + localStorage, no pagination, re-upserts whole arrays. Collapses at volume. |
| 4 | Security & Multitenant Isolation | 2/10 | Late `GRANT ALL … TO anon` on ledger/payroll/user_profiles never revoked; strict RLS written but never enabled. Anon key in public bundle can read/write all companies' financial+HR data. |
| 5 | Financial / ERP Domain Correctness | 6/10 | CA-literate GL (double-entry both layers, COGS at delivery, WIP labour per IAS 2), but account code 11514 collides 3 ways, period-lock defaults OPEN, maker-checker browser-only. |
| 6 | Type Safety & Code Quality | 4/10 | Strict mode + clean error discipline, undermined by ~2,300 `any` at DB boundary + no ESLint + god-files. |
| 7 | Testing & Verification Maturity | 3/10 | ~75% of tests assert against inline copies of logic; CI fires only on dead `nippon` branch; "type-check" is `vite build` (no tsc); zero E2E. |
| 8 | Operational Readiness | 5/10 | Real DR runbook + error boundaries, but no server-side crash monitoring, unscheduled backup, single-operator bus factor. |

## Three questions
- **Senior-level well-structured?** Partially. Bones real (centralized GL, service layer), but multitenancy is 189 string branches + duplicate company literal + no lint enforcement.
- **Scalable + integrity guaranteed?** No + No under concurrency. Safe for ONE disciplined user on ONE company; whole-array last-write-wins + swallowed GL failures + no delete sync break the guarantee the moment two people edit.
- **Enterprise-grade?** No. Gap is enforcement/infra (RLS, concurrency, monitoring, CI, DR), not domain understanding. Guarantees hold only because you're watching.

## Contrast: SAP B1 ≈ 8.5-9 · NetSuite ≈ 9 · Odoo ≈ 7.5-8.5 · **This ≈ 4.**

## P0 blockers (fix before real money / 2nd company / 2nd user)
1. **Anon key owns ledger/payroll/roles** — `GRANT ALL … TO anon` in `20260433_stock_ledger_ledger_cols.sql:31` (+20260429/32/34), applied after 064/068, never revoked. Anon key ships in public JS bundle → unauthenticated read/rewrite of all financial+HR data. **Most urgent.** → migration to REVOKE anon writes + CI guard.
2. **No DB company isolation; strict RLS never enabled** — ~93 tables `USING(true)` (067_phase0…:62); 044/054 policies never invoked. → run `enable_strict_rls_recommended()`, pen-test cross-company = 0 rows.
3. **Whole-array last-write-wins on financial writes** — `financeService.ts:438`; `update_with_version` wired to only production pieces. → route ledger/invoice/inventory through it, push changed rows only.
4. **GL cloud-write failure swallowed after local commit** — `financeService.ts:290-305`. → cloud-first or durable retry queue.
5. **Sync never propagates deletes** — voided ledger/invoice rows resurrect on pull. → soft-delete tombstones.
6. **Full-table loads into memory + localStorage** — `financeService.ts:203`, `hrService.ts:232`. → SQL aggregation RPCs + `.range()` pagination.
7. **Account 11514 collides 3 ways** (WIP-Direct-Labour vs Laminated Glass Stock vs input GST) — `hrService.ts:453`, `glasscoGLHelpers.ts:77`, `taxSettingsService.ts:31`. TB still balances so wrong BS line is invisible. → separate leaf codes + build assertion.

## P1 blockers
8. Duplicate `'GlassCo'` literal orphans AI-agent writes — `constants.ts:8`, `agentTools.ts:511/519`. → delete + data-fix UPDATE.
9. Credit-note/void post AR/rev/GST/COGS non-atomically — `creditNoteService.ts:230-283,352-402`. → atomic RPCs.
10. Period lock defaults OPEN — unlimited back-posting — `periodService.ts:71`. → default-deny past months.
11. Maker-checker browser-only — `financeService.ts:553`. → server trigger `approved_by ≠ drafted_by`.
12. CI inert/illusory — dead branch + `vite build` not tsc — `.github/workflows/ci.yml:11,27`.
13. ~75% tests assert against inline copies; correct suite not collected. → import real services.
14. No server-side crash monitoring — `ErrorBoundary.tsx:37-40`. → POST fatals to Supabase + alert.
15. Off-site backup unscheduled, no heartbeat — `scripts/nightly-export.js`. → monitored scheduler + tested restore drill.

## Genuine strengths
- CA-literate, centrally-enforced GL (double-entry at client + Postgres trigger; COGS at delivery; WIP per IAS 2).
- `post_invoice_atomic` genuinely transactional; real `FOR UPDATE` RPCs (042/043) with live callers.
- Real maker-checker + idempotency logic; AI keys protected (DEV-gated, stripped in prod).
- Sound module taxonomy, lazy routes + ModuleErrorBoundary, real shared utils, clean tree.
- Honest in-code tech-debt documentation.

## Roadmap
- **Phase 0 (1-2 wk, before 2nd company/user):** revoke anon grants + CI guard (#1); enable strict RLS + pen-test (#2); fix 11514 collision (#7); kill `GlassCo` literal (#8).
- **Phase 1 (2-4 wk):** version-locked/changed-row writes (#3); cloud-first GL + retry (#4); delete tombstones (#5); atomic credit-note/void + server maker-checker + default-closed periods (#9,#10,#11).
- **Phase 2 (2-4 wk):** SQL aggregation + pagination + stop localStorage all-time mirror (#6); real CI + tests import real services + coverage + Playwright smoke (#12,#13); ESLint (no-explicit-any ratchet, no-floating-promises, no supabase.from outside services).
- **Phase 3 (ongoing):** server crash monitoring (#14); scheduled+monitored backup + restore drill (#15); tenant-config registry to replace 189 branches; decompose god-files; second operator + credential vault.

**~2-3 months focused (Phases 0-2) to genuine multi-company multi-user trust. Most of it is turning guarantees you already DESIGNED (strict RLS, optimistic locking, atomic RPCs) from dormant into enforced. Do Phase 0 first.**
