import { supabase } from '@/src/services/supabaseClient';
import { HRService } from '@/modules/hr/services/hrService';

export interface CompensationAnalysis {
  employeeId:        string;
  employeeName:      string;
  designation:       string;
  currentSalary:     number;
  tenureYears:       number;
  performanceTier:   'top' | 'good' | 'average' | 'below';
  benchmark:         { min: number; median: number; max: number } | null;
  inflationAdjusted: number;
  marketGap:         number;       // how much below median
  marketGapPct:      number;       // % below median
  activeLoans:       number;       // count
  loanAmount:        number;       // total outstanding
  financialStress:   boolean;
  replacementCost:   number;       // estimated
  retentionRisk:     'low' | 'medium' | 'high' | 'critical';
  recommendedRaise:  number;
  raiseROI:          number;       // PKR saved vs replacement
  verdict:           string;
}

export interface ProfitShareResult {
  month:           string;
  baselineKPI:     number;
  actualKPI:       number;
  improvementPct:  number;
  extraProfit:     number;
  bonusPool:       number;
  perPerson:       number;
  teamSize:        number;
  recipients:      { id: string; name: string; share: number }[];
}

// ── Analyze single employee compensation ──────────────────────────────
export const analyzeCompensation = async (
  employeeId: string,
  company:    string
): Promise<CompensationAnalysis | null> => {
  const employees = HRService.getEmployees().filter((e: any) => e.company === company);
  const emp       = employees.find((e: any) => e.id === employeeId);
  if (!emp) return null;

  const salary      = emp.salary?.basic || 0;
  const designation = emp.work?.designation || '';
  const joinDate    = emp.work?.joinDate || emp.work?.joindate || '';
  const tenureYears = joinDate
    ? Math.floor((Date.now() - new Date(joinDate).getTime()) / (365.25 * 86400000))
    : 0;

  // Get benchmark
  const { data: benchmarks } = await supabase
    .from('industry_benchmarks')
    .select('*')
    .ilike('designation', `%${designation.split(' ')[0]}%`)
    .limit(1);
  const bench = benchmarks?.[0] || null;

  // Loans / advances
  const loans = HRService.getLoans().filter((l: any) => l.employeeId === employeeId && l.status === 'Active');
  const loanAmount  = loans.reduce((s: number, l: any) => s + (l.amount || 0), 0);
  const loanCount   = loans.length;

  // Inflation adjustment (last raise assumption — using tenure as proxy)
  const inflationRate    = bench?.inflation_rate || 23;
  const inflationAdj     = salary * (1 + inflationRate / 100);
  const medianSalary     = bench?.median_salary || salary;
  const marketGap        = Math.max(0, medianSalary - salary);
  const marketGapPct     = medianSalary > 0 ? Math.round((marketGap / medianSalary) * 100) : 0;
  const financialStress  = loanCount >= 2 || loanAmount > salary * 2;

  // Performance tier (from KPI if available — default 'good')
  const { data: kpiData } = await supabase
    .from('worker_kpi')
    .select('efficiency_score')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(3);
  const avgKPI = kpiData?.length
    ? kpiData.reduce((s: number, k: any) => s + (k.efficiency_score || 0), 0) / kpiData.length
    : 75;
  const performanceTier: CompensationAnalysis['performanceTier'] =
    avgKPI >= 90 ? 'top' : avgKPI >= 75 ? 'good' : avgKPI >= 60 ? 'average' : 'below';

  // Replacement cost
  const replacementCost = salary * (performanceTier === 'top' ? 6 : 4);

  // Retention risk
  const riskScore =
    (marketGapPct > 30 ? 3 : marketGapPct > 15 ? 2 : 0) +
    (financialStress ? 2 : 0) +
    (tenureYears > 3 && marketGapPct > 20 ? 2 : 0);
  const retentionRisk: CompensationAnalysis['retentionRisk'] =
    riskScore >= 6 ? 'critical' : riskScore >= 4 ? 'high' : riskScore >= 2 ? 'medium' : 'low';

  // Recommended raise
  const recommendedRaise = Math.round(Math.min(
    Math.max(marketGap * 0.5, salary * 0.08),
    salary * 0.25
  ) / 500) * 500;
  const raiseROI = replacementCost - (recommendedRaise * 12);

  // Verdict
  const verdict =
    retentionRisk === 'critical'
      ? `Urgent — ${emp.personal?.name} chhodne ka risk high hai. PKR ${recommendedRaise.toLocaleString()} raise immediately recommend.`
      : retentionRisk === 'high'
      ? `Raise recommend — market se ${marketGapPct}% kam hai. PKR ${recommendedRaise.toLocaleString()} raise ROI positive hai.`
      : retentionRisk === 'medium'
      ? `Monitor karo — next review mein PKR ${recommendedRaise.toLocaleString()} raise consider karo.`
      : `Compensation fair hai — koi action nahi chahiye abhi.`;

  return {
    employeeId,
    employeeName:    emp.personal?.name || 'Unknown',
    designation,
    currentSalary:   salary,
    tenureYears,
    performanceTier,
    benchmark:       bench ? { min: bench.min_salary, median: bench.median_salary, max: bench.max_salary } : null,
    inflationAdjusted: Math.round(inflationAdj),
    marketGap,
    marketGapPct,
    activeLoans:     loanCount,
    loanAmount,
    financialStress,
    replacementCost,
    retentionRisk,
    recommendedRaise,
    raiseROI,
    verdict,
  };
};

// ── Analyze all employees ─────────────────────────────────────────────
export const analyzeAllCompensation = async (company: string): Promise<CompensationAnalysis[]> => {
  const employees = HRService.getEmployees()
    .filter((e: any) => e.company === company && !['resigned', 'terminated'].includes(e.work?.status || ''));
  const results = await Promise.all(employees.map((e: any) => analyzeCompensation(e.id, company)));
  return results.filter(Boolean) as CompensationAnalysis[];
};

// ── Calculate profit share ────────────────────────────────────────────
export const calculateProfitShare = async (
  month:   string,
  company: string
): Promise<ProfitShareResult | null> => {
  const { data: kpiData } = await supabase
    .from('worker_kpi')
    .select('employee_id, efficiency_score, wastage_pct, breakage_count')
    .eq('month', month);

  if (!kpiData || kpiData.length === 0) return null;

  const employees   = HRService.getEmployees().filter((e: any) => e.company === company);
  const cutters     = kpiData.filter((k: any) =>
    employees.find((e: any) => e.id === k.employee_id && (e.work?.designation || '').toLowerCase().includes('cut'))
  );

  if (cutters.length === 0) return null;

  const baselineKPI    = 84;  // established baseline efficiency %
  const actualAvgKPI   = cutters.reduce((s: number, k: any) => s + (k.efficiency_score || 0), 0) / cutters.length;
  const improvementPct = Math.max(0, actualAvgKPI - baselineKPI);

  if (improvementPct < 2) return null; // not enough improvement to trigger

  // Estimate extra profit (rough: 1% efficiency = ~PKR 50K revenue improvement)
  const extraProfit = Math.round(improvementPct * 50000);
  const bonusPool   = Math.round(extraProfit * 0.10); // 10% to team
  const perPerson   = Math.round(bonusPool / cutters.length / 100) * 100;

  const recipients = cutters.map((k: any) => {
    const emp = employees.find((e: any) => e.id === k.employee_id);
    return {
      id:    k.employee_id,
      name:  emp?.personal?.name || 'Unknown',
      share: perPerson,
    };
  });

  return { month, baselineKPI, actualKPI: Math.round(actualAvgKPI), improvementPct, extraProfit, bonusPool, perPerson, teamSize: cutters.length, recipients };
};
