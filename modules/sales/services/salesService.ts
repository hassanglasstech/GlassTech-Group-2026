import { Client, Vendor } from '../types/crm';
import { Product, Quotation, Project } from '../../shared/types';

const KEYS = {
  CLIENTS: 'gtk_erp_clients',
  PRODUCTS: 'gtk_erp_products',
  QUOTATIONS: 'gtk_erp_quotations',
  PROJECTS: 'gtk_erp_projects',
  VENDORS: 'gtk_erp_vendors',
};

import { safeParse, safeSave } from '../../shared/services/utils';
import { toast } from 'sonner';

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
};
