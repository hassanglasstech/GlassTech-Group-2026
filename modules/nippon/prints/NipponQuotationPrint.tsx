
import React, { useMemo } from 'react';
import { Quotation, Product } from '../../shared/types';
import { ProductImage } from '../../shared/components/ProductImage';
import { NipponLetterhead, NipponContactFooter } from './NipponLetterhead';
import { getNipponTerms } from '../constants/nipponCompanyInfo';
import { BrandingService } from '../../shared/services/brandingService';
import { explodeSetLine, isSetLine } from '../utils/productSets';

interface Props {
    quote: Quotation;
    clientName: string;
    printType?: 'KinLong' | 'Glasstech' | 'General';
    products?: Product[];
}

export const NipponQuotationPrint: React.FC<Props> = ({ quote, clientName, printType = 'Glasstech', products = [] }) => {
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
    // GST prints ONLY when the company's "Show GST on prints" toggle is ON
    // (Admin → Branding). Then a per-quote override wins over the company rate.
    const _brand = BrandingService.getCachedBranding(quote.company);
    const taxPercent = _brand?.showGstOnInvoice ? (quote.taxPercent ?? (_brand.gstPercent || 0)) : 0;
    const taxableBase = subTotal - discountAmount;
    const taxAmount = Math.round((taxableBase * taxPercent) / 100);
    const netAmount = taxableBase + taxAmount;
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
                    /* Sheet snaps to a whole number of PDF pages so the flex spacer can
                       push the footer to the bottom of the last page. NipponDocPreview
                       publishes --snap-h; it must be a custom property and NOT an inline
                       min-height, or it outranks the @media print reset below and the
                       browser's own Print path emits blank pages. */
                    .print-container { min-height: var(--snap-h, 297mm); }
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
                    /* HIDE EVERYTHING ELSE.
                       visibility:hidden hides but STILL OCCUPIES SPACE. Once the
                       preview drops out of fixed positioning for printing, the hidden
                       app root (~910px) sat in the flow ahead of the sheet and the
                       browser printed a blank page before any content. Take the app
                       chrome out of the flow entirely so the sheet starts at the top
                       and still paginates normally (position:fixed would break that). */
                    #root, .no-print { display: none !important; }
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
                        min-height: 0 !important;   /* never carry the screen snap into paper */
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
                /* Vertical centring via line-height ONLY — no flex, no vertical padding.
                   html2canvas resolves neither flex centring nor padding+line-height
                   reliably, which made the oval's label drift in the PDF; a line box
                   that IS the content height is the one thing it always gets right. */
                .font-pill { display: inline-block; padding: 0 30px; line-height: 19px; border: 1.5px solid #1e293b; border-radius: 9999px; font-weight: 900; letter-spacing: 0.1em; }
            `}</style>
            
            <div className="print-container flex flex-col box-border p-[10mm]">
                {/* Header Section — shared branded letterhead */}
                <NipponLetterhead printType={printType} />

                {/* Pill Title - Compact */}
                <div className="my-2 text-center">
                    <div className="font-pill text-[10px] uppercase text-slate-900">Q U O T A T I O N</div>
                </div>

                {/* Inquiry Info Row — table + explicit line-heights, deliberately not
                    flex/space-y/leading-none. html2canvas ignores flex and guesses at
                    auto leading, which is what closed up the client-name → project gap
                    in the PDF while the preview stayed correct. */}
                <table className="mb-3 w-full border-collapse text-[9px]">
                    <tbody>
                        <tr>
                            <td className="align-top">
                                <p className="text-slate-400 font-bold uppercase tracking-tighter text-[7px] leading-[9px]">INQUIRY FROM:</p>
                                <h3 className="mt-[4px] text-lg font-black text-slate-900 uppercase leading-[21px]">{clientName}</h3>
                                <p className="mt-[4px] text-blue-700 font-black uppercase text-[8px] leading-[10px]">{quote.projectName || 'STANDARD ORDER'}</p>
                            </td>
                            <td className="align-top text-right">
                                <p className="leading-[12px]">
                                    <span className="text-slate-400 font-bold uppercase">REF NO:&nbsp;&nbsp;</span>
                                    <span className="text-blue-700 font-black">{displayId}</span>
                                </p>
                                {quote.isSample && (
                                    <p className="mt-[4px] leading-[14px]">
                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${quote.sampleType === 'Free' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                            {quote.sampleType === 'Free' ? 'FREE SAMPLE' : 'PAID SAMPLE'}
                                        </span>
                                    </p>
                                )}
                                <p className="mt-[4px] leading-[12px]">
                                    <span className="text-slate-400 font-bold uppercase">DATE:&nbsp;&nbsp;</span>
                                    <span className="font-black text-slate-700">{quote.date}</span>
                                </p>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* Summary Metrics Bar - Compact */}
                {/* Summary bar — table cells, not flex (see the inquiry row note). */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 mb-3">
                    <table className="w-full border-collapse">
                        <tbody>
                            <tr>
                                <td className="w-[110px] border-r border-slate-200 pr-4 align-middle">
                                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-[9px]">Total Items</p>
                                    <p className="mt-[2px] text-sm font-black text-slate-900 leading-[16px]">{summary.totalQty} <span className="text-[8px] text-slate-400 font-normal">Units</span></p>
                                </td>
                                <td className="pl-4 text-right align-middle leading-[14px]">
                                    {Object.entries(summary.breakdown).map(([key, val]) => (
                                        <span key={key} className="ml-1 inline-block bg-white border border-slate-100 rounded px-1.5 py-0.5 align-middle">
                                            <span className="text-[7px] font-black text-slate-400 uppercase">{key}:&nbsp;</span>
                                            <span className="text-[8px] font-black text-slate-700">{val}</span>
                                        </span>
                                    ))}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Main Items Table */}
                <div className="mt-2">
                    {(() => {
                        let serialNum = 0;
                        // Single continuous table → natural CSS pagination: the print CSS
                        // repeats <thead> on every page and never splits a row
                        // (tr { page-break-inside: avoid }). No hardcoded row-count, so it
                        // never needs re-alignment as the item count grows.
                        const MAX_ROWS = Number.MAX_SAFE_INTEGER;
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
                                            {/* border-b per row, NOT divide-y: divide-y only draws
                                                BETWEEN rows, so the last row on a page had no bottom
                                                line and its box never closed at the page break. */}
                                            <tbody>
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
                                                        <tr key={idx} className="border-b border-slate-200">
                                                            <td className="py-2 px-2 text-center text-slate-400 font-bold">{serialNum}</td>
                                                            <td className="py-2 px-2 text-center">
                                                                {/* Resolve robustly: stored url → bucket by product id (productRef →
                                                                    <id>.png/.jpg) → legacy NIP-KL-<code> → placeholder. The id path
                                                                    means the image shows even when the product master isn't loaded
                                                                    (e.g. the Sales-Order print path). */}
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
                                                                                {isSetLine(item) && <span className="ml-1.5 text-[7px] font-black uppercase tracking-widest bg-amber-500 text-white px-1 py-0.5 rounded align-middle">Set</span>}
                                                                                {item.isSample && <span className="ml-1.5 text-[7px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-1 py-0.5 rounded align-middle">Free Sample</span>}
                                                                            </p>
                                                                            {/* SET breakdown — the bundle is ONE priced line, so the
                                                                                contents are listed here with the quantity actually
                                                                                delivered (per set x line qty) and NO amount of their
                                                                                own. A table, not flex: html2canvas does not implement
                                                                                flex alignment, so the PDF would drift from the preview. */}
                                                                            {isSetLine(item) && (
                                                                                <table className="w-full border-collapse mt-1">
                                                                                    <tbody>
                                                                                        {explodeSetLine(item.setComponents, item.qty).map((c, ci) => (
                                                                                            <tr key={ci}>
                                                                                                <td className="py-[1px] pr-2 text-[8px] font-bold uppercase text-slate-500 leading-[11px] align-top">
                                                                                                    &bull; {c.description}{c.code ? ` (${c.code})` : ''}
                                                                                                </td>
                                                                                                <td className="py-[1px] w-14 text-right text-[8px] font-black text-slate-600 leading-[11px] align-top whitespace-nowrap">
                                                                                                    {c.totalQty} {c.unit}
                                                                                                </td>
                                                                                            </tr>
                                                                                        ))}
                                                                                    </tbody>
                                                                                </table>
                                                                            )}
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

                {/* Totals — right-aligned, values in ONE tabular column flush with the
                    Amount column. Gross/Disc/GST readable; Net Payable is the emphasis
                    line (solid rule above, accounting double-rule below). */}
                <div className="mt-3 flex justify-end break-inside-avoid">
                    <div className="w-[48%] min-w-[62mm]">
                        <div className="flex justify-between items-baseline py-[3px] text-[11px] font-bold text-slate-600">
                            <span className="uppercase tracking-wide">Gross Amount</span>
                            <span className="tabular-nums text-[12px] text-slate-900">PKR {subTotal.toLocaleString()}</span>
                        </div>
                        {discountAmount > 0 && (
                            <div className="flex justify-between items-baseline py-[3px] text-[11px] font-bold text-rose-600">
                                <span className="uppercase tracking-wide">Discount{quote.discountPercent ? ` (${Number(quote.discountPercent.toFixed(2))}%)` : ''}</span>
                                <span className="tabular-nums text-[12px]">− {discountAmount.toLocaleString()}</span>
                            </div>
                        )}
                        {taxAmount > 0 && (
                            <div className="flex justify-between items-baseline py-[3px] text-[11px] font-bold text-slate-600">
                                <span className="uppercase tracking-wide">GST ({Number(taxPercent.toFixed(2))}%)</span>
                                <span className="tabular-nums text-[12px] text-slate-900">+ {taxAmount.toLocaleString()}</span>
                            </div>
                        )}
                        <div className="mt-1 flex justify-between items-baseline border-t-2 border-slate-900 pt-2">
                            <span className="text-[13px] font-black uppercase tracking-wide text-slate-900">Net Payable</span>
                            <span className="text-[20px] leading-none font-black tabular-nums text-slate-900 whitespace-nowrap">PKR {netAmount.toLocaleString()}</span>
                        </div>
                        <div className="mt-1 border-b-4 border-double border-slate-900" />
                    </div>
                </div>

                {/* Spacer — grows to fill the leftover page height so the terms +
                    contact footer sink to the bottom of the sheet (like a real
                    letterhead footer) when the item list is short. On a multi-page
                    doc it collapses to zero and the block sits at the document end. */}
                <div className="grow" aria-hidden="true" />

                {/* Terms — full width, at the bottom */}
                <div className="mt-3 pt-2 border-t border-slate-200 break-inside-avoid">
                    <h4 className="text-[8px] font-black uppercase tracking-widest text-slate-900 mb-1">Protocol & Terms</h4>
                    <ul className="text-[9px] grid grid-cols-2 gap-x-6 gap-y-0.5 text-slate-600 font-bold leading-tight">
                        {getNipponTerms('quotation').map((t, i) => (
                            <li key={i} className="flex items-start space-x-1">
                                <span className="text-slate-300">•</span>
                                <span>{t}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Footer identity — contact + bank + catalogue QR + system line */}
                <div className="break-inside-avoid">
                    <NipponContactFooter emailKind="sales" showCatalogueQr />
                    <div className="mt-3 text-center">
                        <p className="text-[8.5px] font-black uppercase tracking-[0.2em] text-slate-400 italic">
                            Generated by Nippon ERP v1.0
                        </p>
                    </div>
                </div>
            </div>
        </div>
);
};
