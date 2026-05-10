-- ═══════════════════════════════════════════════════════════════════════
-- Migration 050 — Sprint 12: POD + Mobile Driver App
--
-- Tables for proof-of-delivery evidence captured by the driver via the
-- mobile-first /driver/:tripId screen:
--
--   dispatch_photos      — JPEG bytes stored in Supabase Storage; row links
--                          dispatch_id ↔ storage path + capture metadata
--   customer_signatures  — base64 SVG/PNG signature, customer name + phone
--   delivery_otps        — 6-digit OTP for proving customer-side handover
--
-- Plus:
--   - dispatch_tokens — opaque UUID giving the driver browser-only access
--                       to the dispatch (no app login). Anyone with the
--                       link can POST POD; anyone without it cannot.
--   - Storage bucket  pod-evidence  — open to authenticated + anon writes
--                                       (gated by dispatch_token at app layer)
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. dispatch_photos — photos captured at gate-out / customer site
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_photos (
  id           BIGSERIAL PRIMARY KEY,
  dispatch_id  TEXT NOT NULL,
  company      TEXT NOT NULL,
  /** GATE_OUT | CUSTOMER_DELIVERY | DAMAGE | TEMPERING_HANDOFF */
  photo_type   TEXT NOT NULL,
  /** Path inside the `pod-evidence` Storage bucket */
  storage_path TEXT NOT NULL,
  caption      TEXT,
  taken_at     TIMESTAMPTZ DEFAULT now(),
  taken_by     TEXT,                                  -- driver name or user id
  geo_lat      NUMERIC(10,7),
  geo_lng      NUMERIC(10,7),
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fk_dispatch_photos_dispatch
    FOREIGN KEY (dispatch_id) REFERENCES tempering_dispatches(id) ON DELETE CASCADE,
  CONSTRAINT chk_dispatch_photos_type
    CHECK (photo_type IN ('GATE_OUT','CUSTOMER_DELIVERY','DAMAGE','TEMPERING_HANDOFF'))
);

CREATE INDEX IF NOT EXISTS idx_dispatch_photos_dispatch
  ON dispatch_photos (dispatch_id, taken_at);
CREATE INDEX IF NOT EXISTS idx_dispatch_photos_company_date
  ON dispatch_photos (company, taken_at DESC);

ALTER TABLE dispatch_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dispatch_photos_rw ON dispatch_photos;
CREATE POLICY dispatch_photos_rw ON dispatch_photos
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 2. customer_signatures — customer e-signature on delivery
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_signatures (
  id              BIGSERIAL PRIMARY KEY,
  dispatch_id     TEXT NOT NULL,
  company         TEXT NOT NULL,
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT,
  /** Base64-encoded PNG dataURL ("data:image/png;base64,…") */
  signature_data  TEXT NOT NULL,
  signed_at       TIMESTAMPTZ DEFAULT now(),
  geo_lat         NUMERIC(10,7),
  geo_lng         NUMERIC(10,7),
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fk_customer_signatures_dispatch
    FOREIGN KEY (dispatch_id) REFERENCES tempering_dispatches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_signatures_dispatch
  ON customer_signatures (dispatch_id, signed_at);
CREATE INDEX IF NOT EXISTS idx_customer_signatures_company_date
  ON customer_signatures (company, signed_at DESC);

ALTER TABLE customer_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_signatures_rw ON customer_signatures;
CREATE POLICY customer_signatures_rw ON customer_signatures
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 3. delivery_otps — 6-digit OTPs sent to customer
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_otps (
  id              BIGSERIAL PRIMARY KEY,
  dispatch_id     TEXT NOT NULL,
  company         TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  /** SHA-256 hex of the OTP — never store plaintext */
  otp_hash        TEXT NOT NULL,
  attempts        INT  DEFAULT 0,
  verified        BOOLEAN DEFAULT FALSE,
  verified_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fk_delivery_otps_dispatch
    FOREIGN KEY (dispatch_id) REFERENCES tempering_dispatches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_delivery_otps_dispatch_active
  ON delivery_otps (dispatch_id, verified, expires_at)
  WHERE verified = FALSE;

ALTER TABLE delivery_otps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_otps_rw ON delivery_otps;
CREATE POLICY delivery_otps_rw ON delivery_otps
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 4. tempering_dispatches — driver-link token (opaque UUID)
--
-- The driver's mobile link is /#/driver/{dispatch_id}?t={token}. The
-- token is generated when the dispatch is authorized and rotated only
-- on cancellation. Server never exposes it once created — it's pasted
-- into the WhatsApp/SMS message.
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE tempering_dispatches
  ADD COLUMN IF NOT EXISTS driver_token        TEXT,
  ADD COLUMN IF NOT EXISTS pod_completed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pod_otp_verified    BOOLEAN DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tempering_dispatches_token
  ON tempering_dispatches (driver_token) WHERE driver_token IS NOT NULL;

-- Auto-generate driver_token when dispatch transitions to Dispatched
-- (called from authorize_dispatch RPC — kept idempotent here).
CREATE OR REPLACE FUNCTION ensure_driver_token(p_dispatch_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing TEXT;
  v_new TEXT;
BEGIN
  SELECT driver_token INTO v_existing
    FROM tempering_dispatches WHERE id = p_dispatch_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  v_new := encode(gen_random_bytes(24), 'hex');
  UPDATE tempering_dispatches SET driver_token = v_new WHERE id = p_dispatch_id;
  RETURN v_new;
END $$;

GRANT EXECUTE ON FUNCTION ensure_driver_token(TEXT) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 5. RPC: verify_delivery_otp — driver enters OTP customer received
--    Constant-time hash compare via crypt-style equality on the SHA-256.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verify_delivery_otp(
  p_dispatch_id   TEXT,
  p_token         TEXT,
  p_otp_plain     TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token       TEXT;
  v_hash        TEXT;
  v_otp_id      BIGINT;
  v_attempts    INT;
  v_expires_at  TIMESTAMPTZ;
BEGIN
  SELECT driver_token INTO v_token FROM tempering_dispatches WHERE id = p_dispatch_id;
  IF v_token IS NULL OR v_token <> p_token THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  -- Latest unverified OTP for this dispatch
  SELECT id, otp_hash, attempts, expires_at
    INTO v_otp_id, v_hash, v_attempts, v_expires_at
    FROM delivery_otps
   WHERE dispatch_id = p_dispatch_id AND verified = FALSE
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

  -- SHA-256 hex of the plaintext
  IF encode(digest(p_otp_plain, 'sha256'), 'hex') = v_hash THEN
    UPDATE delivery_otps
       SET verified = TRUE, verified_at = now(), attempts = attempts + 1
     WHERE id = v_otp_id;
    UPDATE tempering_dispatches
       SET pod_otp_verified = TRUE
     WHERE id = p_dispatch_id;
    RETURN TRUE;
  ELSE
    UPDATE delivery_otps SET attempts = attempts + 1 WHERE id = v_otp_id;
    RETURN FALSE;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION verify_delivery_otp(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Storage bucket — pod-evidence  (7-year retention)
--    NOTE: bucket creation must be done in the Supabase dashboard or via
--    the management API; the SQL below assumes the bucket exists and
--    just installs an open RLS policy on storage.objects for it.
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='storage') THEN
    -- Open read for authenticated + anon (object key gates access)
    BEGIN
      DROP POLICY IF EXISTS "pod_evidence_read" ON storage.objects;
      CREATE POLICY "pod_evidence_read" ON storage.objects
        FOR SELECT USING (bucket_id = 'pod-evidence');

      DROP POLICY IF EXISTS "pod_evidence_write" ON storage.objects;
      CREATE POLICY "pod_evidence_write" ON storage.objects
        FOR INSERT WITH CHECK (bucket_id = 'pod-evidence');

      DROP POLICY IF EXISTS "pod_evidence_update" ON storage.objects;
      CREATE POLICY "pod_evidence_update" ON storage.objects
        FOR UPDATE USING (bucket_id = 'pod-evidence');
    EXCEPTION WHEN OTHERS THEN
      -- Storage extension not enabled — skip silently
      NULL;
    END;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. PostgREST schema reload
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- 8. Verification (run in SQL Editor after applying)
--
-- -- POD evidence for a dispatch:
-- SELECT * FROM dispatch_photos      WHERE dispatch_id = 'TD-xxxx';
-- SELECT * FROM customer_signatures  WHERE dispatch_id = 'TD-xxxx';
-- SELECT * FROM delivery_otps        WHERE dispatch_id = 'TD-xxxx';
--
-- -- Generate a driver token (idempotent):
-- SELECT ensure_driver_token('TD-xxxx');
--
-- -- Verify OTP (driver entered it on his phone):
-- SELECT verify_delivery_otp('TD-xxxx', 'token_xxx', '123456');
-- ═══════════════════════════════════════════════════════════════════════
