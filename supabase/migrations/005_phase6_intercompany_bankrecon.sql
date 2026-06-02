-- ============================================================
-- Migration 005 — Phase 6: Intercompany + Bank Reconciliation
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Intercompany Transfers ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intercompany_transfers (
  id              TEXT PRIMARY KEY,
  from_company    TEXT NOT NULL,
  to_company      TEXT NOT NULL,
  type            TEXT NOT NULL,
  amount          NUMERIC DEFAULT 0,
  description     TEXT,
  date            TEXT,
  from_gl_tx_id   TEXT,
  to_gl_tx_id     TEXT,
  status          TEXT DEFAULT 'Posted',
  posted_by       TEXT,
  reference_doc   TEXT,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ico_from_company ON intercompany_transfers(from_company);
CREATE INDEX IF NOT EXISTS idx_ico_to_company   ON intercompany_transfers(to_company);
CREATE INDEX IF NOT EXISTS idx_ico_date         ON intercompany_transfers(date);
CREATE INDEX IF NOT EXISTS idx_ico_status       ON intercompany_transfers(status);

-- ── Bank Reconciliation Sessions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_recon_sessions (
  id            TEXT PRIMARY KEY,
  company       TEXT NOT NULL,
  bank_account  TEXT NOT NULL,
  month         TEXT NOT NULL,
  status        TEXT DEFAULT 'In Progress',
  bank_balance  NUMERIC DEFAULT 0,
  gl_balance    NUMERIC DEFAULT 0,
  difference    NUMERIC DEFAULT 0,
  data          JSONB DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_recon_company ON bank_recon_sessions(company);
CREATE INDEX IF NOT EXISTS idx_bank_recon_month   ON bank_recon_sessions(month);
