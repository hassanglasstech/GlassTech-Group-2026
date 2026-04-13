// ═══════════════════════════════════════════════════════════════════
// Predictive Alert Service — forecast cash gaps, stock depletion,
// production bottlenecks, and AR collection risk
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';

const ls = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
const PKR = (n: number) => `PKR ${Math.round(n).toLocaleString()}`;

export interface PredictiveAlert {
  alert_type:   string;
  title:        string;
  message:      string;
  severity:     string;
  confidence:   number;
  horizon_days: number;
  impact_pkr:   number;
  prediction:   string;
  data_snapshot: Record<string, any>;
  action_hint:  string; // What to type in ChatWidget to act
}

// ═══ CASH FLOW PREDICTION ═══════════════════════════════════════════
const predictCashFlow = (): PredictiveAlert[] => {
  const alerts: PredictiveAlert[] = [];
  const petty = ls('gtk_erp_petty_cash').filter((e: any) => e.status !== 'Ignored');
  const lastEntry = petty.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const cashBalance = lastEntry?.balance || 0;

  // Estimate payables due in 7 days
  const pos = ls('gtk_erp_purchase_orders').filter((p: any) =>
    p.status === 'Approved' && p.deliveryDate &&
    new Date(p.deliveryDate).getTime() < Date.now() + 7 * 86400000
  );
  const payablesDue = pos.reduce((s: number, p: any) => s + (p.total || p.totalAmount || 0), 0);

  // Receivables due this week
  const invoices = ls('gtk_erp_invoices').filter((i: any) =>
    (i.status === 'Outstanding') && i.dueDate &&
    new Date(i.dueDate).getTime() < Date.now() + 7 * 86400000
  );
  const receivablesDue = invoices.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0);

  if (payablesDue > cashBalance * 0.8 && payablesDue > 50000) {
    const gap = payablesDue - cashBalance;
    alerts.push({
      alert_type: 'cash_flow_gap', title: 'Cash Flow Gap Expected',
      message: `${PKR(payablesDue)} payable in 7 days vs ${PKR(cashBalance)} cash. Gap: ${PKR(gap > 0 ? gap : 0)}. Receivables due: ${PKR(receivablesDue)}.`,
      severity: gap > 100000 ? 'High' : 'Medium', confidence: 75, horizon_days: 7,
      impact_pkr: gap > 0 ? gap : 0, prediction: `Cash shortfall of ${PKR(gap)} in 7 days`,
      data_snapshot: { cash: cashBalance, payables: payablesDue, receivables: receivablesDue, pos_count: pos.length },
      action_hint: 'outstanding payments dikhao',
    });
  }
  return alerts;
};

// ═══ STOCK DEPLETION ════════════════════════════════════════════════
const predictStockDepletion = (): PredictiveAlert[] => {
  const alerts: PredictiveAlert[] = [];
  const store = ls('gtk_erp_store').filter((s: any) => s.company === 'GlassCo' || s.company === 'Glassco');

  // Estimate daily consumption from cutting sessions
  const cutting = ls('gtk_erp_cutting_sessions');
  const last30 = cutting.filter((c: any) => new Date(c.date).getTime() > Date.now() - 30 * 86400000);
  const dailySqft = last30.length > 0
    ? last30.reduce((s: number, c: any) => s + (c.totalSqft || 0), 0) / 30
    : 0;

  for (const item of store) {
    const qty = item.quantity || item.qty || 0;
    if (qty <= 0 || !item.name) continue;

    // Simple depletion: estimate days based on category
    const isGlass = (item.category || '').toLowerCase().includes('glass');
    if (!isGlass) continue;

    const daysLeft = dailySqft > 0 ? Math.floor(qty / (dailySqft * 0.1)) : 999; // Rough estimate
    if (daysLeft <= 10 && daysLeft > 0) {
      alerts.push({
        alert_type: 'stock_depletion', title: `Low Stock: ${item.name}`,
        message: `${item.name} — ${qty} units remaining. Estimated ${daysLeft} days until depletion at current usage.`,
        severity: daysLeft <= 3 ? 'High' : 'Medium', confidence: 65, horizon_days: daysLeft,
        impact_pkr: 0, prediction: `Stock runs out in ${daysLeft} days`,
        data_snapshot: { item: item.name, qty, daily_usage: Math.round(dailySqft * 0.1), days_left: daysLeft },
        action_hint: `${item.name} ka stock status`,
      });
    }
  }
  return alerts.slice(0, 3); // Max 3 stock alerts
};

// ═══ PRODUCTION BOTTLENECK ══════════════════════════════════════════
const predictProductionBottleneck = (): PredictiveAlert[] => {
  const alerts: PredictiveAlert[] = [];
  const pieces = ls('gtk_erp_production_pieces');
  const pending = pieces.filter((p: any) => p.status === 'Pending' || p.status === 'Cut');
  const active = pieces.filter((p: any) => !['Delivered', 'Broken'].includes(p.status));

  // 3 cutting tables, ~8 hours/day, ~200 sqft/hour = 4800 sqft/day capacity
  const dailyCapacity = 4800; // sqft (3 tables * 8h * 200 sqft/h)
  const cutting = ls('gtk_erp_cutting_sessions');
  const recentDays = cutting.filter((c: any) => new Date(c.date).getTime() > Date.now() - 7 * 86400000);
  const avgDailySqft = recentDays.length > 0
    ? recentDays.reduce((s: number, c: any) => s + (c.totalSqft || 0), 0) / 7
    : dailyCapacity * 0.5;

  const backlogDays = avgDailySqft > 0 ? Math.ceil(pending.length * 10 / avgDailySqft) : 0; // ~10 sqft per piece avg

  if (backlogDays > 3 && pending.length > 20) {
    alerts.push({
      alert_type: 'production_bottleneck', title: 'Production Queue Backed Up',
      message: `${pending.length} pieces pending, ${active.length} active. At current rate (~${Math.round(avgDailySqft)} sqft/day), backlog is ~${backlogDays} days.`,
      severity: backlogDays > 7 ? 'High' : 'Medium', confidence: 60, horizon_days: backlogDays,
      impact_pkr: 0, prediction: `Production backed up ${backlogDays} days`,
      data_snapshot: { pending: pending.length, active: active.length, avg_daily: Math.round(avgDailySqft), backlog_days: backlogDays },
      action_hint: 'floor status dikhao',
    });
  }
  return alerts;
};

// ═══ AR COLLECTION RISK ═════════════════════════════════════════════
const predictARRisk = (): PredictiveAlert[] => {
  const alerts: PredictiveAlert[] = [];
  const invoices = ls('gtk_erp_invoices');
  const quotations = ls('gtk_erp_quotations');

  // Find clients with overdue pattern + new large orders
  const overdueInvoices = invoices.filter((i: any) =>
    (i.status === 'Outstanding' || i.status === 'Overdue') &&
    i.dueDate && new Date(i.dueDate).getTime() < Date.now()
  );

  const overdueByClient: Record<string, { total: number; count: number; maxDays: number }> = {};
  overdueInvoices.forEach((i: any) => {
    const client = i.clientName || 'Unknown';
    if (!overdueByClient[client]) overdueByClient[client] = { total: 0, count: 0, maxDays: 0 };
    overdueByClient[client].total += i.totalAmount || 0;
    overdueByClient[client].count++;
    const days = Math.floor((Date.now() - new Date(i.dueDate).getTime()) / 86400000);
    if (days > overdueByClient[client].maxDays) overdueByClient[client].maxDays = days;
  });

  // Check for new orders from high-risk clients
  const recentOrders = quotations.filter((q: any) =>
    q.status === 'Approved' || q.status === 'Sent'
  );

  for (const [client, risk] of Object.entries(overdueByClient)) {
    if (risk.count < 2 || risk.maxDays < 15) continue;
    const newOrders = recentOrders.filter((q: any) => q.clientName === client);
    if (newOrders.length > 0) {
      const orderTotal = newOrders.reduce((s: number, q: any) => s + (q.totalAmount || 0), 0);
      alerts.push({
        alert_type: 'ar_collection_risk', title: `Default Risk: ${client}`,
        message: `${client} has ${risk.count} overdue invoices (${PKR(risk.total)}, max ${risk.maxDays} days late) + ${newOrders.length} new order(s) worth ${PKR(orderTotal)}. Recommend advance payment.`,
        severity: risk.maxDays > 60 ? 'High' : 'Medium', confidence: 70, horizon_days: 30,
        impact_pkr: orderTotal, prediction: `High default risk on ${PKR(orderTotal)} new orders`,
        data_snapshot: { client, overdue_total: risk.total, overdue_count: risk.count, max_days: risk.maxDays, new_order_total: orderTotal },
        action_hint: `${client} ka balance dikhao`,
      });
    }
  }
  return alerts.slice(0, 3);
};

// ═══ MAIN: Run all predictions ══════════════════════════════════════
export const runPredictions = async (): Promise<PredictiveAlert[]> => {
  const all = [
    ...predictCashFlow(),
    ...predictStockDepletion(),
    ...predictProductionBottleneck(),
    ...predictARRisk(),
  ];

  // Save to Supabase
  for (const a of all) {
    await supabase.from('predictive_alerts').insert({
      alert_type:   a.alert_type,
      title:        a.title,
      message:      a.message,
      severity:     a.severity,
      confidence:   a.confidence,
      horizon_days: a.horizon_days,
      impact_pkr:   a.impact_pkr,
      prediction:   a.prediction,
      data_snapshot: a.data_snapshot,
      alert_source: 'prediction_engine',
    }).then(() => {}, () => {});
  }

  return all.sort((a, b) => {
    const sev: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
    return (sev[a.severity] ?? 2) - (sev[b.severity] ?? 2);
  });
};

// ── Get active predictions ───────────────────────────────────────────
export const getActivePredictions = async (): Promise<any[]> => {
  const { data } = await supabase.from('predictive_alerts')
    .select('*')
    .eq('actioned', false)
    .eq('dismissed', false)
    .eq('alert_source', 'prediction_engine')
    .order('created_at', { ascending: false })
    .limit(10);
  return data || [];
};
