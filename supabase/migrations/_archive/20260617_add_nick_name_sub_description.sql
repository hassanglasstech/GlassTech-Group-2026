-- ════════════════════════════════════════════════════════════════════
-- Add product columns the app writes but older DBs may be missing.
-- Generated: 2026-06-17
--
-- Symptom this fixes:
--   "products cloud sync — N chunk(s) failed: Could not find the 'nick_name'
--    column of 'products' in the schema cache"
--   …seen when saving / uploading an image from the Nippon Material Master.
--
-- Cause: the app's saveProducts() now writes nick_name (and sub_description)
-- for Nippon rows, but those columns only get created by the full v3 master
-- migration (20260612_nippon_master_v3.sql). If that hasn't been run yet, every
-- product upsert is rejected and nothing saves (including image_url).
--
-- This is the minimal, non-destructive fix — it ONLY adds the columns, it does
-- NOT touch product data. Safe to re-run.
--
-- Run in Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE products ADD COLUMN IF NOT EXISTS nick_name      TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_description TEXT;

-- Force PostgREST to refresh its schema cache so the new columns are usable
-- immediately — without this, saves keep 404-ing against the cached schema.
NOTIFY pgrst, 'reload schema';
