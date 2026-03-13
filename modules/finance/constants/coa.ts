// ============================================================
// GLASSTECH GROUP — IFRS for SMEs — 5-Level Chart of Accounts
// Prepared with ICAP/IFRS for SMEs standards
// Control accounts at Level 3, Posting accounts at Level 5
// ============================================================

export interface COAAccount {
  code: string;
  name: string;
  level: number;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  isControl?: boolean;      // Control account — no direct posting
  isPosting?: boolean;      // Leaf — direct posting allowed
  normalBalance?: 'Dr' | 'Cr';
  children?: COAAccount[];
}

// ─── SHARED HELPER ───────────────────────────────────────────
const leaf = (code: string, name: string, type: COAAccount['type'], nb: 'Dr'|'Cr'): COAAccount =>
  ({ code, name, level: 5, type, isPosting: true, normalBalance: nb });

// ============================================================
// GTK / GTI  — Aluminium & Glass Contracts
// ============================================================
export const GTK_COA: COAAccount[] = [
  // ══════════════════════════════════════════════════════════
  // 1  ASSETS
  // ══════════════════════════════════════════════════════════
  { code:'1', name:'Assets', level:1, type:'Asset', normalBalance:'Dr', children:[

    { code:'11', name:'Current Assets', level:2, type:'Asset', children:[

      { code:'111', name:'Cash & Bank', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1111', name:'Cash & Cash Equivalents', level:4, type:'Asset', children:[
          leaf('11111','Petty Cash — GTK','Asset','Dr'),
          leaf('11112','Cash in Hand — Main','Asset','Dr'),
        ]},
        { code:'1112', name:'Bank Accounts', level:4, type:'Asset', children:[
          leaf('11121','Bank — MCB Current','Asset','Dr'),
          leaf('11122','Bank — HBL Current','Asset','Dr'),
          leaf('11123','Bank — UBL Savings','Asset','Dr'),
        ]},
      ]},

      { code:'112', name:'Trade Receivables', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1121', name:'Accounts Receivable — Trade', level:4, type:'Asset', children:[
          leaf('11211','Receivable — Residential Clients','Asset','Dr'),
          leaf('11212','Receivable — Commercial Clients','Asset','Dr'),
          leaf('11213','Receivable — Government Contracts','Asset','Dr'),
        ]},
        { code:'1122', name:'Advances & Retentions', level:4, type:'Asset', children:[
          leaf('11221','Advance Received — Applied','Asset','Dr'),
          leaf('11222','Retention Receivable','Asset','Dr'),
        ]},
        { code:'1123', name:'Doubtful & Impairment', level:4, type:'Asset', children:[
          leaf('11231','Allowance for Doubtful Debts','Asset','Cr'),
          leaf('11232','Bad Debts Written Off','Asset','Dr'),
        ]},
      ]},

      { code:'113', name:'Intercompany Receivables', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1131', name:'Due from Group Companies', level:4, type:'Asset', children:[
          leaf('11311','Due from Glassco','Asset','Dr'),
          leaf('11312','Due from Nippon','Asset','Dr'),
          leaf('11313','Due from GTI','Asset','Dr'),
          leaf('11314','Due from Factory (Shared Cost)','Asset','Dr'),
        ]},
      ]},

      { code:'114', name:'Advances & Prepayments', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1141', name:'Vendor Advances', level:4, type:'Asset', children:[
          leaf('11411','Advance to Japan Metal (Profiles)','Asset','Dr'),
          leaf('11412','Advance to Glass Vendors','Asset','Dr'),
          leaf('11413','Advance to Other Vendors','Asset','Dr'),
        ]},
        { code:'1142', name:'Employee Advances & Loans', level:4, type:'Asset', children:[
          leaf('11421','Employee Advances','Asset','Dr'),
          leaf('11422','Employee Loans — Recoverable','Asset','Dr'),
          leaf('11423','Employee Loans — Doubtful','Asset','Dr'),
        ]},
        { code:'1143', name:'Prepaid Expenses', level:4, type:'Asset', children:[
          leaf('11431','Prepaid Insurance','Asset','Dr'),
          leaf('11432','Prepaid Rent','Asset','Dr'),
          leaf('11433','Advance Tax Paid (WHT)','Asset','Dr'),
        ]},
      ]},

      { code:'115', name:'Inventory', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1151', name:'Raw Materials', level:4, type:'Asset', children:[
          leaf('11511','Aluminium Profiles — Stock','Asset','Dr'),
          leaf('11512','Glass Sheets — Stock','Asset','Dr'),
          leaf('11513','Hardware & Accessories','Asset','Dr'),
        ]},
        { code:'1152', name:'Work in Progress', level:4, type:'Asset', children:[
          leaf('11521','WIP — Aluminium Fabrication','Asset','Dr'),
          leaf('11522','WIP — Project Contracts','Asset','Dr'),
        ]},
        { code:'1153', name:'Consumables Store', level:4, type:'Asset', children:[
          leaf('11531','Consumables — Fabrication','Asset','Dr'),
          leaf('11532','Consumables — Office','Asset','Dr'),
        ]},
      ]},

      { code:'116', name:'Other Current Assets', level:3, type:'Asset', normalBalance:'Dr', children:[
        { code:'1161', name:'Tax Refundable', level:4, type:'Asset', children:[
          leaf('11611','Sales Tax Refundable','Asset','Dr'),
          leaf('11612','Income Tax Refundable','Asset','Dr'),
        ]},
        { code:'1162', name:'Accrued Income', level:4, type:'Asset', children:[
          leaf('11621','Accrued Revenue — Contracts','Asset','Dr'),
        ]},
      ]},
    ]},

    { code:'12', name:'Non-Current Assets', level:2, type:'Asset', children:[

      { code:'121', name:'Property, Plant & Equipment', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1211', name:'PPE — Cost', level:4, type:'Asset', children:[
          leaf('12111','Office Equipment — Cost','Asset','Dr'),
          leaf('12112','Computers & Peripherals — Cost','Asset','Dr'),
          leaf('12113','Fabrication Tools & Equipment — Cost','Asset','Dr'),
          leaf('12114','Furniture & Fixtures — Cost','Asset','Dr'),
          leaf('12115','Vehicles — Cost (Shared)','Asset','Dr'),
        ]},
        { code:'1212', name:'PPE — Accumulated Depreciation', level:4, type:'Asset', children:[
          leaf('12121','Accum. Dep — Office Equipment','Asset','Cr'),
          leaf('12122','Accum. Dep — Computers','Asset','Cr'),
          leaf('12123','Accum. Dep — Tools & Equipment','Asset','Cr'),
          leaf('12124','Accum. Dep — Furniture','Asset','Cr'),
          leaf('12125','Accum. Dep — Vehicles','Asset','Cr'),
        ]},
      ]},

      { code:'122', name:'Intangible Assets', level:3, type:'Asset', normalBalance:'Dr', children:[
        { code:'1221', name:'Intangibles', level:4, type:'Asset', children:[
          leaf('12211','Software Licenses','Asset','Dr'),
          leaf('12212','ERP System','Asset','Dr'),
        ]},
      ]},

      { code:'123', name:'Long-Term Deposits', level:3, type:'Asset', normalBalance:'Dr', children:[
        { code:'1231', name:'Security Deposits', level:4, type:'Asset', children:[
          leaf('12311','Security Deposit — Office','Asset','Dr'),
          leaf('12312','Security Deposit — Utility','Asset','Dr'),
        ]},
      ]},
    ]},
  ]},

  // ══════════════════════════════════════════════════════════
  // 2  LIABILITIES
  // ══════════════════════════════════════════════════════════
  { code:'2', name:'Liabilities', level:1, type:'Liability', normalBalance:'Cr', children:[

    { code:'21', name:'Current Liabilities', level:2, type:'Liability', children:[

      { code:'211', name:'Trade & Other Payables', level:3, type:'Liability', isControl:true, normalBalance:'Cr', children:[
        { code:'2111', name:'Accounts Payable — Trade', level:4, type:'Liability', children:[
          leaf('21111','Payable — Japan Metal (Profiles)','Liability','Cr'),
          leaf('21112','Payable — Glass Suppliers','Liability','Cr'),
          leaf('21113','Payable — Hardware Suppliers','Liability','Cr'),
          leaf('21114','Payable — Other Vendors','Liability','Cr'),
        ]},
        { code:'2112', name:'Accrued Liabilities', level:4, type:'Liability', children:[
          leaf('21121','Accrued Salaries & Wages','Liability','Cr'),
          leaf('21122','Accrued Overtime','Liability','Cr'),
          leaf('21123','Accrued Project Costs','Liability','Cr'),
        ]},
        { code:'2113', name:'Advance from Clients', level:4, type:'Liability', children:[
          leaf('21131','Client Advance — Residential','Liability','Cr'),
          leaf('21132','Client Advance — Commercial','Liability','Cr'),
          leaf('21133','Client Advance — Government','Liability','Cr'),
        ]},
      ]},

      { code:'212', name:'Intercompany Payables', level:3, type:'Liability', isControl:true, normalBalance:'Cr', children:[
        { code:'2121', name:'Due to Group Companies', level:4, type:'Liability', children:[
          leaf('21211','Due to Glassco','Liability','Cr'),
          leaf('21212','Due to Nippon','Liability','Cr'),
          leaf('21213','Due to Factory','Liability','Cr'),
        ]},
      ]},

      { code:'213', name:'Tax Liabilities', level:3, type:'Liability', isControl:true, normalBalance:'Cr', children:[
        { code:'2131', name:'Sales Tax', level:4, type:'Liability', children:[
          leaf('21311','Sales Tax Payable (Output)','Liability','Cr'),
          leaf('21312','Sales Tax — Input (Recoverable)','Asset','Dr'),
          leaf('21313','FBR Challan Payable','Liability','Cr'),
        ]},
        { code:'2132', name:'Income Tax & WHT', level:4, type:'Liability', children:[
          leaf('21321','Withholding Tax Payable — Vendor','Liability','Cr'),
          leaf('21322','Withholding Tax Payable — Salary','Liability','Cr'),
          leaf('21323','Advance Income Tax — Section 147','Liability','Cr'),
        ]},
        { code:'2133', name:'Other Govt Levies', level:4, type:'Liability', children:[
          leaf('21331','EOBI Payable','Liability','Cr'),
          leaf('21332','PESSI / SESSI Payable','Liability','Cr'),
          leaf('21333','Professional Tax Payable','Liability','Cr'),
        ]},
      ]},

      { code:'214', name:'Employee Liabilities', level:3, type:'Liability', isControl:true, normalBalance:'Cr', children:[
        { code:'2141', name:'Payroll Liabilities', level:4, type:'Liability', children:[
          leaf('21411','Salary Payable','Liability','Cr'),
          leaf('21412','Overtime Payable','Liability','Cr'),
          leaf('21413','Employee Deduction Fund','Liability','Cr'),
          leaf('21414','Loan Recovery Payable','Liability','Cr'),
        ]},
      ]},

      { code:'215', name:'Short-Term Borrowings', level:3, type:'Liability', normalBalance:'Cr', children:[
        { code:'2151', name:'Bank Facilities', level:4, type:'Liability', children:[
          leaf('21511','Running Finance — MCB','Liability','Cr'),
          leaf('21512','Letter of Credit Payable','Liability','Cr'),
        ]},
      ]},
    ]},

    { code:'22', name:'Non-Current Liabilities', level:2, type:'Liability', children:[
      { code:'221', name:'Long-Term Obligations', level:3, type:'Liability', normalBalance:'Cr', children:[
        { code:'2211', name:'Gratuity & End of Service', level:4, type:'Liability', children:[
          leaf('22111','Provision for Gratuity','Liability','Cr'),
          leaf('22112','Provision for Leave Encashment','Liability','Cr'),
        ]},
      ]},
    ]},
  ]},

  // ══════════════════════════════════════════════════════════
  // 3  EQUITY
  // ══════════════════════════════════════════════════════════
  { code:'3', name:'Equity', level:1, type:'Equity', normalBalance:'Cr', children:[
    { code:'31', name:'Owners Equity', level:2, type:'Equity', children:[
      { code:'311', name:'Capital Accounts', level:3, type:'Equity', isControl:true, normalBalance:'Cr', children:[
        { code:'3111', name:'Paid-up Capital', level:4, type:'Equity', children:[
          leaf('31111','Capital — GTK','Equity','Cr'),
        ]},
        { code:'3112', name:'Retained Earnings', level:4, type:'Equity', children:[
          leaf('31121','Retained Earnings — Current Year','Equity','Cr'),
          leaf('31122','Retained Earnings — Prior Years','Equity','Cr'),
        ]},
        { code:'3113', name:'Drawings', level:4, type:'Equity', children:[
          leaf('31131','Drawings — Director','Equity','Dr'),
        ]},
      ]},
    ]},
  ]},

  // ══════════════════════════════════════════════════════════
  // 4  REVENUE
  // ══════════════════════════════════════════════════════════
  { code:'4', name:'Revenue', level:1, type:'Revenue', normalBalance:'Cr', children:[

    { code:'41', name:'Contract Revenue', level:2, type:'Revenue', children:[
      { code:'411', name:'Aluminium & Glass Contracts', level:3, type:'Revenue', isControl:true, normalBalance:'Cr', children:[
        { code:'4111', name:'Residential Projects', level:4, type:'Revenue', children:[
          leaf('41111','Revenue — Aluminium Windows (Residential)','Revenue','Cr'),
          leaf('41112','Revenue — Aluminium Doors (Residential)','Revenue','Cr'),
          leaf('41113','Revenue — Glass Works (Residential)','Revenue','Cr'),
          leaf('41114','Revenue — Complete Turnkey (Residential)','Revenue','Cr'),
        ]},
        { code:'4112', name:'Commercial Projects', level:4, type:'Revenue', children:[
          leaf('41121','Revenue — Aluminium Façade','Revenue','Cr'),
          leaf('41122','Revenue — Curtain Wall','Revenue','Cr'),
          leaf('41123','Revenue — Commercial Doors & Windows','Revenue','Cr'),
          leaf('41124','Revenue — Complete Turnkey (Commercial)','Revenue','Cr'),
        ]},
        { code:'4113', name:'Government Contracts', level:4, type:'Revenue', children:[
          leaf('41131','Revenue — Govt Projects','Revenue','Cr'),
        ]},
      ]},
    ]},

    { code:'42', name:'Other Income', level:2, type:'Revenue', children:[
      { code:'421', name:'Non-Operating Income', level:3, type:'Revenue', normalBalance:'Cr', children:[
        { code:'4211', name:'Miscellaneous', level:4, type:'Revenue', children:[
          leaf('42111','Transport Charges Recovered','Revenue','Cr'),
          leaf('42112','Scrap Sales','Revenue','Cr'),
          leaf('42113','Interest Income','Revenue','Cr'),
          leaf('42114','Bad Debt Recovery','Revenue','Cr'),
          leaf('42115','Foreign Exchange Gain','Revenue','Cr'),
        ]},
      ]},
    ]},
  ]},

  // ══════════════════════════════════════════════════════════
  // 5  EXPENSES
  // ══════════════════════════════════════════════════════════
  { code:'5', name:'Expenses', level:1, type:'Expense', normalBalance:'Dr', children:[

    { code:'51', name:'Cost of Contracts (COS)', level:2, type:'Expense', children:[

      { code:'511', name:'Direct Material', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5111', name:'Aluminium Materials', level:4, type:'Expense', children:[
          leaf('51111','Aluminium Profiles — Consumed','Expense','Dr'),
          leaf('51112','Aluminium Accessories — Consumed','Expense','Dr'),
          leaf('51113','Hardware — Project Issue','Expense','Dr'),
        ]},
        { code:'5112', name:'Glass Materials', level:4, type:'Expense', children:[
          leaf('51121','Glass — Purchased from Glassco','Expense','Dr'),
          leaf('51122','Glass — External Purchase','Expense','Dr'),
        ]},
        { code:'5113', name:'Consumables — Production', level:4, type:'Expense', children:[
          leaf('51131','Consumables — Fabrication Shop','Expense','Dr'),
          leaf('51132','Sealants, Silicone & Adhesives','Expense','Dr'),
          leaf('51133','Cutting Tools & Blades','Expense','Dr'),
        ]},
      ]},

      { code:'512', name:'Direct Labour', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5121', name:'Wages & Overtime', level:4, type:'Expense', children:[
          leaf('51211','Production Labour — Basic Wages','Expense','Dr'),
          leaf('51212','Production Labour — Overtime','Expense','Dr'),
          leaf('51213','Labour — Project Specific','Expense','Dr'),
        ]},
        { code:'5122', name:'Labour Benefits', level:4, type:'Expense', children:[
          leaf('51221','EOBI — Employer Contribution','Expense','Dr'),
          leaf('51222','PESSI/SESSI — Employer','Expense','Dr'),
          leaf('51223','Gratuity — Provision','Expense','Dr'),
        ]},
      ]},

      { code:'513', name:'Direct Overheads', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5131', name:'Subcontracting', level:4, type:'Expense', children:[
          leaf('51311','Profile Manufacturing (Japan Metal)','Expense','Dr'),
          leaf('51312','Site Installation Labour','Expense','Dr'),
          leaf('51313','Other Subcontract Work','Expense','Dr'),
        ]},
        { code:'5132', name:'Transport — Production', level:4, type:'Expense', children:[
          leaf('51321','Shehzore — Material Transport (GTK Share)','Expense','Dr'),
          leaf('51322','Third Party Logistics','Expense','Dr'),
        ]},
        { code:'5133', name:'Project Site Expenses', level:4, type:'Expense', children:[
          leaf('51331','Site Safety & PPE','Expense','Dr'),
          leaf('51332','Site Utilities','Expense','Dr'),
          leaf('51333','Project Supervision','Expense','Dr'),
        ]},
      ]},

      { code:'514', name:'Machine & Tool Depreciation', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5141', name:'Production Asset Depreciation', level:4, type:'Expense', children:[
          leaf('51411','Depreciation — Fabrication Equipment','Expense','Dr'),
          leaf('51412','Depreciation — Cutting Machines','Expense','Dr'),
          leaf('51413','Depreciation — Tools','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'52', name:'Gross Profit Adjustments', level:2, type:'Expense', children:[
      { code:'521', name:'Sales Returns & Discounts', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5211', name:'Revenue Deductions', level:4, type:'Expense', children:[
          leaf('52111','Sales Discount Allowed','Expense','Dr'),
          leaf('52112','Contract Variation — Debit','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'53', name:'Operating Expenses', level:2, type:'Expense', children:[

      { code:'531', name:'Salaries & HR', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5311', name:'Staff Costs', level:4, type:'Expense', children:[
          leaf('53111','Salaries — Admin & Management','Expense','Dr'),
          leaf('53112','Salaries — Sales & BD','Expense','Dr'),
          leaf('53113','Salaries — Finance & Accounts','Expense','Dr'),
          leaf('53114','Overtime — Office Staff','Expense','Dr'),
          leaf('53115','Gratuity Provision — Staff','Expense','Dr'),
        ]},
        { code:'5312', name:'Staff Benefits & Welfare', level:4, type:'Expense', children:[
          leaf('53121','Medical Allowance','Expense','Dr'),
          leaf('53122','Conveyance Allowance','Expense','Dr'),
          leaf('53123','Staff Tea & Refreshment','Expense','Dr'),
        ]},
      ]},

      { code:'532', name:'Rent & Occupancy', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5321', name:'Premises Cost', level:4, type:'Expense', children:[
          leaf('53211','Office Rent','Expense','Dr'),
          leaf('53212','Warehouse Rent','Expense','Dr'),
        ]},
      ]},

      { code:'533', name:'Utilities', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5331', name:'Utility Bills', level:4, type:'Expense', children:[
          leaf('53311','Electricity — Office','Expense','Dr'),
          leaf('53312','Internet & Telecom','Expense','Dr'),
          leaf('53313','Sweet Water (General)','Expense','Dr'),
          leaf('53314','Drinking Water — Office','Expense','Dr'),
        ]},
      ]},

      { code:'534', name:'IT & Office Equipment', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5341', name:'IT Costs', level:4, type:'Expense', children:[
          leaf('53411','Computer Maintenance & Repair','Expense','Dr'),
          leaf('53412','Printer Maintenance & Cartridges','Expense','Dr'),
          leaf('53413','UPS & Battery Maintenance','Expense','Dr'),
          leaf('53414','CCTV Maintenance','Expense','Dr'),
          leaf('53415','Software & Subscriptions','Expense','Dr'),
        ]},
      ]},

      { code:'535', name:'Vehicle & Transport', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5351', name:'Vehicle Running Costs', level:4, type:'Expense', children:[
          leaf('53511','Vehicle Fuel — Office/Admin','Expense','Dr'),
          leaf('53512','Vehicle Maintenance — Admin','Expense','Dr'),
          leaf('53513','Bike — Fuel & Maintenance','Expense','Dr'),
          leaf('53514','Vehicle Challan & Registration','Expense','Dr'),
          leaf('53515','Vehicle Insurance','Expense','Dr'),
        ]},
      ]},

      { code:'536', name:'Repair & Maintenance', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5361', name:'Building & Premises', level:4, type:'Expense', children:[
          leaf('53611','Building Repair & Maintenance','Expense','Dr'),
          leaf('53612','Civil Works','Expense','Dr'),
        ]},
        { code:'5362', name:'Equipment Maintenance', level:4, type:'Expense', children:[
          leaf('53621','Fabrication Machine — Maintenance','Expense','Dr'),
          leaf('53622','Generator (15 KVA) — Fuel','Expense','Dr'),
          leaf('53623','Generator (15 KVA) — Maintenance','Expense','Dr'),
          leaf('53624','Generator (5 KVA) — Fuel','Expense','Dr'),
          leaf('53625','Generator (5 KVA) — Maintenance','Expense','Dr'),
        ]},
      ]},

      { code:'537', name:'Selling & Distribution', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5371', name:'Sales Expenses', level:4, type:'Expense', children:[
          leaf('53711','Marketing & Advertising','Expense','Dr'),
          leaf('53712','Business Development','Expense','Dr'),
          leaf('53713','Client Entertainment','Expense','Dr'),
          leaf('53714','Sample & Tender Costs','Expense','Dr'),
        ]},
      ]},

      { code:'538', name:'General & Administrative', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5381', name:'Admin Expenses', level:4, type:'Expense', children:[
          leaf('53811','Office Supplies & Stationery','Expense','Dr'),
          leaf('53812','Printing & Photocopying','Expense','Dr'),
          leaf('53813','Postage & Courier','Expense','Dr'),
          leaf('53814','Legal & Professional Fees','Expense','Dr'),
          leaf('53815','Audit Fees','Expense','Dr'),
          leaf('53816','Bank Charges & Commission','Expense','Dr'),
          leaf('53817','Miscellaneous Expenses','Expense','Dr'),
        ]},
        { code:'5382', name:'Regulatory & Compliance', level:4, type:'Expense', children:[
          leaf('53821','Govt Fees & Taxes (Non-Income)','Expense','Dr'),
          leaf('53822','Challan Payments — Shehzore/Vehicles','Expense','Dr'),
          leaf('53823','Facilitation Payments','Expense','Dr'),
          leaf('53824','Stamp Duty & Documentation','Expense','Dr'),
        ]},
      ]},

      { code:'539', name:'Depreciation & Amortisation', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5391', name:'Non-Production Depreciation', level:4, type:'Expense', children:[
          leaf('53911','Depreciation — Office Equipment','Expense','Dr'),
          leaf('53912','Depreciation — Computers & IT','Expense','Dr'),
          leaf('53913','Depreciation — Furniture','Expense','Dr'),
          leaf('53914','Depreciation — CCTV & Security','Expense','Dr'),
          leaf('53915','Amortisation — Software','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'54', name:'Finance Costs', level:2, type:'Expense', children:[
      { code:'541', name:'Financial Charges', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5411', name:'Interest & Charges', level:4, type:'Expense', children:[
          leaf('54111','Bank Interest — Running Finance','Expense','Dr'),
          leaf('54112','LC Charges','Expense','Dr'),
          leaf('54113','Foreign Exchange Loss','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'55', name:'Employee Welfare Fund', level:2, type:'Expense', children:[
      { code:'551', name:'Employee Fund', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5511', name:'Deduction Fund', level:4, type:'Expense', children:[
          leaf('55111','Absent Deductions — Transferred to Fund','Expense','Dr'),
          leaf('55112','Late Deductions — Transferred to Fund','Expense','Dr'),
          leaf('55113','Other Deductions — Fund','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'56', name:'Impairment & Write-offs', level:2, type:'Expense', children:[
      { code:'561', name:'Losses', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5611', name:'Bad Debts & Impairment', level:4, type:'Expense', children:[
          leaf('56111','Bad Debt Expense','Expense','Dr'),
          leaf('56112','Employee Loan Written Off (Absconded)','Expense','Dr'),
          leaf('56113','Inventory Write-Off','Expense','Dr'),
        ]},
      ]},
    ]},
  ]},
];

// ============================================================
// GTI — same as GTK (Aluminium & Glass Contracts)
// ============================================================
export const GTI_COA: COAAccount[] = GTK_COA;

// ============================================================
// GLASSCO — Glass Processing & Supply
// ============================================================
export const GLASSCO_COA: COAAccount[] = [
  { code:'1', name:'Assets', level:1, type:'Asset', normalBalance:'Dr', children:[
    { code:'11', name:'Current Assets', level:2, type:'Asset', children:[
      { code:'111', name:'Cash & Bank', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1111', name:'Cash & Cash Equivalents', level:4, type:'Asset', children:[
          leaf('11111','Petty Cash — Glassco','Asset','Dr'),
          leaf('11112','Cash in Hand','Asset','Dr'),
        ]},
        { code:'1112', name:'Bank Accounts', level:4, type:'Asset', children:[
          leaf('11121','Bank — MCB Current','Asset','Dr'),
          leaf('11122','Bank — HBL Current','Asset','Dr'),
        ]},
      ]},
      { code:'112', name:'Trade Receivables', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1121', name:'Accounts Receivable', level:4, type:'Asset', children:[
          leaf('11211','Receivable — GTK (Intercompany)','Asset','Dr'),
          leaf('11212','Receivable — GTI (Intercompany)','Asset','Dr'),
          leaf('11213','Receivable — External Clients','Asset','Dr'),
        ]},
        { code:'1122', name:'Advances & Retention', level:4, type:'Asset', children:[
          leaf('11221','Client Advance Applied','Asset','Dr'),
          leaf('11222','Retention Receivable','Asset','Dr'),
        ]},
        { code:'1123', name:'Doubtful Debts', level:4, type:'Asset', children:[
          leaf('11231','Allowance for Doubtful Debts','Asset','Cr'),
        ]},
      ]},
      { code:'113', name:'Intercompany Receivables', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1131', name:'Due from Group', level:4, type:'Asset', children:[
          leaf('11311','Due from GTK','Asset','Dr'),
          leaf('11312','Due from GTI','Asset','Dr'),
          leaf('11313','Due from Factory (Shehzore)','Asset','Dr'),
        ]},
      ]},
      { code:'114', name:'Advances & Prepayments', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1141', name:'Vendor Advances', level:4, type:'Asset', children:[
          leaf('11411','Advance — Glass Vendors','Asset','Dr'),
          leaf('11412','Advance — Tempering Vendors','Asset','Dr'),
          leaf('11413','WHT Advance Tax','Asset','Dr'),
        ]},
        { code:'1142', name:'Employee Advances & Loans', level:4, type:'Asset', children:[
          leaf('11421','Employee Advances','Asset','Dr'),
          leaf('11422','Employee Loans — Recoverable','Asset','Dr'),
          leaf('11423','Employee Loans — Doubtful','Asset','Dr'),
        ]},
      ]},
      { code:'115', name:'Inventory', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1151', name:'Raw Glass Inventory', level:4, type:'Asset', children:[
          leaf('11511','Float Glass — Clear','Asset','Dr'),
          leaf('11512','Float Glass — Tinted','Asset','Dr'),
          leaf('11513','Float Glass — Reflective','Asset','Dr'),
          leaf('11514','Laminated Glass Stock','Asset','Dr'),
          leaf('11515','Frosted / Decorative Glass','Asset','Dr'),
        ]},
        { code:'1152', name:'Work in Progress', level:4, type:'Asset', children:[
          leaf('11521','WIP — Cut Glass (Pre-Tempering)','Asset','Dr'),
          leaf('11522','WIP — At Tempering Vendor','Asset','Dr'),
        ]},
        { code:'1153', name:'Finished Glass', level:4, type:'Asset', children:[
          leaf('11531','Finished — Tempered Glass','Asset','Dr'),
          leaf('11532','Finished — Cut Glass','Asset','Dr'),
        ]},
        { code:'1154', name:'Consumables', level:4, type:'Asset', children:[
          leaf('11541','Consumables — Cutting','Asset','Dr'),
          leaf('11542','Consumables — Processing','Asset','Dr'),
          leaf('11543','Packaging Materials','Asset','Dr'),
        ]},
      ]},
    ]},
    { code:'12', name:'Non-Current Assets', level:2, type:'Asset', children:[
      { code:'121', name:'Property, Plant & Equipment', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1211', name:'PPE — Cost', level:4, type:'Asset', children:[
          leaf('12111','Glass Cutting Machine — Cost','Asset','Dr'),
          leaf('12112','Edge Processing Equipment — Cost','Asset','Dr'),
          leaf('12113','Heavy Machinery — Cost','Asset','Dr'),
          leaf('12114','Office Equipment — Cost','Asset','Dr'),
          leaf('12115','Computers — Cost','Asset','Dr'),
          leaf('12116','Vehicles — Cost (Shared)','Asset','Dr'),
        ]},
        { code:'1212', name:'PPE — Accumulated Depreciation', level:4, type:'Asset', children:[
          leaf('12121','Accum. Dep — Cutting Machine','Asset','Cr'),
          leaf('12122','Accum. Dep — Edge Processing','Asset','Cr'),
          leaf('12123','Accum. Dep — Heavy Machinery','Asset','Cr'),
          leaf('12124','Accum. Dep — Office Equipment','Asset','Cr'),
          leaf('12125','Accum. Dep — Computers','Asset','Cr'),
          leaf('12126','Accum. Dep — Vehicles','Asset','Cr'),
        ]},
      ]},
      { code:'123', name:'Long-Term Deposits', level:3, type:'Asset', normalBalance:'Dr', children:[
        { code:'1231', name:'Security Deposits', level:4, type:'Asset', children:[
          leaf('12311','Security Deposit — Premises','Asset','Dr'),
        ]},
      ]},
    ]},
  ]},

  { code:'2', name:'Liabilities', level:1, type:'Liability', normalBalance:'Cr', children:[
    { code:'21', name:'Current Liabilities', level:2, type:'Liability', children:[
      { code:'211', name:'Trade & Other Payables', level:3, type:'Liability', isControl:true, normalBalance:'Cr', children:[
        { code:'2111', name:'Accounts Payable', level:4, type:'Liability', children:[
          leaf('21111','Payable — Glass Importers','Liability','Cr'),
          leaf('21112','Payable — Tempering Vendors','Liability','Cr'),
          leaf('21113','Payable — Other Vendors','Liability','Cr'),
        ]},
        { code:'2112', name:'Accrued Liabilities', level:4, type:'Liability', children:[
          leaf('21121','Accrued Salaries','Liability','Cr'),
          leaf('21122','Accrued Processing Costs','Liability','Cr'),
        ]},
        { code:'2113', name:'Advance from Clients', level:4, type:'Liability', children:[
          leaf('21131','Advance — GTK Orders','Liability','Cr'),
          leaf('21132','Advance — GTI Orders','Liability','Cr'),
          leaf('21133','Advance — External Clients','Liability','Cr'),
        ]},
        { code:'2114', name:'Intercompany Payables', level:4, type:'Liability', children:[
          leaf('21141','Due to Factory (Shehzore)','Liability','Cr'),
          leaf('21142','Due to GTK','Liability','Cr'),
        ]},
      ]},
      { code:'212', name:'Tax Liabilities', level:3, type:'Liability', isControl:true, normalBalance:'Cr', children:[
        { code:'2121', name:'Tax Payable', level:4, type:'Liability', children:[
          leaf('21211','Sales Tax Payable','Liability','Cr'),
          leaf('21212','WHT Payable — Vendor','Liability','Cr'),
          leaf('21213','WHT Payable — Salary','Liability','Cr'),
          leaf('21214','EOBI Payable','Liability','Cr'),
        ]},
      ]},
      { code:'213', name:'Employee Liabilities', level:3, type:'Liability', normalBalance:'Cr', children:[
        { code:'2131', name:'Payroll', level:4, type:'Liability', children:[
          leaf('21311','Salary Payable','Liability','Cr'),
          leaf('21312','Employee Deduction Fund','Liability','Cr'),
        ]},
      ]},
    ]},
    { code:'22', name:'Non-Current Liabilities', level:2, type:'Liability', children:[
      { code:'221', name:'Long-Term Provisions', level:3, type:'Liability', normalBalance:'Cr', children:[
        { code:'2211', name:'Employee Benefits', level:4, type:'Liability', children:[
          leaf('22111','Provision for Gratuity','Liability','Cr'),
        ]},
      ]},
    ]},
  ]},

  { code:'3', name:'Equity', level:1, type:'Equity', normalBalance:'Cr', children:[
    { code:'31', name:'Owners Equity', level:2, type:'Equity', children:[
      { code:'311', name:'Capital', level:3, type:'Equity', isControl:true, normalBalance:'Cr', children:[
        { code:'3111', name:'Capital Accounts', level:4, type:'Equity', children:[
          leaf('31111','Capital — Glassco','Equity','Cr'),
          leaf('31121','Retained Earnings — Current Year','Equity','Cr'),
          leaf('31122','Retained Earnings — Prior Years','Equity','Cr'),
          leaf('31131','Drawings — Director','Equity','Dr'),
        ]},
      ]},
    ]},
  ]},

  { code:'4', name:'Revenue', level:1, type:'Revenue', normalBalance:'Cr', children:[
    { code:'41', name:'Glass Sales & Processing', level:2, type:'Revenue', children:[
      { code:'411', name:'Sales Revenue', level:3, type:'Revenue', isControl:true, normalBalance:'Cr', children:[
        { code:'4111', name:'Intercompany Sales', level:4, type:'Revenue', children:[
          leaf('41111','Sales to GTK — Glass Supply','Revenue','Cr'),
          leaf('41112','Sales to GTI — Glass Supply','Revenue','Cr'),
        ]},
        { code:'4112', name:'External Sales', level:4, type:'Revenue', children:[
          leaf('41121','Sales — Tempered Glass (External)','Revenue','Cr'),
          leaf('41122','Sales — Cut Glass (External)','Revenue','Cr'),
          leaf('41123','Sales — Specialty Glass','Revenue','Cr'),
        ]},
        { code:'4113', name:'Processing Income', level:4, type:'Revenue', children:[
          leaf('41131','Tempering Processing Charges','Revenue','Cr'),
          leaf('41132','Cutting Charges','Revenue','Cr'),
        ]},
      ]},
    ]},
    { code:'42', name:'Other Income', level:2, type:'Revenue', children:[
      { code:'421', name:'Non-Operating', level:3, type:'Revenue', normalBalance:'Cr', children:[
        { code:'4211', name:'Other', level:4, type:'Revenue', children:[
          leaf('42111','Scrap Glass Sales','Revenue','Cr'),
          leaf('42112','Transport Recovery — Shehzore','Revenue','Cr'),
          leaf('42113','Interest Income','Revenue','Cr'),
        ]},
      ]},
    ]},
  ]},

  { code:'5', name:'Expenses', level:1, type:'Expense', normalBalance:'Dr', children:[
    { code:'51', name:'Cost of Sales', level:2, type:'Expense', children:[
      { code:'511', name:'Direct Material', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5111', name:'Raw Glass Cost', level:4, type:'Expense', children:[
          leaf('51111','Float Glass — Cost of Sales','Expense','Dr'),
          leaf('51112','Specialty Glass — Cost of Sales','Expense','Dr'),
          leaf('51113','Glass Import Duty & Clearing','Expense','Dr'),
        ]},
        { code:'5112', name:'Consumables — Production', level:4, type:'Expense', children:[
          leaf('51121','Cutting Consumables','Expense','Dr'),
          leaf('51122','Processing Consumables','Expense','Dr'),
          leaf('51123','Packaging — Cost','Expense','Dr'),
        ]},
      ]},
      { code:'512', name:'Processing Costs', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5121', name:'Outwork — Tempering', level:4, type:'Expense', children:[
          leaf('51211','Tempering Charges — Vendor 1','Expense','Dr'),
          leaf('51212','Tempering Charges — Vendor 2','Expense','Dr'),
          leaf('51213','Tempering Transport (Shehzore)','Expense','Dr'),
        ]},
      ]},
      { code:'513', name:'Direct Labour', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5131', name:'Production Labour', level:4, type:'Expense', children:[
          leaf('51311','Wages — Cutting Dept','Expense','Dr'),
          leaf('51312','Wages — Processing Dept','Expense','Dr'),
          leaf('51313','Overtime — Production','Expense','Dr'),
          leaf('51314','EOBI — Employer','Expense','Dr'),
          leaf('51315','Gratuity Provision','Expense','Dr'),
        ]},
      ]},
      { code:'514', name:'Production Overhead', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5141', name:'Manufacturing Overhead', level:4, type:'Expense', children:[
          leaf('51411','Electricity — Production','Expense','Dr'),
          leaf('51412','Depreciation — Production Machinery','Expense','Dr'),
          leaf('51413','Machine Repair — Cutting','Expense','Dr'),
          leaf('51414','Machine Repair — Processing','Expense','Dr'),
        ]},
      ]},
    ]},
    { code:'52', name:'Operating Expenses', level:2, type:'Expense', children:[
      { code:'521', name:'Staff Costs', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5211', name:'Salaries', level:4, type:'Expense', children:[
          leaf('52111','Salaries — Admin & Management','Expense','Dr'),
          leaf('52112','Salaries — Accounts','Expense','Dr'),
          leaf('52113','Staff Benefits','Expense','Dr'),
        ]},
      ]},
      { code:'522', name:'Utilities & Premises', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5221', name:'Running Costs', level:4, type:'Expense', children:[
          leaf('52211','Electricity — Office & Admin','Expense','Dr'),
          leaf('52212','Internet & Telephone','Expense','Dr'),
          leaf('52213','Sweet Water','Expense','Dr'),
          leaf('52214','Drinking Water — Office','Expense','Dr'),
        ]},
      ]},
      { code:'523', name:'Admin & General', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5231', name:'Admin Expenses', level:4, type:'Expense', children:[
          leaf('52311','Office Supplies','Expense','Dr'),
          leaf('52312','Printing & Stationery','Expense','Dr'),
          leaf('52313','Legal & Professional','Expense','Dr'),
          leaf('52314','Bank Charges','Expense','Dr'),
          leaf('52315','Miscellaneous','Expense','Dr'),
        ]},
        { code:'5232', name:'Compliance', level:4, type:'Expense', children:[
          leaf('52321','Govt Fees & Taxes','Expense','Dr'),
          leaf('52322','Facilitation Payments','Expense','Dr'),
        ]},
      ]},
    ]},
    { code:'55', name:'Employee Welfare Fund', level:2, type:'Expense', children:[
      { code:'551', name:'Deduction Fund', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5511', name:'Fund Transfers', level:4, type:'Expense', children:[
          leaf('55111','Absent/Late Deductions — Fund','Expense','Dr'),
        ]},
      ]},
    ]},
    { code:'56', name:'Impairment & Write-offs', level:2, type:'Expense', children:[
      { code:'561', name:'Losses', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5611', name:'Write-offs', level:4, type:'Expense', children:[
          leaf('56111','Bad Debt Expense','Expense','Dr'),
          leaf('56112','Employee Loan Written Off','Expense','Dr'),
          leaf('56113','Glass Breakage & Write-off','Expense','Dr'),
        ]},
      ]},
    ]},
  ]},
];

// ============================================================
// NIPPON — Hardware Wholesale (No Production)
// ============================================================
export const NIPPON_COA: COAAccount[] = [
  { code:'1', name:'Assets', level:1, type:'Asset', normalBalance:'Dr', children:[
    { code:'11', name:'Current Assets', level:2, type:'Asset', children:[
      { code:'111', name:'Cash & Bank', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1111', name:'Cash', level:4, type:'Asset', children:[
          leaf('11111','Petty Cash — Nippon','Asset','Dr'),
          leaf('11112','Cash in Hand','Asset','Dr'),
        ]},
        { code:'1112', name:'Bank', level:4, type:'Asset', children:[
          leaf('11121','Bank — MCB Current','Asset','Dr'),
          leaf('11122','Bank — HBL Current','Asset','Dr'),
        ]},
      ]},
      { code:'112', name:'Trade Receivables', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1121', name:'Accounts Receivable', level:4, type:'Asset', children:[
          leaf('11211','Receivable — GTK (Hardware)','Asset','Dr'),
          leaf('11212','Receivable — GTI (Hardware)','Asset','Dr'),
          leaf('11213','Receivable — External Wholesale','Asset','Dr'),
        ]},
        { code:'1122', name:'Advance & Doubtful', level:4, type:'Asset', children:[
          leaf('11221','Client Advance Applied','Asset','Dr'),
          leaf('11222','Allowance for Doubtful Debts','Asset','Cr'),
        ]},
      ]},
      { code:'113', name:'Intercompany Receivables', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1131', name:'Due from Group', level:4, type:'Asset', children:[
          leaf('11311','Due from GTK','Asset','Dr'),
          leaf('11312','Due from GTI','Asset','Dr'),
          leaf('11313','Due from Factory (Shared Cost)','Asset','Dr'),
        ]},
      ]},
      { code:'114', name:'Advances & Prepayments', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1141', name:'Vendor Advances', level:4, type:'Asset', children:[
          leaf('11411','Advance — Kin Long / Hardware Vendors','Asset','Dr'),
          leaf('11412','Advance — Importers','Asset','Dr'),
          leaf('11413','WHT Advance Tax','Asset','Dr'),
        ]},
        { code:'1142', name:'Employee', level:4, type:'Asset', children:[
          leaf('11421','Employee Advances','Asset','Dr'),
          leaf('11422','Employee Loans — Recoverable','Asset','Dr'),
          leaf('11423','Employee Loans — Doubtful','Asset','Dr'),
        ]},
      ]},
      { code:'115', name:'Inventory', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1151', name:'Hardware Inventory', level:4, type:'Asset', children:[
          leaf('11511','Kin Long Products — Stock','Asset','Dr'),
          leaf('11512','Aluminium Accessories — Stock','Asset','Dr'),
          leaf('11513','UPVC Hardware — Stock','Asset','Dr'),
          leaf('11514','General Hardware — Stock','Asset','Dr'),
          leaf('11515','Slow-Moving Inventory','Asset','Dr'),
        ]},
        { code:'1152', name:'Project Stock', level:4, type:'Asset', children:[
          leaf('11521','Hardware — Project Issue (GTK)','Asset','Dr'),
          leaf('11522','Hardware — Project Issue (GTI)','Asset','Dr'),
        ]},
      ]},
    ]},
    { code:'12', name:'Non-Current Assets', level:2, type:'Asset', children:[
      { code:'121', name:'PPE', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1211', name:'PPE — Cost', level:4, type:'Asset', children:[
          leaf('12111','Office Equipment — Cost','Asset','Dr'),
          leaf('12112','Computers — Cost','Asset','Dr'),
          leaf('12113','Furniture — Cost','Asset','Dr'),
          leaf('12114','Warehouse Equipment — Cost','Asset','Dr'),
        ]},
        { code:'1212', name:'PPE — Depreciation', level:4, type:'Asset', children:[
          leaf('12121','Accum. Dep — Office Equipment','Asset','Cr'),
          leaf('12122','Accum. Dep — Computers','Asset','Cr'),
          leaf('12123','Accum. Dep — Furniture','Asset','Cr'),
          leaf('12124','Accum. Dep — Warehouse','Asset','Cr'),
        ]},
      ]},
    ]},
  ]},

  { code:'2', name:'Liabilities', level:1, type:'Liability', normalBalance:'Cr', children:[
    { code:'21', name:'Current Liabilities', level:2, type:'Liability', children:[
      { code:'211', name:'Trade Payables', level:3, type:'Liability', isControl:true, normalBalance:'Cr', children:[
        { code:'2111', name:'Accounts Payable', level:4, type:'Liability', children:[
          leaf('21111','Payable — Kin Long Vendors','Liability','Cr'),
          leaf('21112','Payable — Hardware Importers','Liability','Cr'),
          leaf('21113','Payable — Other','Liability','Cr'),
        ]},
        { code:'2112', name:'Advances & Accruals', level:4, type:'Liability', children:[
          leaf('21121','Client Advance — GTK','Liability','Cr'),
          leaf('21122','Client Advance — GTI','Liability','Cr'),
          leaf('21123','Client Advance — External','Liability','Cr'),
          leaf('21124','Accrued Salaries','Liability','Cr'),
        ]},
        { code:'2113', name:'Intercompany Payables', level:4, type:'Liability', children:[
          leaf('21131','Due to Factory (20% Share)','Liability','Cr'),
        ]},
      ]},
      { code:'212', name:'Tax Liabilities', level:3, type:'Liability', isControl:true, normalBalance:'Cr', children:[
        { code:'2121', name:'Tax', level:4, type:'Liability', children:[
          leaf('21211','Sales Tax Payable','Liability','Cr'),
          leaf('21212','WHT — Vendor','Liability','Cr'),
          leaf('21213','WHT — Salary','Liability','Cr'),
          leaf('21214','EOBI Payable','Liability','Cr'),
        ]},
      ]},
      { code:'213', name:'Employee Liabilities', level:3, type:'Liability', normalBalance:'Cr', children:[
        { code:'2131', name:'Payroll', level:4, type:'Liability', children:[
          leaf('21311','Salary Payable','Liability','Cr'),
          leaf('21312','Employee Deduction Fund','Liability','Cr'),
        ]},
      ]},
    ]},
    { code:'22', name:'Non-Current Liabilities', level:2, type:'Liability', children:[
      { code:'221', name:'Provisions', level:3, type:'Liability', normalBalance:'Cr', children:[
        { code:'2211', name:'Employee Benefits', level:4, type:'Liability', children:[
          leaf('22111','Provision for Gratuity','Liability','Cr'),
        ]},
      ]},
    ]},
  ]},

  { code:'3', name:'Equity', level:1, type:'Equity', normalBalance:'Cr', children:[
    { code:'31', name:'Owners Equity', level:2, type:'Equity', children:[
      { code:'311', name:'Capital', level:3, type:'Equity', isControl:true, normalBalance:'Cr', children:[
        { code:'3111', name:'Capital Accounts', level:4, type:'Equity', children:[
          leaf('31111','Capital — Nippon','Equity','Cr'),
          leaf('31121','Retained Earnings — Current','Equity','Cr'),
          leaf('31122','Retained Earnings — Prior','Equity','Cr'),
          leaf('31131','Drawings — Director','Equity','Dr'),
        ]},
      ]},
    ]},
  ]},

  { code:'4', name:'Revenue', level:1, type:'Revenue', normalBalance:'Cr', children:[
    { code:'41', name:'Hardware Sales', level:2, type:'Revenue', children:[
      { code:'411', name:'Sales Revenue', level:3, type:'Revenue', isControl:true, normalBalance:'Cr', children:[
        { code:'4111', name:'Intercompany Sales', level:4, type:'Revenue', children:[
          leaf('41111','Sales — GTK (Hardware)','Revenue','Cr'),
          leaf('41112','Sales — GTI (Hardware)','Revenue','Cr'),
        ]},
        { code:'4112', name:'External Wholesale', level:4, type:'Revenue', children:[
          leaf('41121','Wholesale Sales — Kin Long Products','Revenue','Cr'),
          leaf('41122','Wholesale Sales — Aluminium Accessories','Revenue','Cr'),
          leaf('41123','Wholesale Sales — UPVC Hardware','Revenue','Cr'),
          leaf('41124','Wholesale Sales — General Hardware','Revenue','Cr'),
        ]},
      ]},
    ]},
    { code:'42', name:'Other Income', level:2, type:'Revenue', children:[
      { code:'421', name:'Non-Operating', level:3, type:'Revenue', normalBalance:'Cr', children:[
        { code:'4211', name:'Other', level:4, type:'Revenue', children:[
          leaf('42111','Scrap & Surplus Sales','Revenue','Cr'),
          leaf('42112','Interest Income','Revenue','Cr'),
        ]},
      ]},
    ]},
  ]},

  { code:'5', name:'Expenses', level:1, type:'Expense', normalBalance:'Dr', children:[
    { code:'51', name:'Cost of Goods Sold', level:2, type:'Expense', children:[
      { code:'511', name:'COGS', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5111', name:'Purchase Cost', level:4, type:'Expense', children:[
          leaf('51111','Kin Long Products — COGS','Expense','Dr'),
          leaf('51112','Aluminium Accessories — COGS','Expense','Dr'),
          leaf('51113','UPVC Hardware — COGS','Expense','Dr'),
          leaf('51114','General Hardware — COGS','Expense','Dr'),
          leaf('51115','Import Duty & Clearing','Expense','Dr'),
          leaf('51116','Freight Inward','Expense','Dr'),
        ]},
        { code:'5112', name:'Project Issues', level:4, type:'Expense', children:[
          leaf('51121','Hardware Issued — GTK Projects','Expense','Dr'),
          leaf('51122','Hardware Issued — GTI Projects','Expense','Dr'),
        ]},
      ]},
    ]},
    { code:'52', name:'Operating Expenses', level:2, type:'Expense', children:[
      { code:'521', name:'Staff', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5211', name:'Salaries', level:4, type:'Expense', children:[
          leaf('52111','Salaries — Admin & Management','Expense','Dr'),
          leaf('52112','Salaries — Warehouse','Expense','Dr'),
          leaf('52113','EOBI — Employer','Expense','Dr'),
          leaf('52114','Gratuity Provision','Expense','Dr'),
        ]},
      ]},
      { code:'522', name:'Utilities & Admin', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5221', name:'Running Costs', level:4, type:'Expense', children:[
          leaf('52211','Electricity — Office','Expense','Dr'),
          leaf('52212','Internet & Telecom','Expense','Dr'),
          leaf('52213','Office Supplies','Expense','Dr'),
          leaf('52214','Miscellaneous','Expense','Dr'),
        ]},
      ]},
      { code:'523', name:'Factory Cost Share', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5231', name:'Shared Expenses (20%)', level:4, type:'Expense', children:[
          leaf('52311','Factory Shared Cost — Nippon 20%','Expense','Dr'),
        ]},
      ]},
    ]},
    { code:'55', name:'Employee Welfare Fund', level:2, type:'Expense', children:[
      { code:'551', name:'Deduction Fund', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5511', name:'Fund', level:4, type:'Expense', children:[
          leaf('55111','Absent/Late Deductions — Fund','Expense','Dr'),
        ]},
      ]},
    ]},
    { code:'56', name:'Write-offs', level:2, type:'Expense', children:[
      { code:'561', name:'Losses', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5611', name:'Impairment', level:4, type:'Expense', children:[
          leaf('56111','Bad Debt Expense','Expense','Dr'),
          leaf('56112','Employee Loan Written Off','Expense','Dr'),
          leaf('56113','Inventory Obsolescence','Expense','Dr'),
        ]},
      ]},
    ]},
  ]},
];

// ============================================================
// FACTORY — Shared Cost Centre (No Sales)
// GTK 50% | Glassco 30% | Nippon 20%
// ============================================================
export const FACTORY_COA: COAAccount[] = [
  { code:'1', name:'Assets', level:1, type:'Asset', normalBalance:'Dr', children:[
    { code:'11', name:'Current Assets', level:2, type:'Asset', children:[
      { code:'111', name:'Cash & Bank', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1111', name:'Cash', level:4, type:'Asset', children:[
          leaf('11111','Petty Cash — Factory','Asset','Dr'),
          leaf('11112','Cash in Hand — Factory','Asset','Dr'),
        ]},
        { code:'1112', name:'Bank', level:4, type:'Asset', children:[
          leaf('11121','Bank — Factory Account','Asset','Dr'),
        ]},
      ]},
      { code:'112', name:'Receivable from Companies', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1121', name:'Cost Recovery Receivable', level:4, type:'Asset', children:[
          leaf('11211','Receivable — GTK (50% Share)','Asset','Dr'),
          leaf('11212','Receivable — Glassco (30% Share)','Asset','Dr'),
          leaf('11213','Receivable — Nippon (20% Share)','Asset','Dr'),
          leaf('11214','Shehzore Charges Recoverable','Asset','Dr'),
        ]},
      ]},
      { code:'114', name:'Advances & Prepayments', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1141', name:'Advances', level:4, type:'Asset', children:[
          leaf('11411','Advance — Fuel Suppliers','Asset','Dr'),
          leaf('11412','Advance — Maintenance Vendors','Asset','Dr'),
          leaf('11413','WHT Advance Tax','Asset','Dr'),
        ]},
        { code:'1142', name:'Employee Advances', level:4, type:'Asset', children:[
          leaf('11421','Employee Advances','Asset','Dr'),
          leaf('11422','Employee Loans — Recoverable','Asset','Dr'),
          leaf('11423','Employee Loans — Doubtful (Absconded)','Asset','Dr'),
        ]},
        { code:'1143', name:'Prepayments', level:4, type:'Asset', children:[
          leaf('11431','Prepaid Insurance — Factory','Asset','Dr'),
          leaf('11432','Advance Tax Paid','Asset','Dr'),
        ]},
      ]},
      { code:'115', name:'Stores & Inventory', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1151', name:'Factory Stores', level:4, type:'Asset', children:[
          leaf('11511','Consumables — General Factory','Asset','Dr'),
          leaf('11512','Cleaning Supplies','Asset','Dr'),
          leaf('11513','Tea, Sugar & Kitchen Supplies','Asset','Dr'),
          leaf('11514','Drinking Water — Stock','Asset','Dr'),
          leaf('11515','Generator Fuel — Stock','Asset','Dr'),
          leaf('11516','Printer Cartridges & IT Supplies','Asset','Dr'),
        ]},
      ]},
    ]},
    { code:'12', name:'Non-Current Assets', level:2, type:'Asset', children:[
      { code:'121', name:'Property, Plant & Equipment', level:3, type:'Asset', isControl:true, normalBalance:'Dr', children:[
        { code:'1211', name:'PPE — Cost', level:4, type:'Asset', children:[
          leaf('12111','Factory Building — Cost','Asset','Dr'),
          leaf('12112','Shehzore (Truck) — Cost','Asset','Dr'),
          leaf('12113','Motorcycle — Cost','Asset','Dr'),
          leaf('12114','Generator 15 KVA — Cost','Asset','Dr'),
          leaf('12115','Generator 5 KVA — Cost','Asset','Dr'),
          leaf('12116','UPS & Battery Bank — Cost','Asset','Dr'),
          leaf('12117','CCTV System — Cost','Asset','Dr'),
          leaf('12118','Computers & PCs — Cost','Asset','Dr'),
          leaf('12119','Office Equipment — Cost','Asset','Dr'),
          leaf('12120','Furniture & Fixtures — Cost','Asset','Dr'),
          leaf('12121','Air Conditioners — Cost','Asset','Dr'),
          leaf('12122','Water Cooler/Dispenser — Cost','Asset','Dr'),
        ]},
        { code:'1212', name:'PPE — Accumulated Depreciation', level:4, type:'Asset', children:[
          leaf('12201','Accum. Dep — Factory Building','Asset','Cr'),
          leaf('12202','Accum. Dep — Shehzore','Asset','Cr'),
          leaf('12203','Accum. Dep — Motorcycle','Asset','Cr'),
          leaf('12204','Accum. Dep — Generator 15 KVA','Asset','Cr'),
          leaf('12205','Accum. Dep — Generator 5 KVA','Asset','Cr'),
          leaf('12206','Accum. Dep — UPS & Battery','Asset','Cr'),
          leaf('12207','Accum. Dep — CCTV','Asset','Cr'),
          leaf('12208','Accum. Dep — Computers','Asset','Cr'),
          leaf('12209','Accum. Dep — Office Equipment','Asset','Cr'),
          leaf('12210','Accum. Dep — Furniture','Asset','Cr'),
        ]},
      ]},
      { code:'123', name:'Long-Term Deposits', level:3, type:'Asset', normalBalance:'Dr', children:[
        { code:'1231', name:'Security Deposits', level:4, type:'Asset', children:[
          leaf('12311','Security Deposit — Factory Premises','Asset','Dr'),
          leaf('12312','Security Deposit — Utility (LESCO/SSGC)','Asset','Dr'),
        ]},
      ]},
    ]},
  ]},

  { code:'2', name:'Liabilities', level:1, type:'Liability', normalBalance:'Cr', children:[
    { code:'21', name:'Current Liabilities', level:2, type:'Liability', children:[
      { code:'211', name:'Trade & Other Payables', level:3, type:'Liability', isControl:true, normalBalance:'Cr', children:[
        { code:'2111', name:'Accounts Payable', level:4, type:'Liability', children:[
          leaf('21111','Payable — Fuel Vendors','Liability','Cr'),
          leaf('21112','Payable — Maintenance Contractors','Liability','Cr'),
          leaf('21113','Payable — Utility Bills','Liability','Cr'),
          leaf('21114','Payable — Cleaning & Sanitation','Liability','Cr'),
          leaf('21115','Payable — Misc Vendors','Liability','Cr'),
        ]},
        { code:'2112', name:'Accrued Liabilities', level:4, type:'Liability', children:[
          leaf('21121','Accrued Salaries — Factory Staff','Liability','Cr'),
          leaf('21122','Accrued Utilities','Liability','Cr'),
          leaf('21123','Accrued Repair & Maintenance','Liability','Cr'),
        ]},
        { code:'2113', name:'Cost Allocation Payable', level:4, type:'Liability', children:[
          leaf('21131','Due to Companies — Cost Settled','Liability','Cr'),
        ]},
      ]},
      { code:'212', name:'Tax Liabilities', level:3, type:'Liability', isControl:true, normalBalance:'Cr', children:[
        { code:'2121', name:'Tax Payable', level:4, type:'Liability', children:[
          leaf('21211','WHT Payable — Vendor','Liability','Cr'),
          leaf('21212','WHT Payable — Salary','Liability','Cr'),
          leaf('21213','EOBI Payable','Liability','Cr'),
          leaf('21214','PESSI/SESSI Payable','Liability','Cr'),
          leaf('21215','Professional Tax','Liability','Cr'),
        ]},
      ]},
      { code:'213', name:'Employee Liabilities', level:3, type:'Liability', isControl:true, normalBalance:'Cr', children:[
        { code:'2131', name:'Payroll', level:4, type:'Liability', children:[
          leaf('21311','Salary Payable — Guard','Liability','Cr'),
          leaf('21312','Salary Payable — Peon','Liability','Cr'),
          leaf('21313','Salary Payable — IT Technician','Liability','Cr'),
          leaf('21314','Salary Payable — Admin','Liability','Cr'),
          leaf('21315','Employee Deduction Fund','Liability','Cr'),
        ]},
      ]},
    ]},
    { code:'22', name:'Non-Current Liabilities', level:2, type:'Liability', children:[
      { code:'221', name:'Provisions', level:3, type:'Liability', normalBalance:'Cr', children:[
        { code:'2211', name:'Employee Benefits', level:4, type:'Liability', children:[
          leaf('22111','Provision for Gratuity — Factory','Liability','Cr'),
          leaf('22112','Provision for Leave Encashment','Liability','Cr'),
        ]},
      ]},
    ]},
  ]},

  { code:'3', name:'Equity', level:1, type:'Equity', normalBalance:'Cr', children:[
    { code:'31', name:'Capital', level:2, type:'Equity', children:[
      { code:'311', name:'Capital Accounts', level:3, type:'Equity', isControl:true, normalBalance:'Cr', children:[
        { code:'3111', name:'Factory Capital', level:4, type:'Equity', children:[
          leaf('31111','Capital — Factory (Shared)','Equity','Cr'),
          leaf('31121','Retained Surplus / Deficit','Equity','Cr'),
        ]},
      ]},
    ]},
  ]},

  // Factory has NO Revenue — cost centre only
  // All costs allocated to GTK/Glassco/Nippon

  { code:'5', name:'Expenses', level:1, type:'Expense', normalBalance:'Dr', children:[

    { code:'51', name:'Facility & Utilities', level:2, type:'Expense', children:[
      { code:'511', name:'Rent & Occupancy', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5111', name:'Premises', level:4, type:'Expense', children:[
          leaf('51111','Factory Rent','Expense','Dr'),
          leaf('51112','Factory Rent — Late Payment Penalty','Expense','Dr'),
        ]},
      ]},
      { code:'512', name:'Utilities', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5121', name:'Power & Water', level:4, type:'Expense', children:[
          leaf('51211','Electricity — LESCO/WAPDA','Expense','Dr'),
          leaf('51212','Gas — SSGC/SNGPL','Expense','Dr'),
          leaf('51213','Sweet Water Supply','Expense','Dr'),
          leaf('51214','Drinking Water — Labour','Expense','Dr'),
          leaf('51215','Drinking Water — Office','Expense','Dr'),
          leaf('51216','Internet — Factory','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'52', name:'Staff & Labour', level:2, type:'Expense', children:[
      { code:'521', name:'Salaries & Wages', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5211', name:'Factory Staff', level:4, type:'Expense', children:[
          leaf('52111','Salary — Security Guard','Expense','Dr'),
          leaf('52112','Salary — Office Peon','Expense','Dr'),
          leaf('52113','Salary — IT Technician','Expense','Dr'),
          leaf('52114','Salary — Admin Staff','Expense','Dr'),
          leaf('52115','Overtime — Factory Staff','Expense','Dr'),
        ]},
        { code:'5212', name:'Statutory Benefits', level:4, type:'Expense', children:[
          leaf('52121','EOBI — Factory Employer','Expense','Dr'),
          leaf('52122','PESSI/SESSI — Factory','Expense','Dr'),
          leaf('52123','Gratuity Provision — Factory','Expense','Dr'),
        ]},
      ]},
      { code:'522', name:'Staff Welfare', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5221', name:'Welfare', level:4, type:'Expense', children:[
          leaf('52211','Food — Daily (Lunch/Dinner)','Expense','Dr'),
          leaf('52212','Tea, Sugar & Kitchen Supplies','Expense','Dr'),
          leaf('52213','Cleaning & Sanitation Supplies','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'53', name:'Vehicle & Transport', level:2, type:'Expense', children:[
      { code:'531', name:'Shehzore (Truck)', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5311', name:'Running Costs', level:4, type:'Expense', children:[
          leaf('53111','Shehzore — Fuel','Expense','Dr'),
          leaf('53112','Shehzore — Engine Oil & Lubricants','Expense','Dr'),
          leaf('53113','Shehzore — Tyres & Parts','Expense','Dr'),
          leaf('53114','Shehzore — Repair & Maintenance','Expense','Dr'),
          leaf('53115','Shehzore — Driver Wages','Expense','Dr'),
          leaf('53116','Shehzore — Token Tax / Registration','Expense','Dr'),
          leaf('53117','Shehzore — Traffic Challan','Expense','Dr'),
          leaf('53118','Shehzore — Insurance','Expense','Dr'),
          leaf('53119','Shehzore — Facilitation (Police/Traffic)','Expense','Dr'),
        ]},
      ]},
      { code:'532', name:'Motorcycle', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5321', name:'Bike Running', level:4, type:'Expense', children:[
          leaf('53211','Bike — Fuel','Expense','Dr'),
          leaf('53212','Bike — Maintenance & Repair','Expense','Dr'),
          leaf('53213','Bike — Registration & Challan','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'54', name:'Power Backup', level:2, type:'Expense', children:[
      { code:'541', name:'Generator Costs', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5411', name:'Generator 15 KVA', level:4, type:'Expense', children:[
          leaf('54111','Generator 15KVA — Fuel (Diesel)','Expense','Dr'),
          leaf('54112','Generator 15KVA — Engine Oil','Expense','Dr'),
          leaf('54113','Generator 15KVA — Repair & Maintenance','Expense','Dr'),
          leaf('54114','Generator 15KVA — Servicing','Expense','Dr'),
        ]},
        { code:'5412', name:'Generator 5 KVA', level:4, type:'Expense', children:[
          leaf('54121','Generator 5KVA — Fuel (Petrol)','Expense','Dr'),
          leaf('54122','Generator 5KVA — Oil & Maintenance','Expense','Dr'),
          leaf('54123','Generator 5KVA — Repair','Expense','Dr'),
        ]},
      ]},
      { code:'542', name:'UPS & Battery', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5421', name:'UPS System', level:4, type:'Expense', children:[
          leaf('54211','UPS — Battery Replacement','Expense','Dr'),
          leaf('54212','UPS — Maintenance & Repair','Expense','Dr'),
          leaf('54213','UPS — Electricity Consumption','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'55', name:'Repair & Maintenance', level:2, type:'Expense', children:[
      { code:'551', name:'Building & Civil', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5511', name:'Building Maintenance', level:4, type:'Expense', children:[
          leaf('55111','Building Repair — Civil Works','Expense','Dr'),
          leaf('55112','Plumbing & Sanitary','Expense','Dr'),
          leaf('55113','Electrical Works — Building','Expense','Dr'),
          leaf('55114','Painting & Finishing','Expense','Dr'),
        ]},
      ]},
      { code:'552', name:'IT & Security', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5521', name:'IT Infrastructure', level:4, type:'Expense', children:[
          leaf('55211','PC & Computer Maintenance','Expense','Dr'),
          leaf('55212','Printer Maintenance & Cartridges','Expense','Dr'),
          leaf('55213','CCTV — Maintenance & Repair','Expense','Dr'),
          leaf('55214','Networking & Cables','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'56', name:'Administrative & Compliance', level:2, type:'Expense', children:[
      { code:'561', name:'Office Expenses', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5611', name:'Admin', level:4, type:'Expense', children:[
          leaf('56111','Office Supplies & Stationery','Expense','Dr'),
          leaf('56112','Printing & Photocopying','Expense','Dr'),
          leaf('56113','Postage & Courier','Expense','Dr'),
          leaf('56114','Miscellaneous Expenses','Expense','Dr'),
        ]},
      ]},
      { code:'562', name:'Regulatory & Government', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5621', name:'Govt & Legal', level:4, type:'Expense', children:[
          leaf('56211','Govt Taxes & Fees (Non-Income)','Expense','Dr'),
          leaf('56212','Factory Registration & Renewal','Expense','Dr'),
          leaf('56213','Fire Safety & NOC Fees','Expense','Dr'),
          leaf('56214','Stamp Duty','Expense','Dr'),
          leaf('56215','Facilitation Payments — Labour Dept','Expense','Dr'),
          leaf('56216','Facilitation Payments — Utility Dept','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'57', name:'Depreciation', level:2, type:'Expense', children:[
      { code:'571', name:'Asset Depreciation', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5711', name:'Depreciation Charges', level:4, type:'Expense', children:[
          leaf('57111','Depreciation — Factory Building','Expense','Dr'),
          leaf('57112','Depreciation — Shehzore','Expense','Dr'),
          leaf('57113','Depreciation — Motorcycle','Expense','Dr'),
          leaf('57114','Depreciation — Generator 15 KVA','Expense','Dr'),
          leaf('57115','Depreciation — Generator 5 KVA','Expense','Dr'),
          leaf('57116','Depreciation — UPS & Battery','Expense','Dr'),
          leaf('57117','Depreciation — CCTV','Expense','Dr'),
          leaf('57118','Depreciation — Computers & PCs','Expense','Dr'),
          leaf('57119','Depreciation — Office Equipment','Expense','Dr'),
          leaf('57120','Depreciation — Furniture','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'58', name:'Cost Allocation', level:2, type:'Expense', children:[
      { code:'581', name:'Shared Cost Recovery', level:3, type:'Expense', isControl:true, normalBalance:'Dr', children:[
        { code:'5811', name:'Allocation to Companies', level:4, type:'Expense', children:[
          leaf('58111','Cost Allocated — GTK (50%)','Expense','Dr'),
          leaf('58112','Cost Allocated — Glassco (30%)','Expense','Dr'),
          leaf('58113','Cost Allocated — Nippon (20%)','Expense','Dr'),
        ]},
        { code:'5812', name:'Shehzore Fare Recovery', level:4, type:'Expense', children:[
          leaf('58121','Shehzore Charges — Billed to GTK','Expense','Dr'),
          leaf('58122','Shehzore Charges — Billed to Glassco','Expense','Dr'),
          leaf('58123','Shehzore Charges — Billed to Nippon','Expense','Dr'),
        ]},
      ]},
    ]},

    { code:'59', name:'Employee Fund & Write-offs', level:2, type:'Expense', children:[
      { code:'591', name:'Employee Fund', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5911', name:'Deduction Fund', level:4, type:'Expense', children:[
          leaf('59111','Absent Deductions — Factory Fund','Expense','Dr'),
          leaf('59112','Late Deductions — Factory Fund','Expense','Dr'),
        ]},
      ]},
      { code:'592', name:'Write-offs', level:3, type:'Expense', normalBalance:'Dr', children:[
        { code:'5921', name:'Losses', level:4, type:'Expense', children:[
          leaf('59211','Employee Loan Written Off (Absconded)','Expense','Dr'),
          leaf('59212','Inventory Write-Off — Factory Stores','Expense','Dr'),
        ]},
      ]},
    ]},
  ]},
];

// ── Convenience map ────────────────────────────────────────────
export const COMPANY_COA: Record<string, COAAccount[]> = {
  GTK:     GTK_COA,
  GTI:     GTI_COA,
  Glassco: GLASSCO_COA,
  Nippon:  NIPPON_COA,
  Factory: FACTORY_COA,
};
