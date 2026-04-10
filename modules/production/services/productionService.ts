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
      // SEC-5: Inject explicit company filter so RLS is applied at the query
      // level in addition to the DB-side policy. Belt-and-suspenders: if the
      // RLS policy is ever temporarily disabled for maintenance, the app layer
      // still enforces the tenant boundary.
      let query = supabase.from('production_pieces').select('*');
      if (filterCompany) query = query.eq('company', filterCompany);
      const { data, error } = await query;
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
  // MFG-1: saveProductionPieces now validates that every unique orderId in the
  // batch actually exists in the quotations table before writing any records.
  // This prevents ghost pieces from being created for cancelled or deleted orders.
  //
  // The check runs against Supabase directly (not localStorage) so that a
  // locally-deleted order cannot slip through via a stale offline cache.
  // The function remains synchronous in its localStorage/IDB path but fires
  // the Supabase existence check before the upsert. If any orderId is
  // not found, the entire batch is aborted and a descriptive error is thrown.
  saveProductionPieces: async (data: ProductionPiece[]): Promise<void> => {
    // MFG-1: Collect distinct orderIds present in the batch
    const orderIds = [...new Set(
      data.map(p => (p as any).orderId).filter(Boolean)
    )] as string[];

    if (orderIds.length > 0) {
      const { data: foundOrders, error } = await supabase
        .from('quotations')
        .select('id')
        .in('id', orderIds);

      if (error) {
        // If we cannot reach Supabase (offline), fall through to cache write
        // rather than blocking production — but log prominently.
        console.error('[ProductionService] MFG-1 order existence check failed:', error.message);
      } else {
        const foundIds = new Set((foundOrders ?? []).map((r: any) => r.id));
        const ghostIds = orderIds.filter(id => !foundIds.has(id));
        if (ghostIds.length > 0) {
          const msg =
            `MFG-1 GhostOrderError: The following order IDs no longer exist in the ` +
            `quotations table: [${ghostIds.join(', ')}]. ` +
            `These pieces were NOT saved. Cancel the production job or restore the order first.`;
          toast.error(msg, { duration: 10000 });
          throw new Error(msg);
        }
      }
    }

    try {
      safeSave(KEYS.PRODUCTION_PIECES, data);
    } catch(e) {
      const active = data.filter(p => p.status !== 'Delivered' && p.status !== 'Broken');
      safeSave(KEYS.PRODUCTION_PIECES, active);
    }
    bgSaveToIDB('productionPieces', data);
    // Push to Supabase in background
    // MFG-4: include cost_center_id in every upsert row so piece-level
    // cost attribution is persisted to Supabase (column added in Migration 018).
    const mapped = data
      .filter(p => p.id && (p as any).orderId)
      .map(p => ({
        id: p.id,
        order_id: (p as any).orderId || '',
        item_index: Number((p as any).itemIndex || 0),
        specs: p.specs || '',
        status: p.status || 'Cut',
        last_updated: (p as any).lastUpdated || new Date().toISOString(),
        cost_center_id: (p as any).costCenterId ?? null,
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

  // ── MFG-5: Oven capacity validation ──────────────────────────────
  // Must be awaited before dispatching any tempering batch.
  // Queries tempering_oven_config (Migration 018) for the rated limits.
  // Throws with a descriptive toast if the batch exceeds either limit.
  // Fails open (no-op) when offline or the oven has no config row yet.
  validateTemperingDispatch: async (params: {
    company: string;
    ovenId:  string;
    batchWeightKg: number;
    batchSqft:     number;
  }): Promise<void> => {
    const { company, ovenId, batchWeightKg, batchSqft } = params;

    const { data: config, error } = await supabase
      .from('tempering_oven_config')
      .select('max_capacity_kg, max_sqft_per_batch')
      .eq('company', company)
      .eq('oven_id', ovenId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.warn('[ProductionService] MFG-5: oven config query failed:', error.message);
      return; // Fail open — cannot block production without a config table
    }
    if (!config) {
      console.warn(`[ProductionService] MFG-5: No oven config for ${company}/${ovenId} — skipping capacity check`);
      return;
    }

    const maxKg   = Number(config.max_capacity_kg   ?? 0);
    const maxSqft = Number(config.max_sqft_per_batch ?? 0);

    if (maxKg > 0 && batchWeightKg > maxKg) {
      const msg =
        `MFG-5 OvenCapacityError: Batch weight ${batchWeightKg.toFixed(1)} kg exceeds ` +
        `oven "${ovenId}" rated capacity ${maxKg} kg. ` +
        `Reduce the batch size or split across multiple dispatches.`;
      toast.error(msg, { duration: 10000 });
      throw new Error(msg);
    }
    if (maxSqft > 0 && batchSqft > maxSqft) {
      const msg =
        `MFG-5 OvenCapacityError: Batch area ${batchSqft.toFixed(1)} sqft exceeds ` +
        `oven "${ovenId}" max ${maxSqft} sqft per batch. ` +
        `Split the batch before dispatching.`;
      toast.error(msg, { duration: 10000 });
      throw new Error(msg);
    }
  },

  // ── MFG-2: Production cost config helpers ────────────────────────
  // Provide read/write access to the per-company wages & wastage config
  // that costAnalysisService reads. Stored in localStorage and editable
  // via the Manufacturing → Settings panel without code changes.
  getProductionCostConfig: (company: string): Record<string, any> => {
    try {
      const raw = localStorage.getItem('gtk_erp_production_config');
      if (!raw) return {};
      const all = JSON.parse(raw);
      return all[company] ?? all['default'] ?? {};
    } catch { return {}; }
  },
  saveProductionCostConfig: (company: string, config: Record<string, any>): void => {
    try {
      const raw = localStorage.getItem('gtk_erp_production_config');
      const all = raw ? JSON.parse(raw) : {};
      all[company] = { ...(all[company] ?? {}), ...config };
      localStorage.setItem('gtk_erp_production_config', JSON.stringify(all));
    } catch {}
  },
};
