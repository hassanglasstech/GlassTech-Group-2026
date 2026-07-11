-- ═══════════════════════════════════════════════════════════════════════
-- Migration 051 — Sprint 13: Smart Logistics Engine
--
-- Adds:
--   • driver_licenses table — license + permit expiry tracking
--   • sla_breaches table     — append-only log of vendor SLA violations
--   • Trip cost flat columns on tempering_dispatches (fuel/driver/tolls/maintenance)
--   • RPC log_sla_breach() — idempotent breach logger
--   • RPC trip_profitability() — Charge − total costs
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. driver_licenses — driver document expiry registry
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_licenses (
  id              BIGSERIAL PRIMARY KEY,
  company         TEXT NOT NULL,
  driver_name     TEXT NOT NULL,
  driver_phone    TEXT,
  cnic            TEXT,
  license_no      TEXT,
  license_expiry  DATE,
  permit_no       TEXT,
  permit_expiry   DATE,
  is_active       BOOLEAN DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_driver_licenses_cnic UNIQUE (company, cnic)
);

CREATE INDEX IF NOT EXISTS idx_driver_licenses_company
  ON driver_licenses (company) WHERE is_active = TRUE;

-- Partial index hot-paths the "expiring within 30 days" check
CREATE INDEX IF NOT EXISTS idx_driver_licenses_expiry
  ON driver_licenses (license_expiry, permit_expiry) WHERE is_active = TRUE;

ALTER TABLE driver_licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_licenses_rw ON driver_licenses;
CREATE POLICY driver_licenses_rw ON driver_licenses FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 2. sla_breaches — append-only log of vendor / dispatch SLA violations
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id_type TEXT;
BEGIN
  SELECT data_type INTO v_id_type
    FROM information_schema.columns
    WHERE table_name='tempering_dispatches' AND column_name='id' LIMIT 1;
  IF v_id_type IS NULL THEN v_id_type := 'TEXT'; END IF;

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS sla_breaches (
      id              BIGSERIAL PRIMARY KEY,
      company         TEXT NOT NULL,
      vendor_name     TEXT NOT NULL,
      dispatch_id     %s,
      breach_type     TEXT NOT NULL,    -- LATE_RETURN | DAMAGED | LOST | INVOICE_MISMATCH
      expected_date   DATE,
      actual_date     DATE,
      delay_days      INT,
      detected_at     TIMESTAMPTZ DEFAULT now(),
      notes           TEXT,
      resolved        BOOLEAN DEFAULT FALSE,
      resolved_at     TIMESTAMPTZ,
      resolved_by     TEXT,
      CONSTRAINT chk_sla_breach_type CHECK (
        breach_type IN ('LATE_RETURN','DAMAGED','LOST','INVOICE_MISMATCH','LICENSE_EXPIRY')
      )
    )
  $t$, v_id_type);
END $$;

CREATE INDEX IF NOT EXISTS idx_sla_breaches_vendor
  ON sla_breaches (vendor_name, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_company_unresolved
  ON sla_breaches (company, detected_at DESC) WHERE resolved = FALSE;

ALTER TABLE sla_breaches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sla_breaches_rw ON sla_breaches;
CREATE POLICY sla_breaches_rw ON sla_breaches FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 3. tempering_dispatches — trip cost flat columns
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE tempering_dispatches
  ADD COLUMN IF NOT EXISTS fuel_cost            NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_allowance     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS toll_charges         NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_cost     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_return_date DATE;

CREATE INDEX IF NOT EXISTS idx_tempering_expected_return
  ON tempering_dispatches (expected_return_date)
  WHERE expected_return_date IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 4. RPC: log_sla_breach — idempotent breach record
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_sla_breach(
  p_company       TEXT,
  p_vendor_name   TEXT,
  p_dispatch_id   TEXT,
  p_breach_type   TEXT,
  p_expected_date DATE,
  p_actual_date   DATE,
  p_notes         TEXT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
END $$;

GRANT EXECUTE ON FUNCTION log_sla_breach(TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT)
  TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 5. RPC: trip_profitability — Charge − all costs for a dispatch
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trip_profitability(p_dispatch_id TEXT)
RETURNS TABLE (
  dispatch_id        TEXT,
  charge             NUMERIC,
  fuel_cost          NUMERIC,
  driver_allowance   NUMERIC,
  toll_charges       NUMERIC,
  maintenance_cost   NUMERIC,
  total_costs        NUMERIC,
  net_profit         NUMERIC,
  margin_pct         NUMERIC
) LANGUAGE plpgsql STABLE AS $$
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
END $$;

GRANT EXECUTE ON FUNCTION trip_profitability(TEXT) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 6. PostgREST schema reload
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- 7. Verification
--
-- -- Drivers expiring within 30 days:
-- SELECT driver_name, license_expiry, permit_expiry
--   FROM driver_licenses WHERE is_active
--     AND (license_expiry < CURRENT_DATE + 30 OR permit_expiry < CURRENT_DATE + 30);
--
-- -- Open vendor SLA breaches:
-- SELECT vendor_name, breach_type, delay_days, dispatch_id
--   FROM sla_breaches WHERE NOT resolved ORDER BY detected_at DESC;
--
-- -- Trip P&L for a dispatch:
-- SELECT * FROM trip_profitability('TD-xxxx');
-- ═══════════════════════════════════════════════════════════════════════
