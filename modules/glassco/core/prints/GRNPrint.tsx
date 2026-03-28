/**
 * GRNPrint.tsx — Phase 12
 * GlassCo branded GRN print — same header/style as quotation/sales order
 */

import React from 'react';
import { MaterialLedgerEntry, GRNSheetEntry } from '@/modules/procurement/types/inventory';

interface GRNPrintData {
  grnId: string;
  grnDate: string;
  vendorName: string;
  dcNo: string;
  biltyNo: string;
  vendorSoNo?: string;
  vehicleNo?: string;
  driverName?: string;
  poId?: string;
  freightType?: string;
  freightPKR?: number;
  otherCharges?: number;
  otherChargesDesc?: string;
  lines: {
    description: string;
    thickness: string;
    sheetSize: string;
    sheetCount: number;
    sqftPerSheet: number;
    totalSqft: number;
    totalSqmtr: number;
    weightKg: number;
    ratePKR: number;
    lineValue: number;
    tagIds?: string[];
  }[];
  sheetEntries?: GRNSheetEntry[];
  totalSheets: number;
  totalSqft: number;
  totalWeight: number;
  grandTotal: number;
  postedBy?: string;
}

interface Props {
  data: GRNPrintData;
  onClose: () => void;
}

const PRINT_STYLES = `
  @media print {
    body > *:not(#grn-print-root) { display: none !important; }
    #grn-print-root { display: block !important; }
    @page { size: A4 portrait; margin: 10mm 12mm; }
    .no-print { display: none !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`;

// ── Shared header (matches quotation/SO style) ────────────────────────────
const GlassCoHeader: React.FC<{ title: string; refNo: string; date: string; rightExtra?: React.ReactNode }> = ({ title, refNo, date, rightExtra }) => (
  <>
    {/* Letterhead */}
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

    {/* Document title pill */}
    <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
      <span style={{ border: '1.5px solid #0f172a', borderRadius: '9999px', padding: '2px 30px', fontWeight: 900, letterSpacing: '0.1em', fontSize: '9px', textTransform: 'uppercase' }}>
        {title}
      </span>
    </div>

    {/* Ref / Date row */}
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '8px' }}>
      <div>
        <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '6px', textTransform: 'uppercase' }}>DOCUMENT NO:</div>
        <div style={{ fontSize: '14px', fontWeight: 900, color: '#1d4ed8', fontFamily: 'monospace' }}>{refNo}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>DATE: </span><span style={{ fontWeight: 900 }}>{date}</span></div>
        {rightExtra}
      </div>
    </div>
  </>
);

// ══════════════════════════════════════════════════════════════════════════
export const GRNPrint: React.FC<Props> = ({ data, onClose }) => {
  const defectEntries = data.sheetEntries?.filter(e => e.status !== 'OK') || [];
  const defectCount   = defectEntries.length;
  const claimTotal    = defectEntries.reduce((s, e) => s + (e.claimAmount || 0), 0);

  return (
    <>
      <style>{PRINT_STYLES}</style>

      {/* Screen toolbar */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-slate-900 text-white flex items-center justify-between px-6 py-3">
        <span className="text-sm font-black uppercase">GRN Print — {data.grnId}</span>
        <div className="flex gap-3">
          <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase px-5 py-2 rounded-xl">🖨 Print</button>
          <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase px-4 py-2 rounded-xl">✕ Close</button>
        </div>
      </div>

      <div id="grn-print-root" style={{ paddingTop: '48px', fontFamily: 'Arial, sans-serif' }}>
        <div className="glassco-print-page bg-white text-black p-0 leading-tight">
          <table className="w-full text-left border-collapse text-[10px]" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th colSpan={8} style={{ padding: '0 8mm', fontWeight: 'normal' }}>
                  <GlassCoHeader
                    title="GOODS RECEIPT NOTE"
                    refNo={data.grnId}
                    date={data.grnDate}
                    rightExtra={
                      <>
                        {data.poId && <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>PO REF: </span><span style={{ fontWeight: 900 }}>{data.poId}</span></div>}
                        {data.vehicleNo && <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>VEHICLE: </span><span style={{ fontWeight: 900 }}>{data.vehicleNo}</span></div>}
                      </>
                    }
                  />

                  {/* Vendor + DC/Bilty info box */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '6px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>VENDOR / SUPPLIER</div>
                      <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>{data.vendorName}</div>
                      {data.driverName && <div style={{ fontSize: '7px', color: '#64748b', fontWeight: 700 }}>Driver: {data.driverName}</div>}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '8px' }}>
                      <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>DC NO: </span><span style={{ fontWeight: 900 }}>{data.dcNo}</span></div>
                      <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>BILTY NO: </span><span style={{ fontWeight: 900 }}>{data.biltyNo}</span></div>
                      {data.vendorSoNo && <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>VENDOR SO: </span><span style={{ fontWeight: 900 }}>{data.vendorSoNo}</span></div>}
                      <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>FREIGHT: </span><span style={{ fontWeight: 900 }}>{data.freightType || '—'}</span></div>
                    </div>
                  </div>

                  {/* Summary stats */}
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                    {[
                      { label: 'Total Sheets', val: data.totalSheets },
                      { label: 'Total SqFt', val: data.totalSqft.toFixed(1) },
                      { label: 'Total Weight', val: `${data.totalWeight.toFixed(1)} KG` },
                      { label: 'Grand Total', val: `PKR ${Math.round(data.grandTotal).toLocaleString()}` },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', flex: 1 }}>
                        <div style={{ fontSize: '6px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>{s.label}</div>
                        <div style={{ fontSize: '11px', fontWeight: 900, color: '#0f172a' }}>{s.val}</div>
                      </div>
                    ))}
                  </div>
                </th>
              </tr>

              {/* Table header */}
              <tr style={{ background: '#0f172a', color: 'white', fontSize: '8px', fontWeight: 900, textTransform: 'uppercase' }}>
                <th style={{ padding: '5px 4px', width: '4%', textAlign: 'center' }}>#</th>
                <th style={{ padding: '5px 4px', width: '28%' }}>Description</th>
                <th style={{ padding: '5px 4px', width: '8%', textAlign: 'center' }}>Thick</th>
                <th style={{ padding: '5px 4px', width: '10%', textAlign: 'center' }}>Size</th>
                <th style={{ padding: '5px 4px', width: '8%', textAlign: 'right' }}>Sheets</th>
                <th style={{ padding: '5px 4px', width: '10%', textAlign: 'right' }}>SqFt</th>
                <th style={{ padding: '5px 4px', width: '10%', textAlign: 'right' }}>Rate</th>
                <th style={{ padding: '5px 4px', width: '12%', textAlign: 'right' }}>Line Total</th>
              </tr>
            </thead>

            <tbody>
              {data.lines.map((line, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '0.5px solid #e2e8f0' }}>
                  <td style={{ padding: '5px 4px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: '5px 4px', fontWeight: 900, textTransform: 'uppercase', fontSize: '9px' }}>
                    {line.description}
                    {line.tagIds && line.tagIds.length > 0 && (
                      <div style={{ fontSize: '7px', color: '#94a3b8', fontWeight: 400, marginTop: '1px' }}>
                        Tags: {line.tagIds.slice(0, 3).join(', ')}{line.tagIds.length > 3 ? ` +${line.tagIds.length - 3}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 700 }}>{line.thickness}</td>
                  <td style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 700 }}>{line.sheetSize}"</td>
                  <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 900 }}>{line.sheetCount}</td>
                  <td style={{ padding: '5px 4px', textAlign: 'right' }}>{line.totalSqft.toFixed(1)}</td>
                  <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 700 }}>PKR {line.ratePKR.toLocaleString()}</td>
                  <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 900, color: '#059669' }}>PKR {Math.round(line.lineValue).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              {/* Charges */}
              {(data.freightPKR || 0) > 0 && (
                <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td colSpan={7} style={{ padding: '4px', textAlign: 'right', fontSize: '8px', color: '#64748b', fontWeight: 700 }}>
                    Freight ({data.freightType}):
                  </td>
                  <td style={{ padding: '4px', textAlign: 'right', fontWeight: 900, fontSize: '9px', color: '#1d4ed8' }}>
                    PKR {(data.freightPKR || 0).toLocaleString()}
                  </td>
                </tr>
              )}
              {(data.otherCharges || 0) > 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '4px', textAlign: 'right', fontSize: '8px', color: '#64748b', fontWeight: 700 }}>
                    Other ({data.otherChargesDesc}):
                  </td>
                  <td style={{ padding: '4px', textAlign: 'right', fontWeight: 900, fontSize: '9px' }}>
                    PKR {(data.otherCharges || 0).toLocaleString()}
                  </td>
                </tr>
              )}
              {/* Grand total */}
              <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc' }}>
                <td colSpan={7} style={{ padding: '6px', textAlign: 'right', fontWeight: 900, textTransform: 'uppercase', fontSize: '9px', color: '#475569' }}>
                  Grand Total
                </td>
                <td style={{ padding: '6px', textAlign: 'right', fontWeight: 900, fontSize: '13px', color: '#059669' }}>
                  PKR {Math.round(data.grandTotal).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Defect Summary (if any) */}
          {defectCount > 0 && (
            <div style={{ margin: '8mm 8mm 0', padding: '8px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '6px' }}>
              <div style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', color: '#92400E', marginBottom: '4px' }}>
                Defect Summary — {defectCount} sheet(s) | Claim Amount: PKR {Math.round(claimTotal).toLocaleString()}
              </div>
              <table style={{ width: '100%', fontSize: '8px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#92400E', fontWeight: 900, textTransform: 'uppercase' }}>
                    <th style={{ padding: '2px 4px', textAlign: 'left' }}>Tag ID</th>
                    <th style={{ padding: '2px 4px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '2px 4px', textAlign: 'center' }}>Defect Code</th>
                    <th style={{ padding: '2px 4px', textAlign: 'right' }}>Usable SqFt</th>
                    <th style={{ padding: '2px 4px', textAlign: 'right' }}>Claim PKR</th>
                  </tr>
                </thead>
                <tbody>
                  {defectEntries.map((e, i) => (
                    <tr key={e.tagId} style={{ background: i % 2 === 0 ? 'white' : '#FFFBEB' }}>
                      <td style={{ padding: '2px 4px', fontFamily: 'monospace', fontWeight: 700 }}>{e.tagId}</td>
                      <td style={{ padding: '2px 4px', textAlign: 'center', fontWeight: 700, color: e.status === 'Broken' ? '#DC2626' : '#D97706' }}>{e.status}</td>
                      <td style={{ padding: '2px 4px', textAlign: 'center' }}>{e.defectCode || '—'}</td>
                      <td style={{ padding: '2px 4px', textAlign: 'right' }}>{(e.usableSqft || 0).toFixed(1)}</td>
                      <td style={{ padding: '2px 4px', textAlign: 'right', fontWeight: 900 }}>PKR {Math.round(e.claimAmount || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Signatures */}
          <div style={{ margin: '10mm 8mm 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '20px' }}>
            {['Store Incharge', 'Weighed By', 'Checked By', 'Approved By'].map(label => (
              <div key={label} style={{ borderTop: '1.5px solid #0f172a', paddingTop: '6px' }}>
                <div style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>{label}</div>
                <div style={{ marginTop: '20px', fontSize: '7px', color: '#cbd5e1' }}>Signature / Stamp</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ margin: '6mm 8mm 0', paddingTop: '4px', borderTop: '0.5px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '7px', color: '#94a3b8', fontWeight: 700 }}>
            <span>GlassTech Group — GlassCo Pvt. Ltd. | Karachi, Pakistan</span>
            <span>Printed: {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default GRNPrint;
