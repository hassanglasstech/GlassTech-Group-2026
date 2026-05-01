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

import { FinanceService }  from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService }     from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { LabourService }    from '@/modules/production/services/labourService';
import { Company }          from '@/modules/shared/types/core';

// ── Glassco Production Overhead accounts (IAS 2.13 — conversion costs) ──
//
// TWO sources only:
//
// 1. FACTORY SHARED (30% of Factory costs — posted by factoryOverheadAllocationService):
//    Electricity, Depreciation, Maintenance+Fuel, Rent all come through Factory.
//    Glassco does NOT maintain separate electricity/depreciation/repair accounts
//    for the production floor — these are Factory's assets and bills.
//
// 2. GLASSCO OWN — only consumables that Glassco purchases directly:
//    Cutting blades, cutting oil, grinding discs, polishing compounds etc.
//
// NOT included (period costs per IAS 2.16):
//    Admin salaries, selling expenses, office overheads.
const PRODUCTION_OVERHEAD_CODES = [
  '51121',  // Cutting Consumables       — Glassco own
  '51122',  // Processing Consumables    — Glassco own
  '51123',  // Packaging — Cost          — Glassco own (if applicable)
  '51415',  // Factory Overhead — Electricity   (30% Factory LESCO bill)
  '51416',  // Factory Overhead — Depreciation  (30% Factory building + generators)
  '51417',  // Factory Overhead — Maintenance & Fuel (30% Factory R&M + fuel)
  '51418',  // Factory Overhead — Rent           (30% Factory rent)
];

// ── Standard service labor cost rates (PKR/sqft) ─────────────────
const SERVICE_LABOR_RATES: Record<string, number> = {
  Polishing: 15,
  Grinding:  20,
  Notching:  45,
  Holes:     80,
};

// ── Tempering rates come from Vendor.rates[] (SalesService), NOT hardcoded ──
// Each vendor has their own PKR/sqft per mm thickness.
// Use getVendorRatesByMm(vendorName) to get the map at GL time.
// rateOverrides from TemperingDispatch.ratesByMm snapshot take priority
// (protects against vendor rate changes after dispatch was created).

function getVendorRatesByMm(vendorName: string): Record<string, number> {
  const vendor = SalesService.getVendors().find(
    v => (v.name || '').toUpperCase() === vendorName.toUpperCase(),
  );
  const ratesByMm: Record<string, number> = {};
  // Sort descending by effectiveDate — most recent rate wins per mm
  const sorted = [...(vendor?.rates || [])].sort(
    (a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''),
  );
  sorted.forEach(r => {
    const mm = String(r.thickness || '').replace(/[^0-9.]/g, '').trim();
    if (mm && r.rate > 0 && !ratesByMm[mm]) ratesByMm[mm] = r.rate;
  });
  return ratesByMm;
}

// ── Account builder helpers ────────────────────────────────────────

function glassAccounts(company: Company) {
  const assets   = FinanceService.ensureAccount(company, 'ASSETS',              1, null,       'Asset',   '10');
  const current  = FinanceService.ensureAccount(company, 'CURRENT ASSETS',      2, assets.id,  'Asset',   '11');
  const inv      = FinanceService.ensureAccount(company, 'INVENTORY',           3, current.id, 'Asset',   '115');
  const glassInv  = FinanceService.ensureAccount(company, 'Glass Inventory — Raw',   4, inv.id, 'Asset',   '11511');
  const wip       = FinanceService.ensureAccount(company, 'WIP — Glass in Process',  4, inv.id, 'Asset',   '11513');
  // WIP — Direct Labour: receives ALL production wages at payroll time (Option B).
  // Closed to 51311/51312 COGS at delivery. Balance = labour in undelivered WIP.
  const wipLabour = FinanceService.ensureAccount(company, 'WIP — Direct Labour',     4, inv.id, 'Asset',   '11514');
  const fg        = FinanceService.ensureAccount(company, 'Finished Goods — Glass',  4, inv.id, 'Asset',   '11515');

  const expense      = FinanceService.ensureAccount(company, 'EXPENSES',               1, null,           'Expense', '50');
  const costOfSales  = FinanceService.ensureAccount(company, 'COST OF GOODS SOLD',     2, expense.id,     'Expense', '511');
  const cogsGlass    = FinanceService.ensureAccount(company, 'COGS — Glass Sales',     3, costOfSales.id, 'Expense', '5111');
  const scrap        = FinanceService.ensureAccount(company, 'Scrap & Wastage Loss',   3, costOfSales.id, 'Expense', '5113');
  const directLabour = FinanceService.ensureAccount(company, 'DIRECT LABOUR',          3, costOfSales.id, 'Expense', '513');
  const prodLabour   = FinanceService.ensureAccount(company, 'Production Labour',      4, directLabour.id,'Expense', '5131');
  const cogsCutting  = FinanceService.ensureAccount(company, 'Wages — Cutting Dept',  5, prodLabour.id,  'Expense', '51311');
  const cogsProcess  = FinanceService.ensureAccount(company, 'Wages — Processing Dept',5, prodLabour.id,  'Expense', '51312');

  // ── Production Overhead accounts (IAS 2.13 — absorbed into COGS) ──────
  const prodOH     = FinanceService.ensureAccount(company, 'PRODUCTION OVERHEAD',                   3, costOfSales.id, 'Expense', '514');
  const mfgOH      = FinanceService.ensureAccount(company, 'Manufacturing Overhead',                4, prodOH.id,      'Expense', '5141');
  const ohElec     = FinanceService.ensureAccount(company, 'Electricity — Production',              5, mfgOH.id,       'Expense', '51411');
  const ohDepr     = FinanceService.ensureAccount(company, 'Depreciation — Production Machinery',   5, mfgOH.id,       'Expense', '51412');
  const ohRepairC  = FinanceService.ensureAccount(company, 'Machine Repair — Cutting',              5, mfgOH.id,       'Expense', '51413');
  const ohRepairP  = FinanceService.ensureAccount(company, 'Machine Repair — Processing',           5, mfgOH.id,       'Expense', '51414');
  // Factory shared overhead accounts (populated from factoryOverheadAllocationService)
  const ohFactElec = FinanceService.ensureAccount(company, 'Factory Overhead — Electricity & Power',5, mfgOH.id,       'Expense', '51415');
  const ohFactDepr = FinanceService.ensureAccount(company, 'Factory Overhead — Depreciation',       5, mfgOH.id,       'Expense', '51416');
  const ohFactMaint= FinanceService.ensureAccount(company, 'Factory Overhead — Maintenance & Fuel', 5, mfgOH.id,       'Expense', '51417');
  const ohFactRent = FinanceService.ensureAccount(company, 'Factory Overhead — Rent',               5, mfgOH.id,       'Expense', '51418');
  // Consumables
  const consumCtrl = FinanceService.ensureAccount(company, 'Consumables — Production',              4, costOfSales.id, 'Expense', '5112');
  const consums    = FinanceService.ensureAccount(company, 'Cutting Consumables',                   5, consumCtrl.id,  'Expense', '51121');
  const consumsP   = FinanceService.ensureAccount(company, 'Processing Consumables',                5, consumCtrl.id,  'Expense', '51122');
  // Absorbed overhead clearing (Cr when overhead is absorbed into COGS)
  const ohAbsorbed = FinanceService.ensureAccount(company, 'Production Overhead — Absorbed',        3, costOfSales.id, 'Expense', '5142');

  const liab      = FinanceService.ensureAccount(company, 'LIABILITIES',              1, null,        'Liability', '20');
  const current2  = FinanceService.ensureAccount(company, 'CURRENT LIABILITIES',      2, liab.id,     'Liability', '22');
  const trade     = FinanceService.ensureAccount(company, 'TRADE PAYABLES',           3, current2.id, 'Liability', '221');
  const apGlass   = FinanceService.ensureAccount(company, 'AP — Tempering Vendors',   4, trade.id,    'Liability', '22113');

  return {
    glassInv, wip, wipLabour, fg, cogsGlass, scrap, cogsCutting, cogsProcess,
    ohElec, ohDepr, ohRepairC, ohRepairP, ohFactElec, ohFactDepr, ohFactMaint, ohFactRent,
    consums, consumsP, ohAbsorbed,
    apGlass,
  };
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

  // Phase-7 (B2): Cutting GL also Posts directly. Pure asset
  // reclassification (Glass Inventory → WIP) — no liability, no Maker-
  // Checker concern. Keeping it Parked left raw inventory overstated on
  // the balance sheet until a manual post. system-auto bypasses the JV
  // approval gate.
  FinanceService.recordTransaction({
    id: txId, company, docType: 'WA',
    docDate: date, date,
    description: `Cutting GL: ${sessionId} — ${totalSqft.toFixed(1)} sqft → WIP`,
    referenceId: sessionId, status: 'Posted',
    createdBy: 'system-auto',
    details,
  } as any);
}

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

export function postTemperingInwardGL(params: {
  company:       Company;
  dispatchId:    string;
  vendorName:    string;
  date:          string;
  pieceIds:      string[];
  // Per-mm rates snapshotted from TemperingDispatch.ratesByMm at dispatch creation.
  // These take priority over vendor's current price list (rate may have changed since dispatch).
  // If empty/missing, falls back to vendor's current rates from SalesService.
  rateOverrides?: Record<string, number>;   // { '6': 55, '8': 65, … }
}): void {
  const { company, dispatchId, vendorName, date, pieceIds, rateOverrides = {} } = params;

  // ── Effective rate map: snapshotted rates > current vendor rates ──────
  // Priority: rateOverrides (from dispatch.ratesByMm, set at dispatch creation)
  //           then vendor's current price list (fallback if dispatch was created
  //           before ratesByMm field existed)
  const vendorLiveRates = getVendorRatesByMm(vendorName);
  const effectiveRates: Record<string, number> = { ...vendorLiveRates, ...rateOverrides };

  const accs  = glassAccounts(company);
  const ledger = FinanceService.getLedger();
  const txId  = `GL-TEMP-${dispatchId}`;
  if (ledger.some((t: any) => t.id === txId)) return;

  // ── Step 1: Compute per-piece tempering cost (exact, per-mm) ─────
  const pieces = ProductionService.getProductionPieces()
    .filter((p: any) => pieceIds.includes(p.id));
  if (pieces.length === 0) return;

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
    // Check multiple field names — QuotationItem uses glassSize, others use thickness
    const rawThickness = String(
      item?.glassThickness || item?.glassSize || item?.thickness || piece.thickness || '',
    ).replace(/[^0-9.]/g, '').trim();
    const mm = rawThickness || '6';

    // Rate: from effectiveRates (dispatch snapshot > vendor live rates)
    const rate = effectiveRates[mm] ?? 0;
    if (rate === 0) {
      console.warn(
        `[TemperingGL] No rate for ${mm}mm from vendor "${vendorName}" — ` +
        `piece ${piece.id} excluded. Add rate to vendor price list.`,
      );
      return;
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
  if (exactTotalCharges <= 0) return;

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

  glDetails.push({
    accountId: accs.apGlass.id, debit: 0, credit: exactTotalCharges,
    text: `AP — ${vendorName}: ${dispatchId} | ${pieces.length} pcs | PKR ${exactTotalCharges.toLocaleString()}`,
  });

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
  FinanceService.recordTransaction({
    id: txId, company, docType: 'KR',
    docDate: date, date,
    description: `Tempering inward: ${vendorName} — ${dispatchId} | ${mmSummary} | Total PKR ${exactTotalCharges.toLocaleString()}`,
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
}

// ══════════════════════════════════════════════════════════════════
// C. DELIVERY → Dr COGS / Cr Inventory  +  Dr Service COGS / Cr Accrued
//    Separate GL lines per cost type: raw glass, cutting, processing
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

  // ── 3. Update store inventory value ──────────────────────────────
  if (rawGlassCOGS > 0) {
    const store = InventoryService.getStore();
    const newStore = store.map((item: any) => {
      if (item.company !== company) return item;
      const deduction = materialDeductions[item.id] || 0;
      if (deduction === 0) return item;
      return { ...item, totalValue: Math.max(0, (item.totalValue || 0) - deduction), lastMovementDate: date };
    });
    InventoryService.saveStore(newStore);
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

// ══════════════════════════════════════════════════════════════════
// E. PRODUCTION OVERHEAD RATE — collect actuals, compute PKR/sqft
//
// Sources of Glassco production overhead (IAS 2.13):
//   OWN overhead:    Electricity-Production (51411), Machinery Depreciation (51412),
//                    Machine Repairs (51413, 51414), Consumables (51121, 51122)
//   SHARED overhead: Factory allocation (51415 Electricity, 51416 Depreciation,
//                    51417 Maintenance+Fuel, 51418 Rent)
// ══════════════════════════════════════════════════════════════════

export interface ProductionOverheadRate {
  month:              string;
  company:            Company;
  // Own overhead breakdown
  ownElectricity:     number;
  ownDepreciation:    number;
  ownMachineRepair:   number;
  ownConsumables:     number;
  ownOther:           number;
  // Factory shared (from factoryOverheadAllocationService)
  sharedElectricity:  number;
  sharedDepreciation: number;
  sharedMaintFuel:    number;
  sharedRent:         number;
  // Totals
  totalOwnOverhead:   number;
  totalSharedOverhead:number;
  totalProductionOverhead: number;
  // Sqft basis
  totalSqftProduced:  number;
  overheadRatePerSqft: number;  // PKR/sqft — the absorption rate
  // Status
  isAbsorbed:         boolean;  // has postMonthEndOverheadAbsorption been run?
}

export async function getProductionOverheadRate(
  company: Company,
  month: string,
): Promise<ProductionOverheadRate> {
  const accounts = FinanceService.getAccounts().filter((a: any) => a.company === company);
  const ledger   = FinanceService.getLedger().filter(
    (t: any) => t.company === company &&
                t.status === 'Posted' &&
                (t.docDate || t.date || '').startsWith(month),
  );

  // Build account code → id map
  const codeToId: Record<string, string> = {};
  accounts.forEach((a: any) => { if (a.code) codeToId[a.code] = a.id; });
  const idToCode: Record<string, string> = {};
  accounts.forEach((a: any) => { if (a.code) idToCode[a.id] = a.code; });

  // Sum debit amounts by account code for this month
  const actuals: Record<string, number> = {};
  ledger.forEach((tx: any) => {
    (tx.details || []).forEach((d: any) => {
      const code = idToCode[d.accountId] || '';
      if (!code || (d.debit || 0) <= 0) return;
      actuals[code] = (actuals[code] || 0) + d.debit;
    });
  });

  const get = (...codes: string[]) =>
    codes.reduce((s, c) => s + (actuals[c] || 0), 0);

  const ownElectricity   = get('51411');
  const ownDepreciation  = get('51412');
  const ownMachineRepair = get('51413', '51414');
  const ownConsumables   = get('51121', '51122', '51123');
  const ownOther         = 0; // extend as needed

  const sharedElectricity  = get('51415');
  const sharedDepreciation = get('51416');
  const sharedMaintFuel    = get('51417');
  const sharedRent         = get('51418');

  const totalOwnOverhead    = ownElectricity + ownDepreciation + ownMachineRepair + ownConsumables + ownOther;
  const totalSharedOverhead = sharedElectricity + sharedDepreciation + sharedMaintFuel + sharedRent;
  const totalProductionOverhead = totalOwnOverhead + totalSharedOverhead;

  // Total sqft produced this month
  let totalSqftProduced = 0;
  try {
    const logs = await LabourService.getLogs(company as string);
    totalSqftProduced = logs
      .filter(l => l.logDate.startsWith(month))
      .reduce((s, l) => s + l.sqftProduced, 0);
  } catch { /* offline — sqft stays 0 */ }

  const overheadRatePerSqft = totalSqftProduced > 0
    ? Math.round((totalProductionOverhead / totalSqftProduced) * 100) / 100
    : 0;

  const isAbsorbed = FinanceService.getLedger()
    .some((t: any) => t.id === `GL-OH-ABS-${company}-${month}`);

  return {
    month, company,
    ownElectricity, ownDepreciation, ownMachineRepair, ownConsumables, ownOther,
    sharedElectricity, sharedDepreciation, sharedMaintFuel, sharedRent,
    totalOwnOverhead, totalSharedOverhead, totalProductionOverhead,
    totalSqftProduced, overheadRatePerSqft,
    isAbsorbed,
  };
}

// ══════════════════════════════════════════════════════════════════
// F. MONTH-END OVERHEAD ABSORPTION — Dr COGS-Overhead / Cr Absorbed
//
// IAS 2.13: Fixed production overheads allocated to units based on
// normal capacity. Variable overheads allocated based on actual use.
//
// Approach: absorption costing
//   Step 1: Compute overheadRatePerSqft for the month (function E above)
//   Step 2: Get total sqft DELIVERED (invoiced) in the month
//   Step 3: Absorbed overhead = deliveredSqft × overheadRatePerSqft
//   Step 4: Post  Dr  COGS — Overhead (5141x)  / Cr  Overhead Absorbed (5142)
//   Step 5: Un-absorbed overhead (produced but not delivered) stays in WIP
//           as a period closing balance — reversed or carried to next period
//
// GL layout:
//   Dr 51411  Electricity — Production         (own — stays debit from actual posting)
//   Dr 51412  Depreciation — Machinery         (own)
//   ...
//   Dr 51415  Factory Overhead — Electricity   (shared, from Factory allocation)
//   ...
//   Cr 5142   Production Overhead — Absorbed   (net absorption, reduces gross overhead)
//
// The NET of 5141x Dr (actual) and 5142 Cr (absorbed) = under/over-absorption
// This variance is disclosed in monthly management accounts.
// ══════════════════════════════════════════════════════════════════

export async function postMonthEndOverheadAbsorption(params: {
  company: Company;
  month:   string;
  postedBy?: string;
}): Promise<{ txId: string; absorbedAmount: number; deliveredSqft: number; rate: number; variance: number }> {
  const { company, month, postedBy = 'system' } = params;
  const txId = `GL-OH-ABS-${company}-${month}`;

  // Guard: already posted
  if (FinanceService.getLedger().some((t: any) => t.id === txId)) {
    return { txId, absorbedAmount: 0, deliveredSqft: 0, rate: 0, variance: 0 };
  }

  const accs = glassAccounts(company);
  const rate = await getProductionOverheadRate(company, month);

  if (rate.overheadRatePerSqft <= 0 || rate.totalProductionOverhead <= 0) {
    console.warn(`[OH Absorption] No overhead or sqft data for ${company} ${month}`);
    return { txId, absorbedAmount: 0, deliveredSqft: 0, rate: 0, variance: 0 };
  }

  // Total sqft DELIVERED (invoiced) this month — from production pieces with Delivered status
  const deliveredPieces = ProductionService.getProductionPieces().filter((p: any) => {
    if (p.company !== company && p.orderId && !p.orderId.includes('GLS') && company === 'Glassco') {/* skip */}
    return (p.status === 'Delivered') && (p.lastUpdated || '').startsWith(month);
  });
  const deliveredSqft = deliveredPieces.reduce(
    (s: number, p: any) => s + (p.sqft || 0),
    0,
  );

  // Also count sqft from invoiced orders this month
  const invoicedSqft = SalesService.getInvoices()
    .filter((inv: any) => inv.company === company && (inv.date || '').startsWith(month))
    .reduce((s: number, inv: any) => {
      return s + (inv.items || []).reduce((is: number, item: any) => is + (item.totalSqFt || 0), 0);
    }, 0);

  const effectiveSqft = Math.max(deliveredSqft, invoicedSqft);

  if (effectiveSqft <= 0) {
    console.warn(`[OH Absorption] No delivered sqft for ${company} ${month}`);
    return { txId, absorbedAmount: 0, deliveredSqft: 0, rate: rate.overheadRatePerSqft, variance: 0 };
  }

  const absorbedAmount  = Math.round(effectiveSqft * rate.overheadRatePerSqft);
  const variance        = rate.totalProductionOverhead - absorbedAmount; // + = under, - = over

  // Build GL entry — break down by overhead category for P&L transparency
  const details: any[] = [];
  const total = rate.totalProductionOverhead;
  const proportion = (portion: number) => Math.round(absorbedAmount * (portion / total));

  // Each overhead category gets a proportional absorption credit
  const overheadLines: { accId: string; actual: number; label: string }[] = [
    { accId: accs.ohElec.id,      actual: rate.ownElectricity,    label: 'Electricity — Production' },
    { accId: accs.ohDepr.id,      actual: rate.ownDepreciation,   label: 'Depreciation — Machinery' },
    { accId: accs.ohRepairC.id,   actual: rate.ownMachineRepair,  label: 'Machine Repairs' },
    { accId: accs.consums.id,     actual: rate.ownConsumables,    label: 'Production Consumables' },
    { accId: accs.ohFactElec.id,  actual: rate.sharedElectricity, label: 'Factory OH — Electricity' },
    { accId: accs.ohFactDepr.id,  actual: rate.sharedDepreciation,label: 'Factory OH — Depreciation' },
    { accId: accs.ohFactMaint.id, actual: rate.sharedMaintFuel,   label: 'Factory OH — Maintenance+Fuel' },
    { accId: accs.ohFactRent.id,  actual: rate.sharedRent,        label: 'Factory OH — Rent' },
  ].filter(l => l.actual > 0);

  // Dr each overhead account for its proportional absorbed portion
  let debitTotal = 0;
  overheadLines.forEach((line, i) => {
    const amt = i < overheadLines.length - 1
      ? proportion(line.actual)
      : absorbedAmount - debitTotal; // last line takes remainder to avoid rounding gap
    debitTotal += amt;
    details.push({
      accountId: line.accId,
      debit: amt, credit: 0,
      text: `Overhead absorbed — ${line.label} (${effectiveSqft.toFixed(0)} sqft × PKR ${rate.overheadRatePerSqft}/sqft)`,
    });
  });

  // Cr Overhead Absorbed (clearing/contra) — net reduces total overhead on P&L
  details.push({
    accountId: accs.ohAbsorbed.id,
    debit: 0, credit: absorbedAmount,
    text: `Production Overhead Absorbed — ${month} | ${effectiveSqft.toFixed(0)} sqft × PKR ${rate.overheadRatePerSqft}/sqft | Variance PKR ${variance.toLocaleString()} (${variance >= 0 ? 'under' : 'over'}-absorbed)`,
  });

  const today = new Date().toISOString().split('T')[0];
  FinanceService.recordTransaction({
    id: txId, company, docType: 'JV',
    docDate: today, date: today,
    description: `Production Overhead Absorption — ${company} ${month} | Rate PKR ${rate.overheadRatePerSqft}/sqft | Absorbed PKR ${absorbedAmount.toLocaleString()} on ${effectiveSqft.toFixed(0)} sqft | Variance PKR ${variance.toLocaleString()}`,
    referenceId: month,
    status: 'Posted',
    details,
  } as any);

  return { txId, absorbedAmount, deliveredSqft: effectiveSqft, rate: rate.overheadRatePerSqft, variance };
}

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
