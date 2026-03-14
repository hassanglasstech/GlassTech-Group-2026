/**
 * GLASSTECH ERP — Smart Sync Service
 * 
 * Strategy:
 *   - localStorage = offline buffer (fast reads, always works)
 *   - Supabase = master copy (source of truth when online)
 * 
 * Auto-sync:
 *   - On app start: fetch from Supabase → localStorage
 *   - On every save: write localStorage immediately + queue Supabase push
 *   - On net reconnect: auto-push pending local changes
 *   - Conflict: last-write-wins using updated_at timestamp
 */

import { supabase } from './supabaseClient';
import { safeParse } from '@/modules/shared/services/utils';
import { toast } from 'sonner';
import { translateError, OfflineQueue, withRetry } from '@/modules/shared/services/networkService';

// ── Pending changes queue (survives page reload via localStorage) ─────
const PENDING_KEY = 'gtk_erp_pending_sync';
const LAST_SYNC_KEY = 'gtk_erp_last_sync';
const SYNC_VERSION_KEY = 'gtk_erp_sync_version';

type PendingChange = {
  table: string;
  localKey: string;
  changedAt: string; // ISO timestamp
};

const getPending = (): PendingChange[] => {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); }
  catch { return []; }
};

const addPending = (table: string, localKey: string) => {
  const pending = getPending();
  // Replace if already queued for same table
  const filtered = pending.filter(p => p.table !== table);
  filtered.push({ table, localKey, changedAt: new Date().toISOString() });
  localStorage.setItem(PENDING_KEY, JSON.stringify(filtered));
};

const clearPending = (table: string) => {
  const pending = getPending().filter(p => p.table !== table);
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
};

// ── Table → localStorage key mapping ─────────────────────────────────
const TABLE_MAP: Record<string, string> = {
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
  activity_logs:      'gtk_erp_activity_logs',
};

// ── Supabase column mapper (snake_case from DB) ───────────────────────
// Most tables store data as-is (JSON columns or flat).
// We upsert the raw localStorage array directly.

const pushTable = async (table: string, localKey: string): Promise<boolean> => {
  const data = safeParse(localKey);
  if (!data || data.length === 0) return true;
  
  try {
    await withRetry(
      async () => {
        const { error } = await supabase.from(table).upsert(data, {
          onConflict: 'id',
          ignoreDuplicates: false,
        });
        if (error) throw error;
      },
      { context: `Sync:${table}`, maxRetries: 2, delayMs: 1500 }
    );
    return true;
  } catch (err: any) {
    console.warn(`[Sync] Push failed for ${table}:`, translateError(err));
    return false;
  }
};

const pullTable = async (table: string, localKey: string): Promise<boolean> => {
  try {
    const data = await withRetry(
      async () => {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw error;
        return data;
      },
      { context: `Pull:${table}`, maxRetries: 2, delayMs: 1000 }
    );
    if (data && data.length > 0) {
      localStorage.setItem(localKey, JSON.stringify(data));
    }
    return true;
  } catch (err: any) {
    console.warn(`[Sync] Pull failed for ${table}:`, translateError(err));
    return false;
  }
};

// ── Connection state ──────────────────────────────────────────────────
let isOnline = navigator.onLine;
let syncInProgress = false;

// ── Main SyncService ──────────────────────────────────────────────────
export const SyncService = {

  // Called once on app start
  init: () => {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      isOnline = true;
      console.log('[Sync] Network restored — flushing queue + pushing pending...');
      toast.success('Back online — syncing changes...', { id: 'back-online', duration: 3000 });
      // Flush offline queue first, then sync
      OfflineQueue.flush(supabase).then(() => SyncService.pushPending());
    });

    window.addEventListener('offline', () => {
      isOnline = false;
      console.log('[Sync] Network lost — working offline');
    });

    // Auto-sync every 5 minutes if online
    setInterval(() => {
      if (isOnline && !syncInProgress) {
        SyncService.pushPending();
      }
    }, 5 * 60 * 1000);
  },

  // Called after any local save — queues for Supabase push
  markDirty: (table: string) => {
    const localKey = TABLE_MAP[table];
    if (!localKey) return;
    addPending(table, localKey);
    // If online, push immediately in background
    if (isOnline) {
      setTimeout(() => SyncService.pushTable(table), 500);
    }
  },

  // Push a single table to Supabase
  pushTable: async (table: string): Promise<void> => {
    const localKey = TABLE_MAP[table];
    if (!localKey) return;
    const ok = await pushTable(table, localKey);
    if (ok) clearPending(table);
  },

  // Push all pending changes (called on reconnect / manual sync)
  pushPending: async (): Promise<{ pushed: number; failed: number }> => {
    if (syncInProgress) return { pushed: 0, failed: 0 };
    syncInProgress = true;

    const pending = getPending();
    if (pending.length === 0) {
      syncInProgress = false;
      return { pushed: 0, failed: 0 };
    }

    let pushed = 0;
    let failed = 0;

    for (const change of pending) {
      const ok = await pushTable(change.table, change.localKey);
      if (ok) { clearPending(change.table); pushed++; }
      else failed++;
    }

    syncInProgress = false;
    if (pushed > 0) {
      console.log(`[Sync] Pushed ${pushed} table(s) to Supabase`);
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    }
    return { pushed, failed };
  },

  // Full sync — push all tables (manual Globe button)
  syncAll: async (): Promise<{ success: boolean }> => {
    if (!isOnline) {
      toast.warning('No internet connection. Changes saved locally.');
      return { success: false };
    }

    syncInProgress = true;
    toast.info('Syncing to Cloud...', { duration: 2000 });

    let allOk = true;
    const tables = Object.keys(TABLE_MAP);

    for (const table of tables) {
      const localKey = TABLE_MAP[table];
      const ok = await pushTable(table, localKey);
      if (!ok) allOk = false;
      else clearPending(table);
    }

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    syncInProgress = false;

    if (allOk) {
      toast.success('All data synced to Cloud ✓');
      return { success: true };
    } else {
      toast.warning('Sync partial — some tables failed. Will retry.');
      return { success: false };
    }
  },

  // Fetch from Supabase → localStorage (app start / device switch)
  fetchFromCloud: async (): Promise<{ success: boolean }> => {
    if (!isOnline) {
      console.log('[Sync] Offline — using cached localStorage data');
      return { success: false };
    }

    // Pull all tables
    const tables = Object.keys(TABLE_MAP);
    let fetched = 0;

    for (const table of tables) {
      const localKey = TABLE_MAP[table];
      const ok = await pullTable(table, localKey);
      if (ok) fetched++;
    }

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    console.log(`[Sync] Fetched ${fetched}/${tables.length} tables from Supabase`);
    return { success: fetched > 0 };
  },

  // Status info
  getStatus: () => ({
    isOnline,
    pendingChanges: getPending().length,
    lastSync: localStorage.getItem(LAST_SYNC_KEY) || 'Never',
    syncInProgress,
  }),

  // Conflict check — compare local vs remote timestamp
  checkConflict: async (table: string, id: string): Promise<'local_newer' | 'remote_newer' | 'same'> => {
    const localKey = TABLE_MAP[table];
    if (!localKey) return 'same';

    const localData: any[] = safeParse(localKey);
    const localItem = localData.find((r: any) => r.id === id);
    if (!localItem) return 'remote_newer';

    const { data } = await supabase.from(table).select('updated_at').eq('id', id).single();
    if (!data) return 'local_newer';

    const localTime = new Date(localItem.updated_at || localItem.updatedAt || 0).getTime();
    const remoteTime = new Date(data.updated_at || 0).getTime();

    if (localTime > remoteTime) return 'local_newer';
    if (remoteTime > localTime) return 'remote_newer';
    return 'same';
  },
};

// Auto-init when module loads
SyncService.init();
