/**
 * GlasscoPriceLists.tsx — Phase 6 (6.4)
 *
 * Customer-tier price list management. Two-pane layout (mirrors BOM
 * Master): left = lists, right = items + clients linked to the
 * selected list.
 *
 * Workflow:
 *   1. Owner creates a price list (e.g. "Wholesale Tier", "Site Contract A").
 *   2. Adds line overrides — (glass_type, thickness, sub_category,
 *      service_nick) → rate.
 *   3. Assigns the list to one or more clients via Client Master
 *      (`price_list_id` / `customer_tier` columns added by migration 036).
 *
 * Quotation rate lookup is a follow-up wiring (the GlasscoUtils
 * `calculateAutoRate` helper would call into this on the quotation
 * editor screen). For Phase 6 MVP we deliver the master-data UI so
 * pricing teams can populate it ahead of any consumer-side change.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { Plus, Trash2, Save, X, Tag, Users } from 'lucide-react';
import { toast } from 'sonner';

interface PriceList {
  id?: string; company: string; name: string;
  description?: string; effectiveFrom?: string; effectiveTo?: string;
  isActive?: boolean; createdBy?: string; createdAt?: string;
}
interface PriceListItem {
  id?: string; priceListId: string; company: string;
  glassType?: string; thickness?: string; subCategory?: string;
  serviceNick?: string; rate: number; uom?: string; notes?: string;
}

const blankList = (company: string): PriceList => ({
  company, name: '', description: '', isActive: true,
});
const blankItem = (priceListId: string, company: string): PriceListItem => ({
  priceListId, company, glassType: 'Plain', thickness: '5mm', subCategory: 'Standard',
  serviceNick: '', rate: 0, uom: 'sqft',
});

const GlasscoPriceLists: React.FC = () => {
  const company = (useAppStore(s => s.selectedCompany) as any) || 'Glassco';
  const [lists, setLists] = useState<PriceList[]>([]);
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingList, setEditingList] = useState<PriceList | null>(null);
  const [editingItem, setEditingItem] = useState<PriceListItem | null>(null);

  const refresh = useCallback(async () => {
    const [l, i, c] = await Promise.all([
      AsyncSalesService.getPriceLists(),
      AsyncSalesService.getPriceListItems(),
      AsyncSalesService.getClients(),
    ]);
    setLists((l as any[]).filter(x => x.company === company));
    setItems(i as any[]);
    setClients((c as any[]).filter(x => x.company === company));
  }, [company]);

  useEffect(() => { refresh(); }, [refresh]);

  const selectedList = lists.find(l => l.id === selectedId) || null;
  const itemsForSelected = items.filter(i => i.priceListId === selectedId);
  const clientsForSelected = clients.filter((c) => c.priceListId === selectedId);

  const handleSaveList = async () => {
    if (!editingList) return;
    if (!editingList.name.trim()) { toast.error('Name is required.'); return; }
    const id = editingList.id || `PL-${company.substring(0,3).toUpperCase()}-${Date.now()}`;
    const row: any = { ...editingList, id, company };
    await AsyncSalesService.savePriceLists([row]);
    toast.success(`Price list "${row.name}" saved.`);
    setEditingList(null);
    await refresh();
    setSelectedId(id);
  };

  const handleDeleteList = async (id: string) => {
    if (!confirm('Delete price list and all its items?')) return;
    // Delete items first, then list
    const itemsToDelete = items.filter(i => i.priceListId === id);
    for (const it of itemsToDelete) if (it.id) await AsyncSalesService.deletePriceListItem(it.id);
    await AsyncSalesService.deletePriceList(id);
    toast.success('Price list deleted.');
    if (selectedId === id) setSelectedId(null);
    await refresh();
  };

  const handleSaveItem = async () => {
    if (!editingItem || !selectedId) return;
    if (editingItem.rate <= 0) { toast.error('Rate must be > 0.'); return; }
    const id = editingItem.id || `PLI-${company.substring(0,3).toUpperCase()}-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const row: any = { ...editingItem, id, company, priceListId: selectedId };
    await AsyncSalesService.savePriceListItems([row]);
    toast.success('Item saved.');
    setEditingItem(null);
    await refresh();
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this rate override?')) return;
    await AsyncSalesService.deletePriceListItem(id);
    await refresh();
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="bg-gradient-to-br from-amber-600 to-orange-700 text-white p-5 rounded-2xl flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <Tag size={20}/>
          <div>
            <h2 className="text-lg font-black uppercase">Customer Price Lists</h2>
            <p className="text-[10px] text-amber-100 font-bold uppercase tracking-widest mt-0.5">
              Tiered rates per glass type / thickness / service
            </p>
          </div>
        </div>
        <button onClick={() => setEditingList(blankList(company))}
          className="bg-white text-amber-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-amber-50 shadow flex items-center gap-2"
        ><Plus size={14}/> New Price List</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-5 bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="bg-slate-50 border-b px-4 py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest">
            Price Lists ({lists.length})
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {lists.length === 0 && <div className="p-10 text-center text-slate-300 italic font-bold text-xs">No price lists yet.</div>}
            {lists.map(l => {
              const itemCount = items.filter(i => i.priceListId === l.id).length;
              const clientCount = clients.filter((c) => c.priceListId === l.id).length;
              return (
                <div key={l.id} onClick={() => setSelectedId(l.id || null)}
                  className={`p-4 border-b cursor-pointer ${selectedId === l.id ? 'bg-amber-50 border-l-4 border-l-amber-600' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-800 text-sm truncate">{l.name}</p>
                      {l.description && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{l.description}</p>}
                      <div className="flex gap-2 mt-1 text-[9px] font-bold text-slate-400 uppercase">
                        <span>{itemCount} items</span><span>·</span><span>{clientCount} clients</span>
                        {!l.isActive && <span className="text-rose-500">· Inactive</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); setEditingList({ ...l }); }} className="p-1.5 text-amber-600 text-[10px] font-bold hover:bg-amber-50 rounded">Edit</button>
                      <button onClick={(e) => { e.stopPropagation(); l.id && handleDeleteList(l.id); }} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 size={12}/></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="md:col-span-7 bg-white rounded-2xl border shadow-sm overflow-hidden">
          {selectedList ? (
            <>
              <div className="bg-slate-50 border-b px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Selected list</p>
                  <p className="font-black text-slate-800">{selectedList.name}</p>
                </div>
                <button onClick={() => setEditingItem(blankItem(selectedList.id || '', company))}
                  className="bg-emerald-600 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-emerald-700">
                  <Plus size={12}/> Add Override
                </button>
              </div>

              {clientsForSelected.length > 0 && (
                <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center gap-2">
                  <Users size={11} className="text-emerald-700"/>
                  <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">{clientsForSelected.length} client(s) on this list:</span>
                  <span className="text-[10px] text-emerald-900 font-bold truncate">{clientsForSelected.map((c) => c.name).join(', ')}</span>
                </div>
              )}

              <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[9px] font-black uppercase text-slate-400 tracking-widest">
                    <tr>
                      <th className="px-3 py-2">Glass Type</th>
                      <th className="px-3 py-2">Thickness</th>
                      <th className="px-3 py-2">Sub-Cat</th>
                      <th className="px-3 py-2">Service</th>
                      <th className="px-3 py-2 text-right">Rate (PKR)</th>
                      <th className="px-3 py-2 text-right w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemsForSelected.length === 0 && (
                      <tr><td colSpan={6} className="p-10 text-center text-slate-300 italic font-bold">No rate overrides yet.</td></tr>
                    )}
                    {itemsForSelected.map(it => (
                      <tr key={it.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-bold text-slate-700">{it.glassType || 'Any'}</td>
                        <td className="px-3 py-2 text-slate-600">{it.thickness || 'Any'}</td>
                        <td className="px-3 py-2 text-slate-500">{it.subCategory || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{it.serviceNick || '— (sheet)'}</td>
                        <td className="px-3 py-2 text-right font-black">{it.rate.toLocaleString('en-PK')} <span className="text-[9px] text-slate-400">/{it.uom || 'sqft'}</span></td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => setEditingItem({ ...it })} className="text-[10px] font-bold text-primary hover:underline mr-2">Edit</button>
                          <button onClick={() => it.id && handleDeleteItem(it.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={12}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-20 text-center text-slate-300 italic text-sm font-bold">Select a price list to manage its rate overrides.</div>
          )}
        </div>
      </div>

      {/* List form modal */}
      {editingList && (
        <div className="fixed inset-0 bg-slate-900/60 z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-amber-700 text-white px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-black uppercase">{editingList.id ? 'Edit Price List' : 'New Price List'}</span>
              <button onClick={() => setEditingList(null)} className="p-1 hover:bg-white/10 rounded"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Name *</label>
                <input className="sap-input w-full text-xs font-bold" value={editingList.name} onChange={e => setEditingList({ ...editingList, name: e.target.value })}/>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Description</label>
                <input className="sap-input w-full text-xs" value={editingList.description || ''} onChange={e => setEditingList({ ...editingList, description: e.target.value })}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Effective From</label>
                  <input type="date" className="sap-input w-full text-xs" value={editingList.effectiveFrom || ''} onChange={e => setEditingList({ ...editingList, effectiveFrom: e.target.value })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Effective To</label>
                  <input type="date" className="sap-input w-full text-xs" value={editingList.effectiveTo || ''} onChange={e => setEditingList({ ...editingList, effectiveTo: e.target.value })}/>
                </div>
              </div>
              <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={editingList.isActive !== false} onChange={e => setEditingList({ ...editingList, isActive: e.target.checked })}/> Active</label>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t flex justify-end gap-2">
              <button onClick={() => setEditingList(null)} className="px-4 py-2 text-xs font-bold text-slate-500 border rounded-lg">Cancel</button>
              <button onClick={handleSaveList} className="px-4 py-2 bg-amber-700 text-white rounded-lg text-xs font-black uppercase hover:bg-amber-800 flex items-center gap-1.5"><Save size={12}/> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Item form modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-emerald-600 text-white px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-black uppercase">{editingItem.id ? 'Edit Override' : 'New Rate Override'}</span>
              <button onClick={() => setEditingItem(null)} className="p-1 hover:bg-white/10 rounded"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Glass Type</label>
                  <select className="sap-input w-full text-xs" value={editingItem.glassType || ''} onChange={e => setEditingItem({ ...editingItem, glassType: e.target.value })}>
                    {['Plain','Tinted','Mirror','Reflective','Tempered','Laminated','Any'].map(g => <option key={g} value={g === 'Any' ? '' : g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Thickness</label>
                  <select className="sap-input w-full text-xs" value={editingItem.thickness || ''} onChange={e => setEditingItem({ ...editingItem, thickness: e.target.value })}>
                    {['Any','3mm','4mm','5mm','6mm','8mm','10mm','12mm','15mm','19mm'].map(t => <option key={t} value={t === 'Any' ? '' : t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Sub-Category</label>
                  <select className="sap-input w-full text-xs" value={editingItem.subCategory || ''} onChange={e => setEditingItem({ ...editingItem, subCategory: e.target.value })}>
                    <option value="">— Any —</option>
                    {['Standard','D/G','Laminated','Reflective','Frosted'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Service</label>
                  <input className="sap-input w-full text-xs" placeholder="(sheet rate when blank)" value={editingItem.serviceNick || ''} onChange={e => setEditingItem({ ...editingItem, serviceNick: e.target.value })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Rate (PKR) *</label>
                  <input type="number" step="0.01" className="sap-input w-full text-xs" value={editingItem.rate} onChange={e => setEditingItem({ ...editingItem, rate: Number(e.target.value) })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">UoM</label>
                  <input className="sap-input w-full text-xs" value={editingItem.uom || 'sqft'} onChange={e => setEditingItem({ ...editingItem, uom: e.target.value })}/>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Notes</label>
                <input className="sap-input w-full text-xs" value={editingItem.notes || ''} onChange={e => setEditingItem({ ...editingItem, notes: e.target.value })}/>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t flex justify-end gap-2">
              <button onClick={() => setEditingItem(null)} className="px-4 py-2 text-xs font-bold text-slate-500 border rounded-lg">Cancel</button>
              <button onClick={handleSaveItem} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase hover:bg-emerald-700 flex items-center gap-1.5"><Save size={12}/> Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlasscoPriceLists;
