import { Company } from '../../shared/types/core';
import { LedgerStatus } from '../../shared/constants';

export type { LedgerStatus };

export interface Account { 
  id: string; 
  company: Company; 
  code: string; 
  name: string; 
  level: 1 | 2 | 3 | 4 | 5; 
  parentId: string | null; 
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'; 
}

export type LedgerDocType = 'SA' | 'KR' | 'DR' | 'DZ' | 'KZ' | 'CJ' | 'OB' | 'PV' | 'RV' | 'JV';

export interface LedgerTransaction { 
  id: string; 
  company: Company; 
  docType: LedgerDocType; 
  docDate: string; 
  date: string; 
  description: string; 
  referenceId: string; 
  status: LedgerStatus; 
  details: { 
    accountId: string; 
    debit: number; 
    credit: number; 
    text?: string; 
    costCenterId?: string; 
  }[];
  reqId?: string; 
}

export interface CostCenter { 
  id: string; 
  company: Company; 
  code: string; 
  name: string; 
  department: string; 
  manager: string; 
  category: 'F' | 'H' | 'W' | 'V' | 'L'; 
  hierarchyArea: string; 
  budgetMonthly?: number;          // monthly budget limit (PKR)
  budgetYearly?: number;           // annual budget limit (PKR)
  alertThreshold?: number;         // % at which to warn (default 80)
  // ── Phase 1: CMA additions ────────────────────────────────────────
  pettyCashFloat?: number;         // max cash float held at any time (PKR)
  pettyCashMonthlyBudget?: number; // max petty cash spend per month (PKR)
}

export interface PettyCashEntry { 
  id: string; 
  company: Company; 
  date: string; 
  description: string; 
  type: 'Receipt' | 'Payment'; 
  amount: number; 
  balance: number; 
  recordedBy: string; 
  status: 'Posted' | 'Parked' | 'Ignored'; 
  glAccountId?: string; 
  businessTransaction?: string; 
  referenceDoc?: string; 
  targetCompany?: Company; 
  costCenterId?: string; 
}

export interface RecurringExpense { 
  id: string; 
  company: Company; 
  name: string; 
  amount: number; 
  debitAccountId: string; 
  creditAccountId: string; 
  costCenterId: string; 
  dayOfMonth: number; 
  lastPostedMonth?: string; 
}

export interface FinancialEvent { 
  id: string; 
  company: Company; 
  date: string; 
  sourceModule: 'Inventory' | 'PettyCash' | 'Sales' | 'HR'; 
  description: string; 
  amount: number; 
  referenceId?: string; 
  status: 'Pending' | 'Posted' | 'Ignored'; 
  suggestedGlId?: string; 
}

export interface FinancialMappingRule { 
  id: string; 
  company: Company; 
  keyword: string; 
  targetGlId: string; 
  targetCostCenterId?: string; 
}

export interface GLConfiguration { 
  id: string; 
  company: Company; 
  eventType: 'Sale' | 'Purchase' | 'Expense' | 'Trip' | 'Payroll'; 
  subType: string; 
  debitAccountId: string; 
  creditAccountId: string; 
}

export interface FinanceMetric {
  cashPosition: number;
  accountsReceivable: number;
  accountsPayable: number;
  netProfit: number;
  topExpenses: { category: string; amount: number }[];
}

// ── Invoice & Payment Receipt ─────────────────────────────────────────
export interface Invoice {
  id: string;
  company: Company;
  orderId: string;
  orderNo: string;
  clientId: string;
  clientName: string;
  date: string;
  dueDate: string;
  totalAmount: number;
  receivedAmount: number;
  balance: number;
  status: 'Outstanding' | 'Partial' | 'Paid' | 'Overdue';
  glTxId: string;
  payments: PaymentReceipt[];
}

export interface PaymentReceipt {
  id: string;
  invoiceId: string;
  date: string;
  amount: number;
  method: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Online';
  reference: string;
  glTxId: string;
}
