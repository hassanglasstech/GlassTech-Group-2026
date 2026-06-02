import React, { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Search,
  Loader2, RefreshCw, ChevronRight, Package, AlertTriangle
} from 'lucide-react';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Quotation } from '@/modules/production/types/production';

// ── Helpers ───────────────────────────────────────────────────────────
const fmt = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` :
  Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K` :
  n.toFixed(0);

// Estimate COGS: glass cost ≈ 55% of revenue (industry baseline for GlassCo)
// Services cost ≈ 30% of service charges
// This gives approximate P&L until actual cost tracking is wired
const GLASS_COST_RATIO    = 0.55;
const SERVICE_COST_RATIO  = 0.30;
const OVERHEAD_PER_SQFT   = 18;  // PKR overhead per sqft

interface JobPL {
  orderId:     string;
  clientId:    string;
  projectName: string;
  date:        string;
  status:      string;
  revenue:     number;
  serviceRev:  number;
  glassCost:   number;
  serviceCost: number;
  overhead:    number;
  totalCost:   number;
  grossProfit: number;
  margin:      number;     // %
  totalSqft:   number;
  pieces:      number;
  hasIssue:    boolean;
}

// ── P&L Card ──────────────────────────────────────────────────────────
const PLBar: React.FC<{ revenue: number; cost: number; profit: number }> = ({ revenue, cost, profit }) => {
  const costPct   = revenue > 0 ? Math.min(100, (cost / revenue) * 100) : 0;
  const profitPct = revenue > 0 ? Math.min(100, (profit / revenue) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="h-3 bg-slate-700 rounded-full overflow-hidden flex">
        <div className="bg-red-500/70 h-full transition-all" style={{ width: `${costPct}%` }} />
        <div className="bg-green-500/70 h-full transition-all" style={{ width: `${profitPct}%` }} />
      </div>
      <div className="flex justify-between text-[9px] text-slate-500">
        <span className="text-red-400">Cost {costPct.toFixed(0)}%</span>
        <span className="text-green-400">Profit {profitPct.toFixed(0)}%</span>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────
const JobPL: React.FC = () => {
  const [jobs, setJobs]         = useState<JobPL[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [sort, setSort]         = useState<'margin' | 'revenue' | 'date'>('date');
  const [selected, setSelected] = useState<JobPL | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const quotations = SalesService.getQuotations().filter(
        (q: Quotation) => q.company === 'Glassco' && q.status !== 'Draft'
      );
      const pieces     = ProductionService.getProductionPieces();
      const grns       = InventoryService.getPurchaseOrders();

      const computed: JobPL[] = quotations.map((q: Quotation) => {
        // Revenue
        const glassRev  = q.items.reduce((s, i) => s + (i.amount || 0), 0);
        const discount  = q.discountAmount || (glassRev * (q.discountPercent || 0) / 100);
        const netGlass  = glassRev - discount;
        const serviceRev = q.serviceCharges?.reduce((s, c) => s + (c.amount || 0), 0) ?? 0;
        const revenue   = netGlass + serviceRev;

        // Sqft
        const totalSqft = q.items.reduce((s, i) => s + (i.totalSqFt || 0), 0);

        // COGS (estimated)
        const glassCost   = netGlass * GLASS_COST_RATIO;
        const serviceCost = serviceRev * SERVICE_COST_RATIO;
        const overhead    = totalSqft * OVERHEAD_PER_SQFT;
        const totalCost   = glassCost + serviceCost + overhead;

        const grossProfit = revenue - totalCost;
        const margin      = revenue > 0 ? parseFloat(((grossProfit / revenue) * 100).toFixed(1)) : 0;

        // Pieces
        const orderPieces = pieces.filter(p => p.orderId === q.id);
        const hasIssue    = orderPieces.some(p => p.status === 'QC-Failed' || p.fault);

        return {
          orderId:     q.id,
          clientId:    q.clientId,
          projectName: q.projectName || q.subject || q.site || q.id,
          date:        q.date,
          status:      q.status,
          revenue,
          serviceRev,
          glassCost,
          serviceCost,
          overhead,
          totalCost,
          grossProfit,
          margin,
          totalSqft:   parseFloat(totalSqft.toFixed(1)),
          pieces:      orderPieces.length,
          hasIssue,
        };
      });

      setJobs(computed);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let list = jobs;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(j =>
        j.projectName.toLowerCase().includes(q) ||
        j.orderId.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sort === 'margin')  return b.margin  - a.margin;
      if (sort === 'revenue') return b.revenue - a.revenue;
      return b.date.localeCompare(a.date);
    });
  }, [jobs, search, sort]);

  // Summary KPIs
  const totalRevenue  = jobs.reduce((s, j) => s + j.revenue, 0);
  const totalProfit   = jobs.reduce((s, j) => s + j.grossProfit, 0);
  const avgMargin     = jobs.length > 0 ? jobs.reduce((s, j) => s + j.margin, 0) / jobs.length : 0;
  const lossJobs      = jobs.filter(j => j.margin < 0).length;

  // Detail view
  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-xs underline">← Back</button>
          <span className="font-black text-white truncate">{selected.projectName}</span>
        </div>

        {/* Margin indicator */}
        <div className={`rounded-xl border p-5 ${selected.margin >= 20 ? 'bg-green-500/10 border-green-500/20' : selected.margin >= 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
          <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Gross Margin</div>
          <div className={`text-4xl font-black ${selected.margin >= 20 ? 'text-green-400' : selected.margin >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
            {selected.margin}%
          </div>
          <PLBar revenue={selected.revenue} cost={selected.totalCost} profit={selected.grossProfit} />
        </div>

        {/* Line items */}
        <div className="bg-slate-800 rounded-xl divide-y divide-slate-700">
          {[
            { label: 'Glass Revenue',   value: selected.revenue - selected.serviceRev, color: 'text-white' },
            { label: 'Service Revenue', value: selected.serviceRev,                    color: 'text-white' },
            { label: 'Total Revenue',   value: selected.revenue,                       color: 'text-green-400', bold: true },
            { label: 'Glass COGS (est.)', value: -selected.glassCost,                  color: 'text-red-400' },
            { label: 'Service Cost (est.)', value: -selected.serviceCost,              color: 'text-red-400' },
            { label: 'Overhead (est.)', value: -selected.overhead,                     color: 'text-red-400' },
            { label: 'Total Cost (est.)', value: -selected.totalCost,                  color: 'text-red-400', bold: true },
            { label: 'Gross Profit',    value: selected.grossProfit,                   color: selected.grossProfit >= 0 ? 'text-green-400' : 'text-red-400', bold: true },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
              <span className={`text-sm ${row.bold ? 'font-bold text-white' : 'text-slate-400'}`}>{row.label}</span>
              <span className={`text-sm font-bold ${row.color}`}>
                PKR {fmt(Math.abs(row.value))}{row.value < 0 ? '' : ''}
              </span>
            </div>
          ))}
        </div>

        {/* Meta */}
        <div className="bg-slate-800 rounded-xl px-4 py-3 space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-slate-400">Total Sqft</span><span className="text-white">{selected.totalSqft}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Pieces</span><span className="text-white">{selected.pieces}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Date</span><span className="text-white">{selected.date}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Status</span><span className="text-white">{selected.status}</span></div>
          {selected.hasIssue && <div className="text-red-400 flex items-center gap-1"><AlertTriangle size={11} /> QC issues on this job</div>}
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-xs text-yellow-400">
          ⚠️ COGS are estimated. Wire actual GRN costs in 4C for exact figures.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Job P&L</h2>
          <p className="text-xs text-slate-500 mt-0.5">Per-order profit & loss · GlassCo</p>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
          <div className="text-xl font-black text-green-400">PKR {fmt(totalRevenue)}</div>
          <div className="text-[10px] text-green-400 uppercase tracking-widest mt-0.5">Total Revenue</div>
        </div>
        <div className={`rounded-xl border p-4 ${totalProfit >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
          <div className={`text-xl font-black ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            PKR {fmt(Math.abs(totalProfit))}
          </div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">
            {totalProfit >= 0 ? 'Total Profit (est.)' : 'Total Loss (est.)'}
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-xl font-black text-white">{avgMargin.toFixed(1)}%</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Avg Margin</div>
        </div>
        <div className={`rounded-xl border p-4 ${lossJobs > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-800'}`}>
          <div className={`text-xl font-black ${lossJobs > 0 ? 'text-red-400' : 'text-white'}`}>{lossJobs}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Loss Jobs</div>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-4 py-2.5">
        <Search size={14} className="text-slate-500 shrink-0" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search project..."
          className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none" />
      </div>
      <div className="flex gap-2">
        {(['date', 'revenue', 'margin'] as const).map(s => (
          <button key={s} onClick={() => setSort(s)}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all
              ${sort === s ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-400'}`}>
            {s === 'date' ? 'Latest' : s === 'revenue' ? 'Revenue' : 'Margin'}
          </button>
        ))}
      </div>

      {/* Job list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">Koi jobs nahi</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(job => (
            <button key={job.orderId} onClick={() => setSelected(job)}
              className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-left transition-all space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm truncate">{job.projectName}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {job.date} · {job.totalSqft} sqft · {job.pieces} pcs
                    {job.hasIssue && <span className="text-red-400 ml-1">⚠️</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-black ${job.margin >= 20 ? 'text-green-400' : job.margin >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {job.margin}%
                  </div>
                  <div className="text-[10px] text-slate-500">PKR {fmt(job.revenue)}</div>
                </div>
              </div>
              <PLBar revenue={job.revenue} cost={job.totalCost} profit={job.grossProfit} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default JobPL;
