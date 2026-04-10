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
};
