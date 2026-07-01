// ============================================================================
// salesServiceHelpers — module-private helpers extracted from asyncSalesService
// (H6 decomposition, behaviour-neutral). These were file-local consts in
// asyncSalesService.ts; moved here verbatim and exported so the service object
// imports them back. No public API change — AsyncSalesService stays the only
// external export of asyncSalesService.ts.
// ============================================================================
import { safeParse, safeSave } from '../../shared/services/utils';
import { Logger } from '@/modules/shared/services/logger';
import { supabase } from '../../../src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { SyncService } from '../../../src/services/SyncService';

// ── Active company resolver ──────────────────────────────────────────
// The company switcher in the sidebar updates ONLY appStore.selectedCompany,
// not authStore.profile.company. Earlier this file always read profile.company,
// which could ask Supabase for the wrong company's rows when the sidebar
// selection and the auth profile disagreed.
// Prefer the explicitly-selected company; fall back to auth profile only
// when the app store hasn't bootstrapped yet (very early app start).
export const activeCompany = (): string => {
  try {
    const sel = useAppStore.getState().selectedCompany;
    if (sel) return sel;
  } catch { /* appStore not initialised yet */ }
  return useAuthStore.getState().profile?.company ?? '';
};

// Helper — gets current user email at call time (outside React, so we use getState)
// P3-17: explicit return type.
export const _currentUser = (): string => useAuthStore.getState().profile?.email ?? useAuthStore.getState().user?.email ?? 'unknown';

// ── D5 helper: queue table for retry when a direct Supabase write fails. ──
// On the next online tick / reconnect, SyncService.pushPending() will flush
// the table from localStorage to Supabase using TABLE_PUSH mappers.
// P3-17: explicit return type.
export const _queueRetry = (table: string): void => {
  try { SyncService.markDirty(table); } catch (e) { Logger.warn('Sales', `_queueRetry markDirty failed for ${table}`, e); }
};

export const KEYS = {
  CLIENTS: 'gtk_erp_clients',
  PRODUCTS: 'gtk_erp_products',
  QUOTATIONS: 'gtk_erp_quotations',
  PROJECTS: 'gtk_erp_projects',
  VENDORS: 'gtk_erp_vendors',
  CREDIT_NOTES: 'gtk_erp_credit_notes',
  INVOICES: 'gtk_erp_invoices',
  PAYMENT_RECEIPTS: 'gtk_erp_payment_receipts',
  CUSTOMER_COMPLAINTS: 'gtk_erp_customer_complaints',  // Phase-3 (3.8) — unified key
  // Phase-6
  PRICE_LISTS:        'gtk_erp_price_lists',           // Phase-6 (6.4)
  PRICE_LIST_ITEMS:   'gtk_erp_price_list_items',      // Phase-6 (6.4)
  WORK_ORDERS:        'gtk_erp_work_orders',           // Phase-6 (6.2)
  LEADS:              'gtk_erp_leads',                 // Phase-6 (6.3)
};

// ── Phase-2 (2.6): per-row merge save helper ──────────────────────────
// Replaces the previous "filter all + save all" pattern that caused
// concurrent writers (multi-tab / multi-device) to overwrite each other.
// Now: callers pass ONLY the rows being changed; existing localStorage
// rows are preserved by id-keyed merge.
export const _mergeIntoLocal = <T extends { id: string }>(key: string, incoming: T[]): T[] => {
  let existing: T[] = [];
  try { existing = safeParse(key) as T[]; } catch { existing = []; }
  const idMap = new Map<string, T>();
  for (const row of existing) if (row && row.id) idMap.set(row.id, row);
  for (const row of incoming) if (row && row.id) idMap.set(row.id, row);
  const merged = Array.from(idMap.values());
  safeSave(key, merged);
  return merged;
};

// ── Phase-2 (2.6): generic per-row delete (cloud + local) ─────────────
export const _deleteRow = async (table: string, localKey: string, id: string): Promise<void> => {
  // Local delete first
  try {
    const existing = safeParse(localKey) as Array<{ id: string }>;
    safeSave(localKey, existing.filter((r) => r.id !== id));
  } catch (e: unknown) {
    // P3-16: Logger instead of console.warn
    Logger.warn('Sales', `_deleteRow local prune failed for ${table}/${id}`, e);
  }
  // Cloud delete
  try {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      Logger.error('Sales', `delete ${table}/${id} cloud failed`, error);
      _queueRetry(table);
    }
  } catch (err: unknown) {
    Logger.error('Sales', `delete ${table}/${id} exception`, err);
    _queueRetry(table);
  }
};
