/**
 * DeliveryKPI.tsx — Stage 4D
 * On-time %, delay reasons breakdown, client-wise performance, trend
 */

import React, { useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { calculateDeliveryKPIs } from '@/modules/finance/services/costAnalysisService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Truck, CheckCircle2, AlertTriangle, Clock, TrendingUp } from 'lucide-react';

const PIE_COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

const DeliveryKPIDashboard: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const kpi = useMemo(() => calculateDeliveryKPIs(company), [company]);

  if (kpi.ordersWithDelivery === 0) return (
    <div className="bg-white rounded-2xl border p-10 text-center">
      <Truck size={32} className="mx-auto text-slate-300 mb-3"/>
      <p className="text-sm font-bold text-slate-400">No delivery data yet. Enter actual delivery dates in Sales → Order Details.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
          <Truck size={20} className="text-blue-500"/> Delivery Performance
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">{kpi.ordersWithDelivery} orders tracked of {kpi.totalOrders} total | {company}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`${kpi.onTimePct >= 80 ? 'bg-emerald-50 border-emerald-100' : kpi.onTimePct >= 60 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'} border rounded-2xl p-4`}>
          <p className="text-[9px] font-black uppercase text-slate-500">On-Time Rate</p>
          <p className={`text-3xl font-black mt-1 ${kpi.onTimePct >= 80 ? 'text-emerald-700' : kpi.onTimePct >= 60 ? 'text-amber-700' : 'text-red-700'}`}>{kpi.onTimePct}%</p>
          <p className="text-[10px] font-bold text-slate-500">{kpi.onTimeCount} of {kpi.ordersWithDelivery}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-red-500 uppercase">Late Deliveries</p>
          <p className="text-3xl font-black text-red-700 mt-1">{kpi.lateCount}</p>
          <p className="text-[10px] text-red-500 font-bold">avg {kpi.avgDelayDays} days late</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-emerald-500 uppercase">On-Time</p>
          <p className="text-3xl font-black text-emerald-700 mt-1">{kpi.onTimeCount}</p>
          <p className="text-[10px] text-emerald-500 font-bold">delivered on/before due</p>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase">Tracked / Total</p>
          <p className="text-3xl font-black text-slate-700 mt-1">{kpi.ordersWithDelivery}</p>
          <p className="text-[10px] text-slate-500 font-bold">of {kpi.totalOrders} orders</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Delay Reasons Pie */}
        {kpi.delayByCategory.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1"><AlertTriangle size={12}/> Delay Root Causes</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={kpi.delayByCategory} cx="50%" cy="50%" outerRadius={70} dataKey="count" nameKey="category" label={({ category, pct }) => `${category} ${pct}%`}>
                  {kpi.delayByCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={(v: number, name: string) => [`${v} orders`, name]}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {kpi.delayByCategory.map((d, i) => (
                <div key={d.category} className="flex items-center gap-1.5 text-[10px] font-bold">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}/>
                  <span className="text-slate-600">{d.category}: {d.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monthly Trend */}
        {kpi.monthlyTrend.length > 1 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1"><TrendingUp size={12}/> Monthly On-Time Trend</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={kpi.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700 }}/>
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 100]}/>
                <Tooltip formatter={(v: number) => [`${v}%`, 'On-Time Rate']}/>
                <Bar dataKey="onTimePct" name="On-Time %" radius={[6,6,0,0]}>
                  {kpi.monthlyTrend.map((d, i) => <Cell key={i} fill={d.onTimePct >= 80 ? '#22c55e' : d.onTimePct >= 60 ? '#f59e0b' : '#ef4444'}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Summary Note */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xs font-bold text-blue-700">
        <p className="flex items-center gap-1.5"><Clock size={13}/> 
          {kpi.onTimePct >= 80 ? 'Good delivery performance. Maintain vendor relationships and cutting schedule.'
           : kpi.onTimePct >= 60 ? 'Delivery performance needs improvement. Focus on the primary delay category above.'
           : 'Critical delivery issues. Review cutting capacity and vendor SLAs immediately.'}
        </p>
      </div>
    </div>
  );
};

export default React.memo(DeliveryKPIDashboard);
