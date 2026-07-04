import React from 'react';
import { Quotation, ProductionPiece, Product, QuotationItem } from '@/modules/shared/types';
import QrTag from '@/modules/glassco/core/QrTag';

interface Props {
    quote: Quotation;
    clientName: string;
    pieces: ProductionPiece[];
    products: Product[];
}

// Two row shapes rendered in the manifest: section headers and piece rows.
type JobCardRow =
    | { isSection: true;  isPiece?: false; description: string }
    | { isSection?: false; isPiece: true;  pId: string; displaySize: string; materialSpec: string; itemDescription: string; services: string; holesSummary: string };

export const GlassCoJobCardPrint: React.FC<Props> = ({ quote, clientName, pieces, products }) => {
    if (!quote) return <div className="p-8 text-slate-500 italic">No quotation data available to print.</div>;
    const safeItems: QuotationItem[] = Array.isArray(quote.items)
        ? quote.items
        : (typeof quote.items === 'string' ? (() => { try { return JSON.parse(quote.items as any); } catch { return []; } })() : []);
    quote = { ...quote, items: safeItems };
    const safePieces = Array.isArray(pieces) ? pieces : [];

    let jobPieces = safePieces.filter(p => p.orderId === quote.orderNo || p.orderId === quote.id);
    jobPieces.sort((a, b) => {
        const getNum = (id: string) => parseInt((id.split('/').pop() || '0').replace(/[^0-9]/g, '')) || 0;
        return getNum(a.id) - getNum(b.id);
    });
    
    if (jobPieces.length === 0) {
        let serialCounter = 1;
        quote.items.forEach((item, itemIdx) => {
            if (item.isSection) return;
            const isDG = item.selectedServices?.some((s: string) => s === 'D/G' || s === 'Double Glaze');
            const qty = Number(item.qty) || 0;
            for (let i = 0; i < qty; i++) {
                const suffixes = isDG ? ['A', 'B'] : [''];
                suffixes.forEach(sfx => {
                    jobPieces.push({
                        id: `${(quote.orderNo || quote.id || '').replace(/[^0-9]/g,'').slice(-4) || '0000'}/${serialCounter}${sfx}`,
                        orderId: quote.orderNo || quote.id, itemIndex: itemIdx,
                        specs: `${item.glassSize || ''} ${item.glassType || ''} ${sfx}`.trim(),
                        status: 'Cut', lastUpdated: new Date().toISOString()
                    } as ProductionPiece);
                });
                serialCounter++;
            }
        });
    }
    
    const displayId = quote.orderNo || quote.id;
    const isMMGlobal = quote.items.some(i => !i.isSection && (i.mmW || i.mmH));
    // surface the sheet-requirement / wastage from the saved wastageDecision
    // so the cutter knows how many sheets to pull and the planned wastage. Rendered
    // only when the quote actually carries a decision (set in QuotationWastageTab).
    const wastage = quote.wastageDecision;

    const printableItems: JobCardRow[] = [];
    quote.items.forEach((item, itemIdx) => {
        if (item.isSection) printableItems.push({ isSection: true, description: item.description });
        const itemPieces = jobPieces.filter(p => Number(p.itemIndex) === itemIdx);
        const isMM = !!(item.mmW || item.mmH);
        const displaySize = isMM 
            ? `${item.mmW || 0} x ${item.mmH || 0}`
            : `${item.inchW || 0}.${item.sootW || 0} x ${item.inchH || 0}.${item.sootH || 0}`;
        const holes = Array.isArray(item.holes) ? item.holes : [];
        const holesSummary = holes.length > 0
            ? holes.map((h, i: number) => {
                const posKey = (() => {
                    // reverse-map x,y to TL/TC/TR etc.
                    const POS: Array<[string, number, number]> = [
                        ['TL',8,8],['TC',50,8],['TR',92,8],
                        ['ML',8,50],['MC',50,50],['MR',92,50],
                        ['BL',8,92],['BC',50,92],['BR',92,92],
                    ];
                    const found = POS.find(p => p[1] === h.x && p[2] === h.y);
                    return found ? found[0] : `${h.x}%,${h.y}%`;
                })();
                const sz = h.type === 'Hole' ? `Ø${h.diameter}mm` : `${h.width}×${h.height}mm`;
                return `#${i+1} ${h.type}@${posKey}(${sz})`;
              }).join(' · ')
            : '';
        itemPieces.forEach(p => {
            printableItems.push({
                isPiece: true, pId: p.id, displaySize,
                materialSpec: (p.specs || '').replace('undefined', '').replace('Plain', 'Clear').trim(),
                itemDescription: item.description,
                services: item?.selectedServices?.join(' + ') || 'NONE',
                holesSummary,
            });
        });
    });
    const quoteAttachments: string[] = Array.isArray((quote as any).attachments) ? (quote as any).attachments : [];

    let serialCounter = 0;

    return (
        <div className="glassco-print-page bg-white text-black font-sans leading-tight">
            <table className="w-full text-left border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
                <thead>
                    <tr>
                        <th colSpan={6} style={{ padding: '0', fontWeight: 'normal' }}>
                            <div style={{ borderBottom: '4px solid black', paddingBottom: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px' }}>
                                <div>
                                    <div style={{ fontSize: '28px', fontWeight: 900, textTransform: 'uppercase' }}>{quote.orderNo || displayId}</div>
                                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase' }}>{quote.projectName || clientName}</div>
                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginTop: '4px' }}>INTERNAL JOB CARD - PRODUCTION COPY</div>
                                </div>
                                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#1d4ed8' }}>REF: {displayId}</div>
                                        <div style={{ fontSize: '11px', fontWeight: 700 }}>CLIENT: {clientName}</div>
                                        <div style={{ fontSize: '8px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginTop: '2px' }}>Scan to open job</div>
                                    </div>
                                    {/* Phase-4 (4.4) — job-level QR for fast scan-to-open */}
                                    <QrTag value={`JOB:${displayId}`} sizeMm={22} ecLevel="M" />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '4px', border: '2px solid black' }}>
                                <div><div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>Job Start</div><div style={{ fontSize: '12px', fontWeight: 900 }}>{quote.date}</div></div>
                                <div><div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>Target Date</div><div style={{ fontSize: '12px', fontWeight: 900, color: '#dc2626' }}>{quote.dueDate}</div></div>
                                <div><div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>Total Pieces</div><div style={{ fontSize: '12px', fontWeight: 900 }}>{jobPieces.length}</div></div>
                                <div><div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>Project Site</div><div style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>{quote.projectName || 'Stock'}</div></div>
                            </div>
                            {/* sheet-requirement / wastage line for the cutting floor */}
                            {wastage && (
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '16px', background: '#fff7ed', border: '2px solid black', borderRadius: '4px', padding: '8px 12px' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9a3412' }}>Sheet Plan</div>
                                    <div><span style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>Sheets Req: </span><span style={{ fontSize: '12px', fontWeight: 900 }}>{wastage.sheetsRequired}</span></div>
                                    {wastage.selectedSheetSize && (
                                        <div><span style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>Sheet Size: </span><span style={{ fontSize: '12px', fontWeight: 900 }}>{wastage.selectedSheetSize}</span></div>
                                    )}
                                    <div><span style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>Wastage: </span><span style={{ fontSize: '12px', fontWeight: 900, color: '#dc2626' }}>{Number(wastage.actualWastagePct || 0).toFixed(1)}%</span></div>
                                </div>
                            )}
                            <div style={{ fontSize: '16px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '12px', borderBottom: '2px solid black', paddingBottom: '4px' }}>Piece Specification Manifest</div>
                        </th>
                    </tr>
                    <tr style={{ background: '#e2e8f0', height: '34px' }}>
                        <th style={{ padding: '6px', border: '2px solid black', width: '5%', textAlign: 'center' }}>#</th>
                        <th style={{ padding: '6px', border: '2px solid black', width: '15%' }}>Tag ID</th>
                        <th style={{ padding: '6px', border: '2px solid black', width: '20%', textAlign: 'center' }}>Size ({isMMGlobal ? 'MM' : 'INCH'})</th>
                        <th style={{ padding: '6px', border: '2px solid black', width: '25%' }}>Material Spec</th>
                        <th style={{ padding: '6px', border: '2px solid black', width: '15%' }}>Description</th>
                        <th style={{ padding: '6px', border: '2px solid black', width: '20%' }}>Services Required</th>
                    </tr>
                </thead>
                <tbody>
                    {printableItems.map((item, idx) => {
                        if (item.isSection) {
                            return (
                                <tr key={`sec-${idx}`} style={{ background: '#f1f5f9' }}>
                                    <td colSpan={6} style={{ padding: '6px', border: '2px solid black', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', fontStyle: 'italic', fontSize: '12px' }}>{item.description}</td>
                                </tr>
                            );
                        }
                        serialCounter++;
                        return (
                            <tr key={`piece-${idx}`} style={{ pageBreakInside: 'avoid' }}>
                                <td style={{ padding: '6px', border: '2px solid black', textAlign: 'center', fontWeight: 700 }}>{serialCounter}</td>
                                <td style={{ padding: '6px', border: '2px solid black', fontWeight: 900, color: '#1d4ed8' }}>
                                    {/* Phase-4 (4.4) — per-piece QR for QC / Dispatch scan stations */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <QrTag value={`PIECE:${item.pId}`} sizeMm={11} ecLevel="L" />
                                        <span>{item.pId}</span>
                                    </div>
                                </td>
                                <td style={{ padding: '6px', border: '2px solid black', fontWeight: 900, fontSize: '13px', textAlign: 'center' }}>{item.displaySize}</td>
                                <td style={{ padding: '6px', border: '2px solid black', fontWeight: 700, textTransform: 'uppercase' }}>{item.materialSpec}</td>
                                <td style={{ padding: '6px', border: '2px solid black', fontWeight: 700, textTransform: 'uppercase' }}>{item.itemDescription}</td>
                                <td style={{ padding: '6px', border: '2px solid black', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }}>
                                    {item.services}
                                    {item.holesSummary && (
                                        <div style={{ marginTop: '3px', fontSize: '8px', fontWeight: 900, color: '#dc2626', letterSpacing: '0.02em' }}>
                                            ⚠ {item.holesSummary}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <div className="print-footer" style={{ marginTop: '40px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '40px', pageBreakInside: 'avoid' }}>
                <div style={{ borderTop: '2px solid black', paddingTop: '8px', textAlign: 'center', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }}>Cutting Supervisor</div>
                <div style={{ borderTop: '2px solid black', paddingTop: '8px', textAlign: 'center', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }}>Quality Control</div>
                <div style={{ borderTop: '2px solid black', paddingTop: '8px', textAlign: 'center', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }}>Shift Incharge</div>
            </div>

            {/* ATTACHMENTS pages — client reference images */}
            {quoteAttachments.length > 0 && (
                <div style={{ pageBreakBefore: 'always', padding: '10mm 8mm' }}>
                    <div style={{ borderBottom: '2px solid black', paddingBottom: '6px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Client Reference Attachments</div>
                        <div style={{ fontSize: '8px', fontWeight: 700, color: '#475569' }}>Job Ref: {displayId} · Client: {clientName}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {quoteAttachments.map((src, idx) => (
                            <div key={idx} style={{ border: '2px solid black', padding: '4px', pageBreakInside: 'avoid' }}>
                                <img src={src} alt={`Reference ${idx + 1}`} style={{ width: '100%', maxHeight: '130mm', objectFit: 'contain', display: 'block' }} />
                                <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#1e293b', textAlign: 'center', marginTop: '4px', letterSpacing: '0.1em' }}>
                                    Reference #{idx + 1}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
