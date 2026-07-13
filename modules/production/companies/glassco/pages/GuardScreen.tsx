/**
 * GuardScreen.tsx — gate guard verification (Phase 2, feature: dispatch.guard_screen).
 *
 * The guard sees two lists — Pending + Approved gate passes. Click a pass → the
 * physical-style gate pass opens → check it → Verify & Allow exit (Pending →
 * Allowed). Simple, single purpose. Reuses ProductionService.getGatePasses /
 * saveGatePasses (two-tier synced) — no new RPC.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useFeature } from '@/modules/shared/hooks/useFeature';
import { ProductionService } from '@/modules/production/services/productionService';
import type { GatePass } from '@/modules/shared/types';
import {
  ShieldCheck, Truck, CheckCircle2, Clock, X, Search, RefreshCw, User, ArrowRight,
} from 'lucide-react';

type Tab = 'pending' | 'approved';

const GuardScreen: React.FC = () => {
  const enabled = useFeature('dispatch.guard_screen');
  const company = useAppStore(s => s.selectedCompany);
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<GatePass | null>(null);

  const refresh = (): void => setPasses(ProductionService.getGatePasses());
  useEffect(() => { refresh(); }, [company]);

  const forCompany = useMemo(() => passes.filter(g => g.company === company), [passes, company]);
  const pending = useMemo(() => forCompany.filter(g => g.status !== 'Allowed'), [forCompany]);
  const approved = useMemo(() => forCompany.filter(g => g.status === 'Allowed'), [forCompany]);

  const list = useMemo(() => {
    const base = tab === 'pending' ? pending : approved;
    const s = q.trim().toLowerCase();
    if (!s) return base;
    return base.filter(g =>
      `${g.id} ${g.vehicleNo || ''} ${g.driverName || ''} ${g.fromVendor || ''} ${g.materialDetails || ''}`.toLowerCase().includes(s));
  }, [tab, pending, approved, q]);

  const approve = (g: GatePass): void => {
    const updated = passes.map(x => x.id === g.id ? { ...x, status: 'Allowed' } as GatePass : x);
    ProductionService.saveGatePasses(updated);
    setPasses(updated);
    setOpen(null);
    toast.success(`Gate pass ${g.id} — verified & allowed to exit`);
  };

  if (!enabled) {
    return (
      <div className="p-12 text-center">
        <ShieldCheck className="mx-auto text-slate-300" size={44} />
        <p className="mt-3 text-sm font-bold text-slate-500">Guard screen is not enabled</p>
        <p className="text-xs text-slate-400">Turn it on in Admin → Security → Feature Flags (<code>dispatch.guard_screen</code>).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header + tabs */}
      <div className="rounded-2xl bg-gradient-to-r from-[#1A3A6B] to-[#2a5298] p-5 text-white shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <ShieldCheck size={20} /> Gate — Guard Verification
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
              {company} · verify each gate pass before the goods leave
            </p>
          </div>
          <button onClick={refresh} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20 transition">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setTab('pending')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${
              tab === 'pending' ? 'bg-white text-[#1A3A6B]' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}
          >
            <Clock size={14} /> Pending {pending.length > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px]">{pending.length}</span>}
          </button>
          <button
            onClick={() => setTab('approved')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${
              tab === 'approved' ? 'bg-white text-[#1A3A6B]' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}
          >
            <CheckCircle2 size={14} /> Approved
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search GP / vehicle / driver…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-bold focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <ShieldCheck className="mx-auto text-slate-300" size={36} />
          <p className="mt-2 text-sm font-bold text-slate-500">{tab === 'pending' ? 'No gate passes to verify' : 'No approved gate passes'}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(g => (
            <button
              key={g.id}
              onClick={() => setOpen(g)}
              className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-[#1A3A6B]/40 hover:shadow transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-black uppercase text-slate-800">{g.id}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${g.type === 'Outward' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{g.type}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Truck size={13} className="text-slate-400" /> {g.vehicleNo || '—'}
                <User size={13} className="ml-2 text-slate-400" /> {g.driverName || '—'}
              </div>
              <div className="text-[11px] text-slate-500 line-clamp-1">{g.materialDetails || g.fromVendor || '—'}</div>
              <div className="mt-1 flex items-center justify-between">
                {g.status === 'Allowed' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-600"><CheckCircle2 size={10} /> Allowed</span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-600"><Clock size={10} /> Pending</span>
                )}
                <ArrowRight size={14} className="text-slate-300" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Gate-pass detail — physical slip */}
      {open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* slip header */}
            <div className="flex items-center justify-between bg-[#1A3A6B] px-5 py-3 text-white">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} />
                <div>
                  <div className="text-sm font-black uppercase tracking-wide">Gate Pass</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">{company} · {open.type}</div>
                </div>
              </div>
              <button onClick={() => setOpen(null)} className="rounded-full p-1 hover:bg-white/10"><X size={18} /></button>
            </div>

            {/* slip body */}
            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-2">
                <span className="text-2xs font-bold uppercase tracking-widest text-slate-400">GP No</span>
                <span className="font-black text-slate-800">{open.id}</span>
              </div>
              {([
                ['Vehicle', open.vehicleNo],
                ['Vehicle Type', open.vehicleType],
                ['Driver', open.driverName],
                ['Source / Vendor', open.fromVendor],
                ['Movement', open.mvmntCode],
                ['Linked Dispatch', open.linkedDispatchId],
                ['Net Weight', (open.grossWeight != null && open.tareWeight != null) ? `${(open.grossWeight || 0) - (open.tareWeight || 0)} ${open.unit || 'KG'}` : undefined],
                ['Date / Time', open.timestamp],
              ] as Array<[string, string | number | undefined]>)
                .filter(([, v]) => v !== undefined && v !== '' && v !== null)
                .map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 text-sm">
                    <span className="text-2xs font-bold uppercase tracking-widest text-slate-400">{k}</span>
                    <span className="text-right font-bold text-slate-700">{String(v)}</span>
                  </div>
                ))}
              {open.materialDetails && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-2xs font-bold uppercase tracking-widest text-slate-400">Material</div>
                  <div className="mt-0.5 text-sm font-medium text-slate-700">{open.materialDetails}</div>
                </div>
              )}
            </div>

            {/* slip action */}
            <div className="border-t border-slate-200 bg-slate-50 p-4">
              {open.status === 'Allowed' ? (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3 text-sm font-black uppercase text-emerald-700">
                  <CheckCircle2 size={18} /> Verified &amp; Allowed
                </div>
              ) : (
                <button
                  onClick={() => approve(open)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-black uppercase text-white hover:bg-emerald-700 transition"
                >
                  <ShieldCheck size={18} /> Verify &amp; Allow Exit
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuardScreen;
