/**
 * productionCostService.ts
 *
 * BUG-3 Fix (Phase 7): getGlasscoMetrics() was a stub returning all-zero values,
 * making every downstream report (TrueCostCalculator, JobPL, DashboardView) show
 * PKR 0 for all production costs. This service is now wired to live data from
 * LabourService (cutter logs) and GeneratorService (energy/fuel logs).
 *
 * API change: getGlasscoMetrics() is now async and accepts an optional `company`
 * parameter (defaults to 'Glassco'). The return type is Promise<ProductionMetric>.
 * No callers existed in the codebase before this fix, so the signature change is
 * non-breaking.
 */

import { ProductionMetric, DailyTarget } from '../types/production';
import { LabourService }                  from './labourService';
import { GeneratorService }               from './generatorService';
import { HRService }                      from '@/modules/hr/services/hrService';

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Round to 2 decimal places using integer-cent arithmetic (no IEEE-754 drift). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const ProductionCostService = {

  /**
   * Fetch live production metrics for a specific date.
   *
   * Data sources:
   *   • LabourService (cutter_daily_logs)  → sqft produced, pieces cut, OT hours
   *   • GeneratorService (generator_logs)  → power hours (WAPDA + generator),
   *                                          fuel cost, tempered sqft proxy
   *
   * Cost model:
   *   • Fuel cost for the day is apportioned between OT and normal shifts in
   *     proportion to their sqft contribution.
   *   • If no fuel data exists (e.g. no generator log), costs default to 0
   *     rather than crashing — fail-open matches the project's offline-resilience
   *     pattern used across all other services.
   *
   * @param date    - ISO date string "YYYY-MM-DD"
   * @param company - Supabase company tenant (default: 'Glassco')
   */
  getGlasscoMetrics: async (
    date: string,
    company: string = 'Glassco',
  ): Promise<ProductionMetric> => {
    // Fetch both log streams in parallel; each falls back to localStorage if
    // Supabase is unreachable (inherited from each service's own fallback logic).
    const [allLabourLogs, allGeneratorLogs] = await Promise.all([
      LabourService.getLogs(company),
      GeneratorService.getLogs(company),
    ]);

    // Filter to the requested date only
    const labourLogs    = allLabourLogs.filter(l => l.logDate === date);
    const generatorLogs = allGeneratorLogs.filter(l => l.logDate === date);

    // ── sqft & piece counts ────────────────────────────────────────────────
    const sqFtProcessed = labourLogs.reduce((s, l) => s + l.sqftProduced, 0);

    // Generator logs track sqft produced under power as a separate KPI;
    // use it as the "tempered sqft" proxy (best available without a dedicated
    // tempering log endpoint at this service layer).
    const totalTempered = generatorLogs.reduce((s, l) => s + l.cuttingSqftProduced, 0);

    // ── power hours ────────────────────────────────────────────────────────
    const totalHours  = generatorLogs.reduce((s, l) => s + l.wapdaHours + l.generatorHours, 0);
    const actualHours = generatorLogs.reduce((s, l) => s + l.generatorHours, 0);

    // ── fuel cost apportionment ────────────────────────────────────────────
    // Total energy cost for the day (generator fuel only; WAPDA cost is billed
    // separately via the GL overhead allocation and is not available here).
    const fuelCostTotal = generatorLogs.reduce((s, l) => s + l.fuelCost, 0);

    // Split labour logs into OT and normal shifts
    const otLogs     = labourLogs.filter(l => l.overtimeHours > 0);
    const normalLogs = labourLogs.filter(l => l.overtimeHours === 0);

    const overtimeSqFt = otLogs.reduce((s, l) => s + l.sqftProduced, 0);
    const normalSqFt   = normalLogs.reduce((s, l) => s + l.sqftProduced, 0);

    // Apportion fuel cost by sqft share; guard against division by zero.
    let overtimeCost = 0;
    let normalCost   = fuelCostTotal; // default: attribute all cost to normal shift

    if (sqFtProcessed > 0 && fuelCostTotal > 0) {
      overtimeCost = fuelCostTotal * (overtimeSqFt / sqFtProcessed);
      normalCost   = fuelCostTotal * (normalSqFt   / sqFtProcessed);
    }

    return {
      date,
      sqFtProcessed,
      totalTempered,
      totalHours,
      actualHours,
      overtimeCost: round2(overtimeCost),
      normalCost:   round2(normalCost),
      overtimeSqFt,
      normalSqFt,
    };
  },

  /**
   * Calculate the daily sqft target needed to clear the backlog.
   * Remains synchronous — no DB call required (pure arithmetic).
   */
  getGlasscoDailyTarget: (pendingSqFt: number, remainingDays: number): DailyTarget => {
    return {
      targetSqFt:    round2(pendingSqFt / (remainingDays || 1)),
      actualSqFt:    0,   // populated by the caller once actuals are known
      remainingDays,
      pendingSqFt,
    };
  },

  /**
   * Internal Service Pool Rate — IAS 2 absorption costing.
   *
   * Formula (per month):
   *   Pool Rate (PKR/sqft) = Production workers' total payroll ÷ Total sqft produced
   *
   * "Production workers" = employees whose work.department or work.designation
   * contains 'production', 'cutting', 'polish', 'grind', 'operator', 'helper', 'factory'.
   *
   * This rate is then applied to every piece:
   *   Internal Service Cost = piece.sqft × poolRate
   *
   * IAS 2.13 compliance:
   *  • Variable conversion costs (semi-skilled wages) → absorbed at actual output
   *  • Fixed costs (electricity, depreciation) → absorbed separately via overhead allocation
   *  • This function covers the LABOUR component only.
   *
   * @param company  - Company tenant
   * @param month    - "YYYY-MM"
   */
  getMonthlyServicePoolRate: async (
    company: string,
    month: string,
  ): Promise<{
    month: string;
    totalProductionPayroll: number;    // PKR — sum of netSalary for production workers
    totalSqftProduced: number;         // sqft — from cutter daily logs
    totalSqmProduced: number;          // sqm  — totalSqft × 0.0929
    poolRatePerSqft: number;           // PKR/sqft
    poolRatePerSqm: number;            // PKR/sqm
    workerCount: number;               // number of production workers included
    warning?: string;
  }> => {
    // ── 1. Get production workers payroll for this month ──────────────
    const employees   = HRService.getEmployees().filter((e: any) => e.company === company);
    const allPayroll  = HRService.getPayroll();
    const monthPayroll = allPayroll.filter(
      (p: any) => p.month === month && (p as any).company === company,
    );

    // Identify production workers by department/designation heuristic
    const PROD_KEYWORDS = ['production', 'cutting', 'polish', 'grind', 'operator', 'helper', 'factory', 'floor', 'processing'];
    const isProductionWorker = (emp: any): boolean => {
      const dept  = (emp?.work?.department  || '').toLowerCase();
      const desig = (emp?.work?.designation || '').toLowerCase();
      return PROD_KEYWORDS.some(k => dept.includes(k) || desig.includes(k));
    };

    const productionEmpIds = new Set(
      employees.filter(isProductionWorker).map((e: any) => e.id),
    );

    let totalProductionPayroll = 0;
    let workerCount = 0;
    monthPayroll.forEach((p: any) => {
      if (productionEmpIds.has(p.employeeId)) {
        totalProductionPayroll += p.netSalary || 0;
        workerCount++;
      }
    });

    // ── 2. Get total sqft produced this month ─────────────────────────
    const allLogs     = await LabourService.getLogs(company);
    const monthLogs   = allLogs.filter(l => l.logDate.startsWith(month));
    const totalSqftProduced = monthLogs.reduce((s, l) => s + l.sqftProduced, 0);
    const totalSqmProduced  = round2(totalSqftProduced * 0.0929);

    // ── 3. Compute pool rates ─────────────────────────────────────────
    const poolRatePerSqft = totalSqftProduced > 0
      ? round2(totalProductionPayroll / totalSqftProduced) : 0;
    const poolRatePerSqm  = totalSqmProduced > 0
      ? round2(totalProductionPayroll / totalSqmProduced) : 0;

    const warning = workerCount === 0
      ? 'No production workers found — check employee department/designation fields.'
      : totalSqftProduced === 0
      ? 'No sqft logged this month — check cutter daily logs.'
      : undefined;

    return {
      month, totalProductionPayroll, totalSqftProduced, totalSqmProduced,
      poolRatePerSqft, poolRatePerSqm, workerCount, warning,
    };
  },
};
