import { StoreItem, MaterialLedgerEntry, InspectionLot, Remnant, HandlingUnit, Requisition, PurchaseOrder } from '@/modules/procurement/types/inventory';
import { initDB } from '@/modules/shared/services/db';

const KEYS = {
  STORE: 'gtk_erp_store',
  STOCK_LEDGER: 'gtk_erp_stock_ledger',
  INSPECTION_LOTS: 'gtk_erp_inspection_lots',
  REMNANTS: 'gtk_erp_remnants',
  HANDLING_UNITS: 'gtk_erp_handling_units',
  REQUISITIONS: 'gtk_erp_requisitions',
  PURCHASE_ORDERS: 'gtk_erp_purchase_orders',
};

import { bgSaveToIDB, safeParse } from '@/modules/shared/services/utils';

export const InventoryService = {
  getRequisitions: (): Requisition[] => safeParse(KEYS.REQUISITIONS),
  saveRequisitions: (data: Requisition[]) => localStorage.setItem(KEYS.REQUISITIONS, JSON.stringify(data)),
  getStore: (): StoreItem[] => safeParse(KEYS.STORE),
  saveStore: (data: StoreItem[]) => localStorage.setItem(KEYS.STORE, JSON.stringify(data)),
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
    localStorage.setItem(KEYS.STOCK_LEDGER, JSON.stringify(recent));
    bgSaveToIDB('stockLedger', data);
  },
  getInspectionLots: (): InspectionLot[] => safeParse(KEYS.INSPECTION_LOTS),
  saveInspectionLots: (data: InspectionLot[]) => localStorage.setItem(KEYS.INSPECTION_LOTS, JSON.stringify(data)),
  getRemnants: (): Remnant[] => safeParse(KEYS.REMNANTS),
  saveRemnants: (data: Remnant[]) => localStorage.setItem(KEYS.REMNANTS, JSON.stringify(data)),
  getHandlingUnits: (): HandlingUnit[] => safeParse(KEYS.HANDLING_UNITS),
  saveHandlingUnits: (data: HandlingUnit[]) => localStorage.setItem(KEYS.HANDLING_UNITS, JSON.stringify(data)),
  getPurchaseOrders: (): PurchaseOrder[] => safeParse(KEYS.PURCHASE_ORDERS),
  savePurchaseOrders: (data: PurchaseOrder[]) => localStorage.setItem(KEYS.PURCHASE_ORDERS, JSON.stringify(data)),
};
