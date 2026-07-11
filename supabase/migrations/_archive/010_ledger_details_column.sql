-- ============================================================
-- Migration 010 — Ledger Details Column
-- 
-- ROOT CAUSE FIX: The ledger table was missing a native
-- 'details' column. GL debit/credit lines were being sent
-- in upsert but silently dropped (unknown column error).
-- This caused ReportsHub Group Reports to show zero balances.
--
-- After running this migration:
-- 1. Go to Finance → Reports Hub
-- 2. Click "Re-sync GL" button (appears in header)
-- 3. Wait 2-3 seconds, click Refresh
-- 4. Group Mode will now show correct balances
--
-- Run in Supabase SQL Editor.
-- ============================================================

-- ── Add details column ────────────────────────────────────────────────
ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS details  JSONB  DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS status   TEXT   DEFAULT 'Parked',
  ADD COLUMN IF NOT EXISTS date     TEXT;

-- ── Index for faster queries ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ledger_details ON ledger USING GIN(details);

-- ── Also add updated_by + posted_at (Phase C columns, safe to re-run) ─
ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS updated_by  TEXT,
  ADD COLUMN IF NOT EXISTS posted_at   TIMESTAMPTZ;

-- ── Verify ────────────────────────────────────────────────────────────
-- Run after migration to confirm:
--
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'ledger'
-- ORDER BY ordinal_position;
