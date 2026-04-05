/**
 * OverheadDashboard.tsx -- Financial Layer Phase 3
 * Overhead Pool setup and allocation view
 */

import React, { useState, useEffect } from 'react';
import { Company } from '@/modules/shared/types';
import { FinanceService } from '../services/financeService';
import {
  OverheadService, OverheadPool, OverheadAllocationResult,
  AllocationBasis, loadPools, savePools,
} from '../services/overheadService';
import { Plus, Trash2, Play, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (n: number) => Math.round(n).toLocaleString('en-PK');
const fmtPct = (n: number) => n.toFixed(1) + '%';
const curMonth = () => new Date().toISOString().slice(0, 7);

const styles = `
  .oh-th { padding:9px 12px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:#fff; background:#7C3AED; text-align:left; white-space:nowrap; }
  .oh-td { padding:8px 12px; font-size:12px; color:#334155; border-bottom:1px solid #f1f5f9; }
  .oh-tr:hover td { background:#FAF5FF; }
  .oh-tab { padding:9px 18px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#64748b; background:none; border:none; border-bottom:3px solid transparent; cursor:pointer; font-family:inherit; }
  .oh-tab.active { color:#7C3AED; border-bottom-color:#7C3AED; }
  .oh-inp { border:1px solid #e2e8f0; border-radius:6px; padding:5px 10px; font-size:12px; font-family:inherit; background:#fff; }
  .oh-inp:focus { outline:none; border-color:#7C3AED; }
`;

const KPI: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = '#7C3AED' }) => (
  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px' }}>
    <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
  </div>
);

const OverheadDashboard: React.FC<{ company: Company }> = ({ company }) => {
  const [activeTab, setActiveTab]   = useState<'pools' | 'allocation'>('pools');
  const [pools, setPools]           = useState<OverheadPool[]>([]);
  const [results, setResults]       = useState<OverheadAllocationResult[]>([]);
  const [month, setMonth]           = useState(curMonth());
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState<Partial<OverheadPool>>({
    basis: 'headcount', active: true,
  });

  useEffect(() => {
    setCostCenters(FinanceService.getCostCenters().filter((c: any) => c.company === company));
    setPools(OverheadService.getPools(company));
  }, [company]);

  const runAllocation = () => {
    const res = OverheadService.allocateAll(company, month);
    setResults(res);
    setActiveTab('allocation');
    toast.success('Allocation calculated for ' + month);
  };

  const savePool = () => {
    if (!form.name || !form.sourceCCId) return toast.error('Name and source cost center required');
    const pool: OverheadPool = {
      id:         form.id || ('POOL-' + Date.now()),
      company,
      name:       form.name!,
      sourceCCId: form.sourceCCId!,
      basis:      form.basis as AllocationBasis || 'headcount',
      active:     form.active !== false,
    };
    OverheadService.savePool(pool);
    setPools(OverheadService.getPools(company));
    setShowForm(false);
    setForm({ basis: 'headcount', active: true });
    toast.success('Pool saved');
  };

  const deletePool = (id: string) => {
    OverheadService.deletePool(id);
    setPools(OverheadService.getPools(company));
  };

  const summary = OverheadService.getSummary(company, month);
  const auxCCs  = costCenters.filter((c: any) => c.category === 'H');
  const prodCCs = costCenters.filter((c: any) => c.category === 'F');

  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif' }}>
      <style>{styles}</style>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #4C1D95, #7C3AED)', color: '#fff', padding: '18px 22px', borderRadius: 14, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, textTransform: 'uppercase' as const }}>Overhead Pool</div>
          <div style={{ fontSize: 11, color: '#DDD6FE', marginTop: 3 }}>{company} -- Allocate indirect costs to production</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.1)', color: '#fff', fontSize: 12, fontWeight: 700 }} />
          <button onClick={runAllocation}
            style={{ background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.4)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Play size={12} /> Run Allocation
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        <KPI label="Active Pools" value={String(pools.filter(p => p.active).length)} />
        <KPI label="Total Overhead" value={'PKR ' + fmt(summary.totalPooled)} color="#DC2626" />
        <KPI label="Allocated" value={'PKR ' + fmt(summary.totalAllocated)} color="#16A34A" />
        <KPI label="Unallocated" value={'PKR ' + fmt(summary.unallocated)} color={summary.unallocated > 0 ? '#D97706' : '#16A34A'} />
      </div>

      {/* Tabs */}
      <nav style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: 16 }}>
        <button className={'oh-tab' + (activeTab === 'pools' ? ' active' : '')} onClick={() => setActiveTab('pools')}>Pool Setup</button>
        <button className={'oh-tab' + (activeTab === 'allocation' ? ' active' : '')} onClick={() => { runAllocation(); }}>Allocation Result</button>
      </nav>

      {/* POOL SETUP */}
      {activeTab === 'pools' && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <button onClick={() => setShowForm(!showForm)}
              style={{ background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} /> Add Pool
            </button>
          </div>

          {showForm && (
            <div style={{ background: '#FAF5FF', border: '1px solid #DDD6FE', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase' as const, marginBottom: 12 }}>New Overhead Pool</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, marginBottom: 4 }}>Pool Name</div>
                  <input className="oh-inp" style={{ width: '100%' }} placeholder="e.g. Factory Overhead"
                    value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, marginBottom: 4 }}>Source (H category CC)</div>
                  <select className="oh-inp" style={{ width: '100%' }} value={form.sourceCCId || ''} onChange={e => setForm({ ...form, sourceCCId: e.target.value })}>
                    <option value="">-- Select --</option>
                    {auxCCs.length > 0 ? auxCCs.map((cc: any) => (
                      <option key={cc.id} value={cc.id}>[{cc.code}] {cc.name}</option>
                    )) : costCenters.map((cc: any) => (
                      <option key={cc.id} value={cc.id}>[{cc.code}] {cc.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, marginBottom: 4 }}>Allocation Basis</div>
                  <select className="oh-inp" style={{ width: '100%' }} value={form.basis || 'headcount'} onChange={e => setForm({ ...form, basis: e.target.value as AllocationBasis })}>
                    <option value="headcount">Headcount</option>
                    <option value="sqft">Sqft Produced</option>
                    <option value="equal">Equal Split</option>
                    <option value="manual">Manual %</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <button onClick={savePool}
                    style={{ background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Save size={13} /> Save
                  </button>
                  <button onClick={() => setShowForm(false)}
                    style={{ background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {pools.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' as const, color: '#94A3B8', fontSize: 13 }}>
              No overhead pools defined. Click "Add Pool" to create one.
              <div style={{ marginTop: 8, fontSize: 11 }}>
                Tip: First create H-category cost centers in Finance -- Configuration -- Cost Centers
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr>
                  {['Pool Name', 'Source CC', 'Basis', 'Status', ''].map(h => (
                    <th key={h} className="oh-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pools.map(pool => {
                  const cc = costCenters.find((c: any) => c.id === pool.sourceCCId);
                  return (
                    <tr key={pool.id} className="oh-tr">
                      <td className="oh-td" style={{ fontWeight: 700 }}>{pool.name}</td>
                      <td className="oh-td">{cc ? '[' + cc.code + '] ' + cc.name : pool.sourceCCId}</td>
                      <td className="oh-td">
                        <span style={{ background: '#EDE9FE', color: '#7C3AED', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 800 }}>
                          {pool.basis.toUpperCase()}
                        </span>
                      </td>
                      <td className="oh-td">
                        <span style={{
                          background: pool.active ? '#DCFCE7' : '#F1F5F9',
                          color: pool.active ? '#16A34A' : '#94A3B8',
                          padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 800,
                        }}>
                          {pool.active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="oh-td">
                        <button onClick={() => deletePool(pool.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4 }}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ALLOCATION RESULT */}
      {activeTab === 'allocation' && (
        <div>
          {results.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' as const, color: '#94A3B8', fontSize: 13 }}>
              Click "Run Allocation" to calculate overhead distribution for {month}
            </div>
          ) : (
            results.map((result, ri) => (
              <div key={ri} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ background: '#FAF5FF', borderBottom: '1px solid #EDE9FE', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#7C3AED', fontSize: 13 }}>{result.pool.name}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                      Total overhead: PKR {fmt(result.totalOverhead)} -- Basis: {result.pool.basis}
                    </div>
                  </div>
                  <span style={{ background: '#EDE9FE', color: '#7C3AED', padding: '4px 12px', borderRadius: 10, fontSize: 11, fontWeight: 800 }}>
                    {month}
                  </span>
                </div>

                {result.targets.length === 0 ? (
                  <div style={{ padding: 24, color: '#94A3B8', fontSize: 12, textAlign: 'center' as const }}>
                    No production cost centers found to allocate to.
                    Add F-category cost centers in Cost Center Master.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                    <thead>
                      <tr>
                        {['Production CC', 'Basis Value', 'Allocation %', 'Allocated Amount (PKR)', 'Journal Entry'].map(h => (
                          <th key={h} className="oh-th">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.targets.map(t => (
                        <tr key={t.costCenterId} className="oh-tr">
                          <td className="oh-td" style={{ fontWeight: 700 }}>{t.costCenterName}<div style={{ fontSize: 10, color: '#94A3B8' }}>{t.costCenterCode}</div></td>
                          <td className="oh-td" style={{ textAlign: 'right' as const }}>{t.basisValue}</td>
                          <td className="oh-td" style={{ textAlign: 'right' as const, fontWeight: 700, color: '#7C3AED' }}>{fmtPct(t.basisPct)}</td>
                          <td className="oh-td" style={{ textAlign: 'right' as const, fontWeight: 800 }}>{fmt(t.allocatedAmount)}</td>
                          <td className="oh-td" style={{ fontSize: 11, color: '#64748B' }}>
                            Dr {t.costCenterName} / Cr {result.pool.name}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#4C1D95' }}>
                        <td style={{ padding: '8px 12px', color: '#fff', fontWeight: 800, fontSize: 12 }}>TOTAL</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' as const, color: '#DDD6FE', fontWeight: 700 }}>{fmt(result.totalBasisValue)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' as const, color: '#DDD6FE', fontWeight: 800 }}>100%</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' as const, color: '#fff', fontWeight: 900, fontSize: 13 }}>PKR {fmt(result.targets.reduce((s, t) => s + t.allocatedAmount, 0))}</td>
                        <td style={{ padding: '8px 12px', color: '#A78BFA', fontSize: 11 }}>{result.targets.length} entries</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default OverheadDashboard;
