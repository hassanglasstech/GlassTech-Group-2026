/**
 * SupervisorJobBoard — job-order-centric view for the cutting supervisor.
 *
 * Complements the piece-pool view in CuttingSupervisorScreen. Groups
 * Pending-Cut pieces by their job order and lets the supervisor assign
 * work at three granularities against the SAME atomic assign path:
 *   - whole JO   (all pending pieces of the order → one cutter)
 *   - whole mm   (all pending pieces of a thickness → one cutter)
 *   - one piece  (single piece → one cutter)
 *
 * Detail tabs: Assign · Image (job attachments) · Cut Plan (Phase D — wired
 * to the existing binPacking + CuttingDiagram engine next).
 *
 * No business logic here — assignment is delegated up via onAssign(), which
 * the parent runs through ProductionService.reassignRemainingPieces.
 */
import React, { useMemo, useState } from 'react';
import { ProductionPiece, QuotationItem } from '@/modules/shared/types';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { CutPlanTab } from '@/modules/production/companies/glassco/components/workbench/CutPlanTab';
import { Layers, Image as ImageIcon, Grid3x3, Clock, Scissors, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';

// Decoupled shape of a job order (really a Glassco quotation).
export interface JobLike {
  id: string;
  orderNo?: string;
  dueDate?: string;
  clientId?: string;
  projectName?: string;
  assignedCutter?: string;
  /** SO status (for Void derivation) + production job status (P1b). Only
   *  effectively-Active jobs surface in the supervisor assign pool. */
  status?: string;
  jobStatus?: 'Active' | 'Pending' | 'Hold' | 'Void';
  items?: Array<{
    width?: number; height?: number;
    inchW?: number | string; sootW?: number | string; inchH?: number | string; sootH?: number | string;
    glassSize?: string; designFile?: string; attachedImage?: string;
    selectedServices?: string[]; description?: string; isSection?: boolean;
  }>;
}

interface Props {
  pieces: ProductionPiece[];
  jobs: JobLike[];
  clientName: (id?: string) => string;
  roster: string[];
  onAssign: (pieces: ProductionPiece[], cutter: string) => Promise<void>;
}

const num = (v: unknown): number => { const n = Number(v); return isNaN(n) ? 0 : n; };
const thkOf = (p: ProductionPiece): string => {
  const m = String(p.specs || '').match(/(\d+(?:\.\d+)?)\s*mm/i);
  return m ? `${m[1]}mm` : (String(p.specs || '').trim() || '—');
};
const last4 = (s?: string): string => (s || '').replace(/\s+/g, '').slice(-4) || '—';
// P2 — only effectively-Active jobs belong in the assign pool. Void is derived
// from the SO status; Hold/Pending are set on the Job Orders board. Unknown job
// (piece with no matching order) still surfaces so it can be assigned.
const isActiveJob = (job?: JobLike): boolean => {
  if (!job) return true;
  if (/void|cancel/i.test(String(job.status || ''))) return false;
  return (job.jobStatus || 'Active') === 'Active';
};
const isToday = (iso?: string): boolean => (iso || '').slice(0, 10) === new Date().toISOString().slice(0, 10);
const daysLeft = (due?: string): number | null => {
  if (!due) return null;
  const d = new Date(due).getTime(); if (isNaN(d)) return null;
  return Math.round((d - Date.now()) / 86400000);
};

export const SupervisorJobBoard: React.FC<Props> = ({ pieces, jobs, clientName, roster, onAssign }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'assign' | 'image' | 'plan'>('assign');
  const [busy, setBusy] = useState<string | null>(null);

  const jobByRef = useMemo(() => {
    const m = new Map<string, JobLike>();
    jobs.forEach(j => { if (j.orderNo) m.set(j.orderNo, j); m.set(j.id, j); });
    return m;
  }, [jobs]);

  // Group pieces by orderId; only orders that still have Pending-Cut work.
  const cards = useMemo(() => {
    const byOrder = new Map<string, ProductionPiece[]>();
    pieces.forEach(p => { const a = byOrder.get(p.orderId) || []; a.push(p); byOrder.set(p.orderId, a); });
    const out = [...byOrder.entries()].map(([orderId, ps]) => {
      const pending = ps.filter(p => p.status === 'Pending-Cut');
      const job = jobByRef.get(orderId);
      const mm = new Map<string, ProductionPiece[]>();
      pending.forEach(p => { const t = thkOf(p); const a = mm.get(t) || []; a.push(p); mm.set(t, a); });
      const totalSqft = ps.reduce((s, p) => s + num(p.sqft ?? p.totalSqFt), 0);
      const cutDone = ps.filter(p => p.status !== 'Pending-Cut').length;
      return {
        orderId, job, pieces: ps, pending, cutDone,
        mmGroups: [...mm.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])),
        totalSqft, due: job?.dueDate, dleft: daysLeft(job?.dueDate),
      };
    }).filter(c => c.pending.length > 0 && isActiveJob(c.job));
    // sort: most overdue / soonest due first, then by pending desc
    out.sort((a, b) => {
      const da = a.dleft ?? 9999, db = b.dleft ?? 9999;
      return da - db || b.pending.length - a.pending.length;
    });
    return out;
  }, [pieces, jobByRef]);

  const open = cards.find(c => c.orderId === openId) || null;

  const sizeOf = (p: ProductionPiece): string => {
    const job = jobByRef.get(p.orderId);
    const it = job?.items?.[p.itemIndex];
    if (it && (num(it.width) || num(it.height))) return `${num(it.width)}" × ${num(it.height)}"`;
    if (it && (num(it.inchW) || num(it.inchH))) return `${num(it.inchW)}"${num(it.sootW) ? `·${num(it.sootW)}⁄8` : ''} × ${num(it.inchH)}"${num(it.sootH) ? `·${num(it.sootH)}⁄8` : ''}`;
    return p.specs || '—';
  };

  const doAssign = async (target: ProductionPiece[], cutter: string, key: string) => {
    if (!cutter || target.length === 0) return;
    setBusy(key);
    try { await onAssign(target, cutter); } finally { setBusy(null); }
  };

  const CutterSelect: React.FC<{ onPick: (c: string) => void; label?: string; busyKey?: string }> = ({ onPick, label, busyKey }) => (
    <span className="inline-flex items-center gap-1.5">
      <select defaultValue="" disabled={busy === busyKey}
        onChange={e => { const v = e.target.value; if (v) onPick(v); e.currentTarget.value = ''; }}
        className="sap-input px-2 py-1 text-2xs rounded-control border border-slate-200 w-36 disabled:opacity-50">
        <option value="">{label || 'Assign to…'}</option>
        {roster.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      {busy === busyKey && <Loader2 size={13} className="animate-spin text-slate-400" />}
    </span>
  );

  // ── Detail view ──────────────────────────────────────────────────
  if (open) {
    const job = open.job;
    const imgs = (job?.items || [])
      .filter(it => !it.isSection && (it.designFile || it.attachedImage))
      .map((it, i) => ({ src: (it.designFile || it.attachedImage) as string, label: it.description || `Item ${i + 1}` }));
    return (
      <div className="space-y-4">
        <button onClick={() => setOpenId(null)} className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-slate-500 hover:text-slate-800">
          <ArrowLeft size={14} /> All jobs
        </button>

        {/* JO header */}
        <div className="bg-white rounded-card border-2 border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-2xs font-black uppercase tracking-widest text-slate-400">Job Order</p>
              <p className="text-2xl font-black text-slate-800 font-mono leading-none">#{last4(job?.orderNo || open.orderId)}</p>
              <p className="text-2xs text-slate-500 font-bold mt-1">{clientName(job?.clientId)} · {job?.projectName || ''}</p>
            </div>
            <div className="text-right">
              <p className="text-2xs font-bold text-slate-400 uppercase">Due</p>
              <p className={`text-sm font-black ${open.dleft != null && open.dleft < 0 ? 'text-rose-600' : open.dleft != null && open.dleft <= 1 ? 'text-amber-600' : 'text-slate-700'}`}>
                {open.due || '—'} {open.dleft != null && <span className="text-2xs">({open.dleft < 0 ? `${-open.dleft}d late` : `${open.dleft}d`})</span>}
              </p>
              <p className="text-2xs text-slate-500 mt-1">{Math.round(open.totalSqft)} sqft · {open.pending.length} to cut · {open.cutDone} done</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {([['assign', 'Assign', Grid3x3], ['image', 'Image', ImageIcon], ['plan', 'Cut Plan', Scissors]] as const).map(([k, lbl, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-control text-2xs font-black uppercase tracking-widest flex items-center gap-1.5 border-2 transition-all ${tab === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}>
              <Icon size={13} /> {lbl}
            </button>
          ))}
        </div>

        {/* Assign tab */}
        {tab === 'assign' && (
          <div className="space-y-3">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-card p-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-2xs font-black uppercase tracking-widest text-blue-800 flex items-center gap-2"><Layers size={13} /> Assign entire JO — {open.pending.length} pending piece(s)</p>
              <CutterSelect label="Whole JO to…" busyKey={`jo-${open.orderId}`} onPick={c => doAssign(open.pending, c, `jo-${open.orderId}`)} />
            </div>
            {open.mmGroups.map(([thk, ps]) => (
              <div key={thk} className="bg-white rounded-card border-2 border-slate-200 shadow-sm">
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50 rounded-t-card flex-wrap">
                  <p className="text-xs font-black text-slate-800">{thk} <span className="text-slate-400 font-bold">· {ps.length} pcs</span></p>
                  <CutterSelect label={`All ${thk} to…`} busyKey={`mm-${open.orderId}-${thk}`} onPick={c => doAssign(ps, c, `mm-${open.orderId}-${thk}`)} />
                </div>
                <div className="divide-y divide-slate-50">
                  {ps.map(p => (
                    <div key={p.id} className="flex items-center gap-2 px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-label font-black text-slate-800 font-mono truncate">{p.id}</p>
                        <p className="text-2xs text-slate-500 truncate">{sizeOf(p)}{p.assignedCutter ? ` · → ${p.assignedCutter}` : ''}</p>
                      </div>
                      <CutterSelect busyKey={`pc-${p.id}`} onPick={c => doAssign([p], c, `pc-${p.id}`)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Image tab */}
        {tab === 'image' && (
          imgs.length === 0
            ? <EmptyState icon={<ImageIcon size={22} />} title="No images on this job" description="Design images attached to the quotation appear here." compact />
            : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {imgs.map((im, i) => (
                  <figure key={i} className="bg-white rounded-card border-2 border-slate-200 shadow-sm overflow-hidden">
                    <img src={im.src} alt={im.label} className="w-full max-h-[60vh] object-contain bg-slate-50" />
                    <figcaption className="text-2xs font-bold text-slate-500 px-3 py-2 truncate">{im.label}</figcaption>
                  </figure>
                ))}
              </div>
        )}

        {/* Cut Plan tab — thickness + sheet picker + optimised diagram + sheets required */}
        {tab === 'plan' && (
          <div className="bg-white rounded-card border-2 border-slate-200 shadow-sm p-4">
            <CutPlanTab items={(job?.items || []) as unknown as QuotationItem[]} />
          </div>
        )}
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────
  if (cards.length === 0) {
    return <div className="bg-white rounded-card border-2 border-dashed border-slate-200 py-8">
      <EmptyState icon={<Scissors size={22} />} title="No jobs pending cut" description="Approved orders with un-cut pieces appear here." compact />
    </div>;
  }
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(c => (
        <button key={c.orderId} onClick={() => { setOpenId(c.orderId); setTab('assign'); }}
          className={`text-left bg-white rounded-card border-2 shadow-sm p-4 hover:shadow-md transition-all ${c.dleft != null && c.dleft < 0 ? 'border-rose-300' : c.dleft != null && c.dleft <= 1 ? 'border-amber-300' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-black text-slate-800 font-mono leading-none">#{last4(c.job?.orderNo || c.orderId)}</p>
            <ChevronRight size={16} className="text-slate-300" />
          </div>
          <p className="text-2xs text-slate-500 font-bold truncate mt-1">{clientName(c.job?.clientId)}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {c.mmGroups.map(([thk, ps]) => (
              <span key={thk} className="text-2xs font-black bg-slate-100 text-slate-700 rounded-control px-1.5 py-0.5">{thk}×{ps.length}</span>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-2xs font-bold text-slate-500">{Math.round(c.totalSqft)} sqft · {c.pending.length} to cut</span>
            <span className={`text-2xs font-black inline-flex items-center gap-1 ${c.dleft != null && c.dleft < 0 ? 'text-rose-600' : c.dleft != null && c.dleft <= 1 ? 'text-amber-600' : 'text-slate-400'}`}>
              <Clock size={11} /> {c.due ? (c.dleft != null ? (c.dleft < 0 ? `${-c.dleft}d late` : `${c.dleft}d`) : c.due) : 'no due'}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
};

export default SupervisorJobBoard;
