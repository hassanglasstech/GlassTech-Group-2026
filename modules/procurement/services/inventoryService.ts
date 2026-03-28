import {
  StoreItem, MaterialLedgerEntry, InspectionLot, Remnant, RemnantHistoryEntry,
  HandlingUnit, Requisition, PurchaseOrder, Vehicle, VehicleTrip, VehicleExpense,
  GRNSheetEntry, VendorDefectReport, CuttingSession, ManualCountSheet,
  ScrapDisposal, VendorReview,
} from '@/modules/procurement/types/inventory';
import { initDB } from '@/modules/shared/services/db';
import { bgSaveToIDB, safeParse, safeSave } from '@/modules/shared/services/utils';

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
};

export const InventoryService = {
  // ── Store ──────────────────────────────────────────────────────────
  getStore: (): StoreItem[] => safeParse(KEYS.STORE),
  saveStore: (data: StoreItem[]) => safeSave(KEYS.STORE, data),

  // ── Stock Ledger ───────────────────────────────────────────────────
  getStockLedger: (): MaterialLedgerEntry[] => safeParse(KEYS.STOCK_LEDGER),
  getStockLedgerAsync: async (): Promise<MaterialLedgerEntry[]> => {
    try {
      const db = await initDB();
      const items = await db.getAll('stockLedger');
      if (items.length === 0) {
        const lsItems = safeParse(KEYS.STOCK_LEDGER);
        if (lsItems.length > 0) { await bgSaveToIDB('stockLedger', lsItems); return lsItems; }
      }
      return items;
    } catch (e) {
      console.error('IDB Read Error', e);
      return safeParse(KEYS.STOCK_LEDGER);
    }
  },
  saveStockLedger: (data: MaterialLedgerEntry[]) => {
    const recent = data.slice(-1000);
    safeSave(KEYS.STOCK_LEDGER, recent);
    bgSaveToIDB('stockLedger', data);
  },

  // ── Requisitions ───────────────────────────────────────────────────
  getRequisitions: (): Requisition[] => safeParse(KEYS.REQUISITIONS),
  saveRequisitions: (data: Requisition[]) => safeSave(KEYS.REQUISITIONS, data),

  // ── Purchase Orders ────────────────────────────────────────────────
  getPurchaseOrders: (): PurchaseOrder[] => safeParse(KEYS.PURCHASE_ORDERS),
  savePurchaseOrders: (data: PurchaseOrder[]) => safeSave(KEYS.PURCHASE_ORDERS, data),

  // ── Inspection Lots ────────────────────────────────────────────────
  getInspectionLots: (): InspectionLot[] => safeParse(KEYS.INSPECTION_LOTS),
  saveInspectionLots: (data: InspectionLot[]) => safeSave(KEYS.INSPECTION_LOTS, data),

  // ── Handling Units ─────────────────────────────────────────────────
  getHandlingUnits: (): HandlingUnit[] => safeParse(KEYS.HANDLING_UNITS),
  saveHandlingUnits: (data: HandlingUnit[]) => safeSave(KEYS.HANDLING_UNITS, data),

  // ── Vehicle Fleet ──────────────────────────────────────────────────
  getVehicles: (): Vehicle[] => safeParse(KEYS.VEHICLES),
  saveVehicles: (data: Vehicle[]) => safeSave(KEYS.VEHICLES, data),
  getVehicleTrips: (): VehicleTrip[] => safeParse(KEYS.VEHICLE_TRIPS),
  saveVehicleTrips: (data: VehicleTrip[]) => safeSave(KEYS.VEHICLE_TRIPS, data),
  getVehicleExpenses: (): VehicleExpense[] => safeParse(KEYS.VEHICLE_EXPENSES),
  saveVehicleExpenses: (data: VehicleExpense[]) => safeSave(KEYS.VEHICLE_EXPENSES, data),

  // ── GRN Sheet Entries (Phase 1) ────────────────────────────────────
  getGRNSheetEntries: (): GRNSheetEntry[] => safeParse(KEYS.GRN_SHEET_ENTRIES),
  getGRNSheetEntriesByGRN: (grnId: string): GRNSheetEntry[] =>
    safeParse(KEYS.GRN_SHEET_ENTRIES).filter((e: GRNSheetEntry) => e.grnId === grnId),
  getGRNSheetEntryByTag: (tagId: string): GRNSheetEntry | undefined =>
    safeParse(KEYS.GRN_SHEET_ENTRIES).find((e: GRNSheetEntry) => e.tagId === tagId),
  saveGRNSheetEntries: (data: GRNSheetEntry[]) => safeSave(KEYS.GRN_SHEET_ENTRIES, data),
  upsertGRNSheetEntry: (entry: GRNSheetEntry) => {
    const all: GRNSheetEntry[] = safeParse(KEYS.GRN_SHEET_ENTRIES);
    const idx = all.findIndex(e => e.id === entry.id);
    if (idx !== -1) all[idx] = entry; else all.push(entry);
    safeSave(KEYS.GRN_SHEET_ENTRIES, all);
  },

  // ── Vendor Defect Reports (Phase 1) ───────────────────────────────
  getVendorDefectReports: (): VendorDefectReport[] => safeParse(KEYS.VENDOR_DEFECT_REPORTS),
  getVendorDefectReportsByGRN: (grnId: string): VendorDefectReport[] =>
    safeParse(KEYS.VENDOR_DEFECT_REPORTS).filter((r: VendorDefectReport) => r.grnId === grnId),
  saveVendorDefectReports: (data: VendorDefectReport[]) => safeSave(KEYS.VENDOR_DEFECT_REPORTS, data),
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
  saveRemnants: (data: Remnant[]) => safeSave(KEYS.REMNANTS, data),
  upsertRemnant: (remnant: Remnant) => {
    const all: Remnant[] = safeParse(KEYS.REMNANTS);
    const idx = all.findIndex(r => r.id === remnant.id);
    if (idx !== -1) all[idx] = remnant; else all.push(remnant);
    safeSave(KEYS.REMNANTS, all);
  },

  // ── Remnant History (Phase 1) ─────────────────────────────────────
  getRemnantHistory: (): RemnantHistoryEntry[] => safeParse(KEYS.REMNANT_HISTORY),
  saveRemnantHistory: (data: RemnantHistoryEntry[]) => safeSave(KEYS.REMNANT_HISTORY, data),
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
  saveCuttingSessions: (data: CuttingSession[]) => safeSave(KEYS.CUTTING_SESSIONS, data),
  upsertCuttingSession: (session: CuttingSession) => {
    const all: CuttingSession[] = safeParse(KEYS.CUTTING_SESSIONS);
    const idx = all.findIndex(s => s.id === session.id);
    if (idx !== -1) all[idx] = session; else all.push(session);
    safeSave(KEYS.CUTTING_SESSIONS, all);
  },

  // ── Manual Count Sheets (Phase 1) ─────────────────────────────────
  getManualCountSheets: (): ManualCountSheet[] => safeParse(KEYS.MANUAL_COUNT_SHEETS),
  saveManualCountSheets: (data: ManualCountSheet[]) => safeSave(KEYS.MANUAL_COUNT_SHEETS, data),
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
  saveScrapDisposals: (data: ScrapDisposal[]) => safeSave(KEYS.SCRAP_DISPOSALS, data),
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
  saveVendorReviews: (data: VendorReview[]) => safeSave(KEYS.VENDOR_REVIEWS, data),
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
};
