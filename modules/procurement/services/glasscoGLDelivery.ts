// ============================================================================
// glasscoGLDelivery — delivery COGS GL + credit-note reversal
// Extracted verbatim from glasscoGLService.ts (H6 decomposition, behaviour-
// neutral). Re-exported from glasscoGLService.ts so external import paths are
// unchanged.
// ============================================================================
import { FinanceService } from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { Company } from '@/modules/shared/types/core';
import { glassAccounts, getPieceCostData, SERVICE_LABOR_RATES } from './glasscoGLHelpers';

// ══════════════════════════════════════════════════════════════════
// C. DELIVERY → Dr COGS / Cr Inventory  +  Dr Service COGS / Cr Accrued
//    Separate GL lines per cost type: raw glass, cutting, processing
// ══════════════════════════════════════════════════════════════════

/**
 * Sprint 1: when caller opts in to atomic mode, this returns the
 * ledger transaction + the inventory side-effect plan WITHOUT writing
 * anything. Caller (deliveryInvoiceService.generateDeliveryInvoiceAtomic)
 * bundles the ledger row into post_invoice_atomic, then applies the
 * inventory side-effects locally only after the RPC commits.
 */
export interface DeliveryCOGSPlan {
  ledgerTx: any;
  storeUpdates: Array<{ id: string; deduction: number }>;
  totalSqft: number;
  rawGlassCOGS: number;
  totalCuttingCost: number;
  totalProcessingCost: number;
  alreadyPosted: boolean;
}

export function buildDeliveryCOGSPlan(params: {
  company: Company;
  invoiceId: string;
  orderId: string;
  pieceIds: string[];
  date: string;
  clientName: string;
}): DeliveryCOGSPlan | null {
  const { company, invoiceId, orderId, pieceIds, date, clientName } = params;
  const accs = glassAccounts(company);
  const ledger = FinanceService.getLedger();
  const txId = `GL-COGS-${invoiceId}`;
  if (ledger.some((t: any) => t.id === txId)) {
    return { ledgerTx: null, storeUpdates: [], totalSqft: 0,
      rawGlassCOGS: 0, totalCuttingCost: 0, totalProcessingCost: 0,
      alreadyPosted: true };
  }

  const pieces = ProductionService.getProductionPieces()
    .filter((p: any) => pieceIds.includes(p.id));
  if (pieces.length === 0) return null;

  let rawGlassCOGS = 0;
  let totalSqft = 0;
  const materialDeductions: Record<string, number> = {};

  pieces.forEach((piece: any) => {
    const { sqft, materialId, map, totalCost } = getPieceCostData(piece, company);
    if (sqft <= 0 || map <= 0) return;
    rawGlassCOGS += totalCost;
    totalSqft    += sqft;
    if (materialId) {
      materialDeductions[materialId] = (materialDeductions[materialId] || 0) + totalCost;
    }
  });

  const cuttingLabor: { nick: string; sqft: number; cost: number }[]    = [];
  const processingLabor: { nick: string; sqft: number; cost: number }[] = [];
  const CUTTING_SERVICES = new Set(['Cutting', 'Cut']);
  const CUTTING_NICKS    = new Set(['cutting', 'cut']);

  pieces.forEach((piece: any) => {
    (piece.serviceLog || []).forEach((log: any) => {
      const sqftLog = log.sqft || 0;
      const rate    = log.costRatePerSqft || SERVICE_LABOR_RATES[log.serviceNick] || 0;
      const cost    = log.totalCost > 0 ? log.totalCost : Math.round(sqftLog * rate);
      if (cost <= 0) return;
      const nick = log.serviceNick || '';
      if (CUTTING_SERVICES.has(nick) || CUTTING_NICKS.has(nick.toLowerCase())) {
        cuttingLabor.push({ nick, sqft: sqftLog, cost });
      } else {
        processingLabor.push({ nick, sqft: sqftLog, cost });
      }
    });
  });

  const totalCuttingCost    = cuttingLabor.reduce((s, l) => s + l.cost, 0);
  const totalProcessingCost = processingLabor.reduce((s, l) => s + l.cost, 0);

  if (rawGlassCOGS <= 0 && totalCuttingCost <= 0 && totalProcessingCost <= 0) return null;

  const glDetails: any[] = [];
  if (rawGlassCOGS > 0) {
    glDetails.push({ accountId: accs.cogsGlass.id, debit: rawGlassCOGS, credit: 0,
      text: `Raw glass COGS: ${pieces.length} pcs, ${totalSqft.toFixed(1)} sqft @ avg MAP PKR ${totalSqft > 0 ? (rawGlassCOGS / totalSqft).toFixed(0) : 0}/sqft` });
    glDetails.push({ accountId: accs.glassInv.id, debit: 0, credit: rawGlassCOGS,
      text: `Inventory relief: ${orderId} → ${clientName}` });
  }
  if (totalCuttingCost > 0) {
    const cuttingSqft = cuttingLabor.reduce((s, l) => s + l.sqft, 0);
    glDetails.push({ accountId: accs.cogsCutting.id, debit: totalCuttingCost, credit: 0,
      text: `Cutting labour → COGS: ${cuttingSqft.toFixed(1)} sqft @ PKR ${cuttingSqft > 0 ? (totalCuttingCost / cuttingSqft).toFixed(0) : 0}/sqft` });
    glDetails.push({ accountId: accs.wipLabour.id, debit: 0, credit: totalCuttingCost,
      text: `WIP-Labour closed (cutting): ${orderId}` });
  }
  if (totalProcessingCost > 0) {
    const byNick: Record<string, number> = {};
    processingLabor.forEach(l => { byNick[l.nick] = (byNick[l.nick] || 0) + l.cost; });
    const nickSummary = Object.entries(byNick).map(([k, v]) => `${k}=PKR ${v.toLocaleString()}`).join(', ');
    const procSqft = processingLabor.reduce((s, l) => s + l.sqft, 0);
    glDetails.push({ accountId: accs.cogsProcess.id, debit: totalProcessingCost, credit: 0,
      text: `Processing labour → COGS: ${nickSummary} | ${procSqft.toFixed(1)} sqft` });
    glDetails.push({ accountId: accs.wipLabour.id, debit: 0, credit: totalProcessingCost,
      text: `WIP-Labour closed (processing): ${orderId}` });
  }

  const ledgerTx = {
    id: txId, company, docType: 'SA',
    docDate: date, date,
    description: `COGS: ${orderId} → ${clientName} — ${totalSqft.toFixed(1)} sqft | Glass PKR ${rawGlassCOGS.toLocaleString()} | Labour PKR ${(totalCuttingCost + totalProcessingCost).toLocaleString()}`,
    referenceId: invoiceId, status: 'Posted' as const,
    createdBy: 'system-auto',
    details: glDetails,
  };

  const storeUpdates = Object.entries(materialDeductions)
    .map(([id, deduction]) => ({ id, deduction }));

  return { ledgerTx, storeUpdates, totalSqft, rawGlassCOGS,
    totalCuttingCost, totalProcessingCost, alreadyPosted: false };
}

export function applyDeliveryCOGSStoreUpdates(
  company: Company,
  storeUpdates: Array<{ id: string; deduction: number }>,
  date: string,
): void {
  if (storeUpdates.length === 0) return;
  const store = InventoryService.getStore();
  const updateMap = new Map(storeUpdates.map(u => [u.id, u.deduction]));
  const newStore = store.map((item: any) => {
    if (item.company !== company) return item;
    const deduction = updateMap.get(item.id) || 0;
    if (deduction === 0) return item;
    return { ...item, totalValue: Math.max(0, (item.totalValue || 0) - deduction), lastMovementDate: date };
  });
  InventoryService.saveStore(newStore);
}

export function postDeliveryCOGS(params: {
  company: Company;
  invoiceId: string;
  orderId: string;
  pieceIds: string[];
  date: string;
  clientName: string;
}): void {
  const { company, invoiceId, orderId, pieceIds, date, clientName } = params;
  const accs = glassAccounts(company);
  const ledger = FinanceService.getLedger();
  const txId = `GL-COGS-${invoiceId}`;
  if (ledger.some((t: any) => t.id === txId)) return;

  const pieces = ProductionService.getProductionPieces()
    .filter((p: any) => pieceIds.includes(p.id));
  if (pieces.length === 0) return;

  // ── 1. Raw Glass COGS (MAP × sqft) ───────────────────────────────
  let rawGlassCOGS = 0;
  let totalSqft    = 0;
  const materialDeductions: Record<string, number> = {};

  pieces.forEach((piece: any) => {
    const { sqft, materialId, map, totalCost } = getPieceCostData(piece, company);
    if (sqft <= 0 || map <= 0) return;
    rawGlassCOGS += totalCost;
    totalSqft    += sqft;
    if (materialId) {
      materialDeductions[materialId] = (materialDeductions[materialId] || 0) + totalCost;
    }
  });

  // ── 2. Service Labor COGS (from serviceLog on each piece) ────────
  // Bucket: Cutting (51311) vs Processing — Polish/Grind/Notch/Holes (51312)
  const cuttingLabor: { nick: string; sqft: number; cost: number }[]    = [];
  const processingLabor: { nick: string; sqft: number; cost: number }[] = [];

  const CUTTING_SERVICES  = new Set(['Cutting', 'Cut']);
  const CUTTING_NICKS     = new Set(['cutting', 'cut']);

  pieces.forEach((piece: any) => {
    (piece.serviceLog || []).forEach((log: any) => {
      const sqftLog = log.sqft || 0;
      const rate    = log.costRatePerSqft || SERVICE_LABOR_RATES[log.serviceNick] || 0;
      const cost    = log.totalCost > 0 ? log.totalCost : Math.round(sqftLog * rate);
      if (cost <= 0) return;

      const nick = log.serviceNick || '';
      if (CUTTING_SERVICES.has(nick) || CUTTING_NICKS.has(nick.toLowerCase())) {
        cuttingLabor.push({ nick, sqft: sqftLog, cost });
      } else {
        processingLabor.push({ nick, sqft: sqftLog, cost });
      }
    });
  });

  const totalCuttingCost    = cuttingLabor.reduce((s, l) => s + l.cost, 0);
  const totalProcessingCost = processingLabor.reduce((s, l) => s + l.cost, 0);

  // ── 3. Compute updated store inventory value (do NOT save yet) ────
  // build the new store state here but defer the write until AFTER
  // the GL posts successfully. Previously saveStore ran before
  // recordTransaction, so a GL failure (imbalance / period lock / Supabase
  // error) left inventory decremented with no matching COGS entry — stock
  // and books diverged permanently with no rollback path.
  let newStore: any[] | null = null;
  if (rawGlassCOGS > 0) {
    const store = InventoryService.getStore();
    newStore = store.map((item: any) => {
      if (item.company !== company) return item;
      const deduction = materialDeductions[item.id] || 0;
      if (deduction === 0) return item;
      return { ...item, totalValue: Math.max(0, (item.totalValue || 0) - deduction), lastMovementDate: date };
    });
  }

  if (rawGlassCOGS <= 0 && totalCuttingCost <= 0 && totalProcessingCost <= 0) return;

  // ── 4. Build GL details — one line per cost type ─────────────────
  const glDetails: any[] = [];

  if (rawGlassCOGS > 0) {
    glDetails.push({
      accountId: accs.cogsGlass.id, debit: rawGlassCOGS, credit: 0,
      text: `Raw glass COGS: ${pieces.length} pcs, ${totalSqft.toFixed(1)} sqft @ avg MAP PKR ${totalSqft > 0 ? (rawGlassCOGS / totalSqft).toFixed(0) : 0}/sqft`,
    });
    glDetails.push({
      accountId: accs.glassInv.id, debit: 0, credit: rawGlassCOGS,
      text: `Inventory relief: ${orderId} → ${clientName}`,
    });
  }

  // ── Option B: Close WIP-Labour → COGS at delivery ────────────────
  //
  // At payroll time:  Dr 11514 WIP-Direct-Labour / Cr 21311 Salary Payable
  // At delivery here: Dr 51311/51312 COGS Labour  / Cr 11514 WIP-Direct-Labour
  //
  // This means labour hits the P&L ONLY ONCE — when the job is delivered,
  // not at payroll time. Balance in 11514 = labour cost of undelivered WIP.
  // 21121 Accrued Salaries no longer used for this flow.

  if (totalCuttingCost > 0) {
    const cuttingSqft = cuttingLabor.reduce((s, l) => s + l.sqft, 0);
    glDetails.push({
      accountId: accs.cogsCutting.id, debit: totalCuttingCost, credit: 0,
      text: `Cutting labour → COGS: ${cuttingSqft.toFixed(1)} sqft @ PKR ${cuttingSqft > 0 ? (totalCuttingCost / cuttingSqft).toFixed(0) : 0}/sqft`,
    });
    // Cr WIP-Labour (not Accrued) — closing the balance sheet WIP to P&L
    glDetails.push({
      accountId: accs.wipLabour.id, debit: 0, credit: totalCuttingCost,
      text: `WIP-Labour closed (cutting): ${orderId}`,
    });
  }

  if (totalProcessingCost > 0) {
    const byNick: Record<string, number> = {};
    processingLabor.forEach(l => { byNick[l.nick] = (byNick[l.nick] || 0) + l.cost; });
    const nickSummary = Object.entries(byNick).map(([k, v]) => `${k}=PKR ${v.toLocaleString()}`).join(', ');
    const procSqft    = processingLabor.reduce((s, l) => s + l.sqft, 0);

    glDetails.push({
      accountId: accs.cogsProcess.id, debit: totalProcessingCost, credit: 0,
      text: `Processing labour → COGS: ${nickSummary} | ${procSqft.toFixed(1)} sqft`,
    });
    // Cr WIP-Labour — same WIP pool, closing to P&L
    glDetails.push({
      accountId: accs.wipLabour.id, debit: 0, credit: totalProcessingCost,
      text: `WIP-Labour closed (processing): ${orderId}`,
    });
  }

  FinanceService.recordTransaction({
    id: txId, company, docType: 'SA',
    docDate: date, date,
    description: `COGS: ${orderId} → ${clientName} — ${totalSqft.toFixed(1)} sqft | Glass PKR ${rawGlassCOGS.toLocaleString()} | Labour PKR ${(totalCuttingCost + totalProcessingCost).toLocaleString()}`,
    // Phase-3 (3.4): COGS now Posts directly. Audit I4: previously 'Parked'
    // meant gross margin / P&L was wrong until a manual bulk-post happened.
    referenceId: invoiceId, status: 'Posted',
    details: glDetails,
  } as any);

  // GL committed successfully — only now apply the inventory deduction.
  // If recordTransaction above throws, this line never runs and stock stays
  // intact (commit-then-apply, matching the atomic buildDeliveryCOGSPlan path).
  if (newStore) InventoryService.saveStore(newStore);
}

// ── Convenience: check if COGS already posted for an invoice ──────
export function isCOGSPosted(invoiceId: string): boolean {
  return FinanceService.getLedger().some((t: any) => t.id === `GL-COGS-${invoiceId}`);
}

// ══════════════════════════════════════════════════════════════════
// D. CREDIT NOTE / VOID  →  Reverse delivery COGS proportionally
//
// Phase-3 (3.6): when a credit note is issued OR an invoice is voided,
// the original COGS posted at delivery time must be reversed in step
// with the revenue reversal so gross margin is not overstated.
//
// Behaviour:
//   • Looks up the original `GL-COGS-${invoiceId}` ledger entry.
//   • Creates a reversing GL transaction with debits/credits swapped
//     and scaled by the reversal proportion (CN amount / invoice
//     grand total), so a 30% credit note reverses 30% of COGS.
//   • Restores the inventory store value proportionally for the
//     materials that were deducted at delivery.
//   • Idempotent: if a reversal entry for the same (invoice, txn)
//     already exists, no-op.
//
// Inventory restoration:
//   The original delivery deducted store.totalValue by `rawGlassCOGS`.
//   We reverse the inventory portion proportionally — the GL entry's
//   credit-Inventory line indicates how much value was relieved, and
//   we add back `proportion × that value` to the store item.
// ══════════════════════════════════════════════════════════════════

export function reverseDeliveryCOGS(params: {
  company: Company;
  invoiceId: string;
  reversalAmount: number;     // CN amount or full invoice for void
  invoiceGrandTotal: number;  // denominator for proportion
  date: string;
  reason: string;             // 'Credit Note CN-xxx' / 'Void INV-xxx'
  reversalSuffix?: string;    // unique suffix to allow multiple partial CNs
}): void {
  const { company, invoiceId, reversalAmount, invoiceGrandTotal, date, reason, reversalSuffix } = params;
  if (reversalAmount <= 0 || invoiceGrandTotal <= 0) return;

  const cogsTxId     = `GL-COGS-${invoiceId}`;
  const reversalTxId = `GL-COGS-REV-${invoiceId}-${reversalSuffix || Date.now()}`;
  const ledger       = FinanceService.getLedger();
  const cogsTx: any  = ledger.find((t: any) => t.id === cogsTxId);
  if (!cogsTx) {
    console.warn(`[reverseDeliveryCOGS] No COGS entry found for ${invoiceId} — nothing to reverse.`);
    return;
  }
  if (ledger.some((t: any) => t.id === reversalTxId)) return; // idempotent

  const proportion = Math.min(1, Math.max(0, reversalAmount / invoiceGrandTotal));
  if (proportion <= 0) return;

  // Build reversing details: swap debit ↔ credit and scale by proportion.
  // Each Math.round preserves PKR-precision; tiny rounding is acceptable.
  const reversingDetails = (cogsTx.details || []).map((d: any) => ({
    accountId: d.accountId,
    debit:  Math.round((Number(d.credit) || 0) * proportion),
    credit: Math.round((Number(d.debit)  || 0) * proportion),
    text:   `REVERSAL (${reason}): ${d.text}`,
  })).filter((d: any) => d.debit > 0 || d.credit > 0);

  if (reversingDetails.length === 0) return;

  FinanceService.recordTransaction({
    id: reversalTxId, company, docType: 'SA',
    docDate: date, date,
    description: `COGS REVERSAL (${reason}): invoice ${invoiceId} — ${(proportion * 100).toFixed(1)}% (PKR ${reversalAmount.toLocaleString('en-PK')})`,
    referenceId: invoiceId, status: 'Posted',
    details: reversingDetails,
  } as any);

  // ── Inventory restoration ──
  // The original delivery deducted store.totalValue by rawGlassCOGS for
  // each contributing material. We can't recover the per-material split
  // without the original `materialDeductions` map, so we use the GL line
  // to identify the credit-Inventory amount and restore proportionally
  // across raw store items (totalValue weighted).
  try {
    const accs = glassAccounts(company);
    const invCreditLine = (cogsTx.details || []).find(
      (d: any) => d.accountId === accs.glassInv.id && (Number(d.credit) || 0) > 0
    );
    const inventoryRelieved = Number(invCreditLine?.credit) || 0;
    const restoreAmount     = Math.round(inventoryRelieved * proportion);
    if (restoreAmount > 0) {
      const store    = InventoryService.getStore();
      const rawItems = store.filter((s: any) => s.company === company && s.category === 'Raw');
      const totalRawValue = rawItems.reduce((sum: number, s: any) => sum + (Number(s.totalValue) || 0), 0);
      // Weighted distribution; if total is zero, dump on the first raw item.
      const updated = store.map((item: any) => {
        if (item.company !== company || item.category !== 'Raw') return item;
        let share = 0;
        if (totalRawValue > 0) {
          share = Math.round(((Number(item.totalValue) || 0) / totalRawValue) * restoreAmount);
        } else if (rawItems[0]?.id === item.id) {
          share = restoreAmount;
        }
        if (share === 0) return item;
        return {
          ...item,
          totalValue: (Number(item.totalValue) || 0) + share,
          lastMovementDate: date,
        };
      });
      InventoryService.saveStore(updated);
    }
  } catch (err: any) {
    console.warn('[reverseDeliveryCOGS] inventory restoration skipped:', err?.message);
  }
}
