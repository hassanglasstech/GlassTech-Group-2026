-- ═══════════════════════════════════════════════════════════════════════
-- 097 — FINANCE (audit 2026-07-11, finding H1): accounts had NO unique(company,code)
--   constraint, and Factory code 12210 was assigned to TWO different accounts
--   ('Loan to Staff' L4 with children 12210-01/02, and 'Accum. Dep — Furniture' L5).
--   Any code-based GL/COA lookup could resolve 12210 to the WRONG account.
--
-- Verified live: Factory 12210 is the ONLY (company,code) collision in the whole
-- table, and both rows carry balance 0 → this is safe and reversible.
--
-- Fix: renumber the CHILDLESS 'Accum. Dep — Furniture' off 12210 (keep 'Loan to
-- Staff' on 12210 because its child codes 12210-01/02 derive from it). 12211 is
-- free and sits right after its accum-dep siblings 12201–12209. Then enforce
-- uniqueness so this can never recur on any company.
--
-- Run in Supabase SQL editor. If your COA prefers a different target code for the
-- furniture accum-dep, change '12211' before running.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Break the collision (targets exactly one row by primary key).
UPDATE public.accounts
   SET code = '12211'
 WHERE id = 'Factory-12210'
   AND company = 'Factory'
   AND code = '12210'
   AND name = 'Accum. Dep — Furniture';

-- 2) Enforce uniqueness of (company, code) so code-based lookups are never ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_company_code_uidx
    ON public.accounts(company, code);

-- ── Verify (optional) ──
-- SELECT company, code, count(*) FROM public.accounts GROUP BY company, code HAVING count(*) > 1;  -- expect 0 rows
-- SELECT id, code, name FROM public.accounts WHERE company='Factory' AND code IN ('12210','12211') ORDER BY code;
--   -- expect 12210 = Loan to Staff, 12211 = Accum. Dep — Furniture
