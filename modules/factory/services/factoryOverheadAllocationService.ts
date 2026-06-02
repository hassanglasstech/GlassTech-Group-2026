/**
 * factoryOverheadAllocationService.ts
 *
 * Factory is a shared cost-centre for GTK, Glassco, and Nippon.
 * It has NO revenue — only assets and expenses.
 *
 * Month-end allocation flow:
 *  1. Collect all Factory overhead for the month from the GL
 *     (electricity, depreciation, fuel, maintenance, rent, salaries, other)
 *  2. Apply fixed allocation ratios: GTK 50% | Glassco 30% | Nippon 20%
 *  3. Also compute overhead RATE per sqft (total overhead / total sqft across all companies)
 *     — used for management reporting and IAS 2 COGS absorption
 *  4. Post GL entries in all four books:
 *     ─ Factory  : Dr Receivable (GTK/Glassco/Nippon) / Cr Cost Allocated (58111-58113)
 *     ─ GTK      : Dr Production Overhead — Factory / Cr Intercompany Payable
 *     ─ Glassco  : Dr Production Overhead — Factory / Cr Intercompany Payable
 *     ─ Nippon   : Dr Production Overhead — Factory / Cr Intercompany Payable
 *
 * IFRS / IAS 2 Compliance:
 *  • IAS 2.12-13: Fixed & variable production overheads must be systematically
 *    allocated to cost of conversion using a basis reflecting normal capacity.
 *  • Using fixed 50/30/20 ratios is a management accounting decision and is
 *    acceptable as a "systematic basis" under IAS 2.13 provided the ratios
 *    reflect each company's proportional use of the shared facility.
 *  • The sqft-based rate (PKR/sqft) is an additional measure for COGS absorption
 *    within each company — consistent with IAS 2.13 "normal capacity" principle.
 *  • Period costs (admin salaries, stationery) are separated from production
 *    overhead and expensed as P&L items, not absorbed into inventory (IAS 2.16).
 *  • IAS 24: Intercompany transactions are disclosed as related-party transactions.
 *
 * Industrial Practice:
 *  • Two-stage allocation: Factory → Companies (stage 1) then Company → Products (stage 2)
 *  • Also known as "Shared Service Centre" (SSC) or "Service Cost Centre" recharge
 *  • 50/30/20 fixed key is equivalent to a "transfer pricing" arrangement
 *  • Sqft rate is the "predetermined overhead absorption rate" for COGS inclusion
 */

import { FinanceService }  from '@/modules/finance/services/financeService';
import { LabourService }   from '@/modules/production/services/labourService';
import { ProductionCostService } from '@/modules/production/services/productionCostService';
import { Company }         from '@/modules/shared/types/core';

// ── Constants ──────────────────────────────────────────────────────

const ALLOCATION_RATIOS: Record<string, number> = {
  GTK:     0.50,   // 50%
  Glassco: 0.30,   // 30%
  Nippon:  0.20,   // 20%
};

/** Factory expense account code prefixes that qualify as PRODUCTION overhead
 *  (IAS 2.13 — absorbed into inventory/COGS via conversion cost).
 *  Admin/compliance (52xxx, 56xxx) are PERIOD costs — go directly to P&L. */
const PRODUCTION_OVERHEAD_PREFIXES = [
  '511',  // Rent & Occupancy
  '512',  // Utilities (Electricity, Gas, Water)
  '53',   // Vehicle & Transport (Shehzore)
  '54',   // Power Backup (Generator, UPS)
  '55',   // Repair & Maintenance
  '57',   // Depreciation
];

const PERIOD_COST_PREFIXES = [
  '52',   // Salaries & Wages
  '56',   // Admin & Compliance
  '58',   // (Cost Allocation — skip to avoid double-counting)
  '59',   // Welfare / Write-offs
];

// ── Types ──────────────────────────────────────────────────────────

export interface OverheadCategoryBreakdown {
  electricity:    number;
  depreciation:   number;
  fuel:           number;
  maintenance:    number;
  rent:           number;
  transport:      number;
  adminSalaries:  number;   // period cost (P&L, NOT COGS)
  other:          number;
  total:          number;
  productionTotal: number;  // subset eligible for COGS absorption (IAS 2)
  periodTotal:     number;  // admin/other — P&L only
}

export interface CompanyAllocation {
  company:        Company;
  ratio:          number;   // e.g. 0.50
  productionShare: number;  // PKR — goes to COGS/production overhead
  periodShare:     number;  // PKR — goes to P&L admin overhead
  totalShare:      number;  // PKR — total charge
  overheadRatePerSqft: number;  // PKR/sqft = productionShare / companySqft
  companySqft:    number;
}

export interface FactoryAllocationResult {
  month:           string;
  overhead:        OverheadCategoryBreakdown;
  totalSqftAllCompanies: number;
  blendedRatePerSqft: number;   // total production overhead / total sqft
  allocations:     CompanyAllocation[];
  isPosted:        boolean;
  txId:            string;
}

// ── Helpers ────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Classify Factory GL line by account code prefix */
function classifyFactoryLine(accountCode: string, amount: number): Partial<OverheadCategoryBreakdown> {
  const code = (accountCode || '').replace(/\./g, '');
  if (code.startsWith('512'))       return { electricity: amount };      // 51211 etc.
  if (code.startsWith('57'))        return { depreciation: amount };
  if (code.startsWith('541') || code.startsWith('542')) return { fuel: amount };  // generator fuel
  if (code.startsWith('53111') || code.startsWith('53112') || code.startsWith('53211'))
                                     return { fuel: amount };             // shehzore fuel + bike
  if (code.startsWith('55'))        return { maintenance: amount };
  if (code.startsWith('511'))       return { rent: amount };             // rent & occupancy
  if (code.startsWith('53'))        return { transport: amount };        // shehzore other costs
  if (code.startsWith('52'))        return { adminSalaries: amount };    // salaries (period)
  return                              { other: amount };
}

function isProductionOverheadCode(code: string): boolean {
  const c = (code || '').replace(/\./g, '');
  if (PERIOD_COST_PREFIXES.some(p => c.startsWith(p))) return false;
  return PRODUCTION_OVERHEAD_PREFIXES.some(p => c.startsWith(p));
}

/** Pull all Factory expense postings for the month from the ledger */
function collectFactoryOverhead(month: string): OverheadCategoryBreakdown {
  const ledger = FinanceService.getLedger().filter(
    t => t.company === 'Factory' as any &&
         t.status === 'Posted' &&
         (t.docDate || t.date || '').startsWith(month)
  );
  const accounts = FinanceService.getAccounts().filter(
    (a: any) => a.company === 'Factory',
  );
  const accMap: Record<string, string> = {};
  accounts.forEach((a: any) => { accMap[a.id] = a.code || ''; });

  const out: OverheadCategoryBreakdown = {
    electricity: 0, depreciation: 0, fuel: 0, maintenance: 0,
    rent: 0, transport: 0, adminSalaries: 0, other: 0,
    total: 0, productionTotal: 0, periodTotal: 0,
  };

  ledger.forEach(tx => {
    (tx.details || []).forEach((d: any) => {
      if ((d.debit || 0) <= 0) return;
      const code = accMap[d.accountId] || '';
      // Skip cost-allocation accounts to avoid double counting
      if (code.startsWith('58')) return;
      const partial = classifyFactoryLine(code, d.debit);
      (Object.keys(partial) as (keyof typeof partial)[]).forEach(k => {
        (out as any)[k] = ((out as any)[k] || 0) + (partial[k] || 0);
      });
      if (isProductionOverheadCode(code)) out.productionTotal += d.debit;
      else                                 out.periodTotal     += d.debit;
    });
  });

  out.total = out.productionTotal + out.periodTotal;
  return out;
}

/** Get total sqft produced by a company in a given month (from cutter daily logs) */
async function getCompanySqft(company: string, month: string): Promise<number> {
  try {
    const logs = await LabourService.getLogs(company);
    return logs
      .filter(l => l.logDate.startsWith(month))
      .reduce((s, l) => s + l.sqftProduced, 0);
  } catch { return 0; }
}

// ── JIT account builders ───────────────────────────────────────────

function factoryRechargeAccounts(company: Company) {
  // Factory side — Cost Recovery Receivables (Asset)
  const asset   = FinanceService.ensureAccount('Factory' as any, 'ASSETS', 1, null, 'Asset', '1');
  const current = FinanceService.ensureAccount('Factory' as any, 'CURRENT ASSETS', 2, asset.id, 'Asset', '11');
  const recvCtrl = FinanceService.ensureAccount('Factory' as any, 'Receivable from Companies', 3, current.id, 'Asset', '112');
  const recvGroup = FinanceService.ensureAccount('Factory' as any, 'Cost Recovery Receivable', 4, recvCtrl.id, 'Asset', '1121');

  const recvMap: Record<string, any> = {
    GTK:     FinanceService.ensureAccount('Factory' as any, 'Receivable — GTK (50% Share)',     5, recvGroup.id, 'Asset', '11211'),
    Glassco: FinanceService.ensureAccount('Factory' as any, 'Receivable — Glassco (30% Share)', 5, recvGroup.id, 'Asset', '11212'),
    Nippon:  FinanceService.ensureAccount('Factory' as any, 'Receivable — Nippon (20% Share)',  5, recvGroup.id, 'Asset', '11213'),
  };

  // Factory side — Cost Allocated (contra-expense, credited at recharge)
  const exp     = FinanceService.ensureAccount('Factory' as any, 'EXPENSES', 1, null, 'Expense', '5');
  const alloc   = FinanceService.ensureAccount('Factory' as any, 'Cost Allocation', 2, exp.id, 'Expense', '58');
  const recovery = FinanceService.ensureAccount('Factory' as any, 'Shared Cost Recovery', 3, alloc.id, 'Expense', '581');

  const allocMap: Record<string, any> = {
    GTK:     FinanceService.ensureAccount('Factory' as any, 'Cost Allocated — GTK (50%)',     4, recovery.id, 'Expense', '58111'),
    Glassco: FinanceService.ensureAccount('Factory' as any, 'Cost Allocated — Glassco (30%)', 4, recovery.id, 'Expense', '58112'),
    Nippon:  FinanceService.ensureAccount('Factory' as any, 'Cost Allocated — Nippon (20%)',  4, recovery.id, 'Expense', '58113'),
  };

  return { recvMap, allocMap };
}

function recipientAccounts(company: Company) {
  // Production Overhead — Factory (COGS component, IAS 2.13)
  const exp  = FinanceService.ensureAccount(company, 'EXPENSES', 1, null, 'Expense', '5');
  const cos  = FinanceService.ensureAccount(company, 'COST OF GOODS SOLD', 2, exp.id, 'Expense', '51');
  const oh   = FinanceService.ensureAccount(company, 'PRODUCTION OVERHEAD', 3, cos.id, 'Expense', '514');
  const mfgOH = FinanceService.ensureAccount(company, 'Manufacturing Overhead', 4, oh.id, 'Expense', '5141');
  const factoryElec = FinanceService.ensureAccount(company, 'Factory Overhead — Electricity & Power', 5, mfgOH.id, 'Expense', '51415');
  const factoryDepr = FinanceService.ensureAccount(company, 'Factory Overhead — Depreciation', 5, mfgOH.id, 'Expense', '51416');
  const factoryMaint = FinanceService.ensureAccount(company, 'Factory Overhead — Maintenance & Fuel', 5, mfgOH.id, 'Expense', '51417');
  const factoryRent  = FinanceService.ensureAccount(company, 'Factory Overhead — Rent & Occupancy', 5, mfgOH.id, 'Expense', '51418');

  // Period costs — Admin Overhead (P&L only, NOT COGS)
  const opex    = FinanceService.ensureAccount(company, 'OPERATING EXPENSES', 2, exp.id, 'Expense', '52');
  const adminOH = FinanceService.ensureAccount(company, 'Factory Admin Allocation', 3, opex.id, 'Expense', '5291');
  const adminAcc = FinanceService.ensureAccount(company, 'Shared Admin Cost — Factory', 4, adminOH.id, 'Expense', '52911');

  // Intercompany Payable — Factory
  const liab   = FinanceService.ensureAccount(company, 'LIABILITIES', 1, null, 'Liability', '2');
  const currL  = FinanceService.ensureAccount(company, 'CURRENT LIABILITIES', 2, liab.id, 'Liability', '21');
  const trade  = FinanceService.ensureAccount(company, 'TRADE & OTHER PAYABLES', 3, currL.id, 'Liability', '211');
  const icoPayable = FinanceService.ensureAccount(company, 'Due to Factory (Shared Cost)', 4, trade.id, 'Liability', '21141');

  return { factoryElec, factoryDepr, factoryMaint, factoryRent, adminAcc, icoPayable };
}

// ══════════════════════════════════════════════════════════════════
// Main Service
// ══════════════════════════════════════════════════════════════════

export const FactoryOverheadAllocationService = {

  /**
   * Preview allocation without posting GL.
   * Use this to show the CFO before committing.
   */
  preview: async (month: string): Promise<FactoryAllocationResult> => {
    const overhead = collectFactoryOverhead(month);
    const txId = `GL-FACTORY-OHA-${month}`;
    const isPosted = FinanceService.getLedger().some((t: any) => t.id === txId);

    // Sqft per company
    const [sqftGTK, sqftGlassco, sqftNippon] = await Promise.all([
      getCompanySqft('GTK', month),
      getCompanySqft('Glassco', month),
      getCompanySqft('Nippon', month),
    ]);
    const totalSqft = sqftGTK + sqftGlassco + sqftNippon;
    const blendedRatePerSqft = totalSqft > 0
      ? round2(overhead.productionTotal / totalSqft)
      : 0;

    const sqftMap: Record<string, number> = {
      GTK: sqftGTK, Glassco: sqftGlassco, Nippon: sqftNippon,
    };

    const allocations: CompanyAllocation[] = (Object.keys(ALLOCATION_RATIOS) as Company[]).map(co => {
      const ratio          = ALLOCATION_RATIOS[co];
      const productionShare = round2(overhead.productionTotal * ratio);
      const periodShare     = round2(overhead.periodTotal * ratio);
      const companySqft     = sqftMap[co] || 0;
      const overheadRatePerSqft = companySqft > 0 ? round2(productionShare / companySqft) : blendedRatePerSqft;

      return {
        company: co,
        ratio,
        productionShare,
        periodShare,
        totalShare: productionShare + periodShare,
        overheadRatePerSqft,
        companySqft,
      };
    });

    return {
      month,
      overhead,
      totalSqftAllCompanies: totalSqft,
      blendedRatePerSqft,
      allocations,
      isPosted,
      txId,
    };
  },

  /**
   * Post month-end GL entries for Factory overhead allocation.
   *
   * GL entries created:
   *
   * FACTORY (Recharge — cost recovery):
   *   Dr 11211 Receivable — GTK         → GTK's share
   *   Dr 11212 Receivable — Glassco     → Glassco's share
   *   Dr 11213 Receivable — Nippon      → Nippon's share
   *   Cr 58111 Cost Allocated — GTK     → GTK share (contra-expense)
   *   Cr 58112 Cost Allocated — Glassco → Glassco share
   *   Cr 58113 Cost Allocated — Nippon  → Nippon share
   *
   * EACH RECIPIENT COMPANY (Overhead absorption):
   *   Dr 514xx Production Overhead — Factory Electricity    → production share (COGS)
   *   Dr 514xx Production Overhead — Factory Depreciation   → production share (COGS)
   *   Dr 514xx Production Overhead — Factory Maintenance    → production share (COGS)
   *   Dr 514xx Production Overhead — Factory Rent           → production share (COGS)
   *   Dr 52911 Shared Admin Cost — Factory                  → admin/period share (P&L)
   *   Cr 21141 Due to Factory (Intercompany Payable)        → total share
   */
  post: async (month: string, postedBy: string = 'system'): Promise<FactoryAllocationResult> => {
    const result = await FactoryOverheadAllocationService.preview(month);
    const { txId, overhead, allocations } = result;

    // Guard: already posted
    if (result.isPosted) {
      console.warn(`[FactoryOHA] ${txId} already posted — skipping.`);
      return { ...result, isPosted: true };
    }

    if (overhead.total <= 0) {
      console.warn(`[FactoryOHA] No Factory overhead found for ${month} — nothing to post.`);
      return result;
    }

    const today  = new Date().toISOString().split('T')[0];
    const factoryAccs = factoryRechargeAccounts('Factory' as any);

    // ── Factory GL: Recharge entry ────────────────────────────────
    const factoryDetails: any[] = [];
    allocations.forEach(alloc => {
      factoryDetails.push({
        accountId: factoryAccs.recvMap[alloc.company].id,
        debit: alloc.totalShare, credit: 0,
        text: `Cost Recovery — ${alloc.company} (${(alloc.ratio * 100).toFixed(0)}%) for ${month}`,
      });
    });
    allocations.forEach(alloc => {
      factoryDetails.push({
        accountId: factoryAccs.allocMap[alloc.company].id,
        debit: 0, credit: alloc.totalShare,
        text: `Cost Allocated to ${alloc.company} — ${month} | Prod PKR ${alloc.productionShare.toLocaleString()} | Admin PKR ${alloc.periodShare.toLocaleString()}`,
      });
    });

    FinanceService.recordTransaction({
      id: txId,
      company: 'Factory' as any,
      docType: 'JV',
      docDate: today, date: today,
      description: `Factory Overhead Allocation — ${month} | Total PKR ${overhead.total.toLocaleString()} | GTK 50% Glassco 30% Nippon 20%`,
      referenceId: month,
      status: 'Posted',
      details: factoryDetails,
    } as any);

    // ── Recipient Companies GL entries ────────────────────────────
    allocations.forEach(alloc => {
      const co    = alloc.company;
      const accs  = recipientAccounts(co);
      const recTxId = `GL-FACTORY-OHA-${month}-${co}`;

      // Guard individual company entry
      if (FinanceService.getLedger().some((t: any) => t.id === recTxId)) return;

      // Split production overhead by sub-category (proportional to Factory actuals)
      const prodTotal = overhead.productionTotal || 1;
      const share     = alloc.productionShare;
      const details: any[] = [];

      if (overhead.electricity > 0) {
        const elecShare = round2(share * overhead.electricity / prodTotal);
        details.push({
          accountId: accs.factoryElec.id, debit: elecShare, credit: 0,
          text: `Factory electricity share (${(alloc.ratio * 100).toFixed(0)}%) — ${month}`,
        });
      }
      if (overhead.depreciation > 0) {
        const deprShare = round2(share * overhead.depreciation / prodTotal);
        details.push({
          accountId: accs.factoryDepr.id, debit: deprShare, credit: 0,
          text: `Factory depreciation share (${(alloc.ratio * 100).toFixed(0)}%) — ${month}`,
        });
      }
      const maintFuel = overhead.maintenance + overhead.fuel + overhead.transport;
      if (maintFuel > 0) {
        const maintShare = round2(share * maintFuel / prodTotal);
        details.push({
          accountId: accs.factoryMaint.id, debit: maintShare, credit: 0,
          text: `Factory maintenance & fuel share (${(alloc.ratio * 100).toFixed(0)}%) — ${month}`,
        });
      }
      if (overhead.rent > 0) {
        const rentShare = round2(share * overhead.rent / prodTotal);
        details.push({
          accountId: accs.factoryRent.id, debit: rentShare, credit: 0,
          text: `Factory rent share (${(alloc.ratio * 100).toFixed(0)}%) — ${month}`,
        });
      }
      if (alloc.periodShare > 0) {
        details.push({
          accountId: accs.adminAcc.id, debit: alloc.periodShare, credit: 0,
          text: `Factory admin overhead share (${(alloc.ratio * 100).toFixed(0)}%) — ${month}`,
        });
      }

      // Credit: Due to Factory (Intercompany Payable)
      details.push({
        accountId: accs.icoPayable.id, debit: 0, credit: alloc.totalShare,
        text: `Factory recharge payable — ${month} | PKR ${alloc.totalShare.toLocaleString()} | Rate PKR ${alloc.overheadRatePerSqft}/sqft`,
      });

      FinanceService.recordTransaction({
        id: recTxId,
        company: co,
        docType: 'JV',
        docDate: today, date: today,
        description: `Factory Overhead — ${co} share (${(alloc.ratio * 100).toFixed(0)}%) for ${month} | PKR ${alloc.totalShare.toLocaleString()} | Rate PKR ${alloc.overheadRatePerSqft}/sqft on ${alloc.companySqft.toFixed(0)} sqft`,
        referenceId: month,
        status: 'Posted',
        details,
      } as any);
    });

    return { ...result, isPosted: true };
  },

  /**
   * Reverse a posted month-end allocation.
   * Creates mirror journal entries (Cr/Dr swapped) with REV- prefix.
   */
  reverse: (month: string, actor: string = 'system'): void => {
    const txId    = `GL-FACTORY-OHA-${month}`;
    const revId   = `REV-${txId}`;
    const ledger  = FinanceService.getLedger();

    if (ledger.some((t: any) => t.id === revId)) {
      console.warn(`[FactoryOHA] Already reversed: ${revId}`);
      return;
    }

    const today   = new Date().toISOString().split('T')[0];
    const toReverse = ledger.filter((t: any) =>
      t.id === txId ||
      t.id === `${txId}-GTK` ||
      t.id === `${txId}-Glassco` ||
      t.id === `${txId}-Nippon`
    );

    if (toReverse.length === 0) {
      console.warn(`[FactoryOHA] No entries found to reverse for ${month}`);
      return;
    }

    const reversals = toReverse.map((t: any) => ({
      ...t,
      id: `REV-${t.id}`,
      docDate: today, date: today,
      description: `[REVERSAL by ${actor}] ${t.description}`,
      details: (t.details || []).map((d: any) => ({
        ...d,
        debit:  d.credit,
        credit: d.debit,
      })),
    }));

    FinanceService.saveLedger([...ledger, ...reversals]);
  },
};
