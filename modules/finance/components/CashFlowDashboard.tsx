/**
 * CashFlowDashboard.tsx — Financial Layer Phase 2
 * 13-week rolling cash flow forecast
 */

import React, { useState, useEffect } from 'react';
import { Company } from '@/modules/shared/types';
import { CashFlowService, CashFlowForecast, CashFlowWeek } from '../services/cashFlowService';
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

const fmtK = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1000000) return (n < 0 ? '-' : '') + 'PKR ' + (abs / 1000000).toFixed(1) + 'M';
  if (abs >= 1000)    return (n < 0 ? '-' : '') + 'PKR ' + (abs / 1000).toFixed(0) + 'K';
  return 'PKR ' + n.toLocaleString();
};
const fmt = (n: number) => n.toLocaleString('en-PK');

const StatusBadge: React.FC<{ s: CashFlowWeek['status'] }> = ({ s }) => {
  const c = s === 'SURPLUS' ? ['#DCFCE7','#16A34A'] : s === 'DEFICIT' ? ['#FEE2E2','#DC2626'] : ['#FEF3C7','#D97706'];
  return <span style={{ background: c[0], color: c[1], padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 800 }}>{s}</span>;
};

const KPI: React.FC<{ label: string; value: string; color?: string; sub?: string }> = ({ label, value, color = '#1B3A6B', sub }) => (
  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
    <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
  </div>
);

const styles = `
  .cf-th { padding:9px 12px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:#fff; background:#1B3A6B; text-align:right; white-space:nowrap; }
  .cf-th:first-child { text-align:left; }
  .cf-td { padding:8px 12px; font-size:12px; color:#334155; border-bottom:1px solid #f1f5f9; text-align:right; white-space:nowrap; }
  .cf-td:first-child { text-align:left; font-weight:700; }
  .cf-tr:hover td { background:#F8FAFC; }
  .cf-pos { color:#16A34A; font-weight:700; }
  .cf-neg { color:#DC2626; font-weight:700; }
  .cf-bar { display:inline-block; height:8px; border-radius:4px; min-width:2px; }
`;

const CashFlowDashboard: React.FC<{ company: Company }> = ({ company }) => {
  const [forecast, setForecast] = useState<CashFlowForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [weeks, setWeeks] = useState(13);

  const load = () => {
    setLoading(true);
    try {
      setForecast(CashFlowService.getForecast(company, weeks));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [company, weeks]);

  if (!forecast) return <div style={{ padding: 40, textAlign: 'center' as const, color: '#94A3B8' }}>Loading...</div>;

  const maxAbs = Math.max(...forecast.weeks.map(w => Math.abs(w.closingBal)), 1);

  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif' }}>
      <style>{styles}</style>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #064E3B, #059669)', color: '#fff', padding: '18px 22px', borderRadius: 14, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, textTransform: 'uppercase' as const }}>Cash Flow Forecast</div>
          <div style={{ fontSize: 11, color: '#A7F3D0', marginTop: 3 }}>{company} -- {weeks}-Week Rolling Forecast</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={weeks} onChange={e => setWeeks(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.1)', color: '#fff', fontSize: 12, fontWeight: 700 }}>
            <option value={4}>4 Weeks</option>
            <option value={8}>8 Weeks</option>
            <option value={13}>13 Weeks</option>
          </select>
          <button onClick={load} style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 18 }}>
        <KPI label="Opening Balance" value={fmtK(forecast.openingBalance)} color="#1B3A6B" />
        <KPI label="Total Inflows" value={fmtK(forecast.summary.totalInflows)} color="#16A34A" sub={weeks + ' weeks'} />
        <KPI label="Total Outflows" value={fmtK(forecast.summary.totalOutflows)} color="#DC2626" sub={weeks + ' weeks'} />
        <KPI label="Net Cash Flow" value={fmtK(forecast.summary.netCashFlow)} color={forecast.summary.netCashFlow >= 0 ? '#16A34A' : '#DC2626'} />
        <KPI label="Deficit Weeks" value={String(forecast.summary.deficitWeeks)} color={forecast.summary.deficitWeeks > 0 ? '#DC2626' : '#16A34A'} sub={'Worst: ' + forecast.summary.worstWeek} />
      </div>

      {/* Mini bar chart */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 12 }}>Closing Balance by Week</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
          {forecast.weeks.map(w => {
            const pct = Math.abs(w.closingBal) / maxAbs;
            const h = Math.max(4, pct * 56);
            const color = w.status === 'DEFICIT' ? '#DC2626' : w.status === 'TIGHT' ? '#D97706' : '#16A34A';
            return (
              <div key={w.weekNo} style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4 }} title={w.weekLabel + ': PKR ' + fmt(w.closingBal)}>
                <span className="cf-bar" style={{ width: '100%', height: h + 'px', background: color, opacity: .8 }} />
                <span style={{ fontSize: 9, color: '#94A3B8', fontWeight: 700 }}>W{w.weekNo}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <thead>
              <tr>
                <th className="cf-th" style={{ textAlign: 'left' as const }}>Week</th>
                <th className="cf-th">AR Collections</th>
                <th className="cf-th">AP Payments</th>
                <th className="cf-th">Payroll</th>
                <th className="cf-th">Petty Cash</th>
                <th className="cf-th">Net Flow</th>
                <th className="cf-th">Opening Bal</th>
                <th className="cf-th">Closing Bal</th>
                <th className="cf-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {forecast.weeks.map(w => (
                <tr key={w.weekNo} className="cf-tr">
                  <td className="cf-td">{w.weekLabel}</td>
                  <td className="cf-td"><span className="cf-pos">{w.arCollections > 0 ? fmt(w.arCollections) : '-'}</span></td>
                  <td className="cf-td"><span className="cf-neg">{w.apPayments > 0 ? fmt(w.apPayments) : '-'}</span></td>
                  <td className="cf-td"><span className="cf-neg">{w.payroll > 0 ? fmt(w.payroll) : '-'}</span></td>
                  <td className="cf-td" style={{ color: '#64748B' }}>{w.pettyCash > 0 ? fmt(w.pettyCash) : '-'}</td>
                  <td className="cf-td"><span className={w.netFlow >= 0 ? 'cf-pos' : 'cf-neg'}>{w.netFlow >= 0 ? '+' : ''}{fmt(w.netFlow)}</span></td>
                  <td className="cf-td" style={{ color: '#64748B' }}>{fmt(w.openingBal)}</td>
                  <td className="cf-td"><span className={w.closingBal >= 0 ? 'cf-pos' : 'cf-neg'}>{fmt(w.closingBal)}</span></td>
                  <td className="cf-td"><StatusBadge s={w.status} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#1E293B' }}>
                <td style={{ padding: '9px 12px', color: '#fff', fontWeight: 800, fontSize: 12 }}>TOTAL</td>
                <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: '#86EFAC', fontWeight: 800 }}>{fmt(forecast.summary.totalInflows)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: '#FCA5A5', fontWeight: 800 }}>{fmt(forecast.weeks.reduce((s, w) => s + w.apPayments, 0))}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: '#FCA5A5', fontWeight: 800 }}>{fmt(forecast.weeks.reduce((s, w) => s + w.payroll, 0))}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: '#94A3B8', fontWeight: 700 }}>{fmt(forecast.weeks.reduce((s, w) => s + w.pettyCash, 0))}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right' as const, color: forecast.summary.netCashFlow >= 0 ? '#86EFAC' : '#FCA5A5', fontWeight: 900 }}>
                  {forecast.summary.netCashFlow >= 0 ? '+' : ''}{fmt(forecast.summary.netCashFlow)}
                </td>
                <td colSpan={3} style={{ padding: '9px 12px', color: '#94A3B8', fontSize: 11 }}>
                  {forecast.summary.deficitWeeks} deficit weeks in forecast period
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ padding: '10px 16px', borderTop: '1px solid #F1F5F9', fontSize: 10, color: '#94A3B8' }}>
          AR from outstanding invoices -- AP estimated PO date + 30 days -- Payroll on 25th-31st of each month -- Petty cash: 3-month rolling average
        </div>
      </div>
    </div>
  );
};

export default CashFlowDashboard;
