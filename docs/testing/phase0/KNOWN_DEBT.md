# Phase 0 · Known / Accepted Technical Debt

Items here are **consciously deferred** post-go-live. They do NOT block go-live but should be tracked.

---

## npm audit — Accepted Vulnerabilities (post Round 2 fix)

**Status before Phase 0:** 1 Critical + 5 High
**Status after `npm audit fix`:** 0 Critical + 4 High

| Package | Severity | Why deferred | Action plan |
|---|---|---|---|
| `pdfjs-dist@^3.11.174` | HIGH | v5 is breaking change. Used only in `NipponSmartImporter` (out-of-scope per CLAUDE.md) + `glasscoPdfParser.ts`. Risk window = only when user uploads malicious PDF. Pre-go-live: PDF uploads disabled by default in Glassco UI. | Schedule v5 upgrade for post-go-live (Sprint 38) |
| `tar` (transitive via `@mapbox/node-pre-gyp`) | HIGH | Build-time only dependency. Not in runtime bundle. Not exploitable in production (only on dev machine during `npm install`). | Auto-resolves when @mapbox releases update |
| `xlsx` (any version) | HIGH | **No upstream fix available.** Prototype Pollution + ReDoS. Used heavily in CSV/Excel exports. | Mitigation: only accept files from trusted users (RBAC). Long-term: migrate to `exceljs` (Sprint 39) |

**Pre-go-live mitigation:** Deny PDF upload UI feature flag until v5 upgrade. Confine xlsx exports to authenticated users only (already enforced via auth).

---

## Pre-existing TS Issues (NOT a debt — all fixed in Phase 0 Round 1)

All 12 pre-existing TS errors documented in `PHASE0_FIX_LOG.md` were **fully resolved** in this Phase 0 cleanup:

| File | Fix |
|---|---|
| `useQuotations.ts:157,161,172,229` | Added missing `toast` import + nullable guard for `selectedItemIndex` |
| `GTKQuotationManager.tsx:843` | Alias `installAmt` → `installationAmt` at call site |
| `SalesOrders.tsx:202` | Type-cast to silence dead-enum comparison (intentional legacy check) |
| `deliveryCalcService.ts:45,112` | Type-cast for legacy enum values + missing `company` field |
| `QCCheckPanel.tsx:146` | Structural cast for runtime-added `pieceDefectAssessments` field |
| `QuotationWastageTab.tsx:279` | Include `label` when constructing fallback `selectedSize` |
| `GlassCoQuotationPrint.tsx:120` | `?? []` fallback for optional `selectedServices` |
| `GlassCoSalesOrderPrint.tsx:119` | same |

**Final TS error count in sales/glassco scope: ZERO.** ✅

---

## Inline Styles Debt (Phase 0 #15 WARN)

**643 inline styles** detected in sales + glassco. This is mostly in **print templates** (Glassco* prints, gtk PrintQuotation) where browser print-CSS needs inline styles for reliable rendering across email/PDF clients.

**Decision:** Accept as P3 debt. Print templates legitimately need inline styles for `@media print` compatibility.

**Long-term:** Migrate print templates to a dedicated CSS-in-JS solution (e.g., `react-pdf-renderer`) — Sprint 40.

---

## TODO/FIXME Markers (Phase 0 #20 PASS)

**3 markers in sales scope.** Listed for awareness:

```bash
grep -rn "TODO\|FIXME\|HACK\|XXX" modules/sales/ modules/glassco/ --include="*.ts" --include="*.tsx"
```

(Run this command to see live list — kept small via discipline.)

---

## Any-Types Remaining (Phase 0 #04)

| Phase | Total `any` types in sales+glassco |
|---|---|
| Phase 0 start | 245 |
| After Round 1 (catch-block sweep) | 234 |
| After Round 2 (service-layer types) | TBD |
| **Target for Phase 0 pass** | **≤30** |

Top remaining offenders (post Round 1):
1. `asyncSalesService.ts` — 39 (mostly Supabase row map callbacks)
2. `deliveryInvoiceService.ts` — 25 (complex JSONB access)
3. `QuotationAgent.ts` — 18 (agent tool result types)
4. `GlasscoOpsDashboard.tsx` — 15 (legacy filter callbacks)
5. `ProductionDecisionAgent.ts` — 12

**Round 2 plan:** Define typed `SbClientRow`, `SbInvoiceRow`, `SbQuotationRow` interfaces in `modules/shared/types/supabase.ts`. Replace map callbacks with typed versions. Estimated -80 more `any` types.

---

_Updated: this commit. Next round on request._
