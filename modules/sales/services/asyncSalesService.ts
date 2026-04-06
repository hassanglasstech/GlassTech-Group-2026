import { Client, Vendor } from '../types/crm';
import { Product, Quotation, Project } from '../../shared/types';
import { Invoice, PaymentReceipt } from '../../finance/types/finance';
import { guardedSave, withTimestamp } from '@/modules/shared/services/concurrencyService';
import { safeParse, safeSave } from '../../shared/services/utils';
import { toast } from 'sonner';
import { Logger } from '@/modules/shared/services/logger';
import { supabase } from '../../../src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';

// Helper — gets current user email at call time (outside React, so we use getState)
const _currentUser = () => useAuthStore.getState().profile?.email ?? useAuthStore.getState().user?.email ?? 'unknown';

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
        const mapped = data.map((r: any) => ({
          ...r,
          contactPerson: r.contact_person ?? r.contactPerson ?? '',
          creditLimit: r.credit_limit ?? r.creditLimit ?? 0,
          createdAt: r.created_at ?? r.createdAt ?? '',
        }));
        safeSave(KEYS.CLIENTS, mapped);
        return mapped as Client[];
      }
      // Supabase empty — fall back to localStorage
      return safeParse(KEYS.CLIENTS);
    } catch (err: any) {
      console.error('[AsyncSalesService] getClients exception:', err.message);
      return safeParse(KEYS.CLIENTS);
    }
  },
  saveClients: async (data: Client[]): Promise<void> => {
    // Always save locally first
    safeSave(KEYS.CLIENTS, data);
    // Upsert to Supabase (snake_case mapping)
    try {
      const rows = data.map((c: any) => ({
        id: c.id,
        company: c.company,
        name: c.name,
        contact_person: c.contactPerson ?? c.contact_person ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
        address: c.address ?? '',
        ntn: c.ntn ?? '',
        credit_limit: c.creditLimit ?? c.credit_limit ?? 0,
        status: c.status ?? 'Active',
        created_at: c.createdAt ?? c.created_at ?? new Date().toISOString(),
      }));
      const { error } = await supabase.from('clients').upsert(rows);
      if (error) {
        console.error('[AsyncSalesService] saveClients Supabase error:', error.message);
      }
    } catch (err: any) {
      console.error('[AsyncSalesService] saveClients exception:', err.message);
    }
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
        service_charges: q.serviceCharges || [],
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


  getVendors: async (): Promise<Vendor[]> => {
    try {
      const { data, error } = await supabase.from('vendor_contracts').select('*');
      if (error || !data || data.length === 0) return safeParse(KEYS.VENDORS);
      const mapped = data.map((r: any) => ({ ...r }));
      safeSave(KEYS.VENDORS, mapped);
      return mapped as Vendor[];
    } catch {
      return safeParse(KEYS.VENDORS);
    }
  },
  saveVendors: async (data: Vendor[]): Promise<void> => {
    safeSave(KEYS.VENDORS, data);
    try {
      const { error } = await supabase.from('vendor_contracts').upsert(data.map((v: any) => ({ ...v })));
      if (error) Logger.error('Sales', 'saveVendors failed', error);
    } catch (err: any) {
      Logger.error('Sales', 'saveVendors exception', err);
    }
  },

  getInvoices: async (): Promise<Invoice[]> => {
    try {
      const { data, error } = await supabase.from('invoices').select('*');
      if (error || !data || data.length === 0) return safeParse('gtk_erp_invoices');
      const mapped = data.map((r: any) => ({
        id: r.id, company: r.company, orderId: r.order_id, orderNo: r.order_no,
        clientId: r.client_id, clientName: r.client_name, date: r.date, dueDate: r.due_date,
        totalAmount: r.total_amount, receivedAmount: r.received_amount, balance: r.balance,
        status: r.status, glTxId: r.gl_tx_id, payments: r.payments || [],
      }));
      safeSave('gtk_erp_invoices', mapped);
      return mapped as Invoice[];
    } catch {
      return safeParse('gtk_erp_invoices');
    }
  },
  saveInvoices: async (data: Invoice[]): Promise<void> => {
    safeSave('gtk_erp_invoices', data);
    try {
      const rows = data.map((i: any) => ({
        id: i.id, company: i.company, order_id: i.orderId, order_no: i.orderNo,
        client_id: i.clientId, client_name: i.clientName, date: i.date, due_date: i.dueDate,
        total_amount: i.totalAmount, received_amount: i.receivedAmount, balance: i.balance,
        status: i.status, gl_tx_id: i.glTxId, payments: i.payments || [],
        created_by: i.createdBy ?? i.created_by ?? null,
        updated_by: _currentUser(),
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('invoices').upsert(rows);
      if (error) Logger.error('Sales', 'saveInvoices failed', error);
    } catch (err: any) {
      Logger.error('Sales', 'saveInvoices exception', err);
    }
  },

  getPaymentReceipts: async (): Promise<PaymentReceipt[]> => {
    try {
      const { data, error } = await supabase.from('payment_receipts').select('*');
      if (error || !data || data.length === 0) return safeParse('gtk_erp_payment_receipts');
      const mapped = data.map((r: any) => ({
        id: r.id, invoiceId: r.invoice_id, date: r.date, amount: r.amount,
        method: r.method, reference: r.reference, glTxId: r.gl_tx_id,
      }));
      safeSave('gtk_erp_payment_receipts', mapped);
      return mapped as PaymentReceipt[];
    } catch {
      return safeParse('gtk_erp_payment_receipts');
    }
  },
  savePaymentReceipts: async (data: PaymentReceipt[]): Promise<void> => {
    safeSave('gtk_erp_payment_receipts', data);
    try {
      const rows = data.map((r: any) => ({
        id: r.id, invoice_id: r.invoiceId, date: r.date, amount: r.amount,
        method: r.method, reference: r.reference, gl_tx_id: r.glTxId,
        created_by: r.createdBy ?? r.created_by ?? null,
        updated_by: _currentUser(),
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('payment_receipts').upsert(rows);
      if (error) Logger.error('Sales', 'savePaymentReceipts failed', error);
    } catch (err: any) {
      Logger.error('Sales', 'savePaymentReceipts exception', err);
    }
  },

  saveProjects: async (data: Project[]): Promise<void> => {
    safeSave(KEYS.PROJECTS, data);
    try {
      const { error } = await supabase.from('projects').upsert(data.map((p: any) => ({ ...p })));
      if (error) Logger.error('Sales', 'saveProjects failed', error);
    } catch (err: any) {
      Logger.error('Sales', 'saveProjects exception', err);
    }
  },
};
