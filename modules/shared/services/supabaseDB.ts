/**
 * supabaseDB.ts — Supabase-Primary Data Layer
 *
 * Thin wrapper that:
 *   READ  → pulls from Supabase via SyncService.pullTable → updates localStorage cache
 *   WRITE → saves to localStorage cache + calls SyncService.markDirty (immediate push if online)
 *
 * This reuses ALL existing TABLE_PUSH / TABLE_PULL mappers in SyncService
 * so there's zero risk of column mapping errors.
 */

import { supabase } from '@/src/services/supabaseClient';

// ── localStorage key → Supabase table name ────────────────────────────
const LOCAL_KEY_TO_TABLE: Record<string, string> = {
  gtk_erp_employees:             'employees',
  gtk_erp_attendance:            'attendance',
  gtk_erp_loans:                 'loans',
  gtk_erp_payroll:               'payroll',
  gtk_erp_tag_master:            'tag_master',
  gtk_erp_employee_tags:         'employee_tags',
  gtk_erp_departments:           'departments',
  gtk_erp_employee_docs:         'employee_docs',
  gtk_erp_accounts:              'accounts',
  gtk_erp_cost_centers:          'cost_centers',
  gtk_erp_ledger:                'ledger',
  gtk_erp_petty_cash:            'petty_cash',
  gtk_erp_recurring_expenses:    'recurring_expenses',
  gtk_erp_financial_events:      'financial_events',
  gtk_erp_mapping_rules:         'mapping_rules',
  gtk_erp_gl_config:             'gl_config',
  gtk_erp_clients:               'clients',
  gtk_erp_quotations:            'quotations',
  gtk_erp_projects:              'projects',
  gtk_erp_invoices:              'invoices',
  gtk_erp_payment_receipts:      'payment_receipts',
  gtk_erp_products:              'products',
  gtk_erp_vendors:               'vendors',
  gtk_erp_vendor_rates:          'vendor_rates',
  gtk_erp_store:                 'store_items',
  gtk_erp_assets:                'assets',
  gtk_erp_stock_ledger:          'stock_ledger',
  gtk_erp_inspection_lots:       'inspection_lots',
  gtk_erp_remnants:              'remnants',
  gtk_erp_handling_units:        'handling_units',
  gtk_erp_requisitions:          'requisitions',
  gtk_erp_purchase_orders:       'purchase_orders',
  gtk_erp_grn_sheet_entries:     'grn_sheet_entries',
  gtk_erp_vendor_defect_reports: 'vendor_defect_reports',
  gtk_erp_cutting_sessions:      'cutting_sessions',
  gtk_erp_manual_count_sheets:   'manual_count_sheets',
  gtk_erp_scrap_disposals:       'scrap_disposals',
  gtk_erp_vendor_reviews:        'vendor_reviews',
  gtk_erp_pallet_rates:          'pallet_rates',
  gtk_erp_weight_master:         'weight_master',
  gtk_erp_production_pieces:     'production_pieces',
  gtk_erp_job_orders:            'job_orders',
  gtk_erp_gate_pass:             'gate_passes',
  gtk_erp_gate_passes:           'gate_passes',
  gtk_erp_warehouse_spots:       'warehouse_spots',
  gtk_erp_vehicles:              'vehicles',
  gtk_erp_vehicle_trips:         'vehicle_trips',
  gtk_erp_vehicle_expenses:      'vehicle_expenses',
  gtk_erp_tempering_dispatches:  'tempering_dispatches',
  gtk_erp_ncr_events:            'ncr_events',
  gtk_erp_ncr_reproductions:     'ncr_reproductions',
  gtk_erp_ncr_claims:            'ncr_claims',
  gtk_erp_ncr_remnants:          'ncr_remnants',
  gtk_erp_cutter_daily_logs:     'cutter_daily_logs',
  gtk_erp_generator_logs:        'generator_logs',
  gtk_erp_roles:                 'roles',
  gtk_erp_permissions:           'permissions',
  gtk_erp_role_permissions:      'role_permissions',
  gtk_erp_employee_roles:        'employee_roles',
};

// Keys that are UI state only — never go to Supabase
const LOCAL_ONLY_KEYS = new Set([
  'gtk_erp_activity_logs',
  'gtk_notifications', 'gtk_notifications_v2',
  'gtk_erp_pending_sync', 'gtk_erp_last_sync', 'gtk_erp_sync_version',
  'gt_schema_version',
  'glassco_floor_planner_teams', 'glassco_daily_plan', 'glassco_cutter_daily_targets',
  'gtk_pending_trip_load',
  'gtk_erp_offline_write_queue',
]);

// ── Raw localStorage helpers ──────────────────────────────────────────
const lsGet = (key: string): any[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch { return []; }
};

const lsSet = (key: string, data: any[]): void => {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch { /* quota — Supabase is primary, cache is optional */ }
};

// ── CORE READ: Supabase → cache → return ──────────────────────────────
export const dbRead = async (localKey: string): Promise<any[]> => {
  if (LOCAL_ONLY_KEYS.has(localKey)) return lsGet(localKey);

  const table = LOCAL_KEY_TO_TABLE[localKey];
  if (!table) return lsGet(localKey);

  try {
    // Delegate to SyncService pullTable which has proper TABLE_PULL mappers
    const { SyncService } = await import('@/src/services/SyncService');
    await SyncService.pullTable(table);
    // pullTable writes to localStorage — read from cache
    return lsGet(localKey);
  } catch (err: any) {
    console.warn(`[DB] Read failed for ${table}:`, err.message, '— using cache');
    return lsGet(localKey);
  }
};

// ── CORE WRITE: cache + SyncService push ──────────────────────────────
export const dbWrite = async (localKey: string, data: any[]): Promise<boolean> => {
  // localStorage cache already written by safeSave before dbWrite is called
  if (LOCAL_ONLY_KEYS.has(localKey)) return true;

  const table = LOCAL_KEY_TO_TABLE[localKey];
  if (!table) return true;

  try {
    // Delegate to SyncService.markDirty which:
    //   - if online: pushes immediately via TABLE_PUSH mappers
    //   - if offline: queues for retry on reconnect
    const { SyncService } = await import('@/src/services/SyncService');
    SyncService.markDirty(table);
    return true;
  } catch (err: any) {
    console.warn(`[DB] Write trigger failed for ${table}:`, err.message);
    return false;
  }
};

// ── Flush offline queue (called on reconnect and app start) ───────────
export const flushOfflineQueue = async (): Promise<void> => {
  try {
    const { SyncService } = await import('@/src/services/SyncService');
    const result = await SyncService.pushPending();
    if (result.pushed > 0) {
      console.log(`[DB] Flushed ${result.pushed} pending table(s) to Supabase`);
    }
  } catch (err: any) {
    console.warn('[DB] Flush failed:', err.message);
  }
};

// ── Auto-flush when browser comes back online ─────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    setTimeout(flushOfflineQueue, 1500);
  });
}

// ── Status ────────────────────────────────────────────────────────────
export const getDBStatus = () => ({
  isOnline: navigator.onLine,
  primaryDB: 'Supabase',
  cacheDB: 'localStorage',
});

export { LOCAL_KEY_TO_TABLE };
