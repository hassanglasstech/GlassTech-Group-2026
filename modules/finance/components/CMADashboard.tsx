/**
 * CMADashboard.tsx — Phase 2
 * Cost & Management Accountant view:
 *   - Budget vs Actual per cost center
 *   - Petty Cash float status
 *   - Salary by department
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Company } from '@/modules/shared/types';
import { BudgetService, BudgetLine, PettyCashStatus, SalaryByCostCenter } from '../services/budgetService';
import { FinanceService } from '../services/financeService';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Wallet, Users, Target, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

const fmt = (n: number) => Math.abs(Math.round(n)).toLocaleString('en-PK');
const fmtPKR = (n: number) => `PKR ${fmt(n)}`;

// ── Status badge ───────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: 'OK' | 'WARNING' | 'OVER' }> = ({ status }) => {
  const cfg = {
    OK:      { bg: '#DCFCE7', color: '#16A34A', label: '✓ OK' },
    WARNING: { bg: '#FEF3C7', color: '#D97706', label: '⚠ WARNING' },
    OVER:    { bg: '#FEE2E2', color: '#DC2626', label: '✗ OVER' },
  }[status];
  return (
    <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>
      {cfg.label}
    </span>
  );
};

// ── Progress bar ───────────────────────────────────────────────────────────
const ProgressBar: React.FC<{ pct: number; status: 'OK' | 'WARNING' | 'OVER' }> = ({ pct, status }) => {
  const color = status === 'OVER' ? '#DC2626' : status === 'WARNING' ? '#D97706' : '#16A34A';
  const width = Math.min(100, pct);
  return (
    <div style={{ background: '#F1F5F9', borderRadius: 4, height: 6, width: '100%', overflow: 'hidden' }}>
      <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .3s' }} />
    </div>
  );
};

// ── KPI Card ──────────────────────────────────────────────────────────────
const KPICard: React.FC<{ label: string; value: string; sub?: string; color?: string; icon: React.ReactNode }> = ({ label, value, sub, color = '#1B3A6B', icon }) => (
  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
    <div style={{ background: '#EFF6FF', padding: 8, borderRadius: 8 }}>{icon}</div>
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
    </div>
  </div>
);

// ── Main ──────────────────────────────────────────────────────────────────
const CMADashboard: React.FC<{ company: Company }> = ({ company }) => {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [activeTab, setActiveTab] = useState<'budget' | 'petty' | 'salary'>('budget');
  const [loading, setLoading] = useState(false);
  const [budgetLines, setBudgetLines]  = useState<BudgetLine[]>([]);
  const [pettyCash, setPettyCash]      = useState<PettyCashStatus[]>([]);
  const [salary, setSalary]            = useState<SalaryByCostCenter[]>([]);

  const load = () => {
    setLoading(true);
    try {
      setBudgetLines(BudgetService.getBudgetVsActual(company, month));
      setPettyCash(BudgetService.getPettyCashStatus(company));
      setSalary(BudgetService.getSalaryByCostCenter(company, month));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [company, month]);

  const summary = useMemo(() => BudgetService.getSummary(company, month), [company, month, budgetLines]);

  const tabs = [
    { id: 'budget' as const, label: 'Budget vs Actual' },
    { id: 'petty'  as const, label: 'Petty Cash' },
    { id: 'salary' as const, label: 'Salary by Department' },
  ];

  const styles = `
    .cma-tab { display:flex; align-items:center; gap:6px; padding:10px 18px; font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#64748b; background:none; border:none; border-bottom:3px solid transparent; cursor:pointer; white-space:nowrap; font-family:inherit; transition:all .15s; }
    .cma-tab:hover { color:#1e293b; background:#f8fafc; }
    .cma-tab.active { color:#1e40af; border-bottom-color:#2563eb; background:#eff6ff; }
    .cma-th { padding:10px 14px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#fff; background:#1B3A6B; text-align:left; white-space:nowrap; }
    .cma-td { padding:10px 14px; font-size:12px; color:#334155; border-bottom:1px solid #f1f5f9; }
    .cma-tr:hover td { background:#F8FAFC; }
  `;

  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif' }}>
      <style>{styles}</style>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #2563EB 100%)', color: '#fff', padding: '20px 24px', borderRadius: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-.02em', textTransform: 'uppercase' }}>CMA Dashboard</div>
          <div style={{ fontSize: 11, color: '#BFD7FF', marginTop: 4, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>{company} — Cost & Management Accounting</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.1)', color: '#fff', fontSize: 12, fontWeight: 700 }} />
          <button onClick={load} style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPICard label="Total Budget" value={fmtPKR(summary.totalBudget)} sub={month} color="#1B3A6B" icon={<Target size={18} color="#2563EB" />} />
        <KPICard label="Total Actual" value={fmtPKR(summary.totalActual)} sub={`${Math.round(summary.totalActual / Math.max(summary.totalBudget, 1) * 100)}% of budget`} color={summary.totalActual > summary.totalBudget ? '#DC2626' : '#16A34A'} icon={<TrendingUp size={18} color="#16A34A" />} />
        <KPICard label="Over Budget" value={`${summary.overBudgetCount} centers`} sub={`${summary.warningCount} warnings`} color={summary.overBudgetCount > 0 ? '#DC2626' : '#16A34A'} icon={<AlertTriangle size={18} color={summary.overBudgetCount > 0 ? '#DC2626' : '#16A34A'} />} />
        <KPICard label="Petty Cash" value={`${summary.pettyCashOK} OK`} sub={`${summary.pettyCashWarning} need attention`} color={summary.pettyCashWarning > 0 ? '#D97706' : '#16A34A'} icon={<Wallet size={18} color="#D97706" />} />
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <nav style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', padding: '0 16px', background: '#FAFAFA' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`cma-tab${activeTab === t.id ? ' active' : ''}`}>
              {t.label}
            </button>
          ))}
        </nav>

        {/* BUDGET VS ACTUAL */}
        {activeTab === 'budget' && (
          <div style={{ overflowX: 'auto' }}>
            {budgetLines.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                No cost centers found. Add cost centers in Finance → Configuration → Cost Centers and set budgetMonthly.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Cost Center', 'Category', 'Budget (PKR)', 'Actual (PKR)', 'Variance', 'Utilised', 'Status'].map(h => (
                      <th key={h} className="cma-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {budgetLines.map(line => (
                    <tr key={line.costCenterId} className="cma-tr">
                      <td className="cma-td" style={{ fontWeight: 700 }}>{line.costCenterName}<div style={{ fontSize: 10, color: '#94A3B8' }}>{line.costCenterCode}</div></td>
                      <td className="cma-td"><span style={{ background: '#F1F5F9', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 800 }}>{line.category}</span></td>
                      <td className="cma-td" style={{ textAlign: 'right', fontWeight: 600 }}>{line.budgetMonthly > 0 ? fmt(line.budgetMonthly) : <span style={{ color: '#CBD5E1' }}>Not set</span>}</td>
                      <td className="cma-td" style={{ textAlign: 'right', fontWeight: 700, color: line.status === 'OVER' ? '#DC2626' : '#1E293B' }}>{fmt(line.actualSpend)}</td>
                      <td className="cma-td" style={{ textAlign: 'right', color: line.variance >= 0 ? '#16A34A' : '#DC2626', fontWeight: 700 }}>
                        {line.variance >= 0 ? '+' : ''}{fmt(line.variance)}
                      </td>
                      <td className="cma-td" style={{ minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ProgressBar pct={line.utilisedPct} status={line.status} />
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', minWidth: 32 }}>{line.utilisedPct}%</span>
                        </div>
                      </td>
                      <td className="cma-td"><StatusBadge status={line.status} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#1E293B' }}>
                    <td colSpan={2} style={{ padding: '10px 14px', color: '#fff', fontWeight: 800, fontSize: 12 }}>TOTAL</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#fff', fontWeight: 800, fontSize: 12 }}>{fmt(summary.totalBudget)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#fff', fontWeight: 800, fontSize: 12 }}>{fmt(summary.totalActual)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: summary.totalVariance >= 0 ? '#86EFAC' : '#FCA5A5', fontWeight: 800, fontSize: 12 }}>
                      {summary.totalVariance >= 0 ? '+' : ''}{fmt(summary.totalVariance)}
                    </td>
                    <td colSpan={2} style={{ padding: '10px 14px', color: '#94A3B8', fontSize: 11 }}>
                      {Math.round(summary.totalActual / Math.max(summary.totalBudget, 1) * 100)}% overall
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* PETTY CASH */}
        {activeTab === 'petty' && (
          <div style={{ overflowX: 'auto' }}>
            {pettyCash.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                No petty cash floats set. Edit cost centers and add pettyCashFloat + pettyCashMonthlyBudget.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Cost Center', 'Float Limit', 'This Month Spent', 'Monthly Budget', 'Monthly %', 'Status'].map(h => (
                      <th key={h} className="cma-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pettyCash.map(pc => (
                    <tr key={pc.costCenterId} className="cma-tr">
                      <td className="cma-td" style={{ fontWeight: 700 }}>{pc.costCenterName}</td>
                      <td className="cma-td" style={{ textAlign: 'right' }}>{fmtPKR(pc.float)}</td>
                      <td className="cma-td" style={{ textAlign: 'right', fontWeight: 700, color: pc.status === 'OVER' ? '#DC2626' : '#1E293B' }}>{fmtPKR(pc.spentThisMonth)}</td>
                      <td className="cma-td" style={{ textAlign: 'right' }}>{pc.monthlyBudget > 0 ? fmtPKR(pc.monthlyBudget) : <span style={{ color: '#CBD5E1' }}>Not set</span>}</td>
                      <td className="cma-td">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ProgressBar pct={pc.monthlyPct} status={pc.status} />
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', minWidth: 32 }}>{pc.monthlyPct}%</span>
                        </div>
                      </td>
                      <td className="cma-td"><StatusBadge status={pc.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* SALARY BY DEPT */}
        {activeTab === 'salary' && (
          <div style={{ overflowX: 'auto' }}>
            {salary.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No salary data found for {month}.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Department', 'Headcount', 'Gross Salary', 'Net Salary', 'Budget', 'Variance'].map(h => (
                      <th key={h} className="cma-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {salary.map(s => (
                    <tr key={s.department} className="cma-tr">
                      <td className="cma-td" style={{ fontWeight: 700 }}>{s.department}</td>
                      <td className="cma-td" style={{ textAlign: 'center', fontWeight: 700 }}>{s.headcount}</td>
                      <td className="cma-td" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtPKR(s.totalGross)}</td>
                      <td className="cma-td" style={{ textAlign: 'right', color: '#64748B' }}>{s.totalNet > 0 ? fmtPKR(s.totalNet) : '—'}</td>
                      <td className="cma-td" style={{ textAlign: 'right' }}>{s.budgetMonthly > 0 ? fmtPKR(s.budgetMonthly) : <span style={{ color: '#CBD5E1' }}>Not set</span>}</td>
                      <td className="cma-td" style={{ textAlign: 'right', fontWeight: 700, color: s.variance >= 0 ? '#16A34A' : '#DC2626' }}>
                        {s.budgetMonthly > 0 ? `${s.variance >= 0 ? '+' : ''}${fmt(s.variance)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#1E293B' }}>
                    <td style={{ padding: '10px 14px', color: '#fff', fontWeight: 800, fontSize: 12 }}>TOTAL</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: '#fff', fontWeight: 800 }}>{salary.reduce((s, r) => s + r.headcount, 0)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#fff', fontWeight: 800 }}>{fmtPKR(salary.reduce((s, r) => s + r.totalGross, 0))}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#94A3B8', fontWeight: 700 }}>{fmtPKR(salary.reduce((s, r) => s + r.totalNet, 0))}</td>
                    <td colSpan={2} style={{ padding: '10px 14px', color: '#94A3B8', fontSize: 11 }}>Budget vs Gross Salary</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CMADashboard;
