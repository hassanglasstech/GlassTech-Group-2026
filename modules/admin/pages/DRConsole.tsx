/**
 * DRConsole.tsx — Sprint 32
 *
 * In-app Disaster Recovery console for admins. One screen surfaces:
 *
 *   • Snapshot health per company (from erp_snapshot_summary view)
 *   • Last 30 snapshots (from erp_snapshot_index view)
 *   • "Snapshot Now" button to trigger erp_snapshot() ad-hoc
 *   • "Download" per snapshot — pulls the full payload via
 *     erp_snapshot_export() RPC and saves a .json.gz to the user's
 *     downloads folder (browser CompressionStream — no extra deps)
 *   • Pruner trigger ("Prune snapshots older than 30 / company")
 *
 * Mounted at /admin/dr — restricted to super_admin / owner / hassan /
 * admin / glassco_admin roles.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { supabase } from '@/src/services/supabaseClient';
import { toast } from 'sonner';
import {
  Database, Download, Camera, RefreshCw, Trash2, AlertTriangle,
  CheckCircle2, Clock, HardDrive,
} from 'lucide-react';

interface SnapshotIndexRow {
  id:           string;
  backup_date:  string;
  company:      string | null;
  label:        string | null;
  record_count: number;
  table_count:  number;
  counts:       Record<string, number> | null;
}

interface SnapshotHealthRow {
  company:              string;
  snapshot_count:       number;
  last_snapshot_at:     string | null;
  hours_since_last:     number | null;
  total_records:        number | null;
  total_payload_bytes:  number | null;
  health:               'healthy' | 'warn' | 'stale';
}

const fmtBytes = (n: number | null | undefined): string => {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const HEALTH_TONE: Record<string, string> = {
  healthy: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  warn:    'bg-amber-100 text-amber-700 border-amber-200',
  stale:   'bg-rose-100 text-rose-700 border-rose-200',
};

const DRConsole: React.FC = () => {
  const user    = useAuthStore(s => s.user);
  const company = useAppStore(s => s.selectedCompany) as string;

  const ALLOWED = new Set(['super_admin', 'owner', 'hassan', 'admin', 'glassco_admin']);
  if (!user) return <Navigate to="/" replace/>;
  if (!ALLOWED.has(user.role || '')) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="text-center">
          <AlertTriangle size={36} className="mx-auto text-amber-500 mb-3"/>
          <p className="text-sm font-bold text-slate-700">DR Console requires admin / owner role.</p>
          <p className="text-xs text-slate-400 mt-2">Your role: <span className="font-mono">{user.role}</span></p>
        </div>
      </div>
    );
  }

  const [health, setHealth]       = useState<SnapshotHealthRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotIndexRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [busyId, setBusyId]       = useState<string | null>(null);
  const [snapping, setSnapping]   = useState(false);
  const [pruning, setPruning]     = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, sRes] = await Promise.all([
        supabase.from('erp_snapshot_summary').select('*'),
        supabase.from('erp_snapshot_index').select('*').order('backup_date', { ascending: false }).limit(60),
      ]);
      if (!hRes.error && hRes.data) setHealth(hRes.data as any);
      if (!sRes.error && sRes.data) setSnapshots(sRes.data as any);
    } catch (e: any) {
      toast.error(`Refresh failed: ${e?.message || 'unknown'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Trigger ad-hoc snapshot for the active company ──────────────────
  const handleSnapshotNow = async () => {
    setSnapping(true);
    try {
      const { data, error } = await supabase.rpc('erp_snapshot', {
        p_company: company,
        p_label:   `manual_${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) throw new Error(error.message);
      const r: any = data || {};
      toast.success(`Snapshot ${r.backup_id} captured — ${r.captured_at?.slice(0, 19) || ''}`);
      await refresh();
    } catch (e: any) {
      toast.error(`Snapshot failed: ${e?.message || 'unknown'}`);
    } finally {
      setSnapping(false);
    }
  };

  // ── Prune older snapshots ──────────────────────────────────────────
  const handlePrune = async () => {
    if (!confirm('Prune snapshots — keep only 30 most recent per (company, label) bucket. Older blobs will be hard-deleted. Continue?')) return;
    setPruning(true);
    try {
      const { data, error } = await supabase.rpc('erp_snapshot_prune', { p_keep_days: 30 });
      if (error) throw new Error(error.message);
      const r: any = data || {};
      toast.success(`Prune complete — ${r.pruned} deleted, ${r.kept} kept.`);
      await refresh();
    } catch (e: any) {
      toast.error(`Prune failed: ${e?.message || 'unknown'}`);
    } finally {
      setPruning(false);
    }
  };

  // ── Download single snapshot as .json.gz ───────────────────────────
  const handleDownload = async (row: SnapshotIndexRow) => {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.rpc('erp_snapshot_export', { p_id: row.id });
      if (error) throw new Error(error.message);
      const json = JSON.stringify(data);
      // Browser CompressionStream — gzip without external lib
      let blob: Blob;
      const CS: any = (globalThis as any).CompressionStream;
      if (typeof CS === 'function') {
        const stream = new Blob([json]).stream().pipeThrough(new CS('gzip'));
        blob = await new Response(stream).blob();
      } else {
        // No CompressionStream support — fall back to plain JSON
        blob = new Blob([json], { type: 'application/json' });
      }
      const ts  = (row.backup_date || '').replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      const co  = (row.company || 'ALL').replace(/[^A-Za-z0-9]/g, '');
      const lb  = (row.label   || 'manual').replace(/[^A-Za-z0-9_-]/g, '');
      const ext = (typeof CS === 'function') ? 'json.gz' : 'json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ts}_${co}_${lb}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${a.download} (${fmtBytes(blob.size)})`);
    } catch (e: any) {
      toast.error(`Download failed: ${e?.message || 'unknown'}`);
    } finally {
      setBusyId(null);
    }
  };

  // ── KPI strip totals ────────────────────────────────────────────────
  const totals = useMemo(() => {
    const totalSnaps = health.reduce((s, h) => s + (h.snapshot_count || 0), 0);
    const totalBytes = health.reduce((s, h) => s + (h.total_payload_bytes || 0), 0);
    const stale      = health.filter(h => h.health === 'stale').length;
    return { totalSnaps, totalBytes, stale };
  }, [health]);

  return (
    <div className="space-y-5 p-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-rose-800 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database size={24}/>
          <div>
            <h1 className="text-xl font-black uppercase">DR Console</h1>
            <p className="text-[10px] text-rose-200 font-bold uppercase tracking-widest mt-0.5">
              Backup health · Snapshot history · Manual triggers
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSnapshotNow}
            disabled={snapping}
            className="bg-white text-slate-900 hover:bg-slate-100 px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow disabled:opacity-50"
            title={`Run erp_snapshot('${company}', 'manual_…') now`}
          >
            <Camera size={14}/> {snapping ? 'Capturing…' : `Snapshot ${company} Now`}
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2"
          >
            <RefreshCw size={14}/> Refresh
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Companies tracked" value={String(health.length)} icon={<Database size={12}/>}/>
        <KpiTile label="Snapshots stored"  value={String(totals.totalSnaps)} icon={<HardDrive size={12}/>}/>
        <KpiTile label="Storage used"      value={fmtBytes(totals.totalBytes)} icon={<HardDrive size={12}/>}/>
        <KpiTile label="Stale companies"   value={String(totals.stale)} tone={totals.stale > 0 ? 'bad' : 'good'} icon={<AlertTriangle size={12}/>}/>
      </div>

      {/* Per-company health */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b">
          <p className="text-xs font-black uppercase tracking-widest text-slate-600">Per-company snapshot health</p>
        </div>
        {health.length === 0 ? (
          <p className="p-10 text-center text-slate-300 italic font-bold text-sm">No snapshots yet — click "Snapshot Now" to capture the first.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-widest border-b">
              <tr>
                <th className="px-4 py-2.5">Company</th>
                <th className="px-3 py-2.5 text-right">Snapshots</th>
                <th className="px-3 py-2.5">Last At</th>
                <th className="px-3 py-2.5 text-right">Hours Ago</th>
                <th className="px-3 py-2.5 text-right">Records</th>
                <th className="px-3 py-2.5 text-right">Size</th>
                <th className="px-3 py-2.5 w-24">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {health.map(h => (
                <tr key={h.company} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-black text-slate-800">{h.company}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-700">{h.snapshot_count}</td>
                  <td className="px-3 py-2.5 text-[10px] text-slate-500 font-bold whitespace-nowrap">
                    <Clock size={10} className="inline mr-1 text-slate-300"/>{(h.last_snapshot_at || '—').replace('T', ' ').slice(0, 16)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-700">{h.hours_since_last ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-700">{(h.total_records || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-700">{fmtBytes(h.total_payload_bytes)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider border ${HEALTH_TONE[h.health]}`}>
                      {h.health === 'healthy' ? <><CheckCircle2 size={10} className="inline mr-1"/>OK</> : h.health}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Snapshot history table */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-slate-600">Snapshot history (last 60)</p>
          <button
            onClick={handlePrune}
            disabled={pruning}
            className="bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-rose-100 flex items-center gap-1.5 disabled:opacity-40"
          >
            <Trash2 size={12}/> {pruning ? 'Pruning…' : 'Prune > 30/co'}
          </button>
        </div>
        {snapshots.length === 0 ? (
          <p className="p-10 text-center text-slate-300 italic font-bold text-sm">No snapshots in history.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-widest border-b">
                <tr>
                  <th className="px-3 py-2.5 w-44">Captured</th>
                  <th className="px-3 py-2.5 w-28">Company</th>
                  <th className="px-3 py-2.5">Label</th>
                  <th className="px-3 py-2.5 text-right w-20">Tables</th>
                  <th className="px-3 py-2.5 text-right w-24">Records</th>
                  <th className="px-3 py-2.5">Snapshot ID</th>
                  <th className="px-3 py-2.5 text-right w-32">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {snapshots.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-[10px] text-slate-500 font-bold whitespace-nowrap">{(s.backup_date || '').replace('T', ' ').slice(0, 19)}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-700">{s.company || 'ALL'}</td>
                    <td className="px-3 py-2.5 text-[10px] text-slate-500 font-bold">
                      <span className={`px-1.5 py-0.5 rounded ${(s.label || '').startsWith('auto_') ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700'}`}>
                        {s.label || 'manual'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-700">{s.table_count}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-700">{(s.record_count || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 font-mono text-[10px] text-slate-500 truncate max-w-xs">{s.id}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => handleDownload(s)}
                        disabled={busyId === s.id}
                        className="px-3 py-1.5 bg-slate-700 text-white rounded text-[10px] font-black uppercase hover:bg-slate-900 flex items-center gap-1.5 ml-auto disabled:opacity-40"
                      >
                        <Download size={11}/> {busyId === s.id ? '…' : 'Download'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline runbook reference */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
        <p className="font-black uppercase tracking-widest mb-1">📖 Recovery procedure</p>
        <p className="leading-relaxed">
          For full disaster-recovery scenarios (PITR, restore from snapshot, off-site
          export), see <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">RUNBOOK_DISASTER_RECOVERY.md</code> at
          the repo root. Section 3 covers each outage scenario; section 4 is the
          quarterly drill checklist.
        </p>
      </div>
    </div>
  );
};

const KpiTile: React.FC<{
  label: string; value: string; tone?: 'good' | 'bad' | 'default'; icon?: React.ReactNode;
}> = ({ label, value, tone = 'default', icon }) => {
  const cls = {
    good:    'bg-emerald-50 border-emerald-200 text-emerald-700',
    bad:     'bg-rose-50 border-rose-200 text-rose-700',
    default: 'bg-white border-slate-200 text-slate-700',
  }[tone];
  return (
    <div className={`rounded-2xl border-2 ${cls} p-3`}>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-80">
        {icon}<span>{label}</span>
      </div>
      <div className="text-xl font-black mt-1 truncate">{value}</div>
    </div>
  );
};

export default DRConsole;
