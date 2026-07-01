/**
 * CutoverWizard.tsx — Sprint 30
 *
 * Single-page orchestrator for the go-live cutover. Shows:
 *   - Cutover date picker
 *   - 5-step checklist (Masters / Stock OB / GL OB / AR OB / AP OB)
 *   - Recent import history
 *   - LOCK button (only enabled when all 5 done) — disables back-dating
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { toast } from 'sonner';
import {
  Calendar, CheckCircle2, Circle, Lock, AlertCircle, RefreshCw, ArrowRight,
  Users, Package, Wallet, FileText, Receipt, ShieldCheck, History,
} from 'lucide-react';
import {
  loadCutoverSnapshot, saveCutoverSnapshot, markChecklistItem, lockCutover,
  recentImports, CutoverSnapshot, ImportLogRow,
} from '@/modules/finance/services/cutoverService';
import { formatDateTime } from '@/modules/shared/utils/format';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';

interface ChecklistItem {
  key:         keyof Pick<CutoverSnapshot, 'masters_loaded' | 'stock_ob_done' | 'gl_ob_done' | 'ar_ob_done' | 'ap_ob_done'>;
  title:       string;
  description: string;
  icon:        React.ReactNode;
  route:       string;
  routeLabel:  string;
}

const CHECKLIST: ChecklistItem[] = [
  {
    key: 'masters_loaded',
    title: 'Master Data',
    description: 'Import clients and products (CSV or manual entry).',
    icon: <Users size={18}/>,
    route: '/sales/client-import',
    routeLabel: 'Import Clients',
  },
  {
    key: 'stock_ob_done',
    title: 'Stock Opening Balance',
    description: 'Enter material on-hand quantities at go-live date.',
    icon: <Package size={18}/>,
    route: '/inventory',
    routeLabel: 'Stock OB',
  },
  {
    key: 'gl_ob_done',
    title: 'GL Opening Balance',
    description: 'Post the opening trial balance journal (Dr/Cr per account).',
    icon: <Wallet size={18}/>,
    route: '/accounts',
    routeLabel: 'Open GL',
  },
  {
    key: 'ar_ob_done',
    title: 'AR Opening Balance',
    description: 'Load outstanding customer invoices as of cutover.',
    icon: <FileText size={18}/>,
    route: '/finance/ar-opening',
    routeLabel: 'Load AR OB',
  },
  {
    key: 'ap_ob_done',
    title: 'AP Opening Balance',
    description: 'Load outstanding vendor bills as of cutover (optional for Glassco).',
    icon: <Receipt size={18}/>,
    route: '/requisitions',
    routeLabel: 'Open AP',
  },
];

const fmt = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('en-PK') : '—';

const CutoverWizard: React.FC = () => {
  const nav = useNavigate();
  const { user, profile } = useAuthStore();
  const company           = useAppStore(s => s.selectedCompany) ?? profile?.company ?? user?.company ?? 'Glassco';

  const [snapshot, setSnapshot] = useState<CutoverSnapshot | null>(null);
  const [imports,  setImports]  = useState<ImportLogRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [savingDate, setSavingDate] = useState(false);

  const load = async () => {
    setLoading(true);
    const [snap, imps] = await Promise.all([
      loadCutoverSnapshot(company),
      recentImports(company, 10),
    ]);
    if (snap.error) toast.error('Failed to load cutover snapshot');
    setSnapshot(snap.data ?? null);
    setImports(imps.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [company]);

  // Persist date change immediately
  const updateDate = async (cutoverDate: string) => {
    if (!snapshot) return;
    setSavingDate(true);
    const { data, error } = await saveCutoverSnapshot({
      ...snapshot,
      cutover_date: cutoverDate,
      status: snapshot.status === 'locked' ? 'locked' : 'in_progress',
    });
    setSavingDate(false);
    if (error) toast.error(error);
    else if (data) setSnapshot(data);
  };

  const toggleManual = async (key: ChecklistItem['key']) => {
    if (!snapshot || snapshot.status === 'locked') return;
    const next = !snapshot[key];
    const { data, error } = await markChecklistItem(company, key, next);
    if (error) toast.error(error);
    else if (data) setSnapshot(data);
  };

  const handleLock = async () => {
    if (!snapshot) return;
    if (!await confirmModal('Lock the cutover? After locking, you cannot back-date entries before the cutover date. Continue?')) return;
    const { data, error } = await lockCutover(company, user?.email ?? 'unknown');
    if (error) {
      toast.error(error);
    } else if (data) {
      toast.success('Cutover locked. Live operations may begin.');
      setSnapshot(data);
    }
  };

  if (loading || !snapshot) {
    return <div className="py-16 text-center text-slate-300 text-xs font-bold">Loading cutover state…</div>;
  }

  const completedCount = CHECKLIST.filter(c => snapshot[c.key]).length;
  const allDone        = completedCount === CHECKLIST.length;
  const isLocked       = snapshot.status === 'locked';

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className={`p-6 rounded-[2rem] shadow-xl text-white ${isLocked ? 'bg-gradient-to-r from-emerald-900 to-emerald-700' : 'bg-gradient-to-r from-slate-900 to-indigo-900'}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              {isLocked ? <ShieldCheck size={20}/> : <Calendar size={20}/>} Go-Live Cutover Wizard
            </h2>
            <p className="text-2xs text-white/70 font-bold uppercase tracking-widest mt-0.5">
              {company} · Sprint 30 · {isLocked ? 'LOCKED' : 'In Progress'} · {completedCount}/{CHECKLIST.length} steps complete
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/20">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/> Refresh
          </button>
        </div>
      </div>

      {/* Cutover date */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-2xs font-black text-slate-400 uppercase tracking-widest">Cutover Date</p>
            <p className="text-sm text-slate-500 mt-0.5">First day live entries should be posted. Earlier dates will be blocked once locked.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={snapshot.cutover_date ?? ''} disabled={isLocked}
              onChange={e => updateDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:border-blue-400 disabled:bg-slate-100"/>
            {savingDate && <RefreshCw size={14} className="animate-spin text-slate-400"/>}
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-3">
        {CHECKLIST.map((item, i) => {
          const done = snapshot[item.key];
          return (
            <div key={item.key} className={`bg-white border rounded-2xl p-4 flex items-center gap-4 ${done ? 'border-emerald-200' : 'border-slate-200'}`}>
              <button onClick={() => toggleManual(item.key)} disabled={isLocked}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${done ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'} disabled:opacity-60`}>
                {done ? <CheckCircle2 size={20}/> : <Circle size={20}/>}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-2xs font-black px-1.5 py-0.5 rounded ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>STEP {i + 1}</span>
                  <p className="text-sm font-black text-slate-900 flex items-center gap-1.5">{item.icon} {item.title}</p>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
              </div>
              <button onClick={() => nav(item.route)}
                className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center gap-1">
                {item.routeLabel} <ArrowRight size={12}/>
              </button>
            </div>
          );
        })}
      </div>

      {/* Lock action */}
      <div className={`border rounded-2xl p-5 ${isLocked ? 'bg-emerald-50 border-emerald-200' : allDone ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
        {isLocked ? (
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-emerald-700" size={24}/>
            <div>
              <p className="text-sm font-black text-emerald-900">Cutover Locked</p>
              <p className="text-2xs text-emerald-700 mt-0.5">
                Locked on {fmt(snapshot.locked_at)} by {snapshot.locked_by ?? '—'} · cutover date {fmt(snapshot.cutover_date)}
              </p>
            </div>
          </div>
        ) : allDone ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-blue-700" size={24}/>
              <div>
                <p className="text-sm font-black text-blue-900">All steps complete. Ready to lock cutover.</p>
                <p className="text-2xs text-blue-700 mt-0.5">Locking is irreversible. Entries on/before {fmt(snapshot.cutover_date)} will be blocked.</p>
              </div>
            </div>
            <button onClick={handleLock}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black hover:bg-emerald-700 flex items-center gap-1">
              <Lock size={14}/> Lock Cutover
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <AlertCircle className="text-amber-700" size={24}/>
            <div>
              <p className="text-sm font-black text-amber-900">{CHECKLIST.length - completedCount} step(s) remaining</p>
              <p className="text-2xs text-amber-700 mt-0.5">Complete the checklist above before locking the cutover.</p>
            </div>
          </div>
        )}
      </div>

      {/* Recent imports */}
      {imports.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <History size={14} className="text-slate-500"/>
            <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Recent Imports</p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-100">
              <tr>
                {['When', 'Type', 'File', 'Attempted', 'Success', 'Failed', 'By'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-black text-2xs text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {imports.map((r, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                  <td className="px-3 py-2 text-slate-500">{r.imported_at ? formatDateTime(r.imported_at) : '—'}</td>
                  <td className="px-3 py-2 font-mono font-bold text-slate-700">{r.import_type}</td>
                  <td className="px-3 py-2 text-slate-600">{r.file_name}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700">{r.rows_attempted}</td>
                  <td className="px-3 py-2 text-right text-emerald-700 font-bold">{r.rows_succeeded}</td>
                  <td className="px-3 py-2 text-right text-rose-700 font-bold">{r.rows_failed}</td>
                  <td className="px-3 py-2 text-slate-500">{r.imported_by ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CutoverWizard;
