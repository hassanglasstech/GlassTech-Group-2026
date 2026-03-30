import { Client, Vendor } from '../types/crm';
import { Product, Quotation, Project } from '../../shared/types';

const KEYS = {
  CLIENTS: 'gtk_erp_clients',
  PRODUCTS: 'gtk_erp_products',
  QUOTATIONS: 'gtk_erp_quotations',
  PROJECTS: 'gtk_erp_projects',
  VENDORS: 'gtk_erp_vendors',
  INVOICES: 'gtk_erp_invoices',
  PAYMENT_RECEIPTS: 'gtk_erp_payment_receipts',
};

import { safeParse, safeSave } from '../../shared/services/utils';
import { toast } from 'sonner';

// ── Lazy import SyncService to trigger cloud push after invoice/payment saves ──
const triggerSync = async (table: string) => {
  try {
    const { SyncService } = await import('@/src/services/SyncService');
    SyncService.markDirty(table);
  } catch {
    // Sync not available (offline or import error) — localStorage save is sufficient
  }
};

export const SalesService = {
  getClients: (): Client[] => safeParse(KEYS.CLIENTS),
  saveClients: (data: Client[]) => safeSave(KEYS.CLIENTS, data),
  getProducts: (): Product[] => safeParse(KEYS.PRODUCTS),
  saveProducts: (data: Product[]) => safeSave(KEYS.PRODUCTS, data),
  getQuotations: (): Quotation[] => safeParse(KEYS.QUOTATIONS),
  saveQuotations: (data: Quotation[]) => safeSave(KEYS.QUOTATIONS, data),
  getProjects: (): Project[] => safeParse(KEYS.PROJECTS),
  saveProjects: (data: Project[]) => safeSave(KEYS.PROJECTS, data),
  getVendors: (): Vendor[] => safeParse(KEYS.VENDORS),
  saveVendors: (data: Vendor[]) => safeSave(KEYS.VENDORS, data),

  // ── Invoices (now with Supabase sync) ──
  getInvoices: (): any[] => safeParse(KEYS.INVOICES),
  saveInvoices: (data: any[]) => {
    const result = safeSave(KEYS.INVOICES, data);
    if (result) triggerSync('invoices');
    return result;
  },

  // ── Payment Receipts (now with Supabase sync) ──
  getPaymentReceipts: (): any[] => safeParse(KEYS.PAYMENT_RECEIPTS),
  savePaymentReceipts: (data: any[]) => {
    const result = safeSave(KEYS.PAYMENT_RECEIPTS, data);
    if (result) triggerSync('payment_receipts');
    return result;
  },
};
