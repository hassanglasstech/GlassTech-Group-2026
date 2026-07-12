# GlassCo ERP — Dashboard KPI & Ratio Catalog

**Purpose:** master list of business-analysis indicators, ratios and KPIs for the GlassCo
dashboards, organised by module. Every KPI below was checked against the **actual data the
ERP captures today** (tables / types / services in this repo) so each is buildable, not generic.

**Legend**
- **Priority** — `P1` must-have (owner/MD checks weekly, drives decisions) · `P2` valuable analysis · `P3` nice-to-have
- **Computable** — `yes` (data exists today) · `partial` (data exists but needs a join/aggregation/snapshot) · `needs-new-data` (a small schema add is required first)
- **Glass** = glass-manufacturing-specific metric (the ones a generic ERP would miss)

> Scope: standalone single-company **GlassCo** (glass cutting & tempering, PKR). 6 modules + an MD cockpit.

---

## 0. MD Executive Cockpit (top-level — cross-module headline)

The handful an owner of a single glass factory should see first. Each is owned by a module below;
this is the dedup'd "front page".

| # | KPI | Reads from | Pri | Viz |
|---|-----|-----------|-----|-----|
| C1 | **Net Cash Position** (cash + bank) + **13-week runway / deficit weeks** | Finance | P1 | card + line |
| C2 | **Net Profit Margin %** (MTD, trend) | Finance | P1 | line |
| C3 | **Gross Margin %** (at delivery) | Finance / Sales | P1 | gauge |
| C4 | **Revenue & Order-count trend** (MTD vs prior) | Sales | P1 | line |
| C5 | **Outstanding AR** + 90+ bucket + **credit-limit breaches** | Sales / Finance | P1 | card + bar |
| C6 | **Outstanding AP** + **GR/IR open (unbilled receipts)** | Procurement / Finance | P1 | card |
| C7 | **Total Stock Value** + **Stock↔GL tie-out** badge | Inventory | P1 | card |
| C8 | **Cutting Yield %** + wastage variance vs plan · *Glass* | Production | P1 | gauge |
| C9 | **Breakage rate %** + **breakage value (PKR)** WoW · *Glass* | Production | P1 | card |
| C10 | **WIP aging** (cash stuck on floor) + **pieces-by-stage** bottleneck · *Glass* | Production | P1 | funnel + table |
| C11 | **On-Time Delivery %** + delay-cause split (Internal/Tempering/Client) | Sales / Production | P1 | donut |
| C12 | **Open Sales-Order backlog value** + **tempering overdue count** · *Glass* | Sales / Procurement | P1 | card |
| C13 | **Unbilled delivered revenue** (leakage) | Finance | P1 | table |
| C14 | **GL balance integrity** + **parked/draft JV backlog** (close-readiness) | Finance | P1 | card |

---

## 1. Sales & Orders (Order-to-Cash)

**Data footprint:** `quotations` (status/date/due_date/items[]/discount/actual_delivery_date/order_type/cost_bearer),
`invoices` (total_amount/received_amount/balance/status/gl_tx_id), `payment_receipts` (amount/date/method),
`clients` (credit_limit/status), `credit_notes`, plus `leads` (stage/estimated_value) and `customer_complaints`.
COGS-at-delivery comes from `production_pieces` via `buildDeliveryCOGSPlan`.

| KPI | Category | Pri | Comp. | Definition | Source / Viz |
|-----|----------|-----|-------|------------|--------------|
| Outstanding Receivables (AR) | Liquidity | P1 | yes | Σ invoice.balance where status ∉ {Paid, Voided} | invoices.balance · card |
| AR Aging Buckets (0-30/31-60/61-90/90+) | Liquidity | P1 | yes | bucket unpaid balance by today − dueDate | invoices.balance+dueDate · bar |
| DSO (Days Sales Outstanding) | Efficiency | P1 | yes | current AR ÷ (trailing revenue/day) | invoices · sparkline |
| Collection Efficiency | Liquidity | P1 | yes | Σ receipts ÷ Σ invoiced (period) | payment_receipts vs invoices · gauge |
| **Gross Margin % (at delivery)** | Profitability | P1 | partial | (revenue − COGS) ÷ revenue; COGS from pieces-driven journal | invoices vs cogsPlan(gl_tx_id) · line |
| Quote-to-Order Conversion (win rate) | Throughput | P1 | yes | won quotes ÷ all non-Draft quotes | quotations.status · funnel |
| Open Sales-Order Value (backlog) | Throughput | P1 | yes | Σ value of Approved/Invoiced not yet delivered | quotations.items[].amount · card |
| Avg Order Cycle Time (order→delivery) | Efficiency | P1 | yes | avg(actualDeliveryDate − date) delivered orders | quotations dates · bar |
| On-Time Delivery Rate | Quality | P1 | yes | actualDeliveryDate ≤ dueDate ÷ delivered; delayCategory drill | quotations · gauge |
| **Delivered Glass Throughput (sqft)** · *Glass* | Throughput | P1 | yes | Σ QuotationItem.totalSqFt invoiced in period | quotations.items[].totalSqFt · line |
| Revenue & Order-count Trend | Activity | P1 | yes | Σ invoice total + order count per week/month, %Δ | invoices.total+date · line |
| Credit-Limit Utilisation / Breach | Risk | P1 | yes | per client AR ÷ creditLimit; flag >100% | clients.creditLimit + AR · table |
| **Avg Realised Rate per sqft** · *Glass* | Profitability | P2 | yes | glass revenue ÷ delivered sqft | invoices ÷ totalSqFt · sparkline |
| **Breakage / Rework Rate (sqft & PKR)** · *Glass* | Quality | P1 | partial | broken/faulted pieces ÷ pieces cut | production_pieces.status/fault/sqft · bar |
| **Tempering Turnaround** · *Glass* | Efficiency | P2 | partial | avg days dispatch→received at vendor | pieces transitions + Vendor.leadTimeHistory · bar |
| Replacement/Warranty Cost (GlassCo-borne) · *Glass* | Risk | P2 | yes | Σ value where orderType=Replacement, costBearer=GlassCo | quotations.orderType/costBearer · card |
| Customer Concentration (top client %) | Risk | P2 | yes | top-client revenue ÷ total (and top-5) | invoices.clientId · donut |
| Average Discount Given % | Profitability | P2 | yes | Σ discount ÷ Σ subtotal-before-discount | quotations.discountAmount · sparkline |
| Sales Funnel Value by Stage (leads→cash) | Activity | P2 | yes | value at each stage lead→quote→order→invoice→cash | leads.stage+estimated_value · funnel |
| Open Customer Complaints / Returns | Quality | P3 | yes | count of complaints status=Open, per 100 orders | customer_complaints · card |

---

## 2. Finance / FICO (Record-to-Report)

**Data footprint:** `ledger` (LedgerTransaction: docType/status/details[]{accountId,debit,credit,costCenterId}),
`accounts` (5-level GLASSCO_COA — 111x cash, 112x AR, 115x inventory, 211x AP, 4xxx revenue, 5xxx expense),
`cost_centers`, `petty_cash`, `fiscal_periods`. Rich derived services already exist: `cashFlowService` (13-week),
`eclService` (IFRS-9), `intelligenceService` (cost/sqft, overhead absorption, client profitability),
`budgetService`, `jobPLService`, `caIntegrityService` (unbilled + 3-way), `stockGLReconciliation`.

| KPI | Category | Pri | Comp. | Definition | Source / Viz |
|-----|----------|-----|-------|------------|--------------|
| **GL Balance Integrity (Σ Dr = Σ Cr)** | Quality | P1 | yes | total debit − total credit over Posted; must = 0 | ledger.details · card |
| Parked & Draft JV Backlog | Risk | P1 | yes | count + PKR of Parked PVs + Draft JVs awaiting approval | getDraftJVs/getLedger · card |
| **Gross Profit Margin %** | Profitability | P1 | yes | (rev 4* − COGS 51*) ÷ rev | ledger by COA prefix · gauge |
| **Net Profit Margin % (P&L)** | Profitability | P1 | yes | (rev 4* − expense 5*) ÷ rev | ledger by type · line |
| **Net Cash Position** | Liquidity | P1 | yes | Σ(Dr−Cr) on cash/bank 111x | cashFlowService.getOpeningBalance · card |
| **13-Week Cash Runway / Deficit Weeks** | Liquidity | P1 | yes | rolling 13-wk closing balance; count weeks <0 | cashFlowService.getForecast · line |
| AR Outstanding & Aging (DSO) | Efficiency | P1 | yes | live balance + buckets 0-30…>120 | invoice_balances + eclService · bar |
| Expected Credit Loss % (IFRS-9) | Risk | P2 | yes | Σ(bucket × loss-rate) ÷ AR | eclService.getECLProvision · donut |
| AP Outstanding & DPO | Efficiency | P1 | partial | Σ(Cr−Dr) on 21111/12/13; DPO vs purchases | getVendorAPBalance · card |
| Cash Conversion Cycle (DIO+DSO−DPO) | Efficiency | P2 | partial | inventory + receivable − payable days | GL balances · bar |
| Inventory Turnover + Stock↔GL Variance | Efficiency | P2 | yes | COGS ÷ avg inventory; |store − GL| vs tol | stockGLReconciliation · card |
| **Cost per SqFt (loaded) vs Selling Rate** · *Glass* | Profitability | P1 | yes | total cost ÷ sqft vs avg sell rate; loss flag | costAnalysisService/intelligenceService · table |
| Overhead Absorption Variance · *Glass* | Profitability | P2 | partial | absorbed − actual overhead | intelligenceService.getOverheadAbsorptionRate · bar |
| Client/Job Profitability (A-D tiers) | Profitability | P2 | yes | per client/job margin; count D-rated | intelligenceService/jobPLService · table |
| Budget vs Actual by Cost Center | Efficiency | P2 | yes | actual ÷ monthly budget; flag OVER | budgetService.getBudgetVsActual · bar |
| Petty Cash Float Utilisation | Activity | P3 | yes | payments ÷ monthly petty-cash budget | budgetService.getPettyCashStatus · card |
| **Unbilled Delivered Revenue (leakage)** | Risk | P1 | yes | delivered job orders with no invoice; >30d HIGH | caIntegrityService.getUnbilledRevenue · table |
| Three-Way Match Exceptions | Quality | P2 | yes | OVER/UNDER-billed, NO_INVOICE, NO_GRN (2% tol) | caIntegrityService + threeWayMatch · table |
| Period Close Status & Open-Month Aging | Risk | P2 | yes | Open/Soft/Hard/Locked; count past-open months | PeriodService.listPeriods · table |
| **Current & Quick Ratio** | Liquidity | P2 | yes | current assets 11* ÷ current liab 21* (quick ex-115) | GL by COA prefix · gauge |
| Debt-to-Equity / Leverage | Risk | P3 | partial | liabilities 2* ÷ equity 3* | GL prefixes (needs year-end close) · card |
| Return on Assets (ROA) | Profitability | P3 | partial | net profit ÷ avg total assets | ledger + PPE (needs snapshots) · card |

---

## 3. HR / HCM (Hire-to-Retire)

**Data footprint:** `employees` (salary.*, work.joinDate/department/status), `attendance` (status/lateMinutes/overtimeHours),
`loans` (amount/repaymentAmount/status), `payroll` (basicPay/overtimePay/loanDeduction/netSalary). Glass labour bridge:
`cutter_daily_logs` (sqftProduced/piecesCut/sheetsUsed/overtimeHours per cutter). **WIP-vs-expense split:** production
workers' net pay → 11514 WIP-Direct-Labour (asset, IAS-2); office → 52111 Salaries-Admin (P&L). *Note: LeaveBalance,
EmployeeDoc, DisciplinaryAction types exist but are not wired to Supabase tables yet.*

| KPI | Category | Pri | Comp. | Definition | Source / Viz |
|-----|----------|-----|-------|------------|--------------|
| Active Headcount | Activity | P1 | yes | employees where status ∉ {resigned,terminated} | employees.work.status · card |
| Monthly Payroll Cost (net) | Profitability | P1 | yes | Σ payroll.netSalary for month | payroll · card |
| **Direct Labour (WIP) vs Admin Split** · *Glass* | Profitability | P1 | yes | production pay (→11514) vs admin (→52111) | payroll + classifier / GL · donut |
| Attendance / Present Rate % | Efficiency | P1 | yes | present-or-late man-days ÷ expected | attendance.status · gauge |
| Absenteeism Rate % | Risk | P1 | yes | absent man-days ÷ expected | attendance + payroll.absentDates · line |
| Overtime Hours & OT Cost | Efficiency | P1 | yes | Σ overtimeHours/Pay; OT as % base | payroll.overtime* · bar |
| **Labour Productivity — sqft/man-day** · *Glass* | Throughput | P1 | yes | Σ sqftProduced ÷ cutter man-days | cutter_daily_logs (getCutterSummary) · bar |
| **Direct Labour Cost per Sqft** · *Glass* | Profitability | P1 | yes | production wages ÷ sqft produced | payroll(prod) ÷ cutter_daily_logs · line |
| Loan / Advance Exposure | Risk | P1 | yes | Σ active loan principal net of repayment | loans · bar |
| Sheets-to-Pieces Cutting Yield (per worker) · *Glass* | Quality | P2 | yes | piecesCut ÷ sheetsUsed per cutter | cutter_daily_logs · heatmap |
| Loan Recovery Rate | Efficiency | P2 | yes | Σ loanDeduction ÷ opening active principal | payroll vs loans · sparkline |
| Avg Cost per Employee (loaded) | Profitability | P2 | yes | gross payroll + EOBI ÷ headcount | payroll + salary.eobi · card |
| Late-Arrival Rate & Minutes | Quality | P2 | yes | lateMinutes>0 ÷ present days | attendance.lateMinutes · line |
| Headcount by Dept / Prod-vs-Admin Ratio | Activity | P2 | yes | active employees by department | employees.work.department · donut |
| Avg Tenure & New-Hire Trend | Activity | P2 | yes | avg(now − joinDate); joiners trailing 12m | employees.work.joinDate · bar |
| Attrition / Turnover Rate | Risk | P2 | partial | leavers ÷ avg headcount (needs leavers kept as rows) | employees.status+lastDate · line |
| Retention / Flight-Risk Count | Risk | P2 | partial | high-risk scored employees | compensationService (needs benchmarks) · table |
| Overtime Concentration (top-OT) | Efficiency | P3 | yes | top-3 share of OT hours/cost | payroll.overtime* · bar |
| Document Compliance Rate | Risk | P3 | needs-new-data | mandatory docs valid ÷ headcount | EmployeeDoc (no table yet) · gauge |
| Leave Liability / Balance Utilisation | Risk | P3 | needs-new-data | Σ remaining leave × rate | LeaveBalance (no table yet) · bar |

---

## 4. Inventory / Material Management

**Data footprint:** `store_items` (quantity, unrestricted/qi/blocked/reserved/consignment qty, movingAveragePrice,
totalValue, minLevel, reorderPoint, defective/scrap/remnant fields, lastMovementDate), `stock_ledger`
(MaterialLedgerEntry: mvmntCode 101 GRN/102 reversal/201 issue/261 issue-to-production/551 remnant/561 opening,
qty/valuation/balanceAfter/freightPKR), `grn_sheet_entries` (per-sheet OK/Defective/Broken/usableSqft/claim),
`cutting_sessions` (wastage), `remnants`+`remnant_history`, `scrap_disposals`, `manual_count_sheets`, `purchase_orders`.
*Note: `StockAging.tsx` currently reads a different stock_ledger shape than InventoryService writes — align to one source.*

| KPI | Category | Pri | Comp. | Definition | Source / Viz |
|-----|----------|-----|-------|------------|--------------|
| **Total Stock Value (MAP-based)** | Liquidity | P1 | yes | Σ store_items.totalValue (split by category) | store_items.total_value · card |
| **Stock-Value ↔ GL Tie-Out** | Risk | P1 | yes | |Σ store value − Σ GL inventory| vs tol | stockGLReconciliation · card |
| Inventory Turnover (annualised) + DIO | Efficiency | P1 | partial | COGS ÷ avg inventory value | stock_ledger 201/261 + store snapshots · line |
| **Glass Cutting Yield % (sqft)** · *Glass* | Throughput | P1 | yes | 100 − actualWastagePct | cutting_sessions.actualWastagePct · gauge |
| Cutting Wastage Variance (actual vs plan) · *Glass* | Efficiency | P2 | yes | actual − estimated wastage% | cutting_sessions · bar |
| **Inbound Glass Defect / Breakage %** · *Glass* | Quality | P1 | yes | (defective+broken sqft) ÷ received sqft, per vendor | grn_sheet_entries (getVendorPerformance) · bar |
| Vendor Defect Claim Recovery (PKR) · *Glass* | Quality | P2 | yes | Σ claimAmount by claimStatus; confirmed ÷ total | grn_sheet_entries.claim* · funnel |
| **Below-Reorder / Stock-Out Risk** | Risk | P1 | yes | items where unrestrictedQty < reorderPoint | getLowStockItems · table |
| **Slow-Moving & Dead Stock Value** | Risk | P1 | partial | value bucketed by days since last movement | store_items.lastMovementDate · bar |
| Remnant (Offcut) Utilisation % · *Glass* | Efficiency | P2 | yes | used ÷ (used+scrapped) sqft; avg days-in-stock | remnant_history · donut |
| Scrap Generation & Recovery (sqft/KG/PKR) · *Glass* | Quality | P2 | yes | scrap generated vs scrap monetised | cutting_sessions + scrap_disposals · line |
| GRN-to-Stock Accuracy / Count Variance | Quality | P2 | yes | Σ|physical − system| ÷ system on-hand | manual_count_sheets · card |
| Stock Status Split (Unrestr/QI/Blocked/Reserved/Consign) | Activity | P2 | yes | share of qty in each MM pool | store_items pools · donut |
| Avg Days to Inspect/Release GRN (QI aging) · *Glass* | Throughput | P3 | partial | GRN-post → inspection; qty in QI >N days | stock_ledger 101 vs grn_sheet_entries.inspectedAt · sparkline |
| Landed-Cost Uplift % (freight/duty) · *Glass* | Profitability | P2 | yes | capitalised charges ÷ base purchase value | stock_ledger.freightPKR etc · bar |
| Inbound Receipt Volume (sqft & PKR) | Activity | P3 | yes | Σ qty+valuation mvmntCode 101 net of 102 | stock_ledger · bar |
| Material Consumption Rate (sqft issued) | Throughput | P2 | yes | Σ qty mvmntCode 201+261, by thickness | stock_ledger · line |
| Stock Coverage / Days of Supply | Risk | P2 | yes | on-hand ÷ avg daily consumption | store_items ÷ stock_ledger window · table |
| Top-N Materials by Value (ABC) | Activity | P3 | yes | rank by totalValue; % held in top-10 | store_items.total_value · table |
| PO Receipt Fulfilment & 3-Way Health | Quality | P2 | partial | Σ grnQty ÷ ordered; % matched | purchase_orders.grnQty/matchStatus · donut |

---

## 5. Procurement (Procure-to-Pay)

**Data footprint:** `PurchaseOrder` (totalAmount/totalSqft/totalSheets/totalFreight, date/grnDate/grnQty,
matchStatus, vendorInvoiceAmount, status, reqId, vendorId), `Requisition` (date/status/totalValue/approvedBy),
`MaterialLedgerEntry` (101/102, freight/bilty/other charges, vendorName), `GRNSheetEntry` (defect/claim),
`Vendor` (leadTimeHistory[]/expectedLeadDays/qualityRejectionHistory[]) scored by `scmService.getVendorScorecard`,
tempering dispatches + `sla_breaches` (VendorSLATracker), AP via FinanceService (GR/IR 2115x, payable 21111/12/13).

| KPI | Category | Pri | Comp. | Definition | Source / Viz |
|-----|----------|-----|-------|------------|--------------|
| Open PO Commitment (outstanding value) | Activity | P1 | yes | Σ totalAmount of open POs | purchase_orders · card |
| **GRN Throughput (sheets & sqft)** · *Glass* | Throughput | P1 | yes | Σ sheetCount+sqft mvmntCode 101 net of 102 | stock_ledger · bar |
| **Inbound Defect / Breakage %** · *Glass* | Quality | P1 | yes | (defective+broken) ÷ received sqft per vendor | GRNSheetEntry/VendorReview · gauge |
| Vendor Defect Claim Recovery % · *Glass* | Quality | P2 | yes | confirmed/settled claim ÷ claimed | GRNSheetEntry + VendorDefectReport · donut |
| **Vendor On-Time Delivery %** | Efficiency | P1 | yes | on-time receipts ÷ total per vendor | scmService.getVendorScorecard · bar |
| Avg Procurement Lead Time (days) | Efficiency | P2 | yes | avg(grnDate − poDate) | PO dates / leadTimeHistory · line |
| **Tempering Turnaround (TAT) & Overdue** · *Glass* | Throughput | P1 | yes | avg dispatch→received; count past expectedReturn | tempering dispatches + VendorSLATracker · bar |
| **3-Way Match Exception Rate %** | Risk | P1 | yes | mismatch/on-hold POs ÷ matched POs (2% tol) | matchStatus + threeWayMatch · donut |
| Over-Receipt vs PO Qty % | Risk | P2 | yes | (grnQty − ordered) ÷ ordered; flag excess | PO.grnQty vs items[].qty · table |
| **Landed Cost as % of Material Value** · *Glass* | Profitability | P1 | yes | Σ landed charges ÷ Σ material value | MaterialLedgerEntry + landedCostAllocation · line |
| **Vendor Spend Concentration (Pareto)** | Risk | P1 | yes | % spend to top-1 / top-3 vendors | PO.totalAmount by vendor · bar |
| **AP Aging by Bucket** | Liquidity | P1 | partial | open payable by 0-30…90+ days | GL payable accounts + PO dates · table |
| GR/IR Clearing Open (unbilled receipts) | Risk | P2 | yes | net balance of 21151/21152 | FinanceService ledger · card |
| Requisition-to-PO Cycle & Conversion % | Efficiency | P2 | yes | avg req→PO days; approved reqs → PO | Requisition + PO.reqId · line |
| Reorder / Stock-out Alert Count | Activity | P1 | yes | items ≤ reorderPoint (LOW) / ≤ minLevel (CRIT) | scmService.getReorderAlerts · card |
| Purchase Price Variance / Rate Inflation · *Glass* | Profitability | P2 | yes | %Δ received rate per sqft per thickness | MaterialLedgerEntry + priceHistory · line |
| Vendor Composite Scorecard (A-D mix) | Quality | P2 | yes | 60% on-time + 40% quality → A/B/C/D | scmService.getVendorScorecard · donut |
| PO Approval Cycle by Level (L1/L2/L3) | Efficiency | P3 | partial | time awaiting approval per release band | PO.approvalHistory · bar |
| Inbound Freight Cost per SqFt / KG · *Glass* | Profitability | P3 | yes | Σ freight ÷ sqft (and ÷ kg) per route | MaterialLedgerEntry.freightPKR · sparkline |
| Scrap Recovery Realisation % · *Glass* | Profitability | P3 | yes | actual proceeds ÷ market-rate value | ScrapDisposal · card |

---

## 6. Production (Glassco — cutting, QC, tempering)

**Data footprint:** `production_pieces` (status/sqft/fault/serviceLog/lastUpdated/dispatchId, Cut→…→Delivered),
`cutting_sessions` (sheetsScanned/piecesProduced/scrapSqft/estimated+actual+variance WastagePct) + `binPacking.ts`,
`cutter_daily_logs`, `NCREvent` (NCRService.getKPIs: breakageRate/sqftLost/byStage/byCause/recoveryRate),
`QCResult` (Pass/Fail/defectCode/severity), `TemperingDispatch` (expectedReturnDate/pieceIds/brokenPieceIds/charges),
`GeneratorLog` (fuelCost/sqft), `ProductionCostService.getMonthlyServicePoolRate` (PKR/sqft labour).

| KPI | Category | Pri | Comp. | Definition | Source / Viz |
|-----|----------|-----|-------|------------|--------------|
| **Cutting Yield % (utilisation)** · *Glass* | Efficiency | P1 | yes | usable sqft ÷ sheet sqft (=100−wastage%) | cutting_sessions.actualWastagePct · gauge |
| **Wastage Variance vs Plan** · *Glass* | Efficiency | P1 | yes | actual − estimated wastage% per session | cutting_sessions.wastageVariancePct · bar |
| **Daily/Weekly Sqft Output** · *Glass* | Throughput | P1 | yes | Σ sqft cut per day/week | cutter_daily_logs.sqftProduced · line |
| Production Target Attainment % · *Glass* | Throughput | P1 | yes | actual ÷ target (pending ÷ remaining days) | getGlasscoDailyTarget vs logs · gauge |
| QC Pass / Reject Rate | Quality | P1 | partial | QC-Passed ÷ total QC decisions | QCResult/status flip (no qc_results table) · donut |
| **Breakage / Scrap Rate %** · *Glass* | Quality | P1 | yes | broken pieces ÷ total (also sqft-weighted) | NCRService.getKPIs.breakageRate · card |
| **Scrap / Breakage Value (PKR)** · *Glass* | Profitability | P1 | yes | Σ NCREvent.estimatedValue (glass written off) | NCRService.getKPIs.totalLoss · card |
| **Breakage Pareto by Stage & Cause** · *Glass* | Quality | P1 | yes | count + sqftLost by NCRStage / NCRCause | NCRService.getKPIs.byStage/byCause · bar |
| **Tempering Turnaround (days at vendor)** · *Glass* | Efficiency | P1 | partial | avg received − dispatch; flag overdue | TemperingDispatch + piece lastUpdated · bar |
| Tempering In-Transit Breakage Rate · *Glass* | Risk | P2 | yes | brokenPieceIds ÷ dispatched pieceIds | TemperingDispatch · bar |
| **WIP Aging (pieces stuck)** · *Glass* | Risk | P1 | yes | count+sqft by days-since-lastUpdated, by status | production_pieces (already paginated) · table |
| **Pieces by Stage (funnel)** · *Glass* | Activity | P1 | yes | count per lifecycle status | production_pieces.status · funnel |
| Stage Cycle Time (Cut→Delivered) · *Glass* | Efficiency | P2 | needs-new-data | avg elapsed per status transition | needs piece_status_history · bar |
| On-Time Production / Delivery % | Quality | P1 | yes | delivered ≤ dueDate ÷ delivered; delayCategory split | jobOrder dates · donut |
| Cutter Productivity (sqft/cutter-day) · *Glass* | Throughput | P2 | yes | avgSqftPerDay per cutter (leaderboard) | getCutterSummary · bar |
| Labour Cost per Sqft (service pool rate) · *Glass* | Profitability | P2 | yes | production payroll ÷ sqft produced | getMonthlyServicePoolRate · line |
| Energy Cost per Sqft · *Glass* | Efficiency | P2 | yes | generator fuel cost ÷ sqft; gen-vs-WAPDA share | GeneratorService · line |
| Vendor Claim Recovery Rate % · *Glass* | Risk | P3 | yes | settled ÷ claimed (BR-04 raw-material defects) | NCRService.getKPIs.recoveryRate · card |
| Reproduction (Rework) Load & Cost · *Glass* | Quality | P3 | yes | rework orders + extra material cost | NCRReproduction · card |
| Remnant Utilisation Rate · *Glass* | Efficiency | P2 | partial | remnant sqft reused ÷ created | remnant_history + cutting_sessions · gauge |

---

## 7. Build sequencing (how to ship these economically)

**Tier A — quick wins (logic already in a service, just surface on the dashboard):**
AR aging, credit-limit breach, low-stock/reorder alerts, stock↔GL tie-out, ECL provision, 13-week cash forecast,
unbilled revenue, 3-way-match status, vendor scorecard, cutter productivity, NCR breakage KPIs (rate/value/Pareto),
labour pool rate, energy cost/sqft, cost-per-sqft. These read from existing `getX()` functions — wrap in cards/charts.

**Tier B — computable, needs an aggregation/join (no schema change):**
gross/net margin from ledger prefixes, DSO/DPO/turnover, current/quick ratio, delivered-sqft throughput,
cutting-yield rollups, AP aging from GL, target attainment (wire actualSqFt to the day's cutter logs).

**Tier C — needs a small schema add first (flagged `needs-new-data`):**
- `piece_status_history` (timestamp per transition) → true stage cycle-time + exact tempering TAT
- `qc_results` table → clean historical QC pass/reject rate
- daily `inventory_value` snapshot → inventory turnover trend, CCC, ROA averages
- `employee_docs` table → document-compliance rate
- `leave_balances` table → leave liability
- normalized vendor sub-ledger column on AP → exact per-vendor DPO/aging

**Data-integrity fix to do alongside Inventory KPIs:** `StockAging.tsx` reads a stock_ledger shape
(`material_code/qty_in/qty_out/unit_cost`) that `InventoryService` never writes (`material_id/qty/valuation`) —
point it at `store_items.lastMovementDate` or the canonical ledger shape before trusting slow/dead-stock numbers.

---

*Generated from a codebase-grounded analysis of all six modules. Every "computable: yes" KPI can be built today
from data the ERP already captures; "partial" needs an aggregation; "needs-new-data" needs the schema add listed above.*
