/**
 * FactoryGatekeeper — Gate Pass C (the cross-company gate).
 *
 * ONE gatekeeper login at the shared factory gate receives EVERY group company's
 * gate passes (GTK · GTI · Glassco · Nippon) in a single queue — pushed here in
 * real time by crossCompanyNotifService when the office issues a pass (Gate Pass B).
 *
 * Dead-simple, mobile-first, sunlight-readable: big cards with a colored company
 * stripe and huge IN / OUT buttons. "Timing is the tap" — pressing IN/OUT stamps
 * the server-ish clock (the act of marking IS the record), giving free yard-dwell
 * data with zero data entry. On OUT the pass is cleared and a confirmation is
 * pushed back to the issuing company.
 *
 * Cross-company order writes are gated by RLS/activeCompany, so the gate log is
 * kept locally on the gatekeeper device and the round-trip to the office runs
 * through the same notification channel (a status push-back).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CrossCompanyNotification, getCrossCompanyNotifs, markCrossCompanyNotifRead, pushCrossCompanyNotif,
} from '@/modules/shared/services/crossCompanyNotifService';
import { useAuthStore } from '@/modules/auth/authStore';
import { ShieldCheck, LogIn, LogOut, RefreshCw, Loader2, Truck, Clock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface GateLogEntry { inAt?: string; outAt?: string }
type GateLog = Record<string, GateLogEntry>;

const LOG_KEY = 'gk_gate_log';
const readLog = (): GateLog => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '{}'); } catch { return {}; } };
const writeLog = (l: GateLog) => { try { localStorage.setItem(LOG_KEY, JSON.stringify(l)); } catch { /* quota */ } };

const stripe: Record<string, string> = {
  GTK: 'bg-blue-600', GTI: 'bg-cyan-600', Glassco: 'bg-amber-600', Nippon: 'bg-indigo-600', Factory: 'bg-slate-600',
};

const hhmm = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const FactoryGatekeeper: React.FC = () => {
  const guard = useAuthStore(s => s.profile?.fullName || s.user?.email || 'gatekeeper');
  const [passes, setPasses] = useState<CrossCompanyNotification[]>([]);
  const [log, setLog] = useState<GateLog>(readLog());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await getCrossCompanyNotifs('Factory');
    // Gate passes only (Gate Pass B pushes title "Gate Pass — <order>").
    setPasses(all.filter(n => (n.title || '').toLowerCase().startsWith('gate pass')));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const stampIn = (p: CrossCompanyNotification) => {
    const next: GateLog = { ...log, [p.id]: { ...log[p.id], inAt: new Date().toISOString() } };
    setLog(next); writeLog(next);
    toast.success(`IN stamped — ${p.title.replace(/^Gate Pass — /i, '')}`);
  };

  const stampOut = async (p: CrossCompanyNotification) => {
    setBusy(p.id);
    try {
      const outAt = new Date().toISOString();
      const next: GateLog = { ...log, [p.id]: { ...log[p.id], outAt } };
      setLog(next); writeLog(next);
      // Clear from the active queue + push a confirmation back to the issuing company.
      await markCrossCompanyNotifRead(p.id);
      await pushCrossCompanyNotif({
        targetCompany: p.fromCompany,
        fromCompany: 'Factory',
        title: `Gated out — ${p.title.replace(/^Gate Pass — /i, '')}`,
        message: `Vehicle cleared the gate at ${hhmm(outAt)} by ${guard}.`,
        type: 'general',
        referenceId: p.referenceId,
      });
      toast.success('OUT stamped — vehicle cleared · office notified.');
      await load();
    } catch (err) {
      toast.error(`Could not stamp out: ${err instanceof Error ? err.message : 'error'}`);
    } finally { setBusy(null); }
  };

  const active = useMemo(() => passes.filter(p => !log[p.id]?.outAt), [passes, log]);

  return (
    <div className="min-h-[100dvh] bg-slate-100 pb-10">
      {/* Big header */}
      <div className="bg-slate-900 text-white px-4 py-5 flex items-center gap-3 sticky top-0 z-10 shadow-lg">
        <div className="p-2.5 bg-emerald-600 rounded-2xl"><ShieldCheck size={26}/></div>
        <div className="min-w-0">
          <h1 className="text-lg font-black uppercase tracking-tight leading-none">Factory Gate</h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">All companies · {active.length} at gate</p>
        </div>
        <button onClick={load} className="ml-auto flex items-center gap-1.5 px-4 py-3 bg-white/10 hover:bg-white/20 active:scale-95 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">
          <RefreshCw size={16}/> Refresh
        </button>
      </div>

      <div className="p-3 space-y-3 max-w-2xl mx-auto">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Loading gate passes…</div>
        ) : active.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center text-slate-300 font-black uppercase italic text-sm tracking-widest">
            <Truck size={52} className="mx-auto mb-4 opacity-20"/>
            No vehicles at the gate.
          </div>
        ) : (
          active.map(p => {
            const gp = log[p.id] || {};
            const isIn = !!gp.inAt;
            const co = p.fromCompany;
            return (
              <div key={p.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex">
                <div className={`w-2.5 ${stripe[co] || 'bg-slate-400'}`} />
                <div className="flex-1 p-4">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[10px] font-black uppercase text-white px-2 py-0.5 rounded-md ${stripe[co] || 'bg-slate-500'}`}>{co}</span>
                    <span className="text-base font-black text-slate-900 uppercase">{p.title.replace(/^Gate Pass — /i, '')}</span>
                    {isIn && <span className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600"><Clock size={12}/> IN {hhmm(gp.inAt)}</span>}
                  </div>
                  <p className="text-xs font-bold text-slate-600 leading-snug">{p.message}</p>
                  <div className="grid grid-cols-2 gap-2.5 mt-3">
                    <button onClick={() => stampIn(p)} disabled={isIn}
                      className={`flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-black uppercase tracking-widest active:scale-95 transition-all ${isIn ? 'bg-emerald-50 text-emerald-300 cursor-default' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow'}`}>
                      <LogIn size={18}/> {isIn ? 'In ✓' : 'Gate In'}
                    </button>
                    <button onClick={() => stampOut(p)} disabled={busy === p.id}
                      className="flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-black uppercase tracking-widest bg-slate-800 text-white hover:bg-slate-900 active:scale-95 transition-all disabled:opacity-50 shadow">
                      {busy === p.id ? <Loader2 size={18} className="animate-spin"/> : <LogOut size={18}/>} Gate Out
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Recently cleared (today's OUTs) — light history so the guard sees his taps. */}
        {passes.some(p => log[p.id]?.outAt) && (
          <div className="pt-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1 mb-2">Cleared</p>
            <div className="space-y-1.5">
              {passes.filter(p => log[p.id]?.outAt).slice(-6).reverse().map(p => (
                <div key={p.id} className="bg-white/70 rounded-xl border border-slate-200 px-4 py-2.5 flex items-center gap-2 text-xs">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0"/>
                  <span className="font-black text-slate-700 uppercase">{p.title.replace(/^Gate Pass — /i, '')}</span>
                  <span className="text-slate-400 font-bold">{p.fromCompany}</span>
                  <span className="ml-auto text-slate-400 font-bold tabular-nums">IN {hhmm(log[p.id]?.inAt) || '—'} · OUT {hhmm(log[p.id]?.outAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FactoryGatekeeper;
