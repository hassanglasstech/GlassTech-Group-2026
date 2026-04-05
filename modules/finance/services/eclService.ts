/**
 * eclService.ts — Phase 3: CA Intelligence
 *
 * 1. getECLProvision()        — Expected Credit Loss on AR aging buckets
 * 2. getICOReconciliation()   — Intercompany balance netting check
 */

import { SalesService } from '@/modules/sales/services/salesService';
import { FinanceService } from './financeService';
import { Company } from '@/modules/shared/types/core';

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Types ──────────────────────────────────────────────────────────────────

// IFRS 9 Simplified ECL — trade receivables provision matrix
export const ECL_LOSS_RATES: Record<string, number> = {
  current:  0.5,   // 0-30 days:  0.5% loss rate
  d30:      2.0,   // 31-60 days: 2%
  d60:      5.0,   // 61-90 days: 5%
  d90:      15.0,  // 91-120 days:15%
  over120:  40.0,  // >120 days:  40%
};

export interface ECLBucket {
  bucket:       string;     // '0-30', '31-60', '61-90', '91-120', '>120'
  daysRange:    string;
  grossAmount:  number;
  lossRate:     number;     // %
  provision:    number;     // grossAmount × lossRate / 100
  clientCount:  number;
}

export interface ECLSummary {
  period:            string;
  company:           Company;
  totalAR:           number;
  currentAR:         number;
  overdueAR:         number;
  totalProvision:    number;
  netAR:             number;   // totalAR - totalProvision
  effectiveLossRate: number;   // totalProvision / totalAR %
  buckets:           ECLBucket[];
  journalEntry: {
    debit:  { account: string; amount: number };
    credit: { account: string; amount: number };
  };
}

export interface ICOBalance {
  fromCompany: Company;
  toCompany:   Company;
  receivable:  number;   // from company's AR
  payable:     number;   // to company's AP
  netDiff:     number;   // should be 0 after elimination
  status:      'MATCHED' | 'MISMATCH' | 'MISSING';
  missingEntry?: string;
}

export interface ICOReconciliation {
  asOfDate:     string;
  balances:     ICOBalance[];
  totalMismatch:number;
  eliminationEntries: {
    description: string;
    debit:  { company: Company; account: string; amount: number };
    credit: { company: Company; account: string; amount: number };
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  if (!dateStr) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

function getBucket(days: number): keyof typeof ECL_LOSS_RATES {
  if (days <= 30)  return 'current';
  if (days <= 60)  return 'd30';
  if (days <= 90)  return 'd60';
  if (days <= 120) return 'd90';
  return 'over120';
}

const BUCKET_LABELS: Record<string, string> = {
  current:  '0 – 30 days',
  d30:      '31 – 60 days',
  d60:      '61 – 90 days',
  d90:      '91 – 120 days',
  over120:  'Over 120 days',
};

// ── Service ────────────────────────────────────────────────────────────────

export const ECLService = {

  // ── 1. ECL Provision Calculation ───────────────────────────────────────
  getECLProvision(company: Company): ECLSummary {
    const invoices = SalesService.getInvoices
      ? SalesService.getInvoices().filter((inv: any) =>
          inv.company === company &&
          ['Outstanding', 'Partial', 'Overdue'].includes(inv.status || '')
        )
      : [];

    // Bucket each invoice
    const buckets: Record<string, { amount: number; clients: Set<string> }> = {
      current: { amount: 0, clients: new Set() },
      d30:     { amount: 0, clients: new Set() },
      d60:     { amount: 0, clients: new Set() },
      d90:     { amount: 0, clients: new Set() },
      over120: { amount: 0, clients: new Set() },
    };

    invoices.forEach((inv: any) => {
      const days   = daysSince(inv.dueDate || inv.date);
      const bucket = getBucket(days);
      const balance = (inv.totalAmount || 0) - (inv.receivedAmount || 0);
      if (balance > 0) {
        buckets[bucket].amount += balance;
        if (inv.clientId) buckets[bucket].clients.add(inv.clientId);
      }
    });

    const totalAR  = Object.values(buckets).reduce((s, b) => s + b.amount, 0);
    const currentAR = buckets.current.amount;
    let totalProvision = 0;

    const ecl: ECLBucket[] = Object.entries(buckets).map(([key, data]) => {
      const lossRate  = ECL_LOSS_RATES[key] || 0;
      const provision = round2(data.amount * lossRate / 100);
      totalProvision += provision;
      return {
        bucket:      key,
        daysRange:   BUCKET_LABELS[key] || key,
        grossAmount: Math.round(data.amount),
        lossRate,
        provision:   Math.round(provision),
        clientCount: data.clients.size,
      };
    });

    const netAR = totalAR - totalProvision;

    return {
      period:          new Date().toISOString().slice(0, 7),
      company,
      totalAR:         Math.round(totalAR),
      currentAR:       Math.round(currentAR),
      overdueAR:       Math.round(totalAR - currentAR),
      totalProvision:  Math.round(totalProvision),
      netAR:           Math.round(netAR),
      effectiveLossRate: totalAR > 0 ? round2(totalProvision / totalAR * 100) : 0,
      buckets:         ecl,
      // Journal entry: Dr Bad Debt Expense / Cr Allowance for Doubtful Debts
      journalEntry: {
        debit:  { account: 'Bad Debt Expense (5XXX)',          amount: Math.round(totalProvision) },
        credit: { account: 'Allowance for Doubtful Debts (11231)', amount: Math.round(totalProvision) },
      },
    };
  },

  // ── 2. ICO Balance Reconciliation ──────────────────────────────────────
  getICOReconciliation(): ICOReconciliation {
    const companies: Company[] = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];
    const allAccounts = FinanceService.getAccounts();
    const allLedger   = FinanceService.getLedger().filter(t => t.status === 'Posted');

    // Helper: get balance of an account
    const getBalance = (company: Company, codePrefix: string): number => {
      const accs = allAccounts.filter(a =>
        a.company === company && (a.code || '').startsWith(codePrefix)
      );
      return accs.reduce((sum, acc) => {
        const entries = allLedger.filter(t => t.company === company);
        const bal = entries.reduce((s, t) => {
          const lines = (t as any).details || [];
          const line = lines.find((d: any) => d.accountId === acc.id);
          if (!line) return s;
          return s + (line.debit || 0) - (line.credit || 0);
        }, 0);
        return sum + bal;
      }, 0);
    };

    const balances: ICOBalance[] = [];
    const eliminationEntries: ICOReconciliation['eliminationEntries'] = [];
    let totalMismatch = 0;

    // Check each pair (only major ICO pairs for GlassTech)
    const icoPairs: [Company, Company][] = [
      ['GTK', 'Glassco'],
      ['GTI', 'Glassco'],
      ['GTK', 'GTI'],
    ];

    icoPairs.forEach(([from, to]) => {
      // Use GL transaction descriptions (ICO-OUT / ICO-IN tags from intercompanyService)
      // Primary: match by description keywords; fallback: account code 1220/2210
      let receivable = getICOBalanceByRef(from, to, 'receivable');
      if (receivable === 0) receivable = getBalance(from, '1220');

      let payable = getICOBalanceByRef(to, from, 'payable');
      if (payable === 0) payable = getBalance(to, '2210');

      const netDiff = Math.abs(Math.round(receivable - payable));
      const status: ICOBalance['status'] =
        netDiff <= 10 ? 'MATCHED' :
        receivable === 0 || payable === 0 ? 'MISSING' : 'MISMATCH';

      totalMismatch += netDiff;

      balances.push({
        fromCompany: from,
        toCompany:   to,
        receivable:  Math.round(receivable),
        payable:     Math.round(payable),
        netDiff,
        status,
        missingEntry: status === 'MISSING'
          ? receivable === 0 ? `${from} has no ICO receivable recorded`
          : `${to} has no ICO payable recorded`
          : undefined,
      });

      // Suggest elimination entry if mismatch
      if (status === 'MATCHED' && receivable > 10) {
        eliminationEntries.push({
          description: `Eliminate ICO: ${from} Receivable ↔ ${to} Payable`,
          debit:  { company: to,   account: `ICO Payable — ${from}`,    amount: Math.round(payable) },
          credit: { company: from, account: `ICO Receivable — ${to}`,   amount: Math.round(receivable) },
        });
      }
    });

    return {
      asOfDate:           new Date().toISOString().slice(0, 10),
      balances,
      totalMismatch:      Math.round(totalMismatch),
      eliminationEntries,
    };
  },
};
