# Schema Migration Guide — 20260429_comprehensive_schema_fixes

## 🔧 What This Migration Does

Fixes 400/404 errors in the Opening Balance flow by adding missing columns to core tables:

- `activity_logs.user_name`
- `user_profiles.override_mode_active`
- `vendors.rate_list_versions`
- `attendance`, `loans`, `payroll`, `payment_receipts` — all required columns
- Creates missing `shift_master` table
- Creates missing `bypass_log_overdue` view

## 📋 How to Apply

### Option 1: Supabase Web Console (Easiest)

1. **Go to your Supabase project:**
   - URL: https://wfytbcmazixddtwpbego.supabase.co

2. **Open SQL Editor:**
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy and paste the migration SQL:**
   - File: `supabase/migrations/20260429_comprehensive_schema_fixes.sql`
   - Or run directly below

4. **Click "Run"**

5. **Restart the dev server:**
   ```bash
   npm run dev
   ```

### Option 2: Command Line

```bash
# 1. Run the guide script
node apply-schema-fix.js

# 2. This will show the SQL and copy it to clipboard
# 3. Paste in Supabase SQL Editor and run
```

---

## 🔐 Migration SQL

```sql
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

-- ── bypass_log_overdue: create view if doesn't exist ──
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

-- ── Verify schema is complete ──
SELECT 'All schema fixes applied successfully.' AS status;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

---

## ✅ After Migration

1. The app should now be able to:
   - Write to `activity_logs` without missing `user_name`
   - Access `override_mode_active` from `user_profiles`
   - Sync vendor `rate_list_versions`
   - Query HR tables without schema errors
   - Create and manage shifts

2. **Test the Opening Balance Flow:**
   - Log in to app
   - Navigate to Inventory → Opening Balance
   - Try creating a test entry
   - Verify it posts to GL correctly

3. **Check for remaining errors:**
   - Open browser DevTools (F12)
   - Go to Console tab
   - Look for any remaining 400/404 errors
   - Report them if any appear

---

## 🐛 Troubleshooting

**"GRANT statement failed"**
- This is OK if RLS is disabled (expected for single-user setup)
- Grants are optional in this case

**"Table already exists"**
- This is OK — the `IF NOT EXISTS` and `IF NOT` clauses prevent errors
- Idempotent design means you can run this multiple times safely

**View creation fails**
- Verify that `bypass_logs` table exists
- If it doesn't, this view is optional for the opening balance flow

---

## 📞 Support

If you encounter issues:
1. Check that you're logged into Supabase with the correct project
2. Verify the database is not in read-only mode
3. Try running the migration again (it's safe to repeat)
4. Check project logs in Supabase Dashboard for detailed errors
