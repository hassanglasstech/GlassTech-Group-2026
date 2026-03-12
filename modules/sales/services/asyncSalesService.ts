import { Client, Vendor } from '../types/crm';
import { Product, Quotation, Project } from '../../shared/types';
import { safeParse } from '../../shared/services/utils';
import { supabase } from '../../../src/services/supabaseClient';

const KEYS = {
  CLIENTS: 'gtk_erp_clients',
  PRODUCTS: 'gtk_erp_products',
  QUOTATIONS: 'gtk_erp_quotations',
  PROJECTS: 'gtk_erp_projects',
  VENDORS: 'gtk_erp_vendors',
};

// Simulate network delay for async operations
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const AsyncSalesService = {
  getClients: async (): Promise<Client[]> => {
    await delay(100);
    return safeParse(KEYS.CLIENTS);
  },
  saveClients: async (data: Client[]): Promise<void> => {
    await delay(100);
    localStorage.setItem(KEYS.CLIENTS, JSON.stringify(data));
  },
  
  getProducts: async (): Promise<Product[]> => {
    const { data, error } = await supabase.from('products').select('*');
    if (error) throw error;
    return data as Product[];
  },
  saveProducts: async (data: Product[]): Promise<void> => {
    const { error } = await supabase.from('products').upsert(data);
    if (error) throw error;
  },
  
  getQuotations: async (): Promise<Quotation[]> => {
    await delay(100);
    return safeParse(KEYS.QUOTATIONS);
  },
  saveQuotations: async (data: Quotation[]): Promise<void> => {
    await delay(100);
    localStorage.setItem(KEYS.QUOTATIONS, JSON.stringify(data));
  },
  
  getProjects: async (): Promise<Project[]> => {
    await delay(100);
    return safeParse(KEYS.PROJECTS);
  },
  saveProjects: async (data: Project[]): Promise<void> => {
    await delay(100);
    localStorage.setItem(KEYS.PROJECTS, JSON.stringify(data));
  },
  
  getVendors: async (): Promise<Vendor[]> => {
    await delay(100);
    return safeParse(KEYS.VENDORS);
  },
  saveVendors: async (data: Vendor[]): Promise<void> => {
    await delay(100);
    localStorage.setItem(KEYS.VENDORS, JSON.stringify(data));
  },
};
