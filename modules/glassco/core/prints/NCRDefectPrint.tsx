/**
 * NCRDefectPrint.tsx — Phase 12
 * GlassCo branded NCR + Vendor Defect Report print
 */

import React from 'react';
import { VendorDefectReport } from '@/modules/procurement/types/inventory';

interface NCRData {
  id: string;
  company: string;
  stage: string;
  cause: string;
  description: string;
  reportedBy: string;
  reportedAt: string;
  glassType?: string;
  thickness?: string;
  sqftLost?: number;
  estimatedValue?: number;
  action?: string;
  vendorName?: string;
  purchaseRef?: string;
  notes?: string;
  status?: string;
}

interface Props {
  ncr?: NCRData;
  defectReport?: VendorDefectReport;
  mode: 'NCR' | 'DefectReport' | 'Both';
  onClose: () => void;
}

const PRINT_STYLES = `
  @media print {
    body > *:not(#ncr-print-root) { display: none !important; }
    #ncr-print-root { display: block !important; }
    @page { size: A4 portrait; margin: 10mm 12mm; }
    .no-print { display: none !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`;

const GlassCoHeader: React.FC<{ title: string; refNo: string; date: string }> = ({ title, refNo, date }) => (
  <>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', paddingTop: '4px' }}>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.05em', color: '#0f172a' }}>GlassTech</div>
        <div style={{ fontSize: '7px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#64748b' }}>Complete Architectural Glass Solutions</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.05em', color: '#0f172a' }}>GlassCo</div>
        <div style={{ fontSize: '7px', fontWeight: 700, color: '#1e293b' }}>Contact: 0303-2428128</div>
      </div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
      <span style={{ border: '1.5px solid #0f172a', borderRadius: '9999px', padding: '2px 30px', fontWeight: 900, letterSpacing: '0.1em', fontSize: '9px', textTransform: 'uppercase' }}>
        {title}
      </span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '8px' }}>
      <div>
        <div style={{ fontSize: '6px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>DOCUMENT NO:</div>
        <div style={{ fontSize: '14px', fontWeight: 900, color: '#DC2626', fontFamily: 'monospace' }}>{refNo}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>DATE: </span><span style={{ fontWeight: 900 }}>{date}</span></div>
        <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>PRINTED: </span><span style={{ fontWeight: 700 }}>{new Date().toLocaleDateString('en-PK')}</span></div>
      </div>
    </div>
  </>
);

// ── Field row helper ──────────────────────────────────────────────────────
const Field: React.FC<{ label: string; value?: string | number; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div style={{ display: 'flex', borderBottom: '0.5px solid #e2e8f0', padding: '4px 0' }}>
    <div style={{ width: '35%', fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8' }}>{label}</div>
    <div style={{ flex: 1, fontSize: '8px', fontWeight: highlight ? 900 : 700, color: highlight ? '#DC2626' : '#0f172a' }}>
      {value || '—'}
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════
const NCRDefectPrint: React.FC<Props> = ({ ncr, defectReport, mode, onClose }) => {
  const title = mode === 'NCR' ? 'NON-CONFORMANCE REPORT'
    : mode === 'DefectReport' ? 'VENDOR DEFECT CLAIM REPORT'
    : 'NCR — VENDOR DEFECT REPORT';

  const refNo = ncr?.id || defectReport?.id || '—';
  const date  = ncr?.reportedAt?.split('T')[0] || defectReport?.reportDate || new Date().toISOString().split('T')[0];

  return (
    <>
      <style>{PRINT_STYLES}</style>

      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-slate-900 text-white flex items-center justify-between px-6 py-3">
        <span className="text-sm font-black uppercase">{title} — {refNo}</span>
        <div className="flex gap-3">
          <button onClick={() => window.print()} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-5 py-2 rounded-xl">🖨 Print</button>
          <button onClick={onClose} className="bg-white/10 text-white text-xs font-black uppercase px-4 py-2 rounded-xl">✕ Close</button>
        </div>
      </div>

      <div id="ncr-print-root" style={{ paddingTop: '48px', fontFamily: 'Arial, sans-serif' }}>
        <div className="bg-white text-black leading-tight" style={{ padding: '0 8mm' }}>
          <GlassCoHeader title={title} refNo={refNo} date={date}/>

          {/* ── NCR Section ── */}
          {ncr && (mode === 'NCR' || mode === 'Both') && (
            <div style={{ marginBottom: '8mm' }}>
              {/* NCR status bar */}
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '6px 10px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', color: '#DC2626' }}>
                  NCR — {ncr.stage} | {ncr.cause}
                </div>
                <div style={{ fontSize: '9px', fontWeight: 900, color: '#DC2626', background: 'white', border: '1px solid #FECACA', borderRadius: '4px', padding: '2px 8px' }}>
                  {ncr.status || 'OPEN'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                <div>
                  <Field label="Stage" value={ncr.stage}/>
                  <Field label="Cause" value={ncr.cause} highlight/>
                  <Field label="Glass Type" value={ncr.glassType}/>
                  <Field label="Thickness" value={ncr.thickness}/>
                  <Field label="SqFt Lost" value={ncr.sqftLost?.toFixed(1)}/>
                </div>
                <div>
                  <Field label="Reported By" value={ncr.reportedBy}/>
                  <Field label="Vendor" value={ncr.vendorName}/>
                  <Field label="Purchase Ref" value={ncr.purchaseRef}/>
                  <Field label="Est. Value (PKR)" value={ncr.estimatedValue ? `PKR ${ncr.estimatedValue.toLocaleString()}` : undefined} highlight={!!ncr.estimatedValue}/>
                  <Field label="Action" value={ncr.action}/>
                </div>
              </div>

              {/* Description */}
              <div style={{ marginTop: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '6px 8px' }}>
                <div style={{ fontSize: '7px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '3px' }}>Description / Observation</div>
                <div style={{ fontSize: '8px', fontWeight: 700, color: '#334155', lineHeight: 1.5 }}>{ncr.description}</div>
              </div>

              {ncr.notes && (
                <div style={{ marginTop: '4px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '4px', padding: '5px 8px' }}>
                  <div style={{ fontSize: '7px', fontWeight: 900, color: '#92400E', textTransform: 'uppercase', marginBottom: '2px' }}>Notes</div>
                  <div style={{ fontSize: '8px', fontWeight: 700, color: '#78350F' }}>{ncr.notes}</div>
                </div>
              )}

              {/* NCR Signatures */}
              <div style={{ marginTop: '8mm', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                {['Reported By', 'Supervisor', 'Management'].map(label => (
                  <div key={label} style={{ borderTop: '1.5px solid #DC2626', paddingTop: '6px' }}>
                    <div style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8' }}>{label}</div>
                    <div style={{ marginTop: '20px', fontSize: '7px', color: '#cbd5e1' }}>Signature / Date</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Defect Report Section ── */}
          {defectReport && (mode === 'DefectReport' || mode === 'Both') && (
            <div style={{ marginTop: mode === 'Both' ? '8mm' : '0', paddingTop: mode === 'Both' ? '6mm' : '0', borderTop: mode === 'Both' ? '2px dashed #e2e8f0' : 'none' }}>
              {mode === 'Both' && (
                <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 6px' }}>
                  <span style={{ border: '1px solid #F59E0B', borderRadius: '9999px', padding: '2px 20px', fontWeight: 900, fontSize: '8px', textTransform: 'uppercase', color: '#92400E', background: '#FEF3C7' }}>
                    VENDOR CLAIM — CONTINUATION
                  </span>
                </div>
              )}

              {/* Vendor info */}
              <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '6px', padding: '6px 10px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '6px', fontWeight: 900, color: '#92400E', textTransform: 'uppercase' }}>Vendor</div>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: '#78350F', textTransform: 'uppercase' }}>{defectReport.vendorName}</div>
                  <div style={{ fontSize: '7px', color: '#92400E', fontWeight: 700 }}>GRN: {defectReport.grnId}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '7px', fontWeight: 900, color: '#92400E', textTransform: 'uppercase' }}>Claim Status</div>
                  <div style={{ fontSize: '12px', fontWeight: 900, color: '#DC2626' }}>{defectReport.status}</div>
                  <div style={{ fontSize: '7px', color: '#92400E', fontWeight: 700 }}>Prepared: {defectReport.preparedBy}</div>
                </div>
              </div>

              {/* Defect entries table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px' }}>
                <thead>
                  <tr style={{ background: '#92400E', color: 'white', fontWeight: 900, textTransform: 'uppercase' }}>
                    <th style={{ padding: '5px 4px', textAlign: 'left', width: '20%' }}>Tag ID</th>
                    <th style={{ padding: '5px 4px', textAlign: 'left', width: '18%' }}>Defect Code</th>
                    <th style={{ padding: '5px 4px', textAlign: 'right', width: '10%' }}>Orig SqFt</th>
                    <th style={{ padding: '5px 4px', textAlign: 'right', width: '10%' }}>Usable SqFt</th>
                    <th style={{ padding: '5px 4px', textAlign: 'right', width: '12%' }}>Orig Value</th>
                    <th style={{ padding: '5px 4px', textAlign: 'right', width: '12%' }}>Usable Value</th>
                    <th style={{ padding: '5px 4px', textAlign: 'right', width: '12%' }}>Adjustment</th>
                  </tr>
                </thead>
                <tbody>
                  {defectReport.defectEntries.map((e, i) => (
                    <tr key={e.tagId} style={{ background: i % 2 === 0 ? 'white' : '#FFFBEB', borderBottom: '0.5px solid #FDE68A' }}>
                      <td style={{ padding: '4px', fontFamily: 'monospace', fontWeight: 700 }}>{e.tagId}</td>
                      <td style={{ padding: '4px', fontWeight: 700 }}>{e.defectCode || '—'}</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>{e.originalSqft?.toFixed(1)}</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>{e.usableSqft?.toFixed(1)}</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>PKR {Math.round(e.originalValue || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>PKR {Math.round(e.usableValue || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px', textAlign: 'right', fontWeight: 900, color: '#DC2626' }}>PKR {Math.round(e.adjustmentAmount || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #92400E', background: '#FEF3C7' }}>
                    <td colSpan={6} style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 900, textTransform: 'uppercase', fontSize: '9px', color: '#92400E' }}>
                      Total Claim Amount
                    </td>
                    <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 900, fontSize: '12px', color: '#DC2626' }}>
                      PKR {Math.round(defectReport.totalAdjustment).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Claim signatures */}
              <div style={{ marginTop: '8mm', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                {['Prepared By', 'Store Incharge', 'Vendor Representative', 'Management'].map(label => (
                  <div key={label} style={{ borderTop: '1.5px solid #F59E0B', paddingTop: '6px' }}>
                    <div style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8' }}>{label}</div>
                    <div style={{ marginTop: '20px', fontSize: '7px', color: '#cbd5e1' }}>Signature / Date</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: '6mm', paddingTop: '4px', borderTop: '0.5px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '7px', color: '#94a3b8', fontWeight: 700 }}>
            <span>GlassTech Group — GlassCo Pvt. Ltd. | Karachi, Pakistan</span>
            <span>This document is computer generated — {new Date().toLocaleDateString('en-PK')}</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default NCRDefectPrint;
