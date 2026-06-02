-- ============================================================
-- Comprehensive Schema Fixes for Opening Balance Flow
-- Run this in Supabase SQL Editor
-- Fixes 400/404 errors from incomplete schema
-- ============================================================

-- ── activity_logs: missing user_name column ──
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS user_name TEXT;

-- ── user_profiles: missing override_mode_active column ──
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS override_mode_active BOOLEAN DEFAULT false;

-- ── vendors: missing rate_list_versions column ──
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS rate_list_versions JSONB DEFAULT '{}';

-- ── attendance: ensure all required columns exist ──
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS employee_id UUID;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── loans: ensure all required columns exist ──
ALTER TABLE loans ADD COLUMN IF NOT EXISTS employee_id UUID;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_type TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS applied_date DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS approved_date DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE loans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── payroll: ensure all required columns exist ──
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS employee_id UUID;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS pay_period TEXT;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS basic_salary NUMERIC DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS allowances NUMERIC DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS deductions NUMERIC DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS net_salary NUMERIC DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Draft';
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── payment_receipts: ensure all required columns exist ──
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS receipt_no TEXT;
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS reference_no TEXT;
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── shift_master: create if doesn't exist ──
CREATE TABLE IF NOT EXISTS shift_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  shift_code TEXT NOT NULL,
  shift_name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 480,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT shift_master_company_code UNIQUE (company, shift_code)
);

-- ── bypass_logs table: create if doesn't exist ──
CREATE TABLE IF NOT EXISTS bypass_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  employee_id UUID,
  permission_type TEXT,
  from_date DATE,
  to_date DATE,
  reason TEXT,
  approved_by TEXT,
  approval_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── bypass_log_overdue: create view ──
CREATE OR REPLACE VIEW bypass_log_overdue AS
SELECT
  bl.id,
  bl.company,
  bl.employee_id,
  bl.permission_type,
  bl.from_date,
  bl.to_date,
  bl.reason,
  bl.approved_by,
  bl.approval_date,
  bl.is_active,
  CASE
    WHEN bl.to_date < CURRENT_DATE AND bl.is_active = true THEN true
    ELSE false
  END AS is_overdue
FROM bypass_logs bl
WHERE bl.is_active = true;

-- ── Grant access to all critical tables ──
GRANT ALL ON activity_logs TO anon, authenticated;
GRANT ALL ON user_profiles TO anon, authenticated;
GRANT ALL ON vendors TO anon, authenticated;
GRANT ALL ON attendance TO anon, authenticated;
GRANT ALL ON loans TO anon, authenticated;
GRANT ALL ON payroll TO anon, authenticated;
GRANT ALL ON payment_receipts TO anon, authenticated;
GRANT ALL ON shift_master TO anon, authenticated;
GRANT ALL ON bypass_logs TO anon, authenticated;

-- ── Verify schema is complete ──
SELECT 'All schema fixes applied successfully.' AS status;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
