/**
 * CustomerPortal — Nippon customer self-service (Portal tasks B + C).
 *
 * A Nippon customer logs in (role `customer`, granted the `customer-portal`
 * module for Nippon by the admin) and can:
 *   • browse the hardware catalogue with THEIR prices — the customer's assigned
 *     price list (IC-P1) if active, otherwise the standard product price;
 *   • give any product their own nickname so they order by a name they remember
 *     instead of our code (their personal library, saved per-user — task C);
 *   • build an order and send it to Nippon, which lands as a Draft quotation
 *     (`customerPlaced`) for the Nippon desk to review + approve.
 *
 * The login is linked to a customer record by matching the login email to a
 * Nippon client's email (admin sets the client email = the customer's login).
 * The customer never sees other customers' data (client-scoped).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/modules/auth/authStore';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { Client, Product, Quotation, QuotationItem } from '@/modules/shared/types';
import { ProductImage } from '@/modules/shared/components/ProductImage';
import { NipponPriceList, resolveClientRate } from './nipponPricing';
import { getNicknames, setNickname, NicknameMap } from './customerNicknames';
import { toast } from 'sonner';
import { Search, ShoppingCart, Plus, Minus, Trash2, Send, Tag, Package, Loader2, History, Store, BadgeCheck } from 'lucide-react';

interface CartLine { productId: string; name: string; nick?: string; unit: string; qty: number; rate: number }

const CustomerPortal: React.FC = () => {
  const { user, profile } = useAuthStore();
  const email = (profile?.email || user?.email || '').toLowerCase();
  const userId = user?.id || email;
  const displayName = profile?.fullName || email || 'Customer';

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceLists, setPriceLists] = useState<NipponPriceList[]>([]);
  const [nicks, setNicks] = useState<NicknameMap>({});
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [myOrders, setMyOrders] = useState<Quotation[]>([]);
  const [view, setView] = useState<'catalogue' | 'orders'>('catalogue');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [cs, ps, ls, qs] = await Promise.all([
      AsyncSalesService.getClients(), AsyncSalesService.getProducts(),
      AsyncSalesService.getPriceLists(), AsyncSalesService.getQuotations(),
    ]);
    setClients((cs as Client[]).filter(c => c.company === 'Nippon'));
    setProducts((ps as Product[]).filter(p => p.company === 'Nippon'));
    setPriceLists((ls as unknown as NipponPriceList[]).filter(l => l.company === 'Nippon'));
    setNicks(getNicknames(userId));
    const myClientId = (cs as Client[]).find(c => c.company === 'Nippon' && (c.email || '').toLowerCase() === email)?.id;
    setMyOrders((qs as Quotation[]).filter(q => q.company === 'Nippon' && q.clientId === myClientId)
      .sort((a, b) => String(b.id).localeCompare(String(a.id))));
    setLoading(false);
  }, [email, userId]);
  useEffect(() => { load(); }, [load]);

  // The client this login is linked to (by email).
  const myClient = useMemo(() => clients.find(c => (c.email || '').toLowerCase() === email), [clients, email]);
  const custRate = useMemo(() => resolveClientRate(myClient?.priceListId, priceLists), [myClient, priceLists]);
  const hasSpecialRates = !!myClient?.priceListId;

  const rateFor = useCallback((p: Product): number => {
    const r = custRate(p.id);
    return (r !== undefined && r > 0) ? r : (Number(p.price) || Number(p.basePrice) || 0);
  }, [custRate]);

  const nameFor = useCallback((p: Product): string => p.description || p.name || p.id, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      if (!q) return true;
      const hay = [p.description, p.name, p.modelNo, p.profileCode, p.brand, nicks[p.id]].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).slice(0, 200);
  }, [products, search, nicks]);

  const saveNick = (productId: string, nick: string) => setNicks(setNickname(userId, productId, nick));

  const addToCart = (p: Product) => {
    setCart(prev => {
      const i = prev.findIndex(l => l.productId === p.id);
      if (i >= 0) { const copy = [...prev]; copy[i] = { ...copy[i], qty: copy[i].qty + 1 }; return copy; }
      return [...prev, { productId: p.id, name: nameFor(p), nick: nicks[p.id], unit: p.unit || 'PCS', qty: 1, rate: rateFor(p) }];
    });
  };
  const setQty = (productId: string, qty: number) =>
    setCart(prev => prev.map(l => l.productId === productId ? { ...l, qty: Math.max(0, qty) } : l).filter(l => l.qty > 0));
  const removeLine = (productId: string) => setCart(prev => prev.filter(l => l.productId !== productId));

  const cartTotal = cart.reduce((s, l) => s + l.qty * l.rate, 0);

  const sendOrder = async () => {
    if (!myClient) { toast.error('Your login is not linked to a customer account yet. Contact Nippon.'); return; }
    if (cart.length === 0) { toast.error('Add at least one item to your order.'); return; }
    setSending(true);
    try {
      const now = new Date();
      const id = `CQ-${now.getTime()}`;
      const items: QuotationItem[] = cart.map((l, i) => ({
        id: `CQL-${now.getTime()}-${i}`,
        description: l.nick ? `${l.name}  [${l.nick}]` : l.name,
        locationCode: '', productRef: l.productId, glazingSpecs: '',
        glassSize: l.unit, qty: l.qty, width: 0, height: 0, totalSqFt: 0,
        pricePerUnit: l.rate, amount: l.qty * l.rate,
      }));
      const quo: Quotation = {
        id, company: 'Nippon', date: now.toISOString().split('T')[0], clientId: myClient.id,
        architect: '', site: '', subject: `Customer order — ${displayName}`,
        items, serviceCharges: [], discountPercent: 0, discountAmount: 0, glassDiscountPercent: 0,
        status: 'Draft', customerPlaced: true, receivedAmount: 0,
      };
      const res = await AsyncSalesService.saveQuotations([quo]);
      if (res?.error) { toast.error(`Order not sent — ${res.error}`, { duration: 8000 }); return; }
      toast.success('Order sent to Nippon — they will confirm shortly.', { duration: 7000 });
      setCart([]);
      await load();
      setView('orders');
    } catch (err) {
      toast.error(`Could not send order: ${err instanceof Error ? err.message : 'error'}`);
    } finally { setSending(false); }
  };

  if (loading) {
    return <div className="h-[70vh] flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Loading your catalogue…</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-700 to-indigo-800 text-white p-5 rounded-2xl flex items-center gap-3 flex-wrap">
        <div className="p-2.5 bg-white/15 rounded-xl"><Store size={22}/></div>
        <div>
          <h1 className="text-lg font-black uppercase tracking-tight">Nippon Customer Portal</h1>
          <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">{displayName}{myClient ? ` · ${myClient.name}` : ''}</p>
        </div>
        {hasSpecialRates
          ? <span className="ml-auto flex items-center gap-1.5 text-[10px] font-black uppercase bg-emerald-500/90 px-3 py-1.5 rounded-full"><BadgeCheck size={13}/> Your agreed rates</span>
          : <span className="ml-auto text-[10px] font-black uppercase bg-white/15 px-3 py-1.5 rounded-full">Standard prices</span>}
      </div>

      {!myClient && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs font-bold text-amber-800">
          Your login ({email || 'unknown'}) isn't linked to a customer account yet. You can browse, but ordering needs Nippon to link your account.
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button onClick={() => setView('catalogue')} className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest border ${view === 'catalogue' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}><Package size={12} className="inline mr-1.5"/>Catalogue</button>
        <button onClick={() => setView('orders')} className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest border ${view === 'orders' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}><History size={12} className="inline mr-1.5"/>My Orders ({myOrders.length})</button>
      </div>

      {view === 'orders' ? (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          {myOrders.length === 0 ? (
            <div className="p-16 text-center text-slate-300 italic font-bold text-xs">No orders yet.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-[9px] font-black uppercase text-slate-400 tracking-widest"><tr>
                <th className="px-4 py-2">Order</th><th className="px-4 py-2">Date</th><th className="px-4 py-2 text-center">Items</th>
                <th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-center">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {myOrders.map(o => {
                  const val = (o.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-black text-blue-600 uppercase">{o.orderNo || o.id}</td>
                      <td className="px-4 py-2 text-slate-500">{o.date}</td>
                      <td className="px-4 py-2 text-center">{(o.items || []).filter(i => !i.isSection).length}</td>
                      <td className="px-4 py-2 text-right font-black tabular-nums">{val.toLocaleString()}</td>
                      <td className="px-4 py-2 text-center"><span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{o.customerPlaced && o.status === 'Draft' ? 'Sent' : o.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Catalogue */}
          <div className="lg:col-span-2 bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="p-3 border-b bg-slate-50">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, your nickname, code, brand…" className="sap-input w-full text-xs pl-9"/>
              </div>
            </div>
            <div className="max-h-[62vh] overflow-y-auto divide-y divide-slate-50">
              {filtered.length === 0 && <div className="p-10 text-center text-slate-300 italic font-bold text-xs">No products found.</div>}
              {filtered.map(p => (
                <div key={p.id} className="px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50">
                  <div className="w-11 h-11 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center shrink-0">
                    <ProductImage id={p.id} code={p.modelNo || p.profileCode} url={p.imageUrl} alt={nameFor(p)} className="w-full h-full object-cover" iconSize={16}/>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800 uppercase truncate">{nameFor(p)}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Tag size={10} className="text-blue-400 shrink-0"/>
                      <input defaultValue={nicks[p.id] || ''} onBlur={e => saveNick(p.id, e.target.value)}
                        placeholder="Add your own name…" className="text-[11px] font-bold text-blue-700 bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 outline-none w-40 py-0.5"/>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-slate-800 tabular-nums">Rs {rateFor(p).toLocaleString()}</div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase">/{p.unit || 'PCS'}</div>
                  </div>
                  <button onClick={() => addToCart(p)} className="shrink-0 flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black uppercase"><Plus size={12}/> Add</button>
                </div>
              ))}
            </div>
          </div>

          {/* Cart */}
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col max-h-[70vh]">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center gap-2">
              <ShoppingCart size={16}/><span className="text-xs font-black uppercase tracking-widest">Your Order</span>
              <span className="ml-auto text-[10px] font-bold text-slate-300">{cart.length} item(s)</span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {cart.length === 0 ? (
                <div className="p-10 text-center text-slate-300 italic font-bold text-xs">Add products from the catalogue.</div>
              ) : cart.map(l => (
                <div key={l.productId} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 truncate">{l.nick || l.name}</span>
                    <button onClick={() => removeLine(l.productId)} className="text-slate-300 hover:text-rose-500 shrink-0"><Trash2 size={13}/></button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setQty(l.productId, l.qty - 1)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><Minus size={12}/></button>
                      <input type="number" min={0} value={l.qty} onChange={e => setQty(l.productId, Number(e.target.value))} className="sap-input w-12 py-0.5 text-center text-xs font-black"/>
                      <button onClick={() => setQty(l.productId, l.qty + 1)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><Plus size={12}/></button>
                    </div>
                    <span className="text-xs font-black text-slate-800 tabular-nums">Rs {(l.qty * l.rate).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total</span>
                <span className="text-lg font-black text-slate-900 tabular-nums">Rs {cartTotal.toLocaleString()}</span>
              </div>
              <button onClick={sendOrder} disabled={sending || cart.length === 0 || !myClient}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest">
                {sending ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Send Order to Nippon
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPortal;
