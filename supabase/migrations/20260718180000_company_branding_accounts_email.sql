-- ============================================================================
-- company_branding — separate accounts/billing email
-- Migration: 20260718180000_company_branding_accounts_email.sql
-- Author: Claude (Dev) · Date: 2026-07-18
--
-- WHY: Industry practice — quotations/sales orders carry the sales/general email,
-- while invoices/receipts carry the accounts/billing email. One extra column lets
-- the letterhead show the right contact per document type. Falls back to `email`
-- when blank. Idempotent.
-- ============================================================================

alter table public.company_branding
  add column if not exists accounts_email text;

comment on column public.company_branding.accounts_email is
  'Accounts/billing email shown on invoices & receipts (falls back to email).';
