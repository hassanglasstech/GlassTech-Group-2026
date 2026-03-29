/**
 * TrueCostCalculator.tsx — Stage 4A + 4C
 * True cost per sqft breakdown + rate adequacy analysis
 */

import React, { useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { calculateTrueCostPerSqft, TrueCostPerSqft } from '@/modules/finance/services/costAnalysisService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Calculator, AlertTriangle, CheckCircle2, TrendingDown } from 'lucide-react';

const fmt = (n: number) => `PKR ${n.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtD = (n: number, d = 1) => n.toFixed(d);

const TrueCostCalculator: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const data = useMemo(() => calculateTrueCostPerSqft(company), [company]);

  const lossMaking = data.filter(d => d.isLossMaking);
  const avgMargin = data.length > 0 ? data.reduce((s, d) => s + d.marginPct, 0) / data.length : 0;

  const chartData = data.filter(d => d.totalCost > 0).slice(0, 10).map(d => ({
    name: `${d.thickness} ${d.glassType}`,
    cost: Math.round(d.totalCost),
    selling: Math.round(d.currentSellingRate),
    margin: Math.round(d.margin),
  }));

  if (data.length === 0) return (
    <div className="bg-white rounded-2xl border p-10 text-center">
      <Calculator size={32} className="mx-auto text-slate-300 mb-3"/>
      <p className="text-sm font-bold text-slate-400">No inventory data. Add glass items to Material Master first.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
          <Calculator size={20} className="text-emerald-500"/> True Cost per SqFt & Rate Adequacy
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">{data.length} glass types analyzed | {company}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-emerald-500 uppercase">Avg Margin</p>
          <p className={`text-2xl font-black mt-1 ${avgMargin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtD(avgMargin, 0)}%</p>
          <p className="text-[10px] text-emerald-500 font-bold">{data.length} products</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-red-500 uppercase">Loss-Making</p>
          <p className="text-2xl font-black text-red-700 mt-1">{lossMaking.length}</p>
          <p className="text-[10px] text-red-500 font-bold">products below cost</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-blue-500 uppercase">Avg Energy/SqFt</p>
          <p className="text-2xl font-black text-blue-700 mt-1">{data[0]?.energyCost > 0 ? fmt(data[0].energyCost) : '—'}</p>
          <p className="text-[10px] text-blue-500 font-bold">from generator logs</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-amber-500 uppercase">Avg Wastage Alloc</p>
          <p className="text-2xl font-black text-amber-700 mt-1">{data[0]?.wastageAllocation > 0 ? fmt(data[0].wastageAllocation) : '—'}</p>
          <p className="text-[10px] text-amber-500 font-bold">per sqft</p>
        </div>
      </div>

      {/* Loss-making alert */}
      {lossMaking.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <TrendingDown size={20} className="text-red-600 shrink-0 mt-0.5"/>
          <div>
            <p className="text-xs font-black text-red-700 uppercase">Rate Revision Needed</p>
            <p className="text-[10px] text-red-600 font-bold mt-0.5">
              {lossMaking.map(d => `${d.thickness} ${d.glassType} (margin: ${fmtD(d.marginPct, 0)}%)`).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Cost vs Selling Rate per SqFt</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700 }}/>
              <YAxis tick={{ fontSize: 10 }}/>
              <Tooltip formatter={(v: number) => [fmt(v)]}/>
              <Bar dataKey="cost" name="True Cost" fill="#ef4444" radius={[4,4,0,0]}/>
              <Bar dataKey="selling" name="Selling Rate" fill="#22c55e" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detail Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cost Breakdown per SqFt</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase">
              <th className="text-left px-4 py-2.5">Glass Type</th>
              <th className="text-right px-3 py-2.5">Material MAP</th>
              <th className="text-right px-3 py-2.5">Wastage</th>
              <th className="text-right px-3 py-2.5">Energy</th>
              <th className="text-right px-3 py-2.5">Labour</th>
              <th className="text-right px-3 py-2.5">Outsource</th>
              <th className="text-right px-3 py-2.5 bg-slate-100">TRUE COST</th>
              <th className="text-right px-3 py-2.5">Selling Rate</th>
              <th className="text-right px-3 py-2.5">Margin</th>
              <th className="text-center px-3 py-2.5">Status</th>
            </tr></thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={`${d.thickness}-${d.glassType}`} className={`border-t border-slate-50 ${d.isLossMaking ? 'bg-red-50/50' : i % 2 ? 'bg-slate-50/50' : ''}`}>
                  <td className="px-4 py-2.5 font-black text-slate-700">{d.thickness} {d.glassType}</td>
                  <td className="text-right px-3 py-2.5 font-bold text-slate-600">{fmtD(d.materialMAP)}</td>
                  <td className="text-right px-3 py-2.5 font-bold text-amber-600">{fmtD(d.wastageAllocation)}</td>
                  <td className="text-right px-3 py-2.5 font-bold text-blue-600">{d.energyCost > 0 ? fmtD(d.energyCost) : '—'}</td>
                  <td className="text-right px-3 py-2.5 font-bold text-slate-500">{d.labourCost > 0 ? fmtD(d.labourCost) : '—'}</td>
                  <td className="text-right px-3 py-2.5 font-bold text-orange-600">{d.outsourcingCost > 0 ? fmtD(d.outsourcingCost) : '—'}</td>
                  <td className="text-right px-3 py-2.5 font-black text-slate-800 bg-slate-50">{fmtD(d.totalCost)}</td>
                  <td className="text-right px-3 py-2.5 font-black text-emerald-600">{d.currentSellingRate > 0 ? fmtD(d.currentSellingRate) : '—'}</td>
                  <td className="text-right px-3 py-2.5 font-black">
                    <span className={d.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}>{d.margin >= 0 ? '+' : ''}{fmtD(d.margin)} ({fmtD(d.marginPct, 0)}%)</span>
                  </td>
                  <td className="text-center px-3 py-2.5">
                    {d.isLossMaking ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-100 text-red-700 flex items-center gap-0.5 w-fit mx-auto"><AlertTriangle size={9}/> LOSS</span>
                    ) : d.currentSellingRate > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-700"><CheckCircle2 size={9} className="inline mr-0.5"/> OK</span>
                    ) : <span className="text-slate-400">—</span>}
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

export default React.memo(TrueCostCalculator);
