/**
 * JobPLDashboard.tsx -- Financial Layer Phase 4
 * Job-level P&L per sales order
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Company } from '@/modules/shared/types';
import { JobPLService, JobPL, JobPLSummary } from '../services/jobPLService';
import { RefreshCw, Search } from 'lucide-react';

const fmt  = (n: number) => Math.round(n).toLocaleString('en-PK');
const fmtK = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1000000) return (n < 0 ? '-' : '') + (a / 1000000).toFixed(1) + 'M';
  if (a >= 1000)    return (n < 0 ? '-' : '') + (a / 1000).toFixed(0) + 'K';
  return String(Math.round(n));
};

const RatingBadge: React.FC<{ r: JobPL['rating'] }> = ({ r }) => {
  const cfg = {
    A: ['#DCFCE7','#16A34A'], B: ['#DBEAFE','#2563EB'],
    C: ['#FEF3C7','#D97706'], D: ['#FEE2E2','#DC2626'],
  }[r];
  return <span style={{ background: cfg[0], color: cfg[1], padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 900 }}>{r}</span>;
};

const KPI: React.FC<{ label: string; value: string; color?: string; sub?: string }> = ({ label, value, color = '#1B3A6B', sub }) => (
  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px' }}>
    <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>{label}</div>
    <div style={{ fontSize: 19, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
  </div>
);

const styles = `
  .jp-th { padding:9px 12px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:#fff; background:#1B3A6B; text-align:right; white-space:nowrap; }
  .jp-th:first-child,.jp-th:nth-child(2) { text-align:left; }
  .jp-td { padding:8px 12px; font-size:12px; color:#334155; border-bottom:1px solid #f1f5f9; text-align:right; }
  .jp-td:first-child,.jp-td:nth-child(2) { text-align:left; }
  .jp-tr:hover td { background:#F8FAFC; }
  .jp-tab { padding:9px 18px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#64748b; background:none; border:none; border-bottom:3px solid transparent; cursor:pointer; font-family:inherit; }
  .jp-tab.active { color:#1B3A6B; border-bottom-color:#2563EB; }
`;

const JobPLDashboard: React.FC<{ company: Company }> = ({ company }) => {
  const [month, setMonth]         = useState('');  // blank = all time
  const [jobs, setJobs]           = useState<JobPL[]>([]);
  const [summary, setSummary]     = useState<JobPLSummary | null>(null);
  const [search, setSearch]       = useState('');
  const [activeTab, setActiveTab] = useState<'jobs' | 'breakdown'>('jobs');
  const [sortBy, setSortBy]       = useState<'profit' | 'margin' | 'revenue'>('profit');

  const load = () => {
    const j = JobPLService.getJobPL(company, month || undefined);
    const s = JobPLService.getSummary(company, month || undefined);
    setJobs(j);
    setSummary(s);
  };

  useEffect(() => { load(); }, [company, month]);

  const filtered = useMemo(() => {
    let j = jobs;
    if (search) {
      const q = search.toLowerCase();
      j = j.filter(x => x.clientName.toLowerCase().includes(q) || x.orderNo.toLowerCase().includes(q));
    }
    return [...j].sort((a, b) =>
      sortBy === 'profit'  ? b.grossProfit - a.grossProfit :
      sortBy === 'margin'  ? b.marginPct - a.marginPct :
      b.totalRevenue - a.totalRevenue
    );
  }, [jobs, search, sortBy]);

  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif' }}>
      <style>{styles}</style>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1B3A6B, #2563EB)', color: '#fff', padding: '18px 22px', borderRadius: 14, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, textTransform: 'uppercase' as const }}>Job P&L</div>
          <div style={{ fontSize: 11, color: '#BFD7FF', marginTop: 3 }}>{company} -- Profitability per sales order</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            placeholder="All time"
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.1)', color: '#fff', fontSize: 12, fontWeight: 700 }} />
          <button onClick={load}
            style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* KPIs */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 18 }}>
          <KPI label="Orders" value={String(summary.totalOrders)} />
          <KPI label="Revenue" value={'PKR ' + fmtK(summary.totalRevenue)} color="#1B3A6B" />
          <KPI label="Total Cost" value={'PKR ' + fmtK(summary.totalCost)} color="#DC2626" />
          <KPI label="Gross Profit" value={'PKR ' + fmtK(summary.totalProfit)} color={summary.totalProfit >= 0 ? '#16A34A' : '#DC2626'} />
          <KPI label="Avg Margin" value={summary.avgMargin + '%'} color={summary.avgMargin >= 20 ? '#16A34A' : summary.avgMargin >= 10 ? '#D97706' : '#DC2626'} />
          <KPI label="Sqft" value={fmtK(summary.totalSqft)} sub={'PKR ' + summary.revenuePerSqft + ' per sqft'} />
        </div>
      )}

      {/* Rating breakdown bar */}
      {summary && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 20px', marginBottom: 18, display: 'flex', gap: 24, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' as const }}>Rating Mix</span>
          {(['A','B','C','D'] as const).map(r => {
            const count = summary.byRating[r];
            const pct   = summary.totalOrders > 0 ? Math.round(count / summary.totalOrders * 100) : 0;
            const colors = { A: '#16A34A', B: '#2563EB', C: '#D97706', D: '#DC2626' };
            return (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RatingBadge r={r} />
                <span style={{ fontSize: 13, fontWeight: 900, color: colors[r] }}>{count}</span>
                <span style={{ fontSize: 11, color: '#94A3B8' }}>({pct}%)</span>
              </div>
            );
          })}
          <div style={{ flex: 1, height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
            {(['A','B','C','D'] as const).map(r => {
              const pct = summary.totalOrders > 0 ? summary.byRating[r] / summary.totalOrders * 100 : 0;
              const colors = { A: '#16A34A', B: '#2563EB', C: '#D97706', D: '#DC2626' };
              return pct > 0 ? <div key={r} style={{ width: pct + '%', background: colors[r], height: '100%' }} /> : null;
            })}
          </div>
        </div>
      )}

      {/* Tabs + Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', marginBottom: 16 }}>
        <nav style={{ display: 'flex' }}>
          <button className={'jp-tab' + (activeTab === 'jobs' ? ' active' : '')} onClick={() => setActiveTab('jobs')}>Job List</button>
          <button className={'jp-tab' + (activeTab === 'breakdown' ? ' active' : '')} onClick={() => setActiveTab('breakdown')}>Cost Breakdown</button>
        </nav>
        <div style={{ display: 'flex', gap: 8, paddingBottom: 8 }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 11, fontWeight: 700, color: '#334155' }}>
            <option value="profit">Sort: Gross Profit</option>
            <option value="margin">Sort: Margin %</option>
            <option value="revenue">Sort: Revenue</option>
          </select>
          <div style={{ position: 'relative' as const }}>
            <Search size={13} style={{ position: 'absolute' as const, left: 9, top: 8, color: '#94A3B8' }} />
            <input placeholder="Search client / order..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 28, padding: '6px 10px 6px 28px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12, width: 200 }} />
          </div>
        </div>
      </div>

      {/* JOB LIST */}
      {activeTab === 'jobs' && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' as const, color: '#94A3B8', fontSize: 13 }}>No orders found</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                <thead>
                  <tr>
                    {['Order','Client','Date','Revenue','Cost','Gross Profit','Margin','Sqft','PKR/Sqft','Status','Rating'].map(h => (
                      <th key={h} className="jp-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(j => (
                    <tr key={j.orderId} className="jp-tr">
                      <td className="jp-td" style={{ fontWeight: 700, color: '#2563EB' }}>{j.orderNo}</td>
                      <td className="jp-td">{j.clientName}</td>
                      <td className="jp-td" style={{ color: '#64748B' }}>{j.date}</td>
                      <td className="jp-td">{fmt(j.totalRevenue)}</td>
                      <td className="jp-td" style={{ color: '#64748B' }}>{fmt(j.totalCost)}</td>
                      <td className="jp-td" style={{ fontWeight: 800, color: j.grossProfit >= 0 ? '#16A34A' : '#DC2626' }}>
                        {j.grossProfit >= 0 ? '+' : ''}{fmt(j.grossProfit)}
                      </td>
                      <td className="jp-td" style={{ fontWeight: 800, color: j.marginPct >= 20 ? '#16A34A' : j.marginPct >= 10 ? '#D97706' : '#DC2626' }}>
                        {j.marginPct}%
                      </td>
                      <td className="jp-td" style={{ color: '#64748B' }}>{j.totalSqft}</td>
                      <td className="jp-td" style={{ color: '#2563EB', fontWeight: 700 }}>{j.revenuePerSqft}</td>
                      <td className="jp-td">
                        <span style={{ background: j.invoiced ? '#DCFCE7' : '#FEF3C7', color: j.invoiced ? '#16A34A' : '#D97706', padding: '2px 6px', borderRadius: 8, fontSize: 10, fontWeight: 800 }}>
                          {j.invoiced ? 'Invoiced' : j.status}
                        </span>
                      </td>
                      <td className="jp-td"><RatingBadge r={j.rating} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#1E293B' }}>
                    <td colSpan={3} style={{ padding: '9px 12px', color: '#fff', fontWeight: 800, fontSize: 12 }}>TOTAL ({filtered.length} orders)</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: '#fff', fontWeight: 800 }}>{fmt(filtered.reduce((s,j) => s + j.totalRevenue, 0))}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: '#FCA5A5', fontWeight: 800 }}>{fmt(filtered.reduce((s,j) => s + j.totalCost, 0))}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: '#86EFAC', fontWeight: 900 }}>
                      {fmt(filtered.reduce((s,j) => s + j.grossProfit, 0))}
                    </td>
                    <td colSpan={5} style={{ padding: '9px 12px', color: '#94A3B8', fontSize: 11 }}>
                      {summary ? summary.avgMargin + '% avg margin' : ''}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* COST BREAKDOWN */}
      {activeTab === 'breakdown' && summary && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <thead>
              <tr>
                {['Cost Component', 'Total (PKR)', 'Per Sqft (PKR)', '% of Revenue'].map(h => (
                  <th key={h} className="jp-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Glass Material',   amount: jobs.reduce((s,j) => s + j.materialCost, 0),   color: '#DC2626' },
                { label: 'Tempering / Service', amount: jobs.reduce((s,j) => s + j.serviceCost, 0), color: '#D97706' },
                { label: 'Factory Overhead', amount: jobs.reduce((s,j) => s + j.overheadCost, 0),   color: '#7C3AED' },
                { label: 'Direct Labour',    amount: jobs.reduce((s,j) => s + j.labourCost, 0),     color: '#0369A1' },
              ].map(row => {
                const sqftBase = Math.max(summary.totalSqft, 1);
                const revPct   = summary.totalRevenue > 0 ? round2(row.amount / summary.totalRevenue * 100) : 0;
                return (
                  <tr key={row.label} className="jp-tr">
                    <td className="jp-td" style={{ fontWeight: 700 }}>{row.label}</td>
                    <td className="jp-td" style={{ color: row.color, fontWeight: 700 }}>{fmt(row.amount)}</td>
                    <td className="jp-td" style={{ color: '#2563EB', fontWeight: 700 }}>{round2(row.amount / sqftBase)}</td>
                    <td className="jp-td">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, background: '#F1F5F9', borderRadius: 4, height: 6 }}>
                          <div style={{ width: Math.min(100, revPct) + '%', height: '100%', background: row.color, borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', minWidth: 36 }}>{revPct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: '#F8FAFC', borderTop: '2px solid #E2E8F0' }}>
                <td className="jp-td" style={{ fontWeight: 800 }}>Total Cost</td>
                <td className="jp-td" style={{ fontWeight: 900, color: '#DC2626' }}>{fmt(summary.totalCost)}</td>
                <td className="jp-td" style={{ color: '#2563EB', fontWeight: 800 }}>{summary.costPerSqft}</td>
                <td className="jp-td" style={{ fontWeight: 800, color: '#64748B' }}>
                  {summary.totalRevenue > 0 ? round2(summary.totalCost / summary.totalRevenue * 100) : 0}%
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ background: '#1E293B' }}>
                <td style={{ padding: '9px 12px', color: '#fff', fontWeight: 800 }}>GROSS PROFIT</td>
                <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: '#86EFAC', fontWeight: 900, fontSize: 14 }}>{fmt(summary.totalProfit)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: '#86EFAC', fontWeight: 800 }}>
                  {round2(summary.totalProfit / Math.max(summary.totalSqft, 1))}
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: '#86EFAC', fontWeight: 900 }}>
                  {summary.avgMargin}% margin
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

function round2(n: number) { return Math.round(n * 100) / 100; }

export default JobPLDashboard;
