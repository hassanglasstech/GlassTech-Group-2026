/**
 * NipponPriceLists — customer / transfer-price lists for Nippon (Intercompany P1).
 *
 * Nippon (trading) prices per product, not per glass attribute, so a list holds
 * a flat set of productId -> negotiated rate rows. To stay migration-free those
 * rows live in the price_lists row's `data.items` jsonb (see nipponPricing.ts) —
 * no price_list_items rows, no schema change.
 *
 * A client links to at most one list via `client.priceListId` (Assign Clients).
 * When that customer is on a Nippon order the line rate resolves from the list
 * before the product-master rate. This doubles as the intercompany transfer-price
 * card: set GTK (mirrorCompany='GTK' in Client Master) onto its "GTK Agreed Rates"
 * list and every GTK order auto-prices at the group-agreed rate.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { activeCompany } from '@/modules/shared/utils/activeCompany';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { Product, Client } from '@/modules/shared/types';
import { SbLooseRow } from '@/modules/shared/types/supabaseRows';
import { NipponPriceList, NipponPriceRow } from './nipponPricing';
import { Plus, Trash2, Save, X, Tag, Users, Check, Search, Building2 } from 'lucide-react';
import { toast } from 'sonner';

const blankList = (company: string): NipponPriceList => ({ company, name: '', description: '', isActive: true, items: [] });

const NipponPriceLists: React.FC = () => {
  const company = activeCompany() || 'Nippon';
  const [lists, setLists] = useState<NipponPriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingList, setEditingList] = useState<NipponPriceList | null>(null);
  const [rowModalOpen, setRowModalOpen] = useState(false);
  const [rowDraft, setRowDraft] = useState<NipponPriceRow | null>(null);
  const [rowSearch, setRowSearch] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [l, p, c] = await Promise.all([
      AsyncSalesService.getPriceLists(),
      AsyncSalesService.getProducts(),
      AsyncSalesService.getClients(),
    ]);
    setLists((l as unknown as NipponPriceList[]).filter(x => x.company === company));
    setProducts((p as Product[]).filter(x => x.company === company));
    setClients((c as Client[]).filter(x => x.company === company));
  }, [company]);

  useEffect(() => { refresh(); }, [refresh]);

  const selectedList = lists.find(l => l.id === selectedId) || null;
  const rows: NipponPriceRow[] = selectedList?.items || [];
  const clientsForSelected = clients.filter(c => c.priceListId === selectedId);

  // Persist a list (with its embedded rows) via the shared price_lists writer.
  const persistList = async (list: NipponPriceList): Promise<void> => {
    await AsyncSalesService.savePriceLists([list as unknown as SbLooseRow]);
    setLists(prev => prev.map(l => (l.id === list.id ? list : l)));
  };

  const handleSaveList = async () => {
    if (!editingList) return;
    if (!editingList.name.trim()) { toast.error('Name is required.'); return; }
    const id = editingList.id || `PL-NIP-${Date.now()}`;
    const row: NipponPriceList = { ...editingList, id, company, items: editingList.items || [] };
    await AsyncSalesService.savePriceLists([row as unknown as SbLooseRow]);
    toast.success(`Price list "${row.name}" saved.`);
    setEditingList(null);
    await refresh();
    setSelectedId(id);
  };

  const handleDeleteList = async (id: string) => {
    if (!confirm('Delete this price list? Assigned customers fall back to the product-master rate.')) return;
    await AsyncSalesService.deletePriceList(id);
    // Detach any clients pointing at it (spread the FULL client — never a lite
    // projection — or saveClients would blank contactPerson/email/etc).
    const detach: Client[] = clients.filter(c => c.priceListId === id).map(c => ({ ...c, priceListId: undefined }));
    if (detach.length) await AsyncSalesService.saveClients(detach);
    toast.success('Price list deleted.');
    if (selectedId === id) setSelectedId(null);
    await refresh();
  };

  const openAddRow = () => {
    setRowDraft({ productId: '', label: '', code: '', rate: 0, uom: 'PCS' });
    setRowSearch('');
    setRowModalOpen(true);
  };
  const openEditRow = (r: NipponPriceRow) => {
    setRowDraft({ ...r });
    setRowSearch(r.label || '');
    setRowModalOpen(true);
  };

  const pickProduct = (p: Product) => {
    setRowDraft(prev => ({
      ...(prev || { productId: '', rate: 0 }),
      productId: p.id,
      label: p.description || p.name || p.id,
      code: p.modelNo || p.profileCode || p.itemCode || p.id,
      uom: p.unit || 'PCS',
      rate: (prev && prev.rate > 0) ? prev.rate : (Number(p.basePrice) || 0),
    }));
    setRowSearch(p.description || p.name || p.id);
  };

  const handleSaveRow = async () => {
    if (!selectedList || !rowDraft) return;
    if (!rowDraft.productId) { toast.error('Pick a product first.'); return; }
    if (!(Number(rowDraft.rate) > 0)) { toast.error('Rate must be greater than 0.'); return; }
    const nextItems = (() => {
      const existingIdx = (selectedList.items || []).findIndex(r => r.productId === rowDraft.productId);
      const copy = [...(selectedList.items || [])];
      if (existingIdx >= 0) copy[existingIdx] = rowDraft;
      else copy.push(rowDraft);
      return copy;
    })();
    const updated: NipponPriceList = { ...selectedList, items: nextItems };
    await persistList(updated);
    toast.success('Rate saved.');
    setRowModalOpen(false);
    setRowDraft(null);
  };

  const handleDeleteRow = async (productId: string) => {
    if (!selectedList) return;
    const updated: NipponPriceList = { ...selectedList, items: (selectedList.items || []).filter(r => r.productId !== productId) };
    await persistList(updated);
  };

  const toggleClientAssignment = async (client: Client) => {
    if (!selectedId) return;
    const onThis = client.priceListId === selectedId;
    const updated: Client = { ...client, priceListId: onThis ? undefined : selectedId };
    await AsyncSalesService.saveClients([updated]);
    setClients(prev => prev.map(c => (c.id === client.id ? updated : c)));
  };

  const productMatches = useMemo(() => {
    const q = rowSearch.trim().toLowerCase();
    return products.filter(p => {
      if (!q) return true;
      const hay = [p.description, p.name, p.modelNo, p.profileCode, p.itemCode, p.brand].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).slice(0, 40);
  }, [products, rowSearch]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="bg-gradient-to-br from-blue-700 to-indigo-800 text-white p-5 rounded-2xl flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <Tag size={20}/>
          <div>
            <h2 className="text-lg font-black uppercase">Customer Price Lists</h2>
            <p className="text-[10px] text-blue-100 font-bold uppercase tracking-widest mt-0.5">
              Per-customer negotiated rates · intercompany transfer prices (GTK / GTI)
            </p>
          </div>
        </div>
        <button onClick={() => setEditingList(blankList(company))}
          className="bg-white text-blue-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-blue-50 shadow flex items-center gap-2">
          <Plus size={14}/> New Price List
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Lists column */}
        <div className="md:col-span-5 bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="bg-slate-50 border-b px-4 py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest">
            Price Lists ({lists.length})
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {lists.length === 0 && <div className="p-10 text-center text-slate-300 italic font-bold text-xs">No price lists yet.</div>}
            {lists.map(l => {
              const rowCount = (l.items || []).length;
              const clientCount = clients.filter(c => c.priceListId === l.id).length;
              return (
                <div key={l.id} onClick={() => setSelectedId(l.id || null)}
                  className={`p-4 border-b cursor-pointer ${selectedId === l.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-800 text-sm truncate">{l.name}</p>
                      {l.description && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{l.description}</p>}
                      <div className="flex gap-2 mt-1 text-[9px] font-bold text-slate-400 uppercase">
                        <span>{rowCount} products</span><span>·</span><span>{clientCount} clients</span>
                        {l.isActive === false && <span className="text-rose-500">· Inactive</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); setEditingList({ ...l }); }} className="p-1.5 text-blue-600 text-[10px] font-bold hover:bg-blue-50 rounded">Edit</button>
                      <button onClick={(e) => { e.stopPropagation(); l.id && handleDeleteList(l.id); }} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 size={12}/></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows column */}
        <div className="md:col-span-7 bg-white rounded-2xl border shadow-sm overflow-hidden">
          {selectedList ? (
            <>
              <div className="bg-slate-50 border-b px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Selected list</p>
                  <p className="font-black text-slate-800">{selectedList.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setAssignOpen(true)}
                    className="bg-white border border-slate-200 text-slate-600 text-[10px] font-black uppercase px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-slate-50">
                    <Users size={12}/> Assign Clients
                  </button>
                  <button onClick={openAddRow}
                    className="bg-emerald-600 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-emerald-700">
                    <Plus size={12}/> Add Product Rate
                  </button>
                </div>
              </div>

              {clientsForSelected.length > 0 && (
                <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center gap-2">
                  <Users size={11} className="text-emerald-700"/>
                  <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">{clientsForSelected.length} client(s):</span>
                  <span className="text-[10px] text-emerald-900 font-bold truncate">
                    {clientsForSelected.map(c => c.name + (c.mirrorCompany ? ` (${c.mirrorCompany})` : '')).join(', ')}
                  </span>
                </div>
              )}

              <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[9px] font-black uppercase text-slate-400 tracking-widest">
                    <tr>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Rate (PKR)</th>
                      <th className="px-3 py-2 text-right w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.length === 0 && (
                      <tr><td colSpan={4} className="p-10 text-center text-slate-300 italic font-bold">No product rates yet — add one.</td></tr>
                    )}
                    {rows.map(r => (
                      <tr key={r.productId} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono font-bold text-blue-600 uppercase">{r.code || '—'}</td>
                        <td className="px-3 py-2 font-bold text-slate-700">{r.label || r.productId}</td>
                        <td className="px-3 py-2 text-right font-black">{Number(r.rate).toLocaleString('en-PK')} <span className="text-[9px] text-slate-400">/{r.uom || 'PCS'}</span></td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => openEditRow(r)} className="text-[10px] font-bold text-primary hover:underline mr-2">Edit</button>
                          <button onClick={() => handleDeleteRow(r.productId)} className="text-rose-400 hover:text-rose-600"><Trash2 size={12}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-20 text-center text-slate-300 italic text-sm font-bold">Select a price list to manage its product rates.</div>
          )}
        </div>
      </div>

      {/* List form modal */}
      {editingList && (
        <div className="fixed inset-0 bg-slate-900/60 z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-blue-700 text-white px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-black uppercase">{editingList.id ? 'Edit Price List' : 'New Price List'}</span>
              <button onClick={() => setEditingList(null)} className="p-1 hover:bg-white/10 rounded"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Name *</label>
                <input className="sap-input w-full text-xs font-bold" placeholder="e.g. GTK Agreed Rates / Wholesale Tier"
                  value={editingList.name} onChange={e => setEditingList({ ...editingList, name: e.target.value })}/>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Description</label>
                <input className="sap-input w-full text-xs" value={editingList.description || ''} onChange={e => setEditingList({ ...editingList, description: e.target.value })}/>
              </div>
              <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={editingList.isActive !== false} onChange={e => setEditingList({ ...editingList, isActive: e.target.checked })}/> Active</label>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t flex justify-end gap-2">
              <button onClick={() => setEditingList(null)} className="px-4 py-2 text-xs font-bold text-slate-500 border rounded-lg">Cancel</button>
              <button onClick={handleSaveList} className="px-4 py-2 bg-blue-700 text-white rounded-lg text-xs font-black uppercase hover:bg-blue-800 flex items-center gap-1.5"><Save size={12}/> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Product-rate row modal */}
      {rowModalOpen && rowDraft && (
        <div className="fixed inset-0 bg-slate-900/60 z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-emerald-600 text-white px-5 py-3 flex items-center justify-between shrink-0">
              <span className="text-sm font-black uppercase">Product Rate</span>
              <button onClick={() => { setRowModalOpen(false); setRowDraft(null); }} className="p-1 hover:bg-white/10 rounded"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Product *</label>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input className="sap-input w-full text-xs pl-8" placeholder="Search product by name / code / brand…"
                    value={rowSearch} onChange={e => setRowSearch(e.target.value)}/>
                </div>
                {rowDraft.productId && (
                  <div className="mt-1.5 text-[10px] font-bold text-emerald-700 flex items-center gap-1.5">
                    <Check size={12}/> {rowDraft.code} · {rowDraft.label}
                  </div>
                )}
                {!rowDraft.productId && (
                  <div className="mt-1.5 border border-slate-200 rounded-lg max-h-52 overflow-y-auto divide-y divide-slate-50">
                    {productMatches.length === 0 && <div className="px-3 py-4 text-center text-slate-400 text-xs">No matching products.</div>}
                    {productMatches.map(p => (
                      <button key={p.id} onClick={() => pickProduct(p)} className="w-full text-left px-3 py-1.5 hover:bg-blue-50">
                        <div className="font-bold text-slate-800 text-xs uppercase truncate">{p.description || p.name || p.id}</div>
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span className="font-mono font-bold text-blue-600">{p.modelNo || p.profileCode || p.id}</span>
                          <span>master Rs {Number(p.basePrice || 0).toLocaleString()}/{p.unit || 'PCS'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {rowDraft.productId && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Customer Rate (PKR) *</label>
                    <input type="number" step="0.01" className="sap-input w-full text-xs font-bold text-blue-700"
                      value={rowDraft.rate || ''} onChange={e => setRowDraft({ ...rowDraft, rate: Number(e.target.value) })}/>
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Unit</label>
                    <input className="sap-input w-full text-xs" value={rowDraft.uom || 'PCS'} onChange={e => setRowDraft({ ...rowDraft, uom: e.target.value })}/>
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t flex justify-between items-center shrink-0">
              {rowDraft.productId && <button onClick={() => { setRowDraft({ ...rowDraft, productId: '', label: '', code: '' }); setRowSearch(''); }} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase">Change product</button>}
              <div className="ml-auto flex gap-2">
                <button onClick={() => { setRowModalOpen(false); setRowDraft(null); }} className="px-4 py-2 text-xs font-bold text-slate-500 border rounded-lg">Cancel</button>
                <button onClick={handleSaveRow} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase hover:bg-emerald-700 flex items-center gap-1.5"><Save size={12}/> Save Rate</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign clients modal */}
      {assignOpen && selectedList && (
        <div className="fixed inset-0 bg-slate-900/60 z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-sm font-black uppercase">Assign Clients</span>
                <p className="text-[10px] text-slate-300 font-bold truncate">{selectedList.name} · tap to add / remove</p>
              </div>
              <button onClick={() => setAssignOpen(false)} className="p-1 hover:bg-white/10 rounded shrink-0"><X size={16}/></button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100">
              {clients.length === 0 && (
                <div className="p-10 text-center text-slate-300 italic font-bold text-xs">No clients for {company}.</div>
              )}
              {clients.map(c => {
                const onThis = c.priceListId === selectedId;
                const onOther = !!c.priceListId && !onThis;
                return (
                  <button key={c.id} onClick={() => toggleClientAssignment(c)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-700 truncate flex items-center gap-1.5">
                        {c.mirrorCompany && <Building2 size={11} className="text-indigo-500 shrink-0"/>}
                        {c.name}
                        {c.mirrorCompany && <span className="text-[9px] font-black text-indigo-600 uppercase">{c.mirrorCompany} · IC</span>}
                      </p>
                      {onOther && <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider">On another list — tap to move here</p>}
                    </div>
                    <span className={`h-5 w-5 shrink-0 rounded flex items-center justify-center border ${onThis ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 text-transparent'}`}>
                      <Check size={13}/>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t flex justify-between items-center">
              <span className="text-[10px] font-black uppercase text-slate-400">{clientsForSelected.length} on this list</span>
              <button onClick={() => setAssignOpen(false)} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-black uppercase hover:bg-slate-900">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NipponPriceLists;
