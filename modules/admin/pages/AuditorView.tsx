/**
 * AuditorView.tsx — Sprint 31
 *
 * Read-only audit feed for external auditors / internal reviewers.
 * Pulls from `activity_log_summary` (migration 057) which is fed by
 * the Sprint-4 audit triggers on every financial table.
 *
 * Filters:
 *   • Company           (from app store; auditor sees all if super_admin)
 *   • Table             (clients / quotations / invoices / payment_receipts /
 *                        credit_notes / ledger / store_items / production_pieces)
 *   • User (changed_by)
 *   • Operation         (INSERT / UPDATE / DELETE)
 *   • Date range
 *
 * All entries deep-link into RowHistoryButton's modal so the auditor
 * gets full before/after diffs without leaving the page.
 *
 * Mounted at /admin/auditor (lazy route). Anyone with admin or owner
 * role can access; otherwise the Navigate fallback redirects home.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { AuditService, AuditEntry } from '@/modules/finance/services/auditService';
import RowHistoryButton from '@/modules/finance/components/RowHistoryButton';
import {
  ShieldCheck, Search, RefreshCw, Calendar, User, Filter, FileText,
  AlertTriangle, Plus, Pencil, Trash2,
} from 'lucide-react';

const TABLES = [
  'clients', 'quotations', 'invoices', 'payment_receipts',
  'credit_notes', 'ledger', 'store_items', 'production_pieces',
] as const;

const OP_PILL: Record<string, { tone: string; icon: React.ReactNode }> = {
  INSERT: { tone: 'bg-emerald-100 text-emerald-700', icon: <Plus size={11}/> },
  UPDATE: { tone: 'bg-blue-100 text-blue-700',       icon: <Pencil size={11}/> },
  DELETE: { tone: 'bg-rose-100 text-rose-700',       icon: <Trash2 size={11}/> },
};

const AuditorView: React.FC = () => {
  const user    = useAuthStore(s => s.user);
  const company = useAppStore(s => s.selectedCompany) as string;

  // Anyone with admin / owner / super_admin / hassan / glassco_admin can audit.
  const ALLOWED = new Set(['super_admin', 'owner', 'hassan', 'admin', 'glassco_admin']);
  if (!user) return <Navigate to="/" replace/>;
  if (!ALLOWED.has(user.role || '')) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="text-center">
          <AlertTriangle size={36} className="mx-auto text-amber-500 mb-3"/>
          <p className="text-sm font-bold text-slate-700">Auditor view requires admin / owner role.</p>
          <p className="text-xs text-slate-400 mt-2">Your role: <span className="font-mono">{user.role}</span></p>
        </div>
      </div>
    );
  }

  // ── Filters ──────────────────────────────────────────────────────────
  const [filterCompany, setFilterCompany] = useState<string>(company || '');
  const [filterTable,   setFilterTable]   = useState<string>('');
  const [filterUser,    setFilterUser]    = useState<string>('');
  const [filterOp,      setFilterOp]      = useState<'' | AuditEntry['operation']>('');
  const [sinceDate,     setSinceDate]     = useState<string>('');
  const [untilDate,     setUntilDate]     = useState<string>('');
  const [search,        setSearch]        = useState<string>('');

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const rows = await AuditService.listRecentChanges({
      company:    filterCompany || undefined,
      table:      filterTable   || undefined,
      user:       filterUser    || undefined,
      operation:  filterOp      || undefined,
      sinceDate:  sinceDate     || undefined,
      untilDate:  untilDate     || undefined,
      limit:      1000,
    });
    setEntries(rows);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCompany, filterTable, filterUser, filterOp, sinceDate, untilDate]);

  // Local search (post-fetch text filter on row id)
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      e.rowId.toLowerCase().includes(q) ||
      (e.changedBy || '').toLowerCase().includes(q)
    );
  }, [entries, search]);

  // KPI strip
  const stats = useMemo(() => {
    const inserts = entries.filter(e => e.operation === 'INSERT').length;
    const updates = entries.filter(e => e.operation === 'UPDATE').length;
    const deletes = entries.filter(e => e.operation === 'DELETE').length;
    return { inserts, updates, deletes };
  }, [entries]);

  return (
    <div className="space-y-5 p-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-emerald-800 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck size={24}/>
          <div>
            <h1 className="text-xl font-black uppercase">Auditor View</h1>
            <p className="text-[10px] text-emerald-200 font-bold uppercase tracking-widest mt-0.5">
              Read-only · activity_log_summary feed · {entries.length} rows
            </p>
          </div>
        </div>
        <button onClick={refresh} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2">
          <RefreshCw size={14}/> Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <KpiTile label="Created" value={stats.inserts} tone="emerald" icon={<Plus size={12}/>}/>
        <KpiTile label="Updated" value={stats.updates} tone="blue"    icon={<Pencil size={12}/>}/>
        <KpiTile label="Deleted" value={stats.deletes} tone="rose"    icon={<Trash2 size={12}/>}/>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Company</label>
          <input value={filterCompany} onChange={e => setFilterCompany(e.target.value)} placeholder="All" className="w-full px-2 py-2 text-xs border-2 border-slate-200 rounded-lg font-bold"/>
        </div>
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Table</label>
          <select value={filterTable} onChange={e => setFilterTable(e.target.value)} className="w-full px-2 py-2 text-xs border-2 border-slate-200 rounded-lg font-bold">
            <option value="">— Any —</option>
            {TABLES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">User</label>
          <input value={filterUser} onChange={e => setFilterUser(e.target.value)} placeholder="email" className="w-full px-2 py-2 text-xs border-2 border-slate-200 rounded-lg font-bold"/>
        </div>
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Operation</label>
          <select value={filterOp} onChange={e => setFilterOp(e.target.value as any)} className="w-full px-2 py-2 text-xs border-2 border-slate-200 rounded-lg font-bold">
            <option value="">— Any —</option>
            <option value="INSERT">Created</option>
            <option value="UPDATE">Updated</option>
            <option value="DELETE">Deleted</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Since</label>
          <input type="date" value={sinceDate} onChange={e => setSinceDate(e.target.value)} className="w-full px-2 py-2 text-xs border-2 border-slate-200 rounded-lg font-bold"/>
        </div>
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Until</label>
          <input type="date" value={untilDate} onChange={e => setUntilDate(e.target.value)} className="w-full px-2 py-2 text-xs border-2 border-slate-200 rounded-lg font-bold"/>
        </div>
        <div className="col-span-2 sm:col-span-4 lg:col-span-1">
          <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Search row id / user</label>
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="…" className="w-full pl-7 pr-2 py-2 text-xs border-2 border-slate-200 rounded-lg font-bold"/>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-widest border-b">
              <tr>
                <th className="px-3 py-2.5 w-32">When</th>
                <th className="px-3 py-2.5 w-24">Op</th>
                <th className="px-3 py-2.5">Table</th>
                <th className="px-3 py-2.5">Row ID</th>
                <th className="px-3 py-2.5">By</th>
                <th className="px-3 py-2.5 text-right">Δ Fields</th>
                <th className="px-3 py-2.5 text-right w-32">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={7} className="p-12 text-center text-slate-300 italic font-bold">Loading…</td></tr>}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={7} className="p-12 text-center text-slate-300 italic font-bold">No audit entries match the filters.</td></tr>
              )}
              {visible.map(e => {
                const meta = OP_PILL[e.operation] || OP_PILL.UPDATE;
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-[10px] text-slate-500 font-bold whitespace-nowrap">
                      <Calendar size={10} className="inline mr-1 text-slate-300"/>{e.changedAt?.replace('T', ' ').slice(0, 16)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded inline-flex items-center gap-1 ${meta.tone}`}>
                        {meta.icon} {e.opLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-700"><FileText size={11} className="inline mr-1 text-slate-400"/>{e.tableName}</td>
                    <td className="px-3 py-2.5 font-mono font-black text-slate-800 text-[11px]">{e.rowId}</td>
                    <td className="px-3 py-2.5 text-slate-600 font-bold"><User size={11} className="inline mr-1 text-slate-400"/>{e.changedByShort || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-700">
                      {e.changedFieldCount !== null ? e.changedFieldCount : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <RowHistoryButton table={e.tableName} rowId={e.rowId} variant="button"/>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const KpiTile: React.FC<{ label: string; value: number; tone: 'emerald' | 'blue' | 'rose'; icon: React.ReactNode }> = ({ label, value, tone, icon }) => {
  const cls = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue:    'bg-blue-50 border-blue-200 text-blue-700',
    rose:    'bg-rose-50 border-rose-200 text-rose-700',
  }[tone];
  return (
    <div className={`rounded-2xl border-2 ${cls} p-3`}>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-80">
        {icon}<span>{label}</span>
      </div>
      <div className="text-2xl font-black mt-1">{value}</div>
    </div>
  );
};

export default AuditorView;
