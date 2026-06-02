import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { supabase } from '@/src/services/supabaseClient';
import {
  TrendingUp, TrendingDown, RefreshCw,
  DollarSign, Target, BarChart2,
} from 'lucide-react';
import { toast } from 'sonner';
import ReportExport from '@/modules/finance/components/ReportExport';

interface ProjectRow {
  orderId:         string;
  orderNumber:     string;
  clientName:      string;
  orderDate:       string;
  status:          string;
  revenue:         number;
  cogs:            number;
  grossProfit:     number;
  grossMarginPct:  number;
}

const fmt    = (n: number)  => Math.round(n).toLocaleString('en-PK');
const fmtPct = (n: number)  => `${n.toFixed(1)}%`;

const ProjectProfitability: React.FC = () => {
  const { user, profile } = useAuthStore();
  const company           = useAppStore(s => s.selectedCompany) ?? profile?.company ?? user?.company ?? 'Glassco';

  const [rows,    setRows]    = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [from,    setFrom]    = useState(`${new Date().getFullYear()}-01-01`);
  const [to,      setTo]      = useState(new Date().toISOString().slice(0, 10));
  const [sort,    setSort]    = useState<'revenue' | 'grossProfit' | 'grossMarginPct'>('grossProfit');
  const [search,  setSearch]  = useState('');

  const load = async () => {
    setLoading(true);
    try {
      // Load sales orders in date range
      const { data: orders, error: soErr } = await supabase
        .from('sales_orders')
        .select('id, order_number, client_id, status, created_at, clients(business_name)')
        .eq('company', company)
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59');

      if (soErr) throw soErr;

      // Load invoices for these orders
      const orderIds = (orders ?? []).map((o) => o.id);
      let invoiceMap = new Map<string, number>();

      if (orderIds.length > 0) {
        const { data: invData } = await supabase
          .from('invoices')
          .select('order_id, grand_total, status')
          .eq('company', company)
          .in('order_id', orderIds)
          .not('status', 'in', '("cancelled","draft")');

        (invData ?? []).forEach((inv) => {
          const cur = invoiceMap.get(inv.order_id) ?? 0;
          invoiceMap.set(inv.order_id, cur + (Number(inv.grand_total) || 0));
        });
      }

      // Load GL COGS entries linked by order number
      const orderNumbers = (orders ?? []).map((o) => o.order_number).filter(Boolean);
      const cogsMap = new Map<string, number>();

      if (orderNumbers.length > 0) {
        const { data: glData } = await supabase
          .from('ledger')
          .select('reference, details, data')
          .eq('company', company)
          .eq('status', 'Posted')
          .in('reference', orderNumbers);

        (glData ?? []).forEach((tx) => {
          const details: any[] = tx.details ?? tx.data?.details ?? [];
          details.forEach((d) => {
            if ((d.accountName ?? '').toLowerCase().includes('cogs') ||
                (d.accountCode ?? '').startsWith('5')) {
              const cur = cogsMap.get(tx.reference) ?? 0;
              cogsMap.set(tx.reference, cur + (Number(d.debit) || 0));
            }
          });
        });
      }

      const parsed: ProjectRow[] = (orders ?? []).map((so) => {
        const revenue    = invoiceMap.get(so.id) ?? 0;
        const cogs       = cogsMap.get(so.order_number) ?? 0;
        const gp         = revenue - cogs;
        const gpPct      = revenue > 0 ? (gp / revenue) * 100 : 0;
        return {
          orderId:        so.id,
          orderNumber:    so.order_number ?? '—',
          // Supabase join returns clients as array; pick first row's business_name
          clientName:     (Array.isArray(so.clients) ? so.clients[0]?.business_name : (so.clients as { business_name?: string } | null)?.business_name) ?? so.client_id ?? '—',
          orderDate:      (so.created_at ?? '').slice(0, 10),
          status:         so.status ?? '—',
          revenue,
          cogs,
          grossProfit:    gp,
          grossMarginPct: Math.round(gpPct * 10) / 10,
        };
      });

      setRows(parsed);
    } catch (e) {
      toast.error('Failed to load profitability data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [company, from, to]);

  const filtered = useMemo(() =>
    rows
      .filter(r =>
        !search ||
        r.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.clientName.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => b[sort] - a[sort]),
    [rows, sort, search],
  );

  const totals = filtered.reduce(
    (t, r) => ({ revenue: t.revenue + r.revenue, cogs: t.cogs + r.cogs, gp: t.gp + r.grossProfit }),
    { revenue: 0, cogs: 0, gp: 0 },
  );
  const avgMargin = totals.revenue > 0 ? (totals.gp / totals.revenue) * 100 : 0;

  const exportRows = filtered.map(r => ({
    'Order #':       r.orderNumber,
    'Client':        r.clientName,
    'Date':          r.orderDate,
    'Status':        r.status,
    'Revenue (₨)':   Math.round(r.revenue),
    'COGS (₨)':      Math.round(r.cogs),
    'Gross Profit':  Math.round(r.grossProfit),
    'Margin %':      r.grossMarginPct,
  }));

  const marginColor = (pct: number) =>
    pct >= 30 ? 'text-emerald-700' : pct >= 15 ? 'text-amber-700' : pct >= 0 ? 'text-orange-700' : 'text-rose-700';

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-emerald-900 text-white p-6 rounded-[2rem] shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <BarChart2 size={20}/> Project Profitability
            </h2>
            <p className="text-[10px] text-emerald-300 font-bold uppercase tracking-widest mt-0.5">
              {company} · Revenue – COGS = Gross Profit per Sales Order
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/20">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[9px] font-black text-slate-400 uppercase">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[9px] font-black text-slate-400 uppercase">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400" />
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search order / client…"
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs w-48 focus:outline-none focus:border-blue-400" />
        <button onClick={load} disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Loading…' : 'Run'}
        </button>
        <div className="ml-auto">
          <ReportExport title="Project_Profitability" rows={exportRows} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { l: 'Total Revenue',    v: `₨ ${fmt(totals.revenue)}`, c: 'border-blue-200 bg-blue-50 text-blue-700',            icon: <DollarSign size={16}/> },
          { l: 'Total COGS',       v: `₨ ${fmt(totals.cogs)}`,    c: 'border-rose-200 bg-rose-50 text-rose-700',             icon: <TrendingDown size={16}/> },
          { l: 'Gross Profit',     v: `₨ ${fmt(totals.gp)}`,      c: totals.gp >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700', icon: <Target size={16}/> },
          { l: 'Avg Gross Margin', v: fmtPct(avgMargin),           c: avgMargin >= 20 ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-amber-200 bg-amber-50 text-amber-700', icon: <TrendingUp size={16}/> },
        ].map(k => (
          <div key={k.l} className={`border rounded-2xl p-4 ${k.c}`}>
            <p className="text-[9px] font-black uppercase opacity-70 flex items-center gap-1">{k.icon}{k.l}</p>
            <p className="text-xl font-black mt-1">{k.v}</p>
          </div>
        ))}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black text-slate-400 uppercase">Sort by:</span>
        {(['revenue', 'grossProfit', 'grossMarginPct'] as const).map(s => (
          <button key={s} onClick={() => setSort(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${sort === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
            {s === 'revenue' ? 'Revenue' : s === 'grossProfit' ? 'Gross Profit' : 'Margin %'}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-slate-300 text-xs font-bold">Loading orders…</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-white">
              <tr>
                {['Order #','Client','Date','Status','Revenue','COGS','Gross Profit','Margin %'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-black text-[10px] uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r, i) => (
                <tr key={r.orderId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                  <td className="px-4 py-2.5 font-mono font-bold text-slate-700">{r.orderNumber}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.clientName}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.orderDate}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-600 capitalize">{r.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                    {r.revenue > 0 ? `₨ ${fmt(r.revenue)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-rose-600">
                    {r.cogs > 0 ? `₨ ${fmt(r.cogs)}` : '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-black ${r.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {r.revenue > 0
                      ? `${r.grossProfit < 0 ? '(' : ''}₨ ${fmt(Math.abs(r.grossProfit))}${r.grossProfit < 0 ? ')' : ''}`
                      : '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-black ${marginColor(r.grossMarginPct)}`}>
                    {r.revenue > 0 ? fmtPct(r.grossMarginPct) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-800 text-white">
              <tr>
                <td colSpan={4} className="px-4 py-3 font-black">TOTAL ({filtered.length} orders)</td>
                <td className="px-4 py-3 text-right font-black">₨ {fmt(totals.revenue)}</td>
                <td className="px-4 py-3 text-right font-black">₨ {fmt(totals.cogs)}</td>
                <td className="px-4 py-3 text-right font-black">₨ {fmt(totals.gp)}</td>
                <td className="px-4 py-3 text-right font-black">{fmtPct(avgMargin)}</td>
              </tr>
            </tfoot>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-slate-300 text-xs font-bold uppercase">
              No sales orders found for this period
            </div>
          )}
        </div>
      )}

      <style>{`@media print { .no-print { display: none !important; } }`}</style>
    </div>
  );
};

export default ProjectProfitability;
