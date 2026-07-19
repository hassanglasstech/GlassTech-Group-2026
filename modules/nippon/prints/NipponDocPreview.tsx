import React, { useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Printer, Loader2, Share2 } from 'lucide-react';
import { NipponPrintTemplate } from './NipponPrintTemplate';
import { exportElementToPdf, elementToPdfFile, computePageCutsPx, PDF_CONTENT_H_MM, PDF_PAGE_W_MM } from '../../shared/utils/pdfExport';
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

  // Preview-only A4 page guides. Measure the rendered sheet and mark where each
  // A4 boundary falls (297mm expressed in the sheet's own px-per-mm), so the user
  // can SEE how many pages the document prints to while scrolling. The markers are
  // siblings of the sheet (never captured by html2canvas) and .no-print.
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [pageCount, setPageCount] = useState(1);
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const measure = (): void => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // Exactly the PDF writer's own pagination — row-aware seams, page 1 full
      // height, continuation pages minus the repeated column header — so a guide
      // sits precisely where the PDF splits.
      const pageH = (r.width * PDF_CONTENT_H_MM) / PDF_PAGE_W_MM;
      const thead = el.querySelector('thead');
      const headH = thead ? thead.getBoundingClientRect().height : 0;
      const cuts = computePageCutsPx(el, pageH, Math.max(1, pageH - headH));
      setPageBreaks(cuts.map((c) => Math.round(c)));
      setPageCount(cuts.length + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [printingQuote]);

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

  // Share the PDF (P1-8). On mobile the native share sheet attaches the real PDF
  // and lists WhatsApp directly; on desktop (no file-share) we download the PDF
  // and open WhatsApp Web to the client so they attach it — the trader's actual
  // send-a-quote workflow, in one tap.
  const handleShare = async () => {
    if (!sheetRef.current || busy) return;
    setBusy(true);
    try {
      const label = `${isSO ? 'Sales Order' : 'Quotation'} ${printingQuote.orderNo || printingQuote.id}`;
      const file = await elementToPdfFile(sheetRef.current, docName);
      const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
      if (typeof navigator.share === 'function' && nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: docName, text: label });
      } else {
        // Desktop fallback: download + open WhatsApp Web (prefilled) to the client.
        await exportElementToPdf(sheetRef.current, docName);
        const client = clients.find(c => c.id === printingQuote.clientId);
        const raw = (client?.phone || '').replace(/\D/g, '');
        const waPhone = raw ? (raw.startsWith('92') ? raw : `92${raw.replace(/^0/, '')}`) : '';
        const text = encodeURIComponent(`${label} — PDF attached.`);
        window.open(`https://wa.me/${waPhone}?text=${text}`, '_blank', 'noopener');
        toast.info('PDF download ho gaya — WhatsApp khul gaya, PDF attach kar ke bhej dein.', { duration: 7000 });
      }
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        toast.error('Share nahi ho saka — PDF download karke bhej dein.');
      }
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <>
      {/* Backdrop + toolbar — hidden on print */}
      <div className="fixed inset-0 z-[9998] bg-slate-900/80 no-print" onClick={onClose} />
      <div className="fixed top-0 inset-x-0 z-[10001] flex items-center justify-between gap-2 px-3 py-2.5 bg-white border-b border-slate-200 shadow-sm no-print">
        <span className="font-black text-[11px] uppercase tracking-widest text-slate-600 truncate">{docName}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleShare} disabled={busy} title="Share / WhatsApp"
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm transition-all">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
            Share
          </button>
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
        <div className="relative mx-auto w-fit">
          <div ref={sheetRef} className="pdf-preview w-fit bg-white shadow-2xl">
            <NipponPrintTemplate
              printingQuote={printingQuote}
              clients={clients}
              products={products}
              printType={printType}
              printMode={printMode}
            />
          </div>

          {/* A4 page guides — PREVIEW ONLY. Siblings of the sheet, so html2canvas
              (which captures sheetRef) never draws them into the PDF; .no-print
              keeps them out of the browser print. Purely to show where pages split. */}
          <div aria-hidden className="no-print pointer-events-none absolute inset-0">
            {pageBreaks.map((top, i) => (
              <div key={i} className="absolute inset-x-0 flex items-center gap-2" style={{ top }}>
                <div className="flex-1 border-t-2 border-dashed border-blue-400/80" />
                <span className="shrink-0 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white shadow">
                  End of page {i + 1} / {pageCount} · {i + 2} ↓
                </span>
                <div className="flex-1 border-t-2 border-dashed border-blue-400/80" />
              </div>
            ))}
          </div>

          {/* Page-count badge */}
          <div className="no-print pointer-events-none absolute -top-3 right-1 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-lg">
            A4 · {pageCount} page{pageCount > 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
};
