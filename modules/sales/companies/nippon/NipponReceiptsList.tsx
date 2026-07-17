/**
 * NipponReceiptsList — the payment-receipt register (owner-driven advances).
 *
 * Lists every advance receipt posted against a Nippon order (from the orders'
 * `advanceReceipts`). The owner can reprint a receipt or reverse/refund it. Net
 * advance held is summarised. Receipts are append-only — a reversal is a new
 * (negative) row, never an edit.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { activeCompany } from '@/modules/shared/utils/activeCompany';
import { useAuthStore } from '@/modules/auth/authStore';
import { Client, Quotation } from '@/modules/shared/types';
import { NipponAdvanceReceipt } from '@/modules/production/types/production';
import { reverseAdvanceReceipt } from './nipponAdvanceReceiptService';
import { NipponReceiptPrint } from '@/modules/nippon/prints/NipponReceiptPrint';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { toast } from 'sonner';
import { Receipt, Printer, RotateCcw, Loader2, RefreshCw, Search } from 'lucide-react';

interface Row { receipt: NipponAdvanceReceipt; order: Quotation; }

const fmt = (ts?: string): string => {
  if (!ts) return '';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};

const NipponReceiptsList: React.FC = () => {
  const [orders, setOrders] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [printRow, setPrintRow] = useState<Row | null>(null);
  const { refreshKey } = useRealtimeRefresh('quotations');
  const role = useAuthStore(s => s.profile?.role || s.user?.role || '');
  const actorName = useAuthStore(s => s.profile?.fullName || s.profile?.email || s.user?.email || 'owner');
  const isOwner = ['owner', 'hassan', 'super_admin'].includes(role);

  const load = useCallback(async () => {
    setLoading(true);
    const company = activeCompany();
    const [qs, cs] = await Promise.all([AsyncSalesService.getQuotations(), AsyncSalesService.getClients()]);
    setOrders(qs.filter(q => q.company === company && (q.advanceReceipts || []).length > 0));
    setClients(cs.filter(c => c.company === company));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const clientOf = (o: Quotation): Client | undefined => clients.find(c => c.id === o.clientId);
  const clientName = (o: Quotation): string => clientOf(o)?.name || (o as { clientName?: string }).clientName || '—';

  const rows: Row[] = useMemo(() => {
    const all: Row[] = [];
    orders.forEach(o => (o.advanceReceipts || []).forEach(r => all.push({ receipt: r, order: o })));
    all.sort((a, b) => String(b.receipt.date).localeCompare(String(a.receipt.date)));
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(({ receipt, order }) =>
      [receipt.receiptNo, order.orderNo, order.id, clientName(order), receipt.method].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [orders, search, clients]);

  const totalNet = useMemo(() => rows.reduce((s, r) => s + (Number(r.receipt.amount) || 0), 0), [rows]);
  const isReversalRow = (r: NipponAdvanceReceipt): boolean => (r.reference || '').startsWith('Reversal of') || r.amount < 0;
  const isReversed = (order: Quotation, r: NipponAdvanceReceipt): boolean =>
    (order.advanceReceipts || []).some(x => (x.reference || '').startsWith(`Reversal of ${r.receiptNo}`));

  const doReverse = async (row: Row) => {
    if (!isOwner) { toast.error('Only the owner can reverse a receipt.'); return; }
    if (!await confirmModal(`Reverse receipt ${row.receipt.receiptNo} (PKR ${Number(row.receipt.amount).toLocaleString()})? This posts a refund/reversal and reduces the advance held on ${row.order.orderNo || row.order.id}.`)) return;
    setBusy(row.receipt.receiptNo);
    const res = await reverseAdvanceReceipt({ order: row.order, company: 'Nippon', clientName: clientName(row.order), receipt: row.receipt, by: actorName });
    setBusy(null);
    if (res.error) { toast.error(`Reverse failed — ${res.error}`, { duration: 8000 }); return; }
    toast.success(`Receipt ${row.receipt.receiptNo} reversed${res.data?.glPosted ? ' + GL posted' : ''}.`);
    await load();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2 no-print flex-wrap">
        <Receipt size={16} className="text-emerald-600" />
        <h3 className="text-xs font-black uppercase tracking-widest text-emerald-800">Payment Receipts</h3>
        <div className="relative w-56 ml-2">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search receipt / order / client…" className="sap-input w-full pl-8 py-1 text-xs font-bold" />
        </div>
        <span className="ml-auto text-[10px] font-bold text-emerald-700">Net advance held: <span className="font-black tabular-nums">PKR {totalNet.toLocaleString()}</span></span>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-600"><RefreshCw size={12} /> Refresh</button>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2" /> Loading receipts…</div>
      ) : rows.length === 0 ? (
        <div className="p-16 text-center text-slate-300 font-black uppercase italic text-xs tracking-widest">No payment receipts yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400"><tr>
              <th className="px-4 py-3">Receipt No</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Order</th><th className="px-4 py-3">Method</th>
              <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ receipt: r, order: o }) => {
                const reversal = isReversalRow(r);
                const reversed = !reversal && isReversed(o, r);
                return (
                  <tr key={r.receiptNo} className={`hover:bg-slate-50 ${reversal ? 'bg-rose-50/40' : ''}`}>
                    <td className="px-4 py-2.5 font-mono font-black text-blue-600 text-xs whitespace-nowrap">{r.receiptNo}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-500">{fmt(r.date)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-700 uppercase">{clientName(o)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-600">{o.orderNo || o.manualSerial || o.id}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-600">{r.method}{r.reference ? <span className="text-slate-400 font-medium"> · {r.reference}</span> : null}</td>
                    <td className={`px-4 py-2.5 text-right text-xs font-black tabular-nums ${r.amount < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{r.amount < 0 ? '−' : ''}PKR {Math.abs(Number(r.amount)).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!reversal && (
                          <button onClick={() => setPrintRow({ receipt: r, order: o })} title="Reprint" className="p-1.5 text-slate-500 bg-slate-50 rounded hover:bg-slate-200"><Printer size={14} /></button>
                        )}
                        {!reversal && !reversed && isOwner && (
                          <button onClick={() => doReverse({ receipt: r, order: o })} disabled={busy === r.receiptNo} title="Reverse / refund"
                            className="p-1.5 text-rose-600 bg-rose-50 rounded hover:bg-rose-100 disabled:opacity-50">
                            {busy === r.receiptNo ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                          </button>
                        )}
                        {reversed && <span className="text-[9px] font-black uppercase text-rose-500">Reversed</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {printRow && (
        <NipponReceiptPrint
          receipt={printRow.receipt}
          order={printRow.order}
          clients={clients}
          printType={clientOf(printRow.order)?.preferredPrintType || 'KinLong'}
          onClose={() => setPrintRow(null)}
        />
      )}
    </div>
  );
};

export default NipponReceiptsList;
