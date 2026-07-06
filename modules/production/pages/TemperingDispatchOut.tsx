/**
 * TemperingDispatchOut — one-window tempering dispatch (Glassco).
 *
 * Flow: pool of "ready for tempering" pieces (QC-Passed, not yet on a dispatch)
 * grouped by order → operator ticks pieces order-wise (PARTIAL orders allowed) →
 * picks a tempering vendor + vehicle/driver → one Dispatch action:
 *   1. creates the TemperingDispatch (serviceType 'Tempering', frozen ratesByMm)
 *   2. atomically attaches the selected pieces (load_pieces_to_dispatch_atomic)
 *   3. creates the NON-GL "Expected Tempering Payment" commitment (Step 2)
 *   4. auto-prints the Service Order (vendor details) + offers the Gate Pass
 *
 * GL-NEUTRAL: sending our own glass out for a service posts no journal. The GL
 * fires only at pay-&-collect inward (Step 3).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { Truck, Printer, Loader2, Search as SearchIcon, RefreshCw, PackageCheck, FileText } from 'lucide-react';
import { ProductionProvider, useProductionContext } from '@/modules/production/components/ProductionContext';
import { useAuthStore } from '@/modules/auth/authStore';
import { useBulkSelection } from '@/modules/production/components/sub/BulkActionBar';
import { supabase } from '@/src/services/supabaseClient';
import { PieceStatus } from '@/modules/shared/constants';
import type { ProductionPiece, TemperingDispatch, Vendor } from '@/modules/shared/types';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { AppService } from '@/modules/shared/services/appService';
import { getVendorRatesByMm, computeTemperingCharges } from '@/modules/procurement/services/glasscoGLHelpers';
import { TemperingCommitmentService } from '@/modules/finance/services/temperingCommitmentService';
import { DispatchService } from '@/modules/procurement/services/dispatchService';
import { ServiceOrderPrint } from '@/modules/sales/components/prints/ServiceOrderPrint';
import { GatePassPrint } from '@/modules/procurement/components/prints/GatePassPrint';

const ALLOWED = new Set<string>([
  'dispatch_staff', 'glassco_supervisor', 'super_admin', 'hassan',
  'factory_manager', 'glassco_admin',
]);

interface CreatedDispatch {
  dispatch: TemperingDispatch;
  pieces: ProductionPiece[];
}

const fmtPkr = (n: number): string => 'PKR ' + Math.round(n).toLocaleString('en-PK');

const TemperingContent: React.FC = () => {
  const { pieces, jobOrders, refreshData } = useProductionContext();
  const { user } = useAuthStore();
  const bulk = useBulkSelection<string>();

  const [query, setQuery] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedDispatch | null>(null);
  const [printMode, setPrintMode] = useState<'service' | 'gate' | null>(null);

  // ── Tempering vendors ────────────────────────────────────────────
  const vendors = useMemo<Vendor[]>(
    () => SalesService.getVendors().filter(v => v.type === 'Tempering' && (!v.company || v.company === 'Glassco')),
    [],
  );
  const ratesByMm = useMemo(() => (vendorName ? getVendorRatesByMm(vendorName) : {}), [vendorName]);

  // ── Ready-for-tempering pool: QC-Passed, not already on a dispatch ─
  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pieces
      .filter(p => p.status === PieceStatus.QC_PASSED && !p.dispatchId)
      .filter(p => !q || `${p.id} ${p.orderId} ${p.specs ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.orderId.localeCompare(b.orderId));
  }, [pieces, query]);

  const grouped = useMemo(() => {
    const m = new Map<string, ProductionPiece[]>();
    pool.forEach(p => {
      if (!m.has(p.orderId)) m.set(p.orderId, []);
      m.get(p.orderId)!.push(p);
    });
    return m;
  }, [pool]);

  // ── Live cost preview for the current selection + vendor ──────────
  const preview = useMemo(() => {
    if (bulk.count === 0 || !vendorName) return { total: 0, missing: [] as string[] };
    const charge = computeTemperingCharges(Array.from(bulk.selected), ratesByMm);
    return { total: charge.total, missing: charge.missingRateMm };
  }, [bulk.selected, bulk.count, vendorName, ratesByMm]);

  // ── Auto-print when a print mode is armed ─────────────────────────
  useEffect(() => {
    if (printMode && created) {
      const t = setTimeout(() => { window.print(); setPrintMode(null); }, 400);
      return () => clearTimeout(t);
    }
  }, [printMode, created]);

  // ── Dispatch action ───────────────────────────────────────────────
  const handleDispatch = async () => {
    const selectedIds = Array.from(bulk.selected);
    if (selectedIds.length === 0) { toast.error('Pehle pieces select karein.'); return; }
    if (!vendorName) { toast.error('Tempering vendor select karein.'); return; }
    if (!vehicleNo.trim() || !driverName.trim()) { toast.error('Vehicle aur driver name zaroori hain.'); return; }

    setBusy(true);
    try {
      const frozenRates = getVendorRatesByMm(vendorName);
      const charge = computeTemperingCharges(selectedIds, frozenRates);
      if (charge.missingRateMm.length) {
        toast.warning(
          `${charge.missingRateMm.join(', ')}mm ke liye ${vendorName} ka rate missing hai — service order amount adhoora hoga. Vendor rate list update karein.`,
          { duration: 8000 },
        );
      }

      const today = new Date().toISOString().slice(0, 10);
      const existing = ProductionService.getTemperingDispatches();
      const id = AppService.generateSequenceID('CH', 'Glassco', existing);
      const totalSqFt = charge.lines.reduce((s, l) => s + l.sqft, 0);

      const row: TemperingDispatch = {
        id,
        tripId: id,
        company: 'Glassco',
        date: today,
        plantName: vendorName,
        vehicleNo: vehicleNo.trim().toUpperCase(),
        driverName: driverName.trim(),
        serviceType: 'Tempering',
        pieceIds: selectedIds,
        totalSqFt,
        status: 'Dispatched',
        chargesPerSqFt: totalSqFt > 0 ? Math.round(charge.total / totalSqFt) : 0,
        ratesByMm: frozenRates,
        totalCharges: charge.total,
      };

      // Persist dispatch (two-tier localStorage), then atomically attach pieces.
      ProductionService.saveTemperingDispatches([...existing, row]);
      const { error } = await supabase.rpc('load_pieces_to_dispatch_atomic', {
        p_dispatch_id: id,
        p_piece_ids: selectedIds,
        p_changed_by: user?.email ?? 'system',
      });
      if (error) {
        toast.error(`Pieces attach failed: ${error.message}. Dispatch banaya gaya lekin pieces attach nahi hue — retry karein.`, { duration: 10000 });
        return;
      }

      // Step 2 — NON-GL commitment for finance cash-forecast.
      TemperingCommitmentService.createFromDispatch(row);

      // Populate the dispatch_events log (best-effort, non-blocking) so the
      // single-window Dispatch Cockpit reflects this trip's real lifecycle
      // (CREATED → PIECES_LOADED). The event log is advisory — never block dispatch.
      void DispatchService.markCreated(id, { pieceCount: selectedIds.length, vendor: vendorName, totalSqFt })
        .then(() => DispatchService.markPiecesLoaded(id, selectedIds))
        .catch(() => { /* advisory event log — swallow */ });

      // Prints filter pieces by dispatchId; stamp it optimistically so the
      // service order + gate pass render immediately (before the cloud refresh).
      const printPieces = pieces
        .filter(p => selectedIds.includes(p.id))
        .map(p => ({ ...p, dispatchId: id, status: PieceStatus.DISPATCHED }));

      setCreated({ dispatch: row, pieces: printPieces });
      bulk.clear();
      setVehicleNo('');
      setDriverName('');
      toast.success(`Dispatch ${id} — ${selectedIds.length} pcs → ${vendorName} (${fmtPkr(charge.total)})`);
      refreshData();
      setPrintMode('service');    // auto-print the service order
    } catch (e) {
      toast.error(`Dispatch failed: ${e instanceof Error ? e.message : String(e)}`, { duration: 9000 });
    } finally {
      setBusy(false);
    }
  };

  // ── Print-only render (one at a time to keep .print-only isolation) ─
  if (printMode === 'service' && created) {
    return <ServiceOrderPrint dispatch={created.dispatch} pieces={created.pieces} jobOrders={jobOrders} />;
  }
  if (printMode === 'gate' && created) {
    return <GatePassPrint dispatch={created.dispatch} pieces={created.pieces} company="Glassco" />;
  }

  // ── Post-dispatch confirmation with both print actions ─────────────
  if (created) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Toaster position="top-center" />
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <PackageCheck className="text-emerald-600" size={30} />
        </div>
        <h2 className="text-lg font-black tracking-tight text-slate-800">Dispatch {created.dispatch.id} ready</h2>
        <p className="mt-1 text-sm text-slate-500">
          {created.dispatch.pieceIds.length} pcs → {created.dispatch.plantName} · {fmtPkr(created.dispatch.totalCharges)}
          <br />Expected payment commitment finance ko bhej di gayi (GL touch nahi hui).
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => setPrintMode('service')}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-700"
          >
            <FileText size={14} /> Print Service Order
          </button>
          <button
            type="button"
            onClick={() => setPrintMode('gate')}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800"
          >
            <Printer size={14} /> Print Gate Pass
          </button>
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            New Dispatch
          </button>
        </div>
      </div>
    );
  }

  // ── Main screen ────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Toaster position="top-center" />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-blue-700" />
            <h1 className="text-lg font-black tracking-tight text-slate-800">Tempering Dispatch</h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Ready-for-tempering pieces → order-wise pick (partial OK) → vendor → dispatch. Service Order + Gate Pass yahin se print.</p>
        </div>
        <button
          type="button"
          onClick={() => refreshData()}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Pool */}
        <div className="space-y-3">
          <div className="relative">
            <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search piece / order…"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {pool.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
              Koi QC-passed piece tempering ke liye pending nahi.
            </div>
          ) : (
            Array.from(grouped.entries()).map(([orderId, list]) => {
              const order = jobOrders.find(j => j.orderNo === orderId || j.id === orderId);
              const allSelected = list.every(p => bulk.selected.has(p.id));
              return (
                <section key={orderId} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => list.forEach(p => {
                          const has = bulk.selected.has(p.id);
                          if (e.target.checked ? !has : has) bulk.toggle(p.id);
                        })}
                        className="h-3.5 w-3.5"
                      />
                      <span>
                        <span className="block text-sm font-black text-slate-800">{orderId}</span>
                        <span className="block text-2xs text-slate-500">
                          {(order as { clientName?: string })?.clientName ?? ''} · {list.length} pcs
                        </span>
                      </span>
                    </label>
                  </header>
                  <ul>
                    {list.map(p => {
                      const item = order?.items?.[p.itemIndex] as { glassType?: string; glassSize?: string } | undefined;
                      return (
                        <li
                          key={p.id}
                          className={`flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 ${bulk.selected.has(p.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                        >
                          <input type="checkbox" checked={bulk.selected.has(p.id)} onChange={() => bulk.toggle(p.id)} className="h-3.5 w-3.5" />
                          <span className="w-28 shrink-0 font-mono text-xs font-bold text-blue-700">{p.id}</span>
                          <span className="flex-1 text-xs text-slate-700">{item?.glassType ?? ''} {item?.glassSize ?? ''}</span>
                          <span className="max-w-xs truncate text-2xs text-slate-500">{p.specs ?? ''}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>

        {/* Dispatch panel */}
        <aside className="lg:sticky lg:top-4 h-fit space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Dispatch to vendor</h3>

          <div>
            <label className="mb-1 block text-2xs font-bold uppercase text-slate-500">Tempering Vendor</label>
            <select
              value={vendorName}
              onChange={e => setVendorName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">— Select vendor —</option>
              {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
            {vendorName && Object.keys(ratesByMm).length > 0 && (
              <p className="mt-1 text-2xs text-slate-400">
                Rates: {Object.entries(ratesByMm).map(([mm, r]) => `${mm}mm=${r}`).join(' · ')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-2xs font-bold uppercase text-slate-500">Vehicle No</label>
              <input value={vehicleNo} onChange={e => setVehicleNo(e.target.value.toUpperCase())} placeholder="LEA-1234" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm uppercase focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-2xs font-bold uppercase text-slate-500">Driver</label>
              <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Driver name" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Selected</span><span className="font-black text-slate-800">{bulk.count} pcs</span></div>
            <div className="mt-1 flex justify-between"><span className="text-slate-500">Est. charge</span><span className="font-black text-emerald-700">{fmtPkr(preview.total)}</span></div>
            {preview.missing.length > 0 && (
              <p className="mt-1 text-2xs font-semibold text-amber-600">⚠ {preview.missing.join(', ')}mm rate missing</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleDispatch}
            disabled={busy || bulk.count === 0 || !vendorName}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Truck size={13} />}
            {busy ? 'Dispatching…' : 'Dispatch + Print'}
          </button>
          <p className="text-center text-2xs text-slate-400">GL touch nahi hoti — sirf payment commitment note hoti hai.</p>
        </aside>
      </div>
    </div>
  );
};

const TemperingDispatchOut: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/" replace />;
  if (!ALLOWED.has(user.role)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow">
          <h2 className="mb-2 text-lg font-black text-slate-800">Restricted</h2>
          <p className="text-sm text-slate-500">Tempering Dispatch sirf dispatch + supervisor roles ke liye hai.</p>
        </div>
      </div>
    );
  }
  return (
    <ProductionProvider company="Glassco">
      <TemperingContent />
    </ProductionProvider>
  );
};

export default TemperingDispatchOut;
