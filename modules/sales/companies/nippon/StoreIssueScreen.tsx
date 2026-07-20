/**
 * StoreIssueScreen — dedicated Store Incharge screen (Nippon).
 *
 * Segregation of duties: the store person logs in with a store-only role
 * (module 'store-issue') and sees ONLY this — the queue of approved Sales Orders
 * waiting to be physically issued. They can pick + issue, but cannot approve or
 * price orders (that's Sales).
 *
 * Gate Pass A (store depth): clicking an order opens a bin-sorted pick list —
 * each line shows its WMS bin, ordered qty, image and any office instructions.
 * The picker confirms a picked qty per line (partial-pick), adds store notes,
 * and saves pick progress (persisted so the worklist survives a refresh). On
 * "Issue" the physical stock-out runs (shared nipponFulfilmentService) and the
 * order becomes Delivered — the same path as the Sales "Store Issue" tab.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { activeCompany } from '@/modules/shared/utils/activeCompany';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { useAuthStore } from '@/modules/auth/authStore';
import { Quotation, Client, Product, QuotationItem, StoreItem } from '@/modules/shared/types';
import { ProductImage } from '@/modules/shared/components/ProductImage';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { issueNipponOrder, isPendingIssue, remainingQty, issueQtyFor } from './nipponFulfilmentService';
import { NipponGatePassButton } from './NipponGatePassButton';
import { notifyBuyerOfStatus, bookBuyerProjectCost } from '@/modules/sales/services/intercompanyOrderService';
import { toast } from 'sonner';
import { PackageCheck, Loader2, RefreshCw, ClipboardList, ArrowLeft, MapPin, Save, Zap, Info, Truck } from 'lucide-react';

const StoreIssueScreen: React.FC = () => {
  const stampUser = useAuthStore(s => s.profile?.fullName || s.profile?.email || s.user?.email || 'store');
  const [orders, setOrders] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [store, setStore] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Detail (pick) view — the order being picked, with an editable copy of its lines.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<QuotationItem[]>([]);

  // Gate Pass (B) issuance lives in the shared <NipponGatePassButton>. When a pass
  // is issued we patch it onto the in-memory order so the badge updates at once.
  const onGatePassIssued = (updated: Quotation) => setOrders(prev => prev.map(o => (o.id === updated.id ? updated : o)));

  const load = useCallback(async () => {
    setLoading(true);
    const company = activeCompany();
    const [qs, cs] = await Promise.all([AsyncSalesService.getQuotations(), AsyncSalesService.getClients()]);
    setOrders(qs.filter(q => q.company === company && isPendingIssue(q)));
    setClients(cs.filter(c => c.company === company));
    setProducts(SalesService.getProducts().filter(p => p.company === company));
    setStore(InventoryService.getStore().filter(s => s.company === company));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const prodFor = useCallback((item: QuotationItem): Product | undefined =>
    products.find(p =>
      (item.productRef && p.id === item.productRef) ||
      (item.locationCode && (p.id === item.locationCode || p.modelNo === item.locationCode || p.profileCode === item.locationCode))),
    [products]);

  const storeItemFor = useCallback((item: QuotationItem): StoreItem | undefined => {
    const p = prodFor(item);
    const id = p?.id || item.productRef || item.locationCode;
    return store.find(s => s.id === id);
  }, [prodFor, store]);

  const onHand = useCallback((item: QuotationItem): number => Number(storeItemFor(item)?.quantity ?? 0), [storeItemFor]);
  // Bin seeded from the product's WMS store bin; a per-line override wins.
  const binFor = useCallback((item: QuotationItem): string =>
    item.binLocation || (storeItemFor(item)?.storageBin ?? ''), [storeItemFor]);

  // Ordered queue: Urgent first, then still-to-pick before picked, then by order no.
  const sortedOrders = useMemo(() => {
    const rank = (q: Quotation) => (q.priority === 'Urgent' ? 0 : 1) * 10 + (q.pickStatus === 'Picked' ? 1 : 0);
    return [...orders].sort((a, b) => rank(a) - rank(b) || String(a.orderNo || a.id).localeCompare(String(b.orderNo || b.id)));
  }, [orders]);

  const detailOrder = orders.find(q => q.id === detailId) || null;

  const openDetail = (q: Quotation) => {
    // Seed an editable copy: bin from the store bin. Picked qty is left EMPTY —
    // it used to default to the ordered qty, so the header read "Picked 10/10"
    // before anyone had walked to a shelf, and a picker who just hit Issue
    // recorded a perfect full pick that never happened. A number here now always
    // means a human counted something. "Pick all" below makes the honest full
    // pick one click.
    const seeded = (q.items || []).map(it => it.isSection ? it : ({
      ...it,
      binLocation: it.binLocation || (storeItemFor(it)?.storageBin ?? ''),
    }));
    setDetailItems(seeded);
    setDetailId(q.id);
  };

  /** Fill every line with what it still owes — the honest one-click full pick. */
  const pickAll = () => {
    setDetailItems(prev => prev.map(it => (it.isSection ? it : { ...it, pickedQty: remainingQty(it) })));
  };
  const closeDetail = () => { setDetailId(null); setDetailItems([]); };

  const updateLine = (lineId: string, field: 'binLocation' | 'storeNote' | 'pickedQty', value: string | number) => {
    setDetailItems(prev => prev.map(it => (it.id === lineId ? { ...it, [field]: value } : it)));
  };

  // Persist pick progress (bin + picked qty + notes) onto the order. markPicked
  // stamps it 'Picked' (fully staged, ready for gate pass); otherwise 'Picking'.
  //
  // pickedBy/pickedAt are stamped ONLY on a completed pick. They used to be
  // written on every Save Progress and again by the issue path, which made them
  // mean "last edited by" — useless as an audit trail when the question is who
  // actually pulled the goods.
  const savePick = async (q: Quotation, markPicked: boolean): Promise<boolean> => {
    setSaving(true);
    try {
      const updated: Quotation = {
        ...q,
        items: detailItems,
        pickStatus: markPicked ? 'Picked' : 'Picking',
        ...(markPicked ? { pickedBy: stampUser, pickedAt: new Date().toISOString() } : {}),
      };
      const res = await AsyncSalesService.saveQuotations([updated]);
      if (res?.error) { toast.error(`Pick not saved to cloud — ${res.error}`, { duration: 8000 }); return false; }
      setOrders(prev => prev.map(o => (o.id === q.id ? updated : o)));
      // IC-P3: on an intercompany order, hand the "Picked" status back to the buyer.
      if (markPicked && updated.intercompany) void notifyBuyerOfStatus({ order: updated, status: 'Picked', actor: stampUser });
      return true;
    } catch (err) {
      toast.error(`Pick save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally { setSaving(false); }
  };

  const handleSaveProgress = async (q: Quotation) => {
    if (await savePick(q, false)) toast.success('Pick progress saved.');
  };
  const handleMarkPicked = async (q: Quotation) => {
    if (await savePick(q, true)) { toast.success('Order staged — ready for gate pass.'); closeDetail(); }
  };

  const doIssue = async (q: Quotation) => {
    // Say plainly what is about to leave. When the sheet is open the picked
    // numbers drive it, so a short pick must not read as a full delivery.
    const inSheet = detailId === q.id;
    const lines = (inSheet ? detailItems : (q.items || [])).filter(i => !i.isSection);
    const out = lines.reduce((s, i) => s + issueQtyFor(i), 0);
    const owed = lines.reduce((s, i) => s + remainingQty(i), 0);
    const short = out < owed;
    const ok = await confirmModal(
      short
        ? `Part-issue ${q.orderNo || q.id}?\n\n${out} of ${owed} outstanding unit(s) will leave the store. ` +
          `The order STAYS OPEN for the remaining ${owed - out} and is not invoiced until it is fully delivered.`
        : `Issue goods for ${q.orderNo || q.id}?\n\n${out} unit(s) will leave the store and the order will be marked Delivered.`,
    );
    if (!ok) return;
    setBusy(q.id);
    // Persist the pick (bin/qty/notes) BEFORE the stock-out — issueNipponOrder
    // re-reads the saved order, so an unsaved picked qty would be ignored.
    // Saved as 'Picking', not 'Picked': issuing is not evidence of a completed
    // pick, and only Mark Picked may claim that.
    if (inSheet) await savePick(q, false);
    const res = await issueNipponOrder(q.id);
    setBusy(null);
    if (res.error) { toast.error(`Issue failed — ${res.error}`, { duration: 8000 }); return; }
    if (res.fullyIssued === false) {
      toast.warning(`Part-issued — ${res.issuedQty} unit(s) out, ${res.remainingQty} still owed. ${res.orderNo} stays in the queue.`, { duration: 9000 });
    } else if (res.invoiceId) toast.success(`Issued — ${res.orderNo} delivered · invoice ${res.invoiceId} posted.`);
    else if (res.invoiceError) toast.warning(`Issued — ${res.orderNo} delivered, but invoice failed: ${res.invoiceError}`, { duration: 9000 });
    else toast.success(`Issued — ${res.orderNo} marked Delivered.`);
    // IC-P3: hand the "Delivered" status back to the buyer's project timeline.
    // IC-P4: grow the buyer project's cost (consumed bucket always; WIP GL if enabled).
    if (q.intercompany) { void notifyBuyerOfStatus({ order: q, status: 'Delivered', actor: stampUser }); bookBuyerProjectCost(q); }
    closeDetail();
    await load();
  };

  const pickBadge = (q: Quotation) => {
    const s = q.pickStatus || 'Pending';
    const cls = s === 'Picked' ? 'bg-emerald-100 text-emerald-700' : s === 'Picking' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500';
    return <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${cls}`}>{s}</span>;
  };

  // ── Detail (pick) view ────────────────────────────────────────────────────
  if (detailOrder) {
    const cli = clients.find(c => c.id === detailOrder.clientId);
    const lines = detailItems.filter(i => !i.isSection);
    // Bin-sorted walk path so the picker crosses the aisle once.
    const walk = [...lines].sort((a, b) => (binFor(a) || 'zzzz').localeCompare(binFor(b) || 'zzzz'));
    const pickedTotal = lines.reduce((s, i) => s + (Number(i.pickedQty) || 0), 0);
    // What this visit owes — the outstanding remainder, not the original order,
    // so a part-issued order reads against what is actually left to pull.
    const needTotal = lines.reduce((s, i) => s + remainingQty(i), 0);
    const alreadyOut = lines.reduce((s, i) => s + (Number(i.issuedQty) || 0), 0);
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center gap-3">
          <button onClick={closeDetail} className="p-2 hover:bg-white/10 rounded-xl"><ArrowLeft size={18}/></button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-black uppercase tracking-tight">{detailOrder.orderNo || detailOrder.id}</h1>
              {detailOrder.priority === 'Urgent' && <span className="flex items-center gap-1 text-[9px] font-black uppercase bg-rose-500 px-2 py-0.5 rounded-full"><Zap size={10}/> Urgent</span>}
              {pickBadge(detailOrder)}
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{cli?.name || (detailOrder as { clientName?: string }).clientName || '—'} · {detailOrder.projectName || '—'}</p>
          </div>
          <div className="ml-auto text-right shrink-0">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Picked</p>
            <p className="text-sm font-black tabular-nums">{pickedTotal}<span className="text-slate-500">/{needTotal}</span></p>
            {alreadyOut > 0 && (
              <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">{alreadyOut} already out</p>
            )}
          </div>
        </div>

        {detailOrder.specialInstructions && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <Info size={15} className="text-amber-600 mt-0.5 shrink-0"/>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Office instructions</p>
              <p className="text-xs font-bold text-amber-900 whitespace-pre-wrap">{detailOrder.specialInstructions}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <MapPin size={13} className="text-blue-600"/>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bin-sorted pick list · {lines.length} line(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="bg-white border-b text-[9px] font-black uppercase text-slate-400"><tr>
                <th className="px-4 py-2">Bin</th><th className="px-4 py-2">Img</th><th className="px-4 py-2">Item</th>
                <th className="px-4 py-2 text-right">Need</th><th className="px-4 py-2 text-right">On-hand</th>
                <th className="px-4 py-2 text-center w-24">Picked</th><th className="px-4 py-2">Store note</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {walk.map(item => {
                  const p = prodFor(item);
                  const code = p?.profileCode || p?.modelNo || item.locationCode || '—';
                  const have = onHand(item);
                  // "Need" is what is still outstanding on this line, so a
                  // part-issued line asks for the remainder, not the original qty.
                  const need = remainingQty(item);
                  const alreadyIssued = Number(item.issuedQty) || 0;
                  const untouched = item.pickedQty === undefined || item.pickedQty === null;
                  const picked = Number(item.pickedQty) || 0;
                  const short = !untouched && picked < need;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <input value={item.binLocation || ''} onChange={e => updateLine(item.id, 'binLocation', e.target.value)}
                          placeholder="—" className="sap-input w-20 py-1 text-xs font-black text-blue-700 uppercase text-center"/>
                      </td>
                      <td className="px-4 py-2">
                        <div className="w-9 h-9 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center">
                          <ProductImage id={p?.id || ''} code={p?.modelNo || p?.profileCode} url={p?.imageUrl} alt={item.description} className="w-full h-full object-cover" iconSize={14}/>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-xs font-bold text-slate-800 uppercase leading-tight">{item.description || p?.description || '—'}</div>
                        <div className="font-mono text-[10px] font-bold text-slate-400 uppercase">{code}</div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <div className="text-sm font-black text-slate-900">{need}</div>
                        {alreadyIssued > 0 && (
                          <div className="text-[9px] font-bold text-amber-600 uppercase tracking-wide">{alreadyIssued} out</div>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right text-xs font-black tabular-nums ${have < need ? 'text-rose-500' : 'text-slate-400'}`}>{have}</td>
                      <td className="px-4 py-2">
                        <input type="number" min={0} max={need} value={item.pickedQty ?? ''} placeholder="—"
                          onChange={e => updateLine(item.id, 'pickedQty', Number(e.target.value))}
                          className={`sap-input w-20 py-1 text-center text-sm font-black tabular-nums ${
                            untouched ? 'text-slate-400' : short ? 'text-amber-700 bg-amber-50 border border-amber-300' : 'text-emerald-700'
                          }`}/>
                      </td>
                      <td className="px-4 py-2">
                        <input value={item.storeNote || ''} onChange={e => updateLine(item.id, 'storeNote', e.target.value)}
                          placeholder="e.g. 2 damaged, substituted" className="sap-input w-full py-1 text-xs"/>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 flex-wrap">
            {/* The honest full pick: one click, but a deliberate one. */}
            <button onClick={pickAll} disabled={saving}
              className="mr-auto flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600">
              <PackageCheck size={13}/> Pick All ({needTotal})
            </button>
            <button onClick={() => handleSaveProgress(detailOrder)} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600">
              {saving ? <Loader2 size={13} className="animate-spin"/> : <Save size={13}/>} Save Progress
            </button>
            <button onClick={() => handleMarkPicked(detailOrder)} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
              <PackageCheck size={13}/> Mark Picked
            </button>
            <NipponGatePassButton mode="request" order={detailOrder} clientName={cli?.name || (detailOrder as { clientName?: string }).clientName || ''} onIssued={onGatePassIssued} />
            <button onClick={() => doIssue(detailOrder)} disabled={busy === detailOrder.id || saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">
              {busy === detailOrder.id ? <Loader2 size={13} className="animate-spin"/> : <PackageCheck size={13}/>} Issue / Deliver
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── List (queue) view ─────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-5xl mx-auto">
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
        <div className="space-y-3">
          {sortedOrders.map(q => {
            const cli = clients.find(c => c.id === q.clientId);
            const lines = (q.items || []).filter(i => !i.isSection);
            const val = (q as { total?: number }).total ?? lines.reduce((s, i) => s + (Number(i.amount) || 0), 0);
            return (
              <button key={q.id} onClick={() => openDetail(q)}
                className="w-full text-left bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow transition-all px-5 py-4 flex items-center gap-3 flex-wrap">
                {q.priority === 'Urgent' && <span className="flex items-center gap-1 text-[9px] font-black uppercase bg-rose-500 text-white px-2 py-0.5 rounded-full"><Zap size={10}/> Urgent</span>}
                {q.intercompany && <span title={`Intercompany order from ${q.sourceCompany}${q.sourceProjectTitle ? ` · ${q.sourceProjectTitle}` : ''}`} className="text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">IC · {q.sourceCompany}</span>}
                <span className="font-black text-blue-600 text-sm uppercase">{q.orderNo || q.id}</span>
                <span className="text-xs font-bold text-slate-600 uppercase">{cli?.name || (q as { clientName?: string }).clientName || '—'}</span>
                <span className="text-[10px] font-bold text-slate-400">{lines.length} line(s) · PKR {Number(val).toLocaleString()}</span>
                {q.specialInstructions && <span title={q.specialInstructions} className="flex items-center gap-1 text-[9px] font-black uppercase text-amber-600"><Info size={11}/> Instructions</span>}
                {q.gatePass && <span title={`Gate pass ${q.gatePass.qrToken} · ${q.gatePass.vehicleNo}`} className="flex items-center gap-1 text-[9px] font-black uppercase text-indigo-600"><Truck size={11}/> Gate Pass</span>}
                {pickBadge(q)}
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); doIssue(q); }} disabled={busy === q.id}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm transition-all">
                    {busy === q.id ? <Loader2 size={13} className="animate-spin"/> : <PackageCheck size={13}/>} Issue
                  </button>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StoreIssueScreen;
