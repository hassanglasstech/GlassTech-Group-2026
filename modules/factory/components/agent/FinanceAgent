import { supabase } from '@/src/services/supabaseClient';

const ls = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };

// ── Date Helpers ──────────────────────────────────────────────────────
const parseRange = (query: string): { from: Date; to: Date; label: string } => {
  const now = new Date();
  const q = query.toLowerCase();

  if (q.includes('aaj') || q.includes('today')) {
    const from = new Date(now); from.setHours(0,0,0,0);
    return { from, to: now, label: 'Aaj' };
  }
  if (q.includes('is hafte') || q.includes('this week')) {
    const from = new Date(now); from.setDate(now.getDate() - now.getDay());
    return { from, to: now, label: 'Is Hafte' };
  }
  if (q.includes('pichle hafte') || q.includes('last week')) {
    const from = new Date(now); from.setDate(now.getDate() - now.getDay() - 7);
    const to   = new Date(now); to.setDate(now.getDate() - now.getDay() - 1);
    return { from, to, label: 'Pichle Hafte' };
  }
  if (q.includes('is mahine') || q.includes('this month')) {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to: now, label: 'Is Mahine' };
  }
  if (q.includes('pichle mahine') || q.includes('last month')) {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to   = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from, to, label: 'Pichle Mahine' };
  }
  // Month names (Urdu/English)
  const months: Record<string, number> = {
    january:0, february:1, march:2, april:3, may:4, june:5,
    july:6, august:7, september:8, october:9, november:10, december:11,
    jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
  };
  for (const [name, idx] of Object.entries(months)) {
    if (q.includes(name)) {
      const year = now.getFullYear();
      return {
        from: new Date(year, idx, 1),
        to:   new Date(year, idx + 1, 0),
        label: name.charAt(0).toUpperCase() + name.slice(1),
      };
    }
  }
  // Default: last 30 days
  const from = new Date(now); from.setDate(now.getDate() - 30);
  return { from, to: now, label: 'Last 30 Days' };
};

const formatPKR = (n: number) => `PKR ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
const formatDate = (d: string) => new Date(d).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' });

// ── Finance Agent ─────────────────────────────────────────────────────
export const FinanceAgent = {

  // Petty Cash Summary
  pettyCashSummary: (query: string) => {
    const { from, to, label } = parseRange(query);
    const allEntries = ls('gtk_erp_petty_cash');
    const filtered = allEntries.filter((e: any) => {
      const d = new Date(e.date);
      return d >= from && d <= to && e.status !== 'Ignored';
    });

    const payments = filtered.filter((e: any) => e.type === 'Payment');
    const receipts = filtered.filter((e: any) => e.type === 'Receipt');
    const totalOut = payments.reduce((s: number, e: any) => s + (e.amount || 0), 0);
    const totalIn  = receipts.reduce((s: number, e: any) => s + (e.amount || 0), 0);

    // Group by description/category
    const byCategory: Record<string, { count: number; total: number; entries: any[] }> = {};
    payments.forEach((e: any) => {
      const cat = e.businessTransaction || e.description?.split(' ')[0] || 'Other';
      if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0, entries: [] };
      byCategory[cat].count++;
      byCategory[cat].total += e.amount || 0;
      byCategory[cat].entries.push(e);
    });

    const lastBalance = filtered.length > 0
      ? filtered.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.balance || 0
      : 0;

    return {
      period: label,
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
      total_entries: filtered.length,
      total_out: totalOut,
      total_in: totalIn,
      net: totalIn - totalOut,
      current_balance: lastBalance,
      payments,
      receipts,
      by_category: byCategory,
      formatted: {
        total_out: formatPKR(totalOut),
        total_in: formatPKR(totalIn),
        balance: formatPKR(lastBalance),
      },
    };
  },

  // Outstanding Payments
  outstandingPayments: () => {
    const quotations = ls('gtk_erp_quotations');
    const overdue = quotations
      .filter((q: any) => {
        const paid = q.paidAmount || 0;
        const total = q.totalAmount || 0;
        return total > 0 && paid < total && q.status !== 'Cancelled';
      })
      .map((q: any) => ({
        id: q.id,
        client: q.clientName,
        project: q.projectName,
        total: q.totalAmount,
        paid: q.paidAmount || 0,
        outstanding: q.totalAmount - (q.paidAmount || 0),
        date: q.date,
        days_old: Math.floor((Date.now() - new Date(q.date).getTime()) / 86400000),
        formatted_outstanding: formatPKR(q.totalAmount - (q.paidAmount || 0)),
        formatted_date: formatDate(q.date),
      }))
      .sort((a: any, b: any) => b.outstanding - a.outstanding);

    const totalOutstanding = overdue.reduce((s: number, q: any) => s + q.outstanding, 0);
    return {
      total_clients_with_outstanding: overdue.length,
      total_outstanding: totalOutstanding,
      formatted_total: formatPKR(totalOutstanding),
      overdue_30plus: overdue.filter((q: any) => q.days_old > 30),
      top_5: overdue.slice(0, 5),
      all: overdue,
    };
  },

  // Expense Summary by type
  expenseSummary: (query: string) => {
    const { from, to, label } = parseRange(query);
    const petty = ls('gtk_erp_petty_cash').filter((e: any) => {
      const d = new Date(e.date);
      return d >= from && d <= to && e.type === 'Payment' && e.status !== 'Ignored';
    });

    const grouped: Record<string, number> = {};
    petty.forEach((e: any) => {
      const cat = e.businessTransaction || 'General';
      grouped[cat] = (grouped[cat] || 0) + (e.amount || 0);
    });

    const sorted = Object.entries(grouped)
      .map(([cat, total]) => ({ category: cat, total, formatted: formatPKR(total) }))
      .sort((a, b) => b.total - a.total);

    return {
      period: label,
      total_expense: sorted.reduce((s, e) => s + e.total, 0),
      formatted_total: formatPKR(sorted.reduce((s, e) => s + e.total, 0)),
      by_category: sorted,
      entries: petty,
    };
  },

  // Generate PDF-ready data
  generatePettyCashReport: (query: string) => {
    const summary = FinanceAgent.pettyCashSummary(query);
    const rows = summary.payments.map((e: any) => ({
      date: formatDate(e.date),
      description: e.description,
      type: e.businessTransaction || '-',
      recorded_by: e.recordedBy || '-',
      amount: formatPKR(e.amount),
      balance: formatPKR(e.balance || 0),
    }));

    return {
      title: `Petty Cash Report — ${summary.period}`,
      period: `${summary.formatted.total_out} spent | Balance: ${summary.formatted.balance}`,
      summary,
      rows,
      ready_for_print: true,
    };
  },
};
