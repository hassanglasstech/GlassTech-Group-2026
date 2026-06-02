# NIPPON GO-LIVE AUDIT — Phase 0
**Date:** 2026-05-19
**Auditor:** Lead Consultant
**Business:** Nippon — Hardware/accessories trading (NO production)
**Scope:** Sales module + dependencies

---

## EXECUTIVE SUMMARY

| Severity | Count | Definition |
|---|---|---|
| **P1 — Blockers** | 7 | Must fix before go-live. Data loss / wrong financials / crash. |
| **P2 — Workaround OK** | 9 | Feature broken but user can avoid. Fix in week 2. |
| **P3 — Polish** | 6 | Cosmetic / dev hygiene. Fix post-go-live. |
| **Total** | **22** | |

**Verdict:** NOT go-live ready. Estimated effort: **2–3 working days** to clear P1s.

**Files audited (10 total, 3,032 LOC):**
- `modules/sales/companies/nippon/*` (4 files, 1,332 LOC)
- `modules/nippon/components/*` (1 file, 675 LOC)
- `modules/nippon/prints/*` (5 files, 1,025 LOC)
- Shared: `modules/sales/services/{deliveryInvoiceService,asyncSalesService}.ts`
- Finance: `modules/finance/constants/coa.nippon.ts` (218 LOC)

---

## P1 — BLOCKERS (fix before go-live)

### P1-1. Invoice service hardcoded to Glassco revenue accounts
**File:** [deliveryInvoiceService.ts:194-198](modules/sales/services/deliveryInvoiceService.ts:194)
**Issue:** Revenue posts to `'GLASS PROCESSING SERVICES' / 'SERVICE INCOME'` regardless of company. Nippon is trading — revenue must post to `'SALES REVENUE' / 'HARDWARE SALES'`. Will produce WRONG P&L for Nippon.
**Fix:** Branch on `company === 'Nippon'` to use trading revenue account chain from `coa.nippon.ts`.

### P1-2. COGS-at-delivery missing for Nippon trading
**File:** [deliveryInvoiceService.ts:357-388](modules/sales/services/deliveryInvoiceService.ts:357)
**Issue:** COGS plan only triggers from production pieces. Nippon has no pieces — sells hardware from inventory. Means: Revenue posts but COGS never posts → gross profit inflated by 100%.
**Fix:** For Nippon, build COGS from `items[].locationCode` → match `store_items.id` → Dr COGS / Cr Inventory at the item's `unitCost`.

### P1-3. Production-pieces gate may falsely block Nippon invoices
**File:** [deliveryInvoiceService.ts:162-180](modules/sales/services/deliveryInvoiceService.ts:162)
**Issue:** Gate uses `totalSqFt > 0` as "is glass item" heuristic. If a Nippon user accidentally enters sqft on a hardware line (mirror, glass film) → invoice blocked permanently.
**Fix:** Add explicit company-level bypass: `if (company === 'Nippon') skip pieces check`.

### P1-4. Empty quotation can be saved
**File:** [useNipponQuotations.ts:242-269](modules/sales/companies/nippon/useNipponQuotations.ts:242)
**Issue:** `handleSave` validates clientId + manualSerial but does NOT validate `items.length > 0` or `subTotal > 0`. Operator can save quotation with zero lines.
**Fix:** Add `if (!formData.items?.length) return alert("Add at least one item.");` and `if (subTotal <= 0) return alert("Quotation total must be > 0.");`.

### P1-5. Inventory double-decrement on re-approval
**File:** [useNipponQuotations.ts:271-287](modules/sales/companies/nippon/useNipponQuotations.ts:271)
**Issue:** If an Approved quote is edited and saved-approved again, `InventoryService.saveStore` decrements stock a SECOND time. No idempotency check.
**Fix:** Track `inventoryDecrementedAt` on the quote. Skip decrement if already done. Or block edit on Approved quotes (`isLocked` already exists at line 45 — wire it to the save flow).

### P1-6. Print crashes on missing items array
**Files:**
- [NipponQuotationPrint.tsx:13,28](modules/nippon/prints/NipponQuotationPrint.tsx:13)
- [NipponSalesOrderPrint.tsx:28](modules/nippon/prints/NipponSalesOrderPrint.tsx:28)
- [NipponJobCardPrint.tsx:72](modules/nippon/prints/NipponJobCardPrint.tsx:72)

**Issue:** `quote.items.reduce(...)`, `quote.items.forEach(...)` — no null/undefined guard. If a legacy quote has `items: undefined`, print crashes with TypeError.
**Fix:** `const items = quote.items || [];` at the top of each component, then use `items` everywhere.

### P1-7. Save has no try/catch — silent failures
**File:** [useNipponQuotations.ts:289](modules/sales/companies/nippon/useNipponQuotations.ts:289)
**Issue:** `await AsyncSalesService.saveQuotations(...)` not wrapped in try/catch. If Supabase write fails (network, RLS, schema), user gets no toast — thinks quote saved when it didn't.
**Fix:** Wrap in try/catch, show `toast.error(...)` on failure, keep view in edit mode.

---

## P2 — Workarounds Available (week 2)

### P2-1. Save button no loading state
**File:** [NipponQuotationManager.tsx](modules/sales/companies/nippon/NipponQuotationManager.tsx)
**Issue:** Save/Approve buttons can be double-clicked → duplicate quote with same serial → second one alerts but UX broken.
**Fix:** Add `isSaving` state; disable button + show spinner while save in flight.

### P2-2. `confirm()` for delete is native — looks unprofessional
**File:** [useNipponQuotations.ts:295](modules/sales/companies/nippon/useNipponQuotations.ts:295)
**Fix:** Replace with custom modal.

### P2-3. Dead code — `NipponJobCardPrint` for trading business
**File:** [NipponPrintTemplate.tsx:6,36-37](modules/nippon/prints/NipponPrintTemplate.tsx:6)
**Issue:** Nippon is trading. Job cards belong to production (Glassco). `NipponJobCardPrint` imports `ProductionPiece` type and never gets used in practice for hardware sales.
**Fix:** Remove `NipponJobCardPrint.tsx`, drop `JobCard` case from template, remove `pieces`/`products` props.

### P2-4. Client-side filtering of all-company data
**File:** [useNipponQuotations.ts:53-65](modules/sales/companies/nippon/useNipponQuotations.ts:53)
**Issue:** `AsyncSalesService.getQuotations()` fetches ALL companies, then `.filter(q => q.company === 'Nippon')` in browser. RLS protects DB but data exits cloud unnecessarily. Slow as data grows.
**Fix:** Add a `byCompany(company)` overload to AsyncSalesService that pushes `.eq('company', company)` to Supabase.

### P2-5. No audit log on delete
**File:** [useNipponQuotations.ts:294-300](modules/sales/companies/nippon/useNipponQuotations.ts:294)
**Issue:** Hard delete, no `activity_logs` row. Compliance gap.
**Fix:** Soft delete (`status: 'Cancelled'`) + Logger.action.

### P2-6. 38 `any` types
**Locations:**
- `NipponQuotationManager.tsx`: 5 `(item as any).isSetHeader|isSetMember`
- `NipponProductMaster.tsx`: 5 `category/unit as any`
- `NipponSmartImporter.tsx`: 3 `any[]` casts on Excel parse
- `NipponProductForm.tsx`: 17 `(formData.technicalSpecs as any)['<key>']`
- `NipponJobCardPrint.tsx`: 3 `any[]` chunk buffers

**Fix:** Extend `QuotationItem` type with optional `isSetHeader|isSetMember|setId`; type `technicalSpecs` as `Record<string, string>`; type Excel rows as `Record<string, unknown>`.

### P2-7. `as any` cast on createdBy in invoice GL
**File:** [deliveryInvoiceService.ts](modules/sales/services/deliveryInvoiceService.ts) — line near `createdBy: 'system-auto'`
**Issue:** `as any` on the GL transaction object.
**Fix:** Add `createdBy?: string` to the GL transaction type.

### P2-8. Set-suggestion type uses `unknown[]`
**File:** [useNipponQuotations.ts:138-142](modules/sales/companies/nippon/useNipponQuotations.ts:138)
**Issue:** `remainingComponents: unknown[]` defers type-safety; then casts to `Record<string, unknown>` later.
**Fix:** Define `SetComponent` interface in `modules/shared/types`.

### P2-9. Inventory decrement runs sync but is non-atomic with quote save
**File:** [useNipponQuotations.ts:271-289](modules/sales/companies/nippon/useNipponQuotations.ts:271)
**Issue:** Inventory saved to localStorage first, then quote saved. If quote save fails, inventory already decremented — stock out of sync.
**Fix:** Move inventory decrement AFTER successful `saveQuotations`. Wrap in same try/catch.

---

## P3 — Polish

| # | File | Issue |
|---|---|---|
| P3-1 | useNipponQuotations.ts:35-39 | `lastSerial` returns `string \| undefined` instead of always-string |
| P3-2 | NipponProductMaster.tsx:201-213 | `XLSX.utils.sheet_to_json` typed as `any[]` |
| P3-3 | NipponProductForm.tsx | 675 LOC monolith — should split into Hardware/Glass/Accessory variants |
| P3-4 | NipponQuotationPrint.tsx + NipponSalesOrderPrint.tsx | ~95% duplicate code — share a base component |
| P3-5 | useNipponQuotations.ts:108 | Inline calc of `item.amount` in `updateItem` — extract to helper |
| P3-6 | NipponCatalogPrint.tsx:48 | No empty-state when `products` is empty |

---

## SHARED-SERVICE DEPENDENCIES (Nippon touches these)

| Service | Status | Action |
|---|---|---|
| [asyncSalesService.ts](modules/sales/services/asyncSalesService.ts) | OK — Nippon-aware at line 200 | None for Phase 1 |
| [deliveryInvoiceService.ts](modules/sales/services/deliveryInvoiceService.ts) | **Broken for Nippon** | P1-1, P1-2, P1-3 above |
| [coa.nippon.ts](modules/finance/constants/coa.nippon.ts) | OK — 218 LOC | Verify Hardware Sales acct exists during P1-1 fix |
| [financeService.ts](modules/finance/services/financeService.ts) | OK — multi-company | None |
| [InventoryService](modules/procurement/services/inventoryService.ts) | OK | Used in P1-5 fix |

---

## WHAT'S NOT BROKEN (good news)

- TypeScript compiles (no errors blocking build).
- No Supabase direct calls leaking company filter (all routed via `AsyncSalesService`).
- No `.then()` without `.catch()` in Nippon prints (vs Glassco P1 #10).
- No missing `onClick` handlers on buttons (vs Glassco P1 #1).
- No `console.log` left in code.
- COA file exists with correct trading-business chart.
- RLS audit already done elsewhere (per CLAUDE.md).

---

## PHASE 1 EXECUTION ORDER (recommended)

Fix in this sequence to minimize re-test:

1. **P1-6** Print null-guards (5 min — safest first)
2. **P1-4** Empty quotation save block (10 min)
3. **P1-7** try/catch on save (10 min)
4. **P1-5** Inventory idempotency (30 min — needs schema thought)
5. **P1-3** Pieces gate bypass for Nippon (5 min)
6. **P1-1** Trading revenue accounts (45 min — touches coa + invoice service)
7. **P1-2** COGS-at-delivery for Nippon (60 min — most complex, save for last)

**Total Phase 1: ~3 hours of focused work + 2 hours of testing = half a day.**

---

## SIGN-OFF GATE FOR PHASE 1 → PHASE 2

Before moving to UAT (Phase 3), confirm:
- [ ] All 7 P1s closed with code refs
- [ ] `npm run lint` clean for Nippon files
- [ ] `npm run test` green
- [ ] One manual end-to-end: client → product → quote → SO → invoice → receipt → ledger balance check
- [ ] GL trial balance: debit total = credit total

---

**Next step:** Bolo `go phase 1` — main P1s seedhe order mein fix karta hoon. Har P1 ke baad commit + show changes.
