import { useState, useCallback, useMemo, useEffect } from "react";

// ══════════════════════════════════════════════════════════════════════════════
// GlassTech ERP — Auto-Discovered UAT Test Suite
// ══════════════════════════════════════════════════════════════════════════════
// Codebase-scanned workflows from: 407 source files across 5 modules
// Covers: Master Data, Sales & Production, HR & Payroll, Finance & GL, Store & Procurement
// ══════════════════════════════════════════════════════════════════════════════

/** @typedef {'idle'|'running'|'pass'|'fail'|'blocked'|'reverify'} StepStatus */
/** @typedef {'MASTERS'|'SALES'|'HR'|'FINANCE'|'STORE'} DeptCode */

const STATUS = { idle:"idle", running:"running", pass:"pass", fail:"fail", blocked:"blocked", reverify:"reverify" };

const DEPT_COLORS = {
  STORE:   { primary:"#27AE60", bg:"#EAFAF1", text:"#1A5C35" },
  SALES:   { primary:"#2980B9", bg:"#EBF5FB", text:"#1A4A7A" },
  HR:      { primary:"#E67E22", bg:"#FEF9E7", text:"#7D3C00" },
  FINANCE: { primary:"#1A3A5C", bg:"#E8EDF2", text:"#1A3A5C" },
  MASTERS: { primary:"#6C3483", bg:"#F4ECF7", text:"#4A235A" },
};

// ── Sheet/Table Dependency Graph ────────────────────────────────────────────
// Maps each sheet to all workflow IDs that READ or WRITE it
const SHEET_DEPENDENCY_GRAPH = {};
function buildDependencyGraph(workflows) {
  workflows.forEach(wf => {
    wf.steps.forEach(step => {
      const sheets = [step.tab, ...(step.affects || []).map(a => a.split(" ")[0])];
      sheets.forEach(sheet => {
        if (!sheet) return;
        if (!SHEET_DEPENDENCY_GRAPH[sheet]) SHEET_DEPENDENCY_GRAPH[sheet] = new Set();
        SHEET_DEPENDENCY_GRAPH[sheet].add(wf.id);
      });
    });
  });
}

// ── Auto-Discovered Workflow Definitions ────────────────────────────────────
// Extracted from: TypeScript interfaces, Supabase .from() calls, VBA Sub names,
// status enums, business rule constants, and FK relationships
const WORKFLOWS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 1: MASTER DATA (6 workflows)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id:"WF-M01", name:"Client Master — Create & Validate",
    dept:"MASTERS", color:"#6C3483",
    desc:"Create client in CLIENT_MASTER with BP-XXXXXX format, verify FK to quotation dropdown",
    steps:[
      {id:"s1",tab:"clients",action:"Create new Client record",vba:"Submit_Client",
       inputs:[{key:"name",label:"Client Name",type:"text",placeholder:"Gulshan Towers Pvt Ltd"},
               {key:"phone",label:"Phone",type:"text",placeholder:"0321-2345678"},
               {key:"ntn",label:"NTN (Tax ID)",type:"text",placeholder:"1234567-8"},
               {key:"credit_limit",label:"Credit Limit PKR",type:"number",placeholder:"500000"},
               {key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon"]}],
       checks:["BP-XXXXXX ID auto-generated","status = Active","company field populated","phone format valid (03XX-XXXXXXX)"],
       affects:["quotations (client dropdown)","invoice_balances (AR tracking)"]},
      {id:"s2",tab:"quotations",action:"Verify client appears in Quotation dropdown",vba:"",
       inputs:[{key:"visible",label:"Client visible in dropdown?",type:"select",options:["Yes","No"]}],
       checks:["Client name appears in FORM_QUOTATION client selector","Credit limit enforced on invoice generation"],
       affects:[]},
    ]
  },
  {
    id:"WF-M02", name:"Vendor Master — Create & Rate Card",
    dept:"MASTERS", color:"#6C3483",
    desc:"Create vendor, assign type (Glass/Tempering/Transport/Hardware/Labour), set rate card",
    steps:[
      {id:"s1",tab:"vendors",action:"Create new Vendor",vba:"Submit_Vendor",
       inputs:[{key:"name",label:"Vendor Name",type:"text",placeholder:"Ghani Glass Industries"},
               {key:"type",label:"Vendor Type",type:"select",options:["Glass","Tempering","Transport","Hardware","Profile","General","Crane/Unloading","Labour"]},
               {key:"phone",label:"Phone",type:"text",placeholder:"0300-1234567"},
               {key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon"]}],
       checks:["Vendor ID generated","type = selected VendorType","status = Active","company scoped (SEC-2)"],
       affects:["purchase_orders (vendor dropdown)","vendor_rates"]},
      {id:"s2",tab:"vendor_rates",action:"Set vendor rate card",vba:"",
       inputs:[{key:"thickness",label:"Glass Thickness",type:"select",options:["5mm","6mm","8mm","10mm","12mm"]},
               {key:"rate",label:"Rate PKR/SqFt",type:"number",placeholder:"450"}],
       checks:["Rate saved per thickness","Rate version history maintained","Rate pulls into PO auto-pricing"],
       affects:["purchase_orders (auto-rate)","stock_ledger (MAP base)"]},
    ]
  },
  {
    id:"WF-M03", name:"Employee Master — Create & Salary Setup",
    dept:"MASTERS", color:"#6C3483",
    desc:"Create employee in EMPLOYEE_MASTER with salary components, verify payroll linkage",
    steps:[
      {id:"s1",tab:"employees",action:"Create Employee record",vba:"Submit_Employee",
       inputs:[{key:"name",label:"Name",type:"text",placeholder:"Ahmed Khan"},
               {key:"cnic",label:"CNIC",type:"text",placeholder:"35201-1234567-1"},
               {key:"department",label:"Department",type:"text",placeholder:"Production"},
               {key:"designation",label:"Designation",type:"text",placeholder:"Glass Cutter"},
               {key:"basic",label:"Basic Salary PKR",type:"number",placeholder:"28000"},
               {key:"eobi",label:"EOBI Registered?",type:"select",options:["Yes","No"]},
               {key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon","Factory"]}],
       checks:["Employee ID auto-generated (timestamp)","employeeCode auto: ${company}-###","CNIC format: ^\\d{5}-\\d{7}-\\d{1}$ (HR-4)","Phone format: ^(03\\d{2})-?\\d{7}$ (HR-5)","status = probation","gross = basic + HR + conv + special"],
       affects:["attendance (employee list)","payroll (salary base)","loans (employee lookup)","ledger (auto L5 GL account)"]},
      {id:"s2",tab:"accounts",action:"Verify auto-created GL account for employee",vba:"",
       inputs:[{key:"gl_code",label:"Expected GL Code",type:"text",placeholder:"5100-001"}],
       checks:["L5 account exists under Salary parent","Account name = employee name","type = Expense"],
       affects:["ledger (payroll JV posting)"]},
    ]
  },
  {
    id:"WF-M04", name:"Department & Tag Master",
    dept:"MASTERS", color:"#6C3483",
    desc:"Create departments and tag definitions (job_title/designation) for HR classification",
    steps:[
      {id:"s1",tab:"departments",action:"Create Department",vba:"",
       inputs:[{key:"name",label:"Department Name",type:"text",placeholder:"Production"},
               {key:"parent",label:"Parent Department",type:"text",placeholder:"Operations"},
               {key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon","Factory"]}],
       checks:["dept_timestamp ID generated","isActive = true","company scoped"],
       affects:["employees (departmentId FK)","cost_centers (department field)"]},
      {id:"s2",tab:"tag_master",action:"Create Tag (Job Title / Designation)",vba:"",
       inputs:[{key:"category",label:"Category",type:"select",options:["job_title","designation"]},
               {key:"label",label:"Label",type:"text",placeholder:"Senior Glass Cutter"}],
       checks:["tag_timestamp ID generated","category = selected","isActive = true"],
       affects:["employees (via employee_tags)"]},
    ]
  },
  {
    id:"WF-M05", name:"Cost Center Master (KS01)",
    dept:"MASTERS", color:"#6C3483",
    desc:"SAP-style cost center creation with budget limits and alert thresholds",
    steps:[
      {id:"s1",tab:"cost_centers",action:"Create Cost Center",vba:"",
       inputs:[{key:"code",label:"CC Code",type:"text",placeholder:"1001"},
               {key:"name",label:"CC Name",type:"text",placeholder:"CUTTING SECTION"},
               {key:"department",label:"Department",type:"text",placeholder:"Production"},
               {key:"category",label:"Category",type:"select",options:["F (Production)","H (Auxiliary)","W (Admin)","V (Sales)","L (Logistics)"]},
               {key:"budget",label:"Monthly Budget PKR",type:"number",placeholder:"200000"},
               {key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon","Factory"]}],
       checks:["ID format: ${company}-CC-${code}","name stored UPPERCASE","category = SAP standard (F/H/W/V/L)","budgetMonthly > 0","alertThreshold defaults to 80%"],
       affects:["ledger (costCenterId in GL details)","requisitions (CC budget check)","petty_cash (float limit)"]},
    ]
  },
  {
    id:"WF-M06", name:"Chart of Accounts — COA Viewer & JIT Account",
    dept:"MASTERS", color:"#6C3483",
    desc:"Verify 5-level COA hierarchy and Just-In-Time account creation on invoice",
    steps:[
      {id:"s1",tab:"accounts",action:"Verify COA 5-level tree",vba:"",
       inputs:[{key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon","Factory"]},
               {key:"l1_code",label:"L1 Account Code",type:"text",placeholder:"10"}],
       checks:["L1 (Group) → L2 (Category) → L3 (Subcategory) → L4 (Control) → L5 (Leaf)","type = Asset|Liability|Equity|Revenue|Expense","parentId FK chain valid","No orphan accounts at L5"],
       affects:["ledger (all GL postings)","trial_balance"]},
      {id:"s2",tab:"accounts",action:"Test JIT account creation via invoice",vba:"Create_Invoice",
       inputs:[{key:"client",label:"Client Name",type:"text",placeholder:"New Client Test"}],
       checks:["AR account auto-created: parent 122 → 1221 → 12210","Revenue account auto-created: parent 41 → 411 → 4111 → 41110","GST Payable auto-created if gstPercent > 0: parent 221 → 2214"],
       affects:["ledger (DR invoice GL)"]},
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 2: SALES & PRODUCTION (7 workflows)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id:"WF-S01", name:"Quotation → Approval → SO → Pieces",
    dept:"SALES", color:"#2980B9",
    desc:"End-to-end: Client quotation se production floor tak — piece generation with D/G split",
    steps:[
      {id:"s1",tab:"clients",action:"Verify client Active in CLIENT_MASTER",vba:"",
       inputs:[{key:"client_id",label:"Client ID",type:"text",placeholder:"BP-123456"},
               {key:"status",label:"Status",type:"select",options:["Active","Inactive"]}],
       checks:["client exists in clients table","status = Active","creditLimit > 0 (optional)"],
       affects:["quotations (client dropdown)"]},
      {id:"s2",tab:"quotations",action:"Create Quotation header",vba:"Save_Draft",
       inputs:[{key:"client",label:"Client",type:"text",placeholder:"BP-123456"},
               {key:"project",label:"Project Name",type:"text",placeholder:"Gulshan Tower Phase 2"},
               {key:"priority",label:"Priority",type:"select",options:["Normal","Urgent","Emergency"]},
               {key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon"]}],
       checks:["Glassco: GT-QUT-GLS-MMYY-XXXX format","GTK: QT-GTK-YY-XXXX format","status = Draft","quotation row in quotations table"],
       affects:["quotations"]},
      {id:"s3",tab:"quotations",action:"Add Glass line items (QUO_ITEMS)",vba:"",
       inputs:[{key:"desc",label:"Description",type:"text",placeholder:"Clear Float 8mm Windows"},
               {key:"qty",label:"Qty (pcs)",type:"number",placeholder:"12"},
               {key:"width",label:"Width (inches)",type:"number",placeholder:"47.24"},
               {key:"height",label:"Height (inches)",type:"number",placeholder:"70.87"},
               {key:"price",label:"Price/SqFt PKR",type:"number",placeholder:"900"},
               {key:"services",label:"Services",type:"select",options:["None","T/G (Tempered)","P/E (Polish Edge)","D/G (Double Glaze)","T/G + P/E","T/G + D/G"]}],
       checks:["SqFt = W x H x Qty / 144 (auto)","Amount = SqFt x Price (auto)","Total updates in header","SAL-1: Mirror glass cannot have T/G service","SAL-1: Discount max 99.99%"],
       affects:["quotations (items JSONB)"]},
      {id:"s4",tab:"quotations",action:"Approve Quotation → Generate SO + Pieces",vba:"Approve_Quotation",
       inputs:[{key:"action",label:"Action",type:"select",options:["Click APPROVE → SO"]}],
       checks:["SO ID generated: GT-SO-GLS-MMYY-XXXX (same series)","status changes: Draft → Approved","Pieces auto-created in production_pieces","Piece format: last4OrderNo/serial (e.g., 2523/1)","D/G items generate A+B variants (e.g., 2523/3A, 2523/3B)","MFG-1: Ghost order prevention — all orderIds verified"],
       affects:["production_pieces","quotations (status)"]},
      {id:"s5",tab:"production_pieces",action:"Verify pieces generated correctly",vba:"",
       inputs:[{key:"piece_id",label:"First Piece ID",type:"text",placeholder:"2523/1"},
               {key:"total_pcs",label:"Expected Total Pieces",type:"number",placeholder:"12"}],
       checks:["format: last4(orderNo)/serial","All pieces status = Cut","orderId links to SO correctly","D/G pieces have A/B suffix","Total piece count = sum of all item quantities"],
       affects:["production_pieces (status tracking)"]},
      {id:"s6",tab:"quotations",action:"Verify order appears in Job List",vba:"",
       inputs:[{key:"visible",label:"Order visible in active list?",type:"select",options:["Yes","No"]}],
       checks:["Order appears in active quotations (Approved status)","total_pieces count correct","Linked to correct client"],
       affects:[]},
    ]
  },
  {
    id:"WF-S02", name:"Piece Status Lifecycle — Cut to Delivered",
    dept:"SALES", color:"#2980B9",
    desc:"Track piece through all PieceStatus transitions including tempering dispatch",
    steps:[
      {id:"s1",tab:"production_pieces",action:"Verify initial piece status = Cut",vba:"",
       inputs:[{key:"piece_id",label:"Piece ID",type:"text",placeholder:"2523/1"}],
       checks:["status = Cut","orderId populated","specs (width, height, glass type) present"],
       affects:["production_pieces"]},
      {id:"s2",tab:"production_pieces",action:"Move to Service-Pending (if services required)",vba:"",
       inputs:[{key:"service",label:"Service Type",type:"select",options:["T/G (Tempered)","P/E (Polish Edge)","Notch","Frosted","L/G"]}],
       checks:["status transitions: Cut → Service-Pending","pendingServices[] populated"],
       affects:["production_pieces"]},
      {id:"s3",tab:"production_pieces",action:"QC Check → QC-Passed or QC-Failed",vba:"",
       inputs:[{key:"result",label:"QC Result",type:"select",options:["QC-Passed","QC-Failed"]}],
       checks:["QC-Passed → Ready to Dispatch path","QC-Failed → triggers NCR process","fault field populated on failure"],
       affects:["production_pieces"]},
      {id:"s4",tab:"production_pieces",action:"Dispatch → Tempered → Received → Delivered",vba:"",
       inputs:[{key:"final_status",label:"Final Status",type:"select",options:["Ready to Dispatch","Dispatched","Tempered","Received-From-Tempering","Delivered"]}],
       checks:["Status chain: Ready to Dispatch → Dispatched → Tempered → Received-From-Tempering → Delivered","Each transition updates lastUpdated timestamp","Returned / Broken / Hold paths available"],
       affects:[]},
    ]
  },
  {
    id:"WF-S03", name:"Tempering Dispatch — Vehicle & TAT",
    dept:"SALES", color:"#2980B9",
    desc:"Outsourced service dispatch with vehicle payload guard (MFG-5) and vendor TAT tracking",
    steps:[
      {id:"s1",tab:"dispatch_vehicles",action:"Verify vehicle registered",vba:"",
       inputs:[{key:"vehicle",label:"Vehicle No",type:"text",placeholder:"ABC-1234"},
               {key:"payload",label:"Max Payload KG",type:"number",placeholder:"3000"}],
       checks:["Vehicle exists in dispatch_vehicles","max_payload_kg > 0","is_active = true"],
       affects:["production_pieces (dispatch)"]},
      {id:"s2",tab:"production_pieces",action:"Create Tempering Dispatch batch",vba:"",
       inputs:[{key:"vendor",label:"Tempering Vendor",type:"text",placeholder:"Lucky Glass"},
               {key:"piece_count",label:"Pieces in Batch",type:"number",placeholder:"24"},
               {key:"total_sqft",label:"Total SqFt",type:"number",placeholder:"480"},
               {key:"service_type",label:"Service Type",type:"select",options:["Tempering","Lamination","Site Delivery","Double Glazing","Tempering Return"]}],
       checks:["Dispatch ID generated","status = Draft → Scheduled → Ready to Dispatch → Dispatched","MFG-5: Vehicle payload guard — totalWeightKg <= max_payload_kg","pieceIds[] populated correctly","expectedReturnDate set"],
       affects:["production_pieces (status → Dispatched)"]},
      {id:"s3",tab:"production_pieces",action:"Receive tempered pieces back",vba:"",
       inputs:[{key:"received_count",label:"Pieces Received",type:"number",placeholder:"24"},
               {key:"broken_count",label:"Broken in Transit",type:"number",placeholder:"0"}],
       checks:["receivedPieceIds[] updated","Dispatch status → Received","Pieces status → Received-From-Tempering","Broken pieces → NCR trigger","Vendor TAT computed: grnDate - dispatchDate"],
       affects:["production_pieces"]},
    ]
  },
  {
    id:"WF-S04", name:"NCR — Breakage Report & Rework",
    dept:"SALES", color:"#2980B9",
    desc:"Non-Conformance Report: breakage logging, dispose/reproduce/vendor-claim actions",
    steps:[
      {id:"s1",tab:"production_pieces",action:"Report breakage — Create NCR",vba:"",
       inputs:[{key:"piece_id",label:"Broken Piece ID",type:"text",placeholder:"2523/3"},
               {key:"stage",label:"Stage",type:"select",options:["Cutting","Grinding","Drilling","Handling","Tempering-Transit","Inward-Inspection","Warehouse","Loading","Site"]},
               {key:"cause",label:"Cause Code",type:"select",options:["BR-01-Operator-Error","BR-02-Machine-Fault","BR-03-Handling-Accident","BR-04-Raw-Material-Defect","BR-05-Thermal-Shock","BR-06-Edge-Damage","BR-07-Transport-Damage"]},
               {key:"action",label:"Action",type:"select",options:["Dispose","Reproduce","Vendor-Claim"]},
               {key:"value",label:"Estimated Value PKR",type:"number",placeholder:"4500"}],
       checks:["NCR-YYYYMMDD-XXXX ID generated","Piece status → Broken immediately","sqftLost calculated from piece specs","estimatedValue > 0 for GL write-off"],
       affects:["production_pieces (status=Broken)","ledger (write-off GL if Dispose)"]},
      {id:"s2",tab:"production_pieces",action:"Verify action triggered",vba:"",
       inputs:[{key:"action_type",label:"Selected Action",type:"select",options:["Dispose → GL Write-off","Reproduce → Rework Order","Vendor-Claim → Claim Record"]}],
       checks:["Dispose: GL entry Dr 56113 (Breakage) / Cr 11511 (Inventory)","Reproduce: REPR-XXXX record created, status=Queued","Vendor-Claim: NCRVendorClaim record, claimStatus=Draft","NCR status flow: Open → appropriate path"],
       affects:["ledger","production_pieces"]},
    ]
  },
  {
    id:"WF-S05", name:"Delivery Challan Generation",
    dept:"SALES", color:"#2980B9",
    desc:"Generate delivery challan (DC) with GT-DC-GLS-MMYY-XXXX format for dispatched orders",
    steps:[
      {id:"s1",tab:"quotations",action:"Verify order status = Approved and pieces Ready",vba:"",
       inputs:[{key:"order_no",label:"Sales Order No",type:"text",placeholder:"GT-SO-GLS-0426-2523"}],
       checks:["Order status = Approved","All pieces in Ready to Dispatch status","Client details populated"],
       affects:["quotations"]},
      {id:"s2",tab:"quotations",action:"Generate Delivery Challan",vba:"",
       inputs:[{key:"dc_no",label:"Expected DC No",type:"text",placeholder:"GT-DC-GLS-0426-9001"},
               {key:"vehicle",label:"Vehicle No",type:"text",placeholder:"ABC-1234"}],
       checks:["DC ID: GT-DC-GLS-MMYY-XXXX (series starts 9001)","Pieces status → Dispatched","Delivery details captured (vehicle, driver)"],
       affects:["production_pieces (status=Dispatched)"]},
    ]
  },
  {
    id:"WF-S06", name:"Delivery Invoice Generation (DR)",
    dept:"SALES", color:"#2980B9",
    desc:"Generate sales invoice with auto GL posting — Dr AR / Cr Revenue + GST handling",
    steps:[
      {id:"s1",tab:"quotations",action:"Trigger invoice from Approved order",vba:"Create_Invoice",
       inputs:[{key:"order_no",label:"Sales Order No",type:"text",placeholder:"GT-SO-GLS-0426-2523"},
               {key:"gst",label:"GST %",type:"number",placeholder:"0"},
               {key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon"]}],
       checks:["Invoice ID: GT-INV-GLS-MMYY-XXXX","Deduplication: cannot invoice same order twice","Subtotal = Revenue + ServiceCharges - Discount","GST = FinalAmount x gstPercent/100","Grand Total = FinalAmount + GST"],
       affects:["invoices","ledger","financial_events","quotations (status=Invoiced)"]},
      {id:"s2",tab:"ledger",action:"Verify GL entry (doc_type = DR)",vba:"",
       inputs:[{key:"balanced",label:"GL Balanced?",type:"select",options:["Dr = Cr","Imbalanced"]}],
       checks:["Dr 1221 (AR — Customers Control) = grandTotal","Cr 41110 (Service Revenue) = finalAmount","Cr 2214 (GST Payable) = gstAmount (if > 0)","doc_type = DR","status = Posted (direct, no approval needed)","Financial event registered: EVT-{invoiceId}"],
       affects:["ledger","invoice_balances"]},
      {id:"s3",tab:"quotations",action:"Check intercompany mirror (if group client)",vba:"",
       inputs:[{key:"is_interco",label:"Is client a group company?",type:"select",options:["Yes — GTI/GTK/Nippon","No — external client"]}],
       checks:["If intercompany: auto-bill created in target company","Target GL: Dr Cost(511X) / Cr Payable(221X)","doc_type = KR in target company","Both sides balanced and auditable"],
       affects:["ledger (target company)"]},
    ]
  },
  {
    id:"WF-S07", name:"Credit Note & Invoice Void",
    dept:"SALES", color:"#2980B9",
    desc:"Issue credit note (partial reversal) or void invoice (full reversal) with GL entries",
    steps:[
      {id:"s1",tab:"invoices",action:"Issue Credit Note",vba:"",
       inputs:[{key:"invoice_id",label:"Invoice ID",type:"text",placeholder:"GT-INV-GLS-0426-0001"},
               {key:"amount",label:"Credit Amount PKR",type:"number",placeholder:"50000"},
               {key:"reason",label:"Reason",type:"text",placeholder:"Quality claim settlement"}],
       checks:["CN ID: CN-GLS-2026-XXXX (sequential)","amount > 0 AND amount <= invoice.balance","GL entry: doc_type = RV (Reversal)","Dr Revenue / Cr AR (reverse of original)","Invoice balance reduced by credit amount","Status = Paid if balance reaches 0"],
       affects:["invoices","ledger","invoice_balances"]},
      {id:"s2",tab:"invoices",action:"Void Invoice (full reversal)",vba:"",
       inputs:[{key:"invoice_id",label:"Invoice to Void",type:"text",placeholder:"GT-INV-GLS-0426-0002"},
               {key:"guard",label:"Guard Check",type:"select",options:["No payments received — can void","Partial payment exists — cannot void"]}],
       checks:["Guard: status != Paid","Guard: receivedAmount = 0","All GL lines reversed (Dr <-> Cr swapped)","doc_type = RV","Invoice status → Voided","Quotation reverts to status = Approved"],
       affects:["invoices","ledger","quotations"]},
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 3: HR & PAYROLL (7 workflows)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id:"WF-H01", name:"Attendance → Monthly Summary",
    dept:"HR", color:"#E67E22",
    desc:"Daily attendance marking → monthly aggregation with sandwich Sunday rule",
    steps:[
      {id:"s1",tab:"employees",action:"Verify employee exists and status != terminated",vba:"",
       inputs:[{key:"emp_id",label:"Employee ID",type:"text",placeholder:"EMP-001"},
               {key:"status",label:"Employee Status",type:"select",options:["probation","confirmed","resigned","terminated","suspended"]}],
       checks:["Employee exists in employees table","status != terminated","salary.basic > 0","department assigned"],
       affects:["attendance"]},
      {id:"s2",tab:"attendance",action:"Mark daily attendance for month",vba:"Submit_Attendance",
       inputs:[{key:"present",label:"Present Days",type:"number",placeholder:"20"},
               {key:"absent",label:"Absent Days",type:"number",placeholder:"3"},
               {key:"late",label:"Late Count",type:"number",placeholder:"4"},
               {key:"ot_hrs",label:"OT Hours",type:"number",placeholder:"8"}],
       checks:["Each record: status = Present|Absent, lateMinutes, overtimeHours","Late = Present + lateMinutes > 0","Leave = Absent (created by approved leave)","Supabase upsert: unique (employeeId, date)"],
       affects:["attendance","payroll (auto-links)"]},
      {id:"s3",tab:"attendance",action:"Verify Sandwich Sunday Rule",vba:"",
       inputs:[{key:"sat_absent",label:"Saturday before absent?",type:"select",options:["Yes","No"]},
               {key:"mon_absent",label:"Monday after absent?",type:"select",options:["Yes","No"]}],
       checks:["If Sat OR Mon is absent → Sunday counts as absent","Extra sandwich Sundays added to finalAbsentCount","Only applies if Sunday not already marked absent"],
       affects:["payroll (absentDeduction increase)"]},
    ]
  },
  {
    id:"WF-H02", name:"Payroll Calculation — Full Cycle",
    dept:"HR", color:"#E67E22",
    desc:"Exact ERP payroll: SALARY_DAYS=25, dayRate, OT, lates, EOBI, loan cap 50%",
    steps:[
      {id:"s1",tab:"attendance",action:"Verify attendance data ready",vba:"",
       inputs:[{key:"month",label:"Payroll Month",type:"text",placeholder:"2026-04"},
               {key:"emp_id",label:"Employee ID",type:"text",placeholder:"EMP-001"}],
       checks:["Attendance records exist for month","Public holidays counted (Mon-Sat only, HR-2)","SALARY_DAYS = max(20, 25 - publicHolidays)"],
       affects:["payroll"]},
      {id:"s2",tab:"payroll",action:"Verify payroll calculation formulas",vba:"Submit_Payroll",
       inputs:[{key:"gross",label:"Gross Salary PKR",type:"number",placeholder:"35000"},
               {key:"present",label:"Present Days",type:"number",placeholder:"20"},
               {key:"absent",label:"Final Absent (after sandwich)",type:"number",placeholder:"3"},
               {key:"allowed_absent",label:"Allowed Absent (Seth approved)",type:"number",placeholder:"1"},
               {key:"lates",label:"Late Count",type:"number",placeholder:"4"},
               {key:"ot_hrs",label:"OT Hours",type:"number",placeholder:"8"},
               {key:"loan_ded",label:"Active Loan Deduction PKR",type:"number",placeholder:"2000"},
               {key:"eobi",label:"EOBI Registered?",type:"select",options:["Yes (PKR 370)","No"]}],
       checks:[
         "dayRate = gross / SALARY_DAYS (e.g., 35000/25 = 1400)",
         "absentDed = (finalAbsent - allowedAbsent) x dayRate = (3-1) x 1400 = 2800",
         "latePenalty = floor(lates/3) x dayRate = floor(4/3) x 1400 = 1400",
         "OT = hours x (dayRate/8 x 1.5) = 8 x (1400/8 x 1.5) = 2100",
         "EOBI = 370 if registered, else 0",
         "loanCap = 50% of (gross - absDed - lateDed - EOBI)",
         "netSalary = max(0, gross + OT - absDed - lateDed - loan - EOBI)",
       ],
       affects:["payroll"]},
      {id:"s3",tab:"payroll",action:"Verify payroll record saved",vba:"",
       inputs:[{key:"payroll_id",label:"Expected Payroll ID",type:"text",placeholder:"PAY-EMP-001-2026-04"},
               {key:"net",label:"Expected Net PKR",type:"number",placeholder:"30530"}],
       checks:["ID format: PAY-{employeeId}-{YYYY-MM}","One row per employee per month","netSalary matches manual calculation","absentDates[] and lateDates[] arrays populated"],
       affects:["payroll","ledger (on approval)"]},
    ]
  },
  {
    id:"WF-H03", name:"Payroll Approval → GL Posting (PAY-JV)",
    dept:"HR", color:"#E67E22",
    desc:"4-role approval via Edge Function, then department-wise GL journal with gratuity accrual",
    steps:[
      {id:"s1",tab:"payroll",action:"Trigger payroll approval",vba:"",
       inputs:[{key:"month",label:"Month",type:"text",placeholder:"2026-04"},
               {key:"approver",label:"Approver Role",type:"select",options:["super_admin","manager","finance_manager"]}],
       checks:["Edge Function: approve-payroll validates JWT (HR-1)","Approver identity from server-side JWT, not request body","Allowed roles: super_admin, manager, finance_manager","Prevents double approval (checks audit_log)","audit_log entry created (immutable)"],
       affects:["payroll (isApproved)","ledger"]},
      {id:"s2",tab:"ledger",action:"Verify Payroll GL Journal (PAY-JV-YYYYMM)",vba:"Post_Journal",
       inputs:[{key:"month",label:"Month",type:"text",placeholder:"202604"},
               {key:"total_net",label:"Total Net Disbursable PKR",type:"number",placeholder:"850000"}],
       checks:[
         "txId = PAY-JV-{YYYYMM}",
         "DEBIT by department: Basic(5211) + Allowances(5212) + OT(5213)",
         "Cost center attached to each debit line",
         "CREDIT: Salaries Payable(2211) = totalNetDisbursable",
         "CREDIT: Staff Loans(1121) = totalLoanRecovery",
         "Sum Dr = Sum Cr (GL balance assertion)",
       ],
       affects:["ledger"]},
      {id:"s3",tab:"ledger",action:"Verify Gratuity Accrual (tenure >= 12 months)",vba:"",
       inputs:[{key:"accrual",label:"Monthly Gratuity Accrual PKR",type:"number",placeholder:"2333"}],
       checks:["txId = GRAT-JV-{YYYYMM}","Only employees with tenure >= 12 months","monthlyAccrual = basicPay / 12","Dr 5214 (Gratuity Expense)","Cr 2311 (Gratuity Provision)"],
       affects:["ledger"]},
    ]
  },
  {
    id:"WF-H04", name:"Salary Disbursement — Mark as Paid",
    dept:"HR", color:"#E67E22",
    desc:"Mark salary/OT as paid with GL entry: Dr Salaries Payable / Cr Cash",
    steps:[
      {id:"s1",tab:"payroll",action:"Mark salary as Paid",vba:"",
       inputs:[{key:"emp_id",label:"Employee ID",type:"text",placeholder:"EMP-001"},
               {key:"net_salary",label:"Net Salary PKR",type:"number",placeholder:"30530"}],
       checks:["isSalaryPaid = true","GL: Dr 2211 (Salaries Payable) / Cr 1111 (Cash)","txId: PAY-DISB-{payId}-salary-{timestamp}","Amount = basic + allowances - deductions"],
       affects:["ledger","payroll (isSalaryPaid flag)"]},
      {id:"s2",tab:"payroll",action:"Mark OT as Paid (separate disbursement)",vba:"",
       inputs:[{key:"ot_amount",label:"OT Amount PKR",type:"number",placeholder:"2100"}],
       checks:["isOvertimePaid = true","GL: Dr 2211 (Salaries Payable) / Cr 1111 (Cash)","txId: PAY-DISB-{payId}-ot-{timestamp}"],
       affects:["ledger","payroll (isOvertimePaid flag)"]},
    ]
  },
  {
    id:"WF-H05", name:"Leave Application → Auto-Attendance",
    dept:"HR", color:"#E67E22",
    desc:"Leave apply → manager approval → auto-create attendance records (exclude Sundays)",
    steps:[
      {id:"s1",tab:"leave_applications",action:"Submit leave application",vba:"",
       inputs:[{key:"type",label:"Leave Type",type:"select",options:["Annual (16d)","Casual (10d)","Sick (8d)","Unpaid","Maternity (90d)","Paternity (3d)"]},
               {key:"from",label:"From Date",type:"text",placeholder:"2026-04-20"},
               {key:"to",label:"To Date",type:"text",placeholder:"2026-04-22"},
               {key:"days",label:"Days",type:"number",placeholder:"3"}],
       checks:["leave_application record created","status = Pending","days calculated correctly (excluding Sundays)","Balance check: remaining >= days requested"],
       affects:["leave_applications"]},
      {id:"s2",tab:"leave_applications",action:"Manager approves leave",vba:"",
       inputs:[{key:"action",label:"Manager Action",type:"select",options:["Approve","Reject","Cancel"]}],
       checks:["status → Approved/Rejected/Cancelled","reviewed_by populated","reviewed_at timestamp set"],
       affects:["attendance (if approved)"]},
      {id:"s3",tab:"attendance",action:"Verify auto-created attendance records",vba:"",
       inputs:[{key:"records_created",label:"Attendance records created?",type:"select",options:["Yes — one per leave day","No — missing"]}],
       checks:["One attendance record per leave day","Sundays excluded from leave credit","status = Absent (Leave stored as Absent in DB)","lateMinutes = 0, overtimeHours = 0"],
       affects:["payroll (absentDeduction — but allowed absent may offset)"]},
    ]
  },
  {
    id:"WF-H06", name:"Loan Issue → Repayment → GL",
    dept:"HR", color:"#E67E22",
    desc:"Loan/Advance disbursement with GL entry, monthly deduction in payroll with 50% cap",
    steps:[
      {id:"s1",tab:"loans",action:"Issue Loan or Advance",vba:"Submit_Loan",
       inputs:[{key:"emp_id",label:"Employee ID",type:"text",placeholder:"EMP-001"},
               {key:"amount",label:"Amount PKR",type:"number",placeholder:"50000"},
               {key:"type",label:"Type",type:"select",options:["Loan","Advance"]},
               {key:"repayment",label:"Monthly Repayment PKR",type:"number",placeholder:"5000"}],
       checks:["Loan record created, status = Active","For Advance: repaymentAmount = full amount","GL: Dr 1121 (Staff Loans & Advances) / Cr 1111 (Cash)","Optional: linked requisitionId marks req as Completed"],
       affects:["loans","ledger","requisitions (if linked)"]},
      {id:"s2",tab:"payroll",action:"Verify loan deduction in payroll",vba:"",
       inputs:[{key:"month",label:"Payroll Month",type:"text",placeholder:"2026-04"},
               {key:"expected_ded",label:"Expected Deduction PKR",type:"number",placeholder:"5000"}],
       checks:["Loan deduction appears in payroll record","50% cap enforced: maxLoan = 50% of (gross - absent - late - EOBI)","skipMonth respected if set","Loan waiver requires manager+ role (HR-3)","Advance fully deducted in one month"],
       affects:["payroll (loanDeduction)"]},
      {id:"s3",tab:"loans",action:"Verify loan completion on full repayment",vba:"",
       inputs:[{key:"status",label:"Loan Status After Full Repayment",type:"select",options:["Completed/Paid","Still Active"]}],
       checks:["When cumulative repayment >= amount → status = Completed","No further payroll deductions","GL: PAY-JV credit line clears loan balance"],
       affects:["loans","payroll"]},
    ]
  },
  {
    id:"WF-H07", name:"Attendance Override (Manual Adjustments)",
    dept:"HR", color:"#E67E22",
    desc:"Phase 8: Manual summary overrides for absent, lates, OT, loan deduction",
    steps:[
      {id:"s1",tab:"attendance_overrides",action:"Set manual override for employee month",vba:"",
       inputs:[{key:"emp_id",label:"Employee ID",type:"text",placeholder:"EMP-001"},
               {key:"month",label:"Month",type:"text",placeholder:"2026-04"},
               {key:"absent",label:"Manual Absent Count",type:"number",placeholder:"2"},
               {key:"allowed_absent",label:"Allowed Absent",type:"number",placeholder:"1"},
               {key:"lates",label:"Manual Late Count",type:"number",placeholder:"3"},
               {key:"ot",label:"Manual OT Hours",type:"number",placeholder:"12"},
               {key:"manual_loan",label:"Manual Loan Deduction (-1=auto, 0=waive)",type:"number",placeholder:"-1"}],
       checks:["Override ID: {company}_{employeeId}_{month}","Unique index: (company, employee_id, month)","manual_loan_deduction: -1=auto, 0=waive, positive=fixed","Waive (0) requires manager+ role (HR-3)"],
       affects:["payroll (overrides auto-calculation)"]},
      {id:"s2",tab:"payroll",action:"Verify override takes effect in payroll",vba:"",
       inputs:[{key:"verify",label:"Override Applied?",type:"select",options:["Yes — manual values used","No — auto-calculation used"]}],
       checks:["If override present: uses manual absent/lates/OT instead of auto-sum","If manual_loan=0: loanDeduction=0 AND loanWaived=true","If manual_loan>0: fixed amount used instead of sum(repayments)"],
       affects:["payroll"]},
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 4: FINANCE & GL (8 workflows)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id:"WF-F01", name:"Period Lock — Open / Close / Enforce",
    dept:"FINANCE", color:"#1A3A5C",
    desc:"Fiscal period management — HARD BLOCK on all GL writes when closed (no agent bypass)",
    steps:[
      {id:"s1",tab:"fiscal_periods",action:"Open fiscal period",vba:"",
       inputs:[{key:"month",label:"Month (YYYY-MM)",type:"text",placeholder:"2026-04"},
               {key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon","Factory"]},
               {key:"status",label:"Status",type:"select",options:["Open","Closed"]}],
       checks:["Period row exists in fiscal_periods","status = Open","opened_by and opened_at populated"],
       affects:["ledger (all GL writes check period)","payroll (GL posting blocked if closed)"]},
      {id:"s2",tab:"ledger",action:"Attempt GL post in open period",vba:"Post_Journal",
       inputs:[{key:"result",label:"GL Post Result",type:"select",options:["Accepted","Rejected"]}],
       checks:["Period Open → GL post allowed","enforcePeriodLock() returns allowed=true"],
       affects:["ledger"]},
      {id:"s3",tab:"fiscal_periods",action:"Close period and verify hard block",vba:"",
       inputs:[{key:"attempt",label:"Attempt GL post in closed period",type:"select",options:["Blocked correctly","Post went through (BUG)"]}],
       checks:["Period Closed → GL post BLOCKED","Message: 'Period {month} is CLOSED for {company}'","Violation logged to audit_log","NO agent bypass allowed — owner must reopen"],
       affects:["ledger (blocked)","audit_log"]},
    ]
  },
  {
    id:"WF-F02", name:"Manual Journal Voucher — Maker-Checker (4-Eyes)",
    dept:"FINANCE", color:"#1A3A5C",
    desc:"JV only: Draft by Maker → Approve by Checker (different person) with GL balance gate",
    steps:[
      {id:"s1",tab:"ledger",action:"Phase 1: Maker creates Draft JV",vba:"Post_Journal",
       inputs:[{key:"dr_code",label:"Debit GL Code",type:"text",placeholder:"51214 (Freight)"},
               {key:"cr_code",label:"Credit GL Code",type:"text",placeholder:"11112 (Cash)"},
               {key:"amount",label:"Amount PKR",type:"number",placeholder:"25000"},
               {key:"maker",label:"Maker Email",type:"text",placeholder:"accountant@glasstech.pk"}],
       checks:["docType must be JV","status = Draft","draftedBy = maker email","Period must be Open","GL balance NOT checked at draft stage"],
       affects:["ledger"]},
      {id:"s2",tab:"ledger",action:"Phase 2: Checker approves JV",vba:"",
       inputs:[{key:"checker",label:"Checker Email",type:"text",placeholder:"cfo@glasstech.pk"},
               {key:"checker_role",label:"Checker Role",type:"select",options:["super_admin","owner","gtk_admin","glassco_admin","nippon_admin"]}],
       checks:[
         "Guard 1: Role authorized (super_admin/owner/hassan/gtk_admin/glassco_admin/nippon_admin)",
         "Guard 2: JV exists and found by ID",
         "Guard 3: Status must be Draft",
         "Guard 4: 4-Eyes — approver email != draftedBy email",
         "Guard 5: Period still Open at approval time",
         "Guard 6: GL Balance — Σ debit = Σ credit (throws LedgerImbalanceError)",
         "On success: status → Posted, approvedBy set, postedAt timestamp",
       ],
       affects:["ledger"]},
      {id:"s3",tab:"ledger",action:"Verify system-auto JV bypasses Maker-Checker",vba:"",
       inputs:[{key:"source",label:"JV Source",type:"select",options:["system-auto (recurring/depreciation)","user-created"]}],
       checks:["If createdBy = system-auto → Posted directly (no Draft)","Pre-audited entries: recurring expenses, depreciation, intercompany","Manual JVs always go through 4-eyes"],
       affects:[]},
    ]
  },
  {
    id:"WF-F03", name:"Opening Balance — Inventory GL (OB)",
    dept:"FINANCE", color:"#1A3A5C",
    desc:"Post inventory opening balance — store ledger mvmnt 561 + GL journal doc_type OB",
    steps:[
      {id:"s1",tab:"fiscal_periods",action:"Verify fiscal period is Open",vba:"",
       inputs:[{key:"month",label:"Month",type:"text",placeholder:"2026-04"},
               {key:"status",label:"Status",type:"select",options:["Open","Closed"]}],
       checks:["Period exists","status = Open"],
       affects:["ledger"]},
      {id:"s2",tab:"store_items",action:"Create/verify item in store",vba:"",
       inputs:[{key:"item_id",label:"Item ID",type:"text",placeholder:"ITM-GCO-001"},
               {key:"item_name",label:"Item Name",type:"text",placeholder:"Float Glass 5mm Clear"}],
       checks:["Item exists in store_items","unit of measure set","movingAveragePrice set"],
       affects:["stock_ledger"]},
      {id:"s3",tab:"stock_ledger",action:"Post Opening Balance (mvmnt 561)",vba:"",
       inputs:[{key:"qty",label:"Qty (SqFt)",type:"number",placeholder:"360"},
               {key:"map",label:"Opening MAP (PKR/SqFt)",type:"number",placeholder:"450"}],
       checks:["mvmntCode = 561","qty > 0","balanceAfter > 0","valuation = MAP"],
       affects:["store_items (quantity, totalValue)"]},
      {id:"s4",tab:"ledger",action:"Post GL Journal (doc_type = OB)",vba:"Post_Journal",
       inputs:[{key:"dr_code",label:"Debit GL",type:"text",placeholder:"11511 (Inventory — Glass)"},
               {key:"cr_code",label:"Credit GL",type:"text",placeholder:"31111 (Owner Capital)"},
               {key:"amount",label:"Amount PKR",type:"number",placeholder:"162000"}],
       checks:["doc_type = OB","Dr = Cr","status = Posted","period = Open"],
       affects:["ledger"]},
      {id:"s5",tab:"ledger",action:"Trial Balance verify",vba:"",
       inputs:[{key:"check",label:"Result",type:"select",options:["BALANCED","IMBALANCE"]}],
       checks:["Total Debits = Total Credits (tolerance ±1 PKR)","GL code 11511 balance > 0","GL code 31111 balance > 0"],
       affects:[]},
    ]
  },
  {
    id:"WF-F04", name:"Payment Receipt → AR Update → GL (DZ)",
    dept:"FINANCE", color:"#1A3A5C",
    desc:"Customer payment collection: Dr Bank / Cr Receivable with AR balance update",
    steps:[
      {id:"s1",tab:"invoices",action:"Verify outstanding invoice",vba:"",
       inputs:[{key:"inv_id",label:"Invoice ID",type:"text",placeholder:"GT-INV-GLS-0426-0001"},
               {key:"balance",label:"Outstanding Balance PKR",type:"number",placeholder:"485000"}],
       checks:["Invoice exists","status = Outstanding or Partial","balance > 0"],
       affects:["ledger"]},
      {id:"s2",tab:"ledger",action:"Record customer payment",vba:"Record_Payment",
       inputs:[{key:"bank",label:"Bank",type:"select",options:["HBL","Meezan","MCB"]},
               {key:"amount",label:"Payment Amount PKR",type:"number",placeholder:"200000"}],
       checks:["doc_type = DZ","Dr Bank account (11121/11122)","Cr AR account (1221)","status = Posted","Bank balance increases"],
       affects:["ledger","invoice_balances"]},
      {id:"s3",tab:"invoice_balances",action:"Verify AR balance updated",vba:"",
       inputs:[{key:"received",label:"Total Received PKR",type:"number",placeholder:"200000"}],
       checks:["live_balance = total_amount - Σ(payment_receipts)","status = Partial (if partial payment)","status = Paid (if fully paid)","Real-time view (FIN-4 migration 016)"],
       affects:["invoice_balances"]},
      {id:"s4",tab:"ledger",action:"Trial Balance verify",vba:"",
       inputs:[{key:"result",label:"Result",type:"select",options:["BALANCED","IMBALANCE"]}],
       checks:["BALANCED","1221 balance = outstanding AR","Bank balance increased","Revenue still showing"],
       affects:[]},
    ]
  },
  {
    id:"WF-F05", name:"Payment Voucher — Parked → Approved → Posted (PV)",
    dept:"FINANCE", color:"#1A3A5C",
    desc:"Expense payment workflow: PV parked first, finance approves, then GL becomes effective",
    steps:[
      {id:"s1",tab:"ledger",action:"Create Parked Payment Voucher",vba:"",
       inputs:[{key:"category",label:"Sub-Category",type:"select",options:["BOM Hardware","Aluminium Profiles","Consumables","General Expense","Vehicle Fuel","R&M"]},
               {key:"amount",label:"Amount PKR",type:"number",placeholder:"45000"},
               {key:"payment_mode",label:"Payment Mode",type:"select",options:["Cash","Petty Cash","Personal Account","Bank Transfer"]},
               {key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon"]}],
       checks:["PV ID: GT-PV-GLS-MMYY-XXXX (starts 12001)","doc_type = PV","status = Parked","Dr: Expense/Inventory account (resolved from sub-category)","Cr: Cash(11112)/PettyCash(11111)/Bank(11121) based on payment mode","reqId linked to requisition"],
       affects:["ledger"]},
      {id:"s2",tab:"ledger",action:"Finance approves → Post PV",vba:"",
       inputs:[{key:"action",label:"Approval Action",type:"select",options:["Approve & Post","Reject"]}],
       checks:["GL balance assertion passes","status: Parked → Posted","Requisition: paymentStatus = Paid, paymentRef = pvId","GL becomes effective in Trial Balance"],
       affects:["ledger","requisitions (paymentStatus)"]},
    ]
  },
  {
    id:"WF-F06", name:"Petty Cash Journal (CJ — FBCJ)",
    dept:"FINANCE", color:"#1A3A5C",
    desc:"Petty cash receipt/payment entries with business transaction codes and req linking",
    steps:[
      {id:"s1",tab:"petty_cash",action:"Post Petty Cash entry",vba:"",
       inputs:[{key:"type",label:"Entry Type",type:"select",options:["Receipt","Payment"]},
               {key:"amount",label:"Amount PKR",type:"number",placeholder:"5000"},
               {key:"biz_trans",label:"Business Transaction",type:"select",options:["E10 (Cash from Bank)","E20 (Customer Cash)","A10 (Supplies)","A20 (R&M)","A30 (Consumables)","A40 (Fuel)","A50 (Bank Deposit)","A60 (Vendor Payment)","A70 (Staff Salary)"]},
               {key:"gl_account",label:"Offsetting GL Account",type:"text",placeholder:"53211 (Supplies)"},
               {key:"req_id",label:"Linked Requisition (optional)",type:"text",placeholder:"REQ-GLS-0426-001"}],
       checks:["doc_type = CJ","status = Posted (direct, no approval)","Receipt: Dr PettyCash(12320-01) / Cr selected GL","Payment: Dr selected GL / Cr PettyCash(12320-01)","CostCenterId attached to debit line","If reqId linked: req status → Completed, paymentStatus → Paid"],
       affects:["ledger","petty_cash","requisitions (if linked)"]},
    ]
  },
  {
    id:"WF-F07", name:"Recurring Expenses & Depreciation (SA — Auto-Post)",
    dept:"FINANCE", color:"#1A3A5C",
    desc:"Monthly auto-posted GL entries: recurring expenses + straight-line depreciation",
    steps:[
      {id:"s1",tab:"recurring_expenses",action:"Verify recurring expense template",vba:"",
       inputs:[{key:"template",label:"Template Name",type:"text",placeholder:"Generator Fuel Allocation"},
               {key:"amount",label:"Monthly Amount PKR",type:"number",placeholder:"15000"},
               {key:"day",label:"Day of Month",type:"number",placeholder:"28"}],
       checks:["Template exists in recurring_expenses","debitAccountId and creditAccountId set","amount > 0","dayOfMonth valid"],
       affects:["ledger"]},
      {id:"s2",tab:"ledger",action:"Trigger monthly auto-post",vba:"",
       inputs:[{key:"month",label:"Month",type:"text",placeholder:"2026-04"}],
       checks:["doc_type = SA","status = Posted directly (no approval)","createdBy = system-auto (bypasses Maker-Checker)","txId: RE-{templateId}-{YYYY-MM}","Idempotent: duplicate post for same month skipped","GL balance assertion passes"],
       affects:["ledger"]},
      {id:"s3",tab:"assets",action:"Verify depreciation auto-post",vba:"",
       inputs:[{key:"asset",label:"Asset Name",type:"text",placeholder:"Generator Set"},
               {key:"purchase_value",label:"Purchase Value PKR",type:"number",placeholder:"1200000"},
               {key:"useful_life",label:"Useful Life Years",type:"number",placeholder:"10"}],
       checks:["Monthly depreciation = purchaseValue / (usefulLifeYears x 12)","Single rounded value for Dr and Cr (H-2: prevents IEEE-754 divergence)","txId: DEP-{assetId}-{YYYY-MM}","Dr 53911 (Depreciation Expense)","Cr 12121 (Accumulated Depreciation)","Date: {YYYY-MM}-28"],
       affects:["ledger","assets"]},
    ]
  },
  {
    id:"WF-F08", name:"Bank Reconciliation (EC-03)",
    dept:"FINANCE", color:"#1A3A5C",
    desc:"Bank statement import (CSV) → GL matching → balanced/unmatched identification",
    steps:[
      {id:"s1",tab:"bank_recon_sessions",action:"Start reconciliation session",vba:"",
       inputs:[{key:"bank",label:"Bank Account",type:"select",options:["HBL Current","Meezan Current","MCB Current"]},
               {key:"month",label:"Month",type:"text",placeholder:"2026-04"},
               {key:"bank_balance",label:"Bank Statement Balance PKR",type:"number",placeholder:"2500000"}],
       checks:["Session created in Supabase (DB-primary, no localStorage)","GL entries loaded for bank account + month","GL Net Movement calculated","difference = bankBalance - glNetMovement","Status = Balanced (diff < 1) or In Progress"],
       affects:["bank_recon_sessions"]},
      {id:"s2",tab:"bank_recon_sessions",action:"Import CSV bank statement",vba:"",
       inputs:[{key:"csv_loaded",label:"CSV Import Result",type:"select",options:["Parsed successfully","Parse failed"]}],
       checks:["Auto-detect header row (Date/Debit/Credit keywords)","Date formats supported: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD","Running balance calculated: prev + credit - debit","Statement lines added to session"],
       affects:["bank_recon_sessions"]},
      {id:"s3",tab:"bank_recon_sessions",action:"Match GL to Statement and reconcile",vba:"",
       inputs:[{key:"unmatched_gl",label:"Unmatched GL Entries",type:"number",placeholder:"3"},
               {key:"unmatched_stmt",label:"Unmatched Statement Lines",type:"number",placeholder:"2"}],
       checks:["Matched GL entries linked to statement lines","All unmatched = 0 → status = Balanced","Unmatched GL = outstanding cheques / pending deposits","Unmatched statement = bank errors / recording gaps"],
       affects:[]},
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 5: STORE & PROCUREMENT (7 workflows)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id:"WF-P01", name:"GRN → Stock → MAP Recalc (IAS 2)",
    dept:"STORE", color:"#27AE60",
    desc:"Goods receipt with per-sheet inspection, IAS 2 MAP calculation, freight allocation by weight",
    steps:[
      {id:"s1",tab:"vendors",action:"Verify vendor Active in VENDOR_MASTER",vba:"",
       inputs:[{key:"vendor",label:"Vendor Name",type:"text",placeholder:"Ghani Glass"},
               {key:"type",label:"Vendor Type",type:"select",options:["Glass","Tempering","Transport","Hardware","Profile","General"]}],
       checks:["Vendor exists","type = selected","status = Active"],
       affects:["purchase_orders"]},
      {id:"s2",tab:"store_items",action:"GRN header + line items entry",vba:"Post_GRN",
       inputs:[{key:"item",label:"Material ID",type:"text",placeholder:"Float Glass 5mm"},
               {key:"qty",label:"Qty Received (SqFt)",type:"number",placeholder:"240"},
               {key:"rate",label:"Rate PKR/SqFt",type:"number",placeholder:"600"},
               {key:"freight",label:"Freight PKR",type:"number",placeholder:"4500"},
               {key:"weight",label:"Total Weight KG",type:"number",placeholder:"480"},
               {key:"sheets",label:"Sheet Count",type:"number",placeholder:"20"}],
       checks:[
         "Landed cost = (qty x rate + freight) / qty",
         "If weight available: freightAlloc = freight x (lineWeightKg / totalWeightKg)",
         "If no weight: freightAlloc = freight x (lineSqft / totalSqft)",
         "Per-sheet inspection records created",
         "Sheet tag format: GLS-05MM-MMYY-XXX-SS",
       ],
       affects:["store_items","stock_ledger","ledger"]},
      {id:"s3",tab:"stock_ledger",action:"Verify movement 101 posted",vba:"",
       inputs:[{key:"mvmnt",label:"Movement Code",type:"select",options:["101 (GRN In)","102 (Reversal)"]}],
       checks:["mvmntCode = 101","qty = okSqft + defUsableSqft","balanceAfter increases","referenceDoc = grnId","Extended fields: dcNo, biltyNo, vehicleNo populated"],
       affects:["store_items (quantity, unrestrictedQty)"]},
      {id:"s4",tab:"store_items",action:"Verify IAS 2 MAP recalculation",vba:"",
       inputs:[{key:"old_qty",label:"Pre-GRN Qty",type:"number",placeholder:"360"},
               {key:"old_map",label:"Old MAP",type:"number",placeholder:"450"},
               {key:"new_qty",label:"Received Qty",type:"number",placeholder:"240"},
               {key:"landed",label:"Landed Cost/Unit",type:"number",placeholder:"618.75"}],
       checks:[
         "New MAP = (oldQty x oldMAP + newQty x landedCost) / (oldQty + newQty)",
         "Example: (360x450 + 240x618.75) / 600 = 517.50",
         "MAP rounded to 2 decimal places (PKR precision)",
         "totalValue = currentQty x new MAP",
         "MAP > old rate when freight absorbed",
       ],
       affects:["store_items (MAP, totalValue)"]},
      {id:"s5",tab:"ledger",action:"Verify GRN GL entries",vba:"",
       inputs:[{key:"balanced",label:"GL Balanced?",type:"select",options:["Dr = Cr","Imbalanced"]}],
       checks:["Entry 1: Dr 11511 (Inventory) / Cr 21151 (GR/IR — Material)","If freight vendor-included: Dr 21111 (Payable) / Cr 11112 (Cash)","If freight own-expense: Dr 51214 (Freight Exp) / Cr 11112/21113","doc_type = KR","assertGRNQAMatch: inspection values match ±1 PKR"],
       affects:["ledger"]},
    ]
  },
  {
    id:"WF-P02", name:"Requisition → Approval → Purchase Order",
    dept:"STORE", color:"#27AE60",
    desc:"Material request with L1/L2/L3 approval levels based on amount thresholds",
    steps:[
      {id:"s1",tab:"requisitions",action:"Submit Requisition",vba:"Submit_Req",
       inputs:[{key:"category",label:"Category",type:"select",options:["Store Purchase","Production","Admin","Repair & Maintenance","Factory","HR"]},
               {key:"sub_category",label:"Sub-Category",type:"select",options:["BOM Hardware","Aluminium Profiles","Consumables","Glass Purchase","Tool Purchase","General Expense","Vehicle Fuel","R&M"]},
               {key:"amount",label:"Total Est Value PKR",type:"number",placeholder:"180000"},
               {key:"priority",label:"Priority",type:"select",options:["Normal","Urgent","Low"]},
               {key:"company",label:"Company",type:"select",options:["Glassco","GTK","GTI","Nippon","Factory"]}],
       checks:["REQ ID auto-generated","status = Pending","approvalLevel auto: L1(<100k), L2(100k-500k), L3(>500k)","materialType tagged for cost tracking"],
       affects:["requisitions"]},
      {id:"s2",tab:"requisitions",action:"Approve Requisition (level-based)",vba:"Approve_Req",
       inputs:[{key:"approved_by",label:"Approved By",type:"text",placeholder:"Pervez Akhtar"},
               {key:"level",label:"Approval Level Required",type:"select",options:["L1 (Dept Mgr < 100k)","L2 (Director 100k-500k)","L3 (MD/CEO > 500k)"]}],
       checks:["status → Approved","approved_by populated","approval_date set","approvalHistory[] entry added"],
       affects:["purchase_orders (conversion available)"]},
      {id:"s3",tab:"purchase_orders",action:"Convert to Purchase Order",vba:"",
       inputs:[{key:"vendor",label:"Vendor",type:"text",placeholder:"Ghani Glass"},
               {key:"po_amount",label:"PO Amount PKR",type:"number",placeholder:"180000"}],
       checks:["PO record created","req_id linked","approvalLevel carried from REQ","status = Sent","matchStatus = Pending"],
       affects:["purchase_orders","store_items (on GRN receipt)"]},
    ]
  },
  {
    id:"WF-P03", name:"Material Issue — Consumption (mvmnt 201)",
    dept:"STORE", color:"#27AE60",
    desc:"Issue material to cost center with stock deduction and project consumption tracking",
    steps:[
      {id:"s1",tab:"store_items",action:"Verify sufficient stock",vba:"Issue_Material",
       inputs:[{key:"item",label:"Item",type:"text",placeholder:"Float Glass 5mm Clear"},
               {key:"qty",label:"Issue Qty (SqFt)",type:"number",placeholder:"50"},
               {key:"available",label:"Available Qty",type:"number",placeholder:"600"}],
       checks:["unrestrictedQty >= issueQty","InsufficientStockError if qty > available"],
       affects:["store_items","stock_ledger"]},
      {id:"s2",tab:"stock_ledger",action:"Verify movement 201 posted",vba:"",
       inputs:[{key:"cost_center",label:"Cost Center",type:"text",placeholder:"CC-1001 Cutting"},
               {key:"project",label:"Project (optional)",type:"text",placeholder:"Gulshan Tower Phase 2"}],
       checks:["mvmntCode = 201","qty = negative (outflow)","valuation = MAP at time of issue","referenceDoc = CC-{code}","Remarks: Issued to {CC_name} [Prj: {project}]"],
       affects:["store_items (qty decreases, totalValue decreases)"]},
      {id:"s3",tab:"store_items",action:"Verify stock balance after issue",vba:"",
       inputs:[{key:"expected_qty",label:"Expected Remaining Qty",type:"number",placeholder:"550"}],
       checks:["quantity = previous - issued","unrestrictedQty decreased","totalValue = qty x MAP","If project linked: project.glassConsumed += value"],
       affects:["store_items"]},
    ]
  },
  {
    id:"WF-P04", name:"3-Way Matching — PO vs GRN vs Invoice",
    dept:"STORE", color:"#27AE60",
    desc:"Verify PO-GRN-Invoice alignment within ±1 PKR tolerance before vendor payment",
    steps:[
      {id:"s1",tab:"purchase_orders",action:"Verify PO exists and Approved",vba:"",
       inputs:[{key:"po_id",label:"PO ID",type:"text",placeholder:"PO-GLS-001"},
               {key:"po_total",label:"PO Total PKR",type:"number",placeholder:"180000"}],
       checks:["PO exists","status = Approved or Sent","totalAmount populated"],
       affects:[]},
      {id:"s2",tab:"stock_ledger",action:"Verify GRN posted for PO",vba:"",
       inputs:[{key:"grn_value",label:"GRN Total Value PKR",type:"number",placeholder:"180500"}],
       checks:["GRN linked to PO via poId","GRN status = Posted"],
       affects:[]},
      {id:"s3",tab:"purchase_orders",action:"Run 3-Way Match assertion",vba:"",
       inputs:[{key:"invoice_amount",label:"Vendor Invoice Amount PKR",type:"number",placeholder:"180200"}],
       checks:["Leg 1: PO status = Approved","Leg 2: |grnValue - poTotal| <= PKR 1","Leg 3: |invoiceAmount - grnValue| <= PKR 1","If mismatch: ThreeWayMatchError thrown","matchStatus: Pending → 2-Way → 3-Way","QA check: assertGRNQAMatch (inspection values match)"],
       affects:["purchase_orders (matchStatus)"]},
    ]
  },
  {
    id:"WF-P05", name:"Advance Settlement — REQ Reconciliation",
    dept:"STORE", color:"#27AE60",
    desc:"Settle employee advance: actual vs advance with variance handling (FIN-1/FIN-2 guards)",
    steps:[
      {id:"s1",tab:"ledger",action:"Verify advance GL entry exists (FIN-2 guard)",vba:"",
       inputs:[{key:"req_id",label:"Requisition ID",type:"text",placeholder:"REQ-GLS-0426-001"},
               {key:"advance_amount",label:"Advance Amount PKR",type:"number",placeholder:"100000"}],
       checks:["FIN-2: Advance GL entry must exist for reqId","If no advance found: reject settlement (orphan guard)","Advance was: Dr 11421 (Employee Advances) / Cr Cash"],
       affects:["ledger"]},
      {id:"s2",tab:"ledger",action:"Submit settlement with actuals",vba:"",
       inputs:[{key:"actual_amount",label:"Actual Spend PKR",type:"number",placeholder:"80000"},
               {key:"categories",label:"Category Breakdown",type:"text",placeholder:"Hardware:50k, Profile:30k"}],
       checks:["FIN-1: actualAmount <= advanceAmount x 1.5 (overclaim hard cap)","variance = actual - advance","Under-spend: refund from purchaser (Dr Cash, Cr Advance)","Over-spend: payment by company (extra Cr Cash)","Exact: clean settlement"],
       affects:["ledger"]},
      {id:"s3",tab:"ledger",action:"Verify settlement GL balanced",vba:"",
       inputs:[{key:"result",label:"Settlement Result",type:"select",options:["Exact Match","Under-spend (refund)","Over-spend (extra payment)"]}],
       checks:["JV status = Parked (needs finance approval)","Dr: Category accounts (11513, 11511, etc.)","Cr: 11421 (Employee Advances) = min(advance, actual)","Variance line: Cash movement for under/over-spend","Σ Dr = Σ Cr"],
       affects:["ledger","requisitions"]},
    ]
  },
  {
    id:"WF-P06", name:"Remnant Management (mvmnt 551)",
    dept:"STORE", color:"#27AE60",
    desc:"Glass remnant tracking from cutting: create, reserve, use, or scrap",
    steps:[
      {id:"s1",tab:"store_items",action:"Create remnant from cutting session",vba:"",
       inputs:[{key:"parent_tag",label:"Parent Sheet Tag",type:"text",placeholder:"GLS-05MM-0226-001-01"},
               {key:"shape",label:"Shape",type:"select",options:["Rectangle","L-Shape"]},
               {key:"width",label:"Width (inches)",type:"number",placeholder:"24"},
               {key:"height",label:"Height (inches)",type:"number",placeholder:"36"},
               {key:"sqft",label:"SqFt",type:"number",placeholder:"6"}],
       checks:["Remnant ID: REM-{thickness}-MMYY-XXX","mvmntCode = 551","parentTagId linked to original GRN sheet","status = Available","sqft calculated from dimensions","binLocation assigned"],
       affects:["store_items (remnantCount, remnantSqft)","stock_ledger"]},
      {id:"s2",tab:"store_items",action:"Reserve/Use/Scrap remnant",vba:"",
       inputs:[{key:"action",label:"Action",type:"select",options:["Reserve for job","Use in production","Scrap"]}],
       checks:["Reserve: status → Reserved, usedInJobId set","Use: status → Used, usedAt timestamp","Scrap: status → Scrapped, scrapReason + scrapDate","Store item remnantSqft adjusts accordingly"],
       affects:["store_items"]},
    ]
  },
  {
    id:"WF-P07", name:"Vendor Defect Report & Claim",
    dept:"STORE", color:"#27AE60",
    desc:"Defective sheets from GRN inspection → vendor claim → GL adjustment",
    steps:[
      {id:"s1",tab:"store_items",action:"Identify defective sheets from GRN",vba:"",
       inputs:[{key:"grn_id",label:"GRN ID",type:"text",placeholder:"GRN-GLS-0426-001"},
               {key:"defective_count",label:"Defective Sheets",type:"number",placeholder:"3"},
               {key:"claim_amount",label:"Claim Amount PKR",type:"number",placeholder:"12000"}],
       checks:["Sheet inspection: status = Defective|Broken","defectCode = BR-01 to BR-07","usableSqft calculated for partially defective","claimAmount = (fullSqft - usableSqft) x rate","Defect report auto-drafted"],
       affects:["store_items (defectiveSheets, defectiveSqft)"]},
      {id:"s2",tab:"vendors",action:"Send claim to vendor and settle",vba:"",
       inputs:[{key:"claim_status",label:"Claim Status",type:"select",options:["Draft","Sent","Verbally Confirmed","Settled"]}],
       checks:["Vendor defect report status transitions correctly","On settlement: GL adjustment posted","Dr 21151 (GR/IR Clearing) / Cr 56113 (Breakage)","Removes defective value from vendor payable"],
       affects:["ledger"]},
    ]
  },
];

// Build the dependency graph after workflow definitions
buildDependencyGraph(WORKFLOWS);

// ── Utility: Find cross-workflow dependencies ───────────────────────────────
/** @param {string} wfId - Current workflow ID
 *  @param {string} sheetName - Sheet being modified
 *  @returns {Array<{wfId:string, wfName:string, stepAction:string}>} */
function findCrossWorkflowDeps(wfId, sheetName) {
  const deps = [];
  const dependentWFs = SHEET_DEPENDENCY_GRAPH[sheetName];
  if (!dependentWFs) return deps;
  dependentWFs.forEach(depWfId => {
    if (depWfId === wfId) return;
    const wf = WORKFLOWS.find(w => w.id === depWfId);
    if (!wf) return;
    const step = wf.steps.find(s => s.tab === sheetName || (s.affects || []).some(a => a.startsWith(sheetName)));
    deps.push({ wfId: depWfId, wfName: wf.name, stepAction: step ? step.action : "depends on " + sheetName });
  });
  return deps;
}

// ── Step Box Component ──────────────────────────────────────────────────────
function StepBox({ step, stepIdx, wfColor, status, active, onClick, inputs, onInputChange, failedChecks, onMarkFailed, onMarkPass }) {
  const statusColors = {
    idle:     { bg:"#1B2B3A", border:"#3C4E5E", dot:"#3C4E5E", text:"#8899AA" },
    running:  { bg:"#0D1B2A", border:wfColor,   dot:wfColor,   text:"#E0E0E0" },
    pass:     { bg:"#0A2E1A", border:"#27AE60",  dot:"#27AE60", text:"#AAFFCC" },
    fail:     { bg:"#2E0A0A", border:"#E74C3C",  dot:"#E74C3C", text:"#FFAAAA" },
    blocked:  { bg:"#2E1A0A", border:"#F39C12",  dot:"#F39C12", text:"#FFD699" },
    reverify: { bg:"#2E2A0A", border:"#F1C40F",  dot:"#F1C40F", text:"#FFF5AA" },
  };
  const sc = statusColors[status] || statusColors.idle;

  return (
    <div
      onClick={onClick}
      style={{
        border:`2px solid ${sc.border}`, borderRadius:12,
        background:sc.bg, padding:"14px 16px",
        cursor:"pointer", transition:"all 0.2s",
        boxShadow: active ? `0 0 0 3px ${wfColor}44` : "0 1px 4px #0003",
        position:"relative", minWidth:220, maxWidth:260
      }}
    >
      <div style={{
        width:10, height:10, borderRadius:"50%",
        background:sc.dot, position:"absolute", top:12, right:12
      }}/>

      <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:6 }}>
        <div style={{
          padding:"2px 8px", borderRadius:20,
          background:wfColor+"22", color:wfColor,
          fontSize:8, fontWeight:700, letterSpacing:1
        }}>
          {step.tab}
        </div>
        {step.vba && (
          <div style={{
            padding:"2px 6px", borderRadius:10,
            background:"#F39C1222", color:"#F39C12",
            fontSize:7, fontWeight:700
          }}>
            VBA: {step.vba}
          </div>
        )}
      </div>

      <div style={{ fontSize:11, fontWeight:700, color:sc.text, marginBottom:4, lineHeight:1.3 }}>
        {step.action}
      </div>

      {status !== "idle" && (
        <div style={{
          fontSize:8, fontWeight:700, color:sc.dot,
          textTransform:"uppercase", letterSpacing:1
        }}>
          {status === "running" ? "ACTIVE" :
           status === "pass"    ? "PASSED" :
           status === "fail"    ? "FAILED" :
           status === "reverify"? "RE-VERIFY" : "BLOCKED"}
        </div>
      )}

      {active && (
        <div style={{ marginTop:10, borderTop:"1px solid #2C3E50", paddingTop:10 }}>
          {step.inputs.map(inp => (
            <div key={inp.key} style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#8899AA", marginBottom:3 }}>
                {inp.label}
              </div>
              {inp.type === "select" ? (
                <select
                  value={inputs[inp.key] || ""}
                  onChange={e => onInputChange(inp.key, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{
                    width:"100%", padding:"5px 8px", borderRadius:6,
                    border:`1px solid ${wfColor}`, fontSize:11,
                    background:"#0D1B2A", color:"#E0E0E0"
                  }}
                >
                  <option value="">-- select --</option>
                  {inp.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={inp.type}
                  value={inputs[inp.key] || ""}
                  placeholder={inp.placeholder}
                  onChange={e => onInputChange(inp.key, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{
                    width:"100%", padding:"5px 8px", borderRadius:6,
                    border:`1px solid ${wfColor}`, fontSize:11,
                    background:"#0D1B2A", color:"#E0E0E0", boxSizing:"border-box"
                  }}
                />
              )}
            </div>
          ))}

          <div style={{ marginTop:8 }}>
            <div style={{ fontSize:9, fontWeight:700, color:"#8899AA", marginBottom:4 }}>
              VERIFY THESE CHECKS:
            </div>
            {step.checks.map((chk, i) => (
              <div key={i} style={{
                display:"flex", alignItems:"flex-start", gap:6, marginBottom:4,
                cursor:"pointer"
              }} onClick={e => { e.stopPropagation(); onMarkFailed(i); }}>
                <div style={{
                  width:14, height:14, borderRadius:3, flexShrink:0, marginTop:1,
                  border:`1.5px solid ${failedChecks.includes(i) ? "#E74C3C" : "#27AE60"}`,
                  background: failedChecks.includes(i) ? "#2E0A0A" : "#0A2E1A",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:8, color: failedChecks.includes(i) ? "#E74C3C" : "#27AE60"
                }}>
                  {failedChecks.includes(i) ? "X" : "V"}
                </div>
                <span style={{
                  fontSize:9, color: failedChecks.includes(i) ? "#E74C3C" : "#AABBCC",
                  textDecoration: failedChecks.includes(i) ? "line-through" : "none",
                  lineHeight:1.4
                }}>{chk}</span>
              </div>
            ))}
          </div>

          {(step.affects || []).length > 0 && (
            <div style={{ marginTop:8, padding:"6px 8px", background:"#2E1A0A", borderRadius:6, border:"1px solid #F39C1244" }}>
              <div style={{ fontSize:8, fontWeight:700, color:"#F39C12", marginBottom:3 }}>
                IMPACTS:
              </div>
              {step.affects.map((a,i) => (
                <div key={i} style={{ fontSize:8, color:"#FFD699" }}>{"-> " + a}</div>
              ))}
            </div>
          )}

          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <button
              onClick={e => { e.stopPropagation(); onMarkPass(); }}
              style={{
                flex:1, padding:"7px", borderRadius:8, border:"none",
                background:"#27AE60", color:"white", fontWeight:700,
                fontSize:11, cursor:"pointer"
              }}
            >PASS</button>
            <button
              onClick={e => { e.stopPropagation(); onMarkFailed(-1); }}
              style={{
                flex:1, padding:"7px", borderRadius:8, border:"none",
                background:"#E74C3C", color:"white", fontWeight:700,
                fontSize:11, cursor:"pointer"
              }}
            >FAIL STEP</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Arrow Component ─────────────────────────────────────────────────────────
function Arrow({ color, broken }) {
  return (
    <div style={{ display:"flex", alignItems:"center", flexShrink:0, margin:"0 2px" }}>
      <div style={{
        width:30, height:2,
        background: broken ? "#E74C3C" : color,
        position:"relative"
      }}>
        {broken && (
          <div style={{
            position:"absolute", top:-8, left:"50%", transform:"translateX(-50%)",
            fontSize:10, color:"#E74C3C", fontWeight:700
          }}>X</div>
        )}
      </div>
      <div style={{
        width:0, height:0,
        borderTop:"5px solid transparent",
        borderBottom:"5px solid transparent",
        borderLeft:`8px solid ${broken ? "#E74C3C" : color}`
      }}/>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function GlassTechTestSuiteAuto() {
  const [activeWF, setActiveWF] = useState(null);
  const [testState, setTestState] = useState({});
  const [activeStep, setActiveStep] = useState({});
  const [log, setLog] = useState([]);
  const [showLog, setShowLog] = useState(false);
  const [filterDept, setFilterDept] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const addLog = useCallback((msg, type="info") => {
    setLog(prev => [{time: new Date().toLocaleTimeString(), msg, type}, ...prev].slice(0,100));
  }, []);

  const getStepState = useCallback((wfId, stepId) =>
    testState[wfId]?.[stepId] || { status: STATUS.idle, inputs: {}, failedChecks: [] }, [testState]);

  const getWFStatus = useCallback((wfId) => {
    const wf = WORKFLOWS.find(w => w.id === wfId);
    if (!wf) return STATUS.idle;
    const states = wf.steps.map(s => getStepState(wfId, s.id).status);
    if (states.every(s => s === STATUS.idle)) return STATUS.idle;
    if (states.some(s => s === STATUS.fail)) return STATUS.fail;
    if (states.some(s => s === STATUS.blocked)) return STATUS.blocked;
    if (states.some(s => s === STATUS.reverify)) return STATUS.reverify;
    if (states.some(s => s === STATUS.running)) return STATUS.running;
    if (states.every(s => s === STATUS.pass)) return STATUS.pass;
    return STATUS.running;
  }, [getStepState]);

  // Filtered workflows
  const filteredWFs = useMemo(() => {
    return WORKFLOWS.filter(wf => {
      if (filterDept !== "ALL" && wf.dept !== filterDept) return false;
      if (searchTerm && !wf.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !wf.id.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [filterDept, searchTerm]);

  // Stats
  const stats = useMemo(() => {
    const s = { total: WORKFLOWS.length, pass:0, fail:0, running:0, idle:0, blocked:0, reverify:0, totalSteps:0, totalChecks:0 };
    WORKFLOWS.forEach(wf => {
      s.totalSteps += wf.steps.length;
      wf.steps.forEach(step => { s.totalChecks += step.checks.length; });
      const status = getWFStatus(wf.id);
      if (status === STATUS.pass) s.pass++;
      else if (status === STATUS.fail) s.fail++;
      else if (status === STATUS.running) s.running++;
      else if (status === STATUS.blocked) s.blocked++;
      else if (status === STATUS.reverify) s.reverify++;
      else s.idle++;
    });
    return s;
  }, [getWFStatus]);

  const startWorkflow = useCallback((wfId) => {
    const wf = WORKFLOWS.find(w => w.id === wfId);
    setActiveWF(wfId);
    setActiveStep(prev => ({ ...prev, [wfId]: wf.steps[0].id }));
    setTestState(prev => ({
      ...prev,
      [wfId]: Object.fromEntries(
        wf.steps.map((s, i) => [s.id, { status: i === 0 ? STATUS.running : STATUS.idle, inputs: {}, failedChecks: [] }])
      )
    }));
    addLog(`[START] ${wf.id}: ${wf.name}`, "info");
  }, [addLog]);

  const resetWorkflow = useCallback((wfId) => {
    const wf = WORKFLOWS.find(w => w.id === wfId);
    setTestState(prev => { const n = { ...prev }; delete n[wfId]; return n; });
    setActiveStep(prev => { const n = {...prev}; delete n[wfId]; return n; });
    addLog(`[RESET] ${wf.id}: ${wf.name}`, "info");
  }, [addLog]);

  const resetAll = useCallback(() => {
    setTestState({});
    setActiveStep({});
    setActiveWF(null);
    addLog("[RESET ALL] Full suite reset", "info");
  }, [addLog]);

  const setStepStatus = useCallback((wfId, stepId, status) => {
    setTestState(prev => ({
      ...prev,
      [wfId]: {
        ...prev[wfId],
        [stepId]: { ...(prev[wfId]?.[stepId] || { inputs: {}, failedChecks: [] }), status }
      }
    }));
  }, []);

  const passStep = useCallback((wfId, stepId) => {
    const wf = WORKFLOWS.find(w => w.id === wfId);
    const stepIdx = wf.steps.findIndex(s => s.id === stepId);
    const st = getStepState(wfId, stepId);

    if (st.failedChecks.length > 0) {
      addLog(`[WARN] Step has ${st.failedChecks.length} failed checks — fix first`, "warn");
      return;
    }

    setStepStatus(wfId, stepId, STATUS.pass);
    addLog(`[PASS] ${wf.id}/${wf.steps[stepIdx].tab}: ${wf.steps[stepIdx].action}`, "pass");

    // Check cross-workflow regression
    const affects = wf.steps[stepIdx].affects || [];
    affects.forEach(affectStr => {
      const sheetName = affectStr.split(" ")[0];
      const deps = findCrossWorkflowDeps(wfId, sheetName);
      deps.forEach(dep => {
        const depStatus = getWFStatus(dep.wfId);
        if (depStatus === STATUS.pass) {
          addLog(`[REGRESSION] ${dep.wfName} may need re-verify (shares ${sheetName})`, "warn");
          // Mark dependent WF steps that use this sheet as reverify
          const depWf = WORKFLOWS.find(w => w.id === dep.wfId);
          depWf.steps.forEach(s => {
            if (s.tab === sheetName || (s.affects || []).some(a => a.startsWith(sheetName))) {
              setStepStatus(dep.wfId, s.id, STATUS.reverify);
            }
          });
        }
      });
    });

    // Advance to next step
    const nextStep = wf.steps[stepIdx + 1];
    if (nextStep) {
      setActiveStep(prev => ({ ...prev, [wfId]: nextStep.id }));
      setStepStatus(wfId, nextStep.id, STATUS.running);
    } else {
      addLog(`[COMPLETE] ${wf.id}: ${wf.name} — All ${wf.steps.length} steps passed!`, "pass");
    }
  }, [getStepState, getWFStatus, addLog, setStepStatus]);

  const failStep = useCallback((wfId, stepId, checkIdx) => {
    const wf = WORKFLOWS.find(w => w.id === wfId);
    const step = wf.steps.find(s => s.id === stepId);

    if (checkIdx === -1) {
      setStepStatus(wfId, stepId, STATUS.fail);
      const stepIdx = wf.steps.findIndex(s => s.id === stepId);
      wf.steps.slice(stepIdx + 1).forEach(s => setStepStatus(wfId, s.id, STATUS.blocked));
      addLog(`[FAIL] ${wf.id}/${step.tab}: ${step.action}`, "fail");

      // Mark dependent workflows as at-risk
      const affects = step.affects || [];
      affects.forEach(affectStr => {
        const sheetName = affectStr.split(" ")[0];
        const deps = findCrossWorkflowDeps(wfId, sheetName);
        deps.forEach(dep => {
          addLog(`[AT-RISK] ${dep.wfName} depends on ${sheetName} which failed in ${wf.name}`, "warn");
        });
      });
    } else {
      setTestState(prev => {
        const cur = getStepState(wfId, stepId);
        const newFailed = cur.failedChecks.includes(checkIdx)
          ? cur.failedChecks.filter(i => i !== checkIdx)
          : [...cur.failedChecks, checkIdx];
        return {
          ...prev,
          [wfId]: { ...prev[wfId], [stepId]: { ...cur, failedChecks: newFailed }}
        };
      });
    }
  }, [addLog, setStepStatus, getStepState]);

  const updateInput = useCallback((wfId, stepId, key, val) => {
    setTestState(prev => ({
      ...prev,
      [wfId]: {
        ...prev[wfId],
        [stepId]: { ...getStepState(wfId, stepId), inputs: { ...getStepState(wfId, stepId).inputs, [key]: val }}
      }
    }));
  }, [getStepState]);

  // ── Dependency count per sheet ────────────────────────────────────────────
  const depCount = useMemo(() => {
    let count = 0;
    Object.values(SHEET_DEPENDENCY_GRAPH).forEach(set => {
      if (set.size > 1) count += set.size - 1;
    });
    return count;
  }, []);

  const wfStatusColors = {
    idle:     { bg:"#1B2B3A", border:"#3C4E5E", badge:"#667788", label:"IDLE" },
    running:  { bg:"#0D1B2A", border:"#2980B9", badge:"#2980B9", label:"RUNNING" },
    pass:     { bg:"#0A2E1A", border:"#27AE60", badge:"#27AE60", label:"PASSED" },
    fail:     { bg:"#2E0A0A", border:"#E74C3C", badge:"#E74C3C", label:"FAILED" },
    blocked:  { bg:"#2E1A0A", border:"#F39C12", badge:"#F39C12", label:"BLOCKED" },
    reverify: { bg:"#2E2A0A", border:"#F1C40F", badge:"#F1C40F", label:"RE-VERIFY" },
  };

  const logColors = { info:"#8899AA", pass:"#27AE60", fail:"#E74C3C", warn:"#F39C12" };

  return (
    <div style={{ fontFamily:"'Segoe UI', Calibri, sans-serif", background:"#0D1B2A", minHeight:"100vh", padding:0, color:"#E0E0E0" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background:"#1B2B3A", padding:"12px 24px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        borderBottom:"2px solid #2C3E50"
      }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"white" }}>
            GlassTech ERP — Auto-Discovered UAT Test Suite
          </div>
          <div style={{ fontSize:10, color:"#667788", marginTop:2 }}>
            {stats.total} Workflows | {stats.totalSteps} Steps | {stats.totalChecks} Checks | {depCount} Cross-Sheet Dependencies
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {[
            {s:"pass",c:"#27AE60",l:"Passed"},
            {s:"fail",c:"#E74C3C",l:"Failed"},
            {s:"running",c:"#2980B9",l:"Running"},
            {s:"reverify",c:"#F1C40F",l:"Re-Verify"},
          ].map(({s,c,l}) => {
            const count = stats[s];
            return count > 0 ? (
              <div key={s} style={{
                padding:"3px 10px", borderRadius:16,
                background:c+"22", color:c,
                fontSize:10, fontWeight:700, border:`1px solid ${c}`
              }}>
                {count} {l}
              </div>
            ) : null;
          })}
          <button
            onClick={resetAll}
            style={{
              padding:"5px 12px", borderRadius:8, border:"1px solid #E74C3C44",
              background:"#2E0A0A", color:"#E74C3C", fontSize:10,
              cursor:"pointer", fontWeight:700
            }}
          >RESET ALL</button>
          <button
            onClick={() => setShowLog(l => !l)}
            style={{
              padding:"5px 12px", borderRadius:8, border:"1px solid #2C3E50",
              background:"#2C3E50", color:"white", fontSize:10,
              cursor:"pointer", fontWeight:700
            }}
          >
            {showLog ? "Hide Log" : "Activity Log"} ({log.length})
          </button>
        </div>
      </div>

      {/* ── Module legend ──────────────────────────────────────────────────── */}
      <div style={{
        background:"#1B2B3A", padding:"6px 24px",
        borderBottom:"1px solid #2C3E50",
        display:"flex", gap:12, alignItems:"center", flexWrap:"wrap"
      }}>
        <div style={{ fontSize:9, color:"#667788", fontWeight:700, letterSpacing:1 }}>MODULES:</div>
        {Object.entries(DEPT_COLORS).map(([dept, colors]) => (
          <div key={dept}
            onClick={() => setFilterDept(prev => prev === dept ? "ALL" : dept)}
            style={{
              padding:"2px 10px", borderRadius:12, cursor:"pointer",
              background: filterDept === dept ? colors.primary : colors.primary + "22",
              color: filterDept === dept ? "white" : colors.primary,
              fontSize:9, fontWeight:700, border:`1px solid ${colors.primary}`,
              transition:"all 0.15s"
            }}>
            {dept}
          </div>
        ))}
        {filterDept !== "ALL" && (
          <div onClick={() => setFilterDept("ALL")} style={{
            padding:"2px 10px", borderRadius:12, cursor:"pointer",
            background:"#E74C3C22", color:"#E74C3C", fontSize:9, fontWeight:700, border:"1px solid #E74C3C44"
          }}>CLEAR FILTER</div>
        )}
        <input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search workflows..."
          style={{
            marginLeft:"auto", padding:"4px 10px", borderRadius:8,
            border:"1px solid #2C3E50", background:"#0D1B2A", color:"#E0E0E0",
            fontSize:10, width:180
          }}
        />
      </div>

      <div style={{ display:"flex", height:"calc(100vh - 92px)" }}>

        {/* ── Left Sidebar: Workflow List ─────────────────────────────────── */}
        <div style={{
          width:280, background:"#1B2B3A", padding:12,
          overflowY:"auto", borderRight:"1px solid #2C3E50", flexShrink:0
        }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#667788", marginBottom:10, letterSpacing:1 }}>
            WORKFLOWS ({filteredWFs.length}/{WORKFLOWS.length})
          </div>
          {filteredWFs.map(wf => {
            const wfStatus = getWFStatus(wf.id);
            const sc = wfStatusColors[wfStatus];
            const dc = DEPT_COLORS[wf.dept] || DEPT_COLORS.STORE;
            const isActive = activeWF === wf.id;
            const passedSteps = wf.steps.filter(s => getStepState(wf.id, s.id).status === STATUS.pass).length;

            return (
              <div
                key={wf.id}
                onClick={() => setActiveWF(wf.id)}
                style={{
                  padding:"10px 12px", borderRadius:10, marginBottom:6,
                  background: isActive ? dc.primary + "18" : "#2C3E50",
                  border:`1.5px solid ${isActive ? dc.primary : "#3C4E5E"}`,
                  cursor:"pointer", transition:"all 0.15s"
                }}
              >
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", gap:4, alignItems:"center", marginBottom:3, flexWrap:"wrap" }}>
                      <span style={{
                        fontSize:7, fontWeight:700, color:dc.primary, letterSpacing:1,
                        padding:"1px 5px", borderRadius:6, background:dc.primary+"22"
                      }}>{wf.dept}</span>
                      <span style={{ fontSize:8, color:"#667788" }}>{wf.id}</span>
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color:"#E0E0E0", lineHeight:1.3 }}>
                      {wf.name}
                    </div>
                  </div>
                  <div style={{
                    fontSize:7, fontWeight:700, color:sc.badge,
                    padding:"2px 6px", borderRadius:10,
                    background:sc.badge+"22", flexShrink:0, marginLeft:6
                  }}>
                    {sc.label}
                  </div>
                </div>

                {wfStatus !== STATUS.idle && (
                  <div style={{ marginTop:6 }}>
                    <div style={{ background:"#0D1B2A", borderRadius:3, height:3, overflow:"hidden" }}>
                      <div style={{
                        width: `${(passedSteps / wf.steps.length) * 100}%`,
                        height:"100%", background:dc.primary, borderRadius:3, transition:"width 0.3s"
                      }}/>
                    </div>
                    <div style={{ fontSize:8, color:"#667788", marginTop:2 }}>
                      {passedSteps}/{wf.steps.length} steps
                    </div>
                  </div>
                )}

                <div style={{ display:"flex", gap:6, marginTop:8 }}>
                  {wfStatus === STATUS.idle ? (
                    <button
                      onClick={e => { e.stopPropagation(); startWorkflow(wf.id); }}
                      style={{
                        flex:1, padding:"5px", borderRadius:6, border:"none",
                        background:dc.primary, color:"white", fontSize:10,
                        fontWeight:700, cursor:"pointer"
                      }}
                    >START</button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); resetWorkflow(wf.id); }}
                      style={{
                        flex:1, padding:"5px", borderRadius:6, border:"none",
                        background:"#E74C3C", color:"white", fontSize:10,
                        fontWeight:700, cursor:"pointer"
                      }}
                    >RESET</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Center: Flow Diagram ───────────────────────────────────────── */}
        <div style={{ flex:1, overflowY:"auto", overflowX:"auto", padding:20 }}>
          {!activeWF ? (
            <div style={{
              height:"100%", display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center", color:"#667788"
            }}>
              <div style={{ fontSize:48, marginBottom:16, opacity:0.3 }}>||</div>
              <div style={{ fontSize:16, fontWeight:700, marginBottom:8, color:"#8899AA" }}>
                Select a workflow to begin testing
              </div>
              <div style={{ fontSize:12, textAlign:"center", maxWidth:500, lineHeight:1.6 }}>
                {stats.total} auto-discovered workflows across 5 modules.
                Click any workflow on the left to see its visual flow diagram,
                fill inputs step by step, mark Pass/Fail, and track cross-sheet regression.
              </div>
              <div style={{ marginTop:20, display:"flex", gap:12, flexWrap:"wrap", justifyContent:"center" }}>
                {Object.entries(DEPT_COLORS).map(([dept, colors]) => {
                  const count = WORKFLOWS.filter(w => w.dept === dept).length;
                  return (
                    <div key={dept} style={{
                      padding:"8px 16px", borderRadius:10,
                      background:colors.primary+"18", border:`1px solid ${colors.primary}44`,
                      textAlign:"center"
                    }}>
                      <div style={{ fontSize:20, fontWeight:700, color:colors.primary }}>{count}</div>
                      <div style={{ fontSize:9, color:colors.primary, fontWeight:700 }}>{dept}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (() => {
            const wf = WORKFLOWS.find(w => w.id === activeWF);
            if (!wf) return null;
            const wfStatus = getWFStatus(activeWF);
            const dc = DEPT_COLORS[wf.dept] || DEPT_COLORS.STORE;

            return (
              <div>
                {/* WF Header */}
                <div style={{
                  background: dc.primary + "18", border:`2px solid ${dc.primary}44`,
                  borderRadius:14, padding:"14px 20px", marginBottom:20,
                  display:"flex", alignItems:"center", justifyContent:"space-between"
                }}>
                  <div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
                      <span style={{
                        fontSize:9, fontWeight:700, color:dc.primary, letterSpacing:1,
                        padding:"2px 8px", borderRadius:8, background:dc.primary+"33"
                      }}>{wf.dept}</span>
                      <span style={{ fontSize:10, color:"#667788" }}>{wf.id}</span>
                      <span style={{ fontSize:10, color:"#667788" }}>{wf.steps.length} steps</span>
                    </div>
                    <div style={{ fontSize:16, fontWeight:700, color:"#E0E0E0" }}>
                      {wf.name}
                    </div>
                    <div style={{ fontSize:11, color:"#8899AA", marginTop:2 }}>
                      {wf.desc}
                    </div>
                  </div>
                  <div style={{
                    padding:"8px 16px", borderRadius:20,
                    background: wfStatusColors[wfStatus].badge + "22",
                    color: wfStatusColors[wfStatus].badge,
                    fontSize:12, fontWeight:700,
                    border:`1px solid ${wfStatusColors[wfStatus].badge}44`
                  }}>
                    {wfStatusColors[wfStatus].label}
                  </div>
                </div>

                {/* Flow diagram */}
                <div style={{ display:"flex", alignItems:"flex-start", gap:0, flexWrap:"nowrap", overflowX:"auto", paddingBottom:16 }}>
                  {wf.steps.map((step, idx) => {
                    const st = getStepState(activeWF, step.id);
                    const isActive = activeStep[activeWF] === step.id;
                    const isBroken = st.status === STATUS.fail;

                    return (
                      <div key={step.id} style={{ display:"flex", alignItems:"flex-start", gap:0 }}>
                        <div>
                          <div style={{
                            textAlign:"center", marginBottom:6,
                            fontSize:9, fontWeight:700, color:"#667788"
                          }}>
                            STEP {idx + 1}
                          </div>
                          <StepBox
                            step={step}
                            stepIdx={idx}
                            wfColor={dc.primary}
                            status={st.status}
                            active={isActive}
                            onClick={() => {
                              if (st.status !== STATUS.blocked) {
                                setActiveStep(prev => ({ ...prev, [activeWF]: step.id }));
                                if (st.status === STATUS.idle) {
                                  setStepStatus(activeWF, step.id, STATUS.running);
                                }
                              }
                            }}
                            inputs={st.inputs}
                            onInputChange={(key, val) => updateInput(activeWF, step.id, key, val)}
                            failedChecks={st.failedChecks}
                            onMarkFailed={(ci) => failStep(activeWF, step.id, ci)}
                            onMarkPass={() => passStep(activeWF, step.id)}
                          />
                        </div>
                        {idx < wf.steps.length - 1 && (
                          <div style={{ paddingTop:50 }}>
                            <Arrow color={dc.primary} broken={isBroken} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Completion message */}
                {wfStatus === STATUS.pass && (
                  <div style={{
                    marginTop:16, padding:"16px 24px", borderRadius:12,
                    background:"#0A2E1A", border:"2px solid #27AE6044",
                    display:"flex", alignItems:"center", gap:12
                  }}>
                    <div style={{ fontSize:24 }}>||</div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:"#27AE60" }}>
                        Workflow Complete — All {wf.steps.length} Steps Passed!
                      </div>
                      <div style={{ fontSize:11, color:"#8899AA", marginTop:2 }}>
                        {wf.name} — Click RESET to run again with different inputs.
                      </div>
                    </div>
                  </div>
                )}

                {/* Cross-dependency info */}
                <div style={{
                  marginTop:16, padding:"12px 16px", borderRadius:10,
                  background:"#1B2B3A", border:"1px solid #2C3E50"
                }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#667788", marginBottom:8, letterSpacing:1 }}>
                    CROSS-WORKFLOW DEPENDENCIES
                  </div>
                  {wf.steps.map(step => {
                    const sheets = [step.tab, ...(step.affects || []).map(a => a.split(" ")[0])];
                    const allDeps = [];
                    sheets.forEach(sheet => {
                      const deps = findCrossWorkflowDeps(wf.id, sheet);
                      deps.forEach(d => {
                        if (!allDeps.find(x => x.wfId === d.wfId)) allDeps.push({...d, sheet});
                      });
                    });
                    if (allDeps.length === 0) return null;
                    return (
                      <div key={step.id} style={{ marginBottom:6 }}>
                        <div style={{ fontSize:9, color:"#8899AA" }}>
                          Step {wf.steps.indexOf(step)+1} ({step.tab}):
                        </div>
                        {allDeps.map((d, i) => {
                          const depStatus = getWFStatus(d.wfId);
                          const depColor = wfStatusColors[depStatus]?.badge || "#667788";
                          return (
                            <div key={i} style={{ fontSize:9, color:depColor, marginLeft:12 }}>
                              {"-> "}{d.wfName} ({d.wfId}) via {d.sheet}
                              {depStatus === STATUS.pass && " [PASSED — may need re-verify]"}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }).filter(Boolean)}
                  {wf.steps.every(step => {
                    const sheets = [step.tab, ...(step.affects || []).map(a => a.split(" ")[0])];
                    return sheets.every(sheet => findCrossWorkflowDeps(wf.id, sheet).length === 0);
                  }) && (
                    <div style={{ fontSize:9, color:"#667788", fontStyle:"italic" }}>
                      No cross-workflow dependencies detected for this workflow.
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Right: Activity Log ────────────────────────────────────────── */}
        {showLog && (
          <div style={{
            width:300, background:"#1B2B3A", padding:12,
            overflowY:"auto", borderLeft:"1px solid #2C3E50", flexShrink:0
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#667788", letterSpacing:1 }}>
                ACTIVITY LOG ({log.length})
              </div>
              <button onClick={() => setLog([])} style={{
                padding:"3px 8px", borderRadius:6, border:"1px solid #2C3E50",
                background:"#0D1B2A", color:"#667788", fontSize:9, cursor:"pointer"
              }}>Clear</button>
            </div>
            {log.map((entry, i) => (
              <div key={i} style={{
                padding:"6px 8px", marginBottom:4, borderRadius:6,
                background:"#0D1B2A", borderLeft:`3px solid ${logColors[entry.type] || "#667788"}`
              }}>
                <div style={{ fontSize:8, color:"#667788" }}>{entry.time}</div>
                <div style={{ fontSize:9, color:logColors[entry.type] || "#8899AA", lineHeight:1.4 }}>
                  {entry.msg}
                </div>
              </div>
            ))}
            {log.length === 0 && (
              <div style={{ fontSize:10, color:"#667788", textAlign:"center", marginTop:20, fontStyle:"italic" }}>
                No activity yet. Start a workflow to see events here.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
