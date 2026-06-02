import React, { useState, useMemo } from 'react';
import {
  Landmark, TrendingUp, TrendingDown, RefreshCw,
  ChevronDown, ChevronUp, DollarSign, BarChart3
} from 'lucide-react';
import { FinanceService } from '@/modules/finance/services/financeService';

// ── Helpers ───────────────────────────────────────────────────────────
const fmt = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` :
  Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K` :
  n.toFixed(0);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface StatRow {
  label:    string;
  value:    number;
  indent?:  boolean;
  bold?:    boolean;
  positive?: boolean;  // override color
}

// ── Collapsible section ───────────────────────────────────────────────
const Section: React.FC<{ title: string; total: number; rows: StatRow[]; defaultOpen?: boolean }> =
  ({ title, total, rows, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3">
        <span className="font-bold text-white text-sm">{title}</span>
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-sm">PKR {fmt(Math.abs(total))}</span>
          {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-700 divide-y divide-slate-700/50">
          {rows.map((row, i) => (
            <div key={i} className={`flex justify-between px-4 py-2 ${row.indent ? 'pl-8' : ''}`}>
              <span className={`text-xs ${row.bold ? 'font-bold text-white' : 'text-slate-400'}`}>{row.label}</span>
              <span className={`text-xs font-bold ${
                row.positive !== undefined
                  ? row.positive ? 'text-green-400' : 'text-red-400'
                  : row.value >= 0 ? 'text-white' : 'text-red-400'
              }`}>
                PKR {fmt(Math.abs(row.value))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Trend mini bar ────────────────────────────────────────────────────
const TrendBar: React.FC<{ months: { label: string; value: number }[]; color: string }> = ({ months, color }) => {
  if (months.length < 2) return null;
  const max = Math.max(...months.map(m => Math.abs(m.value)), 1);
  return (
    <div className="flex items-end gap-1 h-10">
      {months.map((m, i) => {
        const h = Math.round((Math.abs(m.value) / max) * 36);
        return (
          <div key={i} className="flex flex-col items-center flex-1 gap-0.5">
            <div className={`w-full rounded-sm ${color}`} style={{ height: `${h}px` }} />
            <div className="text-[8px] text-slate-600 truncate w-full text-center">{m.label}</div>
          </div>
        );
      })}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────
const FinancialStatementsMobile: React.FC = () => {
  const [period, setPeriod] = useState<'month' | 'quarter' | 'all'>('month');
  const [view, setView]     = useState<'pl' | 'bs' | 'trend'>('pl');

  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { accounts, ledger } = useMemo(() => ({
    accounts: FinanceService.getAccounts().filter(a => a.company === 'Glassco'),
    ledger:   FinanceService.getLedger().filter(t => t.company === 'Glassco'),
  }), []);

  // Filter ledger by period
  const filteredLedger = useMemo(() => {
    if (period === 'all') return ledger;
    const cutoff = new Date();
    if (period === 'month') cutoff.setDate(1);
    if (period === 'quarter') cutoff.setMonth(cutoff.getMonth() - 3);
    return ledger.filter(tx => tx.date >= cutoff.toISOString().split('T')[0]);
  }, [ledger, period]);

  // Account balances
  const balances = useMemo(() => {
    const bal: Record<string, number> = {};
    accounts.forEach(acc => { bal[acc.id] = 0; });
    filteredLedger.forEach(tx => {
      tx.details?.forEach(d => {
        if (bal[d.accountId] !== undefined)
          bal[d.accountId] += (d.debit - d.credit);
      });
    });
    return bal;
  }, [accounts, filteredLedger]);

  const getGroupBal = (type: string) =>
    accounts.filter(a => a.type === type).reduce((s, a) => s + (balances[a.id] || 0), 0);

  const getCodeBal = (prefix: string) =>
    accounts.filter(a => a.code?.startsWith(prefix)).reduce((s, a) => s + (balances[a.id] || 0), 0);

  // P&L
  const revenue    = Math.abs(getGroupBal('Revenue'));
  const expense    = Math.abs(getGroupBal('Expense'));
  const grossProfit = revenue - (expense * 0.65); // rough COGS split
  const netProfit  = revenue - expense;
  const margin     = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0';

  // BS
  const totalAssets  = getGroupBal('Asset');
  const totalLiab    = Math.abs(getGroupBal('Liability'));
  const totalEquity  = Math.abs(getGroupBal('Equity'));
  const cash         = Math.abs(getCodeBal('123'));
  const receivables  = Math.abs(getCodeBal('122'));
  const inventory    = Math.abs(getCodeBal('121'));
  const payables     = Math.abs(getCodeBal('22'));

  // Monthly trend (last 6 months)
  const monthlyTrend = useMemo(() => {
    const months: { label: string; revenue: number; expense: number; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d  = new Date();
      d.setMonth(d.getMonth() - i);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const ml = ledger.filter(tx => tx.date?.startsWith(mk));
      const mBal: Record<string, number> = {};
      accounts.forEach(acc => { mBal[acc.id] = 0; });
      ml.forEach(tx => {
        tx.details?.forEach(d => {
          if (mBal[d.accountId] !== undefined) mBal[d.accountId] += (d.debit - d.credit);
        });
      });
      const mRev = Math.abs(accounts.filter(a => a.type === 'Revenue').reduce((s, a) => s + (mBal[a.id] || 0), 0));
      const mExp = Math.abs(accounts.filter(a => a.type === 'Expense').reduce((s, a) => s + (mBal[a.id] || 0), 0));
      months.push({
        label:   `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        revenue: mRev,
        expense: mExp,
        profit:  mRev - mExp,
      });
    }
    return months;
  }, [ledger, accounts]);

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Financials</h2>
          <p className="text-xs text-slate-500 mt-0.5">GlassCo · P&L · Balance Sheet</p>
        </div>
      </div>

      {/* Period */}
      <div className="flex gap-2 bg-slate-800 p-1 rounded-xl">
        {([['month', 'Month'], ['quarter', 'Quarter'], ['all', 'All Time']] as const).map(([p, label]) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
              ${period === p ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex gap-2 bg-slate-800 p-1 rounded-xl">
        {([['pl', 'P&L'], ['bs', 'Balance Sheet'], ['trend', 'Trend']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
              ${view === v ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── P&L View ── */}
      {view === 'pl' && (
        <div className="space-y-3">
          {/* Hero */}
          <div className={`rounded-xl border p-5 ${netProfit >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Net Profit / (Loss)</div>
            <div className={`text-4xl font-black ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              PKR {fmt(Math.abs(netProfit))}
            </div>
            <div className="text-sm text-slate-400 mt-1">Margin: <span className="font-bold text-white">{margin}%</span></div>
          </div>

          <Section
            title="Revenue"
            total={revenue}
            defaultOpen
            rows={[
              { label: 'Total Revenue', value: revenue, bold: true, positive: true },
            ]}
          />
          <Section
            title="Expenses"
            total={expense}
            rows={[
              { label: 'Cost of Goods (est.)', value: expense * 0.65, indent: true },
              { label: 'Operating Expenses',   value: expense * 0.35, indent: true },
              { label: 'Total Expenses',        value: expense, bold: true },
            ]}
          />
          <Section
            title="Profit Summary"
            total={netProfit}
            rows={[
              { label: 'Gross Profit (est.)', value: grossProfit, positive: grossProfit >= 0 },
              { label: 'Net Profit / (Loss)', value: netProfit, bold: true, positive: netProfit >= 0 },
              { label: 'Net Margin',          value: parseFloat(margin), positive: parseFloat(margin) >= 0 },
            ]}
          />
        </div>
      )}

      {/* ── Balance Sheet View ── */}
      {view === 'bs' && (
        <div className="space-y-3">
          {/* BS check */}
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${Math.abs(totalAssets - (totalLiab + totalEquity)) < 100 ? 'bg-green-500/10 border-green-500/20' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
            <Landmark size={16} className={Math.abs(totalAssets - (totalLiab + totalEquity)) < 100 ? 'text-green-400' : 'text-yellow-400'} />
            <span className={`text-xs font-bold ${Math.abs(totalAssets - (totalLiab + totalEquity)) < 100 ? 'text-green-400' : 'text-yellow-400'}`}>
              {Math.abs(totalAssets - (totalLiab + totalEquity)) < 100 ? 'Balance Sheet Balanced ✓' : 'Balance Sheet has variance'}
            </span>
          </div>

          <Section
            title="Assets"
            total={totalAssets}
            defaultOpen
            rows={[
              { label: 'Cash & Bank',    value: cash,         indent: true  },
              { label: 'Receivables',    value: receivables,  indent: true  },
              { label: 'Inventory',      value: inventory,    indent: true  },
              { label: 'Total Assets',   value: totalAssets,  bold: true, positive: true },
            ]}
          />
          <Section
            title="Liabilities"
            total={totalLiab}
            rows={[
              { label: 'Payables',            value: payables,   indent: true },
              { label: 'Total Liabilities',   value: totalLiab,  bold: true  },
            ]}
          />
          <Section
            title="Equity"
            total={totalEquity}
            rows={[
              { label: 'Owner Equity', value: totalEquity, bold: true, positive: true },
            ]}
          />
        </div>
      )}

      {/* ── Trend View ── */}
      {view === 'trend' && (
        <div className="space-y-3">
          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs text-slate-500 uppercase tracking-widest">Revenue — 6 months</div>
            <TrendBar months={monthlyTrend.map(m => ({ label: m.label, value: m.revenue }))} color="bg-blue-500" />
          </div>
          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs text-slate-500 uppercase tracking-widest">Net Profit — 6 months</div>
            <TrendBar months={monthlyTrend.map(m => ({ label: m.label, value: m.profit }))} color="bg-green-500" />
          </div>
          <div className="space-y-1">
            {monthlyTrend.map((m, i) => (
              <div key={i} className="bg-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-slate-300 font-medium">{m.label}</span>
                <div className="text-right">
                  <div className="text-sm font-bold text-white">PKR {fmt(m.revenue)}</div>
                  <div className={`text-xs font-bold ${m.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {m.profit >= 0 ? '+' : ''}PKR {fmt(m.profit)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-xs text-yellow-400">
        ⚠️ Based on GL entries. Full desktop view: FICO → Financial Statements.
      </div>
    </div>
  );
};

export default FinancialStatementsMobile;
