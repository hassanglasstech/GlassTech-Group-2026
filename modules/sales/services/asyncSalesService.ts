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
    // SEC-3: scope to caller's company — defence-in-depth over DB-level RLS.
    const company = useAuthStore.getState().profile?.company ?? '';
    try {
      const { data, error } = await supabase.from('clients').select('*').eq('company', company);
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
    const company = useAuthStore.getState().profile?.company ?? '';
    try {
      const { data, error } = await supabase.from('products').select('*').eq('company', company);
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
    const mapped = data.map((p: any) => {
      const isNippon = p.company === 'Nippon';

      // ── Core (every company) ───────────────────────────────────────────
      const row: Record<string, unknown> = {
        id:              p.id,
        company:         p.company,
        category:        p.category,
        description:     p.description,
        unit:            p.unit          ?? 'PCS',
        base_price:      p.basePrice     ?? 0,
        cost_price:      p.costPrice     ?? 0,
        variants:        p.variants      ?? [],
        price_history:   p.priceHistory  ?? [],
        model_no:        p.modelNo       ?? p.model_no    ?? '',
        brand:           p.brand         ?? '',
        image_url:       p.imageUrl      ?? p.image_url   ?? '',
        sub_category:    p.subCategory   ?? p.sub_category ?? '',
      };

      // ── Glass / Glassco columns ────────────────────────────────────────
      if (p.category === 'Glass' || p.company === 'Glassco') {
        row.glass_type      = p.glassType      ?? p.glass_type      ?? '';
        row.thickness       = p.thickness      ?? '';
        row.sheet_size      = p.sheetSize      ?? p.sheet_size      ?? '';
        row.finish_color    = p.finishColor    ?? p.finish_color    ?? '';
        row.tempering_price = p.temperingPrice ?? p.tempering_price ?? 0;
        row.width           = p.width          ?? 0;
        row.height          = p.height         ?? 0;
      }

      // ── Service nick (Glassco services) ───────────────────────────────
      if (p.category === 'Service') {
        row.service_nick = p.serviceNick ?? p.service_nick ?? '';
      }

      // ── Aluminium profile columns (GTK / GTI) ─────────────────────────
      if (p.company === 'GTK' || p.company === 'GTI') {
        row.profile_code  = p.profileCode  ?? p.profile_code  ?? '';
        row.main_category = p.mainCategory ?? p.main_category ?? '';
      }

      // ── Nippon-only hardware columns ───────────────────────────────────
      if (isNippon) {
        row.direction      = p.direction     ?? '';
        row.tongue_length  = p.tongueLength  ?? p.tongue_length  ?? '';
        row.spindle_length = p.spindleLength ?? p.spindle_length ?? '';
        row.frame_color    = p.frameColor    ?? p.frame_color    ?? '';
        row.mesh_color     = p.meshColor     ?? p.mesh_color     ?? '';
        row.material       = p.material      ?? '';
        row.hs_code        = p.hsCode        ?? p.hs_code        ?? '';
        row.is_set         = p.isSet         ?? false;
        row.set_components = p.setComponents ?? [];
        row.technical_specs = p.technicalSpecs ?? p.technical_specs ?? {};
      }

      return row;
    });

    const { error } = await supabase.from('products').upsert(mapped);
    if (error) {
      Logger.error('Sales', 'saveProducts failed', error);
      console.error('[AsyncSalesService] saveProducts Supabase error:', error.message, error.details);
      toast.error(`Products cloud sync failed: ${error.message}`, { id: 'save-products', duration: 6000 });
    }
  },
  
  getQuotations: async (): Promise<Quotation[]> => {
    const company = useAuthStore.getState().profile?.company ?? '';
    try {
      const { data, error } = await supabase.from('quotations').select('*').eq('company', company);
      if (error) {
        console.error('[AsyncSalesService] getQuotations:', error.message);
        return safeParse(KEYS.QUOTATIONS);
      }
      if (data && data.length > 0) {
        // Restore full object from JSONB data column — no fields lost
        const mapped = data.map((r: any) => {
          const base = r.data && typeof r.data === 'object' ? r.data : {};
          return {
            ...base,
            id:      r.id,
            company: r.company,
            // Merge back extra indexed columns (migrations 021 + 027)
            orderType:        r.order_type        ?? base.orderType        ?? 'Standard',
            originalOrderRef: r.original_order_ref ?? base.originalOrderRef ?? undefined,
            replacementReason:r.replacement_reason ?? base.replacementReason ?? undefined,
            costBearer:       r.cost_bearer        ?? base.costBearer        ?? undefined,
          };
        });
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
    // SAL-1: server-side discount cap — last line of defence before DB write.
    for (const q of data) {
      const subTotal = ((q as any).items ?? []).reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
      const discPct  = Number((q as any).discountPercent ?? 0);
      const discAmt  = Number((q as any).discountAmount  ?? 0);
      if (discPct > 99.99)
        throw new Error(`SAL-1: Discount percent ${discPct}% exceeds 99.99% on quotation ${q.id}`);
      if (subTotal > 0 && discAmt > subTotal)
        throw new Error(`SAL-1: Discount amount PKR ${discAmt} exceeds subtotal PKR ${subTotal} on quotation ${q.id}`);
    }

    try {
      // Save entire object in JSONB data column — ALL fields preserved, no mapping required.
      // Extra columns (from migrations 021 + 027) also populated for server-side filtering/indexing.
      const mapped = data.map((q: any) => ({
        id:                   q.id,
        company:              q.company,
        data:                 q,                           // ← full object, zero fields lost
        order_type:           q.orderType           ?? 'Standard',
        original_order_ref:   q.originalOrderRef    ?? null,
        replacement_reason:   q.replacementReason   ?? null,
        cost_bearer:          q.costBearer          ?? null,
      }));

      if (supabase) {
        const { error } = await supabase.from('quotations').upsert(mapped, { onConflict: 'id' });
        if (error) {
          console.error('[AsyncSalesService] Supabase Error:', error.message);
          toast.error('Cloud sync failed — saved locally.', { id: 'sync-err' });
        } else {
          toast.success('Synced to Cloud', { id: 'sync-success' });
        }
      }

      safeSave(KEYS.QUOTATIONS, data);
    } catch (err: any) {
      console.error('[AsyncSalesService] saveQuotations exception:', err.message);
      safeSave(KEYS.QUOTATIONS, data);
    }
  },
  
  getProjects: async (): Promise<Project[]> => {
    const company = useAuthStore.getState().profile?.company ?? '';
    try {
      const { data, error } = await supabase.from('projects').select('*').eq('company', company);
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
    const company = useAuthStore.getState().profile?.company ?? '';
    try {
      const { data, error } = await supabase.from('vendors').select('*').eq('company', company);
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
      const mapped = data.map((v: any) => ({
        id: v.id,
        company: v.company || '',
        data: v,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('vendors').upsert(mapped, { onConflict: 'id' });
      if (error) Logger.error('Sales', 'saveVendors failed', error);
    } catch (err: any) {
      Logger.error('Sales', 'saveVendors exception', err);
    }
  },

  getInvoices: async (): Promise<Invoice[]> => {
    const company = useAuthStore.getState().profile?.company ?? '';
    try {
      const { data, error } = await supabase.from('invoices').select('*').eq('company', company);
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
  // SAL-3: Query live outstanding AR for a client from the invoices table.
  // Used by QuotationManager to enforce credit limits before saving.
  getClientOutstandingAR: async (clientId: string, company: string): Promise<number> => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('balance')
        .eq('company', company)
        .eq('client_id', clientId)
        .neq('status', 'Paid');
      if (error || !data) return 0;
      return data.reduce((s: number, r: any) => s + (Number(r.balance) || 0), 0);
    } catch {
      return 0; // Fail open for offline mode — credit check blocked anyway in UI
    }
  },

  saveInvoices: async (data: Invoice[]): Promise<void> => {
    // SAL-2: Verify every invoice has a finite, non-negative totalAmount.
    // Catches NaN/Infinity produced by floating-point accumulation before
    // any bad value reaches the database.
    for (const inv of data) {
      const ta = Number(inv.totalAmount);
      if (!Number.isFinite(ta) || ta < 0) {
        throw new Error(
          `SAL-2: Invoice ${inv.id} has invalid totalAmount: "${inv.totalAmount}". ` +
          `Expected a finite non-negative number. Recalculate and re-save.`
        );
      }
    }
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
    const company = useAuthStore.getState().profile?.company ?? '';
    try {
      const { data, error } = await supabase.from('payment_receipts').select('*').eq('company', company);
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
      // SAL-4: Use atomic RPC (process_payment_receipt) so that receipt
      // insertion and invoice balance/status update occur in a single
      // serialisable DB transaction. Eliminates the TOCTOU race where
      // two concurrent payments both read the same stale balance.
      for (const r of data) {
        const receiptPayload = {
          id:         r.id,
          invoice_id: r.invoiceId,
          date:       r.date,
          amount:     r.amount,
          method:     r.method,
          reference:  r.reference,
          gl_tx_id:   r.glTxId,
          created_by: (r as any).createdBy ?? (r as any).created_by ?? null,
        };
        const { error } = await supabase.rpc('process_payment_receipt', {
          receipt_data: receiptPayload,
          p_invoice_id: r.invoiceId,
        });
        if (error) {
          // Graceful degradation: fall back to direct upsert if Migration 017
          // has not yet been applied (e.g. local dev against older schema).
          Logger.warn('Sales', `process_payment_receipt RPC unavailable for ${r.id} — falling back to direct upsert: ${error.message}`);
          await supabase.from('payment_receipts').upsert({
            id: r.id, invoice_id: r.invoiceId, date: r.date, amount: r.amount,
            method: r.method, reference: r.reference, gl_tx_id: r.glTxId,
            created_by: (r as any).createdBy ?? null,
            updated_by: _currentUser(),
            updated_at: new Date().toISOString(),
          });
        }
      }
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
