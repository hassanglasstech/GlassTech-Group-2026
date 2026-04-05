-- ============================================================
-- Migration: bank_recon_sessions
-- Phase 1 Fix: FC-01 — Move bank reconciliation from
-- localStorage to Supabase so data persists across devices
-- and browser clears.
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_recon_sessions (
  id            TEXT PRIMARY KEY,          -- RECON-{company}-{account}-{month}
  company       TEXT NOT NULL,
  bank_account  TEXT NOT NULL,             -- GL account code e.g. '11121'
  month         TEXT NOT NULL,             -- YYYY-MM
  status        TEXT NOT NULL DEFAULT 'In Progress',  -- In Progress | Balanced | Unbalanced
  bank_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  gl_balance    NUMERIC(14,2) NOT NULL DEFAULT 0,
  difference    NUMERIC(14,2) NOT NULL DEFAULT 0,
  data          JSONB NOT NULL DEFAULT '{}',  -- full ReconSession object
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by company + month
CREATE INDEX IF NOT EXISTS idx_bank_recon_company_month
  ON bank_recon_sessions (company, month);

-- Enable RLS
ALTER TABLE bank_recon_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read/write (tighten with company filter when RLS is implemented)
CREATE POLICY "bank_recon_authenticated"
  ON bank_recon_sessions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bank_recon_updated_at ON bank_recon_sessions;
CREATE TRIGGER bank_recon_updated_at
  BEFORE UPDATE ON bank_recon_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Verify
-- ============================================================
-- SELECT * FROM bank_recon_sessions LIMIT 5;
