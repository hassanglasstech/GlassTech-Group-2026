import { supabase } from '@/src/services/supabaseClient';
import { SalesService } from '@/modules/sales/services/salesService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { HRService } from '@/modules/hr/services/hrService';
import { ProductionService } from '@/modules/production/services/productionService';

// ── Build comprehensive ERP snapshot ─────────────────────────────────
const buildSnapshot = async () => {
  const now   = new Date();
  const month = now.toISOString().slice(0, 7);
  const today = now.toISOString().split('T')[0];

  // Sales
  const quotes    = SalesService.getQuotations().filter((q: any) => q.company === 'Glassco');
  const mQuotes   = quotes.filter((q: any) => q.date?.startsWith(month));
  const invoices  = SalesService.getInvoices().filter((i: any) => i.company === 'Glassco');
  const overdue   = invoices.filter((i: any) => i.status === 'Unpaid' && i.dueDate < today);
  const revenue   = invoices.filter((i: any) => i.date?.startsWith(month)).reduce((s: number, i: any) => s + (i.amount || i.totalAmount || 0), 0);

  // Finance
  const accounts = FinanceService.getAccounts().filter((a: any) => a.company === 'GlassCo');
  const ledger   = FinanceService.getLedger().filter((t: any) => t.company === 'GlassCo');
  const bal: Record<string, number> = {};
  accounts.forEach((a: any) => { bal[a.id] = 0; });
  ledger.forEach((tx: any) => tx.details?.forEach((d: any) => { if (bal[d.accountId] !== undefined) bal[d.accountId] += (d.debit - d.credit); }));
  const cashAccounts = accounts.filter((a: any) => a.code?.startsWith('123'));
  const cashBalance  = Math.abs(cashAccounts.reduce((s: number, a: any) => s + (bal[a.id] || 0), 0));

  // Procurement
  const pos = InventoryService.getPurchaseOrders().filter((p: any) => p.fromCompany === 'Glassco' && !['GRN Done','Paid'].includes(p.status));
  const openPOValue = pos.reduce((s: number, p: any) => s + (p.total || 0), 0);

  // Production
  const pieces  = ProductionService.getProductionPieces();
  const active  = pieces.filter(p => !['Delivered','Broken'].includes(p.status)).length;
  const broken  = pieces.filter(p => p.status === 'Broken').length;
  const qcFail  = pieces.filter(p => p.status === 'QC-Failed').length;

  // Factory events
  const { count: urgentEvents } = await supabase.from('factory_events').select('id', { count: 'exact', head: true }).eq('priority', 'Urgent').in('status', ['Open','Pending']);
  const { data: vendorSLA }     = await supabase.from('vendor_sla').select('vendor_name,breach_count,total_orders').eq('active', true);
  const highRiskVendors = (vendorSLA || []).filter((v: any) => v.total_orders > 2 && (v.breach_count / v.total_orders) > 0.4);

  // HR
  const employees = HRService.getEmployees().filter((e: any) => e.company === 'GlassCo' && !['resigned','terminated'].includes(e.work?.status || ''));
  const loans     = HRService.getLoans().filter((l: any) => l.status === 'Active');

  return {
    month, today,
    revenue,
    cashBalance,
    overdueAmount: overdue.reduce((s: number, i: any) => s + (i.amount || i.totalAmount || 0), 0),
    overdueCount:  overdue.length,
    openPOValue,
    activeOrders:  mQuotes.length,
    activePieces:  active,
    brokenPieces:  broken,
    qcFailPieces:  qcFail,
    urgentEvents:  urgentEvents || 0,
    highRiskVendors: highRiskVendors.map((v: any) => v.vendor_name),
    employeeCount: employees.length,
    activeLoanCount: loans.length,
    activeLoanValue: loans.reduce((s: number, l: any) => s + (l.amount || 0), 0),
  };
};

// ── Generate 3 scenarios using Claude ────────────────────────────────
export const generateScenarios = async (): Promise<void> => {
  const snap = await buildSnapshot();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1200,
      system:     `You are a strategic business analyst for a Pakistani glass manufacturing company (GlassCo, Karachi).
Generate 3 business scenarios for the next 90 days based on ERP data.
Respond ONLY with a JSON array — no markdown, no preamble.
Each scenario: { title, scenario_type (optimistic|base|pessimistic), probability (0-100), time_horizon ("90d"), description (2-3 sentences), key_assumptions (array of strings), actions (array of actionable strings), financial_impact (PKR number, positive=gain negative=loss), triggers (array of strings) }`,
      messages: [{
        role:    'user',
        content: `Current ERP State:
Revenue this month: PKR ${snap.revenue.toLocaleString()}
Cash balance: PKR ${snap.cashBalance.toLocaleString()}
Overdue receivables: PKR ${snap.overdueAmount.toLocaleString()} (${snap.overdueCount} invoices)
Open POs: PKR ${snap.openPOValue.toLocaleString()}
Active production pieces: ${snap.activePieces}
QC failures: ${snap.qcFailPieces} | Broken: ${snap.brokenPieces}
Urgent factory events: ${snap.urgentEvents}
High-risk vendors: ${snap.highRiskVendors.join(', ') || 'none'}
Active loans: ${snap.activeLoanCount} (PKR ${snap.activeLoanValue.toLocaleString()})

Generate 3 scenarios (optimistic, base, pessimistic) for next 90 days:`,
      }],
    }),
  });

  const data = await res.json();
  const text = data.content?.[0]?.text || '[]';

  try {
    const scenarios = JSON.parse(text.replace(/```json|```/g, '').trim());
    const expiry    = new Date(Date.now() + 30 * 86400000).toISOString();

    // Expire old scenarios first
    await supabase.from('business_scenarios').update({ status: 'expired' }).eq('status', 'active');

    // Insert new
    for (const s of scenarios) {
      await supabase.from('business_scenarios').insert({
        title:            s.title,
        scenario_type:    s.scenario_type,
        probability:      s.probability,
        time_horizon:     s.time_horizon || '90d',
        description:      s.description,
        key_assumptions:  JSON.stringify(s.key_assumptions || []),
        actions:          JSON.stringify(s.actions || []),
        financial_impact: s.financial_impact || 0,
        triggers:         JSON.stringify(s.triggers || []),
        status:           'active',
        generated_at:     new Date().toISOString(),
        expires_at:       expiry,
        acknowledged:     false,
      });
    }
  } catch (err) {
    console.error('[Scenarios] Parse error:', err);
  }
};

// ── Detect cross-entity signals ───────────────────────────────────────
export const detectCrossEntitySignals = async (): Promise<void> => {
  const companies = ['GlassCo', 'GTK', 'GTI', 'Nippon', 'Factory'];

  // Check vendor overlap
  const vendors = InventoryService.getVendors();
  const vendorCompanies: Record<string, string[]> = {};
  vendors.forEach((v: any) => {
    if (!vendorCompanies[v.name]) vendorCompanies[v.name] = [];
    if (v.company && !vendorCompanies[v.name].includes(v.company)) vendorCompanies[v.name].push(v.company);
  });

  const sharedVendors = Object.entries(vendorCompanies).filter(([, cos]) => cos.length >= 2);

  // Check open POs for shared vendors
  const pos = InventoryService.getPurchaseOrders().filter((p: any) => !['GRN Done','Paid'].includes(p.status));
  for (const [vendorName, cos] of sharedVendors.slice(0, 3)) {
    const vendorPOs = pos.filter((p: any) => p.vendorName?.toLowerCase().includes(vendorName.toLowerCase().slice(0, 6)));
    if (vendorPOs.length >= 2) {
      const total = vendorPOs.reduce((s: number, p: any) => s + (p.total || 0), 0);
      await supabase.from('cross_entity_signals').upsert({
        signal_type:      'vendor',
        entities:         cos,
        title:            `Shared vendor concentration: ${vendorName}`,
        description:      `${cos.join(' + ')} dono ${vendorName} pe depend karte hain. ${vendorPOs.length} open POs (PKR ${total.toLocaleString()}). Agar vendor delay kare — multiple entities affected.`,
        severity:         total > 500000 ? 'high' : 'medium',
        financial_impact: total,
        days_to_impact:   14,
        resolved:         false,
        created_at:       new Date().toISOString(),
      }, { onConflict: 'title' }).catch(() => {});
    }
  }

  // Cash signal across entities
  const allEmployees = HRService.getEmployees();
  const totalPayroll = allEmployees
    .filter((e: any) => !['resigned','terminated'].includes(e.work?.status || ''))
    .reduce((s: number, e: any) => s + (e.salary?.basic || 0), 0);

  if (totalPayroll > 0) {
    const allInvoices = SalesService.getInvoices();
    const overdueAll  = allInvoices.filter((i: any) => i.status === 'Unpaid' && i.dueDate < new Date().toISOString().split('T')[0]);
    const overdueVal  = overdueAll.reduce((s: number, i: any) => s + (i.amount || i.totalAmount || 0), 0);

    if (overdueVal > totalPayroll * 2) {
      await supabase.from('cross_entity_signals').upsert({
        signal_type:      'cash_flow',
        entities:         ['GlassCo', 'GTK'],
        title:            'Group receivables risk — payroll coverage',
        description:      `Group-wide overdue receivables (PKR ${overdueVal.toLocaleString()}) are ${Math.round(overdueVal / totalPayroll)}x monthly payroll (PKR ${totalPayroll.toLocaleString()}). Collection urgency high.`,
        severity:         'high',
        financial_impact: overdueVal,
        days_to_impact:   30,
        resolved:         false,
        created_at:       new Date().toISOString(),
      }, { onConflict: 'title' }).catch(() => {});
    }
  }
};

// ── Temporal predictions ──────────────────────────────────────────────
export const buildTemporalPredictions = async (): Promise<void> => {
  const now    = new Date();
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }

  const invoices = SalesService.getInvoices().filter((i: any) => i.company === 'Glassco');
  const revByMonth = months.map(m => ({
    month: m,
    value: invoices.filter((i: any) => i.date?.startsWith(m)).reduce((s: number, i: any) => s + (i.amount || i.totalAmount || 0), 0),
  }));

  const values = revByMonth.map(r => r.value).filter(v => v > 0);
  if (values.length < 3) return;

  // Simple linear trend
  const n       = values.length;
  const xMean   = (n - 1) / 2;
  const yMean   = values.reduce((s, v) => s + v, 0) / n;
  const slope   = values.reduce((s, v, i) => s + (i - xMean) * (v - yMean), 0) /
                  values.reduce((s, _, i) => s + (i - xMean) ** 2, 0);
  const nextVal = Math.max(0, yMean + slope * (n - xMean));

  const trend = slope > values[values.length - 1] * 0.05 ? 'up' :
                slope < -values[values.length - 1] * 0.05 ? 'down' : 'stable';

  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  await supabase.from('temporal_predictions').upsert({
    metric:           'revenue',
    entity:           'GlassCo',
    current_value:    values[values.length - 1],
    predicted_value:  Math.round(nextVal),
    prediction_date:  nextMonth.toISOString().split('T')[0],
    confidence:       Math.min(85, 50 + values.length * 5),
    trend_direction:  trend,
    basis:            `Linear trend from ${values.length} months data`,
    created_at:       new Date().toISOString(),
  }, { onConflict: 'metric,entity' }).catch(() => {});
};
