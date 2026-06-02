
import React from 'react';
import { Quotation, ProductionPiece, Product } from '../../shared/types';

interface Props {
    quote: Quotation;
    clientName: string;
    pieces: ProductionPiece[];
    products: Product[];
}

export const NipponJobCardPrint: React.FC<Props> = ({ quote, clientName, pieces, products }) => {
    const items = quote.items || [];
    const jobPieces = (pieces || []).filter(p => p.orderId === quote.orderNo);
    const displayId = quote.orderNo || quote.id;

    return (
        <div className="print-only bg-white text-black p-0 font-sans leading-tight min-h-screen flex flex-col">
            <style>{`
                @media screen {
                    .print-only { display: none !important; }
                }
                @media print {
                    @page { 
                        size: A4; 
                        margin: 10mm 12mm; 
                    }
                    body {
                        margin: 10mm 12mm;
                        padding: 0;
                    }
                    html, body { height: auto !important; overflow: visible !important; background: white !important; }
                    .no-print { display: none !important; }
                    .print-only { 
                        display: block !important; 
                        position: absolute !important; 
                        top: 0 !important; 
                        left: 0 !important; 
                        width: 100% !important; 
                        padding: 8mm !important;
                        box-sizing: border-box !important;
                        background: white !important; 
                        z-index: 99999 !important; 
                    }
                    table { border-collapse: collapse !important; width: 100%; }
                    th, td { border: 2px solid black !important; }
                }
            `}</style>
            
            <div className="w-full">
                <div className="border-b-4 border-black pb-2 mb-6 flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-black uppercase">NIPPON JOB CARD</h1>
                        <p className="text-sm font-bold text-slate-600">PRODUCTION FACILITY COPY</p>
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
                    const printableItems: any[] = [];
                    items.forEach((item, itemIdx) => {
                        if (item.isSection) {
                            printableItems.push({ isSection: true, description: item.description });
                        }
                        const itemPieces = jobPieces.filter(p => p.itemIndex === itemIdx);
                        const displaySize = item.inputUnit === 'MM' 
                            ? `${item.mmW || 0} x ${item.mmH || 0}`
                            : `${item.inchW}.${item.sootW || 0} x ${item.inchH}.${item.sootH || 0}`;

                        itemPieces.forEach(p => {
                            printableItems.push({
                                isPiece: true,
                                pId: p.id,
                                displaySize,
                                unitLabel: item.inputUnit === 'MM' ? 'MM' : 'INCH',
                                materialSpec: p.specs,
                                itemDescription: item.description,
                                services: 'NONE' // Nippon doesn't show services in job card as per request
                            });
                        });
                    });

                    const MAX_ROWS = 25;
                    const chunks: any[][] = [];
                    let currentChunk: any[] = [];

                    printableItems.forEach(item => {
                        currentChunk.push(item);
                        if (currentChunk.length === MAX_ROWS) {
                            chunks.push(currentChunk);
                            currentChunk = [];
                        }
                    });

                    if (currentChunk.length > 0) {
                        const emptyNeeded = MAX_ROWS - currentChunk.length;
                        for (let i = 0; i < emptyNeeded; i++) {
                            currentChunk.push({ isEmpty: true });
                        }
                        chunks.push(currentChunk);
                    }

                    let serialCounter = 0;

                    return chunks.map((chunk, chunkIdx) => (
                        <div key={chunkIdx} className={chunkIdx > 0 ? 'page-break-before mt-8' : ''}>
                            <table className="w-full text-left border-2 border-black text-xs table-fixed">
                                <thead className="bg-slate-200">
                                    <tr>
                                        <th className="p-2 border-2 border-black w-[5%] text-center">#</th>
                                        <th className="p-2 border-2 border-black w-[15%]">Tag ID</th>
                                        <th className="p-2 border-2 border-black w-[20%] text-center">Size (W x H)</th>
                                        <th className="p-2 border-2 border-black w-[25%]">Material Spec</th>
                                        <th className="p-2 border-2 border-black w-[15%]">Description</th>
                                        <th className="p-2 border-2 border-black w-[20%]">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {chunk.map((item, idx) => {
                                        if (item.isEmpty) {
                                            return (
                                                <tr key={`empty-${idx}`} className="h-[38px]">
                                                    <td className="p-2 border-2 border-black">&nbsp;</td>
                                                    <td className="p-2 border-2 border-black">&nbsp;</td>
                                                    <td className="p-2 border-2 border-black">&nbsp;</td>
                                                    <td className="p-2 border-2 border-black">&nbsp;</td>
                                                    <td className="p-2 border-2 border-black">&nbsp;</td>
                                                    <td className="p-2 border-2 border-black">&nbsp;</td>
                                                </tr>
                                            );
                                        }

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
                                                    {item.displaySize} <span className="text-[9px] text-slate-500 font-bold ml-1">{item.unitLabel}</span>
                                                </td>
                                                <td className="p-2 border-2 border-black font-bold uppercase">
                                                    {item.materialSpec}
                                                </td>
                                                <td className="p-2 border-2 border-black font-bold uppercase">
                                                    {item.itemDescription}
                                                </td>
                                                <td className="p-2 border-2 border-black font-bold text-[10px] uppercase">
                                                    {/* Status column instead of services */}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ));
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
