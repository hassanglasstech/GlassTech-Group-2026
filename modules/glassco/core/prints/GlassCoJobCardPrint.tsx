import React from 'react';
import { Quotation, ProductionPiece, Product } from '@/modules/shared/types';

interface Props {
    quote: Quotation;
    clientName: string;
    pieces: ProductionPiece[];
    products: Product[];
}

export const GlassCoJobCardPrint: React.FC<Props> = ({ quote, clientName, pieces, products }) => {
    const safeItems: any[] = Array.isArray(quote.items)
        ? quote.items
        : (typeof quote.items === 'string' ? (() => { try { return JSON.parse(quote.items as any); } catch { return []; } })() : []);
    quote = { ...quote, items: safeItems };

    let jobPieces = pieces.filter(p => p.orderId === quote.orderNo || p.orderId === quote.id);
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

    const printableItems: any[] = [];
    quote.items.forEach((item, itemIdx) => {
        if (item.isSection) printableItems.push({ isSection: true, description: item.description });
        const itemPieces = jobPieces.filter(p => Number(p.itemIndex) === itemIdx);
        const isMM = !!(item.mmW || item.mmH);
        const displaySize = isMM 
            ? `${item.mmW || 0} x ${item.mmH || 0}`
            : `${item.inchW || 0}.${item.sootW || 0} x ${item.inchH || 0}.${item.sootH || 0}`;
        itemPieces.forEach(p => {
            printableItems.push({
                isPiece: true, pId: p.id, displaySize,
                materialSpec: (p.specs || '').replace('undefined', '').replace('Plain', 'Clear').trim(),
                itemDescription: item.description,
                services: item?.selectedServices?.join(' + ') || 'NONE'
            });
        });
    });

    let serialCounter = 0;

    return (
        <div className="glassco-print-page bg-white text-black font-sans leading-tight">
            <table className="w-full text-left border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
                <thead>
                    <tr>
                        <th colSpan={6} style={{ padding: '0', fontWeight: 'normal' }}>
                            <div style={{ borderBottom: '4px solid black', paddingBottom: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                <div>
                                    <div style={{ fontSize: '28px', fontWeight: 900, textTransform: 'uppercase' }}>{quote.orderNo || displayId}</div>
                                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase' }}>{quote.projectName || clientName}</div>
                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginTop: '4px' }}>INTERNAL JOB CARD - PRODUCTION COPY</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#1d4ed8' }}>REF: {displayId}</div>
                                    <div style={{ fontSize: '11px', fontWeight: 700 }}>CLIENT: {clientName}</div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '4px', border: '2px solid black' }}>
                                <div><div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>Job Start</div><div style={{ fontSize: '12px', fontWeight: 900 }}>{quote.date}</div></div>
                                <div><div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>Target Date</div><div style={{ fontSize: '12px', fontWeight: 900, color: '#dc2626' }}>{quote.dueDate}</div></div>
                                <div><div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>Total Pieces</div><div style={{ fontSize: '12px', fontWeight: 900 }}>{jobPieces.length}</div></div>
                                <div><div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>Project Site</div><div style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>{quote.projectName || 'Stock'}</div></div>
                            </div>
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
                                <td style={{ padding: '6px', border: '2px solid black', fontWeight: 900, color: '#1d4ed8' }}>{item.pId}</td>
                                <td style={{ padding: '6px', border: '2px solid black', fontWeight: 900, fontSize: '13px', textAlign: 'center' }}>{item.displaySize}</td>
                                <td style={{ padding: '6px', border: '2px solid black', fontWeight: 700, textTransform: 'uppercase' }}>{item.materialSpec}</td>
                                <td style={{ padding: '6px', border: '2px solid black', fontWeight: 700, textTransform: 'uppercase' }}>{item.itemDescription}</td>
                                <td style={{ padding: '6px', border: '2px solid black', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }}>{item.services}</td>
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
        </div>
    );
};
