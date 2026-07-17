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
import { Quotation, Client, Product, QuotationItem, StoreItem, GatePassInfo } from '@/modules/shared/types';
import { ProductImage } from '@/modules/shared/components/ProductImage';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { issueNipponOrder, isPendingIssue } from './nipponFulfilmentService';
import { pushCrossCompanyNotif } from '@/modules/shared/services/crossCompanyNotifService';
import { notifyBuyerOfStatus, bookBuyerProjectCost } from '@/modules/sales/services/intercompanyOrderService';
import UrduDriverSlip from '@/modules/shared/components/UrduDriverSlip';
import { toast } from 'sonner';
import { PackageCheck, Loader2, RefreshCw, ClipboardList, ArrowLeft, MapPin, Save, Zap, Info, Truck, QrCode, X, FileText } from 'lucide-react';

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

  // Gate Pass (B) — issue modal state.
  const [gpOrder, setGpOrder] = useState<Quotation | null>(null);
  const [gpForm, setGpForm] = useState({ vehicleNo: '', driverName: '', driverPhone: '', isReturnable: false, instructions: '' });
  const [gpIssuing, setGpIssuing] = useState(false);
  const [urduSlipOrder, setUrduSlipOrder] = useState<Quotation | null>(null);   // Gate Pass D

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
    // Seed an editable copy: bin from the store bin, picked qty defaulting to the
    // ordered qty (a full pick) unless a prior partial pick was saved.
    const seeded = (q.items || []).map(it => it.isSection ? it : ({
      ...it,
      binLocation: it.binLocation || (storeItemFor(it)?.storageBin ?? ''),
      pickedQty: it.pickedQty ?? (Number(it.qty) || 0),
    }));
    setDetailItems(seeded);
    setDetailId(q.id);
  };
  const closeDetail = () => { setDetailId(null); setDetailItems([]); };

  const updateLine = (lineId: string, field: 'binLocation' | 'storeNote' | 'pickedQty', value: string | number) => {
    setDetailItems(prev => prev.map(it => (it.id === lineId ? { ...it, [field]: value } : it)));
  };

  // Persist pick progress (bin + picked qty + notes) onto the order. markPicked
  // stamps it 'Picked' (fully staged, ready for gate pass); otherwise 'Picking'.
  const savePick = async (q: Quotation, markPicked: boolean): Promise<boolean> => {
    setSaving(true);
    try {
      const updated: Quotation = {
        ...q,
        items: detailItems,
        pickStatus: markPicked ? 'Picked' : 'Picking',
        pickedBy: stampUser,
        pickedAt: new Date().toISOString(),
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

  // Gate Pass (B) — office issues a QR-verified pass from a staged order and pushes
  // it cross-company to the Factory gatekeeper (who stamps IN/OUT at the shared gate).
  const openGpModal = (q: Quotation) => {
    const gp = q.gatePass;
    setGpForm({
      vehicleNo: gp?.vehicleNo || '', driverName: gp?.driverName || '',
      driverPhone: gp?.driverPhone || '', isReturnable: gp?.isReturnable || false,
      instructions: gp?.instructions || q.specialInstructions || '',
    });
    setGpOrder(q);
  };
  const issueGatePass = async () => {
    if (!gpOrder) return;
    if (!gpForm.vehicleNo.trim() || !gpForm.driverName.trim()) { toast.error('Vehicle no. and driver name are required.'); return; }
    setGpIssuing(true);
    try {
      const qrToken = `GP-${gpOrder.id}-${Date.now().toString(36).toUpperCase()}`;
      const gatePass: GatePassInfo = {
        qrToken,
        vehicleNo: gpForm.vehicleNo.trim().toUpperCase(),
        driverName: gpForm.driverName.trim(),
        driverPhone: gpForm.driverPhone.trim() || undefined,
        isReturnable: gpForm.isReturnable,
        instructions: gpForm.instructions.trim() || undefined,
        issuedAt: new Date().toISOString(),
        issuedBy: stampUser,
        status: 'Issued',
      };
      const updated: Quotation = { ...gpOrder, gatePass };
      const res = await AsyncSalesService.saveQuotations([updated]);
      if (res?.error) { toast.error(`Gate pass not saved — ${res.error}`, { duration: 8000 }); return; }
      setOrders(prev => prev.map(o => (o.id === gpOrder.id ? updated : o)));
      // Real-time push to the Factory gatekeeper (cross-company). The gatekeeper
      // screen (phase C) reads these + scans the qrToken to clear the vehicle.
      const cli = clients.find(c => c.id === gpOrder.clientId);
      await pushCrossCompanyNotif({
        targetCompany: 'Factory',
        fromCompany: activeCompany(),
        title: `Gate Pass — ${gpOrder.orderNo || gpOrder.id}`,
        message: `${cli?.name || 'Customer'} · Vehicle ${gatePass.vehicleNo} · Driver ${gatePass.driverName}${gatePass.driverPhone ? ` (${gatePass.driverPhone})` : ''}${gatePass.isReturnable ? ' · RETURNABLE' : ''} · QR ${qrToken}`,
        type: 'general',
        referenceId: gpOrder.id,
        link: `#/gatekeeper`,
      });
      toast.success(`Gate pass issued for ${gpOrder.orderNo || gpOrder.id} — pushed to the Factory gate.`);
      setGpOrder(null);
    } catch (err) {
      toast.error(`Gate pass failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally { setGpIssuing(false); }
  };

  const doIssue = async (q: Quotation) => {
    const ok = await confirmModal(`Issue goods for ${q.orderNo || q.id}? On-hand stock will be reduced and the order marked Delivered.`);
    if (!ok) return;
    setBusy(q.id);
    // Capture the pick (bin/qty/notes) before the stock-out so the record is complete.
    if (detailId === q.id) await savePick(q, true);
    const res = await issueNipponOrder(q.id);
    setBusy(null);
    if (res.error) { toast.error(`Issue failed — ${res.error}`, { duration: 8000 }); return; }
    if (res.invoiceId) toast.success(`Issued — ${res.orderNo} delivered · invoice ${res.invoiceId} posted.`);
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

  // Gate-pass issue modal — rendered in both views (opened from either).
  const gpModalEl = gpOrder && (
    <div className="fixed inset-0 bg-slate-900/60 z-[600] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><Truck size={16}/><span className="text-sm font-black uppercase">Issue Gate Pass</span></div>
          <button onClick={() => setGpOrder(null)} className="p-1 hover:bg-white/10 rounded"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{gpOrder.orderNo || gpOrder.id} · authorises goods to leave the gate</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Vehicle No *</label>
              <input value={gpForm.vehicleNo} onChange={e => setGpForm(f => ({ ...f, vehicleNo: e.target.value }))} className="sap-input w-full text-xs font-black uppercase" placeholder="ABC-123"/>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Driver Name *</label>
              <input value={gpForm.driverName} onChange={e => setGpForm(f => ({ ...f, driverName: e.target.value }))} className="sap-input w-full text-xs font-bold"/>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Driver Phone</label>
              <input value={gpForm.driverPhone} onChange={e => setGpForm(f => ({ ...f, driverPhone: e.target.value }))} className="sap-input w-full text-xs font-bold" placeholder="03xx-xxxxxxx"/>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs font-black uppercase text-slate-600 cursor-pointer pb-1.5">
                <input type="checkbox" checked={gpForm.isReturnable} onChange={e => setGpForm(f => ({ ...f, isReturnable: e.target.checked }))} className="w-4 h-4"/> Returnable
              </label>
            </div>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Driver / Gate Instructions</label>
            <input value={gpForm.instructions} onChange={e => setGpForm(f => ({ ...f, instructions: e.target.value }))} className="sap-input w-full text-xs" placeholder="Fragile · call before delivery · deliver by…"/>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <QrCode size={16} className="text-indigo-600"/>
            <span className="text-[10px] font-bold text-indigo-800">A QR-verified pass is generated + pushed to the Factory gatekeeper in real time.</span>
          </div>
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t flex justify-end gap-2">
          <button onClick={() => setGpOrder(null)} className="px-4 py-2 text-xs font-bold text-slate-500 border rounded-lg">Cancel</button>
          <button onClick={issueGatePass} disabled={gpIssuing} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-black uppercase hover:bg-slate-900 flex items-center gap-1.5 disabled:opacity-50">
            {gpIssuing ? <Loader2 size={13} className="animate-spin"/> : <Truck size={13}/>} Issue Pass
          </button>
        </div>
      </div>
    </div>
  );

  // Urdu driver slip (Gate Pass D) — rendered in both views.
  const urduSlipEl = urduSlipOrder && (
    <UrduDriverSlip
      order={urduSlipOrder}
      clientName={clients.find(c => c.id === urduSlipOrder.clientId)?.name || (urduSlipOrder as { clientName?: string }).clientName || ''}
      onClose={() => setUrduSlipOrder(null)}
    />
  );

  // ── Detail (pick) view ────────────────────────────────────────────────────
  if (detailOrder) {
    const cli = clients.find(c => c.id === detailOrder.clientId);
    const lines = detailItems.filter(i => !i.isSection);
    // Bin-sorted walk path so the picker crosses the aisle once.
    const walk = [...lines].sort((a, b) => (binFor(a) || 'zzzz').localeCompare(binFor(b) || 'zzzz'));
    const pickedTotal = lines.reduce((s, i) => s + (Number(i.pickedQty) || 0), 0);
    const needTotal = lines.reduce((s, i) => s + (Number(i.qty) || 0), 0);
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
                  const need = Number(item.qty) || 0;
                  const picked = Number(item.pickedQty) || 0;
                  const short = picked < need;
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
                      <td className="px-4 py-2 text-right text-sm font-black text-slate-900 tabular-nums">{need}</td>
                      <td className={`px-4 py-2 text-right text-xs font-black tabular-nums ${have < need ? 'text-rose-500' : 'text-slate-400'}`}>{have}</td>
                      <td className="px-4 py-2">
                        <input type="number" min={0} value={item.pickedQty ?? ''} onChange={e => updateLine(item.id, 'pickedQty', Number(e.target.value))}
                          className={`sap-input w-20 py-1 text-center text-sm font-black tabular-nums ${short ? 'text-amber-700 bg-amber-50 border border-amber-300' : 'text-emerald-700'}`}/>
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
            <button onClick={() => handleSaveProgress(detailOrder)} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600">
              {saving ? <Loader2 size={13} className="animate-spin"/> : <Save size={13}/>} Save Progress
            </button>
            <button onClick={() => handleMarkPicked(detailOrder)} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
              <PackageCheck size={13}/> Mark Picked
            </button>
            <button onClick={() => openGpModal(detailOrder)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${detailOrder.gatePass ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-slate-700 hover:bg-slate-800 text-white'}`}>
              <Truck size={13}/> {detailOrder.gatePass ? 'Gate Pass ✓' : 'Issue Gate Pass'}
            </button>
            {detailOrder.gatePass && (
              <button onClick={() => setUrduSlipOrder(detailOrder)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-800 hover:bg-amber-200">
                <FileText size={13}/> اردو پرچی
              </button>
            )}
            <button onClick={() => doIssue(detailOrder)} disabled={busy === detailOrder.id || saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">
              {busy === detailOrder.id ? <Loader2 size={13} className="animate-spin"/> : <PackageCheck size={13}/>} Issue / Deliver
            </button>
          </div>
        </div>
        {gpModalEl}
        {urduSlipEl}
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
      {gpModalEl}
      {urduSlipEl}
    </div>
  );
};

export default StoreIssueScreen;
