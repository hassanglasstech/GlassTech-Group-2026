# Module: Production Planning & Manufacturing (PP)

> GlassTech S/4HANA ERP -- Production Module Knowledge Base
> For LLM Copilot Ingestion (Gemma 4)

---

## User Roles Allowed

| Role | Access Level |
|------|-------------|
| `super_admin`, `owner`, `hassan` | Full production access |
| `gtk_admin`, `glassco_admin` | Full within their company |
| `factory_manager` | Full production + inventory |
| `glassco_supervisor`, `gtk_supervisor`, `gti_supervisor` | Production + Inventory + Requisitions |
| `glassco_production` | Production + Inventory + Logistics + Requisitions |
| `glassco_cutter` | Production only (cutting floor view) |
| `dispatch_staff` | Production + Logistics (dispatch view) |

---

## Core Workflows (Step-by-Step)

### Workflow 1: Piece Generation from Sales Orders

**Screen:** Production > Job Registry

1. Navigate to **PP Production** in sidebar
2. Open **Job Registry** view
3. Filter by client, status (Active/WIP/Pending/Delivered), or search by order/piece number
4. For orders without pieces, click **Generate** button
5. System creates production pieces:
   - One piece per quantity per line item
   - ID format: `PC-{COMPANY}-{ORDER}-{ITEM}-{PIECE}-{TIMESTAMP}`
   - Specs: `{width}x{height} | {glassType} | {locationCode}`
   - Initial status: **Cut**
6. Press **Alt+R** to refresh the registry

**Validation (MFG-1):** Before saving, system verifies all order IDs exist in quotations table. If any order was deleted, entire batch is rejected (prevents ghost pieces).

### Workflow 2: Cutting Floor Operations

**Screen:** Production > Fabrication View (Glassco)

**Start Cutting Session:**
1. Select Job Order from queue
2. Assign Cutter (operator name)
3. Click **Start Session** -- records start time, estimated wastage (default 12%)
4. Scan glass sheets (tag IDs) as they are used

**During Cutting:**
1. Record pieces produced (auto-increments count)
2. Record remnants created (dimensions, usable sqft)
3. Record scrap (sqft, estimated weight)

**Close Cutting Session:**
1. Click **Close Session**
2. System calculates actual wastage percentage
3. If |actual - estimated| > 5%: **Supervisor sign-off required**
4. GL entry: Dr WIP Glass / Cr Glass Inventory (for sheets consumed)
5. Sheet inventory reduced by sqft per sheet

**Service Routing (after cutting):**
- If line item has services (P/E, R/D, Notch, Holes): Piece > **Service-Pending**
- If no services needed: Piece > **QC-Pending**

### Workflow 3: Quality Control (QC)

**Screen:** Production > Dispatch View > QC Tab

1. Select piece for inspection
2. If pass: Click **QC Pass** -- piece status becomes **QC-Passed**
3. If fail: Click **QC Fail**, select fault code:

| Code | Description | Special Action |
|------|-------------|---------------|
| QC-01 | Edge Chip / Rough Edge | Standard rework |
| QC-02 | Surface Scratch | Standard rework |
| QC-03 | Incorrect Dimensions | Standard rework |
| QC-04 | Hole/Notch Position Error | Standard rework |
| QC-05 | Glass Breakage | **Auto-triggers NCR + Reproduction Order** |
| QC-06 | Tempering Defect (Optical) | Standard rework |
| QC-07 | Coating/Film Defect | Standard rework |
| QC-08 | Wrong Glass Type/Spec | Standard rework |
| QC-09 | Stain/Contamination | Standard rework |
| QC-10 | Other (notes required) | Standard rework |

4. Select disposal: **Recut** (creates replacement piece) or **Accepted** (deliver despite fault)

### Workflow 4: Tempering Dispatch (External Vendor)

**Screen:** Production > Processing View

**Create Dispatch Trip:**
1. Click **New Dispatch**
2. Enter: Plant/Vendor Name, Vehicle No, Driver Name
3. Select Service Type: Tempering, Lamination, Double Glazing, Site Delivery
4. Add pieces to dispatch (select from QC-Passed pieces)
5. Enter: Charges per SqFt, Expected Return Date
6. Click **Dispatch** -- all selected pieces status > **Dispatched**

**Receive Returned Pieces (Inward):**
1. Open Processing View > Inward tab
2. System auto-detects pending return loads
3. For each returned piece, click **Receive**
4. System determines next status:
   - Needs further processing (Lamination/DG): > **Tempered** (stays in WIP)
   - Complete: > **Ready to Dispatch** (goes to finished goods)
5. When ALL pieces in a trip are received: Auto-posts GL entry for vendor charges

### Workflow 5: Site Delivery

**Screen:** Production > Dispatch View

1. Select pieces marked **Ready to Dispatch**
2. Click **Create Delivery Challan**
3. Enter: Vehicle No, Driver Name, Site Name
4. Challan auto-generated: `CHL-SITE-{TIMESTAMP}`
5. Service type: Site Delivery
6. All pieces status > **Delivered**
7. Auto GL: Dr COGS / Cr Glass Inventory (at MAP)

### Workflow 6: NCR (Non-Conformance Report)

**Screen:** Production > NCR Module

**Report Breakage:**
1. Click **New NCR** button
2. Optional: Link to Piece ID and Job Order
3. Select Stage: Cutting, Grinding, Drilling, Handling, Tempering-Transit, Inward-Inspection, Warehouse, Loading, Site
4. Select Cause Code:
   - BR-01: Operator Error
   - BR-02: Machine Fault
   - BR-03: Handling Accident
   - BR-04: Raw Material Defect (vendor claim eligible)
   - BR-05: Thermal Shock
   - BR-06: Edge Damage
   - BR-07: Transport Damage
5. Enter: Description, Sqft Lost, Glass Type, Estimated Value (PKR), Reported By
6. Select Action:
   - **Dispose** -- write-off the loss (auto GL: Dr Breakage Loss / Cr WIP Glass)
   - **Reproduce** -- create replacement piece (auto-creates reproduction order)
   - **Vendor Claim** -- claim from vendor (auto-creates claim record)
7. Click **Create NCR**

**NCR KPIs (Analytics Tab):**
- Total breakages, breakage rate (%), total sqft lost, total financial loss
- Breakdown by stage and cause
- Recovery rate from vendor claims
- Target: < 2% breakage rate

### Workflow 7: Floor Planner (Team & Shift Management)

**Screen:** Production > Floor Planner

1. View 3 Cutting Tables (CT-1, CT-2, CT-3) + Processing + Dispatch stations
2. **Assign Teams:** Drag team cards between stations
3. **Create Team:** Click + on station, enter name, members (from HR), target sqft/hr, shift times
4. **Assign Orders:** From Order Queue, assign to specific cutting table
5. **Run Simulation:** Click Play to simulate shift with real-time ETA calculation
6. Press **Alt+N** to add new team, **Alt+R** to refresh

---

## Strict Business Rules & Constraints

### MFG-1: Order Existence Validation
- Before saving pieces, ALL orderIds verified against quotations table
- If any order deleted/missing: entire batch rejected with error toast
- Prevents ghost pieces from cancelled orders
- Checks Supabase directly (not cache) to catch deletions

### MFG-2: Production Cost Configuration
- Per-company config stored in localStorage: `gtk_erp_production_config`
- Fields: monthlyWagesBasis (PKR 150,000), workingDaysPerMonth (26), defaultWastagePct (12%)
- Each company can maintain own labour/wastage rates without code changes

### MFG-4: Cost Center Allocation
- Each production piece can have a `costCenterId` for GL allocation
- Stored in Supabase `production_pieces` table (Migration 018)
- Used for overhead absorption and job costing

### MFG-5: Tempering Oven Capacity Check
- Before dispatch, system validates batch weight/sqft against oven config
- `batchWeightKg <= max_capacity_kg` AND `batchSqft <= max_sqft_per_batch`
- Source: `tempering_oven_config` Supabase table
- Fails open if offline or no config exists

### MFG-6: Delete Operation Security
- All delete operations scoped to company (defense-in-depth with RLS)
- Prevents cross-tenant data deletion

### Wastage Tolerance
- If |actual wastage - estimated wastage| > 5%: supervisor sign-off required before session closure
- Prevents unrecorded material loss

---

## State Machines

### Production Piece Status (Complete Lifecycle)
```
Cut
  |--[Has Services]--> Service-Pending --[Services Done]--> QC-Pending
  |--[No Services]---> QC-Pending
  
QC-Pending
  |--[Pass]----------> QC-Passed
  |--[Fail]----------> QC-Failed --[Recut]--> Returned (original)
                                              + New piece at Cut (replacement)
                                  --[Accept]-> Delivered (with fault noted)

QC-Passed
  |--[Needs Tempering]---> Dispatched (to external vendor)
  |--[Direct Delivery]---> Ready to Dispatch

Dispatched
  |--[Vendor Returns]---> Received-From-Tempering
  |                         |--[Needs more processing]--> Tempered (WIP)
  |                         |--[Complete]---------------> Ready to Dispatch (FG)
  
Ready to Dispatch
  |--[Site Delivery]-----> Delivered (FINAL)

Special Transitions:
  Any Status --[Breakage]--> Broken (triggers NCR)
  Any Status --[Freeze]----> Hold (temporary)
```

### NCR Status
```
Open
  |--[Action: Dispose]-----> Closed (GL write-off posted)
  |--[Action: Reproduce]---> Reproduce-Pending --> Reproduce-InProgress --> Reproduce-Done --> Closed
  |--[Action: Vendor Claim]-> Claim-Pending --> Claim-Settled --> Closed
```

### Vendor Claim Status
```
Draft --[Send]--> Submitted --[Vendor Acknowledges]--> Accepted/Partial/Rejected --[Settle]--> Settled
```

### Dispatch Trip Status
```
Draft --> Scheduled --> Ready to Dispatch --> Dispatched --> Received (all pieces returned)
```

---

## GL Impact

### NCR Dispose (Glass Breakage Write-off)
- **Dr:** Glass Breakage Loss (511) -- Estimated Value
- **Cr:** WIP Glass (1311) -- Estimated Value

### NCR Vendor Claim Settlement
- **Dr:** Cash in Hand (11112) -- Settled Amount
- **Cr:** Vendor Claim Recovery (44111) -- Settled Amount

### Tempering Inward (Vendor Charges)
- **Dr:** Tempering Expense -- Total Charges (sqft x rate)
- **Cr:** Payable to Vendor -- Total Charges

### Site Delivery COGS
- **Dr:** Cost of Goods Sold -- MAP value of delivered pieces
- **Cr:** Glass Inventory -- MAP value

### Cutting Session (Sheet Consumption)
- **Dr:** WIP Glass -- Sheet value at MAP
- **Cr:** Raw Glass Inventory -- Sheet value at MAP

---

## Production Cost Calculations

### True Cost per SqFt
```
Energy cost/sqft = Total Generator Fuel Cost / Total Sqft Produced
Labour cost/sqft = (Monthly Wages x Labour Days / Working Days) / Total Labour Sqft
Wastage % = Average from cutting sessions (or default 12%)
Outsourcing cost/sqft = Total Dispatch Charges / Total Dispatch Sqft

Per glass type + thickness:
  materialMAP + wastageAllocation + energyCost + labourCost + outsourcingCost
  = Total Cost per SqFt

Margin = Selling Rate - Total Cost
```

### Job Profitability (Per Order)
```
Revenue = Invoice amount (or quotation items sum if no invoice)
Material Cost = Total SqFt x MAP per glass type
Labour Cost = Total SqFt x Average labour rate
Energy Cost = Total SqFt x Average energy rate
Outsourcing = Sum of dispatch charges for order pieces
Total Cost = Sum of all above

Profit = Revenue - Total Cost
Margin % = Profit / Revenue x 100
Rating: A (>=30%) | B (>=20%) | C (>=10%) | D (<10%)
```

### Overhead Absorption
```
Actual Overhead = Petty cash payments (non-labour keywords)
Standard Rate = PKR 18/sqft
Absorbed Overhead = Standard Rate x Sqft Produced
Variance = Absorbed - Actual
Status: ON_TARGET (within 5%) | OVER_ABSORBED | UNDER_ABSORBED
```

---

## Cutter Daily Log (Labour Tracking)

| Field | Description |
|-------|-------------|
| logDate | Date of shift (YYYY-MM-DD) |
| cutterName | Operator name |
| shift | Morning / Evening / Full |
| sqftProduced | Glass area cut |
| piecesCut | Number of pieces |
| sheetsUsed | Raw sheets consumed |
| overtimeHours | OT hours (paid at 1.5x) |

### Monthly Summary
- totalDays, totalSqft, totalPieces, totalSheets
- totalOTHours, avgSqftPerDay, avgPiecesPerDay

---

## Generator Log (Energy Tracking)

| Field | Description |
|-------|-------------|
| logDate | Date (YYYY-MM-DD) |
| wapdaHours | Grid power hours |
| generatorHours | Backup generator hours |
| fuelLitresUsed | Diesel consumed |
| fuelRatePerLitre | Current diesel rate (PKR) |
| fuelCost | Calculated: litres x rate |
| cuttingSqftProduced | Proxy for tempered sqft |

### Fuel Cost Apportionment
```
overtimeCost = (overtimeSqFt / totalSqFt) x totalFuelCost
normalCost = (normalSqFt / totalSqFt) x totalFuelCost
```

---

## Floor Planner Details

### Station Types
| Station | ID | Purpose |
|---------|-----|---------|
| Cutting Table 1 | ct1 | Glass cutting -- order assignment |
| Cutting Table 2 | ct2 | Glass cutting -- order assignment |
| Cutting Table 3 | ct3 | Glass cutting -- order assignment |
| Processing | processing | Tempering/polishing staging |
| Dispatch | dispatch | Loading/delivery staging |

### Team Structure
- Name, Color (8 options), Station assignment
- Members: Lead (1) + Helpers (up to 5) -- from HR employee list
- Target sqft/hour, Shift start/end times
- Active/Inactive toggle

### ETA Calculation
```
totalRate = sum of active teams' targetSqftPerHour at station
hours = totalSqft / totalRate
```

### Order Queue Priority
- **URGENT:** Overdue OR due within 2 days
- **NORMAL:** Due within 7 days
- **LOW:** Due later than 7 days

---

## Warehouse Bin Assignment

| Zone | Purpose |
|------|---------|
| FG-ZONE | Finished Goods (QC-Passed, Ready to Dispatch) |
| WIP-ZONE | Work in Progress (Tempered, needs further processing) |
| RAW-01+ | Raw Material storage |

Pieces assigned to bins via `spotId` field after QC or inward processing.

---

## Company-Based Piece Segregation

| Order Prefix | Company |
|-------------|---------|
| GLS | Glassco |
| GTK, GTI | GTK / GTI |
| No prefix | Factory |
