-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 015 — P2 Operational Constraints & Public Holidays
-- Addresses: SCM-3 (negative stock), HR-2 (public holidays)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- SCM-3: Non-negative stock quantity constraint
-- Rejects any UPDATE or INSERT that would leave store_items.quantity < 0.
-- This is the database last line of defence — the application layer in
-- inventoryService.ts checks first, but this constraint catches anything
-- that bypasses the app (direct SQL, rogue Edge Functions, etc.).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE store_items
  DROP CONSTRAINT IF EXISTS qty_non_negative;

ALTER TABLE store_items
  ADD CONSTRAINT qty_non_negative
  CHECK (quantity >= 0);

-- Also guard the sub-quantity fields — they should never go negative either.
ALTER TABLE store_items
  DROP CONSTRAINT IF EXISTS unrestricted_qty_non_negative;
ALTER TABLE store_items
  DROP CONSTRAINT IF EXISTS qi_qty_non_negative;
ALTER TABLE store_items
  DROP CONSTRAINT IF EXISTS blocked_qty_non_negative;
ALTER TABLE store_items
  DROP CONSTRAINT IF EXISTS reserved_qty_non_negative;

ALTER TABLE store_items
  ADD CONSTRAINT unrestricted_qty_non_negative CHECK (unrestricted_qty >= 0);
ALTER TABLE store_items
  ADD CONSTRAINT qi_qty_non_negative           CHECK (qi_qty           >= 0);
ALTER TABLE store_items
  ADD CONSTRAINT blocked_qty_non_negative      CHECK (blocked_qty      >= 0);
ALTER TABLE store_items
  ADD CONSTRAINT reserved_qty_non_negative     CHECK (reserved_qty     >= 0);

-- ─────────────────────────────────────────────────────────────────────────
-- HR-2: Public Holidays table
-- Stores Pakistani public holidays per company per calendar year.
-- Payroll calculation subtracts holidays that fall on working days from
-- the hardcoded 25-day basis so employees are not wrongly deducted.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public_holidays (
  id          TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  company     TEXT        NOT NULL,         -- 'GTK' | 'GTI' | 'Glassco' | 'Nippon' | 'Factory' | 'ALL'
  holiday_date DATE       NOT NULL,
  name        TEXT        NOT NULL,         -- e.g. 'Eid ul-Fitr (Day 1)'
  is_optional BOOLEAN     NOT NULL DEFAULT FALSE,  -- optional = employees can choose to work
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id),
  UNIQUE (company, holiday_date, name)      -- idempotent seed runs
);

ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls" ON public_holidays;
CREATE POLICY "company_rls" ON public_holidays
  FOR SELECT
  USING (
    company = 'ALL'
    OR company = (SELECT company FROM user_profiles WHERE id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS public_holidays_company_year_idx
  ON public_holidays (company, date_trunc('month', holiday_date));

-- ─────────────────────────────────────────────────────────────────────────
-- Seed: Standard Pakistani public holidays 2026 (applies to ALL companies)
-- Gregorian equivalents — Eid/Ashura dates are government estimates.
-- Update annually or when Government of Pakistan announces actual dates.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public_holidays (id, company, holiday_date, name, is_optional)
VALUES
  -- Fixed-date national holidays 2026
  (gen_random_uuid()::TEXT, 'ALL', '2026-02-05', 'Kashmir Solidarity Day',                FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-03-23', 'Pakistan Day',                          FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-05-01', 'Labour Day',                            FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-08-14', 'Independence Day',                      FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-11-09', 'Allama Iqbal Day',                      FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-12-25', 'Quaid-e-Azam Day / Christmas',          FALSE),
  -- Islamic holidays 2026 (Government of Pakistan estimated dates)
  (gen_random_uuid()::TEXT, 'ALL', '2026-03-19', 'Eid ul-Fitr (Day 1)',                   FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-03-20', 'Eid ul-Fitr (Day 2)',                   FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-03-21', 'Eid ul-Fitr (Day 3)',                   FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-05-27', 'Eid ul-Adha (Day 1)',                   FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-05-28', 'Eid ul-Adha (Day 2)',                   FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-05-29', 'Eid ul-Adha (Day 3)',                   FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-07-16', '9th Muharram (Ashura)',                 FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-07-17', '10th Muharram (Ashura)',                FALSE),
  (gen_random_uuid()::TEXT, 'ALL', '2026-09-24', '12 Rabi-ul-Awwal (Eid Milad-un-Nabi)', FALSE)
ON CONFLICT (company, holiday_date, name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT constraint_name FROM information_schema.table_constraints
--   WHERE table_name = 'store_items' AND constraint_type = 'CHECK';
-- Expected: qty_non_negative, unrestricted_qty_non_negative, ...
--
-- SELECT COUNT(*) FROM public_holidays WHERE company = 'ALL' AND
--   holiday_date BETWEEN '2026-01-01' AND '2026-12-31';
-- Expected: 15
-- ═══════════════════════════════════════════════════════════════════════════
