import React from 'react';
import { Quotation, Company } from '@/modules/shared/types';

interface Props {
  quotation: Quotation;
  company: Company;
  clientName?: string;
  printMode?: 'Quotation' | 'SalesOrder';
}

const PKR = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`;
const sqft = (n: number) => n.toFixed(2);

const COMPANY_INFO: Record<string, { name: string; address: string; phone: string; email: string; tagline: string }> = {
  GTK: {
    name: 'GlassTech (Pvt) Ltd',
    tagline: 'Complete Architectural Glass Solution',
    address: '10 B, Seagul Appartments, BC 4/5, Block-5, Clifton, Karachi',
    phone: '+92-21-XXXXXXX',
    email: 'info@glasstech.pk',
  },
  GTI: {
    name: 'GlassTech Industries',
    tagline: 'Tempered & Processed Glass Specialists',
    address: 'Plot XX, SITE Industrial Area, Karachi',
    phone: '+92-21-XXXXXXX',
    email: 'gti@glasstech.pk',
  },
};

const UniversalSalesOrderPrint: React.FC<Props> = ({ quotation, company, clientName, printMode = 'SalesOrder' }) => {
  const info = COMPANY_INFO[company] || COMPANY_INFO['GTK'];
  const items = quotation.items || [];
  const serviceCharges: any[] = Array.isArray(quotation.serviceCharges) ? quotation.serviceCharges : [];

  const itemsTotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const servicesTotal = serviceCharges.reduce((s: number, sc) => s + (sc.amount || 0), 0);
  const subtotal = itemsTotal + servicesTotal;
  const discount = quotation.discountAmount || (subtotal * ((quotation.discountPercent || 0) / 100));
  const grandTotal = subtotal - discount;
  const totalSqFt = items.reduce((s, i) => s + (i.totalSqFt || 0), 0);

  const docLabel = printMode === 'Quotation' ? 'QUOTATION' : 'SALES ORDER';
  const docNo = printMode === 'Quotation' ? quotation.id : (quotation.orderNo || quotation.id);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '12px', padding: '32px', maxWidth: '800px', margin: '0 auto', color: '#1a1a1a' }}
         className="print-only">
      <style>{`@media print { body * { visibility: hidden; } .print-only, .print-only * { visibility: visible; } .print-only { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', borderBottom: '2px solid #1a1a1a', paddingBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', letterSpacing: '1px' }}>{info.name}</div>
          <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{info.tagline}</div>
          <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>{info.address}</div>
          <div style={{ fontSize: '11px', color: '#555' }}>{info.phone} | {info.email}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>{docLabel}</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginTop: '4px' }}># {docNo}</div>
          <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>Date: {quotation.date}</div>
          {quotation.dueDate && <div style={{ fontSize: '11px', color: '#555' }}>Valid Till: {quotation.dueDate}</div>}
        </div>
      </div>

      {/* Client & Project */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px', background: '#f7f7f7', padding: '12px', borderRadius: '6px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Bill To</div>
          <div style={{ fontWeight: 'bold' }}>{clientName || quotation.clientId}</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Project</div>
          <div style={{ fontWeight: 'bold' }}>{quotation.projectName || '—'}</div>
          {quotation.subject && <div style={{ fontSize: '11px', color: '#555' }}>{quotation.subject}</div>}
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
        <thead>
          <tr style={{ background: '#1a1a1a', color: '#fff' }}>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: '11px' }}>#</th>
            <th style={{ padding: '8px', textAlign: 'left', fontSize: '11px' }}>Description</th>
            <th style={{ padding: '8px', textAlign: 'center', fontSize: '11px' }}>Qty</th>
            <th style={{ padding: '8px', textAlign: 'right', fontSize: '11px' }}>Sq.Ft</th>
            <th style={{ padding: '8px', textAlign: 'right', fontSize: '11px' }}>Rate</th>
            <th style={{ padding: '8px', textAlign: 'right', fontSize: '11px' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} style={{ borderBottom: '0.5px solid #e0e0e0', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ padding: '7px 8px', color: '#888' }}>{idx + 1}</td>
              <td style={{ padding: '7px 8px' }}>
                <div>{item.description}</div>
                {item.locationCode && <div style={{ fontSize: '10px', color: '#888' }}>Loc: {item.locationCode}</div>}
                {item.glazingSpecs && <div style={{ fontSize: '10px', color: '#888' }}>{item.glazingSpecs}</div>}
              </td>
              <td style={{ padding: '7px 8px', textAlign: 'center' }}>{item.qty}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right' }}>{sqft(item.totalSqFt || 0)}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right' }}>{PKR(item.pricePerUnit || 0)}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 'bold' }}>{PKR(item.amount || 0)}</td>
            </tr>
          ))}
          {serviceCharges.map((sc: any, idx: number) => (
            <tr key={`sc-${idx}`} style={{ borderBottom: '0.5px solid #e0e0e0', background: '#fff8f0' }}>
              <td style={{ padding: '7px 8px', color: '#888' }}>—</td>
              <td style={{ padding: '7px 8px', color: '#b45309' }}>{sc.description || sc.label || 'Service Charge'}</td>
              <td style={{ padding: '7px 8px', textAlign: 'center' }}>—</td>
              <td style={{ padding: '7px 8px', textAlign: 'right' }}>—</td>
              <td style={{ padding: '7px 8px', textAlign: 'right' }}>—</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 'bold', color: '#b45309' }}>{PKR(sc.amount || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
        <div style={{ minWidth: '280px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid #e0e0e0' }}>
            <span style={{ color: '#555' }}>Total Sq.Ft</span>
            <span style={{ fontWeight: 'bold' }}>{sqft(totalSqFt)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid #e0e0e0' }}>
            <span style={{ color: '#555' }}>Subtotal</span>
            <span>{PKR(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid #e0e0e0', color: '#c00' }}>
              <span>Discount {quotation.discountPercent ? `(${quotation.discountPercent}%)` : ''}</span>
              <span>- {PKR(discount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', background: '#1a1a1a', color: '#fff', marginTop: '4px', paddingLeft: '12px', paddingRight: '12px', borderRadius: '4px' }}>
            <span style={{ fontWeight: 'bold' }}>Grand Total</span>
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{PKR(grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Terms & Conditions</div>
          <div style={{ fontSize: '11px', color: '#555', lineHeight: '1.5' }}>
            • Prices valid for 30 days from quotation date.<br/>
            • 50% advance required to confirm order.<br/>
            • Delivery subject to material availability.
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ marginTop: '40px', borderTop: '1px solid #555', paddingTop: '4px', display: 'inline-block', minWidth: '160px' }}>
            <div style={{ fontSize: '11px', color: '#555' }}>Authorised Signature</div>
            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{info.name}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniversalSalesOrderPrint;
