# GlassTech ERP — Knowledge Base (Business Rules)

**Version:** 1.0 | **Date:** April 2026
**Purpose:** EventOS agent system prompt injection
**Source:** Extracted from actual codebase

---

## ATTENDANCE RULES

### RULE: Late Threshold
MODULE: HR
PLAIN ENGLISH: Agar employee late aata hai, toh minutes record hote hain. Har 3 late entries = 1 din ka deduction payroll mein.
EXAMPLE: Ahmad 7 din late aaya → 7 / 3 = 2.33 → floor = 2 din deduction. Agar day rate PKR 2,000 toh PKR 4,000 deduct.
FILE REFERENCE: PayrollManagement.tsx (payroll calculation section)
COMPANIES: All

### RULE: Sandwich Sunday
MODULE: HR
PLAIN ENGLISH: Agar Saturday ya Monday absent hai, toh beech ka Sunday bhi absent count hota hai (even if marked Present).
EXAMPLE: Saturday absent, Sunday off, Monday absent → Sunday bhi absent count = 3 total absents (not 2).
FILE REFERENCE: PayrollManagement.tsx
COMPANIES: All

### RULE: Attendance Status Types
MODULE: HR
PLAIN ENGLISH: Sirf 2 status hain — Present ya Absent. Late aane pe Present mark hota hai lekin lateMinutes record hote hain. Leave pe Absent mark hota hai.
EXAMPLE: Employee 10:30 pe aaya (30 min late) → Status: Present, lateMinutes: 30
FILE REFERENCE: hrService.ts (lines 118-123)
COMPANIES: All

### RULE: Half Day
MODULE: HR
PLAIN ENGLISH: Half day ka concept code mein explicitly defined NAHI hai. Sirf full day Present ya Absent hai.
EXAMPLE: NOT DEFINED IN CODE — manually manage karna padega
COMPANIES: All

### RULE: Overtime Calculation
MODULE: HR
PLAIN ENGLISH: OT hours × (hourly rate × 1.5). Hourly rate = day rate / 8. Day rate = gross salary / salary days.
EXAMPLE: Gross = PKR 50,000, Salary days = 25, Day rate = 2,000, Hourly = 250. OT 4 hours = 4 × 250 × 1.5 = PKR 1,500
FILE REFERENCE: PayrollManagement.tsx
COMPANIES: All

---

## PAYROLL RULES

### RULE: Salary Days Calculation
MODULE: HR / Payroll
PLAIN ENGLISH: Salary days = 25 minus public holidays (sirf Mon-Sat wale). Minimum floor = 20 days. Sundays excluded.
EXAMPLE: April mein 2 public holidays (Mon-Sat pe) → Salary days = 25 - 2 = 23
FILE REFERENCE: PayrollManagement.tsx
COMPANIES: All

### RULE: Loan Deduction Cap (50%)
MODULE: HR / Payroll
PLAIN ENGLISH: Loan + advance deduction 50% of net (after absent, late, EOBI) se zyada nahi ho sakta. Baqi next month mein.
EXAMPLE: Net after deductions = PKR 30,000. Max loan deduct = PKR 15,000. Agar 20K loan hai toh 15K deduct, 5K carry forward.
FILE REFERENCE: PayrollManagement.tsx
COMPANIES: All

### RULE: EOBI Deduction
MODULE: HR / Payroll
PLAIN ENGLISH: Registered employees se PKR 370 fixed EOBI deduct hota hai monthly.
EXAMPLE: Har month PKR 370 net salary se minus
FILE REFERENCE: PayrollManagement.tsx
COMPANIES: All

### RULE: Gratuity Accrual
MODULE: HR / Payroll
PLAIN ENGLISH: 12+ months tenure ke baad monthly gratuity accrue hoti hai = Basic / 12. Auto GL entry.
EXAMPLE: Basic 40,000 → Monthly gratuity = 40,000 / 12 = PKR 3,333 (Dr Gratuity Expense, Cr Gratuity Provision)
FILE REFERENCE: PayrollManagement.tsx
COMPANIES: All

### RULE: Payroll Approval
MODULE: HR / Payroll
PLAIN ENGLISH: Payroll sirf authorized roles approve kar sakte hain: manager, hr_manager, finance_manager, super_admin. Approval ke baad GL auto-post hoti hai.
EXAMPLE: HR calculates → Finance Manager approves → GL entry: Dr Salary Expense, Cr Salary Payable
FILE REFERENCE: PayrollManagement.tsx
COMPANIES: All

---

## QUOTATION RULES

### RULE: Discount Limits (SAL-1)
MODULE: Sales
PLAIN ENGLISH: Discount percentage 99.99% se zyada nahi ho sakta. Discount amount subtotal se zyada nahi ho sakta. Dono violate karne pe system block karega.
EXAMPLE: Subtotal PKR 100,000. Max discount = PKR 100,000 ya 99.99%. PKR 100,001 discount → ERROR.
FILE REFERENCE: asyncSalesService.ts
COMPANIES: All

### RULE: Billing Dimension Rounding (GlassCo)
MODULE: Sales / GlassCo
PLAIN ENGLISH: Glass dimensions billing ke liye round hoti hain:
- Width <72": ceil to nearest 6 inches
- Width >=72": ceil to nearest 12 inches
- Height <120": ceil to nearest 6 inches
- Height >=120": ceil to nearest 12 inches
EXAMPLE: Actual size 65" x 100" → Billing: 66" x 102" (ceil to 6)
FILE REFERENCE: GlasscoUtils.ts (lines 74-108)
COMPANIES: GlassCo

### RULE: Double Glazing Pricing
MODULE: Sales / GlassCo
PLAIN ENGLISH: Double Glazing selected hone pe sqft x 2 hota hai billing mein.
EXAMPLE: 10 sqft glass, double glazing → billed as 20 sqft
FILE REFERENCE: GlasscoUtils.ts
COMPANIES: GlassCo

### RULE: Mirror APT Surcharge
MODULE: Sales / GlassCo
PLAIN ENGLISH: Mirror glass with APT service pe PKR 1,000 per piece extra charge.
EXAMPLE: 5 mirror pieces with APT → PKR 5,000 extra on quotation
FILE REFERENCE: GlasscoUtils.ts
COMPANIES: GlassCo

### RULE: Quotation Expiry
MODULE: Sales
PLAIN ENGLISH: Default validity 3 days (configurable per quotation).
EXAMPLE: Quotation created April 14 → Expires April 17
FILE REFERENCE: agentTools.ts (create_quotation, validity_days default 3)
COMPANIES: All

### RULE: Margin Threshold for Approval
MODULE: Sales
PLAIN ENGLISH: NOT EXPLICITLY DEFINED IN CODE — each company may have configured MIN_MARGIN thresholds. Below minimum triggers owner approval.
EXAMPLE: NOT DEFINED IN CODE
COMPANIES: All

---

## INVENTORY RULES

### RULE: MAP (Moving Average Price) Calculation
MODULE: Procurement / Inventory
PLAIN ENGLISH: GRN aane pe MAP recalculate hota hai including freight + duty (IAS 2 landed cost):
Formula: new_MAP = (old_qty x old_MAP + received_qty x landed_price) / total_qty
Where: landed_price = unit_price + (freight + duty + handling) / received_qty
EXAMPLE: Old: 100 units @ MAP 500 = 50,000. GRN: 50 units @ 480 + 2,000 freight. Landed = 480 + 40 = 520. New MAP = (100x500 + 50x520) / 150 = PKR 506.67
FILE REFERENCE: inventoryService.ts (applyMAPOnGRN, lines 117-200)
COMPANIES: All

### RULE: Negative Stock Prevention (SCM-3)
MODULE: Procurement / Inventory
PLAIN ENGLISH: Stock quantity kabhi negative nahi ho sakta. Issue karne se pehle available qty check hoti hai. Kam hai toh error aata hai.
EXAMPLE: Available: 50 sheets. Issue request: 60 sheets → InsufficientStockError → blocked
FILE REFERENCE: inventoryService.ts + store_items CHECK constraints
COMPANIES: All

### RULE: Remnant Aging Threshold
MODULE: Production / Inventory
PLAIN ENGLISH: 45 din purane remnants ke liye alert aata hai (code mein 45 days hai, 20 nahi). History-based suggestion system recommend karta hai use ya scrap.
EXAMPLE: Remnant created March 1, today April 15 = 45 days → ALERT: review for scrap
FILE REFERENCE: RemnantManager.tsx (line 463: daysSince >= 45)
COMPANIES: GlassCo

### RULE: Remnant ID Format
MODULE: Production
PLAIN ENGLISH: REM-{thickness}-{MMYY}-{serial}
EXAMPLE: REM-5MM-0426-123
FILE REFERENCE: RemnantManager.tsx
COMPANIES: GlassCo

### RULE: Scrap Disposal Value
MODULE: Production / Inventory
PLAIN ENGLISH: Scrap value = estimated kg x PKR 5/kg. Nominal kg = estimatedWeightKg or sqft x 0.14
EXAMPLE: 10 sqft remnant → 10 x 0.14 = 1.4 kg → PKR 7 scrap value
FILE REFERENCE: RemnantManager.tsx (lines 225-227)
COMPANIES: GlassCo

### RULE: Stock Pools
MODULE: Inventory
PLAIN ENGLISH: 5 stock pools: Unrestricted (available), QI (quality inspection), Blocked, Reserved, Consignment. Issue sirf unrestricted se ho sakta hai.
EXAMPLE: Total: 100. Unrestricted: 80. QI: 10. Blocked: 10. Issue max: 80
FILE REFERENCE: store_items table schema
COMPANIES: All

---

## GL / FINANCE RULES

### RULE: Double-Entry Balance Check (FIN-3)
MODULE: Finance
PLAIN ENGLISH: Har Posted GL entry mein total debit = total credit MUST hai. 1 paisa bhi off hone pe system block karega. Integer-cent arithmetic use hoti hai.
EXAMPLE: Debit: 10,000.50, Credit: 10,000.55 → LedgerImbalanceError → blocked
FILE REFERENCE: financeService.ts (assertGLBalance)
COMPANIES: All

### RULE: Period Lock (HARD BLOCK)
MODULE: Finance
PLAIN ENGLISH: Closed period mein koi GL entry nahi ho sakti — NA agent, NA manual, NA system. Koi override nahi hai. Owner reopen kar sakta hai manually.
EXAMPLE: April period closed → May 1 pe April entry attempt → "Period 2026-04 is CLOSED. Reopen required."
FILE REFERENCE: financeService.ts, PeriodLockEnforcer.ts
COMPANIES: All

### RULE: 4-Eyes JV Approval (Maker-Checker)
MODULE: Finance
PLAIN ENGLISH: Manual Journal Voucher mein ek aadmi banata hai (Maker), alag aadmi approve karta hai (Checker). Same person approve nahi kar sakta.
EXAMPLE: Ahmed drafts JV → Ahmed tries to approve → ERROR "draftedBy cannot equal approvedBy". Bilal approves → OK.
FILE REFERENCE: financeService.ts (approveJV, lines 483-555)
COMPANIES: All

### RULE: JV Approver Roles
MODULE: Finance
PLAIN ENGLISH: Sirf yeh roles JV approve kar sakte hain: super_admin, owner, hassan, gtk_admin, glassco_admin, nippon_admin
FILE REFERENCE: financeService.ts (JV_APPROVER_ROLES)
COMPANIES: All

### RULE: Auto GL Posting Events
MODULE: Finance
PLAIN ENGLISH: Yeh events automatic GL entry banate hain (koi manual entry nahi chahiye):
1. GRN Material Receipt → Dr Inventory / Cr GRN Payable
2. Payroll Approval → Dr Salary Expense / Cr Payable + Loan Recovery
3. NCR Dispose → Dr Breakage Loss / Cr WIP
4. Vendor Claim Settlement → Dr Cash / Cr Vendor Recovery
5. Petty Cash → Dr Expense / Cr Petty Cash
6. Invoice → Dr Accounts Receivable / Cr Revenue
FILE REFERENCE: grnGLService.ts, PayrollManagement.tsx, ncrService.ts, deliveryInvoiceService.ts
COMPANIES: All

### RULE: Intercompany Transaction Format
MODULE: Finance
PLAIN ENGLISH: Har intercompany transaction dual-ledger entry banata hai:
- Seller: Dr ICO Receivable / Cr ICO Sales
- Buyer: Dr ICO Purchases / Cr ICO Payable
Month-end pe elimination entries banate hain (IFRS 10).
EXAMPLE: GlassCo sells to GTK PKR 100K → GlassCo: Dr ICO Recv 100K / Cr ICO Sales 100K. GTK: Dr ICO Purchases 100K / Cr ICO Payable 100K.
FILE REFERENCE: IntercompanySettlementAgent.ts
COMPANIES: GlassCo ↔ GTK ↔ GTI ↔ Nippon

---

## PRODUCTION RULES

### RULE: Piece Status Lifecycle
MODULE: Production
PLAIN ENGLISH: 8 status stages: Pending → Cut → Edging → Tempering → QC-Passed → Ready to Dispatch → Dispatched → Delivered. Broken = permanent (NCR).
EXAMPLE: Piece GLS-2428/3 → Cut (April 10) → Tempering (April 11) → QC-Passed (April 12) → Dispatched (April 13) → Delivered (April 14)
FILE REFERENCE: production.ts (types, lines 112-133)
COMPANIES: GlassCo

### RULE: Ghost Order Prevention (MFG-1)
MODULE: Production
PLAIN ENGLISH: Production pieces save karne se pehle system check karta hai ke har order_id Supabase mein quotations table mein exist karta hai. Agar nahi toh GhostOrderError.
EXAMPLE: Piece with orderId "FAKE-123" → quotations table mein nahi hai → MFG-1 GhostOrderError → blocked
FILE REFERENCE: productionService.ts (lines 159-214)
COMPANIES: All

### RULE: NCR Cause Codes
MODULE: Production / QC
PLAIN ENGLISH: 7 cause codes for breakage:
BR-01: Operator Error, BR-02: Machine Fault, BR-03: Handling Accident,
BR-04: Raw Material Defect, BR-05: Thermal Shock, BR-06: Edge Damage, BR-07: Transport Damage
FILE REFERENCE: ncr.ts (NCRCause type, lines 15-22)
COMPANIES: GlassCo

### RULE: NCR Stages
MODULE: Production / QC
PLAIN ENGLISH: 9 stages where NCR can occur:
Cutting, Grinding, Drilling, Handling, Tempering-Transit, Inward-Inspection, Warehouse, Loading, Site
FILE REFERENCE: ncr.ts (NCRStage type, lines 4-13)
COMPANIES: GlassCo

### RULE: Vehicle Payload Guard (MFG-5)
MODULE: Production / Logistics
PLAIN ENGLISH: Dispatch vehicle ka max payload check hota hai before loading. Overload hone pe error.
EXAMPLE: Mazda max 4000 kg. Load: 4500 kg → validate_vehicle_payload → ERROR "Overloaded"
FILE REFERENCE: productionService.ts (lines 226-251)
COMPANIES: All

### RULE: Cutting Table Configuration
MODULE: Production
PLAIN ENGLISH: 3 physical cutting tables: CT-1, CT-2, CT-3. Plus Processing station + Dispatch station.
FILE REFERENCE: ProductionFloorPlanner.tsx (lines 98-104)
COMPANIES: GlassCo

---

## PROCUREMENT RULES

### RULE: GRN QA Gate (SCM-1)
MODULE: Procurement
PLAIN ENGLISH: GRN post karne se pehle inspection lot ka OK value aur defective value match hona chahiye. Mismatch pe GRNQAIntegrityError.
EXAMPLE: GRN total: 100K. Inspection lot OK: 95K, Defective: 4K = 99K. Diff: 1K → within PKR 1 tolerance → PASS.
FILE REFERENCE: grnService.ts (assertGRNQAMatch, lines 128-160)
COMPANIES: All

### RULE: 3-Way Match (SCM-5)
MODULE: Procurement
PLAIN ENGLISH: Vendor payment se pehle 3 cheezein match honi chahiye (within PKR 1 tolerance):
1. PO amount
2. GRN received value
3. Vendor invoice amount
EXAMPLE: PO: 100,000. GRN: 99,999. Invoice: 100,001. Max diff: PKR 1. → PASS
FILE REFERENCE: grnService.ts (assertThreeWayMatch, lines 71-119)
COMPANIES: All

### RULE: PO Budget Gate (SCM-2)
MODULE: Procurement
PLAIN ENGLISH: PO approve karne se pehle budget check hota hai. Agar cost center ka monthly budget exceed ho raha hai toh BudgetExceededError.
EXAMPLE: Monthly budget: 500K. Already committed: 400K. New PO: 150K. Total would be 550K > 500K → ERROR.
FILE REFERENCE: inventoryService.ts (assertPOBudget)
COMPANIES: All

---

## AGENT / AI RULES

### RULE: Rate Limiting
MODULE: Agent / Claude Proxy
PLAIN ENGLISH: Per user: 100 Claude API calls per hour, 10 per minute. Exceed hone pe 429 error with Retry-After header.
FILE REFERENCE: claude-proxy Edge Function, agent_rate_config table
COMPANIES: All

### RULE: Model Whitelist
MODULE: Agent / Claude Proxy
PLAIN ENGLISH: Sirf 2 models allowed: claude-haiku-4-5-20251001 aur claude-sonnet-4-6. Koi aur model request karne pe 400 error.
FILE REFERENCE: claude-proxy Edge Function (ALLOWED_MODELS)
COMPANIES: All

### RULE: Max Tokens Cap
MODULE: Agent / Claude Proxy
PLAIN ENGLISH: Har request mein max 1500 tokens. System prompt 5000 chars se zyada nahi.
FILE REFERENCE: claude-proxy Edge Function
COMPANIES: All

### RULE: Prompt Sanitization
MODULE: Agent / Security
PLAIN ENGLISH: Har user message se dangerous keywords filter hote hain: ignore, forget, system, prompt, override, jailbreak, DAN, bypass. Structural chars (<>{}[]) bhi strip hote hain. Max 500 chars.
FILE REFERENCE: promptSanitizer.ts
COMPANIES: All

### RULE: Agent Audit Logging
MODULE: Agent / Audit
PLAIN ENGLISH: Har agent tool execution silently audit log mein record hoti hai with risk score (0-10). High risk flags:
- GL > 500K without dual approval
- New vendor first payment
- Stock write-down > 100K
- GL reversal
- Self-approval
- Action outside business hours (8PM-6AM PKT)
FILE REFERENCE: auditService.ts
COMPANIES: All

---

**Total Rules Extracted: 42**
**Modules Covered: 8 (HR, Payroll, Sales, Inventory, Finance, Production, Procurement, Agent)**
**Companies: All 5 (GlassCo, GTK, GTI, Nippon, Factory)**
