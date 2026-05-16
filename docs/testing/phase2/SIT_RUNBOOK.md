# Phase 2 · System Integration Testing (SIT) — Runbook

> **Owner:** Hassan (RSH Advisory)
> **Target:** 8 end-to-end flows, all green
> **Method:** Mixed — `/e2e-verify` auto-recipes where available + manual UI walk-throughs
> **Pass criteria:** All 8 flows show every GL leg, every status flip, every downstream record matches expectations

---

## Setup before starting

1. **Reset test data** (optional but recommended for clean run):
   ```sql
   -- In Supabase SQL editor — only run if you want a clean slate
   DELETE FROM invoices            WHERE company = 'Glassco' AND (data->>'clientName') LIKE 'SIT-TEST%';
   DELETE FROM quotations          WHERE company = 'Glassco' AND id LIKE 'QUT-GLA-SIT-%';
   DELETE FROM payment_receipts    WHERE company = 'Glassco' AND (data->>'clientName') LIKE 'SIT-TEST%';
   DELETE FROM credit_notes        WHERE company = 'Glassco' AND (data->>'reason') LIKE 'SIT-TEST%';
   DELETE FROM ledger              WHERE company = 'Glassco' AND (data->>'description') LIKE '%SIT-TEST%';
   ```

2. **Open the app** at `http://localhost:3000` (`npm run dev`).
3. **Switch to Glassco** company (top-right company selector).
4. **Login** as Hassan / owner role.
5. **Open** `/e2e-verify` page in a 2nd browser tab (you'll alternate between flows + verification).

---

## Flow status legend

- ⬜ Not run yet
- 🟡 In progress
- ✅ Passed (all assertions met)
- ❌ Failed (note bug below)

---

## Flow F1 · Client create → Quotation save → SO auto-generate

**Status:** ⬜ Not run

### Steps

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Sales → Clients → "+ Add Client" | Form opens | ⬜ |
| 2 | Fill: `SIT-TEST Client F1`, phone `0300-1111111`, address `Test`, save | Client appears in list | ⬜ |
| 3 | Sales → Quotations → "+ New Quotation" → select `SIT-TEST Client F1` | Client dropdown shows new client | ⬜ |
| 4 | Add 1 item: 5mm Plain Glass, 4ft × 6ft, qty 2, rate PKR 250/sqft | Item added, `totalAmount = 12000` | ⬜ |
| 5 | Save quotation as Draft | Quotation `QUT-GLA-YY-NNNN` allocated | ⬜ |
| 6 | Approve quotation (button on quotation card) | Status → `Approved` | ⬜ |
| 7 | Check `production_pieces` localStorage (DevTools → Application → Local Storage → `gtk_erp_production_pieces`) | 2 pieces with `orderId = <quotationId>` | ⬜ |
| 8 | Check Supabase: `SELECT * FROM production_pieces WHERE order_id = '<id>'` | 2 rows, status = 'Cut' | ⬜ |

### Auto-verify alternative

- Open `/e2e-verify`
- Select recipe **"Quotation — Auto-Create & Verify All Locations"**
- Inputs: company=Glassco, client=SIT-TEST Client F1, amount=12000
- Click **Run Create**, then **Run Verify**
- All 4 locations should pass: localStorage quotations, Supabase quotations, localStorage pieces, Supabase pieces

---

## Flow F2 · SO → Production cutting → Pieces → QC → Delivery mark

**Status:** ⬜ Not run

**Prerequisite:** Flow F1 completed (quotation `QUT-GLA-YY-NNNN` exists, pieces created)

### Steps

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Production → Cutting → select quotation from F1 | Pieces list shown, all status `Cut` | ⬜ |
| 2 | Open Cutting Session, select all pieces, close session | Session GL posted: Dr WIP / Cr Glass Inventory | ⬜ |
| 3 | Check ledger: `SELECT * FROM ledger WHERE data->>'id' = 'GL-CUT-<sessionId>'` | Found, balanced, status=Posted | ⬜ |
| 4 | If item has services (P/E, R/D, Notch) → pieces should be `Service-Pending`. Else → `QC-Pending` | Status routing correct | ⬜ |
| 5 | Production → QC → select pieces from cut session → mark QC-Passed | Pieces flip to `QC-Passed` | ⬜ |
| 6 | Production → Dispatch → Create Site Delivery → select pieces → mark Dispatched | Pieces → `Dispatched` | ⬜ |
| 7 | Mark delivery complete (Acknowledge button) | Pieces → `Delivered`, delivery_acknowledged_at set | ⬜ |

### Auto-verify alternative

No single recipe; verify in Supabase:
```sql
SELECT (data->>'status') status, COUNT(*)
FROM production_pieces
WHERE order_id = '<F1-quotation-id>'
GROUP BY (data->>'status');
```
Expected: all `Delivered`.

---

## Flow F3 · Delivery → Invoice auto-gen → GL post

**Status:** ⬜ Not run

**Prerequisite:** Flow F2 completed (pieces are `Delivered`)

### Steps

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Sales → Sales Orders → find `QUT-GLA-YY-NNNN` (now status=Delivered) → click "Generate Invoice" | Invoice modal opens | ⬜ |
| 2 | Enter GST = 17%, confirm | Invoice `INV-GLS-MMYY-NNNN` generated | ⬜ |
| 3 | Open the invoice → verify amounts: subtotal 12000, GST 2040, grandTotal 14040 | Math correct | ⬜ |
| 4 | Check ledger `SELECT * FROM ledger WHERE data->>'referenceId' = '<invoice-id>'` | 3 entries: AR Dr / Revenue Cr / GST Payable Cr | ⬜ |
| 5 | Each ledger entry: sum(debit) = sum(credit) | Balanced | ⬜ |
| 6 | Check that COGS entry exists: `GL-COGS-<invoiceId>` | Dr COGS / Cr Glass Inventory at MAP × sqft | ⬜ |
| 7 | Verify `invoiceNo` written back to quotation: `SELECT data->>'invoiceNo' FROM quotations WHERE id = '<F1-id>'` | Matches invoice ID | ⬜ |
| 8 | Quotation status now `Invoiced` | ✅ | ⬜ |

### Auto-verify alternative

- `/e2e-verify` → **"Invoice — Auto-Create & Verify AR Lifecycle"**
- Verifies: localStorage invoices, Supabase invoices, ledger AR Dr line, ledger Revenue Cr line

---

## Flow F4 · Invoice → Receipt → AR balance reduce → GL post

**Status:** ⬜ Not run

**Prerequisite:** Flow F3 completed (invoice INV-GLS-... exists with balance 14040)

### Steps

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Sales → Receipts → "+ New Receipt" → select client `SIT-TEST Client F1` | Outstanding invoices shown including new one | ⬜ |
| 2 | Allocate PKR 10000 against `INV-GLS-MMYY-NNNN`, save | Receipt `RCP-GLS-YY-NNNN` created | ⬜ |
| 3 | Check invoice balance: should be 4040 (was 14040, paid 10000) | Balance reduced | ⬜ |
| 4 | Check invoice status: should be `Partial` | Status flipped | ⬜ |
| 5 | Check ledger: `GL-RCP-<receipt-id>` | Dr Cash / Cr AR for 10000 | ⬜ |
| 6 | Pay remaining 4040 in a 2nd receipt | Invoice → `Paid`, balance = 0 | ⬜ |
| 7 | AR balance for client = 0 | ✅ | ⬜ |

---

## Flow F5 · Credit Note issue → AR reverse + revenue reverse

**Status:** ⬜ Not run

**Prerequisite:** Create a fresh invoice for this flow (don't use F4's fully-paid one). Use Flow F3 again with a 2nd quotation `QUT-GLA-YY-NNN2`.

### Steps

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Sales → Invoices → find `INV-GLS-MMYY-NNN2` (Outstanding, balance = X) | Invoice shown | ⬜ |
| 2 | Click "Issue Credit Note" → enter amount = X/2 (half), reason = `SIT-TEST partial CN` | CN modal opens | ⬜ |
| 3 | Confirm → CN `CN-GLS-YY-NNNN` created | ✅ | ⬜ |
| 4 | Check ledger: reversing entry — Dr Revenue / Cr AR for X/2 | Balanced | ⬜ |
| 5 | Check ledger: COGS REVERSAL entry `GL-COGS-REV-<invoiceId>-CN-...` | 50% of COGS reversed | ⬜ |
| 6 | Invoice balance reduced by X/2 | Balance = X/2 | ⬜ |
| 7 | Inventory store value increased (try `InventoryService.getStore()` in DevTools) | Materials proportionally restored | ⬜ |
| 8 | Issue 2nd CN for remaining X/2 → invoice → `Paid`, balance = 0 | ✅ | ⬜ |

---

## Flow F6 · Stock OB → Stock ledger → Inventory Valuation matches

**Status:** ⬜ Not run

### Steps

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Admin → Cutover Wizard → Stock Opening Balance → upload CSV (or enter manually) | Format: name, category, qty, rate | ⬜ |
| 2 | Enter 3 items: Glass 6mm × 1000 sqft @ 150, Aluminium L-profile × 500 RFT @ 200, Hardware H1 × 100 pcs @ 50 | Total value = 250000 | ⬜ |
| 3 | Submit → stock OB GL posted: Dr Inventory 250000 / Cr Opening Equity 250000 | Ledger entry balanced | ⬜ |
| 4 | Reports → Inventory Valuation Report → filter Glassco | Total inventory value = 250000 | ⬜ |
| 5 | Check `stock_ledger_entries` table: 3 rows (opening) | All 3 materials present | ⬜ |
| 6 | Mark `stock_ob_done = true` in cutover snapshot | Checklist item ticked | ⬜ |

---

## Flow F7 · CSV import (clients) → SalesCRM dropdown reflects

**Status:** ⬜ Not run

### Steps

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Prepare CSV: `Name,Phone,Address,Email` + 5 rows of SIT-TEST clients | File ready | ⬜ |
| 2 | Sales → Clients → "Import CSV" button | File picker | ⬜ |
| 3 | Upload CSV → see preview with 5 rows, 0 errors | Preview shows all 5 | ⬜ |
| 4 | Confirm import | Success toast: "5 clients imported" | ⬜ |
| 5 | Sales → Clients list → 5 new clients visible | ✅ | ⬜ |
| 6 | Sales → New Quotation → client dropdown → all 5 SIT-TEST clients searchable | Dropdown reflects | ⬜ |
| 7 | Check `csv_import_logs` table for audit row | 1 entry with rows_succeeded=5 | ⬜ |
| 8 | Check Supabase `clients` table: 5 new rows with `company='Glassco'` | All persisted | ⬜ |

---

## Flow F8 · AR Opening Balance import → AR Aging shows day-1

**Status:** ⬜ Not run

### Steps

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Admin → Cutover Wizard → AR Opening Balance → upload CSV | Format: clientId, invoiceNo, date, amount, balance | ⬜ |
| 2 | Enter 3 rows: 30-days-old PKR 50000, 60-days-old PKR 30000, 90-days-old PKR 20000 | Total = 100000 | ⬜ |
| 3 | Submit → 3 opening invoices created with status=`Outstanding` | Invoices in list | ⬜ |
| 4 | GL: Dr AR 100000 / Cr Opening Equity 100000 | Ledger balanced | ⬜ |
| 5 | Reports → AR Aging Report → filter Glassco | Total AR = 100000 | ⬜ |
| 6 | Aging buckets: 30-day=50000, 60-day=30000, 90-day=20000 | All 3 buckets populated | ⬜ |
| 7 | Mark `ar_ob_done = true` in cutover snapshot | Checklist ticked | ⬜ |

---

## Cross-cutting verifications (run after all 8)

### V1 — Ledger balanced
```sql
SELECT data->>'id' AS tx_id,
       SUM((elem->>'debit')::numeric)  AS dr,
       SUM((elem->>'credit')::numeric) AS cr
FROM ledger,
     jsonb_array_elements(data->'details') AS elem
WHERE company='Glassco' AND data->>'status'='Posted'
GROUP BY data->>'id'
HAVING ABS(SUM((elem->>'debit')::numeric) - SUM((elem->>'credit')::numeric)) > 0.01;
```
**Expected:** 0 rows.

### V2 — No duplicate invoices
```sql
SELECT data->>'invoiceNo', COUNT(*)
FROM invoices WHERE company='Glassco' AND data->>'invoiceNo' IS NOT NULL
GROUP BY data->>'invoiceNo' HAVING COUNT(*) > 1;
```
**Expected:** 0 rows.

### V3 — No orphan invoices (every invoice has a client)
```sql
SELECT i.id, i.data->>'clientId' AS missing_client
FROM invoices i
LEFT JOIN clients c ON c.id = i.data->>'clientId' AND c.company = i.company
WHERE i.company='Glassco' AND c.id IS NULL;
```
**Expected:** 0 rows.

### V4 — Trial Balance is balanced (Dr total = Cr total)
```sql
SELECT
  SUM((elem->>'debit')::numeric)  AS total_dr,
  SUM((elem->>'credit')::numeric) AS total_cr
FROM ledger,
     jsonb_array_elements(data->'details') AS elem
WHERE company='Glassco' AND data->>'status'='Posted';
```
**Expected:** `total_dr = total_cr` (within ±PKR 1).

---

## Sign-off

| Flow | Pass | Tester | Date | Notes |
|---|---|---|---|---|
| F1 — Client/Quote/SO | ⬜ | | | |
| F2 — Production chain | ⬜ | | | |
| F3 — Invoice + GL | ⬜ | | | |
| F4 — Receipt + GL | ⬜ | | | |
| F5 — Credit Note | ⬜ | | | |
| F6 — Stock OB | ⬜ | | | |
| F7 — Client CSV | ⬜ | | | |
| F8 — AR OB | ⬜ | | | |
| V1–V4 cross-checks | ⬜ | | | |

**Phase 2 PASS criteria:** all 8 flows + all 4 cross-checks green. Then move to Phase 3 (Data Migration Testing).

---

_Created: 2026-05-16_
