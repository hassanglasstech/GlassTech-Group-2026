import { Client, Vendor } from '../types/crm';
import { Product, Quotation, Project } from '../../shared/types';
import { Invoice, PaymentReceipt } from '../../finance/types/finance';
import { guardedSave, withTimestamp } from '@/modules/shared/services/concurrencyService';
import { safeParse, safeSave } from '../../shared/services/utils';
import { toast } from 'sonner';
import { Logger } from '@/modules/shared/services/logger';
import { supabase } from '../../../src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';
import { SyncService } from '../../../src/services/SyncService';

// Helper — gets current user email at call time (outside React, so we use getState)
const _currentUser = () => useAuthStore.getState().profile?.email ?? useAuthStore.getState().user?.email ?? 'unknown';

// ── D5 helper: queue table for retry when a direct Supabase write fails. ──
// On the next online tick / reconnect, SyncService.pushPending() will flush
// the table from localStorage to Supabase using TABLE_PUSH mappers.
const _queueRetry = (table: string) => {
  try { SyncService.markDirty(table); } catch (e) { /* SyncService not yet init */ }
};

const KEYS = {
  CLIENTS: 'gtk_erp_clients',
  PRODUCTS: 'gtk_erp_products',
  QUOTATIONS: 'gtk_erp_quotations',
  PROJECTS: 'gtk_erp_projects',
  VENDORS: 'gtk_erp_vendors',
  CREDIT_NOTES: 'gtk_erp_credit_notes',
  INVOICES: 'gtk_erp_invoices',
  PAYMENT_RECEIPTS: 'gtk_erp_payment_receipts',
  CUSTOMER_COMPLAINTS: 'gtk_erp_customer_complaints',  // Phase-3 (3.8) — unified key
};

// ── Phase-2 (2.6): per-row merge save helper ──────────────────────────
// Replaces the previous "filter all + save all" pattern that caused
// concurrent writers (multi-tab / multi-device) to overwrite each other.
// Now: callers pass ONLY the rows being changed; existing localStorage
// rows are preserved by id-keyed merge.
const _mergeIntoLocal = <T extends { id: string }>(key: string, incoming: T[]): T[] => {
  let existing: T[] = [];
  try { existing = safeParse(key) as T[]; } catch { existing = []; }
  const idMap = new Map<string, T>();
  for (const row of existing) if (row && row.id) idMap.set(row.id, row);
  for (const row of incoming) if (row && row.id) idMap.set(row.id, row);
  const merged = Array.from(idMap.values());
  safeSave(key, merged);
  return merged;
};

// ── Phase-2 (2.6): generic per-row delete (cloud + local) ─────────────
const _deleteRow = async (table: string, localKey: string, id: string): Promise<void> => {
  // Local delete first
  try {
    const existing = safeParse(localKey) as Array<{ id: string }>;
    safeSave(localKey, existing.filter((r) => r.id !== id));
  } catch (e: any) {
    console.warn(`[AsyncSalesService] _deleteRow local prune failed for ${table}/${id}: ${e?.message}`);
  }
  // Cloud delete
  try {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      Logger.error('Sales', `delete ${table}/${id} cloud failed`, error);
      _queueRetry(table);
    }
  } catch (err: any) {
    Logger.error('Sales', `delete ${table}/${id} exception`, err);
    _queueRetry(table);
  }
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
        const mapped = data.map((r: any) => {
          // Merge JSONB `data` blob (forward-compat) with flat columns
          const base = (r as any).data && typeof (r as any).data === 'object' ? (r as any).data : {};
          return {
            ...base,
            id: r.id,
            company: r.company,
            name: r.name ?? base.name ?? '',
            contactPerson: r.contact_person ?? base.contactPerson ?? '',
            email:         r.email          ?? base.email          ?? '',
            phone:         r.phone          ?? base.phone          ?? '',
            address:       r.address        ?? base.address        ?? '',
            ntn:           r.ntn            ?? base.ntn            ?? '',
            creditLimit:   r.credit_limit   ?? base.creditLimit    ?? 0,
            status:        r.status         ?? base.status         ?? 'Active',
            createdAt:     r.created_at     ?? base.createdAt      ?? '',
          };
        });
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
    // Phase-2 (2.6): per-row merge save (preserves siblings)
    _mergeIntoLocal<Client>(KEYS.CLIENTS, data);
    // Upsert to Supabase (snake_case mapping + JSONB blob for forward-compat)
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
        data: c,                                                  // forward-compat blob
        created_at: c.createdAt ?? c.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from('clients').upsert(rows, { onConflict: 'id' });
        if (error) {
          console.error('[AsyncSalesService] saveClients Supabase error:', error.message);
          _queueRetry('clients');                                   // D5: queue for retry
        }
      }
    } catch (err: any) {
      console.error('[AsyncSalesService] saveClients exception:', err.message);
      _queueRetry('clients');
    }
  },

  deleteClient: async (id: string): Promise<void> => {
    await _deleteRow('clients', KEYS.CLIENTS, id);
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
        // price_history omitted — column added by migration 20260421, may not exist yet
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
      _queueRetry('products');
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
        // Restore full object: JSONB `data` blob first, then flat columns override.
        // Flat columns are authoritative for indexed fields (status, client_id, etc.)
        // because they may be updated by RPCs / SyncService independently of `data`.
        const mapped = data.map((r: any) => {
          const base = r.data && typeof r.data === 'object' ? r.data : {};
          return {
            ...base,
            id:                 r.id,
            company:            r.company,
            // Flat-column overrides (D7 — single source of truth for indexable fields)
            date:               r.date                  ?? base.date                  ?? '',
            dueDate:            r.due_date              ?? base.dueDate               ?? '',
            clientId:           r.client_id             ?? base.clientId              ?? '',
            projectName:        r.project_name          ?? base.projectName           ?? '',
            subject:            r.subject               ?? base.subject               ?? '',
            items:              Array.isArray(r.items) && r.items.length > 0 ? r.items : (base.items ?? []),
            status:             r.status                ?? base.status                ?? 'Draft',
            isAlreadyDispatched:r.is_already_dispatched ?? base.isAlreadyDispatched   ?? false,
            discountPercent:    r.discount_percent      ?? base.discountPercent       ?? 0,
            discountAmount:     r.discount_amount       ?? base.discountAmount        ?? 0,
            manualSerial:       r.manual_serial         ?? base.manualSerial          ?? null,
            orderNo:            r.order_no              ?? base.orderNo               ?? null,
            revisedFields:      r.revised_fields        ?? base.revisedFields         ?? null,
            receivedAmount:     r.received_amount       ?? base.receivedAmount        ?? 0,
            actualDeliveryDate: r.actual_delivery_date  ?? base.actualDeliveryDate    ?? null,
            serviceCharges:     r.service_charges       ?? base.serviceCharges        ?? [],
            manualRef:          r.manual_ref            ?? base.manualRef             ?? null,
            // Migrations 021 + 027 (already merged above through ...base, but explicit)
            orderType:          r.order_type            ?? base.orderType             ?? 'Standard',
            originalOrderRef:   r.original_order_ref    ?? base.originalOrderRef      ?? undefined,
            replacementReason:  r.replacement_reason    ?? base.replacementReason     ?? undefined,
            costBearer:         r.cost_bearer           ?? base.costBearer            ?? undefined,
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
    // Phase-2 (2.6): caller may pass ONLY the rows being changed; we
    // merge into existing localStorage by id rather than overwriting.
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

    // 2.6: merge incoming rows into existing localStorage (preserves siblings)
    _mergeIntoLocal<Quotation>(KEYS.QUOTATIONS, data);

    try {
      // D7: Dual-write — JSONB `data` (zero fields lost) AND flat columns
      // (indexable querying + compatible with SyncService TABLE_PUSH).
      const mapped = data.map((q: any) => ({
        id:                     q.id,
        company:                q.company,
        data:                   q,                              // ← full object
        // ── flat columns (mirror SyncService TABLE_PUSH.quotations) ──
        date:                   q.date                           || null,
        due_date:               q.dueDate                        || null,
        client_id:              q.clientId                       || '',
        project_name:           q.projectName                    || '',
        subject:                q.subject                        || '',
        items:                  q.items                          || [],
        status:                 (q.status === 'Pending' ? 'Draft' : q.status) || 'Draft',
        is_already_dispatched:  q.isAlreadyDispatched            || false,
        discount_percent:       q.discountPercent                || 0,
        discount_amount:        q.discountAmount                 || 0,
        manual_serial:          q.manualSerial                   || null,
        order_no:               q.orderNo                        || null,
        revised_fields:         q.revisedFields                  || null,
        received_amount:        q.receivedAmount                 || 0,
        actual_delivery_date:   q.actualDeliveryDate             || null,
        service_charges:        q.serviceCharges                 || [],
        manual_ref:             q.manualRef                      || null,
        order_type:             q.orderType                      || 'Standard',
        original_order_ref:     q.originalOrderRef               || null,
        replacement_reason:     q.replacementReason              || null,
        cost_bearer:            q.costBearer                     || null,
        updated_at:             new Date().toISOString(),
      }));

      if (supabase && mapped.length > 0) {
        const { error } = await supabase.from('quotations').upsert(mapped, { onConflict: 'id' });
        if (error) {
          console.error('[AsyncSalesService] Supabase Error:', error.message);
          toast.error('Cloud sync failed — saved locally.', { id: 'sync-err' });
          _queueRetry('quotations');                              // D5
        } else {
          toast.success('Synced to Cloud', { id: 'sync-success' });
        }
      }
    } catch (err: any) {
      console.error('[AsyncSalesService] saveQuotations exception:', err.message);
      _queueRetry('quotations');
    }
  },

  deleteQuotation: async (id: string): Promise<void> => {
    await _deleteRow('quotations', KEYS.QUOTATIONS, id);
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
      if (error) { Logger.error('Sales', 'saveVendors failed', error); _queueRetry('vendors'); }
    } catch (err: any) {
      Logger.error('Sales', 'saveVendors exception', err);
      _queueRetry('vendors');
    }
  },

  getInvoices: async (): Promise<Invoice[]> => {
    const company = useAuthStore.getState().profile?.company ?? '';
    try {
      const { data, error } = await supabase.from('invoices').select('*').eq('company', company);
      if (error || !data || data.length === 0) return safeParse('gtk_erp_invoices');
      const mapped = data.map((r: any) => {
        const base = (r as any).data && typeof (r as any).data === 'object' ? (r as any).data : {};
        return {
          ...base,
          id: r.id, company: r.company,
          orderId: r.order_id ?? base.orderId, orderNo: r.order_no ?? base.orderNo,
          clientId: r.client_id ?? base.clientId, clientName: r.client_name ?? base.clientName,
          date: r.date ?? base.date, dueDate: r.due_date ?? base.dueDate,
          totalAmount: r.total_amount ?? base.totalAmount,
          receivedAmount: r.received_amount ?? base.receivedAmount,
          balance: r.balance ?? base.balance,
          status: r.status ?? base.status,
          glTxId: r.gl_tx_id ?? base.glTxId,
          payments: r.payments ?? base.payments ?? [],
          items: r.items ?? base.items ?? [],
          serviceCharges: r.service_charges ?? base.serviceCharges ?? [],
          projectName: r.project_name ?? base.projectName,
          discountAmount: r.discount_amount ?? base.discountAmount,
          gstPercent: r.gst_percent ?? base.gstPercent,
          gstAmount: r.gst_amount ?? base.gstAmount,
          voidedBy: r.voided_by ?? base.voidedBy,
          voidedAt: r.voided_at ?? base.voidedAt,
          revertedStatus: r.reverted_status ?? base.revertedStatus,
        };
      });
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
    // Phase-2 (2.6): per-row merge save (preserves siblings)
    _mergeIntoLocal<Invoice>(KEYS.INVOICES, data);
    try {
      const rows = data.map((i: any) => ({
        id: i.id, company: i.company,
        order_id: i.orderId, order_no: i.orderNo,
        client_id: i.clientId, client_name: i.clientName,
        date: i.date || null, due_date: i.dueDate || null,
        total_amount: i.totalAmount, received_amount: i.receivedAmount, balance: i.balance,
        status: i.status, gl_tx_id: i.glTxId, payments: i.payments || [],
        items: i.items || [], service_charges: i.serviceCharges || [],
        project_name: i.projectName || '',
        discount_amount: i.discountAmount || 0,
        gst_percent: i.gstPercent || 0, gst_amount: i.gstAmount || 0,
        voided_by: i.voidedBy || null, voided_at: i.voidedAt || null,
        reverted_status: i.revertedStatus || null,
        data: i,                                                 // forward-compat blob
        created_by: i.createdBy ?? i.created_by ?? null,
        updated_by: _currentUser(),
        updated_at: new Date().toISOString(),
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from('invoices').upsert(rows, { onConflict: 'id' });
        if (error) { Logger.error('Sales', 'saveInvoices failed', error); _queueRetry('invoices'); }
      }
    } catch (err: any) {
      Logger.error('Sales', 'saveInvoices exception', err);
      _queueRetry('invoices');
    }
  },

  deleteInvoice: async (id: string): Promise<void> => {
    await _deleteRow('invoices', KEYS.INVOICES, id);
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
    // Phase-2 (2.6): per-row merge save (preserves siblings)
    _mergeIntoLocal<PaymentReceipt>(KEYS.PAYMENT_RECEIPTS, data);
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
          // Graceful degradation: fall back to direct upsert if Migration 017/032
          // has not yet been applied (e.g. local dev against older schema).
          Logger.warn('Sales', `process_payment_receipt RPC unavailable for ${r.id} — falling back to direct upsert: ${error.message}`);
          const { error: upsertErr } = await supabase.from('payment_receipts').upsert({
            id: r.id, invoice_id: r.invoiceId, date: r.date, amount: r.amount,
            method: r.method, reference: r.reference, gl_tx_id: r.glTxId,
            created_by: (r as any).createdBy ?? null,
            updated_by: _currentUser(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
          if (upsertErr) _queueRetry('payment_receipts');
        }
      }
    } catch (err: any) {
      Logger.error('Sales', 'savePaymentReceipts exception', err);
      _queueRetry('payment_receipts');
    }
  },

  saveProjects: async (data: Project[]): Promise<void> => {
    safeSave(KEYS.PROJECTS, data);
    try {
      const { error } = await supabase.from('projects').upsert(data.map((p: any) => ({ ...p })));
      if (error) { Logger.error('Sales', 'saveProjects failed', error); _queueRetry('projects'); }
    } catch (err: any) {
      Logger.error('Sales', 'saveProjects exception', err);
      _queueRetry('projects');
    }
  },

  // ── Credit Notes (D3 — new Supabase table from migration 032) ─────────
  getCreditNotes: async (): Promise<any[]> => {
    const company = useAuthStore.getState().profile?.company ?? '';
    try {
      const { data, error } = await supabase
        .from('credit_notes').select('*').eq('company', company);
      if (error || !data) return safeParse(KEYS.CREDIT_NOTES);
      if (data.length === 0) return safeParse(KEYS.CREDIT_NOTES);
      const mapped = data.map((r: any) => {
        const base = r.data && typeof r.data === 'object' ? r.data : {};
        return {
          ...base,
          id:         r.id,
          company:    r.company,
          invoiceId:  r.invoice_id  ?? base.invoiceId  ?? '',
          invoiceNo:  r.invoice_no  ?? base.invoiceNo  ?? '',
          clientId:   r.client_id   ?? base.clientId   ?? '',
          clientName: r.client_name ?? base.clientName ?? '',
          date:       r.date        ?? base.date       ?? '',
          reason:     r.reason      ?? base.reason     ?? '',
          amount:     Number(r.amount ?? base.amount ?? 0),
          glTxId:     r.gl_tx_id    ?? base.glTxId     ?? '',
          status:     r.status      ?? base.status     ?? 'Posted',
          createdBy:  r.created_by  ?? base.createdBy  ?? '',
          createdAt:  r.created_at  ?? base.createdAt  ?? '',
        };
      });
      safeSave(KEYS.CREDIT_NOTES, mapped);
      return mapped;
    } catch {
      return safeParse(KEYS.CREDIT_NOTES);
    }
  },

  saveCreditNotes: async (data: any[]): Promise<void> => {
    // Phase-2 (2.6): per-row merge save (preserves siblings)
    _mergeIntoLocal<any>(KEYS.CREDIT_NOTES, data);
    try {
      const rows = data.map((c: any) => ({
        id:           c.id,
        company:      c.company,
        invoice_id:   c.invoiceId  ?? c.invoice_id  ?? null,
        invoice_no:   c.invoiceNo  ?? c.invoice_no  ?? null,
        client_id:    c.clientId   ?? c.client_id   ?? null,
        client_name:  c.clientName ?? c.client_name ?? null,
        date:         c.date       || null,
        reason:       c.reason     || '',
        amount:       Number(c.amount || 0),
        gl_tx_id:     c.glTxId     ?? c.gl_tx_id    ?? null,
        status:       c.status     || 'Posted',
        created_by:   c.createdBy  ?? c.created_by  ?? _currentUser(),
        created_at:   c.createdAt  ?? c.created_at  ?? new Date().toISOString(),
        updated_at:   new Date().toISOString(),
        data:         c,                                          // forward-compat blob
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from('credit_notes').upsert(rows, { onConflict: 'id' });
        if (error) { Logger.error('Sales', 'saveCreditNotes failed', error); _queueRetry('credit_notes'); }
      }
    } catch (err: any) {
      Logger.error('Sales', 'saveCreditNotes exception', err);
      _queueRetry('credit_notes');
    }
  },

  deleteCreditNote: async (id: string): Promise<void> => {
    await _deleteRow('credit_notes', KEYS.CREDIT_NOTES, id);
  },

  // ── Customer Complaints (Phase-3 / 3.8 — was localStorage-only) ───────
  getCustomerComplaints: async (): Promise<any[]> => {
    const company = useAuthStore.getState().profile?.company ?? '';
    try {
      const { data, error } = await supabase
        .from('customer_complaints').select('*').eq('company', company);
      if (error || !data || data.length === 0) return safeParse(KEYS.CUSTOMER_COMPLAINTS);
      const mapped = data.map((r: any) => {
        const base = r.data && typeof r.data === 'object' ? r.data : {};
        return {
          ...base,
          id:          r.id,
          company:     r.company,
          date:        r.date           ?? base.date           ?? '',
          clientId:    r.client_id      ?? base.clientId       ?? '',
          clientName:  r.client_name    ?? base.clientName     ?? '',
          invoiceId:   r.invoice_id     ?? base.invoiceId      ?? undefined,
          orderNo:     r.order_no       ?? base.orderNo        ?? undefined,
          category:    r.category       ?? base.category       ?? 'Other',
          description: r.description    ?? base.description    ?? '',
          status:      r.status         ?? base.status         ?? 'Open',
          priority:    r.priority       ?? base.priority       ?? 'Medium',
          assignedTo:  r.assigned_to    ?? base.assignedTo     ?? undefined,
          resolution:  r.resolution     ?? base.resolution     ?? undefined,
          resolvedAt:  r.resolved_at    ?? base.resolvedAt     ?? undefined,
          resolvedBy:  r.resolved_by    ?? base.resolvedBy     ?? undefined,
          createdBy:   r.created_by     ?? base.createdBy      ?? '',
          createdAt:   r.created_at     ?? base.createdAt      ?? '',
        };
      });
      safeSave(KEYS.CUSTOMER_COMPLAINTS, mapped);
      return mapped;
    } catch {
      return safeParse(KEYS.CUSTOMER_COMPLAINTS);
    }
  },

  saveCustomerComplaints: async (data: any[]): Promise<void> => {
    // Phase-3 (2.6 pattern): per-row merge save (preserves siblings)
    _mergeIntoLocal<any>(KEYS.CUSTOMER_COMPLAINTS, data);
    try {
      const rows = data.map((c: any) => ({
        id:           c.id,
        company:      c.company,
        date:         c.date         || null,
        client_id:    c.clientId     ?? c.client_id    ?? null,
        client_name:  c.clientName   ?? c.client_name  ?? null,
        invoice_id:   c.invoiceId    ?? c.invoice_id   ?? null,
        order_no:     c.orderNo      ?? c.order_no     ?? null,
        category:     c.category     ?? 'Other',
        description:  c.description  ?? '',
        status:       c.status       ?? 'Open',
        priority:     c.priority     ?? 'Medium',
        assigned_to:  c.assignedTo   ?? c.assigned_to  ?? null,
        resolution:   c.resolution   ?? null,
        resolved_at:  c.resolvedAt   ?? c.resolved_at  ?? null,
        resolved_by:  c.resolvedBy   ?? c.resolved_by  ?? null,
        created_by:   c.createdBy    ?? c.created_by   ?? _currentUser(),
        created_at:   c.createdAt    ?? c.created_at   ?? new Date().toISOString(),
        updated_at:   new Date().toISOString(),
        data:         c,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from('customer_complaints').upsert(rows, { onConflict: 'id' });
        if (error) { Logger.error('Sales', 'saveCustomerComplaints failed', error); _queueRetry('customer_complaints'); }
      }
    } catch (err: any) {
      Logger.error('Sales', 'saveCustomerComplaints exception', err);
      _queueRetry('customer_complaints');
    }
  },

  deleteCustomerComplaint: async (id: string): Promise<void> => {
    await _deleteRow('customer_complaints', KEYS.CUSTOMER_COMPLAINTS, id);
  },
};
