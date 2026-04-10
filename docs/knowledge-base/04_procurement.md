# Module: Material Management & Procurement (MM/PUR)

> GlassTech S/4HANA ERP -- Procurement Module Knowledge Base
> For LLM Copilot Ingestion (Gemma 4)

---

## User Roles Allowed

| Role | Access Level |
|------|-------------|
| `super_admin`, `owner`, `hassan` | Full procurement access |
| `gtk_admin`, `glassco_admin`, `nippon_admin` | Full within their company |
| `factory_manager` | Inventory + Requisitions |
| `admin_officer` | Inventory + Logistics + Requisitions |
| `glassco_production`, `dispatch_staff` | Inventory read, Logistics |
| Supervisor roles | Inventory + Requisitions |
| Store Incharge | Full Store/Procurement access within company |

---

## Core Workflows (Step-by-Step)

### Workflow 1: Purchase Requisition to PO

**Screen:** Procurement (PUR) > Requisitions

**Step 1 -- Create Requisition:**
1. Click **+ New Requisition**
2. Fill in: Date, Requisitioner name, Priority (Urgent/Normal/Low)
3. Select Category: Material/Inventory, BOM Hardware, Aluminium, Glass Purchase, Consumables, Tool Purchase, General Expense, Vehicle Fuel, etc.
4. Add line items: Description, Quantity, Unit, Delivery Date, Cost Center
5. Select Payment Mode: Cash, Petty Cash, Personal Account, Bank Transfer
6. Click **Save** -- status becomes `Pending`

**Step 2 -- MD Review & Approval:**
1. MD/Owner opens Requisitions list
2. Reviews pending requisitions
3. Clicks **Approve** -- triggers:
   - Parked Payment Voucher (PV) created in Finance GL
   - For Store Purchases: Dr Employee Advances (11421) / Cr Cash (advance for purchaser)
   - For Regular Expenses: Dr Expense Account / Cr Cash
4. Or clicks **Reject** with reason

**Step 3 -- Convert to PO (Material Requisitions):**
1. Approved material requisitions show **Convert to PO** button
2. Click to create Purchase Order with:
   - Status: Sent
   - Category: from requisition
   - Linked reqId back to original requisition
3. PO appears in Purchase Orders section

**Step 4 -- Budget Check (SCM-2):**
- On PO approval, system checks: committed spend + new PO total <= monthly budget
- Budget read from `budget_lines` table (fiscal_year, fiscal_month, monthly_budget per cost center)
- If exceeded: `BudgetExceededError` thrown, PO blocked (requires CFO override)
- If no budget configured: warning logged, PO allowed (non-blocking)

### Workflow 2: Goods Receipt (GRN) -- MIGO Transaction

**Screen:** Procurement (PUR) > Goods Receipt (MIGO)

**Step 1 -- Create GRN Header:**
1. Select Vendor and linked PO
2. Enter: DC Number (vendor delivery challan), Bilty Number, Vehicle details
3. Enter GRN Date

**Step 2 -- Enter Line Items:**
For each material received:
1. Select product (thickness, sheet size)
2. Enter: Sheet Count, Sqft per Sheet, Rate (PKR)
3. Enter Weight (kg) for landed cost allocation
4. **Per-Sheet Inspection:** For each sheet, assign Tag ID and status:
   - **OK** -- full usable area
   - **Defective** -- partial usable area (enter usable sqft + defect code)
   - **Broken** -- complete loss

**Defect Codes:**
| Code | Description |
|------|-------------|
| BR-01 | Transit Damage |
| BR-02 | Edge Chipping |
| BR-03 | Surface Scratch |
| BR-04 | Manufacturing Defect |
| BR-05 | Complete Break |
| BR-06 | Bubbles |

**Step 3 -- Enter Charges:**
1. Freight: Type A (Vendor Included in invoice) or Type B (Own Expense)
2. Crane/Unloading charges
3. Labour charges with Packing Buyback (IFRS gross accounting)
4. Custom charges

**Step 4 -- Generate Tags:**
- Format: `GLS-{THK}MM-{MMYY}-{BATCH}-{SERIAL}` (e.g., GLS-06MM-0326-001-01)
- One tag per sheet
- Must be generated before posting

**Step 5 -- Post GRN:**
System executes validation chain:
1. Vendor selected, DC number entered, at least 1 line filled
2. Tags generated
3. **QA Gate (SCM-1):** Validates OK/defective values against `inspection_lots` table
4. **Three-Way Match (SCM-5):** PO vs GRN vs Invoice within PKR 1 tolerance
5. GL entries posted (see GL Impact section)
6. Stock quantities updated:
   - `quantity += okSqft + defUsableSqft`
   - `unrestrictedQty += okSqft`
   - `defectiveSqft += defUsableSqft`
7. MAP recalculated with landed costs

### Workflow 3: Vendor Defect Claim

1. Defective sheets detected during GRN inspection
2. System auto-drafts Vendor Defect Report
3. Report shows: original sqft vs usable sqft, defect codes, photos
4. Send to vendor via WhatsApp/Email/Print
5. Status flow: **Draft > Sent > Verbally Confirmed > Settled**
6. On settlement: GL entry Dr GR/IR Clearing / Cr Glass Breakage

### Workflow 4: Scrap Disposal

1. System suggests scrap disposal when scrap rate > 70% over 7-day window
2. Record scrap: weight (kg), dealer quotes (3+ required)
3. Agree on dealer rate
4. Post disposal:
   - If actual amount > nominal value: excess to Other Income (44112)
   - If actual amount < nominal value: loss to Breakage (56113)
   - GL: Dr Cash / Cr Scrap Inventory + Cr/Dr variance account

---

## Strict Business Rules & Constraints

### SCM-1: QA Integrity Gate
- **Rule:** GRN CANNOT be posted without matching QA inspection record
- **Validation:** OK + defective values checked against `inspection_lots` Supabase table
- **Tolerance:** PKR 1
- **Error:** `GRNQAIntegrityError` -- blocks entire GRN posting

### SCM-2: Budget Enforcement on PO Approval
- **Rule:** Committed monthly spend + new PO total must not exceed cost center monthly budget
- **Source:** `budget_lines` table (fiscal_year, fiscal_month, monthly_budget)
- **Error:** `BudgetExceededError` -- blocks PO approval
- **Non-blocking fallback:** If no budget row exists, warning logged but PO allowed

### SCM-3: Insufficient Stock Gate
- **Rule:** Cannot issue material if unrestricted quantity < requested quantity
- **Check:** Live Supabase query of `unrestricted_qty`
- **Error:** `InsufficientStockError` -- blocks material issue
- **DB Constraint:** `qty_non_negative` check constraint as fallback

### SCM-5: Three-Way Match Validation
- **Rule:** PO total vs GRN received value vs Vendor Invoice must match within PKR 1
- **Legs:**
  1. PO exists with status = Approved
  2. GRN received value approximately equals PO total
  3. Vendor invoice amount approximately equals GRN value
- **Tolerance:** PKR 1 on each leg

### IAS-2: Landed Cost MAP Calculation
- **Rule:** All acquisition costs (freight, duty, handling) absorbed into inventory MAP per unit
- **Formula:** `new_MAP = (preQty x oldMAP + recvdQty x landedUnitPrice) / newQty`
- **Landed Unit Price:** `unitPrice + (freight + duty + handling) / receivedQty`
- **Precision:** 6 decimal intermediate, 2 decimal final
- **Timing:** Must calculate AFTER GRN stock quantities committed

### Landed Cost Allocation Priority
1. **Weight-Based (Priority):** If all lines have weight and total > 0: `lineShare = (lineWeight / totalWeight) x totalCharges`
2. **Sqft-Based (Fallback):** If bilty weight available but line weights missing: `lineShare = (lineSqft / totalSqft) x totalCharges`
3. **Period Expense:** If neither available, charges stay as period expense (not capitalized)

### Packing Buyback (IFRS Gross Accounting)
- Labour and packing shown gross, not netted
- GL: Dr Unloading Labour (51216) / Cr Other Income for packing (44112) / Cr Cash (net payable)
- `netPayable = labourCharges - (palletCount x palletRate)`

---

## State Machines

### Requisition Status
```
Pending ----[MD Approves]----> Approved ----[Convert]----> Converted to PO
   |                              |
   +----[MD Rejects]----> Rejected
```

### Purchase Order Status
```
Draft ----[Send]----> Sent ----[GRN Pending]----> Delivered
  |                     |
  +--[Cancel]---> Cancelled
```

### PO Match Status
```
Pending ----[GRN Posted]----> 2-Way Match ----[Invoice Matched]----> 3-Way Match
                                  |
                            [Variance > 1%]----> Mismatch / On-Hold
```

### GRN Posting Validation Sequence
```
1. Vendor selected
2. DC number entered
3. At least 1 filled line
4. Tags generated
5. Freight refs entered (if applicable)
6. assertGRNQAMatch() -- QA gate
7. orchestrateGRNGL() -- GL chain with 3-way match
```

### Defect Claim Status
```
Draft ----[Send to Vendor]----> Sent ----[Verbal Confirm]----> Confirmed ----[Settle]----> Settled
```

---

## GL Impact

### GRN Material Posting
- **Dr:** Inventory (Glass 11511 / Aluminium 11511 / Hardware 11513) -- Material + Landed Charges
- **Cr:** GR/IR Clearing (21151)

### Freight Type A (Vendor Included)
- **Dr:** Payable -- Glass Importers (21111)
- **Cr:** Cash in Hand (11112)

### Freight Type B (Own Expense)
- **Dr:** Inward Freight Expense (51214)
- **Cr:** Cash/Payable

### Defect Adjustment
- **Dr:** GR/IR Clearing (21151)
- **Cr:** Glass Breakage & Write-off (56113)

### Scrap Disposal
- **Dr:** Cash in Hand (11112) -- Actual amount received
- **Cr:** Scrap Inventory -- Nominal value
- **Cr/Dr:** Other Income (44112) or Breakage (56113) for variance

### Labour + Packing (Gross Accounting)
- **Dr:** Unloading Labour (51216) -- Full labour charges
- **Cr:** Other Income (44112) -- Packing buyback
- **Cr:** Cash in Hand (11112) -- Net payable

### Crane/Unloading
- **Dr:** Unloading Expense (51215)
- **Cr:** Cash in Hand (11112)

---

## Inventory Management

### Stock Quantity Layers
| Layer | Description |
|-------|-------------|
| `quantity` | Total physical stock (OK + defective) |
| `unrestrictedQty` | Available for issue/sale (OK stock only) |
| `qiQty` | Quality Inspection hold |
| `blockedQty` | Reserved/locked stock |
| `reservedQty` | Committed to orders |
| `defectiveSqft` | Usable area of defective sheets |
| `remnantSqft` | Usable area of remnants |
| `scrapSqft` | Accumulated since last disposal |

### Movement Codes (Stock Ledger)
| Code | Description |
|------|-------------|
| 101 | GRN (Goods Receipt) |
| 102 | GRN Reversal |
| 201 | Consumption/Issue |
| 261 | Issue to Production |
| 551 | Remnant Created |
| 561 | Opening Balance |
| 601 | Other |

### Barcode Format
`{COMPANY}-{CATEGORY}-{SEQUENCE}` (e.g., GTK-RAW-00142)

### Remnant Management
- Shapes: Rectangle or L-Shape
- Status: Available, Reserved, Used, Scrapped
- Suggestion: If scrap rate > 70% over 7 days, suggest "Treat as Scrap"
- Fit check: System finds remnants that fit required dimensions

---

## Demand Forecasting & EOQ

### Economic Order Quantity
```
EOQ = sqrt((2 x D x S) / H)
where:
  D = annual demand (units/year from 6-month history)
  S = ordering cost per order (PKR 2,500 default)
  H = holding cost per unit/year (20% of MAP default)
```

### Reorder Point Alerts
- **CRITICAL:** Quantity <= minimum level
- **LOW:** Quantity <= reorder point but > minimum
- Suggested PO quantity: reorderPoint x 2

### Demand Trend Detection
- 3-month rolling average with 6-month history
- Trend: UP (+10%), DOWN (-10%), STABLE
- Trend factor applied to forecast: UP=1.05, DOWN=0.95, STABLE=1.0

---

## MRP (Material Requirements Planning)

### Wastage Defaults by Glass Type
| Glass Type | Wastage % |
|-----------|-----------|
| Plain | 12% |
| Color | 14% |
| Mirror | 15% |
| Frosted | 14% |
| Laminated | 16% |

### Lead Time Schedule (Working Days, excl. Friday)
| Stage | Days |
|-------|------|
| Cutting | 1 |
| Services | 1 |
| Tempering | 3 |
| Buffer | 1 |
| **Total** | **6** |

### Urgency Flags
- **Urgent:** Days until start <= 2 and > -1
- **Overdue:** Days until start < 0

---

## Vendor Scoring

### Composite Score (0-100)
- **60% weight:** On-Time Delivery percentage
- **40% weight:** Quality (1% rejection = 5 point deduction)

### Rating Scale
| Score | Rating |
|-------|--------|
| >= 85 | A (Excellent) |
| >= 70 | B (Good) |
| >= 50 | C (Average) |
| < 50 | D (Poor) |

### History Tracking
- Last 24 PO-to-GRN records for lead time
- Last 24 GRN records for quality rejection
- Feeds vendor selection suggestions

---

## Tool Auto-Registration from GRN

When GRN includes tools, system auto-registers:
- **Power Tool:** GRINDER, DRILL, SAW, CUTTER, JIGSAW, ROUTER, SANDER, COMPRESSOR
- **Cutting:** BLADE, BIT, DISC, HACKSAW
- **Measuring:** TAPE, LEVEL, SQUARE, RULER, CALIPER
- **Safety:** GLOVE, GOGGLE, HELMET, MASK, HARNESS
- **Installer Kit:** KIT, TOOLBOX, SET
- **Default:** Hand Tool

Tool ID format: `TOOL-{COMPANY}-{SEQUENCE}` (e.g., TOOL-GTK-001)
