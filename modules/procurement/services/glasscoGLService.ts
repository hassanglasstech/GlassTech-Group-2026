/**
 * glasscoGLService.ts — Phase 1: Complete Costing GL
 *
 * Three new GL flows:
 * A. Cutting session close → Dr WIP / Cr Glass Inventory (at MAP)
 * B. Tempering inward     → Dr WIP (tempering charge) / Cr AP + MAP update
 * C. Delivery             → Dr COGS / Cr Glass Inventory (at MAP × sqft)
 *
 * IAS 2 compliant — WAC / MAP method throughout
 * Phase-7 (B2): All system-auto entries now Post directly. Parked status
 * was leaving the trial balance perpetually misleading until a manual bulk
 * post — went against the single-user real-time accuracy goal. Manual JVs
 * still flow through Maker-Checker (financeService.ts FIN-3).
 */

import { FinanceService } from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { Company } from '@/modules/shared/types/core';
// H6 decomposition: cutting / delivery / overhead / piece-P&L flows moved to
// sibling modules and re-exported below so all existing import paths keep
// working unchanged. Only the tempering-inward flow stays inline here.
import { glassAccounts, getVendorRatesByMm } from './glasscoGLHelpers';

// ══════════════════════════════════════════════════════════════════
// B. TEMPERING INWARD → Dr WIP (charge) / Cr AP + MAP update
//
// Rate is per-mm per-piece (not averaged across all pieces).
// Vendor invoice = Σ (piece.sqft × vendor rate for piece.mm)
// Each mm thickness has a different rate — 6mm ≠ 12mm.
//
// Dispatch (send-out): NO GL entry — liability arises when service is
// rendered (accrual principle, IAS 37), not when pieces are dispatched.
// GL fires only when pieces RETURN with vendor bill.
// ══════════════════════════════════════════════════════════════════

/**
 * Sprint 11: Tempering inward GL post — now supports partial inward.
 *
 * If `brokenPieceIds` is provided, those pieces post to the defect/NCR
 * ledger (Loss on Tempering Defects) and are EXCLUDED from the AP credit.
 * The vendor liability only covers what was actually returned good.
 *
 * @returns computed AP amount (sum of received-piece costs) for downstream
 *          3-way match. Returns 0 if no GL was posted (e.g. duplicate call,
 *          or zero received pieces).
 */
export function postTemperingInwardGL(params: {
  company:        Company;
  dispatchId:     string;
  vendorName:     string;
  date:           string;
  pieceIds:       string[];
  // Per-mm rates snapshotted from TemperingDispatch.ratesByMm at dispatch creation.
  // These take priority over vendor's current price list (rate may have changed since dispatch).
  // If empty/missing, falls back to vendor's current rates from SalesService.
  rateOverrides?: Record<string, number>;   // { '6': 55, '8': 65, … }
  // Sprint 11 — partial inward: pieces broken/lost in transit.
  // These post to Loss on Tempering Defects (P&L), NOT to vendor AP.
  brokenPieceIds?: string[];
}): number {
  const {
    company, dispatchId, vendorName, date, pieceIds,
    rateOverrides = {}, brokenPieceIds = [],
  } = params;

  // Sprint 11: filter out broken pieces — they don't go into AP
  const brokenSet      = new Set(brokenPieceIds);
  const receivedIds    = pieceIds.filter(id => !brokenSet.has(id));

  // ── Effective rate map: snapshotted rates > current vendor rates ──────
  // Priority: rateOverrides (from dispatch.ratesByMm, set at dispatch creation)
  //           then vendor's current price list (fallback if dispatch was created
  //           before ratesByMm field existed)
  const vendorLiveRates = getVendorRatesByMm(vendorName);
  const effectiveRates: Record<string, number> = { ...vendorLiveRates, ...rateOverrides };

  const accs  = glassAccounts(company);
  const ledger = FinanceService.getLedger();
  const txId  = `GL-TEMP-${dispatchId}`;
  if (ledger.some((t: any) => t.id === txId)) return 0;

  // ── Step 1: Compute per-piece tempering cost (exact, per-mm) ─────
  // Sprint 11: only the RECEIVED (good) pieces feed AP. Broken pieces
  // are handled separately in Step 4 below.
  const pieces = ProductionService.getProductionPieces()
    .filter((p: any) => receivedIds.includes(p.id));
  if (pieces.length === 0 && brokenPieceIds.length === 0) return 0;

  const store = InventoryService.getStore().filter(
    (s: any) => s.company === company && s.category === 'Raw',
  );

  interface PieceCost {
    pieceId:    string;
    materialId: string | null;
    sqft:       number;
    mm:         string;
    rate:       number;
    cost:       number;
  }

  const perPieceCosts: PieceCost[] = [];

  pieces.forEach((piece: any) => {
    const order = ProductionService.getJobOrders()
      .find((j: any) => j.orderNo === piece.orderId || j.id === piece.orderId);
    const item = order ? (order.items || [])[piece.itemIndex ?? 0] : null;

    const sqft = item?.totalSqFt || piece.sqft || 0;
    if (sqft <= 0) return;

    // Extract mm from thickness field: '6mm' → '6', '10' → '10'
    // QuotationItem only has `glassSize`; piece thickness lives inside specs JSON.
    const pieceSpecsThickness = (() => {
      try { return JSON.parse(piece.specs || '{}').thickness || ''; } catch { return ''; }
    })();
    const rawThickness = String(
      item?.glassSize || pieceSpecsThickness || '',
    ).replace(/[^0-9.]/g, '').trim();
    const mm = rawThickness || '6';

    // Rate: from effectiveRates (dispatch snapshot > vendor live rates)
    const rate = effectiveRates[mm] ?? 0;
    if (rate === 0) {
      // Phase-7 (B9): silent-skip → loud-fail. Audit I9: previously a missing
      // mm rate caused the piece to be quietly excluded from AP, leaving the
      // vendor liability understated and a tempering WIP residue with no
      // matching CR. Now we abort the whole inward post so the operator must
      // (a) update vendor price list or (b) supply a one-off override before
      // the GL is touched. Books stay consistent.
      throw new Error(
        `Tempering AP cannot be posted: no rate found for ${mm}mm with vendor "${vendorName}" ` +
        `(piece ${piece.id}). Add the ${mm}mm rate to the vendor price list, then retry inward.`,
      );
    }
    const cost = Math.round(sqft * rate);

    // Match store item by thickness + glass type
    const glassType = (item?.glassType || 'Plain').toLowerCase();
    const match = store.find((s: any) => {
      const name  = (s.name || '').toLowerCase();
      const thkOk = name.includes(mm);
      const typeOk = glassType === 'plain'
        ? !name.includes('mirror') && !name.includes('tint')
        : name.includes(glassType);
      return thkOk && typeOk;
    }) ?? store[0] ?? null;

    perPieceCosts.push({
      pieceId: piece.id, materialId: match?.id ?? null,
      sqft, mm, rate, cost,
    });
  });

  const exactTotalCharges = perPieceCosts.reduce((s, p) => s + p.cost, 0);
  // Sprint 11: zero received pieces is OK if there are broken pieces (defect-only post)
  if (exactTotalCharges <= 0 && brokenPieceIds.length === 0) return 0;

  // ── Step 2: GL entry — Dr WIP / Cr AP ───────────────────────────
  // One line per mm group for P&L transparency
  const byMm: Record<string, { sqft: number; cost: number }> = {};
  perPieceCosts.forEach(p => {
    if (!byMm[p.mm]) byMm[p.mm] = { sqft: 0, cost: 0 };
    byMm[p.mm].sqft += p.sqft;
    byMm[p.mm].cost += p.cost;
  });

  const glDetails: any[] = Object.entries(byMm).map(([mm, v]) => ({
    accountId: accs.wip.id,
    debit: v.cost, credit: 0,
    text: `Tempering WIP: ${mm}mm — ${v.sqft.toFixed(1)} sqft @ PKR ${effectiveRates[mm] ?? 0}/sqft`,
  }));

  if (exactTotalCharges > 0) {
    glDetails.push({
      accountId: accs.apGlass.id, debit: 0, credit: exactTotalCharges,
      text: `AP — ${vendorName}: ${dispatchId} | ${pieces.length} pcs | PKR ${exactTotalCharges.toLocaleString()}`,
    });
  }

  // ── Sprint 11: Defect ledger for broken/lost pieces ─────────────
  // Dr Loss on Tempering Defects / Cr Tempering WIP (write off)
  // No vendor AP — vendor doesn't bill for lost pieces.
  let brokenLoss = 0;
  if (brokenPieceIds.length > 0) {
    const brokenPieces = ProductionService.getProductionPieces()
      .filter((p: any) => brokenPieceIds.includes(p.id));
    brokenPieces.forEach((piece: any) => {
      const order = ProductionService.getJobOrders()
        .find((j: any) => j.orderNo === piece.orderId || j.id === piece.orderId);
      const item: any = order ? (order.items || [])[piece.itemIndex ?? 0] : null;
      const sqft  = item?.totalSqFt || piece.sqft || 0;
      // Use carrying value from inventory MAP if available, else fall back
      // to last-known per-sqft cost via a conservative estimate.
      const mm    = String(
        item?.glassThickness || item?.glassSize || item?.thickness || piece.thickness || '',
      ).replace(/[^0-9.]/g, '') || '6';
      const rate  = effectiveRates[mm] ?? 0;
      brokenLoss += Math.round(sqft * rate);
    });

    if (brokenLoss > 0) {
      // Sprint 11: Loss account sits as a sibling of COGS — Glass Sales
      // (parent = cogsGlass's parent, i.e. the COST OF GOODS SOLD level-2 acct).
      // We re-ensure it via FinanceService so it auto-creates if missing.
      const lossAcc = FinanceService.ensureAccount(
        company, 'Loss on Tempering Defects', 3,
        accs.cogsGlass.parentId ?? null, 'Expense', '5119',
      );
      glDetails.push({
        accountId: lossAcc.id, debit: brokenLoss, credit: 0,
        text: `Tempering loss: ${brokenPieceIds.length} pcs broken in transit`,
      });
      // Balance with WIP credit (the WIP we built up at dispatch is being written off)
      glDetails.push({
        accountId: accs.wip.id, debit: 0, credit: brokenLoss,
        text: `WIP write-off: ${brokenPieceIds.length} broken pcs (${dispatchId})`,
      });
    }
  }

  const mmSummary = Object.entries(byMm)
    .map(([mm, v]) => `${mm}mm:${v.sqft.toFixed(0)}sqft@PKR${effectiveRates[mm] ?? 0}`)
    .join(' | ');

  // Phase-7 (B2): Tempering inward now Posted directly (was 'Parked').
  // Audit I3: Parked status meant the AP liability was deferred until a
  // manual bulk-post — violating IAS 37 (liabilities must be recognised
  // when the service is rendered + vendor bill received). With single-user
  // go-live, the vendor invoice is concrete by the time pieces are
  // received back, so the liability is real and must hit AP immediately.
  // createdBy='system-auto' bypasses the Maker-Checker gate (this is a
  // system-generated event, not a manual JV).
  // Sprint 11: Description includes broken-piece summary if partial inward
  const descParts: string[] = [`Tempering inward: ${vendorName} — ${dispatchId}`];
  if (mmSummary) descParts.push(mmSummary);
  if (exactTotalCharges > 0) descParts.push(`AP PKR ${exactTotalCharges.toLocaleString()}`);
  if (brokenPieceIds.length > 0) {
    descParts.push(`Broken ${brokenPieceIds.length} pcs (loss PKR ${brokenLoss.toLocaleString()})`);
  }

  FinanceService.recordTransaction({
    id: txId, company, docType: 'KR',
    docDate: date, date,
    description: descParts.join(' | '),
    referenceId: dispatchId, status: 'Posted',
    createdBy: 'system-auto',
    details: glDetails,
  } as any);

  // ── Step 3: MAP update — EXACT per-material alloc (not averaged) ─
  // Each material (grouped by thickness/type) gets only its own cost,
  // not a cross-subsidised average.
  const materialCosts: Record<string, number> = {};
  perPieceCosts.forEach(p => {
    if (!p.materialId) return;
    materialCosts[p.materialId] = (materialCosts[p.materialId] || 0) + p.cost;
  });

  if (Object.keys(materialCosts).length > 0) {
    const allStore = InventoryService.getStore();
    let updated = false;
    const newStore = allStore.map((storeItem: any) => {
      if (storeItem.company !== company) return storeItem;
      const alloc = materialCosts[storeItem.id] || 0;
      if (alloc === 0) return storeItem;

      const newTotalValue = (storeItem.totalValue || 0) + alloc;
      const qty = storeItem.quantity || storeItem.unrestrictedQty || 0;
      const newMAP = qty > 0 ? newTotalValue / qty : storeItem.movingAveragePrice;

      updated = true;
      return {
        ...storeItem,
        movingAveragePrice: Number(newMAP.toFixed(2)),
        totalValue:         Number(newTotalValue.toFixed(2)),
        lastMovementDate:   date,
      };
    });
    if (updated) InventoryService.saveStore(newStore);
  }

  // Sprint 11: return computed AP amount for caller's 3-way match
  return exactTotalCharges;
}

// ── Re-exports (preserve glasscoGLService's public API after H6 split) ──
export * from './glasscoGLCutting';
export * from './glasscoGLDelivery';
export * from './glasscoGLOverhead';
export * from './glasscoGLPiecePnL';
