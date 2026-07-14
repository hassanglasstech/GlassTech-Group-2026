import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Printer, Loader2 } from 'lucide-react';
import { NipponPrintTemplate } from './NipponPrintTemplate';
import { exportElementToPdf } from '../../shared/utils/pdfExport';
import { Quotation, Client, Product } from '../../shared/types';
import { toast } from 'sonner';

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
 * On-screen preview of a Nippon quotation / sales order with a reliable
 * "Download PDF" (client-side generation) + a Print fallback. Solves mobile,
 * where the browser's print → Save-as-PDF path produces blank pages.
 */
export const NipponDocPreview: React.FC<Props> = ({
  printingQuote, clients, products, printType = 'Glasstech', printMode, fileName, onClose,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const isSO = printMode === 'SalesOrder' || printingQuote.status === 'Approved';
  const docName = fileName || `${isSO ? 'SalesOrder' : 'Quotation'}-${printingQuote.orderNo || printingQuote.id}`;

  const handleDownload = async () => {
    if (!sheetRef.current || busy) return;
    setBusy(true);
    try {
      await exportElementToPdf(sheetRef.current, docName);
    } catch (e: unknown) {
      toast.error('PDF banane me masla — dobara koshish karein.');
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = () => {
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
          <button onClick={handleDownload} disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm transition-all">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {busy ? 'Ban raha…' : 'PDF Download'}
          </button>
          <button onClick={handlePrint} title="Print"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm transition-all">
            <Printer size={14} /> Print
          </button>
          <button onClick={onClose} title="Close"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all"><X size={16} /></button>
        </div>
      </div>

      {/* Scrollable preview — fills the screen on-screen; collapses to normal flow
          on print (see .pdf-preview-scroll @media print) so only the sheet prints.
          The sheet is at natural A4 width; the PDF is generated from this node. */}
      <div className="pdf-preview-scroll fixed inset-0 z-[10000] overflow-auto pt-16 pb-6 px-2 sm:px-6">
        <div ref={sheetRef} className="pdf-preview mx-auto w-fit bg-white shadow-2xl">
          <NipponPrintTemplate
            printingQuote={printingQuote}
            clients={clients}
            products={products}
            printType={printType}
            printMode={printMode}
          />
        </div>
      </div>
    </>,
    document.body,
  );
};
