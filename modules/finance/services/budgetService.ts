/**
 * budgetService.ts — Phase 1: CMA Data Layer
 *
 * Three functions:
 * 1. getBudgetVsActual()  — GL actuals vs cost center budget per month
 * 2. getPettyCashStatus() — float limit vs current unreconciled spend
 * 3. getSalaryByCostCenter() — payroll spend grouped by department
 *
 * No new tables needed — reads from existing:
 *   FinanceService (GL ledger, cost centers, petty cash)
 *   HRService (employees, payroll)
 */

import { FinanceService } from './financeService';
import { HRService } from '@/modules/hr/services/hrService';
import { Company } from '@/modules/shared/types/core';
import { CostCenter } from '../types/finance';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BudgetLine {
  costCenterId:   string;
  costCenterCode: string;
  costCenterName: string;
  department:     string;
  category:       string;
  budgetMonthly:  number;
  actualSpend:    number;
  variance:       number;      // budget - actual (positive = under budget)
  utilisedPct:    number;      // actual / budget × 100
  status:         'OK' | 'WARNING' | 'OVER';
  pettyCashFloat:        number;
  pettyCashMonthlyBudget:number;
  pettyCashSpendThisMonth:number;
}

export interface PettyCashStatus {
  costCenterId:   string;
  costCenterName: string;
  float:          number;   // configured float limit
  spentThisMonth: number;   // total petty cash payments this month
  monthlyBudget:  number;   // configured monthly budget
  monthlyPct:     number;   // spentThisMonth / monthlyBudget × 100
  status:         'OK' | 'WARNING' | 'OVER';
}

export interface SalaryByCostCenter {
  department:     string;
  headcount:      number;
  totalGross:     number;  // sum of basic + allowances
  totalNet:       number;  // sum of net salary from payroll records
  budgetMonthly:  number;  // from cost center with category W (Admin/HR)
  variance:       number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const currentMonth = () => new Date().toISOString().slice(0, 7); // YYYY-MM

/** Sum all POSTED GL debit entries for a given cost center in a given month */
function getActualSpend(
  company: Company,
  costCenterId: string,
  month: string
): number {
  const ledger = FinanceService.getLedger().filter(
    tx => tx.company === company &&
          tx.status === 'Posted' &&
          (tx.docDate || tx.date || '').startsWith(month)
  );

  return ledger.reduce((sum, tx) => {
    const lines = (tx as any).details || [];
    const ccLines = lines.filter((d: any) => d.costCenterId === costCenterId);
    return sum + ccLines.reduce((s: number, d: any) => s + (d.debit || 0), 0);
  }, 0);
}

/** Sum petty cash payments for a cost center in the current month */
function getPettyCashSpend(company: Company, costCenterId: string, month: string): number {
  return FinanceService.getPettyCashEntries()
    .filter(e =>
      e.company === company &&
      e.costCenterId === costCenterId &&
      e.type === 'Payment' &&
      e.status === 'Posted' &&
      e.date.startsWith(month)
    )
    .reduce((sum, e) => sum + e.amount, 0);
}

// ── 1. Budget vs Actual ────────────────────────────────────────────────────

export const BudgetService = {

  getBudgetVsActual(company: Company, month?: string): BudgetLine[] {
    const mon = month || currentMonth();
    const costCenters = FinanceService.getCostCenters().filter(
      cc => cc.company === company
    );

    return costCenters.map(cc => {
      const budgetMonthly        = cc.budgetMonthly        || 0;
      const pettyCashFloat       = cc.pettyCashFloat       || 0;
      const pettyCashMonthlyBudget = cc.pettyCashMonthlyBudget || 0;
      const actualSpend          = getActualSpend(company, cc.id, mon);
      const pettyCashSpend       = getPettyCashSpend(company, cc.id, mon);
      const variance             = budgetMonthly - actualSpend;
      const utilisedPct          = budgetMonthly > 0
        ? Math.round((actualSpend / budgetMonthly) * 100)
        : actualSpend > 0 ? 999 : 0;

      const threshold = cc.alertThreshold || 80;
      const status: BudgetLine['status'] =
        actualSpend > budgetMonthly && budgetMonthly > 0 ? 'OVER' :
        utilisedPct >= threshold                         ? 'WARNING' : 'OK';

      return {
        costCenterId:            cc.id,
        costCenterCode:          cc.code,
        costCenterName:          cc.name,
        department:              cc.department,
        category:                cc.category,
        budgetMonthly,
        actualSpend,
        variance,
        utilisedPct,
        status,
        pettyCashFloat,
        pettyCashMonthlyBudget,
        pettyCashSpendThisMonth: pettyCashSpend,
      };
    });
  },

  // ── Convenience: only alerts (WARNING or OVER) ──────────────────────────
  getBudgetAlerts(company: Company, month?: string): BudgetLine[] {
    return BudgetService.getBudgetVsActual(company, month)
      .filter(l => l.status !== 'OK');
  },

  // ── 2. Petty Cash Status ─────────────────────────────────────────────────
  getPettyCashStatus(company: Company): PettyCashStatus[] {
    const mon = currentMonth();
    const costCenters = FinanceService.getCostCenters().filter(
      cc => cc.company === company && (cc.pettyCashFloat || 0) > 0
    );

    return costCenters.map(cc => {
      const float         = cc.pettyCashFloat        || 0;
      const monthlyBudget = cc.pettyCashMonthlyBudget || 0;
      const spentThisMonth = getPettyCashSpend(company, cc.id, mon);
      const monthlyPct    = monthlyBudget > 0
        ? Math.round((spentThisMonth / monthlyBudget) * 100)
        : 0;

      const status: PettyCashStatus['status'] =
        spentThisMonth > monthlyBudget && monthlyBudget > 0 ? 'OVER' :
        monthlyPct >= 80 ? 'WARNING' : 'OK';

      return {
        costCenterId:   cc.id,
        costCenterName: cc.name,
        float,
        spentThisMonth,
        monthlyBudget,
        monthlyPct,
        status,
      };
    });
  },

  // ── 3. Salary by Cost Center (Department) ───────────────────────────────
  getSalaryByCostCenter(company: Company, month?: string): SalaryByCostCenter[] {
    const mon     = month || currentMonth();
    const emps    = HRService.getEmployees().filter(e => e.company === company);
    const payroll = HRService.getPayroll().filter(
      p => p.month === mon
    );
    const costCenters = FinanceService.getCostCenters().filter(
      cc => cc.company === company
    );

    // Group employees by department
    const deptMap: Record<string, {
      headcount: number;
      totalGross: number;
      totalNet: number;
    }> = {};

    emps.forEach(emp => {
      const dept = emp.work?.department || 'Unassigned';
      if (!deptMap[dept]) deptMap[dept] = { headcount: 0, totalGross: 0, totalNet: 0 };
      deptMap[dept].headcount += 1;

      // Add gross salary from employee record
      const gross = (emp.salary?.basic || 0) +
                    (emp.salary?.houseRent || 0) +
                    (emp.salary?.conveyance || 0) +
                    (emp.salary?.specialAllowance || 0) +
                    (emp.salary?.medicalAllowance || 0) +
                    (emp.salary?.fuelAllowance || 0);
      deptMap[dept].totalGross += gross;

      // Add net salary from payroll record if exists
      const pr = payroll.find(p => p.employeeId === emp.id);
      if (pr) deptMap[dept].totalNet += pr.netSalary || 0;
    });

    return Object.entries(deptMap).map(([dept, data]) => {
      // Find matching cost center by department name
      const cc = costCenters.find(
        c => c.department.toLowerCase() === dept.toLowerCase() ||
             c.name.toLowerCase().includes(dept.toLowerCase())
      );
      const budgetMonthly = cc?.budgetMonthly || 0;

      return {
        department:    dept,
        headcount:     data.headcount,
        totalGross:    Math.round(data.totalGross),
        totalNet:      Math.round(data.totalNet),
        budgetMonthly,
        variance:      budgetMonthly - Math.round(data.totalGross),
      };
    }).sort((a, b) => b.totalGross - a.totalGross);
  },

  // ── Summary totals for dashboard widget ─────────────────────────────────
  getSummary(company: Company, month?: string): {
    totalBudget: number;
    totalActual: number;
    totalVariance: number;
    overBudgetCount: number;
    warningCount: number;
    pettyCashOK: number;
    pettyCashWarning: number;
  } {
    const lines = BudgetService.getBudgetVsActual(company, month);
    const pc    = BudgetService.getPettyCashStatus(company);

    return {
      totalBudget:      lines.reduce((s, l) => s + l.budgetMonthly, 0),
      totalActual:      lines.reduce((s, l) => s + l.actualSpend, 0),
      totalVariance:    lines.reduce((s, l) => s + l.variance, 0),
      overBudgetCount:  lines.filter(l => l.status === 'OVER').length,
      warningCount:     lines.filter(l => l.status === 'WARNING').length,
      pettyCashOK:      pc.filter(p => p.status === 'OK').length,
      pettyCashWarning: pc.filter(p => p.status !== 'OK').length,
    };
  },
};
