import React, { useEffect, useState, useMemo } from 'react';
import {
  Scissors, RefreshCw, Loader2, AlertTriangle,
  Clock, ArrowUp, ArrowDown, CheckCircle2, Play
} from 'lucide-react';
import { ProductionService } from '@/modules/production/services/productionService';
import { ProductionPiece } from '@/modules/production/types/production';

// ── Types ─────────────────────────────────────────────────────────────
type CutPriority = 'Emergency' | 'Urgent' | 'Normal';

interface CutJob {
  orderId:    string;
  pieces:     ProductionPiece[];
  pieceCount: number;
  sqft:       number;
  priority:   CutPriority;
  dueDate?:   string;
  daysLeft?:  number;
  estMinutes: number;  // estimated cut time
  locked:     boolean; // manually pinned position
}

// Estimate cutting time: ~2 min per sqft baseline
const estimateCutTime = (sqft: number): number => Math.max(5, Math.round(sqft * 2));

const parseSqft = (specs: string): number => {
  const m = specs.match(/(\d+)\s*[xX×]\s*(\d+)/);
  if (m) {
    const w = parseInt(m[1]), h = parseInt(m[2]);
    if (w < 300 && h < 300) return (w * h) / 144;
    return (w * h) / 92900;
  }
  return 2;
};

const PRIORITY_ORDER: Record<CutPriority, number> = { Emergency: 0, Urgent: 1, Normal: 2 };

const PRIORITY_STYLE: Record<CutPriority, string> = {
  Emergency: 'bg-red-500/20 text-red-400 border-red-500/30',
  Urgent:    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Normal:    'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

// ── Component ─────────────────────────────────────────────────────────
const CuttingSequencePlanner: React.FC = () => {
  const [rawPieces, setRawPieces]     = useState<ProductionPiece[]>([]);
  const [jobs, setJobs]               = useState<CutJob[]>([]);
  const [loading, setLoading]         = useState(true);
  const [optimized, setOptimized]     = useState(false);
  const [selectedJob, setSelectedJob] = useState<CutJob | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await ProductionService.getProductionPiecesAsync('Glassco');
      // Only pieces not yet cut
      const pending = data.filter(p =>
        !['Cut', 'Service-Pending', 'QC-Pending', 'QC-Passed', 'QC-Failed',
          'Ready to Dispatch', 'Dispatched', 'Delivered', 'Broken'].includes(p.status)
        || p.status === 'Hold'
      );
      setRawPieces(pending);
      buildJobs(pending);
    } catch {
      const data = ProductionService.getProductionPieces();
      setRawPieces(data);
      buildJobs(data);
    }
    setLoading(false);
  };

  const buildJobs = (pieces: ProductionPiece[]) => {
    const groups: Record<string, ProductionPiece[]> = {};
    pieces.forEach(p => {
      if (!groups[p.orderId]) groups[p.orderId] = [];
      groups[p.orderId].push(p);
    });

    const now = Date.now();
    const built: CutJob[] = Object.entries(groups).map(([orderId, ps]) => {
      const sqft       = ps.reduce((s, p) => s + parseSqft(p.specs || ''), 0);
      const dueDate    = ps[0] && (ps[0] as any).dueDate;
      const daysLeft   = dueDate
        ? Math.round((new Date(dueDate).getTime() - now) / 86400000)
        : undefined;

      let priority: CutPriority = 'Normal';
      if (daysLeft !== undefined && daysLeft <= 1) priority = 'Emergency';
      else if (daysLeft !== undefined && daysLeft <= 3) priority = 'Urgent';
      else if (ps.some(p => (p as any).priority === 'Urgent')) priority = 'Urgent';

      return {
        orderId,
        pieces:     ps,
        pieceCount: ps.length,
        sqft:       parseFloat(sqft.toFixed(2)),
        priority,
        dueDate,
        daysLeft,
        estMinutes: estimateCutTime(sqft),
        locked:     false,
      };
    });

    // Default sort: priority → due date → sqft
    const sorted = [...built].sort((a, b) => {
      const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pd !== 0) return pd;
      if (a.daysLeft !== undefined && b.daysLeft !== undefined)
        return a.daysLeft - b.daysLeft;
      return a.sqft - b.sqft;
    });

    setJobs(sorted);
    setOptimized(false);
  };

  // Re-optimize: minimize delay — locked jobs stay, rest sorted by priority+due
  const optimize = () => {
    const locked   = jobs.filter(j => j.locked);
    const unlocked = jobs.filter(j => !j.locked).sort((a, b) => {
      const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pd !== 0) return pd;
      if (a.daysLeft !== undefined && b.daysLeft !== undefined)
        return a.daysLeft - b.daysLeft;
      return a.sqft - b.sqft;  // smaller jobs first = faster throughput
    });

    // Interleave locked into their original positions
    const result: CutJob[] = [];
    const lockedByPos: Record<number, CutJob> = {};
    locked.forEach(j => {
      const idx = jobs.findIndex(x => x.orderId === j.orderId);
      lockedByPos[idx] = j;
    });

    let ui = 0;
    for (let i = 0; i < jobs.length; i++) {
      if (lockedByPos[i]) result.push(lockedByPos[i]);
      else if (ui < unlocked.length) result.push(unlocked[ui++]);
    }
    while (ui < unlocked.length) result.push(unlocked[ui++]);

    setJobs(result);
    setOptimized(true);
  };

  const moveJob = (idx: number, dir: 'up' | 'down') => {
    const next = [...jobs];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setJobs(next);
  };

  const toggleLock = (orderId: string) => {
    setJobs(prev => prev.map(j =>
      j.orderId === orderId ? { ...j, locked: !j.locked } : j
    ));
  };

  const setPriority = (orderId: string, priority: CutPriority) => {
    setJobs(prev => prev.map(j =>
      j.orderId === orderId ? { ...j, priority } : j
    ));
  };

  // Running totals
  const runningTime = jobs.reduce((s, j) => s + j.estMinutes, 0);
  const emergency   = jobs.filter(j => j.priority === 'Emergency').length;
  const urgent      = jobs.filter(j => j.priority === 'Urgent').length;

  // Detail view
  if (selectedJob) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedJob(null)}
            className="text-slate-400 hover:text-white text-xs underline">← Back</button>
          <span className="font-black text-white">{selectedJob.orderId}</span>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-400">Pieces</span><div className="font-bold text-white mt-0.5">{selectedJob.pieceCount}</div></div>
            <div><span className="text-slate-400">Total sqft</span><div className="font-bold text-white mt-0.5">{selectedJob.sqft.toFixed(1)}</div></div>
            <div><span className="text-slate-400">Est. Cut Time</span><div className="font-bold text-white mt-0.5">{selectedJob.estMinutes} min</div></div>
            <div><span className="text-slate-400">Priority</span>
              <div className="mt-0.5">
                <select value={selectedJob.priority}
                  onChange={e => { setPriority(selectedJob.orderId, e.target.value as CutPriority); setSelectedJob(p => p ? { ...p, priority: e.target.value as CutPriority } : null); }}
                  className="bg-slate-700 text-white text-xs rounded-lg px-2 py-1 outline-none">
                  {(['Emergency', 'Urgent', 'Normal'] as CutPriority[]).map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {selectedJob.dueDate && (
              <div className="col-span-2">
                <span className="text-slate-400">Due Date</span>
                <div className={`font-bold mt-0.5 ${selectedJob.daysLeft !== undefined && selectedJob.daysLeft <= 1 ? 'text-red-400' : 'text-white'}`}>
                  {selectedJob.dueDate} ({selectedJob.daysLeft !== undefined ? `${selectedJob.daysLeft}d left` : ''})
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Pieces</div>
          <div className="space-y-1">
            {selectedJob.pieces.map(p => (
              <div key={p.id} className="bg-slate-800 rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="text-xs text-slate-300 flex-1 truncate">{p.specs}</span>
                <span className="text-[10px] text-slate-500">{parseSqft(p.specs || '').toFixed(1)} ft²</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Cut Sequence</h2>
          <p className="text-xs text-slate-500 mt-0.5">Priority · Due date · Optimize</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
          <button onClick={optimize}
            className="flex items-center gap-1 bg-white text-slate-900 font-bold text-xs px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-all">
            <Play size={12} /> Optimize
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-lg font-black text-white">{jobs.length}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Orders</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${emergency > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-800'}`}>
          <div className={`text-lg font-black ${emergency > 0 ? 'text-red-400' : 'text-white'}`}>{emergency}</div>
          <div className="text-[10px] text-red-400/70 uppercase tracking-widest mt-0.5">Emerg.</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-lg font-black text-yellow-400">{urgent}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Urgent</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-lg font-black text-white">{Math.round(runningTime / 60)}h</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Est. Total</div>
        </div>
      </div>

      {optimized && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">
          <CheckCircle2 size={13} className="text-green-400" />
          <span className="text-green-400 text-xs">Sequence optimized — urgent jobs prioritized</span>
        </div>
      )}

      {/* Sequence list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">Koi pending cutting jobs nahi</div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job, idx) => (
            <div key={job.orderId}
              className={`bg-slate-800 rounded-xl p-3 flex items-center gap-3 transition-all
                ${job.locked ? 'border border-blue-500/30' : ''}`}>

              {/* Position number */}
              <div className="shrink-0 w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-black text-slate-300">
                {idx + 1}
              </div>

              {/* Job info */}
              <button onClick={() => setSelectedJob(job)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm truncate">{job.orderId}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${PRIORITY_STYLE[job.priority]}`}>
                    {job.priority}
                  </span>
                  {job.locked && <span className="text-[10px] text-blue-400 shrink-0">🔒</span>}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                  <span>{job.pieceCount} pcs · {job.sqft.toFixed(1)} ft²</span>
                  <span className="flex items-center gap-0.5">
                    <Clock size={9} /> {job.estMinutes}m
                  </span>
                  {job.daysLeft !== undefined && (
                    <span className={job.daysLeft <= 1 ? 'text-red-400 font-bold' : job.daysLeft <= 3 ? 'text-yellow-400' : ''}>
                      {job.daysLeft <= 0 ? 'OVERDUE' : `${job.daysLeft}d`}
                    </span>
                  )}
                </div>
              </button>

              {/* Controls */}
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => moveJob(idx, 'up')} disabled={idx === 0}
                  className="text-slate-500 hover:text-white disabled:opacity-20 transition-colors">
                  <ArrowUp size={13} />
                </button>
                <button onClick={() => moveJob(idx, 'down')} disabled={idx === jobs.length - 1}
                  className="text-slate-500 hover:text-white disabled:opacity-20 transition-colors">
                  <ArrowDown size={13} />
                </button>
              </div>
              <button onClick={() => toggleLock(job.orderId)}
                className={`shrink-0 text-xs px-2 py-1 rounded-lg transition-all
                  ${job.locked ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-slate-500 hover:text-white'}`}>
                {job.locked ? '🔒' : '📌'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CuttingSequencePlanner;
