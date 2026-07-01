// ============================================================================
// glasscoGLPiecePnL — per-piece Revenue / COGS / GP breakdown
// Extracted verbatim from glasscoGLService.ts (H6 decomposition, behaviour-
// neutral). Re-exported from glasscoGLService.ts so external import paths are
// unchanged.
// ============================================================================
import { ProductionService } from '@/modules/production/services/productionService';
import { Company } from '@/modules/shared/types/core';
import { getPieceCostData, SERVICE_LABOR_RATES } from './glasscoGLHelpers';
import { getProductionOverheadRate } from './glasscoGLOverhead';

// ══════════════════════════════════════════════════════════════════
// D. PIECE P&L — Revenue / COGS / GP breakdown for a single piece
// ══════════════════════════════════════════════════════════════════

export interface PiecePnL {
  pieceId:    string;
  specs:      string;
  sqft:       number;
  orderId:    string;
  month:      string;
  // Revenue
  totalRevenue:    number;  // sqft × pricePerUnit (from quotation item)
  revenuePerSqft:  number;
  // COGS breakdown
  rawGlassCost:    number;  // sqft × MAP             (Direct Material)
  temperingCost:   number;  // from TemperingDispatch  (External Service)
  serviceLaborCost: { serviceNick: string; workerName: string; sqft: number; cost: number }[];
  totalLaborCost:  number;  // cutting + processing   (Direct Labour)
  overheadCost:    number;  // sqft × monthly pool rate (Production Overhead — own + shared)
  overheadRate:    number;  // PKR/sqft used
  totalCOGS:       number;
  // P&L
  grossProfit:     number;
  gpPct:           number;
}

export async function getPiecePnL(pieceId: string, company: Company): Promise<PiecePnL | null> {
  const pieces = ProductionService.getProductionPieces();
  const piece  = pieces.find((p: any) => p.id === pieceId);
  if (!piece) return null;

  // ── Revenue from quotation item ────────────────────────────────
  const order = ProductionService.getJobOrders()
    .find((j: any) => j.orderNo === piece.orderId || j.id === piece.orderId);
  const item  = order ? (order.items || [])[piece.itemIndex] : null;

  const sqft         = item?.totalSqFt || piece.sqft || 0;
  const pricePerUnit = item?.pricePerUnit || 0;
  const totalRevenue = item ? (item.amount || sqft * pricePerUnit) : 0;
  const month        = ((piece as any).lastUpdated || new Date().toISOString()).slice(0, 7);

  // ── 1. Raw glass COGS (MAP × sqft) — Direct Material ──────────
  const { map, totalCost: rawGlassCost } = getPieceCostData(piece, company);

  // ── 2. Tempering cost (External Service) ──────────────────────
  let temperingCost = 0;
  try {
    const dispatches = ProductionService.getTemperingDispatches() || [];
    dispatches.forEach((d: any) => {
      if ((d.pieceIds || []).includes(pieceId) && d.company === company) {
        const n = (d.pieceIds || []).length;
        temperingCost += n > 0 ? (d.totalCharges || 0) / n : 0;
      }
    });
  } catch { /* offline */ }

  // ── 3. Service labour (Direct Labour — from serviceLog) ────────
  const serviceLaborCost = (piece.serviceLog || []).map((log: any) => {
    const rate = log.costRatePerSqft || SERVICE_LABOR_RATES[log.serviceNick] || 0;
    const cost = log.totalCost > 0 ? log.totalCost : Math.round((log.sqft || 0) * rate);
    return { serviceNick: log.serviceNick, workerName: log.workerName, sqft: log.sqft || 0, cost };
  });
  const totalLaborCost = serviceLaborCost.reduce((s: number, l: any) => s + l.cost, 0);

  // ── 4. Production Overhead (own + shared Factory) ─────────────
  // Overhead rate = total monthly production overhead / total sqft produced
  let overheadRate = 0;
  try {
    const ohRate = await getProductionOverheadRate(company, month);
    overheadRate = ohRate.overheadRatePerSqft;
  } catch { /* use 0 */ }
  const overheadCost = Math.round(sqft * overheadRate);

  const totalCOGS   = rawGlassCost + temperingCost + totalLaborCost + overheadCost;
  const grossProfit = totalRevenue - totalCOGS;
  const gpPct       = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100 * 10) / 10 : 0;

  return {
    pieceId, specs: piece.specs || '', sqft, orderId: piece.orderId, month,
    totalRevenue, revenuePerSqft: sqft > 0 ? Math.round(totalRevenue / sqft) : 0,
    rawGlassCost, temperingCost, serviceLaborCost, totalLaborCost,
    overheadCost, overheadRate,
    totalCOGS, grossProfit, gpPct,
  };
}
