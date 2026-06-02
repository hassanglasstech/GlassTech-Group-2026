/**
 * GeofenceAlert — Sprint 14
 *
 * Compact route-deviation alert chip. Computes the perpendicular
 * distance from the truck's last ping to the great-circle line
 * between origin and destination; if it exceeds the threshold,
 * renders a warning + (optionally) fires a one-shot callback.
 *
 * Used in:
 *   - DispatchPlanner trip-detail drawer
 *   - Supervisor dashboard tile
 *
 * Pure render — no DB writes. Pair with a server-side cron if you want
 * persistent alerts.
 */

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Navigation } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

interface GeoPoint {
  lat: number;
  lng: number;
}

interface GeofenceAlertProps {
  origin?:        GeoPoint;
  destination?:   GeoPoint;
  truckPosition?: GeoPoint;
  /** Deviation threshold in km. Default 5 km. */
  thresholdKm?:   number;
  /** Compact pill mode (no description). */
  compact?:       boolean;
  /** Fired once when the deviation crosses the threshold. */
  onBreach?:      (deviationKm: number) => void;
}

// ── Geometry helpers ──────────────────────────────────────────────────

const EARTH_R = 6371;
const DEG = Math.PI / 180;

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Cross-track distance — perpendicular distance from point `p` to the
 * great-circle line through `a → b`. Approximation good for ≤ 100 km
 * legs which is ~all dispatch trips.
 */
function crossTrackKm(a: GeoPoint, b: GeoPoint, p: GeoPoint): number {
  const δ13 = haversineKm(a, p) / EARTH_R;
  const θ13 = bearing(a, p);
  const θ12 = bearing(a, b);
  const xt  = Math.asin(Math.sin(δ13) * Math.sin(θ13 - θ12)) * EARTH_R;
  return Math.abs(xt);
}

function bearing(a: GeoPoint, b: GeoPoint): number {
  const φ1 = a.lat * DEG;
  const φ2 = b.lat * DEG;
  const Δλ = (b.lng - a.lng) * DEG;
  const y  = Math.sin(Δλ) * Math.cos(φ2);
  const x  = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x);
}

// ── Component ─────────────────────────────────────────────────────────

const GeofenceAlert: React.FC<GeofenceAlertProps> = ({
  origin,
  destination,
  truckPosition,
  thresholdKm  = 5,
  compact      = false,
  onBreach,
}) => {
  const [hasFired, setHasFired] = useState(false);

  if (!origin || !destination || !truckPosition) {
    return null;
  }

  const deviationKm = crossTrackKm(origin, destination, truckPosition);
  const distToDestKm = haversineKm(truckPosition, destination);
  const breached = deviationKm > thresholdKm;

  useEffect(() => {
    if (breached && !hasFired) {
      onBreach?.(deviationKm);
      setHasFired(true);
    }
    if (!breached && hasFired) {
      // Truck rejoined the route — reset so a future deviation re-fires
      setHasFired(false);
    }
  }, [breached, deviationKm, hasFired, onBreach]);

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
        breached ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
      }`}>
        {breached ? <AlertTriangle size={10}/> : <CheckCircle2 size={10}/>}
        {breached ? `${deviationKm.toFixed(1)} km off route` : 'On route'}
      </span>
    );
  }

  return (
    <div className={`rounded-lg p-3 border-2 ${
      breached ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'
    }`}>
      <div className="flex items-center gap-2 mb-1">
        {breached
          ? <AlertTriangle size={16} className="text-rose-600"/>
          : <Navigation size={16} className="text-emerald-600"/>}
        <span className={`text-sm font-black ${breached ? 'text-rose-800' : 'text-emerald-800'}`}>
          {breached ? 'Route deviation' : 'On route'}
        </span>
      </div>
      <div className="text-xs text-slate-600 space-y-0.5">
        <div>Off-route: <span className="font-bold">{deviationKm.toFixed(2)} km</span> (threshold {thresholdKm} km)</div>
        <div>To destination: <span className="font-bold">{distToDestKm.toFixed(1)} km</span></div>
      </div>
    </div>
  );
};

export default GeofenceAlert;
