/**
 * HealthMonitor.tsx — Sprint 4
 *
 * Operational health page. Single URL `/#/health`. Surfaces:
 *   - Trial balance (Dr − Cr should be 0)
 *   - Number of imbalanced JVs (should be 0)
 *   - Activity in last hour
 *   - Per-table last-successful-write timestamp
 *   - Local sync queue size
 *   - localStorage size per critical key
 *
 * Auto-refreshes every 30s. Calls Supabase RPC `erp_health_snapshot`.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../../src/services/supabaseClient';
import { useAppStore } from '../../shared/store/appStore';
import {
  Activity, Database, FileWarning, ShieldCheck, ShieldAlert,
  RefreshCw, Clock, HardDrive, History,
} from 'lucide-react';

interface HealthSnapshot {
  company:             string;
  snapshot_at:         string;
  trial_balance:       number;
  imbalanced_jvs:      number;
  recent_activity_1h:  number;
  last_invoice_at:     string | null;
  last_ledger_at:      string | null;
  row_counts: {
    clients:           number;
    invoices:          number;
    production_pieces: number;
  };
}

interface ActivityRow {
  id:           number;
  table_name:   string;
  row_id:       string;
  operation:    'INSERT' | 'UPDATE' | 'DELETE';
  changed_at:   string;
  changed_by:   string;
  company:      string;
}

const REFRESH_MS = 30_000;

const ls_size = (key: string): number => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Blob([raw]).size : 0;
  } catch { return 0; }
};

const ls_size_total = (): number => {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) total += ls_size(k);
    }
  } catch { /* noop */ }
  return total;
};

const fmtBytes = (b: number): string =>
  b < 1024 ? `${b} B` :
  b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` :
  `${(b / 1024 / 1024).toFixed(2)} MB`;

const fmtTime = (iso: string | null): string => {
  if (!iso) return 'never';
  const d = new Date(iso);
  const ago = (Date.now() - d.getTime()) / 1000;
  if (ago < 60)        return `${Math.round(ago)}s ago`;
  if (ago < 3600)      return `${Math.round(ago / 60)}m ago`;
  if (ago < 86400)     return `${Math.round(ago / 3600)}h ago`;
  return d.toLocaleString();
};

const HealthMonitor: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [recent, setRecent] = useState<ActivityRow[]>([]);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: snap, error: snapErr } = await supabase.rpc(
        'erp_health_snapshot', { p_company: company }
      );
      if (snapErr) throw snapErr;
      setSnapshot(snap as HealthSnapshot);

      const { data: act, error: actErr } = await supabase
        .from('activity_log')
        .select('id, table_name, row_id, operation, changed_at, changed_by, company')
        .eq('company', company)
        .order('changed_at', { ascending: false })
        .limit(20);
      if (actErr) throw actErr;
      setRecent((act as ActivityRow[]) ?? []);

      setLastRefresh(new Date());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'health snapshot failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  // ─── localStorage stats (client-side only) ──────────────────────
  const lsStats = useMemo(() => {
    const keys = [
      'gtk_erp_invoices', 'gtk_erp_ledger', 'gtk_erp_quotations',
      'gtk_erp_clients',  'gtk_erp_store',  'gtk_erp_production_pieces',
      'gtk_erp_grn_sheet_entries', 'gtk_erp_cutting_sessions',
    ];
    return keys.map(k => ({ key: k, size: ls_size(k) }))
               .sort((a, b) => b.size - a.size);
  }, [lastRefresh]);

  const totalLS = useMemo(() => ls_size_total(), [lastRefresh]);

  const tbHealthy = snapshot && Math.abs(snapshot.trial_balance) < 0.01 && snapshot.imbalanced_jvs === 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3">
            <Activity className="text-emerald-600" size={26} />
            Health Monitor
          </h1>
          <p className="text-xs text-slate-400 font-bold mt-1">
            Live operational vitals · {company} · refreshes every 30s
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing…' : 'Refresh Now'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-xs font-bold text-red-700">
            Snapshot RPC failed: {error}
          </p>
          <p className="text-[10px] text-red-500 mt-1">
            Apply migration 045 if `erp_health_snapshot` does not exist yet.
          </p>
        </div>
      )}

      {/* ─── KPIs ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`rounded-2xl border p-5 ${tbHealthy ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            {tbHealthy ? <ShieldCheck size={13} className="text-emerald-600" /> : <ShieldAlert size={13} className="text-red-600" />}
            Trial Balance
          </div>
          <div className={`mt-2 text-2xl font-black ${tbHealthy ? 'text-emerald-700' : 'text-red-700'}`}>
            {snapshot ? `PKR ${Number(snapshot.trial_balance).toLocaleString('en-PK', { maximumFractionDigits: 2 })}` : '—'}
          </div>
          <p className="text-[10px] text-slate-500 font-bold mt-1">
            Dr − Cr (should be 0)
          </p>
        </div>

        <div className={`rounded-2xl border p-5 ${snapshot && snapshot.imbalanced_jvs === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <FileWarning size={13} className={snapshot && snapshot.imbalanced_jvs === 0 ? 'text-emerald-600' : 'text-amber-600'} />
            Imbalanced JVs
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {snapshot?.imbalanced_jvs ?? '—'}
          </div>
          <p className="text-[10px] text-slate-500 font-bold mt-1">
            Posted entries with Dr ≠ Cr
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <History size={13} className="text-blue-600" />
            Activity (1h)
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {snapshot?.recent_activity_1h ?? '—'}
          </div>
          <p className="text-[10px] text-slate-500 font-bold mt-1">
            INSERT / UPDATE / DELETE events
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <HardDrive size={13} className="text-slate-700" />
            localStorage
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {fmtBytes(totalLS)}
          </div>
          <p className={`text-[10px] font-bold mt-1 ${totalLS > 4 * 1024 * 1024 ? 'text-red-500' : 'text-slate-500'}`}>
            {totalLS > 4 * 1024 * 1024 ? '⚠ near 5MB browser limit' : 'Within safe range'}
          </p>
        </div>
      </div>

      {/* ─── Last write timestamps ─────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-xs font-black uppercase text-slate-700 mb-4 flex items-center gap-2">
          <Clock size={14} /> Last Successful Write
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] font-black uppercase text-slate-400">Invoices</p>
            <p className="text-sm font-bold text-slate-800 mt-1">
              {snapshot ? fmtTime(snapshot.last_invoice_at) : '—'}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] font-black uppercase text-slate-400">Ledger</p>
            <p className="text-sm font-bold text-slate-800 mt-1">
              {snapshot ? fmtTime(snapshot.last_ledger_at) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ─── localStorage breakdown ────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-xs font-black uppercase text-slate-700 mb-4 flex items-center gap-2">
          <HardDrive size={14} /> Local Cache by Key
        </h2>
        <div className="space-y-1">
          {lsStats.map(s => (
            <div key={s.key} className="flex items-center justify-between text-xs py-1.5 border-b last:border-b-0">
              <span className="font-mono text-slate-600">{s.key}</span>
              <span className="font-black text-slate-800">{fmtBytes(s.size)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Recent activity log ───────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-xs font-black uppercase text-slate-700 mb-4 flex items-center gap-2">
          <Database size={14} /> Recent Activity (last 20)
        </h2>
        {recent.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic">
            No activity yet — apply migration 045 to enable audit triggers.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-black uppercase text-slate-500 border-b">
                  <th className="text-left py-2">When</th>
                  <th className="text-left py-2">Table</th>
                  <th className="text-left py-2">Row</th>
                  <th className="text-left py-2">Op</th>
                  <th className="text-left py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-slate-50">
                    <td className="py-2 text-slate-500">{fmtTime(r.changed_at)}</td>
                    <td className="py-2 font-mono text-slate-700">{r.table_name}</td>
                    <td className="py-2 font-mono text-slate-600 truncate max-w-[200px]">{r.row_id}</td>
                    <td className="py-2">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                        r.operation === 'DELETE' ? 'bg-red-100 text-red-700'
                          : r.operation === 'UPDATE' ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {r.operation}
                      </span>
                    </td>
                    <td className="py-2 text-slate-600">{r.changed_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-[10px] text-slate-400 font-bold text-right">
        Last refresh: {lastRefresh ? fmtTime(lastRefresh.toISOString()) : '—'}
      </div>
    </div>
  );
};

export default HealthMonitor;
