
import React, { useMemo } from 'react';
import { Quotation, Product } from '../../shared/types';
import { ProductImage } from '../../shared/components/ProductImage';
import { NipponLetterhead, NipponContactFooter } from './NipponLetterhead';
import { getNipponTerms } from '../constants/nipponCompanyInfo';

interface Props {
    quote: Quotation;
    clientName: string;
    printType?: 'KinLong' | 'Glasstech' | 'General';
    products?: Product[];
}

export const NipponSalesOrderPrint: React.FC<Props> = ({ quote, clientName, printType = 'Glasstech', products = [] }) => {
    const items = quote.items || [];
    // Resolve the live product for a line so we can use its current image_url
    // (the form uploads NIP-KL-<code>.jpg), regardless of when the line was added.
    const prodFor = (it: { productRef?: string; locationCode?: string; description?: string }) =>
        products.find(p =>
            (it.productRef && p.id === it.productRef) ||
            // The Nippon line stores locationCode = product.profileCode (not modelNo),
            // so match on profileCode/id/modelNo, and fall back to an exact description
            // match — otherwise prodFor misses and the image never resolves.
            (it.locationCode && (p.profileCode === it.locationCode || p.modelNo === it.locationCode || p.id === it.locationCode)) ||
            (it.description && (p.description || '').toUpperCase() === it.description.toUpperCase()));
    const subTotal = items.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmount = quote.discountAmount !== undefined && quote.discountAmount > 0
        ? quote.discountAmount
        : (subTotal * (quote.discountPercent || 0)) / 100;
    const netAmount = subTotal - discountAmount;
    const advanceAmount = netAmount * 1.0; // Nippon usually 100% cash per terms

    const displayId = quote.orderNo || quote.id;

    const summary = useMemo(() => {
        const stats = {
            totalQty: 0,
            breakdown: {} as Record<string, number>
        };

        items.forEach(item => {
            if (item.isSection) return;
            const qty = Number(item.qty) || 0;
            stats.totalQty += qty;

            const key = (item.glassSize || 'PCS').toUpperCase();
            stats.breakdown[key] = (stats.breakdown[key] || 0) + qty;
        });

        return stats;
    }, [items]);

    // Header is the shared, branded <NipponLetterhead> (rendered in the JSX
    // below) — one letterhead across quote / SO / receipt, fed by Admin →
    // Branding Settings (logo, address, email, NTN/STRN). Replaces the old
    // text-only header + hand-typed KinLong SVG.

    return (
        <div className="print-only bg-white text-black p-0 font-sans leading-tight shadow-2xl print:shadow-none mx-auto print:m-0" style={{ width: '210mm', minHeight: '297mm' }}>
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
                        margin: 10mm 12mm;
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
                        height: auto;
                        background: white;
                        z-index: 99999;
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
                    .print-container { 
                        width: 100% !important; 
                        padding: 8mm !important; 
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
                    thead { display: table-header-group; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    .page-break-before { page-break-before: always; }
                }
                .font-pill { border: 1.5px solid #1e293b; border-radius: 9999px; padding: 2px 30px; font-weight: 900; letter-spacing: 0.1em; }
            `}</style>
            
            <div className="print-container p-[10mm]">
                {/* Header Section — shared branded letterhead */}
                <NipponLetterhead printType={printType} />

                {/* Pill Title - Compact */}
                <div className="flex justify-center my-2">
                    <div className="font-pill text-[10px] uppercase text-slate-900">S A L E S &nbsp; O R D E R</div>
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
                        {quote.isSample && (
                            <div className="flex justify-end">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${quote.sampleType === 'Free' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                    {quote.sampleType === 'Free' ? 'FREE SAMPLE' : 'PAID SAMPLE'}
                                </span>
                            </div>
                        )}
                        <div className="flex justify-end space-x-2">
                            <span className="text-slate-400 font-bold uppercase">DATE:</span>
                            <span className="font-black text-slate-700">{quote.date}</span>
                        </div>
                    </div>
                </div>

                {/* Summary Metrics Bar - Compact */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 mb-3 flex items-center justify-between">
                    <div className="flex space-x-4 border-r border-slate-200 pr-4">
                        <div>
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Total Items</p>
                            <p className="text-sm font-black text-slate-900">{summary.totalQty} <span className="text-[8px] text-slate-400 font-normal">Units</span></p>
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
                        let serialNum = 0;
                        const MAX_ROWS = 10;
                        const itemsToChunk = items;
                        const chunks: typeof items[] = [];
                        let currentChunk: typeof items = [];

                        itemsToChunk.forEach((item) => {
                            currentChunk.push(item);
                            if (currentChunk.length === MAX_ROWS) {
                                chunks.push(currentChunk);
                                currentChunk = [];
                            }
                        });
                        if (currentChunk.length > 0) {
                            chunks.push(currentChunk);
                        }

                        return (
                            <>
                                {chunks.map((chunk, chunkIdx) => (
                                    <div key={chunkIdx} className={chunkIdx > 0 ? 'page-break-before mt-8' : ''}>
                                        <table className="w-full text-left border-collapse text-[10px]">
                                            <thead>
                                                <tr className="bg-slate-50 border-y border-slate-300 text-[9px] font-black uppercase text-slate-600">
                                                    <th className="py-2 px-2 text-center w-8">S.No</th>
                                                    <th className="py-2 px-2 text-center w-20">Image</th>
                                                    <th className="py-2 px-2">Item Details</th>
                                                    <th className="py-2 px-2 text-center w-12">Unit</th>
                                                    <th className="py-2 px-2 text-center w-10">Qty</th>
                                                    <th className="py-2 px-2 text-right w-20">Rate</th>
                                                    <th className="py-2 px-2 text-right w-24">Amount</th>
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

                                                    return (
                                                        <tr key={idx}>
                                                            <td className="py-2 px-2 text-center text-slate-400 font-bold">{serialNum}</td>
                                                            <td className="py-2 px-2 text-center">
                                                                {/* Robust: stored url → bucket by product id (productRef →
                                                                    <id>.png/.jpg) → legacy NIP-KL-<code> → placeholder. The id path
                                                                    resolves the image even when the product master isn't loaded. */}
                                                                <div className="w-[60px] h-[60px] border border-slate-200 rounded overflow-hidden mx-auto bg-white flex items-center justify-center">
                                                                    <ProductImage id={prodFor(item)?.id || item.productRef}
                                                                        code={prodFor(item)?.modelNo || item.locationCode}
                                                                        url={prodFor(item)?.imageUrl || item.attachedImage}
                                                                        eager className="w-full h-full object-contain" iconSize={18} />
                                                                </div>
                                                            </td>
                                                            <td className="py-2 px-2">
                                                                {(() => {
                                                                    const raw = item.description ?? '';
                                                                    // New quotes: locationCode = modelNo, description = clean.
                                                                    // Old quotes: locationCode is empty, description = "Handle (CZS133-L55 | White)".
                                                                    // For old quotes, extract first token inside parens as the model no.
                                                                    const modelNo = item.locationCode
                                                                        || raw.match(/\(([^|)\s][^|)]*?)(?:\s*\|[^)]*)?\)/)?.[1]?.trim()
                                                                        || '';
                                                                    const cleanName = raw
                                                                        .replace(/^PCS\s+/i, '')
                                                                        .replace(/\s*\([^)]*\)\s*$/, '')
                                                                        .trim();
                                                                    return (
                                                                        <>
                                                                            {modelNo && (
                                                                                <p className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                                                                                    {modelNo}
                                                                                </p>
                                                                            )}
                                                                            <p className="font-black text-slate-800 uppercase leading-tight text-[10px] whitespace-pre-wrap">
                                                                                {cleanName}
                                                                                {item.isSample && <span className="ml-1.5 text-[7px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-1 py-0.5 rounded align-middle">Free Sample</span>}
                                                                            </p>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </td>
                                                            <td className="py-2 px-2 text-center font-bold text-slate-500 uppercase text-[9px]">{item.glassSize || 'PCS'}</td>
                                                            <td className="py-2 px-2 text-center font-black text-slate-900 text-[10px]">{item.qty}</td>
                                                            <td className="py-2 px-2 text-right font-bold text-slate-600 text-[9px]">{(item.pricePerUnit ?? item.rate ?? 0).toLocaleString()}</td>
                                                            <td className="py-2 px-2 text-right font-black text-slate-900 text-[10px]">{item.isSample ? 'FREE' : (item.amount ?? 0).toLocaleString()}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ))}
                            </>
                        );
                    })()}
                </div>

                {/* Footer Section */}
                <div className="mt-2 pt-2 border-t border-slate-200 break-inside-avoid">
                    <div className="flex justify-between items-start">
                        <div className="w-[60%]">
                            <h4 className="text-[8px] font-black uppercase tracking-widest text-slate-900 mb-1 border-b border-slate-100 pb-0.5">Protocol & Terms</h4>
                            <ul className="text-[9px] space-y-0.5 text-slate-600 font-bold leading-tight">
                                {getNipponTerms('salesOrder').map((t, i) => (
                                    <li key={i} className="flex items-start space-x-1">
                                        <span className="text-slate-300">•</span>
                                        <span>{t}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="w-[35%] space-y-1">
                            <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                                <span>Gross:</span>
                                <span>PKR {subTotal.toLocaleString()}</span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="flex justify-between text-[9px] font-bold text-rose-600 uppercase tracking-tighter">
                                    <span>Disc {quote.discountPercent ? `${Number(quote.discountPercent.toFixed(2))}%` : ''}:</span>
                                    <span>- {discountAmount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-end pt-1 border-t border-slate-200">
                                <span className="text-[10px] font-black uppercase text-slate-900 tracking-tighter">Net:</span>
                                <span className="text-lg font-black text-slate-900">PKR {netAmount.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <NipponContactFooter emailKind="sales" />

                    <div className="mt-6 text-center">
                        <p className="text-[8.5px] font-black uppercase tracking-[0.2em] text-slate-400 italic">
                            Computer generated document. No signature required.
                        </p>
                    </div>
                </div>
            </div>
        </div>
);
};
