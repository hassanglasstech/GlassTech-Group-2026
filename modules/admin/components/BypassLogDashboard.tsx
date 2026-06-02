/**
 * BypassLogDashboard.tsx — Design System v2
 *
 * GRC Control Exception Register dashboard.
 * Shows all bypass_log entries with SLA tracking, module filters, and resolution workflow.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import { CompactPageHeader } from '@/modules/shared/components/CompactPageHeader';
import { DataGridCard, GridColumn } from '@/modules/shared/components/DataGridCard';
import {
  ShieldAlert, RefreshCw, Download, CheckCircle2, Clock, AlertTriangle,
  X, Filter, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface BypassEntry {
  id: string;
  user_name: string;
  module: string;
  rule_bypassed: string;
  record_id: string;
  bypass_reason: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  addressing_date: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  company: string;
  created_at: string;
  days_open?: number;
  sla_status?: string;
}

const MODULES = ['All', 'Finance', 'HR', 'Sales', 'SCM', 'Production', 'HSE', 'Admin'];
const STATUSES = ['All', 'Open', 'In Progress', 'Resolved'];

const BypassLogDashboard: React.FC = () => {
  const [entries, setEntries] = useState<BypassEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterModule, setFilterModule] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [resolveModal, setResolveModal] = useState<BypassEntry | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('bypass_log_overdue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      // Also load resolved entries
      const { data: resolved } = await supabase
        .from('bypass_log')
        .select('*')
        .eq('status', 'Resolved')
        .order('created_at', { ascending: false })
        .limit(100);

      const all = [
        ...(data || []).map((d: any) => ({ ...d, days_open: d.days_open, sla_status: d.sla_status })),
        ...(resolved || []).map((d: any) => ({ ...d, days_open: 0, sla_status: 'resolved' })),
      ];
      // Deduplicate by id
      const unique = Array.from(new Map(all.map(e => [e.id, e])).values());
      setEntries(unique as BypassEntry[]);
    } catch {
      toast.error('Failed to load bypass log.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('erp:refresh', handler);
    return () => window.removeEventListener('erp:refresh', handler);
  }, [loadData]);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filterModule !== 'All' && e.module !== filterModule) return false;
      if (filterStatus !== 'All' && e.status !== filterStatus) return false;
      return true;
    });
  }, [entries, filterModule, filterStatus]);

  // KPIs
  const kpis = useMemo(() => {
    const open = entries.filter(e => e.status !== 'Resolved');
    const overdue = open.filter(e => e.sla_status === 'overdue' || e.sla_status === 'critical');
    const resolvedThisWeek = entries.filter(e => {
      if (e.status !== 'Resolved' || !e.resolved_at) return false;
      const d = new Date(e.resolved_at);
      const now = new Date();
      return (now.getTime() - d.getTime()) < 7 * 86400000;
    });
    const byModule: Record<string, number> = {};
    open.forEach(e => { byModule[e.module] = (byModule[e.module] || 0) + 1; });
    return { open: open.length, overdue: overdue.length, resolvedWeek: resolvedThisWeek.length, byModule };
  }, [entries]);

  const handleUpdateStatus = async (id: string, status: 'In Progress' | 'Resolved', notes?: string) => {
    try {
      const update: any = { status, updated_at: new Date().toISOString() };
      if (status === 'Resolved') {
        update.resolved_by = 'Admin';
        update.resolved_at = new Date().toISOString();
        update.resolution_notes = notes || '';
      }
      const { error } = await supabase.from('bypass_log').update(update).eq('id', id);
      if (error) throw error;
      toast.success(`Bypass ${status === 'Resolved' ? 'resolved' : 'updated'}.`);
      setResolveModal(null);
      setResolveNotes('');
      loadData();
    } catch {
      toast.error('Update failed.');
    }
  };

  const handleExport = () => {
    const data = filtered.map(e => ({
      'ID': e.id,
      'Date': new Date(e.created_at).toLocaleDateString(),
      'User': e.user_name,
      'Module': e.module,
      'Rule Bypassed': e.rule_bypassed,
      'Record ID': e.record_id,
      'Reason': e.bypass_reason,
      'Status': e.status,
      'Days Open': e.days_open || 0,
      'SLA': e.sla_status || 'resolved',
      'Addressing Date': e.addressing_date || '',
      'Resolution': e.resolution_notes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bypass Log');
    XLSX.writeFile(wb, `BypassLog_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const columns: GridColumn[] = [
    { key: 'date', header: 'Date' },
    { key: 'user', header: 'User' },
    { key: 'module', header: 'Module' },
    { key: 'rule', header: 'Rule Bypassed' },
    { key: 'record', header: 'Record ID' },
    { key: 'status', header: 'Status', align: 'center' },
    { key: 'days', header: 'Days', align: 'center' },
    { key: 'addressing', header: 'Fix By' },
    { key: 'actions', header: '', width: '8%' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <CompactPageHeader
        title="Control Exception Register"
        subtitle="GRC"
        breadcrumbs={[{ label: 'Basis Admin' }, { label: 'Exception Register' }]}
        actions={[
          { label: 'Export', icon: <Download size={12} />, onClick: handleExport, variant: 'secondary' },
          { label: 'Refresh', icon: <RefreshCw size={12} />, onClick: () => window.dispatchEvent(new CustomEvent('erp:refresh')), variant: 'ghost', shortcut: 'Alt+R' },
        ]}
        meta={
          <div className="flex items-center gap-2">
            {kpis.overdue > 0 && <span className="text-[10px] font-black text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded animate-pulse">{kpis.overdue} Overdue</span>}
            <span className="text-[10px] font-black text-slate-400 uppercase">{kpis.open} Open</span>
          </div>
        }
      />

      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-3">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-1.5 mb-1"><Clock size={12} className="text-amber-500" /><span className="text-[9px] font-black text-slate-400 uppercase">Open</span></div>
            <span className="text-xl font-black text-amber-600">{kpis.open}</span>
          </div>
          <div className={`bg-white rounded-lg border p-3 ${kpis.overdue > 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
            <div className="flex items-center gap-1.5 mb-1"><AlertTriangle size={12} className="text-rose-500" /><span className="text-[9px] font-black text-slate-400 uppercase">Overdue (&gt;3 days)</span></div>
            <span className={`text-xl font-black ${kpis.overdue > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{kpis.overdue}</span>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-1.5 mb-1"><CheckCircle2 size={12} className="text-emerald-500" /><span className="text-[9px] font-black text-slate-400 uppercase">Resolved (7d)</span></div>
            <span className="text-xl font-black text-emerald-600">{kpis.resolvedWeek}</span>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-1.5 mb-1"><FileText size={12} className="text-blue-500" /><span className="text-[9px] font-black text-slate-400 uppercase">By Module</span></div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {Object.entries(kpis.byModule).map(([m, c]) => (
                <span key={m} className="text-[8px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{m}: {c}</span>
              ))}
              {Object.keys(kpis.byModule).length === 0 && <span className="text-[9px] text-slate-300">Clean</span>}
            </div>
          </div>
        </div>

        {/* Data Grid */}
        <DataGridCard
          columns={columns}
          className="flex-1"
          loading={loading}
          emptyState={<span className="text-xs text-slate-300 font-bold">No bypass entries recorded.</span>}
          toolbar={
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={12} className="text-slate-400" />
              <select className="text-[10px] font-bold border border-slate-200 rounded px-2 py-1 bg-white" value={filterModule} onChange={e => setFilterModule(e.target.value)}>
                {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className="text-[10px] font-bold border border-slate-200 rounded px-2 py-1 bg-white" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="text-[9px] font-bold text-slate-400 ml-auto">{filtered.length} entries</span>
            </div>
          }
        >
          {filtered.map((e, ri) => {
            const daysOpen = e.days_open ?? Math.floor((Date.now() - new Date(e.created_at).getTime()) / 86400000);
            const isOverdue = e.status !== 'Resolved' && daysOpen > 3;
            const isCritical = e.status !== 'Resolved' && daysOpen > 7;
            return (
              <tr key={e.id} className={[
                'border-b border-slate-100 last:border-0',
                ri % 2 === 1 ? 'bg-slate-50/50' : 'bg-white',
                e.status === 'Resolved' ? 'opacity-60' : '',
                isCritical ? 'bg-rose-50/50' : isOverdue ? 'bg-amber-50/30' : '',
                'hover:bg-slate-50/70 transition-colors',
              ].join(' ')}>
                <td className="py-1.5 px-3 text-xs text-slate-600">{new Date(e.created_at).toLocaleDateString()}</td>
                <td className="py-1.5 px-3 text-xs font-bold text-slate-700">{e.user_name}</td>
                <td className="py-1.5 px-3"><span className="text-[9px] font-black uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{e.module}</span></td>
                <td className="py-1.5 px-3 text-xs text-slate-700">{e.rule_bypassed}</td>
                <td className="py-1.5 px-3 text-xs text-blue-600 font-bold">{e.record_id || '—'}</td>
                <td className="py-1.5 px-3 text-center">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                    e.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700' :
                    e.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                    isOverdue ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                  }`}>{e.status}</span>
                </td>
                <td className="py-1.5 px-3 text-center">
                  <span className={`text-[10px] font-black ${isCritical ? 'text-rose-600' : isOverdue ? 'text-amber-600' : 'text-slate-500'}`}>
                    {e.status === 'Resolved' ? '—' : `${daysOpen}d`}
                  </span>
                </td>
                <td className="py-1.5 px-3 text-xs text-slate-500">{e.addressing_date || '—'}</td>
                <td className="py-1.5 px-3">
                  {e.status !== 'Resolved' && (
                    <div className="flex gap-1">
                      {e.status === 'Open' && (
                        <button onClick={() => handleUpdateStatus(e.id, 'In Progress')} className="text-[9px] font-bold text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded transition-colors">WIP</button>
                      )}
                      <button onClick={() => { setResolveModal(e); setResolveNotes(''); }} className="text-[9px] font-bold text-emerald-600 hover:bg-emerald-50 px-1.5 py-0.5 rounded transition-colors">Resolve</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </DataGridCard>
      </div>

      {/* Resolve Modal */}
      {resolveModal && (
        <div className="fixed inset-0 bg-black/50 z-[500] flex items-center justify-center p-4" onClick={() => setResolveModal(null)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-sm font-black text-slate-800 uppercase">Resolve Bypass</h3>
              <button onClick={() => setResolveModal(null)} className="p-1 hover:bg-slate-100 rounded"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-slate-50 rounded p-3">
                <p className="text-[10px] font-black text-slate-400 uppercase">Rule Bypassed</p>
                <p className="text-xs font-bold text-slate-700 mt-0.5">{resolveModal.rule_bypassed}</p>
                <p className="text-[10px] text-slate-500 mt-1">{resolveModal.module} | {resolveModal.record_id || 'No record'}</p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Resolution Notes *</label>
                <textarea
                  className="w-full border border-slate-200 rounded px-3 py-2 text-xs resize-none focus:outline-none focus:border-blue-300"
                  rows={3}
                  placeholder="How was this exception resolved? What corrective action was taken?"
                  value={resolveNotes}
                  onChange={e => setResolveNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-100">
              <button onClick={() => setResolveModal(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded transition-colors">Cancel</button>
              <button
                onClick={() => resolveNotes.trim() ? handleUpdateStatus(resolveModal.id, 'Resolved', resolveNotes) : toast.error('Resolution notes required.')}
                className="px-4 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
              >Mark Resolved</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BypassLogDashboard;
