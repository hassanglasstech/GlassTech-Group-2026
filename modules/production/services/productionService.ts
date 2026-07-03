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
  FLOOR_STAFF: 'gtk_erp_floor_staff',
};

import { bgSaveToIDB, safeParse, safeSave, safeAsync } from '../../shared/services/utils';
import { toast } from 'sonner';
import { Logger } from '../../shared/services/logger';
import { useAppStore } from '../../shared/store/appStore';

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
  saveProductionPieces: async (
    data: ProductionPiece[],
    opts?: { validateOrderIds?: string[] },
  ): Promise<void> => {
    // MFG-1: which orderIds to ghost-check.
    //   • Default (no opts): every distinct orderId in the batch (legacy behaviour).
    //   • Scoped (opts.validateOrderIds): ONLY those — callers that re-save the
    //     whole pieces array (e.g. approve flow passes [...otherOrderPieces,
    //     ...newOrderPieces]) must NOT let a pre-existing stale order (whose
    //     quotation was since deleted) poison the save of a brand-new order.
    //     Pass [] to skip the check entirely when the order was just persisted
    //     by the caller and is therefore known-valid (avoids false-positive
    //     GhostOrderError from RLS/quota/timing flakiness on the re-lookup).
    const orderIds = (
      opts?.validateOrderIds !== undefined
        ? opts.validateOrderIds
        : [...new Set(data.map(p => (p as any).orderId).filter(Boolean))]
    ) as string[];

    if (orderIds.length > 0) {
      const { data: foundOrders, error } = await supabase
        .from('quotations')
        .select('id')
        .in('id', orderIds);

      if (error) {
        // GAP-02: Offline ghost-order prevention. Previously, when Supabase
        // was unreachable, the check fell through silently — pieces could be
        // saved against quotation IDs that had been deleted while offline.
        // Now: fall back to the localStorage quotations + job_orders cache as
        // the authoritative offline source. Only allow the save if every
        // orderId exists in at least one of those caches.
        console.warn('[ProductionService] MFG-1 Supabase unreachable, using local cache:', error.message);
        try {
          const localQ = JSON.parse(localStorage.getItem('gtk_erp_quotations') || '[]') as any[];
          const localJO = JSON.parse(localStorage.getItem('gtk_erp_gtk_job_orders') || '[]') as any[];
          const knownIds = new Set<string>([
            ...localQ.map((q: any) => q.id),
            ...localJO.map((j: any) => j.id),
          ]);
          const ghostIds = orderIds.filter(id => !knownIds.has(id));
          if (ghostIds.length > 0) {
            const msg =
              `MFG-1 GhostOrderError (offline): orderIds [${ghostIds.join(', ')}] ` +
              `not found in local quotation/job-order cache. Pieces NOT saved. ` +
              `Reconnect and retry, or restore the order locally first.`;
            toast.error(msg, { duration: 12000 });
            throw new Error(msg);
          }
        } catch (cacheErr: any) {
          // If the cache itself is corrupt, refuse rather than write blindly.
          if (cacheErr?.message?.startsWith('MFG-1')) throw cacheErr;
          throw new Error(
            `MFG-1 GhostOrderError: cannot verify orderIds offline (cache unreadable). ` +
            `Pieces NOT saved.`
          );
        }
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
    // P1-11: production_pieces has a `company` column (used by every
    // company-filtered read like getProductionPiecesPage + strict-RLS WITH
    // CHECK), but the upsert row never set it — so rows either FAILED the RLS
    // insert for non-super users, or landed with a null company and were
    // invisible to every company-filtered read. Derive company PER PIECE from
    // its own order — NOT a blanket activeCompany(): this save is called with
    // `[...others, ...newPieces]` where `others` can belong to OTHER companies
    // (getProductionPieces isn't company-filtered), so a blanket stamp would
    // corrupt them. Fall back to the selected company only when the order is
    // unknown.
    const _quotes = safeParse(KEYS.QUOTATIONS) as any[];
    const _orderCompany = new Map<string, string>();
    for (const q of _quotes) {
      if (q?.orderNo) _orderCompany.set(q.orderNo, q.company);
      if (q?.id)      _orderCompany.set(q.id, q.company);
    }
    let _fallbackCompany = '';
    try { _fallbackCompany = useAppStore.getState().selectedCompany || ''; } catch { /* store not ready */ }
    const mapped = data
      .filter(p => p.id && (p as any).orderId)
      .map(p => ({
        id: p.id,
        company: (p as any).company || _orderCompany.get((p as any).orderId) || _fallbackCompany,
        order_id: (p as any).orderId || '',
        item_index: Number((p as any).itemIndex || 0),
        specs: p.specs || '',
        status: p.status || 'Cut',
        last_updated: (p as any).lastUpdated || new Date().toISOString(),
        cost_center_id: (p as any).costCenterId ?? null,
        sqft: (p as any).sqft ?? null,
        service_log: (p as any).serviceLog ?? null,  // JSONB — worker-to-service history
      }));
    if (mapped.length > 0) {
      supabase.from('production_pieces').upsert(mapped, { onConflict: 'id' })
        .then(({ error }) => { if (error) console.warn('[Pieces] Supabase push:', error.message); });
    }
  },
  // Fire-and-forget background variant of saveProductionPieces. Persists +
  // pushes without the caller awaiting. Any failure is logged (never silently
  // swallowed) so callers in a synchronous handler (e.g. GlasscoVendorHub,
  // DispatchPlanner, ncrService, GateControl, ProductionContext) don't have to
  // await the ghost-order validation / Supabase round-trip.
  saveProductionPiecesBg: (data: ProductionPiece[]): void => {
    ProductionService.saveProductionPieces(data).catch((err: unknown) => {
      Logger.error('Production', 'Background production-piece save failed', err);
    });
  },
  getTemperingDispatches: (): TemperingDispatch[] => safeParse(KEYS.TEMPERING_DISPATCHES),
  saveTemperingDispatches: (data: TemperingDispatch[]) => safeSave(KEYS.TEMPERING_DISPATCHES, data),

  // ── Floor Staff — production workers with role assignments ─────────
  // Used by ServiceFloorView and DailyFloorPlan for role-filtered dropdowns.
  // Roles: Cutter | Polish Operator | Machine Operator | Helper | Supervisor
  getFloorStaff: (company?: string) => {
    const all = safeParse(KEYS.FLOOR_STAFF);
    return company ? all.filter((s: any) => s.company === company) : all;
  },
  saveFloorStaff: (data: any[]) => {
    safeSave(KEYS.FLOOR_STAFF, data);
    // Supabase JSONB pattern — same as other tables
    if (data.length > 0) {
      supabase.from('floor_staff')
        .upsert(
          data.map((s: any) => ({ id: s.id, company: s.company ?? '', data: s })),
          { onConflict: 'id' },
        )
        .then(({ error }) => { if (error) console.warn('[FloorStaff] Supabase push:', error.message); });
    }
  },
  getWarehouseSpots: (): WarehouseSpot[] => safeParse(KEYS.WAREHOUSE_SPOTS),
  saveWarehouseSpots: (data: WarehouseSpot[]) => safeSave(KEYS.WAREHOUSE_SPOTS, data),

  // ── MFG-5: Vehicle Payload Guard (replaces oven constraint) ──────
  // Glass is outsourced to external tempering vendors — we guard
  // vehicle payload limits, NOT in-house oven capacity.
  // Queries dispatch_vehicles (Migration 023) for max_payload_kg.
  // Throws VehicleOverloadError if batch exceeds vehicle rated limit.
  // Fails open when offline or no vehicle selected (backwards compat).
  validateVehiclePayload: async (params: {
    vehicleId:     string | null;
    totalWeightKg: number;
  }): Promise<{ maxPayloadKg: number; utilization: number } | null> => {
    if (!params.vehicleId) return null; // No vehicle selected — skip check

    try {
      const { data, error } = await supabase.rpc('validate_vehicle_payload', {
        p_vehicle_id:      params.vehicleId,
        p_total_weight_kg: params.totalWeightKg,
      });
      if (error) {
        console.warn('[ProductionService] MFG-5: vehicle payload check failed:', error.message);
        return null; // Fail open
      }
      if (data && !data.success) {
        toast.error(data.error, { duration: 10000 });
        throw new Error(data.error);
      }
      return data ? { maxPayloadKg: data.maxPayloadKg, utilization: data.utilization } : null;
    } catch (e: any) {
      if (e.message?.includes('VehicleOverloadError')) throw e;
      console.warn('[ProductionService] MFG-5: vehicle check error:', e.message);
      return null; // Fail open for network errors
    }
  },

  // ── Dispatch Vehicles CRUD ─────────────────────────────────────────
  getDispatchVehicles: async (company: string) => {
    try {
      const { data } = await supabase
        .from('dispatch_vehicles')
        .select('*')
        .eq('company', company)
        .eq('is_active', true)
        .order('vehicle_name');
      return (data || []) as { id: string; vehicle_name: string; plate_number: string; max_payload_kg: number; vehicle_type: string }[];
    } catch {
      return [];
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
