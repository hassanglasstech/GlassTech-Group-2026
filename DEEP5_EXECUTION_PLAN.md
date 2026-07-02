# Deep-5 Architecture Fixes — Execution Plan (God-mode audit #3/#5/#6/#9/#13)

Conflict-aware order (risk asc, honoring shared-file overlaps on SyncService.ts + financeService.ts):

## Order & approach
1. **#13 tests (code-only, autonomous)** — vitest glob fix `modules/**/*.test.ts`; GL-balance suites import REAL `assertGLBalance`/`LedgerImbalanceError` (not inline copies); delete dead copies. Becomes the regression net for the rest.
2. **#6 scale — Layer 1 only (code + staged migration)** — `trial_balance`/`attendance_summary`/`ar_aging` read-only SQL RPCs, wired into TrialBalance/FinancialStatements with **JS-reduce kept as automatic fallback** (safe before RPC exists). Migration staged UNAPPLIED. Layers 2/3 (cache windowing, mirror truncation) DEFERRED (collide with #3 write cache).
3. **#3 writes — safe-incremental (code-only, autonomous)** — `_dirtyLedgerIds` set: diff incoming ledger by id+JSON-equality, push only changed/new rows (appends never collide — the dominant op). Restore dropped audit cols in `TABLE_COLUMNS.ledger`. De-dup non-finance `markDirty('ledger')` callers. FULL version-lock migration (050) SHELVED for supervised follow-up.
4. **#5 deletes — Step A+B (code behind flag + staged migration)** — `deleted_at` on financial tables (ledger, petty_cash, invoices, payment_receipts, credit_notes, quotations); `pullTable` gets `.is('deleted_at', null)` read filter; `ledgerToRow` passes `deleted_at`; `FinanceService.softDeleteLedgerEntry(id)`. Migration staged UNAPPLIED. Code is harmless if column absent (additive read filter + nullable field).
5. **#9 atomic — Option A (code + staged migration, SIGN-OFF before apply)** — `credit_note_atomic` RPC (AR/Rev/GST reversal + invoice-balance + CN-status in one txn), clone of proven `post_invoice_atomic` (042); COGS reversal stays best-effort (`cogsReversalPending`). `void_invoice_atomic` as a 2nd step. Server re-asserts status FOR UPDATE + double-post guard + `assert_ledger_balance`. **Highest blast radius — staging + two-browser test before prod apply.**

## Staged (UNAPPLIED) migration files — founder applies after sign-off
- `088_finance_aggregation_rpcs.sql` (#6 — read-only RPCs + indexes; lowest-risk, quick sign-off)
- `089_soft_delete_tombstones.sql` (#5 — deleted_at + partial indexes, financial tables)
- `090_credit_note_void_atomic.sql` (#9 — atomic RPCs; must run after 042; highest-risk)
- `STAGED_ledger_version_lock.sql` (#3 FULL — shelved, not part of incremental ship)

## Pre-apply check (in every migration header)
Live DB has diverged from migration files before (recent HR commits) — verify actual table shape via information_schema before applying; all migrations are IF-NOT-EXISTS / information_schema-guarded (idempotent on a diverged instance).

## Verify gate between every item
`npm run lint` (tsc — 0 new crash-class) + `npm run build` (✓) + `npm run test` (318+) + `npm run lint:eslint:errors` (0). Commit per item, local only.
