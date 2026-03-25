import { Client, Vendor } from '../types/crm';
import { Product, Quotation, Project } from '../../shared/types';
import { safeParse, safeSave } from '../../shared/services/utils';
import { toast } from 'sonner';
import { Logger } from '@/modules/shared/services/logger';
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
    try {
      const { data, error } = await supabase.from('clients').select('*');
      if (error) {
        console.error('[AsyncSalesService] getClients:', error.message);
        return safeParse(KEYS.CLIENTS);
      }
      if (data && data.length > 0) {
        safeSave(KEYS.CLIENTS, data);
        return data as Client[];
      }
      return safeParse(KEYS.CLIENTS);
    } catch (err: any) {
      console.error('[AsyncSalesService] getClients exception:', err.message);
      return safeParse(KEYS.CLIENTS);
    }
  },
  saveClients: async (data: Client[]): Promise<void> => {
    await delay(100);
    safeSave(KEYS.CLIENTS, data);
  },
  
  getProducts: async (): Promise<Product[]> => {
    try {
      const { data, error } = await supabase.from('products').select('*');
      if (error) {
        console.error('[AsyncSalesService] getProducts:', error.message);
        toast.error('Cloud sync failed — using local products.', { id: 'get-products', duration: 3000 });
        return safeParse('gtk_erp_products');
      }
      return (data ?? []).map((r: any) => ({
      id: r.id, company: r.company, category: r.category, description: r.description,
      serviceNick: r.service_nick ?? '', profileCode: r.profile_code ?? '',
      thickness: r.thickness ?? '', sheetSize: r.sheet_size ?? '',
      costPrice: r.cost_price ?? 0, basePrice: r.base_price ?? 0,
      temperingPrice: r.tempering_price ?? 0,
      unit: r.unit ?? 'PCS', variants: r.variants ?? [],
      modelNo: r.model_no ?? '', brand: r.brand ?? '',
      mainCategory: r.main_category ?? '', subCategory: r.sub_category ?? '',
      glassType: r.glass_type ?? '',
      finishColor: r.finish_color ?? '', material: r.material ?? '',
      direction: r.direction ?? '', tongueLength: r.tongue_length ?? '',
      spindleLength: r.spindle_length ?? '', imageUrl: r.image_url ?? '',
      hsCode: r.hs_code ?? '', isSet: r.is_set ?? false,
      setComponents: r.set_components ?? [], technicalSpecs: r.technical_specs ?? {},
      width: r.width ?? 0, height: r.height ?? 0,
      frameColor: r.frame_color ?? '', meshColor: r.mesh_color ?? '',
      subDescription: r.sub_description ?? '',
    }));
    } catch (err: any) {
      console.error('[AsyncSalesService] getProducts exception:', err.message);
      toast.error('Failed to load products.', { id: 'get-products-err', duration: 3000 });
      return safeParse('gtk_erp_products');
    }
  },
  saveProducts: async (data: Product[]): Promise<void> => {
    const mapped = data.map((p: any) => ({
      id: p.id, company: p.company, category: p.category, description: p.description,
      service_nick: p.serviceNick ?? '', profile_code: p.profileCode ?? '',
      thickness: p.thickness ?? '', sheet_size: p.sheetSize ?? '',
      cost_price: p.costPrice ?? 0, base_price: p.basePrice ?? 0,
      unit: p.unit ?? 'PCS', variants: p.variants ?? [],
      model_no: p.modelNo ?? '', brand: p.brand ?? '',
      main_category: p.mainCategory ?? '', sub_category: p.sub_category ?? '',
      finish_color: p.finishColor ?? '', material: p.material ?? '',
      direction: p.direction ?? '', tongue_length: p.tongueLength ?? '',
      spindle_length: p.spindle_length ?? '', image_url: p.imageUrl ?? '',
      hs_code: p.hs_code ?? '', is_set: p.isSet ?? false,
      set_components: p.setComponents ?? [], technical_specs: p.technicalSpecs ?? {},
      width: p.width ?? 0, height: p.height ?? 0,
      frame_color: p.frameColor ?? '', mesh_color: p.meshColor ?? '',
    }));
    const { error } = await supabase.from('products').upsert(mapped);
    if (error) {
      Logger.error('Sales', 'saveProducts failed', error);
      console.error('[AsyncSalesService] saveProducts:', error.message);
      toast.error('Cloud save failed — data saved locally.', { id: 'save-products', duration: 3000 });
    }
  },
  
  getQuotations: async (): Promise<Quotation[]> => {
    try {
      const { data, error } = await supabase.from('quotations').select('*');
      if (error) {
        console.error('[AsyncSalesService] getQuotations:', error.message);
        return safeParse(KEYS.QUOTATIONS);
      }
      if (data && data.length > 0) {
        // Map snake_case to camelCase
        const mapped = data.map((r: any) => ({
          id: r.id, company: r.company, date: r.date,
          dueDate: r.due_date, clientId: r.client_id,
          projectName: r.project_name, subject: r.subject,
          items: Array.isArray(r.items) ? r.items : (typeof r.items === 'string' ? (() => { try { return JSON.parse(r.items); } catch { return []; } })() : []),
          serviceCharges: Array.isArray(r.service_charges) ? r.service_charges : [],
          discountPercent: r.discount_percent, discountAmount: r.discount_amount,
          status: r.status, orderNo: r.order_no,
          isAlreadyDispatched: r.is_already_dispatched,
          manualRef: r.manual_ref,
        }));
        safeSave(KEYS.QUOTATIONS, mapped);
        return mapped;
      }
      return safeParse(KEYS.QUOTATIONS);
    } catch (err: any) {
      console.error('[AsyncSalesService] getQuotations exception:', err.message);
      return safeParse(KEYS.QUOTATIONS);
    }
  },
  saveQuotations: async (data: Quotation[]): Promise<void> => {
    try {
      // Map camelCase to snake_case for Supabase
      const mapped = data.map((q: any) => ({
        id: q.id,
        company: q.company,
        date: q.date,
        due_date: q.dueDate,
        client_id: q.clientId,
        project_name: q.projectName,
        subject: q.subject,
        items: q.items || [],
        service_charges: q.serviceCharges || 0,
        discount_percent: q.discountPercent || 0,
        discount_amount: q.discountAmount || 0,
        status: q.status,
        order_no: q.orderNo,
        is_already_dispatched: q.isAlreadyDispatched || false,
        manual_ref: q.manualRef || '',
      }));

      if (supabase) {
        const { error } = await supabase.from('quotations').upsert(mapped);
        if (error) {
          console.error('[AsyncSalesService] Supabase Error:', error.message);
          toast.error('Cloud sync failed — saved locally.', { id: 'sync-err' });
        } else {
          toast.success('Synced to Cloud', { id: 'sync-success' });
        }
      }
      
      // Always save locally as backup
      safeSave(KEYS.QUOTATIONS, data);
    } catch (err: any) {
      console.error('[AsyncSalesService] saveQuotations exception:', err.message);
      safeSave(KEYS.QUOTATIONS, data);
    }
  },
  
  getProjects: async (): Promise<Project[]> => {
    try {
      const { data, error } = await supabase.from('projects').select('*');
      if (error) {
        console.error('[AsyncSalesService] getProjects:', error.message);
        return safeParse(KEYS.PROJECTS);
      }
      if (data && data.length > 0) {
        safeSave(KEYS.PROJECTS, data);
        return data as Project[];
      }
      return safeParse(KEYS.PROJECTS);
    } catch (err: any) {
      return safeParse(KEYS.PROJECTS);
    }
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
