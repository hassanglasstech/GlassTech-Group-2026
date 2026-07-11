-- ============================================================
-- Migration 007 — Phase 9: Leave Management + Projects
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Leave Applications ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_applications (
  id            TEXT PRIMARY KEY,
  company       TEXT NOT NULL,
  employee_id   TEXT NOT NULL,
  employee_name TEXT,
  type          TEXT NOT NULL,              -- Annual | Casual | Sick | Unpaid | Maternity | Paternity
  from_date     TEXT NOT NULL,             -- YYYY-MM-DD
  to_date       TEXT NOT NULL,
  days          INTEGER DEFAULT 1,
  reason        TEXT,
  status        TEXT DEFAULT 'Pending',    -- Pending | Approved | Rejected | Cancelled
  applied_at    TIMESTAMPTZ DEFAULT now(),
  reviewed_by   TEXT,
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_company     ON leave_applications(company);
CREATE INDEX IF NOT EXISTS idx_leave_employee    ON leave_applications(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_status      ON leave_applications(status);
CREATE INDEX IF NOT EXISTS idx_leave_from_date   ON leave_applications(from_date);

-- ── Projects (if not exists — was localStorage only) ──────────────────
CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company);
