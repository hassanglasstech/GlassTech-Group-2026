import React from 'react';
import { RefreshCw, LayoutGrid, AlertTriangle, Truck } from 'lucide-react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useDispatchTrips } from '@/modules/dispatch/hooks/useDispatchTrips';
import DispatchKanbanBoard from '@/modules/dispatch/components/DispatchKanbanBoard';

/**
 * Dispatch Cockpit — One-Window Dispatch, Phase 1 (read-only).
 *
 * A single board that fuses the fragmented Glassco dispatch lifecycle
 * (Ready → Loading → At-Gate → In-Transit → Delivered → Invoiced) so the whole
 * "where is every trip" picture lives in one screen. This phase is purely
 * additive and read-only: it renders existing dispatch data, writes nothing,
 * and has zero GL impact (financial-controller sign-off: safe to ship now).
 * Drawer actions + the invoicing trigger arrive in Phase 2/3 behind explicit
 * finance sign-off.
 */
const DispatchCockpit: React.FC = () => {
  const selectedCompany = useAppStore(s => s.selectedCompany);
  const isGlassco = selectedCompany === 'Glassco';
  const { columns, counts, conflictCount, total, loading, refresh } = useDispatchTrips('Glassco');

  if (!isGlassco) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <Truck className="text-slate-400" size={26} />
        </div>
        <h2 className="text-base font-black uppercase tracking-tight text-slate-700">Dispatch Cockpit — Glassco only</h2>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          Yeh unified dispatch board sirf Glassco ke liye hai. Sidebar se company Glassco par switch karein.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <LayoutGrid size={18} className="text-blue-700" />
            <h1 className="text-lg font-black tracking-tight text-slate-800">Dispatch Cockpit</h1>
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Preview · Read-only
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Har trip ek hi board pe — Ready se Invoice tak. Poora dispatch ek jagah se nazar aata hai.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {conflictCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              <AlertTriangle size={13} /> {conflictCount} conflict{conflictCount > 1 ? 's' : ''}
            </span>
          )}
          <span className="text-xs text-slate-400">{total} trips</span>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {total === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-20 text-center text-sm text-slate-400">
          Koi dispatch nahi mila. Trips banane par woh yahan board pe nazar aayenge.
        </div>
      ) : (
        <DispatchKanbanBoard columns={columns} counts={counts} />
      )}

      <p className="text-[11px] leading-relaxed text-slate-400">
        Yeh Phase 1 read-only cockpit hai — data existing dispatch records se aata hai; koi cheez likhi ya post nahi hoti
        (GL bilkul untouched). Load / gate / invoice jaise actions Phase 2 mein drawer ke zariye aayenge, finance sign-off ke baad.
      </p>
    </div>
  );
};

export default DispatchCockpit;
