import React, { useState, useRef, useEffect } from 'react';
import UserAccessManager from '@/modules/auth/UserAccessManager';
import { toast } from 'sonner';
import { Company, ActivityLog } from '../types';
import { AppService } from '../services/appService';
import {
  ShieldCheck, Database, FileUp, Download,
  History, Users, X, Info, Activity, Filter, RefreshCw, BarChart2,
  AlertTriangle, Trash2, Archive, ShieldAlert, Zap, CheckCircle2, Loader2, Percent
} from 'lucide-react';

import { useAppStore } from '../store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';

import GlasscoDataWiper from '@/modules/shared/components/GlasscoDataWiper';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
const BypassLogDashboard = React.lazy(() => import('@/modules/admin/components/BypassLogDashboard'));
const TaxSettingsPage = React.lazy(() => import('@/modules/admin/pages/TaxSettings'));

const AdminSecurity: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const { user } = useAuthStore();
  // Users tab visible to anyone in the "Hassan-tier" full-access roles.
  // Previously was gated by company === 'Factory' (UX trap — user had to
  // switch company to Factory just to see User Roles).
  const canManageUsers = ['super_admin', 'owner', 'hassan'].includes(user?.role || '');
  const [activeTab, setActiveTab] = useState<'command_center' | 'admin' | 'users' | 'data_reset' | 'exceptions' | 'tax'>('command_center');
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filterModule, setFilterModule] = useState<string>('All');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshLogs();
  }, [company]);

  const [backupHistory, setBackupHistory] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);

  // ── NUCLEAR WIPE STATE ──────────────────────────────────────────────
  const [nukeLoading, setNukeLoading] = useState(false);
  const [nukeLog, setNukeLog] = useState<{ table: string; ok: boolean; msg: string }[]>([]);
  const [nukeConfirmText, setNukeConfirmText] = useState('');
  const [nukePhase, setNukePhase] = useState<'idle' | 'running' | 'done'>('idle');

  const refreshLogs = async () => {
    const allLogs = await AppService.getActivityLogsAsync();
    setLogs(allLogs.filter(l => l.company === company).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  };

  const loadBackupHistory = async () => {
    try {
      const { supabase } = await import('@/src/services/supabaseClient');
      const { data } = await supabase.from('erp_backups').select('*').order('backup_date', { ascending: false }).limit(10);
      if (data) setBackupHistory(data);
    } catch { /* Supabase unavailable */ }
  };

  useEffect(() => { loadBackupHistory(); }, []);

  const handleManualBackup = async () => {
    setBackupLoading(true);
    try {
      await AppService.exportDatabaseToFile(false);
      await loadBackupHistory();
    } finally {
      setBackupLoading(false);
    }
  };
  const handleManualRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!await confirmModal("CRITICAL: Overwrite database with backup file? This will replace all current data.")) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (await AppService.importDatabaseFromFile(content)) {
        toast.success("System Restored Successfully. Application will reload.", { duration: 3000 });
        window.location.reload();
      }
    };
    reader.readAsText(file);
  };

  const handleModuleReset = async (moduleName: string) => {
      if (confirm(`WARNING: Are you sure you want to delete ALL ${moduleName} data for ${company}?\n\nThis action is specific to ${company} and cannot be undone.`)) {
          await AppService.clearModuleData(moduleName as any, company);
          toast.error(`${moduleName} data for ${company} has been wiped successfully.`, { duration: 4000 });
          window.location.reload();
      }
  };

  const handleFactoryReset = () => {
    if (confirm("CRITICAL WARNING: This action will PERMANENTLY DELETE ALL DATA for ALL COMPANIES (GTK, GTI, GlassCo, etc.) stored in this browser.\n\nThis includes Employees, Inventory, Orders, and Financial Records.\n\nAre you sure you want to perform a Factory Reset?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  // ── NUCLEAR WIPE: localStorage + Supabase ────────────────────────────
  // ⚠ TESTING ONLY — Remove this button before go-live
  const ALL_APP_TABLES = [
    // Finance
    'ledger', 'accounts', 'cost_centers', 'petty_cash', 'recurring_expenses',
    'financial_events', 'mapping_rules', 'gl_config', 'budgets',
    // Sales
    'clients', 'quotations', 'invoices', 'payment_receipts', 'credit_notes', 'projects',
    // HR
    'employees', 'attendance', 'loans', 'payroll', 'leave_applications',
    'leave_types', 'holidays', 'overtimes', 'advance_salaries', 'gratuity_balances',
    'employee_documents', 'employee_qualifications', 'employee_licenses',
    'performance_reviews', 'disciplinary_actions', 'exit_interviews',
    'shift_master', 'bypass_logs', 'departments', 'tag_master',
    // Procurement / Inventory
    'store_items', 'stock_ledger', 'requisitions', 'purchase_orders',
    'grn_sheet_entries', 'vendor_defect_reports', 'inspection_lots',
    'remnants', 'remnant_history', 'handling_units', 'scrap_disposals',
    'manual_count_sheets', 'vendor_reviews', 'pallet_rates', 'weight_master',
    'stock_locations', 'cutting_sessions',
    // Vendors
    'vendors', 'products',
    // Production
    'production_pieces', 'job_orders', 'gate_passes', 'warehouse_spots',
    'ncr_events', 'ncr_reproductions', 'ncr_claims', 'ncr_remnants',
    'tempering_dispatches', 'cutter_daily_logs',
    // Logistics
    'vehicles', 'vehicle_trips', 'vehicle_expenses',
    // Logs / Config
    'activity_logs', 'erp_config', 'assets',
  ];

  const handleNuclearWipe = async () => {
    if (nukeConfirmText !== 'DELETE ALL') {
      toast.error('Type "DELETE ALL" exactly to confirm.');
      return;
    }
    const confirmed = await confirmModal(
      '☢ NUCLEAR RESET: This will permanently delete ALL ERP data from localStorage AND Supabase.\n\nUser profiles and login accounts will be preserved.\n\nThis CANNOT be undone. Proceed?'
    );
    if (!confirmed) return;

    setNukePhase('running');
    setNukeLoading(true);
    setNukeLog([]);
    const log = (table: string, ok: boolean, msg: string) =>
      setNukeLog(prev => [...prev, { table, ok, msg }]);

    try {
      const { supabase } = await import('@/src/services/supabaseClient');

      // 1. Wipe Supabase tables one by one
      for (const table of ALL_APP_TABLES) {
        try {
          const { error } = await supabase.from(table).delete().gt('created_at', '1900-01-01');
          if (error) log(table, false, error.message);
          else log(table, true, 'cleared');
        } catch (e: unknown) {
          log(table, false, e instanceof Error ? e.message : 'unknown error');
        }
      }

      // 2. Wipe localStorage (keep Supabase auth tokens)
      const keysToKeep: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase.auth'))) {
          keysToKeep.push(key);
        }
      }
      const savedVals: Record<string, string> = {};
      keysToKeep.forEach(k => { savedVals[k] = localStorage.getItem(k) ?? ''; });
      localStorage.clear();
      keysToKeep.forEach(k => localStorage.setItem(k, savedVals[k]));

      log('localStorage', true, 'all ERP keys cleared (auth preserved)');
      setNukePhase('done');
      toast.success('☢ Nuclear Wipe Complete — reloading in 3s…', { duration: 3000 });
      setTimeout(() => window.location.reload(), 3000);
    } catch (e: unknown) {
      toast.error('Nuclear wipe failed: ' + (e instanceof Error ? e.message : String(e)));
      setNukePhase('idle');
    } finally {
      setNukeLoading(false);
    }
  };

  const handleArchive = async () => {
      const year = new Date().getFullYear() - 1; // Archive last year
      if (confirm(`Archive data from ${year} and earlier?\n\nThis will move old transactions to the Archive Store to improve performance.`)) {
          const count = await AppService.archiveYearData(year);
          toast.error(`Archived ${count} records successfully.`, { duration: 4000 });
          refreshLogs();
      }
  };

  const getFilteredLogs = () => {
      if (filterModule === 'All') return logs;
      return logs.filter(l => l.module === filterModule);
  };

  const getStats = () => {
      const today = new Date().toISOString().split('T')[0];
      const todayLogs = logs.filter(l => l.timestamp.startsWith(today));
      
      const salesCount = todayLogs.filter(l => l.module === 'Sales').length;
      const financeCount = todayLogs.filter(l => l.module === 'Finance').length;
      const invCount = todayLogs.filter(l => l.module === 'Inventory').length;
      
      return { totalToday: todayLogs.length, salesCount, financeCount, invCount };
  };

  const stats = getStats();

  return (
    <div className="flex flex-col h-full bg-[#eff4f9] animate-in fade-in duration-300">
      <div className="sap-page-header shrink-0">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center space-x-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
               <ShieldCheck size={14} className="text-blue-600"/> <span>System Governance & Audit</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Admin Command Center</h2>
          </div>
          <div className="flex items-center space-x-3">
             <div className="px-3 py-1 bg-blue-50 border border-blue-200 rounded text-[10px] font-bold text-blue-700 uppercase">Production Client: {company}</div>
          </div>
        </div>

        <div className="flex border-b border-slate-200 gap-8">
          {[
            { id: 'command_center', label: 'Live Activity Feed', icon: Activity },
            { id: 'admin', label: 'Basis (DB Management)', icon: Database },
          { id: 'data_reset', label: 'Data Reset', icon: ShieldCheck },
            { id: 'exceptions', label: 'Exception Register', icon: ShieldAlert },
            { id: 'tax', label: 'Tax / GST', icon: Percent },
            ...(canManageUsers ? [{ id: 'users', label: 'User Roles (SU01)', icon: Users }] : []),
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 pb-3 pt-1 text-sm font-semibold border-b-4 transition-all ${
                activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'tax' && (
          <React.Suspense fallback={<div className="p-8 text-slate-400 text-sm">Loading Tax Settings…</div>}>
            <TaxSettingsPage />
          </React.Suspense>
        )}
        {activeTab === 'command_center' && (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-2xl border shadow-sm">
                        <div className="flex justify-between items-start">
                            <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Actions Today</p><p className="text-3xl font-black text-slate-800 mt-1">{stats.totalToday}</p></div>
                            <div className="p-2 bg-slate-100 rounded-lg"><Activity size={20} className="text-slate-600"/></div>
                        </div>
                    </div>
                    {/* ... (Other stat cards remain same) ... */}
                </div>

                <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                        <div className="flex items-center space-x-3"><History size={18} className="text-slate-500"/><h3 className="font-bold text-slate-700 text-sm uppercase">System Audit Trail</h3></div>
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2 bg-white px-2 py-1 rounded border"><Filter size={14} className="text-slate-400"/><select className="text-xs font-bold bg-transparent outline-none" value={filterModule} onChange={(e) => setFilterModule(e.target.value)}><option value="All">All Modules</option><option value="Sales">Sales</option><option value="Finance">Finance</option><option value="Inventory">Inventory</option><option value="Production">Production</option><option value="Security">Security</option></select></div>
                            <button onClick={refreshLogs} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><RefreshCw size={16} className="text-slate-500"/></button>
                        </div>
                    </div>
                    <div className="overflow-x-auto max-h-[600px]">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-500 sticky top-0"><tr><th className="px-6 py-3">Timestamp</th><th className="px-6 py-3">User</th><th className="px-6 py-3">Module</th><th className="px-6 py-3">Action</th><th className="px-6 py-3 w-1/3">Description</th><th className="px-6 py-3 text-right">Value (PKR)</th></tr></thead>
                            <tbody className="divide-y">
                                {getFilteredLogs().map(log => (
                                    <tr key={log.id} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-6 py-3 font-mono text-xs text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                                        <td className="px-6 py-3 font-bold text-slate-700 text-xs">{log.user}</td>
                                        <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${log.module === 'Finance' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{log.module}</span></td>
                                        <td className="px-6 py-3 text-xs font-bold uppercase">{log.action}</td>
                                        <td className="px-6 py-3 text-xs text-slate-600 truncate max-w-xs" title={log.description}>{log.description}</td>
                                        <td className="px-6 py-3 text-right font-mono text-xs font-bold">{log.amount ? log.amount.toLocaleString() : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'admin' && (
          <div className="max-w-6xl space-y-8">
            <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
               <div className="bg-[#f2f2f2] px-6 py-3 border-b border-slate-200"><h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Database Infrastructure (Basis)</h4></div>
               <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-6">
                     <p className="text-sm font-medium text-slate-500">Manage local data persistence and system snapshots for {company}.</p>
                     <div className="flex flex-col space-y-3">
                        <button onClick={handleManualBackup} disabled={backupLoading} className="sap-btn-primary flex items-center justify-center space-x-3 w-full disabled:opacity-60">
                          {backupLoading ? <RefreshCw size={16} className="animate-spin"/> : <Download size={16}/>}
                          <span>{backupLoading ? 'Fetching from Supabase...' : 'Export Full Backup (Supabase)'}</span>
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} className="sap-btn-ghost flex items-center justify-center space-x-3 w-full"><FileUp size={16}/> <span>Restore from JSON Backup</span></button>
                        <input type="file" ref={fileInputRef} onChange={handleManualRestore} className="hidden" accept=".json" />
                        <button onClick={handleArchive} className="bg-amber-100 text-amber-700 px-4 py-2 rounded-xl text-xs font-bold uppercase hover:bg-amber-200 flex items-center justify-center gap-2"><Archive size={16}/> <span>Archive Old Data</span></button>
                     </div>
                     {backupHistory.length > 0 && (
                       <div className="mt-4">
                         <p className="text-xs font-bold text-slate-500 uppercase mb-2">Recent Backups</p>
                         <div className="space-y-1">
                           {backupHistory.map((b: any) => (
                             <div key={b.id} className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded border border-slate-100">
                               <span className="text-slate-700 font-medium">{b.backup_type}</span>
                               <span className="text-slate-400">{new Date(b.backup_date).toLocaleString()}</span>
                               <span className="text-blue-600">{b.record_count?.toLocaleString()} records</span>
                             </div>
                           ))}
                         </div>
                       </div>
                     )}
                  </div>
                  <div className="bg-blue-50 border border-blue-100 p-6 rounded flex items-start space-x-4">
                     <Info size={20} className="text-blue-600 shrink-0" />
                     <div><h5 className="text-xs font-bold text-blue-800 uppercase mb-1">Performance Mode</h5><p className="text-xs text-blue-700 leading-relaxed uppercase">System uses IndexedDB for high-volume datasets (Ledger, Production). Archived data is moved to cold storage to keep the app fast.</p></div>
                  </div>
               </div>
            </div>

            <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden mt-6">
               <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center space-x-2"><Database size={16} className="text-slate-600"/><h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Modular Maintenance</h4></div>
               <div className="p-8">
                  <p className="text-sm text-slate-500 mb-6 font-medium">Select a specific module to reset its data for {company}.</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                     {['HR', 'Sales', 'Inventory', 'Production', 'Finance', 'Logistics'].map(mod => (
                         <button key={mod} onClick={() => handleModuleReset(mod)} className="flex flex-col items-center justify-center p-4 border border-slate-200 rounded-xl hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 transition-all group bg-white shadow-sm">
                            <Trash2 size={24} className="mb-2 text-slate-300 group-hover:text-rose-500 transition-colors"/>
                            <span className="font-black text-[10px] uppercase tracking-wider">{mod} Data</span>
                         </button>
                     ))}
                  </div>
               </div>
            </div>

            <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden mt-6">
               <div className="bg-rose-50 px-6 py-3 border-b border-rose-100 flex items-center space-x-2"><AlertTriangle size={16} className="text-rose-600"/><h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider">Danger Zone</h4></div>
               <div className="p-8 flex items-center justify-between">
                  <div><h5 className="text-sm font-bold text-slate-800 uppercase mb-1">Factory Reset System</h5><p className="text-xs text-slate-500 max-w-lg">Permanently delete ALL ERP data stored in this browser. This action cannot be undone.</p></div>
                  <button onClick={handleFactoryReset} className="bg-rose-600 text-white px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-rose-700 transition-all flex items-center space-x-2"><Trash2 size={16}/> <span>Wipe All Data</span></button>
               </div>
            </div>
          </div>
        )}
      {activeTab === 'data_reset' && (
          <div className="p-6 space-y-6">
            <GlasscoDataWiper />

            {/* ── ☢ NUCLEAR WIPE — TESTING ONLY ─────────────────────────────── */}
            {/* TODO: Remove this entire block before go-live */}
            <div className="border-2 border-red-500 rounded-2xl overflow-hidden">
              <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
                <Zap size={20} className="text-yellow-300 animate-pulse" />
                <div>
                  <p className="text-white font-black text-sm uppercase tracking-widest">☢ Nuclear Reset</p>
                  <p className="text-red-200 text-[10px] font-medium mt-0.5">TESTING ONLY — Remove before go-live</p>
                </div>
              </div>

              <div className="bg-red-50 p-6 space-y-4">
                <p className="text-red-800 text-xs font-semibold">
                  Permanently deletes ALL data from <span className="font-black">localStorage</span> + <span className="font-black">Supabase</span>.
                  Auth accounts and user profiles are preserved.
                </p>

                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={nukeConfirmText}
                    onChange={e => setNukeConfirmText(e.target.value)}
                    placeholder='Type "DELETE ALL" to unlock'
                    className="flex-1 border-2 border-red-300 rounded-lg px-4 py-2 text-sm font-mono bg-white focus:outline-none focus:border-red-600"
                    disabled={nukeLoading}
                  />
                  <button
                    onClick={handleNuclearWipe}
                    disabled={nukeLoading || nukeConfirmText !== 'DELETE ALL'}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-black text-xs uppercase tracking-widest text-white transition-all
                      bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed shadow-lg"
                  >
                    {nukeLoading
                      ? <><Loader2 size={14} className="animate-spin" /> Wiping…</>
                      : <><Trash2 size={14} /> Nuke Everything</>
                    }
                  </button>
                </div>

                {/* Progress log */}
                {nukeLog.length > 0 && (
                  <div className="bg-slate-900 rounded-xl p-4 max-h-64 overflow-y-auto font-mono text-[10px] space-y-0.5">
                    {nukeLog.map((entry, i) => (
                      <div key={i} className={`flex items-center gap-2 ${entry.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {entry.ok
                          ? <CheckCircle2 size={10} className="shrink-0" />
                          : <X size={10} className="shrink-0" />
                        }
                        <span className="text-slate-400 w-40 shrink-0">{entry.table}</span>
                        <span>{entry.msg}</span>
                      </div>
                    ))}
                    {nukePhase === 'running' && (
                      <div className="flex items-center gap-2 text-yellow-400 mt-1">
                        <Loader2 size={10} className="animate-spin shrink-0" />
                        <span>Processing…</span>
                      </div>
                    )}
                    {nukePhase === 'done' && (
                      <div className="text-green-300 font-bold mt-2">☢ WIPE COMPLETE — reloading…</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* ── END NUCLEAR WIPE ─────────────────────────────────────────── */}

          </div>
        )}
        {activeTab === 'users' && (
        <div className="max-w-6xl">
          <UserAccessManager />
        </div>
      )}

        {activeTab === 'exceptions' && (
          <React.Suspense fallback={<div className="py-10 text-center text-slate-400 text-xs">Loading...</div>}>
            <BypassLogDashboard />
          </React.Suspense>
        )}
      </div>
    </div>
  );
};

export default React.memo(AdminSecurity);
