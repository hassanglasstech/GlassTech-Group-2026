import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { NipponPrintTemplate } from './NipponPrintTemplate';
import { Quotation, Client, Product } from '../../shared/types';

interface Props {
  printingQuote: Quotation;
  clients: Client[];
  products?: Product[];
  printType?: 'KinLong' | 'Glasstech' | 'General';
  printMode?: 'Quotation' | 'SalesOrder';
  fileName?: string;
  onClose: () => void;
}

/**
 * On-screen preview of a Nippon quotation / sales order, with Print.
 *
 * This used to also generate the PDF itself (html2canvas → jsPDF) with
 * hand-computed page cuts, a repeated-header stamp and a snapped sheet height.
 * That writer had to predict the browser's layout, and every print defect —
 * drifting title pill, stranded footer, page-2 header, blank pages, a two-item
 * quote spilling to two pages — came from the prediction being slightly wrong.
 * It is gone. The document now prints through the browser, exactly like Glassco,
 * which is the one Nippon print path that has always been correct.
 *
 * To send a customer a PDF: Print → "Save as PDF" in the print dialog.
 */
export const NipponDocPreview: React.FC<Props> = ({
  printingQuote, clients, products, printType = 'Glasstech', printMode, fileName, onClose,
}) => {
  const isSO = printMode === 'SalesOrder' || printingQuote.status === 'Approved';
  const docName = fileName || `${isSO ? 'SalesOrder' : 'Quotation'}-${printingQuote.orderNo || printingQuote.id}`;

  const handlePrint = () => {
    // The document title becomes the default filename in "Save as PDF".
    const prev = document.title;
    document.title = docName;
    window.print();
    document.title = prev;
  };

  return createPortal(
    <>
      {/* Backdrop + toolbar — hidden on print */}
      <div className="fixed inset-0 z-[9998] bg-slate-900/80 no-print" onClick={onClose} />
      <div className="fixed top-0 inset-x-0 z-[10001] flex items-center justify-between gap-2 px-3 py-2.5 bg-white border-b border-slate-200 shadow-sm no-print">
        <span className="font-black text-[11px] uppercase tracking-widest text-slate-600 truncate">{docName}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline text-[10px] font-bold text-slate-400">
            PDF chahiye? Print → &quot;Save as PDF&quot;
          </span>
          <button onClick={handlePrint} title="Print"
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm transition-all">
            <Printer size={14} /> Print
          </button>
          <button onClick={onClose} title="Close"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all"><X size={16} /></button>
        </div>
      </div>

      {/* Scrollable preview shell.
          The ID is load-bearing: index.css hides every `[class*="fixed"]` element
          when printing, and this container carries Tailwind's `fixed`. That rule
          is `!important` at (0,3,0), so only an ID selector can outrank it — see
          #nippon-preview-shell in NipponPrintTemplate's PRINT_STYLES. Without it
          the whole preview, sheet included, printed as nothing. */}
      <div id="nippon-preview-shell" className="pdf-preview-scroll fixed inset-0 z-[10000] overflow-auto pt-16 pb-6 px-2 sm:px-6">
        <div className="mx-auto w-fit">
          {/* Mirrors the printed page on screen: A4 width, and the same margin
              `@page` reserves, so what is previewed is what comes out. */}
          <div className="nippon-preview bg-white shadow-2xl" style={{ width: '210mm', padding: '10mm 12mm' }}>
            <NipponPrintTemplate
              printingQuote={printingQuote}
              clients={clients}
              products={products}
              printType={printType}
              printMode={printMode}
            />
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
};
