import { StoreItem, MaterialLedgerEntry, InspectionLot, Remnant, HandlingUnit, Requisition, PurchaseOrder, Vehicle, VehicleTrip, VehicleExpense } from '@/modules/procurement/types/inventory';
import { initDB } from '@/modules/shared/services/db';

const KEYS = {
  STORE: 'gtk_erp_store',
  STOCK_LEDGER: 'gtk_erp_stock_ledger',
  INSPECTION_LOTS: 'gtk_erp_inspection_lots',
  REMNANTS: 'gtk_erp_remnants',
  HANDLING_UNITS: 'gtk_erp_handling_units',
  REQUISITIONS: 'gtk_erp_requisitions',
  PURCHASE_ORDERS: 'gtk_erp_purchase_orders',
  VEHICLES: 'gtk_erp_vehicles',
  VEHICLE_TRIPS: 'gtk_erp_vehicle_trips',
  VEHICLE_EXPENSES: 'gtk_erp_vehicle_expenses',
};

import { bgSaveToIDB, safeParse, safeSave, safeAsync } from '@/modules/shared/services/utils';
import { toast } from 'sonner';

export const InventoryService = {
  getRequisitions: (): Requisition[] => safeParse(KEYS.REQUISITIONS),
  saveRequisitions: (data: Requisition[]) => safeSave(KEYS.REQUISITIONS, data),
  getStore: (): StoreItem[] => safeParse(KEYS.STORE),
  saveStore: (data: StoreItem[]) => safeSave(KEYS.STORE, data),
  getStockLedger: (): MaterialLedgerEntry[] => safeParse(KEYS.STOCK_LEDGER),
  getStockLedgerAsync: async (): Promise<MaterialLedgerEntry[]> => {
    try {
      const db = await initDB();
      const items = await db.getAll('stockLedger');
      if (items.length === 0) {
        const lsItems = safeParse(KEYS.STOCK_LEDGER);
        if (lsItems.length > 0) {
            await bgSaveToIDB('stockLedger', lsItems);
            return lsItems;
        }
      }
      return items;
    } catch (e) {
      console.error("IDB Read Error", e);
      return safeParse(KEYS.STOCK_LEDGER);
    }
  },
  saveStockLedger: (data: MaterialLedgerEntry[]) => {
    const recent = data.slice(-1000);
    safeSave(KEYS.STOCK_LEDGER, recent);
    bgSaveToIDB('stockLedger', data);
  },
  getInspectionLots: (): InspectionLot[] => safeParse(KEYS.INSPECTION_LOTS),
  saveInspectionLots: (data: InspectionLot[]) => safeSave(KEYS.INSPECTION_LOTS, data),
  getRemnants: (): Remnant[] => safeParse(KEYS.REMNANTS),
  saveRemnants: (data: Remnant[]) => safeSave(KEYS.REMNANTS, data),
  getHandlingUnits: (): HandlingUnit[] => safeParse(KEYS.HANDLING_UNITS),
  saveHandlingUnits: (data: HandlingUnit[]) => safeSave(KEYS.HANDLING_UNITS, data),
  getPurchaseOrders: (): PurchaseOrder[] => safeParse(KEYS.PURCHASE_ORDERS),
  savePurchaseOrders: (data: PurchaseOrder[]) => safeSave(KEYS.PURCHASE_ORDERS, data),

  // ── Vehicle Fleet ──
  getVehicles: (): Vehicle[] => safeParse(KEYS.VEHICLES),
  saveVehicles: (data: Vehicle[]) => safeSave(KEYS.VEHICLES, data),
  getVehicleTrips: (): VehicleTrip[] => safeParse(KEYS.VEHICLE_TRIPS),
  saveVehicleTrips: (data: VehicleTrip[]) => safeSave(KEYS.VEHICLE_TRIPS, data),
  getVehicleExpenses: (): VehicleExpense[] => safeParse(KEYS.VEHICLE_EXPENSES),
  saveVehicleExpenses: (data: VehicleExpense[]) => safeSave(KEYS.VEHICLE_EXPENSES, data),
};
