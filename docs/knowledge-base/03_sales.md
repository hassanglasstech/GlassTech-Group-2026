# Module: Sales & Distribution (SD)

> GlassTech S/4HANA ERP -- Sales Module Knowledge Base
> For LLM Copilot Ingestion (Gemma 4)

---

## User Roles Allowed

| Role | Access Level |
|------|-------------|
| `super_admin`, `owner`, `hassan` | Full sales access -- all companies |
| `gtk_admin`, `glassco_admin`, `nippon_admin` | Full sales within their company |
| `admin_officer` | Sales module access |
| `glassco_production`, `dispatch_staff` | Read-only (delivery/logistics view) |
| Supervisor roles | No sales access unless explicitly granted |

---

## Core Workflows (Step-by-Step)

### Workflow 1: Order-to-Cash (Glassco / Factory)

**Screen:** Sales & Dist. (SD) > Quotations

**Step 1 -- Create Quotation:**
1. Click **+ New Quotation**
2. Select Client from dropdown (or create new Business Partner)
3. Enter Project Name, Due Date
4. Add line items:
   - Glass Type (Clear, Frosted, Tinted, Mirror, etc.)
   - Thickness (5mm, 6mm, 8mm, 10mm, 12mm)
   - Width x Height (inches)
   - Quantity
   - Rate auto-calculated from product catalog: `baseRate + sum(serviceRates)`
   - Services: T/G (Tempering), Notch, P/E (Polished Edge), P/F, Double Glaze, R/D, Frosted, L/G
5. Add Service Charges (installation, transport, etc.)
6. Apply Discount (percentage or fixed amount -- max 99.99%, cannot exceed subtotal)
7. Click **Save as Draft**

**Step 2 -- Approve Quotation:**
1. Review quotation details
2. Credit limit check runs automatically (SAL-3): Outstanding AR + new order <= credit limit
3. Click **Approve** -- quotation locked, Sales Order number assigned (SO-COMPANY-YYYYMM-NNNN)
4. Production pieces auto-generated (one per qty per line item)

**Step 3 -- Generate Invoice:**
1. Navigate to approved quotation
2. Click **Generate Invoice**
3. System creates invoice (INV-COMPANY-YYYY-NNNN) with:
   - Due date = today + 30 days
   - GL entry: Dr Accounts Receivable / Cr Service Revenue (/ Cr GST if applicable)
4. Quotation status changes to `Invoiced`

**Step 4 -- Collect Payment:**
1. Open invoice in Billing Hub
2. Click **Record Payment**
3. Enter: Date, Amount, Method (Cash/Bank/Cheque/Online), Reference
4. GL entry: Dr Cash/Bank / Cr Accounts Receivable
5. Invoice status updates: Outstanding > Partial > Paid

### Workflow 2: GTK Window Quotation (Advanced)

**Screen:** Sales & Dist. (SD) > GTK Quotation Builder

**Step 1 -- Create Header:**
1. Enter Client, Site, Architect, Color
2. Select Profile Type: Non-Thermal, Thermal Break, AluWood OAK, AluWood TEAK, uPVC White, uPVC Black Lami
3. Select Section Size: 4", 5", 55mm, 60mm, 70mm, 120mm
4. Select Hardware Brand: KINLONG, KHASS
5. Select Mode: Aluminum only OR Inclusive (aluminum + glass)

**Step 2 -- Add Options (Multi-Option Quotation):**
1. Click **Add Option** (e.g., Option A, Option B, Revised-1)
2. For each option, add window items:
   - Window Type (23 types: Openable 1S, Fixed, Sliding Door 2S, Lift & Slide, Box Section, etc.)
   - Floor, Location, Location Code (e.g., W1, DW-3)
   - Dimensions (Width x Height in feet)
   - Quantity
   - Glass Spec (5mm Clear TG, 8mm Clear TG, DG 24mm, Laminated, Custom)
   - Netting: None, Zigzag (Rs.85/sqft), HD Steel (Rs.110/sqft)
   - Rate auto-pulled from rate card, or manual override
3. Review per-option totals and margin analysis

**Step 3 -- Approve & Convert to Job Order:**
1. Select winning option
2. Click **Convert to Job Order**
3. System generates:
   - Job Order (JO-GTK-YYYY-NNNN)
   - BOM explosion: Aluminum RFT (5% waste factor), Glass SqFt (8% waste), Hardware Sets, Netting
   - Production pieces for manufacturing
4. Job Order appears in Production module

### Workflow 3: Credit Note / Invoice Void

**Issue Credit Note:**
1. Open invoice in Billing Hub
2. Click **Issue Credit Note**
3. Enter amount (must be > 0 and <= outstanding balance) and reason
4. GL entry: Dr Revenue / Cr Accounts Receivable
5. Invoice balance reduced; if balance <= 0, status becomes Paid

**Void Invoice (BA-01):**
1. Open invoice (cannot void if fully paid or has partial payments)
2. Click **Void Invoice**
3. Full reversal GL entry posted
4. Quotation status reverts to Approved
5. Invoice status becomes Voided

### Workflow 4: Client Statement

1. Open client record in Sales module
2. Click **View Statement**
3. Shows all invoices: Paid, Outstanding, Overdue
4. Printable statement available

---

## Strict Business Rules & Constraints

### SAL-1: Discount Cap
- **Rule:** Discount percentage cannot exceed 99.99%
- **Rule:** Discount amount cannot exceed subtotal
- **Enforced:** Both client-side (before save) and server-side (before Supabase write)
- **Error:** Toast notification if violated, save blocked

### SAL-2: Invoice Amount Validation
- **Rule:** Every invoice totalAmount must be finite and non-negative
- **Enforced:** Server-side before Supabase write
- **Purpose:** Prevents NaN/Infinity from floating-point accumulation

### SAL-3: Credit Limit Enforcement
- **Rule:** Outstanding AR + new order value must not exceed client credit limit
- **Query:** Live sum of unpaid invoice balances from Supabase
- **Fail-Open:** If network error during check, save is allowed (offline mode)

### SAL-4: Payment Receipt Atomicity
- **Rule:** Payment receipt insertion + invoice balance update must be atomic
- **Implementation:** Supabase RPC `process_payment_receipt` eliminates TOCTOU race conditions
- **Fallback:** Direct upsert if RPC unavailable

### Billing Dimension Rounding (Glass)
- Tempered glass (inclusive): round UP to nearest 6 inches if <= 12"
- Otherwise: round UP to nearest 12 inches if > 12"
- SqFt = (billingWidth x billingHeight) / 144

### GST Calculation
- Applied post-discount: `gstAmount = (subtotal - discount) x gstPercent / 100`
- Grand Total = subtotal - discount + GST

---

## State Machines

### Quotation Status
```
Draft ----[Approve (credit check + validation)]----> Approved (orderNo assigned)
  |                                                      |
  |                                         [Generate Invoice]
  |                                                      |
  +----[Delete]                                    Invoiced
```

### Invoice Status
```
Outstanding ----[Partial Payment]----> Partial ----[Full Payment]----> Paid
     |
     +----[Past Due Date]-----------> Overdue
     |
     +----[Void Invoice]-----------> Voided
```

### GTK Job Order Status
```
Open ----[Start Work]----> In Progress ----[Complete]----> Completed
  |
  +----[Cancel]----> Cancelled
```

---

## GL Impact

### Sales Invoice GL Entry
- **Dr:** Accounts Receivable (Customer Control) -- Grand Total
- **Cr:** Service Revenue -- Net Amount (after discount)
- **Cr:** GST Payable -- GST Amount (if applicable)

### Payment Receipt GL Entry
- **Dr:** Cash/Bank (per payment method) -- Payment Amount
- **Cr:** Accounts Receivable -- Payment Amount

### Credit Note GL Entry
- **Dr:** Service Revenue -- Credit Amount
- **Cr:** Accounts Receivable -- Credit Amount

### Intercompany Mirror (when buyer is different company)
- **Selling Company:** Normal invoice GL (Dr AR / Cr Revenue)
- **Buying Company:** Auto-purchase bill: Dr COGS / Cr Payable

---

## Pricing & Rate Logic

### Universal Quotation (Glassco/Factory) Rate Calculation
```
finalRate = Product.basePrice (for glass type + thickness)
          + sum of Product.basePrice for each selected service

Special: If Tempered (T/G) selected, other service rates excluded
```

### GTK Rate Card (Rs./sqft by Profile x Window Type)

| Profile Type | Openable 1S | Fixed | Sliding Door 2S |
|-------------|-------------|-------|-----------------|
| Non-Thermal | 2,350 | 1,550 | 3,050 |
| Thermal Break | 4,257 | 2,022 | 5,062 |
| AluWood OAK | 5,527 | 2,468 | 7,144 |
| AluWood TEAK | 4,545 | 2,757 | 5,131 |
| uPVC White | 1,825 | 969 | 2,170 |
| uPVC Black Lami | 2,100 | 1,100 | 2,450 |

### GTK Glass Rates (Rs./sqft)
| Spec | Rate |
|------|------|
| 5mm Clear TG | 150 |
| 8mm Clear TG | 260 |
| 8mm Grey TG | 290 |
| DG 24mm Clear | 480 |
| Laminated Glass | 540-620 |

### GTK Netting Costs
- Zigzag Wire Mesh: Rs. 85/sqft
- HD Steel Mesh: Rs. 110/sqft

### GTK Margin Analysis
```
Cost ratios (estimated material cost as % of sell):
  Non-Thermal: 58% (42% gross margin)
  Thermal Break: 55% (45% gross margin)
  AluWood OAK: 52% (48% gross margin)
  uPVC White: 60% (40% gross margin)
```

---

## BOM Explosion (GTK Job Orders)

When a GTK quotation is converted to a Job Order, BOM lines are auto-generated:

| Material | Calculation | Waste Factor |
|----------|------------|--------------|
| Aluminum Profile | Perimeter (ft) x qty x 1.05 | 5% |
| Glass | Area (sqft) x qty x 1.08 | 8% |
| Hardware Set | 1 per window x qty | 0% |
| Netting Mesh | Area (sqft) x qty x 1.05 | 5% |

---

## Sequential Numbering

| Entity | Pattern | Example |
|--------|---------|---------|
| Quotation | QT-{COMPANY}-YYYYMM-NNNN | QT-GTK-202603-0001 |
| Sales Order | SO-{COMPANY}-YYYYMM-NNNN | SO-GTK-202603-0001 |
| Invoice | INV-{PREFIX}-YYYY-NNNN | INV-GTK-2026-0001 |
| Credit Note | CN-{PREFIX}-YYYY-NNNN | CN-GTK-2026-0001 |
| Job Order | JO-{PREFIX}-YYYY-NNNN | JO-GTK-2026-0001 |
| Client/BP | BP-XXXXXX | BP-ABC123 |

---

## Vendor Management (Rate Lists)

### Vendor Rate Versioning
- Each vendor maintains rate list versions with effective dates
- Rates tracked by glass thickness and service type (Tempering, Lamination)
- Version history preserved for audit

### Lead Time Tracking
- Recorded per PO-to-GRN cycle
- On-time flag: actual days <= expected lead days
- Used for vendor scoring and delivery promise calculation

### Quality Metrics
- Rejection count per GRN
- Rejection percentage tracked per vendor
- Feeds into vendor scorecards

---

## Delivery Promise Estimation

### Calculation Components
1. **Cutting Backlog:** Pending sqft / daily capacity (default 400 sqft/day)
2. **Vendor TAT:** Average turnaround from dispatch history (default 4 days)
3. **Buffer:** 1 day base + 1 day for high-value (>PKR 300,000) + 1 day for Double Glazing
4. **Total:** Sum of days, skipping Fridays

### Vendor Suggestion
- Sorted by lowest average TAT with delivery history
- Shows alternatives with reliability scores
