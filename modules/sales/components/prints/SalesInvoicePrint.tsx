/**
 * SalesInvoicePrint.tsx — Sprint 33 (Print Document Compliance)
 *
 * Pilot file for the new shared PrintHeader / PrintFooter components.
 * Pulls letterhead (logo, NTN, STRN, address) + footer (bank details,
 * terms, signatures) from the company_branding store via BrandingService.
 *
 * Operators edit branding at /admin/branding. Print components read
 * synchronously from a localStorage cache that's hydrated on app boot
 * (BrandingService.prefetchAll()).
 */

import React from 'react';
import PrintHeader from '@/modules/shared/components/prints/PrintHeader';
import PrintFooter from '@/modules/shared/components/prints/PrintFooter';

interface InvoiceItem {
  description?: string; glassType?: string; profileCode?: string;
  width?: number; height?: number; qty?: number; quantity?: number;
  rate?: number; unitPrice?: number; amount?: number;
}
interface ServiceCharge { description?: string; amount?: number; }
interface InvoiceForPrint {
  id: string; date?: string; dueDate?: string; orderId?: string; orderNo?: string;
  clientName?: string; clientNtn?: string; projectName?: string; glTxId?: string;
  subtotal?: number; totalAmount?: number; gstAmount?: number; gstPercent?: number;
  discountAmount?: number; receivedAmount?: number; balance?: number; status?: string;
  items?: InvoiceItem[]; serviceCharges?: ServiceCharge[];
}
interface InvoicePrintProps {
  invoice: InvoiceForPrint;
  company: string;
  onClose: () => void;
}

const SalesInvoicePrint: React.FC<InvoicePrintProps> = ({ invoice, company, onClose }) => {
  const handlePrint = () => window.print();

  const subtotal   = invoice.subtotal    || invoice.totalAmount || 0;
  const gstAmount  = invoice.gstAmount   || 0;
  const gstPercent = invoice.gstPercent  || 0;
  const discount   = invoice.discountAmount || 0;
  const grandTotal = invoice.totalAmount || 0;

  const items: InvoiceItem[] = invoice.items || [];
  const serviceCharges: ServiceCharge[] = invoice.serviceCharges || [];

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[500] p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Toolbar — hidden on print */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50 no-print shrink-0">
          <span className="font-black text-slate-800 uppercase text-sm tracking-widest">Invoice Preview — {invoice.id}</span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2 text-slate-500 font-bold text-xs uppercase border rounded-xl hover:bg-slate-100">Close</button>
            <button onClick={handlePrint} className="px-6 py-2 bg-blue-600 text-white font-bold text-xs uppercase rounded-xl hover:bg-blue-700 shadow">Print / Save PDF</button>
          </div>
        </div>

        {/* Invoice body — scrollable */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-6">
          <div className="bg-white w-[210mm] mx-auto shadow-lg" id="invoice-print" style={{ padding: '14mm' }}>

            <style>{`
              @media print {
                @page { size: A4 portrait; margin: 12mm; }
                body * { visibility: hidden; }
                #invoice-print, #invoice-print * { visibility: visible; }
                #invoice-print { position: fixed; left: 0; top: 0; width: 100%; padding: 0 !important; }
                .no-print { display: none !important; }
              }
            `}</style>

            {/* Sprint 33 — shared compliant letterhead */}
            <PrintHeader
              company={company}
              docTitle="TAX INVOICE"
              docNumber={invoice.id}
              docMeta={[
                { label: 'Date', value: invoice.date || '—' },
                { label: 'Due',  value: invoice.dueDate || '—' },
                ...(invoice.orderNo || invoice.orderId ? [{ label: 'Order', value: invoice.orderNo || invoice.orderId }] : []),
              ]}
            />

            {/* Bill To */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', padding: '8px 0 14px 0', borderBottom: '1px solid #e2e8f0', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '4px' }}>Bill To</div>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>{invoice.clientName}</div>
                {invoice.projectName && (
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginTop: '2px' }}>Project: {invoice.projectName}</div>
                )}
                {invoice.clientNtn && (
                  <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>NTN: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{invoice.clientNtn}</span></div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '4px' }}>Order Reference</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{invoice.orderNo || invoice.orderId || '—'}</div>
                {invoice.glTxId && (
                  <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>GL Ref: {invoice.glTxId}</div>
                )}
              </div>
            </div>

            {/* Items Table */}
            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', marginBottom: '8px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #0f172a' }}>
                  <th style={{ textAlign: 'left',  padding: '6px 4px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>#</th>
                  <th style={{ textAlign: 'left',  padding: '6px 4px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>Description</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>Rate</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>Amount (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: InvoiceItem, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 4px', color: '#94a3b8' }}>{idx + 1}</td>
                    <td style={{ padding: '6px 4px', color: '#334155', fontWeight: 700 }}>
                      {item.description || item.glassType || item.profileCode || 'Item'}
                      {(item.width || item.height) && (
                        <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '4px', fontWeight: 400 }}>
                          {item.width}×{item.height}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', color: '#475569' }}>{item.qty || item.quantity || 1}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', color: '#475569' }}>{(item.rate || item.unitPrice || 0).toLocaleString()}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 900, color: '#0f172a' }}>{(item.amount || 0).toLocaleString()}</td>
                  </tr>
                ))}
                {serviceCharges.map((sc: ServiceCharge, idx: number) => (
                  <tr key={'sc' + idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 4px', color: '#94a3b8' }}>{items.length + idx + 1}</td>
                    <td style={{ padding: '6px 4px', color: '#334155', fontWeight: 700, fontStyle: 'italic' }}>{sc.description || 'Service Charge'}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 900, color: '#0f172a' }}>{(sc.amount || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
              <div style={{ width: '260px', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span style={{ color: '#64748b', fontWeight: 700 }}>Subtotal</span>
                  <span style={{ fontWeight: 700, color: '#334155' }}>PKR {subtotal.toLocaleString()}</span>
                </div>
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ color: '#64748b', fontWeight: 700 }}>Discount</span>
                    <span style={{ fontWeight: 700, color: '#e11d48' }}>- PKR {discount.toLocaleString()}</span>
                  </div>
                )}
                {gstAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ color: '#64748b', fontWeight: 700 }}>GST ({gstPercent}%)</span>
                    <span style={{ fontWeight: 700, color: '#334155' }}>PKR {gstAmount.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #0f172a', paddingTop: '6px', marginTop: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', color: '#0f172a' }}>Total Due</span>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>PKR {grandTotal.toLocaleString()}</span>
                </div>
                {invoice.receivedAmount > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ color: '#64748b', fontWeight: 700 }}>Received</span>
                      <span style={{ fontWeight: 700, color: '#059669' }}>PKR {invoice.receivedAmount.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#be123c' }}>Balance Due</span>
                      <span style={{ fontSize: '11px', fontWeight: 900, color: '#be123c' }}>PKR {invoice.balance.toLocaleString()}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Status Banner */}
            {invoice.status === 'Paid' && (
              <div style={{ background: '#ecfdf5', border: '2px solid #10b981', borderRadius: '8px', padding: '8px', textAlign: 'center', marginBottom: '14px' }}>
                <div style={{ fontWeight: 900, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '13px' }}>PAID IN FULL</div>
              </div>
            )}

            {/* Sprint 33 — shared compliant footer (bank + terms + signatures) */}
            <PrintFooter
              company={company}
              termsKey="termsInvoice"
              showBank
              signatureLines={['Received By', 'Authorised Signatory']}
              footerNote="This is a computer-generated invoice. GlassTech Group ERP 2026."
            />

          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesInvoicePrint;
