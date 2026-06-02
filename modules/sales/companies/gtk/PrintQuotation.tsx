import React from 'react';
import { GTKQuoteHeader, GTKQuoteItem } from './gtkQuotationTypes';
import { WINDOW_TYPES, GLASS_SPECS, GTK_COMPANY_INFO, NETTING_TYPES } from './gtkQuotationConstants';

interface PrintQuotationProps {
  header: GTKQuoteHeader;
  items: GTKQuoteItem[];
  totals: {
    totalSqft: number;
    subTotal: number;
    installationAmt: number;
    grossTotal: number;
    discountAmt: number;
    grandTotal: number;
  };
  clientName?: string;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-PK');
const fmtSf = (n: number) => n.toFixed(2);

const GlassLabel = ({ id, custom }: { id: string; custom?: string }) => {
  if (id === 'custom') return <>{custom || 'Custom'}</>;
  return <>{GLASS_SPECS.find(g => g.id === id)?.abbr || id}</>;
};

// Group items by floor
const groupByFloor = (items: GTKQuoteItem[]) => {
  const groups: Record<string, GTKQuoteItem[]> = {};
  items.forEach(item => {
    const floor = item.floor || 'Ground Floor';
    if (!groups[floor]) groups[floor] = [];
    groups[floor].push(item);
  });
  return groups;
};

const PrintQuotation: React.FC<PrintQuotationProps> = ({ header, items, totals, clientName }) => {
  const groups = groupByFloor(items);
  let globalSerial = 1;

  const renderItemRow = (item: GTKQuoteItem, idx: number, serial: number, isAlumOnly: boolean) => {
    const wt = WINDOW_TYPES.find(w => w.id === item.windowTypeId);
    const nettingLabel = NETTING_TYPES.find(n => n.id === item.netting)?.label || '';

    return (
      <React.Fragment key={item.id}>
        <tr style={{ background: idx % 2 === 0 ? '#f8fafc' : '#fff' }}>
          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', fontSize: 9 }}>{item.serialNo || serial}</td>
          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 9.5, fontWeight: 600 }}>
              {wt?.label || item.windowTypeId} {item.locationCode ? `(${item.locationCode})` : ''}
            </div>
            {item.netting !== 'none' && (
              <div style={{ fontSize: 8.5, color: '#475569' }}>With {nettingLabel} Inside</div>
            )}
            {item.dividerNote && (
              <div style={{ fontSize: 8.5, color: '#475569' }}>{item.dividerNote}</div>
            )}
            {item.coupled && item.coupledWith && (
              <div style={{ fontSize: 8, color: '#7c3aed', fontStyle: 'italic' }}>↳ {item.coupledWith}</div>
            )}
            {item.notes && (
              <div style={{ fontSize: 8.5, color: '#64748b' }}>{item.notes}</div>
            )}
          </td>
          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', fontSize: 9, textAlign: 'center' }}>
            {item.locationCode || item.location || '—'}
          </td>
          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', fontSize: 9, textAlign: 'center' }}>
            <GlassLabel id={item.glassSpecId} custom={item.customGlassLabel} />
          </td>
          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', fontSize: 9, textAlign: 'center' }}>{item.qty}</td>
          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', fontSize: 9, textAlign: 'center' }}>{item.widthFt}</td>
          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', fontSize: 9, textAlign: 'center' }}>{item.heightFt}</td>
          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', fontSize: 9, textAlign: 'right' }}>
            {fmtSf(item.sqftPerPiece)}
            {item.qty > 1 && <div style={{ fontSize: 7.5, color: '#94a3b8' }}>Total: {fmtSf(item.totalSqft)}</div>}
          </td>
          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', fontSize: 9, textAlign: 'right' }}>
            {fmt(item.effectiveRate)}
          </td>
          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', fontSize: 9.5, fontWeight: 700, textAlign: 'right' }}>
            {fmt(item.total)}
          </td>
        </tr>
      </React.Fragment>
    );
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 10, color: '#000', background: '#fff', padding: '20px', maxWidth: 960 }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'flex-start', borderBottom: '2px solid #1d4ed8', paddingBottom: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', letterSpacing: -0.5 }}>GlassTech</div>
          <div style={{ fontSize: 8.5, color: '#555' }}>{GTK_COMPANY_INFO.tagline}</div>
          <div style={{ fontSize: 8.5, color: '#555', marginTop: 2 }}>{GTK_COMPANY_INFO.address}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 2, color: '#1d4ed8' }}>QUOTATION</div>
          <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>
            <div><b>Date:</b> {new Date(header.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div><b>Valid Till:</b> {new Date(header.validTill).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div><b>Ref No:</b> {header.refNo || '—'}</div>
          </div>
        </div>
      </div>

      {/* ── CLIENT INFO ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10, fontSize: 9.5 }}>
        <div><b>Client:</b> {clientName || header.clientName || '—'}</div>
        <div><b>Architect:</b> {header.architect || '—'}</div>
        <div><b>Color:</b> {header.color || 'As Specified'}</div>
        <div style={{ gridColumn: '1/-1' }}><b>Site:</b> {header.site || '—'}</div>
        <div style={{ gridColumn: '1/-1' }}><b>Subject:</b> {header.subject || `Quotation for ${header.sectionSize} ${header.profileType} Aluminum Window & Door Systems`}</div>
      </div>

      {/* ── SUMMARY PILLS ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Profile', val: `${header.sectionSize} — ${header.profileType}` },
          { label: 'Series', val: header.sectionBrand },
          { label: 'Hardware', val: header.hardware },
          { label: 'Mode', val: header.mode === 'inclusive' ? 'All-Inclusive (Glass + Alu)' : 'Aluminum Only' },
        ].map(p => (
          <div key={p.label} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '3px 10px', fontSize: 8.5 }}>
            <b style={{ color: '#1d4ed8' }}>{p.label}:</b> {p.val}
          </div>
        ))}
      </div>

      {/* ── ITEMS TABLE ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <thead>
          <tr style={{ background: '#1d4ed8', color: '#fff' }}>
            {['S.No', 'Description', 'Loc. Code', 'Glazing', 'Qty', 'W (ft)', 'H (ft)', 'Sq.Ft', 'Rate/Sqft', 'Amount (Rs.)'].map(h => (
              <th key={h} style={{ padding: '5px 6px', fontSize: 8.5, textAlign: h === 'Amount (Rs.)' || h === 'Rate/Sqft' || h === 'Sq.Ft' ? 'right' : 'center', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(groups).map(([floor, floorItems]) => (
            <React.Fragment key={floor}>
              {/* Floor header row */}
              <tr>
                <td colSpan={10} style={{ padding: '5px 8px', background: '#f1f5f9', fontWeight: 800, fontSize: 9, color: '#334155', border: '1px solid #e2e8f0', letterSpacing: 0.5 }}>
                  {floor.toUpperCase()}
                </td>
              </tr>
              {floorItems.map((item, idx) => renderItemRow(item, idx, globalSerial++, header.mode === 'aluminum'))}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {/* ── TOTALS ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <table style={{ fontSize: 9.5, borderCollapse: 'collapse', minWidth: 280 }}>
          <tbody>
            <tr>
              <td style={{ padding: '3px 12px', color: '#64748b' }}>Total Sq.Ft:</td>
              <td style={{ padding: '3px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtSf(totals.totalSqft)}</td>
            </tr>
            <tr>
              <td style={{ padding: '3px 12px', color: '#64748b' }}>Sub Total:</td>
              <td style={{ padding: '3px 12px', textAlign: 'right' }}>Rs. {fmt(totals.subTotal)}</td>
            </tr>
            {totals.installationAmt > 0 && (
              <tr>
                <td style={{ padding: '3px 12px', color: '#64748b' }}>Installation:</td>
                <td style={{ padding: '3px 12px', textAlign: 'right' }}>Rs. {fmt(totals.installationAmt)}</td>
              </tr>
            )}
            {(header.cartage || 0) > 0 && (
              <tr>
                <td style={{ padding: '3px 12px', color: '#64748b' }}>Cartage:</td>
                <td style={{ padding: '3px 12px', textAlign: 'right' }}>Rs. {fmt(header.cartage)}</td>
              </tr>
            )}
            {totals.discountAmt > 0 && (
              <tr>
                <td style={{ padding: '3px 12px', color: '#e11d48' }}>{header.discount}% Discount:</td>
                <td style={{ padding: '3px 12px', textAlign: 'right', color: '#e11d48' }}>- Rs. {fmt(totals.discountAmt)}</td>
              </tr>
            )}
            <tr style={{ background: '#1d4ed8', color: '#fff' }}>
              <td style={{ padding: '6px 12px', fontWeight: 800, fontSize: 10.5 }}>Grand Total:</td>
              <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 800, fontSize: 10.5 }}>Rs. {fmt(totals.grandTotal)}</td>
            </tr>
            <tr>
              <td style={{ padding: '3px 12px', color: '#64748b', fontSize: 8.5 }}>Per Sq.Ft Rate:</td>
              <td style={{ padding: '3px 12px', textAlign: 'right', fontSize: 8.5 }}>
                Rs. {totals.totalSqft > 0 ? fmt(totals.grandTotal / totals.totalSqft) : 0}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── GLASS (if aluminum only mode) ── */}
      {header.mode === 'aluminum' && (
        <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 6, fontSize: 8.5 }}>
          <b style={{ color: '#92400e' }}>Note:</b> Above Prices are Exclusive of Glass. Glass will be charged as per standard sizes and market rates.
        </div>
      )}

      {/* ── TERMS ── */}
      <div style={{ fontSize: 8, color: '#475569', borderTop: '1px solid #e2e8f0', paddingTop: 8, marginBottom: 16 }}>
        <b>Terms & Conditions:</b>
        <div style={{ marginTop: 4, lineHeight: 1.6 }}>
          {(header.terms || '').split('\n').map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>

      {/* ── SIGNATURES ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30 }}>
        {['Prepared By', 'Checked By', 'Client / Architect'].map(label => (
          <div key={label} style={{ borderTop: '1px solid #000', paddingTop: 4, width: 180, textAlign: 'center', fontSize: 9 }}>{label}</div>
        ))}
      </div>
    </div>
  );
};

export default PrintQuotation;
