
import React from 'react';
import { Quotation, Client, ProductionPiece, Product } from '../../shared/types';
import { NipponQuotationPrint } from './NipponQuotationPrint';
import { NipponSalesOrderPrint } from './NipponSalesOrderPrint';
import { NipponJobCardPrint } from './NipponJobCardPrint';
import { SalesService } from '../../sales/services/salesService';

interface Props {
    printingQuote: Quotation;
    clients: Client[];
    pieces?: ProductionPiece[];
    products?: Product[];
    printMode?: 'Quotation' | 'SalesOrder' | 'JobCard';
    printType?: 'KinLong' | 'Glasstech' | 'General';
}

/**
 * Print CSS for every Nippon document — modelled directly on GlasscoPrintTemplate,
 * whose output has always been correct.
 *
 * The rule this file exists to enforce: THE BROWSER PAGINATES, NOT US.
 * Nippon previously carried a fixed 210×297mm sheet, hand-computed page cuts and
 * an html2canvas → jsPDF writer that had to predict the browser's layout. Every
 * print defect traced back to that prediction being slightly wrong. Here the
 * document is one ordinary table: `thead` repeats itself on every page, `tr`
 * never splits, and `@page` reserves the margin on every page — all natively.
 *
 * Everything is namespaced under `#nippon-print-root` for the same reason Glassco
 * namespaces its own: the generic `.print-only` / `.print-container` rules in
 * index.css cannot then fight these, which is exactly how the blank-page bug got in.
 */
const PRINT_STYLES = `
  .nippon-print-page { display: none !important; }
  /* On-screen preview shell (NipponDocPreview) shows the same sheet. */
  .nippon-preview .nippon-print-page { display: block !important; }

  @media print {
    html, body, #root, #__next, main {
      height: auto !important; min-height: auto !important; max-height: none !important;
      overflow: visible !important; position: static !important; display: block !important;
    }
    body > div, #root > div, #root > div > div, #root > div > main,
    .h-screen, .max-h-screen, .min-h-screen, .h-full,
    .overflow-hidden, .overflow-y-auto, .overflow-x-auto, .overflow-auto {
      height: auto !important; min-height: auto !important; max-height: none !important;
      overflow: visible !important; position: static !important; display: block !important;
    }
    /* The margin lives on @page, so the browser reserves it on EVERY page. Nippon
       used to put it on <body>, which only indents the first page — that is why
       page 2 started hard against the paper edge. */
    @page { size: A4; margin: 10mm 12mm; }
    body * { visibility: hidden !important; }
    #nippon-print-root, #nippon-print-root * { visibility: visible !important; }
    .no-print, nav, aside, header, footer,
    [class*="sidebar"], [class*="topbar"], [class*="navbar"], [class*="bottom-nav"] { display: none !important; }
    /* The preview modal's scroll shell. index.css hides every [class*="fixed"]
       element when printing and this container carries Tailwind's \`fixed\`, so the
       ENTIRE preview — sheet included — was being display:none'd and the browser
       printed nothing. That rule is !important at (0,3,0); only an ID outranks it.
       Also un-fix and un-clip it, or the sheet prints as one clipped viewport. */
    #nippon-preview-shell {
      display: block !important; position: static !important; inset: auto !important;
      overflow: visible !important; padding: 0 !important; z-index: auto !important;
      width: 100% !important; height: auto !important; max-height: none !important;
    }
    #nippon-preview-shell > div, #nippon-preview-shell .nippon-preview {
      width: 100% !important; max-width: none !important; margin: 0 !important;
      padding: 0 !important; box-shadow: none !important;
    }
    #nippon-print-root {
      display: block !important; position: static !important; width: 100% !important;
      height: auto !important; overflow: visible !important; background: white !important;
    }
    #nippon-print-root .nippon-print-page {
      display: block !important; position: static !important; width: 100% !important;
      height: auto !important; min-height: 0 !important; overflow: visible !important; background: white !important;
    }
    /* Defuse the generic index.css print rules inside our scope. Absolutely
       positioning a nested wrapper pulls the sheet's content out of flow and the
       page comes out blank. */
    #nippon-print-root .print-only, #nippon-print-root .print-container {
      position: static !important; top: auto !important; left: auto !important;
      width: 100% !important; min-height: 0 !important;
    }
    /* The whole point: native pagination. */
    #nippon-print-root table { width: 100% !important; border-collapse: collapse !important; page-break-inside: auto !important; }
    #nippon-print-root thead { display: table-header-group !important; }
    #nippon-print-root tfoot { display: table-footer-group !important; }
    #nippon-print-root tbody { display: table-row-group !important; }
    #nippon-print-root tr { page-break-inside: avoid !important; break-inside: avoid !important; page-break-after: auto !important; }
    #nippon-print-root td, #nippon-print-root th { page-break-inside: avoid !important; break-inside: avoid !important; }
    #nippon-print-root .print-footer { break-inside: avoid !important; page-break-inside: avoid !important; }
    #nippon-print-root *, #nippon-print-root { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .bg-slate-50 { background-color: #f8fafc !important; }
    .bg-slate-100 { background-color: #f1f5f9 !important; }
    .bg-slate-200 { background-color: #e2e8f0 !important; }
    .bg-slate-900 { background-color: #0f172a !important; }
    .bg-amber-100 { background-color: #fef3c7 !important; }
    .bg-amber-500 { background-color: #f59e0b !important; }
    .bg-blue-100  { background-color: #dbeafe !important; }
    .text-slate-400 { color: #94a3b8 !important; }
    .text-slate-500 { color: #64748b !important; }
    .text-slate-600 { color: #475569 !important; }
    .text-slate-900 { color: #0f172a !important; }
    .text-blue-700  { color: #1d4ed8 !important; }
    .text-rose-600  { color: #e11d48 !important; }
    .border-slate-200 { border-color: #e2e8f0 !important; }
    .border-slate-300 { border-color: #cbd5e1 !important; }
    .border-slate-900 { border-color: #0f172a !important; }
  }
  /* Vertical centring by line-height only — a line box that IS the content
     height. Kept from the previous build: it is the one centring construct that
     survived every renderer we tested. */
  .font-pill { display: inline-block; padding: 0 30px; line-height: 19px; border: 1.5px solid #1e293b; border-radius: 9999px; font-weight: 900; letter-spacing: 0.1em; }
`;

export const NipponPrintTemplate: React.FC<Props> = ({
    printingQuote,
    clients,
    pieces,
    products,
    printMode = 'Quotation',
    printType = 'Glasstech'
}) => {
    const clientName = clients.find(c => c.id === printingQuote.clientId)?.name || 'Unknown Client';

    // Product master carries the image_url the prints resolve. Some callers (e.g.
    // the Sales-Order print path in SalesOrders.tsx) don't pass it — fall back to
    // the local product cache so images resolve on every print path.
    const prods = (products && products.length)
        ? products
        : SalesService.getProducts().filter(p => p.company === printingQuote.company);

    // Determine final mode based on input and status
    let finalMode = printMode;
    if (printingQuote.status === 'Approved' && printMode !== 'JobCard') {
        finalMode = 'SalesOrder';
    }

    let content;
    switch (finalMode) {
        case 'SalesOrder':
            content = <NipponSalesOrderPrint quote={printingQuote} clientName={clientName} printType={printType} products={prods} />;
            break;
        case 'JobCard':
            content = <NipponJobCardPrint quote={printingQuote} clientName={clientName} pieces={pieces || []} products={prods} />;
            break;
        default:
            content = <NipponQuotationPrint quote={printingQuote} clientName={clientName} printType={printType} products={prods} />;
    }

    return (
        <>
            {/* PRINT_STYLES is a module-level constant — no external input, so the
                React <style> text child carries no injection risk. */}
            <style>{PRINT_STYLES}</style>
            <div id="nippon-print-root">{content}</div>
        </>
    );
};
