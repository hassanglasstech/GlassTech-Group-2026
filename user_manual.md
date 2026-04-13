# GlassTech ERP 2026 — User Manual

**Version:** 1.0 | **Date:** April 2026
**Companies:** GlassCo, GTK, GTI, Nippon, Factory
**Language:** Roman Urdu + English mix

---

## TABLE OF CONTENTS

1. Login & Navigation
2. Sales Module
3. Production Module (GlassCo)
4. Procurement Module
5. Finance Module
6. HR Module
7. Store / Inventory
8. GTK / GTI Specific
9. EventOS AI Chat
10. Factory Incharge Dashboard

---

## 1. LOGIN & NAVIGATION

### FEATURE: Login
MODULE: Auth
COMPANIES: All
NAVIGATION: glass-tech-group-2026.vercel.app

STEPS:
1. Browser mein URL kholo
2. Email aur password dalo
3. Login button dabao
4. Dashboard khulega — aapka role ke mutabiq modules dikhenge

BUSINESS RULES:
- Office hours restriction: Mon-Sat 9AM-6PM (selected roles)
- Session expire hone pe dobara login karna hoga
- Super Admin aur Owner ko sab modules dikhte hain
- Factory Manager ko sirf Production, Inventory, Requisitions dikhte hain

COMMON MISTAKES:
- Password bhool gaye: Admin se reset karwao (Admin → User Manager)
- Galat company dikhai de rahi: Top-right company switcher use karo

---

## 2. SALES MODULE

### FEATURE: New Client / Business Partner
MODULE: Sales → Business Partners
COMPANIES: All
NAVIGATION: Sales & Orders → Business Partners → + New Client
PREREQUISITES: None

STEPS:
1. Sales & Orders menu click karo
2. Business Partners tab kholo
3. + New Client button dabao
4. Client ka naam, phone, email, address bharo
5. Company select karo (GlassCo, GTK, etc.)
6. Save karo

BUSINESS RULES:
- Client name unique hona chahiye per company
- Phone number optional hai lekin recommended
- Company field mandatory hai

WHAT HAPPENS AFTER:
- Client Quotations mein available ho jayega
- Invoicing mein select kar sakte ho

---

### FEATURE: New Quotation (GlassCo)
MODULE: Sales → Quotations
COMPANIES: GlassCo
NAVIGATION: Sales & Orders → Quotations → + New Quotation
PREREQUISITES: Client must exist in Business Partners

STEPS:
1. Quotations tab kholo
2. + New Quotation dabao
3. Client select karo dropdown se
4. Project name likho
5. Glass items add karo:
   - Glass Type (Plain, Color, Mirror, Fluted)
   - Thickness (5mm, 6mm, 8mm, 10mm, 12mm)
   - Width aur Height (inches mein)
   - Qty (pieces)
   - Services (Tempering, Edging, etc.)
6. Discount add karo (optional)
7. Notes likho (optional)
8. Save karo — status: Draft

BUSINESS RULES:
- Rate auto-calculate hota hai product master se
- Billing dimensions round hote hain:
  - Width <72": ceil to nearest 6"
  - Width >=72": ceil to nearest 12"
  - Height <120": ceil to nearest 6"
  - Height >=120": ceil to nearest 12"
- Double Glazing: sqft x 2
- Mirror + APT: PKR 1,000/piece extra
- Discount percentage 99.99% se zyada nahi ho sakta (SAL-1)
- Discount amount subtotal se zyada nahi ho sakta (SAL-1)

COMMON MISTAKES:
- Glass type galat select karna — rate galat aayega
- Dimensions inch mein dena, cm nahi
- Client pehle create karo, phir quotation

WHAT HAPPENS AFTER:
- Draft status mein save hoti hai
- Approve karne ke baad Production mein ja sakti hai
- Print/PDF generate kar sakte ho

---

### FEATURE: Quotation Approval
MODULE: Sales → Quotations
COMPANIES: All
NAVIGATION: Sales & Orders → Quotations → Select quotation → Approve

STEPS:
1. Quotation list mein Draft quotation kholo
2. Review karo — items, amounts, discount
3. Approve button dabao
4. Status: Draft → Approved

BUSINESS RULES:
- Sirf authorized roles approve kar sakte hain
- Approved quotation se Job Order ban sakta hai
- Approved ke baad edit nahi ho sakti

WHAT HAPPENS AFTER:
- Production mein assign ho sakti hai
- Invoice generate ho sakti hai

---

### FEATURE: Invoice Generation
MODULE: Sales → Invoice Billing
COMPANIES: All
NAVIGATION: Sales & Orders → Invoice Billing
PREREQUISITES: Quotation must be Approved

STEPS:
1. Invoice Billing tab kholo
2. Approved quotation select karo
3. Generate Invoice dabao
4. Invoice number auto-generate hoga
5. Status: Outstanding

BUSINESS RULES:
- Invoice quotation ke approved amount pe banti hai
- GST auto-calculate hota hai (agar applicable)
- Due date default 30 days

WHAT HAPPENS AFTER:
- AR mein show hogi
- Payment receipt record kar sakte ho
- GL entry: Dr Accounts Receivable / Cr Sales Revenue

---

## 3. PRODUCTION MODULE (GlassCo)

### FEATURE: Production Floor Planner
MODULE: Production → Floor Planner
COMPANIES: GlassCo
NAVIGATION: Production → Floor Planner (full access roles)
PREREQUISITES: Approved quotations/job orders must exist

STEPS:
1. Production menu kholo
2. Floor Planner tab select karo
3. 3 Cutting Tables dikhenge (CT-1, CT-2, CT-3) + Processing + Dispatch
4. Teams create karo (Add Team button)
   - Team name, members (max 6), lead/helper roles
   - Target sqft/hour set karo
   - Shift time set karo
5. Unassigned orders side panel mein dikhenge
6. Order ko drag karke cutting table pe drop karo
7. Simulation start karo (Play button)
   - Speed: 0.5x, 1x, 2x, 6x
   - Real-time sqft progress bar dikhega

BUSINESS RULES:
- 3 physical cutting tables (CT-1, CT-2, CT-3)
- Orders sirf Approved/Sent/Partial Payment status wali assign ho sakti hain
- Priority levels: URGENT, NORMAL, LOW (due date se)
- Shift simulation actual team capacity se calculate hoti hai

COMMON MISTAKES:
- Team assign kiye bina simulation start karna — progress 0 rahega
- Urgent order miss karna — priority column check karo

WHAT HAPPENS AFTER:
- Assigned orders mein pieces generate hote hain
- Piece status: Pending → Cut → Done → Delivered

---

### FEATURE: NCR / Breakage Recording
MODULE: Production → NCR
COMPANIES: GlassCo
NAVIGATION: Production → NCR tab
PREREQUISITES: Production pieces must exist

STEPS:
1. NCR tab kholo
2. + New NCR dabao
3. Piece ID select karo
4. Stage select karo (Cutting, Grinding, Tempering, Handling, etc.)
5. Cause code select karo (BR-01 to BR-07):
   - BR-01: Operator Error
   - BR-02: Machine Fault
   - BR-03: Handling Accident
   - BR-04: Raw Material Defect
   - BR-05: Thermal Shock
   - BR-06: Edge Damage
   - BR-07: Transport Damage
6. Action select karo:
   - Dispose: Glass scrap mein jayega + GL write-off
   - Reproduce: Naya piece production mein jayega
   - Vendor-Claim: Vendor se claim karega
7. Photos attach karo (optional)
8. Save karo

BUSINESS RULES:
- NCR ID format: NCR-YYYYMMDD-XXXX
- Dispose action: auto GL entry — Dr Breakage Loss / Cr WIP
- Vendor-Claim: auto creates vendor claim record
- Reproduce: creates reproduction order (priority queue)
- Piece status → Broken (permanent)

COMMON MISTAKES:
- Galat cause code select karna — report mein galat dikhega
- Photos nahi dena — vendor claim reject ho sakta hai

WHAT HAPPENS AFTER:
- Dispose: GL entry auto-post, piece removed from active list
- Reproduce: New piece created, assigned to cutting queue
- Vendor-Claim: Claim record created, settlement tracking starts

---

### FEATURE: Remnant Management
MODULE: Procurement → Inventory → Remnants
COMPANIES: GlassCo
NAVIGATION: Material Mgmt → Remnants tab

STEPS:
1. Inventory module kholo
2. Remnants tab select karo
3. Available remnants list dikhegi
4. Filter karo: thickness, size, age
5. Use karo: order ke saath match karo
6. Ya Scrap karo: reason dalo + dispose

BUSINESS RULES:
- Remnant ID: REM-{thickness}-{MMYY}-{serial}
- Shapes: Rectangle, L-Shape
- Aging alert: 45 days (not 20 — codebase mein 45 hai)
- History-based suggestion: agar >50% similar size use hua toh "Use" recommend
- Scrap GL: Dr Scrap Disposal / Cr Remnant Inventory
- Scrap value: estimated kg x PKR 5/kg

---

## 4. PROCUREMENT MODULE

### FEATURE: New Purchase Requisition
MODULE: Procurement → Requisitions
COMPANIES: All
NAVIGATION: Procurement → Requisitions → + New
PREREQUISITES: None

STEPS:
1. Procurement menu kholo
2. Requisitions tab select karo
3. + New dabao
4. Category select karo (Store, Logistics, Maintenance, Office)
5. Description likho
6. Qty aur Unit bharo
7. Priority set karo (Normal / Urgent)
8. Reason likho
9. Submit karo

BUSINESS RULES:
- Status flow: Pending → Approved → Ordered → Received → Completed
- Urgent priority wali requisitions top pe dikhti hain
- Agent bhi create kar sakta hai (prefix: [AGENT])

WHAT HAPPENS AFTER:
- Manager approve karega
- Approved ke baad PO create hoga
- PO se GRN hoga

---

### FEATURE: GRN (Goods Receipt Note)
MODULE: Procurement → Inventory
COMPANIES: All
NAVIGATION: Material Mgmt → GRN tab
PREREQUISITES: Purchase Order must exist

STEPS:
1. GRN tab kholo
2. PO select karo
3. Received qty enter karo (partial bhi ho sakta hai)
4. Quality inspection karo
5. Post GRN

BUSINESS RULES:
- GRN posting ke pehle QA gate: inspection lot must match (SCM-1)
- 3-Way Match: PO amount = GRN value = Invoice (within PKR 1 tolerance)
- MAP recalculation hota hai GRN ke baad (IAS 2 landed cost)
- Stock quantity update hota hai
- GL entry: Dr Raw Material / Cr GRN Payable

COMMON MISTAKES:
- Qty galat dalna — stock balance galat ho jayega
- QA inspection skip karna — GRN post nahi hoga

---

### FEATURE: Vendor Management
MODULE: Procurement → Vendors
COMPANIES: All
NAVIGATION: Procurement → Vendors
PREREQUISITES: None

STEPS:
1. Vendors tab kholo
2. + New Vendor dabao
3. Name, contact, address bharo
4. Company select karo
5. Save karo

BUSINESS RULES:
- Vendor must exist before PO create ho sake
- Vendor SLA tracking automatic hai (breach count)
- First payment to new vendor: HIGH risk flag in audit

---

## 5. FINANCE MODULE

### FEATURE: Chart of Accounts
MODULE: Finance → Configuration → Chart of Accounts
COMPANIES: All (per company)
NAVIGATION: Finance → Configuration → Chart of Accounts

STEPS:
1. Finance menu kholo
2. Configuration section
3. Chart of Accounts select karo
4. Account add/edit karo:
   - Code (e.g., 1111 for Bank)
   - Name
   - Type (Asset, Liability, Revenue, Expense, Equity)
   - Level (parent/child hierarchy)

BUSINESS RULES:
- IAS 1 compliant structure
- Company-specific (har company ka apna COA)
- Account code unique hona chahiye per company

---

### FEATURE: Journal Entry (Manual)
MODULE: Finance → General Ledger
COMPANIES: All
NAVIGATION: Finance → Operations → General Ledger → + New JV

STEPS:
1. General Ledger kholo
2. + New Journal Voucher dabao
3. Date select karo
4. Debit account aur amount dalo
5. Credit account aur amount dalo
6. Description likho
7. Save as Draft

BUSINESS RULES:
- Debit MUST equal Credit (FIN-3 — system block karega)
- Manual JV requires 4-eyes approval:
  - Maker creates Draft
  - Different person (Checker) approves
  - Same person approve nahi kar sakta (4-eyes rule)
- Period must be Open (closed period mein post nahi hoga)
- Approved by roles: super_admin, owner, hassan, gtk_admin, glassco_admin, nippon_admin

COMMON MISTAKES:
- Debit/Credit balance nahi karna — error aayega
- Closed period mein entry karna — period reopen karwao pehle

WHAT HAPPENS AFTER:
- Draft → Pending Approval → Posted
- Posted entries modify account balances
- Trial Balance update hota hai

---

### FEATURE: Petty Cash Recording
MODULE: Finance → Cash Journal
COMPANIES: All
NAVIGATION: Finance → Operations → Cash Journal

STEPS:
1. Cash Journal kholo
2. + New Entry dabao
3. Date, Amount, Description bharo
4. Type: Payment (kharcha) ya Receipt (amdani)
5. Category select karo
6. Save karo

BUSINESS RULES:
- Petty cash balance auto-calculate hota hai
- Agent bhi record kar sakta hai via ChatWidget
- GL auto-post: Dr Expense / Cr Petty Cash

---

### FEATURE: Period Close
MODULE: Finance → Configuration → Period Manager
COMPANIES: All
NAVIGATION: Finance → Configuration → Period Manager
PREREQUISITES: All entries for that month must be posted

STEPS:
1. Period Manager kholo
2. Month select karo
3. Close Period dabao
4. Confirm karo

BUSINESS RULES:
- Closed period mein koi GL entry nahi ho sakti — HARD BLOCK
- Sirf Owner/Admin reopen kar sakta hai
- Agent bhi closed period mein post nahi kar sakta
- Reopen karne pe bypass_log mein record hota hai

---

## 6. HR MODULE

### FEATURE: New Employee
MODULE: HR → Registry
COMPANIES: All
NAVIGATION: People (HCM) → Registry → + New Employee

STEPS:
1. HR module kholo
2. Registry tab select karo
3. + New Employee dabao
4. Personal info bharo: Name, CNIC, Phone, Address
5. Work info: Designation, Department, Grade, Join Date
6. Salary: Basic, House Rent, Conveyance, Special Allowance
7. Save karo

BUSINESS RULES:
- Employee status: Probation → Confirmed (ya Resigned/Terminated)
- Company mandatory hai
- Employee code auto ya manual

---

### FEATURE: Daily Attendance
MODULE: HR → Attendance
COMPANIES: All
NAVIGATION: People (HCM) → Attendance

STEPS:
1. Attendance tab kholo
2. Date select karo
3. Har employee ke samne status mark karo:
   - Present
   - Absent
   - Leave
4. Late minutes dalo (agar late aaya)
5. Overtime hours dalo (agar OT hua)
6. Save karo

BUSINESS RULES:
- 3 late = 1 absent deduction (payroll mein)
- Sandwich Sunday: Agar Saturday ya Monday absent, toh Sunday bhi absent count hota hai
- Half day ka concept code mein nahi hai — full day Present ya Absent
- Attendance override possible via AttendanceReconciliation

COMMON MISTAKES:
- Late minutes nahi dalna — payroll mein late penalty nahi aayegi
- Galat date pe mark karna — payroll calculation galat hogi

---

### FEATURE: Leave Application
MODULE: HR → Leave
COMPANIES: All
NAVIGATION: People (HCM) → Leave → + New Application

STEPS:
1. Leave tab kholo
2. + New Application dabao
3. Employee select karo
4. Leave type: Annual, Casual, Sick, Unpaid, Maternity, Paternity
5. From date aur To date select karo
6. Reason likho
7. Submit karo

BUSINESS RULES:
- Status: Pending → Approved / Rejected
- Approved leave: attendance mein auto mark nahi hota — manually mark karna padega
- Leave balance tracking annual basis pe

---

### FEATURE: Loan / Advance
MODULE: HR → Loans
COMPANIES: All
NAVIGATION: People (HCM) → Loans → + New Loan

STEPS:
1. Loans tab kholo
2. + New Loan dabao
3. Employee select karo
4. Type: Loan ya Advance
5. Amount dalo
6. Repayment amount per month dalo
7. Save karo

BUSINESS RULES:
- Active loans payroll se automatically deduct hote hain
- Maximum deduction: 50% of net salary (after absent + late + EOBI)
- Skip month option available (temporarily pause deduction)
- Loan status: Active → Settled

---

### FEATURE: Payroll Run
MODULE: HR → Payroll
COMPANIES: All
NAVIGATION: People (HCM) → Payroll → Run Payroll

STEPS:
1. Payroll tab kholo
2. Month select karo
3. "Calculate Payroll" dabao
4. System auto-calculate karega:
   - Gross = Basic + Allowances
   - Day Rate = Gross / Salary Days (25 - public holidays)
   - OT Pay = OT Hours x Hourly Rate x 1.5
   - Deductions: Absent days, Late penalty, EOBI (370), Loans
5. Review karo — har employee ka net salary check karo
6. "Approve Payroll" dabao (authorized role required)
7. GL entry auto-post hogi

BUSINESS RULES:
- Salary Days = 25 minus public holidays (Mon-Sat only), minimum 20
- Late penalty: har 3 late = 1 day deduction
- EOBI: PKR 370 fixed (agar registered)
- Loan cap: 50% of (Gross - Absent - Late - EOBI)
- Approval posts GL: Dr Salary Expense / Cr Salary Payable + Loan Recovery
- Gratuity auto-accrue agar tenure >= 12 months

COMMON MISTAKES:
- Attendance finalize kiye bina payroll run karna — deductions galat ayenge
- Loan manually adjust karna instead of system — balance mismatch hoga

---

## 7. STORE / INVENTORY

### FEATURE: Stock Inquiry
MODULE: Procurement → Inventory
COMPANIES: All
NAVIGATION: Material Mgmt → Stock tab

STEPS:
1. Inventory module kholo
2. Stock tab select karo
3. Search karo: item name, thickness, category
4. Available qty, MAP, total value dikhega

BUSINESS RULES:
- Stock negative nahi ho sakta (SCM-3 check constraint)
- 5 stock pools: Unrestricted, QI, Blocked, Reserved, Consignment
- MAP auto-update hota hai GRN pe

---

## 8. GTK / GTI SPECIFIC

### FEATURE: GTK Quotation Builder
MODULE: Sales → Quotations
COMPANIES: GTK, GTI
NAVIGATION: Sales & Orders → Quotations → + New (GTK mode)

STEPS:
1. Company switcher se GTK select karo
2. Quotations tab kholo
3. + New Quotation dabao
4. Client select karo
5. Aluminium profiles + hardware + glass items add karo (BOM-based)
6. Save karo

BUSINESS RULES:
- GTK quotations BOM-based hain (Bill of Materials)
- Hardware consumption tracking alag hai
- Design Studio available hai GTK/GTI ke liye

---

## 9. EVENTOS AI CHAT

### FEATURE: AI Chat (EventOS Widget)
MODULE: Factory / All
COMPANIES: All
NAVIGATION: Bottom-right floating button (lightning icon)

STEPS:
1. Lightning button dabao (bottom-right corner)
2. Message likho Urdu ya English mein
3. 3 types of responses:
   - **Data Query:** "kitni quotations hain" → Real data with numbers
   - **Action Event:** "tanker aaya hai 2000 ka" → Workflow steps → Approve
   - **Greeting:** "hello" → Conversational reply

BUSINESS RULES:
- Claude Haiku API use hota hai (cost ~PKR 0.15 per query)
- 43 agent tools available for data queries
- Write actions require owner approval (ConfirmationCard)
- Rate limit: 100 calls/hour, 10 calls/minute
- Prompt sanitization active (injection prevention)

COMMON MISTAKES:
- Very short messages (1-2 words) go to conversational mode, not data query
- Claude-proxy 401: login session expired — re-login karo

---

## 10. FACTORY INCHARGE DASHBOARD

### FEATURE: Morning Briefing
MODULE: Factory → Morning Briefing
COMPANIES: All
NAVIGATION: Factory Desk → Morning Briefing
PREREQUISITES: Cron job running at 8AM PKT

STEPS:
1. Factory Desk menu kholo
2. Morning Briefing card dikhega
3. 3 sections:
   - Yesterday Summary (quotations, production, cash, NCR)
   - Today Priorities (overdue, pending, stuck)
   - Agent Recommendations
4. WhatsApp pe bhi aata hai (agar configured)

BUSINESS RULES:
- Auto-generate hoti hai daily 8AM PKT via Supabase Edge Function
- Claude Haiku summarizes real Supabase data
- Stored in morning_briefings table
- WhatsApp delivery via Facebook Graph API

---

**Total Features Documented: 28**
**Modules Covered: 10**
**Companies Covered: 5 (GlassCo, GTK, GTI, Nippon, Factory)**
