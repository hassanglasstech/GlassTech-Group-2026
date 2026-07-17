-- ============================================================================
-- Nippon Customer Portal — customer-scoped RLS hardening
-- Migration: 20260718150000_nippon_customer_portal_rls.sql
-- Author: Claude (Dev/Security agent) · Date: 2026-07-18
--
-- WHY: The customer self-service portal separated each customer's data ONLY in
-- the browser (a React `.filter()`), while the database RLS on quotations/clients/
-- invoices/store_items was COMPANY-scoped. Because a `customer` login carries
-- allowed_companies=['Nippon'], that JWT could read (and in some cases write) the
-- WHOLE company's data via the REST API — every customer's orders, prices, PII,
-- invoices, stock/cost, plus the product master. This migration adds a
-- customer-scoped layer so a `customer` JWT is confined to ITS OWN client's rows.
--
-- MODEL: a customer is matched to their client row by EMAIL
--   user_profiles.email (login)  ==  clients.email  (lower/trim)
-- => FOUNDER ACTION: for every customer login you create, set the matching
--    clients.email = that login email, or the customer will (safely) see NOTHING.
--
-- Idempotent: safe to run more than once. Runs as a single transaction in the
-- Supabase SQL editor — any error rolls the whole thing back (fail-safe).
-- Staff roles (owner / super_admin / admin_officer) are UNAFFECTED.
-- ============================================================================

-- ── 0. Helper functions ─────────────────────────────────────────────────────
-- Caller's role (null for service-role / unauthenticated → treated as non-customer).
create or replace function public.auth_user_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.user_profiles where id = auth.uid()
$$;

-- The client ids whose email matches the caller's login email. SECURITY DEFINER
-- so it can resolve the mapping regardless of the caller's own RLS.
create or replace function public.auth_customer_client_ids()
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(c.id), '{}'::text[])
  from public.clients c
  where coalesce(c.email,'') <> ''
    and lower(c.email) = lower((select email from public.user_profiles where id = auth.uid()))
$$;

-- Granted to anon as well so RLS policy evaluation never errors for logged-out
-- requests (both simply return null / '{}' when there is no authenticated user).
grant execute on function public.auth_user_role() to authenticated, anon;
grant execute on function public.auth_customer_client_ids() to authenticated, anon;

-- ── 1. QUOTATIONS — customer sees/writes only their own client's rows ────────
drop policy if exists quotations_strict_select on public.quotations;
create policy quotations_strict_select on public.quotations for select using (
  auth_user_is_super()
  or (auth_user_role() = 'customer' and company = 'Nippon' and client_id = any(auth_customer_client_ids()))
  or (auth_user_role() is distinct from 'customer'
      and auth_user_companies() is not null and company = any(auth_user_companies()))
);

drop policy if exists quotations_strict_insert on public.quotations;
create policy quotations_strict_insert on public.quotations for insert with check (
  auth_user_is_super()
  or (auth_user_role() = 'customer' and company = 'Nippon' and client_id = any(auth_customer_client_ids()))
  or (auth_user_role() is distinct from 'customer'
      and auth_user_companies() is not null and company = any(auth_user_companies()))
);

drop policy if exists quotations_strict_update on public.quotations;
create policy quotations_strict_update on public.quotations for update using (
  auth_user_is_super()
  or (auth_user_role() = 'customer' and company = 'Nippon' and client_id = any(auth_customer_client_ids()))
  or (auth_user_role() is distinct from 'customer'
      and auth_user_companies() is not null and company = any(auth_user_companies()))
) with check (
  auth_user_is_super()
  or (auth_user_role() = 'customer' and company = 'Nippon' and client_id = any(auth_customer_client_ids()))
  or (auth_user_role() is distinct from 'customer'
      and auth_user_companies() is not null and company = any(auth_user_companies()))
);

-- Customers may NOT delete orders.
drop policy if exists quotations_strict_delete on public.quotations;
create policy quotations_strict_delete on public.quotations for delete using (
  auth_user_is_super()
  or (auth_user_role() is distinct from 'customer'
      and auth_user_companies() is not null and company = any(auth_user_companies()))
);

-- ── 2. CLIENTS — customer sees only their OWN client row (writes already gated) ─
drop policy if exists clients_strict_select on public.clients;
create policy clients_strict_select on public.clients for select using (
  auth_user_is_super()
  or (auth_user_role() = 'customer' and company = 'Nippon' and id = any(auth_customer_client_ids()))
  or (auth_user_role() is distinct from 'customer'
      and auth_user_companies() is not null and company = any(auth_user_companies()))
);

-- ── 3. PRODUCTS — customer may READ the catalogue, never write it ────────────
drop policy if exists products_company_scoped on public.products;
create policy products_read on public.products for select using (
  current_user_is_group_admin() or (company = any(current_user_companies()))
);
create policy products_write on public.products for all using (
  auth_user_role() is distinct from 'customer'
  and (current_user_is_group_admin() or (company = any(current_user_companies())))
) with check (
  auth_user_role() is distinct from 'customer'
  and (current_user_is_group_admin() or (company = any(current_user_companies())))
);

-- ── 4. PRICE_LISTS — non-customers only (no client dimension to scope by) ─────
-- Customers see standard catalogue rates in the portal; their negotiated rate is
-- applied by staff at quote time (safer: negotiated rate structure isn't exposed).
drop policy if exists price_lists_company_scoped on public.price_lists;
create policy price_lists_company_scoped on public.price_lists for all using (
  auth_user_role() is distinct from 'customer'
  and (current_user_is_group_admin() or (company = any(current_user_companies())))
) with check (
  auth_user_role() is distinct from 'customer'
  and (current_user_is_group_admin() or (company = any(current_user_companies())))
);

-- ── 5. ERP_ALERTS — customer may fire a notification, not read/edit others' ───
drop policy if exists erp_alerts_company_scoped on public.erp_alerts;
create policy erp_alerts_insert on public.erp_alerts for insert with check (
  current_user_is_group_admin() or (company = any(current_user_companies()))
);
create policy erp_alerts_rw on public.erp_alerts for all using (
  auth_user_role() is distinct from 'customer'
  and (current_user_is_group_admin() or (company = any(current_user_companies())))
) with check (
  auth_user_role() is distinct from 'customer'
  and (current_user_is_group_admin() or (company = any(current_user_companies())))
);

-- ── 6. INVOICES + STORE_ITEMS — customers have no read access (portal never uses them) ─
drop policy if exists invoices_strict_select on public.invoices;
create policy invoices_strict_select on public.invoices for select using (
  auth_user_is_super()
  or (auth_user_role() is distinct from 'customer'
      and auth_user_companies() is not null and company = any(auth_user_companies()))
);

drop policy if exists store_items_strict_select on public.store_items;
create policy store_items_strict_select on public.store_items for select using (
  auth_user_is_super()
  or (auth_user_role() is distinct from 'customer'
      and auth_user_companies() is not null and company = any(auth_user_companies()))
);

-- ── 7. ACCESS_LOGS — only group admins may READ (was world-readable) ─────────
drop policy if exists access_logs_select on public.access_logs;
create policy access_logs_select on public.access_logs for select using (
  current_user_is_group_admin()
);
-- (access_logs_insert stays permissive: login logging can happen pre-profile.)

-- ── 8. Customer field-tamper guard on quotations (defence-in-depth) ──────────
-- Even within their own rows, a customer may NOT set a privileged lifecycle
-- status, assert payment confirmation / receipts / GL linkage, or move the
-- received amount. Only owner/staff/system may. (The owner-approval trigger
-- separately blocks the Draft→Approved transition.)
create or replace function public.enforce_nippon_customer_write()
returns trigger
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if NEW.company <> 'Nippon' then return NEW; end if;
  r := public.auth_user_role();
  if r is distinct from 'customer' then return NEW; end if;  -- staff/owner/system unaffected

  if NEW.status in ('Approved','Delivered','Invoiced','Paid','Partial Payment') then
    raise exception 'A customer cannot set order status to %', NEW.status using errcode = '42501';
  end if;
  if coalesce((NEW.data->>'paymentConfirmed'),'false') = 'true' then
    raise exception 'A customer cannot confirm payment' using errcode = '42501';
  end if;
  if coalesce((NEW.data->>'glTxId'),'') <> '' then
    raise exception 'A customer cannot set GL linkage' using errcode = '42501';
  end if;
  if (NEW.data ? 'advanceReceipts')
     and jsonb_array_length(coalesce(NEW.data->'advanceReceipts','[]'::jsonb)) > 0 then
    raise exception 'A customer cannot create receipts' using errcode = '42501';
  end if;
  if TG_OP = 'UPDATE'
     and coalesce((NEW.data->>'receivedAmount'),'0') is distinct from coalesce((OLD.data->>'receivedAmount'),'0') then
    raise exception 'A customer cannot change the received amount' using errcode = '42501';
  end if;

  return NEW;
end $$;

drop trigger if exists trg_nippon_customer_write on public.quotations;
create trigger trg_nippon_customer_write
  before insert or update on public.quotations
  for each row execute function public.enforce_nippon_customer_write();

-- ── 9. P2 hygiene — pin search_path on the write-gate function ───────────────
alter function public.auth_can_write(text, text[]) set search_path = public;

-- ============================================================================
-- POST-APPLY VERIFICATION (run as the customer, or review pg_policies):
--   • A customer JWT SELECT on quotations returns ONLY its own client's rows.
--   • A customer JWT UPDATE/DELETE on someone else's quotation → 0 rows / denied.
--   • A customer JWT INSERT/UPDATE/DELETE on products → denied.
--   • A customer JWT SELECT on invoices / store_items / other clients → empty.
--   • Staff (owner/admin_officer/super_admin) behaviour is unchanged.
-- FOUNDER: ensure clients.email == the customer's login email for each customer.
-- ============================================================================
