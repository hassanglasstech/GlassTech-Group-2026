import { Client, Vendor } from '../types/crm';
import { Product, Quotation, Project } from '../../shared/types';

const KEYS = {
  CLIENTS: 'gtk_erp_clients',
  PRODUCTS: 'gtk_erp_products',
  QUOTATIONS: 'gtk_erp_quotations',
  PROJECTS: 'gtk_erp_projects',
  VENDORS: 'gtk_erp_vendors',
};

import { safeParse } from '../../shared/services/utils';

export const SalesService = {
  getClients: (): Client[] => safeParse(KEYS.CLIENTS),
  saveClients: (data: Client[]) => localStorage.setItem(KEYS.CLIENTS, JSON.stringify(data)),
  getProducts: (): Product[] => safeParse(KEYS.PRODUCTS),
  saveProducts: (data: Product[]) => localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(data)),
  getQuotations: (): Quotation[] => safeParse(KEYS.QUOTATIONS),
  saveQuotations: (data: Quotation[]) => localStorage.setItem(KEYS.QUOTATIONS, JSON.stringify(data)),
  getProjects: (): Project[] => safeParse(KEYS.PROJECTS),
  saveProjects: (data: Project[]) => localStorage.setItem(KEYS.PROJECTS, JSON.stringify(data)),
  getVendors: (): Vendor[] => safeParse(KEYS.VENDORS),
  saveVendors: (data: Vendor[]) => localStorage.setItem(KEYS.VENDORS, JSON.stringify(data)),
};