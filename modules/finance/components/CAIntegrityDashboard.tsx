/**
 * CAIntegrityDashboard.tsx — Phase 2
 * Chartered Accountant accounting integrity view:
 *   - Unbilled Revenue (delivered but not invoiced)
 *   - 3-Way Match Status (PO vs GRN vs Invoice)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Company } from '@/modules/shared/types';
import { CAIntegrityService, UnbilledItem, ThreeWayMatchResult } from '../services/caIntegrityService';
import { ECLService, ECLSummary, ICOReconciliation } from '../services/eclService';
import { AlertTriangle, CheckCircle2, FileText, RefreshCw, AlertCircle } from 'lucide-react';

const fmt  = (n: number) => Math.abs(Math.round(n)).toLocaleString('en-PK');
const fmtPKR = (n: number) => `PKR ${fmt(n)}`;

const MatchBadge: React.FC<{ status: ThreeWayMatchResult['matchStatus'] }> = ({ status }) => {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    MATCHED:      { bg: '#DCFCE7', color: '#16A34A', label: '✓ Matched' },
    OVER_BILLED:  { bg: '#FEE2E2', color: '#DC2626', label: '✗ Over-Billed' },
    UNDER_BILLED: { bg: '#FEF3C7', color: '#D97706', label: '~ Under-Billed' },
    NO_INVOICE:   { bg: '#FEF3C7', color: '#D97706', label: '⚠ No Invoice' },
    NO_GRN:       { bg: '#F1F5F9', color: '#64748B', label: '○ No GRN' },
  };
  const c = cfg[status] || cfg.NO_GRN;
  return (
    <span style={{ background: c.bg, color: c.color, padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800, letterSpacing: '.05em', whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  );
};

const UrgencyBadge: React.FC<{ urgency: UnbilledItem['urgency'] }> = ({ urgency }) => {
  const cfg = {
    HIGH:   { bg: '#FEE2E2', color: '#DC2626' },
    MEDIUM: { bg: '#FEF3C7', color: '#D97706' },
    LOW:    { bg: '#DCFCE7', color: '#16A34A' },
  }[urgency];
  return (
    <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800, letterSpacing: '.05em' }}>
      {urgency}
    </span>
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
  .ca-tab { display:flex; align-items:center; gap:6px; padding:10px 18px; font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#64748b; background:none; border:none; border-bottom:3px solid transparent; cursor:pointer; white-space:nowrap; font-family:inherit; transition:all .15s; }
  .ca-tab:hover { color:#1e293b; background:#f8fafc; }
  .ca-tab.active { color:#dc2626; border-bottom-color:#dc2626; background:#fff7f7; }
  .ca-th { padding:10px 14px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#fff; background:#1B3A6B; text-align:left; white-space:nowrap; }
  .ca-td { padding:10px 14px; font-size:12px; color:#334155; border-bottom:1px solid #f1f5f9; }
  .ca-tr:hover td { background:#FFFBEB; }
`;

const CAIntegrityDashboard: React.FC<{ company: Company }> = ({ company }) => {
  const [activeTab, setActiveTab] = useState<'unbilled' | 'matching' | 'ecl' | 'ico'>('unbilled');
  const [unbilled, setUnbilled] = useState<UnbilledItem[]>([]);
  const [matching, setMatching] = useState<ThreeWayMatchResult[]>([]);
  const [ecl, setECL] = useState<ECLSummary | null>(null);
  const [ico, setICO] = useState<ICOReconciliation | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    try {
      setUnbilled(CAIntegrityService.getUnbilledRevenue(company));
      setMatching(CAIntegrityService.getThreeWayMatchStatus(company));
      setECL(ECLService.getECLProvision(company));
      setICO(ECLService.getICOReconciliation());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [company]);

  const summary = useMemo(() => CAIntegrityService.getSummary(company), [company, unbilled, matching]);

  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif' }}>
      <style>{styles}</style>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #7F1D1D 0%, #DC2626 100%)', color: '#fff', padding: '20px 24px', borderRadius: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-.02em', textTransform: 'uppercase' }}>CA Integrity Dashboard</div>
          <div style={{ fontSize: 11, color: '#FECACA', marginTop: 4, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>{company} — Accounting Integrity Checks</div>
        </div>
        <button onClick={load} style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="Unbilled Orders" value={`${summary.unbilledCount}`} color={summary.unbilledCount > 0 ? '#DC2626' : '#16A34A'} sub={`${summary.unbilledHighCount} high urgency (>30 days)`} />
        <KPI label="Unbilled Value" value={fmtPKR(summary.totalUnbilledValue)} color="#D97706" sub="Estimated — needs invoicing" />
        <KPI label="POs Matched" value={`${summary.matchedPOs}`} color="#16A34A" sub="PO = GRN = Invoice" />
        <KPI label="Match Issues" value={`${summary.overBilledPOs + summary.noInvoicePOs}`} color={summary.overBilledPOs > 0 ? '#DC2626' : '#D97706'} sub={`${summary.overBilledPOs} over-billed, ${summary.noInvoicePOs} no invoice`} />
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <nav style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', padding: '0 16px', background: '#FAFAFA' }}>
          <button onClick={() => setActiveTab('unbilled')} className={`ca-tab${activeTab === 'unbilled' ? ' active' : ''}`}>
            Unbilled Revenue {unbilled.length > 0 && <span style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 900 }}>{unbilled.length}</span>}
          </button>
          <button onClick={() => setActiveTab('matching')} className={`ca-tab${activeTab === 'matching' ? ' active' : ''}`}>
            3-Way Matching {(summary.overBilledPOs + summary.noInvoicePOs) > 0 && <span style={{ background: '#FEF3C7', color: '#D97706', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 900 }}>{summary.overBilledPOs + summary.noInvoicePOs}</span>}
          </button>
          <button onClick={() => setActiveTab('ecl')} className={`ca-tab${activeTab === 'ecl' ? ' active' : ''}`}>ECL Provision</button>
          <button onClick={() => setActiveTab('ico')} className={`ca-tab${activeTab === 'ico' ? ' active' : ''}`}>ICO Reconciliation</button>
        </nav>

        {/* UNBILLED REVENUE */}
        {activeTab === 'unbilled' && (
          unbilled.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <CheckCircle2 size={32} color="#16A34A" style={{ margin: '0 auto 12px' }} />
              <div style={{ color: '#16A34A', fontWeight: 800, fontSize: 14 }}>All delivered orders are invoiced</div>
              <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>No unbilled revenue detected</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Order No', 'Client', 'Delivery Date', 'Est. Value', 'Days Unbilled', 'Status', 'Urgency'].map(h => (
                    <th key={h} className="ca-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unbilled.map(item => (
                  <tr key={item.orderId} className="ca-tr">
                    <td className="ca-td" style={{ fontWeight: 700, color: '#2563EB' }}>{item.orderNo}</td>
                    <td className="ca-td">{item.clientName}</td>
                    <td className="ca-td" style={{ color: '#64748B' }}>{item.deliveryDate || '—'}</td>
                    <td className="ca-td" style={{ textAlign: 'right', fontWeight: 700 }}>{item.estimatedValue > 0 ? fmtPKR(item.estimatedValue) : '—'}</td>
                    <td className="ca-td" style={{ textAlign: 'center', fontWeight: 800, color: item.daysSinceDelivery > 30 ? '#DC2626' : item.daysSinceDelivery > 14 ? '#D97706' : '#64748B' }}>
                      {item.daysSinceDelivery > 0 ? `${item.daysSinceDelivery}d` : '—'}
                    </td>
                    <td className="ca-td">{item.status}</td>
                    <td className="ca-td"><UrgencyBadge urgency={item.urgency} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#1E293B' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', color: '#fff', fontWeight: 800, fontSize: 12 }}>TOTAL UNBILLED</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#FCA5A5', fontWeight: 800, fontSize: 12 }}>{fmtPKR(summary.totalUnbilledValue)}</td>
                  <td colSpan={3} style={{ padding: '10px 14px', color: '#94A3B8', fontSize: 11 }}>Raise invoices for all HIGH urgency items immediately</td>
                </tr>
              </tfoot>
            </table>
          )
        )}

        {/* 3-WAY MATCHING */}
        {activeTab === 'matching' && (
          matching.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <CheckCircle2 size={32} color="#16A34A" style={{ margin: '0 auto 12px' }} />
              <div style={{ color: '#16A34A', fontWeight: 800, fontSize: 14 }}>No approved POs found for matching</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['PO ID', 'Vendor', 'PO Date', 'PO Amount', 'Invoice Amount', 'Variance', 'Status'].map(h => (
                    <th key={h} className="ca-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matching.map(m => (
                  <tr key={m.poId} className="ca-tr">
                    <td className="ca-td" style={{ fontWeight: 700, color: '#2563EB' }}>{m.poId}</td>
                    <td className="ca-td">{m.vendorName}</td>
                    <td className="ca-td" style={{ color: '#64748B' }}>{m.poDate}</td>
                    <td className="ca-td" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtPKR(m.poAmount)}</td>
                    <td className="ca-td" style={{ textAlign: 'right', fontWeight: 600, color: m.matchStatus === 'NO_INVOICE' ? '#94A3B8' : '#1E293B' }}>
                      {m.invoiceAmount > 0 ? fmtPKR(m.invoiceAmount) : '—'}
                    </td>
                    <td className="ca-td" style={{ textAlign: 'right', fontWeight: 700, color: Math.abs(m.variance) < 1 ? '#16A34A' : m.variance > 0 ? '#DC2626' : '#D97706' }}>
                      {m.invoiceAmount > 0 ? `${m.variance > 0 ? '+' : ''}${fmt(m.variance)} (${m.variancePct}%)` : '—'}
                    </td>
                    <td className="ca-td"><MatchBadge status={m.matchStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

        {/* ECL PROVISION */}
        {activeTab === 'ecl' && ecl && (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { l: 'Total AR',       v: 'PKR ' + ecl.totalAR.toLocaleString(),        c: '#1B3A6B' },
                { l: 'Overdue AR',     v: 'PKR ' + ecl.overdueAR.toLocaleString(),      c: '#D97706' },
                { l: 'ECL Provision',  v: 'PKR ' + ecl.totalProvision.toLocaleString(), c: '#DC2626' },
                { l: 'Net AR',         v: 'PKR ' + ecl.netAR.toLocaleString(),           c: '#16A34A' },
              ].map(k => (
                <div key={k.l} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>{k.l}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: k.c, marginTop: 4 }}>{k.v}</div>
                </div>
              ))}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr>
                  {['Aging Bucket', 'Gross AR (PKR)', 'Loss Rate', 'ECL Provision (PKR)', 'Clients'].map(h => (
                    <th key={h} className="ca-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ecl.buckets.map(b => (
                  <tr key={b.bucket} className="ca-tr">
                    <td className="ca-td" style={{ fontWeight: 700 }}>{b.daysRange}</td>
                    <td className="ca-td" style={{ textAlign: 'right' as const, fontWeight: 700 }}>{b.grossAmount.toLocaleString()}</td>
                    <td className="ca-td" style={{ textAlign: 'right' as const, color: b.lossRate > 10 ? '#DC2626' : '#D97706', fontWeight: 700 }}>{b.lossRate}%</td>
                    <td className="ca-td" style={{ textAlign: 'right' as const, fontWeight: 800, color: '#DC2626' }}>{b.provision.toLocaleString()}</td>
                    <td className="ca-td" style={{ textAlign: 'center' as const, color: '#64748B' }}>{b.clientCount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#1E293B' }}>
                  <td colSpan={2} style={{ padding: '10px 14px', color: '#fff', fontWeight: 800, fontSize: 12 }}>TOTAL PROVISION REQUIRED</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' as const, color: '#94A3B8', fontSize: 12 }}>{ecl.effectiveLossRate + '% effective'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' as const, color: '#FCA5A5', fontWeight: 800, fontSize: 12 }}>{ecl.totalProvision.toLocaleString()}</td>
                  <td style={{ padding: '10px 14px', color: '#94A3B8', fontSize: 11 }}>Dr Bad Debt -- Cr Allowance 11231</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ICO RECONCILIATION */}
        {activeTab === 'ico' && ico && (
          <div style={{ padding: 24 }}>
            {ico.totalMismatch > 0 && (
              <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#D97706' }}>
                  {'! Total ICO Mismatch: PKR ' + ico.totalMismatch.toLocaleString()}
                </span>
              </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, marginBottom: 20 }}>
              <thead>
                <tr>
                  {['From', 'To', 'Receivable', 'Payable', 'Net Diff', 'Status'].map(h => (
                    <th key={h} className="ca-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ico.balances.map((b, i) => (
                  <tr key={i} className="ca-tr">
                    <td className="ca-td" style={{ fontWeight: 700 }}>{b.fromCompany}</td>
                    <td className="ca-td" style={{ fontWeight: 700 }}>{b.toCompany}</td>
                    <td className="ca-td" style={{ textAlign: 'right' as const }}>{b.receivable.toLocaleString()}</td>
                    <td className="ca-td" style={{ textAlign: 'right' as const }}>{b.payable.toLocaleString()}</td>
                    <td className="ca-td" style={{ textAlign: 'right' as const, fontWeight: 800, color: b.netDiff > 0 ? '#DC2626' : '#16A34A' }}>
                      {b.netDiff > 0 ? b.netDiff.toLocaleString() : 'OK 0'}
                    </td>
                    <td className="ca-td">
                      <span style={{
                        background: b.status === 'MATCHED' ? '#DCFCE7' : b.status === 'MISMATCH' ? '#FEE2E2' : '#FEF3C7',
                        color: b.status === 'MATCHED' ? '#16A34A' : b.status === 'MISMATCH' ? '#DC2626' : '#D97706',
                        padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800,
                      }}>
                        {b.status}
                      </span>
                      {b.missingEntry && <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{b.missingEntry}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ico.eliminationEntries.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1B3A6B', marginBottom: 8, textTransform: 'uppercase' as const }}>
                  Suggested Elimination Entries
                </div>
                {ico.eliminationEntries.map((e, i) => (
                  <div key={i} style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', marginBottom: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 800, marginBottom: 6, color: '#1E40AF' }}>{e.description}</div>
                    <div style={{ color: '#16A34A' }}>{'Dr [' + e.debit.company + '] ' + e.debit.account + ' -- PKR ' + e.debit.amount.toLocaleString()}</div>
                    <div style={{ color: '#DC2626' }}>{'Cr [' + e.credit.company + '] ' + e.credit.account + ' -- PKR ' + e.credit.amount.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
    </div>
  );
};

export default CAIntegrityDashboard;
