/**
 * GlasscoMRP.tsx — Phase 1: Material Requirements Planning
 *
 * Two tabs:
 * 1. Material Requirements — shortage/surplus per glass type+thickness
 * 2. Cutting Schedule — orders sorted by due date, backward-scheduled start
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { runMRP, MRPResult, MRPRequirement, MRPSchedule } from '@/modules/procurement/services/mrpService';
import {
  RefreshCw, AlertTriangle, CheckCircle2, TrendingDown,
  Layers, CalendarDays, Clock, Package, ChevronDown, ChevronUp,
  AlertCircle, BarChart2, FileSpreadsheet
} from 'lucide-react';
import { toast } from 'sonner';
import { exportMRPResults } from '@/modules/production/services/productionExporter';   // Phase-6 (6.7)

// ── Helpers ───────────────────────────────────────────────────────────

const fmt = (n: number, d = 0) => n.toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });
const today = () => new Date().toISOString().split('T')[0];

// ── Material Requirements Tab ─────────────────────────────────────────

const RequirementsTab: React.FC<{ requirements: MRPRequirement[] }> = ({ requirements }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (requirements.length === 0) {
    return (
      <div className="text-center py-16">
        <Package size={36} className="mx-auto text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-400">No active orders found</p>
        <p className="text-xs text-slate-300 mt-1">Approve quotations to see material requirements</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requirements.map(req => {
        const isExp = expanded === req.materialKey;
        const statusColor = req.status === 'shortage'
          ? 'border-rose-300 bg-rose-50'
          : req.status === 'surplus'
          ? 'border-blue-200 bg-blue-50'
          : 'border-emerald-200 bg-emerald-50';
        const badgeColor = req.status === 'shortage'
          ? 'bg-rose-100 text-rose-700'
          : req.status === 'surplus'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-emerald-100 text-emerald-700';

        return (
          <div key={req.materialKey} className={`rounded-2xl border-2 ${statusColor} overflow-hidden`}>
            {/* Header row */}
            <button
              className="w-full px-5 py-4 flex items-center justify-between text-left"
              onClick={() => setExpanded(isExp ? null : req.materialKey)}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-xl ${req.status === 'shortage' ? 'bg-rose-100' : req.status === 'surplus' ? 'bg-blue-100' : 'bg-emerald-100'}`}>
                  <Layers size={16} className={req.status === 'shortage' ? 'text-rose-600' : req.status === 'surplus' ? 'text-blue-600' : 'text-emerald-600'} />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-800">{req.thickness} {req.glassType}</p>
                  <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                    {req.ordersContributing.length} order{req.ordersContributing.length !== 1 ? 's' : ''} · {fmt(req.totalSqftRequired, 1)} sqft net + {req.wastageBuffer}% wastage
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                {req.status === 'shortage' && (
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase text-rose-500">Shortage</p>
                    <p className="text-lg font-black text-rose-700">{fmt(req.shortage, 1)} sqft</p>
                  </div>
                )}
                {req.status === 'surplus' && (
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase text-blue-500">Surplus</p>
                    <p className="text-lg font-black text-blue-700">{fmt(req.surplus, 1)} sqft</p>
                  </div>
                )}
                {req.status === 'ok' && (
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${badgeColor}`}>
                    Sufficient
                  </span>
                )}
                {isExp ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
              </div>
            </button>

            {/* Expanded detail */}
            {isExp && (
              <div className="px-5 pb-4 border-t border-white/50 pt-3 space-y-3">
                {/* Stock vs required */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/70 rounded-xl p-3 text-center">
                    <p className="text-[8px] font-black uppercase text-slate-400">Net Required</p>
                    <p className="text-base font-black text-slate-700">{fmt(req.totalSqftRequired, 1)}</p>
                    <p className="text-[9px] text-slate-400">sqft</p>
                  </div>
                  <div className="bg-white/70 rounded-xl p-3 text-center">
                    <p className="text-[8px] font-black uppercase text-slate-400">Gross + wastage</p>
                    <p className="text-base font-black text-slate-700">{fmt(req.grossSqftWithWastage, 1)}</p>
                    <p className="text-[9px] text-slate-400">sqft ({req.wastageBuffer}% buffer)</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${req.stockAvailable >= req.grossSqftWithWastage ? 'bg-emerald-100/70' : 'bg-rose-100/70'}`}>
                    <p className="text-[8px] font-black uppercase text-slate-400">In Stock</p>
                    <p className={`text-base font-black ${req.stockAvailable >= req.grossSqftWithWastage ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {fmt(req.stockAvailable, 1)}
                    </p>
                    <p className="text-[9px] text-slate-400">sqft</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-1">
                    <span>Coverage</span>
                    <span>{req.grossSqftWithWastage > 0 ? Math.round((req.stockAvailable / req.grossSqftWithWastage) * 100) : 0}%</span>
                  </div>
                  <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${req.status === 'shortage' ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, req.grossSqftWithWastage > 0 ? (req.stockAvailable / req.grossSqftWithWastage) * 100 : 0)}%` }}
                    />
                  </div>
                </div>

                {/* Orders list */}
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-400 mb-1.5">Orders needing this material</p>
                  <div className="space-y-1.5">
                    {req.ordersContributing.map(o => (
                      <div key={o.orderId} className="flex items-center justify-between bg-white/60 px-3 py-1.5 rounded-lg text-xs">
                        <span className="font-bold text-slate-700">{o.orderRef}</span>
                        <span className="text-slate-500">{fmt(o.sqft, 1)} sqft</span>
                        {o.dueDate && <span className={`text-[9px] font-bold ${new Date(o.dueDate) < new Date() ? 'text-rose-600' : 'text-slate-400'}`}>Due: {o.dueDate}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Cutting Schedule Tab ──────────────────────────────────────────────

const ScheduleTab: React.FC<{ schedule: MRPSchedule[]; shortageKeys: Set<string> }> = ({ schedule, shortageKeys }) => {
  if (schedule.length === 0) {
    return (
      <div className="text-center py-16">
        <CalendarDays size={36} className="mx-auto text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-400">No pending orders</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-wider">
            <th className="text-left px-4 py-3">Order</th>
            <th className="text-left px-4 py-3">Client</th>
            <th className="text-right px-4 py-3">Sqft</th>
            <th className="text-center px-4 py-3">Due date</th>
            <th className="text-center px-4 py-3">Latest start</th>
            <th className="text-center px-4 py-3">Status</th>
            <th className="text-center px-4 py-3">Material</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map(s => {
            const hasMaterialIssue = s.glassBreakdown.some(g => shortageKeys.has(g.key));
            return (
              <tr
                key={s.orderId}
                className={`border-t border-slate-50 ${s.isOverdue ? 'bg-rose-50/40' : s.isUrgent ? 'bg-amber-50/40' : ''}`}
              >
                <td className="px-4 py-3 font-black text-slate-700">{s.orderRef}</td>
                <td className="px-4 py-3 text-slate-500 max-w-[120px] truncate">{s.clientName}</td>
                <td className="px-4 py-3 text-right font-bold text-blue-600">{fmt(s.totalSqft, 1)}</td>
                <td className="px-4 py-3 text-center">
                  {s.dueDate ? (
                    <span className={`font-bold ${s.daysUntilDue < 0 ? 'text-rose-600' : s.daysUntilDue <= 3 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {s.dueDate}
                      <span className="block text-[8px] font-bold text-slate-400">
                        {s.daysUntilDue < 0 ? `${Math.abs(s.daysUntilDue)}d overdue` : `${s.daysUntilDue}d left`}
                      </span>
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {s.latestCuttingStart ? (
                    <span className={`font-bold ${s.isOverdue ? 'text-rose-600' : s.isUrgent ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {s.latestCuttingStart}
                      <span className="block text-[8px] font-bold text-slate-400">
                        {s.daysUntilStart < 0 ? 'Overdue' : s.daysUntilStart === 0 ? 'Today' : `in ${s.daysUntilStart}d`}
                      </span>
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {s.isOverdue ? (
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-rose-100 text-rose-700">Overdue</span>
                  ) : s.isUrgent ? (
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-amber-100 text-amber-700">Urgent</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-emerald-100 text-emerald-700">On track</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {hasMaterialIssue ? (
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-rose-100 text-rose-700 flex items-center gap-0.5 w-fit mx-auto">
                      <AlertTriangle size={8} /> Short
                    </span>
                  ) : (
                    <CheckCircle2 size={14} className="mx-auto text-emerald-400" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────

const GlasscoMRP: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [result, setResult] = useState<MRPResult | null>(null);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'requirements' | 'schedule'>('requirements');

  const handleRun = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      try {
        const r = runMRP(company);
        setResult(r);
        toast.success(`MRP run complete — ${r.totalOrders} orders, ${r.totalShortages} shortage${r.totalShortages !== 1 ? 's' : ''}`);
      } catch (e) {
        console.error('[MRP]', e);
        toast.error('MRP run failed — check console');
      }
      setRunning(false);
    }, 600);
  }, [company]);

  const shortageKeys = useMemo(() =>
    new Set(result?.requirements.filter(r => r.shortage > 0).map(r => r.materialKey) || []),
    [result]
  );

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-7 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"><BarChart2 size={160} className="absolute -right-4 -top-4" /></div>
        <div className="relative z-10 flex items-center justify-between">
          <div>
            
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">
              {company} · Glass stock vs open orders · Backward scheduling
            </p>
          </div>
          <div className="flex gap-2">
            {/* Phase-6 (6.7) — Excel export of MRP requirements */}
            {result && (
                <button
                    onClick={() => {
                        try { exportMRPResults(result.requirements as any[], 'requirements'); toast.success(`Exported ${result.requirements.length} requirement rows.`); }
                        catch (e: any) { toast.error(e?.message || 'Export failed.'); }
                    }}
                    className="flex items-center space-x-2 px-5 py-3 rounded-2xl text-xs font-black uppercase bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg"
                    title="Export Material Requirements to Excel"
                >
                    <FileSpreadsheet size={13}/> <span>Export</span>
                </button>
            )}
            <button
                onClick={handleRun}
                disabled={running}
                className={`flex items-center space-x-2 px-6 py-3 rounded-2xl text-sm font-black uppercase transition-all ${
                    running ? 'bg-white/10 text-slate-400' : 'bg-white text-slate-900 hover:bg-slate-100 shadow-lg'
                }`}
            >
                <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
                <span>{running ? 'Running…' : 'Run MRP'}</span>
            </button>
          </div>
        </div>

        {result && (
          <div className="flex space-x-3 mt-4 relative z-10">
            <div className="bg-white/10 px-4 py-2.5 rounded-2xl border border-white/10 text-center">
              <p className="text-[9px] font-black uppercase text-slate-400">Orders</p>
              <p className="text-xl font-black">{result.totalOrders}</p>
            </div>
            <div className={`px-4 py-2.5 rounded-2xl border text-center ${result.totalShortages > 0 ? 'bg-rose-500/20 border-rose-500/20' : 'bg-emerald-500/20 border-emerald-500/20'}`}>
              <p className="text-[9px] font-black uppercase text-slate-400">Shortages</p>
              <p className={`text-xl font-black ${result.totalShortages > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{result.totalShortages}</p>
            </div>
            <div className={`px-4 py-2.5 rounded-2xl border text-center ${result.ordersAtRisk > 0 ? 'bg-amber-500/20 border-amber-500/20' : 'bg-white/10 border-white/10'}`}>
              <p className="text-[9px] font-black uppercase text-slate-400">At risk</p>
              <p className={`text-xl font-black ${result.ordersAtRisk > 0 ? 'text-amber-400' : ''}`}>{result.ordersAtRisk}</p>
            </div>
            <div className="bg-white/10 px-4 py-2.5 rounded-2xl border border-white/10 text-center ml-auto">
              <p className="text-[9px] font-black uppercase text-slate-400">Run at</p>
              <p className="text-xs font-bold text-slate-300">{new Date(result.runAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
        )}
      </div>

      {/* Not yet run */}
      {!result && (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl py-20 text-center">
          <Package size={40} className="mx-auto text-slate-200 mb-4" />
          <p className="text-sm font-bold text-slate-400">Press Run MRP to calculate requirements</p>
          <p className="text-xs text-slate-300 mt-2">Reads approved orders · compares live stock · backward-schedules cutting dates</p>
        </div>
      )}

      {/* Tabs + content */}
      {result && (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl p-1.5 flex space-x-1 w-fit shadow-sm">
            <button onClick={() => setActiveTab('requirements')}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all border-b-2 ${activeTab === 'requirements' ? 'bg-slate-50 text-slate-800 border-slate-700' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}>
              <Layers size={13} />
              <span>Material requirements ({result.requirements.length})</span>
              {result.totalShortages > 0 && (
                <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">{result.totalShortages}</span>
              )}
            </button>
            <button onClick={() => setActiveTab('schedule')}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all border-b-2 ${activeTab === 'schedule' ? 'bg-slate-50 text-slate-800 border-slate-700' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}>
              <CalendarDays size={13} />
              <span>Cutting schedule ({result.schedule.length})</span>
              {result.ordersAtRisk > 0 && (
                <span className="bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">{result.ordersAtRisk}</span>
              )}
            </button>
          </div>

          {activeTab === 'requirements' && <RequirementsTab requirements={result.requirements} />}
          {activeTab === 'schedule' && <ScheduleTab schedule={result.schedule} shortageKeys={shortageKeys} />}
        </>
      )}
    </div>
  );
};

export default GlasscoMRP;
