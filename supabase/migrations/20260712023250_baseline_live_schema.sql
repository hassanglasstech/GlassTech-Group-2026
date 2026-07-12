-- ═══════════════════════════════════════════════════════════════════════
-- BASELINE — live public schema snapshot (governed migrations start HERE)
-- Generated 2026-07-11 from the live Supabase DB (project wfytbcmazixddtwpbego)
-- using the DB's OWN DDL functions (pg_get_functiondef / _constraintdef /
-- _triggerdef / pg_get_viewdef / pg_indexes / pg_policies + column reflection).
--
-- Captures: 4 extensions, 155 tables, 250 constraints, 176 indexes, 62 functions,
-- 14 views, 31 triggers, 155 RLS-enabled tables + 249 policies, function grants.
--
-- BEST-EFFORT reference snapshot — NOT a byte-perfect pg_dump (that needs Docker's
-- `supabase db pull`). Intended for reference + approximate rebuild. Everything
-- under supabase/migrations/_archive/ is pre-baseline history; from here on every
-- schema change is a NEW migration file. See SCHEMA_GOVERNANCE.md.
-- ═══════════════════════════════════════════════════════════════════════

SET check_function_bodies = false;
SET statement_timeout = 0;

-- ═══ 1/9 Extensions ═══
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
-- ═══ 2/9 Enum types ═══

-- ═══ 2b/9 Sequences ═══
-- The live-schema reflection captured serial column DEFAULTs
-- (nextval('<x>_id_seq'::regclass)) but NOT the CREATE SEQUENCE statements, so a
-- fresh replay (local/test/CI) failed at the first serial table. These exist on
-- prod already; IF NOT EXISTS makes this idempotent and harmless there.
CREATE SEQUENCE IF NOT EXISTS public.activity_log_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.customer_signatures_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.delivery_otps_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.dispatch_events_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.dispatch_photos_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.driver_licenses_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.erp_alerts_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.golive_checks_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.perf_telemetry_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.sla_breaches_id_seq;

-- ═══ 2c/9 Functions used in DDL (must precede the index that references them) ═══
-- erp_alerts_dedup_date() is used by the functional index idx_erp_alerts_daily_dedup
-- (Indexes section) but the reflection emitted it later (Functions section), so a
-- fresh replay failed. Pre-define it here; the later CREATE OR REPLACE re-creates it
-- identically (idempotent). Pure/IMMUTABLE — no table dependencies.
CREATE OR REPLACE FUNCTION public.erp_alerts_dedup_date(ts timestamp with time zone)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT (ts AT TIME ZONE 'UTC')::date $function$;

-- ═══ 3/9 Tables ═══

CREATE TABLE IF NOT EXISTS public.access_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text,
  email text,
  action text NOT NULL,
  user_agent text DEFAULT ''::text,
  ip_address text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounts (
  id text NOT NULL,
  company text NOT NULL,
  code text,
  name text,
  level integer,
  parent_id text,
  type text,
  created_at timestamp with time zone DEFAULT now(),
  "parentId" text DEFAULT ''::text,
  normal_balance text DEFAULT 'Dr'::text,
  balance numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_log (
  id bigint NOT NULL DEFAULT nextval('activity_log_id_seq'::regclass),
  table_name text NOT NULL,
  row_id text NOT NULL,
  operation text NOT NULL,
  changed_at timestamp with time zone DEFAULT now(),
  changed_by text,
  before_data jsonb,
  after_data jsonb,
  company text
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id text NOT NULL,
  company text NOT NULL,
  module text,
  action text,
  description text,
  reference_id text,
  "timestamp" timestamp with time zone DEFAULT now(),
  "user" text,
  created_at timestamp with time zone DEFAULT now(),
  amount numeric DEFAULT 0,
  level text DEFAULT 'info'::text,
  meta jsonb DEFAULT '{}'::jsonb,
  user_name text
);

CREATE TABLE IF NOT EXISTS public.advance_salaries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company text NOT NULL,
  employee_id uuid NOT NULL,
  requested_date date NOT NULL,
  requested_amount numeric NOT NULL,
  advance_type text DEFAULT 'Salary'::text,
  status text DEFAULT 'Pending'::text,
  approved_by text,
  approval_date date,
  disbursement_date date,
  recovered_from_salary boolean DEFAULT false,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_alert_history (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  alert_type text,
  title text,
  message text,
  severity text,
  read boolean DEFAULT false,
  source text DEFAULT 'system'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_api_calls (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_name text NOT NULL DEFAULT 'default'::text,
  model text NOT NULL DEFAULT 'claude-haiku-4-5-20251001'::text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  tokens_used integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  cost_pkr numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  module text NOT NULL DEFAULT 'general'::text,
  user_id text,
  agent_id text,
  tool_name text,
  data_before jsonb DEFAULT '{}'::jsonb,
  data_after jsonb DEFAULT '{}'::jsonb,
  gl_entries_created jsonb DEFAULT '[]'::jsonb,
  approval_chain jsonb DEFAULT '[]'::jsonb,
  risk_score integer NOT NULL DEFAULT 0,
  flags text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  department text NOT NULL DEFAULT 'general'::text,
  decision_type text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NOT NULL,
  reasoning text NOT NULL,
  conditions text[] NOT NULL DEFAULT '{}'::text[],
  confidence numeric(4,3) NOT NULL DEFAULT 0.500,
  outcome text,
  outcome_date timestamp with time zone,
  outcome_notes text,
  feedback text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_episodic_memory (
  decision_id text NOT NULL,
  agent_type text NOT NULL,
  decision_type text NOT NULL,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_made text NOT NULL,
  reasoning text NOT NULL,
  conditions jsonb DEFAULT '[]'::jsonb,
  confidence_score numeric(4,3) NOT NULL DEFAULT 0.500,
  outcome text,
  outcome_value numeric(14,2),
  outcome_date timestamp with time zone,
  owner_feedback text,
  override_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_execution_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id text,
  pattern_id text,
  event_label text,
  steps_executed jsonb NOT NULL DEFAULT '[]'::jsonb,
  supabase_writes jsonb NOT NULL DEFAULT '[]'::jsonb,
  executed_by text,
  executed_at timestamp with time zone NOT NULL DEFAULT now(),
  reversed_at timestamp with time zone,
  reversed_by text,
  reversal_result jsonb
);

CREATE TABLE IF NOT EXISTS public.agent_memories (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  category text,
  content text,
  tags jsonb DEFAULT '[]'::jsonb,
  relevance real DEFAULT 1.0,
  source text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  agent_label text NOT NULL,
  permission text NOT NULL DEFAULT 'read'::text,
  allowed_tools text[] NOT NULL DEFAULT '{}'::text[],
  max_tokens integer NOT NULL DEFAULT 1000,
  model text NOT NULL DEFAULT 'claude-haiku-4-5-20251001'::text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_procedural_memory (
  rule_id text NOT NULL,
  agent_type text NOT NULL,
  rule_type text NOT NULL,
  condition_text text NOT NULL,
  action_text text NOT NULL,
  priority integer NOT NULL DEFAULT 5,
  override_count integer NOT NULL DEFAULT 0,
  follow_count integer NOT NULL DEFAULT 0,
  success_rate numeric(4,3) NOT NULL DEFAULT 0.500,
  created_by text NOT NULL DEFAULT 'system'::text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_rate_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  config_key text NOT NULL,
  max_per_minute integer NOT NULL DEFAULT 10,
  max_per_hour integer NOT NULL DEFAULT 100,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_semantic_memory (
  fact_id text NOT NULL,
  agent_type text NOT NULL,
  fact_category text NOT NULL,
  fact_statement text NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 0.500,
  supporting_decisions text[] NOT NULL DEFAULT '{}'::text[],
  evidence_count integer NOT NULL DEFAULT 0,
  invalidated boolean NOT NULL DEFAULT false,
  invalidated_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  company text NOT NULL DEFAULT 'GlassCo'::text,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  message_count integer NOT NULL DEFAULT 0,
  summary text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_table_access (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_name text NOT NULL,
  table_name text NOT NULL,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alert_thresholds (
  id text NOT NULL,
  company text NOT NULL,
  invoice_overdue_days integer NOT NULL DEFAULT 30,
  tempering_overdue_days integer NOT NULL DEFAULT 7,
  pr_approval_overdue_days integer NOT NULL DEFAULT 3,
  sync_queue_threshold integer NOT NULL DEFAULT 50,
  gl_imbalance_tolerance numeric NOT NULL DEFAULT 0.01,
  low_stock_threshold integer NOT NULL DEFAULT 0,
  daily_digest_enabled boolean NOT NULL DEFAULT false,
  digest_email text,
  digest_time text NOT NULL DEFAULT '08:00'::text,
  whatsapp_webhook_url text,
  suppress_offhours boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.anomaly_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  anomaly_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium'::text,
  department text NOT NULL DEFAULT 'general'::text,
  description text NOT NULL,
  data_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamp with time zone,
  acknowledged_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.anomaly_thresholds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rule_key text NOT NULL,
  label text NOT NULL,
  department text NOT NULL,
  threshold numeric NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asset_registry (
  id text NOT NULL,
  company text NOT NULL,
  description text NOT NULL,
  category text,
  purchase_date text,
  purchase_value numeric DEFAULT 0,
  residual_value numeric DEFAULT 0,
  useful_life_years numeric DEFAULT 5,
  depreciation_method text DEFAULT 'Straight-Line'::text,
  gl_asset_account_code text,
  accumulated_dep_account_code text,
  dep_expense_account_code text,
  status text DEFAULT 'Active'::text,
  location text,
  custodian text,
  serial_number text,
  purchase_invoice_ref text,
  disposal_date text,
  disposal_value numeric,
  disposal_notes text,
  created_by text,
  updated_by text,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assets (
  id text NOT NULL,
  company text NOT NULL,
  name text,
  serial_no text,
  purchase_cost numeric DEFAULT '0'::numeric,
  useful_life integer DEFAULT 5,
  status text DEFAULT 'Active'::text,
  location text,
  assigned_to text,
  depreciation_method text DEFAULT 'Straight Line'::text,
  maintenance_logs jsonb DEFAULT '[]'::jsonb,
  notes text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id text NOT NULL,
  employee_id text,
  date date NOT NULL,
  status text,
  late_minutes numeric DEFAULT 0,
  early_minutes numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  check_in timestamp with time zone,
  check_out timestamp with time zone,
  company text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance_overrides (
  id text NOT NULL,
  company text NOT NULL,
  employee_id text NOT NULL,
  month text NOT NULL,
  absent numeric DEFAULT 0,
  allowed_absent numeric DEFAULT 0,
  lates numeric DEFAULT 0,
  sunday numeric DEFAULT 0,
  ot numeric DEFAULT 0,
  manual_loan_deduction numeric DEFAULT '-1'::integer,
  req_ref text,
  updated_by text,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  company text NOT NULL,
  user_id text NOT NULL,
  action text NOT NULL,
  target_id text,
  details jsonb,
  "timestamp" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_recon_sessions (
  id text NOT NULL,
  company text NOT NULL,
  bank_account text NOT NULL,
  month text NOT NULL,
  status text DEFAULT 'In Progress'::text,
  bank_balance numeric DEFAULT 0,
  gl_balance numeric DEFAULT 0,
  difference numeric DEFAULT 0,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bom_items (
  id text NOT NULL,
  company text,
  bom_id text,
  item_code text,
  description text,
  quantity numeric DEFAULT 0,
  unit text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bom_templates (
  id text NOT NULL,
  company text,
  name text,
  product_id text,
  version text,
  is_active boolean DEFAULT true,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.budget_lines (
  id text NOT NULL,
  company text NOT NULL,
  fiscal_year text NOT NULL,
  account_id text NOT NULL,
  cost_center_id text,
  description text,
  annual_budget numeric DEFAULT 0,
  jan_budget numeric DEFAULT 0,
  feb_budget numeric DEFAULT 0,
  mar_budget numeric DEFAULT 0,
  apr_budget numeric DEFAULT 0,
  may_budget numeric DEFAULT 0,
  jun_budget numeric DEFAULT 0,
  jul_budget numeric DEFAULT 0,
  aug_budget numeric DEFAULT 0,
  sep_budget numeric DEFAULT 0,
  oct_budget numeric DEFAULT 0,
  nov_budget numeric DEFAULT 0,
  dec_budget numeric DEFAULT 0,
  created_by text,
  updated_by text,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_manual (
  event_type text NOT NULL,
  description text NOT NULL,
  trigger_examples text[] NOT NULL DEFAULT '{}'::text[],
  forms_required text[] NOT NULL DEFAULT '{}'::text[],
  modules_involved text[] NOT NULL DEFAULT '{}'::text[],
  disposal_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  gl_entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  approvals_required text[] NOT NULL DEFAULT '{}'::text[],
  exceptions text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_scenarios (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  type text,
  title text,
  description text,
  probability real DEFAULT 0.5,
  impact text,
  status text DEFAULT 'active'::text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bypass_log (
  id text NOT NULL,
  user_id text,
  user_name text NOT NULL,
  module text NOT NULL,
  rule_bypassed text NOT NULL,
  record_id text DEFAULT ''::text,
  bypass_reason text DEFAULT ''::text,
  status text NOT NULL DEFAULT 'Open'::text,
  addressing_date date,
  resolved_by text,
  resolved_at timestamp with time zone,
  resolution_notes text DEFAULT ''::text,
  company text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clients (
  id text NOT NULL,
  company text NOT NULL,
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  address text,
  ntn text,
  credit_limit numeric DEFAULT 0,
  status text DEFAULT 'Active'::text,
  created_at timestamp with time zone DEFAULT now(),
  "historicalWastageRate" numeric DEFAULT 0,
  "creditLimit" numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  price_list_id text,
  customer_tier text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_by text,
  updated_by text,
  version integer DEFAULT 1,
  mirror_company text,
  search_tsv tsvector,
  strn text,
  cnic text,
  fbr_buyer_type text,
  province text,
  fbr_business_name text
);

CREATE TABLE IF NOT EXISTS public.company_branding (
  id text NOT NULL,
  company text NOT NULL,
  legal_name text,
  address_line1 text,
  address_line2 text,
  city text,
  country text DEFAULT 'Pakistan'::text,
  phone text,
  email text,
  website text,
  ntn text,
  strn text,
  cnic text,
  logo_data_url text,
  signature_block text,
  bank_name text,
  bank_branch text,
  bank_iban text,
  bank_account_title text,
  bank_account_no text,
  bank_swift text,
  terms_quotation text,
  terms_invoice text,
  terms_delivery_challan text,
  terms_service_order text,
  terms_credit_note text,
  terms_grn text,
  show_logo boolean DEFAULT true,
  show_bank_on_invoice boolean DEFAULT true,
  show_qr_on_invoice boolean DEFAULT false,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.cost_centers (
  id text NOT NULL,
  company text NOT NULL,
  code text,
  name text,
  department text,
  category text,
  hierarchy_area text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_notes (
  id text NOT NULL,
  company text NOT NULL,
  invoice_id text,
  invoice_no text,
  client_id text,
  client_name text,
  date date,
  reason text,
  amount numeric(15,2) DEFAULT 0,
  gl_tx_id text,
  status text DEFAULT 'Posted'::text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.csv_import_logs (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  company text NOT NULL,
  import_type text NOT NULL,
  file_name text,
  rows_attempted integer DEFAULT 0,
  rows_succeeded integer DEFAULT 0,
  rows_failed integer DEFAULT 0,
  error_details jsonb DEFAULT '[]'::jsonb,
  imported_by text,
  imported_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_complaints (
  id text NOT NULL,
  company text NOT NULL,
  date date,
  client_id text,
  client_name text,
  invoice_id text,
  order_no text,
  category text,
  description text,
  status text DEFAULT 'Open'::text,
  priority text DEFAULT 'Medium'::text,
  assigned_to text,
  resolution text,
  resolved_at timestamp with time zone,
  resolved_by text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.customer_signatures (
  id bigint NOT NULL DEFAULT nextval('customer_signatures_id_seq'::regclass),
  dispatch_id uuid NOT NULL,
  company text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  signature_data text NOT NULL,
  signed_at timestamp with time zone DEFAULT now(),
  geo_lat numeric(10,7),
  geo_lng numeric(10,7),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cutover_snapshot (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  company text NOT NULL,
  cutover_date date,
  status text NOT NULL DEFAULT 'pending'::text,
  masters_loaded boolean DEFAULT false,
  stock_ob_done boolean DEFAULT false,
  gl_ob_done boolean DEFAULT false,
  ar_ob_done boolean DEFAULT false,
  ap_ob_done boolean DEFAULT false,
  notes text,
  locked_at timestamp with time zone,
  locked_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cutter_daily_logs (
  id text NOT NULL,
  company text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cutting_sessions (
  id text NOT NULL,
  company text NOT NULL,
  -- reflection over-constrained these as NOT NULL: consume_glass_stock upserts
  -- a session with only (id, company, data, updated_at), which proves prod
  -- allows NULL here (NOT NULL is checked before ON CONFLICT arbitration).
  job_order_id text,
  cutter_id text,
  cutter_name text NOT NULL DEFAULT ''::text,
  start_time text NOT NULL DEFAULT ''::text,
  end_time text DEFAULT ''::text,
  status text NOT NULL DEFAULT 'Open'::text,
  sheets_scanned jsonb NOT NULL DEFAULT '[]'::jsonb,
  pieces_produced integer DEFAULT 0,
  remnants_created jsonb DEFAULT '[]'::jsonb,
  scrap_sqft numeric DEFAULT 0,
  scrap_weight_kg numeric DEFAULT 0,
  estimated_wastage_pct numeric DEFAULT 0,
  actual_wastage_pct numeric DEFAULT 0,
  wastage_variance_pct numeric DEFAULT 0,
  supervisor_sign_off text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.delivery_otps (
  id bigint NOT NULL DEFAULT nextval('delivery_otps_id_seq'::regclass),
  dispatch_id uuid NOT NULL,
  company text NOT NULL,
  customer_phone text NOT NULL,
  otp_hash text NOT NULL,
  attempts integer DEFAULT 0,
  verified boolean DEFAULT false,
  verified_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.departments (
  id text NOT NULL,
  company text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.disciplinary_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company text NOT NULL,
  employee_id uuid NOT NULL,
  action_type text NOT NULL,
  action_date date NOT NULL,
  reason text NOT NULL,
  issued_by text,
  status text DEFAULT 'Active'::text,
  appeal_filed boolean DEFAULT false,
  appeal_date date,
  resolution text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_events (
  id bigint NOT NULL DEFAULT nextval('dispatch_events_id_seq'::regclass),
  dispatch_id uuid NOT NULL,
  company text NOT NULL,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamp with time zone DEFAULT now(),
  created_by text
);

CREATE TABLE IF NOT EXISTS public.dispatch_photos (
  id bigint NOT NULL DEFAULT nextval('dispatch_photos_id_seq'::regclass),
  dispatch_id uuid NOT NULL,
  company text NOT NULL,
  photo_type text NOT NULL,
  storage_path text NOT NULL,
  caption text,
  taken_at timestamp with time zone DEFAULT now(),
  taken_by text,
  geo_lat numeric(10,7),
  geo_lng numeric(10,7),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_vehicles (
  id text NOT NULL,
  company text NOT NULL,
  vehicle_name text NOT NULL,
  plate_number text NOT NULL,
  max_payload_kg numeric(10,2) NOT NULL,
  vehicle_type text DEFAULT 'Truck'::text,
  is_active boolean DEFAULT true,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatches (
  id text NOT NULL,
  trip_id text,
  company text NOT NULL,
  date date,
  dispatch_time text,
  origin_location text,
  plant_name text,
  pick_location text,
  vehicle_no text,
  driver_name text,
  service_type text,
  piece_ids jsonb DEFAULT '[]'::jsonb,
  total_sq_ft numeric DEFAULT 0,
  status text DEFAULT 'Pending'::text,
  charges_per_sq_ft numeric DEFAULT 0,
  total_charges numeric DEFAULT 0,
  expected_return_date date,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doc_serials (
  company text NOT NULL,
  doc_type text NOT NULL,
  year integer NOT NULL,
  next_seq integer NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driver_licenses (
  id bigint NOT NULL DEFAULT nextval('driver_licenses_id_seq'::regclass),
  company text NOT NULL,
  driver_name text NOT NULL,
  driver_phone text,
  cnic text,
  license_no text,
  license_expiry date,
  permit_no text,
  permit_expiry date,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.elimination_log (
  elim_id uuid NOT NULL DEFAULT gen_random_uuid(),
  period text NOT NULL,
  company_pair text NOT NULL,
  revenue_eliminated numeric(14,2) NOT NULL DEFAULT 0,
  cogs_eliminated numeric(14,2) NOT NULL DEFAULT 0,
  receivable_eliminated numeric(14,2) NOT NULL DEFAULT 0,
  payable_eliminated numeric(14,2) NOT NULL DEFAULT 0,
  net_adjustment numeric(14,2) NOT NULL DEFAULT 0,
  elimination_entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL DEFAULT 'system'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_docs (
  id text NOT NULL,
  employee_id text NOT NULL,
  doc_type text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  expiry_date date,
  uploaded_at date DEFAULT CURRENT_DATE,
  status text DEFAULT 'valid'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_licenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company text NOT NULL,
  employee_id uuid NOT NULL,
  license_type text NOT NULL,
  license_number text,
  issue_date date,
  expiry_date date,
  issuing_authority text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_qualifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company text NOT NULL,
  employee_id uuid NOT NULL,
  qualification_type text NOT NULL,
  institution text,
  field_of_study text,
  completion_date date,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_roles (
  id text NOT NULL,
  employee_id text NOT NULL,
  role_id text NOT NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  assigned_by text DEFAULT 'admin'::text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_tags (
  id text NOT NULL,
  company text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employees (
  id text NOT NULL,
  company text,
  name text,
  cnic text,
  phone text,
  address text,
  designation text,
  department text,
  grade text,
  join_date date,
  employee_code text,
  basic numeric DEFAULT 0,
  house_rent numeric DEFAULT 0,
  conveyance numeric DEFAULT 0,
  special_allowance numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  personal jsonb,
  work jsonb,
  salary jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.erp_alerts (
  id bigint NOT NULL DEFAULT nextval('erp_alerts_id_seq'::regclass),
  company text NOT NULL,
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'info'::text,
  title text NOT NULL,
  body text,
  link text,
  reference_id text,
  is_read boolean NOT NULL DEFAULT false,
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.erp_backups (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  backup_date timestamp with time zone DEFAULT now(),
  file_name text,
  file_size integer,
  status text DEFAULT 'complete'::text,
  created_at timestamp with time zone DEFAULT now(),
  meta jsonb DEFAULT '{}'::jsonb,
  backup_type text,
  table_count integer DEFAULT 0,
  record_count integer DEFAULT 0,
  source text
);

CREATE TABLE IF NOT EXISTS public.erp_config (
  id text NOT NULL,
  company text NOT NULL,
  key text NOT NULL,
  value jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  staff_message text NOT NULL,
  message_source text NOT NULL DEFAULT 'text'::text,
  classified_as text,
  matched_pattern text,
  confidence numeric(4,2),
  workflow_steps jsonb DEFAULT '[]'::jsonb,
  execution_result jsonb DEFAULT '{}'::jsonb,
  outcome text,
  executed_by text,
  execution_time_ms integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exit_interviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company text NOT NULL,
  employee_id uuid NOT NULL,
  exit_date date NOT NULL,
  reason_for_leaving text,
  interview_date date,
  interviewer_id uuid,
  overall_experience_rating numeric,
  would_recommend boolean,
  feedback text,
  settlement_amount numeric DEFAULT 0,
  settlement_paid boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  category text NOT NULL,
  company text NOT NULL DEFAULT 'GlassCo'::text,
  paid_by text,
  notes text,
  recorded_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.factory_escalation_alerts (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  event_id text,
  event_type text,
  sector text,
  hours_overdue real DEFAULT 0,
  resolved boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.factory_events (
  id text NOT NULL,
  sector text,
  event_type text,
  detail text,
  priority text DEFAULT 'Medium'::text,
  status text DEFAULT 'Open'::text,
  logged_by text,
  req_id text,
  resolved_at timestamp with time zone,
  notes text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fbr_config (
  id text NOT NULL,
  company text NOT NULL,
  fbr_enabled boolean NOT NULL DEFAULT false,
  fbr_environment text NOT NULL DEFAULT 'sandbox'::text,
  fbr_seller_strn text,
  fbr_seller_ntn text,
  fbr_pos_id text,
  fbr_api_endpoint text,
  fbr_api_token text,
  fbr_token_expires_at timestamp with time zone,
  fbr_auto_submit boolean NOT NULL DEFAULT false,
  fbr_retry_max integer NOT NULL DEFAULT 3,
  fbr_retry_backoff_seconds integer NOT NULL DEFAULT 60,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_events (
  id text NOT NULL,
  company text NOT NULL,
  event_type text,
  date date,
  description text,
  amount numeric DEFAULT 0,
  reference text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fiscal_periods (
  id text NOT NULL,
  company text NOT NULL,
  month text NOT NULL,
  status text DEFAULT 'Open'::text,
  opened_by text,
  opened_at timestamp with time zone,
  closed_by text,
  closed_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gap_log (
  gap_id text NOT NULL,
  event_type text,
  gap_description text NOT NULL,
  current_behavior text,
  expected_behavior text,
  dev_prompt jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'Open'::text,
  priority text NOT NULL DEFAULT 'Medium'::text,
  reported_by text,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gate_passes (
  id text NOT NULL,
  company text NOT NULL,
  date date,
  type text,
  reference text,
  items jsonb DEFAULT '[]'::jsonb,
  status text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.generator_logs (
  id text NOT NULL,
  company text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gl_config (
  id text NOT NULL,
  company text NOT NULL,
  key text,
  value jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gl_entries_pending_approval (
  entry_id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_name text NOT NULL,
  gl_rule_id text,
  entry_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  amount_pkr numeric(14,2) NOT NULL,
  company text NOT NULL,
  period text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_by text,
  approved_at timestamp with time zone,
  rejection_reason text
);

CREATE TABLE IF NOT EXISTS public.gl_posting_rules (
  id text NOT NULL,
  company text NOT NULL,
  rule_name text NOT NULL,
  trigger_event text NOT NULL,
  subcategory text,
  debit_account_code text NOT NULL,
  debit_account_name text NOT NULL,
  credit_account_code text NOT NULL,
  credit_account_name text NOT NULL,
  description_template text,
  payment_mode text,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 100,
  notes text,
  created_by text,
  updated_by text,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gl_posting_rules_v2 (
  rule_id text NOT NULL,
  rule_name text NOT NULL,
  trigger_event text NOT NULL,
  debit_account_code text NOT NULL,
  debit_account_name text NOT NULL,
  credit_account_code text NOT NULL,
  credit_account_name text NOT NULL,
  amount_formula text NOT NULL,
  ias_reference text NOT NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  approval_threshold numeric(14,2),
  period_lock_check boolean NOT NULL DEFAULT true,
  agent_authority text[] NOT NULL DEFAULT '{}'::text[],
  validation_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.golive_checks (
  id bigint NOT NULL DEFAULT nextval('golive_checks_id_seq'::regclass),
  company text NOT NULL,
  check_key text NOT NULL,
  category text NOT NULL,
  status text NOT NULL,
  message text,
  details jsonb DEFAULT '{}'::jsonb,
  ran_at timestamp with time zone NOT NULL DEFAULT now(),
  ran_by text
);

CREATE TABLE IF NOT EXISTS public.gratuity_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company text NOT NULL,
  employee_id uuid NOT NULL,
  balance_amount numeric DEFAULT 0,
  last_calculated_date date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.grn_sheet_entries (
  id text NOT NULL,
  grn_id text NOT NULL,
  company text NOT NULL,
  tag_id text NOT NULL,
  line_index integer NOT NULL DEFAULT 0,
  material_id text NOT NULL,
  thickness text NOT NULL DEFAULT ''::text,
  sheet_size text NOT NULL DEFAULT ''::text,
  sqft_per_sheet numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'OK'::text,
  defect_code text DEFAULT ''::text,
  defect_description text DEFAULT ''::text,
  usable_sqft numeric DEFAULT 0,
  cutter_note text DEFAULT ''::text,
  photos jsonb DEFAULT '[]'::jsonb,
  inspected_by text NOT NULL DEFAULT ''::text,
  inspected_at text NOT NULL DEFAULT ''::text,
  defect_confirmed_by text DEFAULT ''::text,
  defect_confirmed_at text DEFAULT ''::text,
  claim_amount numeric DEFAULT 0,
  claim_status text DEFAULT 'Pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb,
  consumed_in_session_id text,
  consumed_at timestamp with time zone,
  consumed_by text
);

CREATE TABLE IF NOT EXISTS public.handling_units (
  id text NOT NULL,
  company text NOT NULL,
  type text,
  contents jsonb DEFAULT '[]'::jsonb,
  status text,
  created_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company text NOT NULL,
  holiday_date date NOT NULL,
  holiday_name text NOT NULL,
  is_optional boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hse_incidents (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  type text,
  severity text DEFAULT 'Minor'::text,
  description text,
  location text,
  reported_by text,
  closed boolean DEFAULT false,
  closed_at timestamp with time zone,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inspection_lots (
  id text NOT NULL,
  company text NOT NULL,
  date date,
  item_id text,
  qty numeric DEFAULT 0,
  status text,
  inspector text,
  remarks text,
  created_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id text NOT NULL,
  company text NOT NULL DEFAULT ''::text,
  order_id text NOT NULL DEFAULT ''::text,
  order_no text DEFAULT ''::text,
  client_id text DEFAULT ''::text,
  client_name text DEFAULT ''::text,
  date text DEFAULT ''::text,
  due_date text DEFAULT ''::text,
  total_amount numeric DEFAULT 0,
  received_amount numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  status text DEFAULT 'Outstanding'::text,
  gl_tx_id text DEFAULT ''::text,
  payments jsonb DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  items jsonb DEFAULT '[]'::jsonb,
  service_charges jsonb DEFAULT '[]'::jsonb,
  project_name text,
  discount_amount numeric(15,2) DEFAULT 0,
  gst_percent numeric(5,2) DEFAULT 0,
  gst_amount numeric(15,2) DEFAULT 0,
  voided_by text,
  voided_at timestamp with time zone,
  reverted_status text,
  created_by text,
  updated_by text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  version integer DEFAULT 1,
  search_tsv tsvector,
  buyer_strn text,
  buyer_ntn text,
  buyer_cnic text,
  buyer_type text,
  buyer_province text,
  fbr_invoice_no text,
  fbr_qr_code text,
  fbr_status text DEFAULT 'pending'::text,
  fbr_submitted_at timestamp with time zone,
  fbr_verified_at timestamp with time zone,
  fbr_response jsonb,
  fbr_retry_count integer DEFAULT 0,
  fbr_last_error text,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.job_orders (
  id text NOT NULL,
  company text NOT NULL,
  date date,
  order_ref text,
  items jsonb DEFAULT '[]'::jsonb,
  status text,
  created_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.leads (
  id text NOT NULL,
  company text NOT NULL,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  source text,
  estimated_value numeric(15,2) DEFAULT 0,
  stage text DEFAULT 'New'::text,
  priority text DEFAULT 'Normal'::text,
  next_action text,
  next_action_date date,
  notes text,
  client_id text,
  converted_quotation_id text,
  lost_reason text,
  assigned_to text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  stage_changed_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.learning_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id text,
  staff_message text,
  classified_as text,
  owner_feedback text,
  pattern_update jsonb,
  confidence_delta numeric(4,2) DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leave_applications (
  id text NOT NULL,
  company text,
  employee_id text,
  leave_type text,
  from_date date,
  to_date date,
  days numeric DEFAULT 0,
  reason text,
  status text DEFAULT 'Pending'::text,
  approved_by text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leave_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company text NOT NULL,
  leave_code text NOT NULL,
  leave_name text NOT NULL,
  max_days_per_year integer DEFAULT 21,
  is_paid boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ledger (
  id text NOT NULL,
  company text,
  doc_type text,
  doc_date text,
  date text,
  description text,
  reference_id text,
  status text,
  details jsonb DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb,
  drafted_by text,
  approved_by text,
  jv_approved_at timestamp with time zone,
  updated_by text,
  posted_at timestamp with time zone,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.loans (
  id text NOT NULL,
  employee_id text,
  type text,
  amount numeric DEFAULT 0,
  repayment_amount numeric DEFAULT 0,
  status text,
  date date,
  created_at timestamp with time zone DEFAULT now(),
  loan_type text,
  applied_date date,
  approved_date date,
  company text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.manual_count_sheets (
  id text NOT NULL,
  company text NOT NULL,
  count_date text NOT NULL,
  submitted_by text NOT NULL DEFAULT ''::text,
  submitted_at text NOT NULL DEFAULT ''::text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  printed_at text DEFAULT ''::text,
  count_ref text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'Pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.mapping_rules (
  id text NOT NULL,
  company text NOT NULL,
  trigger_type text,
  account_id text,
  cost_center text,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.morning_briefings (
  briefing_date text NOT NULL,
  briefing_text text,
  raw_data jsonb DEFAULT '{}'::jsonb,
  kpis jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ncr_claims (
  id text NOT NULL,
  company text NOT NULL DEFAULT ''::text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  ncr_id text DEFAULT ''::text,
  vendor_id text DEFAULT ''::text,
  vendor_name text DEFAULT ''::text,
  claim_date text DEFAULT ''::text,
  claim_amount numeric DEFAULT 0,
  description text DEFAULT ''::text,
  photos jsonb DEFAULT '[]'::jsonb,
  purchase_ref text DEFAULT ''::text,
  status text DEFAULT 'Draft'::text,
  settled_amount numeric DEFAULT 0,
  settled_date text DEFAULT ''::text,
  rejection_reason text DEFAULT ''::text,
  gl_debit_note_id text DEFAULT ''::text,
  notes text DEFAULT ''::text
);

CREATE TABLE IF NOT EXISTS public.ncr_events (
  id text NOT NULL,
  company text NOT NULL DEFAULT ''::text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  piece_id text DEFAULT ''::text,
  job_order_id text DEFAULT ''::text,
  item_index integer DEFAULT 0,
  stage text DEFAULT 'Cutting'::text,
  cause text DEFAULT ''::text,
  description text DEFAULT ''::text,
  reported_by text DEFAULT ''::text,
  reported_at text DEFAULT ''::text,
  sqft_lost numeric DEFAULT 0,
  glass_type text DEFAULT ''::text,
  thickness text DEFAULT ''::text,
  estimated_value numeric DEFAULT 0,
  action text DEFAULT 'Dispose'::text,
  status text DEFAULT 'Open'::text,
  vendor_id text DEFAULT ''::text,
  vendor_name text DEFAULT ''::text,
  purchase_ref text DEFAULT ''::text,
  gl_entry_id text DEFAULT ''::text,
  photos jsonb DEFAULT '[]'::jsonb,
  notes text DEFAULT ''::text,
  closed_at text DEFAULT ''::text,
  closed_by text DEFAULT ''::text
);

CREATE TABLE IF NOT EXISTS public.ncr_remnants (
  id text NOT NULL,
  company text NOT NULL DEFAULT ''::text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  ncr_id text DEFAULT ''::text,
  glass_type text DEFAULT ''::text,
  thickness text DEFAULT ''::text,
  estimated_kg numeric DEFAULT 0,
  sqft numeric DEFAULT 0,
  disposal_method text DEFAULT 'Bin'::text,
  scrap_value numeric DEFAULT 0,
  date text DEFAULT ''::text,
  notes text DEFAULT ''::text
);

CREATE TABLE IF NOT EXISTS public.ncr_reproductions (
  id text NOT NULL,
  company text NOT NULL DEFAULT ''::text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  ncr_id text DEFAULT ''::text,
  job_order_id text DEFAULT ''::text,
  item_index integer DEFAULT 0,
  original_piece_id text DEFAULT ''::text,
  new_piece_id text DEFAULT ''::text,
  priority text DEFAULT 'Normal'::text,
  status text DEFAULT 'Queued'::text,
  extra_cost numeric DEFAULT 0,
  notes text DEFAULT ''::text,
  completed_at text DEFAULT ''::text
);

CREATE TABLE IF NOT EXISTS public.overtimes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company text NOT NULL,
  employee_id uuid NOT NULL,
  date date NOT NULL,
  hours_worked numeric DEFAULT 0,
  overtime_rate numeric DEFAULT 1.5,
  amount_pkr numeric DEFAULT 0,
  status text DEFAULT 'Pending'::text,
  approved_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.owner_presence_state (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  is_present boolean DEFAULT true,
  mode text DEFAULT 'active'::text,
  mode_since timestamp with time zone,
  mode_until timestamp with time zone,
  auto_reply_enabled boolean DEFAULT false,
  escalation_threshold text DEFAULT 'high'::text,
  handled_count integer DEFAULT 0,
  escalated_count integer DEFAULT 0,
  pending_review jsonb DEFAULT '[]'::jsonb,
  last_sync_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pallet_rates (
  id text NOT NULL,
  company text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pattern_library (
  event_id text NOT NULL,
  trigger_keywords text[] NOT NULL DEFAULT '{}'::text[],
  category text NOT NULL,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#3B82F6'::text,
  modules_involved text[] NOT NULL DEFAULT '{}'::text[],
  workflow_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  times_used integer NOT NULL DEFAULT 0,
  confidence numeric(4,2) NOT NULL DEFAULT 0.90,
  defined_by text NOT NULL DEFAULT 'system'::text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id text NOT NULL,
  invoice_id text NOT NULL DEFAULT ''::text,
  date text DEFAULT ''::text,
  amount numeric DEFAULT 0,
  method text DEFAULT 'Bank Transfer'::text,
  reference text DEFAULT ''::text,
  gl_tx_id text DEFAULT ''::text,
  updated_at timestamp with time zone DEFAULT now(),
  receipt_no text,
  payment_date date,
  payment_method text,
  reference_no text,
  remarks text,
  company text,
  created_at timestamp with time zone DEFAULT now(),
  created_by text,
  updated_by text,
  data jsonb DEFAULT '{}'::jsonb,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.payroll (
  id text NOT NULL,
  employee_id text,
  month text,
  basic_pay numeric DEFAULT 0,
  allowances numeric DEFAULT 0,
  overtime_pay numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  early_deduction_hours numeric DEFAULT 0,
  late_deduction numeric DEFAULT 0,
  absent_deduction numeric DEFAULT 0,
  loan_deduction numeric DEFAULT 0,
  advance_deduction numeric DEFAULT 0,
  net_salary numeric DEFAULT 0,
  absent_dates jsonb DEFAULT '[]'::jsonb,
  late_dates jsonb DEFAULT '[]'::jsonb,
  loan_repayments jsonb DEFAULT '[]'::jsonb,
  is_salary_paid boolean DEFAULT false,
  is_overtime_paid boolean DEFAULT false,
  allowed_absent_count numeric DEFAULT 0,
  loan_waived numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  pay_period text,
  basic_salary numeric DEFAULT 0,
  deductions numeric DEFAULT 0,
  status text DEFAULT 'Draft'::text,
  company text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.perf_telemetry (
  id bigint NOT NULL DEFAULT nextval('perf_telemetry_id_seq'::regclass),
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id text,
  company text,
  metric text NOT NULL,
  label text NOT NULL,
  ms numeric,
  bytes bigint,
  rows integer,
  payload jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.performance_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company text NOT NULL,
  employee_id uuid NOT NULL,
  review_period text NOT NULL,
  reviewer_id uuid,
  overall_rating numeric DEFAULT 0,
  review_date date,
  strengths text,
  improvements text,
  goals text,
  status text DEFAULT 'Draft'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id text NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  scope text NOT NULL DEFAULT 'company'::text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.petty_cash (
  id text NOT NULL,
  company text NOT NULL,
  date date,
  description text,
  amount numeric DEFAULT 0,
  type text,
  reference_doc text,
  created_at timestamp with time zone DEFAULT now(),
  updated_by text,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.predictive_alerts (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  alert_type text NOT NULL,
  title text,
  message text,
  severity text DEFAULT 'Medium'::text,
  confidence integer DEFAULT 70,
  entity_type text,
  entity_id text,
  entity_label text,
  data_snapshot jsonb DEFAULT '{}'::jsonb,
  actioned boolean DEFAULT false,
  dismissed boolean DEFAULT false,
  action_note text,
  actioned_by text,
  actioned_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.price_list_items (
  id text NOT NULL,
  price_list_id text NOT NULL,
  company text NOT NULL,
  glass_type text,
  thickness text,
  sub_category text,
  service_nick text,
  rate numeric(15,2) NOT NULL,
  uom text DEFAULT 'sqft'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.price_lists (
  id text NOT NULL,
  company text NOT NULL,
  name text NOT NULL,
  description text,
  effective_from date,
  effective_to date,
  is_active boolean DEFAULT true,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.production_pieces (
  id text NOT NULL,
  order_id text,
  item_index integer DEFAULT 0,
  specs text,
  status text DEFAULT 'Pending'::text,
  last_updated timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  company text NOT NULL DEFAULT ''::text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  version integer DEFAULT 1,
  cut_by text,
  cut_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.products (
  id text NOT NULL,
  company text NOT NULL,
  category text,
  description text,
  service_nick text,
  profile_code text,
  thickness text,
  sheet_size text,
  cost_price numeric DEFAULT 0,
  base_price numeric DEFAULT 0,
  unit text,
  variants jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  glass_type text DEFAULT ''::text,
  sub_category text DEFAULT ''::text,
  tempering_price numeric DEFAULT 0,
  main_category text DEFAULT ''::text,
  finish_color text DEFAULT ''::text,
  model_no text DEFAULT ''::text,
  brand text DEFAULT ''::text,
  direction text DEFAULT ''::text,
  tongue_length text DEFAULT ''::text,
  spindle_length text DEFAULT ''::text,
  image_url text DEFAULT ''::text,
  hs_code text DEFAULT ''::text,
  is_set boolean DEFAULT false,
  set_components jsonb DEFAULT '[]'::jsonb,
  technical_specs jsonb DEFAULT '{}'::jsonb,
  width numeric DEFAULT 0,
  height numeric DEFAULT 0,
  frame_color text DEFAULT ''::text,
  mesh_color text DEFAULT ''::text,
  sub_description text DEFAULT ''::text,
  material text DEFAULT ''::text,
  system_sub_class text DEFAULT ''::text,
  profile_role text DEFAULT ''::text,
  updated_at timestamp with time zone DEFAULT now(),
  price_history jsonb DEFAULT '[]'::jsonb,
  version integer DEFAULT 1,
  active boolean DEFAULT true,
  nick_name text
);

CREATE TABLE IF NOT EXISTS public.projects (
  id text NOT NULL,
  company text NOT NULL,
  name text,
  client_id text,
  status text,
  start_date date,
  end_date date,
  budget numeric DEFAULT 0,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.public_holidays (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  company text NOT NULL,
  holiday_date date NOT NULL,
  name text NOT NULL,
  is_optional boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id text NOT NULL,
  from_company text,
  to_vendor text,
  date date,
  status text DEFAULT 'Draft'::text,
  total_amount numeric DEFAULT 0,
  category text,
  project_id text,
  items jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quotations (
  id text NOT NULL,
  company text NOT NULL,
  date date,
  due_date date,
  client_id text,
  project_name text,
  items jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'Draft'::text,
  is_already_dispatched boolean DEFAULT false,
  discount_percent numeric DEFAULT 0,
  manual_serial text,
  order_no text,
  revised_fields jsonb DEFAULT '[]'::jsonb,
  received_amount numeric DEFAULT 0,
  actual_delivery_date date,
  created_at timestamp with time zone DEFAULT now(),
  discount_amount numeric DEFAULT 0,
  manual_ref text DEFAULT ''::text,
  subject text DEFAULT ''::text,
  "advancePayable" numeric DEFAULT 0,
  "advanceReceived" boolean DEFAULT false,
  "productionStartedWithoutAdvance" boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  order_type text DEFAULT 'Standard'::text,
  original_order_ref text,
  replacement_reason text,
  cost_bearer text,
  data jsonb DEFAULT '{}'::jsonb,
  service_charges jsonb DEFAULT '[]'::jsonb,
  version integer DEFAULT 1,
  search_tsv tsvector,
  assigned_cutter text,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id text NOT NULL,
  company text NOT NULL,
  name text,
  amount numeric DEFAULT 0,
  frequency text,
  next_due date,
  account_id text,
  cost_center text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.remnant_history (
  id text NOT NULL,
  company text NOT NULL,
  thickness text NOT NULL,
  sqft numeric NOT NULL,
  outcome text NOT NULL,
  days_in_stock integer NOT NULL DEFAULT 0,
  scrap_reason text DEFAULT ''::text,
  recorded_at text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.remnants (
  id text NOT NULL,
  company text NOT NULL,
  parent_tag_id text NOT NULL,
  parent_grn_id text NOT NULL,
  job_order_id text DEFAULT ''::text,
  cutting_session_id text DEFAULT ''::text,
  material_id text NOT NULL,
  thickness text NOT NULL DEFAULT ''::text,
  glass_category text NOT NULL DEFAULT ''::text,
  sub_category text DEFAULT ''::text,
  shape text NOT NULL DEFAULT 'Rectangle'::text,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  sqft numeric NOT NULL DEFAULT 0,
  estimated_weight_kg numeric DEFAULT 0,
  bin_location text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'Available'::text,
  created_at text NOT NULL DEFAULT ''::text,
  created_by text NOT NULL DEFAULT ''::text,
  used_at text DEFAULT ''::text,
  used_in_job_id text DEFAULT ''::text,
  scrap_reason text DEFAULT ''::text,
  scrap_date text DEFAULT ''::text,
  scrap_sqft numeric DEFAULT 0,
  db_created_at timestamp with time zone DEFAULT now(),
  db_updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.requisitions (
  id text NOT NULL,
  company text NOT NULL,
  date date,
  header_text text,
  requisitioner text,
  priority text DEFAULT 'Normal'::text,
  req_type text,
  items jsonb DEFAULT '[]'::jsonb,
  total_value numeric DEFAULT 0,
  status text DEFAULT 'Pending'::text,
  employee_id text,
  loan_amount numeric DEFAULT 0,
  loan_purpose text,
  installments integer DEFAULT 0,
  skip_month text,
  absent_date text,
  absent_reason text,
  overtime_hours numeric DEFAULT 0,
  overtime_project text,
  overtime_employees jsonb DEFAULT '[]'::jsonb,
  approved_by text,
  created_at timestamp with time zone DEFAULT now(),
  category text,
  "requiresCashPayment" boolean DEFAULT false,
  "estimatedAmount" numeric,
  "paymentStatus" text DEFAULT 'Not Required'::text,
  "paidAmount" numeric,
  "paymentRef" text,
  "paymentDate" date,
  "glAccountHint" text,
  "approvedBy" text,
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id text NOT NULL,
  role_id text NOT NULL,
  permission_id text NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id text NOT NULL,
  name text NOT NULL,
  company text NOT NULL,
  description text DEFAULT ''::text,
  is_system boolean DEFAULT false,
  is_active boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saas_clients (
  client_id text NOT NULL,
  company_name text NOT NULL,
  industry text NOT NULL,
  tier text NOT NULL DEFAULT 'starter'::text,
  max_users integer NOT NULL DEFAULT 25,
  max_companies integer NOT NULL DEFAULT 1,
  max_api_calls integer NOT NULL DEFAULT 500,
  owner_name text NOT NULL,
  owner_email text NOT NULL,
  owner_phone text,
  active boolean NOT NULL DEFAULT true,
  onboarded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scrap_disposals (
  id text NOT NULL,
  company text NOT NULL,
  disposal_date text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_estimated_kg numeric DEFAULT 0,
  total_actual_kg numeric DEFAULT 0,
  market_rates jsonb DEFAULT '[]'::jsonb,
  market_rate_avg_per_kg numeric DEFAULT 5,
  default_rate_per_kg numeric DEFAULT 5,
  actual_dealer_name text DEFAULT ''::text,
  actual_amount_received numeric DEFAULT 0,
  actual_rate_per_kg numeric DEFAULT 0,
  variance_from_market numeric DEFAULT 0,
  gl_journal_id text DEFAULT ''::text,
  recorded_by text NOT NULL DEFAULT ''::text,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shift_master (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company text NOT NULL,
  shift_code text NOT NULL,
  shift_name text NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  duration_minutes integer DEFAULT 480,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  date_from date,
  date_to date
);

CREATE TABLE IF NOT EXISTS public.sla_breaches (
  id bigint NOT NULL DEFAULT nextval('sla_breaches_id_seq'::regclass),
  company text NOT NULL,
  vendor_name text NOT NULL,
  dispatch_id uuid,
  breach_type text NOT NULL,
  expected_date date,
  actual_date date,
  delay_days integer,
  detected_at timestamp with time zone DEFAULT now(),
  notes text,
  resolved boolean DEFAULT false,
  resolved_at timestamp with time zone,
  resolved_by text
);

CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id text NOT NULL,
  company text NOT NULL,
  item_id text,
  date date,
  movement text,
  qty numeric DEFAULT 0,
  unit text,
  reference text,
  created_at timestamp with time zone DEFAULT now(),
  dc_no text DEFAULT ''::text,
  bilty_no text DEFAULT ''::text,
  bilty_freight_pkr numeric DEFAULT 0,
  vendor_so_no text DEFAULT ''::text,
  vehicle_no text DEFAULT ''::text,
  driver_name text DEFAULT ''::text,
  driver_phone text DEFAULT ''::text,
  freight_type text DEFAULT ''::text,
  freight_pkr numeric DEFAULT 0,
  other_charges_pkr numeric DEFAULT 0,
  other_charges_desc text DEFAULT ''::text,
  line_weight_kg numeric DEFAULT 0,
  per_sheet_weight_kg numeric DEFAULT 0,
  per_sqft_weight_kg numeric DEFAULT 0,
  vendor_id text DEFAULT ''::text,
  vendor_name text DEFAULT ''::text,
  po_id text DEFAULT ''::text,
  sheet_count integer DEFAULT 0,
  glass_category text DEFAULT ''::text,
  sheet_tags jsonb DEFAULT '[]'::jsonb,
  sheet_tag_meta jsonb DEFAULT '{}'::jsonb,
  reversal_of text DEFAULT ''::text,
  is_reversal boolean DEFAULT false,
  reversal_reason text DEFAULT ''::text,
  "timestamp" timestamp with time zone DEFAULT now(),
  mvmnt_code text,
  valuation numeric DEFAULT 0,
  balance_after numeric DEFAULT 0,
  reference_doc text,
  "user" text,
  remarks text,
  storage_bin text,
  batch_no text,
  hu_id text,
  project_id text,
  bilty_weight_kg numeric DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  material_id text,
  movement_type text,
  quantity numeric DEFAULT 0,
  posting_date date,
  document_no text,
  plant text,
  storage_loc text,
  value numeric DEFAULT 0,
  moving_avg_price numeric DEFAULT 0,
  uom text,
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.stock_locations (
  id text NOT NULL,
  company text NOT NULL,
  code text NOT NULL,
  description text,
  zone text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.store_items (
  id text NOT NULL,
  company text NOT NULL,
  name text NOT NULL,
  category text,
  quantity numeric DEFAULT 0,
  unrestricted_qty numeric DEFAULT 0,
  qi_qty numeric DEFAULT 0,
  blocked_qty numeric DEFAULT 0,
  reserved_qty numeric DEFAULT 0,
  consignment_qty numeric DEFAULT 0,
  unit text,
  alt_unit text,
  conversion_factor numeric DEFAULT 1,
  min_level numeric DEFAULT 0,
  reorder_point numeric DEFAULT 0,
  moving_average_price numeric DEFAULT 0,
  total_value numeric DEFAULT 0,
  storage_bin text,
  last_movement_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  defective_sheets integer DEFAULT 0,
  defective_qty numeric DEFAULT 0,
  defective_sqft numeric DEFAULT 0,
  defective_value numeric DEFAULT 0,
  scrap_sqft numeric DEFAULT 0,
  scrap_weight_kg numeric DEFAULT 0,
  last_scrap_disposal text DEFAULT ''::text,
  per_sheet_weight_kg numeric DEFAULT 0,
  per_sqft_weight_kg numeric DEFAULT 0,
  remnant_count integer DEFAULT 0,
  remnant_sqft numeric DEFAULT 0,
  data jsonb DEFAULT '{}'::jsonb,
  version integer DEFAULT 1,
  -- reflection gap: prod store_items has updated_at (consume_glass_stock writes it)
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tag_master (
  id text NOT NULL,
  company text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  category text DEFAULT 'general'::text
);

CREATE TABLE IF NOT EXISTS public.tempering_dispatches (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  company text NOT NULL,
  date timestamp with time zone DEFAULT now(),
  vehicle_no text,
  driver_name text,
  service_type text,
  piece_ids jsonb,
  status text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  expected_return_date date,
  actual_return_date date,
  vendor_invoice_amount numeric(15,2),
  vendor_invoice_no text,
  three_way_match_status text,
  gate_pass_id text,
  driver_token text,
  pod_completed_at timestamp with time zone,
  pod_otp_verified boolean DEFAULT false,
  fuel_cost numeric(15,2) DEFAULT 0,
  driver_allowance numeric(15,2) DEFAULT 0,
  toll_charges numeric(15,2) DEFAULT 0,
  maintenance_cost numeric(15,2) DEFAULT 0,
  destination_lat numeric(10,7),
  destination_lng numeric(10,7),
  arriving_detected_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.tempering_oven_config (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  company text NOT NULL,
  oven_id text NOT NULL,
  oven_name text NOT NULL,
  max_capacity_kg numeric(10,2) NOT NULL,
  max_sqft_per_batch numeric(10,2) NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.unknown_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  original_message text NOT NULL,
  extracted_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_category text,
  status text NOT NULL DEFAULT 'pending'::text,
  pattern_created_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL DEFAULT ''::text,
  full_name text DEFAULT ''::text,
  role text NOT NULL DEFAULT 'glassco_admin'::text,
  allowed_companies text[] DEFAULT ARRAY['Glassco'::text],
  allowed_modules text[] DEFAULT ARRAY[]::text[],
  time_restricted boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  employee_id text,
  employee_code text,
  has_pin_fallback boolean DEFAULT false,
  last_login timestamp with time zone,
  override_mode_active boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.vehicle_expenses (
  id text NOT NULL,
  company text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicle_locations (
  vehicle_id text NOT NULL,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  trip_id uuid,
  speed_kph numeric(5,1),
  heading_deg numeric(5,1),
  accuracy_m numeric(7,1),
  battery_pct numeric(4,1)
);

CREATE TABLE IF NOT EXISTS public.vehicle_trips (
  id text NOT NULL,
  company text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id text NOT NULL,
  company text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_defect_reports (
  id text NOT NULL,
  company text NOT NULL,
  grn_id text NOT NULL,
  vendor_id text NOT NULL,
  vendor_name text NOT NULL DEFAULT ''::text,
  report_date text NOT NULL DEFAULT ''::text,
  defect_entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_adjustment numeric NOT NULL DEFAULT 0,
  prepared_by text NOT NULL DEFAULT ''::text,
  sent_at text DEFAULT ''::text,
  sent_by text DEFAULT ''::text,
  sent_via text DEFAULT ''::text,
  verbally_confirmed_by text DEFAULT ''::text,
  verbally_confirmed_at text DEFAULT ''::text,
  status text NOT NULL DEFAULT 'Draft'::text,
  settlement_ref text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.vendor_rates (
  id text NOT NULL,
  company text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_reviews (
  id text NOT NULL,
  company text NOT NULL,
  vendor_id text NOT NULL,
  vendor_name text NOT NULL DEFAULT ''::text,
  review_date text NOT NULL,
  reviewed_by text NOT NULL DEFAULT ''::text,
  period_from text NOT NULL DEFAULT ''::text,
  period_to text NOT NULL DEFAULT ''::text,
  total_grns integer DEFAULT 0,
  total_sheets_received integer DEFAULT 0,
  total_sqft_received numeric DEFAULT 0,
  defective_sqft numeric DEFAULT 0,
  broken_sqft numeric DEFAULT 0,
  defect_rate_pct numeric DEFAULT 0,
  total_adjustment_pkr numeric DEFAULT 0,
  avg_delivery_days numeric DEFAULT 0,
  on_time_deliveries integer DEFAULT 0,
  late_deliveries integer DEFAULT 0,
  rating text NOT NULL DEFAULT 'Good'::text,
  comments text DEFAULT ''::text,
  action_required text DEFAULT ''::text,
  next_review_date text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.vendor_sla (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  vendor_name text NOT NULL,
  company text,
  active boolean DEFAULT true,
  total_orders integer DEFAULT 0,
  breach_count integer DEFAULT 0,
  next_rate_review text,
  reminded boolean DEFAULT false,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendors (
  id text NOT NULL,
  name text NOT NULL,
  nick_name text,
  type text,
  company text,
  address text,
  contact_person text,
  phone text,
  registration_date date,
  rates jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  rate_list_versions jsonb DEFAULT '{}'::jsonb,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  search_tsv tsvector
);

CREATE TABLE IF NOT EXISTS public.warehouse_spots (
  id text NOT NULL,
  company text NOT NULL,
  code text,
  zone text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wazir_conversations (
  id text NOT NULL,
  thread_id text,
  role text NOT NULL,
  content text NOT NULL,
  tool_calls jsonb DEFAULT '[]'::jsonb,
  tool_results jsonb DEFAULT '[]'::jsonb,
  mood_tag text,
  related_decision_id text,
  channel text DEFAULT 'app'::text,
  "timestamp" timestamp with time zone DEFAULT now(),
  tokens_used integer,
  model_used text
);

CREATE TABLE IF NOT EXISTS public.wazir_decisions (
  id text NOT NULL,
  company text,
  decision_type text NOT NULL,
  subject text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  decision_text text,
  decided_by text,
  decided_at timestamp with time zone DEFAULT now(),
  amount numeric(14,2),
  related_docs jsonb DEFAULT '[]'::jsonb,
  outcome_status text,
  outcome_evaluated_at timestamp with time zone,
  outcome_notes text,
  outcome_numeric numeric(14,2),
  lessons_extracted boolean DEFAULT false,
  tags text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wazir_lessons (
  id text NOT NULL,
  category text,
  pattern text NOT NULL,
  evidence_count integer DEFAULT 1,
  confidence numeric(3,2) DEFAULT 0.5,
  source_decisions text[] DEFAULT '{}'::text[],
  first_observed timestamp with time zone DEFAULT now(),
  last_reinforced timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  tags text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wazir_voice_samples (
  id text NOT NULL,
  channel text,
  recipient_type text,
  context text,
  message text NOT NULL,
  tone_tags text[] DEFAULT '{}'::text[],
  language text DEFAULT 'ur-en'::text,
  captured_at timestamp with time zone DEFAULT now(),
  is_approved boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wazir_weekly_reports (
  id text NOT NULL,
  report_date date NOT NULL,
  week_number integer,
  year integer,
  companies_covered text[] DEFAULT '{}'::text[],
  headline text,
  body text NOT NULL,
  top_concerns jsonb DEFAULT '[]'::jsonb,
  top_opportunities jsonb DEFAULT '[]'::jsonb,
  big_question text,
  metrics_snapshot jsonb DEFAULT '{}'::jsonb,
  whatsapp_sent_at timestamp with time zone,
  owner_replied boolean DEFAULT false,
  owner_reply text,
  input_tokens integer,
  output_tokens integer,
  cost_pkr numeric(10,2),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weight_master (
  id text NOT NULL,
  company text,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_log (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  direction text DEFAULT 'outbound'::text,
  from_num text,
  to_num text,
  message text,
  status text DEFAULT 'sent'::text,
  wa_msg_id text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_orders (
  id text NOT NULL,
  company text NOT NULL,
  sales_order_id text,
  client_id text,
  client_name text,
  project_name text,
  description text,
  status text DEFAULT 'Open'::text,
  priority text DEFAULT 'Normal'::text,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  pieces_total integer DEFAULT 0,
  pieces_done integer DEFAULT 0,
  notes text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb
);
-- ═══ 4/9 Constraints (PK / UNIQUE / CHECK / FK) ═══

ALTER TABLE public.access_logs ADD CONSTRAINT access_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.advance_salaries ADD CONSTRAINT advance_salaries_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_alert_history ADD CONSTRAINT agent_alert_history_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_api_calls ADD CONSTRAINT agent_api_calls_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_audit_log ADD CONSTRAINT agent_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_decisions ADD CONSTRAINT agent_decisions_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_episodic_memory ADD CONSTRAINT agent_episodic_memory_pkey PRIMARY KEY (decision_id);
ALTER TABLE public.agent_execution_log ADD CONSTRAINT agent_execution_log_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_memories ADD CONSTRAINT agent_memories_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_permissions ADD CONSTRAINT agent_permissions_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_procedural_memory ADD CONSTRAINT agent_procedural_memory_pkey PRIMARY KEY (rule_id);
ALTER TABLE public.agent_rate_config ADD CONSTRAINT agent_rate_config_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_rate_limits ADD CONSTRAINT agent_rate_limits_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_semantic_memory ADD CONSTRAINT agent_semantic_memory_pkey PRIMARY KEY (fact_id);
ALTER TABLE public.agent_sessions ADD CONSTRAINT agent_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_table_access ADD CONSTRAINT agent_table_access_pkey PRIMARY KEY (id);
ALTER TABLE public.alert_thresholds ADD CONSTRAINT alert_thresholds_pkey PRIMARY KEY (id);
ALTER TABLE public.anomaly_log ADD CONSTRAINT anomaly_log_pkey PRIMARY KEY (id);
ALTER TABLE public.anomaly_thresholds ADD CONSTRAINT anomaly_thresholds_pkey PRIMARY KEY (id);
ALTER TABLE public.asset_registry ADD CONSTRAINT asset_registry_pkey PRIMARY KEY (id);
ALTER TABLE public.assets ADD CONSTRAINT assets_pkey PRIMARY KEY (id);
ALTER TABLE public.attendance ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);
ALTER TABLE public.attendance_overrides ADD CONSTRAINT attendance_overrides_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.bank_recon_sessions ADD CONSTRAINT bank_recon_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.bom_items ADD CONSTRAINT bom_items_pkey PRIMARY KEY (id);
ALTER TABLE public.bom_templates ADD CONSTRAINT bom_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_lines ADD CONSTRAINT budget_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.business_manual ADD CONSTRAINT business_manual_pkey PRIMARY KEY (event_type);
ALTER TABLE public.business_scenarios ADD CONSTRAINT business_scenarios_pkey PRIMARY KEY (id);
ALTER TABLE public.bypass_log ADD CONSTRAINT bypass_log_pkey PRIMARY KEY (id);
ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE public.company_branding ADD CONSTRAINT company_branding_pkey PRIMARY KEY (id);
ALTER TABLE public.cost_centers ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);
ALTER TABLE public.credit_notes ADD CONSTRAINT credit_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.csv_import_logs ADD CONSTRAINT csv_import_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.customer_complaints ADD CONSTRAINT customer_complaints_pkey PRIMARY KEY (id);
ALTER TABLE public.customer_signatures ADD CONSTRAINT customer_signatures_pkey PRIMARY KEY (id);
ALTER TABLE public.cutover_snapshot ADD CONSTRAINT cutover_snapshot_pkey PRIMARY KEY (id);
ALTER TABLE public.cutter_daily_logs ADD CONSTRAINT cutter_daily_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.cutting_sessions ADD CONSTRAINT cutting_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.delivery_otps ADD CONSTRAINT delivery_otps_pkey PRIMARY KEY (id);
ALTER TABLE public.departments ADD CONSTRAINT departments_pkey PRIMARY KEY (id);
ALTER TABLE public.disciplinary_actions ADD CONSTRAINT disciplinary_actions_pkey PRIMARY KEY (id);
ALTER TABLE public.dispatch_events ADD CONSTRAINT dispatch_events_pkey PRIMARY KEY (id);
ALTER TABLE public.dispatch_photos ADD CONSTRAINT dispatch_photos_pkey PRIMARY KEY (id);
ALTER TABLE public.dispatch_vehicles ADD CONSTRAINT dispatch_vehicles_pkey PRIMARY KEY (id);
ALTER TABLE public.dispatches ADD CONSTRAINT dispatches_pkey PRIMARY KEY (id);
ALTER TABLE public.doc_serials ADD CONSTRAINT doc_serials_pkey PRIMARY KEY (company, doc_type, year);
ALTER TABLE public.driver_licenses ADD CONSTRAINT driver_licenses_pkey PRIMARY KEY (id);
ALTER TABLE public.elimination_log ADD CONSTRAINT elimination_log_pkey PRIMARY KEY (elim_id);
ALTER TABLE public.employee_docs ADD CONSTRAINT employee_docs_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_licenses ADD CONSTRAINT employee_licenses_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_qualifications ADD CONSTRAINT employee_qualifications_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_roles ADD CONSTRAINT employee_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_tags ADD CONSTRAINT employee_tags_pkey PRIMARY KEY (id);
ALTER TABLE public.employees ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
ALTER TABLE public.erp_alerts ADD CONSTRAINT erp_alerts_pkey PRIMARY KEY (id);
ALTER TABLE public.erp_backups ADD CONSTRAINT erp_backups_pkey PRIMARY KEY (id);
ALTER TABLE public.erp_config ADD CONSTRAINT erp_config_pkey PRIMARY KEY (id);
ALTER TABLE public.event_history ADD CONSTRAINT event_history_pkey PRIMARY KEY (id);
ALTER TABLE public.exit_interviews ADD CONSTRAINT exit_interviews_pkey PRIMARY KEY (id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.factory_escalation_alerts ADD CONSTRAINT factory_escalation_alerts_pkey PRIMARY KEY (id);
ALTER TABLE public.factory_events ADD CONSTRAINT factory_events_pkey PRIMARY KEY (id);
ALTER TABLE public.fbr_config ADD CONSTRAINT fbr_config_pkey PRIMARY KEY (id);
ALTER TABLE public.financial_events ADD CONSTRAINT financial_events_pkey PRIMARY KEY (id);
ALTER TABLE public.fiscal_periods ADD CONSTRAINT fiscal_periods_pkey PRIMARY KEY (id);
ALTER TABLE public.gap_log ADD CONSTRAINT gap_log_pkey PRIMARY KEY (gap_id);
ALTER TABLE public.gate_passes ADD CONSTRAINT gate_passes_pkey PRIMARY KEY (id);
ALTER TABLE public.generator_logs ADD CONSTRAINT generator_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.gl_config ADD CONSTRAINT gl_config_pkey PRIMARY KEY (id);
ALTER TABLE public.gl_entries_pending_approval ADD CONSTRAINT gl_entries_pending_approval_pkey PRIMARY KEY (entry_id);
ALTER TABLE public.gl_posting_rules ADD CONSTRAINT gl_posting_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.gl_posting_rules_v2 ADD CONSTRAINT gl_posting_rules_v2_pkey PRIMARY KEY (rule_id);
ALTER TABLE public.golive_checks ADD CONSTRAINT golive_checks_pkey PRIMARY KEY (id);
ALTER TABLE public.gratuity_balances ADD CONSTRAINT gratuity_balances_pkey PRIMARY KEY (id);
ALTER TABLE public.grn_sheet_entries ADD CONSTRAINT grn_sheet_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.handling_units ADD CONSTRAINT handling_units_pkey PRIMARY KEY (id);
ALTER TABLE public.holidays ADD CONSTRAINT holidays_pkey PRIMARY KEY (id);
ALTER TABLE public.hse_incidents ADD CONSTRAINT hse_incidents_pkey PRIMARY KEY (id);
ALTER TABLE public.inspection_lots ADD CONSTRAINT inspection_lots_pkey PRIMARY KEY (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.job_orders ADD CONSTRAINT job_orders_pkey PRIMARY KEY (id);
ALTER TABLE public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
ALTER TABLE public.learning_log ADD CONSTRAINT learning_log_pkey PRIMARY KEY (id);
ALTER TABLE public.leave_applications ADD CONSTRAINT leave_applications_pkey PRIMARY KEY (id);
ALTER TABLE public.leave_types ADD CONSTRAINT leave_types_pkey PRIMARY KEY (id);
ALTER TABLE public.ledger ADD CONSTRAINT ledger_pkey PRIMARY KEY (id);
ALTER TABLE public.loans ADD CONSTRAINT loans_pkey PRIMARY KEY (id);
ALTER TABLE public.manual_count_sheets ADD CONSTRAINT manual_count_sheets_pkey PRIMARY KEY (id);
ALTER TABLE public.mapping_rules ADD CONSTRAINT mapping_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.morning_briefings ADD CONSTRAINT morning_briefings_pkey PRIMARY KEY (briefing_date);
ALTER TABLE public.ncr_claims ADD CONSTRAINT ncr_claims_pkey PRIMARY KEY (id);
ALTER TABLE public.ncr_events ADD CONSTRAINT ncr_events_pkey PRIMARY KEY (id);
ALTER TABLE public.ncr_remnants ADD CONSTRAINT ncr_remnants_pkey PRIMARY KEY (id);
ALTER TABLE public.ncr_reproductions ADD CONSTRAINT ncr_reproductions_pkey PRIMARY KEY (id);
ALTER TABLE public.overtimes ADD CONSTRAINT overtimes_pkey PRIMARY KEY (id);
ALTER TABLE public.owner_presence_state ADD CONSTRAINT owner_presence_state_pkey PRIMARY KEY (id);
ALTER TABLE public.pallet_rates ADD CONSTRAINT pallet_rates_pkey PRIMARY KEY (id);
ALTER TABLE public.pattern_library ADD CONSTRAINT pattern_library_pkey PRIMARY KEY (event_id);
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_pkey PRIMARY KEY (id);
ALTER TABLE public.payroll ADD CONSTRAINT payroll_pkey PRIMARY KEY (id);
ALTER TABLE public.perf_telemetry ADD CONSTRAINT perf_telemetry_pkey PRIMARY KEY (id);
ALTER TABLE public.performance_reviews ADD CONSTRAINT performance_reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.permissions ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);
ALTER TABLE public.petty_cash ADD CONSTRAINT petty_cash_pkey PRIMARY KEY (id);
ALTER TABLE public.predictive_alerts ADD CONSTRAINT predictive_alerts_pkey PRIMARY KEY (id);
ALTER TABLE public.price_list_items ADD CONSTRAINT price_list_items_pkey PRIMARY KEY (id);
ALTER TABLE public.price_lists ADD CONSTRAINT price_lists_pkey PRIMARY KEY (id);
ALTER TABLE public.production_pieces ADD CONSTRAINT production_pieces_pkey PRIMARY KEY (id);
ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE public.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
ALTER TABLE public.public_holidays ADD CONSTRAINT public_holidays_pkey PRIMARY KEY (id);
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);
ALTER TABLE public.quotations ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);
ALTER TABLE public.recurring_expenses ADD CONSTRAINT recurring_expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.remnant_history ADD CONSTRAINT remnant_history_pkey PRIMARY KEY (id);
ALTER TABLE public.remnants ADD CONSTRAINT remnants_pkey PRIMARY KEY (id);
ALTER TABLE public.requisitions ADD CONSTRAINT requisitions_pkey PRIMARY KEY (id);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);
ALTER TABLE public.roles ADD CONSTRAINT roles_pkey PRIMARY KEY (id);
ALTER TABLE public.saas_clients ADD CONSTRAINT saas_clients_pkey PRIMARY KEY (client_id);
ALTER TABLE public.scrap_disposals ADD CONSTRAINT scrap_disposals_pkey PRIMARY KEY (id);
ALTER TABLE public.shift_master ADD CONSTRAINT shift_master_pkey PRIMARY KEY (id);
ALTER TABLE public.sla_breaches ADD CONSTRAINT sla_breaches_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_ledger ADD CONSTRAINT stock_ledger_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_locations ADD CONSTRAINT stock_locations_pkey PRIMARY KEY (id);
ALTER TABLE public.store_items ADD CONSTRAINT store_items_pkey PRIMARY KEY (id);
ALTER TABLE public.tag_master ADD CONSTRAINT tag_master_pkey PRIMARY KEY (id);
ALTER TABLE public.tempering_dispatches ADD CONSTRAINT tempering_dispatches_pkey PRIMARY KEY (id);
ALTER TABLE public.tempering_oven_config ADD CONSTRAINT tempering_oven_config_pkey PRIMARY KEY (id);
ALTER TABLE public.unknown_log ADD CONSTRAINT unknown_log_pkey PRIMARY KEY (id);
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.vehicle_expenses ADD CONSTRAINT vehicle_expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.vehicle_locations ADD CONSTRAINT vehicle_locations_pkey PRIMARY KEY (vehicle_id, recorded_at);
ALTER TABLE public.vehicle_trips ADD CONSTRAINT vehicle_trips_pkey PRIMARY KEY (id);
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);
ALTER TABLE public.vendor_defect_reports ADD CONSTRAINT vendor_defect_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.vendor_rates ADD CONSTRAINT vendor_rates_pkey PRIMARY KEY (id);
ALTER TABLE public.vendor_reviews ADD CONSTRAINT vendor_reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.vendor_sla ADD CONSTRAINT vendor_sla_pkey PRIMARY KEY (id);
ALTER TABLE public.vendors ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);
ALTER TABLE public.warehouse_spots ADD CONSTRAINT warehouse_spots_pkey PRIMARY KEY (id);
ALTER TABLE public.wazir_conversations ADD CONSTRAINT wazir_conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.wazir_decisions ADD CONSTRAINT wazir_decisions_pkey PRIMARY KEY (id);
ALTER TABLE public.wazir_lessons ADD CONSTRAINT wazir_lessons_pkey PRIMARY KEY (id);
ALTER TABLE public.wazir_voice_samples ADD CONSTRAINT wazir_voice_samples_pkey PRIMARY KEY (id);
ALTER TABLE public.wazir_weekly_reports ADD CONSTRAINT wazir_weekly_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.weight_master ADD CONSTRAINT weight_master_pkey PRIMARY KEY (id);
ALTER TABLE public.whatsapp_log ADD CONSTRAINT whatsapp_log_pkey PRIMARY KEY (id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_pkey PRIMARY KEY (id);
ALTER TABLE public.agent_permissions ADD CONSTRAINT agent_permissions_agent_id_key UNIQUE (agent_id);
ALTER TABLE public.agent_rate_config ADD CONSTRAINT agent_rate_config_config_key_key UNIQUE (config_key);
ALTER TABLE public.agent_sessions ADD CONSTRAINT agent_sessions_user_id_company_session_date_key UNIQUE (user_id, company, session_date);
ALTER TABLE public.agent_table_access ADD CONSTRAINT agent_table_access_agent_name_table_name_key UNIQUE (agent_name, table_name);
ALTER TABLE public.alert_thresholds ADD CONSTRAINT alert_thresholds_company_key UNIQUE (company);
ALTER TABLE public.anomaly_thresholds ADD CONSTRAINT anomaly_thresholds_rule_key_key UNIQUE (rule_key);
ALTER TABLE public.company_branding ADD CONSTRAINT company_branding_company_key UNIQUE (company);
ALTER TABLE public.cutover_snapshot ADD CONSTRAINT cutover_snapshot_company_key UNIQUE (company);
ALTER TABLE public.dispatch_vehicles ADD CONSTRAINT uq_vehicle_plate UNIQUE (company, plate_number);
ALTER TABLE public.driver_licenses ADD CONSTRAINT uq_driver_licenses_cnic UNIQUE (company, cnic);
ALTER TABLE public.employee_docs ADD CONSTRAINT employee_docs_employee_id_doc_type_key UNIQUE (employee_id, doc_type);
ALTER TABLE public.fbr_config ADD CONSTRAINT fbr_config_company_key UNIQUE (company);
ALTER TABLE public.gratuity_balances ADD CONSTRAINT gratuity_unique UNIQUE (company, employee_id);
ALTER TABLE public.holidays ADD CONSTRAINT holidays_company_date UNIQUE (company, holiday_date);
ALTER TABLE public.leave_types ADD CONSTRAINT leave_types_leave_code_key UNIQUE (leave_code);
ALTER TABLE public.price_lists ADD CONSTRAINT price_lists_company_name_key UNIQUE (company, name);
ALTER TABLE public.public_holidays ADD CONSTRAINT public_holidays_company_holiday_date_name_key UNIQUE (company, holiday_date, name);
ALTER TABLE public.quotations ADD CONSTRAINT uk_quotations_company_order_no UNIQUE (company, order_no);
ALTER TABLE public.shift_master ADD CONSTRAINT shift_master_company_code UNIQUE (company, shift_code);
ALTER TABLE public.tempering_oven_config ADD CONSTRAINT tempering_oven_config_company_oven_id_key UNIQUE (company, oven_id);
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_operation_check CHECK ((operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])));
ALTER TABLE public.agent_audit_log ADD CONSTRAINT agent_audit_log_risk_score_check CHECK (((risk_score >= 0) AND (risk_score <= 10)));
ALTER TABLE public.agent_decisions ADD CONSTRAINT agent_decisions_feedback_check CHECK ((feedback = ANY (ARRAY['followed'::text, 'overridden'::text, 'dismissed'::text])));
ALTER TABLE public.agent_decisions ADD CONSTRAINT agent_decisions_outcome_check CHECK ((outcome = ANY (ARRAY['correct'::text, 'wrong'::text, 'partial'::text, 'pending'::text])));
ALTER TABLE public.agent_episodic_memory ADD CONSTRAINT agent_episodic_memory_decision_made_check CHECK ((decision_made = ANY (ARRAY['APPROVE'::text, 'REJECT'::text, 'APPROVE_WITH_CONDITIONS'::text, 'ESCALATE'::text, 'DEFER'::text])));
ALTER TABLE public.agent_episodic_memory ADD CONSTRAINT agent_episodic_memory_outcome_check CHECK ((outcome = ANY (ARRAY['success'::text, 'failure'::text, 'partial'::text, 'paid'::text, 'defaulted'::text, 'delayed'::text, 'cancelled'::text, 'pending'::text])));
ALTER TABLE public.agent_episodic_memory ADD CONSTRAINT agent_episodic_memory_agent_type_check CHECK ((agent_type = ANY (ARRAY['finance'::text, 'production'::text, 'ops'::text])));
ALTER TABLE public.agent_episodic_memory ADD CONSTRAINT agent_episodic_memory_owner_feedback_check CHECK ((owner_feedback = ANY (ARRAY['confirmed'::text, 'overridden'::text, 'amended'::text])));
ALTER TABLE public.agent_permissions ADD CONSTRAINT agent_permissions_permission_check CHECK ((permission = ANY (ARRAY['read'::text, 'write'::text, 'admin'::text])));
ALTER TABLE public.agent_procedural_memory ADD CONSTRAINT agent_procedural_memory_rule_type_check CHECK ((rule_type = ANY (ARRAY['hard_rule'::text, 'soft_rule'::text, 'guideline'::text])));
ALTER TABLE public.agent_procedural_memory ADD CONSTRAINT agent_procedural_memory_created_by_check CHECK ((created_by = ANY (ARRAY['owner'::text, 'system'::text, 'learned'::text])));
ALTER TABLE public.agent_procedural_memory ADD CONSTRAINT agent_procedural_memory_priority_check CHECK (((priority >= 1) AND (priority <= 10)));
ALTER TABLE public.agent_semantic_memory ADD CONSTRAINT agent_semantic_memory_fact_category_check CHECK ((fact_category = ANY (ARRAY['client_behavior'::text, 'vendor_reliability'::text, 'product_performance'::text, 'seasonal_pattern'::text, 'cost_trend'::text, 'quality_pattern'::text, 'operational'::text])));
ALTER TABLE public.anomaly_log ADD CONSTRAINT anomaly_log_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
ALTER TABLE public.bypass_log ADD CONSTRAINT bypass_log_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'In Progress'::text, 'Resolved'::text])));
ALTER TABLE public.bypass_log ADD CONSTRAINT bypass_log_module_check CHECK ((module = ANY (ARRAY['Finance'::text, 'HR'::text, 'Sales'::text, 'SCM'::text, 'Production'::text, 'HSE'::text, 'Admin'::text])));
ALTER TABLE public.clients ADD CONSTRAINT clients_fbr_buyer_type_check CHECK (((fbr_buyer_type IS NULL) OR (fbr_buyer_type = ANY (ARRAY['registered'::text, 'unregistered'::text, 'export'::text, 'exempt'::text, 'consumer'::text]))));
ALTER TABLE public.clients ADD CONSTRAINT ck_clients_mirror_company CHECK (((mirror_company IS NULL) OR (mirror_company = ANY (ARRAY['GTK'::text, 'GTI'::text, 'Glassco'::text, 'Nippon'::text, 'Factory'::text]))));
ALTER TABLE public.credit_notes ADD CONSTRAINT ck_credit_notes_status CHECK (((status IS NULL) OR (status = ANY (ARRAY['Posted'::text, 'Void'::text, 'Draft'::text]))));
ALTER TABLE public.customer_complaints ADD CONSTRAINT ck_customer_complaints_status CHECK (((status IS NULL) OR (status = ANY (ARRAY['Open'::text, 'In Progress'::text, 'Resolved'::text, 'Closed'::text, 'Rejected'::text]))));
ALTER TABLE public.cutover_snapshot ADD CONSTRAINT cutover_snapshot_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'locked'::text])));
ALTER TABLE public.cutting_sessions ADD CONSTRAINT cutting_sessions_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'Closed'::text])));
ALTER TABLE public.dispatch_photos ADD CONSTRAINT chk_dispatch_photos_type CHECK ((photo_type = ANY (ARRAY['GATE_OUT'::text, 'CUSTOMER_DELIVERY'::text, 'DAMAGE'::text, 'TEMPERING_HANDOFF'::text])));
ALTER TABLE public.dispatch_vehicles ADD CONSTRAINT dispatch_vehicles_max_payload_kg_check CHECK ((max_payload_kg > (0)::numeric));
ALTER TABLE public.employee_docs ADD CONSTRAINT employee_docs_status_check CHECK ((status = ANY (ARRAY['valid'::text, 'expired'::text, 'missing'::text])));
ALTER TABLE public.employee_docs ADD CONSTRAINT employee_docs_doc_type_check CHECK ((doc_type = ANY (ARRAY['photo'::text, 'cnic_front'::text, 'cnic_back'::text, 'police_verification'::text, 'job_letter'::text, 'contract'::text, 'other'::text])));
ALTER TABLE public.erp_alerts ADD CONSTRAINT erp_alerts_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])));
ALTER TABLE public.event_history ADD CONSTRAINT event_history_outcome_check CHECK ((outcome = ANY (ARRAY['approved'::text, 'rejected'::text, 'edited_approved'::text, 'auto_executed'::text, 'failed'::text])));
ALTER TABLE public.event_history ADD CONSTRAINT event_history_message_source_check CHECK ((message_source = ANY (ARRAY['text'::text, 'voice'::text, 'whatsapp'::text])));
ALTER TABLE public.fbr_config ADD CONSTRAINT fbr_config_fbr_environment_check CHECK ((fbr_environment = ANY (ARRAY['sandbox'::text, 'production'::text])));
ALTER TABLE public.gap_log ADD CONSTRAINT gap_log_priority_check CHECK ((priority = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text, 'Critical'::text])));
ALTER TABLE public.gap_log ADD CONSTRAINT gap_log_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'In Progress'::text, 'Resolved'::text, 'Wont Fix'::text])));
ALTER TABLE public.gl_entries_pending_approval ADD CONSTRAINT gl_entries_pending_approval_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.golive_checks ADD CONSTRAINT golive_checks_status_check CHECK ((status = ANY (ARRAY['pass'::text, 'warning'::text, 'fail'::text, 'skipped'::text])));
ALTER TABLE public.grn_sheet_entries ADD CONSTRAINT grn_sheet_entries_claim_status_check CHECK ((claim_status = ANY (ARRAY['Pending'::text, 'Sent'::text, 'Confirmed'::text, 'Disputed'::text])));
ALTER TABLE public.grn_sheet_entries ADD CONSTRAINT grn_sheet_entries_status_check CHECK ((status = ANY (ARRAY['OK'::text, 'Defective'::text, 'Broken'::text])));
ALTER TABLE public.grn_sheet_entries ADD CONSTRAINT grn_sheet_entries_defect_code_check CHECK ((defect_code = ANY (ARRAY[''::text, 'BR-01'::text, 'BR-02'::text, 'BR-03'::text, 'BR-04'::text, 'BR-05'::text])));
ALTER TABLE public.invoices ADD CONSTRAINT ck_invoices_status CHECK (((status IS NULL) OR (status = ANY (ARRAY['Outstanding'::text, 'Paid'::text, 'Partial'::text, 'Voided'::text, 'Draft'::text, 'Cancelled'::text]))));
ALTER TABLE public.invoices ADD CONSTRAINT invoices_fbr_status_check CHECK ((fbr_status = ANY (ARRAY['pending'::text, 'submitted'::text, 'verified'::text, 'rejected'::text, 'exempt'::text, 'na'::text])));
ALTER TABLE public.invoices ADD CONSTRAINT invoices_buyer_type_check CHECK (((buyer_type IS NULL) OR (buyer_type = ANY (ARRAY['registered'::text, 'unregistered'::text, 'export'::text, 'exempt'::text, 'consumer'::text]))));
ALTER TABLE public.learning_log ADD CONSTRAINT learning_log_owner_feedback_check CHECK ((owner_feedback = ANY (ARRAY['correct'::text, 'wrong_pattern'::text, 'wrong_steps'::text, 'missing_steps'::text, 'rejected'::text])));
ALTER TABLE public.manual_count_sheets ADD CONSTRAINT manual_count_sheets_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Submitted'::text, 'Reviewed'::text, 'Variance-NCR'::text])));
ALTER TABLE public.remnant_history ADD CONSTRAINT remnant_history_outcome_check CHECK ((outcome = ANY (ARRAY['Used'::text, 'Scrapped'::text])));
ALTER TABLE public.remnants ADD CONSTRAINT remnants_shape_check CHECK ((shape = ANY (ARRAY['Rectangle'::text, 'L-Shape'::text])));
ALTER TABLE public.remnants ADD CONSTRAINT remnants_status_check CHECK ((status = ANY (ARRAY['Available'::text, 'Reserved'::text, 'Used'::text, 'Scrapped'::text])));
ALTER TABLE public.saas_clients ADD CONSTRAINT saas_clients_tier_check CHECK ((tier = ANY (ARRAY['starter'::text, 'professional'::text, 'enterprise'::text])));
ALTER TABLE public.sla_breaches ADD CONSTRAINT chk_sla_breach_type CHECK ((breach_type = ANY (ARRAY['LATE_RETURN'::text, 'DAMAGED'::text, 'LOST'::text, 'INVOICE_MISMATCH'::text, 'LICENSE_EXPIRY'::text])));
ALTER TABLE public.store_items ADD CONSTRAINT unrestricted_qty_non_negative CHECK (((company = 'Nippon'::text) OR (unrestricted_qty >= (0)::numeric)));
ALTER TABLE public.store_items ADD CONSTRAINT qty_non_negative CHECK (((company = 'Nippon'::text) OR (quantity >= (0)::numeric)));
ALTER TABLE public.tempering_dispatches ADD CONSTRAINT chk_three_way_match_status CHECK (((three_way_match_status IS NULL) OR (three_way_match_status = ANY (ARRAY['Match'::text, 'Mismatch'::text, 'Pending'::text]))));
ALTER TABLE public.unknown_log ADD CONSTRAINT unknown_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'defined'::text, 'dismissed'::text])));
ALTER TABLE public.vendor_defect_reports ADD CONSTRAINT vendor_defect_reports_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Sent'::text, 'Verbally Confirmed'::text, 'Disputed'::text, 'Settled'::text])));
ALTER TABLE public.vendor_reviews ADD CONSTRAINT vendor_reviews_rating_check CHECK ((rating = ANY (ARRAY['Excellent'::text, 'Good'::text, 'Average'::text, 'Poor'::text, 'Blacklisted'::text])));
ALTER TABLE public.attendance ADD CONSTRAINT attendance_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.credit_notes ADD CONSTRAINT fk_credit_notes_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.credit_notes ADD CONSTRAINT fk_credit_notes_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE public.customer_complaints ADD CONSTRAINT fk_customer_complaints_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.customer_complaints ADD CONSTRAINT fk_customer_complaints_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE public.customer_signatures ADD CONSTRAINT fk_customer_signatures_dispatch FOREIGN KEY (dispatch_id) REFERENCES tempering_dispatches(id) ON DELETE CASCADE;
ALTER TABLE public.delivery_otps ADD CONSTRAINT fk_delivery_otps_dispatch FOREIGN KEY (dispatch_id) REFERENCES tempering_dispatches(id) ON DELETE CASCADE;
ALTER TABLE public.dispatch_events ADD CONSTRAINT fk_dispatch_event_dispatch FOREIGN KEY (dispatch_id) REFERENCES tempering_dispatches(id) ON DELETE CASCADE;
ALTER TABLE public.dispatch_photos ADD CONSTRAINT fk_dispatch_photos_dispatch FOREIGN KEY (dispatch_id) REFERENCES tempering_dispatches(id) ON DELETE CASCADE;
ALTER TABLE public.employee_roles ADD CONSTRAINT employee_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES quotations(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.loans ADD CONSTRAINT loans_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.payment_receipts ADD CONSTRAINT fk_payment_receipts_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE public.payroll ADD CONSTRAINT payroll_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.price_list_items ADD CONSTRAINT price_list_items_price_list_id_fkey FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.quotations ADD CONSTRAINT fk_quotations_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.requisitions ADD CONSTRAINT requisitions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE;
ALTER TABLE public.stock_ledger ADD CONSTRAINT stock_ledger_item_id_fkey FOREIGN KEY (item_id) REFERENCES store_items(id) ON DELETE CASCADE;
ALTER TABLE public.tempering_dispatches ADD CONSTRAINT fk_tempering_dispatches_gate_pass FOREIGN KEY (gate_pass_id) REFERENCES gate_passes(id) ON DELETE SET NULL;
-- ═══ 5/9 Indexes ═══

CREATE INDEX idx_dispatch_photos_dispatch ON public.dispatch_photos USING btree (dispatch_id, taken_at);
CREATE INDEX idx_dispatch_photos_company_date ON public.dispatch_photos USING btree (company, taken_at DESC);
CREATE INDEX idx_payroll_employee ON public.payroll USING btree (employee_id);
CREATE INDEX idx_up_employee_id ON public.user_profiles USING btree (employee_id);
CREATE INDEX idx_dispatches_company ON public.dispatches USING btree (company);
CREATE INDEX idx_activity_logs_co ON public.activity_logs USING btree (company);
CREATE INDEX idx_activity_logs_company ON public.activity_logs USING btree (company);
CREATE INDEX idx_activity_logs_level ON public.activity_logs USING btree (level);
CREATE INDEX idx_vehicle_locations_recent ON public.vehicle_locations USING btree (vehicle_id, recorded_at DESC);
CREATE INDEX idx_vehicle_locations_trip ON public.vehicle_locations USING btree (trip_id, recorded_at DESC) WHERE (trip_id IS NOT NULL);
CREATE INDEX idx_credit_notes_company ON public.credit_notes USING btree (company);
CREATE INDEX idx_credit_notes_invoice ON public.credit_notes USING btree (invoice_id);
CREATE INDEX idx_credit_notes_date ON public.credit_notes USING btree (date);
CREATE INDEX idx_credit_notes_invoice_id ON public.credit_notes USING btree (invoice_id);
CREATE INDEX idx_credit_notes_deleted_at ON public.credit_notes USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_company_branding_company ON public.company_branding USING btree (company);
CREATE INDEX idx_ncr_reproductions_ncr_id ON public.ncr_reproductions USING btree (ncr_id);
CREATE INDEX idx_ncr_reproductions_company ON public.ncr_reproductions USING btree (company);
CREATE INDEX idx_clients_status ON public.clients USING btree (company, status);
CREATE INDEX idx_clients_mirror_company ON public.clients USING btree (mirror_company) WHERE (mirror_company IS NOT NULL);
CREATE INDEX idx_clients_search ON public.clients USING gin (search_tsv);
CREATE INDEX idx_clients_strn ON public.clients USING btree (strn) WHERE (strn IS NOT NULL);
CREATE INDEX idx_clients_ntn ON public.clients USING btree (ntn) WHERE (ntn IS NOT NULL);
CREATE INDEX idx_clients_company ON public.clients USING btree (company);
CREATE INDEX idx_quotations_company ON public.quotations USING btree (company);
CREATE INDEX idx_quotations_client ON public.quotations USING btree (client_id);
CREATE INDEX idx_quotations_status ON public.quotations USING btree (status);
CREATE INDEX idx_quotations_order_no ON public.quotations USING btree (order_no);
CREATE INDEX idx_quotations_date ON public.quotations USING btree (date);
CREATE INDEX idx_quotations_company_date ON public.quotations USING btree (company, date);
CREATE INDEX idx_quotations_order_type ON public.quotations USING btree (order_type) WHERE (order_type <> 'Standard'::text);
CREATE INDEX idx_quotations_original_order_ref ON public.quotations USING btree (original_order_ref) WHERE (original_order_ref IS NOT NULL);
CREATE INDEX idx_quotations_search ON public.quotations USING gin (search_tsv);
CREATE INDEX idx_quotations_deleted_at ON public.quotations USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_quotations_company_updated ON public.quotations USING btree (company, updated_at DESC);
CREATE INDEX idx_quotations_company_status ON public.quotations USING btree (company, status);
CREATE INDEX idx_cutting_sessions_company ON public.cutting_sessions USING btree (company);
CREATE INDEX idx_cutting_sessions_job_order ON public.cutting_sessions USING btree (job_order_id);
CREATE INDEX idx_cutting_sessions_cutter ON public.cutting_sessions USING btree (cutter_id);
CREATE INDEX idx_remnant_history_company ON public.remnant_history USING btree (company);
CREATE INDEX idx_remnant_history_thickness ON public.remnant_history USING btree (thickness);
CREATE INDEX idx_remnant_history_outcome ON public.remnant_history USING btree (outcome);
CREATE INDEX idx_grn_sheet_entries_grn_id ON public.grn_sheet_entries USING btree (grn_id);
CREATE INDEX idx_grn_sheet_entries_tag_id ON public.grn_sheet_entries USING btree (tag_id);
CREATE INDEX idx_grn_sheet_entries_company ON public.grn_sheet_entries USING btree (company);
CREATE INDEX idx_grn_sheet_entries_company_unconsumed ON public.grn_sheet_entries USING btree (company, tag_id) WHERE (consumed_in_session_id IS NULL);
CREATE UNIQUE INDEX idx_grn_sheet_entries_consumed_unique ON public.grn_sheet_entries USING btree (company, tag_id) WHERE (consumed_in_session_id IS NOT NULL);
CREATE INDEX idx_ncr_remnants_company ON public.ncr_remnants USING btree (company);
CREATE INDEX idx_ncr_claims_vendor_id ON public.ncr_claims USING btree (vendor_id);
CREATE INDEX idx_ncr_claims_company ON public.ncr_claims USING btree (company);
CREATE INDEX idx_stock_ledger_co_item_date ON public.stock_ledger USING btree (company, item_id, posting_date DESC);
CREATE INDEX idx_stock_ledger_company ON public.stock_ledger USING btree (company);
CREATE INDEX idx_ledger_created_by ON public.ledger USING btree (created_by);
CREATE INDEX idx_ledger_posted_at ON public.ledger USING btree (posted_at);
CREATE INDEX idx_ledger_company_date ON public.ledger USING btree (company, date) WHERE (status = 'Posted'::text);
CREATE INDEX idx_ledger_ref ON public.ledger USING btree (reference_id) WHERE (reference_id IS NOT NULL);
CREATE INDEX idx_ledger_deleted_at ON public.ledger USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_ledger_company ON public.ledger USING btree (company);
CREATE INDEX idx_employee_docs_employee_id ON public.employee_docs USING btree (employee_id);
CREATE INDEX idx_employee_docs_expiry ON public.employee_docs USING btree (expiry_date) WHERE (expiry_date IS NOT NULL);
CREATE INDEX idx_employee_docs_status ON public.employee_docs USING btree (status);
CREATE INDEX idx_er_employee ON public.employee_roles USING btree (employee_id);
CREATE INDEX idx_er_role ON public.employee_roles USING btree (role_id);
CREATE UNIQUE INDEX idx_er_unique ON public.employee_roles USING btree (employee_id, role_id);
CREATE INDEX idx_activity_log_table_row ON public.activity_log USING btree (table_name, row_id);
CREATE INDEX idx_activity_log_company_date ON public.activity_log USING btree (company, changed_at DESC);
CREATE INDEX idx_activity_log_changed_by ON public.activity_log USING btree (changed_by, changed_at DESC);
CREATE INDEX idx_store_company ON public.store_items USING btree (company);
CREATE INDEX idx_store_items_company ON public.store_items USING btree (company);
CREATE INDEX idx_ncr_events_status ON public.ncr_events USING btree (status);
CREATE INDEX idx_ncr_events_piece_id ON public.ncr_events USING btree (piece_id);
CREATE INDEX idx_ncr_events_company ON public.ncr_events USING btree (company);
CREATE INDEX idx_products_company ON public.products USING btree (company);
CREATE INDEX idx_al_user ON public.access_logs USING btree (user_id);
CREATE INDEX idx_al_created ON public.access_logs USING btree (created_at DESC);
CREATE INDEX idx_cutover_snapshot_company ON public.cutover_snapshot USING btree (company);
CREATE INDEX idx_csv_import_logs_company_type ON public.csv_import_logs USING btree (company, import_type);
CREATE INDEX idx_csv_import_logs_imported_at ON public.csv_import_logs USING btree (imported_at DESC);
CREATE INDEX idx_customer_complaints_company ON public.customer_complaints USING btree (company);
CREATE INDEX idx_customer_complaints_client ON public.customer_complaints USING btree (client_id);
CREATE INDEX idx_customer_complaints_invoice ON public.customer_complaints USING btree (invoice_id);
CREATE INDEX idx_customer_complaints_status ON public.customer_complaints USING btree (company, status);
CREATE INDEX idx_customer_complaints_date ON public.customer_complaints USING btree (date);
CREATE INDEX idx_customer_complaints_client_id ON public.customer_complaints USING btree (client_id);
CREATE INDEX idx_customer_complaints_invoice_id ON public.customer_complaints USING btree (invoice_id);
CREATE INDEX job_orders_company_idx ON public.job_orders USING btree (company);
CREATE INDEX idx_loans_employee ON public.loans USING btree (employee_id);
CREATE INDEX idx_perf_telemetry_metric_time ON public.perf_telemetry USING btree (metric, recorded_at DESC);
CREATE INDEX idx_perf_telemetry_label_time ON public.perf_telemetry USING btree (label, recorded_at DESC);
CREATE INDEX idx_dispatch_events_dispatch ON public.dispatch_events USING btree (dispatch_id, occurred_at);
CREATE INDEX idx_dispatch_events_company_date ON public.dispatch_events USING btree (company, occurred_at DESC);
CREATE INDEX idx_dispatch_events_type ON public.dispatch_events USING btree (event_type, occurred_at DESC);
CREATE INDEX idx_price_lists_company ON public.price_lists USING btree (company, is_active);
CREATE INDEX idx_price_list_items_pl ON public.price_list_items USING btree (price_list_id);
CREATE INDEX idx_price_list_items_lookup ON public.price_list_items USING btree (company, glass_type, thickness, service_nick);
CREATE INDEX idx_work_orders_company ON public.work_orders USING btree (company);
CREATE INDEX idx_work_orders_sales_order_id ON public.work_orders USING btree (sales_order_id);
CREATE INDEX idx_work_orders_status ON public.work_orders USING btree (company, status);
CREATE INDEX idx_tempering_overdue ON public.tempering_dispatches USING btree (expected_return_date) WHERE (actual_return_date IS NULL);
CREATE INDEX idx_tempering_returned_dates ON public.tempering_dispatches USING btree (actual_return_date) WHERE (actual_return_date IS NOT NULL);
CREATE INDEX idx_tempering_dispatches_gate_pass ON public.tempering_dispatches USING btree (gate_pass_id) WHERE (gate_pass_id IS NOT NULL);
CREATE INDEX idx_tempering_dispatches_3way ON public.tempering_dispatches USING btree (three_way_match_status) WHERE (three_way_match_status = ANY (ARRAY['Mismatch'::text, 'Pending'::text]));
CREATE UNIQUE INDEX idx_tempering_dispatches_token ON public.tempering_dispatches USING btree (driver_token) WHERE (driver_token IS NOT NULL);
CREATE INDEX idx_tempering_expected_return ON public.tempering_dispatches USING btree (expected_return_date) WHERE (expected_return_date IS NOT NULL);
CREATE INDEX idx_tempering_dispatches_company ON public.tempering_dispatches USING btree (company);
CREATE INDEX idx_leads_company ON public.leads USING btree (company);
CREATE INDEX idx_leads_stage ON public.leads USING btree (company, stage);
CREATE INDEX idx_leads_client ON public.leads USING btree (client_id);
CREATE INDEX idx_customer_signatures_dispatch ON public.customer_signatures USING btree (dispatch_id, signed_at);
CREATE INDEX idx_customer_signatures_company_date ON public.customer_signatures USING btree (company, signed_at DESC);
CREATE INDEX idx_delivery_otps_dispatch_active ON public.delivery_otps USING btree (dispatch_id, verified, expires_at) WHERE (verified = false);
CREATE INDEX idx_driver_licenses_company ON public.driver_licenses USING btree (company) WHERE (is_active = true);
CREATE INDEX idx_driver_licenses_expiry ON public.driver_licenses USING btree (license_expiry, permit_expiry) WHERE (is_active = true);
CREATE INDEX idx_sla_breaches_vendor ON public.sla_breaches USING btree (vendor_name, detected_at DESC);
CREATE INDEX idx_sla_breaches_company_unresolved ON public.sla_breaches USING btree (company, detected_at DESC) WHERE (resolved = false);
CREATE INDEX idx_erp_alerts_company_unread ON public.erp_alerts USING btree (company, is_read, is_dismissed, created_at DESC);
CREATE INDEX idx_erp_alerts_type_ref ON public.erp_alerts USING btree (type, reference_id) WHERE (is_dismissed = false);
CREATE UNIQUE INDEX idx_erp_alerts_daily_dedup ON public.erp_alerts USING btree (company, type, reference_id, erp_alerts_dedup_date(created_at)) WHERE ((reference_id IS NOT NULL) AND (is_dismissed = false));
CREATE INDEX idx_payment_receipts_invoice_id ON public.payment_receipts USING btree (invoice_id);
CREATE INDEX idx_payment_receipts_company_date ON public.payment_receipts USING btree (company, date);
CREATE INDEX idx_payment_receipts_deleted_at ON public.payment_receipts USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_payment_receipts_company ON public.payment_receipts USING btree (company);
CREATE INDEX idx_production_order ON public.production_pieces USING btree (order_id);
CREATE INDEX production_pieces_company_idx ON public.production_pieces USING btree (company);
CREATE INDEX idx_pieces_company_status_order ON public.production_pieces USING btree (company, status, order_id);
CREATE INDEX idx_pieces_dispatch_id ON public.production_pieces USING btree (((data ->> 'dispatchId'::text))) WHERE ((data ->> 'dispatchId'::text) IS NOT NULL);
CREATE INDEX idx_pieces_updated_at ON public.production_pieces USING btree (updated_at DESC);
CREATE UNIQUE INDEX idx_pieces_active_dispatch ON public.production_pieces USING btree (((data ->> 'dispatchId'::text))) WHERE (((data ->> 'dispatchId'::text) IS NOT NULL) AND ((data ->> 'status'::text) = ANY (ARRAY['Dispatched'::text, 'Tempered'::text, 'Received-From-Tempering'::text])));
CREATE INDEX idx_production_pieces_co_status ON public.production_pieces USING btree (company, status, updated_at DESC);
CREATE INDEX idx_production_pieces_order ON public.production_pieces USING btree (order_id);
CREATE INDEX idx_production_pieces_active ON public.production_pieces USING btree (updated_at DESC) WHERE (status <> ALL (ARRAY['dispatched'::text, 'cancelled'::text, 'ncr'::text]));
CREATE INDEX idx_production_pieces_company ON public.production_pieces USING btree (company);
CREATE INDEX idx_petty_cash_deleted_at ON public.petty_cash USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_manual_count_company ON public.manual_count_sheets USING btree (company);
CREATE INDEX idx_manual_count_date ON public.manual_count_sheets USING btree (count_date);
CREATE INDEX idx_costcenters_company ON public.cost_centers USING btree (company);
CREATE INDEX idx_golive_company_key_ran ON public.golive_checks USING btree (company, check_key, ran_at DESC);
CREATE INDEX idx_golive_status ON public.golive_checks USING btree (status, ran_at DESC) WHERE (status = ANY (ARRAY['warning'::text, 'fail'::text]));
CREATE INDEX idx_accounts_company ON public.accounts USING btree (company);
CREATE UNIQUE INDEX accounts_company_code_uidx ON public.accounts USING btree (company, code);
CREATE INDEX idx_accounts_company_code ON public.accounts USING btree (company, code);
CREATE INDEX idx_accounts_company_type ON public.accounts USING btree (company, type);
CREATE INDEX idx_attendance_employee ON public.attendance USING btree (employee_id);
CREATE INDEX idx_attendance_date ON public.attendance USING btree (date);
CREATE INDEX idx_attendance_company_date ON public.attendance USING btree (company, date);
CREATE INDEX idx_requisitions_company ON public.requisitions USING btree (company);
CREATE INDEX idx_requisitions_status ON public.requisitions USING btree (status);
CREATE INDEX idx_vendor_reviews_company ON public.vendor_reviews USING btree (company);
CREATE INDEX idx_vendor_reviews_vendor ON public.vendor_reviews USING btree (vendor_id);
CREATE INDEX idx_remnants_company ON public.remnants USING btree (company);
CREATE INDEX idx_remnants_status ON public.remnants USING btree (status);
CREATE INDEX idx_remnants_thickness ON public.remnants USING btree (thickness);
CREATE INDEX idx_remnants_material ON public.remnants USING btree (material_id);
CREATE INDEX idx_scrap_disposals_company ON public.scrap_disposals USING btree (company);
CREATE INDEX idx_scrap_disposals_date ON public.scrap_disposals USING btree (disposal_date);
CREATE INDEX idx_vdr_company ON public.vendor_defect_reports USING btree (company);
CREATE INDEX idx_vdr_grn_id ON public.vendor_defect_reports USING btree (grn_id);
CREATE INDEX idx_vdr_vendor ON public.vendor_defect_reports USING btree (vendor_id);
CREATE INDEX idx_vendors_search ON public.vendors USING gin (search_tsv);
CREATE INDEX idx_vendors_company ON public.vendors USING btree (company);
CREATE INDEX idx_rp_role ON public.role_permissions USING btree (role_id);
CREATE UNIQUE INDEX idx_rp_unique ON public.role_permissions USING btree (role_id, permission_id);
CREATE INDEX idx_invoices_company ON public.invoices USING btree (company);
CREATE INDEX idx_invoices_client_id ON public.invoices USING btree (client_id);
CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);
CREATE INDEX idx_invoices_order_id ON public.invoices USING btree (order_id);
CREATE INDEX idx_invoices_client_status ON public.invoices USING btree (client_id, status);
CREATE INDEX idx_invoices_date ON public.invoices USING btree (date);
CREATE INDEX idx_invoices_company_id ON public.invoices USING btree (company, id);
CREATE INDEX idx_invoices_company_date ON public.invoices USING btree (company, date);
CREATE INDEX idx_invoices_gl_tx_id ON public.invoices USING btree (gl_tx_id);
CREATE INDEX idx_invoices_created_by ON public.invoices USING btree (created_by);
CREATE INDEX idx_invoices_search ON public.invoices USING gin (search_tsv);
CREATE INDEX idx_invoices_deleted_at ON public.invoices USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_invoices_fbr_status ON public.invoices USING btree (fbr_status) WHERE (fbr_status = ANY (ARRAY['pending'::text, 'rejected'::text]));
CREATE INDEX idx_invoices_buyer_strn ON public.invoices USING btree (buyer_strn) WHERE (buyer_strn IS NOT NULL);
CREATE UNIQUE INDEX idx_perm_unique ON public.permissions USING btree (module, action, scope);
CREATE INDEX idx_roles_company ON public.roles USING btree (company);
-- ═══ 6/9 Functions ═══

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.current_user_companies()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(allowed_companies, ARRAY[]::text[])
  FROM public.user_profiles WHERE id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.current_user_is_group_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT role IN ('super_admin','owner','hassan')
       FROM public.user_profiles WHERE id = auth.uid()),
    false)
$function$
;

CREATE OR REPLACE FUNCTION public.consume_grn_sheet(p_tag_id text, p_session_id text, p_company text, p_consumed_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row grn_sheet_entries%ROWTYPE;
BEGIN
  -- Lock the row, fail loudly if already consumed
  SELECT * INTO v_row
  FROM grn_sheet_entries
  WHERE tag_id = p_tag_id
    AND company = p_company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sheet_not_found: %', p_tag_id;
  END IF;

  IF v_row.consumed_in_session_id IS NOT NULL
     AND v_row.consumed_in_session_id <> p_session_id THEN
    RAISE EXCEPTION 'sheet_already_consumed: % (session %)',
      p_tag_id, v_row.consumed_in_session_id;
  END IF;

  UPDATE grn_sheet_entries
  SET consumed_in_session_id = p_session_id,
      consumed_at = now(),
      consumed_by = p_consumed_by,
      data = data || jsonb_build_object(
        'consumedInSessionId', p_session_id,
        'consumedAt', now(),
        'consumedBy', p_consumed_by
      )
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'tag_id', v_row.tag_id,
    'thickness', v_row.data->>'thickness',
    'sheet_size', v_row.data->>'sheetSize',
    'sqft_per_sheet', (v_row.data->>'sqftPerSheet')::numeric,
    'status', v_row.data->>'status',
    'session_id', p_session_id
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.process_payment_receipt(receipt_data jsonb, p_invoice_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice             RECORD;
  v_new_received_amount NUMERIC(15,2);
  v_new_balance         NUMERIC(15,2);
  v_receipt_id          TEXT;
  v_receipt_amount      NUMERIC(15,2);
  v_caller_company      TEXT;
BEGIN
  -- Resolve caller's company (NULL when user_profiles empty / single-user)
  BEGIN
    SELECT company INTO v_caller_company
    FROM   user_profiles
    WHERE  id = auth.uid()
    LIMIT  1;
  EXCEPTION WHEN OTHERS THEN
    v_caller_company := NULL;
  END;

  -- Lock invoice row to serialise concurrent receipts
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SAL-4: Invoice "%" not found', p_invoice_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Cross-company guard ONLY when caller company is known
  IF v_caller_company IS NOT NULL
     AND v_invoice.company IS DISTINCT FROM v_caller_company THEN
    RAISE EXCEPTION 'SAL-4: Cross-company receipt denied — invoice company "%" ≠ caller company "%"',
      v_invoice.company, v_caller_company
      USING ERRCODE = 'P0003';
  END IF;

  v_receipt_amount      := (receipt_data->>'amount')::NUMERIC(15,2);
  v_new_received_amount := COALESCE(v_invoice.received_amount, 0) + v_receipt_amount;
  v_new_balance         := COALESCE(v_invoice.total_amount, 0) - v_new_received_amount;

  -- Reject over-payment beyond PKR 1 tolerance
  IF v_new_balance < -1 THEN
    RAISE EXCEPTION 'SAL-4: Receipt PKR % would over-pay invoice "%" (balance: PKR %, overpay: PKR %)',
      v_receipt_amount, p_invoice_id,
      COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.received_amount, 0),
      ABS(v_new_balance)
      USING ERRCODE = 'P0004';
  END IF;

  v_receipt_id := COALESCE(receipt_data->>'id', gen_random_uuid()::TEXT);

  INSERT INTO payment_receipts (
    id, invoice_id, company,
    date, amount, method, reference, gl_tx_id,
    created_by, updated_at
  ) VALUES (
    v_receipt_id,
    p_invoice_id,
    v_invoice.company,
    NULLIF(receipt_data->>'date','')::DATE,
    v_receipt_amount,
    receipt_data->>'method',
    receipt_data->>'reference',
    receipt_data->>'gl_tx_id',
    receipt_data->>'created_by',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    amount     = EXCLUDED.amount,
    method     = EXCLUDED.method,
    reference  = EXCLUDED.reference,
    updated_at = now();

  -- Atomic invoice update in same transaction
  UPDATE invoices
  SET
    received_amount = v_new_received_amount,
    balance         = GREATEST(0, v_new_balance),
    status          = CASE
                        WHEN v_new_balance <= 0          THEN 'Paid'
                        WHEN v_new_received_amount > 0   THEN 'Partial'
                        ELSE COALESCE(v_invoice.status,'Outstanding')
                      END,
    updated_at      = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'receipt_id',          v_receipt_id,
    'invoice_id',          p_invoice_id,
    'new_received_amount', v_new_received_amount,
    'new_balance',         GREATEST(0, v_new_balance),
    'status',              CASE WHEN v_new_balance <= 0        THEN 'Paid'
                                WHEN v_new_received_amount > 0 THEN 'Partial'
                                ELSE COALESCE(v_invoice.status, 'Outstanding') END
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.allocate_serial(p_company text, p_doc_type text, p_year integer, p_min_seed integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next INT;
BEGIN
  INSERT INTO doc_serials (company, doc_type, year, next_seq)
  VALUES (p_company, p_doc_type, p_year, GREATEST(p_min_seed, 1))
  ON CONFLICT (company, doc_type, year)
  DO UPDATE
    SET next_seq   = GREATEST(doc_serials.next_seq + 1, EXCLUDED.next_seq),
        updated_at = now()
  RETURNING next_seq INTO v_next;
  RETURN v_next;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.assert_ledger_balance(p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_debit  NUMERIC := 0;
  v_credit NUMERIC := 0;
  v_diff   NUMERIC;
BEGIN
  IF p_details IS NULL OR jsonb_typeof(p_details) <> 'array' THEN
    RAISE EXCEPTION 'ledger_imbalance: details must be a JSONB array';
  END IF;

  SELECT
    COALESCE(SUM((d->>'debit')::NUMERIC), 0),
    COALESCE(SUM((d->>'credit')::NUMERIC), 0)
  INTO v_debit, v_credit
  FROM jsonb_array_elements(p_details) d;

  v_diff := ABS(v_debit - v_credit);
  -- Tolerate sub-rupee FP drift; >= 0.01 PKR is a real imbalance.
  IF v_diff >= 0.01 THEN
    RAISE EXCEPTION 'ledger_imbalance: debit=% credit=% diff=%',
      v_debit, v_credit, v_diff;
  END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public._insert_ledger_row(p_row jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO ledger (
    id, company, doc_type, doc_date, date, description,
    reference_id, status, details, data,
    drafted_by, approved_by, jv_approved_at,
    created_by, updated_by, posted_at, updated_at
  )
  VALUES (
    p_row->>'id',
    p_row->>'company',
    p_row->>'doc_type',
    p_row->>'doc_date',
    p_row->>'date',
    p_row->>'description',
    p_row->>'reference_id',
    p_row->>'status',
    COALESCE(p_row->'details', '[]'::JSONB),
    COALESCE(p_row->'data',    '{}'::JSONB),
    p_row->>'drafted_by',
    p_row->>'approved_by',
    NULLIF(p_row->>'jv_approved_at','')::TIMESTAMPTZ,
    p_row->>'created_by',
    p_row->>'updated_by',
    NULLIF(p_row->>'posted_at','')::TIMESTAMPTZ,
    COALESCE(NULLIF(p_row->>'updated_at','')::TIMESTAMPTZ, now())
  )
  ON CONFLICT (id) DO NOTHING;
END $function$
;

CREATE OR REPLACE FUNCTION public.post_invoice_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company     TEXT  := p_payload->>'company';
  v_inv         JSONB := p_payload->'invoice_row';
  v_main        JSONB := p_payload->'main_ledger_row';
  v_cogs        JSONB := p_payload->'cogs_ledger_row';
  v_mirror      JSONB := p_payload->'mirror_ledger_row';
  v_quote       JSONB := p_payload->'quotation_patch';
  v_invoice_id  TEXT;
  v_existing    INT;
  v_quote_id    TEXT;
BEGIN
  -- Validate
  IF v_company IS NULL OR v_inv IS NULL OR v_main IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: company, invoice_row, main_ledger_row required';
  END IF;

  v_invoice_id := v_inv->>'id';
  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: invoice_row.id required';
  END IF;

  -- Reject duplicate invoice (idempotency guard)
  SELECT 1 INTO v_existing FROM invoices WHERE id = v_invoice_id;
  IF FOUND THEN
    RAISE EXCEPTION 'invoice_already_exists: %', v_invoice_id;
  END IF;

  -- Pre-flight balance check on every ledger row
  PERFORM assert_ledger_balance(v_main->'details');
  IF v_cogs   IS NOT NULL AND v_cogs   <> 'null'::JSONB THEN
    PERFORM assert_ledger_balance(v_cogs->'details');
  END IF;
  IF v_mirror IS NOT NULL AND v_mirror <> 'null'::JSONB THEN
    PERFORM assert_ledger_balance(v_mirror->'details');
  END IF;

  -- 1. Main ledger (AR/Revenue/GST)
  PERFORM _insert_ledger_row(v_main);

  -- 2. Invoice row — flat columns
  INSERT INTO invoices (
    id, company, order_id, order_no, client_id, client_name,
    date, due_date, total_amount, received_amount, balance,
    status, gl_tx_id, payments, items, service_charges,
    project_name, discount_amount, gst_percent, gst_amount,
    data, updated_at
  )
  VALUES (
    v_inv->>'id',
    v_inv->>'company',
    v_inv->>'order_id',
    v_inv->>'order_no',
    v_inv->>'client_id',
    v_inv->>'client_name',
    NULLIF(v_inv->>'date','')::DATE,
    NULLIF(v_inv->>'due_date','')::DATE,
    NULLIF(v_inv->>'total_amount','')::NUMERIC,
    NULLIF(v_inv->>'received_amount','')::NUMERIC,
    NULLIF(v_inv->>'balance','')::NUMERIC,
    v_inv->>'status',
    v_inv->>'gl_tx_id',
    COALESCE(v_inv->'payments',         '[]'::JSONB),
    COALESCE(v_inv->'items',            '[]'::JSONB),
    COALESCE(v_inv->'service_charges',  '[]'::JSONB),
    v_inv->>'project_name',
    COALESCE(NULLIF(v_inv->>'discount_amount','')::NUMERIC, 0),
    COALESCE(NULLIF(v_inv->>'gst_percent','')::NUMERIC, 0),
    COALESCE(NULLIF(v_inv->>'gst_amount','')::NUMERIC, 0),
    COALESCE(v_inv->'data', '{}'::JSONB),
    now()
  );

  -- 3. Quotation patch (mark Invoiced) — merges into data JSONB
  IF v_quote IS NOT NULL AND v_quote <> 'null'::JSONB THEN
    v_quote_id := v_quote->>'id';
    UPDATE quotations
    SET data       = COALESCE(data, '{}'::JSONB) || COALESCE(v_quote->'patch', '{}'::JSONB),
        updated_at = now()
    WHERE id = v_quote_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quotation_not_found: %', v_quote_id;
    END IF;
  END IF;

  -- 4. COGS ledger (optional — pure-service invoices skip it)
  IF v_cogs IS NOT NULL AND v_cogs <> 'null'::JSONB THEN
    PERFORM _insert_ledger_row(v_cogs);
  END IF;

  -- 5. Mirror ledger (optional — intercompany BILL on target company books)
  IF v_mirror IS NOT NULL AND v_mirror <> 'null'::JSONB THEN
    PERFORM _insert_ledger_row(v_mirror);
  END IF;

  RETURN jsonb_build_object(
    'invoice_id',    v_invoice_id,
    'main_tx_id',    v_main->>'id',
    'cogs_tx_id',    v_cogs->>'id',
    'mirror_tx_id',  v_mirror->>'id'
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.consume_glass_stock(p_company text, p_session_id text, p_consumption jsonb, p_gl_row jsonb, p_stock_rows jsonb, p_session_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item            RECORD;
  v_material_id     TEXT;
  v_consumed_qty    NUMERIC;
  v_on_hand         NUMERIC;
  v_new_unr         NUMERIC;
  v_new_qty         NUMERIC;
  v_gl_id           TEXT  := p_gl_row->>'id';
  v_stock_row       JSONB;
  v_existing_gl     INT;
BEGIN
  IF p_company IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: company + session_id required';
  END IF;

  -- Idempotency: reject if GL already posted for this session
  IF v_gl_id IS NOT NULL THEN
    SELECT 1 INTO v_existing_gl FROM ledger WHERE id = v_gl_id;
    IF FOUND THEN
      RAISE EXCEPTION 'gl_already_posted: %', v_gl_id;
    END IF;
  END IF;

  -- Pre-flight balance check
  IF p_gl_row IS NOT NULL AND p_gl_row <> 'null'::JSONB THEN
    PERFORM assert_ledger_balance(p_gl_row->'details');
  END IF;

  -- ── 1. Lock + validate + decrement each material ─────────────────
  IF p_consumption IS NOT NULL AND p_consumption <> 'null'::JSONB THEN
    FOR v_item IN
      SELECT
        (c->>'material_id')::TEXT AS material_id,
        (c->>'qty')::NUMERIC      AS qty
      FROM jsonb_array_elements(p_consumption) c
    LOOP
      v_material_id  := v_item.material_id;
      v_consumed_qty := v_item.qty;

      -- Pessimistic lock — block concurrent sessions on the same row
      PERFORM 1 FROM store_items
        WHERE id = v_material_id AND company = p_company
        FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'material_not_found: %', v_material_id;
      END IF;

      SELECT
        COALESCE((data->>'unrestrictedQty')::NUMERIC, (data->>'quantity')::NUMERIC, 0)
      INTO v_on_hand
      FROM store_items
      WHERE id = v_material_id AND company = p_company;

      IF v_consumed_qty > v_on_hand THEN
        RAISE EXCEPTION 'insufficient_stock: % needs % but only % on-hand',
          v_material_id, v_consumed_qty, v_on_hand;
      END IF;

      v_new_unr := COALESCE((SELECT (data->>'unrestrictedQty')::NUMERIC
                             FROM store_items WHERE id = v_material_id), 0) - v_consumed_qty;
      v_new_qty := COALESCE((SELECT (data->>'quantity')::NUMERIC
                             FROM store_items WHERE id = v_material_id), 0) - v_consumed_qty;

      UPDATE store_items
      SET data = COALESCE(data, '{}'::JSONB) || jsonb_build_object(
                    'unrestrictedQty', v_new_unr,
                    'quantity',        v_new_qty,
                    'lastMovementDate', to_char(now(), 'YYYY-MM-DD')
                  ),
          updated_at = now()
      WHERE id = v_material_id AND company = p_company;
    END LOOP;
  END IF;

  -- ── 2. Insert stock_ledger audit rows ─────────────────────────────
  IF p_stock_rows IS NOT NULL AND p_stock_rows <> 'null'::JSONB THEN
    FOR v_stock_row IN SELECT * FROM jsonb_array_elements(p_stock_rows)
    LOOP
      INSERT INTO stock_ledger (id, company, data, updated_at)
      VALUES (
        v_stock_row->>'id',
        COALESCE(v_stock_row->>'company', p_company),
        COALESCE(v_stock_row->'data', '{}'::JSONB),
        now()
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END IF;

  -- ── 3. Post GL (Dr WIP / Cr Glass Inventory) ──────────────────────
  IF p_gl_row IS NOT NULL AND p_gl_row <> 'null'::JSONB THEN
    PERFORM _insert_ledger_row(p_gl_row);
  END IF;

  -- ── 4. Update cutting_sessions row → Closed ───────────────────────
  IF p_session_row IS NOT NULL AND p_session_row <> 'null'::JSONB THEN
    INSERT INTO cutting_sessions (id, company, data, updated_at)
    VALUES (
      p_session_row->>'id',
      p_company,
      COALESCE(p_session_row->'data', '{}'::JSONB),
      now()
    )
    ON CONFLICT (id) DO UPDATE
    SET data       = COALESCE(cutting_sessions.data, '{}'::JSONB)
                       || COALESCE(EXCLUDED.data, '{}'::JSONB),
        updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'gl_tx_id',   v_gl_id
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.sync_version_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_jsonb_version INT;
  v_has_data BOOLEAN;
BEGIN
  -- Defensive: NEW.data may not exist if the trigger is attached to a
  -- thin table. We still want to keep `version` populated for FOR UPDATE
  -- locks the RPC depends on.
  BEGIN
    v_jsonb_version := NULLIF(NEW.data->>'version', '')::INT;
    v_has_data := TRUE;
  EXCEPTION WHEN undefined_column THEN
    v_jsonb_version := NULL;
    v_has_data := FALSE;
  END;

  IF v_jsonb_version IS NOT NULL THEN
    NEW.version := v_jsonb_version;
  ELSIF NEW.version IS NULL THEN
    NEW.version := 1;
  END IF;

  IF v_has_data THEN
    NEW.data := COALESCE(NEW.data, '{}'::JSONB)
                  || jsonb_build_object('version', NEW.version);
  END IF;

  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.update_with_version(p_table text, p_id text, p_patch jsonb, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_current   INT;
  v_new       INT;
  v_row       JSONB;
  v_query     TEXT;
  v_has_data  BOOLEAN;
BEGIN
  IF p_table NOT IN (
    'quotations', 'invoices', 'products', 'store_items',
    'clients', 'production_pieces'
  ) THEN
    RAISE EXCEPTION 'invalid_table: % (not version-controlled)', p_table;
  END IF;

  -- Lock + read current version from FLAT column
  v_query := format(
    'SELECT COALESCE(version, 1) FROM %I WHERE id = $1 FOR UPDATE',
    p_table
  );
  EXECUTE v_query INTO v_current USING p_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'row_not_found: %.%', p_table, p_id;
  END IF;

  IF v_current <> p_expected_version THEN
    RAISE EXCEPTION 'version_conflict: expected % but found %',
      p_expected_version, v_current;
  END IF;

  v_new := v_current + 1;

  -- Branch on whether the table has a `data` JSONB column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=p_table AND column_name='data'
  ) INTO v_has_data;

  IF v_has_data THEN
    v_query := format(
      'UPDATE %I
         SET data       = COALESCE(data, ''{}''::JSONB) || $1,
             version    = $2,
             updated_at = now()
       WHERE id = $3
       RETURNING data',
      p_table
    );
    EXECUTE v_query INTO v_row USING p_patch, v_new, p_id;
  ELSE
    -- No data column → just bump version, ignore patch (caller's
    -- responsibility to write flat columns separately for thin tables)
    v_query := format(
      'UPDATE %I SET version = $1, updated_at = now() WHERE id = $2',
      p_table
    );
    EXECUTE v_query USING v_new, p_id;
    v_row := p_patch;
  END IF;

  RETURN jsonb_build_object(
    'id',      p_id,
    'version', v_new,
    'data',    v_row
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.enable_strict_rls()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t TEXT;
  existed INT := 0;
BEGIN
  FOREACH t IN ARRAY _strict_rls_tables()
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    ) THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Drop legacy permissive policies (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS "permissive_rw" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "company_rls" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "rls_single_owner_%I" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_access_%I" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_read" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "company_strict" ON %I', t);

    EXECUTE format($f$
      CREATE POLICY "company_strict" ON %I FOR ALL TO authenticated
        USING (company = ANY(
          SELECT unnest(COALESCE(allowed_companies, ARRAY[]::TEXT[]))
            FROM user_profiles WHERE id = auth.uid()
        ))
        WITH CHECK (company = ANY(
          SELECT unnest(COALESCE(allowed_companies, ARRAY[]::TEXT[]))
            FROM user_profiles WHERE id = auth.uid()
        ))
    $f$, t);

    existed := existed + 1;
  END LOOP;

  RETURN format('Strict RLS enabled on %s tables. Verify cross-company isolation before continuing.', existed);
END $function$
;

CREATE OR REPLACE FUNCTION public.ensure_driver_token(p_dispatch_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing TEXT;
  v_new TEXT;
BEGIN
  -- id::text cast supports both UUID and TEXT primary keys
  SELECT driver_token INTO v_existing
    FROM tempering_dispatches WHERE id::text = p_dispatch_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  v_new := encode(gen_random_bytes(24), 'hex');
  EXECUTE 'UPDATE tempering_dispatches SET driver_token = $1 WHERE id::text = $2'
    USING v_new, p_dispatch_id;
  RETURN v_new;
END $function$
;

CREATE OR REPLACE FUNCTION public.erp_health_snapshot(p_company text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_trial_balance NUMERIC := 0;
  v_imbalanced_count INT := 0;
  v_recent_activity INT := 0;
  v_last_invoice TIMESTAMPTZ;
  v_last_ledger TIMESTAMPTZ;
  v_clients_count INT;
  v_invoices_count INT;
  v_pieces_count INT;
BEGIN
  -- Trial balance: sum of all debit minus all credit across posted ledger
  -- (should always be 0). Read from the JSONB `details` array — same
  -- shape as the client mapper.
  BEGIN
    SELECT
      COALESCE(SUM(
        (d->>'debit')::NUMERIC - (d->>'credit')::NUMERIC
      ), 0)
    INTO v_trial_balance
    FROM ledger l, jsonb_array_elements(COALESCE(l.details, '[]'::JSONB)) d
    WHERE l.company = p_company AND l.status = 'Posted';
  EXCEPTION WHEN OTHERS THEN
    v_trial_balance := 0;
  END;

  -- Imbalanced JV count
  BEGIN
    SELECT COUNT(*) INTO v_imbalanced_count
    FROM (
      SELECT id,
        SUM((d->>'debit')::NUMERIC)  AS dr,
        SUM((d->>'credit')::NUMERIC) AS cr
      FROM ledger l, jsonb_array_elements(COALESCE(l.details, '[]'::JSONB)) d
      WHERE l.company = p_company AND l.status = 'Posted'
      GROUP BY l.id
      HAVING ABS(SUM((d->>'debit')::NUMERIC) - SUM((d->>'credit')::NUMERIC)) >= 0.01
    ) imbal;
  EXCEPTION WHEN OTHERS THEN
    v_imbalanced_count := 0;
  END;

  -- Recent activity (last hour)
  SELECT COUNT(*) INTO v_recent_activity
  FROM activity_log
  WHERE company = p_company
    AND changed_at > now() - INTERVAL '1 hour';

  -- Last successful write timestamps (proxy for sync health)
  BEGIN
    SELECT MAX(updated_at) INTO v_last_invoice FROM invoices WHERE company = p_company;
  EXCEPTION WHEN OTHERS THEN v_last_invoice := NULL; END;

  BEGIN
    SELECT MAX(updated_at) INTO v_last_ledger FROM ledger WHERE company = p_company;
  EXCEPTION WHEN OTHERS THEN v_last_ledger := NULL; END;

  -- Row counts (sanity)
  BEGIN SELECT COUNT(*) INTO v_clients_count FROM clients WHERE company = p_company;
  EXCEPTION WHEN OTHERS THEN v_clients_count := 0; END;

  BEGIN SELECT COUNT(*) INTO v_invoices_count FROM invoices WHERE company = p_company;
  EXCEPTION WHEN OTHERS THEN v_invoices_count := 0; END;

  BEGIN SELECT COUNT(*) INTO v_pieces_count FROM production_pieces WHERE company = p_company;
  EXCEPTION WHEN OTHERS THEN v_pieces_count := 0; END;

  RETURN jsonb_build_object(
    'company',           p_company,
    'snapshot_at',       now(),
    'trial_balance',     v_trial_balance,
    'imbalanced_jvs',    v_imbalanced_count,
    'recent_activity_1h', v_recent_activity,
    'last_invoice_at',   v_last_invoice,
    'last_ledger_at',    v_last_ledger,
    'row_counts',        jsonb_build_object(
                            'clients',           v_clients_count,
                            'invoices',          v_invoices_count,
                            'production_pieces', v_pieces_count
                          )
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.log_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user TEXT;
  v_company TEXT;
  v_id TEXT;
BEGIN
  -- Acting user: GUC > auth claim > auth.uid() > 'unknown'
  BEGIN
    v_user := COALESCE(
      NULLIF(current_setting('app.current_user', true), ''),
      auth.jwt() ->> 'email',
      auth.uid()::TEXT,
      'unknown'
    );
  EXCEPTION WHEN OTHERS THEN
    v_user := 'unknown';
  END;

  -- Company + id are read defensively — some target tables omit either
  BEGIN
    v_id := COALESCE((NEW).id::TEXT, (OLD).id::TEXT);
  EXCEPTION WHEN OTHERS THEN
    v_id := NULL;
  END;

  BEGIN
    v_company := COALESCE((NEW).company::TEXT, (OLD).company::TEXT);
  EXCEPTION WHEN OTHERS THEN
    v_company := NULL;
  END;

  INSERT INTO activity_log (
    table_name, row_id, operation, changed_by,
    before_data, after_data, company
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(v_id, 'unknown'),
    TG_OP,
    v_user,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    v_company
  );

  RETURN COALESCE(NEW, OLD);
END $function$
;

CREATE OR REPLACE FUNCTION public.append_dispatch_event(p_dispatch_id text, p_event_type text, p_event_data jsonb DEFAULT '{}'::jsonb, p_created_by text DEFAULT 'system'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company TEXT;
  v_event_id BIGINT;
  v_allowed_types TEXT[] := ARRAY[
    'CREATED','PIECES_LOADED','AUTHORIZED','GATE_OUT','IN_TRANSIT',
    'ARRIVED','RECEIVING','INVOICE_RECORDED','THREE_WAY_MATCHED',
    'CLOSED','CANCELLED'
  ];
BEGIN
  IF p_dispatch_id IS NULL OR p_event_type IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: dispatch_id + event_type required';
  END IF;

  IF NOT (p_event_type = ANY (v_allowed_types)) THEN
    RAISE EXCEPTION 'invalid_event_type: % (allowed: %)', p_event_type, v_allowed_types;
  END IF;

  -- id::text cast lets this work for both UUID and TEXT primary keys
  SELECT COALESCE(company, data->>'company') INTO v_company
    FROM tempering_dispatches WHERE id::text = p_dispatch_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;

  -- INSERT — dispatch_id column type matches tempering_dispatches.id, so
  -- we cast the TEXT param to that type via the column's implicit cast.
  EXECUTE 'INSERT INTO dispatch_events (dispatch_id, company, event_type, event_data, created_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING id'
    INTO v_event_id
    USING p_dispatch_id, v_company, p_event_type,
          COALESCE(p_event_data, '{}'::jsonb), COALESCE(p_created_by, 'system');

  RETURN v_event_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.record_three_way_match(p_dispatch_id text, p_vendor_invoice_no text, p_vendor_invoice_amount numeric, p_computed_ap_amount numeric, p_recorded_by text DEFAULT 'system'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status    TEXT;
  v_delta_pct NUMERIC;
  v_rows      INT;
BEGIN
  IF p_dispatch_id IS NULL OR p_vendor_invoice_amount IS NULL OR p_computed_ap_amount IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: dispatch_id + amounts required';
  END IF;

  IF p_computed_ap_amount = 0 THEN
    v_delta_pct := CASE WHEN p_vendor_invoice_amount = 0 THEN 0 ELSE 100 END;
  ELSE
    v_delta_pct := ABS(p_vendor_invoice_amount - p_computed_ap_amount) / p_computed_ap_amount * 100;
  END IF;

  v_status := CASE WHEN v_delta_pct <= 5 THEN 'Match' ELSE 'Mismatch' END;

  EXECUTE 'UPDATE tempering_dispatches
              SET vendor_invoice_no       = $1,
                  vendor_invoice_amount   = $2,
                  three_way_match_status  = $3,
                  updated_at              = now()
            WHERE id::text = $4'
    USING p_vendor_invoice_no, p_vendor_invoice_amount, v_status, p_dispatch_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;

  PERFORM append_dispatch_event(p_dispatch_id, 'THREE_WAY_MATCHED',
    jsonb_build_object(
      'vendorInvoiceNo',     p_vendor_invoice_no,
      'vendorInvoiceAmount', p_vendor_invoice_amount,
      'computedApAmount',    p_computed_ap_amount,
      'deltaPct',            ROUND(v_delta_pct, 2),
      'status',              v_status
    ), p_recorded_by);

  RETURN v_status;
END $function$
;

CREATE OR REPLACE FUNCTION public.verify_delivery_otp(p_dispatch_id text, p_token text, p_otp_plain text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_token       TEXT;
  v_hash        TEXT;
  v_otp_id      BIGINT;
  v_attempts    INT;
  v_expires_at  TIMESTAMPTZ;
BEGIN
  -- id::text cast supports both UUID and TEXT primary keys
  SELECT driver_token INTO v_token
    FROM tempering_dispatches WHERE id::text = p_dispatch_id;
  IF v_token IS NULL OR v_token <> p_token THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  -- Latest unverified OTP for this dispatch
  SELECT id, otp_hash, attempts, expires_at
    INTO v_otp_id, v_hash, v_attempts, v_expires_at
    FROM delivery_otps
   WHERE dispatch_id::text = p_dispatch_id AND verified = FALSE
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;

  IF v_otp_id IS NULL THEN
    RAISE EXCEPTION 'no_active_otp';
  END IF;
  IF v_expires_at < now() THEN
    RAISE EXCEPTION 'otp_expired';
  END IF;
  IF v_attempts >= 5 THEN
    RAISE EXCEPTION 'too_many_attempts';
  END IF;

  -- SHA-256 hex of the plaintext (pgcrypto extension installed at top of migration)
  IF encode(digest(p_otp_plain, 'sha256'), 'hex') = v_hash THEN
    UPDATE delivery_otps
       SET verified = TRUE, verified_at = now(), attempts = attempts + 1
     WHERE id = v_otp_id;
    EXECUTE 'UPDATE tempering_dispatches SET pod_otp_verified = TRUE WHERE id::text = $1'
      USING p_dispatch_id;
    RETURN TRUE;
  ELSE
    UPDATE delivery_otps SET attempts = attempts + 1 WHERE id = v_otp_id;
    RETURN FALSE;
  END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public.update_invoices_search()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r JSONB := to_jsonb(NEW);
  d JSONB := COALESCE(r->'data', '{}'::jsonb);
BEGIN
  NEW.search_tsv := to_tsvector('simple',
       COALESCE(r->>'id', '')                                                                                  || ' '
    || COALESCE(r->>'invoice_number', d->>'invoiceNumber', d->>'invoiceNo', '')                                || ' '
    || COALESCE(r->>'client_name',    d->>'clientName',    '')                                                 || ' '
    || COALESCE(r->>'order_id',       d->>'orderId',       '')
  );
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.update_quotations_search()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r JSONB := to_jsonb(NEW);
  d JSONB := COALESCE(r->'data', '{}'::jsonb);
BEGIN
  NEW.search_tsv := to_tsvector('simple',
       COALESCE(r->>'id', '')                                                  || ' '
    || COALESCE(r->>'order_no',    d->>'orderNo',     '')                       || ' '
    || COALESCE(r->>'quote_number',d->>'quoteNumber', d->>'quoteNo', '')        || ' '
    || COALESCE(r->>'client_name', d->>'clientName',  '')
  );
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.user_profiles_block_self_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.current_user_is_group_admin() THEN RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.allowed_companies IS DISTINCT FROM OLD.allowed_companies THEN
    RAISE EXCEPTION 'Not permitted to change role or allowed_companies';
  END IF;
  RETURN NEW;
END$function$
;

CREATE OR REPLACE FUNCTION public.global_search(p_query text, p_company text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(entity_type text, entity_id text, title text, subtitle text, rank real)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_q tsquery;
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) = 0 THEN RETURN; END IF;
  -- Tokenise input — `:*` for prefix matches so "INV" finds "INV-001"
  v_q := to_tsquery('simple',
    array_to_string(
      string_to_array(regexp_replace(trim(p_query), '\s+', ' ', 'g'), ' '),
      ' & '
    ) || ':*'
  );

  -- Same defensive pattern as the triggers: read every label/subtitle
  -- field via to_jsonb()->> so the SELECT works regardless of which
  -- flat columns exist on the live tables.
  RETURN QUERY
  (
    SELECT 'client'::text,
           (to_jsonb(c)->>'id')::text,
           COALESCE(to_jsonb(c)->>'business_name', c.data->>'businessName', c.data->>'name', to_jsonb(c)->>'id')::text,
           COALESCE(to_jsonb(c)->>'contact_person', to_jsonb(c)->>'email', c.data->>'phone', '')::text,
           ts_rank(c.search_tsv, v_q)
      FROM clients c
     WHERE c.search_tsv @@ v_q
       AND (p_company IS NULL OR c.company = p_company)
     ORDER BY ts_rank(c.search_tsv, v_q) DESC LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'invoice'::text,
           (to_jsonb(i)->>'id')::text,
           COALESCE(to_jsonb(i)->>'invoice_number', i.data->>'invoiceNumber', i.data->>'invoiceNo', to_jsonb(i)->>'id')::text,
           COALESCE(to_jsonb(i)->>'client_name', i.data->>'clientName', '')::text,
           ts_rank(i.search_tsv, v_q)
      FROM invoices i
     WHERE i.search_tsv @@ v_q
       AND (p_company IS NULL OR i.company = p_company)
     ORDER BY ts_rank(i.search_tsv, v_q) DESC LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'quotation'::text,
           (to_jsonb(q)->>'id')::text,
           COALESCE(to_jsonb(q)->>'order_no', to_jsonb(q)->>'quote_number', q.data->>'orderNo', to_jsonb(q)->>'id')::text,
           COALESCE(to_jsonb(q)->>'client_name', q.data->>'clientName', '')::text,
           ts_rank(q.search_tsv, v_q)
      FROM quotations q
     WHERE q.search_tsv @@ v_q
       AND (p_company IS NULL OR q.company = p_company)
     ORDER BY ts_rank(q.search_tsv, v_q) DESC LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'vendor'::text,
           (to_jsonb(v)->>'id')::text,
           COALESCE(to_jsonb(v)->>'name', v.data->>'name', to_jsonb(v)->>'id')::text,
           COALESCE(to_jsonb(v)->>'contact', v.data->>'contact', '')::text,
           ts_rank(v.search_tsv, v_q)
      FROM vendors v
     WHERE v.search_tsv @@ v_q
       AND (p_company IS NULL OR v.company = p_company)
     ORDER BY ts_rank(v.search_tsv, v_q) DESC LIMIT p_limit
  )
  ORDER BY rank DESC LIMIT p_limit;

EXCEPTION
  WHEN OTHERS THEN
    -- Bad query syntax — return empty rather than error out the palette
    RETURN;
END $function$
;

CREATE OR REPLACE FUNCTION public.auth_user_is_super()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
    FROM user_profiles
   WHERE id = auth.uid();
  RETURN v_role IN ('super_admin', 'owner', 'hassan');
END $function$
;

CREATE OR REPLACE FUNCTION public.rls_status_summary()
 RETURNS TABLE(tbl_name text, has_company_col boolean, rls_enabled boolean, policy_count integer, strict_count integer, permissive_count integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    c.table_name::text                                        AS tbl_name,
    EXISTS (
      SELECT 1 FROM information_schema.columns ic
       WHERE ic.table_name = c.table_name AND ic.column_name = 'company'
    )                                                          AS has_company_col,
    t.relrowsecurity                                           AS rls_enabled,
    (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = t.oid) AS policy_count,
    (SELECT count(*)::int FROM pg_policy p
       WHERE p.polrelid = t.oid AND p.polname LIKE '%_strict_%') AS strict_count,
    (SELECT count(*)::int FROM pg_policy p
       WHERE p.polrelid = t.oid
         AND (p.polname LIKE '%_permissive%' OR p.polname LIKE '%_rw')) AS permissive_count
  FROM information_schema.tables c
  JOIN pg_class t ON t.relname = c.table_name
   AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  WHERE c.table_schema = 'public'
    AND c.table_type   = 'BASE TABLE'
  ORDER BY has_company_col DESC, c.table_name;
END $function$
;

CREATE OR REPLACE FUNCTION public.enable_strict_rls_recommended()
 RETURNS TABLE(tbl_name text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tables TEXT[] := ARRAY[
    'clients', 'quotations', 'invoices', 'credit_notes', 'payment_receipts',
    'customer_complaints', 'production_pieces', 'job_orders',
    'tempering_dispatches', 'dispatch_events', 'dispatch_photos',
    'customer_signatures', 'delivery_otps', 'sla_breaches',
    'driver_licenses', 'vehicle_locations',
    'requisitions', 'purchase_orders', 'vendors', 'store_items',
    'stock_ledger', 'ledger', 'accounts'
  ];
  v_t TEXT;
  v_status TEXT;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    BEGIN
      v_status := enable_strict_company_rls(v_t);
    EXCEPTION WHEN OTHERS THEN
      v_status := 'ERROR: ' || SQLERRM;
    END;
    tbl_name := v_t; status := v_status; RETURN NEXT;
  END LOOP;
END $function$
;

CREATE OR REPLACE FUNCTION public.assert_cutover_open(p_company text, p_entry_date date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status        TEXT;
  v_cutover_date  DATE;
BEGIN
  SELECT status, cutover_date INTO v_status, v_cutover_date
  FROM cutover_snapshot WHERE company = p_company;

  -- No snapshot yet → allow (pre-cutover state)
  IF NOT FOUND OR v_status IS NULL THEN
    RETURN;
  END IF;

  -- Locked + entry date is on/before cutover → block
  IF v_status = 'locked' AND v_cutover_date IS NOT NULL AND p_entry_date <= v_cutover_date THEN
    RAISE EXCEPTION 'Cutover locked for % on %. Cannot back-date entries to %.',
      p_company, v_cutover_date, p_entry_date
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.erp_trial_balance(p_company text)
 RETURNS TABLE(balance numeric, trial_balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET statement_timeout TO '5s'
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_balance numeric := 0;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN type IN ('asset', 'expense')              THEN  COALESCE(a.balance, 0)
      WHEN type IN ('liability', 'equity', 'revenue') THEN -COALESCE(a.balance, 0)
      ELSE 0
    END
  ), 0)
  INTO v_balance
  FROM accounts a
  WHERE a.company = p_company;

  RETURN QUERY SELECT v_balance AS balance, v_balance AS trial_balance;

EXCEPTION WHEN OTHERS THEN
  -- Never block the alert loop — return 0 (no imbalance) on any error
  RETURN QUERY SELECT 0::numeric AS balance, 0::numeric AS trial_balance;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dispatch_for_driver(p_dispatch_id text, p_token text)
 RETURNS TABLE(id text, company text, status text, pod_completed_at timestamp with time zone, pod_otp_verified boolean, data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT d.id::TEXT, d.company, d.status, d.pod_completed_at, d.pod_otp_verified, d.data
  FROM tempering_dispatches d
  WHERE d.id::TEXT = p_dispatch_id
    AND d.driver_token = p_token;   -- no match → zero rows (no token leak)
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_pod(p_dispatch_id text, p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_token TEXT;
BEGIN
  SELECT driver_token INTO v_token
  FROM tempering_dispatches WHERE id::TEXT = p_dispatch_id;
  IF v_token IS NULL OR v_token <> p_token THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;
  UPDATE tempering_dispatches
    SET pod_completed_at = now()
    WHERE id::TEXT = p_dispatch_id;
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_pod_photo(p_dispatch_id text, p_token text, p_company text, p_photo_type text, p_storage_path text, p_caption text DEFAULT NULL::text, p_taken_by text DEFAULT NULL::text, p_geo_lat double precision DEFAULT NULL::double precision, p_geo_lng double precision DEFAULT NULL::double precision)
 RETURNS dispatch_photos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.dispatch_photos;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tempering_dispatches
    WHERE id = p_dispatch_id AND driver_token = p_token
  ) THEN
    RAISE EXCEPTION 'invalid dispatch token';
  END IF;

  INSERT INTO public.dispatch_photos
    (dispatch_id, company, photo_type, storage_path, caption, taken_by, geo_lat, geo_lng)
  VALUES
    (p_dispatch_id, p_company, p_photo_type, p_storage_path, p_caption, p_taken_by, p_geo_lat, p_geo_lng)
  RETURNING * INTO v_row;
  RETURN v_row;
END$function$
;

CREATE OR REPLACE FUNCTION public.add_signature(p_dispatch_id text, p_token text, p_company text, p_customer_name text, p_customer_phone text, p_signature_data text, p_geo_lat double precision DEFAULT NULL::double precision, p_geo_lng double precision DEFAULT NULL::double precision)
 RETURNS customer_signatures
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.customer_signatures;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tempering_dispatches
    WHERE id = p_dispatch_id AND driver_token = p_token
  ) THEN
    RAISE EXCEPTION 'invalid dispatch token';
  END IF;

  INSERT INTO public.customer_signatures
    (dispatch_id, company, customer_name, customer_phone, signature_data, geo_lat, geo_lng)
  VALUES
    (p_dispatch_id, p_company, p_customer_name, p_customer_phone, p_signature_data, p_geo_lat, p_geo_lng)
  RETURNING * INTO v_row;
  RETURN v_row;
END$function$
;

CREATE OR REPLACE FUNCTION public.post_grn_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company TEXT  := p_payload->>'company';
  v_grn     TEXT  := p_payload->>'grn_id';
  v_store   JSONB := p_payload->'store_rows';
  v_ledger  JSONB := p_payload->'ledger_rows';
  r         JSONB;
  v_dup     INT;
  v_n_store INT := 0;
  v_n_led   INT := 0;
BEGIN
  IF v_company IS NULL OR v_grn IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: company + grn_id required';
  END IF;

  -- Idempotency: a GRN posts its material GL as a JV with reference_id = grn_id.
  -- If one already exists, this GRN was posted — refuse to double-post.
  SELECT 1 INTO v_dup FROM ledger
   WHERE reference_id = v_grn AND company = v_company AND doc_type = 'JV'
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'grn_already_posted: %', v_grn;
  END IF;

  -- Pre-flight: every ledger row must balance BEFORE anything is written.
  IF v_ledger IS NOT NULL AND v_ledger <> 'null'::JSONB THEN
    FOR r IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value) LOOP
      -- Parked drafts (e.g. labour PV) are not posted-balanced by the app's
      -- gate, but GRN GL rows are all balanced pairs — assert regardless.
      PERFORM assert_ledger_balance(r->'details');
    END LOOP;
  END IF;

  -- ── 1. store_items — upsert the changed rows (mirrors InventoryService.saveStore:
  --        explicit columns, ON CONFLICT UPDATE; other columns preserved). ──
  IF v_store IS NOT NULL AND v_store <> 'null'::JSONB THEN
    FOR r IN SELECT value FROM jsonb_array_elements(v_store) AS t(value) LOOP
      INSERT INTO store_items (
        id, company, name, category, quantity,
        unrestricted_qty, qi_qty, blocked_qty, reserved_qty, unit,
        moving_average_price, total_value, storage_bin, last_movement_date,
        min_level, reorder_point, per_sheet_weight_kg, per_sqft_weight_kg, updated_at
      ) VALUES (
        r->>'id', r->>'company', COALESCE(r->>'name',''), COALESCE(r->>'category',''),
        COALESCE(NULLIF(r->>'quantity','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'unrestricted_qty','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'qi_qty','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'blocked_qty','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'reserved_qty','')::NUMERIC, 0),
        COALESCE(r->>'unit','Sqft'),
        COALESCE(NULLIF(r->>'moving_average_price','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'total_value','')::NUMERIC, 0),
        COALESCE(r->>'storage_bin',''), COALESCE(r->>'last_movement_date',''),
        COALESCE(NULLIF(r->>'min_level','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'reorder_point','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'per_sheet_weight_kg','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'per_sqft_weight_kg','')::NUMERIC, 0),
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        company              = EXCLUDED.company,
        name                 = EXCLUDED.name,
        category             = EXCLUDED.category,
        quantity             = EXCLUDED.quantity,
        unrestricted_qty     = EXCLUDED.unrestricted_qty,
        qi_qty               = EXCLUDED.qi_qty,
        blocked_qty          = EXCLUDED.blocked_qty,
        reserved_qty         = EXCLUDED.reserved_qty,
        unit                 = EXCLUDED.unit,
        moving_average_price = EXCLUDED.moving_average_price,
        total_value          = EXCLUDED.total_value,
        storage_bin          = EXCLUDED.storage_bin,
        last_movement_date   = EXCLUDED.last_movement_date,
        min_level            = EXCLUDED.min_level,
        reorder_point        = EXCLUDED.reorder_point,
        per_sheet_weight_kg  = EXCLUDED.per_sheet_weight_kg,
        per_sqft_weight_kg   = EXCLUDED.per_sqft_weight_kg,
        updated_at           = now();
      v_n_store := v_n_store + 1;
    END LOOP;
  END IF;

  -- ── 2. ledger — material GL (JV) + freight/labour PVs ─────────────────────
  IF v_ledger IS NOT NULL AND v_ledger <> 'null'::JSONB THEN
    FOR r IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value) LOOP
      PERFORM _insert_ledger_row(r);
      v_n_led := v_n_led + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'grn_id',         v_grn,
    'store_written',  v_n_store,
    'ledger_written', v_n_led
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.enforce_jv_maker_checker()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Admin escape hatch (bulk restore / DR)
  IF current_setting('app.skip_finance_guards', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Only when a row is (becoming) a Posted manual JV
  IF NEW.status = 'Posted'
     AND NEW.doc_type = 'JV'
     AND COALESCE(NEW.created_by, '') <> 'system-auto'
     -- Re-upsert-safe: on UPDATE only enforce when ENTERING Posted
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Posted')
  THEN
    IF NEW.approved_by IS NULL OR NEW.approved_by = '' THEN
      RAISE EXCEPTION 'MakerChecker(server): JV % cannot be Posted without approved_by', NEW.id;
    END IF;
    IF NEW.drafted_by IS NOT NULL AND NEW.approved_by = NEW.drafted_by THEN
      RAISE EXCEPTION 'MakerChecker(server): JV % — approver must differ from drafter (4-eyes)', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.enforce_ledger_period_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_month TEXT;
  v_now   TEXT;
  v_open  BOOLEAN;
BEGIN
  IF current_setting('app.skip_finance_guards', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Only Posted rows matter, and on UPDATE only material changes
  IF NEW.status <> 'Posted' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.date   IS NOT DISTINCT FROM NEW.date
     AND OLD.doc_date IS NOT DISTINCT FROM NEW.doc_date
     AND OLD.details::text IS NOT DISTINCT FROM NEW.details::text
  THEN
    RETURN NEW;  -- idempotent re-upsert of an unchanged row — pass
  END IF;

  v_month := substring(COALESCE(NEW.date, NEW.doc_date, '') from 1 for 7);
  v_now   := to_char(now(), 'YYYY-MM');

  IF v_month = '' OR v_month >= v_now THEN
    RETURN NEW;  -- current / future month (or no date) — allowed
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_periods fp
     WHERE fp.company = NEW.company
       AND fp.month   = v_month
       AND fp.status  = 'Open'
  ) INTO v_open;

  IF NOT v_open THEN
    RAISE EXCEPTION
      'PeriodLock(server): % is not an Open period for % — back-posting denied (register/open the period first)',
      v_month, NEW.company;
  END IF;

  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.void_invoice_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company   TEXT  := p_payload->>'company';
  v_inv_id    TEXT  := p_payload->>'invoice_id';
  v_ledger    JSONB := p_payload->'reversal_ledger_row';
  v_quote_id  TEXT  := NULLIF(p_payload->>'quotation_id','');
  v_voided_by TEXT  := p_payload->>'voided_by';
  v_voided_at TEXT  := p_payload->>'voided_at';
  v_gl_id     TEXT  := v_ledger->>'id';
  v_inv       RECORD;
  v_dummy     INT;
  v_has_rev   BOOLEAN := (v_ledger IS NOT NULL AND v_ledger <> 'null'::JSONB);
BEGIN
  IF v_company IS NULL OR v_inv_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: company + invoice_id required';
  END IF;

  -- ── Lock invoice + re-assert void-eligibility (double-void guard) ──
  SELECT * INTO v_inv FROM invoices WHERE id = v_inv_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found: %', v_inv_id;
  END IF;
  IF v_inv.status = 'Voided' THEN
    RAISE EXCEPTION 'invoice_already_voided: %', v_inv_id;
  END IF;
  IF v_inv.status = 'Paid' THEN
    RAISE EXCEPTION 'invoice_paid_cannot_void: %', v_inv_id;
  END IF;
  IF COALESCE(v_inv.received_amount, 0) > 0 THEN
    RAISE EXCEPTION 'invoice_has_payments: % has PKR % received — issue a credit note',
      v_inv_id, v_inv.received_amount;
  END IF;

  -- ── Reversing GL (optional — original GL may be missing) ──
  IF v_has_rev THEN
    IF v_gl_id IS NOT NULL THEN
      SELECT 1 INTO v_dummy FROM ledger WHERE id = v_gl_id;
      IF FOUND THEN
        RAISE EXCEPTION 'gl_already_posted: %', v_gl_id;
      END IF;
    END IF;
    PERFORM assert_ledger_balance(v_ledger->'details');
    PERFORM _insert_ledger_row(v_ledger);
  END IF;

  -- ── Mark invoice Voided (preserve prior status for restore) ──
  UPDATE invoices
     SET reverted_status = COALESCE(reverted_status, status),
         status          = 'Voided',
         balance         = 0,
         voided_by       = v_voided_by,
         voided_at       = NULLIF(v_voided_at,'')::DATE,
         updated_at      = now()
   WHERE id = v_inv_id;

  -- ── Revert the source quotation to Approved (drop invoiceNo) ──
  IF v_quote_id IS NOT NULL THEN
    UPDATE quotations
       SET status     = 'Approved',
           data       = COALESCE(data, '{}'::JSONB) || jsonb_build_object('invoiceNo', NULL),
           updated_at = now()
     WHERE id = v_quote_id;
  END IF;

  RETURN jsonb_build_object(
    'invoice_id', v_inv_id,
    'gl_tx_id',   v_gl_id,
    'reversed',   v_has_rev
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.credit_note_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company    TEXT    := p_payload->>'company';
  v_cn_id      TEXT    := p_payload->>'cn_id';
  v_ledger     JSONB   := p_payload->'reversal_ledger_row';
  v_inv_id     TEXT    := p_payload->>'invoice_id';
  v_new_status TEXT    := NULLIF(p_payload->>'invoice_new_status','');
  v_cn_data    JSONB   := p_payload->'cn_data';
  v_gl_id      TEXT    := v_ledger->>'id';
  v_cn_status  TEXT;
  v_dummy      INT;
  v_cur_bal    NUMERIC;   -- 094: live invoice balance under row lock
  v_cn_amt     NUMERIC;   -- 094: the CN amount being approved
BEGIN
  IF v_company IS NULL OR v_cn_id IS NULL OR v_ledger IS NULL
     OR v_ledger = 'null'::JSONB OR v_inv_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: company, cn_id, reversal_ledger_row, invoice_id required';
  END IF;
  IF v_gl_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: reversal_ledger_row.id required';
  END IF;

  -- ── Maker-Checker guard: lock the CN and re-assert Pending Approval ──
  SELECT status INTO v_cn_status FROM credit_notes WHERE id = v_cn_id FOR UPDATE;
  IF FOUND AND v_cn_status IS DISTINCT FROM 'Pending Approval' THEN
    RAISE EXCEPTION 'cn_not_pending: % is "%" — only Pending Approval CNs can be posted',
      v_cn_id, v_cn_status;
  END IF;

  -- ── Idempotency: the deterministic reversal GL tx must not exist yet ──
  SELECT 1 INTO v_dummy FROM ledger WHERE id = v_gl_id;
  IF FOUND THEN
    RAISE EXCEPTION 'gl_already_posted: %', v_gl_id;
  END IF;

  -- ── Pre-flight balance check ──
  PERFORM assert_ledger_balance(v_ledger->'details');

  -- ── 094 (P1-14): lock the invoice, re-read the LIVE balance, re-assert the
  --    amount<=balance invariant SERVER-SIDE, and derive the new balance from
  --    the server value — never the (possibly stale) client invoice_new_balance.
  SELECT balance INTO v_cur_bal FROM invoices WHERE id = v_inv_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found: %', v_inv_id;
  END IF;
  v_cn_amt := COALESCE(NULLIF(v_cn_data->>'amount','')::NUMERIC, 0);
  IF v_cn_amt > v_cur_bal + 0.5 THEN
    RAISE EXCEPTION 'cn_exceeds_live_balance: credit note % (%) exceeds invoice % live balance % — a receipt may have posted since issue; re-issue for the current balance',
      v_cn_id, v_cn_amt, v_inv_id, v_cur_bal;
  END IF;

  -- 1. Reversing GL (Dr Revenue/GST, Cr AR)
  PERFORM _insert_ledger_row(v_ledger);

  -- 2. Reduce invoice balance server-side (+ optional status change)
  UPDATE invoices
     SET balance    = GREATEST(0, v_cur_bal - v_cn_amt),
         status     = COALESCE(v_new_status, status),
         updated_at = now()
   WHERE id = v_inv_id;

  -- 3. Flip CN → Posted (INSERT if the pending row never synced, else UPDATE)
  INSERT INTO credit_notes (
    id, company, invoice_id, invoice_no, client_id, client_name,
    date, reason, amount, gl_tx_id, status, created_by, created_at, updated_at, data
  )
  VALUES (
    v_cn_id, v_company,
    v_cn_data->>'invoiceId', v_cn_data->>'invoiceNo',
    v_cn_data->>'clientId',  v_cn_data->>'clientName',
    NULLIF(v_cn_data->>'date','')::DATE,
    v_cn_data->>'reason',
    COALESCE(NULLIF(v_cn_data->>'amount','')::NUMERIC, 0),
    v_gl_id, 'Posted',
    v_cn_data->>'createdBy',
    COALESCE(NULLIF(v_cn_data->>'createdAt','')::TIMESTAMPTZ, now()),
    now(),
    COALESCE(v_cn_data, '{}'::JSONB)
  )
  ON CONFLICT (id) DO UPDATE
    SET status     = 'Posted',
        gl_tx_id   = v_gl_id,
        data       = COALESCE(EXCLUDED.data, credit_notes.data),
        updated_at = now();

  RETURN jsonb_build_object(
    'cn_id', v_cn_id, 'gl_tx_id', v_gl_id, 'invoice_id', v_inv_id
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.disable_strict_company_rls(p_table text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pol TEXT;
BEGIN
  -- Drop our strict policies
  FOR v_pol IN
    SELECT polname FROM pg_policy
     WHERE polrelid = format('public.%I', p_table)::regclass
       AND polname LIKE '%_strict_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', v_pol, p_table);
  END LOOP;

  -- Re-install permissive policy so the table is still readable
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true)
  $f$, p_table || '_permissive_rw', p_table);

  RETURN format('OK: %s reverted to permissive', p_table);
END $function$
;

CREATE OR REPLACE FUNCTION public.ar_aging(p_company text)
 RETURNS TABLE(bucket_current numeric, bucket_30 numeric, bucket_60 numeric, bucket_90plus numeric, total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
  WITH outstanding AS (
    SELECT
      GREATEST(
        COALESCE(i.balance, COALESCE(i.total_amount, 0) - COALESCE(i.received_amount, 0)),
        0
      ) AS bal,
      (CURRENT_DATE - COALESCE(NULLIF(i.date::text, '')::date, CURRENT_DATE)) AS age_days
    FROM invoices i
    WHERE i.company = p_company
      AND COALESCE(i.status, '') <> 'Voided'
      AND (auth_user_is_super() OR p_company = ANY(auth_user_companies()))  -- P1-7 authz gate
  )
  SELECT
    COALESCE(SUM(bal) FILTER (WHERE age_days <= 30), 0)                 AS bucket_current,
    COALESCE(SUM(bal) FILTER (WHERE age_days > 30 AND age_days <= 60), 0) AS bucket_30,
    COALESCE(SUM(bal) FILTER (WHERE age_days > 60 AND age_days <= 90), 0) AS bucket_60,
    COALESCE(SUM(bal) FILTER (WHERE age_days > 90), 0)                  AS bucket_90plus,
    COALESCE(SUM(bal), 0)                                              AS total
  FROM outstanding
  WHERE bal > 0;
$function$
;

CREATE OR REPLACE FUNCTION public.attendance_summary(p_company text, p_month text)
 RETURNS TABLE(employee_id text, present bigint, absent bigint, leave bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
  SELECT
    a.employee_id::text                                                        AS employee_id,
    COUNT(*) FILTER (WHERE lower(COALESCE(a.status, '')) IN ('present', 'half-day')) AS present,
    COUNT(*) FILTER (WHERE lower(COALESCE(a.status, '')) = 'absent')            AS absent,
    COUNT(*) FILTER (WHERE lower(COALESCE(a.status, '')) = 'leave')             AS leave
  FROM attendance a
  WHERE a.company = p_company
    AND a.employee_id IS NOT NULL
    AND substring(a.date::text from 1 for 7) = p_month
    AND (auth_user_is_super() OR p_company = ANY(auth_user_companies()))  -- P1-7 authz gate
  GROUP BY a.employee_id;
$function$
;

CREATE OR REPLACE FUNCTION public._strict_rls_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ARRAY[
    'clients','quotations','invoices','payment_receipts','credit_notes',
    'customer_complaints','production_pieces','store_items',
    'requisitions','purchase_orders','vendors'
  ];
$function$
;

CREATE OR REPLACE FUNCTION public._dispatch_events_block_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'dispatch_events is append-only — UPDATE/DELETE denied (event_id=%)', OLD.id;
END $function$
;

CREATE OR REPLACE FUNCTION public.enable_permissive_rls()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t TEXT;
  reverted INT := 0;
BEGIN
  FOREACH t IN ARRAY _strict_rls_tables()
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    ) THEN CONTINUE; END IF;

    EXECUTE format('DROP POLICY IF EXISTS "company_strict" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "company_rls" ON %I', t);

    EXECUTE format($f$
      CREATE POLICY "company_rls" ON %I FOR ALL TO authenticated
        USING (
          company IS NULL
          OR company = COALESCE(
            (SELECT company FROM user_profiles WHERE id = auth.uid()),
            company
          )
        )
    $f$, t);

    reverted := reverted + 1;
  END LOOP;

  RETURN format('Permissive RLS restored on %s tables (migration 026 behaviour).', reverted);
END $function$
;

CREATE OR REPLACE FUNCTION public.authorize_dispatch(p_dispatch_id text, p_gate_pass_id text, p_authorized_by text DEFAULT 'system'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company TEXT;
  v_existing_gate TEXT;
BEGIN
  IF p_dispatch_id IS NULL OR p_gate_pass_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: dispatch_id + gate_pass_id required';
  END IF;

  SELECT COALESCE(company, data->>'company'), gate_pass_id::text
    INTO v_company, v_existing_gate
    FROM tempering_dispatches WHERE id::text = p_dispatch_id
    FOR UPDATE;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM gate_passes
    WHERE id::text = p_gate_pass_id AND COALESCE(company, '') = v_company
  ) THEN
    RAISE EXCEPTION 'gate_pass_not_found_for_company: gate_pass=% company=%', p_gate_pass_id, v_company;
  END IF;

  IF v_existing_gate IS NOT NULL AND v_existing_gate <> p_gate_pass_id THEN
    RAISE EXCEPTION 'already_authorized_with_different_gate_pass: existing=% new=%', v_existing_gate, p_gate_pass_id;
  END IF;

  EXECUTE 'UPDATE tempering_dispatches
              SET gate_pass_id = $1,
                  status       = ''Dispatched'',
                  data         = COALESCE(data, ''{}''::jsonb)
                                 || jsonb_build_object(''gatePassId'', $2, ''status'', ''Dispatched''),
                  updated_at   = now()
            WHERE id::text = $3'
    USING p_gate_pass_id, p_gate_pass_id, p_dispatch_id;

  PERFORM append_dispatch_event(p_dispatch_id, 'AUTHORIZED',
    jsonb_build_object('gatePassId', p_gate_pass_id), p_authorized_by);
END $function$
;

CREATE OR REPLACE FUNCTION public.update_vendors_search()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r JSONB := to_jsonb(NEW);
  d JSONB := COALESCE(r->'data', '{}'::jsonb);
BEGIN
  NEW.search_tsv := to_tsvector('simple',
       COALESCE(r->>'id', '')                                       || ' '
    || COALESCE(r->>'code',    d->>'code',    '')                    || ' '
    || COALESCE(r->>'name',    d->>'name',    '')                    || ' '
    || COALESCE(r->>'contact', d->>'contact', '')
  );
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.load_pieces_to_dispatch_atomic(p_dispatch_id text, p_piece_ids text[], p_changed_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pid          TEXT;
  v_row          RECORD;
  v_now          TIMESTAMPTZ := now();
  v_now_iso      TEXT := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_dispatch     RECORD;
  v_existing_ids JSONB;
  v_added        INT := 0;
  v_skipped      INT := 0;
  v_dispatchable TEXT[] := ARRAY[
    'QC-Passed','Ready to Dispatch','Tempered','Received-From-Tempering','Cut'
  ];
BEGIN
  IF p_dispatch_id IS NULL OR p_piece_ids IS NULL OR array_length(p_piece_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: dispatch_id + non-empty piece_ids required';
  END IF;

  -- Lock the dispatch first so concurrent batches serialise on it.
  SELECT id, data INTO v_dispatch
    FROM tempering_dispatches
    WHERE id = p_dispatch_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;

  IF p_changed_by IS NOT NULL THEN
    PERFORM set_config('app.current_user', p_changed_by, true);
  END IF;

  -- Per-piece validate + update (each piece locked individually).
  FOREACH v_pid IN ARRAY p_piece_ids LOOP
    SELECT id, status, data INTO v_row
      FROM production_pieces
      WHERE id = v_pid
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'piece_not_found: %', v_pid;
    END IF;

    -- Already in THIS dispatch? Skip silently (idempotent re-load).
    IF (v_row.data->>'dispatchId') = p_dispatch_id THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Already in ANOTHER active dispatch? Reject the batch.
    IF v_row.data ? 'dispatchId'
       AND COALESCE(v_row.data->>'dispatchId','') <> ''
       AND v_row.data->>'dispatchId' <> p_dispatch_id THEN
      RAISE EXCEPTION
        'piece_already_dispatched: % is in dispatch %, cannot add to %',
        v_pid, v_row.data->>'dispatchId', p_dispatch_id;
    END IF;

    -- Status must be dispatchable
    IF NOT (COALESCE(v_row.status, v_row.data->>'status') = ANY (v_dispatchable)) THEN
      RAISE EXCEPTION
        'piece_not_dispatchable: % is "%" — must be QC-Passed/Ready to Dispatch/Tempered/Received-From-Tempering/Cut',
        v_pid, COALESCE(v_row.status, v_row.data->>'status');
    END IF;

    UPDATE production_pieces
       SET data = COALESCE(data, '{}'::JSONB) || jsonb_build_object(
                    'dispatchId',  p_dispatch_id,
                    'status',      'Dispatched',
                    'lastUpdated', v_now_iso,
                    'version',     COALESCE((data->>'version')::INT, 1) + 1
                  ),
           status     = 'Dispatched',
           updated_at = v_now
     WHERE id = v_pid;

    v_added := v_added + 1;
  END LOOP;

  -- Patch the dispatch with the union of existing + new piece_ids
  v_existing_ids := COALESCE(v_dispatch.data->'pieceIds', '[]'::JSONB);
  UPDATE tempering_dispatches
     SET data = COALESCE(data, '{}'::JSONB) || jsonb_build_object(
                  'pieceIds', (
                    SELECT jsonb_agg(DISTINCT v ORDER BY v)
                    FROM (
                      SELECT jsonb_array_elements_text(v_existing_ids) AS v
                      UNION
                      SELECT unnest(p_piece_ids) AS v
                    ) u
                  ),
                  'lastUpdated', v_now_iso
                ),
         updated_at = v_now
   WHERE id = p_dispatch_id;

  RETURN jsonb_build_object(
    'dispatch_id', p_dispatch_id,
    'added',       v_added,
    'skipped',     v_skipped,
    'total',       array_length(p_piece_ids, 1)
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.update_piece_status_atomic(p_piece_id text, p_new_status text, p_changed_by text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row         RECORD;
  v_data        JSONB;
  v_current     TEXT;
  v_hold_from   TEXT;
  v_new_data    JSONB;
  v_now         TIMESTAMPTZ := now();
  v_now_iso     TEXT := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_version     INT;
BEGIN
  IF p_piece_id IS NULL OR p_new_status IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: piece_id + new_status required';
  END IF;

  -- Pessimistic lock — second concurrent caller waits here
  SELECT id, status, data INTO v_row
    FROM production_pieces
    WHERE id = p_piece_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'piece_not_found: %', p_piece_id;
  END IF;

  v_data    := COALESCE(v_row.data, '{}'::JSONB);
  v_current := COALESCE(v_row.status, v_data->>'status', 'Cut');
  v_hold_from := v_data->>'holdFrom';
  v_version := COALESCE((v_data->>'version')::INT, 1);

  -- ── Hold asymmetry guard (defect #5) ──
  IF v_current = 'Hold'
     AND p_new_status NOT IN ('Hold','Broken','Returned')
     AND v_hold_from IS NOT NULL
     AND p_new_status <> v_hold_from THEN
    RAISE EXCEPTION
      'invalid_hold_exit: piece % was held from "%" — can only exit back to "%", got "%"',
      p_piece_id, v_hold_from, v_hold_from, p_new_status;
  END IF;

  -- ── General transition guard (defect #3 & #5) ──
  IF v_current <> 'Hold' THEN
    IF NOT _piece_transition_allowed(v_current, p_new_status) THEN
      RAISE EXCEPTION
        'invalid_transition: % cannot move from "%" to "%"',
        p_piece_id, v_current, p_new_status;
    END IF;
  END IF;

  -- ── Compose new data: optimistic version + lastUpdated + status + extra ──
  v_new_data := v_data
              || COALESCE(p_extra, '{}'::JSONB)
              || jsonb_build_object(
                   'status',       p_new_status,
                   'lastUpdated',  v_now_iso,
                   'version',      v_version + 1
                 );

  -- ── holdFrom bookkeeping ──
  IF p_new_status = 'Hold' AND v_current <> 'Hold' THEN
    v_new_data := v_new_data || jsonb_build_object('holdFrom', v_current);
  ELSIF v_current = 'Hold' AND p_new_status <> 'Hold' THEN
    v_new_data := v_new_data - 'holdFrom';
  END IF;

  -- Audit hint for the trigger (activity_log captures full before/after).
  IF p_changed_by IS NOT NULL THEN
    PERFORM set_config('app.current_user', p_changed_by, true);
  END IF;
  IF p_reason IS NOT NULL THEN
    v_new_data := v_new_data || jsonb_build_object('lastChangeReason', p_reason);
  END IF;

  UPDATE production_pieces
     SET data         = v_new_data,
         status       = p_new_status,
         updated_at   = v_now,
         last_updated = v_now          -- FIX: TIMESTAMPTZ value, not the ISO text
   WHERE id = p_piece_id;

  RETURN jsonb_build_object(
    'piece_id',  p_piece_id,
    'old_status', v_current,
    'new_status', p_new_status,
    'version',   v_version + 1,
    'hold_from', v_new_data->>'holdFrom'
  );
EXCEPTION
  -- last_updated may not exist (older deploy) OR be a divergent type — either
  -- way, land the status change via the last_updated-less UPDATE.
  WHEN undefined_column OR datatype_mismatch THEN
    UPDATE production_pieces
       SET data       = v_new_data,
           status     = p_new_status,
           updated_at = v_now
     WHERE id = p_piece_id;
    RETURN jsonb_build_object(
      'piece_id',  p_piece_id,
      'old_status', v_current,
      'new_status', p_new_status,
      'version',   v_version + 1,
      'hold_from', v_new_data->>'holdFrom'
    );
END $function$
;

CREATE OR REPLACE FUNCTION public.update_clients_search()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r JSONB := to_jsonb(NEW);
  d JSONB := COALESCE(r->'data', '{}'::jsonb);
BEGIN
  NEW.search_tsv := to_tsvector('simple',
       COALESCE(r->>'id', '')                                                              || ' '
    || COALESCE(r->>'code',          d->>'code',          '')                              || ' '
    || COALESCE(r->>'business_name', d->>'businessName',  d->>'name',          '')         || ' '
    || COALESCE(r->>'name',          d->>'name',          '')                              || ' '
    || COALESCE(r->>'contact_person',d->>'contactPerson', d->>'contact_person', '')        || ' '
    || COALESCE(r->>'email',         d->>'email',         '')                              || ' '
    || COALESCE(r->>'phone',         d->>'phone',         '')
  );
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.erp_alerts_dedup_date(ts timestamp with time zone)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT (ts AT TIME ZONE 'UTC')::date $function$
;

CREATE OR REPLACE FUNCTION public.auth_user_companies()
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_json   jsonb;
  v_arr    TEXT[];
  v_single TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;   -- anon / service-role bypasses RLS naturally
  END IF;

  -- Normalise allowed_companies to a jsonb array regardless of its actual
  -- column type: to_jsonb(text[]) -> ["a","b"]; to_jsonb(jsonb) -> itself.
  SELECT to_jsonb(allowed_companies) INTO v_json
    FROM user_profiles
   WHERE id = v_uid;

  IF v_json IS NOT NULL AND jsonb_typeof(v_json) = 'array' THEN
    v_arr := ARRAY(SELECT jsonb_array_elements_text(v_json));
    IF v_arr IS NOT NULL AND array_length(v_arr, 1) > 0 THEN
      RETURN v_arr;
    END IF;
  END IF;

  -- Fallback: single company column
  SELECT company INTO v_single FROM user_profiles WHERE id = v_uid;
  IF v_single IS NOT NULL THEN
    RETURN ARRAY[v_single];
  END IF;

  RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public._piece_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- No-op (e.g. spot reassignment / cutter assignment that re-sets the same status)
  IF p_from = p_to THEN RETURN TRUE; END IF;

  -- Universal transitions — allowed FROM any status
  IF p_to IN ('Hold', 'Broken', 'Returned') THEN RETURN TRUE; END IF;

  -- Per-status forward + corrective transitions (mirror TS PIECE_TRANSITIONS)
  RETURN CASE p_from
    WHEN 'Pending-Cut'             THEN p_to IN ('Cut')                 -- 083 cutter pool → cut
    WHEN 'Cut'                     THEN p_to IN ('Service-Pending','QC-Pending','QC-Failed')
    WHEN 'Service-Pending'         THEN p_to IN ('QC-Pending','Cut','QC-Failed')
    WHEN 'QC-Pending'              THEN p_to IN ('QC-Passed','QC-Failed','Service-Pending')
    WHEN 'QC-Failed'               THEN p_to IN ('Cut','Service-Pending')
    WHEN 'QC-Passed'               THEN p_to IN ('Ready to Dispatch','Dispatched','Delivered')
    WHEN 'Ready to Dispatch'       THEN p_to IN ('Dispatched','Delivered','QC-Passed')
    WHEN 'Dispatched'              THEN p_to IN ('Tempered','Received-From-Tempering','Ready to Dispatch')
    WHEN 'Tempered'                THEN p_to IN ('Ready to Dispatch','Received-From-Tempering','Delivered','QC-Pending')
    WHEN 'Received-From-Tempering' THEN p_to IN ('Ready to Dispatch','Tempered','QC-Pending')
    WHEN 'Delivered'               THEN FALSE     -- terminal except universal (above)
    WHEN 'Returned'                THEN p_to IN ('Cut')
    WHEN 'Broken'                  THEN FALSE     -- terminal
    WHEN 'Hold'                    THEN FALSE     -- origin-only exit checked in update_piece_status_atomic
    ELSE FALSE
  END;
END $function$
;

CREATE OR REPLACE FUNCTION public.prune_activity_log(retain_days integer DEFAULT 180)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE n bigint;
BEGIN
  DELETE FROM public.activity_log WHERE changed_at < now() - make_interval(days => retain_days);
  GET DIAGNOSTICS n = ROW_COUNT;  RETURN n;
END $function$
;

CREATE OR REPLACE FUNCTION public.erp_snapshot(p_company text DEFAULT NULL::text, p_label text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id      TEXT := 'SNAP-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || COALESCE(p_company, 'ALL');
  v_payload JSONB := '{}'::JSONB;
  v_counts  JSONB := '{}'::JSONB;
  v_count   BIGINT;
  v_table   TEXT;
  v_rows    JSONB;
  -- Sales / Production critical tables Phases 1-4 mutate
  v_tables  TEXT[] := ARRAY[
    'clients', 'quotations', 'invoices', 'payment_receipts',
    'credit_notes', 'customer_complaints', 'production_pieces',
    'doc_serials'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF p_company IS NULL OR v_table = 'doc_serials' THEN
      EXECUTE format('SELECT to_jsonb(array_agg(t)) FROM %I t', v_table) INTO v_rows;
      EXECUTE format('SELECT count(*) FROM %I', v_table) INTO v_count;
    ELSE
      EXECUTE format('SELECT to_jsonb(array_agg(t)) FROM %I t WHERE company = $1', v_table)
        USING p_company INTO v_rows;
      EXECUTE format('SELECT count(*) FROM %I WHERE company = $1', v_table)
        USING p_company INTO v_count;
    END IF;
    v_payload := v_payload || jsonb_build_object(v_table, COALESCE(v_rows, '[]'::JSONB));
    v_counts  := v_counts  || jsonb_build_object(v_table, v_count);
  END LOOP;

  INSERT INTO erp_backups (id, backup_date, backup_type, table_count, record_count, source, meta)
  VALUES (
    v_id, now(), 'phase5_snapshot',
    array_length(v_tables, 1),
    (SELECT COALESCE(SUM(value::BIGINT), 0) FROM jsonb_each_text(v_counts)),
    'erp_snapshot()',
    jsonb_build_object(
      'company',     COALESCE(p_company, 'ALL'),
      'label',       p_label,
      'counts',      v_counts,
      'tables',      to_jsonb(v_tables),
      'payload',     v_payload
    )
  );

  RETURN jsonb_build_object(
    'backup_id',    v_id,
    'company',      COALESCE(p_company, 'ALL'),
    'label',        p_label,
    'table_counts', v_counts,
    'captured_at',  now()
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.protect_hassan_from_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.id = '3d73eeff-b20b-47b3-a434-71a56588fd70'::uuid THEN
    RAISE EXCEPTION
      'PROTECTED USER: Hassan (super_admin) cannot be deleted. Override only via direct DB access by DBA.';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trial_balance(p_company text)
 RETURNS TABLE(account_id text, debit numeric, credit numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
  SELECT
    d->>'accountId'                        AS account_id,
    COALESCE(SUM((d->>'debit')::numeric), 0)  AS debit,
    COALESCE(SUM((d->>'credit')::numeric), 0) AS credit
  FROM ledger l
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(l.details) = 'array' THEN l.details ELSE '[]'::jsonb END
  ) AS d
  WHERE l.company = p_company
    AND l.status  = 'Posted'
    AND COALESCE(d->>'accountId', '') <> ''
    AND (auth_user_is_super() OR p_company = ANY(auth_user_companies()))  -- P1-7 authz gate
  GROUP BY d->>'accountId';
$function$
;

CREATE OR REPLACE FUNCTION public.log_sla_breach(p_company text, p_vendor_name text, p_dispatch_id text, p_breach_type text, p_expected_date date, p_actual_date date, p_notes text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id BIGINT;
  v_delay INT;
BEGIN
  IF p_company IS NULL OR p_breach_type IS NULL OR p_vendor_name IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: company + vendor_name + breach_type required';
  END IF;

  v_delay := COALESCE((p_actual_date - p_expected_date)::INT, 0);

  -- Idempotent: already logged for this (dispatch_id, breach_type) and unresolved?
  IF p_dispatch_id IS NOT NULL THEN
    SELECT id INTO v_id FROM sla_breaches
      WHERE dispatch_id::text = p_dispatch_id
        AND breach_type = p_breach_type
        AND resolved = FALSE
      LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  EXECUTE 'INSERT INTO sla_breaches
           (company, vendor_name, dispatch_id, breach_type, expected_date, actual_date, delay_days, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id'
    INTO v_id
    USING p_company, p_vendor_name, p_dispatch_id, p_breach_type,
          p_expected_date, p_actual_date, v_delay, p_notes;

  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.trip_profitability(p_dispatch_id text)
 RETURNS TABLE(dispatch_id text, charge numeric, fuel_cost numeric, driver_allowance numeric, toll_charges numeric, maintenance_cost numeric, total_costs numeric, net_profit numeric, margin_pct numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    td.id::text                              AS dispatch_id,
    COALESCE((td.data->>'totalCharges')::NUMERIC, 0)  AS charge,
    COALESCE(td.fuel_cost, 0)                AS fuel_cost,
    COALESCE(td.driver_allowance, 0)         AS driver_allowance,
    COALESCE(td.toll_charges, 0)             AS toll_charges,
    COALESCE(td.maintenance_cost, 0)         AS maintenance_cost,
    COALESCE(td.fuel_cost,0) + COALESCE(td.driver_allowance,0)
      + COALESCE(td.toll_charges,0) + COALESCE(td.maintenance_cost,0) AS total_costs,
    COALESCE((td.data->>'totalCharges')::NUMERIC, 0)
      - (COALESCE(td.fuel_cost,0) + COALESCE(td.driver_allowance,0)
        + COALESCE(td.toll_charges,0) + COALESCE(td.maintenance_cost,0)) AS net_profit,
    CASE
      WHEN COALESCE((td.data->>'totalCharges')::NUMERIC, 0) = 0 THEN 0
      ELSE ROUND(
        ((COALESCE((td.data->>'totalCharges')::NUMERIC, 0)
          - (COALESCE(td.fuel_cost,0) + COALESCE(td.driver_allowance,0)
            + COALESCE(td.toll_charges,0) + COALESCE(td.maintenance_cost,0)))
        / COALESCE((td.data->>'totalCharges')::NUMERIC, 1)) * 100, 2)
    END AS margin_pct
  FROM tempering_dispatches td
  WHERE td.id::text = p_dispatch_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.record_vehicle_location(p_vehicle_id text, p_lat numeric, p_lng numeric, p_trip_id text DEFAULT NULL::text, p_token text DEFAULT NULL::text, p_speed_kph numeric DEFAULT NULL::numeric, p_heading_deg numeric DEFAULT NULL::numeric, p_accuracy_m numeric DEFAULT NULL::numeric, p_battery_pct numeric DEFAULT NULL::numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_token       TEXT;
BEGIN
  IF p_vehicle_id IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: vehicle_id + lat + lng required';
  END IF;

  -- Sanity check coords
  IF p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid_coords: lat=% lng=%', p_lat, p_lng;
  END IF;

  -- If trip_id supplied, verify driver token (token-gated public emitter)
  IF p_trip_id IS NOT NULL AND p_token IS NOT NULL THEN
    SELECT driver_token INTO v_token
      FROM tempering_dispatches WHERE id::text = p_trip_id;
    IF v_token IS NULL OR v_token <> p_token THEN
      RAISE EXCEPTION 'invalid_token';
    END IF;
  END IF;

  EXECUTE 'INSERT INTO vehicle_locations
           (vehicle_id, latitude, longitude, trip_id, speed_kph, heading_deg, accuracy_m, battery_pct)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (vehicle_id, recorded_at) DO NOTHING'
    USING p_vehicle_id, p_lat, p_lng, p_trip_id,
          p_speed_kph, p_heading_deg, p_accuracy_m, p_battery_pct;

  RETURN TRUE;
END $function$
;

CREATE OR REPLACE FUNCTION public.get_active_vehicle_positions(p_company text DEFAULT NULL::text, p_since_minutes integer DEFAULT 30)
 RETURNS TABLE(vehicle_id text, latitude numeric, longitude numeric, recorded_at timestamp with time zone, trip_id text, speed_kph numeric, heading_deg numeric, battery_pct numeric, age_seconds integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  WITH latest AS (
    SELECT vl.*, ROW_NUMBER() OVER (PARTITION BY vl.vehicle_id ORDER BY vl.recorded_at DESC) AS rn
      FROM vehicle_locations vl
     WHERE vl.recorded_at > now() - make_interval(mins => p_since_minutes)
  )
  SELECT l.vehicle_id, l.latitude, l.longitude, l.recorded_at,
         l.trip_id::text, l.speed_kph, l.heading_deg, l.battery_pct,
         EXTRACT(EPOCH FROM (now() - l.recorded_at))::INT AS age_seconds
    FROM latest l
   WHERE l.rn = 1
     AND (p_company IS NULL
          OR EXISTS (
            SELECT 1 FROM dispatch_vehicles dv
             WHERE dv.id = l.vehicle_id
               AND dv.company = p_company
          ));
END $function$
;

CREATE OR REPLACE FUNCTION public.check_geofence_arrival(p_dispatch_id text, p_radius_m numeric DEFAULT 500)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dest_lat       NUMERIC;
  v_dest_lng       NUMERIC;
  v_truck_lat      NUMERIC;
  v_truck_lng      NUMERIC;
  v_already        TIMESTAMPTZ;
  v_distance_m     NUMERIC;
BEGIN
  SELECT destination_lat, destination_lng, arriving_detected_at
    INTO v_dest_lat, v_dest_lng, v_already
    FROM tempering_dispatches WHERE id::text = p_dispatch_id;

  IF v_dest_lat IS NULL OR v_dest_lng IS NULL THEN RETURN FALSE; END IF;
  IF v_already IS NOT NULL THEN RETURN TRUE; END IF;       -- already detected

  -- Get the most recent ping for any vehicle on this trip
  SELECT vl.latitude, vl.longitude
    INTO v_truck_lat, v_truck_lng
    FROM vehicle_locations vl
   WHERE vl.trip_id::text = p_dispatch_id
   ORDER BY vl.recorded_at DESC LIMIT 1;

  IF v_truck_lat IS NULL THEN RETURN FALSE; END IF;

  -- Haversine in metres
  v_distance_m := 6371000 * 2 * asin(sqrt(
    sin(radians(v_dest_lat - v_truck_lat) / 2) ^ 2
    + cos(radians(v_truck_lat)) * cos(radians(v_dest_lat))
      * sin(radians(v_dest_lng - v_truck_lng) / 2) ^ 2
  ));

  IF v_distance_m <= p_radius_m THEN
    EXECUTE 'UPDATE tempering_dispatches
                SET arriving_detected_at = now(),
                    status = COALESCE(status, ''Arriving''),
                    data = COALESCE(data, ''{}''::jsonb)
                           || jsonb_build_object(''status'', ''Arriving'')
              WHERE id::text = $1'
      USING p_dispatch_id;
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END $function$
;

CREATE OR REPLACE FUNCTION public.enforce_ledger_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  imbalance NUMERIC;
  tolerance NUMERIC := 0.01;  -- 1 paisa — strict
  total_dr  NUMERIC := 0;
  total_cr  NUMERIC := 0;
  line      JSONB;
  d         JSONB;
BEGIN
  imbalance := ledger_row_imbalance(NEW.status, NEW.details, NEW.data);

  -- Sentinel: missing details on Posted entry
  IF imbalance = 999999999 THEN
    RAISE EXCEPTION
      'Ledger entry % cannot be Posted without a details array (DR/CR lines)',
      NEW.id
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  IF ABS(imbalance) > tolerance THEN
    -- Recompute totals for the error message (cheap, only runs on error)
    d := COALESCE(NEW.details, NEW.data -> 'details');
    FOR line IN SELECT * FROM jsonb_array_elements(d) LOOP
      total_dr := total_dr + COALESCE((line ->> 'debit') ::NUMERIC, 0);
      total_cr := total_cr + COALESCE((line ->> 'credit')::NUMERIC, 0);
    END LOOP;
    RAISE EXCEPTION
      'GL imbalance on voucher % — DR=% CR=% diff=% PKR (tolerance=0.01)',
      NEW.id, total_dr, total_cr, imbalance
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ledger_row_imbalance(p_status text, p_details jsonb, p_data jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  d        JSONB;
  total_dr NUMERIC := 0;
  total_cr NUMERIC := 0;
  line     JSONB;
BEGIN
  -- Only enforce on Posted; Draft/Parked/Reversed are exempt
  IF p_status IS NULL OR p_status NOT IN ('Posted', 'posted') THEN
    RETURN 0;
  END IF;

  -- Prefer the top-level `details` column, fall back to data->'details'
  -- for older rows that stored everything in JSONB
  d := COALESCE(p_details, p_data -> 'details');

  IF d IS NULL OR jsonb_typeof(d) <> 'array' THEN
    -- No lines at all on a Posted entry is an error in itself, but we
    -- treat that case as "not balanced" by returning a sentinel value
    -- the trigger will reject.
    RETURN 999999999;
  END IF;

  FOR line IN SELECT * FROM jsonb_array_elements(d) LOOP
    total_dr := total_dr + COALESCE((line ->> 'debit') ::NUMERIC, 0);
    total_cr := total_cr + COALESCE((line ->> 'credit')::NUMERIC, 0);
  END LOOP;

  RETURN total_dr - total_cr;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enable_strict_company_rls(p_table text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company_col TEXT;
  v_pol TEXT;
BEGIN
  SELECT column_name INTO v_company_col
    FROM information_schema.columns
   WHERE table_name = p_table AND column_name = 'company' LIMIT 1;
  IF v_company_col IS NULL THEN
    RETURN format('SKIP: %s has no company column', p_table);
  END IF;

  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);

  -- Drop any existing policies (permissive or prior strict) before re-creating
  FOR v_pol IN
    SELECT polname FROM pg_policy WHERE polrelid = format('public.%I', p_table)::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', v_pol, p_table);
  END LOOP;

  -- Strict SELECT — evaluate-once auth (InitPlan), not per row
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR SELECT
      USING (
        (SELECT auth_user_is_super())
        OR ((SELECT auth_user_companies()) IS NOT NULL
            AND company = ANY((SELECT auth_user_companies())))
      )
  $f$, p_table || '_strict_select', p_table);

  -- Strict INSERT
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR INSERT
      WITH CHECK (
        (SELECT auth_user_is_super())
        OR ((SELECT auth_user_companies()) IS NOT NULL
            AND company = ANY((SELECT auth_user_companies())))
      )
  $f$, p_table || '_strict_insert', p_table);

  -- Strict UPDATE (old + new row both in allowed list)
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR UPDATE
      USING (
        (SELECT auth_user_is_super())
        OR ((SELECT auth_user_companies()) IS NOT NULL
            AND company = ANY((SELECT auth_user_companies())))
      )
      WITH CHECK (
        (SELECT auth_user_is_super())
        OR ((SELECT auth_user_companies()) IS NOT NULL
            AND company = ANY((SELECT auth_user_companies())))
      )
  $f$, p_table || '_strict_update', p_table);

  -- Strict DELETE
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR DELETE
      USING (
        (SELECT auth_user_is_super())
        OR ((SELECT auth_user_companies()) IS NOT NULL
            AND company = ANY((SELECT auth_user_companies())))
      )
  $f$, p_table || '_strict_delete', p_table);

  RETURN format('OK: %s now strict + perf-optimized (4 policies)', p_table);
END $function$
;
-- ═══ 7/9 Views ═══

CREATE OR REPLACE VIEW public.bypass_log_overdue WITH (security_invoker=true) AS  SELECT id,
    user_id,
    user_name,
    module,
    rule_bypassed,
    record_id,
    bypass_reason,
    status,
    addressing_date,
    resolved_by,
    resolved_at,
    resolution_notes,
    company,
    created_at,
    updated_at,
    (EXTRACT(day FROM (now() - created_at)))::integer AS days_open,
        CASE
            WHEN (EXTRACT(day FROM (now() - created_at)) > (7)::numeric) THEN 'critical'::text
            WHEN (EXTRACT(day FROM (now() - created_at)) > (3)::numeric) THEN 'overdue'::text
            ELSE 'within_sla'::text
        END AS sla_status
   FROM bypass_log bl
  WHERE (status <> 'Resolved'::text);

CREATE OR REPLACE VIEW public.v_ar_aging WITH (security_invoker=true) AS  SELECT i.company,
    i.id AS invoice_id,
    COALESCE((i.data ->> 'invoiceNumber'::text), i.id) AS invoice_number,
    COALESCE(c.name, i.client_name, (c.data ->> 'businessName'::text)) AS client_name,
    COALESCE(i.total_amount, (0)::numeric) AS invoice_amount,
    COALESCE(sum(r.amount), (0)::numeric) AS paid_amount,
    (COALESCE(i.total_amount, (0)::numeric) - COALESCE(sum(r.amount), (0)::numeric)) AS balance,
    (i.date)::date AS invoice_date,
    (CURRENT_DATE - (i.date)::date) AS days_outstanding,
        CASE
            WHEN ((CURRENT_DATE - (i.date)::date) <= 30) THEN 'current'::text
            WHEN ((CURRENT_DATE - (i.date)::date) <= 60) THEN '31_60'::text
            WHEN ((CURRENT_DATE - (i.date)::date) <= 90) THEN '61_90'::text
            WHEN ((CURRENT_DATE - (i.date)::date) <= 120) THEN '91_120'::text
            ELSE 'over_120'::text
        END AS aging_bucket
   FROM ((invoices i
     LEFT JOIN clients c ON ((c.id = i.client_id)))
     LEFT JOIN payment_receipts r ON ((r.invoice_id = i.id)))
  WHERE ((i.status <> ALL (ARRAY['cancelled'::text, 'draft'::text, 'Cancelled'::text, 'Draft'::text])) AND (i.date IS NOT NULL) AND (i.date <> ''::text))
  GROUP BY i.company, i.id, i.data, i.client_name, c.name, c.data, i.total_amount, i.date
 HAVING ((COALESCE(i.total_amount, (0)::numeric) - COALESCE(sum(r.amount), (0)::numeric)) > 0.01);

CREATE OR REPLACE VIEW public.v_gl_pnl WITH (security_invoker=true) AS  SELECT l.company,
    (date_trunc('month'::text, (l.doc_date)::timestamp without time zone))::date AS month,
    a.id AS account_id,
    a.code AS account_code,
    a.name AS account_name,
    a.type AS account_type,
    COALESCE(sum(((d.value ->> 'debit'::text))::numeric), (0)::numeric) AS total_debit,
    COALESCE(sum(((d.value ->> 'credit'::text))::numeric), (0)::numeric) AS total_credit,
    (COALESCE(sum(((d.value ->> 'debit'::text))::numeric), (0)::numeric) - COALESCE(sum(((d.value ->> 'credit'::text))::numeric), (0)::numeric)) AS net
   FROM ((ledger l
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.details, (l.data -> 'details'::text), '[]'::jsonb)) d(value))
     JOIN accounts a ON ((a.id = (d.value ->> 'accountId'::text))))
  WHERE (l.status = 'Posted'::text)
  GROUP BY l.company, (date_trunc('month'::text, (l.doc_date)::timestamp without time zone)), a.id, a.code, a.name, a.type;

CREATE OR REPLACE VIEW public.v_project_profitability WITH (security_invoker=true) AS  SELECT so.company,
    so.id AS order_id,
    so.order_no AS order_number,
    COALESCE(c.name, (so.data ->> 'clientName'::text), (c.data ->> 'businessName'::text)) AS client_name,
    so.status,
    (so.created_at)::date AS order_date,
    COALESCE(i.total_amount, (0)::numeric) AS revenue,
    COALESCE(cogs.cogs_amount, (0)::numeric) AS cogs,
    (COALESCE(i.total_amount, (0)::numeric) - COALESCE(cogs.cogs_amount, (0)::numeric)) AS gross_profit,
    round(((100.0 * (COALESCE(i.total_amount, (0)::numeric) - COALESCE(cogs.cogs_amount, (0)::numeric))) / NULLIF(COALESCE(i.total_amount, (0)::numeric), (0)::numeric)), 1) AS gross_margin_pct
   FROM (((quotations so
     LEFT JOIN clients c ON ((c.id = so.client_id)))
     LEFT JOIN invoices i ON (((i.order_id = so.id) AND (i.status <> ALL (ARRAY['cancelled'::text, 'Cancelled'::text])))))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(COALESCE(((d.value ->> 'debit'::text))::numeric, (0)::numeric)), (0)::numeric) AS cogs_amount
           FROM ((ledger l
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.details, (l.data -> 'details'::text), '[]'::jsonb)) d(value))
             JOIN accounts a ON ((a.id = (d.value ->> 'accountId'::text))))
          WHERE ((l.company = so.company) AND (l.reference_id = so.order_no) AND (a.name ~~* '%COGS%'::text) AND (l.status = 'Posted'::text))) cogs ON (true))
  WHERE (so.status <> ALL (ARRAY['Draft'::text, 'Cancelled'::text, 'cancelled'::text]));

CREATE OR REPLACE VIEW public.v_sales_analysis WITH (security_invoker=true) AS  SELECT i.company,
    (date_trunc('month'::text, (i.date)::timestamp without time zone))::date AS month,
    COALESCE(c.name, i.client_name, (c.data ->> 'businessName'::text)) AS client_name,
    i.client_id,
    (item.value ->> 'productName'::text) AS product_name,
    (item.value ->> 'productCode'::text) AS product_code,
    count(*) AS line_count,
    COALESCE(sum(((item.value ->> 'quantity'::text))::numeric), (0)::numeric) AS total_qty,
    COALESCE(sum(((item.value ->> 'subtotal'::text))::numeric), (0)::numeric) AS total_revenue
   FROM ((invoices i
     LEFT JOIN clients c ON ((c.id = i.client_id)))
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.items, '[]'::jsonb)) item(value))
  WHERE ((i.status <> ALL (ARRAY['cancelled'::text, 'draft'::text, 'Cancelled'::text, 'Draft'::text])) AND (i.date IS NOT NULL) AND (i.date <> ''::text))
  GROUP BY i.company, (date_trunc('month'::text, (i.date)::timestamp without time zone)), c.name, c.data, i.client_name, i.client_id, (item.value ->> 'productName'::text), (item.value ->> 'productCode'::text);

CREATE OR REPLACE VIEW public.v_stock_aging WITH (security_invoker=true) AS  SELECT company,
    material_id AS material_code,
    COALESCE((data ->> 'materialName'::text), material_id) AS material_name,
    uom AS unit,
    storage_loc AS warehouse,
    COALESCE(sum(quantity), (0)::numeric) AS on_hand_qty,
    min(posting_date) AS first_movement,
    max(posting_date) AS last_movement,
    (CURRENT_DATE - max(posting_date)) AS days_since_last_movement,
        CASE
            WHEN ((CURRENT_DATE - max(posting_date)) > 180) THEN 'dead'::text
            WHEN ((CURRENT_DATE - max(posting_date)) > 90) THEN 'slow_moving'::text
            WHEN ((CURRENT_DATE - max(posting_date)) > 30) THEN 'moderate'::text
            ELSE 'active'::text
        END AS stock_status
   FROM stock_ledger sl
  WHERE ((material_id IS NOT NULL) AND (posting_date IS NOT NULL))
  GROUP BY company, material_id, data, uom, storage_loc
 HAVING (COALESCE(sum(quantity), (0)::numeric) > (0)::numeric);

CREATE OR REPLACE VIEW public.erp_snapshot_index WITH (security_invoker=true) AS  SELECT id,
    backup_date,
    (meta ->> 'company'::text) AS company,
    (meta ->> 'label'::text) AS label,
    record_count,
    table_count,
    (meta -> 'counts'::text) AS counts
   FROM erp_backups
  WHERE (backup_type = 'phase5_snapshot'::text)
  ORDER BY backup_date DESC;

CREATE OR REPLACE VIEW public.erp_snapshot_summary WITH (security_invoker=true) AS  WITH per_co AS (
         SELECT COALESCE((erp_backups.meta ->> 'company'::text), 'ALL'::text) AS company,
            count(*) AS snapshot_count,
            max(erp_backups.backup_date) AS last_snapshot_at,
            sum(erp_backups.record_count) AS total_records,
            sum(pg_column_size(erp_backups.meta)) AS total_payload_bytes
           FROM erp_backups
          WHERE (erp_backups.backup_type = 'phase5_snapshot'::text)
          GROUP BY COALESCE((erp_backups.meta ->> 'company'::text), 'ALL'::text)
        )
 SELECT company,
    snapshot_count,
    last_snapshot_at,
    ((EXTRACT(epoch FROM (now() - last_snapshot_at)))::bigint / 3600) AS hours_since_last,
    total_records,
    total_payload_bytes,
        CASE
            WHEN ((now() - last_snapshot_at) <= '26:00:00'::interval) THEN 'healthy'::text
            WHEN ((now() - last_snapshot_at) <= '48:00:00'::interval) THEN 'warn'::text
            ELSE 'stale'::text
        END AS health
   FROM per_co
  ORDER BY company;

CREATE OR REPLACE VIEW public.v_alert_unread WITH (security_invoker=true) AS  SELECT company,
    count(*) AS total_unread,
    count(*) FILTER (WHERE (severity = 'critical'::text)) AS critical_count,
    count(*) FILTER (WHERE (severity = 'warning'::text)) AS warning_count,
    count(*) FILTER (WHERE (severity = 'info'::text)) AS info_count,
    max(created_at) AS latest_at
   FROM erp_alerts
  WHERE ((is_read = false) AND (is_dismissed = false))
  GROUP BY company;

CREATE OR REPLACE VIEW public.v_fbr_pending WITH (security_invoker=true) AS  SELECT company,
    fbr_status,
    count(*) AS invoice_count,
    COALESCE(sum((NULLIF((data ->> 'total_amount'::text), ''::text))::numeric), (0)::numeric) AS total_amount_pkr,
    min((data ->> 'invoice_date'::text)) AS oldest_invoice_date,
    max((data ->> 'invoice_date'::text)) AS newest_invoice_date,
    count(*) FILTER (WHERE (fbr_retry_count > 0)) AS retried_count,
    max(fbr_last_error) AS sample_error
   FROM invoices
  WHERE (fbr_status = ANY (ARRAY['pending'::text, 'rejected'::text]))
  GROUP BY company, fbr_status
  ORDER BY company, fbr_status;

CREATE OR REPLACE VIEW public.v_ledger_imbalance_audit WITH (security_invoker=true) AS  SELECT id,
    company,
    doc_type,
    doc_date,
    description,
    reference_id,
    status,
    ledger_row_imbalance(status, details, data) AS imbalance_pkr,
    posted_at AS audit_at
   FROM ledger
  WHERE ((status = ANY (ARRAY['Posted'::text, 'posted'::text])) AND (abs(ledger_row_imbalance(status, details, data)) > 0.01));

CREATE OR REPLACE VIEW public.v_perf_last24h WITH (security_invoker=true) AS  SELECT metric,
    label,
    count(*) AS samples,
    round(avg(ms), 2) AS avg_ms,
    round((percentile_cont((0.50)::double precision) WITHIN GROUP (ORDER BY ((ms)::double precision)))::numeric, 2) AS p50_ms,
    round((percentile_cont((0.95)::double precision) WITHIN GROUP (ORDER BY ((ms)::double precision)))::numeric, 2) AS p95_ms,
    max(ms) AS max_ms,
    max(recorded_at) AS last_seen_at
   FROM perf_telemetry
  WHERE ((recorded_at >= (now() - '24:00:00'::interval)) AND (ms IS NOT NULL))
  GROUP BY metric, label
  ORDER BY (round((percentile_cont((0.95)::double precision) WITHIN GROUP (ORDER BY ((ms)::double precision)))::numeric, 2)) DESC NULLS LAST;

CREATE OR REPLACE VIEW public.v_golive_latest WITH (security_invoker=true) AS  SELECT DISTINCT ON (company, check_key) company,
    check_key,
    category,
    status,
    message,
    details,
    ran_at,
    ran_by
   FROM golive_checks
  ORDER BY company, check_key, ran_at DESC;

CREATE OR REPLACE VIEW public.v_golive_summary WITH (security_invoker=true) AS  SELECT company,
    count(*) FILTER (WHERE (status = 'pass'::text)) AS pass_count,
    count(*) FILTER (WHERE (status = 'warning'::text)) AS warning_count,
    count(*) FILTER (WHERE (status = 'fail'::text)) AS fail_count,
    count(*) FILTER (WHERE (status = 'skipped'::text)) AS skipped_count,
    count(*) AS total_count,
    round(((100.0 * (count(*) FILTER (WHERE (status = 'pass'::text)))::numeric) / (NULLIF(count(*), 0))::numeric), 1) AS readiness_pct,
    max(ran_at) AS last_ran_at
   FROM v_golive_latest
  GROUP BY company;
-- ═══ 8/9 Triggers ═══

CREATE TRIGGER trg_requisitions_updated BEFORE UPDATE ON public.requisitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_quotations_updated BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.ncr_events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.ncr_reproductions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.ncr_claims FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.ncr_remnants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_quotations_sync_version BEFORE INSERT OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION sync_version_column();
CREATE TRIGGER tr_invoices_sync_version BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION sync_version_column();
CREATE TRIGGER tr_products_sync_version BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION sync_version_column();
CREATE TRIGGER tr_store_items_sync_version BEFORE INSERT OR UPDATE ON public.store_items FOR EACH ROW EXECUTE FUNCTION sync_version_column();
CREATE TRIGGER tr_clients_sync_version BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION sync_version_column();
CREATE TRIGGER tr_production_pieces_sync_version BEFORE INSERT OR UPDATE ON public.production_pieces FOR EACH ROW EXECUTE FUNCTION sync_version_column();
CREATE TRIGGER tr_clients_audit AFTER INSERT OR DELETE OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION log_changes();
CREATE TRIGGER tr_quotations_audit AFTER INSERT OR DELETE OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION log_changes();
CREATE TRIGGER tr_invoices_audit AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION log_changes();
CREATE TRIGGER tr_payment_receipts_audit AFTER INSERT OR DELETE OR UPDATE ON public.payment_receipts FOR EACH ROW EXECUTE FUNCTION log_changes();
CREATE TRIGGER tr_credit_notes_audit AFTER INSERT OR DELETE OR UPDATE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION log_changes();
CREATE TRIGGER tr_ledger_audit AFTER INSERT OR DELETE OR UPDATE ON public.ledger FOR EACH ROW EXECUTE FUNCTION log_changes();
CREATE TRIGGER tr_store_items_audit AFTER INSERT OR DELETE OR UPDATE ON public.store_items FOR EACH ROW EXECUTE FUNCTION log_changes();
CREATE TRIGGER tr_production_pieces_audit AFTER INSERT OR DELETE OR UPDATE ON public.production_pieces FOR EACH ROW EXECUTE FUNCTION log_changes();
CREATE TRIGGER dispatch_events_no_update BEFORE DELETE OR UPDATE ON public.dispatch_events FOR EACH ROW EXECUTE FUNCTION _dispatch_events_block_mutation();
CREATE TRIGGER tr_clients_search BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION update_clients_search();
CREATE TRIGGER tr_invoices_search BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION update_invoices_search();
CREATE TRIGGER tr_quotations_search BEFORE INSERT OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION update_quotations_search();
CREATE TRIGGER tr_vendors_search BEFORE INSERT OR UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION update_vendors_search();
CREATE TRIGGER trg_enforce_ledger_balance BEFORE INSERT OR UPDATE ON public.ledger FOR EACH ROW EXECUTE FUNCTION enforce_ledger_balance();
CREATE TRIGGER hassan_protect_user_profiles BEFORE DELETE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION protect_hassan_from_delete();
CREATE TRIGGER trg_user_profiles_block_self_escalation BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION user_profiles_block_self_escalation();
CREATE TRIGGER trg_ledger_maker_checker BEFORE INSERT OR UPDATE ON public.ledger FOR EACH ROW EXECUTE FUNCTION enforce_jv_maker_checker();
CREATE TRIGGER trg_ledger_period_lock BEFORE INSERT OR UPDATE ON public.ledger FOR EACH ROW EXECUTE FUNCTION enforce_ledger_period_lock();
-- ═══ 9/9 RLS enable + policies ═══

ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_api_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_episodic_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_procedural_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_rate_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_semantic_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_table_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomaly_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomaly_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_recon_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_manual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bypass_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csv_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cutover_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cutter_daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cutting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disciplinary_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elimination_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exit_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_escalation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fbr_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gap_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generator_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_entries_pending_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_posting_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_posting_rules_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golive_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gratuity_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grn_sheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handling_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hse_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_count_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.morning_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_remnants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_reproductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_presence_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pallet_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pattern_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perf_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictive_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remnant_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remnants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrap_disposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_breaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tempering_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tempering_oven_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unknown_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_defect_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_sla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wazir_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wazir_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wazir_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wazir_voice_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wazir_weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY access_logs_insert ON public.access_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY access_logs_select ON public.access_logs AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY accounts_strict_delete ON public.accounts AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY accounts_strict_insert ON public.accounts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY accounts_strict_select ON public.accounts AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY accounts_strict_update ON public.accounts AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY activity_log_company_scoped ON public.activity_log AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY activity_logs_company_scoped ON public.activity_logs AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY advance_salaries_company_scoped ON public.advance_salaries AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY agent_alert_history_authenticated_all ON public.agent_alert_history AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY agent_api_calls_authenticated_all ON public.agent_api_calls AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY agent_audit_log_authenticated_all ON public.agent_audit_log AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY agent_decisions_authenticated_all ON public.agent_decisions AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY agent_episodic_memory_authenticated_all ON public.agent_episodic_memory AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY agent_execution_log_authenticated_all ON public.agent_execution_log AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY agent_memories_authenticated_all ON public.agent_memories AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY agent_permissions_authenticated_all ON public.agent_permissions AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY agent_procedural_memory_authenticated_all ON public.agent_procedural_memory AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY agent_rate_config_authenticated_all ON public.agent_rate_config AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY agent_rate_limits_authenticated_all ON public.agent_rate_limits AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY agent_semantic_memory_authenticated_all ON public.agent_semantic_memory AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY agent_sessions_company_scoped ON public.agent_sessions AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY agent_table_access_authenticated_all ON public.agent_table_access AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY alert_thresholds_company_scoped ON public.alert_thresholds AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY anomaly_log_auth_rw ON public.anomaly_log AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY anomaly_thresholds_authenticated_all ON public.anomaly_thresholds AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY asset_registry_company_scoped ON public.asset_registry AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY assets_company_scoped ON public.assets AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY attendance_strict_delete ON public.attendance AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY attendance_strict_insert ON public.attendance AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY attendance_strict_select ON public.attendance AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY attendance_strict_update ON public.attendance AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY attendance_overrides_company_scoped ON public.attendance_overrides AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY audit_log_company_scoped ON public.audit_log AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY bank_recon_sessions_company_scoped ON public.bank_recon_sessions AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY bom_items_company_scoped ON public.bom_items AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY bom_templates_company_scoped ON public.bom_templates AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY budget_lines_company_scoped ON public.budget_lines AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY business_manual_authenticated_all ON public.business_manual AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY business_scenarios_authenticated_all ON public.business_scenarios AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY bypass_log_company_scoped ON public.bypass_log AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY clients_strict_delete ON public.clients AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY clients_strict_insert ON public.clients AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY clients_strict_select ON public.clients AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY clients_strict_update ON public.clients AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY company_branding_company_scoped ON public.company_branding AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY cost_centers_company_scoped ON public.cost_centers AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY credit_notes_strict_delete ON public.credit_notes AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY credit_notes_strict_insert ON public.credit_notes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY credit_notes_strict_select ON public.credit_notes AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY credit_notes_strict_update ON public.credit_notes AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY csv_import_logs_company_scoped ON public.csv_import_logs AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY customer_complaints_strict_delete ON public.customer_complaints AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY customer_complaints_strict_insert ON public.customer_complaints AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY customer_complaints_strict_select ON public.customer_complaints AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY customer_complaints_strict_update ON public.customer_complaints AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY customer_signatures_strict_delete ON public.customer_signatures AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY customer_signatures_strict_insert ON public.customer_signatures AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY customer_signatures_strict_select ON public.customer_signatures AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY customer_signatures_strict_update ON public.customer_signatures AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY cutover_snapshot_company_scoped ON public.cutover_snapshot AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY cutter_daily_logs_company_scoped ON public.cutter_daily_logs AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY cutting_sessions_company_scoped ON public.cutting_sessions AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY delivery_otps_strict_delete ON public.delivery_otps AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY delivery_otps_strict_insert ON public.delivery_otps AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY delivery_otps_strict_select ON public.delivery_otps AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY delivery_otps_strict_update ON public.delivery_otps AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY departments_company_scoped ON public.departments AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY disciplinary_actions_company_scoped ON public.disciplinary_actions AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY dispatch_events_strict_delete ON public.dispatch_events AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY dispatch_events_strict_insert ON public.dispatch_events AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY dispatch_events_strict_select ON public.dispatch_events AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY dispatch_events_strict_update ON public.dispatch_events AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY dispatch_photos_strict_delete ON public.dispatch_photos AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY dispatch_photos_strict_insert ON public.dispatch_photos AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY dispatch_photos_strict_select ON public.dispatch_photos AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY dispatch_photos_strict_update ON public.dispatch_photos AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY dispatch_vehicles_company_scoped ON public.dispatch_vehicles AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY dispatches_company_scoped ON public.dispatches AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY doc_serials_company_scoped ON public.doc_serials AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY driver_licenses_strict_delete ON public.driver_licenses AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY driver_licenses_strict_insert ON public.driver_licenses AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY driver_licenses_strict_select ON public.driver_licenses AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY driver_licenses_strict_update ON public.driver_licenses AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY elimination_log_auth_rw ON public.elimination_log AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON public.employee_docs AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON public.employee_docs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated read" ON public.employee_docs AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated update" ON public.employee_docs AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY employee_licenses_company_scoped ON public.employee_licenses AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY employee_qualifications_company_scoped ON public.employee_qualifications AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY employee_roles_delete ON public.employee_roles AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT auth_user_is_super() AS auth_user_is_super));
CREATE POLICY employee_roles_insert ON public.employee_roles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT auth_user_is_super() AS auth_user_is_super));
CREATE POLICY employee_roles_select ON public.employee_roles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY employee_roles_update ON public.employee_roles AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT auth_user_is_super() AS auth_user_is_super)) WITH CHECK (( SELECT auth_user_is_super() AS auth_user_is_super));
CREATE POLICY employee_tags_company_scoped ON public.employee_tags AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY employees_strict_delete ON public.employees AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY employees_strict_insert ON public.employees AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY employees_strict_select ON public.employees AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY employees_strict_update ON public.employees AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY erp_alerts_company_scoped ON public.erp_alerts AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY erp_backups_auth_rw ON public.erp_backups AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY erp_config_company_scoped ON public.erp_config AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY event_history_authenticated_all ON public.event_history AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY exit_interviews_company_scoped ON public.exit_interviews AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY expenses_company_scoped ON public.expenses AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY factory_escalation_alerts_auth_rw ON public.factory_escalation_alerts AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY factory_events_auth_rw ON public.factory_events AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY fbr_config_company_scoped ON public.fbr_config AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY financial_events_company_scoped ON public.financial_events AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY fiscal_periods_company_scoped ON public.fiscal_periods AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY gap_log_auth_rw ON public.gap_log AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY gate_passes_company_scoped ON public.gate_passes AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY generator_logs_company_scoped ON public.generator_logs AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY gl_config_company_scoped ON public.gl_config AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY gl_entries_pending_approval_company_scoped ON public.gl_entries_pending_approval AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY gl_posting_rules_company_scoped ON public.gl_posting_rules AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY gl_posting_rules_v2_auth_rw ON public.gl_posting_rules_v2 AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY golive_checks_company_scoped ON public.golive_checks AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY gratuity_balances_company_scoped ON public.gratuity_balances AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY grn_sheet_entries_company_scoped ON public.grn_sheet_entries AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY handling_units_company_scoped ON public.handling_units AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY holidays_company_scoped ON public.holidays AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY hse_incidents_auth_rw ON public.hse_incidents AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY inspection_lots_company_scoped ON public.inspection_lots AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY invoices_strict_delete ON public.invoices AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY invoices_strict_insert ON public.invoices AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY invoices_strict_select ON public.invoices AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY invoices_strict_update ON public.invoices AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY job_orders_strict_delete ON public.job_orders AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY job_orders_strict_insert ON public.job_orders AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY job_orders_strict_select ON public.job_orders AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY job_orders_strict_update ON public.job_orders AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY leads_company_scoped ON public.leads AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY learning_log_auth_rw ON public.learning_log AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY leave_applications_strict_delete ON public.leave_applications AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY leave_applications_strict_insert ON public.leave_applications AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY leave_applications_strict_select ON public.leave_applications AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY leave_applications_strict_update ON public.leave_applications AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY leave_types_company_scoped ON public.leave_types AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY ledger_strict_delete ON public.ledger AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY ledger_strict_insert ON public.ledger AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY ledger_strict_select ON public.ledger AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY ledger_strict_update ON public.ledger AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY loans_strict_delete ON public.loans AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY loans_strict_insert ON public.loans AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY loans_strict_select ON public.loans AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY loans_strict_update ON public.loans AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY manual_count_sheets_company_scoped ON public.manual_count_sheets AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY mapping_rules_company_scoped ON public.mapping_rules AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY morning_briefings_auth_rw ON public.morning_briefings AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY ncr_claims_company_scoped ON public.ncr_claims AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY ncr_events_company_scoped ON public.ncr_events AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY ncr_remnants_company_scoped ON public.ncr_remnants AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY ncr_reproductions_company_scoped ON public.ncr_reproductions AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY overtimes_company_scoped ON public.overtimes AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY owner_presence_state_authenticated_all ON public.owner_presence_state AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pallet_rates_company_scoped ON public.pallet_rates AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY pattern_library_authenticated_all ON public.pattern_library AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY payment_receipts_strict_delete ON public.payment_receipts AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY payment_receipts_strict_insert ON public.payment_receipts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY payment_receipts_strict_select ON public.payment_receipts AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY payment_receipts_strict_update ON public.payment_receipts AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY payroll_strict_delete ON public.payroll AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY payroll_strict_insert ON public.payroll AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY payroll_strict_select ON public.payroll AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY payroll_strict_update ON public.payroll AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY perf_telemetry_company_scoped ON public.perf_telemetry AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY performance_reviews_company_scoped ON public.performance_reviews AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY permissions_delete ON public.permissions AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT auth_user_is_super() AS auth_user_is_super));
CREATE POLICY permissions_insert ON public.permissions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT auth_user_is_super() AS auth_user_is_super));
CREATE POLICY permissions_select ON public.permissions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_update ON public.permissions AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT auth_user_is_super() AS auth_user_is_super)) WITH CHECK (( SELECT auth_user_is_super() AS auth_user_is_super));
CREATE POLICY petty_cash_company_scoped ON public.petty_cash AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY predictive_alerts_auth_rw ON public.predictive_alerts AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY price_list_items_company_scoped ON public.price_list_items AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY price_lists_company_scoped ON public.price_lists AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY production_pieces_strict_delete ON public.production_pieces AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY production_pieces_strict_insert ON public.production_pieces AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY production_pieces_strict_select ON public.production_pieces AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY production_pieces_strict_update ON public.production_pieces AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY products_company_scoped ON public.products AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY projects_company_scoped ON public.projects AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY public_holidays_company_scoped ON public.public_holidays AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY purchase_orders_rw ON public.purchase_orders AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY quotations_strict_delete ON public.quotations AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY quotations_strict_insert ON public.quotations AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY quotations_strict_select ON public.quotations AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY quotations_strict_update ON public.quotations AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY recurring_expenses_company_scoped ON public.recurring_expenses AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY remnant_history_company_scoped ON public.remnant_history AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY remnants_company_scoped ON public.remnants AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY requisitions_strict_delete ON public.requisitions AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY requisitions_strict_insert ON public.requisitions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY requisitions_strict_select ON public.requisitions AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY requisitions_strict_update ON public.requisitions AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY role_permissions_delete ON public.role_permissions AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT auth_user_is_super() AS auth_user_is_super));
CREATE POLICY role_permissions_insert ON public.role_permissions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT auth_user_is_super() AS auth_user_is_super));
CREATE POLICY role_permissions_select ON public.role_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_update ON public.role_permissions AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT auth_user_is_super() AS auth_user_is_super)) WITH CHECK (( SELECT auth_user_is_super() AS auth_user_is_super));
CREATE POLICY roles_company_scoped ON public.roles AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY saas_clients_authenticated_all ON public.saas_clients AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY scrap_disposals_company_scoped ON public.scrap_disposals AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY shift_master_company_scoped ON public.shift_master AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY sla_breaches_strict_delete ON public.sla_breaches AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY sla_breaches_strict_insert ON public.sla_breaches AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY sla_breaches_strict_select ON public.sla_breaches AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY sla_breaches_strict_update ON public.sla_breaches AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY stock_ledger_strict_delete ON public.stock_ledger AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY stock_ledger_strict_insert ON public.stock_ledger AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY stock_ledger_strict_select ON public.stock_ledger AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY stock_ledger_strict_update ON public.stock_ledger AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY stock_locations_company_scoped ON public.stock_locations AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY store_items_strict_delete ON public.store_items AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY store_items_strict_insert ON public.store_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY store_items_strict_select ON public.store_items AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY store_items_strict_update ON public.store_items AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY tag_master_company_scoped ON public.tag_master AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY tempering_dispatches_strict_delete ON public.tempering_dispatches AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY tempering_dispatches_strict_insert ON public.tempering_dispatches AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY tempering_dispatches_strict_select ON public.tempering_dispatches AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY tempering_dispatches_strict_update ON public.tempering_dispatches AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY tempering_oven_config_company_scoped ON public.tempering_oven_config AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY unknown_log_authenticated_all ON public.unknown_log AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY up_insert_admin ON public.user_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (current_user_is_group_admin());
CREATE POLICY up_select_all ON public.user_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY up_update_self_or_admin ON public.user_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (((id = auth.uid()) OR current_user_is_group_admin())) WITH CHECK (((id = auth.uid()) OR current_user_is_group_admin()));
CREATE POLICY vehicle_expenses_company_scoped ON public.vehicle_expenses AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY vehicle_locations_anon_read ON public.vehicle_locations AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY vehicle_locations_auth_rw ON public.vehicle_locations AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY vehicle_trips_company_scoped ON public.vehicle_trips AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY vehicles_company_scoped ON public.vehicles AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY vendor_defect_reports_company_scoped ON public.vendor_defect_reports AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY vendor_rates_company_scoped ON public.vendor_rates AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY vendor_reviews_company_scoped ON public.vendor_reviews AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY vendor_sla_company_scoped ON public.vendor_sla AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY vendors_strict_delete ON public.vendors AS PERMISSIVE FOR DELETE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY vendors_strict_insert ON public.vendors AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY vendors_strict_select ON public.vendors AS PERMISSIVE FOR SELECT TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY vendors_strict_update ON public.vendors AS PERMISSIVE FOR UPDATE TO public USING ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))) WITH CHECK ((auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies())))));
CREATE POLICY warehouse_spots_company_scoped ON public.warehouse_spots AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY wazir_conversations_authenticated_all ON public.wazir_conversations AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY wazir_decisions_company_scoped ON public.wazir_decisions AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY wazir_lessons_authenticated_all ON public.wazir_lessons AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY wazir_voice_samples_authenticated_all ON public.wazir_voice_samples AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY wazir_weekly_reports_authenticated_all ON public.wazir_weekly_reports AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY weight_master_company_scoped ON public.weight_master AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
CREATE POLICY whatsapp_log_authenticated_all ON public.whatsapp_log AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY work_orders_company_scoped ON public.work_orders AS PERMISSIVE FOR ALL TO authenticated USING ((current_user_is_group_admin() OR (company = ANY (current_user_companies())))) WITH CHECK ((current_user_is_group_admin() OR (company = ANY (current_user_companies()))));
-- ═══ Grants ═══


GRANT EXECUTE ON FUNCTION update_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION update_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION update_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION current_user_companies() TO anon;
GRANT EXECUTE ON FUNCTION current_user_companies() TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_companies() TO service_role;
GRANT EXECUTE ON FUNCTION current_user_is_group_admin() TO anon;
GRANT EXECUTE ON FUNCTION current_user_is_group_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_is_group_admin() TO service_role;
GRANT EXECUTE ON FUNCTION consume_grn_sheet(text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION consume_grn_sheet(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION consume_grn_sheet(text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION process_payment_receipt(jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION process_payment_receipt(jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION allocate_serial(text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION allocate_serial(text,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION assert_ledger_balance(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION assert_ledger_balance(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION assert_ledger_balance(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION _insert_ledger_row(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION _insert_ledger_row(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION _insert_ledger_row(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION post_invoice_atomic(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION post_invoice_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION post_invoice_atomic(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION consume_glass_stock(text,text,jsonb,jsonb,jsonb,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION consume_glass_stock(text,text,jsonb,jsonb,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION consume_glass_stock(text,text,jsonb,jsonb,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION sync_version_column() TO anon;
GRANT EXECUTE ON FUNCTION sync_version_column() TO authenticated;
GRANT EXECUTE ON FUNCTION sync_version_column() TO service_role;
GRANT EXECUTE ON FUNCTION update_with_version(text,text,jsonb,integer) TO anon;
GRANT EXECUTE ON FUNCTION update_with_version(text,text,jsonb,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION update_with_version(text,text,jsonb,integer) TO service_role;
GRANT EXECUTE ON FUNCTION enable_strict_rls() TO anon;
GRANT EXECUTE ON FUNCTION enable_strict_rls() TO authenticated;
GRANT EXECUTE ON FUNCTION enable_strict_rls() TO service_role;
GRANT EXECUTE ON FUNCTION ensure_driver_token(text) TO anon;
GRANT EXECUTE ON FUNCTION ensure_driver_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_driver_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION erp_health_snapshot(text) TO anon;
GRANT EXECUTE ON FUNCTION erp_health_snapshot(text) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_health_snapshot(text) TO service_role;
GRANT EXECUTE ON FUNCTION log_changes() TO anon;
GRANT EXECUTE ON FUNCTION log_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION log_changes() TO service_role;
GRANT EXECUTE ON FUNCTION append_dispatch_event(text,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION append_dispatch_event(text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION record_three_way_match(text,text,numeric,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION record_three_way_match(text,text,numeric,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION verify_delivery_otp(text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION verify_delivery_otp(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_delivery_otp(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION update_invoices_search() TO anon;
GRANT EXECUTE ON FUNCTION update_invoices_search() TO authenticated;
GRANT EXECUTE ON FUNCTION update_invoices_search() TO service_role;
GRANT EXECUTE ON FUNCTION update_quotations_search() TO anon;
GRANT EXECUTE ON FUNCTION update_quotations_search() TO authenticated;
GRANT EXECUTE ON FUNCTION update_quotations_search() TO service_role;
GRANT EXECUTE ON FUNCTION user_profiles_block_self_escalation() TO authenticated;
GRANT EXECUTE ON FUNCTION user_profiles_block_self_escalation() TO service_role;
GRANT EXECUTE ON FUNCTION global_search(text,text,integer) TO anon;
GRANT EXECUTE ON FUNCTION global_search(text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION global_search(text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION auth_user_is_super() TO anon;
GRANT EXECUTE ON FUNCTION auth_user_is_super() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_user_is_super() TO service_role;
GRANT EXECUTE ON FUNCTION rls_status_summary() TO anon;
GRANT EXECUTE ON FUNCTION rls_status_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION rls_status_summary() TO service_role;
GRANT EXECUTE ON FUNCTION enable_strict_rls_recommended() TO authenticated;
GRANT EXECUTE ON FUNCTION enable_strict_rls_recommended() TO service_role;
GRANT EXECUTE ON FUNCTION assert_cutover_open(text,date) TO anon;
GRANT EXECUTE ON FUNCTION assert_cutover_open(text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION assert_cutover_open(text,date) TO service_role;
GRANT EXECUTE ON FUNCTION erp_trial_balance(text) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_trial_balance(text) TO service_role;
GRANT EXECUTE ON FUNCTION get_dispatch_for_driver(text,text) TO anon;
GRANT EXECUTE ON FUNCTION get_dispatch_for_driver(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dispatch_for_driver(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION complete_pod(text,text) TO anon;
GRANT EXECUTE ON FUNCTION complete_pod(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_pod(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION add_pod_photo(text,text,text,text,text,text,text,double precision,double precision) TO anon;
GRANT EXECUTE ON FUNCTION add_pod_photo(text,text,text,text,text,text,text,double precision,double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION add_pod_photo(text,text,text,text,text,text,text,double precision,double precision) TO service_role;
GRANT EXECUTE ON FUNCTION add_signature(text,text,text,text,text,text,double precision,double precision) TO anon;
GRANT EXECUTE ON FUNCTION add_signature(text,text,text,text,text,text,double precision,double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION add_signature(text,text,text,text,text,text,double precision,double precision) TO service_role;
GRANT EXECUTE ON FUNCTION post_grn_atomic(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION post_grn_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION post_grn_atomic(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION enforce_jv_maker_checker() TO anon;
GRANT EXECUTE ON FUNCTION enforce_jv_maker_checker() TO authenticated;
GRANT EXECUTE ON FUNCTION enforce_jv_maker_checker() TO service_role;
GRANT EXECUTE ON FUNCTION enforce_ledger_period_lock() TO anon;
GRANT EXECUTE ON FUNCTION enforce_ledger_period_lock() TO authenticated;
GRANT EXECUTE ON FUNCTION enforce_ledger_period_lock() TO service_role;
GRANT EXECUTE ON FUNCTION void_invoice_atomic(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION void_invoice_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION void_invoice_atomic(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION credit_note_atomic(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION credit_note_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION credit_note_atomic(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION disable_strict_company_rls(text) TO authenticated;
GRANT EXECUTE ON FUNCTION disable_strict_company_rls(text) TO service_role;
GRANT EXECUTE ON FUNCTION ar_aging(text) TO authenticated;
GRANT EXECUTE ON FUNCTION ar_aging(text) TO service_role;
GRANT EXECUTE ON FUNCTION attendance_summary(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION attendance_summary(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION _strict_rls_tables() TO anon;
GRANT EXECUTE ON FUNCTION _strict_rls_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION _strict_rls_tables() TO service_role;
GRANT EXECUTE ON FUNCTION _dispatch_events_block_mutation() TO anon;
GRANT EXECUTE ON FUNCTION _dispatch_events_block_mutation() TO authenticated;
GRANT EXECUTE ON FUNCTION _dispatch_events_block_mutation() TO service_role;
GRANT EXECUTE ON FUNCTION enable_permissive_rls() TO anon;
GRANT EXECUTE ON FUNCTION enable_permissive_rls() TO authenticated;
GRANT EXECUTE ON FUNCTION enable_permissive_rls() TO service_role;
GRANT EXECUTE ON FUNCTION authorize_dispatch(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION authorize_dispatch(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION update_vendors_search() TO anon;
GRANT EXECUTE ON FUNCTION update_vendors_search() TO authenticated;
GRANT EXECUTE ON FUNCTION update_vendors_search() TO service_role;
GRANT EXECUTE ON FUNCTION load_pieces_to_dispatch_atomic(text,text[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION load_pieces_to_dispatch_atomic(text,text[],text) TO service_role;
GRANT EXECUTE ON FUNCTION update_piece_status_atomic(text,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION update_piece_status_atomic(text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION update_clients_search() TO anon;
GRANT EXECUTE ON FUNCTION update_clients_search() TO authenticated;
GRANT EXECUTE ON FUNCTION update_clients_search() TO service_role;
GRANT EXECUTE ON FUNCTION erp_alerts_dedup_date(timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION erp_alerts_dedup_date(timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_alerts_dedup_date(timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION auth_user_companies() TO anon;
GRANT EXECUTE ON FUNCTION auth_user_companies() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_user_companies() TO service_role;
GRANT EXECUTE ON FUNCTION _piece_transition_allowed(text,text) TO anon;
GRANT EXECUTE ON FUNCTION _piece_transition_allowed(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION _piece_transition_allowed(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION prune_activity_log(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION prune_activity_log(integer) TO service_role;
GRANT EXECUTE ON FUNCTION erp_snapshot(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_snapshot(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION protect_hassan_from_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION protect_hassan_from_delete() TO service_role;
GRANT EXECUTE ON FUNCTION trial_balance(text) TO authenticated;
GRANT EXECUTE ON FUNCTION trial_balance(text) TO service_role;
GRANT EXECUTE ON FUNCTION log_sla_breach(text,text,text,text,date,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION log_sla_breach(text,text,text,text,date,date,text) TO service_role;
GRANT EXECUTE ON FUNCTION trip_profitability(text) TO anon;
GRANT EXECUTE ON FUNCTION trip_profitability(text) TO authenticated;
GRANT EXECUTE ON FUNCTION trip_profitability(text) TO service_role;
GRANT EXECUTE ON FUNCTION record_vehicle_location(text,numeric,numeric,text,text,numeric,numeric,numeric,numeric) TO anon;
GRANT EXECUTE ON FUNCTION record_vehicle_location(text,numeric,numeric,text,text,numeric,numeric,numeric,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION record_vehicle_location(text,numeric,numeric,text,text,numeric,numeric,numeric,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION get_active_vehicle_positions(text,integer) TO anon;
GRANT EXECUTE ON FUNCTION get_active_vehicle_positions(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_vehicle_positions(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION check_geofence_arrival(text,numeric) TO anon;
GRANT EXECUTE ON FUNCTION check_geofence_arrival(text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION check_geofence_arrival(text,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION enforce_ledger_balance() TO anon;
GRANT EXECUTE ON FUNCTION enforce_ledger_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION enforce_ledger_balance() TO service_role;
GRANT EXECUTE ON FUNCTION ledger_row_imbalance(text,jsonb,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION ledger_row_imbalance(text,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION ledger_row_imbalance(text,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION enable_strict_company_rls(text) TO authenticated;
GRANT EXECUTE ON FUNCTION enable_strict_company_rls(text) TO service_role;

-- ═══ Table / sequence grants (the reflection captured FUNCTION grants only) ═══
-- Without these, a fresh replay leaves service_role/authenticated with no table
-- privileges → "permission denied". RLS still enforces per-row company scope;
-- these are the coarse gate Supabase pairs with RLS. anon is intentionally NOT
-- granted here (preserves the anon-lockdown posture). This runs ONLY on a fresh
-- rebuild — the baseline is never re-applied to live prod.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
