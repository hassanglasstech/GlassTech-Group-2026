/**
 * GlasscoOpsDashboard.tsx — Phase 6 (6.5)
 *
 * Single-pane Glassco operations dashboard combining sales + production
 * KPIs. Designed for the owner / shift incharge to see the day's status
 * at a glance without bouncing between modules.
 *
 * Reads from existing services (no new schema required):
 *   • SalesService           — quotations, invoices, payment receipts
 *   • ProductionService      — pieces, dispatches
 *   • NCRService (in-line)   — open NCR count
 *   • creditNoteService      — credit notes month-to-date
 *
 * Time windows:
 *   • Today       (calendar day)
 *   • This Week   (Mon–Sun)
 *   • This Month  (calendar month)
 *
 * Mounted as a "Glassco Ops" tab in production module.
 */

import React, { useMemo, useState } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { NCRService } from '@/modules/production/services/ncrService';
import { getCreditNotes } from '@/modules/sales/services/creditNoteService';
import {
  Activity, FileText, ShoppingCart, Banknote, AlertTriangle,
  Package, TrendingUp, RefreshCw, Calendar, Scissors, Truck
} from 'lucide-react';

type Window = 'today' | 'week' | 'month';

const fmtPKR = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M`
  : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K`
  : n.toLocaleString('en-PK');

const _within = (date: string | undefined, win: Window): boolean => {
  if (!date) return false;
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  if (win === 'today') {
    return d.toDateString() === now.toDateString();
  }
  if (win === 'week') {
    const day = now.getDay() || 7;          // 1..7 (Mon=1)
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day - 1));
    monday.setHours(0, 0, 0, 0);
    return d >= monday && d <= now;
  }
  // month
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  icon?: React.ReactNode;
}
const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, tone = 'default', icon }) => {
  const toneClass = {
    default: 'bg-white text-slate-900 border-slate-200',
    good:    'bg-emerald-50 text-emerald-900 border-emerald-200',
    warn:    'bg-amber-50 text-amber-900 border-amber-200',
    bad:     'bg-rose-50 text-rose-900 border-rose-200',
  }[tone];
  return (
    <div className={`rounded-2xl border-2 ${toneClass} p-4 shadow-sm flex flex-col gap-1`}>
      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest opacity-70">
        {icon}<span>{label}</span>
      </div>
      <div className="text-2xl font-black leading-none">{value}</div>
      {sub && <div className="text-[10px] font-bold opacity-60">{sub}</div>}
    </div>
  );
};

const GlasscoOpsDashboard: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany) as any;
  const [win, setWin] = useState<Window>('today');
  const [tick, setTick] = useState(0);                  // bump to refresh

  const data = useMemo(() => {
    const quotations  = SalesService.getQuotations().filter((q: any) => q.company === 'Glassco');
    const invoices    = (SalesService.getInvoices() as any[]).filter(i => i.company === 'Glassco');
    const receipts    = (SalesService.getPaymentReceipts() as any[]);
    const pieces      = ProductionService.getProductionPieces();
    const dispatches  = ProductionService.getTemperingDispatches().filter((d: any) => d.company === 'Glassco' || d.company === 'Factory');
    const ncrs        = NCRService.getNCREvents().filter((n: any) => n.company === 'Glassco');
    const creditNotes = getCreditNotes('Glassco' as any);

    // ─ SALES KPIs ─
    const newQuotations = quotations.filter((q: any) => _within(q.date, win));
    const approvedThis  = quotations.filter((q: any) => q.status === 'Approved' && _within((q as any).statusChangedAt || q.date, win));
    const lostThis      = quotations.filter((q: any) => (q.status === 'Lost' || q.status === 'Rejected' || q.status === 'Expired') && _within((q as any).statusChangedAt || q.date, win));
    const winRateDenom  = approvedThis.length + lostThis.length;
    const winRate       = winRateDenom > 0 ? Math.round((approvedThis.length / winRateDenom) * 100) : 0;
    const orderValue    = approvedThis.reduce((s: number, q: any) =>
      s + ((q.items || []).reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0)), 0);

    // ─ FINANCE KPIs ─
    const invoicedThis  = invoices.filter(i => _within(i.date, win));
    const invoicedValue = invoicedThis.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
    const collectedThis = receipts.filter(r => _within(r.date, win))
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const outstandingAR = invoices.filter(i => i.status !== 'Paid' && i.status !== 'Voided')
      .reduce((s, i) => s + Number(i.balance || 0), 0);
    const overdueAR     = invoices.filter(i => i.status !== 'Paid' && i.status !== 'Voided' && i.dueDate && i.dueDate < new Date().toISOString().split('T')[0])
      .reduce((s, i) => s + Number(i.balance || 0), 0);
    const cnThis        = creditNotes.filter((c: any) => _within(c.date, win))
      .reduce((s: number, c: any) => s + Number(c.amount || 0), 0);

    // ─ PRODUCTION KPIs ─
    const piecesCutThis = pieces.filter(p => _within((p as any).lastUpdated, win) && p.status === 'Cut').length;
    const piecesDeliveredThis = pieces.filter(p => _within((p as any).lastUpdated, win) && p.status === 'Delivered').length;
    const piecesInProgress = pieces.filter(p =>
      ['Cut','Service-Pending','QC-Pending','QC-Passed','Ready to Dispatch','Dispatched','Tempered','Received-From-Tempering'].includes(p.status)
    ).length;
    const dispatchesThis = dispatches.filter((d: any) => _within(d.date, win)).length;

    // ─ QUALITY KPIs ─
    const ncrOpen   = ncrs.filter((n: any) => n.status === 'Open' || n.status === 'Reproduce-Pending' || n.status === 'Claim-Pending').length;
    const ncrThis   = ncrs.filter((n: any) => _within(n.reportedAt || n.date, win)).length;
    const sqftLost  = ncrs.filter((n: any) => _within(n.reportedAt || n.date, win))
      .reduce((s: number, n: any) => s + Number(n.sqftLost || 0), 0);

    return {
      newQuotations: newQuotations.length,
      approvedCount: approvedThis.length,
      lostCount:     lostThis.length,
      winRate,
      orderValue,
      invoicedCount: invoicedThis.length,
      invoicedValue,
      collectedThis,
      outstandingAR,
      overdueAR,
      cnThis,
      piecesCutThis,
      piecesDeliveredThis,
      piecesInProgress,
      dispatchesThis,
      ncrOpen,
      ncrThis,
      sqftLost,
    };
  }, [win, tick]);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-700 text-white p-6 rounded-3xl shadow-xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            <Activity size={12}/><span>Glassco Operations</span>
          </div>
          <h2 className="text-2xl font-black mt-1">Combined Sales + Production Dashboard</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
            Live KPIs · {win === 'today' ? 'Today' : win === 'week' ? 'This Week (Mon–Sun)' : 'This Month'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white/5 rounded-xl p-1 flex gap-1">
            {(['today','week','month'] as const).map(w => (
              <button key={w} onClick={() => setWin(w)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${win === w ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-white/10'}`}>
                {w === 'today' ? 'Today' : w === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          <button onClick={() => setTick(t => t + 1)} className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5">
            <RefreshCw size={12}/> Refresh
          </button>
        </div>
      </div>

      {/* Sales row */}
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
          <ShoppingCart size={12}/><span>Sales Funnel</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="New Quotations"  value={data.newQuotations} icon={<FileText size={11}/>} />
          <KpiCard label="Approved"        value={data.approvedCount} tone="good" icon={<TrendingUp size={11}/>} />
          <KpiCard label="Lost / Rejected / Expired" value={data.lostCount} tone={data.lostCount > 0 ? 'bad' : 'default'} />
          <KpiCard label="Win Rate"        value={`${data.winRate}%`} sub={`${data.approvedCount} won / ${data.lostCount + data.approvedCount} closed`} tone={data.winRate >= 50 ? 'good' : data.winRate < 25 ? 'bad' : 'warn'} />
          <KpiCard label="Order Value"     value={`PKR ${fmtPKR(data.orderValue)}`} sub="Approved this period" tone="good" />
        </div>
      </div>

      {/* Finance row */}
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
          <Banknote size={12}/><span>Finance</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Invoices Posted" value={data.invoicedCount} sub={`PKR ${fmtPKR(data.invoicedValue)}`} icon={<FileText size={11}/>} />
          <KpiCard label="Collected"       value={`PKR ${fmtPKR(data.collectedThis)}`} tone="good" sub="Receipts this period" />
          <KpiCard label="Outstanding AR"  value={`PKR ${fmtPKR(data.outstandingAR)}`} tone={data.outstandingAR > 0 ? 'warn' : 'good'} sub="All unpaid" />
          <KpiCard label="Overdue AR"      value={`PKR ${fmtPKR(data.overdueAR)}`} tone={data.overdueAR > 0 ? 'bad' : 'good'} sub="Past due date" />
          <KpiCard label="Credit Notes"    value={`PKR ${fmtPKR(data.cnThis)}`} sub="Issued this period" tone={data.cnThis > 0 ? 'warn' : 'default'} />
        </div>
      </div>

      {/* Production + Quality row */}
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
          <Scissors size={12}/><span>Production & Quality</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Pieces Cut"       value={data.piecesCutThis} sub="This period" icon={<Scissors size={11}/>} />
          <KpiCard label="Pieces Delivered" value={data.piecesDeliveredThis} tone="good" icon={<Truck size={11}/>} />
          <KpiCard label="WIP (in-progress)" value={data.piecesInProgress} sub="All pending" icon={<Package size={11}/>} />
          <KpiCard label="Tempering Dispatches" value={data.dispatchesThis} sub="This period" />
          <KpiCard label="Open NCRs"        value={data.ncrOpen} sub={`${data.ncrThis} new this period · ${data.sqftLost.toFixed(1)} sqft lost`} tone={data.ncrOpen > 0 ? 'warn' : 'good'} icon={<AlertTriangle size={11}/>} />
        </div>
      </div>

      <p className="text-[9px] text-slate-400 italic text-right">
        Phase-6 (6.5) · Live read from local services + Supabase cache · Refresh button reruns aggregations.
      </p>
    </div>
  );
};

export default GlasscoOpsDashboard;
