import { COAAccount, leaf } from './coa.types';

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
