/**
 * ServicePool.tsx — dispatch service hub (Phase 1, feature: dispatch.service_pool).
 *
 * Two tabs, single window:
 *   1. OUT AT SERVICE — every batch currently at an outsource vendor (Tempering /
 *      Lamination / Double Glazing), sent but not yet returned; overdue tracking
 *      off tempering_dispatches.expectedReturnDate.
 *   2. SIGNED COPIES — delivery challans (Site Delivery) and whether the customer's
 *      signed copy has come back + been filed (the founder's "entry ke signed copy
 *      wapas aayi ya nahi").
 *
 * Gated behind the feature flag so it launches when the founder flips it on
 * (Admin → Security → Feature Flags).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useFeature } from '@/modules/shared/hooks/useFeature';
import { ProductionService } from '@/modules/production/services/productionService';
import type { TemperingDispatch } from '@/modules/production/types/production';
import {
  PackageOpen, AlertTriangle, Search, ArrowDownToLine, Clock, Layers, RefreshCw,
  FileCheck, FileWarning, CheckCircle2, Undo2,
} from 'lucide-react';

const SERVICE_TYPES = ['Tempering', 'Lamination', 'Double Glazing'];
const fmtPkr = (n: number): string => 'PKR ' + Math.round(n || 0).toLocaleString('en-US');

type Tab = 'pool' | 'signed';

const ServicePool: React.FC = () => {
  const enabled = useFeature('dispatch.service_pool');
  const company = useAppStore(s => s.selectedCompany);
  const [rows, setRows] = useState<TemperingDispatch[]>([]);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('pool');

  const refresh = (): void => setRows(ProductionService.getTemperingDispatches());
  useEffect(() => { refresh(); }, [company]);

  const today = new Date().toISOString().slice(0, 10);

  // ── OUT-AT-SERVICE pool ────────────────────────────────────────────────
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

  const filteredPool = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? pool.filter(d => `${d.id} ${d.plantName} ${(d.pieceIds || []).join(' ')}`.toLowerCase().includes(s))
      : pool;
    return [...list].sort((a, b) =>
      (Number(isOverdue(b)) - Number(isOverdue(a))) || (a.date || '').localeCompare(b.date || ''));
  }, [pool, q, today]);

  const poolKpi = useMemo(() => ({
    trips:   pool.length,
    overdue: pool.filter(isOverdue).length,
    pieces:  pool.reduce((s, d) => s + ((d.pieceIds?.length ?? 0) - (d.receivedPieceIds?.length ?? 0)), 0),
    charges: pool.reduce((s, d) => s + (d.totalCharges || 0), 0),
  }), [pool, today]);

  // ── DELIVERY CHALLANS + signed-copy tracking ───────────────────────────
  const deliveries = useMemo(() => rows.filter(d =>
    d.company === company && d.serviceType === 'Site Delivery',
  ), [rows, company]);

  const filteredDeliveries = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? deliveries.filter(d => `${d.id} ${d.plantName}`.toLowerCase().includes(s))
      : deliveries;
    // Pending signed-copy first, then newest.
    return [...list].sort((a, b) =>
      (Number(!!a.signedCopyReceived) - Number(!!b.signedCopyReceived)) || (b.date || '').localeCompare(a.date || ''));
  }, [deliveries, q]);

  const signedKpi = useMemo(() => ({
    total:    deliveries.length,
    received: deliveries.filter(d => d.signedCopyReceived).length,
    pending:  deliveries.filter(d => !d.signedCopyReceived).length,
  }), [deliveries]);

  const toggleSignedCopy = (id: string): void => {
    const updated = rows.map(d => d.id === id
      ? {
          ...d,
          signedCopyReceived: !d.signedCopyReceived,
          signedCopyReceivedDate: !d.signedCopyReceived ? today : undefined,
        }
      : d);
    ProductionService.saveTemperingDispatches(updated);
    setRows(updated);
    const now = updated.find(d => d.id === id);
    toast.success(now?.signedCopyReceived ? `Signed copy filed — ${id}` : `Signed copy un-marked — ${id}`);
  };

  if (!enabled) {
    return (
      <div className="p-12 text-center">
        <PackageOpen className="mx-auto text-slate-300" size={44} />
        <p className="mt-3 text-sm font-bold text-slate-500">Service pool is not enabled</p>
        <p className="text-xs text-slate-400">Turn it on in Admin → Security → Feature Flags (<code>dispatch.service_pool</code>).</p>
      </div>
    );
  }

  const goReceive = (): void => { window.location.hash = '#/production/inward'; };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-[#1A3A6B] to-[#2a5298] p-5 text-white shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <PackageOpen size={20} /> Dispatch — Service &amp; Delivery
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
              {company} · out-at-service pool &amp; delivery-challan signed copies
            </p>
          </div>
          <button onClick={refresh} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20 transition">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setTab('pool')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${
              tab === 'pool' ? 'bg-white text-[#1A3A6B]' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}
          >
            <Layers size={14} /> Out at Service {poolKpi.overdue > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px]">{poolKpi.overdue}</span>}
          </button>
          <button
            onClick={() => setTab('signed')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${
              tab === 'signed' ? 'bg-white text-[#1A3A6B]' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}
          >
            <FileCheck size={14} /> Signed Copies {signedKpi.pending > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px]">{signedKpi.pending}</span>}
          </button>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(tab === 'pool'
            ? [
                { label: 'Batches out', value: String(poolKpi.trips) },
                { label: 'Overdue', value: String(poolKpi.overdue), danger: poolKpi.overdue > 0 },
                { label: 'Pieces at vendor', value: String(poolKpi.pieces) },
                { label: 'Charges committed', value: fmtPkr(poolKpi.charges) },
              ]
            : [
                { label: 'Delivery challans', value: String(signedKpi.total) },
                { label: 'Signed copy filed', value: String(signedKpi.received) },
                { label: 'Awaiting signed copy', value: String(signedKpi.pending), danger: signedKpi.pending > 0 },
              ]
          ).map(k => (
            <div key={k.label} className={`rounded-xl px-3 py-2 ${('danger' in k && k.danger) ? 'bg-red-500/25' : 'bg-white/10'}`}>
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
          placeholder={tab === 'pool' ? 'Search dispatch / vendor / piece…' : 'Search challan / site…'}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-bold focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* ── OUT-AT-SERVICE tab ── */}
      {tab === 'pool' && (
        filteredPool.length === 0 ? (
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
                {filteredPool.map(d => {
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
        )
      )}

      {/* ── SIGNED-COPIES tab ── */}
      {tab === 'signed' && (
        filteredDeliveries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <FileCheck className="mx-auto text-slate-300" size={36} />
            <p className="mt-2 text-sm font-bold text-slate-500">No delivery challans yet</p>
            <p className="text-xs text-slate-400">Site-delivery challans appear here to track the customer&apos;s signed copy.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">Challan</th>
                  <th className="px-4 py-3">Site / Customer</th>
                  <th className="px-4 py-3 text-center">Pieces</th>
                  <th className="px-4 py-3">Delivered</th>
                  <th className="px-4 py-3 text-center">Signed Copy</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDeliveries.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-black uppercase text-slate-800">{d.id}</td>
                    <td className="px-4 py-3 font-bold uppercase text-slate-700">{d.plantName}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-800">{d.pieceIds?.length ?? 0}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{d.date || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {d.signedCopyReceived ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">
                          <CheckCircle2 size={10} /> Filed{d.signedCopyReceivedDate ? ` · ${d.signedCopyReceivedDate}` : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
                          <FileWarning size={10} /> Awaiting
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {d.signedCopyReceived ? (
                        <button onClick={() => toggleSignedCopy(d.id)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-black uppercase text-slate-500 hover:bg-slate-200 transition">
                          <Undo2 size={12} /> Undo
                        </button>
                      ) : (
                        <button onClick={() => toggleSignedCopy(d.id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-black uppercase text-white hover:bg-emerald-700 transition">
                          <FileCheck size={12} /> Mark filed
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
};

export default ServicePool;
