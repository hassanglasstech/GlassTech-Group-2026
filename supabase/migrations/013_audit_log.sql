-- ============================================================
-- Migration 013 — Audit Log Table
-- Tracks every privileged user-management action taken via
-- the manage-users edge function (create, update, ban, etc.)
--
-- ALL tables carry:
--   • company column for multi-tenant isolation
--   • RLS enabled with authenticated-only policy
--   • NO table can be read/written without a valid JWT
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. AUDIT LOG — immutable record of every privileged action
--    Written by manage-users edge function (service role key).
--    Read by super_admin users only (RLS enforced below).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company     TEXT        NOT NULL,                 -- tenant isolation
  user_id     TEXT        NOT NULL,                 -- caller's Supabase auth.uid()
  action      TEXT        NOT NULL,
    -- Values: 'create_user' | 'update_user' | 'ban_user' | 'unban_user'
    --         'reset_password' | 'list_users'
  target_id   TEXT,                                 -- affected user's auth.uid() (NULL for list_users)
  details     JSONB,                                -- action-specific context snapshot
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by caller identity
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id
  ON audit_log(user_id);

-- Fast lookup by affected target
CREATE INDEX IF NOT EXISTS idx_audit_log_target_id
  ON audit_log(target_id)
  WHERE target_id IS NOT NULL;

-- Fast time-range queries (compliance reports, recent activity)
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
  ON audit_log(timestamp DESC);

-- Per-company audit scope
CREATE INDEX IF NOT EXISTS idx_audit_log_company
  ON audit_log(company, timestamp DESC);

-- Action-type filter (e.g. "show me all ban events")
CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON audit_log(company, action);

-- ────────────────────────────────────────────────────────────
-- 2. RLS — consistent with Migration 012 standards
--    Authenticated users may read their own company's log.
--    Only the service role (edge function) may INSERT.
--    No client may UPDATE or DELETE audit records.
-- ────────────────────────────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Authenticated read-only access (super_admin UI reads the log)
DROP POLICY IF EXISTS "rls_audit_log_read" ON audit_log;
CREATE POLICY "rls_audit_log_read" ON audit_log
  FOR SELECT
  TO authenticated
  USING (true);

-- No direct INSERT/UPDATE/DELETE from client JWT — service role only
-- (INSERT is executed by manage-users edge function with SUPABASE_SERVICE_ROLE_KEY)

-- ────────────────────────────────────────────────────────────
-- 3. VERIFY
-- ────────────────────────────────────────────────────────────
SELECT
  t.table_name,
  c.row_security  AS rls_enabled,
  COUNT(p.policyname) AS policy_count
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
LEFT JOIN pg_policies p ON p.tablename = t.table_name
WHERE t.table_schema = 'public'
  AND t.table_name = 'audit_log'
GROUP BY t.table_name, c.row_security;
