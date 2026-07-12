# Test-Suite Rebuild — 2026-07-12

**Branch:** `GT-Production` (local commits only — **not pushed**)
**Trigger:** Founder doubted the validity of the 369 "tests"; God-mode audit had
also flagged Testing 3.8/10 as the biggest remaining risk after the P0 fixes,
because the changed money code (sync, payroll, receipts) had **no** regression net.

---

## TL;DR

- **Deleted 250 fake tests** (5 pure "shadow" files that re-implemented logic
  locally and never imported the code they claimed to test — one actively
  *contradicted* the real piece-status table).
- **Wrote 43 new REAL tests** across the changed money code — each imports the
  actual production symbol and asserts its output/behavior.
- **Added a coverage gate + CI** on the critical money modules.
- Whole suite: **161 tests / 14 files, all green**. `tsc --noEmit` clean.

---

## What "real" vs "shadow" means here

| Kind | Definition | Value |
|---|---|---|
| **Real** | Imports the production symbol and asserts *its* output. Drift in prod code fails the test. | ✅ catches regressions |
| **Shadow** | Re-declares the logic *inside the test file* and tests the copy. Prod code can rot freely. | ❌ proves nothing |
| **Vacuous** | Mocks so much that the assertion is meaningless (e.g. company filter never verified). | ❌ false comfort |

The old suite was ~75% shadow/vacuous. The audit's own example: the deleted
`phase5_piece_status` suite encoded its *own* transition map that **disagreed**
with the real one in `ProductionContext` — so it passed while asserting the
wrong rules.

---

## 1 — Deleted (commit `50ab1a0`)

Five files, 0 production imports between them, 250 tests:

- `modules/__tests__/glasstech.test.ts`
- `modules/__tests__/phase2_6.test.ts`
- `modules/__tests__/phase4.test.ts`
- `modules/__tests__/phase9.test.ts`
- `modules/__tests__/phase5_piece_status.test.ts`  *(actively contradicted the real table)*

---

## 2 — New real tests (43) + testability extractions

Each new suite imports the **real** code. Where the logic was buried inside a
React component or a service method, it was extracted into a **pure module**
(behavior-preserving; the component/service now calls the extracted function),
so the test exercises the exact code the app runs — not a copy.

| Suite | Tests | Subject under test | Guards (God-mode P0) |
|---|---:|---|---|
| `production/services/__tests__/pieceStatusMachine.test.ts` | 14 | `pieceStatusMachine.ts` (extracted from `ProductionContext`) | #8 — no illegal transitions (Cut→Dispatched skip-QC, Delivered→Cut) |
| `src/services/__tests__/SyncService.pushTable.test.ts` | 6 | real `SyncService.pushPending()` | #1 — a failed push is kept pending, never silently "synced" |
| `sales/services/__tests__/asyncSalesService.test.ts` | 7 | real `getClients` / `savePaymentReceipts` | #5 company isolation + #9 receipt-atomicity routing |
| `hr/services/__tests__/payrollAccrual.test.ts` | 9 | `payrollAccrual.ts` (extracted from `PayrollManagement`) | #2/#3 — WIP accrual stays balanced (Σ Dr = Σ Cr) |
| `finance/services/__tests__/ledgerGuards.test.ts` | 7 | `assertMakerCheckerApproval` (extracted into `glBalance.ts`) | 4-eyes gate — manual JV can't post without approval |

### Behavior-preserving extractions made for testability
- `modules/production/services/pieceStatusMachine.ts` — transition table + `isTransitionAllowed`, re-exported from `ProductionContext`.
- `modules/hr/services/payrollAccrual.ts` — `buildPayrollAccrualDetails` (the WIP-split money math); `PayrollManagement` now calls it.
- `modules/finance/services/glBalance.ts` — added `assertMakerCheckerApproval` + `MakerCheckerError`; `saveLedger` now calls it.
- `modules/shared/testing/supabaseSpy.ts` — reusable recording supabase mock (asserts `.eq('company')`, `.upsert`, `.rpc` payloads).

### What each new suite actually proves
- **Sync (#1):** with a mocked supabase returning each real error class
  (schema `PGRST204`, FK `23503`, auth `401`, RLS `42501`), `pushPending()`
  returns `failed` (not `pushed`), the change **stays in the localStorage queue**,
  auth failures emit `erp:session-invalid`, and a later success flushes it.
- **Company isolation (#5):** `getClients` scopes `.eq('company', active)`, follows
  the sidebar company switcher, and the offline fallback **excludes other
  companies'** cached rows (no cross-tenant leak).
- **Receipt atomicity (#9):** with a GL row → routes through
  `process_payment_receipt_v2`, `glPosted=true`, legacy RPC **not** called (no
  double-post); v2 missing or no GL row → legacy RPC, `glPosted=false`.
- **Payroll (#2/#3):** Σ debit = Σ credit **even with absent/late deductions**
  (the exact bug that used to trip the GL-balance gate: gross debited, net
  credited); production earned → WIP `11523`, admin → `52111`, net → payable
  `2211`, loan/advance → staff loans `1121`.
- **Piece-status (#8):** every declared edge is allowed; the audit's illegal
  jumps are rejected; terminal states (`Delivered`, `Broken`) only accept the
  universal `Returned`/`Broken`/`Hold`.
- **Maker-checker:** unapproved Posted JV blocked; approved + `system-auto`
  allowed; non-JV docs and Draft/Parked never gated.

---

## 3 — Coverage gate + CI (commit `873c604`)

- Added `@vitest/coverage-v8`; `vitest --coverage` configured with **per-file
  thresholds** on the fully-tested pure money modules:

  | Module | Statements | Branches | Functions | Lines |
  |---|---:|---:|---:|---:|
  | `glBalance.ts` | 100% | 85% | 100% | 100% |
  | `payrollAccrual.ts` | 100% | 87.5% | 100% | 100% |
  | `pieceStatusMachine.ts` | 100% | 83.3% | 100% | 100% |

  Thresholds are set at 90/80/90/90 — these **must stay green**; the rest of the
  app is reported (not gated) so coverage can ratchet up file-by-file.
- `.github/workflows/ci.yml` now triggers on **`GT-Production`** (it never ran
  there before) and runs `test:coverage`, so the gate is enforced on every push/PR.

---

## 4 — Honest gaps (deliberately not touched)

- **Mixed files retained as-is:** `phase1.test.ts` and `phase2_sit.test.ts`
  contain BOTH real tests and residual shadow sections (e.g. phase1 §3 invoice
  number + §4 amount calc re-implement the logic inline). They are green and
  their real halves are worth keeping; the shadow halves provide **false**
  coverage but the same behavior is now covered for real by the new suites +
  `nippon_sit`/`phase2_sit` end-to-end invoice tests. Converting them needs an
  injectable clock + exported helpers — flagged for a careful future pass, not
  done at speed to avoid destabilising a passing suite.
- **Partial-module coverage is expected:** `SyncService.ts` (~23%) and
  `asyncSalesService.ts` (~14%) are large files; the tests target the specific
  **changed money paths**, not the whole file. Not gated.

---

## Verification

```
npx tsc --noEmit      # clean
npx vitest run        # 14 files, 161 tests, all pass
npx vitest run --coverage   # per-file thresholds met
```

Commits (local, GT-Production): `50ab1a0` · `e0f126c` · `2a040e0` · `4f74e7d`
· `4217063` · `1a2b158` · `873c604`.
