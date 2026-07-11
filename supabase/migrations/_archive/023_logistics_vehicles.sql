-- ═══════════════════════════════════════════════════════════════════════
-- Migration 023: Logistics Vehicle Payload Guard
-- Replaces incorrect oven capacity constraints with transport safety limits.
-- Glass is outsourced to tempering vendors — we guard vehicle payload, not ovens.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Drop oven constraint infrastructure ──────────────────────────
-- tempering_oven_config was incorrectly modeling in-house ovens.
-- GlassTech does NOT own tempering ovens — glass is sent to external vendors.
DROP TABLE IF EXISTS tempering_oven_config CASCADE;

-- ── 2. Dispatch Vehicles table ──────────────────────────────────────
-- Tracks rated payload for all transport vehicles used in subcontracting.
CREATE TABLE IF NOT EXISTS dispatch_vehicles (
  id           TEXT PRIMARY KEY,
  company      TEXT NOT NULL,
  vehicle_name TEXT NOT NULL,                        -- e.g., "Mazda 4-Ton", "Shehzore"
  plate_number TEXT NOT NULL,
  max_payload_kg NUMERIC(10,2) NOT NULL CHECK (max_payload_kg > 0),
  vehicle_type TEXT DEFAULT 'Truck',                 -- Pickup, Truck, Loader, Shehzore, Container
  is_active    BOOLEAN DEFAULT true,
  notes        TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_vehicle_plate UNIQUE (company, plate_number)
);

CREATE INDEX IF NOT EXISTS idx_dispatch_vehicles_company ON dispatch_vehicles(company);
CREATE INDEX IF NOT EXISTS idx_dispatch_vehicles_active  ON dispatch_vehicles(is_active) WHERE is_active = true;

-- RLS
ALTER TABLE dispatch_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY dv_read  ON dispatch_vehicles FOR SELECT USING (true);
CREATE POLICY dv_write ON dispatch_vehicles FOR INSERT WITH CHECK (true);
CREATE POLICY dv_update ON dispatch_vehicles FOR UPDATE USING (true);

-- ── 3. Seed common vehicles ─────────────────────────────────────────
INSERT INTO dispatch_vehicles (id, company, vehicle_name, plate_number, max_payload_kg, vehicle_type, notes) VALUES
  ('VH-GLS-001', 'Glassco', 'Mazda 4-Ton',    'LEA-1234', 3500, 'Truck',     'Primary tempering dispatch vehicle'),
  ('VH-GLS-002', 'Glassco', 'Shehzore 1-Ton',  'LEA-5678', 1200, 'Shehzore', 'Light loads, local tempering runs'),
  ('VH-GLS-003', 'Glassco', 'Hino Truck',       'LEB-9012', 5000, 'Truck',     'Heavy loads — long distance'),
  ('VH-GTK-001', 'GTK',     'Suzuki Pickup',    'LEC-3456', 800,  'Pickup',    'GTK local dispatch'),
  ('VH-GTK-002', 'GTK',     'Mazda 3.5-Ton',    'LEC-7890', 3000, 'Truck',     'GTK main dispatch truck'),
  ('VH-FAC-001', 'Factory', 'Factory Loader',    'LED-1111', 4000, 'Loader',    'Shared fleet vehicle')
ON CONFLICT DO NOTHING;

-- ── 4. Add vehicle_id and driver to tempering_dispatches schema ─────
-- The tempering_dispatches table uses data JSONB, but we add indexed
-- columns for query performance on the dispatch_vehicle FK.
ALTER TABLE tempering_dispatches
  ADD COLUMN IF NOT EXISTS dispatch_vehicle_id TEXT REFERENCES dispatch_vehicles(id),
  ADD COLUMN IF NOT EXISTS total_weight_kg     NUMERIC(10,2) DEFAULT 0;

-- ── 5. RPC: Validate Vehicle Payload ────────────────────────────────
-- Called before finalizing any dispatch. Returns error if overloaded.
CREATE OR REPLACE FUNCTION validate_vehicle_payload(
  p_vehicle_id     TEXT,
  p_total_weight_kg NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_kg     NUMERIC;
  v_name       TEXT;
  v_plate      TEXT;
  v_utilization NUMERIC;
BEGIN
  IF p_vehicle_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'warning', 'No vehicle selected — payload check skipped.');
  END IF;

  SELECT max_payload_kg, vehicle_name, plate_number
  INTO v_max_kg, v_name, v_plate
  FROM dispatch_vehicles
  WHERE id = p_vehicle_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vehicle not found or inactive: ' || p_vehicle_id);
  END IF;

  v_utilization := ROUND((p_total_weight_kg / v_max_kg) * 100, 1);

  IF p_total_weight_kg > v_max_kg THEN
    RETURN jsonb_build_object(
      'success',     false,
      'error',       format('VehicleOverloadError: Total weight %.1f kg exceeds %s (%s) max payload %.1f kg. Utilization: %s%%. Remove pieces or select a larger vehicle.',
                            p_total_weight_kg, v_name, v_plate, v_max_kg, v_utilization),
      'vehicleName', v_name,
      'plateNumber', v_plate,
      'maxPayloadKg', v_max_kg,
      'totalWeightKg', p_total_weight_kg,
      'utilization',   v_utilization
    );
  END IF;

  RETURN jsonb_build_object(
    'success',       true,
    'vehicleName',   v_name,
    'plateNumber',   v_plate,
    'maxPayloadKg',  v_max_kg,
    'totalWeightKg', p_total_weight_kg,
    'utilization',   v_utilization
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_vehicle_payload TO authenticated;
GRANT SELECT ON dispatch_vehicles TO authenticated;
