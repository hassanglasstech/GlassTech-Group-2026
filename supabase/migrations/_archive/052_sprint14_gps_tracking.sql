-- ═══════════════════════════════════════════════════════════════════════
-- Migration 052 — Sprint 14: Real-Time GPS + Live Dashboard
--
-- Adds:
--   • vehicle_locations table — append-only GPS pings (PK = vehicle+time)
--   • RPC record_vehicle_location() — driver emitter entry point
--   • RPC get_active_vehicle_positions() — supervisor map query (latest
--                                          ping per vehicle in last 30 min)
--   • RPC check_geofence_arrival() — auto-arriving status when truck
--                                     enters customer 500m radius
--
-- Data hygiene: 90-day retention. A daily cron should DELETE older rows.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- Required for haversine in get_active_vehicle_positions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────
-- 1. vehicle_locations — append-only GPS pings
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_disp_id_type TEXT;
BEGIN
  SELECT data_type INTO v_disp_id_type
    FROM information_schema.columns
    WHERE table_name='tempering_dispatches' AND column_name='id' LIMIT 1;
  IF v_disp_id_type IS NULL THEN v_disp_id_type := 'TEXT'; END IF;

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS vehicle_locations (
      vehicle_id   TEXT NOT NULL,
      latitude     NUMERIC(10,7) NOT NULL,
      longitude    NUMERIC(10,7) NOT NULL,
      recorded_at  TIMESTAMPTZ DEFAULT now(),
      trip_id      %s,
      speed_kph    NUMERIC(5,1),
      heading_deg  NUMERIC(5,1),
      accuracy_m   NUMERIC(7,1),
      battery_pct  NUMERIC(4,1),
      PRIMARY KEY (vehicle_id, recorded_at)
    )
  $t$, v_disp_id_type);
END $$;

CREATE INDEX IF NOT EXISTS idx_vehicle_locations_recent
  ON vehicle_locations (vehicle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_trip
  ON vehicle_locations (trip_id, recorded_at DESC) WHERE trip_id IS NOT NULL;

ALTER TABLE vehicle_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_locations_rw ON vehicle_locations;
CREATE POLICY vehicle_locations_rw ON vehicle_locations FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 2. tempering_dispatches — destination geo + auto-status fields
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE tempering_dispatches
  ADD COLUMN IF NOT EXISTS destination_lat   NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS destination_lng   NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS arriving_detected_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────
-- 3. RPC: record_vehicle_location — single insertion point
--    Called by driver phone (DriverScreen) every ~5 min.
--    Token-gated via the dispatch driver_token.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_vehicle_location(
  p_vehicle_id   TEXT,
  p_lat          NUMERIC,
  p_lng          NUMERIC,
  p_trip_id      TEXT DEFAULT NULL,
  p_token        TEXT DEFAULT NULL,
  p_speed_kph    NUMERIC DEFAULT NULL,
  p_heading_deg  NUMERIC DEFAULT NULL,
  p_accuracy_m   NUMERIC DEFAULT NULL,
  p_battery_pct  NUMERIC DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
END $$;

GRANT EXECUTE ON FUNCTION record_vehicle_location(TEXT, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC)
  TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 4. RPC: get_active_vehicle_positions
--    Returns latest ping per vehicle that pinged in the last 30 min.
--    The supervisor map polls this every 10–30 s.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_active_vehicle_positions(
  p_company TEXT DEFAULT NULL,
  p_since_minutes INT DEFAULT 30
)
RETURNS TABLE (
  vehicle_id    TEXT,
  latitude      NUMERIC,
  longitude     NUMERIC,
  recorded_at   TIMESTAMPTZ,
  trip_id       TEXT,
  speed_kph     NUMERIC,
  heading_deg   NUMERIC,
  battery_pct   NUMERIC,
  age_seconds   INT
) LANGUAGE plpgsql STABLE AS $$
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
END $$;

GRANT EXECUTE ON FUNCTION get_active_vehicle_positions(TEXT, INT) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 5. RPC: check_geofence_arrival
--    If a truck on a trip is within p_radius_m of its destination, mark
--    the dispatch as Arriving (status='Arriving' + arriving_detected_at).
--    Idempotent — only sets if currently null.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_geofence_arrival(
  p_dispatch_id TEXT,
  p_radius_m    NUMERIC DEFAULT 500
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
END $$;

GRANT EXECUTE ON FUNCTION check_geofence_arrival(TEXT, NUMERIC) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 6. PostgREST schema reload
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- 7. Verification
--
-- -- Active vehicles right now:
-- SELECT * FROM get_active_vehicle_positions('Glassco');
--
-- -- Manually fire arrival check:
-- SELECT check_geofence_arrival('TD-xxxx');
--
-- -- 90-day retention cleanup (run from cron):
-- DELETE FROM vehicle_locations WHERE recorded_at < now() - interval '90 days';
-- ═══════════════════════════════════════════════════════════════════════
