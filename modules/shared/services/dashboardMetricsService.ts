/**
 * dashboardMetricsService.ts — single source of truth for the Business Insights
 * dashboard. ALL KPI/ratio computation lives here (components stay presentational
 * per the design contract). Every metric is derived from data the ERP already
 * captures; nothing here invents fields.
 *
 * Layout of the output:
 *   - cockpit[]  — curated cross-module headline, grouped into themed clusters
 *   - <module>   — { primary[] (P1 cards), secondary[] (P2/P3), charts{} }
 *
 * Grounded in: GLASSCO_DASHBOARD_KPI_CATALOG.md
 */

import { Account, LedgerTransaction, Invoice } from '@/modules/finance/types/finance';
import { Quotation, ProductionPiece } from '@/modules/production/types/production';
import { StoreItem, PurchaseOrder, Requisition } from '@/modules/procurement/types/inventory';
import { Employee, LoanAdvance } from '@/modules/hr/types/hr';
import { PieceStatus, QuotationStatus, Company } from '@/modules/shared/constants';
import { formatNumber, formatPKR } from '@/modules/shared/utils/format';
import { FinanceService } from '@/modules/finance/services/financeService';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { HRService } from '@/modules/hr/services/hrService';

// ── Public shapes ────────────────────────────────────────────────────
export type MetricTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type Period = 'mtd' | 'q' | 'ytd';

export interface Kpi {
  key: string;
  label: string;
  display: string;       // formatted primary value
  sub?: string;          // small supporting context
  tone?: MetricTone;     // drives the accent colour
  hint?: string;         // tooltip: what it means / how it's computed
}

export interface SeriesPoint { name: string; [series: string]: number | string; }

export interface CockpitCluster { title: string; kpis: Kpi[]; }

export interface ModuleMetrics {
  primary: Kpi[];
  secondary: Kpi[];
  charts: Record<string, SeriesPoint[]>;
}

export interface DashboardMetrics {
  cockpit: CockpitCluster[];
  sales: ModuleMetrics;
  finance: ModuleMetrics;
  production: ModuleMetrics;
  inventory: ModuleMetrics;
  procurement: ModuleMetrics;
  hr: ModuleMetrics;
  meta: { company: string; period: Period; periodLabel: string; hasData: boolean };
}

export interface DashboardData {
  company: Company;
  accounts: Account[];
  ledger: LedgerTransaction[];
  invoices: Invoice[];
  quotations: Quotation[];
  pieces: ProductionPiece[];
  store: StoreItem[];
  lowStock: ReturnType<typeof InventoryService.getLowStockItems>;
  purchaseOrders: PurchaseOrder[];
  requisitions: Requisition[];
  employees: Employee[];
  loans: LoanAdvance[];
  budgetAlertCount: number;
}

// ── Small numeric helpers ────────────────────────────────────────────
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const ratio = (n: number, d: number): number => (d > 0 ? (n / d) * 100 : 0);
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Compact money for dense cards — never uses toLocaleString (token-ratchet safe). */
const moneyShort = (v: unknown): string => {
  const n = num(v);
  const a = Math.abs(n);
  if (a >= 1_000_000) return `PKR ${formatNumber(round1(n / 1_000_000))}M`;
  if (a >= 1_000) return `PKR ${formatNumber(Math.round(n / 1_000))}K`;
  return formatPKR(Math.round(n));
};
const pctStr = (n: number): string => `${formatNumber(round1(n))}%`;
const count = (n: number): string => formatNumber(Math.round(n));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthKey = (d: string | undefined): string => {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};
const lastNMonths = (n: number): { key: string; label: string }[] => {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
  }
  return out;
};
const daysBetween = (a: string | undefined, b: string | undefined): number | null => {
  if (!a || !b) return null;
  const da = new Date(a).getTime(), db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round((db - da) / 86_400_000);
};
const periodStart = (p: Period): Date => {
  const now = new Date();
  if (p === 'mtd') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === 'q') return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return new Date(now.getFullYear(), 0, 1);
};
const periodLabel = (p: Period): string => (p === 'mtd' ? 'This Month' : p === 'q' ? 'Last 3 Months' : 'This Year');

// Account classification by COA code prefix (GLASSCO_COA, coa.glassco.ts)
const PFX = {
  cash: '111',          // Cash & Bank
  ar: '112',            // Trade Receivables
  inventory: '115',     // Inventory
  apTrade: '2111',      // Accounts Payable (Glass / Tempering / Other)
  grir: '2115',         // GR/IR Clearing (received not yet invoiced)
  cogs: '51',           // Cost of Sales
  currentAsset: '11',   // Current assets
  currentLiab: '21',    // Current liabilities
};

const PROD_KEYWORDS = /cut|polish|grind|temper|operator|helper|process|fabric|glass|production|loader/i;
const WON_STATUSES: string[] = [QuotationStatus.APPROVED, QuotationStatus.INVOICED, QuotationStatus.PARTIAL, QuotationStatus.PAID];
const BACKLOG_STATUSES: string[] = [QuotationStatus.APPROVED, QuotationStatus.INVOICED, QuotationStatus.PARTIAL];
const OPEN_PO_CLOSED: string[] = ['Paid', 'Cancelled', 'Rejected', 'Closed', 'Completed'];

// ── Loader ───────────────────────────────────────────────────────────
export async function loadDashboardData(company: Company): Promise<DashboardData> {
  const safe = <T>(fn: () => T[]): T[] => { try { return fn() || []; } catch { return []; } };

  const accounts = safe(() => FinanceService.getAccounts()).filter(a => a.company === company);
  const ledger = safe(() => FinanceService.getLedger()).filter(t => t.company === company);
  const invoices = safe(() => SalesService.getInvoices()).filter(i => i.company === company);
  const quotations = safe(() => SalesService.getQuotations()).filter(q => q.company === company);
  const store = safe(() => InventoryService.getStore()).filter(i => i.company === company);
  const lowStock = (() => { try { return InventoryService.getLowStockItems(company); } catch { return []; } })();
  const purchaseOrders = safe(() => ProductionService.getPurchaseOrders()).filter(p => p.fromCompany === company);
  const requisitions = safe(() => InventoryService.getRequisitions()).filter(r => r.company === company);
  const employees = safe(() => HRService.getEmployees()).filter(e => e.company === company);
  const loans = safe(() => HRService.getLoans());

  let pieces: ProductionPiece[] = [];
  try { pieces = await ProductionService.getProductionPiecesAsync(company); } catch { pieces = []; }

  let budgetAlertCount = 0;
  try {
    const ccs = FinanceService.getCostCenters().filter(c => c.company === company && c.budgetMonthly);
    budgetAlertCount = ccs.filter(cc => { try { return FinanceService.checkBudget(company, cc.id).alert; } catch { return false; } }).length;
  } catch { budgetAlertCount = 0; }

  return { company, accounts, ledger, invoices, quotations, pieces, store, lowStock, purchaseOrders, requisitions, employees, loans, budgetAlertCount };
}

// ── Tone helpers ─────────────────────────────────────────────────────
const marginTone = (m: number): MetricTone => (m >= 25 ? 'success' : m >= 12 ? 'warning' : 'danger');
const goodIfZero = (n: number): MetricTone => (n === 0 ? 'success' : 'danger');
const lowGood = (n: number, warn: number): MetricTone => (n === 0 ? 'success' : n >= warn ? 'danger' : 'warning');

// ── Main computation ─────────────────────────────────────────────────
export function computeMetrics(data: DashboardData, period: Period): DashboardMetrics {
  const start = periodStart(period);
  const inPeriod = (d: string | undefined): boolean => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return !Number.isNaN(t) && t >= start.getTime();
  };
  const today = new Date().toISOString().slice(0, 10);
  const months = lastNMonths(6);
  const mIdx = new Map(months.map((m, i) => [m.key, i]));

  const acctById = new Map(data.accounts.map(a => [a.id, a]));
  const posted = data.ledger.filter(t => t.status === 'Posted');

  // ════════════════ FINANCE (ledger + accounts) ════════════════
  let glDr = 0, glCr = 0;
  let revP = 0, expP = 0, cogsP = 0;          // period P&L
  let cash = 0, arGL = 0, apGL = 0, grir = 0, invGL = 0;  // balances (all posted)
  let curAsset = 0, curLiab = 0;
  const pnl = months.map(m => ({ name: m.label, revenue: 0, expenses: 0, profit: 0 }));

  for (const t of posted) {
    const within = inPeriod(t.date || t.docDate);
    const mi = mIdx.get(monthKey(t.date || t.docDate));
    for (const d of t.details || []) {
      const a = acctById.get(d.accountId);
      if (!a) continue;
      const dr = num(d.debit), cr = num(d.credit);
      glDr += dr; glCr += cr;
      const code = a.code || '';
      // balances
      if (code.startsWith(PFX.cash)) cash += dr - cr;
      if (code.startsWith(PFX.ar)) arGL += dr - cr;
      if (code.startsWith(PFX.inventory)) invGL += dr - cr;
      if (code.startsWith(PFX.apTrade)) apGL += cr - dr;
      if (code.startsWith(PFX.grir)) grir += cr - dr;
      if (code.startsWith(PFX.currentAsset)) curAsset += dr - cr;
      if (code.startsWith(PFX.currentLiab)) curLiab += cr - dr;
      // period P&L
      if (a.type === 'Revenue') { if (within) revP += cr - dr; if (mi !== undefined) pnl[mi].revenue += cr - dr; }
      else if (a.type === 'Expense') {
        if (within) { expP += dr - cr; if (code.startsWith(PFX.cogs)) cogsP += dr - cr; }
        if (mi !== undefined) pnl[mi].expenses += dr - cr;
      }
    }
  }
  pnl.forEach(p => { p.revenue = Math.round(p.revenue); p.expenses = Math.round(p.expenses); p.profit = p.revenue - p.expenses; });

  const netProfitP = revP - expP;
  const grossMargin = ratio(revP - cogsP, revP);
  const netMargin = ratio(netProfitP, revP);
  const parked = data.ledger.filter(t => t.status === 'Parked');
  const drafts = data.ledger.filter(t => t.status === 'Draft');
  const parkedVal = parked.reduce((s, t) => s + (t.details || []).reduce((si, d) => si + num(d.debit), 0), 0);
  const glImbalance = Math.abs(glDr - glCr);
  const currentRatio = curLiab > 0 ? curAsset / curLiab : 0;
  const quickRatio = curLiab > 0 ? (curAsset - invGL) / curLiab : 0;

  // ════════════════ SALES (invoices + quotations) ════════════════
  const liveInv = data.invoices.filter(i => i.status !== 'Paid' && i.status !== 'Voided');
  const outstandingAR = liveInv.reduce((s, i) => s + num(i.balance), 0);
  const aging = { b0: 0, b30: 0, b60: 0, b90: 0 };
  for (const i of liveInv) {
    const od = daysBetween(i.dueDate, today) ?? 0;
    const bal = num(i.balance);
    if (od <= 30) aging.b0 += bal; else if (od <= 60) aging.b30 += bal; else if (od <= 90) aging.b60 += bal; else aging.b90 += bal;
  }
  // DSO from billed revenue over trailing 90 days
  const since90 = Date.now() - 90 * 86_400_000;
  const rev90 = data.invoices.filter(i => { const t = new Date(i.date).getTime(); return !Number.isNaN(t) && t >= since90; }).reduce((s, i) => s + num(i.totalAmount), 0);
  const dso = rev90 > 0 ? outstandingAR / (rev90 / 90) : 0;
  // collections this period
  let collected = 0, invoicedP = 0;
  for (const inv of data.invoices) {
    if (inPeriod(inv.date)) invoicedP += num(inv.totalAmount);
    for (const p of inv.payments || []) if (inPeriod(p.date)) collected += num(p.amount);
  }
  const collectionEff = ratio(collected, invoicedP);

  const qItemsTotal = (q: Quotation): number => (q.items || []).reduce((s, it) => s + num(it.amount), 0);
  const qSqft = (q: Quotation): number => (q.items || []).reduce((s, it) => s + num(it.totalSqFt), 0);
  const nonDraft = data.quotations.filter(q => q.status !== QuotationStatus.DRAFT);
  const won = data.quotations.filter(q => WON_STATUSES.includes(q.status));
  const winRate = ratio(won.length, nonDraft.length);
  const backlog = data.quotations.filter(q => BACKLOG_STATUSES.includes(q.status) && !q.actualDeliveryDate);
  const backlogVal = backlog.reduce((s, q) => s + qItemsTotal(q), 0);
  const delivered = data.quotations.filter(q => !!q.actualDeliveryDate);
  const onTime = delivered.filter(q => { const slip = daysBetween(q.actualDeliveryDate, q.dueDate); return slip === null ? false : slip >= 0; });
  const onTimePct = ratio(onTime.length, delivered.length);
  const cycleDays = delivered.map(q => daysBetween(q.date, q.actualDeliveryDate)).filter((n): n is number => n !== null && n >= 0);
  const avgCycle = cycleDays.length ? cycleDays.reduce((s, n) => s + n, 0) / cycleDays.length : 0;
  const deliveredSqftP = delivered.filter(q => inPeriod(q.actualDeliveryDate)).reduce((s, q) => s + qSqft(q), 0);
  const grossBeforeDisc = data.quotations.reduce((s, q) => s + qItemsTotal(q) + num(q.discountAmount), 0);
  const totalDisc = data.quotations.reduce((s, q) => s + num(q.discountAmount), 0);
  const avgDiscount = ratio(totalDisc, grossBeforeDisc);
  // top client concentration
  const clientRev = new Map<string, number>();
  data.invoices.forEach(i => clientRev.set(i.clientId, (clientRev.get(i.clientId) || 0) + num(i.totalAmount)));
  const totalInvRev = [...clientRev.values()].reduce((s, n) => s + n, 0);
  const topClient = [...clientRev.values()].sort((a, b) => b - a)[0] || 0;
  const topClientShare = ratio(topClient, totalInvRev);
  const rev6 = months.map(m => ({ name: m.label, revenue: 0, orders: 0 }));
  data.invoices.forEach(i => { const x = mIdx.get(monthKey(i.date)); if (x !== undefined) { rev6[x].revenue += Math.round(num(i.totalAmount)); rev6[x].orders += 1; } });

  // ════════════════ PRODUCTION (pieces) ════════════════
  const totalPieces = data.pieces.length;
  const stageCounts = new Map<string, number>();
  let broken = 0, brokenSqft = 0, totalSqftAll = 0, wipCount = 0, wipSqft = 0, readyDispatch = 0, producedToday = 0;
  let qcPassed = 0, qcFailed = 0, qcPending = 0;
  const terminal: string[] = [PieceStatus.DELIVERED, PieceStatus.BROKEN];
  for (const p of data.pieces) {
    const st = p.status as string;
    stageCounts.set(st, (stageCounts.get(st) || 0) + 1);
    const sq = num(p.sqft);
    totalSqftAll += sq;
    if (st === PieceStatus.BROKEN) { broken += 1; brokenSqft += sq; }
    if (!terminal.includes(st)) { wipCount += 1; wipSqft += sq; }
    if (st === PieceStatus.READY_TO_DISPATCH) readyDispatch += 1;
    if (st === PieceStatus.QC_PASSED) qcPassed += 1;
    if (st === PieceStatus.QC_FAILED) qcFailed += 1;
    if (st === PieceStatus.QC_PENDING) qcPending += 1;
    if (p.lastUpdated?.startsWith(today) && (st === PieceStatus.CUT || st === PieceStatus.TEMPERED)) producedToday += 1;
  }
  const breakageRate = ratio(broken, totalPieces);
  const breakageSqftRate = ratio(brokenSqft, totalSqftAll);
  const qcPassRate = ratio(qcPassed, qcPassed + qcFailed);
  // funnel in lifecycle order
  const STAGE_ORDER: string[] = [
    PieceStatus.CUT, PieceStatus.SERVICE_PENDING, PieceStatus.QC_PENDING, PieceStatus.QC_PASSED,
    PieceStatus.READY_TO_DISPATCH, PieceStatus.DISPATCHED, PieceStatus.RECEIVED_FROM_TEMPERING, PieceStatus.DELIVERED,
  ];
  const stageChart: SeriesPoint[] = STAGE_ORDER.filter(s => (stageCounts.get(s) || 0) > 0).map(s => ({ name: s, value: stageCounts.get(s) || 0 }));

  // ════════════════ INVENTORY (store) ════════════════
  const stockValue = data.store.reduce((s, i) => s + num(i.totalValue), 0);
  const catVal = new Map<string, number>();
  let unrestrictedVal = 0, reservedVal = 0, qiVal = 0, blockedVal = 0;
  let defectiveSqft = 0, scrapSqft = 0, remnantSqft = 0;
  const stockAge = { active: 0, moderate: 0, slow: 0, dead: 0 };
  for (const it of data.store) {
    const tv = num(it.totalValue);
    catVal.set(it.category, (catVal.get(it.category) || 0) + tv);
    const q = num(it.quantity);
    const share = (part: number): number => (q > 0 ? (num(part) / q) * tv : 0);
    unrestrictedVal += share(it.unrestrictedQty);
    reservedVal += share(it.reservedQty);
    qiVal += share(it.qiQty);
    blockedVal += share(it.blockedQty);
    defectiveSqft += num(it.defectiveSqft);
    scrapSqft += num(it.scrapSqft);
    remnantSqft += num(it.remnantSqft);
    const age = daysBetween(it.lastMovementDate, today);
    if (age === null || age <= 30) stockAge.active += tv;
    else if (age <= 90) stockAge.moderate += tv;
    else if (age <= 180) stockAge.slow += tv;
    else stockAge.dead += tv;
  }
  const lowStockCount = data.lowStock.length;
  const criticalStock = data.lowStock.filter(a => a.alertLevel === 'red').length;
  const tieOutDiff = Math.abs(stockValue - invGL);
  const tieOutOk = tieOutDiff <= Math.max(1, stockValue * 0.001);
  const deadStockVal = stockAge.slow + stockAge.dead;

  // ════════════════ PROCUREMENT (POs + reqs + ledger AP) ════════════════
  const openPOs = data.purchaseOrders.filter(p => !OPEN_PO_CLOSED.includes(p.status as string));
  const openPOVal = openPOs.reduce((s, p) => s + num(p.totalAmount), 0);
  const matched = data.purchaseOrders.filter(p => !!p.matchStatus);
  const matchExceptions = data.purchaseOrders.filter(p => p.matchStatus === 'Mismatch' || p.matchStatus === 'On-Hold').length;
  const vendorSpend = new Map<string, number>();
  data.purchaseOrders.forEach(p => { const v = (p.toVendor || p.vendorId || 'Unknown') as string; vendorSpend.set(v, (vendorSpend.get(v) || 0) + num(p.totalAmount)); });
  const totalSpend = [...vendorSpend.values()].reduce((s, n) => s + n, 0);
  const topVendorShare = ratio([...vendorSpend.values()].sort((a, b) => b - a)[0] || 0, totalSpend);
  const vendorChart: SeriesPoint[] = [...vendorSpend.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name: name.length > 16 ? name.slice(0, 16) + '…' : name, value: Math.round(value) }));
  const pendingReqs = data.requisitions.filter(r => r.status === 'Pending' || r.status === 'Draft');
  const pendingReqVal = pendingReqs.reduce((s, r) => s + num(r.totalValue), 0);
  const matchChart: SeriesPoint[] = (() => {
    const m = new Map<string, number>();
    data.purchaseOrders.forEach(p => { const k = (p.matchStatus || 'Pending') as string; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  })();

  // ════════════════ HR (employees + loans) ════════════════
  const activeEmps = data.employees.filter(e => { const s = e.work?.status; return s !== 'resigned' && s !== 'terminated' && s !== 'suspended'; });
  const headcount = activeEmps.length;
  const salaryOf = (e: Employee): number => num(e.salary?.basic) + num(e.salary?.houseRent) + num(e.salary?.conveyance) + num(e.salary?.specialAllowance) + num(e.salary?.medicalAllowance) + num(e.salary?.fuelAllowance);
  const payrollCost = activeEmps.reduce((s, e) => s + salaryOf(e), 0);
  const isProd = (e: Employee): boolean => PROD_KEYWORDS.test(`${e.work?.department || ''} ${e.work?.designation || ''}`);
  const prodHeads = activeEmps.filter(isProd).length;
  const adminHeads = headcount - prodHeads;
  const empIds = new Set(data.employees.map(e => e.id));
  const activeLoans = data.loans.filter(l => empIds.has(l.employeeId) && l.status !== 'Paid' && (l.status as string) !== 'Closed' && (l.status as string) !== 'Settled');
  const loanExposure = activeLoans.reduce((s, l) => s + num(l.amount), 0);
  const deptCount = new Map<string, number>();
  activeEmps.forEach(e => { const d = e.work?.department || 'Unassigned'; deptCount.set(d, (deptCount.get(d) || 0) + 1); });
  const deptChart: SeriesPoint[] = [...deptCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));

  // ════════════════ ASSEMBLE ════════════════
  const sales: ModuleMetrics = {
    primary: [
      { key: 'ar', label: 'Outstanding AR', display: moneyShort(outstandingAR), sub: `${count(liveInv.length)} open invoices`, tone: outstandingAR > 0 ? 'warning' : 'success', hint: 'Sum of unpaid invoice balances (excludes Paid/Voided).' },
      { key: 'ar90', label: 'AR Over 90 Days', display: moneyShort(aging.b90), tone: lowGood(aging.b90, 1), hint: 'Receivables more than 90 days past due date — collection risk.' },
      { key: 'winrate', label: 'Quote Win Rate', display: pctStr(winRate), sub: `${count(won.length)}/${count(nonDraft.length)} quotes`, tone: winRate >= 40 ? 'success' : winRate >= 20 ? 'warning' : 'danger', hint: 'Won (Approved/Invoiced/Paid) ÷ all non-draft quotations.' },
      { key: 'backlog', label: 'Open Order Backlog', display: moneyShort(backlogVal), sub: `${count(backlog.length)} orders`, tone: 'info', hint: 'Confirmed orders not yet delivered.' },
      { key: 'ontime', label: 'On-Time Delivery', display: pctStr(onTimePct), sub: `${count(delivered.length)} delivered`, tone: onTimePct >= 90 ? 'success' : onTimePct >= 75 ? 'warning' : 'danger', hint: 'Orders delivered on/before due date ÷ delivered orders.' },
      { key: 'dsqft', label: 'Delivered SqFt', display: count(deliveredSqftP), sub: periodLabel(period), tone: 'neutral', hint: 'Glass area delivered this period — the natural production volume unit.' },
    ],
    secondary: [
      { key: 'dso', label: 'DSO (days)', display: count(dso), tone: dso <= 45 ? 'success' : dso <= 75 ? 'warning' : 'danger', hint: 'Days Sales Outstanding from trailing-90-day billed revenue.' },
      { key: 'collect', label: 'Collection Efficiency', display: pctStr(collectionEff), sub: periodLabel(period), tone: collectionEff >= 90 ? 'success' : 'warning', hint: 'Cash collected ÷ amount invoiced this period.' },
      { key: 'cycle', label: 'Avg Order Cycle', display: `${count(avgCycle)} days`, tone: 'neutral', hint: 'Average order-date to delivery-date.' },
      { key: 'disc', label: 'Avg Discount Given', display: pctStr(avgDiscount), tone: avgDiscount <= 5 ? 'success' : 'warning', hint: 'Total discount ÷ gross order value before discount.' },
      { key: 'conc', label: 'Top Client Share', display: pctStr(topClientShare), tone: topClientShare >= 40 ? 'warning' : 'neutral', hint: 'Revenue from the largest client ÷ total — dependency risk.' },
    ],
    charts: {
      revenue6m: rev6,
      arAging: [
        { name: '0-30', value: Math.round(aging.b0) }, { name: '31-60', value: Math.round(aging.b30) },
        { name: '61-90', value: Math.round(aging.b60) }, { name: '90+', value: Math.round(aging.b90) },
      ],
    },
  };

  const finance: ModuleMetrics = {
    primary: [
      { key: 'netcash', label: 'Net Cash Position', display: moneyShort(cash), tone: cash >= 0 ? 'success' : 'danger', hint: 'Balance of all cash & bank accounts (code 111).' },
      { key: 'netprofit', label: 'Net Profit', display: moneyShort(netProfitP), sub: periodLabel(period), tone: netProfitP >= 0 ? 'success' : 'danger', hint: 'Revenue − all expenses, posted GL, this period.' },
      { key: 'gm', label: 'Gross Margin', display: pctStr(grossMargin), sub: periodLabel(period), tone: marginTone(grossMargin), hint: '(Revenue − COGS code 51) ÷ revenue.' },
      { key: 'nm', label: 'Net Margin', display: pctStr(netMargin), sub: periodLabel(period), tone: marginTone(netMargin), hint: 'Net profit ÷ revenue.' },
      { key: 'glok', label: 'GL Integrity', display: glImbalance === 0 ? 'Balanced' : moneyShort(glImbalance), tone: goodIfZero(glImbalance), hint: 'Σ debits − Σ credits across posted entries (should be 0).' },
      { key: 'parked', label: 'Unposted JV Backlog', display: count(parked.length + drafts.length), sub: moneyShort(parkedVal), tone: lowGood(parked.length + drafts.length, 5), hint: 'Parked + Draft GL entries awaiting review/approval.' },
    ],
    secondary: [
      { key: ' apbal', label: 'Accounts Payable', display: moneyShort(apGL), tone: 'neutral', hint: 'Balance of trade payable accounts (code 2111).' },
      { key: 'grir', label: 'GR/IR Open', display: moneyShort(grir), tone: lowGood(grir > 0 ? 1 : 0, 1), hint: 'Goods received not yet invoiced (code 2115).' },
      { key: 'cur', label: 'Current Ratio', display: formatNumber(round1(currentRatio)), tone: currentRatio >= 1.5 ? 'success' : currentRatio >= 1 ? 'warning' : 'danger', hint: 'Current assets (11) ÷ current liabilities (21).' },
      { key: 'quick', label: 'Quick Ratio', display: formatNumber(round1(quickRatio)), tone: quickRatio >= 1 ? 'success' : 'warning', hint: 'Current ratio excluding inventory.' },
      { key: 'budget', label: 'Budget Alerts', display: count(data.budgetAlertCount), tone: lowGood(data.budgetAlertCount, 1), hint: 'Cost centres over their monthly budget threshold.' },
    ],
    charts: { pnl6m: pnl },
  };

  const production: ModuleMetrics = {
    primary: [
      { key: 'wip', label: 'WIP Pieces', display: count(wipCount), sub: `${count(wipSqft)} sqft on floor`, tone: 'info', hint: 'Pieces in process (not Delivered/Broken) — cash tied up.' },
      { key: 'breakage', label: 'Breakage Rate', display: pctStr(breakageRate), sub: `${count(broken)} broken`, tone: breakageRate <= 2 ? 'success' : breakageRate <= 5 ? 'warning' : 'danger', hint: 'Broken pieces ÷ total pieces.' },
      { key: 'qcpass', label: 'QC Pass Rate', display: pctStr(qcPassRate), sub: `${count(qcPending)} pending`, tone: qcPassRate >= 95 ? 'success' : qcPassRate >= 85 ? 'warning' : 'danger', hint: 'QC-Passed ÷ (Passed + Failed) — current snapshot.' },
      { key: 'ready', label: 'Ready to Dispatch', display: count(readyDispatch), tone: 'neutral', hint: 'Pieces staged and ready to ship.' },
      { key: 'today', label: 'Produced Today', display: count(producedToday), tone: 'neutral', hint: 'Pieces cut/tempered today.' },
      { key: 'bsqft', label: 'Breakage (sqft)', display: pctStr(breakageSqftRate), tone: breakageSqftRate <= 2 ? 'success' : 'warning', hint: 'Broken sqft ÷ total sqft — weights large panes correctly.' },
    ],
    secondary: [
      { key: 'qcfail', label: 'QC Failed (open)', display: count(qcFailed), tone: lowGood(qcFailed, 1), hint: 'Pieces currently in QC-Failed state.' },
      { key: 'totalp', label: 'Total Pieces Tracked', display: count(totalPieces), tone: 'neutral', hint: 'All production pieces in the system.' },
    ],
    charts: { byStage: stageChart },
  };

  const inventory: ModuleMetrics = {
    primary: [
      { key: 'stockval', label: 'Total Stock Value', display: moneyShort(stockValue), sub: `${count(data.store.length)} SKUs`, tone: 'info', hint: 'Σ on-hand × moving-average price (IAS-2, landed cost included).' },
      { key: 'tieout', label: 'Stock ↔ GL Tie-Out', display: tieOutOk ? 'Reconciled' : moneyShort(tieOutDiff), tone: tieOutOk ? 'success' : 'danger', hint: '|stock value − GL inventory (115)| — integrity guard.' },
      { key: 'low', label: 'Below Reorder', display: count(lowStockCount), sub: `${count(criticalStock)} critical`, tone: lowGood(lowStockCount, 1), hint: 'Items at/under reorder point — weekly buy trigger.' },
      { key: 'dead', label: 'Slow + Dead Stock', display: moneyShort(deadStockVal), tone: deadStockVal > 0 ? 'warning' : 'success', hint: 'Value not moved in 90+ days — write-down candidates.' },
    ],
    secondary: [
      { key: 'avail', label: 'Available (Unrestricted)', display: moneyShort(unrestrictedVal), tone: 'neutral', hint: 'Value of sellable/cuttable stock.' },
      { key: 'reserved', label: 'Reserved Value', display: moneyShort(reservedVal), tone: 'neutral', hint: 'Committed to orders.' },
      { key: 'qi', label: 'In QC (QI)', display: moneyShort(qiVal), tone: 'neutral', hint: 'Awaiting inspection/release.' },
      { key: 'blocked', label: 'Blocked Value', display: moneyShort(blockedVal), tone: blockedVal > 0 ? 'warning' : 'neutral', hint: 'Held / unavailable stock.' },
      { key: 'remnant', label: 'Remnant SqFt', display: count(remnantSqft), tone: 'neutral', hint: 'Reusable offcut glass on hand.' },
      { key: 'scrap', label: 'Scrap SqFt', display: count(scrapSqft), tone: 'neutral', hint: 'Accumulated scrap awaiting disposal.' },
    ],
    charts: {
      byCategory: [...catVal.entries()].map(([name, value]) => ({ name, value: Math.round(value) })),
      aging: [
        { name: '0-30d', value: Math.round(stockAge.active) }, { name: '31-90d', value: Math.round(stockAge.moderate) },
        { name: '91-180d', value: Math.round(stockAge.slow) }, { name: '180d+', value: Math.round(stockAge.dead) },
      ],
    },
  };

  const procurement: ModuleMetrics = {
    primary: [
      { key: 'openpo', label: 'Open PO Commitment', display: moneyShort(openPOVal), sub: `${count(openPOs.length)} POs`, tone: 'info', hint: 'Value committed to vendors, not yet settled.' },
      { key: '3way', label: '3-Way Match Exceptions', display: count(matchExceptions), sub: `${count(matched.length)} matched`, tone: lowGood(matchExceptions, 1), hint: 'POs in Mismatch/On-Hold — block AP posting.' },
      { key: 'reorder', label: 'Reorder Alerts', display: count(lowStockCount), sub: `${count(criticalStock)} critical`, tone: lowGood(lowStockCount, 1), hint: 'Items needing a purchase order now.' },
      { key: 'vendconc', label: 'Top Vendor Share', display: pctStr(topVendorShare), tone: topVendorShare >= 60 ? 'warning' : 'neutral', hint: 'Spend with the largest supplier ÷ total — supply risk.' },
      { key: 'pendreq', label: 'Pending Requisitions', display: count(pendingReqs.length), sub: moneyShort(pendingReqVal), tone: 'neutral', hint: 'Requisitions awaiting action.' },
      { key: 'grir2', label: 'GR/IR Open', display: moneyShort(grir), tone: grir > 0 ? 'warning' : 'success', hint: 'Received not yet invoiced — stuck matches.' },
    ],
    secondary: [
      { key: 'apbal2', label: 'AP Outstanding', display: moneyShort(apGL), tone: 'neutral', hint: 'Trade payables balance (code 2111).' },
      { key: 'spend', label: 'Total Vendor Spend', display: moneyShort(totalSpend), tone: 'neutral', hint: 'All PO value, all time.' },
    ],
    charts: { vendorSpend: vendorChart, matchStatus: matchChart },
  };

  const hr: ModuleMetrics = {
    primary: [
      { key: 'head', label: 'Active Headcount', display: count(headcount), tone: 'info', hint: 'Employees not resigned/terminated/suspended.' },
      { key: 'payroll', label: 'Monthly Payroll', display: moneyShort(payrollCost), tone: 'neutral', hint: 'Sum of monthly salary + allowances for active staff.' },
      { key: 'split', label: 'Production : Admin', display: `${count(prodHeads)} : ${count(adminHeads)}`, tone: 'neutral', hint: 'Value-adding (cutting/processing) vs overhead headcount.' },
      { key: 'loans', label: 'Loan Exposure', display: moneyShort(loanExposure), sub: `${count(activeLoans.length)} active`, tone: loanExposure > 0 ? 'warning' : 'success', hint: 'Outstanding staff loans & advances (working capital).' },
    ],
    secondary: [
      { key: 'avgcost', label: 'Avg Cost / Employee', display: moneyShort(headcount > 0 ? payrollCost / headcount : 0), tone: 'neutral', hint: 'Monthly payroll ÷ active headcount.' },
      { key: 'depts', label: 'Departments', display: count(deptCount.size), tone: 'neutral', hint: 'Distinct active departments.' },
    ],
    charts: { byDept: deptChart },
  };

  const cockpit: CockpitCluster[] = [
    { title: 'Cash & Profitability', kpis: [
      { key: 'c-cash', label: 'Net Cash Position', display: moneyShort(cash), tone: cash >= 0 ? 'success' : 'danger', hint: 'Cash & bank balance.' },
      { key: 'c-np', label: 'Net Profit', display: moneyShort(netProfitP), sub: periodLabel(period), tone: netProfitP >= 0 ? 'success' : 'danger', hint: 'Revenue − expenses this period.' },
      { key: 'c-gm', label: 'Gross Margin', display: pctStr(grossMargin), tone: marginTone(grossMargin), hint: '(Revenue − COGS) ÷ revenue.' },
      { key: 'c-gl', label: 'GL Integrity', display: glImbalance === 0 ? 'Balanced' : 'Off', tone: goodIfZero(glImbalance), hint: 'Books tie out (Dr = Cr).' },
    ]},
    { title: 'Sales & Receivables', kpis: [
      { key: 'c-ar', label: 'Outstanding AR', display: moneyShort(outstandingAR), tone: outstandingAR > 0 ? 'warning' : 'success', hint: 'Unpaid invoice balances.' },
      { key: 'c-ar90', label: 'AR 90+ Days', display: moneyShort(aging.b90), tone: lowGood(aging.b90, 1), hint: 'Overdue collection risk.' },
      { key: 'c-back', label: 'Order Backlog', display: moneyShort(backlogVal), tone: 'info', hint: 'Confirmed, not yet delivered.' },
      { key: 'c-ot', label: 'On-Time Delivery', display: pctStr(onTimePct), tone: onTimePct >= 90 ? 'success' : onTimePct >= 75 ? 'warning' : 'danger', hint: 'Delivered on/before due date.' },
    ]},
    { title: 'Inventory & Procurement', kpis: [
      { key: 'c-stock', label: 'Stock Value', display: moneyShort(stockValue), tone: 'info', hint: 'Capital tied up in glass.' },
      { key: 'c-tie', label: 'Stock ↔ GL', display: tieOutOk ? 'Reconciled' : 'Variance', tone: tieOutOk ? 'success' : 'danger', hint: 'Stock value matches GL.' },
      { key: 'c-po', label: 'Open PO Commit', display: moneyShort(openPOVal), tone: 'neutral', hint: 'Committed to vendors.' },
      { key: 'c-low', label: 'Below Reorder', display: count(lowStockCount), tone: lowGood(lowStockCount, 1), hint: 'Items to buy now.' },
    ]},
    { title: 'Production & Quality', kpis: [
      { key: 'c-wip', label: 'WIP Pieces', display: count(wipCount), tone: 'info', hint: 'Pieces in process.' },
      { key: 'c-brk', label: 'Breakage Rate', display: pctStr(breakageRate), tone: breakageRate <= 2 ? 'success' : breakageRate <= 5 ? 'warning' : 'danger', hint: 'Broken ÷ total pieces.' },
      { key: 'c-qc', label: 'QC Pass Rate', display: pctStr(qcPassRate), tone: qcPassRate >= 95 ? 'success' : qcPassRate >= 85 ? 'warning' : 'danger', hint: 'Passed ÷ (passed+failed).' },
      { key: 'c-rd', label: 'Ready to Dispatch', display: count(readyDispatch), tone: 'neutral', hint: 'Staged to ship.' },
    ]},
  ];

  const hasData = data.ledger.length > 0 || data.invoices.length > 0 || data.quotations.length > 0 || data.store.length > 0 || data.pieces.length > 0;

  return {
    cockpit, sales, finance, production, inventory, procurement, hr,
    meta: { company: data.company, period, periodLabel: periodLabel(period), hasData },
  };
}
