/**
 * ClientStatement.tsx — Phase 9
 * Printable AR Statement of Account per client.
 * Shows all invoices, payments received, and running balance.
 * Available from: Sales → Business Partners → Statement button.
 */

import React, { useState, useEffect } from 'react';
import { Company } from '@/modules/shared/types/core';
import { SalesService } from '@/modules/sales/services/salesService';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { FileText, Printer, X, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface StatementLine {
  date:        string;
  ref:         string;
  description: string;
  debit:       number;  // invoice = debit (amount owed)
  credit:      number;  // payment = credit (amount received)
  balance:     number;  // running balance
  type:        'Invoice' | 'Payment' | 'Opening';
}

interface ClientStatementProps {
  clientId:   string;
  clientName: string;
  company:    Company;
  onClose:    () => void;
}

const fmtPKR = (n: number) => `PKR ${Math.round(Math.abs(n)).toLocaleString('en-PK')}`;

const ClientStatementModal: React.FC<ClientStatementProps> = ({ clientId, clientName, company, onClose }) => {
  const [lines, setLines]   = useState<StatementLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [fromDate, setFromDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [invoices, receipts] = await Promise.all([
        AsyncSalesService.getInvoices(),
        AsyncSalesService.getPaymentReceipts(),
      ]);

      const clientInvoices = (invoices as any[])
        .filter((i) => i.clientId === clientId && i.company === company && i.date <= asOfDate && i.date >= fromDate)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

      const clientReceipts = (receipts as any[])
        .filter((r) => {
          const inv = (invoices as any[]).find((i) => i.id === r.invoiceId);
          return inv?.clientId === clientId && r.date <= asOfDate && r.date >= fromDate;
        })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

      // Merge and sort by date
      type Entry = { date: string; type: 'Invoice' | 'Payment'; ref: string; desc: string; amount: number };
      const entries: Entry[] = [
        ...clientInvoices.map((i) => ({
          date: i.date, type: 'Invoice' as const,
          ref: i.id, desc: `Invoice — ${i.orderNo || i.orderId || ''}`,
          amount: i.totalAmount || 0,
        })),
        ...clientReceipts.map((r) => ({
          date: r.date, type: 'Payment' as const,
          ref: r.id, desc: `Payment received via ${r.method || 'Cash'}${r.reference ? ' (' + r.reference + ')' : ''}`,
          amount: r.amount || 0,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date));

      let running = 0;
      const statementLines: StatementLine[] = entries.map(e => {
        if (e.type === 'Invoice') {
          running += e.amount;
          return { date: e.date, ref: e.ref, description: e.desc, debit: e.amount, credit: 0, balance: running, type: 'Invoice' };
        } else {
          running -= e.amount;
          return { date: e.date, ref: e.ref, description: e.desc, debit: 0, credit: e.amount, balance: running, type: 'Payment' };
        }
      });

      setLines(statementLines);
    } catch (e) {
      toast.error('Statement load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [clientId, asOfDate, fromDate]);

  const totalDebit  = lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const closingBalance = totalDebit - totalCredit;

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[500]">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50 shrink-0 no-print">
          <div className="flex items-center gap-4">
            <span className="font-black text-slate-800 uppercase text-sm tracking-widest">Account Statement — {clientName}</span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-bold">From:</span>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="sap-input text-xs font-bold px-2 py-1"/>
              <span className="text-slate-400 font-bold">To:</span>
              <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="sap-input text-xs font-bold px-2 py-1"/>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-slate-500 font-bold text-xs uppercase border rounded-xl hover:bg-slate-100">Close</button>
            <button onClick={() => window.print()} className="px-5 py-2 bg-blue-600 text-white font-bold text-xs uppercase rounded-xl hover:bg-blue-700 flex items-center gap-2">
              <Printer size={13}/> Print
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Print area */}
          <div className="p-8 space-y-6" id="statement-print">
            <style>{`
              @media print {
                @page { size: A4; margin: 12mm; }
                .no-print { display: none !important; }
              }
            `}</style>

            {/* Letterhead */}
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6">
              <div>
                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">GlassTech Group</h1>
                <p className="text-xs font-bold text-blue-700 uppercase">{company} Business Unit · Karachi, Pakistan</p>
              </div>
              <div className="text-right">
                <h2 className="text-xl font-black text-slate-900 uppercase">Statement of Account</h2>
                <p className="text-xs text-slate-500 mt-1">Period: {fromDate} — {asOfDate}</p>
                <p className="text-xs text-slate-500">Printed: {new Date().toLocaleDateString('en-PK')}</p>
              </div>
            </div>

            {/* Client info */}
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400 mb-1">Bill To</p>
                <p className="font-black text-slate-900 text-sm uppercase">{clientName}</p>
              </div>
              <div className="text-right">
                <div className={`inline-block px-6 py-3 rounded-xl font-black text-lg ${closingBalance > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                  {closingBalance > 0 ? 'Balance Due: ' : 'Credit Balance: '}{fmtPKR(closingBalance)}
                </div>
              </div>
            </div>

            {/* Statement table */}
            {loading ? (
              <div className="py-12 text-center text-slate-400 font-bold">Loading...</div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-900">
                    <th className="text-left py-2 font-black uppercase text-[9px] text-slate-500 tracking-widest">Date</th>
                    <th className="text-left py-2 font-black uppercase text-[9px] text-slate-500 tracking-widest">Reference</th>
                    <th className="text-left py-2 font-black uppercase text-[9px] text-slate-500 tracking-widest">Description</th>
                    <th className="text-right py-2 font-black uppercase text-[9px] text-slate-500 tracking-widest">Debit (PKR)</th>
                    <th className="text-right py-2 font-black uppercase text-[9px] text-slate-500 tracking-widest">Credit (PKR)</th>
                    <th className="text-right py-2 font-black uppercase text-[9px] text-slate-500 tracking-widest">Balance (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-300 italic">No transactions in this period.</td></tr>
                  )}
                  {lines.map((l, i) => (
                    <tr key={i} className={`border-b border-slate-100 ${l.type === 'Payment' ? 'bg-emerald-50/30' : ''}`}>
                      <td className="py-2 text-slate-500">{l.date}</td>
                      <td className="py-2 font-black text-blue-700">{l.ref}</td>
                      <td className="py-2 text-slate-600">{l.description}</td>
                      <td className="py-2 text-right font-bold text-slate-800">{l.debit ? l.debit.toLocaleString() : '—'}</td>
                      <td className="py-2 text-right font-bold text-emerald-700">{l.credit ? l.credit.toLocaleString() : '—'}</td>
                      <td className={`py-2 text-right font-black ${l.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {l.balance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900">
                    <td colSpan={3} className="py-3 font-black text-xs uppercase text-slate-600">Totals</td>
                    <td className="py-3 text-right font-black text-slate-900">{totalDebit.toLocaleString()}</td>
                    <td className="py-3 text-right font-black text-emerald-700">{totalCredit.toLocaleString()}</td>
                    <td className={`py-3 text-right font-black text-lg ${closingBalance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {closingBalance.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Footer */}
            <div className="border-t border-slate-200 pt-6 flex justify-between items-end mt-12">
              <div className="text-[9px] text-slate-400 italic">
                <p>This is a system-generated statement from GlassTech ERP 2026.</p>
                <p>For queries, contact accounts@glasstech.pk</p>
              </div>
              <div className="text-center">
                <div className="border-t border-slate-400 w-40 pt-2">
                  <p className="text-[9px] font-black uppercase text-slate-600">Authorized Signatory</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientStatementModal;
