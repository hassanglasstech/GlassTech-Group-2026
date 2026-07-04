import React, { useMemo } from 'react';
import { Quotation } from '@/modules/shared/types';
import { formatGlassDescription, formatBillingSize, formatGlassSize, formatServices } from '../utils/printUtils';
import { getGlasscoCompanyInfo } from '../constants/companyInfo';

interface Props {
    quote: Quotation;
    clientName: string;
    ledger: any[];
    clientAddress?: string;   // customer-facing print field
    clientPhone?: string;     // customer-facing print field
    clientNtn?: string;       // customer-facing print field
}

export const GlassCoSalesOrderPrint: React.FC<Props> = ({ quote, clientName, clientAddress, clientPhone, clientNtn }) => {
    const CO = getGlasscoCompanyInfo();   // live: merges Settings → Company Branding over defaults
    const safeItems: any[] = Array.isArray(quote.items)
        ? quote.items
        : (typeof quote.items === 'string' ? (() => { try { return JSON.parse(quote.items as any); } catch { return []; } })() : []);
    quote = { ...quote, items: safeItems };

    const subTotal = quote.items.reduce((s, i) => s + i.amount, 0);
    const aptChargesTotal = quote.items.reduce((s, i) => s + ((i as any).aptCharges || 0), 0);
    // include serviceCharges (freight / installation) in the order net.
    // Without this, the Sales Order printed a LOWER total than the Quotation
    // for the same order whenever service charges existed.
    const serviceChargesTotal = (((quote as Quotation & { serviceCharges?: Array<{ amount?: number }> }).serviceCharges) || [])
        .reduce((s: number, sc) => s + (sc.amount || 0), 0);
    const discountAmount = quote.discountAmount !== undefined && quote.discountAmount > 0
        ? quote.discountAmount
        : (subTotal * (quote.discountPercent || 0)) / 100;
    const netAmount = subTotal + aptChargesTotal + serviceChargesTotal - discountAmount;
    const advanceAmount = quote.receivedAmount || 0;
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
                                    <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.05em', color: '#0f172a' }}>{CO.name}</div>
                                    <div style={{ fontSize: '7px', fontWeight: 700, color: '#1e293b' }}>Contact: {CO.phone}</div>
                                    {CO.address && <div style={{ fontSize: '7px', fontWeight: 700, color: '#64748b' }}>{CO.address}</div>}
                                    {CO.ntn && <div style={{ fontSize: '7px', fontWeight: 700, color: '#64748b' }}>NTN: {CO.ntn}</div>}
                                    {CO.strn && <div style={{ fontSize: '7px', fontWeight: 700, color: '#64748b' }}>STRN: {CO.strn}</div>}
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
                                <span className="font-pill-so" style={{ fontSize: '9px', textTransform: 'uppercase' }}>S A L E S &nbsp; O R D E R</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '8px' }}>
                                <div>
                                    <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '6px', textTransform: 'uppercase' }}>BILLING TO:</div>
                                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', lineHeight: 1 }}>{clientName}</div>
                                    {clientAddress && <div style={{ fontSize: '7px', fontWeight: 700, color: '#64748b', marginTop: '2px' }}>{clientAddress}</div>}
                                    {clientPhone && <div style={{ fontSize: '7px', fontWeight: 700, color: '#64748b' }}>Tel: {clientPhone}</div>}
                                    {clientNtn && <div style={{ fontSize: '7px', fontWeight: 700, color: '#64748b' }}>NTN: {clientNtn}</div>}
                                    <div style={{ color: '#4338ca', fontWeight: 900, textTransform: 'uppercase', fontSize: '7px', marginTop: '2px' }}>Project: {quote.projectName || 'STANDARD ORDER'}</div>
                                </div>
                                <div style={{ textAlign: 'right', fontSize: '8px' }}>
                                    <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>ORDER REF: </span><span style={{ color: '#1d4ed8', fontWeight: 900 }}>{displayId}</span></div>
                                    <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>DATE: </span><span style={{ fontWeight: 900, color: '#334155' }}>{quote.date}</span></div>
                                    {quote.dueDate && <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>DUE DATE: </span><span style={{ fontWeight: 900, color: '#dc2626' }}>{quote.dueDate}</span></div>}
                                    <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>DELIVERY DATE: </span><span style={{ fontWeight: 900, color: '#334155' }}>{quote.actualDeliveryDate || '________________'}</span></div>
                                    <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>CHALLAN NO: </span><span style={{ fontWeight: 900, color: '#334155' }}>________________</span></div>
                                </div>
                            </div>
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', gap: '16px', borderRight: '1px solid #e2e8f0', paddingRight: '16px' }}>
                                    <div>
                                        <div style={{ fontSize: '6px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Qty</div>
                                        <div style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>{summary.totalQty} <span style={{ fontSize: '7px', color: '#94a3b8', fontWeight: 400 }}>Pcs</span></div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '6px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Ft²</div>
                                        <div style={{ fontSize: '12px', fontWeight: 900, color: '#1d4ed8' }}>{summary.totalSqFt.toFixed(2)}</div>
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
                        <th style={{ padding: '6px', width: '40%' }}>Product Description & Processing Specs</th>
                        <th style={{ padding: '6px', textAlign: 'center', width: '15%' }}>Size ({isMM ? 'mm' : 'Inches'})</th>
                        <th style={{ padding: '6px', textAlign: 'center', width: '8%' }}>Qty</th>
                        <th style={{ padding: '6px', textAlign: 'center', width: '10%' }}>Standard Sq Ft</th>
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
                        const servicesList = formatServices(item.selectedServices ?? []);
                        const isDoubleGlazed = item.selectedServices?.some((s: string) => s === 'Double Glaze' || s === 'D/G' || s === 'Double Glazing');
                        const qtyDisplay = isDoubleGlazed ? `${item.qty} Set` : item.qty;
                        const description = formatGlassDescription(item);
                        // MM orders must print their MM dimensions. formatBillingSize
                        // works purely off item.width/height (inches) and applies the 6"/12"
                        // billing-rounding protocol, so it silently discarded MM input — the
                        // header column read "mm" while the cell showed inch-rounded figures.
                        // For MM items honour formatGlassSize (matches GlassCoQuotationPrint);
                        // keep the billing-rounding for inch orders (intended for invoicing).
                        const itemIsMM = !!((item as { inputUnit?: string }).inputUnit === 'MM' || (item as { mmW?: number }).mmW || (item as { mmH?: number }).mmH);
                        const displaySize = itemIsMM ? formatGlassSize(item) : formatBillingSize(item);
                        return (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', pageBreakInside: 'avoid' }}>
                                <td style={{ padding: '6px', textAlign: 'center', color: '#94a3b8', fontWeight: 700, borderRight: '1px solid #f1f5f9' }}>{serialNum}</td>
                                <td style={{ padding: '6px', borderRight: '1px solid #f1f5f9' }}>
                                    <div style={{ fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', lineHeight: 1.2, fontSize: '9px' }}>{description}</div>
                                    <div style={{ fontSize: '6px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', marginTop: '2px' }}>{servicesList}</div>
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
                        <div style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#0f172a', marginBottom: '4px', borderBottom: '1px solid #f1f5f9', paddingBottom: '3px' }}>Terms of Production</div>
                        <div style={{ fontSize: '7px', color: '#475569', fontWeight: 700, lineHeight: 1.6 }}>
                            <div>• Industrial 6-inch rounding protocol applies.</div>
                            <div>• No modifications after cutting process begins.</div>
                            <div style={{ color: '#0f172a' }}>• Balance payment required before dispatch.</div>
                        </div>
                    </div>
                    <div style={{ width: '36%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            <span>Gross:</span><span>PKR {(Number(subTotal) || 0).toLocaleString()}</span>
                        </div>
                        {aptChargesTotal > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>
                                <span>APT Charges:</span><span>+ PKR {aptChargesTotal.toLocaleString()}</span>
                            </div>
                        )}
                        {(((quote as any).serviceCharges) || []).map((sc: { description?: string; amount?: number }, i: number) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>
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
                        {advanceAmount > 0 && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
                                    <span>Advance:</span><span>- {(Number(advanceAmount) || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '4px', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                                    <span style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#dc2626' }}>Balance:</span>
                                    <span style={{ fontSize: '16px', fontWeight: 900, color: '#dc2626' }}>PKR {(netAmount - advanceAmount).toLocaleString()}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    <div style={{ borderTop: '1px solid #0f172a', paddingTop: '4px', textAlign: 'center', fontSize: '6px', fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8' }}>Verification</div>
                    <div style={{ borderTop: '1px solid #0f172a', paddingTop: '4px', textAlign: 'center', fontSize: '6px', fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8' }}>Accounts</div>
                    <div style={{ borderTop: '1px solid #0f172a', paddingTop: '4px', textAlign: 'center', fontSize: '6px', fontWeight: 900, textTransform: 'uppercase', color: '#0f172a' }}>Authorized</div>
                </div>
                <div style={{ marginTop: '14px', textAlign: 'center' }}>
                    <p style={{ fontSize: '6px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#cbd5e1', fontStyle: 'italic' }}>
                        Computer generated sales document. Valid for Production Floor.
                    </p>
                </div>
            </div>
        </div>
    );
};
