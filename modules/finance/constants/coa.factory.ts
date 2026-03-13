import { COAAccount, leaf } from './coa.types';

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
