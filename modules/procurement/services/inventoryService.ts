import {
  StoreItem, MaterialLedgerEntry, InspectionLot, Remnant, RemnantHistoryEntry,
  HandlingUnit, Requisition, PurchaseOrder, Vehicle, VehicleTrip, VehicleExpense,
  GRNSheetEntry, VendorDefectReport, CuttingSession, ManualCountSheet,
  ScrapDisposal, VendorReview, PalletRateEntry, WeightMasterEntry, StockLocation,
} from '@/modules/procurement/types/inventory';
import { initDB } from '@/modules/shared/services/db';
import { bgSaveToIDB, safeParse, safeSave } from '@/modules/shared/services/utils';
import { supabase } from '../../../src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';
import { toast } from 'sonner';

// ── Visible Supabase upsert — never silent, surfaces schema/permission errors to user ──
const _inventoryUpsert = async (table: string, rows: any[], label: string): Promise<void> => {
  try {
    const { error } = await supabase.from(table).upsert(rows);
    if (error) {
      console.error(`[InventoryService] ${label} upsert failed:`, error.message, error);
      toast.error(`Cloud sync failed (${label}): ${error.message}`, {
        id: `inv-sync-${table}`, duration: 8000,
      });
    } else {
      console.log(`[InventoryService] ${label} upsert OK — ${rows.length} row(s)`);
    }
  } catch (err: any) {
    console.error(`[InventoryService] ${label} exception:`, err);
    toast.error(`Cloud sync error (${label}): ${err?.message || 'unknown'}`, {
      id: `inv-err-${table}`, duration: 8000,
    });
  }
};

// ── SCM-3: Insufficient stock error ──────────────────────────────────────
// Thrown by assertSufficientStock() before any issue or transfer movement.
// Callers must catch this and surface it to the user — never swallow silently.
export class InsufficientStockError extends Error {
  constructor(
    public readonly materialId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(
      `InsufficientStockError: Material "${materialId}" — requested ${requested}, ` +
      `available unrestricted: ${available}. Cannot issue more than unrestricted stock.`
    );
    this.name = 'InsufficientStockError';
    Object.setPrototypeOf(this, InsufficientStockError.prototype);
  }
}

// ── SCM-2: Budget exceeded error ──────────────────────────────────────────
// Thrown by assertPOBudget() before a Purchase Order status is set to Approved.
export class BudgetExceededError extends Error {
  constructor(
    public readonly costCenterId: string,
    public readonly poTotal: number,
    public readonly committed: number,
    public readonly monthlyBudget: number,
  ) {
    super(
      `BudgetExceededError: PO total PKR ${poTotal.toLocaleString()} would exceed ` +
      `cost center "${costCenterId}" budget. ` +
      `Already committed: PKR ${committed.toLocaleString()} / ` +
      `Monthly budget: PKR ${monthlyBudget.toLocaleString()}. ` +
      `Remaining: PKR ${Math.max(0, monthlyBudget - committed).toLocaleString()}. ` +
      `Obtain CFO approval before posting this PO.`
    );
    this.name = 'BudgetExceededError';
    Object.setPrototypeOf(this, BudgetExceededError.prototype);
  }
}

const KEYS = {
  STORE:              'gtk_erp_store',
  STOCK_LEDGER:       'gtk_erp_stock_ledger',
  INSPECTION_LOTS:    'gtk_erp_inspection_lots',
  REMNANTS:           'gtk_erp_remnants',
  REMNANT_HISTORY:    'gtk_erp_remnant_history',
  HANDLING_UNITS:     'gtk_erp_handling_units',
  REQUISITIONS:       'gtk_erp_requisitions',
  PURCHASE_ORDERS:    'gtk_erp_purchase_orders',
  VEHICLES:           'gtk_erp_vehicles',
  VEHICLE_TRIPS:      'gtk_erp_vehicle_trips',
  VEHICLE_EXPENSES:   'gtk_erp_vehicle_expenses',
  // ── Phase 1 new ───────────────────────────────────────────────────
  GRN_SHEET_ENTRIES:       'gtk_erp_grn_sheet_entries',
  VENDOR_DEFECT_REPORTS:   'gtk_erp_vendor_defect_reports',
  CUTTING_SESSIONS:        'gtk_erp_cutting_sessions',
  MANUAL_COUNT_SHEETS:     'gtk_erp_manual_count_sheets',
  SCRAP_DISPOSALS:         'gtk_erp_scrap_disposals',
  VENDOR_REVIEWS:          'gtk_erp_vendor_reviews',
  PALLET_RATES:            'gtk_erp_pallet_rates',
  WEIGHT_MASTER:           'gtk_erp_weight_master',
  STOCK_LOCATIONS:         'gtk_erp_stock_locations',
};

// ── SCM-4: Moving Average Price update on GRN posting ─────────────────────
// Formula: new_MAP = (old_qty × old_MAP + received_qty × unit_price) / new_qty
//
// MUST be called AFTER the GRN stock quantities have been incremented in
// store_items (i.e. after saveStore / GRN post).  Calling before the qty
// update means old_qty still excludes the new receipt, which gives a wrong MAP.
//
// Tolerances: all intermediate results rounded to 6 decimal places;
// final MAP and total_value rounded to 2 decimal places (PKR precision).
//
// Throws if the material does not exist or the params are invalid.
/**
 * applyMAPOnGRN — Weighted Moving Average Price on Goods Receipt
 *
 * Task 2 — Phase 9: Landed Cost Absorption into MAP
 *
 * BEFORE this fix: only the vendor unit price was used in the MAP formula.
 * Freight, customs duty, and handling charges went straight to a GL expense
 * account, understating inventory cost and overstating period expenses.
 *
 * AFTER this fix: all acquisition costs (freight + duty + handling) are spread
 * across the received quantity and folded into the landed unit price before the
 * MAP formula is applied.  This aligns with IAS-2 §10:
 *   "The cost of inventories shall comprise all costs of purchase, costs of
 *    conversion, and other costs incurred in bringing the inventories to their
 *    present location and condition."
 *
 * Formula:
 *   landedUnitPrice  = unitPrice + (freightPKR + dutyPKR + handlingPKR) / receivedQty
 *   new_MAP          = (preReceiptQty × oldMAP + receivedQty × landedUnitPrice) / currentQty
 *
 * The landed cost components are OPTIONAL (default 0) — fully backward-compatible.
 * When all three are zero the result is identical to the original formula.
 *
 * Timing contract (unchanged):
 *   Call AFTER the GRN has been committed to store_items so that
 *   data.quantity already includes the received batch.
 *
 * Tolerances: all intermediate results rounded to 6 dp; final values to 2 dp (PKR).
 *
 * @returns newMAP, newTotalValue, landedUnitPrice (for caller logging / GL posting)
 */
export const applyMAPOnGRN = async (params: {
  materialId:   string;
  receivedQty:  number;    // quantity just received (must be positive)
  unitPrice:    number;    // vendor net unit price (ex-freight, ex-duty)
  // ── Landed cost components (Task 2 — Phase 9) ─────────────────────
  // All optional; default 0. When provided, they are absorbed into MAP
  // rather than expensed directly, matching IAS-2 inventory cost principles.
  freightPKR?:  number;    // inbound freight allocated to this GRN line
  dutyPKR?:     number;    // customs duty / import tariff for this GRN line
  handlingPKR?: number;    // port handling, loading/unloading, clearing charges
}): Promise<{ newMAP: number; newTotalValue: number; landedUnitPrice: number }> => {
  const {
    materialId,
    receivedQty,
    unitPrice,
    freightPKR  = 0,
    dutyPKR     = 0,
    handlingPKR = 0,
  } = params;

  if (receivedQty <= 0) {
    throw new Error(`[applyMAPOnGRN] receivedQty must be positive (got ${receivedQty})`);
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error(`[applyMAPOnGRN] unitPrice must be a finite non-negative number (got ${unitPrice})`);
  }

  // ── Landed cost calculation ─────────────────────────────────────────────
  // Total acquisition cost absorbed per unit for this receipt.
  // Non-finite or negative landed cost components are coerced to 0 defensively.
  const safeFreight  = Number.isFinite(freightPKR)  && freightPKR  >= 0 ? freightPKR  : 0;
  const safeDuty     = Number.isFinite(dutyPKR)     && dutyPKR     >= 0 ? dutyPKR     : 0;
  const safeHandling = Number.isFinite(handlingPKR) && handlingPKR >= 0 ? handlingPKR : 0;

  const totalLandedCharges = safeFreight + safeDuty + safeHandling;
  const landedCostPerUnit  = totalLandedCharges / receivedQty; // PKR per unit

  // landedUnitPrice = vendor price + absorbed acquisition cost per unit
  const landedUnitPrice = unitPrice + landedCostPerUnit;

  if (totalLandedCharges > 0) {
    console.info(
      `[applyMAPOnGRN] Landed cost absorption for "${materialId}": ` +
      `freight PKR ${safeFreight.toFixed(2)} + duty PKR ${safeDuty.toFixed(2)} + ` +
      `handling PKR ${safeHandling.toFixed(2)} = PKR ${totalLandedCharges.toFixed(2)} total ` +
      `÷ ${receivedQty} units = PKR ${landedCostPerUnit.toFixed(6)}/unit. ` +
      `Landed unit price: PKR ${landedUnitPrice.toFixed(6)} (vendor: PKR ${unitPrice.toFixed(6)}).`
    );
  }

  // ── Fetch post-receipt stock from Supabase ──────────────────────────────
  // Always read live so we get the quantity that already includes this receipt.
  const { data, error } = await supabase
    .from('store_items')
    .select('quantity, moving_average_price, total_value')
    .eq('id', materialId)
    .single();

  if (error || !data) {
    throw new Error(
      `[applyMAPOnGRN] Material "${materialId}" not found in store_items: ${error?.message ?? 'no row'}`
    );
  }

  // After GRN post: currentQty already includes the received batch
  const currentQty = Number(data.quantity ?? 0);
  const oldMAP     = Number(data.moving_average_price ?? 0);

  // Back-calculate the pre-receipt quantity
  //   pre_qty = current_qty − received_qty
  const preReceiptQty = Math.max(0, currentQty - receivedQty);

  // ── MAP formula with landed unit price ──────────────────────────────────
  // new_MAP = (old_stock_value + landed_receipt_value) / new_qty
  //         = (preReceiptQty × oldMAP + receivedQty × landedUnitPrice) / currentQty
  const newMAP = currentQty > 0
    ? ((preReceiptQty * oldMAP) + (receivedQty * landedUnitPrice)) / currentQty
    : landedUnitPrice;

  const newMAPRounded           = Math.round(newMAP            * 100) / 100;
  const landedUnitPriceRounded  = Math.round(landedUnitPrice   * 100) / 100;
  const newTotalValueRounded    = Math.round(currentQty * newMAPRounded * 100) / 100;

  // ── Persist updated MAP and total_value ─────────────────────────────────
  const { error: updateError } = await supabase
    .from('store_items')
    .update({
      moving_average_price: newMAPRounded,
      total_value:          newTotalValueRounded,
      updated_at:           new Date().toISOString(),
    })
    .eq('id', materialId);

  if (updateError) {
    console.error(
      `[applyMAPOnGRN] Failed to persist MAP for "${materialId}": ${updateError.message}. ` +
      `Stock qty was committed; MAP will self-correct on next GRN. Logged for reconciliation.`
    );
    // Non-fatal: fail-open consistent with project offline-resilience pattern.
  }

  return {
    newMAP:           newMAPRounded,
    newTotalValue:    newTotalValueRounded,
    landedUnitPrice:  landedUnitPriceRounded,
  };
};

// ── SCM-3: Stock gate — call before ANY material issue or transfer ────────
// Queries the live Supabase record so no stale cache can be exploited.
// Throws InsufficientStockError if unrestricted_qty < issueQty.
export const assertSufficientStock = async (
  materialId: string,
  issueQty: number,
): Promise<void> => {
  if (issueQty <= 0) return; // nothing to check
  const { data, error } = await supabase
    .from('store_items')
    .select('unrestricted_qty, quantity')
    .eq('id', materialId)
    .single();
  if (error || !data) {
    throw new InsufficientStockError(materialId, issueQty, 0);
  }
  const available = Number(data.unrestricted_qty ?? data.quantity ?? 0);
  if (issueQty > available) {
    throw new InsufficientStockError(materialId, issueQty, available);
  }
};

// ── SCM-2: PO budget gate — call before setting PO status to 'Approved' ──
// Reads committed PO amounts and monthly budget from budget_lines.
// Throws BudgetExceededError if approving this PO would breach the budget.
export const assertPOBudget = async (params: {
  company: string;
  costCenterId: string;
  poTotalAmount: number;
  fiscalYear: number;
  fiscalMonth: number;       // 1-12
}): Promise<void> => {
  const { company, costCenterId, poTotalAmount, fiscalYear, fiscalMonth } = params;

  // Sum all already-approved POs for this cost center in this month
  const monthStr = `${fiscalYear}-${String(fiscalMonth).padStart(2, '0')}`;
  const { data: approvedPOs, error: poErr } = await supabase
    .from('purchase_orders')  // adjust table name if different in your schema
    .select('total_amount')
    .eq('company', company)
    .eq('cost_center_id', costCenterId)
    .eq('status', 'Approved')
    .gte('date', `${monthStr}-01`)
    .lt('date', `${fiscalYear}-${String(fiscalMonth + 1).padStart(2, '0')}-01`);

  const alreadyCommitted = (approvedPOs ?? [])
    .reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);

  // Read monthly budget ceiling from budget_lines
  const { data: budgetRow, error: budgetErr } = await supabase
    .from('budget_lines')
    .select('monthly_budget')
    .eq('company', company)
    .eq('cost_center_id', costCenterId)
    .eq('fiscal_year', fiscalYear)
    .eq('fiscal_month', fiscalMonth)
    .maybeSingle();

  // If no budget row exists at all, log a warning but do NOT block (budget not yet configured)
  if (budgetErr || !budgetRow) {
    console.warn(
      `[assertPOBudget] No budget_lines row for cost center "${costCenterId}" ` +
      `(${company} FY${fiscalYear} M${fiscalMonth}). Skipping budget check.`
    );
    return;
  }

  const monthlyBudget = Number(budgetRow.monthly_budget ?? 0);
  if (monthlyBudget > 0 && alreadyCommitted + poTotalAmount > monthlyBudget) {
    throw new BudgetExceededError(costCenterId, poTotalAmount, alreadyCommitted, monthlyBudget);
  }
};

// ── Supabase JSONB sync helper ──────────────────────────────────────────
// All procurement tables use { id, company, data JSONB } schema.
// This helper maps any array of records to that structure and upserts.
//
// God Mode audit (Phase 3): the previous version was a TRUE fire-and-forget
// (`.then()` swallowed errors to console only — users never saw cloud-sync
// failures). It now mirrors `_inventoryUpsert`: kicks off async, shows a
// toast on failure (deduped by table). Signature stays `void` so existing
// 14+ callers don't have to change.
//
// Defensive: filters out rows with blank/null `company` — those are
// invisible to RLS (`company = profile.company` policy) and would create
// orphaned data islands. Logs a warning instead of silently saving them.
const _sbSync = (table: string, data: any[]): void => {
  if (!data.length) return;

  const validRows = data.filter((r: any) => {
    if (!r.company || r.company === '') {
      console.warn(`[InventoryService] ${table}: skipping row with blank company`, r.id);
      return false;
    }
    return true;
  });

  if (!validRows.length) return;

  void (async () => {
    try {
      const { error } = await supabase
        .from(table)
        .upsert(
          validRows.map((r: any) => ({ id: r.id, company: r.company, data: r })),
          { onConflict: 'id' }
        );
      if (error) {
        console.error(`[InventoryService] ${table} sync error:`, error.message, error);
        toast.error(`Cloud sync failed (${table}): ${error.message}`, {
          id: `inv-sync-${table}`, duration: 8000,
        });
      }
    } catch (err: any) {
      console.error(`[InventoryService] ${table} sync exception:`, err);
      toast.error(`Cloud sync error (${table}): ${err?.message || 'unknown'}`, {
        id: `inv-err-${table}`, duration: 8000,
      });
    }
  })();
};

export const InventoryService = {
  // ── Store ──────────────────────────────────────────────────────────
  getStore: (): StoreItem[] => safeParse(KEYS.STORE),
  getStoreAsync: async (): Promise<StoreItem[]> => {
    // SEC-4: scope to authenticated user's company — defence-in-depth over DB RLS.
    const company = useAuthStore.getState().profile?.company ?? '';
    try {
      const { data, error } = await supabase.from('store_items').select('*').eq('company', company);
      if (!error && data && data.length > 0) {
        const mapped: StoreItem[] = data.map((r: any) => ({
          ...r,
          unrestrictedQty: r.unrestricted_qty,
          qiQty: r.qi_qty,
          blockedQty: r.blocked_qty,
          reservedQty: r.reserved_qty,
          movingAveragePrice: r.moving_average_price,
          totalValue: r.total_value,
          storageBin: r.storage_bin,
          lastMovementDate: r.last_movement_date,
          minLevel: r.min_level,
          reorderPoint: r.reorder_point,
        }));
        safeSave(KEYS.STORE, mapped);
        return mapped;
      }
    } catch (e) {
      console.error('[InventoryService] getStoreAsync error', e);
    }
    return safeParse(KEYS.STORE);
  },
  saveStore: (data: StoreItem[]) => {
    // SCM-3: App-layer guard — catch negative quantities before DB write.
    // The DB constraint (qty_non_negative) is the ultimate backstop, but we
    // surface a descriptive error here so the user sees a clear message
    // rather than a raw Postgres constraint violation.
    for (const item of data) {
      if ((item.quantity ?? 0) < 0) {
        throw new InsufficientStockError(
          item.id,
          Math.abs(item.quantity ?? 0),
          0,
        );
      }
      if ((item as any).unrestrictedQty < 0) {
        throw new InsufficientStockError(
          item.id,
          Math.abs((item as any).unrestrictedQty),
          0,
        );
      }
    }
    // God Mode audit (Phase 3): reject rows with blank company before
    // they hit storage. Empty company = invisible to RLS = orphan data
    // forever. Was previously coerced to '' (line 389 OLD).
    for (const item of data) {
      if (!item.company) {
        throw new Error(
          `[InventoryService] saveStore: cannot save store_item "${item.id || '(no id)'}" — company is blank. ` +
          `Caller must stamp company from auth context before save.`
        );
      }
    }
    safeSave(KEYS.STORE, data);
    const rows = data.map((s: any) => ({
      id: s.id, company: s.company, name: s.name||'',
      category: s.category||'', quantity: s.quantity||0,
      unrestricted_qty: s.unrestrictedQty||0, qi_qty: s.qiQty||0,
      blocked_qty: s.blockedQty||0, reserved_qty: s.reservedQty||0,
      unit: s.unit||'Sqft',
      moving_average_price: s.movingAveragePrice||0,
      total_value: s.totalValue||0, storage_bin: s.storageBin||'',
      // Postgres timestamptz rejects '' — must be null when no date is set,
      // else the whole batch upsert 400s (invalid input syntax for type
      // timestamp with time zone: "").
      last_movement_date: s.lastMovementDate || null,
      min_level: s.minLevel||0, reorder_point: s.reorderPoint||0,
      per_sheet_weight_kg: (s as any).perSheetWeightKg||0,
      per_sqft_weight_kg:  (s as any).perSqftWeightKg||0,
    }));
    _inventoryUpsert('store_items', rows, 'store_items');
  },

  // ── Stock Ledger ───────────────────────────────────────────────────
  getStockLedger: (): MaterialLedgerEntry[] => safeParse(KEYS.STOCK_LEDGER),
  getStockLedgerAsync: async (): Promise<MaterialLedgerEntry[]> => {
    const company = useAuthStore.getState().profile?.company ?? '';
    try {
      const { data, error } = await supabase.from('stock_ledger').select('*').eq('company', company);
      if (!error && data && data.length > 0) {
        const mapped: MaterialLedgerEntry[] = data.map((r: any) => ({
          id: r.id, company: r.company, materialId: r.material_id,
          timestamp: r.timestamp, mvmntCode: r.mvmnt_code,
          qty: r.qty, uom: r.uom, valuation: r.valuation,
          balanceAfter: r.balance_after, referenceDoc: r.reference_doc,
          user: r.user, remarks: r.remarks,
          storageBin: r.storage_bin, batchNo: r.batch_no,
          huId: r.hu_id, projectId: r.project_id,
          dcNo: r.dc_no, biltyNo: r.bilty_no,
          biltyFreightPKR: r.bilty_freight_pkr, vendorSoNo: r.vendor_so_no,
          vehicleNo: r.vehicle_no, driverName: r.driver_name,
          driverPhone: r.driver_phone, freightType: r.freight_type,
          freightPKR: r.freight_pkr, otherChargesPKR: r.other_charges_pkr,
          otherChargesDesc: r.other_charges_desc, lineWeightKg: r.line_weight_kg,
          biltyWeightKg: r.bilty_weight_kg,
          perSheetWeightKg: r.per_sheet_weight_kg, perSqftWeightKg: r.per_sqft_weight_kg,
          vendorId: r.vendor_id, vendorName: r.vendor_name,
          poId: r.po_id, sheetCount: r.sheet_count,
          glassCategory: r.glass_category, sheetTags: r.sheet_tags || [],
          sheetTagMeta: r.sheet_tag_meta,
          reversalOf: r.reversal_of, isReversal: r.is_reversal,
          reversalReason: r.reversal_reason,
        }));
        safeSave(KEYS.STOCK_LEDGER, mapped);
        bgSaveToIDB('stockLedger', mapped);
        return mapped;
      }
    } catch (e) {
      console.error('[InventoryService] getStockLedgerAsync Supabase error', e);
    }
    // fallback to IDB then localStorage
    try {
      const db = await initDB();
      const items = await db.getAll('stockLedger');
      if (items.length > 0) return items;
    } catch {}
    return safeParse(KEYS.STOCK_LEDGER);
  },
  saveStockLedger: (data: MaterialLedgerEntry[]) => {
    const recent = data.slice(-1000);
    safeSave(KEYS.STOCK_LEDGER, recent);
    bgSaveToIDB('stockLedger', data);
    // Supabase upsert — snake_case mapping
    const rows = recent.map((e: any) => ({
      id: e.id,
      company: e.company || '',
      material_id: e.materialId || '',
      // timestamptz — null not '' when absent (see store_items fix above).
      timestamp: e.timestamp || null,
      mvmnt_code: e.mvmntCode || '',
      qty: e.qty || 0,
      uom: e.uom || '',
      valuation: e.valuation || 0,
      balance_after: e.balanceAfter || 0,
      reference_doc: e.referenceDoc || '',
      user: e.user || '',
      remarks: e.remarks || '',
      storage_bin: e.storageBin || null,
      batch_no: e.batchNo || null,
      hu_id: e.huId || null,
      project_id: e.projectId || null,
      dc_no: e.dcNo || null,
      bilty_no: e.biltyNo || null,
      bilty_freight_pkr: e.biltyFreightPKR || 0,
      vendor_so_no: e.vendorSoNo || null,
      vehicle_no: e.vehicleNo || null,
      driver_name: e.driverName || null,
      driver_phone: e.driverPhone || null,
      freight_type: e.freightType || null,
      freight_pkr: e.freightPKR || 0,
      other_charges_pkr: e.otherChargesPKR || 0,
      other_charges_desc: e.otherChargesDesc || null,
      line_weight_kg: e.lineWeightKg || 0,
      bilty_weight_kg: e.biltyWeightKg || 0,
      per_sheet_weight_kg: e.perSheetWeightKg || 0,
      per_sqft_weight_kg: e.perSqftWeightKg || 0,
      vendor_id: e.vendorId || null,
      vendor_name: e.vendorName || null,
      po_id: e.poId || null,
      sheet_count: e.sheetCount || 0,
      glass_category: e.glassCategory || null,
      sheet_tags: e.sheetTags || [],
      sheet_tag_meta: e.sheetTagMeta || null,
      reversal_of: e.reversalOf || null,
      is_reversal: e.isReversal || false,
      reversal_reason: e.reversalReason || null,
    }));
    _inventoryUpsert('stock_ledger', rows, 'stock_ledger');
  },

  // ── Requisitions ───────────────────────────────────────────────────
  getRequisitions: (): Requisition[] => safeParse(KEYS.REQUISITIONS),
  saveRequisitions: (data: Requisition[]) => { safeSave(KEYS.REQUISITIONS, data); _sbSync('requisitions', data); },

  // ── Purchase Orders ────────────────────────────────────────────────
  getPurchaseOrders: (): PurchaseOrder[] => safeParse(KEYS.PURCHASE_ORDERS),
  savePurchaseOrders: (data: PurchaseOrder[]) => { safeSave(KEYS.PURCHASE_ORDERS, data); _sbSync('purchase_orders', data); },

  // ── Intercompany EDI: PO-to-SO Automation ─────────────────────────
  INTERNAL_COMPANIES: ['GTK', 'GTI', 'Glassco', 'GlassCo', 'Nippon', 'Factory'] as const,

  isInternalVendor: (vendorName: string): boolean => {
    const lower = (vendorName || '').toLowerCase().trim();
    return InventoryService.INTERNAL_COMPANIES.some(c => c.toLowerCase() === lower);
  },

  /**
   * Creates an intercompany PO + SO pair via SECURITY DEFINER RPC.
   * Returns { success, poId, soId, eta } or { success: false, error }.
   */
  createIntercompanyOrder: async (params: {
    buyerCompany: string;
    sellerCompany: string;
    items: { description?: string; qty?: number; rate?: number; specs?: string }[];
    totalAmount: number;
    category?: string;
    projectName?: string;
    deliveryDate?: string;
    priority?: 'Normal' | 'High' | 'Urgent';
    createdBy?: string;
  }): Promise<{ success: boolean; poId?: string; soId?: string; eta?: string; error?: string }> => {
    try {
      const { data, error } = await supabase.rpc('generate_intercompany_order', {
        p_buyer_company:  params.buyerCompany,
        p_seller_company: params.sellerCompany,
        p_items:          JSON.stringify(params.items),
        p_total_amount:   params.totalAmount,
        p_category:       params.category || 'Glass',
        p_project_name:   params.projectName || '',
        p_delivery_date:  params.deliveryDate || null,
        p_priority:       params.priority || 'Normal',
        p_created_by:     params.createdBy || 'system',
      });
      if (error) return { success: false, error: error.message };
      if (data && !data.success) return { success: false, error: data.error };
      // Sync new PO to localStorage for immediate UI display
      if (data?.poId) {
        const allPOs = InventoryService.getPurchaseOrders();
        const newPO = {
          id: data.poId,
          fromCompany: params.buyerCompany,
          toVendor: params.sellerCompany,
          date: new Date().toISOString().split('T')[0],
          status: 'Sent',
          totalAmount: params.totalAmount,
          category: params.category || 'Glass',
          items: params.items,
          isIntercompany: true,
          linkedInternalId: data.soId,
          currentEta: data.eta,
          originalEta: data.eta,
          priorityLevel: params.priority || 'Normal',
        } as any;
        InventoryService.savePurchaseOrders([...allPOs, newPO]);
      }
      return { success: true, poId: data.poId, soId: data.soId, eta: data.eta };
    } catch (e: any) {
      return { success: false, error: e.message || 'Unknown error' };
    }
  },

  // ── Inspection Lots ────────────────────────────────────────────────
  getInspectionLots: (): InspectionLot[] => safeParse(KEYS.INSPECTION_LOTS),
  saveInspectionLots: (data: InspectionLot[]) => { safeSave(KEYS.INSPECTION_LOTS, data); _sbSync('inspection_lots', data); },

  // ── Handling Units ─────────────────────────────────────────────────
  getHandlingUnits: (): HandlingUnit[] => safeParse(KEYS.HANDLING_UNITS),
  saveHandlingUnits: (data: HandlingUnit[]) => { safeSave(KEYS.HANDLING_UNITS, data); _sbSync('handling_units', data); },

  // ── Vehicle Fleet ──────────────────────────────────────────────────
  getVehicles: (): Vehicle[] => safeParse(KEYS.VEHICLES),
  saveVehicles: (data: Vehicle[]) => { safeSave(KEYS.VEHICLES, data); _sbSync('vehicles', data); },
  getVehicleTrips: (): VehicleTrip[] => safeParse(KEYS.VEHICLE_TRIPS),
  saveVehicleTrips: (data: VehicleTrip[]) => { safeSave(KEYS.VEHICLE_TRIPS, data); _sbSync('vehicle_trips', data); },
  getVehicleExpenses: (): VehicleExpense[] => safeParse(KEYS.VEHICLE_EXPENSES),
  saveVehicleExpenses: (data: VehicleExpense[]) => { safeSave(KEYS.VEHICLE_EXPENSES, data); _sbSync('vehicle_expenses', data); },

  // ── GRN Sheet Entries (Phase 1) ────────────────────────────────────
  getGRNSheetEntries: (): GRNSheetEntry[] => safeParse(KEYS.GRN_SHEET_ENTRIES),
  getGRNSheetEntriesByGRN: (grnId: string): GRNSheetEntry[] =>
    safeParse(KEYS.GRN_SHEET_ENTRIES).filter((e: GRNSheetEntry) => e.grnId === grnId),
  getGRNSheetEntryByTag: (tagId: string): GRNSheetEntry | undefined =>
    safeParse(KEYS.GRN_SHEET_ENTRIES).find((e: GRNSheetEntry) => e.tagId === tagId),
  saveGRNSheetEntries: (data: GRNSheetEntry[]) => { safeSave(KEYS.GRN_SHEET_ENTRIES, data); _sbSync('grn_sheet_entries', data); },
  upsertGRNSheetEntry: (entry: GRNSheetEntry) => {
    const all: GRNSheetEntry[] = safeParse(KEYS.GRN_SHEET_ENTRIES);
    const idx = all.findIndex(e => e.id === entry.id);
    if (idx !== -1) all[idx] = entry; else all.push(entry);
    safeSave(KEYS.GRN_SHEET_ENTRIES, all);
  },

  // ── Sheet consumption (Sprint 0) ──────────────────────────────────
  // Available sheets for cutter autocomplete: company-scoped, status OK,
  // not yet consumed by any active session. (Status Defective/Broken
  // remain visible because they're still consumable with cutter note.)
  getAvailableSheetsForCompany: (company: string): GRNSheetEntry[] =>
    safeParse(KEYS.GRN_SHEET_ENTRIES).filter((e: GRNSheetEntry) =>
      e.company === company && !e.consumedInSessionId
    ),

  // Atomic consume via Postgres RPC. Falls back to local-only marking
  // if Supabase is unreachable (best-effort offline).
  consumeSheet: async (
    tagId: string,
    sessionId: string,
    company: string,
    consumedBy: string
  ): Promise<{ data: GRNSheetEntry | null; error: string | null }> => {
    try {
      const { data, error } = await supabase.rpc('consume_grn_sheet', {
        p_tag_id: tagId,
        p_session_id: sessionId,
        p_company: company,
        p_consumed_by: consumedBy,
      });
      if (error) return { data: null, error: error.message };

      // Mirror the consumption into localStorage so offline reads agree
      const all: GRNSheetEntry[] = safeParse(KEYS.GRN_SHEET_ENTRIES);
      const idx = all.findIndex(e => e.tagId === tagId && e.company === company);
      if (idx !== -1) {
        all[idx] = {
          ...all[idx],
          consumedInSessionId: sessionId,
          consumedAt: new Date().toISOString(),
          consumedBy,
        };
        safeSave(KEYS.GRN_SHEET_ENTRIES, all);
        return { data: all[idx], error: null };
      }
      return { data: null, error: 'sheet_not_found_locally' };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'consume_failed';
      return { data: null, error: msg };
    }
  },

  // ── Vendor Defect Reports (Phase 1) ───────────────────────────────
  getVendorDefectReports: (): VendorDefectReport[] => safeParse(KEYS.VENDOR_DEFECT_REPORTS),
  getVendorDefectReportsByGRN: (grnId: string): VendorDefectReport[] =>
    safeParse(KEYS.VENDOR_DEFECT_REPORTS).filter((r: VendorDefectReport) => r.grnId === grnId),
  saveVendorDefectReports: (data: VendorDefectReport[]) => { safeSave(KEYS.VENDOR_DEFECT_REPORTS, data); _sbSync('vendor_defect_reports', data); },
  upsertVendorDefectReport: (report: VendorDefectReport) => {
    const all: VendorDefectReport[] = safeParse(KEYS.VENDOR_DEFECT_REPORTS);
    const idx = all.findIndex(r => r.id === report.id);
    if (idx !== -1) all[idx] = report; else all.push(report);
    safeSave(KEYS.VENDOR_DEFECT_REPORTS, all);
  },

  // ── Remnants (Phase 1 — full type) ────────────────────────────────
  getRemnants: (): Remnant[] => safeParse(KEYS.REMNANTS),
  getRemnantsByCompany: (company: string): Remnant[] =>
    safeParse(KEYS.REMNANTS).filter((r: Remnant) => r.company === company),
  getAvailableRemnants: (company: string): Remnant[] =>
    safeParse(KEYS.REMNANTS).filter((r: Remnant) => r.company === company && r.status === 'Available'),
  // Find remnants that can fit a required piece (simple rectangle fit check)
  findFittingRemnants: (company: string, requiredWidthInch: number, requiredHeightInch: number, thickness: string): Remnant[] => {
    return safeParse(KEYS.REMNANTS).filter((r: Remnant) => {
      if (r.company !== company || r.status !== 'Available' || r.thickness !== thickness) return false;
      const d = r.dimensions;
      if (r.shape === 'Rectangle') {
        const w = d.widthInch || 0;
        const h = d.heightInch || 0;
        return (w >= requiredWidthInch && h >= requiredHeightInch) ||
               (w >= requiredHeightInch && h >= requiredWidthInch); // rotated
      }
      // L-Shape: check both rectangles
      const r1w = d.rect1Width || 0; const r1h = d.rect1Height || 0;
      const r2w = d.rect2Width || 0; const r2h = d.rect2Height || 0;
      return (r1w >= requiredWidthInch && r1h >= requiredHeightInch) ||
             (r2w >= requiredWidthInch && r2h >= requiredHeightInch);
    });
  },
  saveRemnants: (data: Remnant[]) => { safeSave(KEYS.REMNANTS, data); _sbSync('remnants', data); },
  upsertRemnant: (remnant: Remnant) => {
    const all: Remnant[] = safeParse(KEYS.REMNANTS);
    const idx = all.findIndex(r => r.id === remnant.id);
    if (idx !== -1) all[idx] = remnant; else all.push(remnant);
    safeSave(KEYS.REMNANTS, all);
  },

  // ── Remnant History (Phase 1) ─────────────────────────────────────
  getRemnantHistory: (): RemnantHistoryEntry[] => safeParse(KEYS.REMNANT_HISTORY),
  saveRemnantHistory: (data: RemnantHistoryEntry[]) => { safeSave(KEYS.REMNANT_HISTORY, data); _sbSync('remnant_history', data); },
  addRemnantHistoryEntry: (entry: RemnantHistoryEntry) => {
    const all: RemnantHistoryEntry[] = safeParse(KEYS.REMNANT_HISTORY);
    all.push(entry);
    safeSave(KEYS.REMNANT_HISTORY, all);
  },
  // Suggest whether a sqft size is likely to be useful or scrap based on history
  getRemnantSuggestion: (company: string, thickness: string, sqft: number): {
    recommendation: 'Tag as Remnant' | 'Treat as Scrap';
    usedCount: number;
    scrappedCount: number;
    avgDaysBeforeScrap: number;
  } => {
    const history: RemnantHistoryEntry[] = safeParse(KEYS.REMNANT_HISTORY)
      .filter((h: RemnantHistoryEntry) =>
        h.company === company &&
        h.thickness === thickness &&
        Math.abs(h.sqft - sqft) <= 2 // within 2 sqft range
      );
    const used     = history.filter(h => h.outcome === 'Used');
    const scrapped = history.filter(h => h.outcome === 'Scrapped');
    const avgDays  = scrapped.length > 0
      ? scrapped.reduce((s, h) => s + h.daysInStock, 0) / scrapped.length
      : 0;
    const scrapRate = history.length > 0 ? scrapped.length / history.length : 0;
    return {
      recommendation: scrapRate > 0.7 ? 'Treat as Scrap' : 'Tag as Remnant',
      usedCount:    used.length,
      scrappedCount: scrapped.length,
      avgDaysBeforeScrap: Math.round(avgDays),
    };
  },

  // ── Cutting Sessions (Phase 1) ────────────────────────────────────
  getCuttingSessions: (): CuttingSession[] => safeParse(KEYS.CUTTING_SESSIONS),
  getCuttingSessionsByJob: (jobOrderId: string): CuttingSession[] =>
    safeParse(KEYS.CUTTING_SESSIONS).filter((s: CuttingSession) => s.jobOrderId === jobOrderId),
  saveCuttingSessions: (data: CuttingSession[]) => { safeSave(KEYS.CUTTING_SESSIONS, data); _sbSync('cutting_sessions', data); },
  upsertCuttingSession: (session: CuttingSession) => {
    const all: CuttingSession[] = safeParse(KEYS.CUTTING_SESSIONS);
    const idx = all.findIndex(s => s.id === session.id);
    if (idx !== -1) all[idx] = session; else all.push(session);
    safeSave(KEYS.CUTTING_SESSIONS, all);
  },

  // ── Manual Count Sheets (Phase 1) ─────────────────────────────────
  getManualCountSheets: (): ManualCountSheet[] => safeParse(KEYS.MANUAL_COUNT_SHEETS),
  saveManualCountSheets: (data: ManualCountSheet[]) => { safeSave(KEYS.MANUAL_COUNT_SHEETS, data); _sbSync('manual_count_sheets', data); },
  upsertManualCountSheet: (sheet: ManualCountSheet) => {
    const all: ManualCountSheet[] = safeParse(KEYS.MANUAL_COUNT_SHEETS);
    const idx = all.findIndex(s => s.id === sheet.id);
    if (idx !== -1) all[idx] = sheet; else all.push(sheet);
    safeSave(KEYS.MANUAL_COUNT_SHEETS, all);
  },

  // ── Scrap Disposals (Phase 1) ─────────────────────────────────────
  getScrapDisposals: (): ScrapDisposal[] => safeParse(KEYS.SCRAP_DISPOSALS),
  getScrapDisposalsByCompany: (company: string): ScrapDisposal[] =>
    safeParse(KEYS.SCRAP_DISPOSALS).filter((d: ScrapDisposal) => d.company === company),
  saveScrapDisposals: (data: ScrapDisposal[]) => { safeSave(KEYS.SCRAP_DISPOSALS, data); _sbSync('scrap_disposals', data); },
  upsertScrapDisposal: (disposal: ScrapDisposal) => {
    const all: ScrapDisposal[] = safeParse(KEYS.SCRAP_DISPOSALS);
    const idx = all.findIndex(d => d.id === disposal.id);
    if (idx !== -1) all[idx] = disposal; else all.push(disposal);
    safeSave(KEYS.SCRAP_DISPOSALS, all);
  },

  // ── Vendor Reviews (Phase 1) ──────────────────────────────────────
  getVendorReviews: (): VendorReview[] => safeParse(KEYS.VENDOR_REVIEWS),
  getVendorReviewsByVendor: (vendorId: string): VendorReview[] =>
    safeParse(KEYS.VENDOR_REVIEWS).filter((r: VendorReview) => r.vendorId === vendorId),
  saveVendorReviews: (data: VendorReview[]) => { safeSave(KEYS.VENDOR_REVIEWS, data); _sbSync('vendor_reviews', data); },
  upsertVendorReview: (review: VendorReview) => {
    const all: VendorReview[] = safeParse(KEYS.VENDOR_REVIEWS);
    const idx = all.findIndex(r => r.id === review.id);
    if (idx !== -1) all[idx] = review; else all.push(review);
    safeSave(KEYS.VENDOR_REVIEWS, all);
  },

  // ── Low Stock Check (Phase 1) ─────────────────────────────────────
  getLowStockItems: (company: string): {
    item: StoreItem;
    alertLevel: 'red' | 'orange';
    unrestrictedQty: number;
    withDefectiveQty: number;
    reorderPoint: number;
  }[] => {
    const store = safeParse(KEYS.STORE).filter((s: StoreItem) => s.company === company);
    return store
      .filter((s: StoreItem) => s.reorderPoint > 0)
      .map((s: StoreItem) => {
        const defUsable = s.defectiveSqft || 0;
        const unr = s.unrestrictedQty;
        const withDef = unr + defUsable;
        return {
          item: s,
          alertLevel: unr < s.reorderPoint ? 'red' : withDef < s.reorderPoint ? 'orange' : null,
          unrestrictedQty: unr,
          withDefectiveQty: withDef,
          reorderPoint: s.reorderPoint,
        };
      })
      .filter(x => x.alertLevel !== null) as any[];
  },

  // ── Vendor Performance (computed) ─────────────────────────────────
  getVendorPerformance: (company: string, vendorId: string): {
    totalGRNs: number;
    totalSqft: number;
    defectiveSqft: number;
    brokenSqft: number;
    defectRatePct: number;
    totalAdjustmentPKR: number;
    avgDeliveryDays: number;
    outstandingGRIR: number;
  } => {
    const ledger: MaterialLedgerEntry[] = safeParse(KEYS.STOCK_LEDGER)
      .filter((e: MaterialLedgerEntry) => e.company === company && e.vendorId === vendorId && e.mvmntCode === '101');
    const sheets: GRNSheetEntry[] = safeParse(KEYS.GRN_SHEET_ENTRIES)
      .filter((e: GRNSheetEntry) => e.company === company);
    const reports: VendorDefectReport[] = safeParse(KEYS.VENDOR_DEFECT_REPORTS)
      .filter((r: VendorDefectReport) => r.company === company && r.vendorId === vendorId);

    const grnIds = new Set(ledger.map(e => e.referenceDoc));
    const totalSqft = ledger.reduce((s, e) => s + e.qty, 0);

    const vendorSheets = sheets.filter(s => grnIds.has(s.grnId));
    const defectiveSqft = vendorSheets
      .filter(s => s.status === 'Defective')
      .reduce((sum, s) => sum + (s.usableSqft || 0), 0);
    const brokenSqft = vendorSheets
      .filter(s => s.status === 'Broken')
      .reduce((sum, s) => sum + (s.usableSqft || 0), 0);

    const totalAdjustment = reports.reduce((s, r) => s + r.totalAdjustment, 0);

    return {
      totalGRNs: grnIds.size,
      totalSqft,
      defectiveSqft,
      brokenSqft,
      defectRatePct: totalSqft > 0
        ? Number(((defectiveSqft + brokenSqft) / totalSqft * 100).toFixed(2))
        : 0,
      totalAdjustmentPKR: totalAdjustment,
      avgDeliveryDays: 0,    // calculated when PO dates linked — Phase 2
      outstandingGRIR: 0,    // from GL — Phase 9
    };
  },

  // ── Pallet Rate History ───────────────────────────────────────────
  getPalletRates: (): PalletRateEntry[] => safeParse(KEYS.PALLET_RATES),
  getPalletRatesByCompany: (company: string): PalletRateEntry[] =>
    safeParse(KEYS.PALLET_RATES).filter((r: PalletRateEntry) => r.company === company),
  getRecentPalletRates: (company: string, limit = 5): PalletRateEntry[] =>
    safeParse(KEYS.PALLET_RATES)
      .filter((r: PalletRateEntry) => r.company === company)
      .sort((a: PalletRateEntry, b: PalletRateEntry) => b.date.localeCompare(a.date))
      .slice(0, limit),
  savePalletRates: (data: PalletRateEntry[]) => { safeSave(KEYS.PALLET_RATES, data); _sbSync('pallet_rates', data); },
  addPalletRate: (entry: PalletRateEntry) => {
    const all: PalletRateEntry[] = safeParse(KEYS.PALLET_RATES);
    all.push(entry);
    safeSave(KEYS.PALLET_RATES, all);
  },

  // ── Weight Master ─────────────────────────────────────────────
  getWeightMaster: (): WeightMasterEntry[] => safeParse(KEYS.WEIGHT_MASTER),
  getWeightByCompany: (company: string): WeightMasterEntry[] =>
    safeParse(KEYS.WEIGHT_MASTER).filter((w: WeightMasterEntry) => w.company === company),
  getWeightByProduct: (company: string, productId: string): WeightMasterEntry[] =>
    safeParse(KEYS.WEIGHT_MASTER)
      .filter((w: WeightMasterEntry) => w.company === company && w.productId === productId)
      .sort((a: WeightMasterEntry, b: WeightMasterEntry) => b.date.localeCompare(a.date)),
  getLatestWeight: (company: string, productId: string): WeightMasterEntry | undefined =>
    safeParse(KEYS.WEIGHT_MASTER)
      .filter((w: WeightMasterEntry) => w.company === company && w.productId === productId)
      .sort((a: WeightMasterEntry, b: WeightMasterEntry) => b.date.localeCompare(a.date))[0],
  saveWeightMaster: (data: WeightMasterEntry[]) => { safeSave(KEYS.WEIGHT_MASTER, data); _sbSync('weight_master', data); },
  addWeightEntry: (entry: WeightMasterEntry) => {
    const all: WeightMasterEntry[] = safeParse(KEYS.WEIGHT_MASTER);
    all.push(entry);
    safeSave(KEYS.WEIGHT_MASTER, all);
  },
  deleteWeightEntry: (id: string) => {
    const all: WeightMasterEntry[] = safeParse(KEYS.WEIGHT_MASTER).filter((w: WeightMasterEntry) => w.id !== id);
    safeSave(KEYS.WEIGHT_MASTER, all);
  },

  // ── Stock Locations ───────────────────────────────────────────────────
  getStockLocations: (company?: string): StockLocation[] => {
    const all: StockLocation[] = safeParse(KEYS.STOCK_LOCATIONS);
    return company ? all.filter(l => l.company === company && l.isActive) : all;
  },
  saveStockLocations: (data: StockLocation[]) => { safeSave(KEYS.STOCK_LOCATIONS, data); _sbSync('stock_locations', data); },
  addStockLocation: (company: string, code: string, description?: string, zone?: string): StockLocation => {
    const all: StockLocation[] = safeParse(KEYS.STOCK_LOCATIONS);
    const existing = all.find(l => l.company === company && l.code.toUpperCase() === code.toUpperCase());
    if (existing) return existing;
    const loc: StockLocation = {
      id: `LOC-${Date.now().toString().slice(-6)}`,
      company: company as any,
      code: code.toUpperCase(),
      description: description || '',
      zone: zone || '',
      isActive: true,
    };
    all.push(loc);
    safeSave(KEYS.STOCK_LOCATIONS, all);
    return loc;
  },
  /** Ensure a location code exists — auto-creates if new */
  ensureLocation: (company: string, code: string): StockLocation => {
    if (!code || !code.trim()) return { id: '', company: company as any, code: '', isActive: true };
    return InventoryService.addStockLocation(company, code.trim());
  },
};
