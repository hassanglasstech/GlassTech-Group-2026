import { Client, Vendor } from '../types/crm';
import { Product, Quotation, Project } from '../../shared/types';
import { safeParse, safeSave, safeAsync } from '../../shared/services/utils';
import { safeSupabase, translateError } from '../../shared/services/networkService';
import { toast } from 'sonner';
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
    safeSave(KEYS.CLIENTS, data);
  },
  
  getProducts: async (): Promise<Product[]> => {
    const data = await safeSupabase(
      () => supabase.from('products').select('*'),
      { context: 'getProducts', fallback: null, silent: false }
    );
    if (!data) return safeParse('gtk_erp_products');
    {
    return (data ?? []).map((r: any) => ({
      id: r.id, company: r.company, category: r.category, description: r.description,
      serviceNick: r.service_nick ?? '', profileCode: r.profile_code ?? '',
      thickness: r.thickness ?? '', sheetSize: r.sheet_size ?? '',
      costPrice: r.cost_price ?? 0, basePrice: r.base_price ?? 0,
      unit: r.unit ?? 'PCS', variants: r.variants ?? [],
      modelNo: r.model_no ?? '', brand: r.brand ?? '',
      mainCategory: r.main_category ?? '', subCategory: r.sub_category ?? '',
      finishColor: r.finish_color ?? '', material: r.material ?? '',
      direction: r.direction ?? '', tongueLength: r.tongue_length ?? '',
      spindleLength: r.spindle_length ?? '', imageUrl: r.image_url ?? '',
      hsCode: r.hs_code ?? '', isSet: r.is_set ?? false,
      setComponents: r.set_components ?? [], technicalSpecs: r.technical_specs ?? {},
      width: r.width ?? 0, height: r.height ?? 0,
      frameColor: r.frame_color ?? '', meshColor: r.mesh_color ?? '',
    }));
  },
  saveProducts: async (data: Product[]): Promise<void> => {
    const mapped = data.map((p: any) => ({
      id: p.id, company: p.company, category: p.category, description: p.description,
      service_nick: p.serviceNick ?? '', profile_code: p.profileCode ?? '',
      thickness: p.thickness ?? '', sheet_size: p.sheetSize ?? '',
      cost_price: p.costPrice ?? 0, base_price: p.basePrice ?? 0,
      unit: p.unit ?? 'PCS', variants: p.variants ?? [],
      model_no: p.modelNo ?? '', brand: p.brand ?? '',
      main_category: p.mainCategory ?? '', sub_category: p.subCategory ?? '',
      finish_color: p.finishColor ?? '', material: p.material ?? '',
      direction: p.direction ?? '', tongue_length: p.tongueLength ?? '',
      spindle_length: p.spindleLength ?? '', image_url: p.imageUrl ?? '',
      hs_code: p.hsCode ?? '', is_set: p.isSet ?? false,
      set_components: p.setComponents ?? [], technical_specs: p.technicalSpecs ?? {},
      width: p.width ?? 0, height: p.height ?? 0,
      frame_color: p.frameColor ?? '', mesh_color: p.meshColor ?? '',
    }));
    const { error } = await supabase.from('products').upsert(mapped);
    if (error) {
      console.error('[AsyncSalesService] saveProducts failed:', error.message);
      toast.error('Cloud sync failed — data saved locally.', { id: 'products-save', duration: 3000 });
    }
  },
  
  getQuotations: async (): Promise<Quotation[]> => {
    await delay(100);
    return safeParse(KEYS.QUOTATIONS);
  },
  saveQuotations: async (data: Quotation[]): Promise<void> => {
    await delay(100);
    safeSave(KEYS.QUOTATIONS, data);
  },
  
  getProjects: async (): Promise<Project[]> => {
    await delay(100);
    return safeParse(KEYS.PROJECTS);
  },
  saveProjects: async (data: Project[]): Promise<void> => {
    await delay(100);
    safeSave(KEYS.PROJECTS, data);
  },
  
  getVendors: async (): Promise<Vendor[]> => {
    await delay(100);
    return safeParse(KEYS.VENDORS);
  },
  saveVendors: async (data: Vendor[]): Promise<void> => {
    await delay(100);
    safeSave(KEYS.VENDORS, data);
  },
};
