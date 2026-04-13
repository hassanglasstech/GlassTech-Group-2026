# ADR-006: Multi-Tenant Strategy — Row-Level vs Schema-Per-Client

**Status:** Decided (not yet implemented)
**Date:** 2026-04-14

## Context
Preparing for SaaS: 20+ client instances. Three approaches:
1. **Schema-per-client** — separate Supabase project per client
2. **Row-level isolation** — `client_id` column on every table + RLS
3. **Database-per-client** — separate PostgreSQL database per client

## Decision
Row-level isolation with `client_id` column.

## Rationale
- **Cost efficiency** — Single Supabase project, no per-client infrastructure
- **Existing pattern** — Already using `company` column for 5-company isolation
- **RLS proven** — 95/96 tables already have RLS; extending to `client_id` is incremental
- **Shared schema** — Migrations apply to all clients simultaneously
- **Agent knowledge base** — Shared agent_permissions, separate agent_api_calls per client

## Migration Plan (Phase 8)
See `/docs/MULTI_TENANT_SCHEMA_DESIGN.md` for full design:
1. Add `client_id TEXT DEFAULT 'glasstech-internal'` to all 96 tables
2. Add RLS policy: `USING (client_id = auth.jwt()->>'client_id')`
3. Backfill existing data with `client_id = 'glasstech-internal'`
4. Update Edge Functions to respect client_id

## Trade-offs
- (+) Single codebase and deployment for all clients
- (+) Existing RLS infrastructure scales naturally
- (+) Shared compute resources (cost-effective)
- (-) Noisy neighbor risk (one client's heavy queries affect others)
- (-) Data backup/restore is per-row, not per-database
- (-) Client deletion requires DELETE WHERE client_id = X (not DROP DATABASE)
- (-) 96 tables need ALTER TABLE (large migration, but one-time)
