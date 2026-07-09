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
import { SyncService } from '@/src/services/SyncService';

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
      const mapped = data.map((r: any) => {
        // Cutter attribution (083) + the Track-2.1 assignment/fault overlay are
        // carried INSIDE the data jsonb by the RPC's p_extra merge (046/083).
        // The flat cut_by/cut_at columns are the SQL-reporting mirror — read
        // either so attribution shows once 083 is live.
        const d = r.data && typeof r.data === 'object' ? r.data : {};
        return {
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
          cutBy: r.cut_by ?? d.cutBy,
          cutAt: r.cut_at ?? d.cutAt,
          // Track 2.1 — per-piece assignment & fault overlay (data-jsonb only).
          assignedCutter: d.assignedCutter,
          prevCutters: d.prevCutters,
          assignedAt: d.assignedAt,
          assignedBy: d.assignedBy,
          faultHistory: d.faultHistory,
          blockedReason: d.blockedReason,
          commitmentType: d.commitmentType,
        };
      }) as ProductionPiece[];

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
  /**
   * D2 — Reassign a job's remaining (un-cut) pieces to a new cutter.
   *
   * Already-cut pieces are NOT touched — they keep their `cutBy` credit, so a
   * previous cutter's completed work stays theirs. Each moved (Pending-Cut)
   * piece gets a per-piece `assignedCutter = toCutter`, the outgoing cutter
   * appended to `prevCutters[]`, and `assignedAt`/`assignedBy` stamped. These
   * ride the production_pieces.data jsonb via a SAME-STATUS
   * update_piece_status_atomic call (p_from = p_to → allowed no-op, 046 line 37)
   * — no status change, no GL, atomic + audit-logged server-side. Returns how
   * many pieces moved / failed. Caller owns the job-level Quotation.assignedCutter
   * update (which drives the Cutter Workbench cut queue).
   */
  reassignRemainingPieces: async (
    remaining: ProductionPiece[],
    fromCutter: string | undefined,
    toCutter: string,
    actor: string,
  ): Promise<{ moved: number; failed: number }> => {
    const nowIso = new Date().toISOString();
    const okById = new Map<string, Partial<ProductionPiece>>();
    let failed = 0;
    await Promise.all(remaining.map(async (p) => {
      const outgoing = p.assignedCutter || fromCutter;   // who held the piece before
      const prev = [...(p.prevCutters || [])];
      if (outgoing && outgoing !== toCutter && prev[prev.length - 1] !== outgoing) prev.push(outgoing);
      const patch: Partial<ProductionPiece> = {
        assignedCutter: toCutter,
        prevCutters: prev,
        assignedAt: nowIso,
        assignedBy: actor,
      };
      try {
        const { error } = await supabase.rpc('update_piece_status_atomic', {
          p_piece_id:   p.id,
          p_new_status: p.status,                          // same-status no-op — carries p_extra only
          p_changed_by: actor,
          p_reason:     `reassigned to ${toCutter}`,
          p_extra:      patch as any,
        });
        if (error) { failed++; Logger.error('ProductionService', `reassign piece ${p.id} failed`, error); return; }
        okById.set(p.id, patch);
      } catch (e) {
        failed++;
        Logger.error('ProductionService', `reassign piece ${p.id} exception`, e);
      }
    }));
    // Mirror successful moves into the local cache so reads are immediately consistent.
    if (okById.size > 0) {
      const all = safeParse(KEYS.PRODUCTION_PIECES) as ProductionPiece[];
      const next = all.map(p => okById.has(p.id) ? { ...p, ...okById.get(p.id) } : p);
      safeSave(KEYS.PRODUCTION_PIECES, next);
    }
    return { moved: okById.size, failed };
  },

  // Backfill: generate the missing 'Pending-Cut' production pieces for approved
  // orders that have none (or fewer than their item quantities). Mirrors the
  // approve-time generator (id = GLS-<mmyy>-<seq4>/<n>, specs = WxH thk type),
  // fills only the shortfall per item, and saves ALL pieces in one batch. Safe
  // to re-run (idempotent — never duplicates an item's pieces).
  generatePiecesForOrders: async (
    orders: Array<{
      id: string; orderNo?: string; company?: string;
      items?: Array<{ isSection?: boolean; qty?: number | string; width?: number; height?: number; glassSize?: string; glassType?: string; serviceOnly?: boolean }>;
    }>,
  ): Promise<{ created: number; orders: number }> => {
    const all = await ProductionService.getProductionPiecesAsync();
    const byOrder = new Map<string, ProductionPiece[]>();
    all.forEach(p => { const a = byOrder.get(p.orderId) || []; a.push(p); byOrder.set(p.orderId, a); });

    const newPieces: ProductionPiece[] = [];
    let ordersTouched = 0;
    for (const order of orders) {
      const orderNo = order.orderNo || order.id;
      if (!orderNo) continue;
      const existing = [...(byOrder.get(orderNo) || []), ...(byOrder.get(order.id) || [])];
      const haveByIdx = new Map<number, number>();
      existing.forEach(p => { const k = Number(p.itemIndex ?? 0); haveByIdx.set(k, (haveByIdx.get(k) || 0) + 1); });

      const segMatch = String(orderNo).match(/GLS-(\d{4})-(\d+)$/);
      const prefix = segMatch
        ? `GLS-${segMatch[1]}-${segMatch[2].slice(-4)}`
        : `GLS-${String(orderNo).replace(/[^A-Z0-9]/gi, '-').slice(-12) || '0000'}`;
      let serial = 1;
      existing.forEach(p => { const m = (p.id || '').match(/\/(\d+)$/); if (m) { const n = parseInt(m[1], 10); if (Number.isFinite(n) && n >= serial) serial = n + 1; } });

      let added = 0;
      (order.items || []).forEach((item, idx) => {
        if (item.isSection) return;
        const desired = Number(item.qty) || 0;
        const shortfall = Math.max(0, desired - (haveByIdx.get(idx) || 0));
        for (let i = 0; i < shortfall; i++) {
          newPieces.push({
            id: `${prefix}/${serial}`,
            orderId: orderNo,
            itemIndex: idx,
            specs: `${item.width ?? ''}x${item.height ?? ''} ${item.glassSize || '5mm'} ${item.glassType || 'Plain'}`.trim(),
            status: 'Pending-Cut' as ProductionPiece['status'],
            lastUpdated: new Date().toISOString(),
            isRevised: false,
            company: (order.company || 'Glassco') as ProductionPiece['company'],
            serviceOnly: item.serviceOnly || false,
          });
          serial++; added++;
        }
      });
      if (added > 0) ordersTouched++;
    }

    if (newPieces.length === 0) return { created: 0, orders: 0 };
    // Local cache immediately.
    try { safeSave(KEYS.PRODUCTION_PIECES, [...all, ...newPieces]); } catch { /* quota */ }
    // AWAIT the cloud upsert (saveProductionPieces' push is fire-and-forget, so a
    // race/RLS failure left pieces local-only and invisible to the supervisor /
    // cutter which read from Supabase). Await + surface the error instead of a
    // false-green success.
    const mapped = newPieces.map(p => ({
      id: p.id,
      company: (p.company || 'Glassco') as string,
      order_id: p.orderId,
      item_index: Number(p.itemIndex || 0),
      specs: p.specs || '',
      status: p.status || 'Pending-Cut',
      last_updated: p.lastUpdated || new Date().toISOString(),
    }));
    const { error } = await supabase.from('production_pieces').upsert(mapped, { onConflict: 'id' });
    if (error) { Logger.error('Production', 'generatePiecesForOrders upsert failed', error); throw new Error(error.message); }
    return { created: newPieces.length, orders: ordersTouched };
  },

  getGatePasses: (): GatePass[] => safeParse(KEYS.GATE_PASS),
  // markDirty: a locally-issued gate pass must reach the cloud gate_passes table,
  // otherwise the server authorize_dispatch RPC raises gate_pass_not_found_for_company.
  saveGatePasses: (data: GatePass[]) => {
    safeSave(KEYS.GATE_PASS, data);
    try { SyncService.markDirty('gate_passes'); } catch { /* SyncService not yet init */ }
  },
  getJobOrders: (): JobOrder[] => safeParse(KEYS.JOB_ORDERS),
  saveJobOrders: (data: JobOrder[]) => safeSave(KEYS.JOB_ORDERS, data),
  getTargetCompanyJobOrders: (targetCompany: Company): JobOrder[] => {
      const all = safeParse(KEYS.QUOTATIONS);
      return all.filter((q: any) => q.company === targetCompany);
  },
  getPurchaseOrders: (): PurchaseOrder[] => safeParse(KEYS.PURCHASE_ORDERS),
  savePurchaseOrders: (data: PurchaseOrder[]) => {
    // safeSave alone left every 3-way-match state change (grnRef,
    // vendorInvoiceNo, matchStatus, Matched/Paid, apInvoiceId) in localStorage
    // only — the next SyncService pull (authoritative overwrite) wiped it.
    // markDirty queues + pushes purchase_orders to Supabase (mappers exist).
    safeSave(KEYS.PURCHASE_ORDERS, data);
    try { SyncService.markDirty('purchase_orders'); } catch { /* SyncService not yet init */ }
  },
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
  // saveProductionPieces now validates that every unique orderId in the
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
    // which orderIds to ghost-check.
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
        // Offline ghost-order prevention. Previously, when Supabase
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
    // NOTE: cost_center_id is intentionally NOT sent — the LIVE production_pieces
    // table never got that column (Migration 018 diverged on this instance), so
    // including it made EVERY upsert 400 ("Could not find the 'cost_center_id'
    // column") → pieces never synced to the cloud + repeated console warnings.
    // costCenterId still persists in localStorage (safeSave above) for local cost
    // attribution; to sync it to the cloud, add the column via a migration and
    // restore the field in the mapper below.
    // production_pieces has a `company` column (used by every
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
  // safeSave alone left every dispatch mutation (trip create, status change,
  // gatePassId, receivedPieceIds, 3-way-match) in localStorage only — it never
  // reached the tempering_dispatches table, so the Production / Dispatch-cockpit /
  // Logistics surfaces went split-brain and the next authoritative pull wiped the
  // local rows. markDirty queues + pushes it (mappers now carry the full row via
  // the data jsonb blob so trip-link fields round-trip).
  saveTemperingDispatches: (data: TemperingDispatch[]) => {
    safeSave(KEYS.TEMPERING_DISPATCHES, data);
    try { SyncService.markDirty('tempering_dispatches'); } catch { /* SyncService not yet init */ }
  },

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

  // ── Vehicle Payload Guard (replaces oven constraint) ──────
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

  // ── Production cost config helpers ────────────────────────
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
