/**
 * WIPAging.tsx — Sprint 8
 *
 * Two combined dashboards on one page (chosen because for go-live both
 * insights are reviewed together — "what's stuck on my floor + which
 * vendors are dragging it down").
 *
 *   1. Stuck pieces table — every piece sitting in the same status for
 *      > 7 days. Color-coded:
 *        7-14 days   → amber
 *        14-30 days  → red
 *        > 30 days   → red + slow flash
 *
 *   2. Vendor SLA dashboard — uses the new tempering_dispatches columns
 *      from migration 047 (expected_return_date / actual_return_date)
 *      to compute on-time % per vendor and show currently-overdue
 *      dispatches.
 *
 * No new schema reads — pulls from ProductionService + Supabase
 * directly for tempering_dispatches.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { supabase } from '@/src/services/supabaseClient';
import { ProductionPiece, Quotation, Client } from '@/modules/shared/types';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { KpiTile, KpiRow } from '@/modules/shared/components/KpiTile';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import Pagination from '@/components/Pagination';
import {
  Clock, Activity, RefreshCw,
  Truck, CheckCircle2,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────
const daysSince = (iso: string | undefined): number => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((Date.now() - t) / 86_400_000);
};

const ageClass = (days: number): { row: string; pill: string; flash?: boolean } => {
  if (days > 30) return { row: 'bg-rose-50 border-l-4 border-l-rose-600',  pill: 'bg-rose-600 text-white animate-pulse',  flash: true  };
  if (days > 14) return { row: 'bg-rose-50 border-l-4 border-l-rose-500',  pill: 'bg-rose-500 text-white' };
  if (days >= 7) return { row: 'bg-amber-50 border-l-4 border-l-amber-500', pill: 'bg-amber-500 text-white' };
  return { row: 'bg-white', pill: 'bg-slate-200 text-slate-600' };
};

interface VendorSLA {
  vendor:     string;
  total:      number;
  returned:   number;
  onTime:     number;
  overdue:    number;
  outstanding:number;
  onTimePct:  number;
}

// ════════════════════════════════════════════════════════════════════════
const WIPAging: React.FC = () => {
  const user = useAuthStore(s => s.user);
  const company = (useAppStore(s => s.selectedCompany) as string) || 'Glassco';

  const [pieces, setPieces]         = useState<ProductionPiece[]>([]);
  const [allOrders, setAllOrders]   = useState<Quotation[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [tick, setTick]             = useState(0);
  const [filter, setFilter]         = useState<'all' | 'stuck' | 'critical'>('stuck');

  const refresh = useCallback(async () => {
    // Cloud-backed load. The sync getters (getProductionPieces / SalesService.
    // getQuotations / getClients) read only the localStorage cache, which is
    // empty on a fresh route — the stuck-pieces table + KPIs showed nothing.
    try {
      const [pcs, ords, clis] = await Promise.all([
        ProductionService.getProductionPiecesAsync(),
        AsyncSalesService.getQuotations(),
        AsyncSalesService.getClients(),
      ]);
      setPieces(pcs);
      setAllOrders(ords);
      setAllClients(clis);
    } catch {
      setPieces(ProductionService.getProductionPieces());
      setAllOrders(SalesService.getQuotations());
      setAllClients(SalesService.getClients());
    }
    // Pull fresh dispatch rows directly from Supabase so the SLA dates
    // (added by migration 047) reflect cloud truth even if local cache
    // is stale.
    try {
      const { data } = await supabase.from('tempering_dispatches')
        .select('*')
        .eq('company', company)
        .limit(500);
      if (Array.isArray(data) && data.length > 0) {
        setDispatches(data);
      } else {
        setDispatches(ProductionService.getTemperingDispatches().filter((d: any) => d.company === company));
      }
    } catch {
      setDispatches(ProductionService.getTemperingDispatches().filter((d: any) => d.company === company));
    }
  }, [company]);

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [tick, company]);

  // ── Stuck pieces — > 7 days in same status ──────────────────────────
  const stuckPieces = useMemo(() => {
    const NON_TERMINAL = new Set([
      'Cut','Service-Pending','QC-Pending','QC-Passed','Ready to Dispatch',
      'Dispatched','Tempered','Received-From-Tempering','Hold',
    ]);
    return pieces
      .filter(p => NON_TERMINAL.has(p.status))
      .map(p => ({
        piece: p,
        days: daysSince(p.lastUpdated),
        order: allOrders.find(o => o.orderNo === p.orderId || o.id === p.orderId),
      }))
      .filter(x => x.days >= 7)
      .sort((a, b) => b.days - a.days);
  }, [pieces, allOrders]);

  const visibleStuck = useMemo(() => {
    if (filter === 'critical') return stuckPieces.filter(s => s.days > 14);
    if (filter === 'stuck')    return stuckPieces;
    return [...pieces].map(p => ({ piece: p, days: daysSince(p.lastUpdated), order: allOrders.find(o => o.orderNo === p.orderId) }));
  }, [stuckPieces, pieces, filter, allOrders]);

  // paginate the aging table (the 'all' filter renders every piece).
  // Pagination self-hides at ≤1 page, so small shops see no change.
  const WIP_PAGE_SIZE = 50;
  const [wipPage, setWipPage] = useState(1);
  useEffect(() => { setWipPage(1); }, [filter]);
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(visibleStuck.length / WIP_PAGE_SIZE));
    if (wipPage > maxPage) setWipPage(maxPage);
  }, [visibleStuck.length, wipPage]);
  const pagedStuck = useMemo(
    () => visibleStuck.slice((wipPage - 1) * WIP_PAGE_SIZE, wipPage * WIP_PAGE_SIZE),
    [visibleStuck, wipPage],
  );

  // ── Vendor SLA ───────────────────────────────────────────────────────
  const vendorSLA = useMemo<VendorSLA[]>(() => {
    const today = new Date().toISOString().split('T')[0];
    const byVendor: Record<string, VendorSLA> = {};
    dispatches.forEach((d: any) => {
      const v = d.plant_name || d.plantName || 'Unknown';
      if (!byVendor[v]) byVendor[v] = {
        vendor: v, total: 0, returned: 0, onTime: 0, overdue: 0, outstanding: 0, onTimePct: 0,
      };
      const row = byVendor[v];
      row.total += 1;
      const expected = d.expected_return_date || d.expectedReturnDate;
      const actual   = d.actual_return_date   || d.actualReturnDate;
      if (actual) {
        row.returned += 1;
        if (!expected || actual <= expected) row.onTime += 1;
      } else {
        row.outstanding += 1;
        if (expected && expected < today) row.overdue += 1;
      }
    });
    Object.values(byVendor).forEach(v => {
      v.onTimePct = v.returned > 0 ? Math.round((v.onTime / v.returned) * 100) : 100;
    });
    return Object.values(byVendor).sort((a, b) => b.total - a.total);
  }, [dispatches]);

  // Guards placed after hooks to keep hook order stable (react-hooks/rules-of-hooks)
  if (!user) return <Navigate to="/" replace/>;

  const totalOverdue = vendorSLA.reduce((s, v) => s + v.overdue, 0);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 p-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-rose-700 to-amber-700 text-white rounded-card p-6 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={24}/>
          <div>
            <h1 className="text-xl font-black uppercase">WIP Aging &amp; Vendor SLA</h1>
            <p className="text-2xs text-rose-100 font-bold uppercase tracking-widest mt-0.5">
              Stuck pieces &amp; tempering vendor on-time performance
            </p>
          </div>
        </div>
        <button onClick={() => setTick(x => x + 1)} className="bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2">
          <RefreshCw size={14}/> Refresh
        </button>
      </div>

      {/* KPI strip */}
      <KpiRow>
        <KpiTile label="Stuck >7d"   value={stuckPieces.filter(s => s.days >= 7  && s.days <= 14).length} tone="warning" icon={<Clock size={16}/>} />
        <KpiTile label="Stuck >14d"  value={stuckPieces.filter(s => s.days > 14 && s.days <= 30).length} tone="danger"  icon={<Clock size={16}/>} />
        <KpiTile label="Stuck >30d"  value={stuckPieces.filter(s => s.days > 30).length} tone="danger"  icon={<Clock size={16}/>} />
        <KpiTile label="Vendors Overdue" value={totalOverdue} tone={totalOverdue > 0 ? 'danger' : 'success'} icon={<Truck size={16}/>} />
      </KpiRow>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {([
          { id: 'stuck',    label: `Stuck (${stuckPieces.length})` },
          { id: 'critical', label: `Critical >14d (${stuckPieces.filter(s => s.days > 14).length})` },
          { id: 'all',      label: `All pieces (${pieces.length})` },
        ] as const).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-colors ${filter === f.id ? 'bg-slate-900 text-white' : 'bg-white border-2 border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Stuck pieces table */}
      <div className="bg-white rounded-card border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
            <Clock size={14}/> Stuck Pieces
          </p>
          <p className="text-2xs text-slate-400 font-bold uppercase">{visibleStuck.length} rows · sorted by oldest first</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-2xs font-black uppercase text-slate-400 tracking-widest border-b">
              <tr>
                <th className="px-3 py-2 w-24">Days</th>
                <th className="px-3 py-2">Piece ID</th>
                <th className="px-3 py-2">Order Ref</th>
                <th className="px-3 py-2">Client / Project</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleStuck.length === 0 && (
                <tr><td colSpan={6} className="p-0">
                  <EmptyState
                    icon={<CheckCircle2 size={22} />}
                    title="No stuck pieces"
                    description="Clean shop floor — nothing has been sitting in the same status for too long."
                  />
                </td></tr>
              )}
              {pagedStuck.map(({ piece, days, order }) => {
                const cls = ageClass(days);
                const client = order ? allClients.find((c: any) => c.id === order.clientId) : null;
                return (
                  <tr key={piece.id} className={`hover:bg-slate-100 ${cls.row}`}>
                    <td className="px-3 py-2">
                      <span className={`text-2xs font-black px-2 py-0.5 rounded uppercase tracking-wider ${cls.pill}`}>
                        {days}d
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono font-black text-slate-800">{piece.id}</td>
                    <td className="px-3 py-2 font-bold text-slate-600">{piece.orderId}</td>
                    <td className="px-3 py-2">
                      <p className="font-bold text-slate-700 truncate max-w-xs">{client?.name || '—'}</p>
                      {order?.projectName && <p className="text-2xs text-slate-400 font-bold uppercase truncate">{order.projectName}</p>}
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={piece.status} size="sm" /></td>
                    <td className="px-3 py-2 text-2xs text-slate-500 font-bold">{(piece.lastUpdated || '').replace('T', ' ').slice(0, 16)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination totalItems={visibleStuck.length} itemsPerPage={WIP_PAGE_SIZE} currentPage={wipPage} onPageChange={setWipPage} />
      </div>

      {/* Vendor SLA dashboard */}
      <div className="bg-white rounded-card border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
            <Truck size={14}/> Tempering Vendor SLA
          </p>
          <p className="text-2xs text-slate-400 font-bold uppercase">Migration 047 columns: expected_return_date / actual_return_date</p>
        </div>
        {vendorSLA.length === 0 ? (
          <EmptyState
            icon={<Truck size={22} />}
            title="No tempering dispatches yet"
            description="Vendor on-time performance will appear here once pieces are sent out for tempering."
          />
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-2xs font-black uppercase text-slate-400 tracking-widest border-b">
              <tr>
                <th className="px-4 py-2.5">Vendor</th>
                <th className="px-3 py-2.5 text-right">Total Sent</th>
                <th className="px-3 py-2.5 text-right">Returned</th>
                <th className="px-3 py-2.5 text-right">Outstanding</th>
                <th className="px-3 py-2.5 text-right">Overdue</th>
                <th className="px-3 py-2.5 text-right w-32">On-Time %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendorSLA.map(v => {
                const pctTone = v.onTimePct >= 90 ? 'text-emerald-600 bg-emerald-50'
                              : v.onTimePct >= 70 ? 'text-amber-700 bg-amber-50'
                              :                      'text-rose-700 bg-rose-50';
                return (
                  <tr key={v.vendor} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-black text-slate-800">{v.vendor}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-700">{v.total}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-700">{v.returned}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-700">{v.outstanding}</td>
                    <td className="px-3 py-2.5 text-right">
                      {v.overdue > 0 ? (
                        <span className="text-2xs font-black px-2 py-0.5 rounded bg-rose-600 text-white">{v.overdue}</span>
                      ) : (
                        <span className="text-2xs font-bold text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`text-2xs font-black px-2 py-1 rounded ${pctTone}`}>
                        {v.onTimePct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default WIPAging;
