import { ProductionPiece, JobOrder, TemperingDispatch } from '../types/production';
import { supabase } from '@/src/services/supabaseClient';
import { PurchaseOrder, WarehouseSpot, GatePass, Company } from '../../shared/types';
import { initDB } from '../../shared/services/db';

const KEYS = {
  PRODUCTION_PIECES: 'gtk_erp_production_pieces',
  JOB_ORDERS: 'gtk_erp_job_orders',
  PURCHASE_ORDERS: 'gtk_erp_purchase_orders',
  TEMPERING_DISPATCHES: 'gtk_erp_tempering_dispatches',
  WAREHOUSE_SPOTS: 'gtk_erp_warehouse_spots',
  GATE_PASS: 'gtk_erp_gate_pass',
  QUOTATIONS: 'gtk_erp_quotations',
};

import { bgSaveToIDB, safeParse, safeSave, safeAsync } from '../../shared/services/utils';
import { toast } from 'sonner';

export const ProductionService = {
  getProductionPiecesAsync: async (filterCompany?: string): Promise<ProductionPiece[]> => {
    try {
      const { data, error } = await supabase.from('production_pieces').select('*');
      if (error || !data || data.length === 0) {
        // Fallback to IDB/localStorage
        try {
          const db = await initDB();
          const items = await db.getAll('productionPieces');
          if (items.length > 0) {
            // Filter by company via order_id pattern if requested
            if (filterCompany) {
              const glsPattern = /GLS/i;
              const gtkPattern = /GTK|GTI/i;
              return items.filter((p: any) => {
                const id = p.orderId || p.order_id || '';
                if (filterCompany === 'Glassco') return glsPattern.test(id);
                if (filterCompany === 'GTK' || filterCompany === 'GTI') return gtkPattern.test(id);
                return true;
              });
            }
            return items;
          }
        } catch {}
        const ls = safeParse(KEYS.PRODUCTION_PIECES);
        if (filterCompany) {
          const glsPattern = /GLS/i;
          const gtkPattern = /GTK|GTI/i;
          return ls.filter((p: any) => {
            const id = p.orderId || p.order_id || '';
            if (filterCompany === 'Glassco') return glsPattern.test(id);
            if (filterCompany === 'GTK' || filterCompany === 'GTI') return gtkPattern.test(id);
            return true;
          });
        }
        return ls;
      }
      // Map snake_case → camelCase
      const mapped = data.map((r: any) => ({
        id: r.id,
        orderId: r.order_id,
        itemIndex: Number(r.item_index || 0),
        specs: r.specs || '',
        status: r.status || 'Cut',
        lastUpdated: r.last_updated || r.created_at || new Date().toISOString(),
        fault: r.fault,
        pendingServices: r.pending_services,
        spotId: r.spot_id,
        dispatchId: r.dispatch_id,
      })) as ProductionPiece[];

      // Filter by company via order_id pattern (no company column in Supabase)
      if (filterCompany) {
        const glsPattern = /GLS/i;
        const gtkPattern = /GTK|GTI/i;
        const filtered = mapped.filter((p: any) => {
          const id = p.orderId || '';
          if (filterCompany === 'Glassco') return glsPattern.test(id);
          if (filterCompany === 'GTK' || filterCompany === 'GTI') return gtkPattern.test(id);
          return true;
        });
        return filtered;
      }

      safeSave(KEYS.PRODUCTION_PIECES, mapped);
      return mapped;
    } catch (e) {
      console.error('[ProductionService] getProductionPiecesAsync failed:', e);
      return safeParse(KEYS.PRODUCTION_PIECES);
    }
  },
  getGatePasses: (): GatePass[] => safeParse(KEYS.GATE_PASS),
  saveGatePasses: (data: GatePass[]) => safeSave(KEYS.GATE_PASS, data),
  getJobOrders: (): JobOrder[] => safeParse(KEYS.JOB_ORDERS),
  saveJobOrders: (data: JobOrder[]) => safeSave(KEYS.JOB_ORDERS, data),
  getTargetCompanyJobOrders: (targetCompany: Company): JobOrder[] => {
      const all = safeParse(KEYS.QUOTATIONS);
      return all.filter((q: any) => q.company === targetCompany);
  },
  getPurchaseOrders: (): PurchaseOrder[] => safeParse(KEYS.PURCHASE_ORDERS),
  savePurchaseOrders: (data: PurchaseOrder[]) => safeSave(KEYS.PURCHASE_ORDERS, data),
  getProductionPieces: (): ProductionPiece[] => safeParse(KEYS.PRODUCTION_PIECES),

  // ── Paginated fetch from Supabase (use in list views) ────────────
  getProductionPiecesPage: async (
    company: string,
    page: number = 1,
    pageSize: number = 50,
    statusFilter?: string
  ): Promise<{ data: ProductionPiece[]; total: number }> => {
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let countQ = supabase
        .from('production_pieces')
        .select('*', { count: 'exact', head: true })
        .eq('company', company);
      if (statusFilter) countQ = countQ.eq('status', statusFilter);
      const { count } = await countQ;

      let dataQ = supabase
        .from('production_pieces')
        .select('*')
        .eq('company', company)
        .order('updated_at', { ascending: false })
        .range(from, to);
      if (statusFilter) dataQ = dataQ.eq('status', statusFilter);
      const { data: rows } = await dataQ;

      // Unwrap JSONB data column
      const pieces = (rows || []).map((row: any) =>
        row.data && typeof row.data === 'object' ? { ...row.data, id: row.id, company: row.company } : row
      ) as ProductionPiece[];

      return { data: pieces, total: count || 0 };
    } catch (e) {
      console.warn('[ProductionService] getProductionPiecesPage failed, using localStorage:', e);
      const all = safeParse(KEYS.PRODUCTION_PIECES) as ProductionPiece[];
      const filtered = company ? all.filter(p => (p as any).company === company) : all;
      const statusFiltered = statusFilter ? filtered.filter(p => p.status === statusFilter) : filtered;
      const from = (page - 1) * pageSize;
      return { data: statusFiltered.slice(from, from + pageSize), total: statusFiltered.length };
    }
  },
  saveProductionPieces: (data: ProductionPiece[]) => {
    try {
      safeSave(KEYS.PRODUCTION_PIECES, data);
    } catch(e) {
      const active = data.filter(p => p.status !== 'Delivered' && p.status !== 'Broken');
      safeSave(KEYS.PRODUCTION_PIECES, active);
    }
    bgSaveToIDB('productionPieces', data);
    // Push to Supabase in background
    const mapped = data
      .filter(p => p.id && (p as any).orderId)
      .map(p => ({
        id: p.id,
        order_id: (p as any).orderId || '',
        item_index: Number((p as any).itemIndex || 0),
        specs: p.specs || '',
        status: p.status || 'Cut',
        last_updated: (p as any).lastUpdated || new Date().toISOString(),
      }));
    if (mapped.length > 0) {
      supabase.from('production_pieces').upsert(mapped, { onConflict: 'id' })
        .then(({ error }) => { if (error) console.warn('[Pieces] Supabase push:', error.message); });
    }
  },
  getTemperingDispatches: (): TemperingDispatch[] => safeParse(KEYS.TEMPERING_DISPATCHES),
  saveTemperingDispatches: (data: TemperingDispatch[]) => safeSave(KEYS.TEMPERING_DISPATCHES, data),
  getWarehouseSpots: (): WarehouseSpot[] => safeParse(KEYS.WAREHOUSE_SPOTS),
  saveWarehouseSpots: (data: WarehouseSpot[]) => safeSave(KEYS.WAREHOUSE_SPOTS, data),
};
