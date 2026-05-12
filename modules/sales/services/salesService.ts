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
    _push('clients', () => AsyncSalesService.saveClients(data));
  },

  // ── Products ───────────────────────────────────────────────────────
  getProducts: (): Product[] => safeParse(KEYS.PRODUCTS),
  saveProducts: (data: Product[]): void => {
    safeSave(KEYS.PRODUCTS, data);
    _push('products', () => AsyncSalesService.saveProducts(data));
  },

  // ── Quotations ─────────────────────────────────────────────────────
  getQuotations: (): Quotation[] => safeParse(KEYS.QUOTATIONS),
  saveQuotations: (data: Quotation[]): void => {
    safeSave(KEYS.QUOTATIONS, data);
    _push('quotations', () => AsyncSalesService.saveQuotations(data));
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
    _push('payment_receipts', () => AsyncSalesService.savePaymentReceipts(data));
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
      saveIfNonEmpty(KEYS.CLIENTS,          clients);
      saveIfNonEmpty(KEYS.PRODUCTS,         products);
      saveIfNonEmpty(KEYS.QUOTATIONS,       quotations);
      saveIfNonEmpty(KEYS.VENDORS,          vendors);
      saveIfNonEmpty(KEYS.INVOICES,         invoices);
      saveIfNonEmpty(KEYS.PAYMENT_RECEIPTS, receipts);
    } catch (err: unknown) {
      Logger.warn('Sales', 'warmCache failed — using local data', err);
    }
  },
};
