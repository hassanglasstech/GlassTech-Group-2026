/**
 * ServicePool.tsx — "Out at Service" pool (Phase 1, feature: dispatch.service_pool).
 *
 * Single-window visibility of every batch currently OUT at an outsource service
 * vendor (Tempering / Lamination / Double Glazing) — sent but not yet returned.
 * Drives the return loop + overdue alerts off tempering_dispatches.expectedReturnDate.
 *
 * Read-only pool + a one-click hop to Receive Back (integrated receive lands in
 * the next slice). Gated behind the feature flag so it launches when the founder
 * flips it on (Admin → Security → Feature Flags).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useFeature } from '@/modules/shared/hooks/useFeature';
import { ProductionService } from '@/modules/production/services/productionService';
import type { TemperingDispatch } from '@/modules/production/types/production';
import { PackageOpen, AlertTriangle, Search, ArrowDownToLine, Clock, Layers, RefreshCw } from 'lucide-react';

const SERVICE_TYPES = ['Tempering', 'Lamination', 'Double Glazing'];
const fmtPkr = (n: number): string => 'PKR ' + Math.round(n || 0).toLocaleString('en-US');

const ServicePool: React.FC = () => {
  const enabled = useFeature('dispatch.service_pool');
  const company = useAppStore(s => s.selectedCompany);
  const [rows, setRows] = useState<TemperingDispatch[]>([]);
  const [q, setQ] = useState('');

  const refresh = (): void => setRows(ProductionService.getTemperingDispatches());
  useEffect(() => { refresh(); }, [company]);

  const today = new Date().toISOString().slice(0, 10);

  // Pool = a service dispatch (temper/lam/DG) whose pieces are still out
  // (not fully received, no actual return date). Robust to exact status strings.
  const pool = useMemo(() => rows.filter(d =>
    d.company === company &&
    SERVICE_TYPES.includes(d.serviceType) &&
    !d.actualReturnDate &&
    (d.receivedPieceIds?.length ?? 0) < (d.pieceIds?.length ?? 0),
  ), [rows, company]);

  const isOverdue = (d: TemperingDispatch): boolean => !!d.expectedReturnDate && d.expectedReturnDate < today;
  const daysOut = (d: TemperingDispatch): number => {
    if (!d.date) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(d.date).getTime()) / 86400000));
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? pool.filter(d => `${d.id} ${d.plantName} ${(d.pieceIds || []).join(' ')}`.toLowerCase().includes(s))
      : pool;
    // Overdue first, then oldest sent.
    return [...list].sort((a, b) =>
      (Number(isOverdue(b)) - Number(isOverdue(a))) || (a.date || '').localeCompare(b.date || ''));
  }, [pool, q, today]);

  const kpi = useMemo(() => ({
    trips:   pool.length,
    overdue: pool.filter(isOverdue).length,
    pieces:  pool.reduce((s, d) => s + ((d.pieceIds?.length ?? 0) - (d.receivedPieceIds?.length ?? 0)), 0),
    sqft:    pool.reduce((s, d) => s + (d.totalSqFt || 0), 0),
    charges: pool.reduce((s, d) => s + (d.totalCharges || 0), 0),
  }), [pool, today]);

  if (!enabled) {
    return (
      <div className="p-12 text-center">
        <PackageOpen className="mx-auto text-slate-300" size={44} />
        <p className="mt-3 text-sm font-bold text-slate-500">Out-at-Service Pool is not enabled</p>
        <p className="text-xs text-slate-400">Turn it on in Admin → Security → Feature Flags (<code>dispatch.service_pool</code>).</p>
      </div>
    );
  }

  const goReceive = (): void => { window.location.hash = '#/production/inward'; };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header + KPIs */}
      <div className="rounded-2xl bg-gradient-to-r from-[#1A3A6B] to-[#2a5298] p-5 text-white shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <PackageOpen size={20} /> Out at Service — Pool
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
              {company} · pieces currently at tempering / lamination / double-glazing vendors
            </p>
          </div>
          <button onClick={refresh} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20 transition">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Batches out', value: String(kpi.trips) },
            { label: 'Overdue', value: String(kpi.overdue), danger: kpi.overdue > 0 },
            { label: 'Pieces at vendor', value: String(kpi.pieces) },
            { label: 'Charges committed', value: fmtPkr(kpi.charges) },
          ].map(k => (
            <div key={k.label} className={`rounded-xl px-3 py-2 ${k.danger ? 'bg-red-500/25' : 'bg-white/10'}`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-white/70">{k.label}</div>
              <div className="text-lg font-black tabular-nums">{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search dispatch / vendor / piece…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-bold focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Pool list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <PackageOpen className="mx-auto text-slate-300" size={36} />
          <p className="mt-2 text-sm font-bold text-slate-500">Nothing out at service</p>
          <p className="text-xs text-slate-400">Dispatched batches with an expected return date show up here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-4 py-3">Dispatch</th>
                <th className="px-4 py-3">Vendor / Service</th>
                <th className="px-4 py-3 text-center">Pieces</th>
                <th className="px-4 py-3 text-right">SqFt</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Expected Return</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(d => {
                const overdue = isOverdue(d);
                const out = (d.pieceIds?.length ?? 0) - (d.receivedPieceIds?.length ?? 0);
                return (
                  <tr key={d.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="font-black uppercase text-slate-800">{d.id}</div>
                      <div className="text-[10px] font-bold uppercase tracking-tight text-slate-400 flex items-center gap-1">
                        <Clock size={10} /> {daysOut(d)}d out
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-700 uppercase">{d.plantName}</div>
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-orange-700">
                        <Layers size={10} /> {d.serviceType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-black tabular-nums text-slate-800">{out}</span>
                      {(d.receivedPieceIds?.length ?? 0) > 0 && (
                        <span className="text-[10px] text-slate-400"> / {d.pieceIds?.length ?? 0}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{Math.round(d.totalSqFt || 0)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{d.date || '—'}</td>
                    <td className="px-4 py-3 tabular-nums font-bold text-slate-700">{d.expectedReturnDate || <span className="text-slate-300">not set</span>}</td>
                    <td className="px-4 py-3 text-center">
                      {overdue ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase text-red-700">
                          <AlertTriangle size={10} /> Overdue
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-600">At Vendor</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={goReceive} className="inline-flex items-center gap-1 rounded-lg bg-[#1A3A6B] px-2.5 py-1.5 text-[10px] font-black uppercase text-white hover:bg-[#254e8f] transition">
                        <ArrowDownToLine size={12} /> Receive
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ServicePool;
