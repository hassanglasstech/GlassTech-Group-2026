/**
 * ServiceStationScreen — mobile-first, single-station operator screen.
 *
 * One screen per shop-floor service operator (magic-link them straight to it):
 *   • /station/polish     → Polishing (edge polish / P-E / P-F)
 *   • /station/grinding   → Grinding (R/D)
 *   • /station/holenotch  → Notching + Holes (one operator does both)
 *
 * The operator sees ONLY the Service-Pending pieces whose pendingServices include
 * their station's service(s), taps "Done" per service, enters sqft, and the piece
 * advances: last service cleared → QC-Pending, otherwise stays Service-Pending.
 * Status-only, no GL. Mirrors ServiceFloorView's marking logic (serviceLog +
 * pendingServices decrement) in a single-thumb operator layout like CutterWorkbench.
 */

import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/authStore';
import { ProductionProvider, useProductionContext } from '@/modules/production/components/ProductionContext';
import { ProductionService } from '@/modules/production/services/productionService';
import { ProductionPiece, ServiceLogEntry, FloorStaff } from '@/modules/shared/types';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { toast } from 'sonner';
import { Sparkles, Hammer, Drill, Circle, CheckCircle2, Loader2, X, Clock, AlertTriangle } from 'lucide-react';

export type StationKey = 'polish' | 'grinding' | 'holenotch';

interface StationDef {
  label: string;
  services: string[];                       // service nicks this station performs
  icon: React.ReactNode;
  accent: string;                           // tailwind bg for header
}

const STATIONS: Record<StationKey, StationDef> = {
  polish:    { label: 'Polishing',   services: ['Polishing'],          icon: <Sparkles size={22} />, accent: 'from-indigo-600 to-indigo-700' },
  grinding:  { label: 'Grinding',    services: ['Grinding'],           icon: <Hammer size={22} />,   accent: 'from-amber-600 to-amber-700' },
  holenotch: { label: 'Hole & Notch', services: ['Notching', 'Holes'], icon: <Drill size={22} />,    accent: 'from-rose-600 to-rose-700' },
};

// Standard cost rates PKR/sqft per service (mirrors ServiceFloorView fallback).
const COST_RATES: Record<string, number> = { Polishing: 15, Grinding: 20, Notching: 45, Holes: 80 };

const svcIcon = (s: string): React.ReactNode => {
  if (s === 'Polishing') return <Sparkles size={13} />;
  if (s === 'Grinding')  return <Hammer size={13} />;
  if (s === 'Notching')  return <Drill size={13} />;
  if (s === 'Holes')     return <Circle size={13} />;
  return <CheckCircle2 size={13} />;
};

const ALLOWED = new Set<string>([
  'super_admin', 'owner', 'hassan',
  'factory_manager', 'glassco_supervisor', 'glassco_admin', 'glassco_production', 'glassco_service',
]);

interface CaptureState { piece: ProductionPiece; service: string; sqft: string; worker: string; }

const StationContent: React.FC<{ station: StationKey }> = ({ station }) => {
  const profile = useAuthStore(s => s.profile);
  const user = useAuthStore(s => s.user);
  const { pieces, handleUpdatePieceStatus } = useProductionContext();

  const def = STATIONS[station];
  const operator = profile?.fullName || user?.email || 'Operator';
  const floorStaff: FloorStaff[] = useMemo(() => ProductionService.getFloorStaff('Glassco'), []);

  const [capture, setCapture] = useState<CaptureState | null>(null);
  const [busy, setBusy] = useState(false);

  // Queue: Service-Pending pieces that still need any of THIS station's services.
  const queue = useMemo(
    () => (pieces || []).filter(p =>
      p.status === 'Service-Pending' &&
      (p.pendingServices || []).some(s => def.services.includes(s)),
    ),
    [pieces, def.services],
  );

  // My work today: serviceLog entries this operator logged today for this station.
  const doneToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let n = 0;
    (pieces || []).forEach(p => (p.serviceLog || []).forEach(l => {
      if (def.services.includes(l.serviceNick) && (l.completedAt || '').slice(0, 10) === today
        && (l.workerName || '').trim().toLowerCase() === operator.trim().toLowerCase()) n += 1;
    }));
    return n;
  }, [pieces, def.services, operator]);

  const openCapture = (piece: ProductionPiece, service: string) =>
    setCapture({ piece, service, sqft: String(piece.sqft || 0), worker: operator });

  const confirmDone = () => {
    if (!capture) return;
    const { piece, service, sqft, worker } = capture;
    setBusy(true);
    const sqftNum = parseFloat(sqft) || 0;
    const rate = COST_RATES[service] || 0;
    const entry: ServiceLogEntry = {
      serviceNick: service,
      workerName: (worker || operator).trim() || 'Unknown',
      sqft: sqftNum,
      costRatePerSqft: rate,
      totalCost: Math.round(sqftNum * rate),
      completedAt: new Date().toISOString(),
    };
    const serviceLog = [...(piece.serviceLog || []), entry];
    const remaining = (piece.pendingServices || []).filter(s => s !== service);
    try {
      if (remaining.length === 0) {
        handleUpdatePieceStatus(piece.id, 'QC-Pending', { pendingServices: [], serviceLog });
        toast.success(`${service} done — ${piece.id} → QC`);
      } else {
        handleUpdatePieceStatus(piece.id, 'Service-Pending', { pendingServices: remaining, serviceLog });
        toast.success(`${service} done — ${remaining.length} service(s) left`);
      }
    } catch {
      toast.error('Could not save — try again');
    }
    setBusy(false);
    setCapture(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 max-w-3xl md:max-w-4xl mx-auto md:border-x md:border-slate-200 md:shadow-sm" style={{ fontSize: 16 }}>
      {/* Header */}
      <header className={`sticky top-0 z-30 bg-gradient-to-br ${def.accent} text-white px-4 py-3 shadow`}>
        <div className="flex items-center gap-3">
          <div className="bg-white/15 rounded-xl p-2 shrink-0">{def.icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-2xs text-white/80 font-bold uppercase tracking-widest">Service Station</p>
            <h1 className="text-lg font-black truncate">{def.label}</h1>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xs text-white/80 font-bold uppercase">Operator</p>
            <p className="text-sm font-black truncate max-w-[9rem]">{operator}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-white/10 rounded-xl py-2 text-center">
            <p className="text-2xs font-black text-white/80 uppercase">In Queue</p>
            <p className="text-2xl font-black">{queue.length}</p>
          </div>
          <div className="bg-white/10 rounded-xl py-2 text-center">
            <p className="text-2xs font-black text-white/80 uppercase">Done Today</p>
            <p className="text-2xl font-black">{doneToday}</p>
          </div>
        </div>
      </header>

      {/* Queue */}
      <div className="px-4 py-4 space-y-3">
        {queue.length === 0 ? (
          <div className="bg-white rounded-card border-2 border-dashed border-slate-200">
            <EmptyState icon={<CheckCircle2 size={22} />} title={`Nothing pending for ${def.label}`} compact />
          </div>
        ) : queue.map(p => {
          const mine = (p.pendingServices || []).filter(s => def.services.includes(s));
          const other = (p.pendingServices || []).filter(s => !def.services.includes(s));
          return (
            <div key={p.id} className="bg-white rounded-card border-2 border-slate-200 shadow p-4">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-label font-black text-slate-800 font-mono truncate">{p.id}</p>
                {other.length > 0 && (
                  <span className="text-2xs font-bold text-slate-400 inline-flex items-center gap-1 shrink-0" title="Other services still pending on this piece">
                    <Clock size={11} /> also {other.join(', ')}
                  </span>
                )}
              </div>
              <p className="text-2xs text-slate-500 mb-3 line-clamp-2">{p.specs}</p>
              {/* prior services */}
              {(p.serviceLog || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {p.serviceLog!.map((l, i) => (
                    <span key={i} className="text-2xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle2 size={9} /> {l.serviceNick} · {l.workerName}
                    </span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 gap-2">
                {mine.map(s => (
                  <button key={s} onClick={() => openCapture(p, s)}
                    className="w-full min-h-[52px] bg-emerald-600 active:bg-emerald-700 text-white rounded-xl px-4 py-3 text-sm font-black uppercase tracking-wide flex items-center justify-center gap-2">
                    {svcIcon(s)} Mark {s} Done
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Capture modal */}
      {capture && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="text-2xs font-black uppercase tracking-widest text-emerald-600 mb-1 inline-flex items-center gap-1">{svcIcon(capture.service)} {capture.service} — Done</div>
                <div className="text-sm font-bold text-slate-700 line-clamp-2">{capture.piece.specs}</div>
                <div className="text-2xs text-slate-400 font-bold font-mono">{capture.piece.id}</div>
              </div>
              <button onClick={() => setCapture(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 shrink-0"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-2xs font-black uppercase tracking-widest text-slate-500 block mb-1">Worker</label>
                <input list="station-workers" value={capture.worker}
                  onChange={e => setCapture(c => c ? { ...c, worker: e.target.value } : c)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <datalist id="station-workers">
                  {floorStaff.filter(w => w.isActive).map(w => <option key={w.id} value={w.name} />)}
                </datalist>
              </div>
              <div>
                <label className="text-2xs font-black uppercase tracking-widest text-slate-500 block mb-1">Sq Ft Processed</label>
                <input type="number" min="0" step="0.01" value={capture.sqft}
                  onChange={e => setCapture(c => c ? { ...c, sqft: e.target.value } : c)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div className="bg-slate-50 rounded-xl px-4 py-2.5 flex justify-between items-center">
                <span className="text-2xs font-black uppercase tracking-widest text-slate-500">Labour @ PKR {COST_RATES[capture.service] || 0}/sqft</span>
                <span className="text-sm font-black text-emerald-700">PKR {Math.round((parseFloat(capture.sqft) || 0) * (COST_RATES[capture.service] || 0)).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCapture(null)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 font-black uppercase text-2xs tracking-widest hover:bg-slate-50">Cancel</button>
              <button onClick={confirmDone} disabled={busy}
                className="flex-1 py-3 rounded-xl bg-emerald-600 disabled:opacity-50 text-white font-black uppercase text-2xs tracking-widest hover:bg-emerald-700 flex items-center justify-center gap-2">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ServiceStationScreen: React.FC<{ station: StationKey }> = ({ station }) => {
  const user = useAuthStore(s => s.user);
  if (!user) return <Navigate to="/" replace />;
  if (!ALLOWED.has(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="text-center">
          <AlertTriangle size={36} className="mx-auto text-amber-500 mb-3" />
          <p className="text-sm font-bold text-slate-700">This station screen is for the service operator / supervisor.</p>
          <p className="text-xs text-slate-400 mt-2">Your role: <span className="font-mono">{user.role}</span></p>
        </div>
      </div>
    );
  }
  return (
    <ProductionProvider company="Glassco">
      <StationContent station={station} />
    </ProductionProvider>
  );
};

export default ServiceStationScreen;
