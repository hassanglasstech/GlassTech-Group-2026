import { Client, Vendor } from '../types/crm';
import { Product, Quotation, Project } from '../../shared/types';
import { safeParse, safeSave } from '../../shared/services/utils';
import { AsyncSalesService } from './asyncSalesService';

const KEYS = {
  CLIENTS:          'gtk_erp_clients',
  PRODUCTS:         'gtk_erp_products',
  QUOTATIONS:       'gtk_erp_quotations',
  PROJECTS:         'gtk_erp_projects',
  VENDORS:          'gtk_erp_vendors',
  INVOICES:         'gtk_erp_invoices',
  PAYMENT_RECEIPTS: 'gtk_erp_payment_receipts',
};

const bgRefresh = (fn: () => Promise<void>) => { fn().catch(() => {}); };

export const SalesService = {
  getClients: (): Client[] => safeParse(KEYS.CLIENTS),
  saveClients: (data: Client[]) => { safeSave(KEYS.CLIENTS, data); bgRefresh(() => AsyncSalesService.saveClients(data)); },

  getProducts: (): Product[] => safeParse(KEYS.PRODUCTS),
  saveProducts: (data: Product[]) => { safeSave(KEYS.PRODUCTS, data); bgRefresh(() => AsyncSalesService.saveProducts(data)); },

  getQuotations: (): Quotation[] => safeParse(KEYS.QUOTATIONS),
  saveQuotations: (data: Quotation[]) => { safeSave(KEYS.QUOTATIONS, data); bgRefresh(() => AsyncSalesService.saveQuotations(data)); },

  getProjects: (): Project[] => safeParse(KEYS.PROJECTS),
  saveProjects: (data: Project[]) => { safeSave(KEYS.PROJECTS, data); bgRefresh(() => AsyncSalesService.saveProjects(data)); },

  getVendors: (): Vendor[] => safeParse(KEYS.VENDORS),
  saveVendors: (data: Vendor[]) => { safeSave(KEYS.VENDORS, data); bgRefresh(() => AsyncSalesService.saveVendors(data)); },

  getInvoices: (): any[] => safeParse(KEYS.INVOICES),
  saveInvoices: (data: any[]) => { safeSave(KEYS.INVOICES, data); bgRefresh(() => AsyncSalesService.saveInvoices(data)); },

  getPaymentReceipts: (): any[] => safeParse(KEYS.PAYMENT_RECEIPTS),
  savePaymentReceipts: (data: any[]) => { safeSave(KEYS.PAYMENT_RECEIPTS, data); bgRefresh(() => AsyncSalesService.savePaymentReceipts(data)); },

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
      safeSave(KEYS.CLIENTS,          clients);
      safeSave(KEYS.PRODUCTS,         products);
      safeSave(KEYS.QUOTATIONS,       quotations);
      safeSave(KEYS.VENDORS,          vendors);
      safeSave(KEYS.INVOICES,         invoices);
      safeSave(KEYS.PAYMENT_RECEIPTS, receipts);
    } catch { /* offline */ }
  },
};
