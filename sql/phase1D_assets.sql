-- Phase 1D: Asset Register
-- Run in Supabase SQL Editor

create table if not exists factory_assets (
  id           uuid primary key default gen_random_uuid(),
  company      text not null,           -- GlassCo | GTK | GTI | Factory | Nippon
  category     text not null,           -- Machine | Table | Tool | Vehicle | Furniture | Other
  name         text not null,
  model        text,
  serial_no    text,
  location     text,
  status       text default 'Active',   -- Active | Maintenance | Inactive | Disposed
  purchased_on date,
  purchase_cost numeric default 0,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists assets_company_idx  on factory_assets(company);
create index if not exists assets_status_idx   on factory_assets(status);
create index if not exists assets_category_idx on factory_assets(category);

alter table factory_assets enable row level security;
create policy "assets_all" on factory_assets for all using (true) with check (true);
