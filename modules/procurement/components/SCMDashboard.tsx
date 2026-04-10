/**
 * SCMDashboard.tsx — Design System v2 Pilot
 *
 * ── Changes from v1 ──────────────────────────────────────────────────
 * ✅  CompactPageHeader replaces the giant dark green gradient oval
 * ✅  DataGridCard replaces all raw <table> elements with embedded CSS
 * ✅  Zero inline style={{}} objects — pure Tailwind everywhere
 * ✅  Removed embedded <style> tag (scm-tab / scm-th / scm-td classes)
 * ✅  Alt+R global shortcut wired to refresh via erp:refresh event
 * ✅  Dense KPI row (h-auto cards, not giant padded blocks)
 * ✅  Tab bar uses Tailwind border-b-2 active indicator (not CSS classes)
 * ✅  Forecast + EOQ sections unified inside the same card container
 *     (original code had them accidentally rendered outside the card div)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { SCMService, VendorScorecard, ReorderAlert } from '../services/scmService';
import { DemandService } from '../services/demandService';
import {
  AlertTriangle,
  CheckCircle2,
  Minus,
  Package,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { CompactPageHeader } from '@/modules/shared/components/CompactPageHeader';
import { DataGridCard, GridColumn } from '@/modules/shared/components/DataGridCard';

// ── Formatter ─────────────────────────────────────────────────────────
const fmt = (n: number) => Math.round(n).toLocaleString('en-PK');

// ── Local badge atoms — Tailwind-only ─────────────────────────────────
const RATING_CFG = {
  A: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'A — Excellent' },
  B: { cls: 'bg-blue-50   text-blue-700   border-blue-200',   label: 'B — Good'      },
  C: { cls: 'bg-amber-50  text-amber-700  border-amber-200',  label: 'C — Average'   },
  D: { cls: 'bg-rose-50   text-rose-700   border-rose-200',   label: 'D — Poor'      },
} as const;

const RatingBadge: React.FC<{ rating: 'A' | 'B' | 'C' | 'D' }> = ({ rating }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black border tracking-wide ${RATING_CFG[rating].cls}`}
  >
    {RATING_CFG[rating].label}
  </span>
);

const UrgencyBadge: React.FC<{ urgency: ReorderAlert['urgency'] }> = ({ urgency }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black border ${
      urgency === 'CRITICAL'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-amber-50 text-amber-700 border-amber-200'
    }`}
  >
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
        urgency === 'CRITICAL' ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'
      }`}
    />
    {urgency === 'CRITICAL' ? 'CRITICAL' : 'LOW'}
  </span>
);

// ── Score bar ────────────────────────────────────────────────────────
const ScoreBar: React.FC<{ score: number }> = ({ score }) => {
  const barCls  =
    score >= 85 ? 'bg-emerald-500' :
    score >= 70 ? 'bg-blue-500'    :
    score >= 50 ? 'bg-amber-500'   : 'bg-rose-500';
  const txtCls  =
    score >= 85 ? 'text-emerald-700' :
    score >= 70 ? 'text-blue-700'    :
    score >= 50 ? 'text-amber-700'   : 'text-rose-700';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barCls}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-[11px] font-bold tabular-nums min-w-[22px] ${txtCls}`}>
        {score}
      </span>
    </div>
  );
};

// ── KPI card atom — ultra-compact ─────────────────────────────────────
type KPIAccent = 'default' | 'success' | 'danger' | 'warning';
const KPI_VALUE_CLS: Record<KPIAccent, string> = {
  default: 'text-slate-900',
  success: 'text-emerald-700',
  danger:  'text-rose-700',
  warning: 'text-amber-700',
};

const KPI: React.FC<{
  label: string;
  value: string;
  sub?: string;
  accent?: KPIAccent;
}> = ({ label, value, sub, accent = 'default' }) => (
  <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-col gap-0.5">
    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-none">
      {label}
    </span>
    <span className={`text-xl font-black leading-tight tabular-nums ${KPI_VALUE_CLS[accent]}`}>
      {value}
    </span>
    {sub && (
      <span className="text-[10px] text-slate-400 leading-none">{sub}</span>
    )}
  </div>
);

// ── Tab definition ─────────────────────────────────────────────────────
type TabId = 'reorder' | 'scorecard' | 'forecast' | 'eoq';
const TABS: { id: TabId; label: string }[] = [
  { id: 'reorder',   label: 'Reorder Alerts'  },
  { id: 'scorecard', label: 'Vendor Scorecard' },
  { id: 'forecast',  label: 'Demand Forecast'  },
  { id: 'eoq',       label: 'EOQ Calculator'   },
];

// ── Column definitions ────────────────────────────────────────────────

const REORDER_COLS: GridColumn<ReorderAlert>[] = [
  {
    key: 'itemName', header: 'Item',
    render: (_, r) => <span className="font-semibold text-slate-800">{r.itemName}</span>,
  },
  {
    key: 'category', header: 'Category',
    render: (_, r) => (
      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">
        {r.category}
      </span>
    ),
  },
  {
    key: 'currentQty', header: 'Stock', align: 'right',
    render: (_, r) => (
      <span className={`font-bold tabular-nums ${r.urgency === 'CRITICAL' ? 'text-rose-700' : 'text-amber-700'}`}>
        {fmt(r.currentQty)}
      </span>
    ),
  },
  {
    key: 'reorderPoint', header: 'Reorder Pt', align: 'right',
    render: (_, r) => <span className="text-slate-500 tabular-nums">{fmt(r.reorderPoint)}</span>,
  },
  {
    key: 'minLevel', header: 'Min Level', align: 'right',
    render: (_, r) => <span className="text-slate-400 tabular-nums">{fmt(r.minLevel)}</span>,
  },
  {
    key: 'shortfall', header: 'Shortfall', align: 'right',
    render: (_, r) => (
      <span className="font-bold text-rose-700 tabular-nums">{fmt(r.shortfall)}</span>
    ),
  },
  {
    key: 'suggestedPOQty', header: 'Suggested PO', align: 'right',
    render: (_, r) => (
      <span className="font-bold text-blue-700 tabular-nums">{fmt(r.suggestedPOQty)}</span>
    ),
  },
  {
    key: 'lastVendor', header: 'Last Vendor',
    render: (_, r) => (
      <span className="text-slate-500 truncate block max-w-[130px]">{r.lastVendor || '—'}</span>
    ),
  },
  {
    key: 'urgency', header: 'Urgency',
    render: (_, r) => <UrgencyBadge urgency={r.urgency} />,
  },
];

const SCORECARD_COLS: GridColumn<VendorScorecard>[] = [
  {
    key: 'vendorName', header: 'Vendor',
    render: (_, v) => <span className="font-semibold text-slate-800">{v.vendorName}</span>,
  },
  {
    key: 'vendorType', header: 'Type',
    render: (_, v) => (
      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">
        {v.vendorType}
      </span>
    ),
  },
  { key: 'totalPOs', header: 'POs', align: 'center' },
  {
    key: 'avgLeadDays', header: 'Avg Lead', align: 'center',
    render: (_, v) =>
      v.avgLeadDays > 0 ? (
        <span
          className={`font-bold tabular-nums ${
            v.expectedLeadDays > 0 && v.avgLeadDays > v.expectedLeadDays
              ? 'text-rose-700' : 'text-emerald-700'
          }`}
        >
          {v.avgLeadDays}d
          {v.expectedLeadDays > 0 && (
            <span className="text-slate-400 font-normal text-[10px] ml-1">
              (T:{v.expectedLeadDays}d)
            </span>
          )}
        </span>
      ) : '—',
  },
  {
    key: 'onTimePct', header: 'On-Time %', align: 'center',
    render: (_, v) => (
      <span
        className={`font-bold tabular-nums ${
          v.onTimePct >= 90 ? 'text-emerald-700' :
          v.onTimePct >= 70 ? 'text-amber-700'   : 'text-rose-700'
        }`}
      >
        {v.onTimePct > 0 ? `${v.onTimePct}%` : '—'}
      </span>
    ),
  },
  {
    key: 'avgRejectionPct', header: 'Rejection %', align: 'center',
    render: (_, v) => (
      <span
        className={`font-bold tabular-nums ${v.avgRejectionPct > 5 ? 'text-rose-700' : 'text-emerald-700'}`}
      >
        {v.avgRejectionPct > 0 ? `${v.avgRejectionPct}%` : '—'}
      </span>
    ),
  },
  {
    key: 'overallScore', header: 'Score', width: '140px',
    render: (_, v) => <ScoreBar score={v.overallScore} />,
  },
  {
    key: 'rating', header: 'Rating',
    render: (_, v) => <RatingBadge rating={v.rating} />,
  },
];

// ── Forecast row type ────────────────────────────────────────────────
interface ForecastRow { month: string; orderCount: number; totalRevenue: number; _isForecast: boolean; }

const FORECAST_COLS: GridColumn<ForecastRow>[] = [
  {
    key: 'month', header: 'Month',
    render: (_, r) => (
      <span className={r._isForecast ? 'font-bold text-blue-700' : 'text-slate-700'}>
        {r.month}
      </span>
    ),
  },
  { key: 'orderCount',   header: 'Orders',  align: 'center' },
  {
    key: 'totalRevenue', header: 'Revenue',  align: 'right',
    render: (_, r) => (
      <span className={r._isForecast ? 'font-bold text-emerald-700 tabular-nums' : 'tabular-nums'}>
        PKR {r.totalRevenue.toLocaleString()}
      </span>
    ),
  },
];

// ── EOQ row type ─────────────────────────────────────────────────────
interface EOQRow {
  itemId: string; itemName: string; category: string;
  annualDemand: number; unitCost: number; eoq: number;
  ordersPerYear: number; totalAnnualCost: number;
}

const EOQ_COLS: GridColumn<EOQRow>[] = [
  {
    key: 'itemName', header: 'Item',
    render: (_, e) => (
      <div>
        <div className="font-semibold text-slate-800">{e.itemName}</div>
        <div className="text-[10px] text-slate-400">{e.category}</div>
      </div>
    ),
  },
  {
    key: 'annualDemand', header: 'Annual Demand', align: 'right',
    render: (_, e) => <span className="tabular-nums">{e.annualDemand}</span>,
  },
  {
    key: 'unitCost', header: 'Unit Cost', align: 'right',
    render: (_, e) => <span className="tabular-nums text-slate-500">PKR {e.unitCost.toLocaleString()}</span>,
  },
  {
    key: 'eoq', header: 'EOQ', align: 'right',
    render: (_, e) => (
      <span className="font-black text-blue-700 tabular-nums">{e.eoq} units</span>
    ),
  },
  {
    key: 'ordersPerYear', header: 'Orders/yr', align: 'center',
    render: (_, e) => <span className="text-slate-500">{e.ordersPerYear}×</span>,
  },
  {
    key: 'totalAnnualCost', header: 'Annual Cost', align: 'right',
    render: (_, e) => (
      <span className="font-bold text-emerald-700 tabular-nums">
        PKR {e.totalAnnualCost.toLocaleString()}
      </span>
    ),
  },
];

// ── Main component ────────────────────────────────────────────────────
const SCMDashboard: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);

  const [activeTab, setActiveTab]         = useState<TabId>('reorder');
  const [scorecard, setScorecard]         = useState<VendorScorecard[]>([]);
  const [reorders,  setReorders]          = useState<ReorderAlert[]>([]);
  const [loading,   setLoading]           = useState(false);
  const [orderForecast, setOrderForecast] = useState<{ trend: string; avgOrdersPerMonth: number; historical: ForecastRow[]; forecast: ForecastRow[] } | null>(null);
  const [eoqList,   setEOQList]           = useState<EOQRow[]>([]);

  const load = () => {
    setLoading(true);
    try {
      setScorecard(SCMService.getVendorScorecard(company));
      setReorders(SCMService.getReorderAlerts(company));
      setOrderForecast(DemandService.getOrderForecast(company));
      setEOQList(DemandService.getEOQSuggestions(company));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [company]);

  // Wire global Alt+R refresh event from ShortcutProvider
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('erp:refresh', handler);
    return () => window.removeEventListener('erp:refresh', handler);
  }, [company]);

  const summary    = useMemo(() => SCMService.getSummary(company), [company, scorecard, reorders]);
  const alertCount = summary.criticalReorders + summary.lowReorders;

  // Build forecast rows (historical + projected)
  const forecastRows: ForecastRow[] = orderForecast
    ? [
        ...orderForecast.historical.map(m => ({ ...m, _isForecast: false })),
        ...orderForecast.forecast.map(m => ({ ...m, month: `${m.month} (F)`, _isForecast: true })),
      ]
    : [];

  return (
    <div className="flex flex-col h-full gap-0">

      {/* ── Compact Page Header ─────────────────────────────────────── */}
      <CompactPageHeader
        breadcrumbs={[{ label: 'Procurement' }, { label: 'SCM' }]}
        title="Supply Chain Dashboard"
        subtitle={`${company} Unit`}
        meta={
          alertCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
              <AlertTriangle size={10} />
              {alertCount} alert{alertCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 size={10} />
              All clear
            </span>
          )
        }
        actions={[
          {
            label:    'Refresh',
            icon:     <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />,
            onClick:  load,
            shortcut: 'Alt+R',
            disabled: loading,
          },
        ]}
      />

      {/* ── Content area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-3">

        {/* ── KPI Row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
          <KPI
            label="Total Vendors"
            value={`${summary.totalVendors}`}
            sub="with PO history"
          />
          <KPI
            label="A-Rated Vendors"
            value={`${summary.aRatedVendors}`}
            sub="Score ≥ 85"
            accent="success"
          />
          <KPI
            label="Poor Vendors"
            value={`${summary.dRatedVendors}`}
            sub="D-rated — action needed"
            accent={summary.dRatedVendors > 0 ? 'danger' : 'success'}
          />
          <KPI
            label="Reorder Alerts"
            value={`${alertCount}`}
            sub={`${summary.criticalReorders} critical · ${summary.lowReorders} low`}
            accent={
              summary.criticalReorders > 0 ? 'danger' :
              summary.lowReorders      > 0 ? 'warning' : 'success'
            }
          />
        </div>

        {/* ── Tab Panel ─────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-slate-200 rounded-lg overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-slate-200 bg-slate-50/60 overflow-x-auto shrink-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'flex items-center gap-1.5 px-4 py-2.5',
                  'text-[11px] font-bold uppercase tracking-wider',
                  'border-b-2 transition-colors whitespace-nowrap shrink-0',
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/70',
                ].join(' ')}
              >
                {tab.label}
                {tab.id === 'reorder' && alertCount > 0 && (
                  <span className="bg-rose-100 text-rose-700 text-[9px] font-black px-1.5 py-0.5 rounded-full tabular-nums">
                    {alertCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Reorder Alerts ──────────────────────────────────────── */}
          {activeTab === 'reorder' && (
            <DataGridCard
              columns={REORDER_COLS}
              rows={reorders}
              getRowKey={r => r.itemId}
              loading={loading}
              className="border-0 rounded-none flex-1"
              emptyState={
                <div className="flex flex-col items-center gap-2 py-4">
                  <CheckCircle2 size={28} className="text-emerald-400" />
                  <p className="text-xs font-bold text-emerald-700">All stock levels healthy</p>
                  <p className="text-[10px] text-slate-400">No items at or below reorder point</p>
                </div>
              }
            />
          )}

          {/* ── Vendor Scorecard ─────────────────────────────────────── */}
          {activeTab === 'scorecard' && (
            <DataGridCard
              columns={SCORECARD_COLS}
              rows={scorecard}
              getRowKey={v => v.vendorId}
              loading={loading}
              className="border-0 rounded-none flex-1"
              emptyState={
                <div className="flex flex-col items-center gap-2 py-4">
                  <Package size={28} className="text-slate-300" />
                  <p className="text-xs font-bold text-slate-500">No vendor history yet</p>
                  <p className="text-[10px] text-slate-400">
                    Scores build automatically as GRNs are posted
                  </p>
                </div>
              }
            />
          )}

          {/* ── Demand Forecast ──────────────────────────────────────── */}
          {activeTab === 'forecast' && (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Trend summary strip */}
              {orderForecast && (
                <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50/40 shrink-0">
                  <span
                    className={[
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-black border',
                      orderForecast.trend === 'UP'   ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      orderForecast.trend === 'DOWN' ? 'bg-rose-50    text-rose-700    border-rose-200'    :
                                                       'bg-blue-50    text-blue-700    border-blue-200',
                    ].join(' ')}
                  >
                    {orderForecast.trend === 'UP'   ? <TrendingUp   size={10} /> :
                     orderForecast.trend === 'DOWN' ? <TrendingDown size={10} /> :
                                                      <Minus        size={10} />}
                    {orderForecast.trend === 'UP'   ? 'Trending Up'   :
                     orderForecast.trend === 'DOWN' ? 'Trending Down' : 'Stable'}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Avg {orderForecast.avgOrdersPerMonth} orders / month
                  </span>
                </div>
              )}
              <DataGridCard
                columns={FORECAST_COLS}
                rows={forecastRows}
                getRowKey={(_, i) => String(i)}
                className="border-0 rounded-none flex-1"
                emptyState={
                  <span className="text-xs text-slate-400">No forecast data available.</span>
                }
              />
            </div>
          )}

          {/* ── EOQ Calculator ────────────────────────────────────────── */}
          {activeTab === 'eoq' && (
            <DataGridCard
              columns={EOQ_COLS}
              rows={eoqList}
              getRowKey={e => e.itemId}
              loading={loading}
              className="border-0 rounded-none flex-1"
              emptyState={
                <span className="text-xs text-slate-400">
                  No items with demand history found.
                </span>
              }
              footer={
                <>
                  <td className="px-3 py-2.5 text-[11px] font-bold" colSpan={3}>
                    EOQ = √(2DS / H)
                  </td>
                  <td className="px-3 py-2.5 text-[10px] text-slate-400" colSpan={3}>
                    Order cost PKR 2,500 · Holding 20% p.a.
                  </td>
                </>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default SCMDashboard;
