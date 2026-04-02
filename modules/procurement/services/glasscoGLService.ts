/**
 * glasscoGLService.ts — Phase 1: Complete Costing GL
 *
 * Three new GL flows:
 * A. Cutting session close → Dr WIP / Cr Glass Inventory (at MAP)
 * B. Tempering inward     → Dr WIP (tempering charge) / Cr AP + MAP update
 * C. Delivery             → Dr COGS / Cr Glass Inventory (at MAP × sqft)
 *
 * IAS 2 compliant — WAC / MAP method throughout
 * All entries → Parked (Finance reviews before posting)
 */

import { FinanceService } from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { Company } from '@/modules/shared/types/core';

// ── Account builder helpers ────────────────────────────────────────

function glassAccounts(company: Company) {
  const assets   = FinanceService.ensureAccount(company, 'ASSETS',              1, null,       'Asset',   '10');
  const current  = FinanceService.ensureAccount(company, 'CURRENT ASSETS',      2, assets.id,  'Asset',   '11');
  const inv      = FinanceService.ensureAccount(company, 'INVENTORY',           3, current.id, 'Asset',   '115');
  const glassInv = FinanceService.ensureAccount(company, 'Glass Inventory — Raw',   4, inv.id, 'Asset',   '11511');
  const wip      = FinanceService.ensureAccount(company, 'WIP — Glass in Process',  4, inv.id, 'Asset',   '11513');
  const fg       = FinanceService.ensureAccount(company, 'Finished Goods — Glass',  4, inv.id, 'Asset',   '11515');

  const expense  = FinanceService.ensureAccount(company, 'EXPENSES',            1, null,         'Expense', '50');
  const cogs     = FinanceService.ensureAccount(company, 'COST OF GOODS SOLD',  2, expense.id,   'Expense', '511');
  const cogsGlass= FinanceService.ensureAccount(company, 'COGS — Glass Sales',  3, cogs.id,      'Expense', '5111');
  const scrap    = FinanceService.ensureAccount(company, 'Scrap & Wastage Loss', 3, cogs.id,      'Expense', '5113');

  const liab     = FinanceService.ensureAccount(company, 'LIABILITIES',             1, null,       'Liability','20');
  const current2 = FinanceService.ensureAccount(company, 'CURRENT LIABILITIES',     2, liab.id,    'Liability','22');
  const trade    = FinanceService.ensureAccount(company, 'TRADE PAYABLES',          3, current2.id,'Liability','221');
  const apGlass  = FinanceService.ensureAccount(company, 'AP — Tempering Vendors',  4, trade.id,   'Liability','22113');

  return { glassInv, wip, fg, cogsGlass, scrap, apGlass };
}

// ── Helper: get MAP for a material from store ─────────────────────

function getMAPForMaterial(company: Company, materialId: string): number {
  const store = InventoryService.getStore();
  const item = store.find((i: any) => i.id === materialId && i.company === company);
  return item?.movingAveragePrice || 0;
}

// ── Helper: get piece sqft + material from quotation item ─────────

function getPieceCostData(piece: any, company: Company): {
  sqft: number; materialId: string | null; map: number; totalCost: number;
} {
  const order = ProductionService.getJobOrders()
    .find((j: any) => j.orderNo === piece.orderId || j.id === piece.orderId);
  if (!order) return { sqft: 0, materialId: null, map: 0, totalCost: 0 };

  const item = (order.items || [])[piece.itemIndex];
  if (!item) return { sqft: 0, materialId: null, map: 0, totalCost: 0 };

  const sqft = item.totalSqFt || item.sqft || 0;

  // Find matching store item by glass type + thickness
  const store = InventoryService.getStore().filter((s: any) => s.company === company && s.category === 'Raw');
  const thickness = item.glassThickness || item.glassSize || '';
  const glassType = (item.glassType || 'Plain').toLowerCase();
  const match = store.find((s: any) => {
    const name = (s.name || '').toLowerCase();
    const thkOk = thickness ? name.includes(thickness.replace('mm', '').trim()) : true;
    const typeOk = glassType === 'plain' ? !name.includes('mirror') && !name.includes('tint') : name.includes(glassType);
    return thkOk && typeOk;
  }) || store[0]; // fallback to first raw item

  const map = match?.movingAveragePrice || 0;
  return { sqft, materialId: match?.id || null, map, totalCost: sqft * map };
}

// ══════════════════════════════════════════════════════════════════
// A. CUTTING SESSION CLOSE → Dr WIP / Cr Glass Inventory
// ══════════════════════════════════════════════════════════════════

export function postCuttingGL(params: {
  company: Company;
  sessionId: string;
  sheetsScanned: { tagId: string; isDefective: boolean }[];
  scrapSqft: number;
  date: string;
}): void {
  const { company, sessionId, sheetsScanned, scrapSqft, date } = params;
  const accs = glassAccounts(company);
  const ledger = FinanceService.getLedger();
  const txId = `GL-CUT-${sessionId}`;
  if (ledger.some((t: any) => t.id === txId)) return; // already posted

  // Get GRN sheet entries to find material + sqft per sheet
  const sheetEntries = sheetsScanned
    .map(s => InventoryService.getGRNSheetEntryByTag(s.tagId))
    .filter(Boolean);

  if (sheetEntries.length === 0) return;

  // Group by material, sum sqft
  const byMaterial: Record<string, { sqft: number; map: number }> = {};
  sheetEntries.forEach((entry: any) => {
    if (!entry) return;
    const map = getMAPForMaterial(company, entry.materialId);
    if (!byMaterial[entry.materialId]) byMaterial[entry.materialId] = { sqft: 0, map };
    byMaterial[entry.materialId].sqft += entry.sqftPerSheet || 0;
  });

  const totalSqft  = Object.values(byMaterial).reduce((s, v) => s + v.sqft, 0);
  const totalValue = Object.values(byMaterial).reduce((s, v) => s + v.sqft * v.map, 0);
  const wipValue   = totalValue; // full sheet value → WIP
  const scrapValue = scrapSqft > 0 && totalSqft > 0
    ? (scrapSqft / totalSqft) * totalValue : 0;

  if (totalValue <= 0) return;

  const details: any[] = [
    // Dr WIP (glass now in process)
    { accountId: accs.wip.id,      debit: wipValue - scrapValue, credit: 0,
      text: `Cutting: ${sheetEntries.length} sheets → WIP (${totalSqft.toFixed(1)} sqft)` },
  ];

  // Scrap if any
  if (scrapValue > 0) {
    details.push({ accountId: accs.scrap.id, debit: scrapValue, credit: 0,
      text: `Cutting scrap: ${scrapSqft.toFixed(1)} sqft @ avg MAP` });
  }

  // Cr Glass Inventory (total sheets consumed)
  details.push({ accountId: accs.glassInv.id, debit: 0, credit: totalValue,
    text: `Cutting session ${sessionId} — ${sheetEntries.length} sheets` });

  FinanceService.recordTransaction({
    id: txId, company, docType: 'WA',
    docDate: date, date,
    description: `Cutting GL: ${sessionId} — ${totalSqft.toFixed(1)} sqft → WIP`,
    referenceId: sessionId, status: 'Parked',
    details,
  } as any);
}

// ══════════════════════════════════════════════════════════════════
// B. TEMPERING INWARD → Dr WIP (charge) / Cr AP + MAP update
// ══════════════════════════════════════════════════════════════════

export function postTemperingInwardGL(params: {
  company: Company;
  dispatchId: string;
  totalSqft: number;
  chargesPerSqft: number;
  totalCharges: number;
  vendorName: string;
  date: string;
  pieceIds: string[];
}): void {
  const { company, dispatchId, totalSqft, chargesPerSqft, totalCharges, vendorName, date, pieceIds } = params;
  if (totalCharges <= 0) return;

  const accs = glassAccounts(company);
  const ledger = FinanceService.getLedger();
  const txId = `GL-TEMP-${dispatchId}`;
  if (ledger.some((t: any) => t.id === txId)) return;

  // Post GL: Dr WIP (tempering added to piece cost) / Cr AP
  FinanceService.recordTransaction({
    id: txId, company, docType: 'KR',
    docDate: date, date,
    description: `Tempering inward: ${vendorName} — ${dispatchId} (${totalSqft.toFixed(1)} sqft @ PKR ${chargesPerSqft}/sqft)`,
    referenceId: dispatchId, status: 'Parked',
    details: [
      { accountId: accs.wip.id,   debit: totalCharges, credit: 0,
        text: `Tempering cost added to WIP: ${vendorName} @ PKR ${chargesPerSqft}/sqft` },
      { accountId: accs.apGlass.id, debit: 0, credit: totalCharges,
        text: `AP — ${vendorName}: ${dispatchId}` },
    ],
  } as any);

  // Update MAP on store items: new MAP = (old value + tempering alloc) / qty
  // Distribute tempering cost proportionally to matching store items
  const store = InventoryService.getStore();
  let updated = false;

  // Find pieces → get their glass type/thickness → update MAP
  const pieces = ProductionService.getProductionPieces()
    .filter((p: any) => pieceIds.includes(p.id));

  // Collect unique material IDs from pieces
  const materialCounts: Record<string, number> = {};
  let totalPieceSqft = 0;

  pieces.forEach((piece: any) => {
    const costData = getPieceCostData(piece, company);
    if (!costData.materialId) return;
    materialCounts[costData.materialId] = (materialCounts[costData.materialId] || 0) + costData.sqft;
    totalPieceSqft += costData.sqft;
  });

  // Apportion tempering charge to each material's MAP
  if (totalPieceSqft > 0 && Object.keys(materialCounts).length > 0) {
    const newStore = store.map((item: any) => {
      if (item.company !== company) return item;
      const pieceSqft = materialCounts[item.id] || 0;
      if (pieceSqft === 0) return item;

      // Tempering cost allocated to this material
      const alloc = (pieceSqft / totalPieceSqft) * totalCharges;
      const newTotalValue = (item.totalValue || 0) + alloc;
      const qty = item.quantity || item.unrestrictedQty || 0;
      const newMAP = qty > 0 ? newTotalValue / qty : item.movingAveragePrice;

      updated = true;
      return {
        ...item,
        movingAveragePrice: Number(newMAP.toFixed(2)),
        totalValue: Number(newTotalValue.toFixed(2)),
        lastMovementDate: date,
      };
    });
    if (updated) InventoryService.saveStore(newStore);
  }
}

// ══════════════════════════════════════════════════════════════════
// C. DELIVERY → Dr COGS / Cr Glass Inventory (at MAP × sqft)
// ══════════════════════════════════════════════════════════════════

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

  // Get pieces → sqft + MAP per piece
  const pieces = ProductionService.getProductionPieces()
    .filter((p: any) => pieceIds.includes(p.id));

  if (pieces.length === 0) return;

  let totalCOGS  = 0;
  let totalSqft  = 0;
  const details: { thickness: string; sqft: number; map: number; value: number }[] = [];

  pieces.forEach((piece: any) => {
    const { sqft, map, totalCost } = getPieceCostData(piece, company);
    if (sqft <= 0 || map <= 0) return;
    totalCOGS  += totalCost;
    totalSqft  += sqft;
    details.push({ thickness: piece.specs || '', sqft, map, value: totalCost });
  });

  if (totalCOGS <= 0) return;

  // Update store: reduce totalValue proportional to sqft delivered
  const store = InventoryService.getStore();
  const materialDeductions: Record<string, number> = {};
  pieces.forEach((piece: any) => {
    const { sqft, materialId, map } = getPieceCostData(piece, company);
    if (!materialId || sqft <= 0) return;
    materialDeductions[materialId] = (materialDeductions[materialId] || 0) + sqft * map;
  });

  const newStore = store.map((item: any) => {
    if (item.company !== company) return item;
    const deduction = materialDeductions[item.id] || 0;
    if (deduction === 0) return item;
    return {
      ...item,
      totalValue: Math.max(0, (item.totalValue || 0) - deduction),
      lastMovementDate: date,
    };
  });
  InventoryService.saveStore(newStore);

  // Post COGS GL
  FinanceService.recordTransaction({
    id: txId, company, docType: 'SA',
    docDate: date, date,
    description: `COGS: ${orderId} → ${clientName} — ${totalSqft.toFixed(1)} sqft delivered`,
    referenceId: invoiceId, status: 'Parked',
    details: [
      { accountId: accs.cogsGlass.id, debit: totalCOGS, credit: 0,
        text: `COGS — ${pieces.length} pieces, ${totalSqft.toFixed(1)} sqft @ avg MAP PKR ${totalSqft > 0 ? (totalCOGS / totalSqft).toFixed(0) : 0}/sqft` },
      { accountId: accs.glassInv.id,  debit: 0, credit: totalCOGS,
        text: `Inventory relief: ${orderId} delivered to ${clientName}` },
    ],
  } as any);
}

// ── Convenience: check if COGS already posted for an invoice ──────
export function isCOGSPosted(invoiceId: string): boolean {
  return FinanceService.getLedger().some((t: any) => t.id === `GL-COGS-${invoiceId}`);
}
