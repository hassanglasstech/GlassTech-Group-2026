# Phase 0 · Pre-Flight Audit Report

**Generated:** 2026-05-12 12:37:11
**Scope:** modules/sales/** + modules/glassco/**
**Git commit:** dbcd137

---

## P1 · Block-Go-Live Checks

### ✅ [P1] #01 · TypeScript compile (sales/glassco scope)

**Status:** `PASS`

**Details:**
```
0 errors in scoped modules
```

### ⚠️  [P1] #02 · Company filter on Supabase queries

**Status:** `WARN`

**Details:**
```
20 queries to inspect manually:
modules/sales/services/asyncSalesService.ts:93:      const { data, error } = await supabase.from('clients').select('*').eq('company', company);
modules/sales/services/asyncSalesService.ts:148:        const { error } = await supabase.from('clients').upsert(rows, { onConflict: 'id' });
modules/sales/services/asyncSalesService.ts:167:      const { data, error } = await supabase.from('products').select('*').eq('company', company);
modules/sales/services/asyncSalesService.ts:258:    const { error } = await supabase.from('products').upsert(mapped);
modules/sales/services/asyncSalesService.ts:270:      const { data, error } = await supabase.from('quotations').select('*').eq('company', company);
modules/sales/services/asyncSalesService.ts:373:        const { error } = await supabase.from('quotations').upsert(mapped, { onConflict: 'id' });
modules/sales/services/asyncSalesService.ts:395:      const { data, error } = await supabase.from('projects').select('*').eq('company', company);
modules/sales/services/asyncSalesService.ts:414:      const { data, error } = await supabase.from('vendors').select('*').eq('company', company);
modules/sales/services/asyncSalesService.ts:432:      const { error } = await supabase.from('vendors').upsert(mapped, { onConflict: 'id' });
modules/sales/services/asyncSalesService.ts:443:      const { data, error } = await supabase.from('invoices').select('*').eq('company', company);
```

### ✅ [P1] #03 · RLS policy on every table

**Status:** `MANUAL`

**Details:**
```
Run in Supabase SQL editor: SELECT t.tablename, p.polname FROM pg_tables t LEFT JOIN pg_policies p USING(tablename) WHERE t.schemaname='public' AND p.polname IS NULL;
```

### ❌ [P1] #04 · No 'any' types in sales scope

**Status:** `FAIL`

**Details:**
```
47 occurrences. Sample:
modules/sales/companies/glassco/useGlasscoQuotations.ts:312:  const updateGlassItem = async (index: number, field: string, value: any) => {
modules/sales/companies/nippon/components/NipponSmartImporter.tsx:182:      const extractedRows = (result.rows || []).map((row: any, idx: number) => ({
modules/sales/companies/nippon/components/NipponSmartImporter.tsx:372:  const handleUpdateFinalItem = (idx: number, field: string, value: any) => {
modules/sales/companies/nippon/NipponQuotationManager.tsx:60:  const getProductSpecs = (p: any) => {
modules/sales/companies/nippon/NipponQuotationManager.tsx:83:    const newLines = comps.map((c: any, ci: number) => {
modules/sales/companies/nippon/NipponQuotationManager.tsx:101:    setFormData((prev: any) => {
modules/sales/companies/nippon/NipponQuotationManager.tsx:243:                                  (i: any) => !i.isSection && !(i as any).isSetHeader
modules/sales/companies/nippon/NipponQuotationManager.tsx:456:                {pendingSetSuggestion.remainingComponents.map((c: any, ci: number) => (
modules/sales/companies/nippon/useNipponQuotations.ts:108:  const updateItem = (index: number, field: string, value: any) => {
modules/sales/companies/nippon/useNipponQuotations.ts:144:  const addFullSet = (index: number, setProduct: any, allProducts: any[]) => {
```

### ✅ [P1] #05 · No direct ledger insert (bypass postJournal)

**Status:** `PASS`

**Details:**
```
All ledger writes go through approved services
```

### ✅ [P1] #06 · No hardcoded secrets

**Status:** `PASS`

**Details:**
```
Clean
```

### ✅ [P1] #07 · No console.log in sales scope

**Status:** `PASS`

**Details:**
```
0 (≤5)
```


## P2 · Pre-Testing Checks

### ⚠️  [P2] #08 · ESLint

**Status:** `WARN`

**Details:**
```
Lint output:
supabase/functions/wazir-sunday-brief/index.ts(279,23): error TS2304: Cannot find name 'Deno'.
supabase/functions/wazir-sunday-brief/index.ts(280,23): error TS2304: Cannot find name 'Deno'.
supabase/functions/wazir-sunday-brief/index.ts(281,23): error TS2304: Cannot find name 'Deno'.
supabase/functions/whatsapp-intelligence/index.ts(9,30): error TS2307: Cannot find module 'https://esm.sh/@supabase/supabase-js@2' or its corresponding type declarations.
supabase/functions/whatsapp-intelligence/index.ts(28,1): error TS2304: Cannot find name 'Deno'.
supabase/functions/whatsapp-intelligence/index.ts(28,19): error TS7006: Parameter 'req' implicitly has an 'any' type.
supabase/functions/whatsapp-intelligence/index.ts(37,21): error TS2304: Cannot find name 'Deno'.
supabase/functions/whatsapp-intelligence/index.ts(55,39): error TS2304: Cannot find name 'Deno'.
supabase/functions/whatsapp-intelligence/index.ts(55,70): error TS2304: Cannot find name 'Deno'.
supabase/functions/whatsapp-intelligence/index.ts(56,26): error TS2304: Cannot find name 'Deno'.
```

### ✅ [P2] #09 · Production build

**Status:** `MANUAL`

**Details:**
```
Run with --full flag, or: npm run build
```

### ✅ [P2] #10 · Bundle size per route

**Status:** `MANUAL`

**Details:**
```
Run: npx vite-bundle-visualizer or analyze dist/
```

### ✅ [P2] #11 · Unused exports (ts-prune)

**Status:** `PASS`

**Details:**
```
0 (≤20)
```

### ✅ [P2] #12 · Circular dependencies

**Status:** `PASS`

**Details:**
```
None
```

### ⚠️  [P2] #13 · npm audit (production)

**Status:** `WARN`

**Details:**
```
High: 4, Critical: 0
```

### ✅ [P2] #14 · Migration count

**Status:** `PASS`

**Details:**
```
96 migration files
```


## P3 · Quality / Debt-Tracking Checks

### ⚠️  [P3] #15 · Inline styles

**Status:** `WARN`

**Details:**
```
643 occurrences
```

### ✅ [P3] #16 · Try/catch on async services (heuristic)

**Status:** `PASS`

**Details:**
```
async fns: 2, try blocks: 55
```

### ⚠️  [P3] #17 · useAuthStore BUG-1 pattern (user + profile)

**Status:** `WARN`

**Details:**
```
3/4 use both
```

### ✅ [P3] #18 · Lazy-load routes

**Status:** `PASS`

**Details:**
```
51 lazy imports, 50 routes
```

### ✅ [P3] #19 · Foreign-key orphans (clients/invoices)

**Status:** `MANUAL`

**Details:**
```
Run in Supabase: SELECT count(*) FROM invoices WHERE client_id NOT IN (SELECT id FROM clients);
```

### ✅ [P3] #20 · TODO/FIXME debt

**Status:** `PASS`

**Details:**
```
3 markers in sales scope (tracked)
```


---

## Summary

| Severity | Pass | Fail | Total |
|---|---|---|---|
| **P1** (block go-live) | 4 | 3 | 7 |
| **P2** (fix before testing) | 3 | 4 | 7 |
| **P3** (track as debt) | 3 | 3 | 6 |

### ❌ Phase 0 P1 Gate: **FAIL** — fix P1 items before proceeding

_Generated by `scripts/phase0_audit.sh` on 2026-05-12 12:43:12_
