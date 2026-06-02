import React, { useMemo } from 'react';
import { FinanceService } from '@/modules/finance/services/financeService';
import { TrendingUp, TrendingDown, Wallet, BarChart3 } from 'lucide-react';

interface Props {
  company: string;
  metrics?: any; // keep backward compat
}

const FinanceDashboardView: React.FC<Props> = ({ company }) => {
  const stats = useMemo(() => {
    const ledger = FinanceService.getLedger().filter(t => t.company === company && t.status === 'Posted');
    const petty = FinanceService.getPettyCashEntries().filter(e => e.company === company && e.status === 'Posted');

    // Cash position from petty cash
    const cashIn  = petty.filter(e => e.type === 'Receipt').reduce((s, e) => s + e.amount, 0);
    const cashOut = petty.filter(e => e.type === 'Payment').reduce((s, e) => s + e.amount, 0);
    const cashPosition = cashIn - cashOut;

    // AR — DZ doc type (customer receipts debit side)
    const ar = ledger.filter(t => t.docType === 'DZ' || t.docType === 'SA')
      .flatMap(t => t.details || [])
      .reduce((s, d) => s + (d.debit || 0), 0);

    // AP — KZ doc type (vendor payments)
    const ap = ledger.filter(t => t.docType === 'KZ' || t.docType === 'PV')
      .flatMap(t => t.details || [])
      .reduce((s, d) => s + (d.credit || 0), 0);

    // Net from ledger
    const totalDebit  = ledger.flatMap(t => t.details || []).reduce((s, d) => s + (d.debit || 0), 0);
    const totalCredit = ledger.flatMap(t => t.details || []).reduce((s, d) => s + (d.credit || 0), 0);
    const netProfit   = totalCredit - totalDebit;

    // Total entries
    const totalEntries = ledger.length + petty.length;

    return { cashPosition, ar, ap, netProfit, totalEntries, cashIn, cashOut };
  }, [company]);

  const cards = [
    { label: 'Cash Position', value: stats.cashPosition, color: stats.cashPosition >= 0 ? 'text-emerald-600' : 'text-rose-600', icon: Wallet, bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { label: 'Accounts Receivable', value: stats.ar, color: 'text-blue-600', icon: TrendingUp, bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Accounts Payable', value: stats.ap, color: 'text-rose-600', icon: TrendingDown, bg: 'bg-rose-50', border: 'border-rose-200' },
    { label: 'Net Balance', value: stats.netProfit, color: stats.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600', icon: BarChart3, bg: 'bg-slate-50', border: 'border-slate-200' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.label} className={`bg-white p-5 rounded-2xl border ${card.border} shadow-sm`}>
            <div className={`w-9 h-9 ${card.bg} rounded-xl flex items-center justify-center mb-3`}>
              <card.icon size={18} className={card.color} />
            </div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{card.label}</p>
            <p className={`text-xl font-black mt-1 ${card.color}`}>
              PKR {Math.abs(Math.round(card.value)).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Cash Receipts</p>
          <p className="text-lg font-black text-emerald-600 mt-1">PKR {Math.round(stats.cashIn).toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Cash Payments</p>
          <p className="text-lg font-black text-rose-600 mt-1">PKR {Math.round(stats.cashOut).toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Ledger Entries</p>
          <p className="text-lg font-black text-slate-800 mt-1">{stats.totalEntries}</p>
        </div>
      </div>
    </div>
  );
};

export default FinanceDashboardView;
