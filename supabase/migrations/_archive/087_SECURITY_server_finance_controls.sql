-- ============================================================================
-- 087 — SECURITY P1 #10 + #11: server-enforced finance controls on `ledger`
-- ============================================================================
-- ⚠️  NOT YET APPLIED. Apply manually in the Supabase SQL editor (after 085/086).
--
-- WHY (God-mode audit 2026-07):
--   #11: Maker-checker (4-eyes) existed ONLY in the browser (financeService
--        saveLedger gate). Anyone with REST access could insert a Posted JV
--        with no approver, or approve their own JV.
--   #10: Period locking defaulted OPEN — until a month was ever registered in
--        fiscal_periods, unlimited back-posting into past months was allowed.
--
-- DESIGN NOTES (important — read before applying):
--   • The app still re-upserts the WHOLE ledger array on every save (audit #3,
--     separate fix). These triggers are therefore RE-UPSERT-SAFE: on UPDATE
--     they only enforce when the row MATERIALLY changes (status transition /
--     date / amounts), so idempotent re-pushes of historical rows pass.
--   • Escape hatch for admin bulk-restores / DR rebuilds:
--       SET app.skip_finance_guards = 'on';   -- session-local, admin only
--     Both triggers skip when this GUC is set. Do NOT set it from the app.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_ledger_maker_checker ON public.ledger;
--   DROP TRIGGER IF EXISTS trg_ledger_period_lock  ON public.ledger;
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- #11  Maker-checker: a Posted manual JV must carry an approver, and the
--      approver must differ from the drafter (4-eyes). system-auto exempt.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_jv_maker_checker()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Admin escape hatch (bulk restore / DR)
  IF current_setting('app.skip_finance_guards', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Only when a row is (becoming) a Posted manual JV
  IF NEW.status = 'Posted'
     AND NEW.doc_type = 'JV'
     AND COALESCE(NEW.created_by, '') <> 'system-auto'
     -- Re-upsert-safe: on UPDATE only enforce when ENTERING Posted
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Posted')
  THEN
    IF NEW.approved_by IS NULL OR NEW.approved_by = '' THEN
      RAISE EXCEPTION 'MakerChecker(server): JV % cannot be Posted without approved_by', NEW.id;
    END IF;
    IF NEW.drafted_by IS NOT NULL AND NEW.approved_by = NEW.drafted_by THEN
      RAISE EXCEPTION 'MakerChecker(server): JV % — approver must differ from drafter (4-eyes)', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ledger_maker_checker ON public.ledger;
CREATE TRIGGER trg_ledger_maker_checker
  BEFORE INSERT OR UPDATE ON public.ledger
  FOR EACH ROW EXECUTE FUNCTION enforce_jv_maker_checker();

-- ─────────────────────────────────────────────────────────────────────
-- #10  Period lock, default-DENY for past months:
--      Posting into a PAST month requires an 'Open' fiscal_periods row for
--      that (company, month). Unregistered past months are CLOSED by default
--      (previously they were open — the back-posting hole).
--      Current + future months stay allowed (normal operations).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_ledger_period_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_month TEXT;
  v_now   TEXT;
  v_open  BOOLEAN;
BEGIN
  IF current_setting('app.skip_finance_guards', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Only Posted rows matter, and on UPDATE only material changes
  IF NEW.status <> 'Posted' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.date   IS NOT DISTINCT FROM NEW.date
     AND OLD.doc_date IS NOT DISTINCT FROM NEW.doc_date
     AND OLD.details::text IS NOT DISTINCT FROM NEW.details::text
  THEN
    RETURN NEW;  -- idempotent re-upsert of an unchanged row — pass
  END IF;

  v_month := substring(COALESCE(NEW.date, NEW.doc_date, '') from 1 for 7);
  v_now   := to_char(now(), 'YYYY-MM');

  IF v_month = '' OR v_month >= v_now THEN
    RETURN NEW;  -- current / future month (or no date) — allowed
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_periods fp
     WHERE fp.company = NEW.company
       AND fp.month   = v_month
       AND fp.status  = 'Open'
  ) INTO v_open;

  IF NOT v_open THEN
    RAISE EXCEPTION
      'PeriodLock(server): % is not an Open period for % — back-posting denied (register/open the period first)',
      v_month, NEW.company;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ledger_period_lock ON public.ledger;
CREATE TRIGGER trg_ledger_period_lock
  BEFORE INSERT OR UPDATE ON public.ledger
  FOR EACH ROW EXECUTE FUNCTION enforce_ledger_period_lock();

-- ---------------------------------------------------------------------------
-- VERIFY after applying:
--   1) Normal current-month posting from the app must still work.
--   2) This must FAIL (past month, no open period):
--      INSERT INTO ledger (id, company, doc_type, date, status, details, approved_by)
--      VALUES ('TEST-PL-1','Glassco','JV','2024-01-15','Posted','[]','someone');
--   3) This must FAIL (self-approval):
--      INSERT INTO ledger (id, company, doc_type, date, status, details, drafted_by, approved_by)
--      VALUES ('TEST-MC-1','Glassco','JV', to_char(now(),'YYYY-MM-DD'),'Posted','[]','a@x.com','a@x.com');
--   4) Clean up any test rows that unexpectedly succeeded:
--      DELETE FROM ledger WHERE id LIKE 'TEST-%';
-- ---------------------------------------------------------------------------
