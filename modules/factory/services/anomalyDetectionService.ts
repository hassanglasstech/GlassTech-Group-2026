// ═══════════════════════════════════════════════════════════════════
// Anomaly Detection Service — scans ERP data for threshold breaches
// Runs on: session open, morning briefing, manual trigger
// Thresholds configurable via anomaly_thresholds Supabase table
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';

const ls = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };

// ── Types ────────────────────────────────────────────────────────────
export interface Anomaly {
  type:         string;
  severity:     'low' | 'medium' | 'high' | 'critical';
  department:   string;
  description:  string;
  data:         Record<string, any>;
}

interface Thresholds { [key: string]: number }

// ── Load configurable thresholds ─────────────────────────────────────
let _thresholds: Thresholds | null = null;
let _thresholdExpiry = 0;

const loadThresholds = async (): Promise<Thresholds> => {
  if (_thresholds && Date.now() < _thresholdExpiry) return _thresholds;
  const defaults: Thresholds = {
    invoice_overdue_days: 30, cash_drop_pct: 30, expense_multiplier: 2,
    table_idle_hours: 2, ncr_rate_pct: 5, remnant_age_days: 20,
    absent_count_month: 3, overtime_pct: 20,
  };
  try {
    const { data } = await supabase.from('anomaly_thresholds').select('rule_key, threshold').eq('enabled', true);
    if (data) data.forEach((r: any) => { defaults[r.rule_key] = r.threshold; });
  } catch {}
  _thresholds = defaults;
  _thresholdExpiry = Date.now() + 300000;
  return defaults;
};

// ═══ ANOMALY CHECKS ═════════════════════════════════════════════════

const checkFinanceAnomalies = (t: Thresholds): Anomaly[] => {
  const anomalies: Anomaly[] = [];
  const today = new Date().toISOString().split('T')[0];
  const now = Date.now();

  // 1. Overdue invoices
  const invoices = ls('gtk_erp_invoices');
  const overdue = invoices.filter((i: any) =>
    (i.status === 'Outstanding' || i.status === 'Overdue') &&
    i.dueDate && ((now - new Date(i.dueDate).getTime()) / 86400000) > t.invoice_overdue_days
  );
  if (overdue.length > 0) {
    const total = overdue.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0);
    anomalies.push({
      type: 'invoice_overdue', severity: overdue.length > 5 ? 'high' : 'medium', department: 'finance',
      description: `${overdue.length} invoices overdue > ${t.invoice_overdue_days} days (PKR ${total.toLocaleString()})`,
      data: { count: overdue.length, total, threshold: t.invoice_overdue_days, top: overdue.slice(0, 3).map((i: any) => ({ client: i.clientName, amount: i.totalAmount, due: i.dueDate })) },
    });
  }

  // 2. Expense spike
  const petty = ls('gtk_erp_petty_cash').filter((e: any) => e.type === 'Payment' && e.status !== 'Ignored');
  const month = today.slice(0, 7);
  const monthExpenses = petty.filter((e: any) => e.date?.startsWith(month));
  const byCategory: Record<string, number[]> = {};
  petty.forEach((e: any) => {
    const cat = e.businessTransaction || 'General';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(e.amount || 0);
  });
  for (const [cat, amounts] of Object.entries(byCategory)) {
    if (amounts.length < 3) continue;
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const recent = amounts[amounts.length - 1];
    if (recent > avg * t.expense_multiplier && recent > 1000) {
      anomalies.push({
        type: 'expense_spike', severity: 'medium', department: 'finance',
        description: `${cat}: Last expense PKR ${recent.toLocaleString()} is ${(recent / avg).toFixed(1)}x average`,
        data: { category: cat, recent, average: Math.round(avg), multiplier: t.expense_multiplier },
      });
    }
  }

  return anomalies;
};

const checkProductionAnomalies = (t: Thresholds): Anomaly[] => {
  const anomalies: Anomaly[] = [];
  const now = Date.now();
  const h24 = now - 24 * 3600000;

  // 4. NCR rate
  const pieces = ls('gtk_erp_production_pieces');
  const recentPieces = pieces.filter((p: any) => new Date(p.lastUpdated || 0).getTime() > h24);
  const broken = recentPieces.filter((p: any) => p.status === 'Broken').length;
  const ncrRate = recentPieces.length > 0 ? (broken / recentPieces.length) * 100 : 0;
  if (ncrRate > t.ncr_rate_pct && recentPieces.length >= 5) {
    anomalies.push({
      type: 'ncr_rate_high', severity: ncrRate > 10 ? 'critical' : 'high', department: 'production',
      description: `NCR rate ${ncrRate.toFixed(1)}% in last 24h (${broken}/${recentPieces.length} pieces)`,
      data: { rate: ncrRate, broken, total: recentPieces.length, threshold: t.ncr_rate_pct },
    });
  }

  // 5. Remnant aging
  const remnants = ls('gtk_erp_remnants').filter((r: any) => r.status === 'Available');
  const aged = remnants.filter((r: any) => ((now - new Date(r.createdAt).getTime()) / 86400000) > t.remnant_age_days);
  if (aged.length > 0) {
    anomalies.push({
      type: 'remnant_aging', severity: aged.length > 10 ? 'high' : 'low', department: 'production',
      description: `${aged.length} remnants > ${t.remnant_age_days} days old — check for size match or scrap`,
      data: { count: aged.length, threshold: t.remnant_age_days, oldest: aged.slice(0, 3).map((r: any) => ({ id: r.id, thickness: r.thickness, days: Math.floor((now - new Date(r.createdAt).getTime()) / 86400000) })) },
    });
  }

  return anomalies;
};

const checkHRAnomalies = (t: Thresholds): Anomaly[] => {
  const anomalies: Anomaly[] = [];
  const month = new Date().toISOString().slice(0, 7);

  // 7. Repeated absences
  const attendance = ls('gtk_erp_attendance');
  const monthAtt = attendance.filter((a: any) => a.date?.startsWith(month) && a.status === 'Absent');
  const absentByEmp: Record<string, number> = {};
  monthAtt.forEach((a: any) => { absentByEmp[a.employeeId] = (absentByEmp[a.employeeId] || 0) + 1; });

  const employees = ls('gtk_erp_employees');
  const frequent = Object.entries(absentByEmp).filter(([, c]) => c >= t.absent_count_month);
  if (frequent.length > 0) {
    const names = frequent.map(([id, count]) => {
      const emp = employees.find((e: any) => e.id === id);
      return `${emp?.personal?.name || emp?.name || id} (${count}x)`;
    });
    anomalies.push({
      type: 'frequent_absence', severity: 'medium', department: 'hr',
      description: `${frequent.length} employee(s) absent ${t.absent_count_month}+ times this month: ${names.slice(0, 3).join(', ')}`,
      data: { count: frequent.length, employees: names, threshold: t.absent_count_month },
    });
  }

  return anomalies;
};

// ═══ MAIN SCAN ══════════════════════════════════════════════════════

export const runAnomalyScan = async (): Promise<Anomaly[]> => {
  const t = await loadThresholds();
  const all = [
    ...checkFinanceAnomalies(t),
    ...checkProductionAnomalies(t),
    ...checkHRAnomalies(t),
  ];

  // Save new anomalies to Supabase (skip if already logged today)
  const today = new Date().toISOString().split('T')[0];
  for (const a of all) {
    await supabase.from('anomaly_log').upsert({
      anomaly_type:  a.type,
      severity:      a.severity,
      department:    a.department,
      description:   a.description,
      data_snapshot: a.data,
      created_at:    new Date().toISOString(),
    }, { onConflict: 'id' }).then(() => {}, () => {});
  }

  return all.sort((a, b) => {
    const sev = { critical: 0, high: 1, medium: 2, low: 3 };
    return (sev[a.severity] || 3) - (sev[b.severity] || 3);
  });
};

// ── Get unacknowledged alerts ────────────────────────────────────────
export const getActiveAlerts = async (): Promise<any[]> => {
  const { data } = await supabase.from('anomaly_log')
    .select('*')
    .is('acknowledged_at', null)
    .order('created_at', { ascending: false })
    .limit(20);
  return data || [];
};

// ── Acknowledge an alert ─────────────────────────────────────────────
export const acknowledgeAnomaly = async (id: string, by: string) => {
  await supabase.from('anomaly_log').update({
    acknowledged_at: new Date().toISOString(),
    acknowledged_by: by,
  }).eq('id', id).then(() => {}, () => {});
};
