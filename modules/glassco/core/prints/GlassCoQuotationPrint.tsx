import React, { useMemo } from 'react';
import { Quotation } from '@/modules/shared/types';
import { formatGlassDescription, formatGlassSize, formatServices } from '../utils/printUtils';

interface Props {
    quote: Quotation;
    clientName: string;
}

const SERVICE_FULL_NAMES: Record<string, string> = {
    'T/G': 'Tempered',
    'P/E': 'Machine Polishing',
    'P/F': 'Flat Polishing',
    'R/D': 'Rough Grinding',
    'Notch': 'CNC Notching',
    'Holes': 'Drilled Holes',
    'Double Glaze': 'Double Glazing',
    'D/G': 'Double Glazing',
    'L/G': 'Lamination',
    'Frosted': 'Frosting'
};

export const GlassCoQuotationPrint: React.FC<Props> = ({ quote, clientName }) => {
    const subTotal = quote.items.reduce((s, i) => s + i.amount, 0);
    const discountAmount = quote.discountAmount !== undefined && quote.discountAmount > 0 
        ? quote.discountAmount 
        : (subTotal * (quote.discountPercent || 0)) / 100;
    const netAmount = subTotal - discountAmount;
    const advanceAmount = netAmount * 0.5;

    // Display Logic for ID: Show the ID as is (QT, SO, or DRF)
    const displayId = quote.orderNo || quote.id;

    // Calculate Summary Bar metrics
    const summary = useMemo(() => {
        const stats = {
            totalQty: 0,
            totalSqFt: 0,
            breakdown: {} as Record<string, number>
        };

        quote.items.forEach(item => {
            if (item.isSection) return;
            const qty = Number(item.qty) || 0;
            stats.totalQty += qty;
            stats.totalSqFt += (Number(item.totalSqFt) || 0);
            
            const isTempered = item.selectedServices?.some(s => s === 'T/G' || s === 'Tempered');
            const glassTypeDisplay = (item.glassType === 'Plain' && isTempered) ? 'Clear' : item.glassType;

            const key = [item.glassSize, item.glassColor, item.subCategory, glassTypeDisplay]
                .filter(p => p && p !== 'N/A' && p !== 'Standard')
                .join(' ')
                .toUpperCase();
            stats.breakdown[key] = (stats.breakdown[key] || 0) + qty;
        });

        return stats;
    }, [quote.items]);

    return (
        <div className="print-only bg-white text-black p-0 font-sans leading-tight">
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
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        background: white;
                        z-index: 99999;
                    }
                    .print-container { 
                        width: 100% !important; 
                        padding: 15mm !important; 
                        box-sizing: border-box !important;
                    }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    
                    .bg-slate-50 { background-color: #f8fafc !important; }
                    .bg-slate-100 { background-color: #f1f5f9 !important; }
                    .bg-slate-900 { background-color: #0f172a !important; }
                    .text-slate-400 { color: #94a3b8 !important; }
                    .text-slate-500 { color: #64748b !important; }
                    .text-slate-900 { color: #0f172a !important; }
                    .border-slate-200 { border-color: #e2e8f0 !important; }
                    .border-slate-300 { border-color: #cbd5e1 !important; }
                    
                    table { page-break-inside: auto; width: 100% !important; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    .page-break-before { page-break-before: always; }
                }
                .font-pill { border: 1.5px solid #1e293b; border-radius: 9999px; padding: 2px 30px; font-weight: 900; letter-spacing: 0.1em; }
            `}</style>
            
            <div className="print-container">
                {/* Header Section - Compact */}
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tighter text-slate-900">GlassTech</h1>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500">Complete Architectural Glass Solutions</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-2xl font-bold tracking-tighter text-slate-900">GlassCo</h2>
                        <p className="text-[8px] font-bold text-slate-800">Contact: 0303-2428128</p>
                    </div>
                </div>

                {/* Pill Title - Compact */}
                <div className="flex justify-center my-2">
                    <div className="font-pill text-[10px] uppercase text-slate-900">Q U O T A T I O N</div>
                </div>

                {/* Inquiry Info Row - Compact */}
                <div className="flex justify-between mb-3 text-[9px]">
                    <div className="space-y-0.5">
                        <p className="text-slate-400 font-bold uppercase tracking-tighter text-[7px]">INQUIRY FROM:</p>
                        <h3 className="text-lg font-black text-slate-900 leading-none uppercase">{clientName}</h3>
                        <p className="text-blue-700 font-black uppercase text-[8px]">{quote.projectName || 'STANDARD ORDER'}</p>
                    </div>
                    <div className="text-right space-y-0.5">
                        <div className="flex justify-end space-x-2">
                            <span className="text-slate-400 font-bold uppercase">REF NO:</span>
                            <span className="text-blue-700 font-black">{displayId}</span>
                        </div>
                        <div className="flex justify-end space-x-2">
                            <span className="text-slate-400 font-bold uppercase">DATE:</span>
                            <span className="font-black text-slate-700">{quote.date}</span>
                        </div>
                        {quote.dueDate && (
                            <div className="flex justify-end space-x-2">
                                <span className="text-slate-400 font-bold uppercase">DUE DATE:</span>
                                <span className="font-black text-rose-600">{quote.dueDate}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Summary Metrics Bar - Compact */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 mb-3 flex items-center justify-between">
                    <div className="flex space-x-4 border-r border-slate-200 pr-4">
                        <div>
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Total Qty</p>
                            <p className="text-sm font-black text-slate-900">{summary.totalQty} <span className="text-[8px] text-slate-400 font-normal">Pcs</span></p>
                        </div>
                        <div>
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Total Area</p>
                            <p className="text-sm font-black text-blue-700">{summary.totalSqFt.toFixed(2)} <span className="text-[8px] text-slate-400 font-normal">Sq.Ft</span></p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 justify-end flex-1 pl-4">
                        {Object.entries(summary.breakdown).map(([key, val]) => (
                            <div key={key} className="flex items-center space-x-1 bg-white border border-slate-100 rounded px-1.5 py-0.5">
                                <span className="text-[7px] font-black text-slate-400 uppercase">{key}:</span>
                                <span className="text-[8px] font-black text-slate-700">{val}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Items Table */}
                <div className="mt-2">
                    {(() => {
                        const MAX_ROWS = 25;
                        const chunks: any[][] = [];
                        let currentChunk: any[] = [];
                        let serialNum = 0;

                        quote.items.forEach((item, index) => {
                            currentChunk.push(item);
                            if (currentChunk.length === MAX_ROWS && index < quote.items.length - 1) {
                                chunks.push(currentChunk);
                                currentChunk = [];
                            }
                        });
                        if (currentChunk.length > 0) chunks.push(currentChunk);

                        const isMM = quote.items.some(i => !i.isSection && (i.mmW || i.mmH));
                        return chunks.map((chunk, chunkIdx) => (
                            <div key={chunkIdx} className={chunkIdx > 0 ? 'page-break-before mt-8' : ''}>
                                <table className="w-full text-left border-collapse text-[10px] table-fixed">
                                    <thead>
                                        <tr className="bg-slate-50 border-y border-slate-300 text-[9px] font-black uppercase text-slate-600">
                                            <th className="py-2 px-2 text-center w-[5%]">S.No</th>
                                            <th className="py-2 px-2 w-[40%]">Description & Specifications</th>
                                            <th className="py-2 px-2 text-center w-[15%]">Size ({isMM ? 'mm' : 'Inches'})</th>
                                            <th className="py-2 px-2 text-center w-[8%]">Qty</th>
                                            <th className="py-2 px-2 text-center w-[10%]">Sq.Ft</th>
                                            <th className="py-2 px-2 text-right w-[10%]">Rate</th>
                                            <th className="py-2 px-2 text-right w-[12%]">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {chunk.map((item, idx) => {
                                            if (!item.isSection) serialNum++;
                                            
                                            if (item.isSection) {
                                                return (
                                                    <tr key={idx} className="bg-slate-100 border-y border-slate-300">
                                                        <td colSpan={7} className="py-1.5 px-4 font-black uppercase tracking-widest text-slate-700 italic text-[9px]">
                                                            {item.description}
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            const servicesList = formatServices(item.selectedServices);

                                            const isDoubleGlazed = item.selectedServices?.some((s: string) => s === 'Double Glaze' || s === 'D/G' || s === 'Double Glazing');
                                            const qtyDisplay = isDoubleGlazed ? `${item.qty} Set` : item.qty;

                                            const description = formatGlassDescription(item);
                                            const displaySize = formatGlassSize(item);

                                            return (
                                                <tr key={idx} className="break-inside-avoid">
                                                    <td className="py-2 px-2 text-center text-slate-400 font-bold border-r border-slate-100">{serialNum}</td>
                                                    <td className="py-2 px-2 border-r border-slate-100">
                                                        <p className="font-black text-slate-800 uppercase leading-tight text-[10px]">
                                                            {description}
                                                        </p>
                                                        <p className="text-[7px] font-bold text-blue-700 uppercase mt-0.5 tracking-tighter">
                                                            {servicesList}
                                                        </p>
                                                    </td>
                                                    <td className="py-2 px-2 text-center font-bold text-slate-700 text-[8px] border-r border-slate-100">
                                                        {displaySize}
                                                    </td>
                                                    <td className="py-2 px-2 text-center font-black text-slate-900 text-[10px] border-r border-slate-100">{qtyDisplay}</td>
                                                    <td className="py-2 px-2 text-center font-bold text-slate-500 text-[8px] border-r border-slate-100">{item.totalSqFt}</td>
                                                    <td className="py-2 px-2 text-right font-bold text-slate-600 text-[9px] border-r border-slate-100">{item.pricePerUnit.toLocaleString()}</td>
                                                    <td className="py-2 px-2 text-right font-black text-slate-900 text-[10px]">{item.amount.toLocaleString()}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {chunkIdx === chunks.length - 1 && (
                                    <div className="mt-4 pt-2 border-t border-slate-900 break-inside-avoid">
                                        <div className="flex justify-between items-start">
                                            <div className="w-[60%]">
                                                <h4 className="text-[8px] font-black uppercase tracking-widest text-slate-900 mb-1 border-b border-slate-100 pb-0.5">Protocol & Terms</h4>
                                                <ul className="text-[7.5px] space-y-0.5 text-slate-600 font-bold leading-tight">
                                                    <li className="flex items-start space-x-1">
                                                        <span className="text-slate-300">•</span>
                                                        <span>Rates valid for 3 days. Rounding protocol applies.</span>
                                                    </li>
                                                    <li className="flex items-start space-x-1">
                                                        <span className="text-slate-300">•</span>
                                                        <span>No return or exchange once glass is cut.</span>
                                                    </li>
                                                    <li className="flex items-start space-x-1">
                                                        <span className="text-rose-500">•</span>
                                                        <span className="text-slate-900">50% Advance mandatory to initiate production.</span>
                                                    </li>
                                                </ul>
                                            </div>

                                            <div className="w-[35%] space-y-1">
                                                <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                                                    <span>Gross:</span>
                                                    <span>PKR {(Number(subTotal) || 0).toLocaleString()}</span>
                                                </div>
                                                {(quote.discountAmount || quote.discountPercent) > 0 && (
                                                    <div className="flex justify-between text-[9px] font-bold text-indigo-600 uppercase tracking-tighter">
                                                        <span>Disc:</span>
                                                        <span>- {(Number(discountAmount) || 0).toLocaleString()}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-end pt-1 border-t border-slate-200">
                                                    <span className="text-[10px] font-black uppercase text-slate-900 tracking-tighter">Net:</span>
                                                    <span className="text-lg font-black text-slate-900">PKR {(Number(netAmount) || 0).toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between items-end pt-1">
                                                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-tighter">50% Advance:</span>
                                                    <span className="text-[11px] font-black text-slate-700">PKR {(netAmount / 2).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6 text-center">
                                            <p className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-300 italic">
                                                Computer generated document. No signature required.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ));
                    })()}
                </div>

                {/* Footer Section - Dynamic Positioning */}
                <div className="mt-4 pt-2 border-t border-slate-900 break-inside-avoid">
                    <div className="flex justify-between items-start">
                        <div className="w-[60%]">
                            <h4 className="text-[8px] font-black uppercase tracking-widest text-slate-900 mb-1 border-b border-slate-100 pb-0.5">Protocol & Terms</h4>
                            <ul className="text-[7.5px] space-y-0.5 text-slate-600 font-bold leading-tight">
                                <li className="flex items-start space-x-1">
                                    <span className="text-slate-300">•</span>
                                    <span>Rates valid for 3 days. Rounding protocol applies.</span>
                                </li>
                                <li className="flex items-start space-x-1">
                                    <span className="text-slate-300">•</span>
                                    <span>No return or exchange once glass is cut.</span>
                                </li>
                                <li className="flex items-start space-x-1">
                                    <span className="text-rose-500">•</span>
                                    <span className="text-slate-900">50% Advance mandatory to initiate production.</span>
                                </li>
                            </ul>
                        </div>

                        <div className="w-[35%] space-y-1">
                            <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                                <span>Gross:</span>
                                <span>PKR {(Number(subTotal) || 0).toLocaleString()}</span>
                            </div>
                            {(quote.discountAmount || quote.discountPercent) > 0 && (
                                <div className="flex justify-between text-[9px] font-bold text-indigo-600 uppercase tracking-tighter">
                                    <span>Disc:</span>
                                    <span>- {(Number(discountAmount) || 0).toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-end pt-1 border-t border-slate-200">
                                <span className="text-[10px] font-black uppercase text-slate-900 tracking-tighter">Net:</span>
                                <span className="text-lg font-black text-slate-900">PKR {(Number(netAmount) || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-end pt-1">
                                <span className="text-[9px] font-black uppercase text-slate-500 tracking-tighter">50% Advance:</span>
                                <span className="text-[11px] font-black text-slate-700">PKR {(netAmount / 2).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 text-center">
                        <p className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-300 italic">
                            Computer generated document. No signature required.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
