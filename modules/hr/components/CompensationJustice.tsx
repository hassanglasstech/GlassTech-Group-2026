import React, { useState, useEffect } from 'react';
import {
  Scale, Loader2, RefreshCw, AlertTriangle,
  CheckCircle2, TrendingUp, Users, DollarSign,
  ChevronRight, Award, Heart
} from 'lucide-react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { HRService } from '@/modules/hr/services/hrService';
import { supabase } from '@/src/services/supabaseClient';
import {
  analyzeAllCompensation, calculateProfitShare,
  CompensationAnalysis, ProfitShareResult
} from '../services/compensationService';

const RISK_CONFIG = {
  critical: { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',       label: 'Critical' },
  high:     { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', label: 'High'     },
  medium:   { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', label: 'Medium'   },
  low:      { color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',   label: 'Low'      },
};

const PERF_LABEL = { top: '⭐ Top', good: '✅ Good', average: '〜 Average', below: '⚠️ Below' };

const CompensationJustice: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [tab, setTab]               = useState<'equity' | 'profit' | 'welfare'>('equity');
  const [analyses, setAnalyses]     = useState<CompensationAnalysis[]>([]);
  const [loading, setLoading]       = useState(false);
  const [selected, setSelected]     = useState<CompensationAnalysis | null>(null);
  const [profitShare, setProfitShare] = useState<ProfitShareResult | null>(null);
  const [psLoading, setPsLoading]   = useState(false);
  const [psApproving, setPsApproving] = useState(false);
  const [month, setMonth]           = useState(new Date().toISOString().slice(0, 7));
  const [welfare, setWelfare]       = useState<any>(null);
  const [wLoading, setWLoading]     = useState(false);

  useEffect(() => { if (tab === 'equity') loadEquity(); else if (tab === 'profit') loadProfitShare(); else loadWelfare(); }, [tab, company]);

  const loadEquity = async () => {
    setLoading(true);
    const res = await analyzeAllCompensation(company);
    setAnalyses(res.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.retentionRisk] - order[b.retentionRisk];
    }));
    setLoading(false);
  };

  const loadProfitShare = async () => {
    setPsLoading(true);
    const res = await calculateProfitShare(month, company);
    setProfitShare(res);
    setPsLoading(false);
  };

  const loadWelfare = async () => {
    setWLoading(true);
    const employees = HRService.getEmployees().filter((e: any) => e.company === company && !['resigned','terminated'].includes(e.work?.status||''));
    const totalSalary = employees.reduce((s: number, e: any) => s + (e.salary?.basic || 0), 0);
    const medicalCostPerEmp  = 8500;
    const medicalTotal       = employees.length * medicalCostPerEmp;
    const medLeave = HRService.getAttendance().filter((a: any) =>
      employees.map((e:any)=>e.id).includes(a.employeeId) && a.status === 'Absent'
    ).length;
    const medLeaveCost = medLeave * (totalSalary / employees.length / 30);
    const medicalROI   = ((medLeaveCost * 0.35) - medicalTotal);

    setWelfare({ employees: employees.length, totalSalary, medicalCostPerEmp, medicalTotal, medLeaveCost: Math.round(medLeaveCost), medicalROI: Math.round(medicalROI) });
    setWLoading(false);
  };

  const approveBonus = async () => {
    if (!profitShare) return;
    setPsApproving(true);
    await supabase.from('profit_share_log').insert({
      month,
      company,
      baseline_kpi: profitShare.baselineKPI,
      actual_kpi:   profitShare.actualKPI,
      extra_profit: profitShare.extraProfit,
      bonus_pool:   profitShare.bonusPool,
      status:       'approved',
      recipients:   JSON.stringify(profitShare.recipients),
      approved_at:  new Date().toISOString(),
      created_at:   new Date().toISOString(),
    });
    // Create tasks for each recipient
    for (const r of profitShare.recipients) {
      await supabase.from('agent_tasks').insert({
        title:       `Bonus payment: ${r.name} — PKR ${r.share.toLocaleString()}`,
        description: `Profit share for ${month}. Extra profit: PKR ${profitShare.extraProfit.toLocaleString()}`,
        priority:    'High',
        status:      'Open',
        created_by:  'Compensation Agent',
        created_at:  new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      });
    }
    setPsApproving(false);
    alert(`✅ ${profitShare.teamSize} tasks created for bonus payments`);
  };

  // Detail view
  if (selected) {
    const rc = RISK_CONFIG[selected.retentionRisk];
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-xs underline">← Back</button>
        <div className={`rounded-xl border p-5 space-y-1 ${rc.bg}`}>
          <div className="font-black text-white text-base">{selected.employeeName}</div>
          <div className="text-xs text-slate-400">{selected.designation} · {selected.tenureYears} yr tenure · {PERF_LABEL[selected.performanceTier]}</div>
          <div className={`text-sm font-bold mt-2 ${rc.color}`}>{rc.label} Retention Risk</div>
        </div>
        <div className="bg-slate-800 rounded-xl divide-y divide-slate-700 text-sm">
          {[
            { label: 'Current Salary',       value: `PKR ${selected.currentSalary.toLocaleString()}` },
            { label: 'Industry Median',       value: selected.benchmark ? `PKR ${selected.benchmark.median.toLocaleString()}` : 'N/A' },
            { label: 'Inflation Adjusted',    value: `PKR ${selected.inflationAdjusted.toLocaleString()}` },
            { label: 'Market Gap',            value: selected.marketGap > 0 ? `PKR ${selected.marketGap.toLocaleString()} (${selected.marketGapPct}% below)` : 'At market' },
            { label: 'Active Loans',          value: `${selected.activeLoans} (PKR ${selected.loanAmount.toLocaleString()})` },
            { label: 'Financial Stress',      value: selected.financialStress ? '⚠️ Yes' : '✅ No' },
            { label: 'Replacement Cost',      value: `PKR ${selected.replacementCost.toLocaleString()}` },
            { label: 'Recommended Raise',     value: `PKR ${selected.recommendedRaise.toLocaleString()}/month` },
            { label: 'Raise ROI (12 months)', value: selected.raiseROI > 0 ? `PKR ${selected.raiseROI.toLocaleString()} saved` : 'Break even' },
          ].map(row => (
            <div key={row.label} className="flex justify-between px-4 py-2.5">
              <span className="text-slate-400">{row.label}</span>
              <span className="font-bold text-white text-right max-w-[55%]">{row.value}</span>
            </div>
          ))}
        </div>
        <div className={`rounded-xl border p-4 ${rc.bg}`}>
          <div className="text-xs text-slate-400 mb-1">Agent Verdict</div>
          <p className={`text-sm font-bold ${rc.color}`}>{selected.verdict}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Compensation Justice</h2>
          <p className="text-xs text-slate-500 mt-0.5">Equity · Profit Share · Welfare</p>
        </div>
        <button onClick={() => tab === 'equity' ? loadEquity() : tab === 'profit' ? loadProfitShare() : loadWelfare()}
          className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
        {([['equity','Equity'],['profit','Profit Share'],['welfare','Welfare']] as const).map(([t,label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all
              ${tab === t ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── EQUITY ── */}
      {tab === 'equity' && (
        loading ? <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
        : analyses.length === 0
          ? <div className="text-center py-12 text-slate-500 text-sm">No employees found</div>
          : (
            <div className="space-y-2">
              {/* Summary row */}
              <div className="grid grid-cols-4 gap-2">
                {(['critical','high','medium','low'] as const).map(r => {
                  const cnt = analyses.filter(a => a.retentionRisk === r).length;
                  const cfg = RISK_CONFIG[r];
                  return (
                    <div key={r} className={`rounded-xl border p-2 text-center ${cfg.bg}`}>
                      <div className={`text-lg font-black ${cfg.color}`}>{cnt}</div>
                      <div className="text-[9px] uppercase tracking-widest text-slate-500">{cfg.label}</div>
                    </div>
                  );
                })}
              </div>
              {analyses.map(a => {
                const rc = RISK_CONFIG[a.retentionRisk];
                return (
                  <button key={a.employeeId} onClick={() => setSelected(a)}
                    className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-left transition-all flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      a.retentionRisk === 'critical' ? 'bg-red-400' :
                      a.retentionRisk === 'high'     ? 'bg-orange-400' :
                      a.retentionRisk === 'medium'   ? 'bg-yellow-400' : 'bg-green-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-sm">{a.employeeName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{a.designation} · PKR {a.currentSalary.toLocaleString()}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-xs font-bold ${rc.color}`}>{rc.label}</div>
                      {a.marketGapPct > 0 && <div className="text-[10px] text-slate-500">{a.marketGapPct}% below market</div>}
                    </div>
                    <ChevronRight size={13} className="text-slate-500 shrink-0" />
                  </button>
                );
              })}
            </div>
          )
      )}

      {/* ── PROFIT SHARE ── */}
      {tab === 'profit' && (
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="flex-1 bg-slate-800 text-white rounded-xl px-4 py-2.5 text-sm outline-none" />
            <button onClick={loadProfitShare} className="bg-slate-700 text-white px-4 py-2.5 rounded-xl text-sm hover:bg-slate-600 transition-all">
              Calculate
            </button>
          </div>
          {psLoading ? (
            <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
          ) : !profitShare ? (
            <div className="text-center py-12 text-slate-500 text-sm space-y-2">
              <Award size={32} className="mx-auto text-slate-600" />
              <p>Is month mein profit share trigger nahi hua</p>
              <p className="text-xs">Cutting efficiency baseline (84%) se 2%+ upar honi chahiye</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 space-y-2">
                <div className="text-xs text-green-400 uppercase tracking-widest">Profit Share Triggered ✅</div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {[
                    { label: 'Baseline KPI',   value: `${profitShare.baselineKPI}%` },
                    { label: 'Actual KPI',      value: `${profitShare.actualKPI}%` },
                    { label: 'Extra Profit',    value: `PKR ${profitShare.extraProfit.toLocaleString()}` },
                    { label: 'Bonus Pool (10%)',value: `PKR ${profitShare.bonusPool.toLocaleString()}` },
                  ].map(row => (
                    <div key={row.label} className="bg-slate-800 rounded-xl p-3">
                      <div className="text-xs text-slate-400">{row.label}</div>
                      <div className="font-black text-white mt-0.5">{row.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 space-y-2">
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Recipients ({profitShare.teamSize} cutters)</div>
                {profitShare.recipients.map(r => (
                  <div key={r.id} className="flex justify-between items-center py-1.5 border-b border-slate-700 last:border-0">
                    <span className="text-sm text-white">{r.name}</span>
                    <span className="font-bold text-green-400 text-sm">PKR {r.share.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <button onClick={approveBonus} disabled={psApproving}
                className="w-full flex items-center justify-center gap-2 bg-white text-slate-900 font-black py-3 rounded-xl text-sm disabled:opacity-40 transition-all">
                {psApproving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Approve — Create Payment Tasks
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── WELFARE ── */}
      {tab === 'welfare' && (
        wLoading ? <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
        : !welfare ? null : (
          <div className="space-y-3">
            <div className="bg-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Heart size={16} className="text-red-400" />
                <span className="font-bold text-white">Group Medical Insurance</span>
              </div>
              <div className="divide-y divide-slate-700 text-sm">
                {[
                  { label: 'Employees',              value: `${welfare.employees}` },
                  { label: 'Cost per employee/year', value: `PKR ${welfare.medicalCostPerEmp.toLocaleString()}` },
                  { label: 'Total annual cost',      value: `PKR ${welfare.medicalTotal.toLocaleString()}` },
                  { label: 'Current absenteeism cost',value: `PKR ${welfare.medLeaveCost.toLocaleString()}/yr` },
                  { label: 'Expected saving (35%)',  value: `PKR ${Math.round(welfare.medLeaveCost * 0.35).toLocaleString()}/yr` },
                ].map(row => (
                  <div key={row.label} className="flex justify-between py-2.5">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="font-bold text-white">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className={`rounded-xl border p-3 ${welfare.medicalROI > 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
                <span className={`font-black text-sm ${welfare.medicalROI > 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {welfare.medicalROI > 0
                    ? `✅ Net positive — PKR ${welfare.medicalROI.toLocaleString()} saved/year`
                    : `⚠️ Break even — welfare value beyond numbers`}
                </span>
              </div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-300">
              Insurance companies: EFU, Jubilee, State Life. Group policy for {welfare.employees} employees — aaj quote request karo.
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default CompensationJustice;
