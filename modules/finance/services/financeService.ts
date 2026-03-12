import { Account, LedgerTransaction, CostCenter, PettyCashEntry, RecurringExpense, FinancialEvent, FinancialMappingRule, GLConfiguration } from '../types/finance';
import { Company } from '../../shared/types';
import { initDB } from '../../shared/services/db';

const KEYS = {
  ACCOUNTS: 'gtk_erp_accounts',
  LEDGER: 'gtk_erp_ledger',
  COST_CENTERS: 'gtk_erp_cost_centers',
  PETTY_CASH: 'gtk_erp_petty_cash',
  RECURRING_EXPENSES: 'gtk_erp_recurring_expenses',
  FINANCIAL_EVENTS: 'gtk_erp_financial_events',
  MAPPING_RULES: 'gtk_erp_mapping_rules',
  GL_CONFIG: 'gtk_erp_gl_config',
};

import { bgSaveToIDB, safeParse } from '../../shared/services/utils';

export const FinanceService = {
  getAccounts: (): Account[] => safeParse(KEYS.ACCOUNTS),
  
  loadAccountsAsync: async () => {
    try {
      const db = await initDB();
      const accounts = await db.getAll('accounts');
      if (accounts && accounts.length > 0) {
        const local = FinanceService.getAccounts();
        if (accounts.length > local.length) {
          console.log("FinanceService: Restoring accounts from IndexedDB...");
          localStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(accounts));
          return accounts;
        }
      }
    } catch (e) {
      console.warn("FinanceService: IndexedDB load failed", e);
    }
    return FinanceService.getAccounts();
  },

  saveAccounts: (data: Account[]) => {
    try {
      localStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(data));
      bgSaveToIDB('accounts', data);
    } catch (e) {
      console.error("FinanceService: Failed to save accounts to localStorage", e);
      bgSaveToIDB('accounts', data);
    }
  },
  
  seedDefaultCOA: () => {
    console.log("FinanceService: Starting COA seeding...");
    try {
      const existing = FinanceService.getAccounts();
      const newAccounts: Account[] = [...existing];

      const companies: Company[] = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];
      const defaultAccounts: Account[] = [];

      companies.forEach(company => {
          // Level 1
          const assets = { id: `A10-${company}`, company, code: '10', name: 'ASSETS', level: 1 as const, parentId: null, type: 'Asset' as const };
          const liabilities = { id: `L20-${company}`, company, code: '20', name: 'LIABILITIES', level: 1 as const, parentId: null, type: 'Liability' as const };
          const equity = { id: `E30-${company}`, company, code: '30', name: 'EQUITY', level: 1 as const, parentId: null, type: 'Equity' as const };
          const revenue = { id: `R40-${company}`, company, code: '40', name: 'REVENUE', level: 1 as const, parentId: null, type: 'Revenue' as const };
          const expenses = { id: `EX50-${company}`, company, code: '50', name: 'EXPENSES', level: 1 as const, parentId: null, type: 'Expense' as const };
          
          // Level 2
          const currentAssets = { id: `A11-${company}`, company, code: '11', name: 'CURRENT ASSETS', level: 2 as const, parentId: assets.id, type: 'Asset' as const };
          const nonCurrentAssets = { id: `A12-${company}`, company, code: '12', name: 'NON-CURRENT ASSETS', level: 2 as const, parentId: assets.id, type: 'Asset' as const };
          const currentLiabilities = { id: `L21-${company}`, company, code: '21', name: 'CURRENT LIABILITIES', level: 2 as const, parentId: liabilities.id, type: 'Liability' as const };
          const nonCurrentLiabilities = { id: `L22-${company}`, company, code: '22', name: 'NON-CURRENT LIABILITIES', level: 2 as const, parentId: liabilities.id, type: 'Liability' as const };
          const shareCapitalReserves = { id: `E31-${company}`, company, code: '31', name: 'SHARE CAPITAL & RESERVES', level: 2 as const, parentId: equity.id, type: 'Equity' as const };
          const operatingRevenue = { id: `R41-${company}`, company, code: '41', name: 'OPERATING REVENUE', level: 2 as const, parentId: revenue.id, type: 'Revenue' as const };
          const directCosts = { id: `EX51-${company}`, company, code: '51', name: 'DIRECT COSTS (COGS)', level: 2 as const, parentId: expenses.id, type: 'Expense' as const };
          const operatingExpenses = { id: `EX52-${company}`, company, code: '52', name: 'OPERATING EXPENSES', level: 2 as const, parentId: expenses.id, type: 'Expense' as const };
          const financialCharges = { id: `EX53-${company}`, company, code: '53', name: 'FINANCIAL CHARGES', level: 2 as const, parentId: expenses.id, type: 'Expense' as const };

          // Level 3
          const cashBank = { id: `A111-${company}`, company, code: '111', name: 'CASH & BANK', level: 3 as const, parentId: currentAssets.id, type: 'Asset' as const };
          const accountsReceivable = { id: `A112-${company}`, company, code: '112', name: 'ACCOUNTS RECEIVABLE', level: 3 as const, parentId: currentAssets.id, type: 'Asset' as const };
          const inventory = { id: `A113-${company}`, company, code: '113', name: 'INVENTORY', level: 3 as const, parentId: currentAssets.id, type: 'Asset' as const };
          const loansAdvances = { id: `A114-${company}`, company, code: '114', name: 'LOANS & ADVANCES', level: 3 as const, parentId: currentAssets.id, type: 'Asset' as const };
          const ppe = { id: `A121-${company}`, company, code: '121', name: 'PROPERTY, PLANT & EQUIPMENT', level: 3 as const, parentId: nonCurrentAssets.id, type: 'Asset' as const };
          const accountsPayable = { id: `L211-${company}`, company, code: '211', name: 'ACCOUNTS PAYABLE CONTROL', level: 3 as const, parentId: currentLiabilities.id, type: 'Liability' as const };
          const accruedExpenses = { id: `L212-${company}`, company, code: '212', name: 'HR PAYABLES CONTROL', level: 3 as const, parentId: currentLiabilities.id, type: 'Liability' as const };
          const shortTermBorrowings = { id: `L213-${company}`, company, code: '213', name: 'SHORT TERM BORROWINGS', level: 3 as const, parentId: currentLiabilities.id, type: 'Liability' as const };
          const shareCapital = { id: `E311-${company}`, company, code: '311', name: 'SHARE CAPITAL', level: 3 as const, parentId: shareCapitalReserves.id, type: 'Equity' as const };
          const retainedEarnings = { id: `E312-${company}`, company, code: '312', name: 'RETAINED EARNINGS', level: 3 as const, parentId: shareCapitalReserves.id, type: 'Equity' as const };
          const salesRevenue = { id: `R411-${company}`, company, code: '411', name: 'SALES REVENUE', level: 3 as const, parentId: operatingRevenue.id, type: 'Revenue' as const };
          const rawMaterialConsumed = { id: `EX511-${company}`, company, code: '511', name: 'RAW MATERIAL CONSUMED', level: 3 as const, parentId: directCosts.id, type: 'Expense' as const };
          const directLabor = { id: `EX512-${company}`, company, code: '512', name: 'DIRECT LABOR', level: 3 as const, parentId: directCosts.id, type: 'Expense' as const };
          const factoryOverheads = { id: `EX513-${company}`, company, code: '513', name: 'FACTORY OVERHEADS', level: 3 as const, parentId: directCosts.id, type: 'Expense' as const };
          const adminExpenses = { id: `EX521-${company}`, company, code: '521', name: 'ADMIN EXPENSES', level: 3 as const, parentId: operatingExpenses.id, type: 'Expense' as const };
          const sellingDistribution = { id: `EX522-${company}`, company, code: '522', name: 'SELLING & DISTRIBUTION', level: 3 as const, parentId: operatingExpenses.id, type: 'Expense' as const };
          const bankChargesInterest = { id: `EX531-${company}`, company, code: '531', name: 'BANK CHARGES & INTEREST', level: 3 as const, parentId: financialCharges.id, type: 'Expense' as const };

          // Level 4
          const cashInHand = { id: `A1111-${company}`, company, code: '1111', name: 'CASH IN HAND', level: 4 as const, parentId: cashBank.id, type: 'Asset' as const };
          const cashAtBank = { id: `A1112-${company}`, company, code: '1112', name: 'CASH AT BANK', level: 4 as const, parentId: cashBank.id, type: 'Asset' as const };
          const tradeDebtors = { id: `A1121-${company}`, company, code: '1121', name: 'TRADE DEBTORS', level: 4 as const, parentId: accountsReceivable.id, type: 'Asset' as const };
          const rawMaterialInv = { id: `A1131-${company}`, company, code: '1131', name: 'RAW MATERIAL INVENTORY', level: 4 as const, parentId: inventory.id, type: 'Asset' as const };
          const finishedGoodsInv = { id: `A1132-${company}`, company, code: '1132', name: 'FINISHED GOODS INVENTORY', level: 4 as const, parentId: inventory.id, type: 'Asset' as const };
          const employeeLoansAdvances = { id: `A1141-${company}`, company, code: '1141', name: 'EMPLOYEE LOANS CONTROL', level: 4 as const, parentId: loansAdvances.id, type: 'Asset' as const };
          const machineryEquipment = { id: `A1211-${company}`, company, code: '1211', name: 'MACHINERY & EQUIPMENT', level: 4 as const, parentId: ppe.id, type: 'Asset' as const };
          const furnitureFixtures = { id: `A1212-${company}`, company, code: '1212', name: 'FURNITURE & FIXTURES', level: 4 as const, parentId: ppe.id, type: 'Asset' as const };
          const tradeCreditors = { id: `L2111-${company}`, company, code: '2111', name: 'TRADE CREDITORS', level: 4 as const, parentId: accountsPayable.id, type: 'Liability' as const };
          const payrollLiabilities = { id: `L2121-${company}`, company, code: '2121', name: 'EMPLOYEE DUES PAYABLE', level: 4 as const, parentId: accruedExpenses.id, type: 'Liability' as const };
          const taxPayable = { id: `L2122-${company}`, company, code: '2122', name: 'TAX PAYABLE', level: 4 as const, parentId: accruedExpenses.id, type: 'Liability' as const };
          const localSales = { id: `R4111-${company}`, company, code: '4111', name: 'LOCAL SALES', level: 4 as const, parentId: salesRevenue.id, type: 'Revenue' as const };
          const exportSales = { id: `R4112-${company}`, company, code: '4112', name: 'EXPORT SALES', level: 4 as const, parentId: salesRevenue.id, type: 'Revenue' as const };
          const materialPurchases = { id: `EX5111-${company}`, company, code: '5111', name: 'MATERIAL PURCHASES', level: 4 as const, parentId: rawMaterialConsumed.id, type: 'Expense' as const };
          const factoryWages = { id: `EX5121-${company}`, company, code: '5121', name: 'FACTORY WAGES', level: 4 as const, parentId: directLabor.id, type: 'Expense' as const };
          const factoryUtilities = { id: `EX5131-${company}`, company, code: '5131', name: 'FACTORY UTILITIES', level: 4 as const, parentId: factoryOverheads.id, type: 'Expense' as const };
          const officeSalaries = { id: `EX5211-${company}`, company, code: '5211', name: 'OFFICE SALARIES', level: 4 as const, parentId: adminExpenses.id, type: 'Expense' as const };
          const officeUtilities = { id: `EX5212-${company}`, company, code: '5212', name: 'OFFICE UTILITIES', level: 4 as const, parentId: adminExpenses.id, type: 'Expense' as const };
          const repairMaintenance = { id: `EX5213-${company}`, company, code: '5213', name: 'REPAIR & MAINTENANCE', level: 4 as const, parentId: adminExpenses.id, type: 'Expense' as const };
          const procurementMaterials = { id: `EX5214-${company}`, company, code: '5214', name: 'PROCUREMENT & MATERIALS', level: 4 as const, parentId: adminExpenses.id, type: 'Expense' as const };
          const bankCharges = { id: `EX5311-${company}`, company, code: '5311', name: 'BANK CHARGES', level: 4 as const, parentId: bankChargesInterest.id, type: 'Expense' as const };

          // Level 5
          const mainCash = { id: `A111101-${company}`, company, code: '111101', name: 'MAIN CASH ACCOUNT', level: 5 as const, parentId: cashInHand.id, type: 'Asset' as const };
          const pettyCash = { id: `A111102-${company}`, company, code: '111102', name: 'PETTY CASH FUND', level: 5 as const, parentId: cashInHand.id, type: 'Asset' as const };
          const meezanBank = { id: `A111201-${company}`, company, code: '111201', name: 'MEEZAN BANK A/C', level: 5 as const, parentId: cashAtBank.id, type: 'Asset' as const };
          const hblBank = { id: `A111202-${company}`, company, code: '111202', name: 'HBL A/C', level: 5 as const, parentId: cashAtBank.id, type: 'Asset' as const };
          const localCustomers = { id: `A112101-${company}`, company, code: '112101', name: 'LOCAL CUSTOMERS', level: 5 as const, parentId: tradeDebtors.id, type: 'Asset' as const };
          const rawGlassStock = { id: `A113101-${company}`, company, code: '113101', name: 'RAW GLASS STOCK', level: 5 as const, parentId: rawMaterialInv.id, type: 'Asset' as const };
          const temperedGlassStock = { id: `A113201-${company}`, company, code: '113201', name: 'TEMPERED GLASS STOCK', level: 5 as const, parentId: finishedGoodsInv.id, type: 'Asset' as const };
          const staffAdvances = { id: `A114101-${company}`, company, code: '114101', name: 'STAFF ADVANCES', level: 5 as const, parentId: employeeLoansAdvances.id, type: 'Asset' as const };
          const temperingFurnace = { id: `A121101-${company}`, company, code: '121101', name: 'TEMPERING FURNACE', level: 5 as const, parentId: machineryEquipment.id, type: 'Asset' as const };
          const localSuppliers = { id: `L211101-${company}`, company, code: '211101', name: 'LOCAL SUPPLIERS', level: 5 as const, parentId: tradeCreditors.id, type: 'Liability' as const };
          const salariesPayable = { id: `L212101-${company}`, company, code: '212101', name: 'SALARIES PAYABLE', level: 5 as const, parentId: payrollLiabilities.id, type: 'Liability' as const };
          const salesTaxPayable = { id: `L212201-${company}`, company, code: '212201', name: 'SALES TAX PAYABLE', level: 5 as const, parentId: taxPayable.id, type: 'Liability' as const };
          const salesTemperedGlass = { id: `R411101-${company}`, company, code: '411101', name: 'SALES - TEMPERED GLASS', level: 5 as const, parentId: localSales.id, type: 'Revenue' as const };
          const salesRawGlass = { id: `R411102-${company}`, company, code: '411102', name: 'SALES - RAW GLASS', level: 5 as const, parentId: localSales.id, type: 'Revenue' as const };
          const purchasesRawGlass = { id: `EX511101-${company}`, company, code: '511101', name: 'PURCHASES - RAW GLASS', level: 5 as const, parentId: materialPurchases.id, type: 'Expense' as const };
          const wagesProductionStaff = { id: `EX512101-${company}`, company, code: '512101', name: 'WAGES - PRODUCTION STAFF', level: 5 as const, parentId: factoryWages.id, type: 'Expense' as const };
          const electricityBillFactory = { id: `EX513101-${company}`, company, code: '513101', name: 'ELECTRICITY BILL - FACTORY', level: 5 as const, parentId: factoryUtilities.id, type: 'Expense' as const };
          const salariesAdminStaff = { id: `EX521101-${company}`, company, code: '521101', name: 'SALARIES - ADMIN STAFF', level: 5 as const, parentId: officeSalaries.id, type: 'Expense' as const };
          const electricityBillOffice = { id: `EX521201-${company}`, company, code: '521201', name: 'ELECTRICITY BILL - OFFICE', level: 5 as const, parentId: officeUtilities.id, type: 'Expense' as const };
          const bankChargesFee = { id: `EX531101-${company}`, company, code: '531101', name: 'BANK CHARGES & FEE', level: 5 as const, parentId: bankCharges.id, type: 'Expense' as const };

          defaultAccounts.push(
              assets, liabilities, equity, revenue, expenses,
              currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities, shareCapitalReserves, operatingRevenue, directCosts, operatingExpenses, financialCharges,
              cashBank, accountsReceivable, inventory, loansAdvances, ppe, accountsPayable, accruedExpenses, shortTermBorrowings, shareCapital, retainedEarnings, salesRevenue, rawMaterialConsumed, directLabor, factoryOverheads, adminExpenses, sellingDistribution, bankChargesInterest,
              cashInHand, cashAtBank, tradeDebtors, rawMaterialInv, finishedGoodsInv, employeeLoansAdvances, machineryEquipment, furnitureFixtures, tradeCreditors, payrollLiabilities, taxPayable, localSales, exportSales, materialPurchases, factoryWages, factoryUtilities, officeSalaries, officeUtilities, repairMaintenance, procurementMaterials, bankCharges,
              mainCash, pettyCash, meezanBank, hblBank, localCustomers, rawGlassStock, temperedGlassStock, staffAdvances, temperingFurnace, localSuppliers, salariesPayable, salesTaxPayable, salesTemperedGlass, salesRawGlass, purchasesRawGlass, wagesProductionStaff, electricityBillFactory, salariesAdminStaff, electricityBillOffice, bankChargesFee
          );
      });

      // Merge: Add only if ID doesn't exist
      let addedCount = 0;
      defaultAccounts.forEach(da => {
          if (!newAccounts.some(a => a.id === da.id)) {
              newAccounts.push(da);
              addedCount++;
          }
      });

      if (addedCount > 0) {
          console.log(`FinanceService: Seeding ${addedCount} new accounts.`);
          FinanceService.saveAccounts(newAccounts);
      } else {
          console.log("FinanceService: No new accounts to seed.");
      }
    } catch (err) {
      console.error("FinanceService: Critical error during COA seeding", err);
    }
  },

  getLedger: (): LedgerTransaction[] => safeParse(KEYS.LEDGER),
  getLedgerAsync: async (): Promise<LedgerTransaction[]> => {
    try {
      const db = await initDB();
      const items = await db.getAll('ledger');
      if (items.length === 0) {
        const lsItems = safeParse(KEYS.LEDGER);
        if (lsItems.length > 0) {
            await bgSaveToIDB('ledger', lsItems);
            return lsItems;
        }
      }
      return items;
    } catch (e) {
      return safeParse(KEYS.LEDGER);
    }
  },
  saveLedger: (data: LedgerTransaction[]) => {
    const recent = data.slice(-1000); 
    localStorage.setItem(KEYS.LEDGER, JSON.stringify(recent));
    bgSaveToIDB('ledger', data);
  },
  getCostCenters: (): CostCenter[] => safeParse(KEYS.COST_CENTERS),
  saveCostCenters: (data: CostCenter[]) => localStorage.setItem(KEYS.COST_CENTERS, JSON.stringify(data)),
  getPettyCashEntries: (): PettyCashEntry[] => safeParse(KEYS.PETTY_CASH),
  savePettyCashEntries: (data: PettyCashEntry[]) => localStorage.setItem(KEYS.PETTY_CASH, JSON.stringify(data)),
  getRecurringExpenses: (): RecurringExpense[] => safeParse(KEYS.RECURRING_EXPENSES),
  saveRecurringExpenses: (data: RecurringExpense[]) => localStorage.setItem(KEYS.RECURRING_EXPENSES, JSON.stringify(data)),
  getFinancialEvents: (): FinancialEvent[] => safeParse(KEYS.FINANCIAL_EVENTS),
  saveFinancialEvents: (data: FinancialEvent[]) => localStorage.setItem(KEYS.FINANCIAL_EVENTS, JSON.stringify(data)),
  getMappingRules: (): FinancialMappingRule[] => safeParse(KEYS.MAPPING_RULES),
  saveMappingRules: (data: FinancialMappingRule[]) => localStorage.setItem(KEYS.MAPPING_RULES, JSON.stringify(data)),
  getGLConfig: (): GLConfiguration[] => safeParse(KEYS.GL_CONFIG),
  saveGLConfig: (data: GLConfiguration[]) => localStorage.setItem(KEYS.GL_CONFIG, JSON.stringify(data)),
  recordTransaction: (tx: LedgerTransaction) => {
    const all = FinanceService.getLedger();
    FinanceService.saveLedger([...all, tx]);
  },

  // Automated G/L Mapping & Account Creation
  ensureAccount: (company: Company, name: string, level: 1|2|3|4|5, parentId: string | null, type: any, baseCode: string): Account => {
    const accounts = FinanceService.getAccounts();
    // FIX: Check company to prevent account sharing between different companies
    const existing = accounts.find(a => a.company === company && a.name === name && a.level === level && a.parentId === parentId);
    if (existing) return existing;

    // Generate new code based on parent or baseCode
    const sameLevel = accounts.filter(a => a.company === company && a.parentId === parentId && a.level === level);
    const nextSuffix = (sameLevel.length + 1).toString().padStart(2, '0');
    const newCode = parentId ? `${accounts.find(a => a.id === parentId)?.code}${nextSuffix}` : `${baseCode}${nextSuffix}`;

    const newAccount: Account = {
      id: `ACC-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      company,
      code: newCode,
      name,
      level,
      parentId,
      type
    };

    FinanceService.saveAccounts([...accounts, newAccount]);
    return newAccount;
  },

  postAutomatedRequisitionEntry: (requisition: any) => {
    const company = requisition.company;
    const date = new Date().toISOString().split('T')[0];
    
    // 1. Define Root/Control Accounts (Level 1-4)
    // Level 1: Assets
    const assets = FinanceService.ensureAccount(company, 'ASSETS', 1, null, 'Asset', '10');
    // Level 2: Current Assets
    const currentAssets = FinanceService.ensureAccount(company, 'CURRENT ASSETS', 2, assets.id, 'Asset', '11');
    
    let debitAccount: Account;
    let creditAccount: Account;
    let description = `Automated Entry for Requisition: ${requisition.id}`;

    if (requisition.category === 'HR') {
      // Level 3: Loans & Advances
      const loansAdvances = FinanceService.ensureAccount(company, 'LOANS & ADVANCES', 3, currentAssets.id, 'Asset', '114');
      // Level 4: Employee Loans Control
      const empLoansControl = FinanceService.ensureAccount(company, 'EMPLOYEE LOANS CONTROL', 4, loansAdvances.id, 'Asset', '1141');
      // Level 5: Specific Employee Account
      debitAccount = FinanceService.ensureAccount(company, requisition.employeeName || `EMP-${requisition.employeeId}`, 5, empLoansControl.id, 'Asset', '11410');
      
      // Credit: HR Payables Control
      const liabilities = FinanceService.ensureAccount(company, 'LIABILITIES', 1, null, 'Liability', '20');
      const currentLiabilities = FinanceService.ensureAccount(company, 'CURRENT LIABILITIES', 2, liabilities.id, 'Liability', '21');
      const hrPayables = FinanceService.ensureAccount(company, 'HR PAYABLES CONTROL', 3, currentLiabilities.id, 'Liability', '212');
      const empDuesControl = FinanceService.ensureAccount(company, 'EMPLOYEE DUES PAYABLE', 4, hrPayables.id, 'Liability', '2121');
      creditAccount = FinanceService.ensureAccount(company, 'SALARIES PAYABLE', 5, empDuesControl.id, 'Liability', '21210');
      
      description = `Loan/Advance Approved for ${requisition.employeeName} (${requisition.id})`;
    } else {
      // Material/General Requisitions
      // Level 1: Expenses
      const expenses = FinanceService.ensureAccount(company, 'EXPENSES', 1, null, 'Expense', '50');
      // Level 2: Operating Expenses
      const opExpenses = FinanceService.ensureAccount(company, 'OPERATING EXPENSES', 2, expenses.id, 'Expense', '52');
      // Level 3: Material/Procurement
      const adminExpenses = FinanceService.ensureAccount(company, 'ADMIN EXPENSES', 3, opExpenses.id, 'Expense', '521');
      
      const procurement = FinanceService.ensureAccount(company, 'PROCUREMENT & MATERIALS', 4, adminExpenses.id, 'Expense', '5214');
      debitAccount = FinanceService.ensureAccount(company, requisition.subCategory || 'GENERAL PROCUREMENT', 5, procurement.id, 'Expense', '52140');
      
      // Credit: Accounts Payable Control
      const liabilities = FinanceService.ensureAccount(company, 'LIABILITIES', 1, null, 'Liability', '20');
      const currentLiabilities = FinanceService.ensureAccount(company, 'CURRENT LIABILITIES', 2, liabilities.id, 'Liability', '21');
      const accountsPayable = FinanceService.ensureAccount(company, 'ACCOUNTS PAYABLE CONTROL', 3, currentLiabilities.id, 'Liability', '211');
      const tradeCreditors = FinanceService.ensureAccount(company, 'TRADE CREDITORS', 4, accountsPayable.id, 'Liability', '2111');
      creditAccount = FinanceService.ensureAccount(company, 'LOCAL SUPPLIERS', 5, tradeCreditors.id, 'Liability', '21110');
      
      description = `Material Requisition Approved: ${requisition.id} - ${requisition.headerText}`;
    }

    const tx: LedgerTransaction = {
      id: `TX-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      company,
      docType: 'SA',
      docDate: requisition.date,
      date: date,
      description,
      referenceId: requisition.id,
      status: 'Posted',
      details: [
        { accountId: debitAccount.id, debit: requisition.totalValue || requisition.loanAmount || 0, credit: 0, text: 'Auto-Debit on Approval' },
        { accountId: creditAccount.id, debit: 0, credit: requisition.totalValue || requisition.loanAmount || 0, text: 'Auto-Credit on Approval' }
      ]
    };

    FinanceService.recordTransaction(tx);
    return tx;
  }
};
