import React from 'react';
import { AlertTriangle, Truck, Package } from 'lucide-react';
import type { DispatchTripVM } from '@/modules/dispatch/hooks/useDispatchTrips';

/**
 * Read-only trip card for the Dispatch Cockpit board. No actions yet —
 * drawer actions arrive in Phase 2 after finance sign-off.
 */
const DispatchTripCard: React.FC<{ trip: DispatchTripVM }> = ({ trip }) => (
  <div
    className={`rounded-xl border bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${
      trip.conflict ? 'border-amber-300' : 'border-slate-200'
    }`}
  >
    <div className="flex items-center justify-between gap-2">
      <span className="truncate font-mono text-xs font-bold text-slate-800">{trip.tripId || trip.key}</span>
      <span className="flex-none text-[10px] font-semibold uppercase tracking-wide text-slate-400">{trip.serviceType}</span>
    </div>

    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      <span className="inline-flex items-center gap-1"><Truck size={12} /> {trip.vehicleNo}</span>
      <span className="inline-flex items-center gap-1"><Package size={12} /> {trip.pieceCount} pcs</span>
      {trip.totalSqFt > 0 && <span>{trip.totalSqFt.toFixed(0)} sqft</span>}
    </div>

    {trip.plantName && trip.plantName !== '—' && (
      <div className="mt-1 truncate text-[11px] text-slate-400">{trip.plantName}</div>
    )}

    {trip.conflict && (
      <div className="mt-2 flex items-start gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
        <AlertTriangle size={12} className="mt-px flex-none" />
        <span>{trip.conflictReason || 'Status conflict'}</span>
      </div>
    )}
  </div>
);

export default DispatchTripCard;
