/**
 * DispatchWorkbench — Sprint 18
 *
 * Single-page dispatch app for `dispatch_staff` role. No sidebar, no
 * tabs — just Ready-to-Dispatch pieces + bulk-load to truck.
 *
 *   Filter: Ready to Dispatch | Today
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ ☐ Select all      [Bulk: Load to Truck (N)]   [Print Slip] │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ ☐ GLS-PC-153   GT-SO-001 (DHA)              4 mm Plain    │
 *   │ ☐ GLS-PC-154   GT-SO-001 (DHA)              4 mm Plain    │
 *   │ ☐ GLS-PC-155   GT-SO-002 (Bahria)           6 mm Tinted   │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Bulk action wires to existing load_pieces_to_dispatch_atomic RPC
 * (Sprint 5 — atomic per-piece SELECT FOR UPDATE).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { ProductionProvider, useProductionContext } from '@/modules/production/components/ProductionContext';
import { useAuthStore } from '@/modules/auth/authStore';
import { BulkActionBar, useBulkSelection } from '@/modules/production/components/sub/BulkActionBar';
import { supabase } from '@/src/services/supabaseClient';
import {
  Truck, Printer, ScanLine, LogOut, Loader2, Search as SearchIcon, RefreshCw,
} from 'lucide-react';
import { PieceStatus } from '@/modules/shared/constants';
import type { ProductionPiece } from '@/modules/shared/types';

// ── Allowed roles for this mini-app ────────────────────────────────────
const ALLOWED = new Set<string>([
  'dispatch_staff', 'glassco_supervisor', 'super_admin', 'hassan',
  'factory_manager', 'glassco_admin',
]);

// ── Inner content (uses ProductionContext) ─────────────────────────────

const DispatchContent: React.FC = () => {
  const { user, signOut } = useAuthStore();
  const { pieces, jobOrders, dispatches, refreshData } = useProductionContext();
  const bulk = useBulkSelection<string>();

  const [query,    setQuery]    = useState('');
  const [scope,    setScope]    = useState<'ready' | 'today'>('ready');
  const [busy,     setBusy]     = useState(false);

  // ── Filter pieces ──────────────────────────────────────────────
  const visiblePieces = useMemo(() => {
    const q = query.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);

    return pieces
      .filter(p => {
        if (scope === 'ready') {
          if (p.status !== PieceStatus.READY_TO_DISPATCH) return false;
        } else {
          // today: any piece updated today, regardless of status
          if (!p.lastUpdated || p.lastUpdated.slice(0, 10) !== today) return false;
        }
        if (q) {
          const hay = `${p.id} ${p.orderId} ${p.specs ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.orderId.localeCompare(b.orderId));
  }, [pieces, scope, query]);

  // Group by job for visual scanning
  const grouped = useMemo(() => {
    const m = new Map<string, ProductionPiece[]>();
    visiblePieces.forEach(p => {
      if (!m.has(p.orderId)) m.set(p.orderId, []);
      m.get(p.orderId)!.push(p);
    });
    return m;
  }, [visiblePieces]);

  // ── Bulk action: load to truck (Sprint 5 atomic RPC) ──────────
  const loadToTruck = async () => {
    if (bulk.count === 0) return;

    // Find an active dispatch the user can attach to (any non-final status)
    const candidate = dispatches.find(d => {
      const s = String(d.status);
      return s === 'Draft' || s === 'Scheduled' || s === 'Loading' || s === 'Ready to Dispatch';
    });
    if (!candidate) {
      toast.error('No active dispatch found. Create a trip in Logistics → Dispatch Planner first.', {
        duration: 8000,
      });
      return;
    }

    if (!confirm(
      `Load ${bulk.count} piece${bulk.count === 1 ? '' : 's'} onto trip ${candidate.id}?\n\n` +
      `Vehicle: ${candidate.vehicleNo}\n` +
      `Vendor: ${candidate.plantName}`,
    )) return;

    setBusy(true);
    try {
      const { error } = await supabase.rpc('load_pieces_to_dispatch_atomic', {
        p_dispatch_id: candidate.id,
        p_piece_ids:   Array.from(bulk.selected),
      });
      if (error) {
        toast.error(`Load failed: ${error.message}`, { duration: 9000 });
        return;
      }
      toast.success(`Loaded ${bulk.count} pieces onto ${candidate.id}`);
      bulk.clear();
      refreshData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Load failed: ${msg}`, { duration: 9000 });
    } finally {
      setBusy(false);
    }
  };

  // ── Print dispatch slip ───────────────────────────────────────
  const printSlip = () => {
    const ids = bulk.count > 0 ? Array.from(bulk.selected) : visiblePieces.map(p => p.id);
    if (ids.length === 0) {
      toast.error('Nothing to print');
      return;
    }
    const w = window.open('', '_blank', 'width=700,height=900');
    if (!w) { toast.error('Popup blocked — allow popups to print'); return; }

    const today = new Date().toLocaleDateString();
    const rows = ids.map(id => {
      const p = pieces.find(x => x.id === id);
      if (!p) return '';
      const order = jobOrders.find(j => j.orderNo === p.orderId || j.id === p.orderId);
      const item  = order?.items?.[p.itemIndex] as { glassType?: string; glassSize?: string } | undefined;
      return `<tr>
        <td>${p.id}</td>
        <td>${p.orderId}</td>
        <td>${(order as { clientName?: string })?.clientName ?? ''}</td>
        <td>${item?.glassType ?? ''} ${item?.glassSize ?? ''}</td>
        <td>${p.specs ?? ''}</td>
      </tr>`;
    }).join('');

    w.document.write(`<!doctype html><html><head><title>Dispatch Slip ${today}</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 24px; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #f1f5f9; text-align: left; padding: 6px 8px; border-bottom: 2px solid #cbd5e1; }
        td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace; }
        tr:nth-child(even) td { background: #f8fafc; }
        .sig { margin-top: 40px; display: flex; gap: 60px; }
        .sig div { flex: 1; border-top: 1px solid #333; padding-top: 6px; font-size: 11px; color: #666; }
      </style></head><body>
      <h1>GlassTech Dispatch Slip</h1>
      <div class="meta">${today} · ${ids.length} piece${ids.length === 1 ? '' : 's'} · prepared by ${user?.fullName ?? user?.email ?? ''}</div>
      <table>
        <thead><tr><th>Piece</th><th>Order</th><th>Client</th><th>Glass</th><th>Specs</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="sig">
        <div>Loaded by</div>
        <div>Verified by</div>
        <div>Driver signature</div>
      </div>
      <script>window.print();</script>
      </body></html>`);
    w.document.close();
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Toaster position="top-center" />

      {/* Top bar — minimal: role title + sign-out only (no nav) */}
      <header className="bg-blue-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Truck size={20}/>
          <div>
            <h1 className="text-base font-black leading-tight">Dispatch Workbench</h1>
            <p className="text-[10px] text-blue-200 leading-tight">{user?.fullName ?? user?.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { signOut(); }}
          className="text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-blue-800"
        >
          <LogOut size={12}/> Sign out
        </button>
      </header>

      {/* Filter bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-3 flex-wrap shrink-0">
        <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
          {(['ready', 'today'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-3 py-1 rounded-md text-xs font-bold ${
                scope === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              {s === 'ready' ? 'Ready to Dispatch' : 'Today'}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-sm">
          <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search piece, job…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <span className="text-xs text-slate-500">
          <strong className="text-slate-800">{visiblePieces.length}</strong> piece{visiblePieces.length === 1 ? '' : 's'}
          {' · '}
          {grouped.size} job{grouped.size === 1 ? '' : 's'}
        </span>

        <button
          type="button"
          onClick={() => refreshData()}
          className="ml-auto text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100"
        >
          <RefreshCw size={12}/> Refresh
        </button>
      </div>

      {/* Action bar */}
      <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-3 flex-wrap shrink-0">
        <button
          type="button"
          onClick={() => bulk.selectAll(visiblePieces.map(p => p.id))}
          className="text-xs font-bold text-blue-700 hover:underline"
        >
          Select all ({visiblePieces.length})
        </button>
        {bulk.count > 0 && (
          <button
            type="button"
            onClick={() => bulk.clear()}
            className="text-xs font-bold text-slate-500 hover:underline"
          >
            Clear ({bulk.count})
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => toast.info('Vehicle scan — wire to your barcode scanner input', { duration: 4000 })}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-blue-400 text-xs font-bold flex items-center gap-1.5"
          >
            <ScanLine size={12}/> Scan vehicle
          </button>
          <button
            type="button"
            onClick={printSlip}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-blue-400 text-xs font-bold flex items-center gap-1.5"
          >
            <Printer size={12}/> Print slip
          </button>
        </div>
      </div>

      {/* Content area */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {visiblePieces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-slate-500">
            <Truck size={40} className="text-slate-300 mb-2"/>
            <p className="text-sm font-bold">No pieces ready to dispatch.</p>
            <p className="text-xs text-slate-400 mt-1">QC-passed pieces will appear here automatically.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([orderId, list]) => {
              const order = jobOrders.find(j => j.orderNo === orderId || j.id === orderId);
              const allSelected = list.every(p => bulk.selected.has(p.id));
              return (
                <section key={orderId} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <header className="bg-slate-50 px-3 py-2 flex items-center justify-between border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            list.forEach(p => { if (!bulk.selected.has(p.id)) bulk.toggle(p.id); });
                          } else {
                            list.forEach(p => { if (bulk.selected.has(p.id)) bulk.toggle(p.id); });
                          }
                        }}
                        className="w-3.5 h-3.5"
                      />
                      <div>
                        <div className="text-sm font-black text-slate-800">{orderId}</div>
                        <div className="text-[10px] text-slate-500">
                          {(order as { clientName?: string })?.clientName ?? ''} · {list.length} pcs
                        </div>
                      </div>
                    </div>
                  </header>
                  <ul>
                    {list.map(p => {
                      const item = order?.items?.[p.itemIndex] as { glassType?: string; glassSize?: string } | undefined;
                      return (
                        <li
                          key={p.id}
                          className={`flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-b-0 ${
                            bulk.selected.has(p.id) ? 'bg-blue-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={bulk.selected.has(p.id)}
                            onChange={() => bulk.toggle(p.id)}
                            className="w-3.5 h-3.5"
                          />
                          <span className="font-mono font-bold text-xs text-blue-700 w-28 shrink-0">{p.id}</span>
                          <span className="text-xs text-slate-700 flex-1">
                            {item?.glassType ?? ''} {item?.glassSize ?? ''}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate max-w-xs">
                            {p.specs ?? ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Bulk action bar */}
      <BulkActionBar
        count={bulk.count}
        total={visiblePieces.length}
        actions={[
          {
            label: busy ? 'Loading…' : `Load to truck`,
            tone:  'primary',
            disabled: busy,
            icon:  busy ? <Loader2 size={12} className="animate-spin"/> : <Truck size={12}/>,
            onClick: loadToTruck,
          },
          {
            label: 'Print slip',
            tone:  'neutral',
            icon:  <Printer size={12}/>,
            onClick: printSlip,
          },
        ]}
        onClear={bulk.clear}
        onSelectAll={() => bulk.selectAll(visiblePieces.map(p => p.id))}
        noun="pieces"
      />
    </div>
  );
};

// ── Outer page (role gate + provider) ─────────────────────────────

const DispatchWorkbench: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/" replace/>;
  if (!ALLOWED.has(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-xl shadow border border-slate-200 p-8 max-w-sm text-center">
          <h2 className="text-lg font-black text-slate-800 mb-2">Restricted</h2>
          <p className="text-sm text-slate-500">
            Dispatch Workbench is only available to dispatch + supervisor roles.
          </p>
        </div>
      </div>
    );
  }
  return (
    <ProductionProvider company="Glassco">
      <DispatchContent />
    </ProductionProvider>
  );
};

export default DispatchWorkbench;
