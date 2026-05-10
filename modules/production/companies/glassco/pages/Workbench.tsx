/**
 * Workbench — Sprint 15 (foundation)
 *
 * Single page replacing the 19 production tabs + 12 sub-tabs for daily
 * piece-level work. Layout:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  🔍 Search   [Job▾] [Date▾] [Mm▾] [Vendor▾] [Status▾]  [⊞⊟]│  ← Sticky
 *   ├──────────┬──────────────────────────────────────────────────┤
 *   │ LENSES   │  CONTENT (List | Grid | Kanban-stub)             │
 *   │ • Today  │                                                  │
 *   │ • My     │                                                  │
 *   │ • Hold   │                                                  │
 *   │ • NCR    │                                                  │
 *   │ • PSG    │                                                  │
 *   └──────────┴──────────────────────────────────────────────────┘
 *
 * URL state:
 *   /#/production/workbench?q=GLS&job=O-123&date=today&mm=6&lens=hold&view=list
 *
 * Sprint 15 ships: List + Grid views.
 * Sprint 16     ships: Kanban + drag-drop.
 * Sprint 17     ships: slide-in detail panel.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { ProductionProvider, useProductionContext } from '@/modules/production/components/ProductionContext';
import { useAuthStore } from '@/modules/auth/authStore';
import PieceStatusBadge   from '@/modules/production/components/sub/PieceStatusBadge';
import VirtualPieceGrid   from '@/modules/production/components/sub/VirtualPieceGrid';
import { Search as SearchIcon, RefreshCw, Package, MapPin, Construction } from 'lucide-react';
import SearchBar    from '../components/workbench/SearchBar';
import FilterChips, { WorkbenchFilters, DEFAULT_FILTERS } from '../components/workbench/FilterChips';
import ViewToggle, { WorkbenchView } from '../components/workbench/ViewToggle';
import LensesSidebar, { LensId, LENS_PREDICATES, LENSES } from '../components/workbench/LensesSidebar';
import type { ProductionPiece } from '@/modules/shared/types';

// ── Allowed roles ─────────────────────────────────────────────────────

const ALLOWED = new Set<string>([
  'super_admin', 'owner', 'hassan',
  'factory_manager', 'glassco_supervisor', 'glassco_admin',
  'glassco_production', 'dispatch_staff',
]);

// ── Helpers ───────────────────────────────────────────────────────────

function dateMatchesRange(iso: string | undefined, range: string): boolean {
  if (!iso) return range === 'all';
  if (range === 'all') return true;
  const t   = new Date(iso).getTime();
  const now = Date.now();
  switch (range) {
    case 'today': {
      const start = new Date(); start.setHours(0,0,0,0);
      return t >= start.getTime();
    }
    case 'week':  return now - t <= 7  * 86_400_000;
    case 'month': return now - t <= 30 * 86_400_000;
    default:      return true;
  }
}

function extractMm(piece: ProductionPiece, items: Array<{ glassSize?: string; thickness?: string }>): string {
  const item = items[piece.itemIndex];
  if (!item) return '';
  return String(item.glassSize || item.thickness || '').replace(/[^0-9.]/g, '') || '';
}

// ── URL ↔ filter sync ────────────────────────────────────────────────

function paramsToFilters(p: URLSearchParams): WorkbenchFilters {
  return {
    job:    p.get('job')    || 'all',
    date:   p.get('date')   || 'all',
    mm:     p.get('mm')     || 'all',
    vendor: p.get('vendor') || 'all',
    status: p.get('status') || 'all',
  };
}

function filtersToParams(f: WorkbenchFilters, q: string, lens: LensId, view: WorkbenchView): URLSearchParams {
  const p = new URLSearchParams();
  if (q.trim()) p.set('q', q.trim());
  if (lens !== 'all')      p.set('lens', lens);
  if (view !== 'list')     p.set('view', view);
  if (f.job    !== 'all')  p.set('job',    f.job);
  if (f.date   !== 'all')  p.set('date',   f.date);
  if (f.mm     !== 'all')  p.set('mm',     f.mm);
  if (f.vendor !== 'all')  p.set('vendor', f.vendor);
  if (f.status !== 'all')  p.set('status', f.status);
  return p;
}

// ── Inner content (uses ProductionContext) ───────────────────────────

const WorkbenchContent: React.FC = () => {
  const { user, profile } = useAuthStore();
  const { pieces, jobOrders, dispatches } = useProductionContext();
  const [params, setParams] = useSearchParams();

  // ── State, hydrated from URL on mount ──────────────────────────
  const [query,    setQuery]    = useState<string>(params.get('q')   ?? '');
  const [lens,     setLens]     = useState<LensId>((params.get('lens') as LensId) || 'all');
  const [view,     setView]     = useState<WorkbenchView>((params.get('view') as WorkbenchView) || 'list');
  const [filters,  setFilters]  = useState<WorkbenchFilters>(paramsToFilters(params));

  // ── Reflect state back to URL (shareable links) ───────────────
  useEffect(() => {
    const next = filtersToParams(filters, query, lens, view);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, lens, view, filters]);

  // ── Derived option lists ───────────────────────────────────────
  const jobOptions = useMemo(() =>
    jobOrders
      .map(j => ({ value: String(j.orderNo || j.id), label: String(j.orderNo || j.id) }))
      .slice(0, 50),
    [jobOrders],
  );

  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    dispatches.forEach(d => d.plantName && set.add(d.plantName));
    return Array.from(set).map(v => ({ value: v, label: v }));
  }, [dispatches]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    pieces.forEach(p => set.add(p.status));
    return Array.from(set).sort().map(s => ({ value: s, label: s }));
  }, [pieces]);

  // ── My-jobs context (jobs in active states) ────────────────────
  const myOrderIds = useMemo(() => {
    if (!user) return [];
    return jobOrders.map(j => String(j.orderNo || j.id));
  }, [user, jobOrders]);

  // ── Apply lens + filters + search ─────────────────────────────
  const visiblePieces = useMemo(() => {
    const lensFn = LENS_PREDICATES[lens];
    const q      = query.trim().toLowerCase();

    return pieces.filter(p => {
      if (!lensFn(p, { myOrderIds })) return false;

      if (filters.job    !== 'all' && p.orderId !== filters.job)    return false;
      if (filters.status !== 'all' && p.status  !== filters.status) return false;
      if (filters.date   !== 'all' && !dateMatchesRange(p.lastUpdated, filters.date)) return false;

      if (filters.mm !== 'all') {
        const order = jobOrders.find(j => j.orderNo === p.orderId || j.id === p.orderId);
        const mm    = extractMm(p, (order?.items as Array<{ glassSize?: string; thickness?: string }>) ?? []);
        if (mm !== filters.mm) return false;
      }

      if (filters.vendor !== 'all') {
        const d = dispatches.find(x => x.id === p.dispatchId);
        if (!d || d.plantName !== filters.vendor) return false;
      }

      if (q) {
        const hay = `${p.id} ${p.orderId} ${p.specs ?? ''} ${p.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pieces, lens, filters, query, jobOrders, dispatches, myOrderIds]);

  // ── Lens count badges (after filters + search, NOT after lens) ─
  const lensCounts = useMemo(() => {
    const counts: Partial<Record<LensId, number>> = {};
    LENSES.forEach(l => {
      counts[l.id] = pieces.filter(p => LENS_PREDICATES[l.id](p, { myOrderIds })).length;
    });
    return counts;
  }, [pieces, myOrderIds]);

  // ── Reset all filters ──────────────────────────────────────────
  const resetAll = () => {
    setQuery('');
    setLens('all');
    setFilters(DEFAULT_FILTERS);
  };

  const isFiltered =
    query.trim() !== ''
    || lens !== 'all'
    || Object.values(filters).some(v => v !== 'all');

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Sticky header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px] max-w-md">
            <SearchBar value={query} onChange={setQuery}/>
          </div>
          <FilterChips
            filters={filters}
            onChange={setFilters}
            jobOptions={jobOptions}
            vendorOptions={vendorOptions}
            statusOptions={statusOptions}
          />
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-400">
              <span className="font-bold text-slate-700">{visiblePieces.length}</span>
              {' / '}
              {pieces.length} pieces
            </span>
            <ViewToggle value={view} onChange={setView}/>
          </div>
        </div>
        <div className="px-4 pb-2 text-[10px] text-slate-400 flex items-center gap-2">
          <span className="hidden sm:inline">Tip:</span>
          <kbd className="bg-slate-100 px-1.5 rounded font-mono">⌘K</kbd>
          <span>to focus search</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <LensesSidebar
          activeLens={lens}
          onChange={setLens}
          counts={lensCounts}
          className="w-44 shrink-0 overflow-y-auto"
        />

        <main className="flex-1 overflow-y-auto p-4">
          {visiblePieces.length === 0 ? (
            <EmptyState onReset={resetAll} hasFilters={isFiltered}/>
          ) : view === 'kanban' ? (
            <KanbanStub count={visiblePieces.length}/>
          ) : view === 'grid' ? (
            <GridView pieces={visiblePieces} jobOrders={jobOrders} dispatches={dispatches}/>
          ) : (
            <ListView pieces={visiblePieces} jobOrders={jobOrders} dispatches={dispatches}/>
          )}
        </main>
      </div>
    </div>
  );
};

// ── List view ────────────────────────────────────────────────────────

interface ViewProps {
  pieces:     ProductionPiece[];
  jobOrders:  Array<{ id: string; orderNo?: string; clientName?: string; items?: Array<{ glassSize?: string; thickness?: string }> }>;
  dispatches: Array<{ id: string; plantName?: string }>;
}

const ListView: React.FC<ViewProps> = ({ pieces, jobOrders, dispatches }) => (
  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
        <tr>
          <th className="px-3 py-2 text-left">Piece</th>
          <th className="px-3 py-2 text-left">Job</th>
          <th className="px-3 py-2 text-left">Specs</th>
          <th className="px-3 py-2 text-left">Status</th>
          <th className="px-3 py-2 text-left">Vendor</th>
          <th className="px-3 py-2 text-right">Updated</th>
        </tr>
      </thead>
      <tbody>
        {pieces.slice(0, 500).map(p => {
          const order = jobOrders.find(j => j.orderNo === p.orderId || j.id === p.orderId);
          const dispatch = dispatches.find(d => d.id === p.dispatchId);
          return (
            <tr key={p.id} className="border-t border-slate-100 hover:bg-blue-50/30">
              <td className="px-3 py-2 font-mono font-bold text-blue-700">{p.id}</td>
              <td className="px-3 py-2 text-slate-600">{p.orderId}</td>
              <td className="px-3 py-2 text-slate-500 text-xs">{p.specs}</td>
              <td className="px-3 py-2"><PieceStatusBadge status={p.status} size="xs"/></td>
              <td className="px-3 py-2 text-xs text-slate-500">{dispatch?.plantName || '—'}</td>
              <td className="px-3 py-2 text-right text-xs text-slate-400">
                {p.lastUpdated ? new Date(p.lastUpdated).toLocaleDateString() : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    {pieces.length > 500 && (
      <div className="px-3 py-2 bg-amber-50 text-xs text-amber-700 border-t border-amber-200">
        Showing first 500 of {pieces.length} — narrow filters to see more.
      </div>
    )}
  </div>
);

// ── Grid view ────────────────────────────────────────────────────────

const GridView: React.FC<ViewProps> = ({ pieces, jobOrders }) => (
  <VirtualPieceGrid
    items={pieces}
    getKey={p => p.id}
    rowHeight={140}
    threshold={50}
    cellRenderer={(p) => {
      const order = jobOrders.find(j => j.orderNo === p.orderId || j.id === p.orderId);
      return (
        <div
          key={p.id}
          className="bg-white rounded-lg border border-slate-200 p-3 hover:border-blue-300 transition-colors h-full flex flex-col"
        >
          <div className="flex items-start justify-between mb-2">
            <span className="font-mono font-black text-xs text-blue-700">{p.id}</span>
            <PieceStatusBadge status={p.status} size="xs"/>
          </div>
          <div className="text-xs text-slate-500 leading-tight mb-1">{p.specs}</div>
          <div className="text-[10px] text-slate-400 mt-auto flex items-center gap-2">
            <Package size={10}/>{p.orderId}
            {p.spotId && <><MapPin size={10}/>{p.spotId}</>}
          </div>
        </div>
      );
    }}
  />
);

// ── Kanban stub (Sprint 16 fills this) ──────────────────────────────

const KanbanStub: React.FC<{ count: number }> = ({ count }) => (
  <div className="bg-white rounded-xl border-2 border-dashed border-slate-300 p-12 text-center max-w-2xl mx-auto">
    <Construction className="text-slate-400 mx-auto mb-3" size={40}/>
    <h3 className="text-base font-black text-slate-700 mb-1">Kanban — coming in Sprint 16</h3>
    <p className="text-sm text-slate-500 max-w-md mx-auto">
      {count} pieces match the current filter. Drag-drop board with state-machine validation
      (atomic transitions, bulk select, realtime sync) lands next sprint.
      Use List or Grid for now.
    </p>
  </div>
);

// ── Empty state ──────────────────────────────────────────────────────

const EmptyState: React.FC<{ onReset: () => void; hasFilters: boolean }> = ({ onReset, hasFilters }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <SearchIcon className="text-slate-300 mb-3" size={48}/>
    <h3 className="text-base font-black text-slate-700 mb-1">
      {hasFilters ? 'No pieces match' : 'No pieces yet'}
    </h3>
    <p className="text-sm text-slate-500 mb-4 max-w-sm">
      {hasFilters
        ? 'Try clearing filters or pick a different lens to see more pieces.'
        : 'Cut some pieces from a sales order to see them on the workbench.'}
    </p>
    {hasFilters && (
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm"
      >
        <RefreshCw size={14}/> Reset filters
      </button>
    )}
  </div>
);

// ── Outer page (role gate + provider) ────────────────────────────────

const Workbench: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/" replace/>;
  if (!ALLOWED.has(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-xl shadow border border-slate-200 p-8 max-w-sm text-center">
          <h2 className="text-lg font-black text-slate-800 mb-2">Restricted</h2>
          <p className="text-sm text-slate-500">
            The Production Workbench is only available to production roles.
            Your role: <span className="font-mono font-bold">{user.role}</span>
          </p>
        </div>
      </div>
    );
  }
  return (
    <ProductionProvider company="Glassco">
      <WorkbenchContent />
    </ProductionProvider>
  );
};

export default Workbench;
