/**
 * RowHistoryButton.tsx — Sprint 31
 *
 * Drop-in "View History" button for any entity row (invoice / quotation
 * / payment / ledger). Opens a modal that lists every change captured
 * by the activity_log triggers (Sprint 4 / migration 045) with full
 * before/after JSONB diffs.
 *
 * Usage:
 *   <RowHistoryButton table="invoices" rowId={invoice.id} label="History" />
 *
 * The modal:
 *   • Top: KPI strip — total changes, last changed by, last changed at
 *   • Body: timeline of changes (most recent first), each row expandable
 *     to show changed fields with old → new
 *   • All read-only; auditor can copy values out manually
 */

import React, { useState, useEffect } from 'react';
import { History, X, ChevronDown, ChevronRight, User, Clock, Plus, Trash2, Pencil } from 'lucide-react';
import { AuditService, AuditEntry } from '@/modules/finance/services/auditService';

interface Props {
  table:  string;
  rowId:  string;
  /** Label override (default: "History"). */
  label?: string;
  /** Visual variant. */
  variant?: 'icon' | 'button';
  /** Tooltip. */
  title?: string;
}

const OP_ICON: Record<string, { icon: React.ReactNode; tone: string }> = {
  INSERT: { icon: <Plus size={12}/>,    tone: 'bg-emerald-100 text-emerald-700' },
  UPDATE: { icon: <Pencil size={12}/>,  tone: 'bg-blue-100 text-blue-700' },
  DELETE: { icon: <Trash2 size={12}/>,  tone: 'bg-rose-100 text-rose-700' },
};

const RowHistoryButton: React.FC<Props> = ({ table, rowId, label = 'History', variant = 'icon', title }) => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    AuditService.getRowHistory(table, rowId).then((rows) => {
      setEntries(rows);
      setLoading(false);
    });
  }, [open, table, rowId]);

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const last = entries[0];

  return (
    <>
      {variant === 'icon' ? (
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded"
          title={title || `View change history for ${rowId}`}
          aria-label="View history"
        >
          <History size={14}/>
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          title={title || `View change history for ${rowId}`}
        >
          <History size={12}/> {label}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[600] bg-slate-900/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Change History</p>
                <p className="text-base font-black font-mono mt-0.5">{table} · {rowId}</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-2 hover:bg-white/10 rounded-lg" aria-label="Close"><X size={18}/></button>
            </div>

            {/* KPI strip */}
            <div className="px-5 py-3 bg-slate-50 border-b grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total changes</p>
                <p className="text-lg font-black text-slate-800">{entries.length}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Last by</p>
                <p className="text-xs font-bold text-slate-700 truncate flex items-center justify-center gap-1"><User size={10}/>{last?.changedByShort || '—'}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Last at</p>
                <p className="text-xs font-bold text-slate-700 truncate flex items-center justify-center gap-1"><Clock size={10}/>{last?.changedAt?.replace('T', ' ').slice(0, 16) || '—'}</p>
              </div>
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loading && <p className="text-center py-12 text-slate-400 italic font-bold">Loading…</p>}
              {!loading && entries.length === 0 && (
                <p className="text-center py-12 text-slate-300 italic font-bold">
                  No history found for this row.
                  <br/>
                  <span className="text-[10px] not-italic">Audit triggers may have been added after this row was created.</span>
                </p>
              )}
              {entries.map(e => {
                const meta = OP_ICON[e.operation] || OP_ICON.UPDATE;
                const isExp = expanded.has(e.id);
                const diff = e.operation === 'UPDATE' ? AuditService.diffKeys(e) : [];
                return (
                  <div key={e.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleExpand(e.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 text-left"
                    >
                      {isExp ? <ChevronDown size={14} className="text-slate-400 shrink-0"/> : <ChevronRight size={14} className="text-slate-400 shrink-0"/>}
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${meta.tone} flex items-center gap-1`}>
                        {meta.icon} {e.opLabel}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-700">
                          {e.changedByShort || 'unknown'}
                          {e.operation === 'UPDATE' && e.changedFieldCount !== null && (
                            <span className="text-slate-500 font-normal"> · {e.changedFieldCount} field{e.changedFieldCount === 1 ? '' : 's'} changed</span>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold">{e.changedAt?.replace('T', ' ').slice(0, 19)}</p>
                      </div>
                    </button>
                    {isExp && (
                      <div className="px-4 pb-3 border-t border-slate-100">
                        {e.operation === 'UPDATE' && diff.length > 0 ? (
                          <table className="w-full text-[11px]">
                            <thead className="text-slate-400 uppercase font-bold tracking-wider">
                              <tr>
                                <th className="text-left py-1 w-32">Field</th>
                                <th className="text-left py-1">Before</th>
                                <th className="text-left py-1">After</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diff.map(d => (
                                <tr key={d.key} className="border-t border-slate-100">
                                  <td className="py-1 font-bold text-slate-600">{d.key}</td>
                                  <td className="py-1 font-mono text-rose-700 break-all max-w-xs">{_fmt(d.before)}</td>
                                  <td className="py-1 font-mono text-emerald-700 break-all max-w-xs">{_fmt(d.after)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : e.operation === 'INSERT' && e.afterData ? (
                          <pre className="text-[10px] bg-slate-50 rounded p-2 overflow-x-auto font-mono text-slate-700 max-h-64">{JSON.stringify(e.afterData, null, 2)}</pre>
                        ) : e.operation === 'DELETE' && e.beforeData ? (
                          <pre className="text-[10px] bg-rose-50 rounded p-2 overflow-x-auto font-mono text-rose-800 max-h-64">{JSON.stringify(e.beforeData, null, 2)}</pre>
                        ) : (
                          <p className="text-[10px] text-slate-400 italic font-bold py-2">No diff available.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const _fmt = (v: unknown): string => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

export default RowHistoryButton;
