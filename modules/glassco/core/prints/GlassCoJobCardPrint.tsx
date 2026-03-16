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
    // Sort ascending by piece number
    jobPieces.sort((a, b) => {
        const getNum = (id: string) => parseInt((id.split('/').pop() || '0').replace(/[^0-9]/g, '')) || 0;
        return getNum(a.id) - getNum(b.id);
    });
    
    // If no pieces found (e.g. Draft/Quotation), generate virtual pieces for preview
    if (jobPieces.length === 0) {
        jobPieces = [];
        let serialCounter = 1;
        quote.items.forEach((item, idx) => {
            if (item.isSection) return;
            const isDG = item.selectedServices?.some(s => s === 'D/G' || s === 'Double Glaze');
            const qty = Number(item.qty) || 0;
            for (let i = 0; i < qty; i++) {
                 const suffixes = isDG ? ['A', 'B'] : [''];
                 suffixes.forEach(sfx => {
                     jobPieces.push({
                         id: `${(quote.orderNo || quote.id || '').replace(/[^0-9]/g,'').slice(-4) || (quote.manualSerial || '0')}/${serialCounter}${sfx}`,
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
    
    // Display Logic for ID: Show ID if present
    const displayId = quote.orderNo || quote.id;

    // Counter for serial numbers across sections
    let globalSerial = 0;

    return (
        <div className="print-only bg-white text-black font-sans leading-tight flex flex-col">
            <style>{`
                @media screen {
                    .print-only { display: none !important; }
                }
                @media print {
                    @page { 
                        size: A4; 
                        margin: 0; 
                    }
                    body {
                        margin: 0;
                        padding: 0;
                    }
                    html, body {
                        height: auto !important;
                        overflow: visible !important;
                        background: white !important;
                    }
                    /* HIDE EVERYTHING ELSE */
                    body * {
                        visibility: hidden;
                    }
                    /* SHOW PRINT CONTAINER */
                    .print-only, .print-only * {
                        visibility: visible;
                    }
                    .print-only {
                        position: fixed;
                        left: 0;
                        top: 0;
                        width: 100%;
                        background: white;
                        z-index: 99999;
                        padding: 15mm !important;
                        box-sizing: border-box !important;
                        display: block !important;
                    }
                    @media print {
                        .print-only {
                            position: static !important;
                            width: 100% !important;
                            height: auto !important;
                        }
                        html, body {
                            height: auto !important;
                            overflow: visible !important;
                        }
                    }
                    /* Ensure table borders print crisp */
                    table { border-collapse: collapse !important; width: 100%; }
                    th, td { border: 2px solid black !important; }
                    
                    /* Hide non-print elements explicitly if they persist */
                    .no-print { display: none !important; }
                }
            `}</style>
            
            <div className="w-full">
                <div className="border-b-4 border-black pb-2 mb-6 flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-black uppercase">{quote.orderNo || displayId}</h1>
                        <p className="text-xl font-bold text-slate-800 uppercase">{quote.projectName || clientName}</p>
                        <p className="text-sm font-bold text-slate-600 mt-1">INTERNAL JOB CARD - PRODUCTION COPY</p>
                    </div>
                    <div className="text-right">
                        <p className="text-lg font-black text-blue-700">REF: {displayId}</p>
                        <p className="text-xs font-bold">CLIENT: {clientName}</p>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-4 mb-6 bg-slate-50 p-4 rounded border-2 border-black">
                    <div><p className="text-[10px] font-black uppercase text-slate-500">Job Start</p><p className="text-sm font-black">{quote.date}</p></div>
                    <div><p className="text-[10px] font-black uppercase text-slate-500">Target Date</p><p className="text-sm font-black text-rose-600">{quote.dueDate}</p></div>
                    <div><p className="text-[10px] font-black uppercase text-slate-500">Total Pieces</p><p className="text-sm font-black">{jobPieces.length}</p></div>
                    <div><p className="text-[10px] font-black uppercase text-slate-500">Project Site</p><p className="text-sm font-black uppercase">{quote.projectName || 'Stock'}</p></div>
                </div>

                <h3 className="text-lg font-black uppercase mb-4 border-b-2 border-black pb-1">Piece Specification Manifest</h3>
                
                {(() => {
                    // Configuration for Pagination
                    const PAGE_1_ROWS = 20;     
                    const OTHER_PAGE_ROWS = 25; 
                    const FOOTER_ROWS_SPACE = 6; 
                    const ROW_HEIGHT_PX = 38;

                    // Flatten sections and pieces into a single list
                    const printableItems: any[] = [];
                    const isMMGlobal = quote.items.some(i => !i.isSection && (i.mmW || i.mmH));

                    quote.items.forEach((item, itemIdx) => {
                        if (item.isSection) {
                            printableItems.push({ isSection: true, description: item.description });
                        }
                        const itemPieces = jobPieces.filter(p => p.itemIndex === itemIdx);
                        const isTempered = item.selectedServices?.some(s => s === 'T/G' || s === 'Tempered');
                        const isMM = !!(item.mmW || item.mmH);
                        // const unitLabel = isMM ? 'MM' : 'INCH'; // Removed per request
                        const displaySize = isMM 
                            ? `${item.mmW || 0} x ${item.mmH || 0}`
                            : `${item.inchW || 0}.${item.sootW || 0} x ${item.inchH || 0}.${item.sootH || 0}`;

                        itemPieces.forEach(p => {
                            printableItems.push({
                                isPiece: true,
                                pId: p.id,
                                displaySize,
                                // unitLabel, // Removed
                                materialSpec: (p.specs || '').replace('undefined', '').replace('Plain', 'Clear').trim(),
                                itemDescription: item.description,
                                services: item?.selectedServices?.join(' + ') || 'NONE'
                            });
                        });
                    });

                    // Chunking Logic
                    const chunks: any[][] = [];
                    let remainingItems = [...printableItems];

                    // First Page Chunk
                    let firstChunkSize = Math.min(remainingItems.length, PAGE_1_ROWS);
                    if (firstChunkSize > 0) {
                        chunks.push(remainingItems.slice(0, firstChunkSize));
                        remainingItems = remainingItems.slice(firstChunkSize);
                    }

                    // Subsequent Page Chunks
                    while (remainingItems.length > 0) {
                        let chunkSize = Math.min(remainingItems.length, OTHER_PAGE_ROWS);
                        chunks.push(remainingItems.slice(0, chunkSize));
                        remainingItems = remainingItems.slice(chunkSize);
                    }
                    
                    // Handle empty case
                    if (chunks.length === 0) chunks.push([]);

                    let serialCounter = 0;

                    return chunks.map((chunk, chunkIdx) => {
                        const isPage1 = chunkIdx === 0;
                        const isLastChunk = chunkIdx === chunks.length - 1;
                        const maxRows = isPage1 ? PAGE_1_ROWS : OTHER_PAGE_ROWS;
                        
                        // Calculate Table Height
                        // If it's the last chunk and we have space for footer, reduce height to accommodate footer
                        // Otherwise, use full page height (footer will push to next page)
                        const fitsFooter = chunk.length <= (maxRows - FOOTER_ROWS_SPACE);
                        const effectiveRows = (isLastChunk && fitsFooter) ? (maxRows - FOOTER_ROWS_SPACE) : maxRows;
                        const tableHeight = effectiveRows * ROW_HEIGHT_PX;

                        return (
                            <div key={chunkIdx} className={chunkIdx > 0 ? 'page-break-before mt-8' : ''}>
                                <div style={{ height: `${tableHeight}px` }}>
                                    <table className="w-full text-left border-2 border-black text-xs table-fixed h-full">
                                        <thead className="bg-slate-200 h-[38px]">
                                            <tr>
                                                <th className="p-2 border-2 border-black w-[5%] text-center">#</th>
                                                <th className="p-2 border-2 border-black w-[15%]">Tag ID</th>
                                                <th className="p-2 border-2 border-black w-[20%] text-center">Size ({isMMGlobal ? 'MM' : 'INCH'})</th>
                                                <th className="p-2 border-2 border-black w-[25%]">Material Spec</th>
                                                <th className="p-2 border-2 border-black w-[15%]">Description</th>
                                                <th className="p-2 border-2 border-black w-[20%]">Services Required</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {chunk.map((item, idx) => {
                                                if (item.isSection) {
                                                    return (
                                                        <tr key={`sec-${idx}`} className="bg-slate-100">
                                                            <td colSpan={6} className="p-2 border-2 border-black font-black uppercase tracking-widest text-center italic text-sm">
                                                                {item.description}
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                serialCounter++;
                                                return (
                                                    <tr key={`piece-${idx}`}>
                                                        <td className="p-2 border-2 border-black text-center font-bold">{serialCounter}</td>
                                                        <td className="p-2 border-2 border-black font-black text-blue-700">{item.pId}</td>
                                                        <td className="p-2 border-2 border-black font-black text-base text-center">
                                                            {item.displaySize}
                                                        </td>
                                                        <td className="p-2 border-2 border-black font-bold uppercase">
                                                            {item.materialSpec}
                                                        </td>
                                                        <td className="p-2 border-2 border-black font-bold uppercase">
                                                            {item.itemDescription}
                                                        </td>
                                                        <td className="p-2 border-2 border-black font-bold text-[10px] uppercase">
                                                            {item.services}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    });
                })()}

                <div className="mt-12 grid grid-cols-3 gap-10">
                    <div className="border-t-2 border-black pt-2 text-center text-[10px] font-black uppercase">Cutting Supervisor</div>
                    <div className="border-t-2 border-black pt-2 text-center text-[10px] font-black uppercase">Quality Control</div>
                    <div className="border-t-2 border-black pt-2 text-center text-[10px] font-black uppercase">Shift Incharge</div>
                </div>
            </div>
        </div>
    );
};
