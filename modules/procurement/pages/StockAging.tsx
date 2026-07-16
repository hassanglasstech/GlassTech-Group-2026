import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Logger } from '@/modules/shared/services/logger';
import { Package, RefreshCw, AlertTriangle, TrendingDown, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import ReportExport from '@/modules/finance/components/ReportExport';

interface StockRow {
  materialCode: string;
  materialName: string;
  unit:         string;
  warehouse:    string;
  onHandQty:    number;
  lastMovement: string;
  daysSince:    number;
  status:       'active' | 'moderate' | 'slow_moving' | 'dead';
  estValue:     number;
}

type StatusFilter = 'all' | 'active' | 'moderate' | 'slow_moving' | 'dead';

const fmt = (n: number) => Math.round(n).toLocaleString('en-PK');

const STATUS_CONFIG: Record<StockRow['status'], { label: string; cls: string; icon: React.ReactNode }> = {
  active:      { label: 'Active',       cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={11}/> },
  moderate:    { label: 'Moderate',     cls: 'bg-blue-100 text-blue-700',       icon: <Package size={11}/> },
  slow_moving: { label: 'Slow Moving',  cls: 'bg-amber-100 text-amber-700',     icon: <AlertTriangle size={11}/> },
  dead:        { label: 'Dead Stock',   cls: 'bg-rose-100 text-rose-700',       icon: <TrendingDown size={11}/> },
};

const StockAging: React.FC = () => {
  const { user, profile } = useAuthStore();
  const company           = useAppStore(s => s.selectedCompany) ?? profile?.company ?? user?.company ?? 'Glassco';

  const [rows,    setRows]    = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState<StatusFilter>('all');
  const [search,  setSearch]  = useState('');

  const load = async () => {
    setLoading(true);
    try {
      // Repaired (P1-5): the old raw query hit stock_ledger columns that don't
      // exist (material_code/qty_in/qty_out/unit_cost) → it always errored and the
      // page showed "Failed to load". Drive aging from store_items via the tested
      // InventoryService mapping instead: on-hand + last-movement + MAP all exist.
      const store = (await InventoryService.getStoreAsync()).filter(s => s.company === company);
      const today = new Date();
      const parsed: StockRow[] = [];

      store.forEach(s => {
        const onHand = Number(s.quantity) || 0;
        if (onHand <= 0) return;   // aging is for stock you're still holding
        const lastRaw = (s as { lastMovementDate?: string }).lastMovementDate;
        const last    = lastRaw ? new Date(lastRaw) : new Date(0);
        const daysSince = Math.max(0, Math.floor((today.getTime() - last.getTime()) / 86400000));
        const status: StockRow['status'] =
          daysSince > 180 ? 'dead'        :
          daysSince > 90  ? 'slow_moving' :
          daysSince > 30  ? 'moderate'    : 'active';
        const map = Number(s.movingAveragePrice) || 0;
        parsed.push({
          materialCode: s.id,
          materialName: s.name || s.id,
          unit:         s.unit || 'pcs',
          warehouse:    (s as { storageBin?: string }).storageBin || 'Main',
          onHandQty:    Math.round(onHand * 100) / 100,
          lastMovement: lastRaw ? last.toISOString().slice(0, 10) : '—',
          daysSince,
          status,
          estValue:     Math.round(onHand * map),
        });
      });

      setRows(parsed.sort((a, b) => b.daysSince - a.daysSince));
    } catch (e) {
      Logger.error('StockAging', 'load failed', e);
      toast.error('Failed to load stock data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [company]);

  const filtered = useMemo(() =>
    rows.filter(r =>
      (filter === 'all' || r.status === filter) &&
      (!search || r.materialName.toLowerCase().includes(search.toLowerCase()) || r.materialCode.toLowerCase().includes(search.toLowerCase()))
    ),
    [rows, filter, search],
  );

  const summaryByStatus = useMemo(() =>
    (['active', 'moderate', 'slow_moving', 'dead'] as const).map(s => ({
      status: s,
      count:  rows.filter(r => r.status === s).length,
      value:  rows.filter(r => r.status === s).reduce((t, r) => t + r.estValue, 0),
    })),
    [rows],
  );

  const totalValue = rows.reduce((t, r) => t + r.estValue, 0);

  const exportRows = filtered.map(r => ({
    'Code':          r.materialCode,
    'Material':      r.materialName,
    'Unit':          r.unit,
    'Warehouse':     r.warehouse,
    'On Hand':       r.onHandQty,
    'Last Movement': r.lastMovement,
    'Days Since':    r.daysSince,
    'Status':        STATUS_CONFIG[r.status].label,
    'Est. Value (₨)':r.estValue,
  }));

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-amber-900 text-white p-6 rounded-[2rem] shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Package size={20}/> Stock Aging Report
            </h2>
            <p className="text-[10px] text-amber-300 font-bold uppercase tracking-widest mt-0.5">
              {company} · Slow-moving & dead stock analysis · ABC classification
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/20">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/> Refresh
          </button>
        </div>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {summaryByStatus.map(s => {
          const cfg = STATUS_CONFIG[s.status];
          return (
            <button key={s.status} onClick={() => setFilter(filter === s.status ? 'all' : s.status)}
              className={`border rounded-2xl p-4 text-left transition-all hover:shadow-md ${filter === s.status ? 'ring-2 ring-offset-1 ring-slate-400' : ''} ${cfg.cls.replace('text-', 'border-').split(' ')[0].replace('bg-', 'bg-').split(' ')[0]} bg-white border-slate-200`}>
              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black mb-2 ${cfg.cls}`}>
                {cfg.icon} {cfg.label}
              </div>
              <p className="text-lg font-black text-slate-900">{s.count} <span className="text-xs font-bold text-slate-400">items</span></p>
              <p className="text-[10px] text-slate-500 mt-0.5">₨ {fmt(s.value)}</p>
            </button>
          );
        })}
      </div>

      {/* Total value */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 flex justify-between items-center">
        <p className="font-black text-sm">Total Stock Value (on-hand items)</p>
        <p className="text-2xl font-black">₨ {fmt(totalValue)}</p>
      </div>

      {/* Search + filters + export */}
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search material…"
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs w-52 focus:outline-none focus:border-blue-400" />
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['all', 'active', 'moderate', 'slow_moving', 'dead'] as StatusFilter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${filter === f ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              {f === 'slow_moving' ? 'Slow' : f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <ReportExport title="Stock_Aging" rows={exportRows} />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-slate-300 text-xs font-bold">Loading stock data…</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-white">
              <tr>
                {['Code','Material','Unit','Warehouse','On Hand','Last Movement','Days','Est. Value','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-black text-[10px] uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r, i) => {
                const cfg = STATUS_CONFIG[r.status];
                return (
                  <tr key={`${r.materialCode}-${r.warehouse}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                    <td className="px-4 py-2.5 font-mono text-slate-500 text-[10px]">{r.materialCode}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-800">{r.materialName}</td>
                    <td className="px-4 py-2.5 text-slate-400">{r.unit}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.warehouse}</td>
                    <td className="px-4 py-2.5 font-black text-slate-900">{r.onHandQty.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.lastMovement}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${r.daysSince > 90 ? 'bg-rose-100 text-rose-700' : r.daysSince > 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {r.daysSince}d
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-700">
                      {r.estValue > 0 ? `₨ ${fmt(r.estValue)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black ${cfg.cls}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-slate-300 text-xs font-bold uppercase">
              No stock items match the current filter
            </div>
          )}
        </div>
      )}

      <style>{`@media print { .no-print { display: none !important; } }`}</style>
    </div>
  );
};

export default StockAging;
