-- Phase 1E: HSE Module
-- Run in Supabase SQL Editor

create table if not exists hse_incidents (
  id               uuid primary key default gen_random_uuid(),
  company          text not null,
  incident_date    date not null,
  incident_time    text,
  location         text,
  severity         text not null,   -- Near Miss | Minor | Major | Critical
  category         text not null,   -- Injury | Fire | Chemical | Equipment | Slip/Fall | Other
  description      text not null,
  injured_person   text,
  reported_by      text not null,
  corrective_action text,
  action_due_date  date,
  action_status    text default 'Pending',  -- Pending | In Progress | Completed
  closed           boolean default false,
  closed_at        timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists hse_severity_idx on hse_incidents(severity);
create index if not exists hse_closed_idx   on hse_incidents(closed);
create index if not exists hse_date_idx     on hse_incidents(incident_date desc);

alter table hse_incidents enable row level security;
create policy "hse_all" on hse_incidents for all using (true) with check (true);
