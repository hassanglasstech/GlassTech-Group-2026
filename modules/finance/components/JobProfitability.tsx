/**
 * JobProfitability.tsx — Stage 4B
 * Per-job profitability: revenue - material - labour - energy - outsourcing = profit
 */

import React, { useMemo, useState } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { calculateJobProfitability, JobProfitability as JobProf } from '@/modules/finance/services/costAnalysisService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle, Search } from 'lucide-react';

const fmt = (n: number) => `PKR ${Math.abs(n).toLocaleString('en-PK')}`;

const JobProfitabilityReport: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [search, setSearch] = useState('');
  const [showLossOnly, setShowLossOnly] = useState(false);

  const jobs = useMemo(() => calculateJobProfitability(company), [company]);

  const filtered = useMemo(() => {
    let result = jobs;
    if (showLossOnly) result = result.filter(j => j.isLossMaking);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(j => j.orderNo.toLowerCase().includes(s) || j.clientName.toLowerCase().includes(s) || j.projectName.toLowerCase().includes(s));
    }
    return result;
  }, [jobs, search, showLossOnly]);

  const totalRevenue = jobs.reduce((s, j) => s + j.revenue, 0);
  const totalCost = jobs.reduce((s, j) => s + j.totalCost, 0);
  const totalProfit = totalRevenue - totalCost;
  const lossMaking = jobs.filter(j => j.isLossMaking);

  const chartData = jobs.filter(j => j.revenue > 0).slice(0, 12).map(j => ({
    name: (j.projectName || j.orderNo).substring(0, 12),
    profit: j.profit,
    fill: j.profit >= 0 ? '#22c55e' : '#ef4444',
  }));

  if (jobs.length === 0) return (
    <div className="bg-white rounded-2xl border p-10 text-center">
      <DollarSign size={32} className="mx-auto text-slate-300 mb-3"/>
      <p className="text-sm font-bold text-slate-400">No orders found. Create quotations first.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <DollarSign size={20} className="text-emerald-500"/> Job Profitability
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{jobs.length} jobs analyzed | {company}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400"/>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-bold w-48"/>
          </div>
          <button onClick={() => setShowLossOnly(!showLossOnly)} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase ${showLossOnly ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 border border-red-200'}`}>
            {showLossOnly ? 'Show All' : `Loss Only (${lossMaking.length})`}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-blue-500 uppercase">Total Revenue</p>
          <p className="text-xl font-black text-blue-700 mt-1">{fmt(totalRevenue)}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-red-500 uppercase">Total Cost</p>
          <p className="text-xl font-black text-red-700 mt-1">{fmt(totalCost)}</p>
        </div>
        <div className={`${totalProfit >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'} border rounded-2xl p-4`}>
          <p className={`text-[9px] font-black uppercase ${totalProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Net Profit</p>
          <p className={`text-xl font-black mt-1 ${totalProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{totalProfit >= 0 ? '+' : '-'}{fmt(totalProfit)}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-amber-500 uppercase">Loss-Making Jobs</p>
          <p className="text-2xl font-black text-amber-700 mt-1">{lossMaking.length}</p>
          <p className="text-[10px] text-amber-500 font-bold">of {jobs.length} total</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-3">Profit/Loss by Job</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 700 }}/>
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`}/>
              <Tooltip formatter={(v: number) => [fmt(v), 'Profit']}/>
              <Bar dataKey="profit" name="Profit" radius={[4,4,0,0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.fill}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase">
              <th className="text-left px-4 py-2.5">Order</th>
              <th className="text-left px-3 py-2.5">Client / Project</th>
              <th className="text-right px-3 py-2.5">Revenue</th>
              <th className="text-right px-3 py-2.5">Material</th>
              <th className="text-right px-3 py-2.5">Labour</th>
              <th className="text-right px-3 py-2.5">Energy</th>
              <th className="text-right px-3 py-2.5">Outsource</th>
              <th className="text-right px-3 py-2.5 bg-slate-100">PROFIT</th>
              <th className="text-right px-3 py-2.5">Margin %</th>
            </tr></thead>
            <tbody>
              {filtered.map((j, i) => (
                <tr key={j.orderId} className={`border-t border-slate-50 ${j.isLossMaking ? 'bg-red-50/50' : i % 2 ? 'bg-slate-50/50' : ''}`}>
                  <td className="px-4 py-2.5 font-mono font-bold text-slate-600 text-[10px]">{j.orderNo}</td>
                  <td className="px-3 py-2.5"><div className="font-black text-slate-700">{j.clientName}</div>{j.projectName && <div className="text-[9px] text-slate-400">{j.projectName}</div>}</td>
                  <td className="text-right px-3 py-2.5 font-black text-blue-600">{fmt(j.revenue)}</td>
                  <td className="text-right px-3 py-2.5 font-bold text-slate-600">{fmt(j.materialCost)}</td>
                  <td className="text-right px-3 py-2.5 font-bold text-slate-500">{j.labourCost > 0 ? fmt(j.labourCost) : '—'}</td>
                  <td className="text-right px-3 py-2.5 font-bold text-slate-500">{j.energyCost > 0 ? fmt(j.energyCost) : '—'}</td>
                  <td className="text-right px-3 py-2.5 font-bold text-orange-600">{j.outsourcingCost > 0 ? fmt(j.outsourcingCost) : '—'}</td>
                  <td className={`text-right px-3 py-2.5 font-black bg-slate-50/50 ${j.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{j.profit >= 0 ? '+' : '-'}{fmt(j.profit)}</td>
                  <td className="text-right px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${j.isLossMaking ? 'bg-red-100 text-red-700' : j.profitPct > 20 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{j.profitPct}%</span>
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

export default React.memo(JobProfitabilityReport);
