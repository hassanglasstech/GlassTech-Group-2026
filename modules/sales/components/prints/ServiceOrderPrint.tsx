
import React, { useMemo } from 'react';
import { TemperingDispatch, ProductionPiece, Quotation } from '@/modules/shared/types';

interface Props {
    dispatch: TemperingDispatch;
    pieces: ProductionPiece[];
    jobOrders: Quotation[];
}

export const ServiceOrderPrint: React.FC<Props> = ({ dispatch, pieces, jobOrders }) => {
    // Filter pieces for this dispatch
    const dispatchPieces = pieces.filter(p => p.dispatchId === dispatch.id);

    // Calculate Summary Metrics
    const summary = useMemo(() => {
        const stats = {
            totalQty: dispatchPieces.length,
            totalSqFt: 0,
            breakdown: {} as Record<string, number>
        };

        dispatchPieces.forEach(p => {
            const order = jobOrders.find(o => o.orderNo === p.orderId);
            const item = order?.items[p.itemIndex];
            if (item) {
                const sqFt = (item.width * item.height) / 144;
                stats.totalSqFt += sqFt;
                
                // Breakdown by Glass Type
                const key = [item.glassSize, item.glassColor, item.subCategory, item.glassType]
                    .filter(x => x && x !== 'N/A' && x !== 'Standard')
                    .join(' ')
                    .toUpperCase();
                stats.breakdown[key] = (stats.breakdown[key] || 0) + 1;
            }
        });

        return stats;
    }, [dispatchPieces, jobOrders]);

    // Chunking Logic for Pagination
    const MAX_ROWS = 25;
    const chunks: typeof dispatchPieces[] = [];
    let currentChunk: typeof dispatchPieces = [];
    dispatchPieces.forEach((p) => {
        currentChunk.push(p);
        if (currentChunk.length === MAX_ROWS) {
            chunks.push(currentChunk);
            currentChunk = [];
        }
    });
    if (currentChunk.length > 0) chunks.push(currentChunk);

    return (
        <div className="print-only bg-white text-black p-0 font-sans leading-tight min-h-screen flex flex-col">
            <style>{`
                @media print {
                    @page { size: A4; margin: 0; }
                    body { margin: 0; padding: 0; }
                    html, body { height: auto !important; overflow: visible !important; background: white !important; }
                    /* HIDE EVERYTHING ELSE */
                    body * { visibility: hidden; }
                    /* SHOW PRINT CONTAINER */
                    .print-only, .print-only * { visibility: visible; }
                    .print-only { position: absolute; top: 0; left: 0; width: 100%; background: white; z-index: 99999; }
                    .print-container { width: 100% !important; padding: 15mm !important; box-sizing: border-box !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .bg-slate-50 { background-color: #f8fafc !important; }
                    .bg-slate-100 { background-color: #f1f5f9 !important; }
                    table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    .page-break-before { page-break-before: always; }
                }
                .font-pill-service { border: 2px solid #0f172a; border-radius: 9999px; padding: 6px 50px; font-weight: 900; letter-spacing: 0.2em; color: #0f172a; }
            `}</style>
            
            <div className="print-container">
                {/* Header Section */}
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tighter text-slate-900">GlassTech</h1>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Complete Architectural Glass Solutions</p>
                        <p className="text-[9px] font-medium text-slate-400">KORANGI INDUSTRIAL AREA, KARACHI.</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-4xl font-bold tracking-tighter text-slate-900">GlassCo</h2>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">GLASS PROCESSING UNIT</p>
                        <p className="text-[9px] font-bold text-slate-800">Contact: 0303-2428128</p>
                    </div>
                </div>

                {/* Pill Title */}
                <div className="flex justify-center my-6">
                    <div className="font-pill-service text-sm uppercase">S E R V I C E &nbsp; O R D E R</div>
                </div>

                {/* Info Row */}
                <div className="flex justify-between mb-6 text-[10px]">
                    <div className="space-y-1">
                        <p className="text-slate-400 font-bold uppercase tracking-tighter">VENDOR / PLANT:</p>
                        <h3 className="text-2xl font-black text-slate-900 leading-none uppercase">{dispatch.plantName}</h3>
                        <p className="text-indigo-700 font-black uppercase">Service Required: {dispatch.serviceType}</p>
                    </div>
                    <div className="text-right space-y-1">
                        <div className="flex justify-end space-x-2">
                            <span className="text-slate-400 font-bold uppercase">ORDER REF:</span>
                            <span className="text-blue-700 font-black">{dispatch.id}</span>
                        </div>
                        <div className="flex justify-end space-x-2">
                            <span className="text-slate-400 font-bold uppercase">DATE:</span>
                            <span className="font-black text-slate-700">{dispatch.date}</span>
                        </div>
                        <div className="flex justify-end space-x-2">
                            <span className="text-slate-400 font-bold uppercase">VEHICLE:</span>
                            <span className="font-black text-slate-900">{dispatch.vehicleNo}</span>
                        </div>
                    </div>
                </div>

                {/* Summary Metrics Bar */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex items-center justify-between">
                    <div className="flex space-x-8 border-r border-slate-200 pr-8">
                        <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Qty</p>
                            <p className="text-lg font-black text-slate-900">{summary.totalQty} <span className="text-[10px] text-slate-400">Pcs</span></p>
                        </div>
                        <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Ft²</p>
                            <p className="text-lg font-black text-blue-700">{summary.totalSqFt.toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Rate / Ft²</p>
                            <p className="text-lg font-black text-indigo-700">PKR {(dispatch.chargesPerSqFt || 0).toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Cost</p>
                            <p className="text-lg font-black text-emerald-700">PKR {(dispatch.totalCharges || Math.round(summary.totalSqFt * (dispatch.chargesPerSqFt || 0))).toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 justify-end flex-1 pl-6">
                        {Object.entries(summary.breakdown).slice(0, 6).map(([key, val]) => (
                            <div key={key} className="flex items-center space-x-1 bg-white border border-slate-200 rounded-md px-2 py-0.5">
                                <span className="text-[8px] font-black text-slate-400 uppercase">{key}:</span>
                                <span className="text-[10px] font-black text-slate-700 uppercase">{val}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Table Chunks */}
                <div className="flex-1">
                    {chunks.map((chunk, chunkIdx) => (
                        <div key={chunkIdx} className={chunkIdx > 0 ? 'page-break-before mt-8' : ''}>
                            <table className="w-full text-left border-collapse text-[10px]">
                                <thead>
                                    <tr className="bg-slate-50 border-y border-slate-300 text-[9px] font-black uppercase tracking-widest text-slate-600">
                                        <th className="py-2.5 px-2 text-center w-10">S.No</th>
                                        <th className="py-2.5 px-2">Description & Ref Order</th>
                                        <th className="py-2.5 px-2 text-center w-32">Size (Inches)</th>
                                        <th className="py-2.5 px-2 text-center w-16">Qty</th>
                                        <th className="py-2.5 px-2 text-center w-20">Process</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {chunk.map((p, idx) => {
                                        const order = jobOrders.find(o => o.orderNo === p.orderId);
                                        const item = order?.items[p.itemIndex];
                                        
                                        const description = item ? [item.glassSize, item.glassColor, item.subCategory, item.glassType]
                                            .filter(x => x && x !== 'N/A' && x !== 'Standard')
                                            .join(' ') : 'Unknown';

                                        return (
                                            <tr key={p.id}>
                                                <td className="py-2 px-2 text-center text-slate-400 font-bold">{chunkIdx * MAX_ROWS + idx + 1}</td>
                                                <td className="py-2 px-2">
                                                    <p className="font-black text-slate-800 uppercase leading-tight">{description}</p>
                                                    <p className="text-[7.5px] font-bold text-blue-600 uppercase mt-0.5 tracking-tighter">ID: {p.id}</p>
                                                    <p className="text-[7px] text-slate-400 font-bold uppercase italic">Ref: {p.orderId}</p>
                                                </td>
                                                <td className="py-2 px-2 text-center font-bold text-slate-700">
                                                    {item ? `${item.inchW}.${item.sootW || 0} x ${item.inchH}.${item.sootH || 0}` : '-'}
                                                </td>
                                                <td className="py-2 px-2 text-center font-black text-slate-900">1</td>
                                                <td className="py-2 px-2 text-center font-bold text-slate-600 uppercase">{dispatch.serviceType}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>

                {/* Footer Section */}
                <div className="mt-10 pt-6 border-t-2 border-slate-900 break-inside-avoid">
                    <div className="flex justify-between items-start">
                        <div className="w-[60%]">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 mb-3 border-b border-slate-200 pb-1">Service Instructions</h4>
                            <ul className="text-[9px] space-y-1.5 text-slate-600 font-bold leading-tight">
                                <li className="flex items-start space-x-2"><span className="text-slate-300">•</span><span>Please process according to specifications.</span></li>
                                <li className="flex items-start space-x-2"><span className="text-slate-300">•</span><span>Handle with care to avoid scratches/breakage.</span></li>
                                <li className="flex items-start space-x-2"><span className="text-rose-500">•</span><span className="text-slate-900 italic font-black uppercase">Urgent Delivery Requested.</span></li>
                            </ul>
                        </div>
                    </div>

                    <div className="mt-24 grid grid-cols-3 gap-10">
                        <div className="border-t border-slate-900 pt-2 text-center text-[9px] font-black uppercase text-slate-400">Authorized By</div>
                        <div className="border-t border-slate-900 pt-2 text-center text-[9px] font-black uppercase text-slate-400">Transporter</div>
                        <div className="border-t border-slate-900 pt-2 text-center text-[9px] font-black uppercase text-slate-900 font-black">Vendor Receiving</div>
                    </div>

                    <div className="mt-8 text-center">
                        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-300 italic">
                            Computer generated service order. Valid for Vendor Processing.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
