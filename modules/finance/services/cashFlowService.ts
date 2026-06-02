/**
 * cashFlowService.ts — Financial Layer Phase 2
 *
 * 13-week rolling cash flow forecast:
 *   Inflows:  AR collections (invoices due), expected receipts
 *   Outflows: AP payments (POs/PVs due), payroll, petty cash
 *   Net:      weekly opening/closing balance
 */

import { SalesService } from '@/modules/sales/services/salesService';
import { FinanceService } from './financeService';
import { HRService } from '@/modules/hr/services/hrService';
import { ProductionService } from '@/modules/production/services/productionService';
import { Company } from '@/modules/shared/types/core';

const round = (n: number) => Math.round(n);

// ── Types ──────────────────────────────────────────────────────────────────

export interface CashFlowWeek {
  weekNo:        number;
  weekLabel:     string;   // e.g. "W1 Apr 7-13"
  startDate:     string;
  endDate:       string;

  // Inflows
  arCollections: number;   // invoices due this week
  otherInflows:  number;   // manual additions
  totalInflows:  number;

  // Outflows
  apPayments:    number;   // POs/vendor payments due
  payroll:       number;   // salary payment (week of 25th-31st)
  pettyCash:     number;   // avg weekly petty cash
  otherOutflows: number;
  totalOutflows: number;

  // Net
  netFlow:       number;
  openingBal:    number;
  closingBal:    number;
  status:        'SURPLUS' | 'DEFICIT' | 'TIGHT';  // TIGHT = closing < 20% of outflows
}

export interface CashFlowForecast {
  company:        Company;
  generatedOn:    string;
  openingBalance: number;
  weeks:          CashFlowWeek[];
  summary: {
    totalInflows:   number;
    totalOutflows:  number;
    netCashFlow:    number;
    worstWeek:      string;
    bestWeek:       string;
    deficitWeeks:   number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekLabel(n: number, start: Date): string {
  const end = addDays(start, 6);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return 'W' + n + ' ' + months[start.getMonth()] + ' ' + start.getDate() + '-' + end.getDate();
}

function getOpeningBalance(company: Company): number {
  // Sum of cash accounts in GL
  const accounts = FinanceService.getAccounts().filter((a: any) =>
    a.company === company &&
    ((a.code || '').startsWith('111') || (a.name || '').toLowerCase().includes('cash'))
  );
  const ledger = FinanceService.getLedger().filter(t =>
    t.company === company && t.status === 'Posted'
  );
  let bal = 0;
  accounts.forEach((acc: any) => {
    ledger.forEach(t => {
      const lines = (t as any).details || [];
      lines.forEach((d: any) => {
        if (d.accountId === acc.id) bal += (d.debit || 0) - (d.credit || 0);
      });
    });
  });
  return bal;
}

// ── Main Service ──────────────────────────────────────────────────────────

export const CashFlowService = {

  getForecast(company: Company, weeks = 13): CashFlowForecast {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const openingBalance = getOpeningBalance(company);

    // ── AR: outstanding invoices ───────────────────────────────────
    const invoices = (SalesService.getInvoices
      ? SalesService.getInvoices()
      : []
    ).filter((inv: any) =>
      inv.company === company &&
      ['Outstanding', 'Partial', 'Overdue'].includes(inv.status || '')
    );

    // ── AP: approved POs not yet paid ─────────────────────────────
    const pos = (ProductionService.getPurchaseOrders
      ? ProductionService.getPurchaseOrders()
      : []
    ).filter((po: any) =>
      po.fromCompany === company &&
      ['Approved', 'GRN Done'].includes(po.status || '') &&
      !po.isPaid
    );

    // ── Payroll: monthly salary total ─────────────────────────────
    const employees = HRService.getEmployees().filter(e => e.company === company);
    const monthlySalary = employees.reduce((s, e) => {
      return s + (e.salary?.basic || 0) + (e.salary?.houseRent || 0) +
             (e.salary?.conveyance || 0) + (e.salary?.specialAllowance || 0);
    }, 0);

    // ── Petty cash: avg weekly from last 3 months ─────────────────
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recentPetty = FinanceService.getPettyCashEntries().filter(p =>
      p.company === company &&
      p.type === 'Payment' &&
      p.status === 'Posted' &&
      new Date(p.date) >= threeMonthsAgo
    );
    const totalPetty = recentPetty.reduce((s, p) => s + p.amount, 0);
    const avgWeeklyPetty = round(totalPetty / 13); // 13 weeks = 3 months

    // ── Build weekly forecast ─────────────────────────────────────
    let runningBal = openingBalance;
    const weekData: CashFlowWeek[] = [];

    for (let w = 0; w < weeks; w++) {
      const weekStart = addDays(today, w * 7);
      const weekEnd   = addDays(weekStart, 6);
      const ws = isoDate(weekStart);
      const we = isoDate(weekEnd);

      // AR collections: invoices with dueDate in this week
      const arCollections = invoices
        .filter((inv: any) => {
          const due = inv.dueDate || inv.date;
          return due >= ws && due <= we;
        })
        .reduce((s: number, inv: any) => s + ((inv.totalAmount || 0) - (inv.receivedAmount || 0)), 0);

      // AP payments: POs with expected payment date in this week
      // Use grnDate + 30 days as estimated payment date if no explicit date
      const apPayments = pos
        .filter((po: any) => {
          const payDate = po.paymentDueDate ||
            (po.grnDate ? isoDate(addDays(new Date(po.grnDate), 30)) : null) ||
            (po.date    ? isoDate(addDays(new Date(po.date), 45))    : null);
          return payDate && payDate >= ws && payDate <= we;
        })
        .reduce((s: number, po: any) => s + (po.totalAmount || 0), 0);

      // Payroll: falls in the last week of each month (25th-31st)
      const payrollThisWeek = (() => {
        for (let d = 0; d < 7; d++) {
          const day = addDays(weekStart, d).getDate();
          if (day >= 25) return round(monthlySalary);
        }
        return 0;
      })();

      const totalInflows  = round(arCollections);
      const totalOutflows = round(apPayments + payrollThisWeek + avgWeeklyPetty);
      const netFlow       = totalInflows - totalOutflows;
      const openingBal    = round(runningBal);
      const closingBal    = round(runningBal + netFlow);
      runningBal          = closingBal;

      const tightThreshold = totalOutflows * 0.2;
      const status: CashFlowWeek['status'] =
        closingBal < 0              ? 'DEFICIT' :
        closingBal < tightThreshold ? 'TIGHT'   : 'SURPLUS';

      weekData.push({
        weekNo: w + 1,
        weekLabel: weekLabel(w + 1, weekStart),
        startDate: ws, endDate: we,
        arCollections: round(arCollections),
        otherInflows: 0,
        totalInflows,
        apPayments: round(apPayments),
        payroll: payrollThisWeek,
        pettyCash: avgWeeklyPetty,
        otherOutflows: 0,
        totalOutflows,
        netFlow,
        openingBal,
        closingBal,
        status,
      });
    }

    const totalInflows  = weekData.reduce((s, w) => s + w.totalInflows, 0);
    const totalOutflows = weekData.reduce((s, w) => s + w.totalOutflows, 0);
    const worstWeek = weekData.reduce((a, b) => a.closingBal < b.closingBal ? a : b).weekLabel;
    const bestWeek  = weekData.reduce((a, b) => a.netFlow > b.netFlow ? a : b).weekLabel;

    return {
      company,
      generatedOn:    new Date().toISOString(),
      openingBalance: round(openingBalance),
      weeks:          weekData,
      summary: {
        totalInflows:  round(totalInflows),
        totalOutflows: round(totalOutflows),
        netCashFlow:   round(totalInflows - totalOutflows),
        worstWeek,
        bestWeek,
        deficitWeeks:  weekData.filter(w => w.status === 'DEFICIT').length,
      },
    };
  },
};
