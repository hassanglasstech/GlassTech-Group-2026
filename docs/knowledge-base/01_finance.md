# Module: FICO Financials (Finance & Controlling)

> GlassTech S/4HANA ERP -- Finance Module Knowledge Base
> For LLM Copilot Ingestion (Gemma 4)

---

## User Roles Allowed

| Role | Access Level |
|------|-------------|
| `super_admin`, `owner`, `hassan` | Full access -- all finance features |
| `gtk_admin`, `glassco_admin`, `nippon_admin` | Full access within their company |
| `admin_officer` | Accounts module access -- can post entries, view reports |
| `factory_manager` | Read-only financial dashboards (MIS, Job P&L) |
| Other roles | No direct finance access unless explicitly granted |

**JV Approver Roles (Maker-Checker):** `super_admin`, `owner`, `hassan`, `gtk_admin`, `glassco_admin`, `nippon_admin`

---

## Core Workflows (Step-by-Step)

### Workflow 1: Event Registry (Financial Events Inbox)

**Screen:** FICO Financials > Event Registry

**Purpose:** Events from other modules (Sales, HR, Inventory, Petty Cash) arrive here as pending items awaiting GL posting.

1. Navigate to **FICO Financials** in the sidebar
2. Click **Event Registry** tab
3. View all **Pending** financial events (auto-generated from Sales invoices, GRN postings, HR payroll, Petty Cash entries)
4. Click an event row to open the **GL Mapping Modal**
5. Select **Debit Account** (Level 4/5 GL account)
6. Select **Credit Account**
7. Optionally select **Cost Center** and toggle **Save Rule** (auto-maps future similar events)
8. Click **Post to GL** -- event status changes from Pending to Posted
9. Press **Alt+R** to refresh the list at any time

### Workflow 2: General Ledger -- Journal Voucher (Maker-Checker)

**Screen:** FICO Financials > General Ledger

**Purpose:** Manual journal entries require 4-eyes approval (one person drafts, another approves).

**Drafting (Maker):**
1. Navigate to **General Ledger** tab
2. Click **New Entry** button (or press **Alt+N**)
3. Fill in: Date, Description, Document Type (JV)
4. Add debit line(s): Select GL account, enter amount, optional cost center
5. Add credit line(s): Must balance exactly with debits
6. Click **Save as Draft** -- entry saved with status `Draft`, your email recorded as `draftedBy`

**Approving (Checker):**
1. Open General Ledger, filter by **Draft** status
2. Review the entry details, verify amounts and accounts
3. Click **Approve & Post**
4. System validates:
   - You are in JV_APPROVER_ROLES
   - Your email differs from the drafter (4-eyes rule)
   - Fiscal period is still open
   - Debits = Credits (integer-cent precision, zero tolerance)
5. On success: Status changes to `Posted`, `approvedBy` and `postedAt` recorded
6. On failure: Error toast with specific reason (e.g., "Approver cannot be the same as Maker")

**System-Auto Bypass:** Entries with `createdBy: 'system-auto'` (recurring expenses, depreciation, intercompany) skip Maker-Checker entirely.

### Workflow 3: Invoice Generation & Payment Collection

**Screen:** Sales & Distribution > Quotations > Generate Invoice (then FICO for payments)

1. In Sales module, approve a quotation (status becomes `Approved`)
2. Click **Generate Invoice** -- system auto-creates:
   - Invoice with sequential number (INV-GTK-2026-0001)
   - GL entry: Dr Accounts Receivable / Cr Service Revenue (+ Cr GST Payable if applicable)
3. In **FICO > Billing Hub**, view outstanding invoices
4. Click an invoice, then **Record Payment**
5. Enter: Date, Amount, Method (Cash/Bank/Cheque/Online), Reference number
6. System creates GL entry: Dr Cash/Bank / Cr Accounts Receivable
7. Invoice status updates: Outstanding > Partial (if partial) > Paid (if fully settled)

### Workflow 4: Petty Cash Management

**Screen:** FICO Financials > Petty Cash

1. Record petty cash receipt or payment
2. Entry saved with status **Parked** (M-7 rule: no entry auto-posts)
3. Finance officer reviews parked entries
4. Click **Post** to move to GL
5. GL validates balance before posting

### Workflow 5: Purchase Requisition Payment Flow

**Screen:** Procurement > Requisitions (triggers finance entries)

1. Purchase requisition is approved in Procurement module
2. System auto-creates **Parked Payment Voucher (PV)** in GL:
   - If Store Purchase (BOM, Aluminium, Glass, etc.): Dr Employee Advances (11421) / Cr Cash
   - If Regular Expense: Dr Expense Account / Cr Cash
3. Finance reviews in GL > Parked tab
4. Finance clicks **Post PV** -- entry moves to Posted status
5. When GRN arrives and is settled:
   - **Advance Settlement** creates JV clearing the advance
   - Actual inventory accounts debited, advance account credited
   - Variance handled (under-spend: cash refund; over-spend: additional cash payment)

### Workflow 6: Period Management

**Screen:** FICO Financials > Settings/Admin

1. Navigate to Period Management
2. View fiscal periods (YYYY-MM format)
3. **Open Period**: Allows GL posting for that month
4. **Close Period**: Blocks all new GL entries for that month
5. System auto-seeds current month as Open if none exist
6. Closing current month shows confirmation dialog (warning: prevents new entries)

### Workflow 7: Recurring Expenses

**Screen:** FICO Financials > Recurring Expenses Setup

1. Create template: Name, Amount, Debit Account, Credit Account, Cost Center, Day of Month
2. Monthly trigger (scheduled): System auto-posts GL entry
3. Duplicate prevention: Checks `lastPostedMonth` -- skips if already posted this month
4. Entry created with `createdBy: 'system-auto'` (bypasses Maker-Checker)

### Workflow 8: Asset Depreciation

**Screen:** FICO Financials > Asset Management

1. Register fixed asset: Name, Purchase Value, Useful Life (years), Purchase Date
2. Monthly trigger: System calculates depreciation = purchaseValue / (usefulLifeYears x 12)
3. Auto-posts GL entry: Dr Depreciation Expense (53911) / Cr Accumulated Depreciation (12121)
4. Skip logic: Won't post if already done for this month

---

## Strict Business Rules & Constraints

### FIN-1: Advance Overclaim Hard Cap
- **Rule:** Actual spend on advance settlement CANNOT exceed 1.5x the approved advance amount
- **Example:** If advance was PKR 50,000, maximum claimable is PKR 75,000
- **Enforcement:** `settleAdvance()` rejects immediately with `AdvanceOverclaimError`
- **Resolution:** Requires CFO approval workflow for amounts exceeding 1.5x

### FIN-2: Orphan Settlement Guard
- **Rule:** Cannot post a settlement without a matching advance GL entry
- **Check:** If requisition ID provided but no advance GL entry found, settlement is blocked
- **Error:** `OrphanSettlementError` -- directs user to restore or re-raise the advance entry

### FIN-3: GL Double-Entry Balance Gate (Zero Tolerance)
- **Rule:** EVERY Posted entry must have Debits = Credits, verified to integer-cent precision
- **Implementation:** Amounts multiplied by 100 (convert to paisa) to eliminate floating-point rounding
- **Tolerance:** ZERO -- even PKR 0.01 imbalance throws `LedgerImbalanceError`
- **Scope:** Applied to saveLedger(), recordTransaction(), postParkedPV(), depreciation, recurring expenses
- **Exemption:** Parked and Draft entries (may be incomplete)

### FIN-4: Live Invoice Balance
- **Rule:** Invoice balance computed live from `invoice_balances` Supabase view
- **Formula:** `live_balance = total_amount - SUM(payment_receipts.amount)`
- **Replaces:** Stale `invoices.paid_amount` field

### Period Locking
- **Rule:** Cannot post GL entries to closed fiscal periods
- **Check Points:** draftJV(), approveJV(), recordTransaction()
- **Future months:** Allowed without explicit period definition

### Maker-Checker 4-Eyes Rule
- **Rule:** JV approver email MUST differ from drafter email
- **Guards (in sequence):**
  1. Caller role in JV_APPROVER_ROLES
  2. JV exists and is in Draft status
  3. Approver != Maker
  4. Period is open
  5. GL balance passes

### Discount Cap (from Sales Integration)
- **Rule:** Discounts cannot exceed 99.99% and cannot exceed subtotal
- **Enforced:** Both client-side and server-side before Supabase write

### Credit Limit Enforcement
- **Rule:** Outstanding AR + new order value must not exceed client credit limit
- **Query:** Live sum of unpaid invoice balances per client

---

## State Machines

### GL Entry Status
```
Draft ----[Approve]----> Posted
  |                        |
  +---------[Void]-------> Ignored
                           |
Posted ----[Void]-------> Ignored
```

### Payment Voucher Status
```
Parked ----[Finance Posts]----> Posted
  |
  +--------[Void]------------> Ignored
```

### Invoice Lifecycle
```
Outstanding ----[Partial Payment]----> Partial
     |                                    |
     +------[Full Payment]--------------> Paid
     |
     +------[Past Due Date]-----------> Overdue
     |
     +------[Void Invoice]-----------> Voided
```

### Fiscal Period
```
Open ----[Close Period]----> Closed
Closed --[Re-open]--------> Open
```

---

## GL Impact (Account Mappings)

### Document Types
| Code | Name | Usage |
|------|------|-------|
| SA | Salary Posting | Payroll GL entries |
| KR | GRN Receiving | Inventory receipt posting |
| DR | Delivery Receipt | Sales/dispatch posting |
| DZ | Goods Dispatch | Stock issue posting |
| KZ | Stock Adjustment | Inventory corrections |
| CJ | Cost Allocation | Overhead absorption |
| OB | Opening Balance | Period opening entries |
| PV | Payment Voucher | Cash/bank payments |
| RV | Reversal | Corrective entries |
| JV | Journal Voucher | Manual entries (Maker-Checker required) |

### Key GL Account Codes
| Code | Name | Type |
|------|------|------|
| 11111 | Petty Cash | Asset |
| 11112 | Cash in Hand -- Main | Asset |
| 11121 | Bank -- MCB Current | Asset |
| 11421 | Employee Advances | Asset |
| 11511 | Aluminium Stock | Asset |
| 11512 | Glass Sheets Stock | Asset |
| 11513 | Hardware & Accessories | Asset |
| 11531 | Consumables -- Fabrication | Asset |
| 12113 | Fabrication Tools | Asset |
| 12121 | Accumulated Depreciation | Asset (contra) |
| 21111 | Payable -- Glass Importers | Liability |
| 21114 | Payable -- Other Vendors | Liability |
| 21151 | GR/IR Material Clearing | Liability |
| 44112 | Other Income (Packing) | Revenue |
| 53122 | Conveyance | Expense |
| 53511 | Vehicle Fuel -- Office | Expense |
| 53621 | Machine Maintenance | Expense |
| 53817 | Miscellaneous Expenses | Expense |
| 53911 | Depreciation Expense | Expense |
| 56113 | Glass Breakage & Write-off | Expense |

### Standard GL Entries by Transaction

**Sales Invoice:**
- Dr: Accounts Receivable (customer control) -- Grand Total
- Cr: Service Revenue -- Net Amount
- Cr: GST Payable -- GST Amount (if applicable)

**Payment Receipt:**
- Dr: Cash/Bank (per payment method)
- Cr: Accounts Receivable

**Credit Note:**
- Dr: Service Revenue
- Cr: Accounts Receivable

**Salary Disbursement:**
- Dr: Salaries Payable
- Cr: Cash in Hand

**GRN Posting:**
- Dr: Inventory (Glass/Aluminium/Hardware)
- Cr: GR/IR Clearing

**Advance Issuance:**
- Dr: Employee Advances (11421)
- Cr: Cash/Petty Cash/Bank

**Advance Settlement:**
- Dr: Inventory accounts (per category)
- Cr: Employee Advances (11421)
- Dr/Cr: Cash (for variance -- under/over spend)

**Depreciation:**
- Dr: Depreciation Expense (53911)
- Cr: Accumulated Depreciation (12121)

**Intercompany Transfer:**
- FROM company: Dr ICO Receivable (1220) / Cr Revenue or Cash
- TO company: Dr Inventory or Expense / Cr ICO Payable (2210)

### Payment Mode to Credit Account Mapping
| Payment Mode | Credit Account |
|-------------|---------------|
| Cash | 11112 (Cash in Hand -- Main) |
| Petty Cash | 11111 (Petty Cash) |
| Personal Account | 21114 (Payable -- Other Vendors) |
| Bank Transfer | 11121 (Bank -- MCB Current) |

---

## Cost Center Budgeting

### Budget vs. Actual Monitoring
- Each cost center has `budgetMonthly` and `alertThreshold` (default 80%)
- Actual spend = sum of debit lines on Posted GL entries tagged with the cost center for the month
- **Status:** OK (under threshold) | WARNING (>= 80% utilized) | OVER (exceeded budget)

### Petty Cash Float Control
- Each cost center can have `pettyCashFloat` (max cash held) and `pettyCashMonthlyBudget`
- Monthly spend tracked against budget
- **Status:** OK | WARNING (>= 80%) | OVER

---

## IFRS 9 ECL Provisioning (Aging Report)

### Loss Rate Table
| Bucket | Days Past Due | Loss Rate |
|--------|--------------|-----------|
| Current | 0-30 | 0.5% |
| 30+ | 31-60 | 2.0% |
| 60+ | 61-90 | 5.0% |
| 90+ | 91-120 | 15.0% |
| 120+ | >120 | 40.0% |

**Provision Calculation:** For each outstanding invoice, balance x loss rate = provision amount
**Journal Entry:** Dr Bad Debt Expense / Cr Allowance for Doubtful Debts

---

## Cash Flow Forecasting (13-Week Rolling)

### Inflow Sources
- AR Collections: Outstanding/Partial/Overdue invoices due each week
- Manual other inflows

### Outflow Sources
- AP Payments: Approved POs not yet paid (due date = GRN date + 30 or PO date + 45)
- Payroll: Full month salary in week containing 25th-31st
- Petty Cash: Average weekly from last 3 months
- Manual other outflows

### Weekly Status
- **SURPLUS:** Closing balance healthy
- **TIGHT:** Closing balance < 20% of outflows
- **DEFICIT:** Closing balance negative

---

## Three-Way Matching

| Match Status | Condition |
|-------------|-----------|
| MATCHED | PO vs GRN vs Invoice variance <= 1% |
| NO_GRN | PO approved but no goods receipt |
| NO_INVOICE | GRN exists but no vendor invoice matched |
| OVER_BILLED | Invoice > PO amount |
| UNDER_BILLED | Invoice < PO amount |

---

## Intercompany Transfers

### Transfer Types
- Glass Supply, Aluminium Supply, Hardware Supply, Services, Cash Transfer, Loan/Advance

### GL Pattern
- **FROM company:** Dr ICO Receivable (1220) / Cr Revenue or Cash
- **TO company:** Dr Inventory or Expense / Cr ICO Payable (2210)

### Reconciliation
- System scans all Posted ledger entries containing 'ICO' + counterparty name
- **MATCHED:** Net difference <= PKR 10
- **MISMATCH:** Net difference > PKR 10
- **MISSING:** One side has entry, other does not
