
import { Account } from '../../types';

// Helper to create account objects efficiently
const createAccount = (code: string, name: string, level: 1 | 2 | 3 | 4 | 5, parentCode: string | null, type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'): Account => {
  return {
    id: `FAC-ACC-${code}`,
    company: 'Factory',
    code,
    name,
    level,
    parentId: parentCode ? `FAC-ACC-${parentCode}` : null,
    type
  };
};

export const FactoryCOA: Account[] = [
  // ==========================================
  // 1. ASSETS (Factory Resources)
  // ==========================================
  createAccount('10000', 'ASSETS', 1, null, 'Asset'),
  
  // --- 11000 Non-Current Assets (Fixed Assets) ---
  createAccount('11000', 'Non-Current Assets', 2, '10000', 'Asset'),
  
  // 11100 Machinery & Power
  createAccount('11100', 'Machinery & Power Equipment', 3, '11000', 'Asset'),
  createAccount('11110', 'Generators', 4, '11100', 'Asset'),
  createAccount('11110-01', 'Generator 15 kVA (Main)', 5, '11110', 'Asset'),
  createAccount('11110-02', 'Generator 5 kVA (Backup)', 5, '11110', 'Asset'),
  createAccount('11120', 'Electrical Infrastructure', 4, '11100', 'Asset'),
  createAccount('11120-01', 'UPS (1 kVA) & Batteries', 5, '11120', 'Asset'),
  
  // 11200 IT & Electronics
  createAccount('11200', 'IT & Office Equipment', 3, '11000', 'Asset'),
  createAccount('11210', 'Computer Systems', 4, '11200', 'Asset'),
  createAccount('11210-01', 'Office PC Systems (5 Units)', 5, '11210', 'Asset'),
  createAccount('11210-02', 'LCD Display Screens', 5, '11210', 'Asset'),
  createAccount('11220', 'Security Systems', 4, '11200', 'Asset'),
  createAccount('11220-01', 'CCTV Cameras & DVR', 5, '11220', 'Asset'),

  // 11300 Vehicles
  createAccount('11300', 'Vehicles', 3, '11000', 'Asset'),
  createAccount('11310-01', 'Factory Motorcycle (Honda)', 5, '11300', 'Asset'),

  // --- 12000 Current Assets ---
  createAccount('12000', 'Current Assets', 2, '10000', 'Asset'),
  createAccount('12100', 'Cash & Bank', 3, '12000', 'Asset'),
  createAccount('12110-01', 'Factory Petty Cash', 5, '12100', 'Asset'),
  
  // 12200 Staff Advances (Receivables)
  createAccount('12200', 'Advances & Receivables', 3, '12000', 'Asset'),
  createAccount('12210', 'Loan to Staff', 4, '12200', 'Asset'),
  createAccount('12210-01', 'Staff Salary Advance', 5, '12210', 'Asset'),
  createAccount('12210-02', 'Long Term Staff Loans', 5, '12210', 'Asset'),

  // ==========================================
  // 2. LIABILITIES
  // ==========================================
  createAccount('20000', 'LIABILITIES', 1, null, 'Liability'),
  createAccount('21000', 'Current Liabilities', 2, '20000', 'Liability'),
  createAccount('21100', 'Accrued Expenses', 3, '21000', 'Liability'),
  createAccount('21110-01', 'Electricity Bill Payable', 5, '21100', 'Liability'),
  createAccount('21110-02', 'Internet Bill Payable', 5, '21100', 'Liability'),
  createAccount('21110-03', 'Rent Payable', 5, '21100', 'Liability'),

  // ==========================================
  // 3. EQUITY (Shared Capital)
  // ==========================================
  createAccount('30000', 'EQUITY', 1, null, 'Equity'),
  createAccount('31000', 'Inter-Company Accounts', 2, '30000', 'Equity'),
  createAccount('31100-01', 'Funds from GTK', 5, '31000', 'Equity'),
  createAccount('31100-02', 'Funds from Nippon', 5, '31000', 'Equity'),
  createAccount('31100-03', 'Funds from Glassco', 5, '31000', 'Equity'),

  // ==========================================
  // 4. REVENUE (Cost Allocation)
  // ==========================================
  createAccount('40000', 'REVENUE / RECOVERY', 1, null, 'Revenue'),
  createAccount('41000', 'Cost Recovery', 2, '40000', 'Revenue'),
  createAccount('41100-01', 'Expense Charged to GTK', 5, '41000', 'Revenue'),
  createAccount('41100-02', 'Expense Charged to Nippon', 5, '41000', 'Revenue'),
  createAccount('41100-03', 'Expense Charged to Glassco', 5, '41000', 'Revenue'),

  // ==========================================
  // 6. OPERATING EXPENSES (Shared)
  // ==========================================
  createAccount('60000', 'OPERATING EXPENSES', 1, null, 'Expense'),

  // --- 61000 Personnel Costs ---
  createAccount('61000', 'Personnel & Staff', 2, '60000', 'Expense'),
  createAccount('61100', 'Salaries & Wages', 3, '61000', 'Expense'),
  createAccount('61110-01', 'Security Guard Salary', 5, '61100', 'Expense'),
  createAccount('61110-02', 'Peon / Office Boy Salary', 5, '61100', 'Expense'),
  createAccount('61110-03', 'IT Technician Salary', 5, '61100', 'Expense'),
  createAccount('61200', 'Allowances', 3, '61000', 'Expense'),
  createAccount('61210-01', 'Guard Food Allowance', 5, '61200', 'Expense'),

  // --- 62000 Utilities (Detailed) ---
  createAccount('62000', 'Utilities', 2, '60000', 'Expense'),
  createAccount('62100', 'Power & Comms', 3, '62000', 'Expense'),
  createAccount('62110-01', 'Factory Electricity Bill', 5, '62100', 'Expense'),
  createAccount('62110-02', 'Internet & Fiber Bill', 5, '62100', 'Expense'),
  
  createAccount('62200', 'Water Supplies', 3, '62000', 'Expense'),
  createAccount('62210-01', 'Water Tanker (General Use)', 5, '62200', 'Expense'),
  createAccount('62210-02', 'Drinking Water - Staff (Mineral)', 5, '62200', 'Expense'),
  createAccount('62210-03', 'Drinking Water - Workers', 5, '62200', 'Expense'),

  // --- 63000 Kitchen & Refreshment ---
  createAccount('63000', 'Kitchen & Entertainment', 2, '60000', 'Expense'),
  createAccount('63100', 'Kitchen Supplies', 3, '63000', 'Expense'),
  createAccount('63110-01', 'Weekly Grocery / Ration', 5, '63100', 'Expense'),
  createAccount('63110-02', 'Fresh Milk / Doodh', 5, '63100', 'Expense'), // Separate Milk Account
  createAccount('63110-03', 'Tea, Sugar & Accessories', 5, '63100', 'Expense'),
  
  createAccount('63200', 'Refreshment', 3, '63000', 'Expense'),
  createAccount('63210-01', 'Office Refreshment (Lunch/Guests)', 5, '63200', 'Expense'),
  createAccount('63210-02', 'Factory Staff Refreshment', 5, '63200', 'Expense'),

  // --- 64000 Repair & Maintenance (Machinery) ---
  createAccount('64000', 'Repair & Maintenance', 2, '60000', 'Expense'),
  createAccount('64100', 'Generators R&M', 3, '64000', 'Expense'),
  createAccount('64110-01', 'Fuel - 15 kVA Generator', 5, '64100', 'Expense'),
  createAccount('64110-02', 'Maint/Oil - 15 kVA Generator', 5, '64100', 'Expense'),
  createAccount('64110-03', 'Fuel/Maint - 5 kVA Generator', 5, '64100', 'Expense'),
  
  createAccount('64200', 'Vehicles R&M', 3, '64000', 'Expense'),
  createAccount('64210-01', 'Bike Fuel', 5, '64200', 'Expense'),
  createAccount('64210-02', 'Bike Maintenance / Tuning', 5, '64200', 'Expense'),

  createAccount('64300', 'IT & Electrical', 3, '64000', 'Expense'),
  createAccount('64310-01', 'Computer/CCTV Maintenance', 5, '64300', 'Expense'),
  createAccount('64310-02', 'UPS Battery Replacement', 5, '64300', 'Expense'),

  // --- 65000 Admin & Regulatory ---
  createAccount('65000', 'Admin & Regulatory', 2, '60000', 'Expense'),
  createAccount('65100', 'Premises', 3, '65000', 'Expense'),
  createAccount('65110-01', 'Factory Rent Expense', 5, '65100', 'Expense'),
  
  createAccount('65200', 'Govt & Taxes', 3, '65000', 'Expense'),
  createAccount('65210-01', 'Municipal Taxes / TMA', 5, '65200', 'Expense'),
  createAccount('65210-02', 'Traffic Challans / Fines', 5, '65200', 'Expense'),
  
  // "Rishwat" / Informal payments handled under Facilitation/Misc
  createAccount('65300', 'Miscellaneous', 3, '65000', 'Expense'),
  createAccount('65310-01', 'Facilitation Charges / Trade Exp', 5, '65300', 'Expense'), // Rishwat/Service Money
  createAccount('65310-02', 'General Cleaning Supplies', 5, '65300', 'Expense'),
];
