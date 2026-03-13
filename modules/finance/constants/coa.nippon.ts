import { COAAccount, leaf } from './coa.types';

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
