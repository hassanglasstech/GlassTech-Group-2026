/**
 * LiveDispatchMap — Sprint 14
 *
 * Supervisor live-tracking map showing all in-transit vehicles for the
 * active company. Polls get_active_vehicle_positions every 15 s.
 *
 * Routes:
 *   /#/dispatch/live              — supervisor view (auth-gated, all vehicles)
 *   /#/track/:tripId?t={token}    — public customer view (single vehicle)
 *
 * Tech:
 *   - Leaflet (loaded lazily via leafletLoader → CDN, zero npm deps)
 *   - OpenStreetMap tiles (free)
 *   - Auto-fit bounds on first load; user pan/zoom is preserved after
 */

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/modules/shared/store/appStore';
import { supabase } from '@/src/services/supabaseClient';
import { loadLeaflet } from '@/src/services/leafletLoader';
import { Truck, Loader2, AlertTriangle, RefreshCw, MapPin, Battery } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

interface VehiclePosition {
  vehicle_id:   string;
  latitude:     number;
  longitude:    number;
  recorded_at:  string;
  trip_id:      string | null;
  speed_kph:    number | null;
  heading_deg:  number | null;
  battery_pct:  number | null;
  age_seconds:  number;
}

// Minimal Leaflet typings — only what we use
interface LMap {
  setView: (latlng: [number, number], zoom: number) => LMap;
  fitBounds: (bounds: unknown, options?: { padding?: [number, number] }) => LMap;
  remove: () => void;
  addLayer: (layer: unknown) => LMap;
}
interface LMarker {
  bindPopup: (html: string) => LMarker;
  setLatLng: (latlng: [number, number]) => LMarker;
  remove: () => void;
}
interface LeafletGlobal {
  map: (el: HTMLElement, options?: unknown) => LMap;
  tileLayer: (url: string, options?: unknown) => { addTo: (m: LMap) => unknown };
  marker: (latlng: [number, number], options?: { icon?: unknown }) => LMarker & { addTo: (m: LMap) => LMarker };
  divIcon: (options: { html: string; className?: string; iconSize?: [number, number]; iconAnchor?: [number, number] }) => unknown;
  latLngBounds: (latlngs: Array<[number, number]>) => unknown;
  circle: (latlng: [number, number], options: { radius: number; color?: string; fillColor?: string; fillOpacity?: number }) => { addTo: (m: LMap) => unknown };
}

const POLL_INTERVAL_MS = 15_000;

// ── Component ─────────────────────────────────────────────────────────

interface LiveDispatchMapProps {
  /** When set, restrict to a single vehicle on a single trip (customer view) */
  publicTripId?:  string;
  publicToken?:   string;
}

const LiveDispatchMap: React.FC<LiveDispatchMapProps> = ({ publicTripId, publicToken }) => {
  const selectedCompany = useAppStore(s => s.selectedCompany);
  const isPublic         = !!publicTripId;

  const [positions,  setPositions]  = useState<VehiclePosition[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [lastFetch,  setLastFetch]  = useState<Date | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<LMap | null>(null);
  const markersRef   = useRef<Map<string, LMarker>>(new Map());
  const fittedRef    = useRef<boolean>(false);

  // ── Mount Leaflet map once ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled || !containerRef.current) return;
      const Lg = L as LeafletGlobal;

      // Karachi default centre
      const map = Lg.map(containerRef.current).setView([24.86, 67.00], 11);
      Lg.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
    }).catch(e => {
      if (!cancelled) setError(`Map failed to load: ${e.message}`);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.clear();
    };
  }, []);

  // ── Fetch positions on mount + every poll interval ────────────────
  useEffect(() => {
    let alive = true;

    const fetchPositions = async () => {
      try {
        if (isPublic && publicTripId && publicToken) {
          // Public single-trip view — get the vehicle for this trip + its latest ping
          const { data: dispatch } = await supabase
            .from('tempering_dispatches')
            .select('id, driver_token, data')
            .eq('id', publicTripId)
            .single();

          type DispatchRow = { id: string; driver_token: string; data?: { vehicleNo?: string } };
          if (!dispatch || (dispatch as DispatchRow).driver_token !== publicToken) {
            if (alive) setError('Invalid tracking link');
            return;
          }

          // Get most recent ping for this trip (any vehicle)
          const { data: pings, error: pErr } = await supabase
            .from('vehicle_locations')
            .select('*')
            .eq('trip_id', publicTripId)
            .order('recorded_at', { ascending: false })
            .limit(1);

          if (pErr) throw new Error(pErr.message);
          if (!pings || pings.length === 0) {
            if (alive) {
              setPositions([]);
              setError(null);
              setLoading(false);
            }
            return;
          }
          type PingRow = {
            vehicle_id: string; latitude: number; longitude: number;
            recorded_at: string; trip_id: string | null;
            speed_kph: number | null; heading_deg: number | null;
            battery_pct: number | null;
          };
          const p = pings[0] as PingRow;
          if (alive) {
            setPositions([{
              vehicle_id:   p.vehicle_id,
              latitude:     p.latitude,
              longitude:    p.longitude,
              recorded_at:  p.recorded_at,
              trip_id:      p.trip_id,
              speed_kph:    p.speed_kph,
              heading_deg:  p.heading_deg,
              battery_pct:  p.battery_pct,
              age_seconds:  Math.round((Date.now() - new Date(p.recorded_at).getTime()) / 1000),
            }]);
            setError(null);

            // Geofence arrival check (best effort)
            await supabase.rpc('check_geofence_arrival', {
              p_dispatch_id: publicTripId,
              p_radius_m: 500,
            });
          }
        } else {
          // Supervisor view — all active vehicles for the company
          const { data, error } = await supabase.rpc('get_active_vehicle_positions', {
            p_company:       selectedCompany,
            p_since_minutes: 30,
          });
          if (error) throw new Error(error.message);
          if (alive) {
            setPositions((data ?? []) as VehiclePosition[]);
            setError(null);
          }
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Fetch failed');
      } finally {
        if (alive) {
          setLastFetch(new Date());
          setLoading(false);
        }
      }
    };

    fetchPositions();
    const id = setInterval(fetchPositions, POLL_INTERVAL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [selectedCompany, isPublic, publicTripId, publicToken]);

  // ── Render markers when positions change ──────────────────────────
  useEffect(() => {
    if (!mapRef.current || positions.length === 0) return;
    const Lg = (window as unknown as { L: LeafletGlobal }).L;
    if (!Lg) return;

    const seen = new Set<string>();
    const bounds: Array<[number, number]> = [];

    positions.forEach(p => {
      seen.add(p.vehicle_id);
      bounds.push([p.latitude, p.longitude]);

      const html = `
        <div style="
          background: #1d4ed8; color: #fff; border-radius: 999px;
          padding: 4px 8px; font-weight: 800; font-size: 11px;
          box-shadow: 0 2px 8px rgba(0,0,0,.3); display: flex; align-items: center; gap: 4px;
        ">
          🚛 ${p.vehicle_id}
        </div>`;
      const popupHtml = `
        <div style="font-size: 12px; min-width: 160px">
          <div style="font-weight: 800; margin-bottom: 4px">${p.vehicle_id}</div>
          ${p.trip_id ? `<div style="color:#64748b">Trip: ${p.trip_id}</div>` : ''}
          ${p.speed_kph != null ? `<div>Speed: ${p.speed_kph.toFixed(0)} kph</div>` : ''}
          <div>Last seen: ${p.age_seconds}s ago</div>
          ${p.battery_pct != null ? `<div>Battery: ${p.battery_pct.toFixed(0)}%</div>` : ''}
        </div>`;

      const existing = markersRef.current.get(p.vehicle_id);
      if (existing) {
        existing.setLatLng([p.latitude, p.longitude]);
        existing.bindPopup(popupHtml);
      } else {
        const icon = Lg.divIcon({
          html, className: 'live-vehicle-marker',
          iconSize: [80, 28], iconAnchor: [40, 14],
        });
        const m = Lg.marker([p.latitude, p.longitude], { icon }).addTo(mapRef.current!);
        m.bindPopup(popupHtml);
        markersRef.current.set(p.vehicle_id, m);
      }
    });

    // Clean up markers for vehicles no longer pinging
    markersRef.current.forEach((m, id) => {
      if (!seen.has(id)) { m.remove(); markersRef.current.delete(id); }
    });

    // First-load auto-fit
    if (!fittedRef.current && bounds.length > 0) {
      mapRef.current.fitBounds(Lg.latLngBounds(bounds), { padding: [40, 40] });
      fittedRef.current = true;
    }
  }, [positions]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="relative h-screen w-full">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top status bar */}
      <div className="absolute top-3 left-3 right-3 z-[400] flex items-center justify-between pointer-events-none">
        <div className="bg-white/95 backdrop-blur rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 pointer-events-auto">
          <Truck size={16} className="text-blue-600"/>
          <span className="text-xs font-bold text-slate-700">
            {isPublic ? 'Tracking your delivery' : `${selectedCompany} fleet`}
          </span>
          <span className="text-[10px] text-slate-400">
            · {positions.length} active
          </span>
        </div>
        {lastFetch && (
          <div className="bg-white/95 backdrop-blur rounded-lg shadow-lg px-3 py-2 flex items-center gap-1.5 pointer-events-auto">
            <RefreshCw size={12} className={`text-slate-500 ${loading ? 'animate-spin' : ''}`}/>
            <span className="text-[10px] text-slate-500">
              Updated {lastFetch.toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {/* Loading / error overlays */}
      {loading && positions.length === 0 && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/60 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-slate-600">
            <Loader2 className="animate-spin" size={28}/>
            <span className="text-sm font-medium">Loading map…</span>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[500] bg-rose-50 border border-rose-200 rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg">
          <AlertTriangle size={16} className="text-rose-600"/>
          <span className="text-sm font-bold text-rose-700">{error}</span>
        </div>
      )}
      {!loading && positions.length === 0 && !error && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[400] bg-white rounded-xl shadow-xl p-6 text-center max-w-sm pointer-events-auto">
          <MapPin className="text-slate-400 mx-auto mb-2" size={32}/>
          <h2 className="text-base font-black text-slate-800 mb-1">No active vehicles</h2>
          <p className="text-xs text-slate-500">
            {isPublic
              ? 'The driver hasn\'t started transmitting yet — check back in a few minutes.'
              : 'No trucks have pinged in the last 30 minutes.'}
          </p>
        </div>
      )}

      {/* Bottom legend (supervisor only) */}
      {!isPublic && positions.length > 0 && (
        <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur rounded-lg shadow-lg p-3 max-w-xs">
          <div className="text-[10px] font-black uppercase text-slate-500 mb-1.5">Active Vehicles</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {positions.map(p => (
              <div key={p.vehicle_id} className="flex items-center justify-between text-[11px] gap-3">
                <span className="font-bold text-slate-700">{p.vehicle_id}</span>
                <span className="flex items-center gap-1.5 text-slate-500">
                  {p.battery_pct != null && (
                    <span className="flex items-center gap-0.5">
                      <Battery size={10}/> {p.battery_pct.toFixed(0)}%
                    </span>
                  )}
                  <span className={p.age_seconds > 600 ? 'text-rose-600 font-bold' : 'text-slate-400'}>
                    {p.age_seconds}s
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Public wrapper for /track/:tripId customer route ──────────────────

export const PublicTrackingMap: React.FC = () => {
  const { tripId = '' } = useParams<{ tripId: string }>();
  const [params]        = useSearchParams();
  const token           = params.get('t') ?? '';
  return <LiveDispatchMap publicTripId={tripId} publicToken={token} />;
};

export default LiveDispatchMap;
