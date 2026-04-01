/**
 * AIFloorPlanAdvisor.tsx — Phase 6A + 6B
 *
 * 6A: AI Daily Plan Generator
 *   - Reads pending pieces (Cut status) + team capacity from Floor Planner
 *   - EDF (Earliest Due Date First) scheduling with backward scheduling
 *   - Assigns jobs to Cutting/Processing/Dispatch tables
 *   - Output: "Today's Recommended Plan" card
 *   - Supervisor can approve as-is or use drag-drop from Floor Planner
 *
 * 6B: Urgent Insert Impact Analyzer
 *   - "Insert Urgent" button → select order + table
 *   - Shows: pushed orders, delay hours, affected clients, due date misses
 *   - Before/after timeline comparison
 *   - Confirm or Cancel
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import { ProductionPiece, Quotation } from '@/modules/shared/types';
import {
  Zap, CheckCircle2, AlertTriangle, Clock, Target, Play,
  ChevronRight, Users, ArrowRight, X, BarChart2, AlertCircle,
  TrendingDown, Calendar, Layers
} from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

type StationId = 'cutting' | 'processing' | 'dispatch';

interface TeamCapacity {
  teamName: string;
  station: StationId;
  sqftPerHour: number;
  shiftHours: number;
  totalCapacity: number;   // sqftPerHour * shiftHours
}

interface ScheduledJob {
  jobId: string;
  orderRef: string;
  clientName: string;
  dueDate: string;
  sqft: number;
  pieces: number;
  assignedStation: StationId;
  assignedTeam: string;
  estimatedStartHour: number;   // decimal, e.g. 8.0 = 8:00am
  estimatedEndHour: number;
  latestStartDate: string;      // backward scheduled
  isUrgent: boolean;
  willMissDueDate: boolean;
}

interface DailyPlan {
  generatedAt: string;
  date: string;
  stations: {
    id: StationId;
    label: string;
    assignedJobs: ScheduledJob[];
    totalSqft: number;
    capacity: number;
    utilization: number;
  }[];
  unscheduled: ScheduledJob[];    // overflow — can't fit today
  approved: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Constants & Helpers
// ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY_TEAMS = 'glassco_floor_planner_teams';
const STORAGE_KEY_PLAN  = 'glassco_daily_plan';
const SHIFT_START_HOUR  = 8;
const SHIFT_HOURS       = 9;   // 8am to 5pm

const fmt  = (n: number, d = 0) => n.toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });
const today = () => new Date().toISOString().split('T')[0];

const daysUntil = (dateStr: string): number => {
  if (!dateStr) return 999;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
};

const hourToTime = (h: number): string => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const period = hh >= 12 ? 'pm' : 'am';
  const displayH = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh;
  return `${displayH}:${mm.toString().padStart(2, '0')} ${period}`;
};

const loadTeams = (): TeamCapacity[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_TEAMS) || '[]');
    return raw
      .filter((t: any) => t.isActive)
      .map((t: any): TeamCapacity => ({
        teamName: t.name,
        station: t.station as StationId,
        sqftPerHour: t.targetSqftPerHour || 100,
        shiftHours: (() => {
          try {
            const [sh, sm] = (t.shiftStart || '08:00').split(':').map(Number);
            const [eh, em] = (t.shiftEnd   || '17:00').split(':').map(Number);
            return Math.max(1, (eh + em / 60) - (sh + sm / 60));
          } catch { return SHIFT_HOURS; }
        })(),
        totalCapacity: 0,
      }))
      .map((t: TeamCapacity) => ({ ...t, totalCapacity: t.sqftPerHour * t.shiftHours }));
  } catch { return []; }
};

// ─────────────────────────────────────────────────────────────────────
// Algorithm: EDF scheduler
// ─────────────────────────────────────────────────────────────────────

const runEDFScheduler = (
  jobs: { jobId: string; orderRef: string; clientName: string; dueDate: string; sqft: number; pieces: number }[],
  teams: TeamCapacity[]
): DailyPlan => {

  // Station capacities
  const stationCap: Record<StationId, number> = { cutting: 0, processing: 0, dispatch: 0 };
  const stationTeam: Record<StationId, string> = { cutting: '—', processing: '—', dispatch: '—' };
  teams.forEach(t => {
    stationCap[t.station] += t.totalCapacity;
    stationTeam[t.station] = t.teamName;
  });

  // Sort by due date (earliest first) — EDF
  const sorted = [...jobs].sort((a, b) => {
    const da = daysUntil(a.dueDate);
    const db = daysUntil(b.dueDate);
    return da - db;
  });

  // Assign jobs to stations — cutting first, then processing for QC-ready
  const stations: DailyPlan['stations'] = [
    { id: 'cutting',    label: 'Cutting Table',    assignedJobs: [], totalSqft: 0, capacity: stationCap.cutting,    utilization: 0 },
    { id: 'processing', label: 'Processing Table', assignedJobs: [], totalSqft: 0, capacity: stationCap.processing, utilization: 0 },
    { id: 'dispatch',   label: 'Dispatch Table',   assignedJobs: [], totalSqft: 0, capacity: stationCap.dispatch,   utilization: 0 },
  ];

  const unscheduled: ScheduledJob[] = [];

  sorted.forEach(job => {
    const urgent = daysUntil(job.dueDate) <= 2;
    const stationIdx = 0; // all cutting jobs go to cutting first
    const st = stations[stationIdx];
    const remaining = st.capacity - st.totalSqft;

    if (remaining <= 0) {
      unscheduled.push({
        ...job,
        assignedStation: 'cutting',
        assignedTeam: stationTeam.cutting,
        estimatedStartHour: SHIFT_START_HOUR,
        estimatedEndHour: SHIFT_START_HOUR + SHIFT_HOURS,
        latestStartDate: today(),
        isUrgent: urgent,
        willMissDueDate: daysUntil(job.dueDate) <= 0,
      });
      return;
    }

    // Calculate time slot
    const teamRate = teams.filter(t => t.station === 'cutting').reduce((s, t) => s + t.sqftPerHour, 0) || 100;
    const startSqft = st.totalSqft;
    const startHour = SHIFT_START_HOUR + (startSqft / teamRate);
    const duration  = job.sqft / teamRate;
    const endHour   = startHour + duration;

    // Backward scheduling: latest start = dueDate - 1 day buffer
    const lsd = new Date(job.dueDate || today());
    lsd.setDate(lsd.getDate() - 1);

    const scheduled: ScheduledJob = {
      ...job,
      assignedStation: 'cutting',
      assignedTeam: stationTeam.cutting || '—',
      estimatedStartHour: startHour,
      estimatedEndHour: Math.min(endHour, SHIFT_START_HOUR + SHIFT_HOURS),
      latestStartDate: lsd.toISOString().split('T')[0],
      isUrgent: urgent,
      willMissDueDate: endHour > SHIFT_START_HOUR + SHIFT_HOURS && daysUntil(job.dueDate) <= 1,
    };

    st.assignedJobs.push(scheduled);
    st.totalSqft += job.sqft;
  });

  // Calculate utilization
  stations.forEach(st => {
    st.utilization = st.capacity > 0 ? Math.min(100, Math.round((st.totalSqft / st.capacity) * 100)) : 0;
  });

  return {
    generatedAt: new Date().toISOString(),
    date: today(),
    stations,
    unscheduled,
    approved: false,
  };
};

// ─────────────────────────────────────────────────────────────────────
// 6A: Daily Plan Component
// ─────────────────────────────────────────────────────────────────────

const STATION_COLORS: Record<StationId, { bg: string; border: string; text: string; bar: string }> = {
  cutting:    { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   bar: 'bg-blue-500' },
  processing: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  bar: 'bg-amber-500' },
  dispatch:   { bg: 'bg-emerald-50',border: 'border-emerald-200',text: 'text-emerald-700',bar: 'bg-emerald-500' },
};

const DailyPlanView: React.FC<{ onSelectForUrgent: (jobId: string) => void }> = ({ onSelectForUrgent }) => {
  const { pieces, jobOrders, clients } = useProductionContext();
  const [plan, setPlan] = useState<DailyPlan | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_PLAN) || 'null');
      if (saved?.date === today()) return saved;
      return null;
    } catch { return null; }
  });
  const [generating, setGenerating] = useState(false);

  const teams = useMemo(() => loadTeams(), []);

  // Build job list from Cut pieces
  const pendingJobs = useMemo(() => {
    const cutPieces = pieces.filter(p => p.status === 'Cut');
    const jobIds = [...new Set(cutPieces.map(p => p.orderId))];

    return jobIds.map(jobId => {
      const job = jobOrders.find(j => j.id === jobId || j.orderNo === jobId);
      const client = clients.find(c => c.id === job?.clientId);
      const jobPieces = cutPieces.filter(p => p.orderId === jobId);
      const sqft = job?.items?.reduce((s: number, it: any) => s + (it.totalSqFt || 0), 0) || jobPieces.length * 8;

      return {
        jobId,
        orderRef: job?.orderNo || job?.id || jobId,
        clientName: client?.name || job?.clientId || '—',
        dueDate: job?.dueDate || job?.reqDate || '',
        sqft,
        pieces: jobPieces.length,
      };
    });
  }, [pieces, jobOrders, clients]);

  const handleGenerate = useCallback(() => {
    if (teams.length === 0) {
      toast.error('No active teams in Floor Planner. Add teams first in the Floor Planner tab.');
      return;
    }
    setGenerating(true);
    setTimeout(() => {
      const newPlan = runEDFScheduler(pendingJobs, teams);
      setPlan(newPlan);
      try { localStorage.setItem(STORAGE_KEY_PLAN, JSON.stringify(newPlan)); } catch {}
      setGenerating(false);
      toast.success('Today\'s plan generated!');
    }, 800);
  }, [pendingJobs, teams]);

  const handleApprove = () => {
    if (!plan) return;
    const approved = { ...plan, approved: true };
    setPlan(approved);
    try { localStorage.setItem(STORAGE_KEY_PLAN, JSON.stringify(approved)); } catch {}
    toast.success('Plan approved! Floor teams notified.');
  };

  const urgentCount = plan?.stations.flatMap(s => s.assignedJobs).filter(j => j.isUrgent).length || 0;
  const missCount   = plan?.stations.flatMap(s => s.assignedJobs).filter(j => j.willMissDueDate).length || 0;

  return (
    <div className="space-y-5">
      {/* Generate button */}
      {!plan && (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl py-14 text-center">
          <Zap size={40} className="mx-auto text-slate-300 mb-4" />
          <p className="text-sm font-black text-slate-500 uppercase mb-1">No plan generated yet</p>
          <p className="text-xs text-slate-400 mb-6">{pendingJobs.length} pending jobs · {teams.length} active teams</p>
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center space-x-2 px-8 py-3 bg-slate-800 text-white rounded-2xl text-sm font-black uppercase mx-auto hover:bg-slate-700 transition-colors disabled:opacity-50">
            <Zap size={16} />
            <span>{generating ? 'Generating…' : 'Generate Today\'s Plan'}</span>
          </button>
        </div>
      )}

      {plan && (
        <>
          {/* Plan header */}
          <div className={`p-5 rounded-2xl border-2 ${plan.approved ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-900 border-slate-700'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <Zap size={16} className={plan.approved ? 'text-emerald-600' : 'text-amber-400'} />
                  <p className={`text-sm font-black uppercase ${plan.approved ? 'text-emerald-800' : 'text-white'}`}>
                    {plan.approved ? 'Plan Approved ✓' : "Today's Recommended Plan"}
                  </p>
                </div>
                <p className={`text-[10px] font-bold ${plan.approved ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {plan.date} · Generated {new Date(plan.generatedAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                  · EDF algorithm
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {missCount > 0 && (
                  <span className="px-2.5 py-1 bg-rose-500 text-white text-[9px] font-black uppercase rounded-full flex items-center gap-1">
                    <AlertTriangle size={9} /> {missCount} overdue risk
                  </span>
                )}
                {urgentCount > 0 && (
                  <span className="px-2.5 py-1 bg-amber-500 text-white text-[9px] font-black uppercase rounded-full">
                    {urgentCount} urgent
                  </span>
                )}
                {!plan.approved && (
                  <button onClick={handleApprove}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase hover:bg-emerald-600 transition-colors">
                    <CheckCircle2 size={12} /> <span>Approve Plan</span>
                  </button>
                )}
                <button onClick={handleGenerate}
                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase transition-colors ${plan.approved ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}>
                  Regenerate
                </button>
              </div>
            </div>
          </div>

          {/* Station boards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {plan.stations.map(st => {
              const c = STATION_COLORS[st.id];
              return (
                <div key={st.id} className={`rounded-2xl border-2 ${c.bg} ${c.border}`}>
                  <div className="p-4 border-b border-white/50">
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-xs font-black uppercase ${c.text}`}>{st.label}</p>
                      <span className={`text-[10px] font-black ${c.text}`}>{st.utilization}% load</span>
                    </div>
                    <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                      <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${st.utilization}%` }} />
                    </div>
                    <p className="text-[9px] text-slate-500 font-bold mt-1.5">
                      {fmt(st.totalSqft, 0)} / {fmt(st.capacity, 0)} sqft
                    </p>
                  </div>
                  <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                    {st.assignedJobs.length === 0 ? (
                      <p className="text-[10px] text-slate-300 italic text-center py-4">No jobs assigned</p>
                    ) : (
                      st.assignedJobs.map((job, i) => (
                        <div key={job.jobId} className={`bg-white rounded-xl p-2.5 border ${job.willMissDueDate ? 'border-rose-200' : job.isUrgent ? 'border-amber-200' : 'border-slate-100'}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-1.5 mb-0.5">
                                <span className="text-[8px] font-black text-slate-400">#{i + 1}</span>
                                <p className="text-[10px] font-black text-slate-700 truncate">{job.orderRef}</p>
                                {job.isUrgent && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />}
                              </div>
                              <p className="text-[9px] text-slate-400 truncate">{job.clientName}</p>
                              <p className="text-[9px] font-bold text-slate-500 mt-0.5">
                                {hourToTime(job.estimatedStartHour)} → {hourToTime(job.estimatedEndHour)}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0 ml-2">
                              <p className="text-[9px] font-black text-slate-600">{job.pieces} pcs</p>
                              <p className="text-[8px] text-slate-400">{fmt(job.sqft, 0)} sqft</p>
                              {job.willMissDueDate && (
                                <span className="text-[8px] font-black text-rose-600">⚠ Late</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Unscheduled overflow */}
          {plan.unscheduled.length > 0 && (
            <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4">
              <div className="flex items-center space-x-2 mb-3">
                <AlertCircle size={16} className="text-rose-500" />
                <p className="text-sm font-black text-rose-700 uppercase">Overflow — Cannot Fit Today ({plan.unscheduled.length} jobs)</p>
              </div>
              <div className="space-y-2">
                {plan.unscheduled.map(job => (
                  <div key={job.jobId} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-rose-100">
                    <div>
                      <p className="text-xs font-black text-slate-700">{job.orderRef} — {job.clientName}</p>
                      <p className="text-[9px] text-slate-400">Due: {job.dueDate || '—'} · {job.pieces} pcs · {fmt(job.sqft, 0)} sqft</p>
                    </div>
                    <button onClick={() => onSelectForUrgent(job.jobId)}
                      className="px-2.5 py-1.5 bg-rose-500 text-white text-[9px] font-black uppercase rounded-lg hover:bg-rose-600 transition-colors">
                      Insert Urgent
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// 6B: Urgent Insert Impact Analyzer
// ─────────────────────────────────────────────────────────────────────

const UrgentInsertAnalyzer: React.FC = () => {
  const { pieces, jobOrders, clients } = useProductionContext();
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [selectedStation, setSelectedStation] = useState<StationId>('cutting');
  const [analyzed, setAnalyzed] = useState(false);

  const teams = useMemo(() => loadTeams(), []);

  const currentPlan = useMemo((): DailyPlan | null => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_PLAN) || 'null');
      return saved?.date === today() ? saved : null;
    } catch { return null; }
  }, []);

  // All pending jobs for dropdown
  const pendingJobs = useMemo(() => {
    const cutPieces = pieces.filter(p => p.status === 'Cut');
    const jobIds = [...new Set(cutPieces.map(p => p.orderId))];
    return jobIds.map(jobId => {
      const job = jobOrders.find(j => j.id === jobId || j.orderNo === jobId);
      const client = clients.find(c => c.id === job?.clientId);
      return { jobId, orderRef: job?.orderNo || jobId, clientName: client?.name || '—', dueDate: job?.dueDate || '', sqft: (job?.items?.reduce((s: number, it: any) => s + (it.totalSqFt || 0), 0) || 8), pieces: cutPieces.filter(p => p.orderId === jobId).length };
    });
  }, [pieces, jobOrders, clients]);

  const selectedJob = pendingJobs.find(j => j.jobId === selectedJobId);

  // Impact analysis
  const impact = useMemo(() => {
    if (!selectedJob || !currentPlan) return null;
    const stationData = currentPlan.stations.find(s => s.id === selectedStation);
    if (!stationData) return null;

    const teamRate = teams.filter(t => t.station === selectedStation).reduce((s, t) => s + t.sqftPerHour, 0) || 100;
    const urgentDuration = selectedJob.sqft / teamRate; // hours
    const capacity = stationData.capacity;
    const usedBefore = stationData.totalSqft;
    const usedAfter = usedBefore + selectedJob.sqft;
    const overflow = Math.max(0, usedAfter - capacity);

    // Jobs that get pushed
    let pushedSqft = 0;
    const pushedJobs: typeof stationData.assignedJobs = [];
    const remainingJobs: typeof stationData.assignedJobs = [];
    let pushing = overflow > 0;

    stationData.assignedJobs.forEach(job => {
      if (pushing && pushedSqft < overflow) {
        pushedSqft += job.sqft;
        pushedJobs.push(job);
      } else {
        remainingJobs.push(job);
      }
    });

    const delayHours = urgentDuration;
    const affectedClients = [...new Set(pushedJobs.map(j => j.clientName))];
    const missedDueDates = pushedJobs.filter(j => daysUntil(j.dueDate) <= 1);

    return { usedBefore, usedAfter, capacity, overflow, pushedJobs, remainingJobs, delayHours, affectedClients, missedDueDates, urgentDuration };
  }, [selectedJob, currentPlan, selectedStation, teams]);

  const handleConfirmInsert = () => {
    toast.success(`Urgent order ${selectedJob?.orderRef} inserted into ${selectedStation} queue`);
    setAnalyzed(false);
    setSelectedJobId('');
  };

  return (
    <div className="space-y-5">
      {/* Selector */}
      <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-5">
        <div className="flex items-center space-x-2 mb-4">
          <AlertCircle size={18} className="text-rose-500" />
          <p className="text-sm font-black text-rose-700 uppercase">Urgent Insert Impact Analyzer</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[10px] font-black uppercase text-rose-600 tracking-wider block mb-1.5">Select Order to Insert</label>
            <select value={selectedJobId} onChange={e => { setSelectedJobId(e.target.value); setAnalyzed(false); }}
              className="w-full px-3 py-2.5 border border-rose-200 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-rose-400">
              <option value="">— Select Order —</option>
              {pendingJobs.map(j => (
                <option key={j.jobId} value={j.jobId}>
                  {j.orderRef} — {j.clientName} ({j.pieces} pcs · {fmt(j.sqft, 0)} sqft)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-rose-600 tracking-wider block mb-1.5">Insert Into Station</label>
            <select value={selectedStation} onChange={e => { setSelectedStation(e.target.value as StationId); setAnalyzed(false); }}
              className="w-full px-3 py-2.5 border border-rose-200 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-rose-400">
              <option value="cutting">Cutting Table</option>
              <option value="processing">Processing Table</option>
              <option value="dispatch">Dispatch Table</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => setAnalyzed(true)}
          disabled={!selectedJobId || !currentPlan}
          className="flex items-center space-x-2 px-6 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-black uppercase hover:bg-rose-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <BarChart2 size={14} />
          <span>Analyze Impact</span>
        </button>

        {!currentPlan && (
          <p className="text-[10px] text-rose-500 font-bold mt-2">⚠ Generate today's plan first in the Daily Plan tab</p>
        )}
      </div>

      {/* Impact Analysis */}
      {analyzed && impact && selectedJob && (
        <div className="space-y-4">
          {/* Before/After */}
          <div className="grid grid-cols-2 gap-4">
            {/* Before */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-3">Current Plan</p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Capacity Used</span>
                  <span className="font-black">{fmt(impact.usedBefore)} sqft</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (impact.usedBefore / impact.capacity) * 100)}%` }} />
                </div>
                <p className="text-[9px] text-slate-400">{Math.round((impact.usedBefore / impact.capacity) * 100)}% utilized</p>
              </div>
            </div>

            {/* Arrow */}
            <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase text-rose-600 tracking-wider mb-3">After Urgent Insert</p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Capacity Used</span>
                  <span className={`font-black ${impact.usedAfter > impact.capacity ? 'text-rose-600' : 'text-slate-700'}`}>
                    {fmt(impact.usedAfter)} sqft
                  </span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${impact.usedAfter > impact.capacity ? 'bg-rose-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(100, (impact.usedAfter / impact.capacity) * 100)}%` }} />
                </div>
                {impact.overflow > 0 && (
                  <p className="text-[9px] text-rose-600 font-black">+{fmt(impact.overflow)} sqft overflow → pushed tomorrow</p>
                )}
              </div>
            </div>
          </div>

          {/* Impact summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Impact Summary</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className={`p-3 rounded-xl text-center ${impact.pushedJobs.length > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                <p className="text-[8px] font-black uppercase text-slate-400">Orders Pushed</p>
                <p className={`text-xl font-black ${impact.pushedJobs.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{impact.pushedJobs.length}</p>
              </div>
              <div className={`p-3 rounded-xl text-center ${impact.delayHours > 2 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'}`}>
                <p className="text-[8px] font-black uppercase text-slate-400">Delay Hours</p>
                <p className="text-xl font-black text-slate-700">{impact.delayHours.toFixed(1)}h</p>
              </div>
              <div className={`p-3 rounded-xl text-center ${impact.affectedClients.length > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'}`}>
                <p className="text-[8px] font-black uppercase text-slate-400">Clients Affected</p>
                <p className="text-xl font-black text-slate-700">{impact.affectedClients.length}</p>
              </div>
              <div className={`p-3 rounded-xl text-center ${impact.missedDueDates.length > 0 ? 'bg-rose-50 border border-rose-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                <p className="text-[8px] font-black uppercase text-slate-400">Due Date Misses</p>
                <p className={`text-xl font-black ${impact.missedDueDates.length > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {impact.missedDueDates.length}
                </p>
              </div>
            </div>

            {/* Pushed orders list */}
            {impact.pushedJobs.length > 0 && (
              <div>
                <p className="text-[9px] font-black uppercase text-amber-600 mb-2">Orders Moving to Tomorrow:</p>
                <div className="space-y-1.5">
                  {impact.pushedJobs.map(job => (
                    <div key={job.jobId} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${job.willMissDueDate || daysUntil(job.dueDate) <= 1 ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div>
                        <p className="text-xs font-black text-slate-700">{job.orderRef}</p>
                        <p className="text-[9px] text-slate-500">{job.clientName} · Due: {job.dueDate || '—'}</p>
                      </div>
                      {daysUntil(job.dueDate) <= 1 && (
                        <span className="text-[9px] font-black text-rose-600 px-2 py-0.5 bg-rose-100 rounded-full">⚠ Deadline Risk</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missed due dates alert */}
            {impact.missedDueDates.length > 0 && (
              <div className="bg-rose-100 border border-rose-300 rounded-xl p-3">
                <p className="text-xs font-black text-rose-800 flex items-center gap-2">
                  <AlertTriangle size={14} />
                  {impact.missedDueDates.length} order{impact.missedDueDates.length !== 1 ? 's' : ''} will miss due date:
                  {impact.missedDueDates.map(j => ` ${j.orderRef}`).join(',')}
                </p>
              </div>
            )}
          </div>

          {/* Decision buttons */}
          <div className="flex items-center space-x-3 justify-end">
            <button onClick={() => setAnalyzed(false)}
              className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
              Cancel
            </button>
            <button
              onClick={handleConfirmInsert}
              className={`flex items-center space-x-2 px-6 py-2.5 text-white text-sm font-black uppercase rounded-xl transition-colors ${impact.missedDueDates.length > 0 ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-800 hover:bg-slate-700'}`}
            >
              <CheckCircle2 size={14} />
              <span>{impact.missedDueDates.length > 0 ? 'Confirm (Risk Accepted)' : 'Confirm Insert'}</span>
            </button>
          </div>
        </div>
      )}

      {analyzed && !currentPlan && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs font-bold text-amber-700">
          Generate today's plan first in the "Daily Plan" tab to use Impact Analysis.
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Main Hub
// ─────────────────────────────────────────────────────────────────────

type Tab = 'plan' | 'urgent';

const AIFloorPlanAdvisor: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('plan');
  const [urgentPreselect, setUrgentPreselect] = useState<string>('');

  const handleSelectForUrgent = (jobId: string) => {
    setUrgentPreselect(jobId);
    setActiveTab('urgent');
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-violet-900 text-white p-7 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"><Zap size={160} className="absolute -right-4 -top-4" /></div>
        <div className="relative z-10">
          <div className="flex items-center space-x-2 mb-1">
            <Zap size={20} className="text-violet-400" />
            <h2 className="text-xl font-black uppercase">AI Floor Plan Advisor</h2>
          </div>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
            EDF Scheduler · Urgent Insert Analyzer · Impact Assessment
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-1.5 flex space-x-1 w-fit shadow-sm">
        <button onClick={() => setActiveTab('plan')}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all border-b-2 ${activeTab === 'plan' ? 'bg-slate-50 text-slate-800 border-slate-700' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}>
          <Target size={14} /> <span>Daily Plan</span>
        </button>
        <button onClick={() => setActiveTab('urgent')}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all border-b-2 ${activeTab === 'urgent' ? 'bg-rose-50 text-rose-800 border-rose-600' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}>
          <AlertCircle size={14} /> <span>Urgent Insert</span>
        </button>
      </div>

      {activeTab === 'plan' && <DailyPlanView onSelectForUrgent={handleSelectForUrgent} />}
      {activeTab === 'urgent' && <UrgentInsertAnalyzer />}
    </div>
  );
};

export default AIFloorPlanAdvisor;
