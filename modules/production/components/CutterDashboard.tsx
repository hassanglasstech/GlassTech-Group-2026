/**
 * CutterDashboard.tsx — Stage 2D
 * Cutter performance: sqft/day, wastage %, defect rate per cutter.
 * Uses Stage 1B labour logs + cutting sessions.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { LabourService, CutterDailyLog } from '@/modules/production/services/labourService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, TrendingUp, AlertTriangle, Award, Loader2, Clock } from 'lucide-react';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = (n: number, d = 0) => n.toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });

interface CutterProfile {
  name: string;
  totalDays: number;
  totalSqft: number;
  avgSqftPerDay: number;
  totalPieces: number;
  totalOTHours: number;
  sessionsCount: number;
  totalScrapSqft: number;
  avgWastagePct: number;
  rank: number;
  belowAverage: boolean;
}

const CutterDashboard: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [logs, setLogs] = useState<CutterDailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setLogs(await LabourService.getLogs(company));
    setLoading(false);
  }, [company]);
  useEffect(() => { loadData(); }, [loadData]);

  // Get cutting sessions for wastage data
  const sessions = useMemo(() => InventoryService.getCuttingSessions().filter(s => s.company === company && s.status === 'Closed'), [company]);

  const availableMonths = useMemo(() => Array.from(new Set(logs.map(l => l.logDate.substring(0, 7)))).sort().reverse(), [logs]);

  const profiles = useMemo((): CutterProfile[] => {
    const filtered = filterMonth ? logs.filter(l => l.logDate.startsWith(filterMonth)) : logs;
    const byCutter: Record<string, CutterDailyLog[]> = {};
    filtered.forEach(l => { if (!byCutter[l.cutterName]) byCutter[l.cutterName] = []; byCutter[l.cutterName].push(l); });

    const result = Object.entries(byCutter).map(([name, entries]) => {
      const cutterSessions = sessions.filter(s => s.cutterName === name);
      const totalScrap = cutterSessions.reduce((s, cs) => s + (cs.scrapSqft || 0), 0);
      const totalSqft = entries.reduce((s, e) => s + e.sqftProduced, 0);
      const avgWastage = cutterSessions.length > 0
        ? cutterSessions.reduce((s, cs) => s + (cs.estimatedWastagePct || 0), 0) / cutterSessions.length
        : 0;

      return {
        name,
        totalDays: entries.length,
        totalSqft,
        avgSqftPerDay: entries.length > 0 ? totalSqft / entries.length : 0,
        totalPieces: entries.reduce((s, e) => s + e.piecesCut, 0),
        totalOTHours: entries.reduce((s, e) => s + e.overtimeHours, 0),
        sessionsCount: cutterSessions.length,
        totalScrapSqft: totalScrap,
        avgWastagePct: avgWastage,
        rank: 0,
        belowAverage: false,
      };
    }).sort((a, b) => b.avgSqftPerDay - a.avgSqftPerDay);

    const overallAvg = result.length > 0 ? result.reduce((s, p) => s + p.avgSqftPerDay, 0) / result.length : 0;
    result.forEach((p, i) => { p.rank = i + 1; p.belowAverage = p.avgSqftPerDay < overallAvg; });
    return result;
  }, [logs, sessions, filterMonth]);

  const overallAvgSqft = profiles.length > 0 ? profiles.reduce((s, p) => s + p.avgSqftPerDay, 0) / profiles.length : 0;
  const topCutter = profiles[0];
  const totalOT = profiles.reduce((s, p) => s + p.totalOTHours, 0);

  const chartData = profiles.slice(0, 8).map(p => ({
    name: p.name.split(' ')[0],
    sqftPerDay: Math.round(p.avgSqftPerDay),
    wastage: Number(p.avgWastagePct.toFixed(1)),
  }));

  if (loading) return <div className="h-64 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2" size={20}/> Loading...</div>;
  if (profiles.length === 0) return (
    <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
      <Users size={32} className="mx-auto text-slate-300 mb-3"/>
      <p className="text-sm font-bold text-slate-400">No cutter data yet. Enter daily logs in the Labour tab first.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <Award size={20} className="text-purple-500"/> Cutter Performance
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{profiles.length} cutters | {company}</p>
        </div>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="text-xs font-bold border border-slate-200 rounded-lg px-3 py-1.5">
          <option value="">All Time</option>
          {availableMonths.map(m => <option key={m} value={m}>{MONTHS_SHORT[parseInt(m.split('-')[1]) - 1]} {m.split('-')[0]}</option>)}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-purple-500 uppercase">Top Cutter</p>
          <p className="text-lg font-black text-purple-700 mt-1">{topCutter?.name.split(' ')[0] || '—'}</p>
          <p className="text-[10px] text-purple-500 font-bold">{topCutter ? `${fmt(topCutter.avgSqftPerDay, 0)} sqft/day` : ''}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-blue-500 uppercase">Avg SqFt/Day</p>
          <p className="text-2xl font-black text-blue-700 mt-1">{fmt(overallAvgSqft, 0)}</p>
          <p className="text-[10px] text-blue-500 font-bold">across {profiles.length} cutters</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-amber-500 uppercase">Below Average</p>
          <p className="text-2xl font-black text-amber-700 mt-1">{profiles.filter(p => p.belowAverage).length}</p>
          <p className="text-[10px] text-amber-500 font-bold">cutters need training</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-red-500 uppercase">Total OT Hours</p>
          <p className="text-2xl font-black text-red-700 mt-1">{fmt(totalOT, 1)}</p>
          <p className="text-[10px] text-red-500 font-bold">@ 2x effective cost</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">SqFt/Day & Wastage % by Cutter</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }}/>
              <YAxis yAxisId="sqft" tick={{ fontSize: 10 }}/>
              <YAxis yAxisId="waste" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`}/>
              <Tooltip/>
              <Bar yAxisId="sqft" dataKey="sqftPerDay" name="SqFt/Day" fill="#8b5cf6" radius={[6,6,0,0]}/>
              <Bar yAxisId="waste" dataKey="wastage" name="Wastage %" fill="#f59e0b" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Rankings Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><TrendingUp size={12}/> Cutter Rankings</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase">
              <th className="text-center px-3 py-2.5">Rank</th>
              <th className="text-left px-3 py-2.5">Cutter</th>
              <th className="text-right px-3 py-2.5">Days</th>
              <th className="text-right px-3 py-2.5">Total SqFt</th>
              <th className="text-right px-3 py-2.5">Avg/Day</th>
              <th className="text-right px-3 py-2.5">Pieces</th>
              <th className="text-right px-3 py-2.5">Wastage %</th>
              <th className="text-right px-3 py-2.5">OT Hrs</th>
              <th className="text-center px-3 py-2.5">Status</th>
            </tr></thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.name} className={`border-t border-slate-50 ${p.belowAverage ? 'bg-amber-50/30' : ''}`}>
                  <td className="text-center px-3 py-2.5">
                    <span className={`inline-block w-6 h-6 rounded-full text-[10px] font-black leading-6 text-center ${p.rank === 1 ? 'bg-yellow-400 text-white' : p.rank === 2 ? 'bg-slate-300 text-white' : p.rank === 3 ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{p.rank}</span>
                  </td>
                  <td className="px-3 py-2.5 font-black text-slate-700">{p.name}</td>
                  <td className="text-right px-3 py-2.5 font-bold text-slate-500">{p.totalDays}</td>
                  <td className="text-right px-3 py-2.5 font-black text-blue-600">{fmt(p.totalSqft, 0)}</td>
                  <td className="text-right px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${p.belowAverage ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{fmt(p.avgSqftPerDay, 0)}</span>
                  </td>
                  <td className="text-right px-3 py-2.5 font-bold text-slate-600">{p.totalPieces}</td>
                  <td className="text-right px-3 py-2.5">
                    {p.avgWastagePct > 0 ? (
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${p.avgWastagePct > 15 ? 'bg-red-100 text-red-700' : p.avgWastagePct > 12 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.avgWastagePct.toFixed(1)}%</span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="text-right px-3 py-2.5 font-bold text-amber-600">{p.totalOTHours > 0 ? fmt(p.totalOTHours, 1) : '—'}</td>
                  <td className="text-center px-3 py-2.5">
                    {p.belowAverage ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-700 flex items-center gap-0.5 w-fit mx-auto"><AlertTriangle size={9}/> Training</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-700">Good</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CutterDashboard);
