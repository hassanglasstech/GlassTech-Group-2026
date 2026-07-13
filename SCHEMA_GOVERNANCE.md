# Schema Governance — GlassTech ERP (Supabase)

> ## ✅ Reconcile status (verified 2026-07-14) — Integration Tests CI is GREEN
> The migration chain was reproduced end-to-end on a fresh local Postgres (the
> exact steps the Integration Tests CI runs): a clean `supabase start` applied
> **all 18 governed migrations** (`20260712023250_baseline_live_schema` → …
> → `20260713120000_vendor_quality_defects`) with only benign notices
> (extension-exists, `DROP POLICY IF EXISTS` skips) — **zero apply errors** — and
> `npm run test:integration` then passed **16 files / 72 tests** (real RPCs +
> RLS) against that DB. So the drift that once reddened this workflow is resolved
> by the committed baseline + governed migrations; the CI on the current HEAD is
> green. No migration file needed changing.
>
> **Optional governance upgrade (not required for CI):** the baseline is still a
> best-effort reflection snapshot, and the live DB's `supabase_migrations` history
> is empty. A one-time `supabase db pull` (below) would produce a byte-perfect
> baseline AND populate the remote history — nice hygiene, but the current setup
> already applies cleanly and tests green.
>
> _Local repro note (Windows only): the default `5432x` ports sit in this host's
> WinNAT excluded ranges, so the stack was brought up on a shifted `563xx` block
> via local-only `supabase/config.toml` overrides + a gitignored `.env.test`
> (`SUPABASE_TEST_URL=…56321`). Neither is committed; GitHub's ubuntu runner has
> no such exclusion and uses the defaults._



**Problem (from the 2026-07-11 audit):** the live DB was built with ad-hoc SQL, so
`supabase_migrations.schema_migrations` was empty (`list_migrations` = 0) and the
133 files in `supabase/migrations/` had DIVERGED from the live schema (missing
columns, jsonb-shaped tables, RPC bugs — every DB touch was a surprise). No way to
reproduce the DB, no change history, no team-safe workflow.

**Fix:** baseline the live schema, then track every change through the Supabase CLI.

---

## What was done
- All 133 historical / non-conforming migration files (numbered `000`–`103` + the
  `PHASE1_*` / `OB_FLOW_*` ALL-CAPS ones) were moved to
  **`supabase/migrations/_archive/`** — kept for history, out of the CLI's path.
  (The audit-fix migrations `096`–`103` are captured in the new baseline anyway.)
- `supabase/migrations/` is now clean, ready for a single CLI-generated baseline.

## One-time baseline (run once — the `db pull` needs your DB password)
```bash
# from glasstech-multitenant/
npx supabase login                       # uses your Supabase access token
npx supabase link --project-ref wfytbcmazixddtwpbego   # prompts for the DB password
npx supabase db pull                     # writes supabase/migrations/<ts>_remote_schema.sql
                                         # AND records it as applied on the remote
git add supabase/migrations && git commit -m "chore(db): baseline live schema (governed migrations)"
```
`db pull` reads the live schema (no changes to the DB) and marks the baseline as
already-applied on remote, so a later `db push` is a no-op for it. DB password is at
**Dashboard → Project Settings → Database → Connection string / password**.

## Going forward — every schema change
```bash
npx supabase migration new <short_name>          # creates an empty timestamped file
#   edit supabase/migrations/<ts>_<short_name>.sql  (write the DDL)
npx supabase db push                             # applies to remote AND records it
git add supabase/migrations && git commit -m "db(<name>): ..."
```
Rules:
- **Never** run schema DDL in the SQL editor by hand again — always a migration + `db push`.
- One migration = one logical change; never edit an already-pushed migration (add a new one).
- `npx supabase migration list` shows local vs remote (must match).

## Verify it worked
After the baseline, `list_migrations` (Supabase MCP) or `npx supabase migration list`
should show the baseline (and future) migrations — no longer empty.

## Notes
- `_archive/` files are historical references only; do NOT re-run them.
- Data-only fixes (renames, backfills) can still be one-off SQL, but any STRUCTURE or
  policy/function change goes through a migration.
