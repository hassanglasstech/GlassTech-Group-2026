/**
 * JobOrders.tsx — Production module: Job Orders list.
 *
 * A production-centric view of every confirmed order (JobOrder = Quotation):
 * order header facts + live production progress aggregated from the order's
 * production_pieces (how many cut / in-QC / dispatched / delivered / broken).
 *
 * Reuses the WIPAging data pattern: orders from SalesService, pieces async from
 * ProductionService, joined by piece.orderId === order.orderNo || order.id.
 * No new schema reads.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { HRService } from '@/modules/hr/services/hrService';
import { ProductionPiece } from '@/modules/shared/types';
import { Quotation } from '@/modules/production/types/production';
import { Client } from '@/modules/sales/types/crm';
import { PieceStatus } from '@/modules/shared/constants';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { KpiTile, KpiRow } from '@/modules/shared/components/KpiTile';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import Pagination from '@/components/Pagination';
import { formatPKR, formatNumber, formatDate } from '@/modules/shared/utils/format';
import { toast } from 'sonner';
import {
  ClipboardList, RefreshCw, Search, ChevronDown, ChevronRight,
  Package, CheckCircle2, Loader2, FileText, Scissors, History,
} from 'lucide-react';

type ProdStatus = 'awaiting' | 'inprod' | 'completed';
const PROD_LABEL: Record<ProdStatus, string> = { awaiting: 'Awaiting Production', inprod: 'In Production', completed: 'Completed' };
const PROD_TONE: Record<ProdStatus, string> = {
  awaiting: 'bg-slate-100 text-slate-600',
  inprod: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
};

// Lifecycle order for the stage breakdown strip
const STAGE_ORDER: string[] = [
  PieceStatus.PENDING_CUT, PieceStatus.CUT, PieceStatus.SERVICE_PENDING, PieceStatus.QC_PENDING, PieceStatus.QC_FAILED,
  PieceStatus.QC_PASSED, PieceStatus.READY_TO_DISPATCH, PieceStatus.DISPATCHED, PieceStatus.TEMPERED,
  PieceStatus.RECEIVED_FROM_TEMPERING, PieceStatus.DELIVERED, PieceStatus.RETURNED, PieceStatus.BROKEN, PieceStatus.HOLD,
];

interface JobOrderRow {
  order: Quotation;
  clientName: string;
  totalPieces: number;
  delivered: number;
  broken: number;
  pendingCut: number;
  cutByBreakdown: { name: string; count: number }[];
  reassignedFrom: string[];
  progress: number;
  sqft: number;
  value: number;
  prodStatus: ProdStatus;
  stages: { status: string; count: number }[];
  overdue: boolean;
}

const orderValue = (o: Quotation): number => (o.items || []).reduce((s, i) => s + (i.amount || 0), 0);
const orderSqft = (o: Quotation): number => (o.items || []).reduce((s, i) => s + (i.totalSqFt || 0), 0);
const JOB_STATUSES = new Set(['Approved', 'Invoiced', 'Partial Payment', 'Paid']);

const PAGE_SIZE = 25;

const JobOrders: React.FC = () => {
  const user = useAuthStore(s => s.user);
  const company = (useAppStore(s => s.selectedCompany) as string) || 'Glassco';

  const [pieces, setPieces] = useState<ProductionPiece[]>([]);
  const [orders, setOrders] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<'all' | ProdStatus>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hrCutters, setHrCutters] = useState<string[]>([]);
  const [savingCutter, setSavingCutter] = useState<string | null>(null);

  // Load via the async sales API (cloud + cache, scoped to the active company).
  // The sync SalesService.getQuotations() only reads the localStorage cache,
  // which is empty on a fresh route and showed no orders. Mirrors the Workbench.
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ords, clis, pcs] = await Promise.all([
        AsyncSalesService.getQuotations(),
        AsyncSalesService.getClients(),
        // No-arg: pieces have no reliable company column (scoped by GLS orderId);
        // passing a company can return 0 from cloud and fall back to empty cache.
        ProductionService.getProductionPiecesAsync(),
      ]);
      setOrders(ords || []);
      setClients(clis || []);
      setPieces(pcs || []);
    } catch {
      try { setOrders(SalesService.getQuotations()); } catch { setOrders([]); }
      try { setClients(SalesService.getClients()); } catch { setClients([]); }
      try { setPieces(ProductionService.getProductionPieces()); } catch { setPieces([]); }
    }
    setLoading(false);
  }, [company]);

  useEffect(() => { refresh(); }, [refresh, tick]);

  // Cutter dropdown sourced from HR: active employees TAGGED "Cutter" or
  // "Senior Cutter" (job-title tag), with a legacy designation fallback. The
  // name matches the cutter's login full name used by the Cut Queue. Shared
  // helper so JobOrders + Cutter Workbench resolve the same roster.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await HRService.loadCache();
        if (!alive) return;
        setHrCutters(HRService.getCutterNames(company));
      } catch { /* leave empty — assignment select still shows existing cutters */ }
    })();
    return () => { alive = false; };
  }, [company]);

  // orderId → pieces (a piece links by order.orderNo or order.id)
  const piecesByOrderKey = useMemo(() => {
    const m = new Map<string, ProductionPiece[]>();
    for (const p of pieces) {
      const k = p.orderId;
      if (!k) continue;
      const arr = m.get(k) || [];
      arr.push(p);
      m.set(k, arr);
    }
    return m;
  }, [pieces]);

  const rows = useMemo<JobOrderRow[]>(() => {
    const clientName = (id: string): string => clients.find(c => c.id === id)?.name || '—';
    const out: JobOrderRow[] = [];
    for (const order of orders) {
      const own = [...(piecesByOrderKey.get(order.orderNo || '') || []), ...(piecesByOrderKey.get(order.id) || [])];
      // A job order = a confirmed order, a converted sales order (has orderNo),
      // or any order that already has pieces on the floor.
      if (!JOB_STATUSES.has(order.status) && own.length === 0 && !order.orderNo) continue;

      const totalPieces = own.length;
      const delivered = own.filter(p => p.status === PieceStatus.DELIVERED).length;
      const broken = own.filter(p => p.status === PieceStatus.BROKEN).length;
      const pendingCut = own.filter(p => p.status === PieceStatus.PENDING_CUT).length;
      // Partial-cut attribution: who actually cut how many pieces of this order.
      // Cutting is per-piece (cutBy), so one order can be split across cutters or
      // left partly cut — this surfaces that without any schema change.
      const cutByMap = new Map<string, number>();
      own.forEach(p => { if (p.cutBy) cutByMap.set(p.cutBy, (cutByMap.get(p.cutBy) || 0) + 1); });
      const cutByBreakdown = [...cutByMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      // D2 — cutters this job was reassigned away from (per-piece prevCutters).
      const prevSet = new Set<string>();
      own.forEach(p => (p.prevCutters || []).forEach(c => c && prevSet.add(c)));
      const reassignedFrom = [...prevSet];
      const prodStatus: ProdStatus = totalPieces === 0 ? 'awaiting' : delivered === totalPieces ? 'completed' : 'inprod';
      const counts = new Map<string, number>();
      own.forEach(p => counts.set(p.status, (counts.get(p.status) || 0) + 1));
      const stages = STAGE_ORDER.filter(s => (counts.get(s) || 0) > 0).map(s => ({ status: s, count: counts.get(s) || 0 }));
      const overdue = !!order.dueDate && new Date(order.dueDate).getTime() < Date.now() && prodStatus !== 'completed';

      out.push({
        order, clientName: clientName(order.clientId), totalPieces, delivered, broken, pendingCut, cutByBreakdown, reassignedFrom,
        progress: totalPieces > 0 ? Math.round((delivered / totalPieces) * 100) : 0,
        sqft: orderSqft(order), value: orderValue(order), prodStatus, stages, overdue,
      });
    }
    return out.sort((a, b) => new Date(b.order.date).getTime() - new Date(a.order.date).getTime());
  }, [orders, clients, piecesByOrderKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (filter !== 'all' && r.prodStatus !== filter) return false;
      if (!q) return true;
      return (r.order.orderNo || '').toLowerCase().includes(q)
        || (r.order.manualSerial || '').toLowerCase().includes(q)
        || r.clientName.toLowerCase().includes(q)
        || (r.order.projectName || '').toLowerCase().includes(q);
    });
  }, [rows, filter, query]);

  useEffect(() => { setPage(1); }, [filter, query]);
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > maxPage) setPage(maxPage);
  }, [filtered.length, page]);
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const counts = useMemo(() => ({
    total: rows.length,
    awaiting: rows.filter(r => r.prodStatus === 'awaiting').length,
    inprod: rows.filter(r => r.prodStatus === 'inprod').length,
    completed: rows.filter(r => r.prodStatus === 'completed').length,
    pieces: rows.reduce((s, r) => s + r.totalPieces, 0),
  }), [rows]);

  const toggle = (id: string): void => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Dropdown options: HR cutters + any cutter already assigned/recorded.
  const cutterOptions = useMemo(() => {
    const set = new Set<string>(hrCutters);
    orders.forEach(o => o.assignedCutter && set.add(o.assignedCutter));
    pieces.forEach(p => p.cutBy && set.add(p.cutBy));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [hrCutters, orders, pieces]);

  const assignCutter = async (order: Quotation, name: string): Promise<void> => {
    const from = order.assignedCutter;
    if (name === (from || '')) return;                       // no change

    // ── Reassign path (D2): an existing cutter → a different cutter. Move only
    //    the remaining un-cut pool to the new cutter; already-cut pieces keep
    //    their cutBy credit so the previous cutter's work stays theirs. ──
    if (from && name) {
      const own = [...(piecesByOrderKey.get(order.orderNo || '') || []), ...(piecesByOrderKey.get(order.id) || [])];
      const remaining = own.filter(p => p.status === PieceStatus.PENDING_CUT);
      const cutCount = own.filter(p => !!p.cutBy).length;
      const ok = await confirmModal(
        `Reassign this job from ${from} to ${name}?\n\n` +
        `${remaining.length} remaining un-cut piece(s) will move to ${name}.\n` +
        (cutCount > 0
          ? `${cutCount} already-cut piece(s) stay credited to their original cutter(s).`
          : `No pieces have been cut yet — the whole job moves.`)
      );
      if (!ok) return;

      setSavingCutter(order.id);
      const actor = useAuthStore.getState().profile?.email
                  ?? useAuthStore.getState().user?.email
                  ?? 'supervisor';
      try {
        const updated: Quotation = { ...order, assignedCutter: name };
        await AsyncSalesService.saveQuotations([updated]);
        let movedNote = '';
        if (remaining.length > 0) {
          const { moved, failed } = await ProductionService.reassignRemainingPieces(remaining, from, name, actor);
          movedNote = ` · ${moved} piece(s) moved${failed ? `, ${failed} failed` : ''}`;
        }
        setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
        // Optimistic per-piece mirror so the history chip appears without a refresh flash.
        if (remaining.length > 0) {
          const movedIds = new Set(remaining.map(p => p.id));
          setPieces(prev => prev.map(p => {
            if (!movedIds.has(p.id)) return p;
            const prevC = p.prevCutters || [];
            const withOld = prevC[prevC.length - 1] !== from ? [...prevC, from] : prevC;
            return { ...p, assignedCutter: name, prevCutters: withOld };
          }));
        }
        toast.success(`Job reassigned to ${name}${movedNote}`);
      } catch {
        toast.error('Could not reassign the job');
      }
      setSavingCutter(null);
      return;
    }

    // ── First-assign / unassign: job-level only (unchanged behaviour). ──
    setSavingCutter(order.id);
    const updated: Quotation = { ...order, assignedCutter: name || undefined };
    try {
      await AsyncSalesService.saveQuotations([updated]);
      setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
      toast.success(name ? `Job assigned to ${name}` : 'Cutter unassigned');
    } catch {
      toast.error('Could not save cutter assignment');
    }
    setSavingCutter(null);
  };

  if (!user) return <Navigate to="/" replace />;

  return (
    <div className="space-y-5 p-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-700 to-indigo-700 text-white rounded-card p-6 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList size={24} />
          <div>
            <h1 className="text-xl font-black uppercase">Job Orders</h1>
            <p className="text-2xs text-blue-100 font-bold uppercase tracking-widest mt-0.5">Confirmed orders &amp; live production progress</p>
          </div>
        </div>
        <button onClick={() => setTick(x => x + 1)} className="bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-control text-xs font-black uppercase flex items-center gap-2">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* KPI strip */}
      <KpiRow>
        <KpiTile label="Job Orders" value={counts.total} tone="info" icon={<ClipboardList size={16} />} />
        <KpiTile label="In Production" value={counts.inprod} tone="info" icon={<Loader2 size={16} />} />
        <KpiTile label="Awaiting" value={counts.awaiting} tone="warning" icon={<Package size={16} />} />
        <KpiTile label="Completed" value={counts.completed} tone="success" icon={<CheckCircle2 size={16} />} />
        <KpiTile label="Pieces Tracked" value={counts.pieces} tone="neutral" icon={<FileText size={16} />} />
      </KpiRow>

      {/* Filter + search */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { id: 'all', label: `All (${counts.total})` },
          { id: 'inprod', label: `In Production (${counts.inprod})` },
          { id: 'awaiting', label: `Awaiting (${counts.awaiting})` },
          { id: 'completed', label: `Completed (${counts.completed})` },
        ] as const).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-control text-xs font-black uppercase transition-colors ${filter === f.id ? 'bg-slate-900 text-white' : 'bg-white border-2 border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {f.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search order / client / project"
            className="sap-input pl-9 pr-3 py-2 text-xs w-64 rounded-control border border-slate-200" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-card border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-2xs font-black uppercase text-slate-400 tracking-widest border-b">
              <tr>
                <th className="px-3 py-2 w-8" />
                <th className="px-3 py-2">Order #</th>
                <th className="px-3 py-2">Client / Project</th>
                <th className="px-3 py-2">Order Date</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 w-44">Production Progress</th>
                <th className="px-3 py-2 text-right">SqFt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400"><Loader2 size={18} className="animate-spin inline mr-2" /> Loading job orders…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="p-0">
                  <EmptyState icon={<ClipboardList size={22} />} title="No job orders" description="Confirmed orders will appear here as they are approved and sent to production." />
                </td></tr>
              )}
              {!loading && paged.map(r => {
                const isOpen = expanded.has(r.order.id);
                const ref = r.order.orderNo || r.order.manualSerial || r.order.id;
                return (
                  <React.Fragment key={r.order.id}>
                    <tr className={`hover:bg-slate-50 cursor-pointer ${isOpen ? 'bg-slate-50' : ''}`} onClick={() => toggle(r.order.id)}>
                      <td className="px-3 py-2 text-slate-400">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                      <td className="px-3 py-2 font-mono font-black text-slate-800">{ref}</td>
                      <td className="px-3 py-2">
                        <p className="font-bold text-slate-700 truncate max-w-[14rem]">{r.clientName}</p>
                        {r.order.projectName && <p className="text-2xs text-slate-400 font-bold uppercase truncate max-w-[14rem]">{r.order.projectName}</p>}
                        {r.order.assignedCutter && <p className="text-2xs text-indigo-600 font-bold truncate max-w-[14rem] inline-flex items-center gap-1"><Scissors size={10} /> {r.order.assignedCutter}</p>}
                      </td>
                      <td className="px-3 py-2 text-slate-500 font-bold">{formatDate(r.order.date)}</td>
                      <td className={`px-3 py-2 font-bold ${r.overdue ? 'text-rose-600' : 'text-slate-500'}`}>{r.order.dueDate ? formatDate(r.order.dueDate) : '—'}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.order.status} size="sm" /></td>
                      <td className="px-3 py-2">
                        {r.totalPieces === 0 ? (
                          <span className={`text-2xs font-black px-2 py-0.5 rounded uppercase ${PROD_TONE[r.prodStatus]}`}>{PROD_LABEL[r.prodStatus]}</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden min-w-[4rem]">
                              <div className={`h-full ${r.prodStatus === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${r.progress}%` }} />
                            </div>
                            <span className="text-2xs font-black text-slate-600 tabular-nums">{r.delivered}/{r.totalPieces}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-600 tabular-nums">{formatNumber(r.sqft)}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/70">
                        <td />
                        <td colSpan={7} className="px-3 pb-4 pt-1">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-2xs mb-3">
                            <Detail label="Architect" value={r.order.architect} />
                            <Detail label="Site" value={r.order.site} />
                            <Detail label="Subject" value={r.order.subject} />
                            <Detail label="Line Items" value={String((r.order.items || []).length)} />
                            <Detail label="Production" value={PROD_LABEL[r.prodStatus]} />
                            <Detail label="Delivered" value={r.totalPieces ? `${r.delivered} / ${r.totalPieces} pieces` : 'No pieces yet'} />
                            {r.broken > 0 && <Detail label="Broken" value={`${r.broken} pieces`} tone="danger" />}
                            {r.order.actualDeliveryDate && <Detail label="Delivered On" value={formatDate(r.order.actualDeliveryDate)} />}
                            {r.order.delayReason && <Detail label="Delay" value={`${r.order.delayCategory || ''} ${r.order.delayReason}`.trim()} tone="warning" />}
                          </div>
                          <p className="text-2xs font-bold text-slate-400 mb-3 inline-flex items-center gap-1">
                            <Scissors size={11} /> Cutter assignment is done by the Cutting Supervisor.
                          </p>
                          {/* Partial-cut provision: a cutter may cut only part of an order.
                              Cutting is per-piece, so this shows who cut how many and how many
                              remain — reassign above to hand the remaining pool to another cutter
                              (already-cut pieces keep their original cutter). */}
                          {(r.cutByBreakdown.length > 0 || (r.totalPieces > 0 && r.pendingCut > 0)) && (
                            <div className="mb-3">
                              <p className="text-2xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Cutting Progress <span className="text-slate-300">(partial allowed)</span></p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {r.cutByBreakdown.map(c => (
                                  <span key={c.name} className="text-2xs font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                                    <Scissors size={10} /> {c.name} ×{c.count}
                                  </span>
                                ))}
                                {r.pendingCut > 0 && (
                                  <span className="text-2xs font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{r.pendingCut} still to cut</span>
                                )}
                                {r.cutByBreakdown.length === 0 && r.pendingCut > 0 && (
                                  <span className="text-2xs font-bold text-slate-400">not started</span>
                                )}
                              </div>
                            </div>
                          )}
                          {r.stages.length > 0 ? (
                            <div>
                              <p className="text-2xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Pieces by Stage</p>
                              <div className="flex flex-wrap gap-1.5">
                                {r.stages.map(s => (
                                  <span key={s.status} className="inline-flex items-center gap-1">
                                    <StatusBadge status={s.status} size="sm" />
                                    <span className="text-2xs font-black text-slate-500 tabular-nums">×{s.count}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-2xs text-slate-400 font-bold">No production pieces created for this order yet.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination totalItems={filtered.length} itemsPerPage={PAGE_SIZE} currentPage={page} onPageChange={setPage} />
      </div>
    </div>
  );
};

const Detail: React.FC<{ label: string; value?: string; tone?: 'danger' | 'warning' }> = ({ label, value, tone }) => (
  <div>
    <p className="text-2xs font-black uppercase tracking-widest text-slate-400">{label}</p>
    <p className={`font-bold ${tone === 'danger' ? 'text-rose-600' : tone === 'warning' ? 'text-amber-700' : 'text-slate-700'}`}>{value || '—'}</p>
  </div>
);

export default JobOrders;
