# ADR-003: Single Monorepo vs Microservices

**Status:** Accepted
**Date:** 2025

## Context
370+ files across 5 companies. Options: monorepo (single React app), multi-repo microservices, or module federation.

## Decision
Single monorepo with module-based organization (`/modules/<domain>/`).

## Rationale
- **Solo developer** — Hassan manages entire codebase; microservices add operational overhead
- **Shared types** — TypeScript interfaces shared across modules (e.g., LedgerTransaction used by 7 services)
- **Single deployment** — Vite build → Vercel deploy; no orchestration needed
- **Company-specific logic** — `/modules/glassco/`, `/modules/nippon/` for overrides

## Structure
```
/modules/
  sales/       (quotations, invoices, delivery)
  procurement/ (GRN, inventory, vendors)
  production/  (job orders, cutting, NCR)
  finance/     (GL, budgets, assets)
  hr/          (employees, payroll, attendance)
  factory/     (AI agents, strategic planning)
  glassco/     (company-specific prints/utils)
  nippon/      (company-specific components)
  shared/      (cross-module services)
```

## Consequences
- (+) Single `npm run dev` starts entire ERP
- (+) Refactoring across modules is one commit
- (+) TypeScript catches cross-module breaking changes at compile time
- (-) Build time grows with file count (Vite mitigates with HMR)
- (-) All companies deployed together (no independent release cycles)
