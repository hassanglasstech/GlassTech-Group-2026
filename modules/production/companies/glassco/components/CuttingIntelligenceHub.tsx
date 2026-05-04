/**
 * CuttingIntelligenceHub.tsx — GlassCo Phase 3
 *
 * Cutting Intelligence: 3 sub-tabs
 * 1. Session Logger  — open/close cutting sessions, record actual wastage vs estimated
 * 2. Batch Optimizer — multi-job piece grouper by thickness+type, priority by due date
 * 3. Target Board    — daily target vs actual per cutter, alert if behind pace
 *
 * Plugs into: InventoryService (CuttingSession), LabourService (CutterDailyLog)
 * localStorage-first, same pattern as rest of ERP
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { postCuttingGL, buildCuttingGLPlan } from '@/modules/procurement/services/glasscoGLService';
import { ledgerToRow } from '@/modules/finance/services/financeService';
import { supabase } from '../../../../../src/services/supabaseClient';
import { safeParse, safeSave } from '@/modules/shared/services/utils';
import { LabourService, CutterDailyLog } from '@/modules/production/services/labourService';
import { HRService } from '@/modules/hr/services/hrService';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import { CuttingSession } from '@/modules/procurement/types/inventory';
import {
  Scissors, Play, Square, AlertTriangle, CheckCircle2, TrendingUp,
  TrendingDown, Clock, Layers, Plus, X, ChevronRight, Target,
  BarChart2, Flame, Zap, RefreshCw, ArrowUpRight, ArrowDownRight,
  Package, CalendarDays, User, Save, Edit3, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const fmt = (n: number, d = 0) => n.toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });
const today = () => new Date().toISOString().split('T')[0];
const nowISO = () => new Date().toISOString();
const genId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

const DAILY_TARGET_KEY = 'glassco_cutter_daily_targets';
interface DailyTarget { cutterName: string; targetSqft: number; targetPieces: number; }
const loadTargets = (): DailyTarget[] => { try { return JSON.parse(localStorage.getItem(DAILY_TARGET_KEY) || '[]'); } catch { return []; } };
const saveTargets = (t: DailyTarget[]) => { try { localStorage.setItem(DAILY_TARGET_KEY, JSON.stringify(t)); } catch {} };

// ─────────────────────────────────────────────────────────────────────
// 1. SESSION LOGGER
// ─────────────────────────────────────────────────────────────────────

const SessionLogger: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const { jobOrders, pieces } = useProductionContext();

  const [sessions, setSessions] = useState<CuttingSession[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeForm, setCloseForm] = useState({ actualWastage: 0, scrapSqft: 0, piecesProduced: 0, notes: '' });

  const employees = useMemo(() => {
    try { return HRService.getEmployees().filter(e => e.company === company && !['Resigned', 'Terminated'].includes(e.work?.status as string || '')); }
    catch { return []; }
  }, [company]);

  const [newForm, setNewForm] = useState({
    jobOrderId: '',
    cutterName: '',
    estimatedWastagePct: 12,
  });

  const load = useCallback(() => {
    setSessions(InventoryService.getCuttingSessions().filter(s => s.company === company));
  }, [company]);
  useEffect(() => { load(); }, [load]);

  const openSessions = sessions.filter(s => s.status === 'Open');
  const closedSessions = sessions.filter(s => s.status === 'Closed')
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 20);

  // Jobs with "Cut" pieces = eligible for cutting session
  const eligibleJobs = useMemo(() => {
    const jobIds = new Set(pieces.filter(p => p.status === 'Cut').map(p => p.orderId));
    return jobOrders.filter(j => jobIds.has(j.id) || jobIds.has(j.orderNo || ''));
  }, [pieces, jobOrders]);

  const handleOpenSession = () => {
    if (!newForm.jobOrderId) { toast.error('Job order select karo'); return; }
    if (!newForm.cutterName) { toast.error('Cutter select karo'); return; }

    const job = jobOrders.find(j => j.id === newForm.jobOrderId || j.orderNo === newForm.jobOrderId);
    const session: CuttingSession = {
      id: genId('CS'),
      company,
      jobOrderId: newForm.jobOrderId,
      cutterId: newForm.cutterName,
      cutterName: newForm.cutterName,
      startTime: nowISO(),
      status: 'Open',
      sheetsScanned: [],
      piecesProduced: 0,
      remnantsCreated: [],
      scrapSqft: 0,
      scrapWeightKg: 0,
      estimatedWastagePct: newForm.estimatedWastagePct,
    };

    const all = InventoryService.getCuttingSessions();
    InventoryService.saveCuttingSessions([...all, session]);
    load();
    setShowNewForm(false);
    setNewForm({ jobOrderId: '', cutterName: '', estimatedWastagePct: 12 });
    toast.success(`Session started for ${newForm.cutterName}`);
  };

  // Sprint 1: atomic close. GL post + stock decrement + session-close all
  // happen in one Postgres transaction (consume_glass_stock RPC). Any
  // failure → full rollback, books unchanged.
  const handleCloseSession = async (sessionId: string) => {
    const all = InventoryService.getCuttingSessions();
    const session = all.find(s => s.id === sessionId);
    if (!session) return;

    const actualWastage = closeForm.actualWastage;
    const variance = actualWastage - session.estimatedWastagePct;
    const today = nowISO().split('T')[0];
    const updated: CuttingSession = {
      ...session,
      status: 'Closed',
      endTime: nowISO(),
      piecesProduced: closeForm.piecesProduced,
      scrapSqft: closeForm.scrapSqft,
      actualWastagePct: actualWastage,
      wastageVariancePct: variance,
      supervisorSignOff: Math.abs(variance) > 5 ? 'PENDING' : undefined,
    };

    // Build the cutting GL plan (no writes yet)
    const plan = buildCuttingGLPlan({
      company: company as any,
      sessionId,
      sheetsScanned: session.sheetsScanned || [],
      scrapSqft: closeForm.scrapSqft || 0,
      date: today,
    });

    if (plan.alreadyPosted) {
      toast.error('Cutting GL already posted for this session.');
      return;
    }

    // ── Atomic RPC: validate stock, decrement, post GL, update session ─
    const { error } = await supabase.rpc('consume_glass_stock', {
      p_company:      company,
      p_session_id:   sessionId,
      p_consumption:  plan.consumption,
      p_gl_row:       plan.ledgerTx ? ledgerToRow(plan.ledgerTx as any) : null,
      p_stock_rows:   plan.stockLedgerRows,
      p_session_row:  { id: sessionId, data: updated },
    });

    if (error) {
      const msg = error.message || '';
      if (msg.startsWith('insufficient_stock')) {
        toast.error(`Insufficient stock — ${msg}. Receive more glass via GRN first. Cutting session NOT closed.`,
          { duration: 9000 });
      } else if (msg.startsWith('gl_already_posted')) {
        toast.error('Cutting GL already exists for this session.');
      } else if (msg.startsWith('material_not_found')) {
        toast.error(`Material missing in store: ${msg}. Reload master data.`);
      } else {
        toast.error(`Atomic close failed: ${msg}`);
      }
      return; // RPC rolled back — local state unchanged
    }

    // RPC committed. Mirror to localStorage so synchronous reads agree.
    InventoryService.saveCuttingSessions(all.map(s => s.id === sessionId ? updated : s));
    try {
      const lsLedger = safeParse('gtk_erp_ledger') as any[];
      if (plan.ledgerTx) {
        safeSave('gtk_erp_ledger',
          [...lsLedger.filter((t: any) => t.id !== plan.ledgerTx!.id), plan.ledgerTx]);
      }
    } catch { /* non-fatal */ }

    if (session.sheetsScanned && session.sheetsScanned.length > 0) {
      // Mirror stock decrements locally — RPC already did the cloud write
      const consumedByMaterial: Record<string, number> = {};
      plan.consumption.forEach(c => { consumedByMaterial[c.material_id] = c.qty; });
      const store = InventoryService.getStore();
      const updatedStore = store.map((item: any) => {
        const consumed = consumedByMaterial[item.id] || 0;
        if (consumed === 0) return item;
        return {
          ...item,
          unrestrictedQty: (item.unrestrictedQty || 0) - consumed,
          quantity: (item.quantity || 0) - consumed,
          lastMovementDate: today,
        };
      });
      InventoryService.saveStore(updatedStore);
    }

    load();
    setClosingId(null);
    setCloseForm({ actualWastage: 0, scrapSqft: 0, piecesProduced: 0, notes: '' });

    if (Math.abs(variance) > 5) {
      toast.warning(`High wastage variance: ${variance > 0 ? '+' : ''}${variance.toFixed(1)}% — supervisor sign-off required`);
    } else {
      toast.success(`Session closed — ${session.sheetsScanned?.length || 0} sheets deducted from inventory`);
    }
  };

  // Silence unused-import lint after refactor
  void postCuttingGL;

  const getDuration = (start: string, end?: string) => {
    const ms = new Date(end || nowISO()).getTime() - new Date(start).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getJobLabel = (jobId: string) => {
    const j = jobOrders.find(j => j.id === jobId || j.orderNo === jobId);
    return j ? `${j.orderNo || j.id} — ${j.projectName || j.subject || 'No Name'}` : jobId;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-slate-800 uppercase">Cutting Session Logger</h3>
          <p className="text-xs text-slate-400 font-medium">{openSessions.length} active session{openSessions.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowNewForm(true)}
          className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase hover:bg-blue-700 transition-colors">
          <Plus size={14} /> <span>Open Session</span>
        </button>
      </div>

      {/* New Session Form */}
      {showNewForm && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-blue-800 uppercase">New Cutting Session</p>
            <button onClick={() => setShowNewForm(false)} className="text-blue-400 hover:text-blue-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase text-blue-600 tracking-wider block mb-1">Job Order</label>
              <select value={newForm.jobOrderId} onChange={e => setNewForm(p => ({ ...p, jobOrderId: e.target.value }))}
                className="w-full px-3 py-2 border border-blue-200 rounded-xl text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">— Select Job —</option>
                {eligibleJobs.map(j => (
                  <option key={j.id} value={j.id}>{j.orderNo || j.id} — {j.projectName || j.subject || '?'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-blue-600 tracking-wider block mb-1">Cutter</label>
              <select value={newForm.cutterName} onChange={e => setNewForm(p => ({ ...p, cutterName: e.target.value }))}
                className="w-full px-3 py-2 border border-blue-200 rounded-xl text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">— Select Cutter —</option>
                {employees.map(e => <option key={e.id} value={e.personal.name}>{e.personal.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-blue-600 tracking-wider block mb-1">Est. Wastage %</label>
              <input type="number" min={0} max={50} step={0.5} value={newForm.estimatedWastagePct}
                onChange={e => setNewForm(p => ({ ...p, estimatedWastagePct: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-blue-200 rounded-xl text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <button onClick={() => setShowNewForm(false)} className="px-4 py-2 text-xs font-bold text-blue-500 hover:bg-blue-100 rounded-xl">Cancel</button>
            <button onClick={handleOpenSession}
              className="flex items-center space-x-1.5 px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase hover:bg-blue-700">
              <Play size={12} /> <span>Start Session</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Sessions */}
      {openSessions.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase text-emerald-600 tracking-wider mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" /> Live Sessions
          </p>
          <div className="space-y-3">
            {openSessions.map(s => (
              <div key={s.id} className="bg-white border-2 border-emerald-200 rounded-2xl p-4">
                {closingId === s.id ? (
                  <div className="space-y-3">
                    <p className="text-xs font-black text-slate-700 uppercase">Close Session — {s.cutterName}</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Pieces Produced</label>
                        <input type="number" min={0} value={closeForm.piecesProduced}
                          onChange={e => setCloseForm(p => ({ ...p, piecesProduced: Number(e.target.value) }))}
                          className="w-full px-3 py-2 border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Scrap SqFt</label>
                        <input type="number" min={0} step={0.1} value={closeForm.scrapSqft}
                          onChange={e => setCloseForm(p => ({ ...p, scrapSqft: Number(e.target.value) }))}
                          className="w-full px-3 py-2 border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                          Actual Wastage %
                          {closeForm.actualWastage > s.estimatedWastagePct + 5 && (
                            <span className="ml-1 text-rose-500">⚠ High</span>
                          )}
                        </label>
                        <input type="number" min={0} max={100} step={0.5} value={closeForm.actualWastage}
                          onChange={e => setCloseForm(p => ({ ...p, actualWastage: Number(e.target.value) }))}
                          className={`w-full px-3 py-2 border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 ${closeForm.actualWastage > s.estimatedWastagePct + 5 ? 'border-rose-300 focus:ring-rose-300' : 'focus:ring-emerald-400'}`} />
                      </div>
                    </div>
                    {closeForm.actualWastage > 0 && (
                      <div className={`text-xs font-bold px-3 py-2 rounded-xl ${Math.abs(closeForm.actualWastage - s.estimatedWastagePct) > 5 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        Variance: {(closeForm.actualWastage - s.estimatedWastagePct) > 0 ? '+' : ''}{(closeForm.actualWastage - s.estimatedWastagePct).toFixed(1)}% vs estimated {s.estimatedWastagePct}%
                        {Math.abs(closeForm.actualWastage - s.estimatedWastagePct) > 5 && ' — Supervisor sign-off required'}
                      </div>
                    )}
                    <div className="flex space-x-2">
                      <button onClick={() => setClosingId(null)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-50 rounded-xl">Cancel</button>
                      <button onClick={() => handleCloseSession(s.id)}
                        className="flex items-center space-x-1.5 px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase hover:bg-emerald-700">
                        <Square size={12} /> <span>Close Session</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <p className="text-sm font-black text-slate-800">{s.cutterName}</p>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{s.id}</span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium">{getJobLabel(s.jobOrderId)}</p>
                      <div className="flex items-center space-x-3 mt-1.5">
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Clock size={10} /> {getDuration(s.startTime)}</span>
                        <span className="text-[10px] font-bold text-blue-500">Est. Wastage: {s.estimatedWastagePct}%</span>
                      </div>
                    </div>
                    <button onClick={() => { setClosingId(s.id); setCloseForm({ actualWastage: s.estimatedWastagePct, scrapSqft: 0, piecesProduced: 0, notes: '' }); }}
                      className="flex items-center space-x-1.5 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-black uppercase hover:bg-slate-700 transition-colors">
                      <Square size={12} /> <span>Close</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Closed Sessions */}
      {closedSessions.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Recent Sessions</p>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase">
                  <th className="text-left px-4 py-3">Cutter</th>
                  <th className="text-left px-4 py-3">Job</th>
                  <th className="text-center px-4 py-3">Duration</th>
                  <th className="text-right px-4 py-3">Pieces</th>
                  <th className="text-right px-4 py-3">Est %</th>
                  <th className="text-right px-4 py-3">Actual %</th>
                  <th className="text-center px-4 py-3">Variance</th>
                  <th className="text-center px-4 py-3">Sign-off</th>
                </tr>
              </thead>
              <tbody>
                {closedSessions.map(s => {
                  const variance = (s.wastageVariancePct || 0);
                  const needsSignOff = s.supervisorSignOff === 'PENDING';
                  return (
                    <tr key={s.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-black text-slate-700">{s.cutterName}</td>
                      <td className="px-4 py-2.5 text-slate-500 max-w-[150px] truncate">{getJobLabel(s.jobOrderId)}</td>
                      <td className="px-4 py-2.5 text-center font-bold text-slate-500">{getDuration(s.startTime, s.endTime)}</td>
                      <td className="px-4 py-2.5 text-right font-black text-blue-600">{s.piecesProduced}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-500">{s.estimatedWastagePct}%</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-700">{s.actualWastagePct?.toFixed(1) ?? '—'}%</td>
                      <td className="px-4 py-2.5 text-center">
                        {s.actualWastagePct !== undefined ? (
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${Math.abs(variance) > 5 ? 'bg-rose-100 text-rose-700' : Math.abs(variance) > 2 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {needsSignOff ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-100 text-rose-700 flex items-center gap-0.5 w-fit mx-auto">
                            <AlertCircle size={9} /> Pending
                          </span>
                        ) : <CheckCircle2 size={14} className="mx-auto text-emerald-400" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {openSessions.length === 0 && closedSessions.length === 0 && !showNewForm && (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
          <Scissors size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-400">No cutting sessions yet</p>
          <p className="text-xs text-slate-300 mt-1">Open a session to start tracking wastage</p>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// 2. BATCH OPTIMIZER
// ─────────────────────────────────────────────────────────────────────

interface BatchGroup {
  thickness: string;
  glassType: string;
  jobs: { jobId: string; jobLabel: string; pieces: number; sqft: number; dueDate: string; priority: 'urgent' | 'normal' | 'low'; }[];
  totalPieces: number;
  totalSqft: number;
}

const BatchOptimizer: React.FC = () => {
  const { pieces, jobOrders } = useProductionContext();

  // Group pieces by thickness+type, sorted by due date
  const batches = useMemo((): BatchGroup[] => {
    const cutPieces = pieces.filter(p => p.status === 'Cut');
    const byKey: Record<string, BatchGroup> = {};

    cutPieces.forEach(p => {
      const job = jobOrders.find(j => j.id === p.orderId || j.orderNo === p.orderId);
      if (!job) return;

      // Parse thickness from specs or job items
      let thickness = '?';
      let glassType = 'Plain';
      if (p.specs) {
        const thkMatch = p.specs.match(/(\d+)\s*mm/i);
        if (thkMatch) thickness = `${thkMatch[1]}mm`;
        const specs = p.specs.toLowerCase();
        if (specs.includes('mirror')) glassType = 'Mirror';
        else if (specs.includes('tinted') || specs.includes('bronze') || specs.includes('grey')) glassType = 'Tinted';
        else if (specs.includes('frosted') || specs.includes('acid')) glassType = 'Frosted';
        else if (specs.includes('laminated')) glassType = 'Laminated';
      } else if (job.items?.length > 0) {
        const item = job.items[0];
        const thkMatch = (item.glassType || item.glazingSpecs || '').match(/(\d+)\s*mm/i);
        if (thkMatch) thickness = `${thkMatch[1]}mm`;
      }

      const key = `${thickness}__${glassType}`;
      if (!byKey[key]) {
        byKey[key] = { thickness, glassType, jobs: [], totalPieces: 0, totalSqft: 0 };
      }

      const sqft = job.items?.reduce((s: number, it: any) => s + (it.totalSqFt || 0), 0) || 0;
      const dueDate = job.dueDate || job.reqDate || '';
      const daysUntilDue = dueDate ? Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000) : 999;
      const priority = daysUntilDue <= 2 ? 'urgent' : daysUntilDue <= 7 ? 'normal' : 'low';

      const existing = byKey[key].jobs.find(j => j.jobId === p.orderId);
      if (!existing) {
        byKey[key].jobs.push({
          jobId: p.orderId,
          jobLabel: `${job.orderNo || job.id} — ${job.projectName || job.subject || '?'}`,
          pieces: 1, sqft, dueDate, priority,
        });
      } else {
        existing.pieces += 1;
      }
      byKey[key].totalPieces += 1;
      byKey[key].totalSqft += sqft;
    });

    // Sort jobs within each group by due date
    Object.values(byKey).forEach(g => {
      g.jobs.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    });

    // Sort groups: thicker glass first (harder to cut), then by urgency
    return Object.values(byKey).sort((a, b) => {
      const aThk = parseInt(a.thickness) || 0;
      const bThk = parseInt(b.thickness) || 0;
      return bThk - aThk;
    });
  }, [pieces, jobOrders]);

  const totalPieces = batches.reduce((s, b) => s + b.totalPieces, 0);
  const urgentJobs = batches.flatMap(b => b.jobs).filter(j => j.priority === 'urgent').length;

  const thickBatches = batches.filter(b => (parseInt(b.thickness) || 0) >= 8);
  const thinBatches = batches.filter(b => (parseInt(b.thickness) || 0) < 8);

  const priorityColor = (p: 'urgent' | 'normal' | 'low') =>
    p === 'urgent' ? 'bg-rose-100 text-rose-700 border-rose-200' :
    p === 'normal' ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-slate-100 text-slate-500 border-slate-200';

  const PriorityBadge = ({ p }: { p: 'urgent' | 'normal' | 'low' }) => (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${priorityColor(p)} uppercase`}>{p}</span>
  );

  if (batches.length === 0) return (
    <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
      <Package size={32} className="mx-auto text-slate-300 mb-3" />
      <p className="text-sm font-bold text-slate-400">No pieces in cutting queue</p>
      <p className="text-xs text-slate-300 mt-1">Job orders with "Cut" status pieces will appear here</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-blue-500 uppercase">Total Queue</p>
          <p className="text-2xl font-black text-blue-700 mt-1">{totalPieces}</p>
          <p className="text-[10px] text-blue-400 font-bold">pieces pending</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-400 uppercase">Batches</p>
          <p className="text-2xl font-black text-white mt-1">{batches.length}</p>
          <p className="text-[10px] text-slate-400 font-bold">{thickBatches.length} thick · {thinBatches.length} thin</p>
        </div>
        <div className={`border rounded-2xl p-4 ${urgentJobs > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-100'}`}>
          <p className={`text-[9px] font-black uppercase ${urgentJobs > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>Urgent</p>
          <p className={`text-2xl font-black mt-1 ${urgentJobs > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{urgentJobs}</p>
          <p className={`text-[10px] font-bold ${urgentJobs > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {urgentJobs > 0 ? 'due ≤ 2 days' : 'all on track'}
          </p>
        </div>
      </div>

      {/* Cutting Sequence Recommendation */}
      <div className="bg-slate-900 text-white rounded-2xl p-5">
        <div className="flex items-center space-x-2 mb-3">
          <Zap size={16} className="text-amber-400" />
          <p className="text-xs font-black uppercase text-white">Recommended Cutting Sequence</p>
        </div>
        <div className="space-y-1.5">
          {[...thickBatches, ...thinBatches].map((b, i) => (
            <div key={`${b.thickness}-${b.glassType}`} className="flex items-center space-x-3">
              <span className="w-5 h-5 rounded-full bg-white/10 text-[10px] font-black text-slate-300 flex items-center justify-center flex-shrink-0">{i + 1}</span>
              <div className="flex-1">
                <span className="text-xs font-black text-white">{b.thickness} {b.glassType}</span>
                <span className="text-[10px] text-slate-400 ml-2">{b.totalPieces} pcs · {b.jobs.length} jobs</span>
              </div>
              {b.jobs.some(j => j.priority === 'urgent') && (
                <AlertTriangle size={12} className="text-rose-400" />
              )}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-3 italic">Thick glass first → reduces blade change frequency</p>
      </div>

      {/* Batch Groups */}
      <div className="space-y-4">
        {batches.map(batch => (
          <div key={`${batch.thickness}-${batch.glassType}`}
            className={`bg-white rounded-2xl border-2 overflow-hidden ${batch.jobs.some(j => j.priority === 'urgent') ? 'border-rose-200' : 'border-slate-100'}`}>
            {/* Batch Header */}
            <div className={`px-5 py-3 flex items-center justify-between ${batch.jobs.some(j => j.priority === 'urgent') ? 'bg-rose-50' : 'bg-slate-50'}`}>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <Layers size={14} className="text-slate-600" />
                  <span className="text-sm font-black text-slate-800">{batch.thickness} {batch.glassType}</span>
                </div>
                <span className="text-[10px] font-black text-slate-400 bg-white px-2 py-0.5 rounded-full border">
                  {batch.totalPieces} pcs · {fmt(batch.totalSqft, 1)} sqft
                </span>
              </div>
              <div className="flex items-center space-x-2 text-[10px] font-bold text-slate-500">
                <span>{batch.jobs.length} job{batch.jobs.length !== 1 ? 's' : ''}</span>
                {batch.jobs.some(j => j.priority === 'urgent') && (
                  <span className="bg-rose-500 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase flex items-center gap-1">
                    <AlertTriangle size={9} /> Urgent
                  </span>
                )}
              </div>
            </div>

            {/* Jobs in batch */}
            <div className="divide-y divide-slate-50">
              {batch.jobs.map(j => (
                <div key={j.jobId} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <ChevronRight size={12} className="text-slate-300" />
                    <div>
                      <p className="text-xs font-black text-slate-700">{j.jobLabel}</p>
                      {j.dueDate && (
                        <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                          <CalendarDays size={9} /> Due: {j.dueDate}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-[10px] font-bold text-slate-500">{j.pieces} pcs</span>
                    <PriorityBadge p={j.priority} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// 3. CUTTER TARGET BOARD
// ─────────────────────────────────────────────────────────────────────

const TargetBoard: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [logs, setLogs] = useState<CutterDailyLog[]>([]);
  const [targets, setTargets] = useState<DailyTarget[]>(() => loadTargets());
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ targetSqft: 0, targetPieces: 0 });
  const [filterDate, setFilterDate] = useState(today());

  useEffect(() => {
    LabourService.getLogs(company).then(setLogs);
  }, [company]);

  const employees = useMemo(() => {
    try { return HRService.getEmployees().filter(e => e.company === company && !['Resigned', 'Terminated'].includes(e.work?.status as string || '')); }
    catch { return []; }
  }, [company]);

  // All cutters = employees + anyone who logged today
  const cutterNames = useMemo(() => {
    const fromEmp = new Set(employees.map(e => e.personal.name));
    const fromLogs = new Set(logs.map(l => l.cutterName));
    return Array.from(new Set([...fromEmp, ...fromLogs])).sort();
  }, [employees, logs]);

  const todayLogs = useMemo(() =>
    logs.filter(l => l.logDate === filterDate)
  , [logs, filterDate]);

  const getTarget = (name: string) => targets.find(t => t.cutterName === name) || { cutterName: name, targetSqft: 200, targetPieces: 30 };
  const getLog = (name: string) => todayLogs.find(l => l.cutterName === name);

  const pct = (actual: number, target: number) => target > 0 ? Math.min(Math.round((actual / target) * 100), 100) : 0;

  const handleSaveTarget = (name: string) => {
    const updated = targets.filter(t => t.cutterName !== name);
    const newTarget: DailyTarget = { cutterName: name, targetSqft: editForm.targetSqft, targetPieces: editForm.targetPieces };
    saveTargets([...updated, newTarget]);
    setTargets([...updated, newTarget]);
    setEditingTarget(null);
    toast.success(`Target updated for ${name}`);
  };

  const overallSqft = todayLogs.reduce((s, l) => s + l.sqftProduced, 0);
  const overallTarget = cutterNames.reduce((s, n) => s + getTarget(n).targetSqft, 0);
  const overallPct = pct(overallSqft, overallTarget);

  return (
    <div className="space-y-5">
      {/* Date filter */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-slate-800 uppercase">Daily Target Board</h3>
          <p className="text-xs text-slate-400 font-medium">{cutterNames.length} cutters tracked</p>
        </div>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" />
      </div>

      {/* Overall progress */}
      <div className="bg-slate-900 text-white rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">Team Total — {filterDate}</p>
            <p className="text-3xl font-black mt-1">{fmt(overallSqft)} <span className="text-sm text-slate-400">sqft</span></p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase text-slate-400">Target</p>
            <p className="text-xl font-black text-slate-300">{fmt(overallTarget)} sqft</p>
            <p className={`text-sm font-black mt-0.5 ${overallPct >= 100 ? 'text-emerald-400' : overallPct >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
              {overallPct}% achieved
            </p>
          </div>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${overallPct >= 100 ? 'bg-emerald-500' : overallPct >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Per-cutter cards */}
      <div className="space-y-3">
        {cutterNames.map(name => {
          const target = getTarget(name);
          const log = getLog(name);
          const sqftPct = pct(log?.sqftProduced || 0, target.targetSqft);
          const pcsPct = pct(log?.piecesCut || 0, target.targetPieces);
          const isEditing = editingTarget === name;

          const statusColor = !log ? 'border-slate-200' :
            sqftPct >= 100 ? 'border-emerald-300' :
            sqftPct >= 70 ? 'border-amber-200' : 'border-rose-200';

          const barColor = sqftPct >= 100 ? 'bg-emerald-500' : sqftPct >= 70 ? 'bg-amber-500' : 'bg-rose-500';

          return (
            <div key={name} className={`bg-white rounded-2xl border-2 p-4 transition-all ${statusColor}`}>
              {isEditing ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-slate-800">{name}</p>
                    <button onClick={() => setEditingTarget(null)} className="text-slate-300 hover:text-slate-500"><X size={14} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Target SqFt/Day</label>
                      <input type="number" min={0} value={editForm.targetSqft}
                        onChange={e => setEditForm(p => ({ ...p, targetSqft: Number(e.target.value) }))}
                        className="w-full px-3 py-2 border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Target Pieces/Day</label>
                      <input type="number" min={0} value={editForm.targetPieces}
                        onChange={e => setEditForm(p => ({ ...p, targetPieces: Number(e.target.value) }))}
                        className="w-full px-3 py-2 border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" />
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button onClick={() => setEditingTarget(null)} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-slate-50 rounded-xl">Cancel</button>
                    <button onClick={() => handleSaveTarget(name)}
                      className="flex items-center space-x-1 px-4 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-black uppercase hover:bg-slate-700">
                      <Save size={12} /> <span>Save</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white ${!log ? 'bg-slate-300' : sqftPct >= 100 ? 'bg-emerald-500' : sqftPct >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}>
                        {name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800">{name}</p>
                        {!log && <p className="text-[10px] text-slate-400 font-medium">No log for {filterDate}</p>}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {log && (
                        <div className={`flex items-center space-x-1 text-[10px] font-black px-2 py-1 rounded-full ${sqftPct >= 100 ? 'bg-emerald-100 text-emerald-700' : sqftPct >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                          {sqftPct >= 100 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          <span>{sqftPct}%</span>
                        </div>
                      )}
                      <button onClick={() => { setEditingTarget(name); setEditForm({ targetSqft: target.targetSqft, targetPieces: target.targetPieces }); }}
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600">
                        <Edit3 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* SqFt */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase">SqFt</span>
                        <span className="text-[9px] font-bold text-slate-500">{fmt(log?.sqftProduced || 0)} / {fmt(target.targetSqft)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${sqftPct}%` }} />
                      </div>
                    </div>
                    {/* Pieces */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase">Pieces</span>
                        <span className="text-[9px] font-bold text-slate-500">{log?.piecesCut || 0} / {target.targetPieces}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${pct(log?.piecesCut || 0, target.targetPieces) >= 100 ? 'bg-emerald-500' : pct(log?.piecesCut || 0, target.targetPieces) >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${pcsPct}%` }} />
                      </div>
                    </div>
                  </div>

                  {log && (
                    <div className="flex items-center space-x-4 mt-3 text-[10px] text-slate-400 font-bold">
                      {log.overtimeHours > 0 && <span className="text-amber-500">OT: {log.overtimeHours}h</span>}
                      {log.notes && <span className="italic truncate max-w-[200px]">{log.notes}</span>}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {cutterNames.length === 0 && (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
          <Target size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-400">No cutters found</p>
          <p className="text-xs text-slate-300 mt-1">Add employees in HR or log daily entries in Labour tab</p>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// MAIN HUB
// ─────────────────────────────────────────────────────────────────────

type HubTab = 'session' | 'batch' | 'target';

const CuttingIntelligenceHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState<HubTab>('session');

  const tabs: { id: HubTab; label: string; icon: React.ReactNode; color: string; activeBg: string; activeText: string; activeBorder: string }[] = [
    { id: 'session', label: 'Session Logger', icon: <Play size={14} />, color: 'text-blue-600', activeBg: 'bg-blue-50', activeText: 'text-blue-700', activeBorder: 'border-blue-600' },
    { id: 'batch', label: 'Batch Optimizer', icon: <Layers size={14} />, color: 'text-violet-600', activeBg: 'bg-violet-50', activeText: 'text-violet-700', activeBorder: 'border-violet-600' },
    { id: 'target', label: 'Target Board', icon: <Target size={14} />, color: 'text-emerald-600', activeBg: 'bg-emerald-50', activeText: 'text-emerald-700', activeBorder: 'border-emerald-600' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Page Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl">
        <Scissors size={14} className="text-blue-600 shrink-0"/>
        <span className="text-xs font-black uppercase tracking-widest text-slate-700">Cutting Intelligence</span>
        <span className="text-[10px] text-slate-400 font-bold">Session tracking · Batch optimization · Targets</span>
      </div>

      {/* Tab Nav */}
      <div className="bg-white border border-slate-200 rounded-2xl p-1.5 flex space-x-1 w-fit shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all border-b-2 whitespace-nowrap ${
              activeTab === tab.id
                ? `${tab.activeBg} ${tab.activeText} ${tab.activeBorder}`
                : 'border-transparent text-slate-400 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {activeTab === 'session' && <SessionLogger />}
        {activeTab === 'batch' && <BatchOptimizer />}
        {activeTab === 'target' && <TargetBoard />}
      </div>
    </div>
  );
};

export default CuttingIntelligenceHub;
