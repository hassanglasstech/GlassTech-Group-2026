// ═══════════════════════════════════════════════════════════════════
// GlassCo Production Decision Agent
// Domain-specific intelligence for glass manufacturing decisions:
// - Rush order priority scoring
// - Remnant utilization matching
// - Recut vs scrap cost-benefit
// - Team/cutter efficiency recommendations
// - Partial tempering batch decisions
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';
import { askClaude } from '@/modules/factory/services/claudeAgentService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';

// ── Types ────────────────────────────────────────────────────────────
export interface ProductionDecision {
  decision_id:      string;
  decision_type:    string;
  context:          Record<string, any>;
  decision:         string;
  reasoning:        string;
  conditions:       string[];
  confidence:       number;
  created_at:       string;
}

// ── Rush Order Priority ──────────────────────────────────────────────
export const assessRushOrder = async (orderId: string): Promise<ProductionDecision> => {
  const quotations = SalesService.getQuotations().filter((q: any) => q.company === 'Glassco');
  const order = quotations.find((q: any) => q.id === orderId);
  if (!order) return makeDecision('rush_order_priority', { orderId }, 'REJECT', 'Order not found', [], 0.50);

  // Client payment history — Quotation has clientId (not clientName); group by it
  const clientOrders = quotations.filter((q: any) => q.clientId === (order as any).clientId);
  const avgPayDays = clientOrders.length > 1
    ? clientOrders.reduce((s: number, q: any) => s + (q.paymentDays || 30), 0) / clientOrders.length
    : 30;

  // Order margin estimation — Quotation has no totalAmount field, derive from items
  const items = (order as any).items || [];
  const totalAmount = items.reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const totalSqft  = items.reduce((s: number, i: any) => s + (i.totalSqFt || 0), 0);

  // Current queue depth
  const pieces = ProductionService.getProductionPieces();
  const activePieces = pieces.filter(p => !['Delivered', 'Broken'].includes(p.status));
  const queueLength = activePieces.length;

  // Score: 0-100
  let score = 50;
  if (avgPayDays < 30) score += 15;  // Good payer
  if (avgPayDays > 60) score -= 20;  // Slow payer
  if (totalAmount > 100000) score += 10; // High value
  if (queueLength < 20) score += 10;    // Queue not heavy
  if (queueLength > 50) score -= 15;    // Queue overloaded

  const decision = score >= 60 ? 'APPROVE_PRIORITY' : 'NORMAL_QUEUE';
  const conditions: string[] = [];
  if (decision === 'APPROVE_PRIORITY') {
    if (avgPayDays > 45) conditions.push('50% advance required before cutting starts');
    conditions.push(`Insert at position ${Math.min(3, Math.ceil(queueLength * 0.2))} in queue`);
  }

  return makeDecision('rush_order_priority', {
    order_id: orderId,
    client: (order as any).clientId,
    total_amount: totalAmount,
    total_sqft: totalSqft,
    avg_pay_days: Math.round(avgPayDays),
    queue_length: queueLength,
    score,
  }, decision, score >= 60
    ? `Score ${score}/100: ${avgPayDays < 30 ? 'Good payer' : 'Acceptable'}, ${queueLength < 30 ? 'queue manageable' : 'queue heavy but order valuable'}`
    : `Score ${score}/100: ${avgPayDays > 60 ? 'Slow payer risk' : 'Normal payer'}, queue ${queueLength} deep`,
    conditions, Math.min(0.95, score / 100));
};

// ── Remnant Size Match ───────────────────────────────────────────────
export const matchRemnantToOrder = async (orderId: string): Promise<ProductionDecision> => {
  const remnants = JSON.parse(localStorage.getItem('gtk_erp_remnants') || '[]')
    .filter((r: any) => r.company === 'Glassco' && r.status === 'Available');

  const quotations = SalesService.getQuotations().filter((q: any) => q.company === 'Glassco');
  const order = quotations.find((q: any) => q.id === orderId);
  if (!order) return makeDecision('remnant_match', { orderId }, 'NO_MATCH', 'Order not found', [], 0.50);

  const matches: { remnant_id: string; thickness: string; sqft: number; fits_item: string }[] = [];

  for (const item of ((order as any).items || []) as any[]) {
    // QuotationItem has `glassSize` (e.g. "5mm"), not `thickness`
    const needed = { width: item.inchW || item.width, height: item.inchH || item.height, thickness: item.glassSize || '' };
    for (const rem of remnants) {
      if (rem.thickness !== needed.thickness) continue;
      const dims = rem.dimensions || {};
      const remW = dims.widthInch || 0;
      const remH = dims.heightInch || 0;
      if (remW >= needed.width && remH >= needed.height) {
        matches.push({ remnant_id: rem.id, thickness: rem.thickness, sqft: rem.sqft, fits_item: String(item.id || '') });
      }
    }
  }

  if (matches.length === 0) {
    return makeDecision('remnant_match', { orderId, remnants_checked: remnants.length }, 'NO_MATCH',
      `Checked ${remnants.length} remnants — no size matches for order items`, [], 0.80);
  }

  return makeDecision('remnant_match', {
    orderId, matches_found: matches.length, remnants_checked: remnants.length,
  }, 'MATCHES_FOUND',
    `Found ${matches.length} remnant(s) that can fulfill order items — saves new sheet cost`,
    matches.map(m => `Use ${m.remnant_id} (${m.thickness}, ${m.sqft} sqft)`),
    0.85);
};

// ── Recut vs Scrap Analysis ──────────────────────────────────────────
export const recutVsScrap = async (pieceId: string, estimatedValue: number): Promise<ProductionDecision> => {
  // Cost of recut: new material + labour (~30 min cutting + services)
  const recutLabourCost = 500;  // PKR estimate
  const materialWaste = estimatedValue * 0.10; // 10% extra material
  const totalRecutCost = recutLabourCost + materialWaste;

  // Scrap recovery: ~5 PKR/kg, typical piece ~2-5 kg
  const scrapRecovery = estimatedValue * 0.03; // ~3% scrap value

  const netSavingIfRecut = estimatedValue - totalRecutCost;
  const netLossIfScrap = estimatedValue - scrapRecovery;

  const shouldRecut = netSavingIfRecut > netLossIfScrap * 0.5;

  return makeDecision('recut_vs_scrap', {
    piece_id: pieceId,
    piece_value: estimatedValue,
    recut_cost: totalRecutCost,
    scrap_recovery: Math.round(scrapRecovery),
    net_saving_recut: Math.round(netSavingIfRecut),
    net_loss_scrap: Math.round(netLossIfScrap),
  }, shouldRecut ? 'RECUT' : 'SCRAP',
    shouldRecut
      ? `Recut saves PKR ${Math.round(netSavingIfRecut)} vs PKR ${Math.round(netLossIfScrap)} loss on scrap`
      : `Piece value too low for recut — scrap and recover PKR ${Math.round(scrapRecovery)}`,
    shouldRecut ? ['Schedule recut on next available table', 'Use same glass type/thickness'] : ['Log NCR as Dispose', 'Post GL write-off'],
    shouldRecut ? 0.78 : 0.82);
};

// ── Production KPIs ──────────────────────────────────────────────────
export const getProductionKPIs = () => {
  const pieces = ProductionService.getProductionPieces();
  const glassco = pieces.filter(p => /GLS/i.test(p.orderId || ''));
  const total = glassco.length || 1;
  const broken = glassco.filter(p => p.status === 'Broken').length;
  const delivered = glassco.filter(p => p.status === 'Delivered').length;
  const active = glassco.filter(p => !['Delivered', 'Broken'].includes(p.status)).length;
  const qcPassed = glassco.filter(p => p.status === 'QC-Passed' || p.status === 'Ready to Dispatch').length;

  const remnants = JSON.parse(localStorage.getItem('gtk_erp_remnants') || '[]')
    .filter((r: any) => r.company === 'Glassco');
  const availableRemnants = remnants.filter((r: any) => r.status === 'Available').length;
  const scrappedRemnants = remnants.filter((r: any) => r.status === 'Scrapped').length;

  return {
    breakageRate:       Math.round((broken / total) * 100 * 10) / 10,
    deliveryRate:       Math.round((delivered / total) * 100 * 10) / 10,
    activePieces:       active,
    qcPassedPending:    qcPassed,
    remnantUtilization: scrappedRemnants + availableRemnants > 0
      ? Math.round((scrappedRemnants / (scrappedRemnants + availableRemnants)) * 100)
      : 0,
    availableRemnants,
  };
};

// ── Helper ───────────────────────────────────────────────────────────
function makeDecision(
  type: string, context: Record<string, any>,
  decision: string, reasoning: string,
  conditions: string[], confidence: number
): ProductionDecision {
  return {
    decision_id:   `PDA-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    decision_type: type,
    context,
    decision,
    reasoning,
    conditions,
    confidence,
    created_at:    new Date().toISOString(),
  };
}
