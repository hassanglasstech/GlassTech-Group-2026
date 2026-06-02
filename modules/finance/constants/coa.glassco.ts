import { COAAccount, leaf } from './coa.types';

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
        // GR/IR Clearing — SAP-standard suspense account
        // Cr on GRN posting | Dr on vendor invoice registration | Balance = received not yet invoiced
        { code:'2115', name:'GR/IR Clearing', level:4, type:'Liability', children:[
          leaf('21151','GR/IR — Glass Material','Liability','Cr'),
          leaf('21152','GR/IR — Freight & Transport','Liability','Cr'),
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
