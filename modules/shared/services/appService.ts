import { initDB } from './db';
import { supabase } from '@/src/services/supabaseClient';
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
    await FinanceService.seedDefaultCOA();
    
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
            await Promise.all(lsItems.map((item: ActivityLog) => tx.store.put(item)));
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
    // Pull ALL tables directly from Supabase for authoritative backup
    const tables = [
      'employees','attendance','loans','payroll','tag_master','employee_tags',
      'departments','employee_docs','accounts','cost_centers','ledger',
      'petty_cash','recurring_expenses','financial_events','mapping_rules',
      'gl_config','clients','quotations','projects','invoices','payment_receipts',
      'products','vendors','vendor_rates','store_items','assets','stock_ledger',
      'inspection_lots','remnants','handling_units','requisitions','purchase_orders',
      'grn_sheet_entries','vendor_defect_reports','cutting_sessions',
      'manual_count_sheets','scrap_disposals','vendor_reviews','pallet_rates',
      'weight_master','production_pieces','job_orders','cutter_daily_logs',
      'generator_logs','gate_passes','warehouse_spots','vehicles','vehicle_trips',
      'vehicle_expenses','tempering_dispatches','ncr_events','ncr_reproductions',
      'ncr_claims','ncr_remnants','roles','permissions','role_permissions','employee_roles',
    ];

    const snapshot: Record<string, any[]> = {};
    let fetchedFromSupabase = false;

    if (navigator.onLine) {
      try {
        await Promise.all(tables.map(async (table) => {
          const { data, error } = await supabase.from(table).select('*');
          if (!error && data) {
            snapshot[table] = data;
            fetchedFromSupabase = true;
          }
        }));
      } catch { /* fall through to localStorage */ }
    }

    // Fallback: read from localStorage cache if Supabase unavailable
    if (!fetchedFromSupabase) {
      const KEY_MAP: Record<string,string> = {
        employees:'gtk_erp_employees', attendance:'gtk_erp_attendance',
        loans:'gtk_erp_loans', payroll:'gtk_erp_payroll',
        accounts:'gtk_erp_accounts', ledger:'gtk_erp_ledger',
        clients:'gtk_erp_clients', quotations:'gtk_erp_quotations',
        products:'gtk_erp_products', vendors:'gtk_erp_vendors',
        requisitions:'gtk_erp_requisitions', stock_ledger:'gtk_erp_stock_ledger',
        grn_sheet_entries:'gtk_erp_grn_sheet_entries',
        production_pieces:'gtk_erp_production_pieces',
      };
      for (const [table, key] of Object.entries(KEY_MAP)) {
        try { snapshot[table] = JSON.parse(localStorage.getItem(key)||'[]'); } catch { snapshot[table] = []; }
      }
    }

    const backup = {
      meta: {
        version: CURRENT_VERSION,
        timestamp: new Date().toISOString(),
        type: isAuto ? 'AutoBackup' : 'FullBackup',
        source: fetchedFromSupabase ? 'Supabase' : 'localStorage-cache',
        tableCount: Object.keys(snapshot).length,
        recordCount: Object.values(snapshot).reduce((s, a) => s + a.length, 0),
      },
      ...snapshot,
    };

    // 1. Download JSON file to disk
    const json = JSON.stringify(backup, null, 2);
    const blob = new globalThis.Blob([json], { type: 'application/json' });
    const url = globalThis.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().slice(0,10);
    link.download = `GlassTech_ERP_BACKUP_${dateStr}_${isAuto ? 'AUTO' : 'MANUAL'}.json`;
    link.click();
    globalThis.URL.revokeObjectURL(url);

    // 2. Also store backup record in Supabase erp_backups table (cloud copy)
    if (navigator.onLine) {
      try {
        await supabase.from('erp_backups').upsert({
          id: `backup_${dateStr}_${isAuto ? 'auto' : 'manual'}`,
          backup_date: new Date().toISOString(),
          backup_type: isAuto ? 'AutoBackup' : 'FullBackup',
          table_count: backup.meta.tableCount,
          record_count: backup.meta.recordCount,
          source: backup.meta.source,
          // Store compact version (without full data — just metadata)
          meta: backup.meta,
        });
      } catch { /* non-critical — file backup already done */ }
    }

    localStorage.setItem(KEYS.LAST_AUTO_BACKUP, new Date().toISOString().split('T')[0]);
    return backup;
  },

  importDatabaseFromFile: async (jsonContent: string): Promise<boolean> => {
    try {
      const data = JSON.parse(jsonContent);
      if (!data.meta?.version) { alert('Invalid Backup File'); return false; }

      // ── Step 1: Restore localStorage cache ───────────────────────
      const KEY_MAP: Record<string,string> = {
        employees:'gtk_erp_employees', attendance:'gtk_erp_attendance',
        loans:'gtk_erp_loans', payroll:'gtk_erp_payroll',
        tag_master:'gtk_erp_tag_master', employee_tags:'gtk_erp_employee_tags',
        departments:'gtk_erp_departments', employee_docs:'gtk_erp_employee_docs',
        accounts:'gtk_erp_accounts', cost_centers:'gtk_erp_cost_centers',
        ledger:'gtk_erp_ledger', petty_cash:'gtk_erp_petty_cash',
        recurring_expenses:'gtk_erp_recurring_expenses',
        financial_events:'gtk_erp_financial_events',
        mapping_rules:'gtk_erp_mapping_rules', gl_config:'gtk_erp_gl_config',
        clients:'gtk_erp_clients', quotations:'gtk_erp_quotations',
        projects:'gtk_erp_projects', invoices:'gtk_erp_invoices',
        payment_receipts:'gtk_erp_payment_receipts',
        products:'gtk_erp_products', vendors:'gtk_erp_vendors',
        store_items:'gtk_erp_store', assets:'gtk_erp_assets',
        stock_ledger:'gtk_erp_stock_ledger',
        inspection_lots:'gtk_erp_inspection_lots',
        remnants:'gtk_erp_remnants', handling_units:'gtk_erp_handling_units',
        requisitions:'gtk_erp_requisitions', purchase_orders:'gtk_erp_purchase_orders',
        grn_sheet_entries:'gtk_erp_grn_sheet_entries',
        vendor_defect_reports:'gtk_erp_vendor_defect_reports',
        cutting_sessions:'gtk_erp_cutting_sessions',
        manual_count_sheets:'gtk_erp_manual_count_sheets',
        scrap_disposals:'gtk_erp_scrap_disposals',
        vendor_reviews:'gtk_erp_vendor_reviews',
        pallet_rates:'gtk_erp_pallet_rates', weight_master:'gtk_erp_weight_master',
        production_pieces:'gtk_erp_production_pieces', job_orders:'gtk_erp_job_orders',
        cutter_daily_logs:'gtk_erp_cutter_daily_logs',
        generator_logs:'gtk_erp_generator_logs',
        gate_passes:'gtk_erp_gate_pass', warehouse_spots:'gtk_erp_warehouse_spots',
        vehicles:'gtk_erp_vehicles', vehicle_trips:'gtk_erp_vehicle_trips',
        vehicle_expenses:'gtk_erp_vehicle_expenses',
        tempering_dispatches:'gtk_erp_tempering_dispatches',
        ncr_events:'gtk_erp_ncr_events', ncr_reproductions:'gtk_erp_ncr_reproductions',
        ncr_claims:'gtk_erp_ncr_claims', ncr_remnants:'gtk_erp_ncr_remnants',
        roles:'gtk_erp_roles', permissions:'gtk_erp_permissions',
        role_permissions:'gtk_erp_role_permissions', employee_roles:'gtk_erp_employee_roles',
      };

      for (const [table, lsKey] of Object.entries(KEY_MAP)) {
        const rows = data[table] ?? data[lsKey]; // support both old and new backup formats
        if (Array.isArray(rows) && rows.length > 0) {
          localStorage.setItem(lsKey, JSON.stringify(rows));
        }
      }

      // ── Step 2: Restore to Supabase (authoritative copy) ─────────
      if (navigator.onLine) {
        const supabaseTables = Object.keys(KEY_MAP);
        let restored = 0;
        for (const table of supabaseTables) {
          const rows = data[table];
          if (!Array.isArray(rows) || rows.length === 0) continue;
          try {
            const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
            if (!error) restored++;
          } catch { /* skip table on error */ }
        }
        console.log(`[Restore] Pushed ${restored}/${supabaseTables.length} tables to Supabase`);
      }

      // ── Step 3: Restore IndexedDB ─────────────────────────────────
      try {
        const db = await initDB();
        for (const store of ['ledger','stockLedger','productionPieces','activityLogs']) {
          const key = store === 'ledger' ? 'ledger'
                    : store === 'stockLedger' ? 'stock_ledger'
                    : store === 'productionPieces' ? 'production_pieces'
                    : 'activityLogs';
          const rows = data[key] || data[store];
          if (Array.isArray(rows) && rows.length > 0) {
            await db.clear(store as any);
            const tx = db.transaction(store as any, 'readwrite');
            await Promise.all(rows.map((item: any) => tx.store.put(item)));
            await tx.done;
          }
        }
      } catch { /* IDB optional */ }

      return true;
    } catch (err: any) {
      alert(`Restore failed: ${err.message}`);
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

      // 2. Special handling for Glassco Sales documents (SO, QT/QUT, CH/DC)
      if (company === 'Glassco' && (prefix === 'SO' || prefix === 'QT' || prefix === 'CH')) {
          // Map prefix to new 3-letter doc code: QT→QUT, SO→SO, CH→DC
          const docCodeMap: Record<string, string> = { 'QT': 'QUT', 'SO': 'SO', 'CH': 'DC' };
          const docCode = docCodeMap[prefix] || prefix;

          // DC (Delivery Challan) has its own series starting from 9001
          const isDC = prefix === 'CH';
          const countKey = isDC ? `gtk_last_seq_Glassco_DC` : `gtk_last_seq_Glassco_MASTER`;
          const baseSeq = isDC ? 9000 : 2522; // DC starts 9001, QUT/SO starts 2523
          const glasscoPrefix = `GT-${docCode}-GLS-${mmyy}-`;

          let lastSeq = parseInt(localStorage.getItem(countKey) || String(baseSeq), 10);
          if (lastSeq < baseSeq) lastSeq = baseSeq;

          let maxExisting = 0;
          existingData.forEach(item => {
              const id = item.id || item.orderNo;
              if (id && typeof id === 'string' && (id.includes('-GLS-'))) {
                  const parts = id.split('-');
                  const seq = parseInt(parts[parts.length - 1], 10);
                  if (!isNaN(seq) && seq > maxExisting) {
                      // For DC, only count DC-range (>=9000); for QUT/SO, only count formal range (<9000)
                      if (isDC && seq >= 9000) maxExisting = seq;
                      else if (!isDC && seq < 9000) maxExisting = seq;
                  }
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