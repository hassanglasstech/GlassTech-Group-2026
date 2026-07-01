import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend, AreaChart, Area, LineChart, Line,
} from 'recharts';
import {
  Wallet, TrendingUp, Package, Factory, Briefcase, Landmark, Warehouse, ShoppingBag,
  Users, RefreshCw, Loader2, ChevronDown, ChevronUp, BarChart3, Activity,
} from 'lucide-react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { formatNumber, formatPKR } from '@/modules/shared/utils/format';
import {
  loadDashboardData, computeMetrics, DashboardData, DashboardMetrics,
  Period, Kpi, MetricTone, ModuleMetrics, SeriesPoint, CockpitCluster,
} from '@/modules/shared/services/dashboardMetricsService';

// ── Tone → accent classes (dashboard accent, not status badge) ───────
const TONE: Record<MetricTone, { text: string; dot: string; ring: string }> = {
  success: { text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'border-l-emerald-400' },
  warning: { text: 'text-amber-700', dot: 'bg-amber-500', ring: 'border-l-amber-400' },
  danger: { text: 'text-rose-700', dot: 'bg-rose-500', ring: 'border-l-rose-400' },
  info: { text: 'text-blue-700', dot: 'bg-blue-500', ring: 'border-l-blue-400' },
  neutral: { text: 'text-slate-800', dot: 'bg-slate-400', ring: 'border-l-slate-300' },
};

const CHART = { blue: '#2563eb', emerald: '#059669', amber: '#d97706', rose: '#e11d48', violet: '#7c3aed', cyan: '#0891b2', orange: '#ea580c', slate: '#64748b' };
const PIE_COLORS = [CHART.blue, CHART.emerald, CHART.amber, CHART.violet, CHART.cyan, CHART.rose, CHART.orange, CHART.slate];
const AGING_COLORS = [CHART.emerald, CHART.amber, CHART.orange, CHART.rose];

const fmtAxis = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${Math.round(v / 100_000) / 10}M`;
  if (a >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${v}`;
};

// ── Presentational atoms ─────────────────────────────────────────────
const KpiCard: React.FC<{ kpi: Kpi; big?: boolean }> = ({ kpi, big }) => {
  const t = TONE[kpi.tone || 'neutral'];
  return (
    <div className={`bg-white rounded-card border border-slate-200 border-l-4 ${t.ring} shadow-sm p-4 flex flex-col gap-1.5`} title={kpi.hint}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-label font-bold uppercase tracking-wide text-slate-500 leading-tight">{kpi.label}</span>
        <span className={`w-2 h-2 rounded-full shrink-0 ${t.dot}`} />
      </div>
      <span className={`${big ? 'text-xl' : 'text-lg'} font-bold ${t.text}`}>{kpi.display}</span>
      {kpi.sub && <span className="text-2xs text-slate-400">{kpi.sub}</span>}
    </div>
  );
};

const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; className?: string }> = ({ title, subtitle, children, className = '' }) => (
  <div className={`bg-white rounded-card border border-slate-200 shadow-sm p-4 ${className}`}>
    <div className="mb-3">
      <h3 className="text-label font-bold uppercase tracking-wide text-slate-700">{title}</h3>
      {subtitle && <p className="text-2xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const MoneyTip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 text-white px-3 py-2 rounded-control shadow-md text-2xs">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: p.color }} />{p.name}: <span className="font-bold">{formatPKR(p.value)}</span></p>
      ))}
    </div>
  );
};
const CountTip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 text-white px-3 py-2 rounded-control shadow-md text-2xs">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p, i) => (<p key={i}>{p.name}: <span className="font-bold">{formatNumber(p.value)}</span></p>))}
    </div>
  );
};

const MoreMetrics: React.FC<{ items: Kpi[] }> = ({ items }) => {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="bg-white rounded-card border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
        <span className="text-label font-bold uppercase tracking-wide text-slate-600">{open ? 'Hide' : 'Show'} {items.length} more ratios</span>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-slate-100 border-t border-slate-100">
          {items.map(k => {
            const t = TONE[k.tone || 'neutral'];
            return (
              <div key={k.key} className="bg-white p-3 flex flex-col gap-0.5" title={k.hint}>
                <span className="text-2xs font-bold uppercase tracking-wide text-slate-400">{k.label}</span>
                <span className={`text-base font-bold ${t.text}`}>{k.display}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Module tab definitions ───────────────────────────────────────────
type TabKey = 'sales' | 'finance' | 'production' | 'inventory' | 'procurement' | 'hr';
const TABS: { key: TabKey; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
  { key: 'sales', label: 'Sales', icon: Briefcase },
  { key: 'finance', label: 'Finance', icon: Landmark },
  { key: 'production', label: 'Production', icon: Factory },
  { key: 'inventory', label: 'Inventory', icon: Warehouse },
  { key: 'procurement', label: 'Procurement', icon: ShoppingBag },
  { key: 'hr', label: 'People', icon: Users },
];
const CLUSTER_ICONS = [Wallet, TrendingUp, Package, Factory];

const PrimaryGrid: React.FC<{ items: Kpi[] }> = ({ items }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
    {items.map(k => <KpiCard key={k.key} kpi={k} />)}
  </div>
);

const BarsChart: React.FC<{ data: SeriesPoint[]; money?: boolean; colors?: string[]; height?: number }> = ({ data, money, colors, height = 240 }) => (
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} layout="vertical" barSize={18}>
      <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtAxis} />
      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }} axisLine={false} tickLine={false} width={92} />
      <Tooltip content={money ? <MoneyTip /> : <CountTip />} cursor={{ fill: '#f1f5f9' }} />
      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
        {data.map((_, i) => <Cell key={i} fill={(colors || PIE_COLORS)[i % (colors || PIE_COLORS).length]} />)}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

const DonutChart: React.FC<{ data: SeriesPoint[]; money?: boolean }> = ({ data, money }) => {
  const shown = data.filter(d => Number(d.value) > 0);
  if (!shown.length) return <div className="h-[240px] flex items-center justify-center text-body text-slate-400">No data yet</div>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={shown} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
          {shown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip content={money ? <MoneyTip /> : <CountTip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
      </PieChart>
    </ResponsiveContainer>
  );
};

// ── Per-module bodies ────────────────────────────────────────────────
const ModuleBody: React.FC<{ tab: TabKey; m: DashboardMetrics }> = ({ tab, m }) => {
  const mod: ModuleMetrics = m[tab];
  return (
    <div className="space-y-4">
      <PrimaryGrid items={mod.primary} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {tab === 'sales' && <>
          <ChartCard title="Billed Revenue" subtitle="Last 6 months" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={mod.charts.revenue6m}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtAxis} />
                <Tooltip content={<MoneyTip />} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke={CHART.blue} fill="#dbeafe" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="AR Aging" subtitle="Unpaid balance by overdue bucket">
            <BarsChart data={mod.charts.arAging} money colors={AGING_COLORS} />
          </ChartCard>
        </>}
        {tab === 'finance' && <ChartCard title="Revenue vs Expenses" subtitle="Posted GL — last 6 months" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={mod.charts.pnl6m}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtAxis} />
              <Tooltip content={<MoneyTip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke={CHART.blue} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="expenses" name="Expenses" stroke={CHART.rose} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke={CHART.emerald} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>}
        {tab === 'production' && <ChartCard title="Pieces by Stage" subtitle="Production funnel (live)" className="lg:col-span-2">
          {mod.charts.byStage.length ? <BarsChart data={mod.charts.byStage} colors={[CHART.blue]} height={Math.max(160, mod.charts.byStage.length * 34)} /> : <div className="h-[160px] flex items-center justify-center text-body text-slate-400">No pieces in process</div>}
        </ChartCard>}
        {tab === 'inventory' && <>
          <ChartCard title="Stock Value by Category">
            <DonutChart data={mod.charts.byCategory} money />
          </ChartCard>
          <ChartCard title="Stock Aging" subtitle="Value by days since last movement">
            <BarsChart data={mod.charts.aging} money colors={AGING_COLORS} />
          </ChartCard>
        </>}
        {tab === 'procurement' && <>
          <ChartCard title="Vendor Spend" subtitle="Top suppliers by PO value">
            <BarsChart data={mod.charts.vendorSpend} money />
          </ChartCard>
          <ChartCard title="PO Match Status">
            <DonutChart data={mod.charts.matchStatus} />
          </ChartCard>
        </>}
        {tab === 'hr' && <ChartCard title="Headcount by Department" className="lg:col-span-2">
          {mod.charts.byDept.length ? <BarsChart data={mod.charts.byDept} colors={[CHART.violet]} /> : <div className="h-[160px] flex items-center justify-center text-body text-slate-400">No staff yet</div>}
        </ChartCard>}
      </div>
      <MoreMetrics items={mod.secondary} />
    </div>
  );
};

// ── Page ─────────────────────────────────────────────────────────────
const InsightsDashboard: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('mtd');
  const [tab, setTab] = useState<TabKey>('sales');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadDashboardData(company).then(d => { if (alive) { setData(d); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [company, refreshKey]);

  const metrics: DashboardMetrics | null = useMemo(() => (data ? computeMetrics(data, period) : null), [data, period]);

  if (loading || !metrics) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 bg-slate-200 rounded-control animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-card animate-pulse" />)}</div>
      </div>
    );
  }

  const PERIODS: { id: Period; label: string }[] = [{ id: 'mtd', label: 'This Month' }, { id: 'q', label: '3 Months' }, { id: 'ytd', label: 'This Year' }];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Activity size={20} className="text-blue-600" /> Business Insights</h1>
          <p className="text-body text-slate-400">{metrics.meta.company} — live KPIs &amp; ratios · {metrics.meta.periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white rounded-control border border-slate-200 p-1 flex">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)} className={`px-3 py-1.5 rounded-control text-2xs font-bold uppercase tracking-wide transition-all ${period === p.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>{p.label}</button>
            ))}
          </div>
          <button onClick={() => setRefreshKey(k => k + 1)} className="p-2 bg-white rounded-control border border-slate-200 hover:bg-slate-50 transition-colors" aria-label="Refresh"><RefreshCw size={16} className="text-slate-500" /></button>
        </div>
      </div>

      {!metrics.meta.hasData && (
        <div className="bg-blue-50 border border-blue-100 rounded-card p-4 text-body text-blue-700">No data yet for {metrics.meta.company}. KPIs will populate as orders, invoices, GL entries and production pieces are recorded.</div>
      )}

      {/* ── Executive Cockpit ───────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-slate-400" />
          <h2 className="text-base font-bold text-slate-700">Executive Cockpit</h2>
          <span className="text-2xs text-slate-400 font-medium">the numbers to check first</span>
        </div>
        <div className="space-y-4">
          {metrics.cockpit.map((cluster: CockpitCluster, ci: number) => {
            const Icon = CLUSTER_ICONS[ci % CLUSTER_ICONS.length];
            return (
              <div key={cluster.title}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon size={13} className="text-slate-400" />
                  <h3 className="text-2xs font-bold uppercase tracking-wider text-slate-400">{cluster.title}</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {cluster.kpis.map(k => <KpiCard key={k.key} kpi={k} big />)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Module deep-dive ────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-3 py-2 rounded-control text-2xs font-bold uppercase tracking-wide transition-all border ${active ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                <Icon size={13} className={active ? 'text-white' : 'text-slate-400'} /> {t.label}
              </button>
            );
          })}
        </div>
        <ModuleBody tab={tab} m={metrics} />
      </section>
    </div>
  );
};

export default InsightsDashboard;
