-- ============================================================
-- Migration 004 — Phase 4: Financial Controls
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Fiscal Periods table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fiscal_periods (
  id          TEXT PRIMARY KEY,
  company     TEXT NOT NULL,
  month       TEXT NOT NULL,
  status      TEXT DEFAULT 'Open',
  opened_by   TEXT,
  opened_at   TIMESTAMPTZ,
  closed_by   TEXT,
  closed_at   TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_company ON fiscal_periods(company);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_month   ON fiscal_periods(month);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_status  ON fiscal_periods(status);

-- ── Add created_by to ledger (audit trail) ────────────────────────────
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS created_by TEXT;

-- ── Add created_by to petty_cash ──────────────────────────────────────
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS created_by TEXT;

-- ── Seed current month as Open for all companies ──────────────────────
INSERT INTO fiscal_periods (id, company, month, status, opened_by, opened_at)
VALUES
  ('GTK-' || to_char(now(), 'YYYY-MM'),     'GTK',     to_char(now(), 'YYYY-MM'), 'Open', 'System', now()),
  ('GTI-' || to_char(now(), 'YYYY-MM'),     'GTI',     to_char(now(), 'YYYY-MM'), 'Open', 'System', now()),
  ('Glassco-' || to_char(now(), 'YYYY-MM'), 'Glassco', to_char(now(), 'YYYY-MM'), 'Open', 'System', now()),
  ('Nippon-' || to_char(now(), 'YYYY-MM'),  'Nippon',  to_char(now(), 'YYYY-MM'), 'Open', 'System', now()),
  ('Factory-' || to_char(now(), 'YYYY-MM'), 'Factory', to_char(now(), 'YYYY-MM'), 'Open', 'System', now())
ON CONFLICT (id) DO NOTHING;

-- ── Phase 5: GTK Job Orders table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_orders (
  id          TEXT PRIMARY KEY,
  company     TEXT,
  data        JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_orders_company ON job_orders(company);
