/**
 * PieceHistoryTab — Sprint 17
 *
 * Activity log timeline for a single production piece. Reads the last
 * 20 events from `activity_log` (Sprint 4 audit triggers — every UPDATE
 * to production_pieces is captured automatically by the log_changes
 * trigger).
 *
 * Each entry shows:
 *   - Operation icon (▶ insert / ✎ update / ✖ delete)
 *   - Field-level diff for status / spotId / dispatchId / fault
 *   - Actor (changed_by) + relative time
 *
 * Polls every 30s while the tab is visible — Sprint 10's realtime bridge
 * doesn't yet listen for activity_log changes, but the polling cost is
 * negligible (single indexed query).
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import { Loader2, AlertCircle, Plus, Pencil, Trash2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

interface ActivityLogRow {
  id:          number;
  table_name:  string;
  row_id:      string;
  operation:   'INSERT' | 'UPDATE' | 'DELETE';
  changed_at:  string;
  changed_by:  string | null;
  before_data: Record<string, unknown> | null;
  after_data:  Record<string, unknown> | null;
}

interface PieceHistoryTabProps {
  pieceId: string;
  /** Polling interval in ms; 0 disables. Default 30 000. */
  pollMs?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────

const TRACKED_FIELDS = ['status', 'spotId', 'dispatchId', 'fault', 'holdFrom', 'specs'];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)        return 'just now';
  if (diff < 3_600_000)     return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000)    return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function diffSummary(row: ActivityLogRow): React.ReactNode {
  const before = row.before_data ?? {};
  const after  = row.after_data  ?? {};

  if (row.operation === 'INSERT') {
    const status = (after.data as { status?: string })?.status ?? after.status;
    return (
      <span className="text-emerald-700">
        Created {status ? <>· status <strong>{String(status)}</strong></> : null}
      </span>
    );
  }

  if (row.operation === 'DELETE') {
    return <span className="text-rose-700">Deleted</span>;
  }

  // UPDATE — find which tracked fields changed
  const beforeData = (before.data as Record<string, unknown>) ?? before;
  const afterData  = (after.data  as Record<string, unknown>) ?? after;

  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  TRACKED_FIELDS.forEach(f => {
    const a = beforeData?.[f];
    const b = afterData?.[f];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push({ field: f, from: a, to: b });
    }
  });

  if (changes.length === 0) return <span className="text-slate-500 italic">— minor update —</span>;

  return (
    <div className="space-y-0.5">
      {changes.map(c => (
        <div key={c.field} className="text-2xs">
          <span className="font-bold text-slate-600">{c.field}</span>
          <span className="text-slate-400 mx-1">:</span>
          <span className="text-rose-600 line-through">{formatVal(c.from)}</span>
          <span className="text-slate-400 mx-1">→</span>
          <span className="text-emerald-700 font-bold">{formatVal(c.to)}</span>
        </div>
      ))}
    </div>
  );
}

function formatVal(v: unknown): string {
  if (v == null || v === '') return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ── Component ─────────────────────────────────────────────────────────

const PieceHistoryTab: React.FC<PieceHistoryTabProps> = ({ pieceId, pollMs = 30_000 }) => {
  const [rows,    setRows]    = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const fetchRows = async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('id, table_name, row_id, operation, changed_at, changed_by, before_data, after_data')
        .eq('table_name', 'production_pieces')
        .eq('row_id', pieceId)
        .order('changed_at', { ascending: false })
        .limit(20);

      if (!alive) return;
      if (error) {
        setError(error.message);
      } else {
        setRows((data ?? []) as ActivityLogRow[]);
        setError(null);
      }
      setLoading(false);
    };

    fetchRows();
    if (pollMs > 0) {
      const id = setInterval(fetchRows, pollMs);
      return () => { alive = false; clearInterval(id); };
    }
    return () => { alive = false; };
  }, [pieceId, pollMs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="animate-spin mr-2" size={16}/>
        <span className="text-sm">Loading history…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-center gap-2 text-rose-700">
        <AlertCircle size={16}/>
        <span className="text-xs">{error}</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm italic">
        No activity recorded for this piece yet.
      </div>
    );
  }

  return (
    <ol className="relative border-l-2 border-slate-200 pl-5 ml-2 space-y-4">
      {rows.map(row => (
        <li key={row.id} className="relative">
          <span className={`
            absolute -left-[26px] top-1 w-4 h-4 rounded-full flex items-center justify-center
            ${row.operation === 'INSERT' ? 'bg-emerald-500'
              : row.operation === 'DELETE' ? 'bg-rose-500'
              : 'bg-blue-500'}
          `}>
            {row.operation === 'INSERT' && <Plus size={10} className="text-white"/>}
            {row.operation === 'UPDATE' && <Pencil size={10} className="text-white"/>}
            {row.operation === 'DELETE' && <Trash2 size={10} className="text-white"/>}
          </span>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xs font-black uppercase text-slate-400">{row.operation}</span>
              <span className="text-2xs text-slate-400">{relativeTime(row.changed_at)}</span>
            </div>
            <div className="text-xs">{diffSummary(row)}</div>
            {row.changed_by && (
              <div className="text-2xs text-slate-400 mt-1">by {row.changed_by}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
};

export default PieceHistoryTab;
