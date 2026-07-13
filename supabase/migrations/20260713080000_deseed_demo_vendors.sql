-- ============================================================================
-- De-seed demo/placeholder vendors (2026-07-13)
-- Founder applies in the Supabase SQL editor (MCP is read-only).
-- ============================================================================
-- The app previously seeded 8 hardcoded demo vendors into localStorage + the
-- vendors table on first run: PSG / AHM / LAKHANI (Glassco/Tempering, with fake
-- rates) and 5 Nippon hardware suppliers. Per the founder, the registry must
-- show ONLY real, user-added vendors. The app-side seed arrays + seeding loop
-- were removed (modules/shared/services/appService.ts) and the local cache is
-- purged on the db_version bump (1.0 -> 1.1). This migration removes the DB rows.
--
-- Safe + idempotent: DELETE of already-absent ids is a no-op. Scoped to the exact
-- seeded ids so no real vendor is ever touched.
-- ============================================================================

DELETE FROM public.vendors
WHERE id IN (
  'VEND-PSG-001', 'VEND-AHM-002', 'VEND-LAK-003',
  'VEND-NIP-KL-001', 'VEND-NIP-NB-002', 'VEND-NIP-SL-003', 'VEND-NIP-SW-004', 'VEND-NIP-FR-005'
);
