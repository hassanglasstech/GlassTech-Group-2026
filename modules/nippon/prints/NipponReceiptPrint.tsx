import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Printer, Loader2 } from 'lucide-react';
import { exportElementToPdf } from '../../shared/utils/pdfExport';
import { Quotation, Client } from '../../shared/types';
import { NipponAdvanceReceipt } from '../../production/types/production';
import { getNipponCompanyInfo } from '../constants/nipponCompanyInfo';
import { NipponBankFooter } from './NipponLetterhead';
import { toast } from 'sonner';

interface Props {
  receipt: NipponAdvanceReceipt;
  order: Quotation;
  clients: Client[];
  printType?: 'KinLong' | 'Glasstech' | 'General';
  onClose: () => void;
}

const HEADER: Record<string, { title: string; sub: string }> = {
  KinLong:   { title: 'KIN LONG', sub: 'Hardware · For Better Living' },
  Glasstech: { title: 'GLASSTECH', sub: 'Nippon Hardware Division' },
  General:   { title: 'NIPPON HARDWARE', sub: 'Hardware & Accessories' },
};

/** Payment (advance) receipt — printable, in the customer's preferred format. */
export const NipponReceiptPrint: React.FC<Props> = ({ receipt, order, clients, printType = 'KinLong', onClose }) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const client = clients.find(c => c.id === order.clientId);
  const clientName = client?.name || (order as { clientName?: string }).clientName || '—';
  const hd = HEADER[printType] || HEADER.General;
  const info = getNipponCompanyInfo();
  const docName = `Receipt-${receipt.receiptNo}`;
  const dateStr = new Date(receipt.date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const handleDownload = async () => {
    if (!sheetRef.current || busy) return;
    setBusy(true);
    try { await exportElementToPdf(sheetRef.current, docName); }
    catch { toast.error('PDF banane me masla — dobara koshish karein.'); }
    finally { setBusy(false); }
  };
  const handlePrint = () => {
    const prev = document.title; document.title = docName; window.print(); document.title = prev;
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-slate-900/80 no-print" onClick={onClose} />
      <div className="fixed top-0 inset-x-0 z-[10001] flex items-center justify-between gap-2 px-3 py-2.5 bg-white border-b border-slate-200 shadow-sm no-print">
        <span className="font-black text-[11px] uppercase tracking-widest text-slate-600 truncate">{docName}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleDownload} disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {busy ? 'Ban raha…' : 'PDF'}
          </button>
          <button onClick={handlePrint} className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm">
            <Printer size={14} /> Print
          </button>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"><X size={16} /></button>
        </div>
      </div>

      <div className="pdf-preview-scroll fixed inset-0 z-[10000] overflow-auto pt-16 pb-6 px-2 sm:px-6">
        <div ref={sheetRef} className="pdf-preview mx-auto bg-white shadow-2xl" style={{ width: '148mm', minHeight: '105mm', padding: '10mm' }}>
          {/* Header */}
          <div className="text-center border-b-2 border-slate-800 pb-3 mb-4">
            <div className="text-2xl font-black tracking-tight text-slate-900">{hd.title}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">{hd.sub}</div>
            {info.address && <div className="text-[9px] font-bold text-slate-600 mt-1">{info.address}</div>}
            {[info.phone && `Tel: ${info.phone}`, info.email].filter(Boolean).length > 0 && (
              <div className="text-[9px] font-bold text-slate-600">{[info.phone && `Tel: ${info.phone}`, info.email].filter(Boolean).join('   ·   ')}</div>
            )}
            {(info.ntn || info.strn) && (
              <div className="text-[9px] font-bold text-slate-600">{[info.ntn && `NTN: ${info.ntn}`, info.strn && `STRN: ${info.strn}`].filter(Boolean).join('   ·   ')}</div>
            )}
          </div>
          <div className="text-center mb-4">
            <span className="inline-block text-sm font-black uppercase tracking-[0.2em] text-slate-800 border border-slate-300 rounded px-4 py-1">Payment Receipt</span>
          </div>

          {/* Meta */}
          <table className="w-full text-[12px] mb-4">
            <tbody>
              <tr><td className="py-1 font-bold text-slate-500 w-32">Receipt No</td><td className="py-1 font-black text-slate-900">{receipt.receiptNo}</td>
                  <td className="py-1 font-bold text-slate-500 w-24 text-right pr-2">Date</td><td className="py-1 font-bold text-slate-800">{dateStr}</td></tr>
              <tr><td className="py-1 font-bold text-slate-500">Received From</td><td className="py-1 font-black text-slate-900 uppercase" colSpan={3}>{clientName}</td></tr>
              <tr><td className="py-1 font-bold text-slate-500">Against Order</td><td className="py-1 font-bold text-slate-800">{order.orderNo || order.manualSerial || order.id}</td>
                  <td className="py-1 font-bold text-slate-500 text-right pr-2">Method</td><td className="py-1 font-bold text-slate-800">{receipt.method}</td></tr>
              {receipt.reference && (
                <tr><td className="py-1 font-bold text-slate-500">Reference</td><td className="py-1 font-bold text-slate-800" colSpan={3}>{receipt.reference}</td></tr>
              )}
            </tbody>
          </table>

          {/* Amount */}
          <div className="flex items-center justify-between bg-slate-900 text-white rounded-lg px-4 py-3 mb-4">
            <span className="text-[11px] font-black uppercase tracking-widest">Amount Received</span>
            <span className="text-xl font-black tabular-nums">PKR {Number(receipt.amount).toLocaleString('en-PK')}</span>
          </div>

          <NipponBankFooter />

          {/* Footer */}
          <div className="flex items-end justify-between mt-10">
            <div className="text-[10px] font-bold text-slate-400">
              Received by: <span className="text-slate-700">{receipt.by}</span>
              <div className="mt-0.5 italic">System-generated receipt · advance against order (adjusted at delivery).</div>
            </div>
            <div className="text-center">
              <div className="w-40 border-t border-slate-400 pt-1 text-[10px] font-bold uppercase text-slate-500">Authorised Signature</div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
};

export default NipponReceiptPrint;
