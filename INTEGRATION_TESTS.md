# Integration Tests (real Supabase)

The unit suite (`npm test`) mocks Supabase. The **integration** suite runs the
**actual** database logic — atomic RPCs, ledger balance, and RLS — against a
**local** Supabase (Docker), never production. This is what proves the money
guarantees end-to-end (the unit tests only prove the app *calls* the right RPC).

## One-time setup

1. **Install Docker Desktop** (free for small teams). Start it.
2. That's it — the local Supabase keys are the standard demo keys and the test
   harness falls back to them, so no `.env.test` is required for a default stack.
   (If you customise ports/keys, copy `.env.test.example` → `.env.test`.)

## Run

```bash
npm run supabase:start      # boots local Postgres + Auth + applies migrations
npm run test:integration    # runs *.integration.test.ts against it
npm run supabase:stop       # when done
```

- If Supabase isn't running, the integration suites **skip cleanly** (with a
  console note) — they never fail the build just because Docker is down.
- Reset the DB between exploratory runs with `npm run db:reset` (re-applies
  `supabase/migrations` on a clean database).

## What runs where

| Suite | File pattern | Config | Needs Docker |
|---|---|---|---|
| Unit | `*.test.ts` | `vite.config.ts` | no |
| Integration | `*.integration.test.ts` | `vitest.integration.config.ts` | yes |

The unit config **excludes** `*.integration.test.ts`, so `npm test` stays fast
and offline; integration only runs via `npm run test:integration`.

## What the integration suites prove

| File | Proves |
|---|---|
| `sales/.../paymentReceiptV2.integration.test.ts` | `process_payment_receipt_v2` writes receipt + invoice-balance + balanced GL in ONE transaction; rolls back entirely on an imbalanced GL; rejects over-payment. |
| `sales/.../postInvoiceAtomic.integration.test.ts` | `post_invoice_atomic` writes the invoice + its balanced GL in ONE transaction; rolls back on imbalance; rejects a duplicate invoice id (idempotency). |
| `sales/.../voidInvoiceAtomic.integration.test.ts` | `void_invoice_atomic` voids the invoice + posts the reversal GL atomically; rolls back on imbalance; blocks double-void and voiding an invoice with payments. |
| `sales/.../creditNoteAtomic.integration.test.ts` | `credit_note_atomic` posts the reversal GL + CN row + reduces the invoice balance server-side in ONE txn; rolls back on imbalance; rejects a CN exceeding the LIVE balance; GL-id idempotent. |
| `sales/.../orderToCash.integration.test.ts` | End-to-end: quotation → invoice → partial → full receipt drives the invoice to Paid; a credit note respects the live balance after prior receipts. |
| `production/.../consumeGlassStock.integration.test.ts` | `consume_glass_stock` decrements material stock + posts the WIP GL + closes the session in ONE txn; blocks insufficient stock; rolls back on imbalance; GL-id idempotent. |
| `procurement/.../postGrnAtomic.integration.test.ts` | `post_grn_atomic` upserts the received stock + posts the material GL in ONE txn; blocks a GRN double-post; rolls back on imbalance. |
| `production/.../pieceStatusAtomic.integration.test.ts` | `update_piece_status_atomic` allows legal transitions and rejects illegal ones (the DB `_piece_transition_allowed` mirror agrees with the app's table). |
| `finance/.../ledgerMakerCheckerTrigger.integration.test.ts` | The `enforce_jv_maker_checker` DB trigger blocks a Posted manual JV with no approver / a self-approved (4-eyes) JV, and lets system-auto through — even for a direct service-role insert. |
| `shared/testing/.../rlsIsolation.integration.test.ts` | As an authenticated company-A user: RLS hides/blocks company-B rows on invoices, ledger, production_pieces, quotations (SELECT + WITH CHECK on INSERT); the SECURITY DEFINER guards reject restatusing B's piece / posting to B's invoice. |

## CI

`.github/workflows/integration.yml` starts a local Supabase on the runner and
runs these on push/PR to `main` and `GT-Production`, separate from the fast
unit CI (`ci.yml`).
