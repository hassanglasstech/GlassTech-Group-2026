import { ProductionPiece, JobOrder, TemperingDispatch } from '../types/production';
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

import { bgSaveToIDB, safeParse } from '../../shared/services/utils';

export const ProductionService = {
  getProductionPiecesAsync: async (): Promise<ProductionPiece[]> => {
    try {
      const db = await initDB();
      const items = await db.getAll('productionPieces');
      if (items.length === 0) {
        const lsItems = safeParse(KEYS.PRODUCTION_PIECES);
        if (lsItems.length > 0) {
            await bgSaveToIDB('productionPieces', lsItems);
            return lsItems;
        }
      }
      return items;
    } catch (e) {
      console.error("IDB Read Error", e);
      return safeParse(KEYS.PRODUCTION_PIECES);
    }
  },
  getGatePasses: (): GatePass[] => safeParse(KEYS.GATE_PASS),
  saveGatePasses: (data: GatePass[]) => localStorage.setItem(KEYS.GATE_PASS, JSON.stringify(data)),
  getJobOrders: (): JobOrder[] => safeParse(KEYS.JOB_ORDERS),
  saveJobOrders: (data: JobOrder[]) => localStorage.setItem(KEYS.JOB_ORDERS, JSON.stringify(data)),
  getTargetCompanyJobOrders: (targetCompany: Company): JobOrder[] => {
      const all = safeParse(KEYS.QUOTATIONS);
      return all.filter((q: any) => q.company === targetCompany);
  },
  getPurchaseOrders: (): PurchaseOrder[] => safeParse(KEYS.PURCHASE_ORDERS),
  savePurchaseOrders: (data: PurchaseOrder[]) => localStorage.setItem(KEYS.PURCHASE_ORDERS, JSON.stringify(data)),
  getProductionPieces: (): ProductionPiece[] => safeParse(KEYS.PRODUCTION_PIECES),
  saveProductionPieces: (data: ProductionPiece[]) => {
    try {
        localStorage.setItem(KEYS.PRODUCTION_PIECES, JSON.stringify(data));
    } catch(e) {
        const active = data.filter(p => p.status !== 'Delivered' && p.status !== 'Broken');
        localStorage.setItem(KEYS.PRODUCTION_PIECES, JSON.stringify(active));
    }
    bgSaveToIDB('productionPieces', data);
  },
  getTemperingDispatches: (): TemperingDispatch[] => safeParse(KEYS.TEMPERING_DISPATCHES),
  saveTemperingDispatches: (data: TemperingDispatch[]) => localStorage.setItem(KEYS.TEMPERING_DISPATCHES, JSON.stringify(data)),
  getWarehouseSpots: (): WarehouseSpot[] => safeParse(KEYS.WAREHOUSE_SPOTS),
  saveWarehouseSpots: (data: WarehouseSpot[]) => localStorage.setItem(KEYS.WAREHOUSE_SPOTS, JSON.stringify(data)),
};