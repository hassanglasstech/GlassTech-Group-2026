import React, { useEffect, useState, useMemo } from 'react';
import {
  Handshake, RefreshCw, Loader2, TrendingUp,
  TrendingDown, AlertTriangle, Star, BarChart3, Clock
} from 'lucide-react';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { supabase } from '@/src/services/supabaseClient';

// ── Helpers ───────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` :
  n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` :
  n.toFixed(0);

interface VendorIntel {
  vendorId:    string;
  vendorName:  string;
  category:    string;
  totalOrders: number;
  totalSpend:  number;
  avgOrderVal: number;
  onTimeCount: number;
  breachCount: number;
  slaScore:    number;
  lastOrder:   string;
  priceTrend:  'up' | 'down' | 'stable';
  rateHistory: { month: string; rate: number }[];
  recommended: boolean;
  risk:        'Low' | 'Medium' | 'High';
}

const RISK_STYLE: Record<string, string> = {
  Low:    'bg-green-500/20 text-green-400 border-green-500/30',
  Medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  High:   'bg-red-500/20 text-red-400 border-red-500/30',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthLabel = (d: string) => {
  const dt = new Date(d);
  return `${MONTHS[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}`;
};

// ── Mini sparkline ────────────────────────────────────────────────────
const Sparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const w = 60, h = 20;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / range) * h,
  ]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  return (
    <svg width={w} height={h} className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};

// ── Main Component ────────────────────────────────────────────────────
const VendorIntelligence: React.FC = () => {
  const [vendors, setVendors]     = useState<VendorIntel[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<VendorIntel | null>(null);
  const [filterRisk, setFilterRisk] = useState<'All' | 'Low' | 'Medium' | 'High'>('All');
  const [filterCat, setFilterCat] = useState<string>('All');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const pos = InventoryService.getPurchaseOrders().filter((p: any) => p.fromCompany === 'Glassco');

      // ── Build vendor profiles from POs ────────────────────────────
      const vendorMap: Record<string, any[]> = {};
      pos.forEach((p: any) => {
        const vid = p.vendorId || p.toVendor;
        if (!vid) return;
        if (!vendorMap[vid]) vendorMap[vid] = [];
        vendorMap[vid].push(p);
      });

      // ── Merge with SLA data from Supabase ────────────────────────
      const { data: slaData } = await supabase
        .from('vendor_sla')
        .select('*')
        .eq('company', 'Glassco');

      const slaMap: Record<string, any> = {};
      (slaData || []).forEach((s: any) => { slaMap[s.vendor_name] = s; });

      const built: VendorIntel[] = Object.entries(vendorMap).map(([vid, orders]) => {
        const vendorName = orders[0]?.toVendor || vid;
        const sla        = slaMap[vendorName] || {};
        const totalSpend = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
        const category   = orders[0]?.category || 'Other';

        // Rate history by month
        const byMonth: Record<string, number[]> = {};
        orders.forEach(o => {
          const mk = o.date?.slice(0, 7);
          if (!mk) return;
          if (!byMonth[mk]) byMonth[mk] = [];
          byMonth[mk].push(o.totalAmount / Math.max(o.totalSheets || 1, 1));
        });
        const rateHistory = Object.entries(byMonth)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-6)
          .map(([month, rates]) => ({
            month: monthLabel(month + '-01'),
            rate:  rates.reduce((s, r) => s + r, 0) / rates.length,
          }));

        // Price trend
        let priceTrend: 'up' | 'down' | 'stable' = 'stable';
        if (rateHistory.length >= 2) {
          const first = rateHistory[0].rate, last = rateHistory[rateHistory.length - 1].rate;
          const chg = ((last - first) / (first || 1)) * 100;
          if (chg > 5) priceTrend = 'up';
          else if (chg < -5) priceTrend = 'down';
        }

        // SLA score & risk
        const slaScore  = sla.sla_score ?? (orders.length > 2 ? 75 : 100);
        const breaches  = sla.breach_count ?? 0;
        const onTime    = sla.on_time_count ?? orders.length;
        const risk: 'Low' | 'Medium' | 'High' =
          slaScore < 60 || breaches > 3 ? 'High' :
          slaScore < 80 || breaches > 1 ? 'Medium' : 'Low';

        return {
          vendorId:    vid,
          vendorName,
          category,
          totalOrders: orders.length,
          totalSpend,
          avgOrderVal: totalSpend / Math.max(orders.length, 1),
          onTimeCount: onTime,
          breachCount: breaches,
          slaScore:    parseFloat(slaScore.toFixed(1)),
          lastOrder:   orders.map(o => o.date || '').sort().reverse()[0] || '',
          priceTrend,
          rateHistory,
          recommended: slaScore >= 85 && risk === 'Low',
          risk,
        };
      });

      setVendors(built.sort((a, b) => b.totalSpend - a.totalSpend));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const categories = useMemo(() => ['All', ...new Set(vendors.map(v => v.category))], [vendors]);

  const filtered = useMemo(() =>
    vendors.filter(v =>
      (filterRisk === 'All' || v.risk === filterRisk) &&
      (filterCat  === 'All' || v.category === filterCat)
    ), [vendors, filterRisk, filterCat]
  );

  const totalSpend   = vendors.reduce((s, v) => s + v.totalSpend, 0);
  const highRisk     = vendors.filter(v => v.risk === 'High').length;
  const recommended  = vendors.filter(v => v.recommended).length;

  // ── Detail view ───────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-xs underline">← Back</button>
          <span className="font-black text-white truncate">{selected.vendorName}</span>
        </div>

        {/* Score card */}
        <div className={`rounded-xl border p-5 ${RISK_STYLE[selected.risk]}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-70 mb-1">SLA Score</div>
              <div className="text-4xl font-black">{selected.slaScore}%</div>
              <div className="text-sm mt-1 font-bold capitalize">{selected.risk} Risk</div>
            </div>
            <div className="text-right text-xs space-y-1">
              <div className="text-slate-300">{selected.totalOrders} orders</div>
              <div className="text-green-400">{selected.onTimeCount} on time</div>
              <div className="text-red-400">{selected.breachCount} breached</div>
              {selected.recommended && <div className="text-yellow-400 font-bold">★ Recommended</div>}
            </div>
          </div>
        </div>

        {/* Spend */}
        <div className="bg-slate-800 rounded-xl divide-y divide-slate-700">
          {[
            { label: 'Total Spend',  value: `PKR ${fmt(selected.totalSpend)}`   },
            { label: 'Avg Order',    value: `PKR ${fmt(selected.avgOrderVal)}`  },
            { label: 'Category',     value: selected.category                   },
            { label: 'Last Order',   value: selected.lastOrder || '—'           },
            { label: 'Price Trend',  value: selected.priceTrend === 'up' ? '↑ Rising' : selected.priceTrend === 'down' ? '↓ Falling' : '→ Stable' },
          ].map(row => (
            <div key={row.label} className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-slate-400">{row.label}</span>
              <span className="font-bold text-white">{row.value}</span>
            </div>
          ))}
        </div>

        {/* Rate history */}
        {selected.rateHistory.length >= 2 && (
          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs text-slate-500 uppercase tracking-widest">Rate per Sheet (6 months)</div>
            <div className="flex items-end justify-between gap-1">
              {selected.rateHistory.map((r, i) => {
                const max = Math.max(...selected.rateHistory.map(x => x.rate));
                const h   = Math.round((r.rate / max) * 48);
                return (
                  <div key={i} className="flex flex-col items-center gap-1 flex-1">
                    <div className="text-[8px] text-slate-500">{fmt(r.rate)}</div>
                    <div className="bg-blue-500 rounded-sm w-full transition-all" style={{ height: `${h}px` }} />
                    <div className="text-[8px] text-slate-500 truncate w-full text-center">{r.month}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Vendor Intel</h2>
          <p className="text-xs text-slate-500 mt-0.5">Spend · SLA · Price trends</p>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">PKR {fmt(totalSpend)}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Total Spend</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${highRisk > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-800'}`}>
          <div className={`text-xl font-black ${highRisk > 0 ? 'text-red-400' : 'text-white'}`}>{highRisk}</div>
          <div className="text-[10px] text-red-400/70 uppercase tracking-widest mt-0.5">High Risk</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-green-400">{recommended}</div>
          <div className="text-[10px] text-green-400 uppercase tracking-widest mt-0.5">Recommended</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['All', 'Low', 'Medium', 'High'] as const).map(r => (
          <button key={r} onClick={() => setFilterRisk(r)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all
              ${filterRisk === r ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            {r === 'All' ? 'All Risk' : `${r} Risk`}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map(c => (
          <button key={c} onClick={() => setFilterCat(c)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all
              ${filterCat === c ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Vendor list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">Koi vendors nahi</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(v => (
            <button key={v.vendorId} onClick={() => setSelected(v)}
              className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-left transition-all">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm truncate">{v.vendorName}</span>
                    {v.recommended && <Star size={11} className="text-yellow-400 shrink-0" fill="currentColor" />}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {v.category} · {v.totalOrders} orders · PKR {fmt(v.totalSpend)}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Price trend */}
                  {v.priceTrend === 'up'   && <TrendingUp   size={13} className="text-red-400"   />}
                  {v.priceTrend === 'down' && <TrendingDown  size={13} className="text-green-400" />}

                  {/* Sparkline */}
                  <Sparkline
                    data={v.rateHistory.map(r => r.rate)}
                    color={v.priceTrend === 'up' ? '#f87171' : v.priceTrend === 'down' ? '#4ade80' : '#94a3b8'}
                  />

                  {/* Risk badge */}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${RISK_STYLE[v.risk]}`}>
                    {v.risk}
                  </span>
                </div>
              </div>

              {/* SLA bar */}
              <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${v.slaScore >= 85 ? 'bg-green-500' : v.slaScore >= 65 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${v.slaScore}%` }} />
              </div>
              <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                <span>SLA {v.slaScore}%</span>
                <span>{v.lastOrder || 'No orders'}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default VendorIntelligence;
