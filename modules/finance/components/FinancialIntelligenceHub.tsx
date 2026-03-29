/**
 * FinancialIntelligenceHub.tsx — Stage 4
 * Container for all financial intelligence views:
 *  - True Cost / Rate Adequacy (4A/4C)
 *  - Job Profitability (4B)
 *  - Delivery KPIs (4D)
 *  - Vendor Claims (4E)
 *  - Improvement Summary (4F)
 */

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import TrueCostCalculator from '@/modules/finance/components/TrueCostCalculator';
import JobProfitabilityReport from '@/modules/finance/components/JobProfitability';
import DeliveryKPIDashboard from '@/modules/finance/components/DeliveryKPI';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { calculateTrueCostPerSqft, calculateJobProfitability, calculateDeliveryKPIs } from '@/modules/finance/services/costAnalysisService';
import {
  Calculator, DollarSign, Truck, FileText, TrendingUp,
  AlertTriangle, CheckCircle2, Award
} from 'lucide-react';

type ViewTab = 'cost' | 'profitability' | 'delivery' | 'claims' | 'summary';

const fmt = (n: number) => `PKR ${Math.abs(n).toLocaleString('en-PK')}`;

const FinancialIntelligenceHub: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [activeTab, setActiveTab] = useState<ViewTab>('summary');

  const tabClass = (id: ViewTab, activeColor: string, bgColor: string) =>
    `flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === id ? `${activeColor} ${bgColor} shadow-sm` : 'text-slate-500 hover:bg-slate-50'}`;

  // ── 4F: Summary data ───────────────────────────────────────────
  const summaryData = useMemo(() => {
    const costs = calculateTrueCostPerSqft(company);
    const jobs = calculateJobProfitability(company);
    const delivery = calculateDeliveryKPIs(company);
    const vdrs = InventoryService.getVendorDefectReports().filter(r => r.company === company);
    const totalClaimed = vdrs.reduce((s, r) => s + r.totalAdjustment, 0);
    const settled = vdrs.filter(r => r.status === 'Settled');
    const settledAmount = settled.reduce((s, r) => s + r.totalAdjustment, 0);

    const lossMaking = costs.filter(c => c.isLossMaking);
    const lossJobs = jobs.filter(j => j.isLossMaking);
    const totalRevenue = jobs.reduce((s, j) => s + j.revenue, 0);
    const totalProfit = jobs.reduce((s, j) => s + j.profit, 0);

    return { costs, jobs, delivery, vdrs, totalClaimed, settledAmount, settled: settled.length,
      lossMaking, lossJobs, totalRevenue, totalProfit };
  }, [company]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp size={100}/></div>
        <h2 className="text-xl font-black uppercase">Financial Intelligence</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
          True cost analysis · Job profitability · Delivery KPIs · Vendor claims | {company}
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm flex space-x-1 overflow-x-auto">
        <button onClick={() => setActiveTab('summary')} className={tabClass('summary', 'text-purple-700', 'bg-purple-50')}>
          <Award size={14}/> <span>Summary</span>
        </button>
        <button onClick={() => setActiveTab('cost')} className={tabClass('cost', 'text-emerald-700', 'bg-emerald-50')}>
          <Calculator size={14}/> <span>True Cost</span>
        </button>
        <button onClick={() => setActiveTab('profitability')} className={tabClass('profitability', 'text-blue-700', 'bg-blue-50')}>
          <DollarSign size={14}/> <span>Job P&L</span>
        </button>
        <button onClick={() => setActiveTab('delivery')} className={tabClass('delivery', 'text-orange-700', 'bg-orange-50')}>
          <Truck size={14}/> <span>Delivery KPI</span>
        </button>
        <button onClick={() => setActiveTab('claims')} className={tabClass('claims', 'text-red-700', 'bg-red-50')}>
          <FileText size={14}/> <span>Vendor Claims</span>
        </button>
      </div>

      {/* Views */}
      {activeTab === 'cost' && <TrueCostCalculator />}
      {activeTab === 'profitability' && <JobProfitabilityReport />}
      {activeTab === 'delivery' && <DeliveryKPIDashboard />}

      {/* 4E: Vendor Claims View */}
      {activeTab === 'claims' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
              <FileText size={20} className="text-red-500"/> Vendor Claim Recovery
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{summaryData.vdrs.length} defect reports | {company}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
              <p className="text-[9px] font-black text-red-500 uppercase">Total Claims</p>
              <p className="text-xl font-black text-red-700 mt-1">{fmt(summaryData.totalClaimed)}</p>
              <p className="text-[10px] text-red-500 font-bold">{summaryData.vdrs.length} reports</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
              <p className="text-[9px] font-black text-emerald-500 uppercase">Settled</p>
              <p className="text-xl font-black text-emerald-700 mt-1">{fmt(summaryData.settledAmount)}</p>
              <p className="text-[10px] text-emerald-500 font-bold">{summaryData.settled} reports</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-[9px] font-black text-amber-500 uppercase">Pending</p>
              <p className="text-xl font-black text-amber-700 mt-1">{fmt(summaryData.totalClaimed - summaryData.settledAmount)}</p>
              <p className="text-[10px] text-amber-500 font-bold">{summaryData.vdrs.length - summaryData.settled} reports</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <p className="text-[9px] font-black text-blue-500 uppercase">Recovery Rate</p>
              <p className="text-xl font-black text-blue-700 mt-1">{summaryData.totalClaimed > 0 ? Math.round(summaryData.settledAmount / summaryData.totalClaimed * 100) : 0}%</p>
            </div>
          </div>
          {summaryData.vdrs.length > 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase">
                    <th className="text-left px-4 py-2.5">Report ID</th>
                    <th className="text-left px-3 py-2.5">Vendor</th>
                    <th className="text-left px-3 py-2.5">GRN</th>
                    <th className="text-left px-3 py-2.5">Date</th>
                    <th className="text-right px-3 py-2.5">Items</th>
                    <th className="text-right px-3 py-2.5">Claim PKR</th>
                    <th className="text-center px-3 py-2.5">Status</th>
                  </tr></thead>
                  <tbody>
                    {summaryData.vdrs.map((r: any, i: number) => (
                      <tr key={r.id} className={`border-t border-slate-50 ${i % 2 ? 'bg-slate-50/50' : ''}`}>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-600">{r.id}</td>
                        <td className="px-3 py-2.5 font-black text-slate-700">{r.vendorName}</td>
                        <td className="px-3 py-2.5 font-bold text-slate-500">{r.grnId}</td>
                        <td className="px-3 py-2.5 font-bold text-slate-500">{r.reportDate}</td>
                        <td className="text-right px-3 py-2.5 font-bold">{r.defectEntries?.length || 0}</td>
                        <td className="text-right px-3 py-2.5 font-black text-red-600">{fmt(r.totalAdjustment)}</td>
                        <td className="text-center px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${r.status === 'Settled' ? 'bg-emerald-100 text-emerald-700' : r.status === 'Verbally Confirmed' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border p-8 text-center text-slate-400 text-sm font-bold">No vendor defect reports yet.</div>
          )}
        </div>
      )}

      {/* 4F: Summary / Improvement Report */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Revenue & Profit */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-xl"><DollarSign size={16} className="text-blue-600"/></div>
                <p className="text-[10px] font-black text-slate-400 uppercase">Revenue & Profit</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-500">Revenue</span><span className="text-xs font-black text-blue-700">{fmt(summaryData.totalRevenue)}</span></div>
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-500">Net Profit</span><span className={`text-xs font-black ${summaryData.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{summaryData.totalProfit >= 0 ? '+' : '-'}{fmt(summaryData.totalProfit)}</span></div>
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-500">Loss-Making Jobs</span><span className="text-xs font-black text-red-600">{summaryData.lossJobs.length} of {summaryData.jobs.length}</span></div>
              </div>
            </div>

            {/* Delivery */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-100 rounded-xl"><Truck size={16} className="text-orange-600"/></div>
                <p className="text-[10px] font-black text-slate-400 uppercase">Delivery Performance</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-500">On-Time Rate</span>
                  <span className={`text-xs font-black ${summaryData.delivery.onTimePct >= 80 ? 'text-emerald-700' : 'text-red-700'}`}>{summaryData.delivery.onTimePct}%</span>
                </div>
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-500">Late Orders</span><span className="text-xs font-black text-red-600">{summaryData.delivery.lateCount}</span></div>
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-500">Avg Delay</span><span className="text-xs font-black text-slate-700">{summaryData.delivery.avgDelayDays} days</span></div>
              </div>
            </div>

            {/* Claims */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-red-100 rounded-xl"><FileText size={16} className="text-red-600"/></div>
                <p className="text-[10px] font-black text-slate-400 uppercase">Vendor Claims</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-500">Total Claimed</span><span className="text-xs font-black text-red-700">{fmt(summaryData.totalClaimed)}</span></div>
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-500">Recovered</span><span className="text-xs font-black text-emerald-700">{fmt(summaryData.settledAmount)}</span></div>
                <div className="flex justify-between"><span className="text-xs font-bold text-slate-500">Recovery Rate</span><span className="text-xs font-black text-blue-700">{summaryData.totalClaimed > 0 ? Math.round(summaryData.settledAmount / summaryData.totalClaimed * 100) : 0}%</span></div>
              </div>
            </div>
          </div>

          {/* Action Items */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1"><AlertTriangle size={12}/> Action Items</p>
            <div className="space-y-2">
              {summaryData.lossMaking.length > 0 && (
                <div className="flex items-start gap-2 bg-red-50 rounded-xl p-3">
                  <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5"/>
                  <div><p className="text-xs font-black text-red-700">Rate Revision Needed</p><p className="text-[10px] text-red-600">{summaryData.lossMaking.map(c => `${c.thickness} ${c.glassType}`).join(', ')} — selling below true cost</p></div>
                </div>
              )}
              {summaryData.lossJobs.length > 0 && (
                <div className="flex items-start gap-2 bg-amber-50 rounded-xl p-3">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5"/>
                  <div><p className="text-xs font-black text-amber-700">{summaryData.lossJobs.length} Loss-Making Jobs</p><p className="text-[10px] text-amber-600">Review pricing for these clients/project types</p></div>
                </div>
              )}
              {summaryData.delivery.onTimePct < 80 && summaryData.delivery.ordersWithDelivery > 0 && (
                <div className="flex items-start gap-2 bg-blue-50 rounded-xl p-3">
                  <Truck size={14} className="text-blue-600 shrink-0 mt-0.5"/>
                  <div><p className="text-xs font-black text-blue-700">Delivery Performance Below 80%</p><p className="text-[10px] text-blue-600">On-time: {summaryData.delivery.onTimePct}% — target 80%+. Top delay cause: {summaryData.delivery.delayByCategory[0]?.category || 'Unknown'}</p></div>
                </div>
              )}
              {summaryData.totalClaimed > 0 && summaryData.settledAmount < summaryData.totalClaimed * 0.5 && (
                <div className="flex items-start gap-2 bg-purple-50 rounded-xl p-3">
                  <FileText size={14} className="text-purple-600 shrink-0 mt-0.5"/>
                  <div><p className="text-xs font-black text-purple-700">Low Claim Recovery</p><p className="text-[10px] text-purple-600">Recovery rate below 50%. Follow up on pending claims: {fmt(summaryData.totalClaimed - summaryData.settledAmount)}</p></div>
                </div>
              )}
              {summaryData.lossMaking.length === 0 && summaryData.lossJobs.length === 0 && summaryData.delivery.onTimePct >= 80 && (
                <div className="flex items-center gap-2 bg-emerald-50 rounded-xl p-3">
                  <CheckCircle2 size={14} className="text-emerald-600"/>
                  <p className="text-xs font-black text-emerald-700">All metrics healthy. Continue monitoring with monthly reports.</p>
                </div>
              )}
            </div>
          </div>

          {/* Note */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-[10px] font-bold text-slate-500">
            This report uses actual ERP data. Accuracy improves with more data entries in Generator Log, Labour Log, Delivery Tracking, and Cutting Sessions. 
            Data replaces industry estimates from the original Improvement Opportunity Report (PKR 2.4M-6.8M template).
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(FinancialIntelligenceHub);
