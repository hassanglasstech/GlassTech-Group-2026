-- ============================================================
-- Core HR & Admin Tables — 20260431
-- Create all missing HR, leave, and admin tables the app queries
-- ============================================================

-- ── leave_applications: HR leave request tracking ──
CREATE TABLE IF NOT EXISTS leave_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  employee_id UUID NOT NULL,
  leave_type TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT now(),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  total_days INTEGER DEFAULT 1,
  reason TEXT,
  status TEXT DEFAULT 'Pending',
  approved_by TEXT,
  approval_date DATE,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── leave_types: Define available leave types ──
CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  leave_code TEXT NOT NULL UNIQUE,
  leave_name TEXT NOT NULL,
  max_days_per_year INTEGER DEFAULT 21,
  is_paid BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── holidays: Company holiday calendar ──
CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  holiday_name TEXT NOT NULL,
  is_optional BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT holidays_company_date UNIQUE (company, holiday_date)
);

-- ── overtimes: Track overtime hours ──
CREATE TABLE IF NOT EXISTS overtimes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  employee_id UUID NOT NULL,
  date DATE NOT NULL,
  hours_worked NUMERIC DEFAULT 0,
  overtime_rate NUMERIC DEFAULT 1.5,
  amount_pkr NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Pending',
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── advance_salaries: Employee advance salary tracking ──
CREATE TABLE IF NOT EXISTS advance_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  employee_id UUID NOT NULL,
  requested_date DATE NOT NULL,
  requested_amount NUMERIC NOT NULL,
  advance_type TEXT DEFAULT 'Salary',
  status TEXT DEFAULT 'Pending',
  approved_by TEXT,
  approval_date DATE,
  disbursement_date DATE,
  recovered_from_salary BOOLEAN DEFAULT false,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── gratuity_balances: Track employee gratuity ──
CREATE TABLE IF NOT EXISTS gratuity_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  employee_id UUID NOT NULL,
  balance_amount NUMERIC DEFAULT 0,
  last_calculated_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT gratuity_unique UNIQUE (company, employee_id)
);

-- ── employee_documents: Document tracking (passports, visas, etc) ──
CREATE TABLE IF NOT EXISTS employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  employee_id UUID NOT NULL,
  document_type TEXT NOT NULL,
  document_number TEXT,
  issue_date DATE,
  expiry_date DATE,
  file_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── employee_qualifications: Education/training records ──
CREATE TABLE IF NOT EXISTS employee_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  employee_id UUID NOT NULL,
  qualification_type TEXT NOT NULL,
  institution TEXT,
  field_of_study TEXT,
  completion_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── employee_licenses: Professional licenses and certifications ──
CREATE TABLE IF NOT EXISTS employee_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  employee_id UUID NOT NULL,
  license_type TEXT NOT NULL,
  license_number TEXT,
  issue_date DATE,
  expiry_date DATE,
  issuing_authority TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── performance_reviews: Annual/periodic performance evaluations ──
CREATE TABLE IF NOT EXISTS performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  employee_id UUID NOT NULL,
  review_period TEXT NOT NULL,
  reviewer_id UUID,
  overall_rating NUMERIC DEFAULT 0,
  review_date DATE,
  strengths TEXT,
  improvements TEXT,
  goals TEXT,
  status TEXT DEFAULT 'Draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── disciplinary_actions: Track warnings, suspensions, etc ──
CREATE TABLE IF NOT EXISTS disciplinary_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  employee_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  action_date DATE NOT NULL,
  reason TEXT NOT NULL,
  issued_by TEXT,
  status TEXT DEFAULT 'Active',
  appeal_filed BOOLEAN DEFAULT false,
  appeal_date DATE,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── exit_interviews: Employee exit tracking ──
CREATE TABLE IF NOT EXISTS exit_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  employee_id UUID NOT NULL,
  exit_date DATE NOT NULL,
  reason_for_leaving TEXT,
  interview_date DATE,
  interviewer_id UUID,
  overall_experience_rating NUMERIC,
  would_recommend BOOLEAN,
  feedback TEXT,
  settlement_amount NUMERIC DEFAULT 0,
  settlement_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Grant access to all new tables ──
GRANT ALL ON leave_applications TO anon, authenticated;
GRANT ALL ON leave_types TO anon, authenticated;
GRANT ALL ON holidays TO anon, authenticated;
GRANT ALL ON overtimes TO anon, authenticated;
GRANT ALL ON advance_salaries TO anon, authenticated;
GRANT ALL ON gratuity_balances TO anon, authenticated;
GRANT ALL ON employee_documents TO anon, authenticated;
GRANT ALL ON employee_qualifications TO anon, authenticated;
GRANT ALL ON employee_licenses TO anon, authenticated;
GRANT ALL ON performance_reviews TO anon, authenticated;
GRANT ALL ON disciplinary_actions TO anon, authenticated;
GRANT ALL ON exit_interviews TO anon, authenticated;

SELECT 'All core HR and admin tables created successfully.' AS status;
