/**
 * ReportsHub.tsx — Sprint 29
 *
 * Consolidated financial reporting — 13 reports:
 * Trial Balance, P&L, Balance Sheet, AR Aging, AP Aging,
 * Cash Flow, Sales Analysis, GST Return, Bank Reconciliation,
 * Cutter Performance (link-out), Vendor Scorecard (link-out),
 * Stock Aging (link-out), Project Profitability (link-out)
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Company } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import { supabase } from '@/src/services/supabaseClient';
import {
  BarChart4, Download, Printer, RefreshCw, Globe,
  TrendingUp, Scale, Clock, AlertCircle,
  ChevronDown, ChevronRight, CheckCircle2, Package,
  Droplets, ShoppingCart, Receipt, Landmark,
  ArrowUpRight, Users, Gauge,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import InventoryValuationReport from '@/modules/finance/components/InventoryValuationReport';
import BankReconciliation from '@/modules/finance/components/BankReconciliation';
import ReportExport from '@/modules/finance/components/ReportExport';

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportType =
  | 'trial_balance'
  | 'pl'
  | 'balance_sheet'
  | 'ar_aging'
  | 'ap_aging'
  | 'inventory_valuation'
  | 'cash_flow'
  | 'sales_analysis'
  | 'gst_return'
  | 'bank_recon';

interface LedgerRow {
  id: string;
  company: string;
  doc_type: string;
  doc_date?: string;
  date?: string;
  status: string;
  data: any;
}

interface AccountRow {
  id: string;
  company: string;
  code: string;
  name: string;
  level: number;
  type: string;
  parent_id?: string;
}

const COMPANIES: Company[] = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];

const fmt  = (n: number) => Math.abs(Math.round(n)).toLocaleString('en-PK');
const fmtS = (n: number, label = '') =>
  `${n < 0 ? '-' : ''}₨ ${fmt(n)}${label ? ' ' + label : ''}`;

const REPORT_TABS: { id: ReportType; label: string; icon: React.ReactNode; group: string }[] = [
  { id: 'trial_balance',      label: 'Trial Balance',       icon: <Scale size={14}/>,       group: 'Financial' },
  { id: 'pl',                 label: 'P&L Statement',       icon: <TrendingUp size={14}/>,  group: 'Financial' },
  { id: 'balance_sheet',      label: 'Balance Sheet',       icon: <BarChart4 size={14}/>,   group: 'Financial' },
  { id: 'cash_flow',          label: 'Cash Flow',           icon: <Droplets size={14}/>,    group: 'Financial' },
  { id: 'gst_return',         label: 'GST Return',          icon: <Receipt size={14}/>,     group: 'Financial' },
  { id: 'ar_aging',           label: 'AR Aging',            icon: <Clock size={14}/>,       group: 'Aging' },
  { id: 'ap_aging',           label: 'AP Aging',            icon: <AlertCircle size={14}/>, group: 'Aging' },
  { id: 'sales_analysis',     label: 'Sales Analysis',      icon: <ShoppingCart size={14}/>,group: 'Operations' },
  { id: 'inventory_valuation',label: 'Inventory',           icon: <Package size={14}/>,     group: 'Operations' },
  { id: 'bank_recon',         label: 'Bank Recon',          icon: <Landmark size={14}/>,    group: 'Operations' },
];

// ── Data Loader ───────────────────────────────────────────────────────────────

const loadReportData = async (companies: Company[], from: string, to: string) => {
  // Accounts
  const { data: accData } = await supabase
    .from('accounts')
    .select('*')
    .in('company', companies);

  // Ledger — date-filtered
  const { data: ledData } = await supabase
    .from('ledger')
    .select('*')
    .in('company', companies)
    .in('status', ['Posted'])
    .gte('doc_date', from)
    .lte('doc_date', to);

  const accounts: AccountRow[] = (accData || []).map((r: any) => ({
    id:        r.id,
    company:   r.company,
    code:      r.code || r.data?.code || '',
    name:      r.name || r.data?.name || '',
    level:     r.level || r.data?.level || 1,
    type:      r.type || r.data?.type || 'Asset',
    parent_id: r.parent_id || r.data?.parentId,
  }));

  const ledger: LedgerRow[] = (ledData || []);
  return { accounts, ledger };
};

// ── Account Balance Calculator ────────────────────────────────────────────────

const calcBalances = (accounts: AccountRow[], ledger: LedgerRow[]) => {
  const debit:  Record<string, number> = {};
  const credit: Record<string, number> = {};

  accounts.forEach(a => { debit[a.id] = 0; credit[a.id] = 0; });

  ledger.forEach(tx => {
    // details is a native JSONB column on the ledger table (added migration 010).
    // Fall back to data.details for any rows inserted before the migration.
    const details: any[] =
      (tx as any).details ||
      tx.data?.details   ||
      tx.data?.lines     ||
      [];

    details.forEach((d: any) => {
      if (d.accountId && debit[d.accountId] !== undefined) {
        debit[d.accountId]  += Number(d.debit  || 0);
        credit[d.accountId] += Number(d.credit || 0);
      }
    });
  });

  return { debit, credit };
};

// ── Trial Balance ─────────────────────────────────────────────────────────────

const TrialBalanceReport: React.FC<{
  accounts: AccountRow[];
  ledger: LedgerRow[];
  onExport: () => void;
}> = ({ accounts, ledger, onExport }) => {
  const [search, setSearch] = useState('');

  const { debit, credit } = useMemo(() => calcBalances(accounts, ledger), [accounts, ledger]);

  const rows = useMemo(() => accounts
    .map(a => ({
      ...a,
      debit:  debit[a.id]  || 0,
      credit: credit[a.id] || 0,
      net:    (debit[a.id] || 0) - (credit[a.id] || 0),
    }))
    .filter(a => (a.debit !== 0 || a.credit !== 0) &&
      (!search || a.name.toLowerCase().includes(search.toLowerCase()) || a.code.includes(search)))
    .sort((a, b) => a.code.localeCompare(b.code)),
  [accounts, debit, credit, search]);

  const totals = rows.reduce((t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit }), { debit: 0, credit: 0 });
  const isBalanced = Math.abs(totals.debit - totals.credit) < 1;

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'G/L Code':    r.code,
      'Account':     r.name,
      'Type':        r.type,
      'Company':     r.company,
      'Total Debit': r.debit,
      'Total Credit':r.credit,
      'Net (Dr)':    r.net > 0 ? r.net : 0,
      'Net (Cr)':    r.net < 0 ? Math.abs(r.net) : 0,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance');
    XLSX.writeFile(wb, `TrialBalance_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success('Trial Balance exported');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search account..." className="px-3 py-2 border border-slate-200 rounded-lg text-xs w-52 focus:outline-none focus:border-blue-400" />
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black ${isBalanced ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {isBalanced ? <CheckCircle2 size={12}/> : <AlertCircle size={12}/>}
          {isBalanced ? 'BALANCED' : `OFF BY ₨ ${fmt(Math.abs(totals.debit - totals.credit))}`}
        </div>
        <button onClick={handleExport} className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">
          <Download size={13}/> Export Excel
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50">
          <Printer size={13}/> Print
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-900 text-white">
            <tr>
              {['G/L Code','Account Name','Type','Company','Debit','Credit','Balance','Side'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-black text-[10px] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                <td className="px-4 py-2.5 font-mono text-slate-600 font-bold">{r.code}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                    r.type === 'Asset' ? 'bg-blue-100 text-blue-700' :
                    r.type === 'Liability' ? 'bg-orange-100 text-orange-700' :
                    r.type === 'Revenue' ? 'bg-emerald-100 text-emerald-700' :
                    r.type === 'Expense' ? 'bg-rose-100 text-rose-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>{r.type}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{r.company}</td>
                <td className="px-4 py-2.5 text-right font-medium">{r.debit > 0 ? fmt(r.debit) : '—'}</td>
                <td className="px-4 py-2.5 text-right font-medium">{r.credit > 0 ? fmt(r.credit) : '—'}</td>
                <td className="px-4 py-2.5 text-right font-black text-slate-800">{fmt(Math.abs(r.net))}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`font-black text-[10px] ${r.net > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                    {r.net > 0 ? 'Dr' : 'Cr'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-800 text-white">
            <tr>
              <td colSpan={4} className="px-4 py-3 font-black text-sm">TOTALS</td>
              <td className="px-4 py-3 text-right font-black">₨ {fmt(totals.debit)}</td>
              <td className="px-4 py-3 text-right font-black">₨ {fmt(totals.credit)}</td>
              <td colSpan={2} className={`px-4 py-3 text-center font-black text-xs ${isBalanced ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isBalanced ? '✓ Balanced' : '✗ Not balanced'}
              </td>
            </tr>
          </tfoot>
        </table>
        {rows.length === 0 && (
          <div className="py-16 text-center text-slate-300 text-xs font-bold uppercase">No posted transactions in this period</div>
        )}
      </div>
    </div>
  );
};

// ── P&L Statement ─────────────────────────────────────────────────────────────

const PLReport: React.FC<{ accounts: AccountRow[]; ledger: LedgerRow[] }> = ({ accounts, ledger }) => {
  const { debit, credit } = useMemo(() => calcBalances(accounts, ledger), [accounts, ledger]);

  const getGroupTotal = (type: string) =>
    accounts.filter(a => a.type === type).reduce((s, a) => s + ((debit[a.id] || 0) - (credit[a.id] || 0)), 0);

  const revenue  = Math.abs(getGroupTotal('Revenue'));
  const expenses = Math.abs(getGroupTotal('Expense'));
  const netProfit = revenue - expenses;
  const margin   = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const revenueAccounts = accounts
    .filter(a => a.type === 'Revenue' && Math.abs((credit[a.id] || 0) - (debit[a.id] || 0)) > 0)
    .map(a => ({ ...a, balance: Math.abs((credit[a.id] || 0) - (debit[a.id] || 0)) }))
    .sort((a, b) => b.balance - a.balance);

  const expenseAccounts = accounts
    .filter(a => a.type === 'Expense' && Math.abs((debit[a.id] || 0) - (credit[a.id] || 0)) > 0)
    .map(a => ({ ...a, balance: Math.abs((debit[a.id] || 0) - (credit[a.id] || 0)) }))
    .sort((a, b) => b.balance - a.balance);

  const handleExport = () => {
    const rows = [
      { Section: 'REVENUE', 'G/L Code': '', Account: '', Amount: '' },
      ...revenueAccounts.map(a => ({ Section: '', 'G/L Code': a.code, Account: a.name, Amount: a.balance })),
      { Section: 'Total Revenue', 'G/L Code': '', Account: '', Amount: revenue },
      { Section: '', 'G/L Code': '', Account: '', Amount: '' },
      { Section: 'EXPENSES', 'G/L Code': '', Account: '', Amount: '' },
      ...expenseAccounts.map(a => ({ Section: '', 'G/L Code': a.code, Account: a.name, Amount: a.balance })),
      { Section: 'Total Expenses', 'G/L Code': '', Account: '', Amount: expenses },
      { Section: '', 'G/L Code': '', Account: '', Amount: '' },
      { Section: 'NET PROFIT / (LOSS)', 'G/L Code': '', Account: '', Amount: netProfit },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PL Statement');
    XLSX.writeFile(wb, `PL_Statement_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success('P&L exported');
  };

  const Section: React.FC<{ title: string; accounts: any[]; total: number; color: string }> = ({ title, accounts: accs, total, color }) => {
    const [expanded, setExpanded] = useState(true);
    return (
      <div className="border border-slate-200 rounded-2xl overflow-hidden">
        <button onClick={() => setExpanded(!expanded)}
          className={`w-full flex items-center justify-between px-5 py-3 ${color} font-black text-sm`}>
          <span className="flex items-center gap-2">{expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}{title}</span>
          <span>₨ {fmt(total)}</span>
        </button>
        {expanded && (
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-50">
              {accs.map(a => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-5 py-2 font-mono text-slate-400">{a.code}</td>
                  <td className="px-3 py-2 text-slate-700">{a.name}</td>
                  <td className="px-3 py-2 text-slate-400 text-[10px]">{a.company}</td>
                  <td className="px-5 py-2 text-right font-bold text-slate-800">₨ {fmt(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { l: 'Total Revenue',  v: `₨ ${fmt(revenue)}`,   c: 'border-emerald-200 bg-emerald-50', vc: 'text-emerald-700' },
          { l: 'Total Expenses', v: `₨ ${fmt(expenses)}`,  c: 'border-rose-200 bg-rose-50',       vc: 'text-rose-700'    },
          { l: netProfit >= 0 ? 'Net Profit' : 'Net Loss', v: `₨ ${fmt(netProfit)}`, c: netProfit >= 0 ? 'border-blue-200 bg-blue-50' : 'border-rose-200 bg-rose-50', vc: netProfit >= 0 ? 'text-blue-700' : 'text-rose-700' },
          { l: 'Profit Margin',  v: `${margin.toFixed(1)}%`, c: 'border-purple-200 bg-purple-50', vc: 'text-purple-700'  },
        ].map(k => (
          <div key={k.l} className={`border rounded-2xl p-4 ${k.c}`}>
            <p className="text-[9px] font-black text-slate-500 uppercase">{k.l}</p>
            <p className={`text-xl font-black mt-1 ${k.vc}`}>{k.v}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">
          <Download size={13}/> Export Excel
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50">
          <Printer size={13}/> Print
        </button>
      </div>

      <Section title="REVENUE" accounts={revenueAccounts} total={revenue} color="bg-emerald-50 text-emerald-800 border-b border-emerald-200" />
      <Section title="EXPENSES" accounts={expenseAccounts} total={expenses} color="bg-rose-50 text-rose-800 border-b border-rose-200" />

      {/* Net */}
      <div className={`rounded-2xl border-2 p-5 flex items-center justify-between ${netProfit >= 0 ? 'border-blue-400 bg-blue-50' : 'border-rose-400 bg-rose-50'}`}>
        <div>
          <p className="text-xs font-black text-slate-500 uppercase">{netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</p>
          <p className="text-[10px] text-slate-400">Revenue − Expenses = {fmt(revenue)} − {fmt(expenses)}</p>
        </div>
        <p className={`text-3xl font-black ${netProfit >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
          {netProfit < 0 && '('}₨ {fmt(netProfit)}{netProfit < 0 && ')'}
        </p>
      </div>
    </div>
  );
};

// ── Balance Sheet ─────────────────────────────────────────────────────────────

const BalanceSheetReport: React.FC<{ accounts: AccountRow[]; ledger: LedgerRow[] }> = ({ accounts, ledger }) => {
  const { debit, credit } = useMemo(() => calcBalances(accounts, ledger), [accounts, ledger]);

  const getAccounts = (type: string, sign: 1 | -1) =>
    accounts
      .filter(a => a.type === type)
      .map(a => ({ ...a, balance: sign * ((debit[a.id] || 0) - (credit[a.id] || 0)) }))
      .filter(a => Math.abs(a.balance) > 0)
      .sort((a, b) => b.balance - a.balance);

  const assets      = getAccounts('Asset', 1);
  const liabilities = getAccounts('Liability', -1);
  const equity      = getAccounts('Equity', -1);

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiab   = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity = equity.reduce((s, a) => s + a.balance, 0);
  const isBalanced  = Math.abs(totalAssets - (totalLiab + totalEquity)) < 1;

  const handleExport = () => {
    const rows = [
      { Section: 'ASSETS', Code: '', Account: '', Amount: '' },
      ...assets.map(a => ({ Section: '', Code: a.code, Account: a.name, Amount: a.balance })),
      { Section: 'Total Assets', Code: '', Account: '', Amount: totalAssets },
      { Section: '', Code: '', Account: '', Amount: '' },
      { Section: 'LIABILITIES', Code: '', Account: '', Amount: '' },
      ...liabilities.map(a => ({ Section: '', Code: a.code, Account: a.name, Amount: a.balance })),
      { Section: 'EQUITY', Code: '', Account: '', Amount: '' },
      ...equity.map(a => ({ Section: '', Code: a.code, Account: a.name, Amount: a.balance })),
      { Section: 'Total Liab + Equity', Code: '', Account: '', Amount: totalLiab + totalEquity },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance Sheet');
    XLSX.writeFile(wb, `BalanceSheet_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success('Balance Sheet exported');
  };

  const BSSection: React.FC<{ title: string; accs: any[]; total: number; color: string }> = ({ title, accs, total, color }) => (
    <div>
      <div className={`px-4 py-2 rounded-t-xl text-xs font-black uppercase text-white ${color}`}>{title}</div>
      <table className="w-full text-xs border border-t-0 border-slate-200 rounded-b-xl overflow-hidden">
        <tbody className="divide-y divide-slate-100">
          {accs.map(a => (
            <tr key={a.id} className="hover:bg-slate-50">
              <td className="px-4 py-2 font-mono text-slate-400">{a.code}</td>
              <td className="px-3 py-2 text-slate-700">{a.name}</td>
              <td className="px-3 py-2 text-slate-400 text-[10px]">{a.company}</td>
              <td className="px-4 py-2 text-right font-bold text-slate-800">₨ {fmt(a.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-100">
          <tr>
            <td colSpan={3} className="px-4 py-2 font-black text-slate-700 text-xs">Total {title}</td>
            <td className="px-4 py-2 text-right font-black text-slate-900">₨ {fmt(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black ${isBalanced ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {isBalanced ? <CheckCircle2 size={12}/> : <AlertCircle size={12}/>}
          {isBalanced ? 'Balance Sheet Balanced' : `Off by ₨ ${fmt(Math.abs(totalAssets - totalLiab - totalEquity))}`}
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">
            <Download size={13}/> Export
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50">
            <Printer size={13}/> Print
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <BSSection title="Assets" accs={assets} total={totalAssets} color="bg-blue-700" />
        <div className="space-y-4">
          <BSSection title="Liabilities" accs={liabilities} total={totalLiab} color="bg-orange-700" />
          <BSSection title="Equity" accs={equity} total={totalEquity} color="bg-purple-700" />
          <div className="bg-slate-800 text-white rounded-xl px-4 py-3 flex justify-between font-black">
            <span>Total Liab + Equity</span>
            <span>₨ {fmt(totalLiab + totalEquity)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Aging Report (AR / AP) ────────────────────────────────────────────────────

const AgingReport: React.FC<{
  accounts: AccountRow[];
  ledger: LedgerRow[];
  type: 'ar_aging' | 'ap_aging';
  asOfDate: string;
}> = ({ accounts, ledger, type, asOfDate }) => {
  const isAR = type === 'ar_aging';
  const accType = isAR ? 'Asset' : 'Liability';

  // P1-4: the aging report is for TRADE receivables/payables only. Filtering by
  // "every level-5 Asset/Liability" wrongly bucketed Cash, Inventory, Prepaids
  // (AR) and Tax/Wages/Loans (AP) as customer/vendor balances. Restrict to real
  // AR/AP accounts: per-client AR sub-accounts carry code 122xx (Customers
  // Control) or a receivable/customer name; vendor AP sub-accounts carry code
  // 211xx/221xx (Kin Long / Trade Payables) or a vendor/supplier name.
  const isARAcct = (a: AccountRow) =>
    /^122/.test(a.code || '') || /receivab|customer|debtor|client/i.test(a.name || '');
  const isAPAcct = (a: AccountRow) =>
    /^(211|221)/.test(a.code || '') || /vendor|supplier|trade payable|creditor/i.test(a.name || '');
  const targetAccounts = accounts.filter(
    a => a.type === accType && a.level === 5 && (isAR ? isARAcct(a) : isAPAcct(a))
  );
  const { debit, credit } = useMemo(() => calcBalances(accounts, ledger), [accounts, ledger]);

  const rows = useMemo(() => {
    const refDate = new Date(asOfDate);
    return targetAccounts.map(acc => {
      const balance = isAR
        ? (debit[acc.id] || 0) - (credit[acc.id] || 0)
        : (credit[acc.id] || 0) - (debit[acc.id] || 0);
      if (Math.abs(balance) < 1) return null;

      // Get last transaction date for this account
      const txDates = ledger
        .filter(tx => ((tx as any).details || tx.data?.details || tx.data?.lines || []).some((d: any) => d.accountId === acc.id))
        .map(tx => new Date(tx.doc_date || tx.date || asOfDate));

      const lastDate = txDates.length ? new Date(Math.max(...txDates.map(d => d.getTime()))) : refDate;
      const daysPast = Math.floor((refDate.getTime() - lastDate.getTime()) / 86400000);

      const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
      if (daysPast <= 30)       buckets.current = balance;
      else if (daysPast <= 60)  buckets.d30 = balance;
      else if (daysPast <= 90)  buckets.d60 = balance;
      else if (daysPast <= 120) buckets.d90 = balance;
      else                      buckets.over90 = balance;

      return { ...acc, balance, daysPast, lastDate, ...buckets };
    }).filter(Boolean) as any[];
  }, [targetAccounts, debit, credit, ledger, asOfDate, isAR]);

  const totals = rows.reduce((t, r) => ({
    balance: t.balance + r.balance,
    current: t.current + r.current,
    d30:     t.d30     + r.d30,
    d60:     t.d60     + r.d60,
    d90:     t.d90     + r.d90,
    over90:  t.over90  + r.over90,
  }), { balance: 0, current: 0, d30: 0, d60: 0, d90: 0, over90: 0 });

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'G/L Code':   r.code,
      'Account':    r.name,
      'Company':    r.company,
      'Balance':    r.balance,
      'Current':    r.current,
      '31-60 Days': r.d30,
      '61-90 Days': r.d60,
      '91-120 Days':r.d90,
      '120+ Days':  r.over90,
      'Days Aged':  r.daysPast,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isAR ? 'AR Aging' : 'AP Aging');
    XLSX.writeFile(wb, `${isAR ? 'AR' : 'AP'}_Aging_${asOfDate}.xlsx`);
    toast.success('Aging report exported');
  };

  const risk = (balance: number, over90: number) => {
    if (balance <= 0) return '';
    const pct = over90 / balance;
    if (pct > 0.5) return 'bg-rose-100';
    if (pct > 0.25) return 'bg-amber-50';
    return '';
  };

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { l: 'Total Balance', v: totals.balance, c: 'bg-slate-800 text-white' },
          { l: 'Current (0-30)', v: totals.current, c: 'bg-emerald-50 text-emerald-800 border border-emerald-200' },
          { l: '31-60 Days', v: totals.d30, c: 'bg-amber-50 text-amber-800 border border-amber-200' },
          { l: '61-90 Days', v: totals.d60, c: 'bg-orange-50 text-orange-800 border border-orange-200' },
          { l: '90+ Days', v: totals.over90 + totals.d90, c: 'bg-rose-50 text-rose-800 border border-rose-200' },
        ].map(k => (
          <div key={k.l} className={`rounded-xl p-3 ${k.c}`}>
            <p className="text-[9px] font-black uppercase opacity-70">{k.l}</p>
            <p className="text-lg font-black mt-0.5">₨ {fmt(k.v)}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">
          <Download size={13}/> Export
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50">
          <Printer size={13}/> Print
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-900 text-white">
            <tr>
              {['G/L Code','Account','Company','Balance','0–30','31–60','61–90','91–120','120+','Days'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-black text-[10px] uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <tr key={r.id} className={`hover:bg-slate-50 ${risk(r.balance, r.over90)}`}>
                <td className="px-3 py-2.5 font-mono text-slate-500">{r.code}</td>
                <td className="px-3 py-2.5 font-bold text-slate-800">{r.name}</td>
                <td className="px-3 py-2.5 text-slate-400">{r.company}</td>
                <td className="px-3 py-2.5 font-black text-slate-900 text-right">₨ {fmt(r.balance)}</td>
                <td className="px-3 py-2.5 text-right text-emerald-700">{r.current > 0 ? fmt(r.current) : '—'}</td>
                <td className="px-3 py-2.5 text-right text-amber-700">{r.d30 > 0 ? fmt(r.d30) : '—'}</td>
                <td className="px-3 py-2.5 text-right text-orange-700">{r.d60 > 0 ? fmt(r.d60) : '—'}</td>
                <td className="px-3 py-2.5 text-right text-rose-600">{r.d90 > 0 ? fmt(r.d90) : '—'}</td>
                <td className="px-3 py-2.5 text-right font-black text-rose-700">{r.over90 > 0 ? fmt(r.over90) : '—'}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${r.daysPast > 90 ? 'bg-rose-100 text-rose-700' : r.daysPast > 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {r.daysPast}d
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-800 text-white">
            <tr>
              <td colSpan={3} className="px-3 py-3 font-black">TOTAL</td>
              <td className="px-3 py-3 text-right font-black">₨ {fmt(totals.balance)}</td>
              <td className="px-3 py-3 text-right">₨ {fmt(totals.current)}</td>
              <td className="px-3 py-3 text-right">₨ {fmt(totals.d30)}</td>
              <td className="px-3 py-3 text-right">₨ {fmt(totals.d60)}</td>
              <td className="px-3 py-3 text-right">₨ {fmt(totals.d90)}</td>
              <td className="px-3 py-3 text-right">₨ {fmt(totals.over90)}</td>
              <td/>
            </tr>
          </tfoot>
        </table>
        {rows.length === 0 && (
          <div className="py-16 text-center text-slate-300 text-xs font-bold uppercase">
            No {isAR ? 'receivable' : 'payable'} accounts with balances in this period
          </div>
        )}
      </div>
    </div>
  );
};

// ── Cash Flow Statement ───────────────────────────────────────────────────────

const CashFlowReport: React.FC<{ accounts: AccountRow[]; ledger: LedgerRow[] }> = ({ accounts, ledger }) => {
  const { debit, credit } = useMemo(() => calcBalances(accounts, ledger), [accounts, ledger]);

  const sumType = (type: string, useCredit = false) =>
    accounts
      .filter(a => a.type === type)
      .reduce((s, a) => {
        const dr = debit[a.id]  || 0;
        const cr = credit[a.id] || 0;
        return s + (useCredit ? cr - dr : dr - cr);
      }, 0);

  const netProfit    = Math.abs(sumType('Revenue')) - Math.abs(sumType('Expense'));
  const arChange     = -sumType('Asset');
  const apChange     =  sumType('Liability');
  const operatingCF  = netProfit + arChange + apChange;
  const investingCF  = 0;
  const financingCF  = 0;
  const netChange    = operatingCF + investingCF + financingCF;

  const rows = [
    { label: 'Net Profit / (Loss)',           amount: netProfit,   indent: 1, bold: false },
    { label: 'Decrease in Receivables',       amount: arChange,    indent: 1, bold: false },
    { label: 'Increase in Payables',          amount: apChange,    indent: 1, bold: false },
    { label: 'Net Cash from Operations',      amount: operatingCF, indent: 0, bold: true  },
    { label: 'Purchase of Fixed Assets',      amount: investingCF, indent: 1, bold: false },
    { label: 'Net Cash from Investing',       amount: investingCF, indent: 0, bold: true  },
    { label: 'Loan Drawdowns / Repayments',   amount: financingCF, indent: 1, bold: false },
    { label: 'Net Cash from Financing',       amount: financingCF, indent: 0, bold: true  },
    { label: 'NET CHANGE IN CASH',            amount: netChange,   indent: 0, bold: true  },
  ];

  const exportRows = rows.map(r => ({ Activity: r.label, 'Amount (₨)': Math.round(r.amount) }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-[10px] text-slate-400 font-bold uppercase">Direct Method — Operating / Investing / Financing</p>
        <ReportExport title="Cash_Flow_Statement" rows={exportRows} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { l: 'Operating Cash Flow', v: operatingCF, c: operatingCF >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700' },
          { l: 'Investing Cash Flow',  v: investingCF, c: 'bg-slate-50 border-slate-200 text-slate-700' },
          { l: 'Financing Cash Flow',  v: financingCF, c: 'bg-slate-50 border-slate-200 text-slate-700' },
        ].map(k => (
          <div key={k.l} className={`border rounded-2xl p-4 ${k.c}`}>
            <p className="text-[9px] font-black uppercase opacity-70">{k.l}</p>
            <p className="text-xl font-black mt-1">₨ {fmt(Math.abs(k.v))}</p>
            <p className="text-[9px] mt-0.5 opacity-60">{k.v >= 0 ? 'Inflow' : 'Outflow'}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="px-5 py-3 text-left font-black text-[10px] uppercase">Activity</th>
              <th className="px-5 py-3 text-right font-black text-[10px] uppercase">Amount (₨)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={i} className={r.bold ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'}>
                <td className={`px-5 py-2.5 ${r.indent ? 'pl-10 text-slate-500' : 'font-black text-slate-800'}`}>{r.label}</td>
                <td className={`px-5 py-2.5 text-right ${r.bold ? 'font-black text-slate-900' : 'text-slate-600'} ${r.amount < 0 ? 'text-rose-600' : ''}`}>
                  {r.amount < 0 ? '(' : ''}₨ {fmt(Math.abs(r.amount))}{r.amount < 0 ? ')' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-2xl border-2 p-5 flex items-center justify-between ${netChange >= 0 ? 'border-emerald-400 bg-emerald-50' : 'border-rose-400 bg-rose-50'}`}>
        <p className={`text-sm font-black ${netChange >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
          Net Change in Cash Position
        </p>
        <p className={`text-3xl font-black ${netChange >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
          {netChange < 0 ? '(' : ''}₨ {fmt(Math.abs(netChange))}{netChange < 0 ? ')' : ''}
        </p>
      </div>
    </div>
  );
};

// ── Sales Analysis ────────────────────────────────────────────────────────────

interface SalesRow {
  client:   string;
  month:    string;
  product:  string;
  qty:      number;
  revenue:  number;
}

const SalesAnalysisReport: React.FC<{ company: Company; from: string; to: string }> = ({ company, from, to }) => {
  const [rows,    setRows]    = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<'client' | 'product' | 'month'>('client');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('invoices')
          .select('date, client_id, items, grand_total, clients(business_name)')
          .eq('company', company)
          .not('status', 'in', '("cancelled","draft")')
          .gte('date', from)
          .lte('date', to);
        if (cancelled) return;
        const parsed: SalesRow[] = [];
        (data ?? []).forEach((inv: any) => {
          const clientName = inv.clients?.business_name ?? inv.client_id ?? '—';
          const month = inv.date?.slice(0, 7) ?? '—';
          const items: any[] = Array.isArray(inv.items) ? inv.items : [];
          if (items.length === 0) {
            parsed.push({ client: clientName, month, product: '—', qty: 0, revenue: Number(inv.grand_total) || 0 });
          } else {
            items.forEach(item => {
              parsed.push({
                client:  clientName,
                month,
                product: item.productName ?? item.name ?? '—',
                qty:     Number(item.quantity) || 0,
                revenue: Number(item.subtotal)  || 0,
              });
            });
          }
        });
        setRows(parsed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [company, from, to]);

  const grouped = useMemo(() => {
    const map = new Map<string, { revenue: number; qty: number; count: number }>();
    rows.forEach(r => {
      const key = groupBy === 'client' ? r.client : groupBy === 'product' ? r.product : r.month;
      const cur = map.get(key) ?? { revenue: 0, qty: 0, count: 0 };
      map.set(key, { revenue: cur.revenue + r.revenue, qty: cur.qty + r.qty, count: cur.count + 1 });
    });
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [rows, groupBy]);

  const total = grouped.reduce((s, r) => s + r.revenue, 0);

  const exportRows = grouped.map(r => ({
    [groupBy === 'client' ? 'Client' : groupBy === 'product' ? 'Product' : 'Month']: r.key,
    'Revenue (₨)': Math.round(r.revenue),
    'Qty':         r.qty,
    'Share %':     total > 0 ? ((r.revenue / total) * 100).toFixed(1) : '0',
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['client', 'product', 'month'] as const).map(g => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${groupBy === g ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              By {g}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <ReportExport title={`Sales_Analysis_by_${groupBy}`} rows={exportRows} />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { l: 'Total Revenue',    v: `₨ ${fmt(total)}`,       c: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { l: `Unique ${groupBy}s`, v: String(grouped.length),  c: 'bg-blue-50 border-blue-200 text-blue-700' },
          { l: 'Top Contributor',   v: grouped[0]?.key ?? '—',   c: 'bg-amber-50 border-amber-200 text-amber-700' },
        ].map(k => (
          <div key={k.l} className={`border rounded-2xl p-4 ${k.c}`}>
            <p className="text-[9px] font-black uppercase opacity-70">{k.l}</p>
            <p className="text-lg font-black mt-1 truncate">{k.v}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs font-bold">Loading…</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-5 py-3 text-left font-black text-[10px] uppercase capitalize">{groupBy}</th>
                <th className="px-5 py-3 text-right font-black text-[10px] uppercase">Revenue</th>
                <th className="px-5 py-3 text-right font-black text-[10px] uppercase">Qty</th>
                <th className="px-5 py-3 text-right font-black text-[10px] uppercase">Share %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grouped.map((r, i) => (
                <tr key={r.key} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                  <td className="px-5 py-2.5 font-medium text-slate-800">{r.key}</td>
                  <td className="px-5 py-2.5 text-right font-black text-slate-900">₨ {fmt(r.revenue)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-500">{r.qty > 0 ? r.qty.toLocaleString() : '—'}</td>
                  <td className="px-5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${total > 0 ? (r.revenue / total) * 100 : 0}%` }} />
                      </div>
                      <span className="text-slate-600 w-10 text-right">
                        {total > 0 ? ((r.revenue / total) * 100).toFixed(1) : '0'}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-800 text-white">
              <tr>
                <td className="px-5 py-3 font-black">TOTAL</td>
                <td className="px-5 py-3 text-right font-black">₨ {fmt(total)}</td>
                <td className="px-5 py-3 text-right font-black">
                  {grouped.reduce((s, r) => s + r.qty, 0).toLocaleString()}
                </td>
                <td className="px-5 py-3 text-right font-black">100%</td>
              </tr>
            </tfoot>
          </table>
          {grouped.length === 0 && (
            <div className="py-16 text-center text-slate-300 text-xs font-bold uppercase">No invoices in this period</div>
          )}
        </div>
      )}
    </div>
  );
};

// ── GST Return ────────────────────────────────────────────────────────────────

interface GSTRow {
  period:       string;
  outputTax:    number;
  inputTax:     number;
  netPayable:   number;
  invoiceCount: number;
}

const GSTReturnReport: React.FC<{ company: Company; from: string; to: string }> = ({ company, from, to }) => {
  const [rows,    setRows]    = useState<GSTRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('invoices')
          .select('date, gst, grand_total, status')
          .eq('company', company)
          .not('status', 'in', '("cancelled","draft")')
          .gte('date', from)
          .lte('date', to);
        if (cancelled) return;
        const byMonth = new Map<string, { outputTax: number; count: number }>();
        (data ?? []).forEach((inv: any) => {
          const m = (inv.date ?? '').slice(0, 7);
          const cur = byMonth.get(m) ?? { outputTax: 0, count: 0 };
          byMonth.set(m, {
            outputTax: cur.outputTax + (Number(inv.gst) || 0),
            count:     cur.count + 1,
          });
        });
        const parsed: GSTRow[] = Array.from(byMonth.entries())
          .map(([period, v]) => ({
            period,
            outputTax:    v.outputTax,
            inputTax:     0,
            netPayable:   v.outputTax,
            invoiceCount: v.count,
          }))
          .sort((a, b) => a.period.localeCompare(b.period));
        setRows(parsed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [company, from, to]);

  const totals = rows.reduce(
    (t, r) => ({ output: t.output + r.outputTax, input: t.input + r.inputTax, net: t.net + r.netPayable }),
    { output: 0, input: 0, net: 0 },
  );

  const exportRows = rows.map(r => ({
    'Tax Period':     r.period,
    'Output GST (₨)': Math.round(r.outputTax),
    'Input GST (₨)':  Math.round(r.inputTax),
    'Net Payable (₨)':Math.round(r.netPayable),
    'Invoices':       r.invoiceCount,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-black text-slate-700">GST Return Summary</p>
          <p className="text-[10px] text-slate-400">Pakistan FBR — Standard Rate 18% · Simplified format</p>
        </div>
        <ReportExport title="GST_Return" rows={exportRows} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { l: 'Total Output Tax',  v: totals.output, c: 'bg-blue-50 border-blue-200 text-blue-700' },
          { l: 'Total Input Tax',   v: totals.input,  c: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { l: 'Net GST Payable',   v: totals.net,    c: 'bg-amber-50 border-amber-200 text-amber-800' },
        ].map(k => (
          <div key={k.l} className={`border rounded-2xl p-4 ${k.c}`}>
            <p className="text-[9px] font-black uppercase opacity-70">{k.l}</p>
            <p className="text-xl font-black mt-1">₨ {fmt(k.v)}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs font-bold">Loading…</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-white">
              <tr>
                {['Tax Period','Output GST','Input GST','Net Payable','Invoices'].map(h => (
                  <th key={h} className="px-5 py-3 text-left font-black text-[10px] uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => (
                <tr key={r.period} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-bold text-slate-800">{r.period}</td>
                  <td className="px-5 py-2.5 text-blue-700 font-medium">₨ {fmt(r.outputTax)}</td>
                  <td className="px-5 py-2.5 text-emerald-700 font-medium">₨ {fmt(r.inputTax)}</td>
                  <td className="px-5 py-2.5 font-black text-slate-900">₨ {fmt(r.netPayable)}</td>
                  <td className="px-5 py-2.5 text-slate-500">{r.invoiceCount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-800 text-white">
              <tr>
                <td className="px-5 py-3 font-black">TOTAL</td>
                <td className="px-5 py-3 font-black">₨ {fmt(totals.output)}</td>
                <td className="px-5 py-3 font-black">₨ {fmt(totals.input)}</td>
                <td className="px-5 py-3 font-black">₨ {fmt(totals.net)}</td>
                <td className="px-5 py-3 font-black">{rows.reduce((s, r) => s + r.invoiceCount, 0)}</td>
              </tr>
            </tfoot>
          </table>
          {rows.length === 0 && (
            <div className="py-16 text-center text-slate-300 text-xs font-bold uppercase">No GST invoices in this period</div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Link-out cards for standalone pages ──────────────────────────────────────

const LinkOutReports: React.FC<{ company: Company }> = ({ company }) => {
  const navigate = useNavigate();
  const cards = [
    { label: 'Cutter Performance',   desc: 'sqft/hr, wastage trend, defect rate',     path: '/production/cutter-performance', icon: <Gauge size={20}/>,      color: 'border-blue-200 bg-blue-50 text-blue-700' },
    { label: 'Vendor Scorecard',     desc: 'On-time %, defect %, price variance',      path: '/procurement/vendor-scorecard',  icon: <Users size={20}/>,      color: 'border-purple-200 bg-purple-50 text-purple-700' },
    { label: 'Stock Aging',          desc: 'Slow-moving, dead stock, ABC analysis',    path: '/procurement/stock-aging',       icon: <Package size={20}/>,    color: 'border-amber-200 bg-amber-50 text-amber-700' },
    { label: 'Project Profitability',desc: 'Revenue – direct cost – overhead per SO',  path: '/sales/project-profitability',   icon: <TrendingUp size={20}/>, color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  ];
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Standalone Operational Reports</p>
      <div className="grid grid-cols-2 gap-3">
        {cards.map(c => (
          <button key={c.path} onClick={() => navigate(c.path)}
            className={`flex items-start gap-4 p-5 rounded-2xl border text-left hover:shadow-md transition-all group ${c.color}`}>
            <div className="mt-0.5">{c.icon}</div>
            <div className="flex-1">
              <p className="font-black text-sm">{c.label}</p>
              <p className="text-[10px] mt-0.5 opacity-70">{c.desc}</p>
            </div>
            <ArrowUpRight size={16} className="opacity-50 group-hover:opacity-100 transition-opacity mt-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

const ReportsHub: React.FC<{ company: Company }> = ({ company }) => {
  const thisYear = new Date().getFullYear();
  const [reportType,  setReportType]  = useState<ReportType>('trial_balance');
  const [fromDate,    setFromDate]    = useState(`${thisYear}-01-01`);
  const [toDate,      setToDate]      = useState(new Date().toISOString().slice(0, 10));
  const [groupMode,   setGroupMode]   = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [accounts,    setAccounts]    = useState<AccountRow[]>([]);
  const [ledger,      setLedger]      = useState<LedgerRow[]>([]);
  const [lastLoaded,  setLastLoaded]  = useState('');

  const targetCompanies: Company[] = groupMode ? COMPANIES : [company];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadReportData(targetCompanies, fromDate, toDate);
      setAccounts(result.accounts);
      setLedger(result.ledger);
      setLastLoaded(new Date().toLocaleTimeString('en-PK'));
    } catch (e) {
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, [targetCompanies.join(','), fromDate, toDate]);

  useEffect(() => { load(); }, []);

  const QUICK_PERIODS = [
    { l: 'This Month', f: `${thisYear}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`, t: toDate },
    { l: 'Q1 2026',    f: `${thisYear}-01-01`, t: `${thisYear}-03-31` },
    { l: 'Q2 2026',    f: `${thisYear}-04-01`, t: `${thisYear}-06-30` },
    { l: 'YTD',        f: `${thisYear}-01-01`, t: toDate },
    { l: 'FY 2025',    f: '2025-01-01',         t: '2025-12-31' },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white p-6 rounded-[2rem] shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <BarChart4 size={20}/> Financial Reports Hub
            </h2>
            <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest mt-0.5">
              {groupMode ? 'All Companies — Group Consolidated' : company} · {lastLoaded ? `Updated ${lastLoaded}` : 'Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGroupMode(!groupMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                groupMode ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-white/10 text-white border-white/25 hover:bg-white/20'
              }`}>
              <Globe size={13}/> {groupMode ? 'Group Mode ON' : 'Group Mode'}
            </button>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/20">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/> Refresh
            </button>
            <button
              title="Push all GL entries from local storage to Supabase (run once after migration 010)"
              onClick={async () => {
                try {
                  const all = FinanceService.getLedger();
                  FinanceService.saveLedger(all);
                  toast.success(`Re-sync started — ${all.length} GL entries queued`);
                  setTimeout(load, 2000);
                } catch (e) {
                  toast.error('Re-sync failed');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/20">
              <RefreshCw size={13}/> Re-sync GL
            </button>
          </div>
        </div>
      </div>

      {/* Period + Quick Select */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black text-slate-400 uppercase">From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black text-slate-400 uppercase">To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400" />
          </div>
          <button onClick={load} disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Loading…' : 'Run Report'}
          </button>
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[9px] text-slate-400 font-black uppercase mr-1">Quick:</span>
            {QUICK_PERIODS.map(p => (
              <button key={p.l} onClick={() => { setFromDate(p.f); setToDate(p.t); }}
                className="px-2.5 py-1 bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 rounded-lg text-[10px] font-bold transition-colors">
                {p.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Report Type Tabs — grouped */}
      {(['Financial', 'Aging', 'Operations'] as const).map(grp => (
        <div key={grp} className="space-y-1">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">{grp}</p>
          <div className="flex gap-2 flex-wrap">
            {REPORT_TABS.filter(t => t.group === grp).map(t => (
              <button key={t.id} onClick={() => setReportType(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                  reportType === t.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Loading overlay */}
      {loading && (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <RefreshCw size={24} className="animate-spin text-blue-500 mx-auto mb-3"/>
          <p className="text-slate-400 text-xs font-bold">Loading from Supabase…</p>
        </div>
      )}

      {/* Report Content */}
      {!loading && (
        <>
          {reportType === 'trial_balance' && (
            <TrialBalanceReport accounts={accounts} ledger={ledger} onExport={() => {}} />
          )}
          {reportType === 'pl' && (
            <PLReport accounts={accounts} ledger={ledger} />
          )}
          {reportType === 'balance_sheet' && (
            <BalanceSheetReport accounts={accounts} ledger={ledger} />
          )}
          {(reportType === 'ar_aging' || reportType === 'ap_aging') && (
            <AgingReport accounts={accounts} ledger={ledger} type={reportType} asOfDate={toDate} />
          )}
          {reportType === 'inventory_valuation' && (
            <InventoryValuationReport company={company} />
          )}
          {reportType === 'cash_flow' && (
            <CashFlowReport accounts={accounts} ledger={ledger} />
          )}
          {reportType === 'sales_analysis' && (
            <SalesAnalysisReport company={company} from={fromDate} to={toDate} />
          )}
          {reportType === 'gst_return' && (
            <GSTReturnReport company={company} from={fromDate} to={toDate} />
          )}
          {reportType === 'bank_recon' && (
            <BankReconciliation company={company} />
          )}
        </>
      )}

      {/* Link-out cards — always visible at bottom */}
      {!loading && <LinkOutReports company={company} />}

      <style>{`@media print { .no-print { display: none !important; } body { margin: 0; font-size: 10px; } }`}</style>
    </div>
  );
};

export default ReportsHub;
