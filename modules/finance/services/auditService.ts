/**
 * auditService.ts — Sprint 31
 *
 * Thin client over the `activity_log_summary` view (created by
 * migration 057) for the RowHistoryButton modal + AuditorView page.
 *
 * Why a view rather than direct activity_log queries?
 *   • Drops the JSONB blobs from the list-card view (only fetched on
 *     row expansion).
 *   • Pre-computes the changed-key count for UPDATE rows so the UI
 *     can show "3 fields changed" without re-diffing client-side.
 *   • Friendly columns (op_label, changed_by_short).
 *
 * Two main calls:
 *   • getRowHistory(table, rowId)   — full history for one entity
 *   • listRecentChanges(filters)    — broad audit feed for the
 *                                     AuditorView page
 */

import { supabase } from '@/src/services/supabaseClient';

export interface AuditEntry {
  id:                  number;
  tableName:           string;
  rowId:               string;
  operation:           'INSERT' | 'UPDATE' | 'DELETE';
  opLabel:             string;
  changedAt:           string;
  changedBy:           string | null;
  changedByShort:      string | null;
  beforeData:          Record<string, unknown> | null;
  afterData:           Record<string, unknown> | null;
  company:             string | null;
  changedFieldCount:   number | null;
}

const _row = (r: any): AuditEntry => ({
  id:                Number(r.id),
  tableName:         r.table_name,
  rowId:             r.row_id,
  operation:         r.operation,
  opLabel:           r.op_label,
  changedAt:         r.changed_at,
  changedBy:         r.changed_by,
  changedByShort:    r.changed_by_short,
  beforeData:        r.before_data,
  afterData:         r.after_data,
  company:           r.company,
  changedFieldCount: r.changed_field_count,
});

export const AuditService = {
  /** Full history for a single row (used by RowHistoryButton modal). */
  getRowHistory: async (table: string, rowId: string, limit = 200): Promise<AuditEntry[]> => {
    try {
      const { data, error } = await supabase
        .from('activity_log_summary')
        .select('*')
        .eq('table_name', table)
        .eq('row_id', rowId)
        .order('changed_at', { ascending: false })
        .limit(limit);
      if (error || !data) return [];
      return data.map(_row);
    } catch {
      return [];
    }
  },

  /** Cross-table audit feed used by AuditorView. Optional filters. */
  listRecentChanges: async (opts: {
    company?:    string;
    table?:      string;
    user?:       string;
    sinceDate?:  string;       // YYYY-MM-DD
    untilDate?:  string;
    operation?:  AuditEntry['operation'];
    limit?:      number;
  } = {}): Promise<AuditEntry[]> => {
    try {
      let q = supabase.from('activity_log_summary').select('*');
      if (opts.company)   q = q.eq('company',    opts.company);
      if (opts.table)     q = q.eq('table_name', opts.table);
      if (opts.user)      q = q.eq('changed_by', opts.user);
      if (opts.operation) q = q.eq('operation',  opts.operation);
      if (opts.sinceDate) q = q.gte('changed_at', opts.sinceDate);
      if (opts.untilDate) q = q.lte('changed_at', opts.untilDate + 'T23:59:59Z');
      q = q.order('changed_at', { ascending: false }).limit(opts.limit ?? 500);
      const { data, error } = await q;
      if (error || !data) return [];
      return data.map(_row);
    } catch {
      return [];
    }
  },

  /** Diff helper — returns the list of changed keys for an UPDATE entry. */
  diffKeys: (entry: AuditEntry): { key: string; before: unknown; after: unknown }[] => {
    if (entry.operation !== 'UPDATE') return [];
    const before = entry.beforeData || {};
    const after  = entry.afterData  || {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const out: { key: string; before: unknown; after: unknown }[] = [];
    keys.forEach(k => {
      // updated_at flips on every row touch — skip noise.
      if (k === 'updated_at') return;
      const bv = (before as any)[k];
      const av = (after as any)[k];
      // JSONB columns may compare as objects — cheap stringify check
      const bJson = typeof bv === 'object' ? JSON.stringify(bv) : bv;
      const aJson = typeof av === 'object' ? JSON.stringify(av) : av;
      if (bJson !== aJson) out.push({ key: k, before: bv, after: av });
    });
    return out;
  },
};
