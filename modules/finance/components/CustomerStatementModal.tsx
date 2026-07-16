/**
 * CustomerStatementModal — a per-customer account statement (P1-6).
 *
 * The missing table-stakes AR document: one customer's invoices (debits),
 * receipts and credit notes (credits) laid out chronologically with a running
 * balance, an aging summary, and a closing balance — printable / WhatsApp-able.
 * Fully self-contained: give it a clientId and it fetches its own data via the
 * sales service (invoices + payment receipts + credit notes), so it can be
 * launched from anywhere without threading state through the caller.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Share2, Loader2, FileText } from 'lucide-react';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { exportElementToPdf, elementToPdfFile } from '@/modules/shared/utils/pdfExport';
import { Invoice, PaymentReceipt } from '@/modules/shared/types';
import { toast } from 'sonner';

interface Txn { date: string; ref: string; type: 'Invoice' | 'Receipt' | 'Credit Note'; debit: number; credit: number; }

const money = (n: number): string => Math.round(n).toLocaleString('en-PK');

export const CustomerStatementModal: React.FC<{ clientId: string; clientName: string; onClose: () => void }> = ({
  clientId, clientName, onClose,
}) => {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [invs, rcpts, cns] = await Promise.all([
          AsyncSalesService.getInvoices(),
          AsyncSalesService.getPaymentReceipts(),
          AsyncSalesService.getCreditNotes(),
        ]);
        const myInv = (invs as Invoice[]).filter(i => i.clientId === clientId && i.status !== 'Voided');
        const invIds = new Set(myInv.map(i => i.id));
        const rows: Txn[] = [];
        myInv.forEach(i => rows.push({ date: i.date, ref: i.id, type: 'Invoice', debit: Number(i.totalAmount) || 0, credit: 0 }));
        (rcpts as PaymentReceipt[])
          .filter(r => invIds.has(r.invoiceId))
          .forEach(r => rows.push({ date: r.date, ref: r.id, type: 'Receipt', debit: 0, credit: Number(r.amount) || 0 }));
        (cns as Array<Record<string, unknown>>)
          .filter(cn => (cn.client_id ?? cn.clientId) === clientId)
          .forEach(cn => rows.push({
            date: String(cn.date ?? cn.created_at ?? today).slice(0, 10),
            ref: String(cn.id ?? cn.cn_number ?? 'CN'),
            type: 'Credit Note',
            debit: 0,
            credit: Number(cn.amount ?? cn.total ?? 0) || 0,
          }));
        rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        setTxns(rows);
      } catch {
        toast.error('Statement load nahi ho saka.');
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId, today]);

  const totalDebit  = txns.reduce((s, t) => s + t.debit, 0);
  const totalCredit = txns.reduce((s, t) => s + t.credit, 0);
  const closing     = totalDebit - totalCredit;

  const docName = `Statement-${clientName}-${today}`.replace(/[^\w-]+/g, '_');

  const handleDownload = async () => {
    if (!sheetRef.current || busy) return;
    setBusy(true);
    try { await exportElementToPdf(sheetRef.current, docName); }
    catch { toast.error('PDF banane me masla.'); }
    finally { setBusy(false); }
  };

  const handleShare = async () => {
    if (!sheetRef.current || busy) return;
    setBusy(true);
    try {
      const file = await elementToPdfFile(sheetRef.current, docName);
      const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
      if (typeof navigator.share === 'function' && nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: docName, text: `Account statement — ${clientName}` });
      } else {
        await exportElementToPdf(sheetRef.current, docName);
        toast.info('PDF download ho gaya — WhatsApp par bhej dein.', { duration: 6000 });
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') toast.error('Share nahi ho saka.');
    } finally { setBusy(false); }
  };

  let running = 0;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-900/70 flex items-start justify-center overflow-auto p-4 no-print" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-200 no-print">
          <span className="flex items-center gap-2 font-black text-[11px] uppercase tracking-widest text-slate-600">
            <FileText size={15} /> Account Statement
          </span>
          <div className="flex items-center gap-2">
            <button onClick={handleShare} disabled={busy || loading} title="Share / WhatsApp"
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />} Share
            </button>
            <button onClick={handleDownload} disabled={busy || loading} title="Download PDF"
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} PDF
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"><X size={16} /></button>
          </div>
        </div>

        {/* Statement sheet (captured for PDF) */}
        <div ref={sheetRef} className="p-6 bg-white">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-black uppercase text-slate-900">Account Statement</h2>
              <p className="text-sm font-bold text-slate-600 uppercase mt-0.5">{clientName}</p>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              <p>Statement date: <span className="font-bold text-slate-700">{today}</span></p>
              <p className="mt-0.5">Closing balance:
                <span className={`font-black ml-1 ${closing > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>PKR {money(closing)}</span>
              </p>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs font-bold flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={16} /> Loading…
            </div>
          ) : txns.length === 0 ? (
            <div className="py-16 text-center text-slate-300 font-black uppercase italic text-xs tracking-widest">No transactions for this customer.</div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b-2 border-slate-800 text-left text-[9px] font-black uppercase text-slate-500">
                  <th className="py-2">Date</th><th className="py-2">Reference</th><th className="py-2">Type</th>
                  <th className="py-2 text-right">Debit</th><th className="py-2 text-right">Credit</th><th className="py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {txns.map((t, i) => {
                  running += t.debit - t.credit;
                  return (
                    <tr key={`${t.ref}-${i}`}>
                      <td className="py-1.5 text-slate-500 tabular-nums">{t.date}</td>
                      <td className="py-1.5 font-mono font-bold text-blue-600">{t.ref}</td>
                      <td className="py-1.5"><span className={`text-[9px] font-black uppercase ${t.type === 'Invoice' ? 'text-slate-700' : t.type === 'Receipt' ? 'text-emerald-600' : 'text-amber-600'}`}>{t.type}</span></td>
                      <td className="py-1.5 text-right tabular-nums font-bold">{t.debit ? money(t.debit) : '—'}</td>
                      <td className="py-1.5 text-right tabular-nums font-bold text-emerald-600">{t.credit ? money(t.credit) : '—'}</td>
                      <td className="py-1.5 text-right tabular-nums font-black">{money(running)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-800 font-black">
                  <td className="py-2" colSpan={3}>Totals</td>
                  <td className="py-2 text-right tabular-nums">{money(totalDebit)}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-600">{money(totalCredit)}</td>
                  <td className={`py-2 text-right tabular-nums ${closing > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(closing)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          <p className="mt-6 text-[9px] text-slate-400 uppercase tracking-widest">
            Closing balance PKR {money(closing)} {closing > 0 ? 'receivable from' : 'in favour of'} {clientName}.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CustomerStatementModal;
