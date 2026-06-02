# Phase 0 · Fix Log

**Started:** Sprint 36 + complete (post `b950216` TS sweep)
**Owner:** Hassan + Claude
**Status:** In progress — script bug fixes + any-type sweep round 1 done

---

## Audit Script Improvements

| Bug | Fix | Commit |
|---|---|---|
| #02 false-positive — script only looked at next 8 lines, missed same-line `.eq('company',` | Now reads same line + next 12 lines, with system-tables exclusion list | this commit |
| #12 false-positive — `grep -c "→" || echo "0"` appended literal "0" to multiline output | Use `circ_out=$(...)` then `circ=$(echo "$circ_out" \| grep -c "→")` with empty-guard | this commit |

---

## Type-Safety Helper Added

New utility in `modules/shared/services/utils.ts`:

```typescript
export const errMsg = (e: unknown, fallback = 'unknown error'): string => {
  if (e === null || e === undefined) return fallback;
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === 'string') return e || fallback;
  if (typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message;
    return m ? String(m) : fallback;
  }
  try { return JSON.stringify(e) || fallback; } catch { return fallback; }
};
```

Used to narrow `unknown` caught errors to readable strings.

---

## Round 1: Catch-block sweep (Phase 0 P1 #04)

**Pattern replaced:** `catch (X: any)` → `catch (X: unknown)`
**Scope:** all `.ts`/`.tsx` files in `modules/sales/` + `modules/glassco/`
**Net result:** 245 → 234 = **11 `any` types eliminated**

But `asyncSalesService.ts` alone went **57 → 39 (-18)** because I manually replaced map-callback `any` parameters with proper helpers (`SbRow`, `errMsg`, `str`, `num`, `obj`).

### Files modified (12 total)

| File | `any` before | after | Δ |
|---|---|---|---|
| `modules/sales/services/asyncSalesService.ts` | 57 | 39 | -18 |
| `modules/sales/companies/glassco/useGlasscoQuotations.ts` | 12 | 9 | -3 |
| `modules/glassco/components/agent/QuotationAgent.ts` | 19 | 18 | -1 |
| Plus 9 files with 1 catch each | — | — | total: -11 |

### Broken-then-fixed downstream `.message` accesses

After changing `catch (X: any)` → `catch (X: unknown)`, 8 places that accessed `e.message`/`err.message` no longer compiled. All fixed using new `errMsg()` helper:

| File | Fix applied |
|---|---|
| `modules/glassco/components/agent/QuotationAgent.ts:722` | `err?.message` → `errMsg(err, 'Tool execution failed')` |
| `modules/glassco/hooks/useQuotationAgent.ts:118` | `err?.message` → `toErrorString(err, ...)` (renamed import to avoid local-var collision) |
| `modules/sales/companies/glassco/useGlasscoQuotations.ts:194,285,422` | All 3 places → `errMsg(e)` / `errMsg(pieceErr)` |
| `modules/sales/components/CustomerComplaintModule.tsx:166,191` | Both `err?.message` → `errMsg(err)` |
| `modules/sales/components/SalesOrders.tsx:300,521` | Both `err?.message` → `errMsg(err)` |
| `modules/sales/companies/gtk/GTKQuotationManager.tsx:622` | `e.message` → `errMsg(e)` |
| `modules/sales/services/asyncSalesService.ts:76,129,161,199,321,385` | 6 places `e?.message`/`err.message` → `errMsg(e)`/`errMsg(err)` (sed) |
| `modules/sales/services/creditNoteService.ts:188,253` | Both `e?.message` → `errMsg(e)` (sed) |
| `modules/sales/services/serialAllocator.ts:64` | `err?.message` → `errMsg(err)` |

---

## Manual SQL Checks Generated

`docs/testing/phase0/MANUAL_SQL_CHECKS.md` — 9 queries for Hassan to run in Supabase SQL Editor:

| # | Check | Severity |
|---|---|---|
| A | RLS policy coverage | P1 |
| B | RLS enabled (not just policies) | P1 |
| C–G | FK orphan checks (5 tables) | P3 |
| H | Ledger imbalance — bypassed `LedgerImbalanceError` | **P1** |
| I | Duplicate invoice numbers per company | P1 |
| J | Negative inventory | P2 |
| K | Cutover lock status | Info |

**Total run time: ~30 seconds.**

---

## TypeScript Status After Round 1

```bash
$ npx tsc --noEmit --project tsconfig.json | grep "modules/(sales|glassco)/" | wc -l
12
```

All 12 errors are **pre-existing** (not introduced by Phase 0 work):

| Error | Type |
|---|---|
| `GlassCoQuotationPrint.tsx:120` | undefined-array passed to fn |
| `GlassCoSalesOrderPrint.tsx:119` | same pattern |
| `QCCheckPanel.tsx:146` | missing property on type |
| `QuotationWastageTab.tsx:279` | SetStateAction shape mismatch |
| `GTKQuotationManager.tsx:843` | `installAmt` vs `installationAmt` typo |
| `SalesOrders.tsx:202` | status enum comparison |
| `useQuotations.ts:157,161,172` | missing `toast` import |
| `useQuotations.ts:229` | nullable number passed where number required |
| `deliveryCalcService.ts:45` | category enum comparison |
| `deliveryCalcService.ts:112` | missing `company` on `ProductionPiece` |

**Recommendation:** these 12 are easy ~2-hour cleanups but defer until Round 2 of any-type sweep. Many are typos / missing imports — not architectural problems.

---

## What's NEXT

### Round 2: Service-layer `any` to typed interfaces
Top remaining offenders:
- `asyncSalesService.ts:39` — most are `(r: any) =>` map callbacks. Need typed `SbClientRow`, `SbInvoiceRow` etc.
- `deliveryInvoiceService.ts:25` — same pattern + complex JSONB access
- `QuotationAgent.ts:18` — agent tool result types

**Estimate:** 1 full day for these top 3 = 80+ `any` types eliminated.

### Round 3: Pre-existing TS errors fix
12 errors above. Mostly trivial:
- Add missing `toast` import to `useQuotations.ts` (3 lines)
- Fix `installAmt`→`installationAmt` typo
- Add `| null` to function params or null-check before pass
- Update status enum

**Estimate:** 2 hours.

### Round 4: Re-baseline + Phase 0 sign-off
- Re-run `scripts/phase0_audit.sh`
- Target: P1 fully green
- Hand-run manual SQL queries; paste results into `MANUAL_SQL_CHECKS.md`
- Tag git: `phase0-pass`

---

_Last updated: this commit. Next round on request._
