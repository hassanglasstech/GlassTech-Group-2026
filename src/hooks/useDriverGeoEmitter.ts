/**
 * useDriverGeoEmitter — Sprint 14
 *
 * Mounts a single watchPosition() and POSTs each ping to the
 * record_vehicle_location RPC. Throttles to 1 ping every 5 minutes
 * (configurable) so we don't spam the DB while still keeping the
 * supervisor map fresh.
 *
 * Usage (inside DriverScreen):
 *   useDriverGeoEmitter({
 *     vehicleId: dispatch.vehicleNo,
 *     tripId:    dispatch.id,
 *     token,
 *     enabled:   !podCompleted,
 *   });
 *
 * Failure modes (all silent):
 *   - Browser denies geolocation       → never resolves, hook is no-op
 *   - Network down                     → ping is dropped (no retry queue)
 *   - vehicle/trip token mismatch      → first ping fails, subsequent
 *                                         pings stop (saves cell data)
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/src/services/supabaseClient';

interface Options {
  vehicleId:        string;
  tripId?:          string;
  token?:           string;
  /** Min ms between successive pings. Default 5 min. */
  intervalMs?:      number;
  /** Min metres of movement before re-emitting. Default 50 m. */
  minMovementM?:    number;
  /** Master kill-switch — set false when delivery is done. */
  enabled?:         boolean;
}

const EARTH_R = 6371_000;
const DEG = Math.PI / 180;

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function useDriverGeoEmitter({
  vehicleId,
  tripId,
  token,
  intervalMs    = 5 * 60_000,
  minMovementM  = 50,
  enabled       = true,
}: Options): void {
  const lastPingAt    = useRef<number>(0);
  const lastPingPos   = useRef<{ lat: number; lng: number } | null>(null);
  const stoppedRef    = useRef<boolean>(false);
  const watchIdRef    = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !vehicleId) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const onPosition = async (pos: GeolocationPosition) => {
      if (stoppedRef.current) return;

      const now = Date.now();
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };

      // Time gate
      if (now - lastPingAt.current < intervalMs) return;
      // Movement gate
      if (lastPingPos.current && haversineM(lastPingPos.current, here) < minMovementM) return;

      try {
        const { error } = await supabase.rpc('record_vehicle_location', {
          p_vehicle_id:   vehicleId,
          p_lat:          here.lat,
          p_lng:          here.lng,
          p_trip_id:      tripId ?? null,
          p_token:        token ?? null,
          p_speed_kph:    pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
          p_heading_deg:  pos.coords.heading ?? null,
          p_accuracy_m:   pos.coords.accuracy,
          p_battery_pct:  null,
        });
        if (error) {
          // Token mismatch → stop emitting (saves cell data)
          if (error.message?.includes('invalid_token')) {
            stoppedRef.current = true;
            if (watchIdRef.current != null) {
              navigator.geolocation.clearWatch(watchIdRef.current);
              watchIdRef.current = null;
            }
          }
          return;
        }
        lastPingAt.current  = now;
        lastPingPos.current = here;
      } catch { /* network error — drop silently, retry next tick */ }
    };

    const onError = () => { /* user denied / unavailable — silent */ };

    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge:         30_000,
      timeout:            15_000,
    });

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [vehicleId, tripId, token, intervalMs, minMovementM, enabled]);
}
