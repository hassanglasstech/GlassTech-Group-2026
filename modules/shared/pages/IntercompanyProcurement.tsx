/**
 * IntercompanyProcurement — Intercompany P2 UI (Project → IC Order).
 *
 * A GTK/GTI project raises a material demand on a supplier company (Glassco for
 * glass, Nippon for hardware) at agreed transfer rates. On "Raise", the order is
 * mirrored into the supplier's Sales pipeline AT ORDER TIME (a tagged Approved
 * Sales Order) so they can plan/pick immediately — and it stays linked to the
 * buyer's project. Mounted as a tab in the Intercompany Hub.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Company } from '@/modules/shared/types/core';
import { Project, Product } from '@/modules/shared/types';
import { ProjectService } from '@/modules/projects/services/projectService';
import { SalesService } from '@/modules/sales/services/salesService';
import { useAuthStore } from '@/modules/auth/authStore';
import { raiseIntercompanyOrder, ICOrderLine } from '@/modules/sales/services/intercompanyOrderService';
import { toast } from 'sonner';
import { Plus, Trash2, Search, Send, Building2, FolderOpen, Package } from 'lucide-react';

const BUYERS: Company[] = ['GTK', 'GTI'];
const SUPPLIERS: Company[] = ['Glassco', 'Nippon'];

const blankLine = (): ICOrderLine => ({ description: '', unit: 'PCS', qty: 1, rate: 0 });

const IntercompanyProcurement: React.FC = () => {
  const actor = useAuthStore(s => s.profile?.fullName || s.user?.email || 'group');
  const [buyer, setBuyer] = useState<Company>('GTK');
  const [supplier, setSupplier] = useState<Company>('Glassco');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<ICOrderLine[]>([blankLine()]);
  const [pickerRow, setPickerRow] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [raising, setRaising] = useState(false);

  useEffect(() => {
    setProjects(ProjectService.getProjects().filter(p => p.company === buyer));
  }, [buyer]);
  useEffect(() => {
    setProducts(SalesService.getProducts().filter(p => p.company === supplier));
  }, [supplier]);

  const project = projects.find(p => p.id === projectId) || null;
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);

  const updateLine = (i: number, patch: Partial<ICOrderLine>) =>
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines(prev => [...prev, blankLine()]);
  const removeLine = (i: number) => setLines(prev => (prev.length === 1 ? [blankLine()] : prev.filter((_, idx) => idx !== i)));

  const pickProduct = (i: number, p: Product) => {
    updateLine(i, {
      productRef: p.id,
      code: p.modelNo || p.profileCode || p.itemCode || p.id,
      description: p.description || p.name || p.id,
      unit: p.unit || 'PCS',
      rate: Number(p.basePrice) || 0,   // agreed rate prefilled from master; editable
    });
    setPickerRow(null);
    setPickerSearch('');
  };

  const productMatches = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return products.filter(p => {
      if (!q) return true;
      return [p.description, p.name, p.modelNo, p.profileCode, p.itemCode, p.brand].filter(Boolean).join(' ').toLowerCase().includes(q);
    }).slice(0, 40);
  }, [products, pickerSearch]);

  const handleRaise = async () => {
    const clean = lines.filter(l => l.description.trim() && Number(l.qty) > 0);
    if (clean.length === 0) { toast.error('Add at least one material line.'); return; }
    if (buyer === supplier) { toast.error('Buyer and supplier must differ.'); return; }
    setRaising(true);
    const res = await raiseIntercompanyOrder({
      supplierCompany: supplier, buyerCompany: buyer,
      projectId: projectId || undefined, projectTitle: project?.title,
      lines: clean, actor,
    });
    setRaising(false);
    if (res.error) { toast.error(`Could not raise IC order — ${res.error}`, { duration: 8000 }); return; }
    toast.success(`IC order ${res.orderNo} raised on ${supplier} — now in their Sales & Store queue.`, { duration: 7000 });
    setLines([blankLine()]);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="bg-gradient-to-br from-indigo-700 to-blue-800 text-white p-6 rounded-2xl shadow-xl">
        <h2 className="text-xl font-black uppercase tracking-tight">Project → Intercompany Order</h2>
        <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-1">
          Raise glass (Glassco) / hardware (Nippon) demand at agreed rates — mirrors into the supplier's Sales at order time
        </p>
      </div>

      {/* Config */}
      <div className="bg-white rounded-2xl border shadow-sm p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 mb-1 flex items-center gap-1.5"><Building2 size={12}/> Buyer (project owner)</label>
          <select value={buyer} onChange={e => { setBuyer(e.target.value as Company); setProjectId(''); }} className="sap-input w-full font-bold">
            {BUYERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 mb-1 flex items-center gap-1.5"><Package size={12}/> Supplier</label>
          <select value={supplier} onChange={e => setSupplier(e.target.value as Company)} className="sap-input w-full font-bold">
            {SUPPLIERS.map(c => <option key={c} value={c}>{c === 'Glassco' ? 'Glassco (glass)' : 'Nippon (hardware)'}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 mb-1 flex items-center gap-1.5"><FolderOpen size={12}/> Project (optional)</label>
          <select value={projectId} onChange={e => setProjectId(e.target.value)} className="sap-input w-full font-bold">
            <option value="">— No project link —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      </div>

      {/* Lines */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b flex items-center justify-between">
          <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Material lines · {supplier} at agreed rates</span>
          <button onClick={addLine} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-indigo-700"><Plus size={12}/> Add Line</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-white border-b text-[9px] font-black uppercase text-slate-400"><tr>
              <th className="px-4 py-2 w-[46%]">Item</th><th className="px-4 py-2 w-20">Unit</th>
              <th className="px-4 py-2 w-20 text-right">Qty</th><th className="px-4 py-2 w-28 text-right">Rate (PKR)</th>
              <th className="px-4 py-2 w-28 text-right">Amount</th><th className="px-4 py-2 w-10"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {lines.map((l, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2 relative">
                    <div className="flex items-center gap-1.5">
                      <input value={l.description} onChange={e => updateLine(i, { description: e.target.value })}
                        placeholder="Material description" className="sap-input w-full py-1 text-xs font-bold"/>
                      <button onClick={() => { setPickerRow(pickerRow === i ? null : i); setPickerSearch(''); }}
                        title="Pick from supplier product master" className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded shrink-0"><Search size={14}/></button>
                    </div>
                    {l.code && <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">{l.code}</span>}
                    {pickerRow === i && (
                      <div className="absolute z-30 left-4 right-4 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                        <div className="p-2 border-b sticky top-0 bg-white">
                          <input autoFocus value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                            placeholder={`Search ${supplier} products…`} className="sap-input w-full py-1 text-xs"/>
                        </div>
                        {productMatches.length === 0 && <div className="px-3 py-4 text-center text-slate-400 text-xs">{products.length === 0 ? `No ${supplier} products loaded — enter the line manually.` : 'No matches.'}</div>}
                        {productMatches.map(p => (
                          <button key={p.id} onClick={() => pickProduct(i, p)} className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 border-b border-slate-50">
                            <div className="text-xs font-bold text-slate-800 uppercase truncate">{p.description || p.name || p.id}</div>
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span className="font-mono font-bold text-indigo-600">{p.modelNo || p.profileCode || p.id}</span>
                              <span>Rs {Number(p.basePrice || 0).toLocaleString()}/{p.unit || 'PCS'}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2"><input value={l.unit} onChange={e => updateLine(i, { unit: e.target.value })} className="sap-input w-full py-1 text-xs text-center font-bold uppercase"/></td>
                  <td className="px-4 py-2"><input type="number" min={0} value={l.qty || ''} onChange={e => updateLine(i, { qty: Number(e.target.value) })} className="sap-input w-full py-1 text-xs text-right font-black"/></td>
                  <td className="px-4 py-2"><input type="number" min={0} value={l.rate || ''} onChange={e => updateLine(i, { rate: Number(e.target.value) })} className="sap-input w-full py-1 text-xs text-right font-bold text-indigo-700"/></td>
                  <td className="px-4 py-2 text-right text-xs font-black text-slate-800 tabular-nums">{((Number(l.qty) || 0) * (Number(l.rate) || 0)).toLocaleString()}</td>
                  <td className="px-4 py-2 text-center"><button onClick={() => removeLine(i)} className="text-slate-400 hover:text-rose-500"><Trash2 size={14}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t flex items-center justify-between">
          <div className="text-[10px] font-black uppercase text-slate-400">
            {buyer} <span className="text-slate-300">buys from</span> {supplier}{project ? <> · <span className="text-indigo-600">{project.title}</span></> : ''}
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Order total</div>
              <div className="text-lg font-black text-slate-800 tabular-nums leading-none mt-0.5">PKR {total.toLocaleString()}</div>
            </div>
            <button onClick={handleRaise} disabled={raising}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg">
              <Send size={14}/> {raising ? 'Raising…' : 'Raise IC Order'}
            </button>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 font-bold px-1">
        The order appears instantly in {supplier}'s <span className="text-slate-600">Sales Orders</span> and <span className="text-slate-600">Store Issue</span> queue (tagged intercompany). GL posts at delivery, not now.
      </p>
    </div>
  );
};

export default IntercompanyProcurement;
