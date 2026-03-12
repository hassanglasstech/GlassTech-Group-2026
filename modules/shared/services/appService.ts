import { initDB } from './db';
import { FactoryCOA } from '../data/factory/FactoryCOA';
import { GlasscoCOA } from '../data/glassco/GlasscoCOA';
import { safeParse } from './utils';
import { Company, Vendor, ActivityLog } from '../types/index';
import { HRService } from '../../hr/services/hrService';
import { FinanceService } from '../../finance/services/financeService';
import { SalesService } from '../../sales/services/salesService';
import { InventoryService } from '../../procurement/services/inventoryService';
import { ProductionService } from '../../production/services/productionService';

const KEYS = {
  DB_VERSION: 'gtk_erp_db_version',
  LAST_AUTO_BACKUP: 'gtk_erp_last_auto_backup',
  ACCOUNTS: 'gtk_erp_accounts',
  VENDORS: 'gtk_erp_vendors',
  ACTIVITY_LOGS: 'gtk_erp_activity_logs',
};

const CURRENT_VERSION = '1.0';

const DEFAULT_TEMPERING_VENDORS: Vendor[] = [
    {
        id: 'VEND-PSG-001',
        name: 'PSG',
        nickName: 'PSG',
        type: 'Tempering',
        company: 'Glassco',
        address: 'Korangi Industrial Area',
        contactPerson: 'Sales Desk',
        phone: '0300-1234567',
        registrationDate: '2026-01-01',
        rates: [
            { id: 'R1', thickness: '12mm', type: 'Clear', rate: 45, effectiveDate: '2026-01-01' },
            { id: 'R2', thickness: '12mm', type: 'Reflective', rate: 55, effectiveDate: '2026-01-01' },
            { id: 'R3', thickness: '10mm', type: 'All', rate: 40, effectiveDate: '2026-01-01' },
            { id: 'R4', thickness: '8mm', type: 'All', rate: 35, effectiveDate: '2026-01-01' },
            { id: 'R5', thickness: '6mm', type: 'All', rate: 28, effectiveDate: '2026-01-01' },
            { id: 'R6', thickness: '5mm', type: 'All', rate: 22, effectiveDate: '2026-01-01' },
        ]
    },
    {
        id: 'VEND-AHM-002',
        name: 'AHM',
        nickName: 'AHM',
        type: 'Tempering',
        company: 'Glassco',
        address: 'Landhi Industrial Area',
        contactPerson: 'Manager AHM',
        phone: '0321-9876543',
        registrationDate: '2026-01-01',
        rates: [
            { id: 'R1', thickness: '12mm', type: 'Clear', rate: 42, effectiveDate: '2026-01-01' },
            { id: 'R2', thickness: '12mm', type: 'Reflective', rate: 52, effectiveDate: '2026-01-01' },
            { id: 'R3', thickness: '10mm', type: 'All', rate: 38, effectiveDate: '2026-01-01' },
            { id: 'R4', thickness: '8mm', type: 'All', rate: 32, effectiveDate: '2026-01-01' },
        ]
    },
    {
        id: 'VEND-LAK-003',
        name: 'LAKHANI',
        nickName: 'Lakhani',
        type: 'Tempering',
        company: 'Glassco',
        address: 'Site Area',
        contactPerson: 'Lakhani Sales',
        phone: '0333-5556667',
        registrationDate: '2026-01-01',
        rates: [
            { id: 'R1', thickness: '12mm', type: 'All', rate: 45, effectiveDate: '2026-01-01' },
            { id: 'R2', thickness: '10mm', type: 'All', rate: 40, effectiveDate: '2026-01-01' },
            { id: 'R3', thickness: '8mm', type: 'All', rate: 35, effectiveDate: '2026-01-01' },
        ]
    }
];

const NIPPON_VENDORS: Vendor[] = [
    {
        id: 'VEND-NIP-KL-001',
        name: 'Guangdong Kin Long Hardware Products Co., Ltd.',
        nickName: 'Kin Long',
        type: 'Hardware',
        company: 'Nippon',
        registrationDate: '2026-02-23'
    },
    {
        id: 'VEND-NIP-NB-002',
        name: 'NINGBO WIDEN IMPORT AND EXPORT CO., LTD',
        nickName: 'Ningbo',
        type: 'Hardware',
        company: 'Nippon',
        registrationDate: '2026-02-23'
    },
    {
        id: 'VEND-NIP-SL-003',
        name: 'Soleron Building Materials (Hebei) Co., Ltd.',
        nickName: 'Soleron',
        type: 'Hardware',
        company: 'Nippon',
        registrationDate: '2026-02-23'
    },
    {
        id: 'VEND-NIP-SW-004',
        name: 'SHANGHAI SIWAY BUILDING MATERIAL CO.LTD',
        nickName: 'Siway',
        type: 'Hardware',
        company: 'Nippon',
        registrationDate: '2026-02-23'
    },
    {
        id: 'VEND-NIP-FR-005',
        name: 'Froise',
        nickName: 'Froise',
        type: 'Hardware',
        company: 'Nippon',
        registrationDate: '2026-02-23'
    }
];



export const AppService = {
  seedInitialData: async () => {
    await FinanceService.loadAccountsAsync();
    FinanceService.seedDefaultCOA();
    
    const version = localStorage.getItem(KEYS.DB_VERSION);
    if (version !== CURRENT_VERSION) {
        const allAccounts = safeParse(KEYS.ACCOUNTS);
        let newAccounts = [...allAccounts];
        const hasFactory = newAccounts.some(a => a.company === 'Factory');
        if (!hasFactory) newAccounts = [...newAccounts, ...FactoryCOA];
        const hasGlassco = newAccounts.some(a => a.company === 'Glassco');
        if (!hasGlassco) newAccounts = [...newAccounts, ...GlasscoCOA];
        if (newAccounts.length > allAccounts.length) localStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(newAccounts));

        const allVendors = safeParse(KEYS.VENDORS);
        let currentVendors = [...allVendors];
        let anyVendorAdded = false;
        
        DEFAULT_TEMPERING_VENDORS.forEach(seedVendor => {
            const exists = currentVendors.some(v => v.name === seedVendor.name && v.type === 'Tempering');
            if (!exists) {
                currentVendors.push(seedVendor);
                anyVendorAdded = true;
            }
        });

        NIPPON_VENDORS.forEach(seedVendor => {
            const exists = currentVendors.some(v => v.name === seedVendor.name && v.company === 'Nippon');
            if (!exists) {
                currentVendors.push(seedVendor);
                anyVendorAdded = true;
            }
        });

        if (anyVendorAdded) {
            localStorage.setItem(KEYS.VENDORS, JSON.stringify(currentVendors));
        }

        localStorage.setItem(KEYS.DB_VERSION, CURRENT_VERSION);
    }
    initDB(); 
  },

  checkAndTriggerAutoBackup: async () => {
    const today = new Date().toISOString().split('T')[0];
    const lastBackup = localStorage.getItem(KEYS.LAST_AUTO_BACKUP);
    if (lastBackup !== today) {
      await AppService.exportDatabaseToFile(true);
      localStorage.setItem(KEYS.LAST_AUTO_BACKUP, today);
    }
  },

  getActivityLogsAsync: async (): Promise<ActivityLog[]> => {
    try {
      const db = await initDB();
      const items = await db.getAll('activityLogs');
      if (items.length === 0) {
        const lsItems = safeParse(KEYS.ACTIVITY_LOGS);
        if (lsItems.length > 0) {
            const tx = db.transaction('activityLogs', 'readwrite');
            await Promise.all(lsItems.map(item => tx.store.put(item)));
            await tx.done;
            return lsItems;
        }
      }
      return items;
    } catch (e) {
      return safeParse(KEYS.ACTIVITY_LOGS);
    }
  },

  exportDatabaseToFile: async (isAuto = false) => {
    const ledger = await FinanceService.getLedger();
    const stockLedger = await InventoryService.getStockLedger();
    const productionPieces = await ProductionService.getProductionPiecesAsync();
    const activityLogs = await AppService.getActivityLogsAsync();
    const data = {
      meta: { version: CURRENT_VERSION, timestamp: new Date().toISOString(), type: isAuto ? 'AutoBackup' : 'FullBackup' },
      employees: HRService.getEmployees(),
      attendance: HRService.getAttendance(),
      loans: HRService.getLoans(),
      payroll: HRService.getPayroll(),
      accounts: FinanceService.getAccounts(),
      ledger: ledger, 
      costCenters: FinanceService.getCostCenters(),
      pettyCash: FinanceService.getPettyCashEntries(),
      recurringExpenses: FinanceService.getRecurringExpenses(),
      financialEvents: FinanceService.getFinancialEvents(),
      mappingRules: FinanceService.getMappingRules(),
      glConfig: FinanceService.getGLConfig(),
      clients: SalesService.getClients(),
      quotations: SalesService.getQuotations(),
      projects: SalesService.getProjects(),
      products: SalesService.getProducts(),
      store: InventoryService.getStore(),
      stockLedger: stockLedger, 
      inspectionLots: InventoryService.getInspectionLots(),
      remnants: InventoryService.getRemnants(),
      handlingUnits: InventoryService.getHandlingUnits(),
      requisitions: InventoryService.getRequisitions(),
      productionPieces: productionPieces, 
      dispatches: ProductionService.getTemperingDispatches(),
      gatePasses: ProductionService.getGatePasses(),
      warehouseSpots: ProductionService.getWarehouseSpots(),
      jobOrders: ProductionService.getJobOrders(),
      purchaseOrders: ProductionService.getPurchaseOrders(),
      vendors: SalesService.getVendors(),
      activityLogs: activityLogs, 
    };
    const blob = new globalThis.Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = globalThis.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Glasstech_ERP_BACKUP_${new Date().toISOString().slice(0,10)}_${isAuto ? 'AUTO' : 'MANUAL'}.json`;
    link.click();
  },

  importDatabaseFromFile: async (jsonContent: string): Promise<boolean> => {
    try {
      const data = JSON.parse(jsonContent);
      if (!data.meta || !data.meta.version) {
        alert("Invalid Backup File Format");
        return false;
      }

      // Restore LocalStorage
      if (data.employees) localStorage.setItem('gtk_erp_employees', JSON.stringify(data.employees));
      if (data.attendance) localStorage.setItem('gtk_erp_attendance', JSON.stringify(data.attendance));
      if (data.loans) localStorage.setItem('gtk_erp_loans', JSON.stringify(data.loans));
      if (data.payroll) localStorage.setItem('gtk_erp_payroll', JSON.stringify(data.payroll));
      if (data.accounts) localStorage.setItem('gtk_erp_accounts', JSON.stringify(data.accounts));
      if (data.costCenters) localStorage.setItem('gtk_erp_cost_centers', JSON.stringify(data.costCenters));
      if (data.pettyCash) localStorage.setItem('gtk_erp_petty_cash', JSON.stringify(data.pettyCash));
      if (data.recurringExpenses) localStorage.setItem('gtk_erp_recurring_expenses', JSON.stringify(data.recurringExpenses));
      if (data.financialEvents) localStorage.setItem('gtk_erp_financial_events', JSON.stringify(data.financialEvents));
      if (data.mappingRules) localStorage.setItem('gtk_erp_mapping_rules', JSON.stringify(data.mappingRules));
      if (data.glConfig) localStorage.setItem('gtk_erp_gl_config', JSON.stringify(data.glConfig));
      if (data.clients) localStorage.setItem('gtk_erp_clients', JSON.stringify(data.clients));
      if (data.quotations) localStorage.setItem('gtk_erp_quotations', JSON.stringify(data.quotations));
      if (data.projects) localStorage.setItem('gtk_erp_projects', JSON.stringify(data.projects));
      if (data.products) localStorage.setItem('gtk_erp_products', JSON.stringify(data.products));
      if (data.store) localStorage.setItem('gtk_erp_store', JSON.stringify(data.store));
      if (data.inspectionLots) localStorage.setItem('gtk_erp_inspection_lots', JSON.stringify(data.inspectionLots));
      if (data.remnants) localStorage.setItem('gtk_erp_remnants', JSON.stringify(data.remnants));
      if (data.handlingUnits) localStorage.setItem('gtk_erp_handling_units', JSON.stringify(data.handlingUnits));
      if (data.requisitions) localStorage.setItem('gtk_erp_requisitions', JSON.stringify(data.requisitions));
      if (data.dispatches) localStorage.setItem('gtk_erp_tempering_dispatches', JSON.stringify(data.dispatches));
      if (data.gatePasses) localStorage.setItem('gtk_erp_gate_passes', JSON.stringify(data.gatePasses));
      if (data.warehouseSpots) localStorage.setItem('gtk_erp_warehouse_spots', JSON.stringify(data.warehouseSpots));
      if (data.jobOrders) localStorage.setItem('gtk_erp_job_orders', JSON.stringify(data.jobOrders));
      if (data.purchaseOrders) localStorage.setItem('gtk_erp_purchase_orders', JSON.stringify(data.purchaseOrders));
      if (data.vendors) localStorage.setItem('gtk_erp_vendors', JSON.stringify(data.vendors));

      // Restore IndexedDB
      const db = await initDB();
      if (data.ledger) {
          await db.clear('ledger');
          const tx = db.transaction('ledger', 'readwrite');
          await Promise.all(data.ledger.map((item: any) => tx.store.put(item)));
          await tx.done;
      }
      if (data.stockLedger) {
          await db.clear('stockLedger');
          const tx = db.transaction('stockLedger', 'readwrite');
          await Promise.all(data.stockLedger.map((item: any) => tx.store.put(item)));
          await tx.done;
      }
      if (data.productionPieces) {
          await db.clear('productionPieces');
          const tx = db.transaction('productionPieces', 'readwrite');
          await Promise.all(data.productionPieces.map((item: any) => tx.store.put(item)));
          await tx.done;
      }
      if (data.activityLogs) {
          await db.clear('activityLogs');
          const tx = db.transaction('activityLogs', 'readwrite');
          await Promise.all(data.activityLogs.map((item: any) => tx.store.put(item)));
          await tx.done;
      }

      return true;
    } catch (e) {
      console.error("Import Failed", e);
      alert("Import Failed: " + (e as any).message);
      return false;
    }
  },

  clearModuleData: async (moduleName: 'HR' | 'Sales' | 'Inventory' | 'Production' | 'Finance' | 'Logistics', company: Company) => {
      const filterOut = (key: string) => {
          const data = safeParse(key);
          const kept = data.filter((d: any) => d.company !== company);
          localStorage.setItem(key, JSON.stringify(kept));
      };

      if (moduleName === 'HR') {
          filterOut('gtk_erp_employees');
          filterOut('gtk_erp_attendance');
          filterOut('gtk_erp_loans');
          filterOut('gtk_erp_payroll');
      }
      if (moduleName === 'Sales') {
          filterOut('gtk_erp_clients');
          filterOut('gtk_erp_quotations');
          filterOut('gtk_erp_projects');
      }
      if (moduleName === 'Inventory') {
          filterOut('gtk_erp_store');
          filterOut('gtk_erp_requisitions');
          const db = await initDB();
          const allStock = await db.getAll('stockLedger');
          const keptStock = allStock.filter((d: any) => d.company !== company);
          await db.clear('stockLedger');
          const tx = db.transaction('stockLedger', 'readwrite');
          await Promise.all(keptStock.map(item => tx.store.put(item)));
          await tx.done;
      }
      if (moduleName === 'Production') {
          filterOut('gtk_erp_job_orders');
          filterOut('gtk_erp_purchase_orders');
          filterOut('gtk_erp_tempering_dispatches');
          filterOut('gtk_erp_gate_passes');
          const db = await initDB();
          const allPieces = await db.getAll('productionPieces');
          const keptPieces = allPieces.filter((d: any) => d.company !== company);
          await db.clear('productionPieces');
          const tx = db.transaction('productionPieces', 'readwrite');
          await Promise.all(keptPieces.map(item => tx.store.put(item)));
          await tx.done;
      }
      if (moduleName === 'Finance') {
          filterOut('gtk_erp_petty_cash');
          filterOut('gtk_erp_recurring_expenses');
          filterOut('gtk_erp_financial_events');
          const db = await initDB();
          const allLedger = await db.getAll('ledger');
          const keptLedger = allLedger.filter((d: any) => d.company !== company);
          await db.clear('ledger');
          const tx = db.transaction('ledger', 'readwrite');
          await Promise.all(keptLedger.map(item => tx.store.put(item)));
          await tx.done;
      }
  },

  archiveYearData: async (year: number): Promise<number> => {
      let count = 0;
      const db = await initDB();
      
      const allLedger = await db.getAll('ledger');
      const oldLedger = allLedger.filter((d: any) => new Date(d.date).getFullYear() <= year);
      if (oldLedger.length > 0) {
          const keptLedger = allLedger.filter((d: any) => new Date(d.date).getFullYear() > year);
          await db.clear('ledger');
          const tx = db.transaction('ledger', 'readwrite');
          await Promise.all(keptLedger.map(item => tx.store.put(item)));
          await tx.done;
          count += oldLedger.length;
      }
      
      return count;
  },

  generateSequenceID: (prefix: string, company: string, existingData: any[]): string => {
      const companyMap: Record<string, string> = { 
          'GTK': 'GTK', 
          'GTI': 'GTI', 
          'Glassco': 'GLS', 
          'Nippon': 'NIP', 
          'Factory': 'FAC' 
      };
      const compCode = companyMap[company] || company.substring(0, 3).toUpperCase();
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const mmyy = `${month}${year}`;
      
      // 1. Special handling for Requisitions (REQ)
      if (prefix === 'REQ') {
          const countKey = `gtk_last_seq_${company}_REQUISITION`;
          let lastSeq = parseInt(localStorage.getItem(countKey) || '12000', 10);
          if (lastSeq < 12000) lastSeq = 12000;
          
          // Double check existing data to avoid collisions if localStorage was cleared
          let maxExisting = 0;
          existingData.forEach(item => {
              if (item.id && typeof item.id === 'string' && item.id.includes(`-${compCode}-`)) {
                  const parts = item.id.split('-');
                  const seq = parseInt(parts[parts.length - 1], 10);
                  if (!isNaN(seq) && seq > maxExisting) maxExisting = seq;
              }
          });
          
          const nextSeq = Math.max(lastSeq, maxExisting) + 1;
          try {
              localStorage.setItem(countKey, nextSeq.toString());
          } catch (e) {
              console.warn("Storage Quota Exceeded while saving sequence ID");
          }
          return `REQ-${compCode}-${mmyy}-${nextSeq}`;
      }

      // 2. Special handling for Glassco Sales documents (SO, QT, CH)
      if (company === 'Glassco' && (prefix === 'SO' || prefix === 'QT' || prefix === 'CH')) {
          const countKey = `gtk_last_seq_Glassco_MASTER`;
          const glasscoPrefix = `${prefix}-GLS-${mmyy}-`;
          
          let lastSeq = parseInt(localStorage.getItem(countKey) || '2349', 10);
          if (lastSeq < 2349) lastSeq = 2349;
          
          let maxExisting = 0;
          existingData.forEach(item => {
              const id = item.id || item.orderNo;
              if (id && typeof id === 'string' && id.startsWith(`${prefix}-GLS-`)) {
                  const parts = id.split('-');
                  const seq = parseInt(parts[parts.length - 1], 10);
                  if (!isNaN(seq) && seq > maxExisting) maxExisting = seq;
              }
          });

          const nextSeq = Math.max(lastSeq, maxExisting) + 1;
          try {
              localStorage.setItem(countKey, nextSeq.toString());
          } catch (e) {
              console.warn("Storage Quota Exceeded while saving sequence ID");
          }
          return `${glasscoPrefix}${nextSeq.toString().padStart(4, '0')}`;
      }

      // 3. Default Pattern: PREFIX-COMP-YY-XXXX
      const prefixPattern = `${prefix}-${compCode}-${year}-`;
      let maxSeq = 0;
      
      existingData.forEach(item => {
          // Check common ID fields across different modules
          const idsToCheck = [item.id, item.orderNo, item.gatePassNo, item.jobNo, item.referenceId].filter(Boolean);
          idsToCheck.forEach(id => {
              if (typeof id === 'string' && id.startsWith(prefixPattern)) {
                  const basePart = id.split('-R')[0]; // Handle revisions if any (e.g. QT-GTK-26-0001-R1)
                  const parts = basePart.split('-');
                  const seqStr = parts[parts.length - 1];
                  const seq = parseInt(seqStr, 10);
                  if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
              }
          });
      });
      
      return `${prefixPattern}${(maxSeq + 1).toString().padStart(4, '0')}`;
  },
};