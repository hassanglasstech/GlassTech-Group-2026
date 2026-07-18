-- ============================================================================
-- company_branding — dual header logos (GlassTech + KinLong)
-- Migration: 20260718170000_company_branding_dual_header_logos.sql
-- Author: Claude (Dev) · Date: 2026-07-18
--
-- WHY: Nippon prints under TWO brand headers — GlassTech (group) and KinLong
-- (principal partner) — chosen per document via the print-type toggle
-- (KinLong / Glasstech / General). The letterhead now picks the matching header
-- logo per variant. These two columns hold those base64 logos (same shape as the
-- existing logo_data_url, which stays the "own / General" logo).
--
-- Idempotent. Base64 logos live as text (app caps upload size client-side).
-- ============================================================================

alter table public.company_branding
  add column if not exists logo_glasstech_data_url text,
  add column if not exists logo_kinlong_data_url   text;

comment on column public.company_branding.logo_glasstech_data_url is
  'Header logo (base64 data URI) shown on the "Glasstech" print-type variant.';
comment on column public.company_branding.logo_kinlong_data_url is
  'Header logo (base64 data URI) shown on the "KinLong" print-type variant.';
