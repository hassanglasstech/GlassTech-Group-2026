-- ============================================================
-- Hassan ka user_profile ensure karo
-- Run karo agar user_profiles empty hai
-- ============================================================

INSERT INTO user_profiles (
  id,
  email,
  full_name,
  role,
  company,
  allowed_companies,
  allowed_modules,
  time_restricted,
  is_active
)
VALUES (
  gen_random_uuid(),
  'hassanlatif1302@gmail.com',
  'Hassan Latif',
  'super_admin',
  'GTK',
  '["GTK","GTI","Glassco","Nippon","Factory"]',
  '[]',
  false,
  true
)
ON CONFLICT (email) DO UPDATE SET
  role             = 'super_admin',
  is_active        = true,
  time_restricted  = false,
  allowed_companies = '["GTK","GTI","Glassco","Nippon","Factory"]';

SELECT id, email, role, company, is_active FROM user_profiles;
