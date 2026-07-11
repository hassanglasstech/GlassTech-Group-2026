-- ============================================================================
-- DATA FIX — Glassco account 11514 collision reclass (God-mode audit #7)
-- ============================================================================
-- ⚠️  NOT YET APPLIED. This is deliberately NOT numbered into the sequential
--     085/086/087 chain — it mutates REAL HISTORICAL FINANCIAL DATA and must
--     be run manually, in order, with a human reviewing the PREVIEW step
--     before the UPDATE step. Take a DB backup/snapshot first.
--
-- BACKGROUND: `FinanceService.ensureAccount(company, name, level, parentId,
--   type, code)` dedupes strictly by (company, code) — NOT by name. Whoever
--   posts to a code FIRST "wins" that row's name permanently; every later
--   caller using the SAME code silently posts into that same row regardless
--   of what name they passed.
--
--   Glassco's COA seeded `11514` as 'Laminated Glass Stock' (coa.glassco.ts).
--   But `hrService.ts` (payroll) and `glasscoGLHelpers.ts` (delivery) ALSO
--   called `ensureAccount(..., 'WIP — Direct Labour', ..., '11514')` — so
--   every payroll WIP-Labour debit and every delivery WIP-Labour-closing
--   credit landed on the SAME account row as Laminated Glass Stock, under
--   whichever name got there first. The two concepts' balances have been
--   co-mingled in the ledger ever since.
--
--   The CODE-SIDE fix (already applied to the app, separate commit) now uses
--   a clean, dedicated code '11523' (WIP — Direct Labour, under the existing
--   1152 Work-in-Progress bucket) for all NEW payroll/delivery postings. This
--   file re-points the HISTORICAL ledger lines that were mis-coded to 11514
--   so the balance-sheet split retroactively too.
--
--   (Also fixes the paired 'Finished Goods — Glass' collision at 11515 →
--   11533 — but that account was found to be UNPOSTED-TO in the code audit,
--   so there is no historical data to reclass for it; only the account row
--   itself needs creating, which ensureAccount will do lazily on first use.)
--
-- SCOPE: Glassco company only. Detects historical WIP-Labour lines by their
--   narration text (`WIP Labour` / `WIP-Labour`) on lines currently pointed
--   at account id 'Glassco-11514' — the exact text patterns both live posting
--   sites write (see hrService.ts:456 and glasscoGLDelivery.ts:108/117/265/281).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- STEP 1 — create the new account rows (safe, additive, idempotent).
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO accounts (id, company, code, name, level, parent_id, type)
SELECT 'Glassco-11523', 'Glassco', '11523', 'WIP — Direct Labour', 4,
       (SELECT id FROM accounts WHERE id = 'Glassco-115' OR (company='Glassco' AND code='115') LIMIT 1),
       'Asset'
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE id = 'Glassco-11523');

INSERT INTO accounts (id, company, code, name, level, parent_id, type)
SELECT 'Glassco-11533', 'Glassco', '11533', 'Finished Goods — Glass', 4,
       (SELECT id FROM accounts WHERE id = 'Glassco-115' OR (company='Glassco' AND code='115') LIMIT 1),
       'Asset'
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE id = 'Glassco-11533');

-- ─────────────────────────────────────────────────────────────────────
-- STEP 2 — PREVIEW (SELECT only — run this FIRST, review the output with
--   Hassan/an accountant BEFORE running Step 3). Shows every ledger line
--   currently on 'Glassco-11514' that the reclass would move, grouped by
--   whether the text narration matches a WIP-Labour pattern.
-- ─────────────────────────────────────────────────────────────────────
SELECT
  (elem->>'text' ILIKE '%WIP%Labour%' OR elem->>'text' ILIKE '%WIP-Labour%') AS will_be_reclassed,
  count(*)                                            AS line_count,
  sum(COALESCE((elem->>'debit')::numeric, 0))         AS total_debit,
  sum(COALESCE((elem->>'credit')::numeric, 0))        AS total_credit,
  array_agg(DISTINCT elem->>'text' ORDER BY elem->>'text') FILTER (WHERE (elem->>'text') IS NOT NULL) AS sample_narrations
FROM ledger, jsonb_array_elements(details) AS elem
WHERE company = 'Glassco'
  AND elem->>'accountId' = 'Glassco-11514'
GROUP BY 1;

-- Inspect the individual rows too before committing to the reclass:
-- SELECT id, date, status, description,
--        jsonb_array_elements(details) AS detail_line
-- FROM ledger
-- WHERE company = 'Glassco'
--   AND details::text ILIKE '%Glassco-11514%'
-- ORDER BY date;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 3 — THE ACTUAL RECLASS (run manually, only after reviewing Step 2's
--   output and confirming a fresh backup exists). Re-points ONLY the array
--   elements matching the WIP-Labour narration pattern; every other line
--   (including any genuine 'Laminated Glass Stock' postings on the same
--   code) is left untouched.
-- ─────────────────────────────────────────────────────────────────────
-- DO $$
-- DECLARE
--   r RECORD;
--   elem jsonb;
--   new_details jsonb;
--   changed boolean;
--   total_rows_changed int := 0;
-- BEGIN
--   FOR r IN
--     SELECT id, details FROM ledger
--     WHERE company = 'Glassco'
--       AND details::text ILIKE '%Glassco-11514%'
--   LOOP
--     new_details := '[]'::jsonb;
--     changed := false;
--     FOR elem IN SELECT * FROM jsonb_array_elements(r.details)
--     LOOP
--       IF elem->>'accountId' = 'Glassco-11514'
--          AND (elem->>'text' ILIKE '%WIP%Labour%' OR elem->>'text' ILIKE '%WIP-Labour%')
--       THEN
--         elem := jsonb_set(elem, '{accountId}', to_jsonb('Glassco-11523'::text));
--         changed := true;
--       END IF;
--       new_details := new_details || jsonb_build_array(elem);
--     END LOOP;
--     IF changed THEN
--       UPDATE ledger SET details = new_details, updated_at = now() WHERE id = r.id;
--       total_rows_changed := total_rows_changed + 1;
--     END IF;
--   END LOOP;
--   RAISE NOTICE 'Reclassed WIP-Labour lines on % ledger rows', total_rows_changed;
-- END $$;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 4 — VERIFY after running Step 3: re-run the Step 2 preview query —
--   'Glassco-11514' should now show ONLY non-WIP-Labour lines (or none).
--   Then confirm the new account's derived balance looks right:
-- ─────────────────────────────────────────────────────────────────────
-- SELECT sum(COALESCE((elem->>'debit')::numeric,0)) - sum(COALESCE((elem->>'credit')::numeric,0)) AS wip_labour_balance
-- FROM ledger, jsonb_array_elements(details) AS elem
-- WHERE company = 'Glassco' AND elem->>'accountId' = 'Glassco-11523' AND status = 'Posted';
