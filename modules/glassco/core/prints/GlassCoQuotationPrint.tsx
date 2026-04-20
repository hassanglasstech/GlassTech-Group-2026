import React, { useMemo } from 'react';
import { Quotation } from '@/modules/shared/types';
import { formatGlassDescription, formatGlassSize, formatServices } from '../utils/printUtils';

interface Props {
    quote: Quotation;
    clientName: string;
}

export const GlassCoQuotationPrint: React.FC<Props> = ({ quote, clientName }) => {
    const safeItems: any[] = Array.isArray(quote.items)
        ? quote.items
        : (typeof quote.items === 'string' ? (() => { try { return JSON.parse(quote.items as any); } catch { return []; } })() : []);
    quote = { ...quote, items: safeItems };

    const notchChargesTotal = quote.items.reduce((s, i) => s + ((i as any).notchCharges || 0), 0);
    // Glass subtotal = item.amount minus notch (which is shown as its own line)
    const subTotal = quote.items.reduce((s, i) => s + (i.amount - ((i as any).notchCharges || 0)), 0);
    const aptChargesTotal = quote.items.reduce((s, i) => s + ((i as any).aptCharges || 0), 0);
    const serviceChargesTotal = ((quote as any).serviceCharges || []).reduce((s: number, sc: any) => s + (sc.amount || 0), 0);
    const grossBeforeDiscount = subTotal + notchChargesTotal + aptChargesTotal + serviceChargesTotal;
    const attachments: string[] = Array.isArray((quote as any).attachments) ? (quote as any).attachments : [];
    const discountAmount = quote.discountAmount !== undefined && quote.discountAmount > 0
        ? quote.discountAmount
        : (grossBeforeDiscount * (quote.discountPercent || 0)) / 100;
    const netAmount = grossBeforeDiscount - discountAmount;
    const displayId = quote.orderNo || quote.id;
    const isMM = quote.items.some(i => !i.isSection && (i.mmW || i.mmH));

    const summary = useMemo(() => {
        const stats = { totalQty: 0, totalSqFt: 0, breakdown: {} as Record<string, number> };
        quote.items.forEach(item => {
            if (item.isSection) return;
            const qty = Number(item.qty) || 0;
            stats.totalQty += qty;
            stats.totalSqFt += (Number(item.totalSqFt) || 0);
            const isTempered = item.selectedServices?.some((s: string) => s === 'T/G' || s === 'Tempered');
            const glassTypeDisplay = (item.glassType === 'Plain' && isTempered) ? 'Clear' : item.glassType;
            const key = [item.glassSize, item.glassColor, item.subCategory, glassTypeDisplay]
                .filter(p => p && p !== 'N/A' && p !== 'Standard').join(' ').toUpperCase();
            stats.breakdown[key] = (stats.breakdown[key] || 0) + qty;
        });
        return stats;
    }, [quote.items]);

    let serialNum = 0;

    return (
        <div className="glassco-print-page bg-white text-black p-0 font-sans leading-tight">
            <table className="w-full text-left border-collapse text-[10px]" style={{ tableLayout: 'fixed' }}>
                <thead>
                    <tr>
                        <th colSpan={7} style={{ padding: '0 8mm', fontWeight: 'normal' }}>
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
                                <span className="font-pill-qt" style={{ fontSize: '9px', textTransform: 'uppercase' }}>Q U O T A T I O N</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '8px' }}>
                                <div>
                                    <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>INQUIRY FROM:</div>
                                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', lineHeight: 1 }}>{clientName}</div>
                                    <div style={{ color: '#1d4ed8', fontWeight: 900, textTransform: 'uppercase', fontSize: '7px', marginTop: '2px' }}>{quote.projectName || 'STANDARD ORDER'}</div>
                                </div>
                                <div style={{ textAlign: 'right', fontSize: '8px' }}>
                                    <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>REF NO: </span><span style={{ color: '#1d4ed8', fontWeight: 900 }}>{displayId}</span></div>
                                    <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>DATE: </span><span style={{ fontWeight: 900, color: '#334155' }}>{quote.date}</span></div>
                                    {quote.dueDate && <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>DUE DATE: </span><span style={{ fontWeight: 900, color: '#dc2626' }}>{quote.dueDate}</span></div>}
                                </div>
                            </div>
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', gap: '16px', borderRight: '1px solid #e2e8f0', paddingRight: '16px' }}>
                                    <div>
                                        <div style={{ fontSize: '6px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Qty</div>
                                        <div style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>{summary.totalQty} <span style={{ fontSize: '7px', color: '#94a3b8', fontWeight: 400 }}>Pcs</span></div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '6px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Area</div>
                                        <div style={{ fontSize: '12px', fontWeight: 900, color: '#1d4ed8' }}>{summary.totalSqFt.toFixed(2)} <span style={{ fontSize: '7px', color: '#94a3b8', fontWeight: 400 }}>Sq.Ft</span></div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'flex-end', flex: 1, paddingLeft: '16px' }}>
                                    {Object.entries(summary.breakdown).map(([key, val]) => (
                                        <span key={key} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: '4px', padding: '2px 6px', fontSize: '6px', fontWeight: 900 }}>
                                            <span style={{ color: '#94a3b8' }}>{key}: </span><span style={{ color: '#334155' }}>{val}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </th>
                    </tr>
                    <tr style={{ background: '#f8fafc', borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569' }}>
                        <th style={{ padding: '6px', textAlign: 'center', width: '5%' }}>S.No</th>
                        <th style={{ padding: '6px', width: '40%' }}>Description & Specifications</th>
                        <th style={{ padding: '6px', textAlign: 'center', width: '15%' }}>Size ({isMM ? 'mm' : 'Inches'})</th>
                        <th style={{ padding: '6px', textAlign: 'center', width: '8%' }}>Qty</th>
                        <th style={{ padding: '6px', textAlign: 'center', width: '10%' }}>Sq.Ft</th>
                        <th style={{ padding: '6px', textAlign: 'right', width: '10%' }}>Rate</th>
                        <th style={{ padding: '6px', textAlign: 'right', width: '12%' }}>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {quote.items.map((item, idx) => {
                        if (item.isSection) {
                            return (
                                <tr key={idx} style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                                    <td colSpan={7} style={{ padding: '5px 14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#334155', fontStyle: 'italic', fontSize: '8px' }}>{item.description}</td>
                                </tr>
                            );
                        }
                        serialNum++;
                        const servicesList = formatServices(item.selectedServices);
                        const isDoubleGlazed = item.selectedServices?.some((s: string) => s === 'Double Glaze' || s === 'D/G' || s === 'Double Glazing');
                        const qtyDisplay = isDoubleGlazed ? `${item.qty} Set` : item.qty;
                        const description = formatGlassDescription(item);
                        const displaySize = formatGlassSize(item);
                        return (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', pageBreakInside: 'avoid' }}>
                                <td style={{ padding: '6px', textAlign: 'center', color: '#94a3b8', fontWeight: 700, borderRight: '1px solid #f1f5f9' }}>{serialNum}</td>
                                <td style={{ padding: '6px', borderRight: '1px solid #f1f5f9' }}>
                                    <div style={{ fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', lineHeight: 1.2, fontSize: '9px' }}>{description}</div>
                                    <div style={{ fontSize: '6px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', marginTop: '2px', letterSpacing: '-0.02em' }}>{servicesList}</div>
                                    {Array.isArray(item.holes) && item.holes.length > 0 && (
                                        <div style={{ fontSize: '6px', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', marginTop: '1px' }}>
                                            ● {item.holes.length} Notch/Hole(s): {item.holes.map(h => `${h.type[0]}${(h as any).diameter || (h as any).width || ''}`).join(', ')}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '6px', textAlign: 'center', fontWeight: 700, color: '#334155', fontSize: '7px', borderRight: '1px solid #f1f5f9' }}>{displaySize}</td>
                                <td style={{ padding: '6px', textAlign: 'center', fontWeight: 900, color: '#0f172a', fontSize: '9px', borderRight: '1px solid #f1f5f9' }}>{qtyDisplay}</td>
                                <td style={{ padding: '6px', textAlign: 'center', fontWeight: 700, color: '#64748b', fontSize: '7px', borderRight: '1px solid #f1f5f9' }}>{Number(item.totalSqFt||0).toFixed(2)}</td>
                                <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '8px', borderRight: '1px solid #f1f5f9' }}>{Number(item.pricePerUnit||0).toLocaleString()}</td>
                                <td style={{ padding: '6px', textAlign: 'right', fontWeight: 900, color: '#0f172a', fontSize: '9px' }}>{Number(item.amount||0).toLocaleString()}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* FOOTER */}
            <div className="print-footer" style={{ marginTop: '12px', paddingTop: '8px', borderTop: '2px solid #0f172a', padding: '0 8mm', pageBreakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ width: '58%' }}>
                        <div style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#0f172a', marginBottom: '4px', borderBottom: '1px solid #f1f5f9', paddingBottom: '3px' }}>Protocol & Terms</div>
                        <div style={{ fontSize: '7px', color: '#475569', fontWeight: 700, lineHeight: 1.6 }}>
                            <div>• Rates valid for 3 days. Rounding protocol applies.</div>
                            <div>• No return or exchange once glass is cut.</div>
                            <div style={{ color: '#0f172a' }}>• 50% Advance mandatory to initiate production.</div>
                        </div>
                    </div>
                    <div style={{ width: '36%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            <span>Gross:</span><span>PKR {(Number(subTotal) || 0).toLocaleString()}</span>
                        </div>
                        {notchChargesTotal > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>
                                <span>Notch Charges:</span><span>+ PKR {notchChargesTotal.toLocaleString()}</span>
                            </div>
                        )}
                        {aptChargesTotal > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>
                                <span>APT Charges:</span><span>+ PKR {aptChargesTotal.toLocaleString()}</span>
                            </div>
                        )}
                        {((quote as any).serviceCharges || []).map((sc: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>
                                <span>{sc.description || 'Service Charge'}:</span><span>+ PKR {(sc.amount || 0).toLocaleString()}</span>
                            </div>
                        ))}
                        {(quote.discountAmount || quote.discountPercent) > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>
                                <span>Disc:</span><span>- {(Number(discountAmount) || 0).toLocaleString()}</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '4px', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#0f172a' }}>Net:</span>
                            <span style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>PKR {(Number(netAmount) || 0).toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '4px' }}>
                            <span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>50% Advance:</span>
                            <span style={{ fontSize: '10px', fontWeight: 900, color: '#334155' }}>PKR {(netAmount / 2).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div style={{ marginTop: '20px', textAlign: 'center' }}>
                    <p style={{ fontSize: '6px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#cbd5e1', fontStyle: 'italic' }}>
                        Computer generated document. No signature required.
                    </p>
                </div>
            </div>

            {/* ATTACHMENTS — printed on following pages */}
            {attachments.length > 0 && (
                <div style={{ pageBreakBefore: 'always', padding: '10mm 8mm' }}>
                    <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '6px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Reference Attachments</div>
                        <div style={{ fontSize: '8px', fontWeight: 700, color: '#64748b' }}>Ref: {displayId} · Client: {clientName}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {attachments.map((src, idx) => (
                            <div key={idx} style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px', pageBreakInside: 'avoid' }}>
                                {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                                <img src={src} alt={`Attachment ${idx + 1}`} style={{ width: '100%', maxHeight: '140mm', objectFit: 'contain', display: 'block' }} />
                                <div style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', color: '#475569', textAlign: 'center', marginTop: '3px' }}>
                                    Attachment #{idx + 1}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
