# Nippon Go-Live · User Acceptance Test (UAT) Runbook

> **Owner:** Hassan (RSH Advisory)
> **Module:** Nippon — Hardware/accessories trading (NO production)
> **Target:** 14 end-to-end UAT flows, all green
> **Pass criteria:** Every flow completes without errors, every GL leg balanced, multi-company isolation holds, all prints render
> **Prereq:** Phase 1 P1 fixes merged, Phase 2 SIT tests green (`npx vitest run modules/__tests__/nippon_sit.test.ts` → 6/6)

---

## Setup before starting

1. **Confirm app is running:**
   ```bash
   cd C:\Users\Hassa\Downloads\ERP\GlassTech-Group-2026-fresh
   npm run dev
   ```
   Open `http://localhost:3000`.

2. **Switch company** to **Nippon** (top-right selector).

3. **Login** as a user whose `allowed_companies` includes `Nippon` (e.g., super_admin).

4. **Open DevTools** (F12) → Console + Network tabs ready for error capture.

5. **Optional clean slate** (Supabase SQL editor):
   ```sql
   DELETE FROM invoices         WHERE company = 'Nippon' AND (data->>'clientName') LIKE 'UAT-TEST%';
   DELETE FROM quotations       WHERE company = 'Nippon' AND id LIKE 'QT-%-UAT%';
   DELETE FROM payment_receipts WHERE company = 'Nippon' AND (data->>'clientName') LIKE 'UAT-TEST%';
   DELETE FROM credit_notes     WHERE company = 'Nippon' AND (data->>'reason') LIKE 'UAT-TEST%';
   DELETE FROM ledger           WHERE company = 'Nippon' AND (data->>'description') LIKE '%UAT-TEST%';
   DELETE FROM clients          WHERE company = 'Nippon' AND business_name LIKE 'UAT-TEST%';
   ```

---

## Status legend

- ⬜ Not run
- 🟡 In progress
- ✅ Passed
- ❌ Failed (record bug ID below)

---

## Test Data (use throughout)

| Item | Value |
|---|---|
| Client | `UAT-TEST Hardware Buyer` |
| Phone | `0300-9999999` |
| Address | `Karachi UAT Site` |
| Credit limit | `0` (unlimited for test) |
| Product 1 | `KIN-HINGE-90` — Kin Long Hinge 90° — PCS — rate 1,500 |
| Product 2 | `KIN-LOCK-200` — Kin Long Lock 200mm — PCS — rate 2,000 |
| Opening stock (each) | 50 PCS at MAP 800 (Hinge) / 1,200 (Lock) |
| GST | 17% |
| Discount | 10% on flow N-11 only |

---

## Flow N-01 · Client master — create

**Status:** ⬜

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Sales → Clients → click "+ Add Client" | Form opens, company dropdown locked to Nippon | ⬜ |
| 2 | Fill all required fields with test data, save | Toast `Client saved.` Row appears at top of list | ⬜ |
| 3 | Filter list by `UAT-TEST` | Exactly 1 row | ⬜ |
| 4 | Click Edit on the row | Form re-opens with values pre-filled | ⬜ |
| 5 | Modify phone, save | Updated value persists after refresh | ⬜ |

**Backend check:** `SELECT * FROM clients WHERE company='Nippon' AND business_name LIKE 'UAT-TEST%';` → 1 row.

---

## Flow N-02 · Product master — single create

**Status:** ⬜

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Sales → Products → "+ Add Product" | Nippon Product Form opens (NOT generic) | ⬜ |
| 2 | Add Product 1 (Hinge), category=Hardware, save | Toast success, row in list | ⬜ |
| 3 | Add Product 2 (Lock), category=Hardware, save | Both products visible | ⬜ |
| 4 | Edit Product 1 → change rate to 1,600 → save | Rate updates, no double-row | ⬜ |
| 5 | Revert rate to 1,500 | Final state matches test-data table | ⬜ |

---

## Flow N-03 · Product master — bulk import (Smart Importer)

**Status:** ⬜

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Sales → Products → click "Smart Import" | NipponSmartImporter modal opens | ⬜ |
| 2 | Upload a 5-row Excel with header `Code, Name, Unit, Rate` | Preview shows 5 rows mapped correctly | ⬜ |
| 3 | Click Import | Toast `Imported 5 products`. List grows by 5 | ⬜ |
| 4 | Re-upload same file | Either dedupes by code OR appends with warning (note actual behavior) | ⬜ |

**Note:** Smart Importer field is on P2 list (`any` types). This flow validates user-facing behavior only.

---

## Flow N-04 · Opening stock — seed inventory

**Status:** ⬜

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Inventory → Store Items → seed 50 PCS of `KIN-HINGE-90` at MAP 800 | Row created, unrestrictedQty=50 | ⬜ |
| 2 | Seed 50 PCS of `KIN-LOCK-200` at MAP 1,200 | Row created, unrestrictedQty=50 | ⬜ |
| 3 | Confirm via `SELECT id, unrestricted_qty, moving_average_price FROM store_items WHERE company='Nippon'` | Both rows present | ⬜ |

**Critical:** Without opening stock with `movingAveragePrice > 0`, COGS at delivery will be ZERO (P1-2 fix relies on this field).

---

## Flow N-05 · Quotation create — validation (P1-4)

**Status:** ⬜

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Sales → Quotations (Nippon) → "+ New Quotation" | Editor opens, status `Draft` | ⬜ |
| 2 | Click `Save Draft` immediately (no client, no items) | Toast `Client is required.` — quote NOT saved | ⬜ |
| 3 | Select client `UAT-TEST Hardware Buyer`, fill Serial Number e.g. `0001`, save | Toast `Add at least one item before saving.` — quote NOT saved | ⬜ |
| 4 | Add a section header `Hardware` (no qty/amount) | Section appears but is not a line item | ⬜ |
| 5 | Click Save Draft | Toast `Add at least one item before saving.` (sections don't count) | ⬜ |
| 6 | Add Product 1 with qty 0 and rate 0 → amount auto-calcs to 0 | Line shows amount 0 | ⬜ |
| 7 | Click Save Draft | Toast `Quotation total must be greater than zero.` — quote NOT saved | ⬜ |

---

## Flow N-06 · Quotation create — happy path + save loading state (P2-1)

**Status:** ⬜

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Continuing from N-05: change qty to 10, rate stays 1,500 → amount auto-calcs to 15,000 | Amount column shows 15,000 | ⬜ |
| 2 | Add Product 2: qty 5, rate 2,000 → amount 10,000 | Subtotal at bottom = 25,000 | ⬜ |
| 3 | Click `Save Quotation` (blue button) AND immediately click it again | Second click is disabled (gray); first shows `Saving…` | ⬜ |
| 4 | Save completes | Toast `Quotation saved.` Returns to list view. Quote appears with Draft status | ⬜ |
| 5 | Open the saved quote — verify all data persisted | Items, totals, client, serial all match | ⬜ |

**Backend:** `SELECT id, status, data->'items' FROM quotations WHERE company='Nippon' ORDER BY created_at DESC LIMIT 1;` → status=Draft, 2 items.

---

## Flow N-07 · Quotation approve — auto SO + inventory decrement (P1-5)

**Status:** ⬜

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Re-open the Draft quote from N-06 | Editor opens | ⬜ |
| 2 | Click `Approve Order` (green button) | Button shows `Approving…` then toast `Sales Order SO-MMYY-NNNN created.` | ⬜ |
| 3 | Quote status flips to `Approved`, orderNo populated | List shows approved row | ⬜ |
| 4 | Inventory → Store Items: KIN-HINGE-90 | unrestrictedQty = 40 (was 50, -10) | ⬜ |
| 5 | Inventory → Store Items: KIN-LOCK-200 | unrestrictedQty = 45 (was 50, -5) | ⬜ |
| 6 | Open the approved quote and try `Save Quotation` again | Toast `This quote is already approved. Use a Credit Note to amend.` — inventory NOT decremented again | ⬜ |

**Critical (P1-5):** Step 6 is the idempotency check. Before the fix, re-saving would double-decrement stock.

---

## Flow N-08 · Print — Quotation template (Draft)

**Status:** ⬜

**Prereq:** A Draft quote with items (revert quote from N-07 OR create a new Draft).

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | From quote list, click Print icon on a Draft quote | NipponQuotationPrint opens (header = NIPPON HARDWARE) | ⬜ |
| 2 | Switch print type: `KinLong` | Kin Long logo + Chinese characters in header | ⬜ |
| 3 | Switch print type: `Glasstech` | Glasstech header style | ⬜ |
| 4 | Switch print type: `General` | Plain General header | ⬜ |
| 5 | Browser File → Print preview (Ctrl+P) | Page renders with no console errors, no truncated rows | ⬜ |
| 6 | Discount field 10% on subtotal 25,000 → display shows discount 2,500 + net 22,500 | Correct math | ⬜ |

---

## Flow N-09 · Print — Sales Order template (Approved)

**Status:** ⬜

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | From quote list, click Print on the Approved quote from N-07 | Print template auto-switches to SalesOrder mode | ⬜ |
| 2 | Header shows `SALES ORDER` and the `SO-MMYY-NNNN` reference | Correct doc-type label | ⬜ |
| 3 | Ctrl+P preview | No console errors | ⬜ |
| 4 | Switch print type to KinLong → Ctrl+P again | KinLong header renders correctly | ⬜ |

**Note (P2-3):** `NipponJobCardPrint` is dead code for trading. We are NOT testing it here — go-live should not expose it.

---

## Flow N-10 · Generate Invoice — trading GL (P1-1 + P1-2 + P1-3)

**Status:** ⬜

**Prereq:** Approved SO from N-07.

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Sales → Sales Orders → find SO-MMYY-NNNN | Row visible, status `Approved` | ⬜ |
| 2 | Click `Mark Delivered` / `Generate Invoice` | Process runs, no production-pieces error (P1-3) | ⬜ |
| 3 | Toast confirms invoice ID `INV-NIP-2026-NNNN` | Invoice created | ⬜ |
| 4 | Open Finance → General Ledger → filter by referenceId = invoice ID | 2 ledger transactions present: main + COGS | ⬜ |
| 5 | Inspect main ledger row | Dr `Customers Control / UAT-TEST...` (AR) + Cr `Hardware Sales Income` (4120) + Cr `Sales Tax Payable` (GST if applied) | ⬜ |
| 6 | Critical: verify revenue account name contains "HARDWARE SALES" (NOT "GLASS PROCESSING SERVICES") | Correct trading chain | ⬜ |
| 7 | Inspect COGS ledger row | Dr `General Hardware — COGS` (5114) + Cr `General Hardware — Stock` (11514) | ⬜ |
| 8 | COGS amount = 10×800 + 5×1,200 = 14,000 | Math matches MAP × qty | ⬜ |
| 9 | Sum Dr = Sum Cr on each row separately | Both balanced | ⬜ |

**Backend SQL verifier:**
```sql
SELECT
  (data->>'description')   AS narration,
  jsonb_agg(jsonb_build_object(
    'accountId', d->>'accountId',
    'debit',     (d->>'debit')::numeric,
    'credit',    (d->>'credit')::numeric
  )) AS details,
  SUM((d->>'debit')::numeric)  AS total_dr,
  SUM((d->>'credit')::numeric) AS total_cr
FROM ledger, jsonb_array_elements(data->'details') AS d
WHERE company = 'Nippon'
  AND (data->>'referenceId') = '<paste invoice ID>'
GROUP BY data->>'description';
```
Every row: `total_dr = total_cr`.

---

## Flow N-11 · Generate Invoice — with discount + GST

**Status:** ⬜

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Create a new client (UAT-TEST 2), product setup as before | Setup complete | ⬜ |
| 2 | Quote: 1 line × 10 × 1,000 = 10,000 subtotal | Subtotal shows 10,000 | ⬜ |
| 3 | Set discount = 10% → net = 9,000 | Net shown | ⬜ |
| 4 | Approve → generate invoice with GST 17% → grand = 9,000 + 1,530 = 10,530 | Invoice total = 10,530 | ⬜ |
| 5 | Main GL has 3 lines: AR 10,530 / Revenue 9,000 / GST Payable 1,530 — balanced | Math correct | ⬜ |
| 6 | COGS row uses MAP at time of invoice | COGS = 10 × current MAP | ⬜ |

---

## Flow N-12 · Receipt application (full + partial)

**Status:** ⬜

**Prereq:** Invoice from N-10 outstanding.

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Sales → Receipts → create receipt for invoice from N-10, amount = 10,000 (partial) | Receipt saved | ⬜ |
| 2 | Invoice list — status of the invoice | Status flipped to `Partial`, balance shows reduced amount | ⬜ |
| 3 | GL has new entry: Dr `Cash/Bank` + Cr `Customers Control / UAT-TEST...` for 10,000 | Balanced | ⬜ |
| 4 | Create 2nd receipt for the remaining balance | Status flips to `Paid`, balance = 0 | ⬜ |

---

## Flow N-13 · Credit Note (return / cancellation)

**Status:** ⬜

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Sales → Credit Notes → "+ New CN" → select Paid invoice from N-12 | Form opens, invoice pre-filled | ⬜ |
| 2 | Enter CN amount 5,000, reason `UAT-TEST partial return` | CN saved with sequential CN number | ⬜ |
| 3 | GL has reversing entry: Cr `Hardware Sales Income` 5,000 / Dr `Customers Control` 5,000 (or refund to bank) — balanced | Math correct | ⬜ |
| 4 | If COGS reversal applies (proportional to amount): Cr `General Hardware — COGS` / Dr `General Hardware — Stock` for `(5000 / invoiceTotal) × originalCOGS` | Inventory restored proportionally | ⬜ |
| 5 | Invoice updated — total receipts net of CN, balance reflects refund due (if any) | Balance math holds | ⬜ |

---

## Flow N-14 · Multi-company isolation

**Status:** ⬜ ⚠️ **CRITICAL FOR GO-LIVE**

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | While logged in as a Nippon user, sidebar company selector | Only `Nippon` shown if `allowed_companies = ['Nippon']`. Otherwise, every allowed company listed | ⬜ |
| 2 | Switch company to Glassco | Sales pages reload — NO Nippon UAT-TEST quotes visible | ⬜ |
| 3 | Switch back to Nippon | UAT-TEST quotes reappear; Glassco quotes are gone from view | ⬜ |
| 4 | Open Supabase logs / network tab on Nippon → check `quotations` query payload | Either `.eq('company', 'Nippon')` in the URL, OR RLS strips other companies | ⬜ |
| 5 | Try direct row access: in DevTools console, run `await fetch('https://<supabase>/rest/v1/quotations?company=eq.Glassco', {headers:{apikey:'<anon>', authorization:'Bearer <jwt>'}})` | Returns `[]` (RLS blocks) — NOT the actual Glassco rows | ⬜ |
| 6 | General Ledger filter — Nippon view never shows Glassco/GTK ledger entries | Isolation holds | ⬜ |

**If any step fails:** Go-live BLOCKED. Escalate to Hassan.

---

## Exit checklist (sign-off gate)

Before declaring Nippon UAT complete and go-live ready:

- [ ] All 14 flows show ✅ status
- [ ] Zero console errors during full cycle (Network + Console tabs of DevTools)
- [ ] Trial balance on Nippon GL: `SUM(debit) = SUM(credit)` across the day's posts
- [ ] At least 1 invoice cycle (N-10 or N-11) has been printed and shown to Hassan for accounting sign-off
- [ ] Multi-company isolation (N-14) verified by Hassan personally
- [ ] Phase 1 P1 fixes still all closed (re-run `npx vitest run modules/__tests__/nippon_sit.test.ts` → 6/6 green)
- [ ] Phase 2 SIT regression: `npm run test -- --run` → 318/318 green
- [ ] Bug log below has zero P1 entries; P2/P3 entries documented for post-go-live sprint

---

## Bug log (use during UAT)

| # | Severity | Flow | File:Line | Steps to reproduce | Status |
|---|---|---|---|---|---|
| | | | | | |

---

## Quick reference — what success looks like

- **Revenue posting:** `Nippon-4120` (HARDWARE SALES INCOME)
- **COGS posting:** `Nippon-5114` (GENERAL HARDWARE — COGS) ↔ `Nippon-11514` (GENERAL HARDWARE — STOCK)
- **Invoice numbering:** `INV-NIP-2026-NNNN` (sequential, no duplicates)
- **Quote → SO numbering:** `QT-MMYY-NNNN` → `SO-MMYY-NNNN`
- **Save UX:** Button disables + shows `Saving…` / `Approving…` mid-flight
- **Print prints without console errors** on all 3 print types (KinLong / Glasstech / General)

---

**Next phase:** After UAT sign-off → Phase 4 (Go-Live Checklist + RLS verify + opening balance migration + rollback plan).
