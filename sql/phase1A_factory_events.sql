-- Phase 1A: Factory Incharge Module
-- Run this in Supabase SQL Editor

create table if not exists factory_events (
  id              uuid primary key default gen_random_uuid(),
  sector          text not null,
  event_type      text not null,
  detail          text not null,
  priority        text not null default 'Medium',   -- Urgent | Medium | Low
  status          text not null default 'Open',     -- Open | Pending | In Progress | Resolved | Closed
  logged_by       text not null,
  req_id          uuid,                             -- linked requisition (if auto-created)
  resolved_at     timestamptz,
  notes           text,
  source_event_id uuid,                             -- self-ref if needed
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Index for fast queries
create index if not exists factory_events_sector_idx   on factory_events(sector);
create index if not exists factory_events_status_idx   on factory_events(status);
create index if not exists factory_events_priority_idx on factory_events(priority);
create index if not exists factory_events_created_idx  on factory_events(created_at desc);

-- RLS: enable but allow all for now (tighten later with auth)
alter table factory_events enable row level security;
create policy "factory_events_all" on factory_events for all using (true) with check (true);

-- Add source_event_id to requisitions table (links req back to factory event)
alter table requisitions add column if not exists source_event_id uuid references factory_events(id);
