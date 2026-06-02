/**
 * perfMonitor.ts — Sprint 34 (Performance at Scale)
 *
 * Lightweight client-side performance telemetry. Three concerns:
 *
 *   1. **Boot timings** — markers we drop during App.tsx init() so we can
 *      tell where the cold-start budget is spent.
 *   2. **Query timings** — `timeQuery(label, () => supabase…)` wrapper
 *      records duration + row count, surfaces slow queries to the
 *      HealthMetrics dashboard.
 *   3. **localStorage usage** — measures total bytes used; fires a toast
 *      warning at 4 MB (5 MB is the browser limit), critical at 4.7 MB.
 *
 * All metrics are kept in an in-memory ring buffer (last 500 samples).
 * Optionally batched to Supabase `perf_telemetry` every 5 minutes —
 * disabled by default; flip `VITE_PERF_UPLOAD=1` to enable.
 *
 * No async deps in the hot path — recording a sample is a synchronous
 * push into a fixed-size array. Safe to call from anywhere.
 *
 * Used by:
 *   • App.tsx — boot markers + localStorage check on init
 *   • HealthMetrics.tsx — dashboard reads via `getSnapshot()`
 *   • supabase wrappers (optional) — `timeQuery` for hot tables
 */

import { supabase } from '@/src/services/supabaseClient';
import { toast } from 'sonner';

export type PerfMetric = 'boot' | 'query' | 'route' | 'localStorage';

export interface PerfSample {
  ts:     number;        // performance.now() timestamp
  metric: PerfMetric;
  label:  string;
  ms?:    number;        // duration if applicable
  bytes?: number;        // size if applicable
  rows?:  number;        // row count if applicable
  meta?:  Record<string, any>;
}

const RING_CAPACITY = 500;
const _ring: PerfSample[] = [];

const _bootStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
const _bootMarks = new Map<string, number>();

const LS_WARN_BYTES     = 4 * 1024 * 1024;   // 4.0 MB → warning
const LS_CRITICAL_BYTES = 4.7 * 1024 * 1024; // 4.7 MB → critical
const LS_LIMIT_BYTES    = 5 * 1024 * 1024;   // 5.0 MB → browser cap

const _push = (s: PerfSample) => {
  _ring.push(s);
  if (_ring.length > RING_CAPACITY) _ring.shift();
};

// ── Boot timings ─────────────────────────────────────────────────────
export const startBootTimer = () => {
  _bootMarks.set('app_loaded', _bootStart);
};

export const markBoot = (label: string) => {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const ms  = now - _bootStart;
  _bootMarks.set(label, ms);
  _push({ ts: now, metric: 'boot', label, ms });
};

export const getBootTimings = (): Array<{ label: string; ms: number }> =>
  Array.from(_bootMarks.entries())
    .map(([label, ms]) => ({ label, ms }))
    .sort((a, b) => a.ms - b.ms);

// ── Query timings ────────────────────────────────────────────────────
/**
 * Wrap any async DB call:
 *   const { data, error } = await timeQuery('sales_invoices.list', () =>
 *     supabase.from('sales_invoices').select('*'));
 *
 * Returns the inner result unchanged. Errors are still thrown but
 * timing is still recorded so slow-failures show up too.
 */
export const timeQuery = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const t0 = performance.now();
  try {
    const result = await fn();
    const ms = performance.now() - t0;
    let rows: number | undefined;
    if (result && typeof result === 'object' && 'data' in (result as any)) {
      const d = (result as any).data;
      if (Array.isArray(d)) rows = d.length;
    }
    _push({ ts: t0, metric: 'query', label, ms, rows });
    if (ms > 1500) {
      // Slow-query trace — surfaces in dashboard too
      // eslint-disable-next-line no-console
      console.warn(`[perf] slow query ${label} = ${ms.toFixed(0)}ms`, { rows });
    }
    return result;
  } catch (err) {
    const ms = performance.now() - t0;
    _push({ ts: t0, metric: 'query', label: `${label}!err`, ms });
    throw err;
  }
};

// ── Route timings ────────────────────────────────────────────────────
let _routeT0 = performance.now();
let _routeLabel = '';
export const markRouteStart = (label: string) => {
  _routeT0 = performance.now();
  _routeLabel = label;
};
export const markRouteReady = () => {
  if (!_routeLabel) return;
  const ms = performance.now() - _routeT0;
  _push({ ts: _routeT0, metric: 'route', label: _routeLabel, ms });
  _routeLabel = '';
};

// ── localStorage usage ───────────────────────────────────────────────
export interface StorageUsage {
  bytes:        number;
  pct:          number;        // 0..1 of 5 MB cap
  level:        'ok' | 'warn' | 'critical';
  topKeys:      Array<{ key: string; bytes: number }>;
}

export const getStorageUsage = (): StorageUsage => {
  let total = 0;
  const keyed: Array<{ key: string; bytes: number }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k) || '';
      // browsers store both key + value as UTF-16 (2 bytes/char) — approx
      const bytes = (k.length + v.length) * 2;
      total += bytes;
      keyed.push({ key: k, bytes });
    }
  } catch { /* SecurityError in private mode */ }
  keyed.sort((a, b) => b.bytes - a.bytes);
  const level: StorageUsage['level'] =
    total >= LS_CRITICAL_BYTES ? 'critical' :
    total >= LS_WARN_BYTES     ? 'warn'     : 'ok';
  return {
    bytes:   total,
    pct:     total / LS_LIMIT_BYTES,
    level,
    topKeys: keyed.slice(0, 10),
  };
};

let _lsToastShown = false;
export const checkStorageAndWarn = () => {
  const u = getStorageUsage();
  _push({ ts: performance.now(), metric: 'localStorage', label: 'total', bytes: u.bytes });
  if (u.level === 'critical' && !_lsToastShown) {
    _lsToastShown = true;
    toast.error(
      `Storage almost full (${(u.bytes / 1024 / 1024).toFixed(2)} MB / 5 MB). Some data may fail to save. Open Admin → Health Metrics to clean up.`,
      { duration: 12000 }
    );
  } else if (u.level === 'warn' && !_lsToastShown) {
    _lsToastShown = true;
    toast.warning(
      `Storage at ${(u.bytes / 1024 / 1024).toFixed(2)} MB. Approaching browser 5 MB limit.`,
      { duration: 8000 }
    );
  }
  return u;
};

// ── Snapshot for the dashboard ───────────────────────────────────────
export interface PerfSnapshot {
  bootTotalMs:  number;
  bootTimings:  Array<{ label: string; ms: number }>;
  storage:      StorageUsage;
  queries:      Array<{ label: string; samples: number; avgMs: number; p95Ms: number; maxMs: number; lastRows: number | null }>;
  routes:       Array<{ label: string; samples: number; avgMs: number; p95Ms: number }>;
  ringSize:     number;
}

const _percentile = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
};

export const getSnapshot = (): PerfSnapshot => {
  // Group query samples by label
  const queryGroups = new Map<string, { ms: number[]; lastRows: number | null }>();
  const routeGroups = new Map<string, number[]>();
  for (const s of _ring) {
    if (s.metric === 'query' && typeof s.ms === 'number') {
      const g = queryGroups.get(s.label) || { ms: [], lastRows: null };
      g.ms.push(s.ms);
      if (typeof s.rows === 'number') g.lastRows = s.rows;
      queryGroups.set(s.label, g);
    } else if (s.metric === 'route' && typeof s.ms === 'number') {
      const g = routeGroups.get(s.label) || [];
      g.push(s.ms);
      routeGroups.set(s.label, g);
    }
  }
  const queries = Array.from(queryGroups.entries()).map(([label, g]) => {
    const sorted = [...g.ms].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      label,
      samples:  sorted.length,
      avgMs:    sorted.length ? sum / sorted.length : 0,
      p95Ms:    _percentile(sorted, 0.95),
      maxMs:    sorted[sorted.length - 1] || 0,
      lastRows: g.lastRows,
    };
  }).sort((a, b) => b.p95Ms - a.p95Ms);

  const routes = Array.from(routeGroups.entries()).map(([label, ms]) => {
    const sorted = [...ms].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      label,
      samples: sorted.length,
      avgMs:   sorted.length ? sum / sorted.length : 0,
      p95Ms:   _percentile(sorted, 0.95),
    };
  }).sort((a, b) => b.p95Ms - a.p95Ms);

  const bootTimings = getBootTimings();
  const bootTotalMs = bootTimings.length ? bootTimings[bootTimings.length - 1].ms : 0;

  return {
    bootTotalMs,
    bootTimings,
    storage: getStorageUsage(),
    queries,
    routes,
    ringSize: _ring.length,
  };
};

// ── Optional cloud upload (off unless VITE_PERF_UPLOAD=1) ────────────
const _uploadEnabled = () => {
  try {
    return (import.meta as any).env?.VITE_PERF_UPLOAD === '1';
  } catch { return false; }
};

let _uploadTimer: any = null;
export const startCloudUpload = () => {
  if (!_uploadEnabled() || _uploadTimer) return;
  _uploadTimer = setInterval(() => { void _flushUpload(); }, 5 * 60 * 1000);
};

const _flushUpload = async () => {
  if (!_ring.length) return;
  const batch = _ring.splice(0, _ring.length).map(s => ({
    metric:  s.metric,
    label:   s.label,
    ms:      s.ms ?? null,
    bytes:   s.bytes ?? null,
    rows:    s.rows ?? null,
    payload: s.meta || {},
  }));
  try {
    await supabase.from('perf_telemetry').insert(batch);
  } catch { /* swallow — telemetry is best-effort */ }
};

// ── Utilities for the dashboard ──────────────────────────────────────
export const clearRing = () => { _ring.length = 0; };
export const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};
export const fmtMs = (n: number): string => n < 1 ? `<1 ms` : n < 1000 ? `${n.toFixed(0)} ms` : `${(n / 1000).toFixed(2)} s`;

export const PerfConstants = {
  LS_WARN_BYTES,
  LS_CRITICAL_BYTES,
  LS_LIMIT_BYTES,
  RING_CAPACITY,
};

export default {
  startBootTimer,
  markBoot,
  timeQuery,
  markRouteStart,
  markRouteReady,
  getStorageUsage,
  checkStorageAndWarn,
  getSnapshot,
  startCloudUpload,
  clearRing,
  fmtBytes,
  fmtMs,
};
