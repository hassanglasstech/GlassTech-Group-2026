/**
 * BudgetMaster.tsx — Financial Layer Phase 1
 * Enter annual budgets per cost center per GL account
 * Compare vs actual GL spend month by month
 */

import React, { useState, useEffect } from 'react';
import { Company } from '@/modules/shared/types';
import { FinanceService } from '../services/financeService';
import { BudgetService } from '../services/budgetService';
import { CostCenter } from '../types/finance';
import { Save, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface BudgetEntry {
  id: string;
  company: Company;
  year: number;
  costCenterId: string;
  glAccountId: string;
  glAccountCode: string;
  glAccountName: string;
  jan: number; feb: number; mar: number; apr: number;
  may: number; jun: number; jul: number; aug: number;
  sep: number; oct: number; nov: number; dec: number;
  annual: number;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const;
const STORAGE_KEY = 'gtk_erp_budget_master';

const loadBudgets = (): BudgetEntry[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};
const saveBudgets = (d: BudgetEntry[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
};

const fmt = (n: number) => n > 0 ? n.toLocaleString('en-PK') : '';

const BudgetMaster: React.FC<{ company: Company }> = ({ company }) => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [budgets, setBudgets] = useState<BudgetEntry[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedCC, setSelectedCC] = useState('');
  const [activeTab, setActiveTab] = useState<'entry' | 'variance'>('entry');
  const [variance, setVariance] = useState<any[]>([]);

  useEffect(() => {
    setCostCenters(FinanceService.getCostCenters().filter(c => c.company === company));
    setAccounts(FinanceService.getAccounts().filter((a: any) => a.company === company));
    setBudgets(loadBudgets().filter(b => b.company === company && b.year === year));
  }, [company, year]);

  const ccBudgets = budgets.filter(b => b.costCenterId === selectedCC);

  const addRow = () => {
    if (!selectedCC) return toast.error('Select a cost center first');
    const newRow: BudgetEntry = {
      id: `BUD-${Date.now()}`, company, year,
      costCenterId: selectedCC, glAccountId: '', glAccountCode: '', glAccountName: '',
      jan:0,feb:0,mar:0,apr:0,may:0,jun:0,jul:0,aug:0,sep:0,oct:0,nov:0,dec:0, annual:0,
    };
    const updated = [...budgets, newRow];
    setBudgets(updated);
    saveBudgets([...loadBudgets().filter(b => !(b.company===company && b.year===year)), ...updated]);
  };

  const updateRow = (id: string, field: string, value: any) => {
    const updated = budgets.map(b => {
      if (b.id !== id) return b;
      const row = { ...b, [field]: value };
      if (field === 'glAccountId') {
        const acc = accounts.find((a: any) => a.id === value);
        row.glAccountCode = acc?.code || '';
        row.glAccountName = acc?.name || '';
      }
      // Recalc annual
      row.annual = MONTH_KEYS.reduce((s, k) => s + (Number(row[k]) || 0), 0);
      return row;
    });
    setBudgets(updated);
    saveBudgets([...loadBudgets().filter(b => !(b.company===company && b.year===year)), ...updated]);
  };

  const deleteRow = (id: string) => {
    const updated = budgets.filter(b => b.id !== id);
    setBudgets(updated);
    saveBudgets([...loadBudgets().filter(b => !(b.company===company && b.year===year)), ...updated]);
  };

  const spreadAnnual = (id: string, annual: number) => {
    const monthly = Math.round(annual / 12);
    const row = budgets.find(b => b.id === id);
    if (!row) return;
    const updated = { ...row, annual };
    MONTH_KEYS.forEach(k => { (updated as any)[k] = monthly; });
    updated.annual = MONTH_KEYS.reduce((s, k) => s + (updated as any)[k], 0);
    const all = budgets.map(b => b.id === id ? updated : b);
    setBudgets(all);
    saveBudgets([...loadBudgets().filter(b => !(b.company===company && b.year===year)), ...all]);
  };

  const loadVariance = () => {
    const mon = new Date().toISOString().slice(0, 7);
    const lines = BudgetService.getBudgetVsActual(company, mon);
    setVariance(lines);
    setActiveTab('variance');
  };

  const styles = `
    .bm-tab { padding:9px 18px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#64748b; background:none; border:none; border-bottom:3px solid transparent; cursor:pointer; font-family:inherit; }
    .bm-tab:hover { color:#1e293b; }
    .bm-tab.active { color:#1B3A6B; border-bottom-color:#2563EB; }
    .bm-inp { border:1px solid #e2e8f0; border-radius:6px; padding:4px 8px; font-size:12px; font-family:inherit; width:100%; background:#fff; }
    .bm-inp:focus { outline:none; border-color:#2563EB; }
    .bm-num { border:1px solid #e2e8f0; border-radius:6px; padding:4px 6px; font-size:11px; font-family:inherit; width:72px; text-align:right; background:#fff; }
    .bm-num:focus { outline:none; border-color:#2563EB; }
    .bm-th { padding:8px 10px; font-size:10px; font-weight:800; text-transform:uppercase; color:#fff; background:#1B3A6B; text-align:right; white-space:nowrap; }
    .bm-th:first-child { text-align:left; }
    .bm-td { padding:6px 10px; font-size:11px; color:#334155; border-bottom:1px solid #f1f5f9; }
  `;

  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif' }}>
      <style>{styles}</style>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1B3A6B, #2563EB)', color: '#fff', padding: '16px 20px', borderRadius: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, textTransform: 'uppercase' as const }}>Budget Master</div>
          <div style={{ fontSize: 11, color: '#BFD7FF', marginTop: 2 }}>{company} -- Annual Budget Entry</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.1)', color: '#fff', fontSize: 12, fontWeight: 700 }}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={loadVariance}
            style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} /> Variance
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: 16 }}>
        <button className={'bm-tab' + (activeTab === 'entry' ? ' active' : '')} onClick={() => setActiveTab('entry')}>Budget Entry</button>
        <button className={'bm-tab' + (activeTab === 'variance' ? ' active' : '')} onClick={loadVariance}>Budget vs Actual</button>
      </nav>

      {/* BUDGET ENTRY */}
      {activeTab === 'entry' && (
        <div>
          {/* Cost Center Selector */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' as const, marginBottom: 4 }}>Cost Center</div>
              <select value={selectedCC} onChange={e => setSelectedCC(e.target.value)} className="bm-inp">
                <option value="">-- Select Cost Center --</option>
                {costCenters.map(cc => (
                  <option key={cc.id} value={cc.id}>[{cc.code}] {cc.name}</option>
                ))}
              </select>
            </div>
            <button onClick={addRow}
              style={{ marginTop: 20, background: '#1B3A6B', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} /> Add Line
            </button>
          </div>

          {!selectedCC ? (
            <div style={{ padding: 40, textAlign: 'center' as const, color: '#94A3B8', fontSize: 13 }}>
              Select a cost center to enter budgets
            </div>
          ) : ccBudgets.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' as const, color: '#94A3B8', fontSize: 13 }}>
              No budget lines yet. Click "Add Line" to start.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const, minWidth: 1200 }}>
                <thead>
                  <tr>
                    <th className="bm-th" style={{ textAlign: 'left' as const, minWidth: 180 }}>GL Account</th>
                    {MONTHS.map(m => <th key={m} className="bm-th">{m}</th>)}
                    <th className="bm-th">Annual</th>
                    <th className="bm-th" style={{ width: 60 }}>Spread</th>
                    <th className="bm-th" style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {ccBudgets.map(row => (
                    <tr key={row.id}>
                      <td className="bm-td">
                        <select value={row.glAccountId} onChange={e => updateRow(row.id, 'glAccountId', e.target.value)} className="bm-inp" style={{ width: 200 }}>
                          <option value="">-- GL Account --</option>
                          {accounts.filter((a: any) => a.type === 'P&L' || (a.code || '').startsWith('5') || (a.code || '').startsWith('6')).map((a: any) => (
                            <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>
                          ))}
                        </select>
                      </td>
                      {MONTH_KEYS.map(k => (
                        <td key={k} className="bm-td" style={{ padding: '4px 4px' }}>
                          <input type="number" min="0" className="bm-num"
                            value={(row as any)[k] || ''}
                            onChange={e => updateRow(row.id, k, Number(e.target.value))} />
                        </td>
                      ))}
                      <td className="bm-td" style={{ textAlign: 'right' as const, fontWeight: 800, color: '#1B3A6B' }}>
                        {row.annual.toLocaleString()}
                      </td>
                      <td className="bm-td">
                        <input type="number" min="0" placeholder="Annual"
                          className="bm-num"
                          onBlur={e => e.target.value && spreadAnnual(row.id, Number(e.target.value))}
                          title="Enter annual total to auto-spread equally" />
                      </td>
                      <td className="bm-td">
                        <button onClick={() => deleteRow(row.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4 }}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#1E293B' }}>
                    <td style={{ padding: '8px 10px', color: '#fff', fontWeight: 800, fontSize: 12 }}>TOTAL</td>
                    {MONTH_KEYS.map(k => (
                      <td key={k} style={{ padding: '8px 6px', textAlign: 'right' as const, color: '#93C5FD', fontWeight: 700, fontSize: 11 }}>
                        {ccBudgets.reduce((s, b) => s + ((b as any)[k] || 0), 0).toLocaleString()}
                      </td>
                    ))}
                    <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: '#fff', fontWeight: 900, fontSize: 12 }}>
                      {ccBudgets.reduce((s, b) => s + b.annual, 0).toLocaleString()}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 8 }}>
                Tip: Enter annual total in "Spread" column to auto-split equally across 12 months
              </div>
            </div>
          )}
        </div>
      )}

      {/* VARIANCE */}
      {activeTab === 'variance' && (
        <div style={{ overflowX: 'auto' }}>
          {variance.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' as const, color: '#94A3B8', fontSize: 13 }}>
              No cost centers with budgets set. Enter budgets in "Budget Entry" tab first.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr>
                  {['Cost Center', 'Monthly Budget', 'Actual Spend', 'Variance', 'Used', 'Status'].map(h => (
                    <th key={h} className="bm-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {variance.map(line => (
                  <tr key={line.costCenterId}>
                    <td className="bm-td" style={{ fontWeight: 700 }}>{line.costCenterName}<div style={{ fontSize: 10, color: '#94A3B8' }}>{line.costCenterCode}</div></td>
                    <td className="bm-td" style={{ textAlign: 'right' as const }}>{line.budgetMonthly > 0 ? line.budgetMonthly.toLocaleString() : 'Not set'}</td>
                    <td className="bm-td" style={{ textAlign: 'right' as const, fontWeight: 700, color: line.status === 'OVER' ? '#DC2626' : '#1E293B' }}>{line.actualSpend.toLocaleString()}</td>
                    <td className="bm-td" style={{ textAlign: 'right' as const, fontWeight: 700, color: line.variance >= 0 ? '#16A34A' : '#DC2626' }}>
                      {line.variance >= 0 ? '+' : ''}{line.variance.toLocaleString()}
                    </td>
                    <td className="bm-td">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, background: '#F1F5F9', borderRadius: 4, height: 6 }}>
                          <div style={{ width: Math.min(100, line.utilisedPct) + '%', height: '100%', background: line.status === 'OVER' ? '#DC2626' : line.status === 'WARNING' ? '#D97706' : '#16A34A', borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', minWidth: 32 }}>{line.utilisedPct}%</span>
                      </div>
                    </td>
                    <td className="bm-td">
                      <span style={{
                        background: line.status === 'OK' ? '#DCFCE7' : line.status === 'WARNING' ? '#FEF3C7' : '#FEE2E2',
                        color: line.status === 'OK' ? '#16A34A' : line.status === 'WARNING' ? '#D97706' : '#DC2626',
                        padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800,
                      }}>{line.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default BudgetMaster;
