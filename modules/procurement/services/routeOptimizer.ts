/**
 * routeOptimizer.ts — Sprint 13
 *
 * Multi-stop route ordering for tempering / delivery trips.
 *
 * Two strategies:
 *   1. Haversine nearest-neighbour (default, free, no API key)
 *      — Greedy: from origin, repeatedly pick the closest unvisited stop
 *      — Good enough for ≤10 stops; produces a 5-15% longer route than
 *        true TSP-optimal but the dispatcher saves an hour vs hand-routing
 *   2. Google Maps Distance Matrix (opt-in, paid)
 *      — Uses real road distance + live traffic
 *      — Requires GOOGLE_MAPS_API_KEY in env
 *
 * Public API:
 *   optimizeRoute(origin, stops) → { ordered: Stop[], totalKm, etaMinutes, strategy }
 *   estimateEta(distanceKm, avgSpeedKph?) → minutes
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Stop extends GeoPoint {
  id:           string;
  label:        string;
  /** Service time in minutes the truck spends at this stop */
  dwellMinutes?: number;
}

export type RouteStrategy = 'haversine' | 'google_maps';

export interface OptimizedRoute {
  /** Stops re-ordered by visit sequence (origin not included) */
  ordered:     Stop[];
  totalKm:     number;
  etaMinutes:  number;
  strategy:    RouteStrategy;
  /** Diff between original input order and optimized order, in km */
  savingsKm?:  number;
  warnings?:   string[];
}

// ── Haversine ────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Great-circle distance in km between two points.
 * Approximation for road distance — multiply by ~1.3 for typical urban
 * road network. We DON'T apply that fudge here; use the route service
 * if road-accurate distance is needed.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;

  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Sum of distances along an ordered list of stops (origin → s1 → s2 …).
 */
export function totalRouteKm(origin: GeoPoint, ordered: Stop[]): number {
  let total = 0;
  let prev: GeoPoint = origin;
  for (const s of ordered) {
    total += haversineKm(prev, s);
    prev = s;
  }
  return total;
}

// ── Strategy 1: Greedy nearest-neighbour ─────────────────────────────

function nearestNeighbour(origin: GeoPoint, stops: Stop[]): Stop[] {
  const remaining = [...stops];
  const ordered: Stop[] = [];
  let current: GeoPoint = origin;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestKm  = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const km = haversineKm(current, remaining[i]);
      if (km < bestKm) { bestKm = km; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    current = next;
  }
  return ordered;
}

// ── ETA helper ───────────────────────────────────────────────────────

/**
 * Convert distance to minutes assuming an average urban speed.
 * Karachi/Lahore traffic ≈ 25 kph effective, intercity ≈ 50 kph.
 */
export function estimateEta(distanceKm: number, avgSpeedKph = 30): number {
  if (distanceKm <= 0 || avgSpeedKph <= 0) return 0;
  return Math.round((distanceKm / avgSpeedKph) * 60);
}

// ── Strategy 2: Google Maps Distance Matrix (optional) ───────────────

interface GMatrixElement { distance?: { value: number }; duration_in_traffic?: { value: number }; duration?: { value: number }; }
interface GMatrixRow { elements: GMatrixElement[]; }
interface GMatrixResponse { rows: GMatrixRow[]; status: string; }

async function fetchGoogleMatrix(
  apiKey:    string,
  origins:   GeoPoint[],
  destinations: GeoPoint[],
): Promise<GMatrixResponse | null> {
  const o = origins.map(p => `${p.lat},${p.lng}`).join('|');
  const d = destinations.map(p => `${p.lat},${p.lng}`).join('|');
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json`
    + `?origins=${encodeURIComponent(o)}`
    + `&destinations=${encodeURIComponent(d)}`
    + `&key=${apiKey}&departure_time=now&traffic_model=best_guess`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function googleMapsOptimize(
  origin: GeoPoint,
  stops:  Stop[],
  apiKey: string,
): Promise<{ ordered: Stop[]; totalKm: number; etaMinutes: number } | null> {
  // For ≤10 stops greedy still works fine; ask Google for the actual
  // distance matrix and feed it into the same nearest-neighbour algorithm.
  if (stops.length === 0) return { ordered: [], totalKm: 0, etaMinutes: 0 };
  if (stops.length > 10) return null; // matrix gets too big — fall back

  const points = [origin, ...stops];
  const matrix = await fetchGoogleMatrix(apiKey, points, points);
  if (!matrix || matrix.status !== 'OK') return null;

  // Greedy NN over the real matrix (index 0 = origin)
  const visited  = new Set<number>([0]);
  const ordered: Stop[] = [];
  let cur        = 0;
  let totalMeters = 0;
  let totalSec    = 0;

  while (visited.size <= stops.length) {
    let bestIdx = -1;
    let bestM   = Infinity;
    for (let j = 1; j < points.length; j++) {
      if (visited.has(j)) continue;
      const cell = matrix.rows[cur]?.elements[j];
      const m    = cell?.distance?.value ?? Infinity;
      if (m < bestM) { bestM = m; bestIdx = j; }
    }
    if (bestIdx < 0) break;
    visited.add(bestIdx);
    const cell = matrix.rows[cur]?.elements[bestIdx];
    totalMeters += cell?.distance?.value ?? 0;
    totalSec    += (cell?.duration_in_traffic?.value ?? cell?.duration?.value ?? 0);
    ordered.push(stops[bestIdx - 1]);
    cur = bestIdx;
  }

  return {
    ordered,
    totalKm:    Math.round(totalMeters / 100) / 10,
    etaMinutes: Math.round(totalSec / 60),
  };
}

// ── Public entry ─────────────────────────────────────────────────────

export async function optimizeRoute(
  origin: GeoPoint,
  stops:  Stop[],
  options?: {
    strategy?:        RouteStrategy;
    googleMapsApiKey?: string;
    avgSpeedKph?:     number;
  },
): Promise<OptimizedRoute> {
  const warnings: string[] = [];

  if (stops.length === 0) {
    return { ordered: [], totalKm: 0, etaMinutes: 0, strategy: 'haversine' };
  }

  // Original input distance — used for "savings" reporting
  const originalKm = totalRouteKm(origin, stops);

  // Try Google Maps if requested and available
  const wantGoogle = options?.strategy === 'google_maps'
    || (typeof process !== 'undefined' && process?.env?.GOOGLE_MAPS_API_KEY)
    || (typeof import.meta !== 'undefined' && (import.meta as { env?: { VITE_GOOGLE_MAPS_API_KEY?: string } }).env?.VITE_GOOGLE_MAPS_API_KEY);
  const apiKey = options?.googleMapsApiKey
    ?? (typeof import.meta !== 'undefined'
      ? (import.meta as { env?: { VITE_GOOGLE_MAPS_API_KEY?: string } }).env?.VITE_GOOGLE_MAPS_API_KEY
      : undefined);

  if (wantGoogle && apiKey) {
    const g = await googleMapsOptimize(origin, stops, apiKey);
    if (g) {
      const dwellMin = stops.reduce((s, p) => s + (p.dwellMinutes ?? 10), 0);
      return {
        ordered:    g.ordered,
        totalKm:    g.totalKm,
        etaMinutes: g.etaMinutes + dwellMin,
        strategy:   'google_maps',
        savingsKm:  Math.max(0, Math.round((originalKm - g.totalKm) * 10) / 10),
        warnings,
      };
    }
    warnings.push('Google Maps unavailable — used Haversine');
  }

  // Haversine fallback
  const ordered  = nearestNeighbour(origin, stops);
  const totalKm  = totalRouteKm(origin, ordered);
  const dwellMin = stops.reduce((s, p) => s + (p.dwellMinutes ?? 10), 0);
  const eta      = estimateEta(totalKm, options?.avgSpeedKph ?? 30) + dwellMin;

  return {
    ordered,
    totalKm:    Math.round(totalKm * 10) / 10,
    etaMinutes: eta,
    strategy:   'haversine',
    savingsKm:  Math.max(0, Math.round((originalKm - totalKm) * 10) / 10),
    warnings,
  };
}

/**
 * Empty-return optimizer — when the truck is heading back to origin
 * after the last drop, suggest a vendor pickup that's near the route.
 *
 * @param lastDrop       last customer stop
 * @param origin         truck home base
 * @param candidates     vendors with pending pickups
 * @param maxDetourKm    how far off-route we'll allow (default 5 km)
 */
export function suggestEmptyReturnPickup(
  lastDrop:    GeoPoint,
  origin:      GeoPoint,
  candidates:  Stop[],
  maxDetourKm  = 5,
): { stop: Stop; detourKm: number } | null {
  const directKm = haversineKm(lastDrop, origin);
  let best: { stop: Stop; detourKm: number } | null = null;

  for (const c of candidates) {
    const viaKm   = haversineKm(lastDrop, c) + haversineKm(c, origin);
    const detour  = viaKm - directKm;
    if (detour <= maxDetourKm && (!best || detour < best.detourKm)) {
      best = { stop: c, detourKm: Math.round(detour * 10) / 10 };
    }
  }
  return best;
}
