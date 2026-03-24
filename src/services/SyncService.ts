/**
 * GLASSTECH ERP — Smart Sync Service v2
 *
 * Strategy:
 *   - localStorage = fast offline buffer (always works)
 *   - Supabase    = master copy (source of truth)
 *
 * On first load:
 *   1. Migrate any existing localStorage data → Supabase (one-time)
 *   2. Then always pull from Supabase → localStorage on app start
 *
 * On every save:
 *   - Write localStorage immediately (instant UI)
 *   - Push to Supabase in background
 *
 * On reconnect:
 *   - Auto-push any pending local changes
 *
 * Conflict: last-write-wins via updated_at timestamp
 */

import { supabase } from './supabaseClient';
import { toast } from 'sonner';
import { translateError, OfflineQueue, withRetry } from '../../modules/shared/services/networkService';

// ── Inline safeParse (avoids circular import) ─────────────────────────
const safeParse = (key: string): any[] => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return [];
    const parsed = JSON.parse(item);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// ── Keys ──────────────────────────────────────────────────────────────
const PENDING_KEY      = 'gtk_erp_pending_sync';
const LAST_SYNC_KEY    = 'gtk_erp_last_sync';
const MIGRATED_KEY     = 'gtk_erp_migrated_v2'; // set after first migration

// ── Pending queue (survives reload) ───────────────────────────────────
type PendingChange = { table: string; localKey: string; changedAt: string };

const getPending  = (): PendingChange[] => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; } };
const addPending  = (table: string, localKey: string) => {
  const pending = getPending().filter(p => p.table !== table);
  pending.push({ table, localKey, changedAt: new Date().toISOString() });
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
};
const clearPending = (table: string) => {
  localStorage.setItem(PENDING_KEY, JSON.stringify(getPending().filter(p => p.table !== table)));
};

// ── Table → localStorage key mapping (complete) ───────────────────────
export const TABLE_MAP: Record<string, string> = {
  employees:          'gtk_erp_employees',
  attendance:         'gtk_erp_attendance',
  loans:              'gtk_erp_loans',
  payroll:            'gtk_erp_payroll',
  accounts:           'gtk_erp_accounts',
  cost_centers:       'gtk_erp_cost_centers',
  ledger:             'gtk_erp_ledger',
  petty_cash:         'gtk_erp_petty_cash',
  recurring_expenses: 'gtk_erp_recurring_expenses',
  financial_events:   'gtk_erp_financial_events',
  mapping_rules:      'gtk_erp_mapping_rules',
  gl_config:          'gtk_erp_gl_config',
  clients:            'gtk_erp_clients',
  quotations:         'gtk_erp_quotations',
  projects:           'gtk_erp_projects',
  products:           'gtk_erp_products',
  vendors:            'gtk_erp_vendors',
  store_items:        'gtk_erp_store',
  assets:             'gtk_erp_assets',
  stock_ledger:       'gtk_erp_stock_ledger',
  inspection_lots:    'gtk_erp_inspection_lots',
  remnants:           'gtk_erp_remnants',
  handling_units:     'gtk_erp_handling_units',
  requisitions:       'gtk_erp_requisitions',
  purchase_orders:    'gtk_erp_purchase_orders',
  production_pieces:  'gtk_erp_production_pieces',
  job_orders:         'gtk_erp_job_orders',
  gate_passes:        'gtk_erp_gate_pass',
  warehouse_spots:    'gtk_erp_warehouse_spots',
};

// Tables skipped for Supabase (local-only)
const LOCAL_ONLY = new Set(['activity_logs']);

// ── Tables that have FLAT columns (not pure JSONB data column) ────────
// These need special push/pull logic
const FLAT_TABLES = new Set(['employees', 'assets', 'ledger', 'petty_cash']);

// ── Push helpers ──────────────────────────────────────────────────────

/**
 * Convert any item to Supabase row.
 * - FLAT_TABLES: keep existing column structure (as before)
 * - JSONB tables: store full object in `data` column
 */
const toSupabaseRow = (table: string, item: any): any => {
  if (!item || !item.id) return null;

  const now = new Date().toISOString();

  if (table === 'employees') {
    return {
      id: item.id,
      company: item.company || '',
      name: item.personal?.name || item.name || '',
      personal: item.personal || {},
      work: item.work || {},
      salary: item.salary || {},
      basic:             item.salary?.basic || item.basic || 0,
      house_rent:        item.salary?.houseRent || item.house_rent || 0,
      conveyance:        item.salary?.conveyance || item.conveyance || 0,
      special_allowance: item.salary?.specialAllowance || item.special_allowance || 0,
      department:   item.work?.department || item.department || '',
      designation:  item.work?.designation || item.designation || '',
      grade:        item.work?.grade || item.grade || '',
      join_date:    item.work?.joinDate || item.join_date || '',
      employee_code: item.work?.employeeCode || item.employee_code || '',
      address: item.personal?.address || item.address || '',
      phone:   item.personal?.phone || item.phone || '',
      cnic:    item.personal?.cnic || item.cnic || '',
      updated_at: item._updatedAt || item.updated_at || now,
    };
  }

  if (table === 'assets') {
    return {
      id: item.id,
      company: item.company || '',
      name: item.name || '',
      category: item.category || '',
      serial_no: item.serialNo || item.serial_no || '',
      purchase_date: item.purchaseDate || item.purchase_date || '',
      purchase_cost: item.purchaseCost || item.purchase_cost || 0,
      useful_life: item.usefulLife || item.useful_life || 0,
      status: item.status || 'active',
      location: item.location || '',
      assigned_to: item.assignedTo || item.assigned_to || '',
      depreciation_method: item.depreciationMethod || item.depreciation_method || 'straight_line',
      maintenance_logs: item.maintenanceLogs || item.maintenance_logs || [],
      notes: item.notes || '',
      updated_at: item._updatedAt || item.updated_at || now,
    };
  }

  if (table === 'ledger') {
    return {
      id: item.id,
      company: item.company || '',
      doc_type: item.docType || item.doc_type || '',
      doc_date: item.docDate || item.doc_date || '',
      date: item.date || '',
      description: item.description || '',
      reference_id: item.referenceId || item.reference_id || '',
      status: item.status || 'posted',
      details: item.details || item,
      updated_at: item._updatedAt || item.updated_at || now,
    };
  }

  if (table === 'petty_cash') {
    return {
      id: item.id,
      company: item.company || '',
      date: item.date || '',
      type: item.type || item.entryType || 'Payment',
      amount: item.amount || 0,
      description: item.description || '',
      reference_doc: item.referenceDoc || item.reference_doc || '',
      data: item,
      updated_at: item._updatedAt || item.updated_at || now,
    };
  }

  // ── Default: JSONB tables ──
  return {
    id: item.id,
    company: item.company || '',
    data: item,
    updated_at: item._updatedAt || item.updated_at || now,
  };
};

/**
 * Convert Supabase row back to app object
 */
const fromSupabaseRow = (table: string, row: any): any => {
  if (!row) return null;

  if (table === 'employees') {
    return {
      ...row,
      personal: row.personal && typeof row.personal === 'object'
        ? row.personal
        : { name: row.name || '', cnic: row.cnic || '', phone: row.phone || '', address: row.address || '' },
      work: row.work && typeof row.work === 'object'
        ? row.work
        : {
            designation: row.designation || '',
            department: row.department || '',
            grade: row.grade || '',
            joinDate: row.join_date || '',
            employeeCode: row.employee_code || '',
          },
      salary: row.salary && typeof row.salary === 'object'
        ? row.salary
        : {
            basic: row.basic || 0,
            houseRent: row.house_rent || 0,
            conveyance: row.conveyance || 0,
            specialAllowance: row.special_allowance || 0,
          },
    };
  }

  if (table === 'assets') {
    return {
      ...row,
      serialNo: row.serial_no,
      purchaseDate: row.purchase_date,
      purchaseCost: row.purchase_cost,
      usefulLife: row.useful_life,
      assignedTo: row.assigned_to,
      depreciationMethod: row.depreciation_method,
      maintenanceLogs: row.maintenance_logs,
    };
  }

  if (table === 'ledger') {
    return {
      ...row,
      docType: row.doc_type,
      docDate: row.doc_date,
      referenceId: row.reference_id,
      ...(row.details && typeof row.details === 'object' ? row.details : {}),
    };
  }

  if (table === 'petty_cash') {
    // Restore from `data` column if it has more fields
    const base = row.data && typeof row.data === 'object' ? row.data : {};
    return { ...base, ...row, data: undefined };
  }

  // ── Default: JSONB tables — restore from `data` column ──
  if (row.data && typeof row.data === 'object') {
    return { ...row.data, id: row.id, company: row.company || row.data.company };
  }

  return row;
};

// ── Push one table to Supabase ────────────────────────────────────────
const pushTable = async (table: string, localKey: string): Promise<boolean> => {
  if (LOCAL_ONLY.has(table)) return true;

  const rawData = safeParse(localKey);
  if (!rawData || rawData.length === 0) return true;

  const rows = rawData
    .map(item => toSupabaseRow(table, item))
    .filter(Boolean);

  if (rows.length === 0) return true;

  // Batch in chunks of 500 to avoid payload limits
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    try {
      await withRetry(
        async () => {
          const { error } = await supabase.from(table).upsert(chunk, {
            onConflict: 'id',
            ignoreDuplicates: false,
          });
          if (error) {
            // Schema mismatch → skip silently
            if (
              error.code === 'PGRST204' || error.code === '42P01' ||
              error.message?.includes('relation') || error.message?.includes('column') ||
              error.message?.includes('enum') || error.message?.includes('invalid input value')
            ) {
              console.log(`[Sync] Skipping ${table} — schema: ${error.message}`);
              return;
            }
            throw error;
          }
        },
        { context: `Push:${table}`, maxRetries: 2, delayMs: 1500 }
      );
    } catch (err: any) {
      console.warn(`[Sync] Push failed for ${table}:`, translateError(err));
      return false;
    }
  }
  return true;
};

// ── Pull one table from Supabase ──────────────────────────────────────
const pullTable = async (table: string, localKey: string): Promise<boolean> => {
  if (LOCAL_ONLY.has(table)) return true;

  try {
    // Pull in pages (Supabase default limit = 1000)
    let allRows: any[] = [];
    let from = 0;
    const PAGE = 1000;

    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .range(from, from + PAGE - 1)
        .order('updated_at', { ascending: false });

      if (error) {
        if (
          error.code === 'PGRST204' || error.code === '42P01' ||
          error.message?.includes('relation') || error.message?.includes('not found') ||
          error.message?.includes('schema cache')
        ) {
          console.log(`[Sync] Skipping pull for ${table} — not in DB yet`);
          return true; // not an error — table just doesn't exist yet
        }
        throw error;
      }

      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (allRows.length > 0) {
      const appData = allRows.map(row => fromSupabaseRow(table, row)).filter(Boolean);
      localStorage.setItem(localKey, JSON.stringify(appData));
      console.log(`[Sync] Pulled ${appData.length} rows for ${table}`);
    }
    return true;
  } catch (err: any) {
    console.warn(`[Sync] Pull failed for ${table}:`, translateError(err));
    return false;
  }
};

// ── One-time migration: localStorage → Supabase ───────────────────────
const migrateLocalStorageToSupabase = async (): Promise<void> => {
  if (localStorage.getItem(MIGRATED_KEY) === 'true') return; // already done

  console.log('[Sync] First run — migrating localStorage data to Supabase...');
  toast.info('Setting up cloud sync for the first time...', { duration: 4000 });

  let migrated = 0;
  let skipped = 0;

  for (const [table, localKey] of Object.entries(TABLE_MAP)) {
    if (LOCAL_ONLY.has(table)) continue;
    const rawData = safeParse(localKey);
    if (!rawData || rawData.length === 0) { skipped++; continue; }

    const ok = await pushTable(table, localKey);
    if (ok) { migrated++; console.log(`[Migrate] ✓ ${table} (${rawData.length} rows)`); }
    else     { console.warn(`[Migrate] ✗ ${table} failed`); }
  }

  localStorage.setItem(MIGRATED_KEY, 'true');
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());

  console.log(`[Migrate] Done — ${migrated} tables pushed, ${skipped} empty`);
  toast.success(`Cloud setup complete — ${migrated} modules synced ✓`, { duration: 5000 });
};

// ── Connection state ──────────────────────────────────────────────────
let isOnline = navigator.onLine;
let syncInProgress = false;

// ── Main SyncService ──────────────────────────────────────────────────
export const SyncService = {

  // Called once on app start (from App.tsx or main auth flow)
  init: () => {
    window.addEventListener('online', () => {
      isOnline = true;
      console.log('[Sync] Network restored — flushing queue...');
      toast.success('Back online — syncing changes...', { id: 'back-online', duration: 3000 });
      OfflineQueue.flush(supabase).then(() => SyncService.pushPending());
    });

    window.addEventListener('offline', () => {
      isOnline = false;
      console.log('[Sync] Network lost — working offline');
    });

    // Auto-push every 5 minutes
    setInterval(() => {
      if (isOnline && !syncInProgress) SyncService.pushPending();
    }, 5 * 60 * 1000);
  },

  /**
   * Call this once after user logs in.
   * 1. Migrate old localStorage data (first time only)
   * 2. Pull latest from Supabase
   */
  initSync: async (): Promise<void> => {
    if (!isOnline) {
      console.log('[Sync] Offline — using local cache');
      return;
    }
    try {
      // Step 1: migrate (no-op after first run)
      await migrateLocalStorageToSupabase();
      // Step 2: pull fresh data from Supabase
      await SyncService.fetchFromCloud();
    } catch (err) {
      console.warn('[Sync] initSync error:', err);
    }
  },

  // Called after any local save — queues for Supabase push
  markDirty: (table: string) => {
    const localKey = TABLE_MAP[table];
    if (!localKey) return;
    addPending(table, localKey);
    if (isOnline) {
      setTimeout(() => SyncService.pushTable(table), 300);
    }
  },

  // Push a single table
  pushTable: async (table: string): Promise<void> => {
    const localKey = TABLE_MAP[table];
    if (!localKey) return;
    const ok = await pushTable(table, localKey);
    if (ok) clearPending(table);
  },

  // Push all pending changes
  pushPending: async (): Promise<{ pushed: number; failed: number }> => {
    if (syncInProgress) return { pushed: 0, failed: 0 };
    syncInProgress = true;

    const pending = getPending();
    if (pending.length === 0) { syncInProgress = false; return { pushed: 0, failed: 0 }; }

    let pushed = 0, failed = 0;
    for (const change of pending) {
      const ok = await pushTable(change.table, change.localKey);
      if (ok) { clearPending(change.table); pushed++; }
      else failed++;
    }

    syncInProgress = false;
    if (pushed > 0) {
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      console.log(`[Sync] Pushed ${pushed} table(s)`);
    }
    return { pushed, failed };
  },

  // Full sync (Globe button)
  syncAll: async (): Promise<{ success: boolean }> => {
    if (!isOnline) {
      toast.warning('No internet connection. Changes saved locally.');
      return { success: false };
    }

    syncInProgress = true;
    toast.info('Syncing to Cloud...', { duration: 2000 });

    let allOk = true;
    for (const [table, localKey] of Object.entries(TABLE_MAP)) {
      const ok = await pushTable(table, localKey);
      if (!ok) allOk = false;
      else clearPending(table);
    }

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    syncInProgress = false;

    if (allOk) { toast.success('All data synced to Cloud ✓'); return { success: true }; }
    else { toast.warning('Sync partial — some tables failed. Will retry.'); return { success: false }; }
  },

  // Pull all tables from Supabase → localStorage
  fetchFromCloud: async (): Promise<{ success: boolean }> => {
    if (!isOnline) { console.log('[Sync] Offline'); return { success: false }; }

    let fetched = 0;
    const tables = Object.keys(TABLE_MAP);

    for (const table of tables) {
      const localKey = TABLE_MAP[table];
      const ok = await pullTable(table, localKey);
      if (ok) fetched++;
    }

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    console.log(`[Sync] Fetched ${fetched}/${tables.length} tables`);
    return { success: fetched > 0 };
  },

  // Status
  getStatus: () => ({
    isOnline,
    pendingChanges: getPending().length,
    lastSync: localStorage.getItem(LAST_SYNC_KEY) || 'Never',
    syncInProgress,
    migrated: localStorage.getItem(MIGRATED_KEY) === 'true',
  }),

  // Force re-migration (if needed from admin panel)
  resetMigration: () => {
    localStorage.removeItem(MIGRATED_KEY);
    console.log('[Sync] Migration flag reset — will re-migrate on next initSync()');
  },

  // Conflict check
  checkConflict: async (table: string, id: string): Promise<'local_newer' | 'remote_newer' | 'same'> => {
    const localKey = TABLE_MAP[table];
    if (!localKey) return 'same';

    const localData: any[] = safeParse(localKey);
    const localItem = localData.find((r: any) => r.id === id);
    if (!localItem) return 'remote_newer';

    const { data } = await supabase.from(table).select('updated_at').eq('id', id).single();
    if (!data) return 'local_newer';

    const localTime = new Date(localItem._updatedAt || localItem.updated_at || 0).getTime();
    const remoteTime = new Date(data.updated_at || 0).getTime();

    if (localTime > remoteTime) return 'local_newer';
    if (remoteTime > localTime) return 'remote_newer';
    return 'same';
  },
};

// Auto-init event listeners
SyncService.init();
