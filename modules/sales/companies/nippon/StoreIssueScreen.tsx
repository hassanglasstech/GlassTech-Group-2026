/**
 * StoreIssueScreen — dedicated Store Incharge screen (Nippon).
 *
 * Segregation of duties: the store person logs in with a store-only role
 * (module 'store-issue') and sees ONLY this — the queue of approved Sales Orders
 * waiting to be physically issued. They can pick + issue, but cannot approve or
 * price orders (that's Sales). Issuing reduces on-hand stock and marks the order
 * Delivered (shared nipponFulfilmentService, same path as the Sales "Store Issue" tab).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { activeCompany } from '@/modules/shared/utils/activeCompany';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Quotation, Client, Product, QuotationItem, StoreItem } from '@/modules/shared/types';
import { ProductImage } from '@/modules/shared/components/ProductImage';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { issueNipponOrder, isPendingIssue } from './nipponFulfilmentService';
import { toast } from 'sonner';
import { PackageCheck, Loader2, RefreshCw, ClipboardList } from 'lucide-react';

const StoreIssueScreen: React.FC = () => {
  const [orders, setOrders] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [store, setStore] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const company = activeCompany();
    const [qs, cs] = await Promise.all([AsyncSalesService.getQuotations(), AsyncSalesService.getClients()]);
    setOrders(qs.filter(q => q.company === company && isPendingIssue(q))
      .sort((a, b) => String(a.orderNo || a.id).localeCompare(String(b.orderNo || b.id))));
    setClients(cs.filter(c => c.company === company));
    setProducts(SalesService.getProducts().filter(p => p.company === company));
    setStore(InventoryService.getStore().filter(s => s.company === company));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const prodFor = (item: QuotationItem): Product | undefined =>
    products.find(p =>
      (item.productRef && p.id === item.productRef) ||
      (item.locationCode && (p.id === item.locationCode || p.modelNo === item.locationCode || p.profileCode === item.locationCode)));

  const onHand = (item: QuotationItem): number => {
    const p = prodFor(item);
    const id = p?.id || item.productRef || item.locationCode;
    const si = store.find(s => s.id === id);
    return Number(si?.quantity ?? 0);
  };

  const doIssue = async (q: Quotation) => {
    const ok = await confirmModal(`Issue goods for ${q.orderNo || q.id}? On-hand stock will be reduced and the order marked Delivered.`);
    if (!ok) return;
    setBusy(q.id);
    const res = await issueNipponOrder(q.id);
    setBusy(null);
    if (res.error) { toast.error(`Issue failed — ${res.error}`, { duration: 8000 }); return; }
    if (res.invoiceId) {
      toast.success(`Issued — ${res.orderNo} delivered · invoice ${res.invoiceId} posted.`);
    } else if (res.invoiceError) {
      toast.warning(`Issued — ${res.orderNo} delivered, but invoice failed: ${res.invoiceError}`, { duration: 9000 });
    } else {
      toast.success(`Issued — ${res.orderNo} marked Delivered.`);
    }
    await load();
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl flex items-center gap-3">
        <div className="p-2.5 bg-amber-600 rounded-xl"><ClipboardList size={22}/></div>
        <div>
          <h1 className="text-lg font-black uppercase tracking-tight">Store — Pending Issue</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pick &amp; issue approved orders · Nippon</p>
        </div>
        <button onClick={load} className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
          <RefreshCw size={13}/> Refresh
        </button>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Loading pending orders…</div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-20 text-center text-slate-300 font-black uppercase italic text-xs tracking-widest">
          <PackageCheck size={44} className="mx-auto mb-4 opacity-20"/>
          No approved orders waiting to be issued.
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(q => {
            const cli = clients.find(c => c.id === q.clientId);
            const lines = (q.items || []).filter(i => !i.isSection);
            const val = (q as { total?: number }).total ?? lines.reduce((s, i) => s + (Number(i.amount) || 0), 0);
            return (
              <div key={q.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                  <span className="font-black text-blue-600 text-sm uppercase">{q.orderNo || q.id}</span>
                  <span className="text-xs font-bold text-slate-600 uppercase">{cli?.name || (q as { clientName?: string }).clientName || '—'}</span>
                  <span className="text-[10px] font-bold text-slate-400">{lines.length} line(s) · PKR {Number(val).toLocaleString()}</span>
                  <button
                    onClick={() => doIssue(q)}
                    disabled={busy === q.id}
                    className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm transition-all">
                    {busy === q.id ? <Loader2 size={13} className="animate-spin"/> : <PackageCheck size={13}/>}
                    Issue / Deliver
                  </button>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-white border-b text-[9px] font-black uppercase text-slate-400"><tr>
                    <th className="px-5 py-2">Img</th><th className="px-5 py-2">Code</th>
                    <th className="px-5 py-2">Item</th><th className="px-5 py-2 text-right">Pick Qty</th>
                    <th className="px-5 py-2 text-right">On-hand</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {lines.map((item, i) => {
                      const p = prodFor(item);
                      const code = p?.profileCode || p?.modelNo || item.locationCode || '—';
                      const have = onHand(item);
                      const need = Number(item.qty) || 0;
                      return (
                        <tr key={item.id || i} className="hover:bg-slate-50">
                          <td className="px-5 py-2">
                            <div className="w-9 h-9 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center">
                              <ProductImage id={p?.id || ''} code={p?.modelNo || p?.profileCode} url={p?.imageUrl} alt={item.description} className="w-full h-full object-cover" iconSize={14}/>
                            </div>
                          </td>
                          <td className="px-5 py-2 font-mono text-[11px] font-bold text-slate-500 uppercase">{code}</td>
                          <td className="px-5 py-2 text-xs font-bold text-slate-800 uppercase">{item.description || p?.description || '—'}</td>
                          <td className="px-5 py-2 text-right text-sm font-black text-slate-900 tabular-nums">{need}</td>
                          <td className={`px-5 py-2 text-right text-xs font-black tabular-nums ${have < need ? 'text-rose-500' : 'text-slate-400'}`}>{have}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StoreIssueScreen;
