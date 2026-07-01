/**
 * CutterPerformance.tsx — Sprint 8
 *
 * Cutter productivity scoreboard. Wraps the existing CutterDashboard
 * (sqft/day + wastage % + leaderboard) and adds the **sqft/hour**
 * metric the Sprint 8 spec asks for, computed from cutting_sessions
 * (start/end timestamps) rather than daily labour logs.
 *
 * Why a separate page rather than mutating CutterDashboard?
 *   • CutterDashboard is reused inside the production "More" dropdown
 *     and the older glassco-supervisor flows. Touching it means
 *     dragging four owners into review.
 *   • This page composes the existing dashboard above + a fresh
 *     sqft/hour table below — no schema changes, no risk to old paths.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { ProductionPiece } from '@/modules/shared/types';
import { JobOrder } from '@/modules/production/types/production';
import { CuttingSession, GRNSheetEntry } from '@/modules/procurement/types/inventory';
import CutterDashboard from '@/modules/production/components/CutterDashboard';
import { Award, Clock, TrendingUp, RefreshCw, AlertTriangle, Scissors } from 'lucide-react';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { formatNumber } from '@/modules/shared/utils/format';

interface SqftPerHourRow {
  cutter:        string;
  sessions:      number;
  totalMinutes:  number;
  totalSqft:     number;
  sqftPerHour:   number;
  avgWastagePct: number;
  isAboveTarget: boolean;
}

const TARGET_SQFT_PER_HOUR = 200;       // ops baseline; tweak if industry data updates

const minutesBetween = (start: string, end?: string): number => {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.round((e - s) / 60_000);
};

const CutterPerformance: React.FC = () => {
  const user = useAuthStore(s => s.user);
  const company = (useAppStore(s => s.selectedCompany) as string) || 'Glassco';

  const [tick, setTick] = useState(0);

  // Cloud-backed load — the sync getters are localStorage-only (empty on a
  // fresh route), so the scoreboard rendered empty. Pull from cloud on mount /
  // company change / Refresh (tick).
  const [rawSessions, setRawSessions] = useState<CuttingSession[]>([]);
  const [rawSheets, setRawSheets] = useState<GRNSheetEntry[]>([]);
  const [rawPieces, setRawPieces] = useState<ProductionPiece[]>([]);
  const [jobs, setJobs] = useState<JobOrder[]>([]);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [sess, grn, pcs, ords] = await Promise.all([
          InventoryService.getCuttingSessionsAsync(),
          InventoryService.getGRNSheetEntriesAsync(),
          ProductionService.getProductionPiecesAsync(),
          AsyncSalesService.getQuotations(),
        ]);
        if (!alive) return;
        setRawSessions(sess);
        setRawSheets(grn);
        setRawPieces(pcs);
        setJobs(ords as JobOrder[]);
      } catch {
        if (!alive) return;
        setRawSessions(InventoryService.getCuttingSessions());
        setRawSheets(InventoryService.getGRNSheetEntries());
        setRawPieces(ProductionService.getProductionPieces());
      }
    })();
    return () => { alive = false; };
  }, [company, tick]);

  // Per-cutter daily cutting + reconciliation (083 cutter workflow).
  const orderCutter = useMemo(() => {
    const m = new Map<string, string>();
    jobs.forEach(j => {
      if (j.assignedCutter) {
        if (j.orderNo) m.set(j.orderNo, j.assignedCutter);
        if (j.id) m.set(j.id, j.assignedCutter);
      }
    });
    return m;
  }, [jobs]);

  const dailyRows = useMemo(() => {
    const m = new Map<string, { cutToday: number; sqftToday: number; cutTotal: number; pending: number }>();
    const ensure = (c: string) => { let v = m.get(c); if (!v) { v = { cutToday: 0, sqftToday: 0, cutTotal: 0, pending: 0 }; m.set(c, v); } return v; };
    rawPieces.forEach(p => {
      if (p.cutBy) {
        const v = ensure(p.cutBy);
        v.cutTotal += 1;
        if (p.cutAt && p.cutAt.slice(0, 10) === date) { v.cutToday += 1; v.sqftToday += Number(p.sqft) || 0; }
      }
      if (p.status === 'Pending-Cut') {
        const cutter = orderCutter.get(p.orderId);
        if (cutter) ensure(cutter).pending += 1;
      }
    });
    return [...m.entries()].map(([cutter, v]) => ({ cutter, ...v })).sort((a, b) => b.cutToday - a.cutToday || b.pending - a.pending);
  }, [rawPieces, orderCutter, date]);

  const dailyTotals = useMemo(() => dailyRows.reduce((t, r) => ({
    cutToday: t.cutToday + r.cutToday, sqftToday: t.sqftToday + r.sqftToday, pending: t.pending + r.pending,
  }), { cutToday: 0, sqftToday: 0, pending: 0 }), [dailyRows]);

  const sessions = useMemo<CuttingSession[]>(() => {
    return rawSessions.filter(s => s.company === company && s.status === 'Closed');
  }, [rawSessions, company]);

  const sheetMap = useMemo<Record<string, GRNSheetEntry>>(() => {
    const all = rawSheets.filter(e => e.company === company);
    const map: Record<string, GRNSheetEntry> = {};
    all.forEach(e => { map[e.tagId] = e; });
    return map;
  }, [rawSheets, company]);

  const sqftPerHourRows = useMemo<SqftPerHourRow[]>(() => {
    const byCutter: Record<string, CuttingSession[]> = {};
    sessions.forEach(s => {
      const k = s.cutterName || 'Unknown';
      (byCutter[k] ||= []).push(s);
    });
    return Object.entries(byCutter).map(([cutter, list]) => {
      let totalMin = 0;
      let totalSqft = 0;
      let totalWaste = 0;
      let wasteSamples = 0;
      list.forEach(s => {
        const min = minutesBetween(s.startTime, s.endTime);
        totalMin += min;
        // sqft = sum(sheets sqftPerSheet) - scrapSqft
        const sheets = (s.sheetsScanned || []).reduce((acc, sc) => {
          const ge = sheetMap[sc.tagId];
          return acc + (ge?.sqftPerSheet || 0);
        }, 0);
        totalSqft += Math.max(0, sheets - (s.scrapSqft || 0));
        if (typeof s.actualWastagePct === 'number') {
          totalWaste += s.actualWastagePct;
          wasteSamples += 1;
        } else if (typeof s.estimatedWastagePct === 'number') {
          totalWaste += s.estimatedWastagePct;
          wasteSamples += 1;
        }
      });
      const sqftPerHour = totalMin > 0 ? (totalSqft / (totalMin / 60)) : 0;
      const avgWastage = wasteSamples > 0 ? (totalWaste / wasteSamples) : 0;
      return {
        cutter,
        sessions:     list.length,
        totalMinutes: totalMin,
        totalSqft:    Math.round(totalSqft),
        sqftPerHour:  Math.round(sqftPerHour),
        avgWastagePct: Number(avgWastage.toFixed(1)),
        isAboveTarget: sqftPerHour >= TARGET_SQFT_PER_HOUR,
      };
    }).sort((a, b) => b.sqftPerHour - a.sqftPerHour);
  }, [sessions, sheetMap]);

  // Guard placed after hooks to keep hook order stable (react-hooks/rules-of-hooks)
  if (!user) return <Navigate to="/" replace/>;

  const wasteAlerts = sqftPerHourRows.filter(r => r.avgWastagePct > 15).length;

  return (
    <div className="space-y-5 p-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-700 to-indigo-700 text-white rounded-card p-6 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award size={24}/>
          <div>
            <h1 className="text-xl font-black uppercase">Cutter Performance</h1>
            <p className="text-2xs text-blue-100 font-bold uppercase tracking-widest mt-0.5">
              Sqft / hour · wastage trend · daily breakdown
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {wasteAlerts > 0 && (
            <span className="bg-amber-500 text-white text-2xs font-black px-3 py-1.5 rounded-xl flex items-center gap-1">
              <AlertTriangle size={12}/> {wasteAlerts} cutters over 15% wastage
            </span>
          )}
          <button onClick={() => setTick(x => x + 1)} className="bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2">
            <RefreshCw size={14}/> Refresh
          </button>
        </div>
      </div>

      {/* Sqft/hour scoreboard */}
      <div className="bg-white rounded-card border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b">
          <p className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
            <Clock size={14}/> Sqft / Hour Scoreboard
            <span className="text-2xs text-slate-400 font-bold ml-2 normal-case tracking-normal">
              Target: {TARGET_SQFT_PER_HOUR} sqft/hr · computed from cutting_sessions start→end timestamps
            </span>
          </p>
        </div>
        {sqftPerHourRows.length === 0 ? (
          <EmptyState
            icon={<Clock size={22} />}
            title="No closed cutting sessions yet"
            description="Sqft/hour scores appear here once cutters complete and close cutting sessions."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-2xs font-black uppercase text-slate-400 tracking-widest border-b">
                <tr>
                  <th className="px-4 py-2.5 w-12">Rank</th>
                  <th className="px-4 py-2.5">Cutter</th>
                  <th className="px-3 py-2.5 text-right">Sessions</th>
                  <th className="px-3 py-2.5 text-right">Hours Logged</th>
                  <th className="px-3 py-2.5 text-right">Total Sqft</th>
                  <th className="px-3 py-2.5 text-right">Avg Wastage %</th>
                  <th className="px-3 py-2.5 text-right w-32">Sqft / Hour</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sqftPerHourRows.map((r, idx) => (
                  <tr key={r.cutter} className={`hover:bg-slate-50 ${r.isAboveTarget ? 'bg-emerald-50/30' : 'bg-amber-50/20'}`}>
                    <td className="px-4 py-2.5 font-black text-slate-400">#{idx + 1}</td>
                    <td className="px-4 py-2.5 font-black text-slate-800">{r.cutter}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-700">{r.sessions}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-700">{(r.totalMinutes / 60).toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-700">{r.totalSqft.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`text-2xs font-black px-2 py-0.5 rounded ${
                        r.avgWastagePct > 15 ? 'bg-rose-100 text-rose-700'
                        : r.avgWastagePct > 10 ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {r.avgWastagePct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`text-sm font-black px-3 py-1 rounded-lg ${r.isAboveTarget ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
                        {r.sqftPerHour}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Daily Cutting & Reconciliation (083 cutter workflow) */}
      <div className="bg-white rounded-card border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
            <Scissors size={14}/> Daily Cutting &amp; Reconciliation
            <span className="text-2xs text-slate-400 font-bold ml-2 normal-case tracking-normal">
              Per-cutter cut vs assigned-pending, for the selected day
            </span>
          </p>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="sap-input px-2 py-1 text-xs rounded-control border border-slate-200" />
        </div>
        {dailyRows.length === 0 ? (
          <EmptyState icon={<Scissors size={22} />} title="No cutter activity" description="Assign jobs to cutters and have them cut their queue — daily totals and reconciliation appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-2xs font-black uppercase text-slate-400 tracking-widest border-b">
                <tr>
                  <th className="px-4 py-2.5">Cutter</th>
                  <th className="px-3 py-2.5 text-right">Cut (day)</th>
                  <th className="px-3 py-2.5 text-right">Sqft (day)</th>
                  <th className="px-3 py-2.5 text-right">Pending (to cut)</th>
                  <th className="px-3 py-2.5 text-right">Cut (total)</th>
                  <th className="px-3 py-2.5 text-right w-28">Reconcile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyRows.map(r => {
                  const done = r.pending === 0;
                  return (
                    <tr key={r.cutter} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-black text-slate-800">{r.cutter}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-700">{formatNumber(r.cutToday)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-700">{formatNumber(Math.round(r.sqftToday))}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-700">{formatNumber(r.pending)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-700">{formatNumber(r.cutTotal)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`text-2xs font-black px-2 py-0.5 rounded ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {done ? 'All cut' : `${r.pending} left`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-black">
                  <td className="px-4 py-2.5 text-slate-700 uppercase">Total</td>
                  <td className="px-3 py-2.5 text-right text-slate-800">{formatNumber(dailyTotals.cutToday)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-800">{formatNumber(Math.round(dailyTotals.sqftToday))}</td>
                  <td className="px-3 py-2.5 text-right text-slate-800">{formatNumber(dailyTotals.pending)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-400">—</td>
                  <td className="px-3 py-2.5 text-right text-slate-400">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Existing daily breakdown — leaderboard, monthly chart, etc. */}
      <div className="bg-white rounded-card border-2 border-slate-200 shadow-sm">
        <div className="px-4 py-3 bg-slate-50 border-b">
          <p className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
            <TrendingUp size={14}/> Daily Breakdown (sqft / day)
            <span className="text-2xs text-slate-400 font-bold ml-2 normal-case tracking-normal">
              From labour logs (existing CutterDashboard view)
            </span>
          </p>
        </div>
        <div className="p-4">
          <CutterDashboard />
        </div>
      </div>
    </div>
  );
};

export default CutterPerformance;
