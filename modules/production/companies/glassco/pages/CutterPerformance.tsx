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

import React, { useMemo, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { CuttingSession, GRNSheetEntry } from '@/modules/procurement/types/inventory';
import CutterDashboard from '@/modules/production/components/CutterDashboard';
import { Award, Clock, TrendingUp, Activity, RefreshCw, AlertTriangle } from 'lucide-react';

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

  if (!user) return <Navigate to="/" replace/>;

  const [tick, setTick] = useState(0);

  const sessions = useMemo<CuttingSession[]>(() => {
    return InventoryService.getCuttingSessions().filter(s => s.company === company && s.status === 'Closed');
  }, [company, tick]);

  const sheetMap = useMemo<Record<string, GRNSheetEntry>>(() => {
    const all = InventoryService.getGRNSheetEntries().filter(e => e.company === company);
    const map: Record<string, GRNSheetEntry> = {};
    all.forEach(e => { map[e.tagId] = e; });
    return map;
  }, [company, tick]);

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

  const wasteAlerts = sqftPerHourRows.filter(r => r.avgWastagePct > 15).length;

  return (
    <div className="space-y-5 p-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-700 to-indigo-700 text-white rounded-2xl p-6 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award size={24}/>
          <div>
            <h1 className="text-xl font-black uppercase">Cutter Performance</h1>
            <p className="text-[10px] text-blue-100 font-bold uppercase tracking-widest mt-0.5">
              Sqft / hour · wastage trend · daily breakdown
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {wasteAlerts > 0 && (
            <span className="bg-amber-500 text-white text-[11px] font-black px-3 py-1.5 rounded-xl flex items-center gap-1">
              <AlertTriangle size={12}/> {wasteAlerts} cutters over 15% wastage
            </span>
          )}
          <button onClick={() => setTick(x => x + 1)} className="bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2">
            <RefreshCw size={14}/> Refresh
          </button>
        </div>
      </div>

      {/* Sqft/hour scoreboard */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b">
          <p className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
            <Clock size={14}/> Sqft / Hour Scoreboard
            <span className="text-[10px] text-slate-400 font-bold ml-2 normal-case tracking-normal">
              Target: {TARGET_SQFT_PER_HOUR} sqft/hr · computed from cutting_sessions start→end timestamps
            </span>
          </p>
        </div>
        {sqftPerHourRows.length === 0 ? (
          <p className="p-12 text-center text-slate-300 italic font-bold text-sm">No closed cutting sessions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-widest border-b">
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
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded ${
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

      {/* Existing daily breakdown — leaderboard, monthly chart, etc. */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm">
        <div className="px-4 py-3 bg-slate-50 border-b">
          <p className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
            <TrendingUp size={14}/> Daily Breakdown (sqft / day)
            <span className="text-[10px] text-slate-400 font-bold ml-2 normal-case tracking-normal">
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
