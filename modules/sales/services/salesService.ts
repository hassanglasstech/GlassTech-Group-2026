// ═══════════════════════════════════════════════════════════════════════
//  salesService.ts — Sales Service
//  PHASE 1 FIX: Replace silent bgRefresh with visible error handling
//  Pattern: Write localStorage immediately → push Supabase with toast on error
// ═══════════════════════════════════════════════════════════════════════

import { Client, Vendor } from '../types/crm';
import { Product, Quotation, Project } from '../../shared/types';
import { Invoice, PaymentReceipt } from '../../finance/types/finance';
import { safeParse, safeSave } from '../../shared/services/utils';
import { AsyncSalesService } from './asyncSalesService';
import { Logger } from '@/modules/shared/services/logger';
import { toast } from 'sonner';

const KEYS = {
  CLIENTS:          'gtk_erp_clients',
  PRODUCTS:         'gtk_erp_products',
  QUOTATIONS:       'gtk_erp_quotations',
  PROJECTS:         'gtk_erp_projects',
  VENDORS:          'gtk_erp_vendors',
  INVOICES:         'gtk_erp_invoices',
  PAYMENT_RECEIPTS: 'gtk_erp_payment_receipts',
};

// ── Supabase push with visible error — never silent ───────────────────
const _push = async (label: string, fn: () => Promise<void>): Promise<void> => {
  try {
    await fn();
  } catch (err: unknown) {
    Logger.error('Sales', `${label} sync failed`, err);
    toast.error(`Cloud sync failed (${label}) — data saved locally.`, {
      id: `sales-sync-${label}`, duration: 5000,
    });
  }
};

export const SalesService = {
  // ── Clients ────────────────────────────────────────────────────────
  getClients: (): Client[] => safeParse(KEYS.CLIENTS),
  saveClients: (data: Client[]): void => {
    safeSave(KEYS.CLIENTS, data);
    _push('clients', () => AsyncSalesService.saveClients(data).then(() => {}));
  },

  // ── Products ───────────────────────────────────────────────────────
  getProducts: (): Product[] => safeParse(KEYS.PRODUCTS),
  saveProducts: (data: Product[]): void => {
    safeSave(KEYS.PRODUCTS, data);
    // saveProducts now returns { error } for awaiting callers; the fire-and-forget
    // wrapper just needs a Promise<void>, so discard the result here.
    _push('products', async () => { await AsyncSalesService.saveProducts(data); });
  },

  // ── Quotations ─────────────────────────────────────────────────────
  getQuotations: (): Quotation[] => safeParse(KEYS.QUOTATIONS),
  saveQuotations: (data: Quotation[]): void => {
    safeSave(KEYS.QUOTATIONS, data);
    _push('quotations', () => AsyncSalesService.saveQuotations(data).then(() => {}));
  },

  // ── Projects ───────────────────────────────────────────────────────
  getProjects: (): Project[] => safeParse(KEYS.PROJECTS),
  saveProjects: (data: Project[]): void => {
    safeSave(KEYS.PROJECTS, data);
    _push('projects', () => AsyncSalesService.saveProjects(data));
  },

  // ── Vendors ────────────────────────────────────────────────────────
  getVendors: (): Vendor[] => safeParse(KEYS.VENDORS),
  saveVendors: (data: Vendor[]): void => {
    safeSave(KEYS.VENDORS, data);
    _push('vendors', () => AsyncSalesService.saveVendors(data));
  },

  // ── Invoices ───────────────────────────────────────────────────────
  getInvoices: (): Invoice[] => safeParse(KEYS.INVOICES),
  saveInvoices: (data: Invoice[]): void => {
    safeSave(KEYS.INVOICES, data);
    _push('invoices', () => AsyncSalesService.saveInvoices(data));
  },

  // ── Payment Receipts ───────────────────────────────────────────────
  getPaymentReceipts: (): PaymentReceipt[] => safeParse(KEYS.PAYMENT_RECEIPTS),
  savePaymentReceipts: (data: PaymentReceipt[]): void => {
    safeSave(KEYS.PAYMENT_RECEIPTS, data);
    _push('payment_receipts', async () => { await AsyncSalesService.savePaymentReceipts(data); });
  },

  // ── Warm Cache (app start — pull latest from Supabase) ─────────────
  // CRITICAL: Only overwrite localStorage if Supabase returned non-empty data.
  // Otherwise unsynced local entries (e.g. recent opening-balance posts that
  // failed Supabase upsert) get wiped on next login, making data "disappear".
  warmCache: async (): Promise<void> => {
    try {
      const [clients, products, quotations, vendors, invoices, receipts] = await Promise.all([
        AsyncSalesService.getClients(),
        AsyncSalesService.getProducts(),
        AsyncSalesService.getQuotations(),
        AsyncSalesService.getVendors(),
        AsyncSalesService.getInvoices(),
        AsyncSalesService.getPaymentReceipts(),
      ]);
      // Guard against empty cloud → don't wipe local unsaved data
      const saveIfNonEmpty = (key: string, data: unknown[]) => {
        if (Array.isArray(data) && data.length > 0) safeSave(key, data);
        else {
          const existing = safeParse(key);
          if (!existing || existing.length === 0) safeSave(key, data || []);
          // else: keep local data (cloud is empty but local has unsynced entries)
        }
      };
      // MASTER DATA (products/clients/vendors) — merge by id, NEVER truncate.
      // A PARTIAL cloud (e.g. products that failed to push land as a subset) must
      // not overwrite a fuller local set, or local master data is silently lost.
      // Cloud wins for overlapping ids; local-only rows (unsynced / other
      // companies / pending push) survive. (2026-07-14: a 1-of-141 cloud was
      // about to wipe the local 141 via the old blind replace.)
      const mergeById = (key: string, cloud: unknown[]) => {
        const c = Array.isArray(cloud) ? cloud : [];
        const local = (safeParse(key) as Array<Record<string, unknown>>) || [];
        const cloudIds = new Set(c.map((x) => (x as { id?: unknown }).id));
        const localOnly = local.filter((x) => x && x.id != null && !cloudIds.has(x.id));
        if (c.length === 0 && localOnly.length === 0) { saveIfNonEmpty(key, c); return; }
        safeSave(key, [...c, ...localOnly]);
      };
      mergeById(KEYS.CLIENTS,               clients);
      mergeById(KEYS.PRODUCTS,              products);
      mergeById(KEYS.VENDORS,               vendors);
      saveIfNonEmpty(KEYS.QUOTATIONS,       quotations);
      saveIfNonEmpty(KEYS.INVOICES,         invoices);
      saveIfNonEmpty(KEYS.PAYMENT_RECEIPTS, receipts);
    } catch (err: unknown) {
      Logger.warn('Sales', 'warmCache failed — using local data', err);
    }
  },
};
