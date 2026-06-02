# ADR-001: Supabase as Backend Platform

**Status:** Accepted
**Date:** 2025 (inception)
**Decision Maker:** Hassan (Owner)

## Context
GlassTech needed a backend for 5-company ERP with real-time sync, auth, and PostgreSQL. Options: custom Node.js API, Firebase, Supabase, or traditional Django/Rails.

## Decision
Use Supabase (hosted PostgreSQL + Auth + Edge Functions + Realtime).

## Rationale
- **PostgreSQL** — relational model fits double-entry GL, foreign keys, CHECK constraints
- **Row-Level Security** — company isolation at DB layer without application middleware
- **Edge Functions** — Deno runtime for server-side logic (cron, AI proxy, webhooks)
- **Auth** — JWT-based with built-in user management
- **Real-time** — WebSocket subscriptions for live dashboard updates
- **Cost** — Free tier sufficient for single-tenant; predictable scaling

## Consequences
- (+) 96 tables with RLS enforced at DB level
- (+) 6 RPC functions for atomic cross-company operations
- (+) Edge Functions replace need for separate API server
- (-) Edge Functions limited to Deno runtime (no npm ecosystem)
- (-) `_shared/` imports don't work with Dashboard deploy
- (-) service_role key required for cron jobs (bypasses RLS)
