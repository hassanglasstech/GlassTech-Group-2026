/**
 * SCMDashboard.tsx — Phase 2
 * Supply Chain Manager view:
 *   - Vendor Scorecard (rating A/B/C/D)
 *   - Reorder Alerts (CRITICAL / LOW)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { SCMService, VendorScorecard, ReorderAlert } from '../services/scmService';
import { DemandService } from '../services/demandService';
import { AlertTriangle, CheckCircle2, Package, Star, RefreshCw, TrendingUp } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('en-PK');

const RatingBadge: React.FC<{ rating: 'A' | 'B' | 'C' | 'D' }> = ({ rating }) => {
  const cfg = {
    A: { bg: '#DCFCE7', color: '#16A34A', label: 'A — Excellent' },
    B: { bg: '#DBEAFE', color: '#2563EB', label: 'B — Good' },
    C: { bg: '#FEF3C7', color: '#D97706', label: 'C — Average' },
    D: { bg: '#FEE2E2', color: '#DC2626', label: 'D — Poor' },
  }[rating];
  return (
    <span style={{ background: cfg.bg, color: cfg.color, padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 900, letterSpacing: '.05em' }}>
      {cfg.label}
    </span>
  );
};

const UrgencyBadge: React.FC<{ urgency: ReorderAlert['urgency'] }> = ({ urgency }) => (
  <span style={{
    background: urgency === 'CRITICAL' ? '#FEE2E2' : '#FEF3C7',
    color: urgency === 'CRITICAL' ? '#DC2626' : '#D97706',
    padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800,
  }}>
    {urgency === 'CRITICAL' ? '🔴 CRITICAL' : '🟡 LOW'}
  </span>
);

const ScoreBar: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 85 ? '#16A34A' : score >= 70 ? '#2563EB' : score >= 50 ? '#D97706' : '#DC2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#F1F5F9', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 800, color, minWidth: 28 }}>{score}</span>
    </div>
  );
};

const KPI: React.FC<{ label: string; value: string; color?: string; sub?: string }> = ({ label, value, color = '#1B3A6B', sub }) => (
  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
    <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
  </div>
);

const styles = `
  .scm-tab { display:flex; align-items:center; gap:6px; padding:10px 18px; font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#64748b; background:none; border:none; border-bottom:3px solid transparent; cursor:pointer; white-space:nowrap; font-family:inherit; transition:all .15s; }
  .scm-tab:hover { color:#1e293b; background:#f8fafc; }
  .scm-tab.active { color:#0369a1; border-bottom-color:#0369a1; background:#eff6ff; }
  .scm-th { padding:10px 14px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#fff; background:#065F46; text-align:left; white-space:nowrap; }
  .scm-td { padding:10px 14px; font-size:12px; color:#334155; border-bottom:1px solid #f1f5f9; }
  .scm-tr:hover td { background:#F0FDF4; }
`;

const SCMDashboard: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [activeTab, setActiveTab] = useState<'scorecard' | 'reorder' | 'forecast' | 'eoq'>('reorder');
  const [scorecard, setScorecard] = useState<VendorScorecard[]>([]);
  const [reorders, setReorders]   = useState<ReorderAlert[]>([]);
  const [loading, setLoading]     = useState(false);
  const [orderForecast, setOrderForecast] = useState<any>(null);
  const [eoqList, setEOQList]             = useState<any[]>([]);

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

  const summary = useMemo(() => SCMService.getSummary(company), [company, scorecard, reorders]);

  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif' }}>
      <style>{styles}</style>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #064E3B 0%, #059669 100%)', color: '#fff', padding: '20px 24px', borderRadius: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-.02em', textTransform: 'uppercase' }}>SCM Dashboard</div>
          <div style={{ fontSize: 11, color: '#A7F3D0', marginTop: 4, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>{company} — Supply Chain Management</div>
        </div>
        <button onClick={load} style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="Total Vendors" value={`${summary.totalVendors}`} sub="with PO history" />
        <KPI label="A-Rated Vendors" value={`${summary.aRatedVendors}`} color="#16A34A" sub="Score ≥ 85" />
        <KPI label="Poor Vendors" value={`${summary.dRatedVendors}`} color={summary.dRatedVendors > 0 ? '#DC2626' : '#16A34A'} sub="D-rated — action needed" />
        <KPI label="Reorder Alerts" value={`${summary.criticalReorders + summary.lowReorders}`} color={summary.criticalReorders > 0 ? '#DC2626' : summary.lowReorders > 0 ? '#D97706' : '#16A34A'} sub={`${summary.criticalReorders} critical, ${summary.lowReorders} low`} />
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <nav style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', padding: '0 16px', background: '#FAFAFA' }}>
          <button onClick={() => setActiveTab('reorder')} className={`scm-tab${activeTab === 'reorder' ? ' active' : ''}`}>
            Reorder Alerts {(summary.criticalReorders + summary.lowReorders) > 0 && (
              <span style={{ background: summary.criticalReorders > 0 ? '#FEE2E2' : '#FEF3C7', color: summary.criticalReorders > 0 ? '#DC2626' : '#D97706', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 900 }}>
                {summary.criticalReorders + summary.lowReorders}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab('scorecard')} className={`scm-tab${activeTab === 'scorecard' ? ' active' : ''}`}>
            Vendor Scorecard
          </button>
          <button onClick={() => setActiveTab('forecast')} className={`scm-tab${activeTab === 'forecast' ? ' active' : ''}`}>
            Demand Forecast
          </button>
          <button onClick={() => setActiveTab('eoq')} className={`scm-tab${activeTab === 'eoq' ? ' active' : ''}`}>
            EOQ Calculator
          </button>
        </nav>

        {/* REORDER ALERTS */}
        {activeTab === 'reorder' && (
          reorders.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <CheckCircle2 size={32} color="#16A34A" style={{ margin: '0 auto 12px' }} />
              <div style={{ color: '#16A34A', fontWeight: 800, fontSize: 14 }}>All stock levels are healthy</div>
              <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>No items at or below reorder point</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Item', 'Category', 'Current Stock', 'Reorder Point', 'Min Level', 'Shortfall', 'Suggested PO Qty', 'Last Vendor', 'Urgency'].map(h => (
                    <th key={h} className="scm-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reorders.map(r => (
                  <tr key={r.itemId} className="scm-tr">
                    <td className="scm-td" style={{ fontWeight: 700 }}>{r.itemName}</td>
                    <td className="scm-td"><span style={{ background: '#F1F5F9', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 800 }}>{r.category}</span></td>
                    <td className="scm-td" style={{ textAlign: 'right', fontWeight: 800, color: r.urgency === 'CRITICAL' ? '#DC2626' : '#D97706' }}>{fmt(r.currentQty)}</td>
                    <td className="scm-td" style={{ textAlign: 'right', color: '#64748B' }}>{fmt(r.reorderPoint)}</td>
                    <td className="scm-td" style={{ textAlign: 'right', color: '#94A3B8' }}>{fmt(r.minLevel)}</td>
                    <td className="scm-td" style={{ textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>{fmt(r.shortfall)}</td>
                    <td className="scm-td" style={{ textAlign: 'right', color: '#2563EB', fontWeight: 700 }}>{fmt(r.suggestedPOQty)}</td>
                    <td className="scm-td" style={{ color: '#64748B', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.lastVendor || '—'}</td>
                    <td className="scm-td"><UrgencyBadge urgency={r.urgency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* VENDOR SCORECARD */}
        {activeTab === 'scorecard' && (
          scorecard.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Package size={32} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
              <div style={{ color: '#64748B', fontWeight: 800, fontSize: 14 }}>No vendor history yet</div>
              <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>
                Scores build automatically as GRNs are posted. Use SCMService.recordLeadTime() in GRN post flow.
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Vendor', 'Type', 'Total POs', 'Avg Lead (days)', 'On-Time %', 'Rejection %', 'Score', 'Rating'].map(h => (
                    <th key={h} className="scm-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scorecard.map(v => (
                  <tr key={v.vendorId} className="scm-tr">
                    <td className="scm-td" style={{ fontWeight: 700 }}>{v.vendorName}</td>
                    <td className="scm-td"><span style={{ background: '#F1F5F9', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 800 }}>{v.vendorType}</span></td>
                    <td className="scm-td" style={{ textAlign: 'center' }}>{v.totalPOs}</td>
                    <td className="scm-td" style={{ textAlign: 'center' }}>
                      {v.avgLeadDays > 0 ? (
                        <span style={{ color: v.expectedLeadDays > 0 && v.avgLeadDays > v.expectedLeadDays ? '#DC2626' : '#16A34A', fontWeight: 700 }}>
                          {v.avgLeadDays}d {v.expectedLeadDays > 0 ? `(target: ${v.expectedLeadDays}d)` : ''}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="scm-td" style={{ textAlign: 'center', fontWeight: 700, color: v.onTimePct >= 90 ? '#16A34A' : v.onTimePct >= 70 ? '#D97706' : '#DC2626' }}>
                      {v.onTimePct > 0 ? `${v.onTimePct}%` : '—'}
                    </td>
                    <td className="scm-td" style={{ textAlign: 'center', color: v.avgRejectionPct > 5 ? '#DC2626' : '#16A34A', fontWeight: 700 }}>
                      {v.avgRejectionPct > 0 ? `${v.avgRejectionPct}%` : '—'}
                    </td>
                    <td className="scm-td" style={{ minWidth: 120 }}><ScoreBar score={v.overallScore} /></td>
                    <td className="scm-td"><RatingBadge rating={v.rating} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

        {/* DEMAND FORECAST */}
        {activeTab === 'forecast' && orderForecast && (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <span style={{
                background: orderForecast.trend === 'UP' ? '#DCFCE7' : orderForecast.trend === 'DOWN' ? '#FEE2E2' : '#EFF6FF',
                color: orderForecast.trend === 'UP' ? '#16A34A' : orderForecast.trend === 'DOWN' ? '#DC2626' : '#2563EB',
                padding: '4px 12px', borderRadius: 12, fontWeight: 800, fontSize: 11,
              }}>
                {orderForecast.trend === 'UP' ? 'Trending Up' : orderForecast.trend === 'DOWN' ? 'Trending Down' : 'Stable'}
              </span>
              <span style={{ fontSize: 12, color: '#64748B' }}>
                Avg {orderForecast.avgOrdersPerMonth} orders per month
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr>
                  {['Month', 'Orders', 'Revenue'].map(h => (
                    <th key={h} className="scm-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderForecast.historical.map((m: any) => (
                  <tr key={m.month} className="scm-tr">
                    <td className="scm-td">{m.month}</td>
                    <td className="scm-td" style={{ textAlign: 'center' as const }}>{m.orderCount}</td>
                    <td className="scm-td" style={{ textAlign: 'right' as const }}>
                      PKR {m.totalRevenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {orderForecast.forecast.map((m: any) => (
                  <tr key={m.month} style={{ background: '#F0FDF4' }}>
                    <td className="scm-td" style={{ fontWeight: 800, color: '#065F46' }}>{m.month} (F)</td>
                    <td className="scm-td" style={{ textAlign: 'center' as const, fontWeight: 700 }}>{m.orderCount}</td>
                    <td className="scm-td" style={{ textAlign: 'right' as const, color: '#059669', fontWeight: 800 }}>
                      PKR {m.totalRevenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* EOQ CALCULATOR */}
        {activeTab === 'eoq' && (
          eoqList.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' as const, color: '#94A3B8', fontSize: 13 }}>
              No items with demand history found.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr>
                  {['Item', 'Annual Demand', 'Unit Cost', 'EOQ', 'Orders per Year', 'Annual Cost'].map(h => (
                    <th key={h} className="scm-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eoqList.map((e: any) => (
                  <tr key={e.itemId} className="scm-tr">
                    <td className="scm-td" style={{ fontWeight: 700 }}>
                      {e.itemName}
                      <div style={{ fontSize: 10, color: '#94A3B8' }}>{e.category}</div>
                    </td>
                    <td className="scm-td" style={{ textAlign: 'right' as const }}>{e.annualDemand}</td>
                    <td className="scm-td" style={{ textAlign: 'right' as const, color: '#64748B' }}>
                      PKR {e.unitCost.toLocaleString()}
                    </td>
                    <td className="scm-td" style={{ textAlign: 'right' as const, fontWeight: 800, color: '#2563EB' }}>
                      {e.eoq} units
                    </td>
                    <td className="scm-td" style={{ textAlign: 'center' as const, color: '#64748B' }}>
                      {e.ordersPerYear}x
                    </td>
                    <td className="scm-td" style={{ textAlign: 'right' as const, color: '#16A34A', fontWeight: 700 }}>
                      PKR {e.totalAnnualCost.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#1E293B' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', color: '#fff', fontWeight: 800, fontSize: 12 }}>
                    EOQ Formula: sqrt(2DS per H)
                  </td>
                  <td colSpan={3} style={{ padding: '10px 14px', color: '#94A3B8', fontSize: 11 }}>
                    Ordering cost PKR 2500 per order, holding 20 pct per year
                  </td>
                </tr>
              </tfoot>
            </table>
          )
        )}
    </div>
  );
};

export default SCMDashboard;
