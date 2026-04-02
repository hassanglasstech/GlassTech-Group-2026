import React, { useEffect, useState, useMemo } from 'react';
import {
  Truck, RefreshCw, Loader2, CheckCircle2,
  AlertTriangle, Clock, TrendingUp, TrendingDown, Calendar
} from 'lucide-react';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';

// ── Helpers ───────────────────────────────────────────────────────────
const daysDiff = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthLabel = (d: string) => {
  const dt = new Date(d);
  return `${MONTHS[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}`;
};

interface DeliveryRecord {
  orderId:      string;
  projectName:  string;
  clientId:     string;
  dueDate:      string;
  deliveredDate?: string;
  status:       'On Time' | 'Late' | 'Pending' | 'No Date';
  daysVariance: number;   // negative = early, positive = late
  delayCategory?: string;
  delayReason?:   string;
  pieces:       number;
  dispatched:   number;
}

interface MonthStat {
  month:       string;
  total:       number;
  onTime:      number;
  late:        number;
  otRate:      number;
  avgDelay:    number;
}

// ── Gauge ─────────────────────────────────────────────────────────────
const OTRGauge: React.FC<{ value: number }> = ({ value }) => {
  const color = value >= 85 ? '#22c55e' : value >= 65 ? '#f59e0b' : '#ef4444';
  const angle = (value / 100) * 180;
  const rad   = (angle - 90) * (Math.PI / 180);
  const x     = 50 + 35 * Math.cos(rad);
  const y     = 50 + 35 * Math.sin(rad);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 60" width="120" height="72">
        {/* Track */}
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#334155" strokeWidth="8" strokeLinecap="round" />
        {/* Fill */}
        <path
          d={`M 10 50 A 40 40 0 ${angle > 180 ? 1 : 0} 1 ${x.toFixed(1)} ${y.toFixed(1)}`}
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        />
        <text x="50" y="48" textAnchor="middle" fontSize="14" fontWeight="900" fill="white">{value}%</text>
        <text x="50" y="57" textAnchor="middle" fontSize="6" fill="#64748b">ON TIME</text>
      </svg>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────
const DeliveryKPIDashboard: React.FC = () => {
  const [records, setRecords]   = useState<DeliveryRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<'all' | 'late' | 'pending'>('all');
  const [selected, setSelected] = useState<DeliveryRecord | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const quotations = SalesService.getQuotations().filter(
        (q: any) => q.company === 'Glassco' && q.status !== 'Draft'
      );
      const pieces = ProductionService.getProductionPieces();
      const dispatches = ProductionService.getTemperingDispatches()
        .filter((d: any) => d.company === 'Glassco');

      const built: DeliveryRecord[] = quotations.map((q: any) => {
        const orderPieces    = pieces.filter(p => p.orderId === q.id);
        const dispatchedPcs  = dispatches.filter((d: any) => d.pieceIds?.some((pid: string) => orderPieces.map(p => p.id).includes(pid)));
        const dispatchedCount = dispatchedPcs.reduce((s: number, d: any) => s + (d.pieceIds?.length || 0), 0);

        const dueDate       = q.dueDate || q.reqDate || '';
        const deliveredDate = q.actualDeliveryDate || '';

        let status: DeliveryRecord['status'] = 'No Date';
        let daysVariance = 0;

        if (dueDate) {
          const today = new Date().toISOString().split('T')[0];
          if (deliveredDate) {
            daysVariance = daysDiff(dueDate, deliveredDate);
            status = daysVariance <= 0 ? 'On Time' : 'Late';
          } else {
            daysVariance = daysDiff(dueDate, today);
            status = daysVariance > 0 ? 'Late' : 'Pending';
          }
        }

        return {
          orderId:      q.id,
          projectName:  q.projectName || q.subject || q.site || q.id,
          clientId:     q.clientId,
          dueDate,
          deliveredDate,
          status,
          daysVariance,
          delayCategory: q.delayCategory,
          delayReason:   q.delayReason,
          pieces:        orderPieces.length,
          dispatched:    dispatchedCount,
        };
      }).filter(r => r.dueDate);  // only orders with due dates

      setRecords(built);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // KPIs
  const withDates   = records;
  const onTime      = withDates.filter(r => r.status === 'On Time').length;
  const late        = withDates.filter(r => r.status === 'Late').length;
  const pending     = withDates.filter(r => r.status === 'Pending').length;
  const otr         = withDates.length > 0 ? Math.round((onTime / withDates.filter(r => r.status !== 'Pending' && r.status !== 'No Date').length || 1) * 100) : 0;
  const avgDelay    = late > 0 ? Math.round(withDates.filter(r => r.status === 'Late').reduce((s, r) => s + r.daysVariance, 0) / late) : 0;

  // Monthly stats
  const monthStats: MonthStat[] = useMemo(() => {
    const byMonth: Record<string, DeliveryRecord[]> = {};
    records.filter(r => r.dueDate).forEach(r => {
      const mk = r.dueDate.slice(0, 7);
      if (!byMonth[mk]) byMonth[mk] = [];
      byMonth[mk].push(r);
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, recs]) => {
        const delivered = recs.filter(r => r.status === 'On Time' || r.status === 'Late');
        const ot = recs.filter(r => r.status === 'On Time').length;
        const late = recs.filter(r => r.status === 'Late');
        return {
          month:    monthLabel(month + '-01'),
          total:    recs.length,
          onTime:   ot,
          late:     late.length,
          otRate:   delivered.length > 0 ? Math.round((ot / delivered.length) * 100) : 100,
          avgDelay: late.length > 0 ? Math.round(late.reduce((s, r) => s + r.daysVariance, 0) / late.length) : 0,
        };
      });
  }, [records]);

  // Delay by category
  const delayCats = useMemo(() => {
    const cats: Record<string, number> = {};
    records.filter(r => r.status === 'Late' && r.delayCategory).forEach(r => {
      cats[r.delayCategory!] = (cats[r.delayCategory!] || 0) + 1;
    });
    return Object.entries(cats).sort(([, a], [, b]) => b - a);
  }, [records]);

  const filtered = useMemo(() => {
    if (filter === 'late')    return records.filter(r => r.status === 'Late');
    if (filter === 'pending') return records.filter(r => r.status === 'Pending');
    return records;
  }, [records, filter]);

  // Detail
  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-xs underline">← Back</button>
          <span className="font-black text-white truncate">{selected.projectName}</span>
        </div>
        <div className={`rounded-xl border p-5 space-y-2 ${
          selected.status === 'On Time' ? 'bg-green-500/10 border-green-500/20' :
          selected.status === 'Late'    ? 'bg-red-500/10 border-red-500/20' :
          'bg-yellow-500/10 border-yellow-500/20'}`}>
          <div className={`text-2xl font-black ${
            selected.status === 'On Time' ? 'text-green-400' :
            selected.status === 'Late'    ? 'text-red-400'   : 'text-yellow-400'}`}>
            {selected.status}
            {selected.daysVariance > 0 && ` (+${selected.daysVariance}d)`}
            {selected.daysVariance < 0 && ` (${selected.daysVariance}d early)`}
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl divide-y divide-slate-700 text-sm">
          {[
            { label: 'Due Date',       value: selected.dueDate || '—'        },
            { label: 'Delivered',      value: selected.deliveredDate || '—'  },
            { label: 'Pieces',         value: `${selected.dispatched}/${selected.pieces} dispatched` },
            { label: 'Delay Category', value: selected.delayCategory || '—'  },
            { label: 'Delay Reason',   value: selected.delayReason   || '—'  },
          ].map(row => (
            <div key={row.label} className="flex justify-between px-4 py-2.5">
              <span className="text-slate-400">{row.label}</span>
              <span className="font-bold text-white text-right max-w-[60%]">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Delivery KPI</h2>
          <p className="text-xs text-slate-500 mt-0.5">On-time rate · Delays · Trends</p>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* OTR Gauge + KPIs */}
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <OTRGauge value={isNaN(otr) ? 0 : otr} />
          <div className="grid grid-cols-2 gap-2 flex-1 ml-4">
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-green-400">{onTime}</div>
              <div className="text-[10px] text-green-400 uppercase tracking-widest mt-0.5">On Time</div>
            </div>
            <div className={`rounded-xl border p-3 text-center ${late > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-700'}`}>
              <div className={`text-xl font-black ${late > 0 ? 'text-red-400' : 'text-white'}`}>{late}</div>
              <div className="text-[10px] text-red-400/70 uppercase tracking-widest mt-0.5">Late</div>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-yellow-400">{pending}</div>
              <div className="text-[10px] text-yellow-400 uppercase tracking-widest mt-0.5">Pending</div>
            </div>
            <div className="bg-slate-700 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-white">{avgDelay}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Avg Days Late</div>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly trend */}
      {monthStats.length >= 2 && (
        <div className="bg-slate-800 rounded-xl p-4 space-y-2">
          <div className="text-xs text-slate-500 uppercase tracking-widest">Monthly OTR %</div>
          <div className="flex items-end justify-between gap-1">
            {monthStats.map((m, i) => {
              const h = Math.round((m.otRate / 100) * 48);
              return (
                <div key={i} className="flex flex-col items-center gap-1 flex-1">
                  <div className="text-[8px] text-slate-500">{m.otRate}%</div>
                  <div className={`rounded-sm w-full ${m.otRate >= 85 ? 'bg-green-500' : m.otRate >= 65 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ height: `${h}px` }} />
                  <div className="text-[8px] text-slate-500 truncate w-full text-center">{m.month}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delay categories */}
      {delayCats.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4 space-y-2">
          <div className="text-xs text-slate-500 uppercase tracking-widest">Delay by Category</div>
          {delayCats.map(([cat, count]) => (
            <div key={cat} className="flex items-center gap-3">
              <span className="text-xs text-slate-300 w-24 shrink-0">{cat}</span>
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="bg-red-500 h-full rounded-full"
                  style={{ width: `${(count / late) * 100}%` }} />
              </div>
              <span className="text-xs text-slate-400 shrink-0">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 bg-slate-800 p-1 rounded-xl">
        {([['all', 'All'], ['late', 'Late'], ['pending', 'Pending']] as const).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
              ${filter === f ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Order list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">Koi orders nahi</div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 30).map(r => (
            <button key={r.orderId} onClick={() => setSelected(r)}
              className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl px-4 py-3 text-left transition-all flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                r.status === 'On Time' ? 'bg-green-400' :
                r.status === 'Late'    ? 'bg-red-400'   : 'bg-yellow-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-sm truncate">{r.projectName}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Due: {r.dueDate}
                  {r.deliveredDate && ` · Delivered: ${r.deliveredDate}`}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-xs font-bold ${
                  r.status === 'On Time' ? 'text-green-400' :
                  r.status === 'Late'    ? 'text-red-400'   : 'text-yellow-400'}`}>
                  {r.status}
                </div>
                {r.daysVariance !== 0 && (
                  <div className="text-[10px] text-slate-500">
                    {r.daysVariance > 0 ? `+${r.daysVariance}d` : `${r.daysVariance}d`}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DeliveryKPIDashboard;
