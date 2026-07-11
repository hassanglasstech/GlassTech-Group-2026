-- ════════════════════════════════════════════════════════════════════
-- Nippon: allow NEGATIVE stock (inventory bootstrap / setup mode)
-- Generated: 2026-06-18
--
-- Why: Nippon has no counted inventory yet. We want a sale to push an
-- uncounted item's balance negative (e.g. sold 5 of a 0-stock item → -5).
-- That negative is the "go count this item" signal for stock-taking.
--
-- The store_items non-negative CHECK constraints would otherwise reject the
-- write. We relax them to "Nippon may be negative; every other company must
-- stay >= 0" so over-sell protection stays intact for GTK / Glassco / etc.
--
-- Reversible: to turn the bootstrap off later, re-add the plain >= 0 checks.
-- Run in Supabase SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE store_items DROP CONSTRAINT IF EXISTS qty_non_negative;
ALTER TABLE store_items
  ADD CONSTRAINT qty_non_negative
  CHECK (company = 'Nippon' OR quantity >= 0);

ALTER TABLE store_items DROP CONSTRAINT IF EXISTS unrestricted_qty_non_negative;
ALTER TABLE store_items
  ADD CONSTRAINT unrestricted_qty_non_negative
  CHECK (company = 'Nippon' OR unrestricted_qty >= 0);

NOTIFY pgrst, 'reload schema';
