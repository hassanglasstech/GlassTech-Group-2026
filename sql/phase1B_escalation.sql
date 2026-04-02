-- Phase 1B: Escalation Alerts Table
-- Run in Supabase SQL Editor

create table if not exists factory_escalation_alerts (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid references factory_events(id),
  sector              text,
  event_type          text,
  priority            text,
  original_logged_by  text,
  hours_overdue       int,
  alert_type          text default 'OVERDUE_24HR',
  resolved            boolean default false,
  resolved_at         timestamptz,
  created_at          timestamptz default now()
);

create index if not exists escalation_resolved_idx on factory_escalation_alerts(resolved);
create index if not exists escalation_created_idx  on factory_escalation_alerts(created_at desc);

alter table factory_escalation_alerts enable row level security;
create policy "escalation_all" on factory_escalation_alerts for all using (true) with check (true);
