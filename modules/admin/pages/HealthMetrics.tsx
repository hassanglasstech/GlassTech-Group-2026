/**
 * HealthMetrics.tsx — Sprint 34 (Performance at Scale)
 *
 * Admin dashboard for runtime performance + storage health.
 *
 * Distinct from the existing /health page (HealthMonitor.tsx — that one
 * is for *data integrity*: trial balance, imbalanced JVs, sync queue).
 * This page is for *runtime performance*: boot timing, query latency,
 * localStorage usage, and slow-query offenders.
 *
 * Auto-refreshes every 5 seconds.
 *
 * Mounted at /admin/health-metrics.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Activity, HardDrive, Database, Gauge, Trash2, RefreshCw, AlertTriangle,
  TrendingUp, Clock, Zap,
} from 'lucide-react';
import {
  getSnapshot, clearRing, fmtBytes, fmtMs, PerfConstants,
  type PerfSnapshot,
} from '@/modules/shared/services/perfMonitor';
import { supabase } from '@/src/services/supabaseClient';

const HealthMetrics: React.FC = () => {
  const [snap, setSnap]               = useState<PerfSnapshot>(() => getSnapshot());
  const [tick, setTick]               = useState(0);
  const [cloud24h, setCloud24h]       = useState<any[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setSnap(getSnapshot());
      setTick(t => t + 1);
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  const refresh = () => setSnap(getSnapshot());

  const loadCloud = async () => {
    setLoadingCloud(true);
    try {
      const { data, error } = await supabase
        .from('v_perf_last24h')
        .select('*')
        .limit(100);
      if (!error && data) setCloud24h(data);
    } catch { /* ignore — view may not exist yet */ }
    setLoadingCloud(false);
  };

  useEffect(() => { void loadCloud(); }, []);

  const storageColor = useMemo(() => {
    if (snap.storage.level === 'critical') return 'bg-rose-500';
    if (snap.storage.level === 'warn')     return 'bg-amber-500';
    return 'bg-emerald-500';
  }, [snap.storage.level]);

  const storageBorder = useMemo(() => {
    if (snap.storage.level === 'critical') return 'border-rose-500 bg-rose-50';
    if (snap.storage.level === 'warn')     return 'border-amber-500 bg-amber-50';
    return 'border-emerald-500 bg-emerald-50';
  }, [snap.storage.level]);

  const handleClearKey = (key: string) => {
    if (!confirm(`Remove "${key}" from localStorage? This may force a re-fetch from cloud.`)) return;
    try {
      localStorage.removeItem(key);
      refresh();
    } catch { /* ignore */ }
  };

  const handleClearRing = () => {
    if (!confirm('Clear in-memory perf samples?')) return;
    clearRing();
    refresh();
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Gauge className="w-6 h-6 text-blue-600" />
            Performance Metrics
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Runtime perf telemetry — boot, query latency, storage. Auto-refresh 5s. Tick {tick}.
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold text-xs uppercase rounded-xl hover:bg-blue-700 shadow"
        >
          <RefreshCw className="w-4 h-4" /> Refresh now
        </button>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={<Zap className="w-5 h-5" />}
          label="Boot total"
          value={fmtMs(snap.bootTotalMs)}
          tone={snap.bootTotalMs > 4000 ? 'warn' : snap.bootTotalMs > 8000 ? 'critical' : 'ok'}
        />
        <KpiCard
          icon={<Database className="w-5 h-5" />}
          label="Query samples"
          value={String(snap.ringSize)}
          tone="ok"
        />
        <KpiCard
          icon={<HardDrive className="w-5 h-5" />}
          label="localStorage"
          value={fmtBytes(snap.storage.bytes)}
          tone={snap.storage.level === 'critical' ? 'critical' : snap.storage.level === 'warn' ? 'warn' : 'ok'}
        />
        <KpiCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Slowest query (p95)"
          value={snap.queries[0] ? fmtMs(snap.queries[0].p95Ms) : '—'}
          sub={snap.queries[0]?.label}
          tone={snap.queries[0] && snap.queries[0].p95Ms > 1500 ? 'warn' : 'ok'}
        />
      </div>

      {/* localStorage panel */}
      <section className={`border-2 rounded-2xl p-5 mb-6 ${storageBorder}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-slate-900 uppercase tracking-widest text-sm flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Browser Storage Usage
          </h2>
          <span className="text-xs font-bold text-slate-600">
            {fmtBytes(snap.storage.bytes)} / {fmtBytes(PerfConstants.LS_LIMIT_BYTES)}
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full ${storageColor} transition-all`}
            style={{ width: `${Math.min(100, snap.storage.pct * 100).toFixed(1)}%` }}
          />
        </div>
        {snap.storage.level !== 'ok' && (
          <p className="text-xs font-bold text-slate-700 flex items-center gap-1 mb-3">
            <AlertTriangle className="w-3 h-3" />
            {snap.storage.level === 'critical'
              ? 'Critical — saves may fail. Clear large keys below.'
              : 'Warning — approaching browser 5 MB limit.'}
          </p>
        )}

        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 mt-3">Top consumers</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-slate-500 font-black uppercase tracking-widest">
                <th className="text-left py-2">Key</th>
                <th className="text-right py-2">Size</th>
                <th className="text-right py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {snap.storage.topKeys.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-slate-400">No keys present.</td></tr>
              )}
              {snap.storage.topKeys.map(k => (
                <tr key={k.key} className="border-b border-slate-100">
                  <td className="py-2 font-mono text-[11px] text-slate-700 truncate max-w-md">{k.key}</td>
                  <td className="py-2 text-right font-bold text-slate-900">{fmtBytes(k.bytes)}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleClearKey(k.key)}
                      className="text-rose-600 hover:bg-rose-100 px-2 py-1 rounded-lg font-bold text-[10px] uppercase"
                    >
                      Clear
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Boot timing */}
      <section className="border border-slate-200 rounded-2xl p-5 mb-6 bg-white">
        <h2 className="font-black text-slate-900 uppercase tracking-widest text-sm flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4" />
          Boot Timing Breakdown
        </h2>
        {snap.bootTimings.length === 0 ? (
          <p className="text-xs text-slate-400">No boot markers yet — refresh after a hard reload.</p>
        ) : (
          <div className="space-y-1">
            {snap.bootTimings.map(b => {
              const pct = snap.bootTotalMs > 0 ? (b.ms / snap.bootTotalMs) * 100 : 0;
              return (
                <div key={b.label} className="flex items-center gap-3">
                  <div className="w-44 text-xs font-bold text-slate-700 truncate">{b.label}</div>
                  <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${pct.toFixed(1)}%` }} />
                  </div>
                  <div className="w-20 text-right text-xs font-mono text-slate-700">{fmtMs(b.ms)}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Query timing — top 20 slowest */}
      <section className="border border-slate-200 rounded-2xl p-5 mb-6 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-slate-900 uppercase tracking-widest text-sm flex items-center gap-2">
            <Database className="w-4 h-4" />
            Query Timing (in-memory ring, top 20 by p95)
          </h2>
          <button
            onClick={handleClearRing}
            className="flex items-center gap-1 px-3 py-1 text-xs font-bold uppercase text-rose-600 hover:bg-rose-100 rounded-lg"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-slate-500 font-black uppercase tracking-widest">
                <th className="text-left py-2">Label</th>
                <th className="text-right py-2">N</th>
                <th className="text-right py-2">avg</th>
                <th className="text-right py-2">p95</th>
                <th className="text-right py-2">max</th>
                <th className="text-right py-2">last rows</th>
              </tr>
            </thead>
            <tbody>
              {snap.queries.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-slate-400">No queries timed yet. Wrap calls with <code>timeQuery()</code> to see entries here.</td></tr>
              )}
              {snap.queries.slice(0, 20).map(q => {
                const slow = q.p95Ms > 1500;
                return (
                  <tr key={q.label} className={`border-b border-slate-100 ${slow ? 'bg-amber-50' : ''}`}>
                    <td className="py-2 font-mono text-[11px] text-slate-700">{q.label}</td>
                    <td className="py-2 text-right text-slate-700">{q.samples}</td>
                    <td className="py-2 text-right text-slate-600">{fmtMs(q.avgMs)}</td>
                    <td className={`py-2 text-right font-black ${slow ? 'text-amber-700' : 'text-slate-900'}`}>{fmtMs(q.p95Ms)}</td>
                    <td className="py-2 text-right text-slate-600">{fmtMs(q.maxMs)}</td>
                    <td className="py-2 text-right text-slate-500">{q.lastRows ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cloud telemetry — last 24h aggregates */}
      <section className="border border-slate-200 rounded-2xl p-5 mb-6 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-slate-900 uppercase tracking-widest text-sm flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Cloud Telemetry — Last 24h (perf_telemetry view)
          </h2>
          <button
            onClick={loadCloud}
            disabled={loadingCloud}
            className="flex items-center gap-1 px-3 py-1 text-xs font-bold uppercase text-blue-600 hover:bg-blue-100 rounded-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loadingCloud ? 'animate-spin' : ''}`} /> Reload
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-slate-500 font-black uppercase tracking-widest">
                <th className="text-left py-2">Metric</th>
                <th className="text-left py-2">Label</th>
                <th className="text-right py-2">Samples</th>
                <th className="text-right py-2">avg</th>
                <th className="text-right py-2">p50</th>
                <th className="text-right py-2">p95</th>
                <th className="text-right py-2">max</th>
                <th className="text-left py-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {cloud24h.length === 0 && (
                <tr><td colSpan={8} className="py-4 text-center text-slate-400">
                  No cloud samples. Set <code>VITE_PERF_UPLOAD=1</code> + restart to enable telemetry uploads.
                </td></tr>
              )}
              {cloud24h.map((r: any, i: number) => {
                const slow = r.p95_ms != null && Number(r.p95_ms) > 1500;
                return (
                  <tr key={i} className={`border-b border-slate-100 ${slow ? 'bg-amber-50' : ''}`}>
                    <td className="py-2 font-mono text-[11px] text-slate-500">{r.metric}</td>
                    <td className="py-2 font-mono text-[11px] text-slate-700">{r.label}</td>
                    <td className="py-2 text-right text-slate-700">{r.samples}</td>
                    <td className="py-2 text-right text-slate-600">{r.avg_ms != null ? `${Number(r.avg_ms).toFixed(0)} ms` : '—'}</td>
                    <td className="py-2 text-right text-slate-600">{r.p50_ms != null ? `${Number(r.p50_ms).toFixed(0)} ms` : '—'}</td>
                    <td className={`py-2 text-right font-black ${slow ? 'text-amber-700' : 'text-slate-900'}`}>{r.p95_ms != null ? `${Number(r.p95_ms).toFixed(0)} ms` : '—'}</td>
                    <td className="py-2 text-right text-slate-600">{r.max_ms != null ? `${Number(r.max_ms).toFixed(0)} ms` : '—'}</td>
                    <td className="py-2 text-[10px] text-slate-500">{r.last_seen_at ? new Date(r.last_seen_at).toLocaleString() : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Help footer */}
      <p className="text-[11px] text-slate-400 text-center">
        Tip — wrap your hot Supabase calls with <code className="bg-slate-100 px-1 rounded">timeQuery('label', () =&gt; supabase…)</code> to populate this dashboard.
      </p>
    </div>
  );
};

interface KpiCardProps {
  icon:  React.ReactNode;
  label: string;
  value: string;
  sub?:  string;
  tone:  'ok' | 'warn' | 'critical';
}
const KpiCard: React.FC<KpiCardProps> = ({ icon, label, value, sub, tone }) => {
  const colour =
    tone === 'critical' ? 'border-rose-500 bg-rose-50 text-rose-700' :
    tone === 'warn'     ? 'border-amber-500 bg-amber-50 text-amber-700' :
                          'border-slate-200 bg-white text-slate-700';
  return (
    <div className={`border-2 rounded-2xl p-4 ${colour}`}>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-70">
        {icon} {label}
      </div>
      <div className="text-2xl font-black mt-2">{value}</div>
      {sub && <div className="text-[10px] font-mono mt-1 opacity-60 truncate">{sub}</div>}
    </div>
  );
};

export default HealthMetrics;
