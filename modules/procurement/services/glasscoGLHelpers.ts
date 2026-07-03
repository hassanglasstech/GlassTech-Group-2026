// ============================================================================
// glasscoGLHelpers — GL account builder + cost/rate data helpers
// Extracted verbatim from glasscoGLService.ts (H6 decomposition, behaviour-
// neutral). Re-exported from glasscoGLService.ts so external import paths are
// unchanged.
// ============================================================================
import { FinanceService } from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { Company } from '@/modules/shared/types/core';

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
export const PRODUCTION_OVERHEAD_CODES = [
  '51121',  // Cutting Consumables       — Glassco own
  '51122',  // Processing Consumables    — Glassco own
  '51123',  // Packaging — Cost          — Glassco own (if applicable)
  '51415',  // Factory Overhead — Electricity   (30% Factory LESCO bill)
  '51416',  // Factory Overhead — Depreciation  (30% Factory building + generators)
  '51417',  // Factory Overhead — Maintenance & Fuel (30% Factory R&M + fuel)
  '51418',  // Factory Overhead — Rent           (30% Factory rent)
];

// ── Standard service labor cost rates (PKR/sqft) ─────────────────
export const SERVICE_LABOR_RATES: Record<string, number> = {
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

export function getVendorRatesByMm(vendorName: string): Record<string, number> {
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

export function glassAccounts(company: Company) {
  const assets   = FinanceService.ensureAccount(company, 'ASSETS',              1, null,       'Asset',   '10');
  const current  = FinanceService.ensureAccount(company, 'CURRENT ASSETS',      2, assets.id,  'Asset',   '11');
  const inv      = FinanceService.ensureAccount(company, 'INVENTORY',           3, current.id, 'Asset',   '115');
  const glassInv  = FinanceService.ensureAccount(company, 'Glass Inventory — Raw',   4, inv.id, 'Asset',   '11511');
  const wip       = FinanceService.ensureAccount(company, 'WIP — Glass in Process',  4, inv.id, 'Asset',   '11513');
  // WIP — Direct Labour: receives ALL production wages at payroll time (Option B).
  // Closed to 51311/51312 COGS at delivery. Balance = labour in undelivered WIP.
  // Audit #7 fix: was '11514' (collided with Laminated Glass Stock) / '11515'
  // (collided with Frosted / Decorative Glass) — ensureAccount dedupes by
  // code, so those postings landed on the wrong-named row. Own codes now.
  const wipLabour = FinanceService.ensureAccount(company, 'WIP — Direct Labour',     4, inv.id, 'Asset',   '11523');
  const fg        = FinanceService.ensureAccount(company, 'Finished Goods — Glass',  4, inv.id, 'Asset',   '11533');

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

export function getMAPForMaterial(company: Company, materialId: string): number {
  const store = InventoryService.getStore();
  const item = store.find((i: any) => i.id === materialId && i.company === company);
  return item?.movingAveragePrice || 0;
}

// ── Helper: get piece sqft + material from quotation item ─────────

export function getPieceCostData(piece: any, company: Company): {
  sqft: number; materialId: string | null; map: number; totalCost: number;
} {
  const order = ProductionService.getJobOrders()
    .find((j: any) => j.orderNo === piece.orderId || j.id === piece.orderId);
  if (!order) return { sqft: 0, materialId: null, map: 0, totalCost: 0 };

  const item = (order.items || [])[piece.itemIndex];
  if (!item) return { sqft: 0, materialId: null, map: 0, totalCost: 0 };

  // P1-COGS-QTY: `totalSqFt` is the WHOLE-LINE total (perUnit sqft × qty, set in
  // useQuotations). Every caller of this helper iterates ONE glass piece at a
  // time (a qty=N line spawns N pieces), so charging each piece the whole-line
  // sqft overstated delivery COGS AND inventory relief by a factor of qty.
  // Divide back to per-piece sqft (guard qty=0/undefined → 1, so qty=1 lines
  // that were already correct are byte-unchanged).
  const qty  = Number(item.qty) || 1;
  const sqft = (Number(item.totalSqFt) || 0) / qty;

  // Find matching store item by glass type + thickness
  const store = InventoryService.getStore().filter((s: any) => s.company === company && s.category === 'Raw');
  // QuotationItem field is `glassSize` (e.g. "5mm"); `glassThickness` doesn't exist.
  const thickness = item.glassSize || '';
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
