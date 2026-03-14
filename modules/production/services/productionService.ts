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

import { bgSaveToIDB, safeParse, safeSave, safeAsync } from '../../shared/services/utils';
import { toast } from 'sonner';

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
  saveProductionPieces: (data: ProductionPiece[]) => {
    try {
        safeSave(KEYS.PRODUCTION_PIECES, data);
    } catch(e) {
        const active = data.filter(p => p.status !== 'Delivered' && p.status !== 'Broken');
        safeSave(KEYS.PRODUCTION_PIECES, active);
    }
    bgSaveToIDB('productionPieces', data);
  },
  getTemperingDispatches: (): TemperingDispatch[] => safeParse(KEYS.TEMPERING_DISPATCHES),
  saveTemperingDispatches: (data: TemperingDispatch[]) => safeSave(KEYS.TEMPERING_DISPATCHES, data),
  getWarehouseSpots: (): WarehouseSpot[] => safeParse(KEYS.WAREHOUSE_SPOTS),
  saveWarehouseSpots: (data: WarehouseSpot[]) => safeSave(KEYS.WAREHOUSE_SPOTS, data),
};
