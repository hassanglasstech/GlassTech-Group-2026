import React from 'react';
import { GTKQuoteHeader, GTKQuoteItem } from './gtkQuotationTypes';
import { WINDOW_TYPES, GLASS_SPECS, NETTING_TYPES, GTK_COMPANY_INFO } from './gtkQuotationConstants';
import WindowSVG from './WindowSVG';

interface JobOrderPageProps {
  item: GTKQuoteItem;
  header: GTKQuoteHeader;
  index: number;
  clientName?: string;
}

const GlassLabel = ({ id, custom }: { id: string; custom?: string }) => {
  if (id === 'custom') return <>{custom || 'Custom'}</>;
  return <>{GLASS_SPECS.find(g => g.id === id)?.abbr || id}</>;
};

const JobOrderPage: React.FC<JobOrderPageProps> = ({ item, header, index, clientName }) => {
  const wt = WINDOW_TYPES.find(w => w.id === item.windowTypeId);
  const widthMM = Math.round(item.widthFt * 304.8);
  const heightMM = Math.round(item.heightFt * 304.8);
  const nettingLabel = NETTING_TYPES.find(n => n.id === item.netting)?.label;
  const isSliding = ['sliding_win_1', 'sliding_win_2', 'sliding_door_2', 'sliding_door_4', 'lift_slide', 'synchronized'].includes(item.windowTypeId);

  return (
    <div style={{
      fontFamily: 'Arial, sans-serif', fontSize: 9.5, color: '#000',
      background: '#fff', padding: 16, pageBreakAfter: 'always', minHeight: '25cm'
    }}>
      {/* ── HEADER TABLE ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
        <tbody>
          <tr>
            <td style={{ width: 180, padding: '6px 10px', border: '1px solid #000', verticalAlign: 'middle' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#1d4ed8' }}>GlassTech</div>
              <div style={{ fontSize: 7, color: '#555' }}>{GTK_COMPANY_INFO.address}</div>
            </td>
            <td style={{ padding: '6px 10px', border: '1px solid #000', textAlign: 'center', fontWeight: 700, fontSize: 11, verticalAlign: 'middle' }}>
              View from Inside
            </td>
            <td style={{ width: 130, padding: '6px 8px', border: '1px solid #000', verticalAlign: 'top' }}>
              <div style={{ fontSize: 8, color: '#777' }}>Ref. No.</div>
              <div style={{ fontWeight: 700, fontSize: 10 }}>{header.refNo || '—'}</div>
            </td>
            <td style={{ width: 180, padding: '6px 8px', border: '1px solid #000', verticalAlign: 'top' }}>
              <div style={{ fontSize: 8, color: '#777' }}>Client:</div>
              <div style={{ fontWeight: 700, fontSize: 10 }}>{clientName || header.clientName || '—'}</div>
            </td>
          </tr>
          <tr>
            <td colSpan={4} style={{ padding: '3px 10px', border: '1px solid #000', fontSize: 8.5 }}>
              <b>Date:</b> {new Date(header.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              &nbsp;&nbsp;<b>Site:</b> {header.site || '—'}
              &nbsp;&nbsp;<b>Section:</b> {header.sectionSize} {header.profileType}
              &nbsp;&nbsp;<b>Color:</b> {header.color || 'Black'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── MAIN BODY: Drawing + Table ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            {/* Drawing Area */}
            <td style={{ border: '1px solid #000', padding: 16, width: '55%', textAlign: 'center', verticalAlign: 'middle', minHeight: 320 }}>
              <WindowSVG typeId={wt?.svgType || 'fixed_no_div'} width={260} height={200} />
              <div style={{ marginTop: 10, fontSize: 11, fontWeight: 800 }}>
                {widthMM > 0 ? `${widthMM} × ${heightMM} mm` : `${item.widthFt} × ${item.heightFt} ft`}
              </div>
              {item.qty > 1 && (
                <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>Qty: {item.qty} pcs</div>
              )}
            </td>

            {/* Right Table */}
            <td style={{ border: '1px solid #000', verticalAlign: 'top', padding: 0, width: '45%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8.5 }}>
                <thead>
                  <tr style={{ background: '#f0f0f0' }}>
                    <th style={{ padding: '4px 5px', border: '1px solid #ccc', textAlign: 'center' }}>S.No.</th>
                    <th style={{ padding: '4px 5px', border: '1px solid #ccc', textAlign: 'center' }}>Width (MM)</th>
                    <th style={{ padding: '4px 5px', border: '1px solid #ccc', textAlign: 'center' }}>Height (MM)</th>
                    <th style={{ padding: '4px 5px', border: '1px solid #ccc', textAlign: 'center' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '5px', border: '1px solid #ccc', textAlign: 'center', fontWeight: 800, fontSize: 11 }}>
                      {item.serialNo || index + 1}
                    </td>
                    <td style={{ padding: '5px', border: '1px solid #ccc', textAlign: 'center', fontWeight: 700 }}>
                      {widthMM || '—'}
                    </td>
                    <td style={{ padding: '5px', border: '1px solid #ccc', textAlign: 'center', fontWeight: 700 }}>
                      {heightMM || '—'}
                    </td>
                    <td style={{ padding: '5px', border: '1px solid #ccc', fontSize: 8 }}>
                      {item.location}<br />
                      {item.floor}
                    </td>
                  </tr>
                  {/* Empty rows */}
                  {Array.from({ length: 7 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={4} style={{ padding: '4px 5px', border: '1px solid #ccc', height: 18 }}></td>
                    </tr>
                  ))}
                  {/* Note row */}
                  <tr>
                    <td colSpan={4} style={{ padding: '4px 5px', border: '1px solid #ccc', background: '#f8f8f8', fontWeight: 700 }}>Note</td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ padding: '4px 5px', border: '1px solid #ccc', fontSize: 8 }}>
                      (<GlassLabel id={item.glassSpecId} custom={item.customGlassLabel} />)
                      {item.dividerNote ? ` — ${item.dividerNote}` : ''}
                      {item.notes ? ` — ${item.notes}` : ''}
                    </td>
                  </tr>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}><td colSpan={4} style={{ padding: '4px 5px', border: '1px solid #ccc', height: 16 }}></td></tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── SPECS FOOTER ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8.5 }}>
        <tbody>
          <tr style={{ background: '#f8f8f8' }}>
            {['Profile', 'Netting', 'Handle', 'Section', 'Glass Spec', 'Flush Side', 'Series', 'Client Approval'].map(h => (
              <td key={h} style={{ padding: '3px 5px', border: '1px solid #ccc', fontWeight: 700, fontSize: 8 }}>{h}</td>
            ))}
          </tr>
          <tr>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>{header.profileType}</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>{item.netting !== 'none' ? nettingLabel : '—'}</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>—</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>{item.profile || header.sectionSize}</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}><GlassLabel id={item.glassSpecId} custom={item.customGlassLabel} /></td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>2" Inside</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>—</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}></td>
          </tr>
          <tr style={{ background: '#f8f8f8' }}>
            {['Color', 'Netting Divider', 'Hinge', 'System', 'Beading Side', 'Water Slot', 'Border Profile', ''].map(h => (
              <td key={h} style={{ padding: '3px 5px', border: '1px solid #ccc', fontWeight: 700, fontSize: 8 }}>{h}</td>
            ))}
          </tr>
          <tr>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>{header.color || 'Black'}</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>—</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>—</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>{isSliding ? 'Sliding' : 'Fixed Frame'}</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>Inside</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>Yes</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}>No</td>
            <td style={{ padding: '3px 5px', border: '1px solid #ccc' }}></td>
          </tr>
        </tbody>
      </table>

      {/* Signatures */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
        <div style={{ borderTop: '1px solid #000', paddingTop: 4, width: 160, textAlign: 'center', fontSize: 8.5 }}>Area Manager</div>
        <div style={{ borderTop: '1px solid #000', paddingTop: 4, width: 160, textAlign: 'center', fontSize: 8.5 }}>Site Supervisor</div>
      </div>
    </div>
  );
};

export default JobOrderPage;
