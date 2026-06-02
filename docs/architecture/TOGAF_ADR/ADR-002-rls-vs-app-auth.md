# ADR-002: RLS vs Application-Level Authorization

**Status:** Accepted
**Date:** 2025

## Context
Multi-company ERP needs data isolation. Two approaches: (a) RLS at database, (b) middleware/service checks in application code.

## Decision
Use Row-Level Security (RLS) as primary isolation mechanism, with application-layer checks for business rules.

## Rationale
- **Defense in depth** — even if application bug exposes wrong query, RLS blocks cross-company data
- **Single policy per table** — `company_rls` pattern: `USING (company = user_profiles.company)`
- **Audit trail** — RLS enforced at every query, not dependent on developer discipline

## Current Implementation
- 95/96 tables have RLS enabled (99%)
- Pattern A: company-scoped (88 tables) — `company = user_profiles.company`
- Pattern B: authenticated-only (7 tables) — agent/system tables with `USING (true)`
- 6 SECURITY DEFINER RPCs for atomic cross-company operations

## Consequences
- (+) Data isolation guaranteed even if frontend code has bugs
- (+) New developers can't accidentally leak cross-company data
- (-) Edge Functions need service_role to bypass RLS (15/16 functions)
- (-) Complex queries require understanding of RLS context
- (-) Application-level gates (4-eyes, budget checks) still needed for business rules
