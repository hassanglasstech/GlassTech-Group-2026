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
| `production/.../pieceStatusAtomic.integration.test.ts` | `update_piece_status_atomic` allows legal transitions and rejects illegal ones (the DB `_piece_transition_allowed` mirror agrees with the app's table). |
| `shared/testing/.../rlsIsolation.integration.test.ts` | As an authenticated company-A user: RLS hides/blocks company-B invoices; the SECURITY DEFINER guards reject restatusing B's piece / posting to B's invoice. |

## CI

`.github/workflows/integration.yml` starts a local Supabase on the runner and
runs these on push/PR to `main` and `GT-Production`, separate from the fast
unit CI (`ci.yml`).
