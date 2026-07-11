-- ============================================================
-- GlassTech ERP — Missing Tables (72 tables)
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_alert_history (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  alert_type TEXT,
  title      TEXT,
  message    TEXT,
  severity   TEXT,
  read       BOOLEAN DEFAULT false,
  source     TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_api_calls (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name     TEXT NOT NULL DEFAULT 'default',
  model          TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  tokens_used    INTEGER NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(12,6) NOT NULL DEFAULT 0,
  cost_pkr       NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_audit_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type        TEXT NOT NULL,
  module             TEXT NOT NULL DEFAULT 'general',
  user_id            TEXT,
  agent_id           TEXT,
  tool_name          TEXT,
  data_before        JSONB DEFAULT '{}',
  data_after         JSONB DEFAULT '{}',
  gl_entries_created JSONB DEFAULT '[]',
  approval_chain     JSONB DEFAULT '[]',
  risk_score         INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 10),
  flags              TEXT[] NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department    TEXT NOT NULL DEFAULT 'general',
  decision_type TEXT NOT NULL,
  context       JSONB NOT NULL DEFAULT '{}',
  decision      TEXT NOT NULL,
  reasoning     TEXT NOT NULL,
  conditions    TEXT[] NOT NULL DEFAULT '{}',
  confidence    NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  outcome       TEXT CHECK (outcome IN ('correct','wrong','partial','pending')),
  outcome_date  TIMESTAMPTZ,
  outcome_notes TEXT,
  feedback      TEXT CHECK (feedback IN ('followed','overridden','dismissed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_episodic_memory (
  decision_id      TEXT PRIMARY KEY,
  agent_type       TEXT NOT NULL CHECK (agent_type IN ('finance','production','ops')),
  decision_type    TEXT NOT NULL,
  context_snapshot JSONB NOT NULL DEFAULT '{}',
  decision_made    TEXT NOT NULL CHECK (decision_made IN ('APPROVE','REJECT','APPROVE_WITH_CONDITIONS','ESCALATE','DEFER')),
  reasoning        TEXT NOT NULL,
  conditions       JSONB DEFAULT '[]',
  confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  outcome          TEXT CHECK (outcome IN ('success','failure','partial','paid','defaulted','delayed','cancelled','pending')),
  outcome_value    NUMERIC(14,2),
  outcome_date     TIMESTAMPTZ,
  owner_feedback   TEXT CHECK (owner_feedback IN ('confirmed','overridden','amended')),
  override_reason  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_execution_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     TEXT,
  pattern_id     TEXT,
  event_label    TEXT,
  steps_executed JSONB NOT NULL DEFAULT '[]',
  supabase_writes JSONB NOT NULL DEFAULT '[]',
  executed_by    TEXT,
  executed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at    TIMESTAMPTZ,
  reversed_by    TEXT,
  reversal_result JSONB
);

CREATE TABLE IF NOT EXISTS agent_memories (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category   TEXT,
  content    TEXT,
  tags       JSONB DEFAULT '[]',
  relevance  REAL DEFAULT 1.0,
  source     TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT NOT NULL UNIQUE,
  agent_label   TEXT NOT NULL,
  permission    TEXT NOT NULL DEFAULT 'read' CHECK (permission IN ('read','write','admin')),
  allowed_tools TEXT[] NOT NULL DEFAULT '{}',
  max_tokens    INTEGER NOT NULL DEFAULT 1000,
  model         TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_procedural_memory (
  rule_id        TEXT PRIMARY KEY,
  agent_type     TEXT NOT NULL,
  rule_type      TEXT NOT NULL CHECK (rule_type IN ('hard_rule','soft_rule','guideline')),
  condition_text TEXT NOT NULL,
  action_text    TEXT NOT NULL,
  priority       INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  override_count INTEGER NOT NULL DEFAULT 0,
  follow_count   INTEGER NOT NULL DEFAULT 0,
  success_rate   NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  created_by     TEXT NOT NULL DEFAULT 'system' CHECK (created_by IN ('owner','system','learned')),
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_rate_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key     TEXT NOT NULL UNIQUE,
  max_per_minute INTEGER NOT NULL DEFAULT 10,
  max_per_hour   INTEGER NOT NULL DEFAULT 100,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_rate_limits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_semantic_memory (
  fact_id              TEXT PRIMARY KEY,
  agent_type           TEXT NOT NULL,
  fact_category        TEXT NOT NULL CHECK (fact_category IN (
    'client_behavior','vendor_reliability','product_performance',
    'seasonal_pattern','cost_trend','quality_pattern','operational'
  )),
  fact_statement       TEXT NOT NULL,
  confidence           NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  supporting_decisions TEXT[] NOT NULL DEFAULT '{}',
  evidence_count       INTEGER NOT NULL DEFAULT 0,
  invalidated          BOOLEAN NOT NULL DEFAULT false,
  invalidated_reason   TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  company       TEXT NOT NULL DEFAULT 'GlassCo',
  session_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  messages      JSONB NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  summary       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company, session_date)
);

CREATE TABLE IF NOT EXISTS agent_table_access (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  can_read   BOOLEAN NOT NULL DEFAULT true,
  can_write  BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_name, table_name)
);

CREATE TABLE IF NOT EXISTS anomaly_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_type    TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  department      TEXT NOT NULL DEFAULT 'general',
  description     TEXT NOT NULL,
  data_snapshot   JSONB NOT NULL DEFAULT '{}',
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anomaly_thresholds (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key   TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  department TEXT NOT NULL,
  threshold  NUMERIC NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_registry (
  id                           TEXT PRIMARY KEY,
  company                      TEXT NOT NULL,
  description                  TEXT NOT NULL,
  category                     TEXT,
  purchase_date                TEXT,
  purchase_value               NUMERIC DEFAULT 0,
  residual_value               NUMERIC DEFAULT 0,
  useful_life_years            NUMERIC DEFAULT 5,
  depreciation_method          TEXT DEFAULT 'Straight-Line',
  gl_asset_account_code        TEXT,
  accumulated_dep_account_code TEXT,
  dep_expense_account_code     TEXT,
  status                       TEXT DEFAULT 'Active',
  location                     TEXT,
  custodian                    TEXT,
  serial_number                TEXT,
  purchase_invoice_ref         TEXT,
  disposal_date                TEXT,
  disposal_value               NUMERIC,
  disposal_notes               TEXT,
  created_by                   TEXT,
  updated_by                   TEXT,
  updated_at                   TIMESTAMPTZ DEFAULT now(),
  created_at                   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_overrides (
  id                   TEXT PRIMARY KEY,
  company              TEXT NOT NULL,
  employee_id          TEXT NOT NULL,
  month                TEXT NOT NULL,
  absent               NUMERIC DEFAULT 0,
  allowed_absent       NUMERIC DEFAULT 0,
  lates                NUMERIC DEFAULT 0,
  sunday               NUMERIC DEFAULT 0,
  ot                   NUMERIC DEFAULT 0,
  manual_loan_deduction NUMERIC DEFAULT -1,
  req_ref              TEXT,
  updated_by           TEXT,
  updated_at           TIMESTAMPTZ DEFAULT now(),
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company   TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  action    TEXT NOT NULL,
  target_id TEXT,
  details   JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_recon_sessions (
  id           TEXT PRIMARY KEY,
  company      TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  month        TEXT NOT NULL,
  status       TEXT DEFAULT 'In Progress',
  bank_balance NUMERIC DEFAULT 0,
  gl_balance   NUMERIC DEFAULT 0,
  difference   NUMERIC DEFAULT 0,
  data         JSONB DEFAULT '{}',
  updated_at   TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bom_items (
  id          TEXT PRIMARY KEY,
  company     TEXT,
  bom_id      TEXT,
  item_code   TEXT,
  description TEXT,
  quantity    NUMERIC DEFAULT 0,
  unit        TEXT,
  data        JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bom_templates (
  id          TEXT PRIMARY KEY,
  company     TEXT,
  name        TEXT,
  product_id  TEXT,
  version     TEXT,
  is_active   BOOLEAN DEFAULT true,
  data        JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_lines (
  id             TEXT PRIMARY KEY,
  company        TEXT NOT NULL,
  fiscal_year    TEXT NOT NULL,
  account_id     TEXT NOT NULL,
  cost_center_id TEXT,
  description    TEXT,
  annual_budget  NUMERIC DEFAULT 0,
  jan_budget     NUMERIC DEFAULT 0,
  feb_budget     NUMERIC DEFAULT 0,
  mar_budget     NUMERIC DEFAULT 0,
  apr_budget     NUMERIC DEFAULT 0,
  may_budget     NUMERIC DEFAULT 0,
  jun_budget     NUMERIC DEFAULT 0,
  jul_budget     NUMERIC DEFAULT 0,
  aug_budget     NUMERIC DEFAULT 0,
  sep_budget     NUMERIC DEFAULT 0,
  oct_budget     NUMERIC DEFAULT 0,
  nov_budget     NUMERIC DEFAULT 0,
  dec_budget     NUMERIC DEFAULT 0,
  created_by     TEXT,
  updated_by     TEXT,
  updated_at     TIMESTAMPTZ DEFAULT now(),
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_manual (
  event_type         TEXT PRIMARY KEY,
  description        TEXT NOT NULL,
  trigger_examples   TEXT[] NOT NULL DEFAULT '{}',
  forms_required     TEXT[] NOT NULL DEFAULT '{}',
  modules_involved   TEXT[] NOT NULL DEFAULT '{}',
  disposal_steps     JSONB NOT NULL DEFAULT '[]',
  gl_entries         JSONB NOT NULL DEFAULT '[]',
  approvals_required TEXT[] NOT NULL DEFAULT '{}',
  exceptions         TEXT[] NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_scenarios (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type        TEXT,
  title       TEXT,
  description TEXT,
  probability REAL DEFAULT 0.5,
  impact      TEXT,
  status      TEXT DEFAULT 'active',
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bypass_log (
  id               TEXT PRIMARY KEY,
  user_id          TEXT,
  user_name        TEXT NOT NULL,
  module           TEXT NOT NULL CHECK (module IN ('Finance','HR','Sales','SCM','Production','HSE','Admin')),
  rule_bypassed    TEXT NOT NULL,
  record_id        TEXT DEFAULT '',
  bypass_reason    TEXT DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
  addressing_date  DATE,
  resolved_by      TEXT,
  resolved_at      TIMESTAMPTZ,
  resolution_notes TEXT DEFAULT '',
  company          TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cutter_daily_logs (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispatch_vehicles (
  id             TEXT PRIMARY KEY,
  company        TEXT NOT NULL,
  vehicle_name   TEXT NOT NULL,
  plate_number   TEXT NOT NULL,
  max_payload_kg NUMERIC(10,2) NOT NULL CHECK (max_payload_kg > 0),
  vehicle_type   TEXT DEFAULT 'Truck',
  is_active      BOOLEAN DEFAULT true,
  notes          TEXT DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_vehicle_plate UNIQUE (company, plate_number)
);

CREATE TABLE IF NOT EXISTS elimination_log (
  elim_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period                TEXT NOT NULL,
  company_pair          TEXT NOT NULL,
  revenue_eliminated    NUMERIC(14,2) NOT NULL DEFAULT 0,
  cogs_eliminated       NUMERIC(14,2) NOT NULL DEFAULT 0,
  receivable_eliminated NUMERIC(14,2) NOT NULL DEFAULT 0,
  payable_eliminated    NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_adjustment        NUMERIC(14,2) NOT NULL DEFAULT 0,
  elimination_entries   JSONB NOT NULL DEFAULT '[]',
  created_by            TEXT NOT NULL DEFAULT 'system',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_tags (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_backups (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  backup_date TEXT,
  file_name   TEXT,
  file_size   INTEGER,
  status      TEXT DEFAULT 'complete',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_config (
  id         TEXT PRIMARY KEY,
  company    TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_message    TEXT NOT NULL,
  message_source   TEXT NOT NULL DEFAULT 'text' CHECK (message_source IN ('text','voice','whatsapp')),
  classified_as    TEXT,
  matched_pattern  TEXT,
  confidence       NUMERIC(4,2),
  workflow_steps   JSONB DEFAULT '[]',
  execution_result JSONB DEFAULT '{}',
  outcome          TEXT CHECK (outcome IN ('approved','rejected','edited_approved','auto_executed','failed')),
  executed_by      TEXT,
  execution_time_ms INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  amount      NUMERIC(14,2) NOT NULL,
  category    TEXT NOT NULL,
  company     TEXT NOT NULL DEFAULT 'GlassCo',
  paid_by     TEXT,
  notes       TEXT,
  recorded_by TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_escalation_alerts (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id     TEXT,
  event_type   TEXT,
  sector       TEXT,
  hours_overdue REAL DEFAULT 0,
  resolved     BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_events (
  id          TEXT PRIMARY KEY,
  sector      TEXT,
  event_type  TEXT,
  detail      TEXT,
  priority    TEXT DEFAULT 'Medium',
  status      TEXT DEFAULT 'Open',
  logged_by   TEXT,
  req_id      TEXT,
  resolved_at TIMESTAMPTZ,
  notes       TEXT,
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fiscal_periods (
  id         TEXT PRIMARY KEY,
  company    TEXT NOT NULL,
  month      TEXT NOT NULL,
  status     TEXT DEFAULT 'Open',
  opened_by  TEXT,
  opened_at  TIMESTAMPTZ,
  closed_by  TEXT,
  closed_at  TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gap_log (
  gap_id            TEXT PRIMARY KEY,
  event_type        TEXT,
  gap_description   TEXT NOT NULL,
  current_behavior  TEXT,
  expected_behavior TEXT,
  dev_prompt        JSONB NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved','Wont Fix')),
  priority          TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Critical')),
  reported_by       TEXT,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generator_logs (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gl_entries_pending_approval (
  entry_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name       TEXT NOT NULL,
  gl_rule_id       TEXT,
  entry_details    JSONB NOT NULL DEFAULT '{}',
  amount_pkr       NUMERIC(14,2) NOT NULL,
  company          TEXT NOT NULL,
  period           TEXT NOT NULL,
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT
);

CREATE TABLE IF NOT EXISTS gl_posting_rules (
  id                   TEXT PRIMARY KEY,
  company              TEXT NOT NULL,
  rule_name            TEXT NOT NULL,
  trigger_event        TEXT NOT NULL,
  subcategory          TEXT,
  debit_account_code   TEXT NOT NULL,
  debit_account_name   TEXT NOT NULL,
  credit_account_code  TEXT NOT NULL,
  credit_account_name  TEXT NOT NULL,
  description_template TEXT,
  payment_mode         TEXT,
  is_active            BOOLEAN DEFAULT true,
  priority             INT DEFAULT 100,
  notes                TEXT,
  created_by           TEXT,
  updated_by           TEXT,
  updated_at           TIMESTAMPTZ DEFAULT now(),
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gl_posting_rules_v2 (
  rule_id             TEXT PRIMARY KEY,
  rule_name           TEXT NOT NULL,
  trigger_event       TEXT NOT NULL,
  debit_account_code  TEXT NOT NULL,
  debit_account_name  TEXT NOT NULL,
  credit_account_code TEXT NOT NULL,
  credit_account_name TEXT NOT NULL,
  amount_formula      TEXT NOT NULL,
  ias_reference       TEXT NOT NULL,
  requires_approval   BOOLEAN NOT NULL DEFAULT false,
  approval_threshold  NUMERIC(14,2),
  period_lock_check   BOOLEAN NOT NULL DEFAULT true,
  agent_authority     TEXT[] NOT NULL DEFAULT '{}',
  validation_rules    JSONB NOT NULL DEFAULT '[]',
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hse_incidents (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type        TEXT,
  severity    TEXT DEFAULT 'Minor',
  description TEXT,
  location    TEXT,
  reported_by TEXT,
  closed      BOOLEAN DEFAULT false,
  closed_at   TIMESTAMPTZ,
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intercompany_settlements (
  id              TEXT PRIMARY KEY,
  from_company    TEXT NOT NULL,
  to_company      TEXT NOT NULL,
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  settlement_date TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
  reference       TEXT DEFAULT '',
  description     TEXT DEFAULT '',
  method          TEXT DEFAULT 'Bank Transfer',
  from_gl_tx_id   TEXT NOT NULL,
  to_gl_tx_id     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Posted' CHECK (status IN ('Posted','Reversed')),
  settled_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ico_diff_companies CHECK (from_company <> to_company)
);

CREATE TABLE IF NOT EXISTS intercompany_transaction_log (
  txn_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_company       TEXT NOT NULL,
  to_company         TEXT NOT NULL,
  amount             NUMERIC(14,2) NOT NULL,
  description        TEXT,
  transaction_type   TEXT NOT NULL CHECK (transaction_type IN ('sale','purchase','transfer','settlement')),
  gl_entry_id_from   TEXT,
  gl_entry_id_to     TEXT,
  eliminated         BOOLEAN NOT NULL DEFAULT false,
  elimination_period TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_company <> to_company)
);

CREATE TABLE IF NOT EXISTS intercompany_transfers (
  id            TEXT PRIMARY KEY,
  from_company  TEXT NOT NULL,
  to_company    TEXT NOT NULL,
  type          TEXT NOT NULL,
  amount        NUMERIC DEFAULT 0,
  description   TEXT,
  date          TEXT,
  from_gl_tx_id TEXT,
  to_gl_tx_id   TEXT,
  status        TEXT DEFAULT 'Posted',
  posted_by     TEXT,
  reference_doc TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learning_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         TEXT,
  staff_message    TEXT,
  classified_as    TEXT,
  owner_feedback   TEXT CHECK (owner_feedback IN ('correct','wrong_pattern','wrong_steps','missing_steps','rejected')),
  pattern_update   JSONB,
  confidence_delta NUMERIC(4,2) DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leave_applications (
  id          TEXT PRIMARY KEY,
  company     TEXT,
  employee_id TEXT,
  leave_type  TEXT,
  from_date   DATE,
  to_date     DATE,
  days        NUMERIC DEFAULT 0,
  reason      TEXT,
  status      TEXT DEFAULT 'Pending',
  approved_by TEXT,
  data        JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS morning_briefings (
  briefing_date TEXT PRIMARY KEY,
  briefing_text TEXT,
  raw_data      JSONB DEFAULT '{}',
  kpis          JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owner_presence_state (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  is_present           BOOLEAN DEFAULT true,
  mode                 TEXT DEFAULT 'active',
  mode_since           TIMESTAMPTZ,
  mode_until           TIMESTAMPTZ,
  auto_reply_enabled   BOOLEAN DEFAULT false,
  escalation_threshold TEXT DEFAULT 'high',
  handled_count        INTEGER DEFAULT 0,
  escalated_count      INTEGER DEFAULT 0,
  pending_review       JSONB DEFAULT '[]',
  last_sync_at         TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pallet_rates (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pattern_library (
  event_id         TEXT PRIMARY KEY,
  trigger_keywords TEXT[] NOT NULL DEFAULT '{}',
  category         TEXT NOT NULL,
  label            TEXT NOT NULL,
  color            TEXT NOT NULL DEFAULT '#3B82F6',
  modules_involved TEXT[] NOT NULL DEFAULT '{}',
  workflow_steps   JSONB NOT NULL DEFAULT '[]',
  times_used       INTEGER NOT NULL DEFAULT 0,
  confidence       NUMERIC(4,2) NOT NULL DEFAULT 0.90,
  defined_by       TEXT NOT NULL DEFAULT 'system',
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS predictive_alerts (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  alert_type    TEXT NOT NULL,
  title         TEXT,
  message       TEXT,
  severity      TEXT DEFAULT 'Medium',
  confidence    INTEGER DEFAULT 70,
  entity_type   TEXT,
  entity_id     TEXT,
  entity_label  TEXT,
  data_snapshot JSONB DEFAULT '{}',
  actioned      BOOLEAN DEFAULT false,
  dismissed     BOOLEAN DEFAULT false,
  action_note   TEXT,
  actioned_by   TEXT,
  actioned_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_holidays (
  id           TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  company      TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  name         TEXT NOT NULL,
  is_optional  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (company, holiday_date, name)
);

CREATE TABLE IF NOT EXISTS saas_clients (
  client_id     TEXT PRIMARY KEY,
  company_name  TEXT NOT NULL,
  industry      TEXT NOT NULL,
  tier          TEXT NOT NULL DEFAULT 'starter' CHECK (tier IN ('starter','professional','enterprise')),
  max_users     INTEGER NOT NULL DEFAULT 25,
  max_companies INTEGER NOT NULL DEFAULT 1,
  max_api_calls INTEGER NOT NULL DEFAULT 500,
  owner_name    TEXT NOT NULL,
  owner_email   TEXT NOT NULL,
  owner_phone   TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  onboarded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_locations (
  id          TEXT PRIMARY KEY,
  company     TEXT NOT NULL,
  code        TEXT NOT NULL,
  description TEXT,
  zone        TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tag_master (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tempering_oven_config (
  id                 TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  company            TEXT NOT NULL,
  oven_id            TEXT NOT NULL,
  oven_name          TEXT NOT NULL,
  max_capacity_kg    NUMERIC(10,2) NOT NULL,
  max_sqft_per_batch NUMERIC(10,2) NOT NULL,
  notes              TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (company, oven_id)
);

CREATE TABLE IF NOT EXISTS unknown_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_message   TEXT NOT NULL,
  extracted_info     JSONB NOT NULL DEFAULT '{}',
  suggested_category TEXT,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','defined','dismissed')),
  pattern_created_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_rates (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_sla (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  vendor_name      TEXT NOT NULL,
  company          TEXT,
  active           BOOLEAN DEFAULT true,
  total_orders     INTEGER DEFAULT 0,
  breach_count     INTEGER DEFAULT 0,
  next_rate_review TEXT,
  reminded         BOOLEAN DEFAULT false,
  data             JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_expenses (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_trips (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wazir_conversations (
  id                  TEXT PRIMARY KEY,
  thread_id           TEXT,
  role                TEXT NOT NULL,
  content             TEXT NOT NULL,
  tool_calls          JSONB DEFAULT '[]',
  tool_results        JSONB DEFAULT '[]',
  mood_tag            TEXT,
  related_decision_id TEXT,
  channel             TEXT DEFAULT 'app',
  timestamp           TIMESTAMPTZ DEFAULT now(),
  tokens_used         INTEGER,
  model_used          TEXT
);

CREATE TABLE IF NOT EXISTS wazir_decisions (
  id                   TEXT PRIMARY KEY,
  company              TEXT,
  decision_type        TEXT NOT NULL,
  subject              TEXT NOT NULL,
  context              JSONB DEFAULT '{}',
  decision_text        TEXT,
  decided_by           TEXT,
  decided_at           TIMESTAMPTZ DEFAULT now(),
  amount               NUMERIC(14,2),
  related_docs         JSONB DEFAULT '[]',
  outcome_status       TEXT,
  outcome_evaluated_at TIMESTAMPTZ,
  outcome_notes        TEXT,
  outcome_numeric      NUMERIC(14,2),
  lessons_extracted    BOOLEAN DEFAULT false,
  tags                 TEXT[] DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wazir_lessons (
  id               TEXT PRIMARY KEY,
  category         TEXT,
  pattern          TEXT NOT NULL,
  evidence_count   INTEGER DEFAULT 1,
  confidence       NUMERIC(3,2) DEFAULT 0.5,
  source_decisions TEXT[] DEFAULT '{}',
  first_observed   TIMESTAMPTZ DEFAULT now(),
  last_reinforced  TIMESTAMPTZ DEFAULT now(),
  is_active        BOOLEAN DEFAULT true,
  tags             TEXT[] DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wazir_voice_samples (
  id             TEXT PRIMARY KEY,
  channel        TEXT,
  recipient_type TEXT,
  context        TEXT,
  message        TEXT NOT NULL,
  tone_tags      TEXT[] DEFAULT '{}',
  language       TEXT DEFAULT 'ur-en',
  captured_at    TIMESTAMPTZ DEFAULT now(),
  is_approved    BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wazir_weekly_reports (
  id                TEXT PRIMARY KEY,
  report_date       DATE NOT NULL,
  week_number       INTEGER,
  year              INTEGER,
  companies_covered TEXT[] DEFAULT '{}',
  headline          TEXT,
  body              TEXT NOT NULL,
  top_concerns      JSONB DEFAULT '[]',
  top_opportunities JSONB DEFAULT '[]',
  big_question      TEXT,
  metrics_snapshot  JSONB DEFAULT '{}',
  whatsapp_sent_at  TIMESTAMPTZ,
  owner_replied     BOOLEAN DEFAULT false,
  owner_reply       TEXT,
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  cost_pkr          NUMERIC(10,2),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weight_master (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_log (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  direction  TEXT DEFAULT 'outbound',
  from_num   TEXT,
  to_num     TEXT,
  message    TEXT,
  status     TEXT DEFAULT 'sent',
  wa_msg_id  TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Disable RLS on all newly created tables
-- ============================================================
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'agent_alert_history','agent_api_calls','agent_audit_log','agent_decisions',
    'agent_episodic_memory','agent_execution_log','agent_memories','agent_permissions',
    'agent_procedural_memory','agent_rate_config','agent_rate_limits',
    'agent_semantic_memory','agent_sessions','agent_table_access','anomaly_log',
    'anomaly_thresholds','asset_registry','attendance_overrides','audit_log',
    'bank_recon_sessions','bom_items','bom_templates','budget_lines',
    'business_manual','business_scenarios','bypass_log','cutter_daily_logs',
    'departments','dispatch_vehicles','elimination_log','employee_tags',
    'erp_backups','erp_config','event_history','expenses',
    'factory_escalation_alerts','factory_events','fiscal_periods','gap_log',
    'generator_logs','gl_entries_pending_approval','gl_posting_rules',
    'gl_posting_rules_v2','hse_incidents','intercompany_settlements',
    'intercompany_transaction_log','intercompany_transfers','learning_log',
    'leave_applications','morning_briefings','owner_presence_state','pallet_rates',
    'pattern_library','predictive_alerts','public_holidays','saas_clients',
    'stock_locations','tag_master','tempering_oven_config','unknown_log',
    'vendor_rates','vendor_sla','vehicles','vehicle_expenses','vehicle_trips',
    'wazir_conversations','wazir_decisions','wazir_lessons','wazir_voice_samples',
    'wazir_weekly_reports','weight_master','whatsapp_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated', tbl);
  END LOOP;
END $$;

SELECT '72 missing tables created. RLS disabled. Done.' AS status;
