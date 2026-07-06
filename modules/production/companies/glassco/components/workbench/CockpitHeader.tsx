/**
 * CockpitHeader — always-on decision strip for the Production Board.
 *
 * Renders the Cut → QC → Tempering → Received → Ready → Delivered funnel
 * (pieces + sqft per stage, click to filter), today's throughput, and the
 * per-vendor tempering load with SLA colour — all derived from data the board
 * already holds (pieces + dispatches). No writes, no GL. Phase 1 of the
 * Production Cockpit redesign.
 */
import React, { useMemo } from 'react';
import type { ProductionPiece, TemperingDispatch } from '@/modules/shared/types';

interface Stage {
  key: string;
  label: string;
  filterStatus: string;
  match: (s: string) => boolean;
}

const STAGES: Stage[] = [
  { key: 'Cut',       label: 'Cut',       filterStatus: 'Cut',               match: s => s === 'Cut' },
  { key: 'QC',        label: 'QC',        filterStatus: 'QC-Pending',        match: s => s === 'QC-Pending' || s === 'Service-Pending' || s === 'QC-Passed' || s === 'QC-Failed' },
  { key: 'Tempering', label: 'Tempering', filterStatus: 'Dispatched',        match: s => s === 'Dispatched' },
  { key: 'Received',  label: 'Received',  filterStatus: 'Tempered',          match: s => s === 'Received-From-Tempering' || s === 'Tempered' },
  { key: 'Ready',     label: 'Ready',     filterStatus: 'Ready to Dispatch', match: s => s === 'Ready to Dispatch' },
  { key: 'Delivered', label: 'Delivered', filterStatus: 'Delivered',         match: s => s === 'Delivered' },
];

const sqftOf = (p: ProductionPiece): number => {
  const x = p as unknown as { sqft?: number; totalSqFt?: number };
  return Number(x.sqft ?? x.totalSqFt ?? 0) || 0;
};

const isToday = (iso?: string): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

const ageDays = (iso?: string): number => {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
};

const slaClass = (d: number): string =>
  d > 7 ? 'text-rose-700 bg-rose-50' : d > 4 ? 'text-amber-700 bg-amber-50' : 'text-emerald-700 bg-emerald-50';

interface Props {
  pieces: ProductionPiece[];
  dispatches: TemperingDispatch[];
  onStageClick?: (filterStatus: string) => void;
}

const CockpitHeader: React.FC<Props> = ({ pieces, dispatches, onStageClick }) => {
  const funnel = useMemo(() =>
    STAGES.map(st => {
      const inStage = pieces.filter(p => st.match(String(p.status)));
      return {
        key: st.key,
        label: st.label,
        filterStatus: st.filterStatus,
        count: inStage.length,
        sqft: Math.round(inStage.reduce((n, p) => n + sqftOf(p), 0)),
      };
    }), [pieces]);

  const today = useMemo(() => {
    const t = pieces.filter(p => isToday(p.lastUpdated));
    return {
      cut: t.filter(p => p.status === 'Cut').length,
      passed: t.filter(p => p.status === 'QC-Passed').length,
      delivered: t.filter(p => p.status === 'Delivered').length,
    };
  }, [pieces]);

  const vendors = useMemo(() => {
    const out = dispatches.filter(d => d.status === 'Dispatched');
    const map = new Map<string, { pcs: number; oldest: number }>();
    for (const d of out) {
      const name = d.plantName || (d as { originLocation?: string }).originLocation || '—';
      const prev = map.get(name) || { pcs: 0, oldest: 0 };
      map.set(name, {
        pcs: prev.pcs + (Array.isArray(d.pieceIds) ? d.pieceIds.length : 0),
        oldest: Math.max(prev.oldest, ageDays(d.date)),
      });
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.oldest - a.oldest)
      .slice(0, 4);
  }, [dispatches]);

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-3 no-print">
      {/* Pipeline funnel — click a stage to filter the board */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-2.5">
        {funnel.map(st => (
          <button
            key={st.key}
            type="button"
            onClick={() => onStageClick?.(st.filterStatus)}
            title={`Filter to ${st.label}`}
            className="text-left bg-slate-50 hover:bg-blue-50 rounded-lg px-2.5 py-2 transition-colors"
          >
            <div className="text-[11px] font-bold text-slate-500">{st.label}</div>
            <div className="text-lg font-black text-slate-800 leading-tight tabular-nums">{st.count}</div>
            <div className="text-[10px] text-slate-400 tabular-nums">{st.sqft} sqft</div>
          </button>
        ))}
      </div>

      {/* Today throughput + per-vendor tempering load */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="text-slate-400 font-black uppercase text-[10px] tracking-wide">Today</span>
        <span className="text-slate-500"><b className="text-slate-800 tabular-nums">{today.cut}</b> cut</span>
        <span className="text-slate-500"><b className="text-slate-800 tabular-nums">{today.passed}</b> passed</span>
        <span className="text-slate-500"><b className="text-slate-800 tabular-nums">{today.delivered}</b> delivered</span>
        <span className="text-slate-200 hidden sm:inline">|</span>
        <span className="text-slate-400 font-black uppercase text-[10px] tracking-wide">Tempering</span>
        {vendors.length === 0 ? (
          <span className="text-slate-400">nothing out</span>
        ) : (
          vendors.map(v => (
            <span key={v.name} className={`px-2 py-0.5 rounded-full font-bold tabular-nums ${slaClass(v.oldest)}`}>
              {v.name} · {v.pcs} pc · {v.oldest}d
            </span>
          ))
        )}
      </div>
    </div>
  );
};

export default CockpitHeader;
