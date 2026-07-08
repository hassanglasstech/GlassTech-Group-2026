/**
 * CuttingSupervisorScreen — the cutting supervisor's command surface.
 *
 * One screen to (a) MONITOR every cutter's bench (assigned to-cut, cut-today,
 * sqft-today, starved / heavy) and (b) DISTRIBUTE work: assign the unassigned
 * Pending-Cut pool and the recut pool to a cutter. Complements the per-cutter
 * CutterWorkbench (which is one cutter at a time) with an all-benches overview.
 *
 * Assignment rides the same same-status atomic RPC as D2/D3 (per-piece
 * assignedCutter in the data jsonb) via ProductionService.reassignRemainingPieces
 * — status-only, no GL. Read model mirrors CutterWorkbench / JobOrders.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { ProductionService } from '@/modules/production/services/productionService';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { HRService } from '@/modules/hr/services/hrService';
import { ProductionPiece } from '@/modules/shared/types';
import { JobOrder } from '@/modules/production/types/production';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { toast } from 'sonner';
import { Scissors, RefreshCw, Loader2, AlertTriangle, Users, Layers, Flame, CheckCircle2 } from 'lucide-react';

const ALLOWED = new Set<string>([
  'super_admin', 'owner', 'hassan',
  'factory_manager', 'glassco_supervisor', 'glassco_admin', 'glassco_production',
]);

const norm = (s?: string): string => (s || '').trim().toLowerCase();
const sameName = (a?: string, b?: string): boolean => { const x = norm(a); return x !== '' && x === norm(b); };
const isToday = (iso?: string): boolean => (iso || '').slice(0, 10) === new Date().toISOString().slice(0, 10);

const SupervisorContent: React.FC = () => {
  const company = (useAppStore(s => s.selectedCompany) as string) || 'Glassco';
  const profile = useAuthStore(s => s.profile);
  const user = useAuthStore(s => s.user);
  const actor = profile?.email || user?.email || 'supervisor';

  const [pieces, setPieces] = useState<ProductionPiece[]>([]);
  const [jobs, setJobs] = useState<JobOrder[]>([]);
  const [cutters, setCutters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [pcs, ords] = await Promise.all([
        ProductionService.getProductionPiecesAsync(),
        AsyncSalesService.getQuotations(),
      ]);
      setPieces(pcs || []);
      setJobs((ords as JobOrder[]) || []);
      try { await HRService.loadCache(); setCutters(HRService.getCutterNames(company)); } catch { /* keep existing */ }
    } catch {
      try { setPieces(ProductionService.getProductionPieces()); } catch { setPieces([]); }
    }
    setLoading(false);
  }, [company]);
  useEffect(() => { refresh(); }, [refresh, tick]);

  // Job-level cutter for an order (fallback when a piece has no per-piece cutter).
  const jobCutter = useCallback((orderId: string): string | undefined => {
    const j = jobs.find(o => o.orderNo === orderId || o.id === orderId);
    return j?.assignedCutter || undefined;
  }, [jobs]);

  // Effective cutter of a Pending-Cut piece: explicit per-piece wins; '' = pool; else inherit job.
  const effectiveCutter = useCallback((p: ProductionPiece): string => {
    if (p.assignedCutter) return p.assignedCutter;      // non-empty per-piece
    if (p.assignedCutter === '') return '';             // explicit pool
    return jobCutter(p.orderId) || '';                  // inherit job-level
  }, [jobCutter]);

  // Roster = HR cutters ∪ any cutter that already has work.
  const roster = useMemo(() => {
    const set = new Set<string>(cutters);
    pieces.forEach(p => { if (p.cutBy) set.add(p.cutBy); const e = effectiveCutter(p); if (e) set.add(e); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [cutters, pieces, effectiveCutter]);

  const benches = useMemo(() => roster.map(name => {
    const toCut = pieces.filter(p => p.status === 'Pending-Cut' && sameName(effectiveCutter(p), name));
    const cutTodayPcs = pieces.filter(p => sameName(p.cutBy, name) && isToday(p.cutAt));
    const sqftToday = cutTodayPcs.reduce((s, p) => s + (Number(p.sqft) || 0), 0);
    const state: 'starved' | 'heavy' | 'ok' = toCut.length === 0 ? 'starved' : toCut.length >= 12 ? 'heavy' : 'ok';
    return { name, toCut: toCut.length, cutToday: cutTodayPcs.length, sqftToday: Math.round(sqftToday), state };
  }), [roster, pieces, effectiveCutter]);

  const pool = useMemo(() => pieces.filter(p => p.status === 'Pending-Cut' && !effectiveCutter(p)), [pieces, effectiveCutter]);
  const recutPool = useMemo(() => pieces.filter(p => p.status === 'QC-Failed' && p.fault?.disposal === 'Recut' && !p.assignedCutter), [pieces]);

  const totals = useMemo(() => ({
    cutters: roster.length,
    toCut: pieces.filter(p => p.status === 'Pending-Cut').length,
    cutToday: pieces.filter(p => isToday(p.cutAt)).length,
    pool: pool.length,
    recut: recutPool.length,
  }), [roster, pieces, pool, recutPool]);

  const assign = async (piece: ProductionPiece, toCutter: string): Promise<void> => {
    if (!toCutter) return;
    setAssigning(piece.id);
    try {
      const { moved, failed } = await ProductionService.reassignRemainingPieces([piece], undefined, toCutter, actor);
      if (moved > 0) {
        setPieces(prev => prev.map(p => p.id === piece.id ? { ...p, assignedCutter: toCutter } : p));
        toast.success(`${piece.id} → ${toCutter}`);
      } else {
        toast.error(`Could not assign${failed ? ` (${failed} failed)` : ''}`);
      }
    } catch { toast.error('Assignment failed'); }
    setAssigning(null);
  };

  const benchTone = (s: string): string =>
    s === 'starved' ? 'border-l-slate-300 bg-slate-50' : s === 'heavy' ? 'border-l-amber-500 bg-amber-50' : 'border-l-emerald-500 bg-white';

  const AssignRow: React.FC<{ p: ProductionPiece; note?: string; recut?: boolean }> = ({ p, note, recut }) => (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${recut ? 'bg-rose-50 border border-rose-200' : 'bg-slate-50'}`}>
      <div className="min-w-0 flex-1">
        <p className="text-label font-black text-slate-800 font-mono truncate">{p.id}</p>
        <p className="text-2xs text-slate-500 truncate">{note || p.specs}</p>
      </div>
      <select defaultValue="" disabled={assigning === p.id}
        onChange={e => assign(p, e.target.value)}
        className="sap-input px-2 py-1 text-2xs rounded-control border border-slate-200 w-32 shrink-0 disabled:opacity-50">
        <option value="">Assign to…</option>
        {roster.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      {assigning === p.id && <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />}
    </div>
  );

  return (
    <div className="space-y-5 p-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-700 to-indigo-700 text-white rounded-card p-6 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={24} />
          <div>
            <h1 className="text-xl font-black uppercase">Cutting Supervisor</h1>
            <p className="text-2xs text-blue-100 font-bold uppercase tracking-widest mt-0.5">All benches · assign the pool &amp; recuts</p>
          </div>
        </div>
        <button onClick={() => setTick(x => x + 1)} className="bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-control text-xs font-black uppercase flex items-center gap-2">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          ['Cutters', totals.cutters, 'text-slate-800'],
          ['To cut', totals.toCut, 'text-blue-700'],
          ['Cut today', totals.cutToday, 'text-emerald-700'],
          ['Pool', totals.pool, totals.pool > 0 ? 'text-amber-700' : 'text-slate-800'],
          ['Recut', totals.recut, totals.recut > 0 ? 'text-rose-700' : 'text-slate-800'],
        ] as const).map(([label, val, tone]) => (
          <div key={label} className="bg-white rounded-card border-2 border-slate-200 shadow-sm p-3">
            <p className="text-2xs font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className={`text-2xl font-black tabular-nums ${tone}`}>{val}</p>
          </div>
        ))}
      </div>

      {loading && <div className="text-center text-slate-400 py-8"><Loader2 size={18} className="animate-spin inline mr-2" /> Loading…</div>}

      {/* Benches */}
      {!loading && (
        <div>
          <p className="text-2xs font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2"><Scissors size={13} /> Cutter benches</p>
          {benches.length === 0 ? (
            <EmptyState icon={<Users size={22} />} title="No cutters found" description="Tag employees as Cutter in HR to populate benches." />
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {benches.map(b => (
                <div key={b.name} className={`rounded-card border-2 border-slate-200 border-l-4 shadow-sm p-4 ${benchTone(b.state)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-slate-800 truncate">{b.name}</p>
                    {b.state === 'starved' && <span className="text-2xs font-black text-slate-500 shrink-0">idle — feed work</span>}
                    {b.state === 'heavy' && <span className="text-2xs font-black text-amber-700 shrink-0">heavy queue</span>}
                  </div>
                  <div className="flex items-end gap-4 mt-2">
                    <div><p className="text-2xl font-black text-slate-800 tabular-nums leading-none">{b.toCut}</p><p className="text-2xs font-bold text-slate-400 uppercase mt-1">to cut</p></div>
                    <div><p className="text-lg font-black text-emerald-600 tabular-nums leading-none">{b.cutToday}</p><p className="text-2xs font-bold text-slate-400 uppercase mt-1">cut today</p></div>
                    <div className="ml-auto text-right"><p className="text-sm font-black text-slate-600 tabular-nums leading-none">{b.sqftToday}</p><p className="text-2xs font-bold text-slate-400 uppercase mt-1">sqft</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unassigned pool */}
      {!loading && pool.length > 0 && (
        <div className="bg-white rounded-card border-2 border-amber-200 shadow-sm p-4">
          <p className="text-2xs font-black uppercase tracking-widest text-amber-700 mb-3 flex items-center gap-2"><Layers size={13} /> Unassigned pool — {pool.length} piece(s) to distribute</p>
          <div className="space-y-2 max-h-[46vh] overflow-y-auto">
            {pool.map(p => <AssignRow key={p.id} p={p} />)}
          </div>
        </div>
      )}

      {/* Recut pool */}
      {!loading && recutPool.length > 0 && (
        <div className="bg-white rounded-card border-2 border-rose-200 shadow-sm p-4">
          <p className="text-2xs font-black uppercase tracking-widest text-rose-700 mb-3 flex items-center gap-2"><Flame size={13} /> Recut pool — {recutPool.length} rejected piece(s) to redistribute</p>
          <div className="space-y-2 max-h-[46vh] overflow-y-auto">
            {recutPool.map(p => <AssignRow key={p.id} p={p} recut note={`${p.fault?.description || 'Recut'}${p.prevCutters?.length ? ` · was ${p.prevCutters[p.prevCutters.length - 1]}` : ''}`} />)}
          </div>
        </div>
      )}

      {!loading && pool.length === 0 && recutPool.length === 0 && (
        <div className="bg-white rounded-card border-2 border-dashed border-slate-200 py-8">
          <EmptyState icon={<CheckCircle2 size={22} />} title="Nothing to distribute" description="Pool and recut queues are clear." compact />
        </div>
      )}
    </div>
  );
};

const CuttingSupervisorScreen: React.FC = () => {
  const user = useAuthStore(s => s.user);
  if (!user) return <Navigate to="/" replace />;
  if (!ALLOWED.has(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="text-center">
          <AlertTriangle size={36} className="mx-auto text-amber-500 mb-3" />
          <p className="text-sm font-bold text-slate-700">The Cutting Supervisor screen is for supervisors / production admins.</p>
          <p className="text-xs text-slate-400 mt-2">Your role: <span className="font-mono">{user.role}</span></p>
        </div>
      </div>
    );
  }
  return <SupervisorContent />;
};

export default CuttingSupervisorScreen;
