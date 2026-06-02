
import { Account } from '../../types';

// Helper to create account objects
const createAccount = (code: string, name: string, level: 1 | 2 | 3 | 4 | 5, parentCode: string | null, type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'): Account => {
  return {
    id: `GLS-ACC-${code}`,
    company: 'Glassco',
    code,
    name,
    level,
    parentId: parentCode ? `GLS-ACC-${parentCode}` : null,
    type
  };
};

export const GlasscoCOA: Account[] = [
  // ==========================================
  // 1. ASSETS
  // ==========================================
  createAccount('10000', 'ASSETS', 1, null, 'Asset'),

  // --- 11000 Non-Current Assets (Fixed Assets) ---
  createAccount('11000', 'Non-Current Assets', 2, '10000', 'Asset'),
  
  createAccount('11100', 'Property, Plant & Equipment', 3, '11000', 'Asset'),
  // Heavy Machinery
  createAccount('11110', 'Processing Machinery', 4, '11100', 'Asset'),
  createAccount('11110-01', 'Straight Line Polish Machine', 5, '11110', 'Asset'),
  createAccount('11110-02', 'Glass Grinding Machines', 5, '11110', 'Asset'),
  createAccount('11110-03', 'Drilling Machine', 5, '11110', 'Asset'),
  
  // Logistics Equipment
  createAccount('11120', 'Material Handling Equip', 4, '11100', 'Asset'),
  createAccount('11120-01', 'Glass A-Frame Trolleys', 5, '11120', 'Asset'),
  createAccount('11120-02', 'Glass Lifting Clamps', 5, '11120', 'Asset'),

  // --- 12000 Current Assets ---
  createAccount('12000', 'Current Assets', 2, '10000', 'Asset'),
  
  // Inventory
  createAccount('12100', 'Inventory', 3, '12000', 'Asset'),
  createAccount('12110', 'Stock in Trade', 4, '12100', 'Asset'),
  createAccount('12110-01', 'Raw Float Glass Stock', 5, '12110', 'Asset'),
  createAccount('12110-02', 'Processed Glass (FG)', 5, '12110', 'Asset'),
  createAccount('12120', 'Stores & Spares Inventory', 4, '12100', 'Asset'),
  createAccount('12120-01', 'Polish Wheels & Consumables', 5, '12120', 'Asset'),

  // Trade Receivables (Sales on Credit)
  createAccount('12200', 'Trade Receivables', 3, '12000', 'Asset'),
  createAccount('12210', 'Accounts Receivable', 4, '12200', 'Asset'),
  createAccount('12210-01', 'Receivable from Customers', 5, '12210', 'Asset'),
  createAccount('12210-02', 'Receivable from Related Parties (GTK/Nippon)', 5, '12210', 'Asset'),
  
  // Cash & Bank
  createAccount('12300', 'Cash & Bank', 3, '12000', 'Asset'),
  createAccount('12310-01', 'Petty Cash - Glassco', 5, '12300', 'Asset'),
  createAccount('12320-01', 'Bank Account - Corporate', 5, '12300', 'Asset'),

  // ==========================================
  // 2. LIABILITIES
  // ==========================================
  createAccount('20000', 'LIABILITIES', 1, null, 'Liability'),
  createAccount('21000', 'Current Liabilities', 2, '20000', 'Liability'),
  
  // Trade Payables
  createAccount('21100', 'Trade Payables', 3, '21000', 'Liability'),
  createAccount('21110', 'Accounts Payable', 4, '21100', 'Liability'),
  createAccount('21110-01', 'Payable to Glass Suppliers', 5, '21110', 'Liability'),
  createAccount('21110-02', 'Payable to Service Vendors (GTI/PSG)', 5, '21110', 'Liability'),
  createAccount('21110-03', 'Payable to Transport Vendors', 5, '21110', 'Liability'),

  // Advances (Unearned Revenue) - Liability until delivery
  createAccount('21200', 'Advances & Unearned Revenue', 3, '21000', 'Liability'),
  createAccount('21210-01', 'Advance from Customers (Sales)', 5, '21200', 'Liability'),

  // ==========================================
  // 3. EQUITY
  // ==========================================
  createAccount('30000', 'EQUITY', 1, null, 'Equity'),
  createAccount('31000', 'Owner Capital', 2, '30000', 'Equity'),
  createAccount('31100-01', 'Capital Account', 5, '31000', 'Equity'),

  // ==========================================
  // 4. REVENUE (Sales)
  // ==========================================
  createAccount('40000', 'REVENUE', 1, null, 'Revenue'),
  createAccount('41000', 'Sales Income', 2, '40000', 'Revenue'),
  
  // Product Sales
  createAccount('41100', 'Product Sales', 3, '41000', 'Revenue'),
  createAccount('41100-01', 'Sales - Tempered Glass', 5, '41100', 'Revenue'),
  createAccount('41100-02', 'Sales - Double Glazed Units', 5, '41100', 'Revenue'),
  createAccount('41100-03', 'Sales - Laminated Glass', 5, '41100', 'Revenue'),
  
  // Service Revenue (Labor Only)
  createAccount('41200', 'Service Revenue', 3, '41000', 'Revenue'),
  createAccount('41200-01', 'Revenue - Processing Services', 5, '41200', 'Revenue'),
  
  // Other Income
  createAccount('41300', 'Other Income', 3, '41000', 'Revenue'),
  createAccount('41300-01', 'Scrap Sales (Cullots)', 5, '41300', 'Revenue'),

  // ==========================================
  // 5. COST OF SALES (DIRECT PRODUCTION COSTS)
  // ==========================================
  createAccount('50000', 'COST OF SALES', 1, null, 'Expense'),

  // 51 - Material Direct
  createAccount('51000', 'Direct Material Cost', 2, '50000', 'Expense'),
  createAccount('51100-01', 'Purchase - Raw Float Glass', 5, '51000', 'Expense'),
  createAccount('51100-02', 'Carriage Inward (Trucking Raw Glass)', 5, '51000', 'Expense'),

  // 52 - Processing Services (Outsourced)
  createAccount('52000', 'Processing Services Cost', 2, '50000', 'Expense'),
  createAccount('52100-01', 'Tempering Charges', 5, '52000', 'Expense'),
  createAccount('52100-02', 'Double Glazing Charges', 5, '52000', 'Expense'),
  createAccount('52100-03', 'Lamination Charges', 5, '52000', 'Expense'),

  // 53 - Production Overheads & Tools
  createAccount('53000', 'Production Overheads', 2, '50000', 'Expense'),
  
  // Consumables
  createAccount('53100', 'Consumables & Tools', 3, '53000', 'Expense'),
  createAccount('53110-01', 'Diamond Cutters & Wheels', 5, '53100', 'Expense'),
  createAccount('53110-02', 'Polish Material (Cerium/Powder)', 5, '53100', 'Expense'),
  createAccount('53110-03', 'PPE (Gloves, Goggles, Arm Guards)', 5, '53100', 'Expense'),
  createAccount('53110-04', 'Measuring Tools (Inch Tapes)', 5, '53100', 'Expense'),
  
  // Internal Logistics
  createAccount('53200', 'Plant Logistics', 3, '53000', 'Expense'),
  createAccount('53210-01', 'Vehicle Hire (Inter-Plant Movement)', 5, '53200', 'Expense'),
  createAccount('53210-02', 'Loading/Unloading Labor', 5, '53200', 'Expense'),

  // Losses
  createAccount('53300', 'Production Losses', 3, '53000', 'Expense'),
  createAccount('53310-01', 'Cost of Breakage (Wastage)', 5, '53300', 'Expense'),
  createAccount('53310-02', 'Wrong Cut / Re-Cut Expense', 5, '53300', 'Expense'),

  // 54 - Direct Labor
  createAccount('54000', 'Direct Labor', 2, '50000', 'Expense'),
  createAccount('54100-01', 'Production Staff Salaries', 5, '54000', 'Expense'),
  createAccount('54100-02', 'Production Overtime', 5, '54000', 'Expense'),
  createAccount('54100-03', 'Production Refreshment/Tea', 5, '54000', 'Expense'),

  // ==========================================
  // 6. OPERATING EXPENSES (INDIRECT)
  // ==========================================
  createAccount('60000', 'OPERATING EXPENSES', 1, null, 'Expense'),
  
  // Admin
  createAccount('61000', 'Admin & General', 2, '60000', 'Expense'),
  createAccount('61100-01', 'Printing & Stationery', 5, '61000', 'Expense'),
  
  // Shared Costs (From Factory Entity)
  createAccount('62000', 'Shared Allocations', 2, '60000', 'Expense'),
  createAccount('62100-01', 'Shared Factory Rent Allocation', 5, '62000', 'Expense'),
  createAccount('62100-02', 'Shared Electricity Allocation', 5, '62000', 'Expense'),
  createAccount('62100-03', 'Shared Internet/Comms Allocation', 5, '62000', 'Expense'),
];
