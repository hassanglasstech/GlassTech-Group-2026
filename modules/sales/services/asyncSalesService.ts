import { Client, Vendor } from '../types/crm';
import { Product, Quotation, Project } from '../../shared/types';
import { safeParse } from '../../shared/services/utils';
import { supabase } from '../../../src/services/supabaseClient';

const KEYS = {
  CLIENTS:    'gtk_erp_clients',
  PRODUCTS:   'gtk_erp_products',
  QUOTATIONS: 'gtk_erp_quotations',
  PROJECTS:   'gtk_erp_projects',
  VENDORS:    'gtk_erp_vendors',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Supabase snake_case → app camelCase
function mapProductDown(r: any): Product {
  return {
    id:              r.id,
    company:         r.company,
    category:        r.category,
    description:     r.description,
    basePrice:       r.base_price        ?? 0,
    costPrice:       r.cost_price        ?? 0,
    unit:            r.unit,
    variants:        r.variants          ?? [],
    thickness:       r.thickness,
    sheetSize:       r.sheet_size,
    serviceNick:     r.service_nick,
    mainCategory:    r.main_category,
    subCategory:     r.sub_category,
    brand:           r.brand,
    modelNo:         r.model_no,
    finishColor:     r.finish_color,
    material:        r.material,
    imageUrl:        r.image_url,
    profileCode:     r.profile_code,
  } as Product;
}

// app camelCase → Supabase snake_case
function mapProductUp(p: any) {
  return {
    id:           p.id,
    company:      p.company,
    category:     p.category,
    description:  p.description,
    base_price:   p.basePrice   ?? 0,
    cost_price:   p.costPrice   ?? 0,
    unit:         p.unit,
    variants:     p.variants    ?? [],
    thickness:    p.thickness,
    sheet_size:   p.sheetSize,
    service_nick: p.serviceNick,
    profile_code: p.profileCode,
  };
}

export const AsyncSalesService = {
  getClients: async (): Promise<Client[]> => {
    await delay(100);
    return safeParse(KEYS.CLIENTS) ?? [];
  },
  saveClients: async (data: Client[]): Promise<void> => {
    await delay(100);
    localStorage.setItem(KEYS.CLIENTS, JSON.stringify(data));
  },

  getProducts: async (): Promise<Product[]> => {
    // Try localStorage first (already mapped by SyncService.fetchFromCloud)
    const cached = safeParse(KEYS.PRODUCTS);
    if (cached && cached.length > 0) return cached;
    // Fallback: fetch directly from Supabase and map
    const { data, error } = await supabase.from('products').select('*');
    if (error) throw error;
    const mapped = (data ?? []).map(mapProductDown);
    localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(mapped));
    return mapped;
  },
  saveProducts: async (data: Product[]): Promise<void> => {
    localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(data));
    const { error } = await supabase.from('products').upsert(data.map(mapProductUp));
    if (error) throw error;
  },

  getQuotations: async (): Promise<Quotation[]> => {
    await delay(100);
    return safeParse(KEYS.QUOTATIONS) ?? [];
  },
  saveQuotations: async (data: Quotation[]): Promise<void> => {
    await delay(100);
    localStorage.setItem(KEYS.QUOTATIONS, JSON.stringify(data));
  },

  getProjects: async (): Promise<Project[]> => {
    await delay(100);
    return safeParse(KEYS.PROJECTS) ?? [];
  },
  saveProjects: async (data: Project[]): Promise<void> => {
    await delay(100);
    localStorage.setItem(KEYS.PROJECTS, JSON.stringify(data));
  },

  getVendors: async (): Promise<Vendor[]> => {
    await delay(100);
    return safeParse(KEYS.VENDORS) ?? [];
  },
  saveVendors: async (data: Vendor[]): Promise<void> => {
    await delay(100);
    localStorage.setItem(KEYS.VENDORS, JSON.stringify(data));
  },
};
