import React from 'react';
import { Quotation, ProductionPiece, Product } from '@/modules/shared/types';

interface Props {
    quote: Quotation;
    clientName: string;
    pieces: ProductionPiece[];
    products: Product[];
}

export const GlassCoJobCardPrint: React.FC<Props> = ({ quote, clientName, pieces, products }) => {
    let jobPieces = pieces.filter(p => p.orderId === quote.orderNo);

    // Virtual pieces for draft/preview
    if (jobPieces.length === 0) {
        let serialCounter = 1;
        quote.items.forEach((item, idx) => {
            if (item.isSection) return;
            const isDG = item.selectedServices?.some(s => s === 'D/G' || s === 'Double Glaze');
            const qty = Number(item.qty) || 0;
            for (let i = 0; i < qty; i++) {
                const suffixes = isDG ? ['A', 'B'] : [''];
                suffixes.forEach(sfx => {
                    jobPieces.push({
                        id: `${quote.manualSerial || 'DRAFT'}/${serialCounter}${sfx}`,
                        orderId: quote.orderNo || quote.id,
                        itemIndex: idx,
                        specs: `${item.glassSize || ''} ${item.glassType || ''} ${sfx}`.trim(),
                        status: 'Cut',
                        lastUpdated: new Date().toISOString()
                    } as ProductionPiece);
                });
                serialCounter++;
            }
        });
    }

    const displayId  = quote.orderNo || quote.id;
    const isMMGlobal = quote.items.some(i => !i.isSection && (i.mmW || i.mmH));

    // Build flat printable row list
    const printableItems: any[] = [];
    quote.items.forEach((item, itemIdx) => {
        if (item.isSection) {
            printableItems.push({ isSection: true, description: item.description });
            return;
        }
        const itemPieces = jobPieces.filter(p => p.itemIndex === itemIdx);
        const displaySize = (item.mmW || item.mmH)
            ? `${item.mmW || 0} x ${item.mmH || 0}`
            : `${item.inchW || 0}.${item.sootW || 0} x ${item.inchH || 0}.${item.sootH || 0}`;
        const materialSpec = (itemPieces[0]?.specs || '')
            .replace('undefined', '').replace('Plain', 'Clear').trim()
            || `${item.glassSize || ''} ${item.glassType || ''}`.replace('Plain','Clear').trim();

        itemPieces.forEach(p => {
            printableItems.push({
                isPiece: true,
                pId: p.id,
                displaySize,
                materialSpec,
                itemDescription: item.description,
                services: item.selectedServices?.join(' + ') || 'NONE'
            });
        });
    });

    // Chunk into pages
    const PAGE_1_ROWS   = 20;
    const OTHER_ROWS    = 25;
    const chunks: any[][] = [];
    let rem = [...printableItems];
    chunks.push(rem.splice(0, PAGE_1_ROWS));
    while (rem.length > 0) chunks.push(rem.splice(0, OTHER_ROWS));
    if (chunks.length === 0) chunks.push([]);

    let serialCounter = 0;

    return (
        <div className="print-only bg-white text-black font-sans leading-tight">
            <style>{`
                @media screen { .print-only { display: none !important; } }
                @media print {
                    @page { size: A4; margin: 0; }
                    body { margin: 0; padding: 0; }
                    html, body { height: auto !important; overflow: visible !important; background: white !important; }
                    body * { visibility: hidden; }
                    .print-only, .print-only * { visibility: visible; }
                    .print-only { position: absolute; left: 0; top: 0; width: 100%; background: white; z-index: 99999; }
                    .print-container { width: 100% !important; padding: 15mm !important; box-sizing: border-box !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .bg-slate-50  { background-color: #f8fafc !important; }
                    .bg-slate-100 { background-color: #f1f5f9 !important; }
                    .bg-slate-200 { background-color: #e2e8f0 !important; }
                    table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    th, td { border: 1.5px solid #000 !important; }
                    .page-break-before { page-break-before: always; }
                    .no-print { display: none !important; }
                }
            `}</style>

            {chunks.map((chunk, chunkIdx) => {
                const isFirst = chunkIdx === 0;
                const isLast  = chunkIdx === chunks.length - 1;

                return (
                    <div key={chunkIdx} className={chunkIdx > 0 ? 'page-break-before' : ''}>
                        <div className="print-container">

                            {/* PAGE 1 HEADER */}
                            {isFirst && (
                                <>
                                    <div className="flex justify-between items-end border-b-4 border-black pb-3 mb-5">
                                        <div>
                                            <h1 className="text-4xl font-black uppercase leading-none">{displayId}</h1>
                                            <p className="text-lg font-bold text-slate-700 uppercase mt-1">{quote.projectName || clientName}</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">INTERNAL JOB CARD - PRODUCTION COPY</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-blue-700">REF: {displayId}</p>
                                            <p className="text-xs font-bold">CLIENT: {clientName}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-4 gap-0 mb-5 border-2 border-black">
                                        <div className="p-3 bg-slate-100 border-r-2 border-black">
                                            <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">JOB START</p>
                                            <p className="text-sm font-black mt-0.5">{quote.date || '—'}</p>
                                        </div>
                                        <div className="p-3 bg-slate-100 border-r-2 border-black">
                                            <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">TARGET DATE</p>
                                            <p className="text-sm font-black text-rose-600 mt-0.5">{quote.dueDate || '—'}</p>
                                        </div>
                                        <div className="p-3 bg-slate-100 border-r-2 border-black">
                                            <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">TOTAL PIECES</p>
                                            <p className="text-sm font-black mt-0.5">{jobPieces.length}</p>
                                        </div>
                                        <div className="p-3 bg-slate-100">
                                            <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">PROJECT SITE</p>
                                            <p className="text-sm font-black uppercase mt-0.5">{quote.projectName || 'STOCK'}</p>
                                        </div>
                                    </div>

                                    <h3 className="text-sm font-black uppercase tracking-widest mb-3 border-b-2 border-black pb-1">
                                        PIECE SPECIFICATION MANIFEST
                                    </h3>
                                </>
                            )}

                            {/* CONTINUATION HEADER (page 2+) */}
                            {!isFirst && (
                                <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-3">
                                    <p className="text-sm font-black uppercase">{displayId} — {quote.projectName || clientName}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Page {chunkIdx + 1}</p>
                                </div>
                            )}

                            {/* TABLE */}
                            <table className="w-full text-left border-2 border-black text-xs">
                                <thead className="bg-slate-200">
                                    <tr>
                                        <th className="p-2 border-2 border-black text-center w-[5%]">#</th>
                                        <th className="p-2 border-2 border-black w-[14%]">Tag ID</th>
                                        <th className="p-2 border-2 border-black text-center w-[18%]">Size ({isMMGlobal ? 'MM' : 'INCH'})</th>
                                        <th className="p-2 border-2 border-black w-[22%]">Material Spec</th>
                                        <th className="p-2 border-2 border-black w-[19%]">Description</th>
                                        <th className="p-2 border-2 border-black w-[22%]">Services Required</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {chunk.map((item: any, idx: number) => {
                                        if (item.isSection) {
                                            return (
                                                <tr key={`sec-${idx}`} className="bg-slate-100">
                                                    <td colSpan={6} className="p-2 border-2 border-black font-black uppercase tracking-widest text-center italic text-[11px]">
                                                        {item.description}
                                                    </td>
                                                </tr>
                                            );
                                        }
                                        serialCounter++;
                                        return (
                                            <tr key={`piece-${idx}`}>
                                                <td className="p-2 border-2 border-black text-center font-bold text-slate-500">{serialCounter}</td>
                                                <td className="p-2 border-2 border-black font-black text-blue-700">{item.pId}</td>
                                                <td className="p-2 border-2 border-black font-black text-center text-[13px]">{item.displaySize}</td>
                                                <td className="p-2 border-2 border-black font-bold uppercase">{item.materialSpec}</td>
                                                <td className="p-2 border-2 border-black font-bold uppercase text-slate-600">{item.itemDescription}</td>
                                                <td className="p-2 border-2 border-black font-bold text-[10px] uppercase">{item.services}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* FOOTER — last page only */}
                            {isLast && (
                                <div className="mt-16 grid grid-cols-3 gap-10">
                                    <div className="border-t-2 border-black pt-2 text-center text-[10px] font-black uppercase">Cutting Supervisor</div>
                                    <div className="border-t-2 border-black pt-2 text-center text-[10px] font-black uppercase">Quality Control</div>
                                    <div className="border-t-2 border-black pt-2 text-center text-[10px] font-black uppercase">Shift Incharge</div>
                                </div>
                            )}

                        </div>
                    </div>
                );
            })}
        </div>
    );
};
