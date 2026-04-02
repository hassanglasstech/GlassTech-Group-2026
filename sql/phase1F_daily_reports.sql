-- Phase 1F: Daily Reports Table
-- Run in Supabase SQL Editor

create table if not exists daily_reports (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null unique,
  html_content  text not null,
  event_count   int default 0,
  urgent_count  int default 0,
  open_count    int default 0,
  created_at    timestamptz default now()
);

create index if not exists daily_reports_date_idx on daily_reports(report_date desc);

alter table daily_reports enable row level security;
create policy "daily_reports_all" on daily_reports for all using (true) with check (true);
