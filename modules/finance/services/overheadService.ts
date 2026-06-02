/**
 * overheadService.ts -- Financial Layer Phase 3
 *
 * Overhead Pool: collect indirect costs (category H auxiliary cost centers)
 * and allocate them to production cost centers (category F) using basis:
 *   - Headcount
 *   - Sqft produced
 *   - Equal split
 *   - Manual %
 */

import { FinanceService } from './financeService';
import { HRService } from '@/modules/hr/services/hrService';
import { ProductionService } from '@/modules/production/services/productionService';
import { Company } from '@/modules/shared/types/core';

const round2 = (n: number) => Math.round(n * 100) / 100;
const curMonth = () => new Date().toISOString().slice(0, 7);

const OVERHEAD_POOL_KEY = 'gtk_erp_overhead_pools';

// ── Types ──────────────────────────────────────────────────────────────────

export type AllocationBasis = 'headcount' | 'sqft' | 'equal' | 'manual';

export interface OverheadPool {
  id:          string;
  company:     Company;
  name:        string;
  sourceCCId:  string;   // H category cost center collecting overhead
  basis:       AllocationBasis;
  active:      boolean;
}

export interface AllocationTarget {
  costCenterId:   string;
  costCenterName: string;
  costCenterCode: string;
  basisValue:     number;   // headcount / sqft / manual%
  basisPct:       number;   // calculated %
  allocatedAmount:number;
}

export interface OverheadAllocationResult {
  pool:              OverheadPool;
  month:             string;
  totalOverhead:     number;
  totalBasisValue:   number;
  targets:           AllocationTarget[];
  journalEntries: {
    description: string;
    debit:  { costCenterId: string; amount: number };
    credit: { costCenterId: string; amount: number };
  }[];
}

// ── Storage ────────────────────────────────────────────────────────────────

export const loadPools = (): OverheadPool[] => {
  try { return JSON.parse(localStorage.getItem(OVERHEAD_POOL_KEY) || '[]'); } catch { return []; }
};
export const savePools = (d: OverheadPool[]) => {
  try { localStorage.setItem(OVERHEAD_POOL_KEY, JSON.stringify(d)); } catch {}
};

// ── Helpers ────────────────────────────────────────────────────────────────

function getCCActualSpend(company: Company, ccId: string, month: string): number {
  const ledger = FinanceService.getLedger().filter(
    t => t.company === company && t.status === 'Posted' &&
         (t.docDate || t.date || '').startsWith(month)
  );
  return ledger.reduce((sum, tx) => {
    const lines = (tx as any).details || [];
    return sum + lines
      .filter((d: any) => d.costCenterId === ccId)
      .reduce((s: number, d: any) => s + (d.debit || 0), 0);
  }, 0);
}

function getHeadcountByCC(company: Company): Record<string, number> {
  const emps = HRService.getEmployees().filter(e => e.company === company);
  const map: Record<string, number> = {};
  emps.forEach(e => {
    const dept = e.work?.department || 'Unassigned';
    map[dept] = (map[dept] || 0) + 1;
  });
  return map;
}

function getSqftByCC(company: Company, month: string): Record<string, number> {
  const pieces = ProductionService.getProductionPieces().filter((p: any) =>
    (p.company === company || !p.company) &&
    (p.createdAt || p.date || '').startsWith(month) &&
    p.status !== 'Broken'
  );
  // Group by cost center via piece metadata (fallback: all to one CC)
  const map: Record<string, number> = {};
  pieces.forEach((p: any) => {
    const ccId = p.costCenterId || 'PRODUCTION';
    map[ccId] = (map[ccId] || 0) + (p.sqft || p.totalSqft || 3.5);
  });
  return map;
}

// ── Service ────────────────────────────────────────────────────────────────

export const OverheadService = {

  getPools: (company: Company): OverheadPool[] =>
    loadPools().filter(p => p.company === company),

  savePool: (pool: OverheadPool): void => {
    const all = loadPools();
    const idx = all.findIndex(p => p.id === pool.id);
    if (idx >= 0) all[idx] = pool; else all.push(pool);
    savePools(all);
  },

  deletePool: (id: string): void => {
    savePools(loadPools().filter(p => p.id !== id));
  },

  // ── Core: calculate allocation for one pool one month ────────────
  allocate(
    pool: OverheadPool,
    month: string,
    manualPcts?: Record<string, number>  // costCenterId -> %
  ): OverheadAllocationResult {
    const company = pool.company;
    const allCCs  = FinanceService.getCostCenters().filter(c => c.company === company);

    // Source: actual spend on the overhead pool cost center
    const totalOverhead = getCCActualSpend(company, pool.sourceCCId, month);

    // Production cost centers (category F) = allocation targets
    const prodCCs = allCCs.filter(cc => cc.category === 'F');

    // Determine basis values per target
    let basisMap: Record<string, number> = {};

    if (pool.basis === 'headcount') {
      const hcMap = getHeadcountByCC(company);
      prodCCs.forEach(cc => {
        basisMap[cc.id] = hcMap[cc.department] || hcMap[cc.name] || 0;
      });
    } else if (pool.basis === 'sqft') {
      const sqftMap = getSqftByCC(company, month);
      prodCCs.forEach(cc => {
        basisMap[cc.id] = sqftMap[cc.id] || sqftMap['PRODUCTION'] || 0;
      });
    } else if (pool.basis === 'equal') {
      prodCCs.forEach(cc => { basisMap[cc.id] = 1; });
    } else if (pool.basis === 'manual' && manualPcts) {
      prodCCs.forEach(cc => { basisMap[cc.id] = manualPcts[cc.id] || 0; });
    }

    const totalBasisValue = Object.values(basisMap).reduce((s, v) => s + v, 0);

    const targets: AllocationTarget[] = prodCCs.map(cc => {
      const basisValue = basisMap[cc.id] || 0;
      const basisPct   = totalBasisValue > 0 ? round2(basisValue / totalBasisValue * 100) : 0;
      const allocated  = round2(totalOverhead * basisPct / 100);
      return {
        costCenterId:    cc.id,
        costCenterName:  cc.name,
        costCenterCode:  cc.code,
        basisValue,
        basisPct,
        allocatedAmount: allocated,
      };
    }).filter(t => t.basisValue > 0);

    // Journal entries: Dr Production CC / Cr Overhead Pool CC
    const sourceName = allCCs.find(c => c.id === pool.sourceCCId)?.name || pool.sourceCCId;
    const journalEntries = targets.map(t => ({
      description: pool.name + ' allocation to ' + t.costCenterName,
      debit:  { costCenterId: t.costCenterId,   amount: t.allocatedAmount },
      credit: { costCenterId: pool.sourceCCId,  amount: t.allocatedAmount },
    }));

    return {
      pool,
      month,
      totalOverhead: round2(totalOverhead),
      totalBasisValue: round2(totalBasisValue),
      targets,
      journalEntries,
    };
  },

  // ── Run all active pools ─────────────────────────────────────────
  allocateAll(company: Company, month?: string): OverheadAllocationResult[] {
    const mon   = month || curMonth();
    const pools = OverheadService.getPools(company).filter(p => p.active);
    return pools.map(pool => OverheadService.allocate(pool, mon));
  },

  // ── Summary for dashboard ────────────────────────────────────────
  getSummary(company: Company, month?: string): {
    totalPooled:   number;
    totalAllocated:number;
    unallocated:   number;
    poolCount:     number;
    results:       OverheadAllocationResult[];
  } {
    const results      = OverheadService.allocateAll(company, month);
    const totalPooled  = results.reduce((s, r) => s + r.totalOverhead, 0);
    const totalAllocated = results.reduce(
      (s, r) => s + r.targets.reduce((ts, t) => ts + t.allocatedAmount, 0), 0
    );
    return {
      totalPooled:     round2(totalPooled),
      totalAllocated:  round2(totalAllocated),
      unallocated:     round2(totalPooled - totalAllocated),
      poolCount:       results.length,
      results,
    };
  },
};
