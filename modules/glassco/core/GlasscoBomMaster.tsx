/**
 * GlasscoBomMaster.tsx — Phase 6 (6.1)
 *
 * Minimal BOM Master CRUD UI on top of the existing `bom_templates` /
 * `bom_items` schema (migration 019). Two-pane layout:
 *
 *   ┌──────────────┐  ┌──────────────────────────────┐
 *   │ Templates    │  │ Selected template + items    │
 *   │ list + add   │  │ + add/edit/delete lines      │
 *   └──────────────┘  └──────────────────────────────┘
 *
 * No fancy modals — inline forms. Designed for a single owner / planner
 * to maintain BOM data quickly. MRP integration that uses the BOM is
 * future work (Phase 6.1 was scoped as "CRUD UI only").
 */

import React, { useEffect, useState, useCallback } from 'react';
import { BomService, BomTemplate, BomItem } from '@/modules/procurement/services/bomService';
import { useAppStore } from '@/modules/shared/store/appStore';
import { Plus, Trash2, Layers, Save, X, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const blankTpl = (company: string): BomTemplate => ({
  company, productCode: '', description: '', glassType: 'Plain',
  thicknessMm: 5, sheetSizeW: 84, sheetSizeH: 144, uom: 'SqFt',
  yieldPct: 95, isActive: true,
});

const blankItem = (templateId: string, company: string, line: number): BomItem => ({
  bomTemplateId: templateId, company, lineNo: line,
  materialDesc: '', category: 'Raw',
  qtyPerUnit: 1, uom: 'Nos', wastagePct: 0, isOptional: false,
});

const GlasscoBomMaster: React.FC = () => {
  const company = (useAppStore(s => s.selectedCompany) as any) || 'Glassco';
  const [templates, setTemplates] = useState<BomTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<BomItem[]>([]);
  const [editingTpl, setEditingTpl] = useState<BomTemplate | null>(null);
  const [editingItem, setEditingItem] = useState<BomItem | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshTemplates = useCallback(async () => {
    setBusy(true);
    const list = await BomService.listTemplates();
    setTemplates(list);
    setBusy(false);
  }, []);

  const refreshItems = useCallback(async (tplId: string) => {
    const list = await BomService.listItemsForTemplate(tplId);
    setItems(list);
  }, []);

  useEffect(() => { refreshTemplates(); }, [refreshTemplates]);
  useEffect(() => {
    if (selectedId) refreshItems(selectedId);
    else setItems([]);
  }, [selectedId, refreshItems]);

  // ── Template CRUD ──
  const handleSaveTemplate = async () => {
    if (!editingTpl) return;
    if (!editingTpl.productCode || !editingTpl.description) { toast.error('Product Code and Description are required.'); return; }
    const res = await BomService.upsertTemplate({ ...editingTpl, company });
    if (!res) { toast.error('Save failed.'); return; }
    toast.success(`BOM template ${res.id} saved.`);
    setEditingTpl(null);
    await refreshTemplates();
    setSelectedId(res.id);
  };
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this BOM template? All its line items will be deleted too.')) return;
    const ok = await BomService.deleteTemplate(id);
    if (!ok) { toast.error('Delete failed.'); return; }
    toast.success('BOM template deleted.');
    if (selectedId === id) setSelectedId(null);
    await refreshTemplates();
  };

  // ── Item CRUD ──
  const handleSaveItem = async () => {
    if (!editingItem || !selectedId) return;
    if (!editingItem.materialDesc || editingItem.qtyPerUnit <= 0) {
      toast.error('Material description and qty (>0) are required.'); return;
    }
    const res = await BomService.upsertItem({ ...editingItem, company });
    if (!res) { toast.error('Save failed.'); return; }
    toast.success('Line item saved.');
    setEditingItem(null);
    await refreshItems(selectedId);
  };
  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this line item?')) return;
    const ok = await BomService.deleteItem(id);
    if (!ok) { toast.error('Delete failed.'); return; }
    toast.success('Item deleted.');
    if (selectedId) await refreshItems(selectedId);
  };

  const selectedTpl = templates.find(t => t.id === selectedId) || null;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-700 to-indigo-700 text-white p-5 rounded-2xl flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <Layers size={20}/>
          <div>
            <h2 className="text-lg font-black uppercase">BOM Master</h2>
            <p className="text-[10px] text-purple-200 font-bold uppercase tracking-widest mt-0.5">
              Bill-of-Materials templates and component lines
            </p>
          </div>
        </div>
        <button
          onClick={() => { setEditingTpl(blankTpl(company)); }}
          className="bg-white text-purple-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-purple-50 shadow flex items-center gap-2"
        >
          <Plus size={14}/> New Template
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* ── Templates list ── */}
        <div className="md:col-span-5 bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="bg-slate-50 border-b px-4 py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest">
            Templates ({templates.length})
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {busy && <div className="p-6 text-center text-slate-300 text-xs italic">Loading…</div>}
            {!busy && templates.length === 0 && (
              <div className="p-10 text-center text-slate-300 text-xs italic font-bold">No BOM templates yet.</div>
            )}
            {templates.map(t => (
              <div
                key={t.id}
                onClick={() => setSelectedId(t.id || null)}
                className={`p-4 border-b cursor-pointer transition-colors ${selectedId === t.id ? 'bg-purple-50 border-l-4 border-l-purple-600' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-800 text-xs truncate">{t.productCode}</p>
                    <p className="text-[10px] text-slate-500 font-bold mt-0.5 truncate">{t.description}</p>
                    <div className="flex gap-2 mt-1.5 text-[9px] font-bold text-slate-400 uppercase">
                      {t.glassType && <span>{t.glassType}</span>}
                      {t.thicknessMm && <span>· {t.thicknessMm}mm</span>}
                      {t.yieldPct !== undefined && <span>· Yield {t.yieldPct}%</span>}
                      {!t.isActive && <span className="text-rose-500">· Inactive</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingTpl({ ...t }); }}
                      className="p-1.5 text-purple-600 hover:bg-purple-50 rounded text-[10px]"
                    >Edit</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); t.id && handleDeleteTemplate(t.id); }}
                      className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                    ><Trash2 size={12}/></button>
                    <ChevronRight size={14} className="text-slate-300"/>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Items / detail ── */}
        <div className="md:col-span-7 bg-white rounded-2xl border shadow-sm overflow-hidden">
          {selectedTpl ? (
            <>
              <div className="bg-slate-50 border-b px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Selected template</p>
                  <p className="font-black text-slate-800 text-sm">{selectedTpl.productCode} — <span className="font-normal text-slate-500">{selectedTpl.description}</span></p>
                </div>
                <button
                  onClick={() => setEditingItem(blankItem(selectedTpl.id || '', company, items.length + 1))}
                  className="bg-emerald-600 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-emerald-700"
                >
                  <Plus size={12}/> Add Line
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[9px] font-black uppercase text-slate-400 tracking-widest">
                    <tr>
                      <th className="px-3 py-2 w-8">#</th>
                      <th className="px-3 py-2">Material</th>
                      <th className="px-3 py-2 w-16 text-right">Qty</th>
                      <th className="px-3 py-2 w-16">UoM</th>
                      <th className="px-3 py-2 w-16 text-right">Waste %</th>
                      <th className="px-3 py-2 w-20 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.length === 0 && (
                      <tr><td colSpan={6} className="p-10 text-center text-slate-300 italic font-bold">No line items yet.</td></tr>
                    )}
                    {items.map((it, idx) => (
                      <tr key={it.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-bold text-slate-400">{it.lineNo ?? idx + 1}</td>
                        <td className="px-3 py-2">
                          <p className="font-bold text-slate-800">{it.materialDesc}</p>
                          {it.category && <p className="text-[9px] text-slate-400 font-bold uppercase">{it.category}{it.isOptional ? ' · Optional' : ''}</p>}
                        </td>
                        <td className="px-3 py-2 text-right font-black">{it.qtyPerUnit}</td>
                        <td className="px-3 py-2 text-slate-500 font-bold">{it.uom}</td>
                        <td className="px-3 py-2 text-right text-slate-500 font-bold">{it.wastagePct?.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => setEditingItem({ ...it })} className="text-[10px] font-bold text-blue-600 hover:underline mr-2">Edit</button>
                          <button onClick={() => it.id && handleDeleteItem(it.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={12}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-20 text-center text-slate-300 italic text-sm font-bold">Select a template to see its line items.</div>
          )}
        </div>
      </div>

      {/* ── Template form modal ── */}
      {editingTpl && (
        <div className="fixed inset-0 bg-slate-900/60 z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-purple-700 text-white px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-black uppercase">{editingTpl.id ? 'Edit Template' : 'New BOM Template'}</span>
              <button onClick={() => setEditingTpl(null)} className="p-1 hover:bg-white/10 rounded"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Product Code *</label>
                  <input className="sap-input w-full text-xs font-bold" value={editingTpl.productCode} onChange={e => setEditingTpl({ ...editingTpl, productCode: e.target.value })}/>
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Description *</label>
                  <input className="sap-input w-full text-xs" value={editingTpl.description} onChange={e => setEditingTpl({ ...editingTpl, description: e.target.value })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Glass Type</label>
                  <select className="sap-input w-full text-xs" value={editingTpl.glassType || ''} onChange={e => setEditingTpl({ ...editingTpl, glassType: e.target.value })}>
                    {['Plain','Tinted','Mirror','Reflective','Tempered','Laminated','Other'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Thickness (mm)</label>
                  <input type="number" step="0.5" className="sap-input w-full text-xs" value={editingTpl.thicknessMm || 0} onChange={e => setEditingTpl({ ...editingTpl, thicknessMm: Number(e.target.value) })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Sheet W (mm)</label>
                  <input type="number" className="sap-input w-full text-xs" value={editingTpl.sheetSizeW || 0} onChange={e => setEditingTpl({ ...editingTpl, sheetSizeW: Number(e.target.value) })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Sheet H (mm)</label>
                  <input type="number" className="sap-input w-full text-xs" value={editingTpl.sheetSizeH || 0} onChange={e => setEditingTpl({ ...editingTpl, sheetSizeH: Number(e.target.value) })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Yield %</label>
                  <input type="number" step="0.1" className="sap-input w-full text-xs" value={editingTpl.yieldPct || 100} onChange={e => setEditingTpl({ ...editingTpl, yieldPct: Number(e.target.value) })}/>
                </div>
                <div className="flex items-end">
                  <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={editingTpl.isActive !== false} onChange={e => setEditingTpl({ ...editingTpl, isActive: e.target.checked })}/> Active</label>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Notes</label>
                <textarea rows={2} className="sap-input w-full text-xs resize-none" value={editingTpl.notes || ''} onChange={e => setEditingTpl({ ...editingTpl, notes: e.target.value })}/>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t flex justify-end gap-2">
              <button onClick={() => setEditingTpl(null)} className="px-4 py-2 text-xs font-bold text-slate-500 border rounded-lg">Cancel</button>
              <button onClick={handleSaveTemplate} className="px-4 py-2 bg-purple-700 text-white rounded-lg text-xs font-black uppercase hover:bg-purple-800 flex items-center gap-1.5"><Save size={12}/> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item form modal ── */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-emerald-600 text-white px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-black uppercase">{editingItem.id ? 'Edit Item' : 'Add Line Item'}</span>
              <button onClick={() => setEditingItem(null)} className="p-1 hover:bg-white/10 rounded"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Material Description *</label>
                <input className="sap-input w-full text-xs font-bold" value={editingItem.materialDesc} onChange={e => setEditingItem({ ...editingItem, materialDesc: e.target.value })}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Category</label>
                  <select className="sap-input w-full text-xs" value={editingItem.category || 'Raw'} onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}>
                    {['Raw','Hardware','Consumable','Profile','Service','Other'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Line #</label>
                  <input type="number" className="sap-input w-full text-xs" value={editingItem.lineNo || 1} onChange={e => setEditingItem({ ...editingItem, lineNo: Number(e.target.value) })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Qty per Unit *</label>
                  <input type="number" step="0.0001" className="sap-input w-full text-xs" value={editingItem.qtyPerUnit} onChange={e => setEditingItem({ ...editingItem, qtyPerUnit: Number(e.target.value) })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">UoM</label>
                  <input className="sap-input w-full text-xs" value={editingItem.uom || 'Nos'} onChange={e => setEditingItem({ ...editingItem, uom: e.target.value })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Wastage %</label>
                  <input type="number" step="0.1" className="sap-input w-full text-xs" value={editingItem.wastagePct || 0} onChange={e => setEditingItem({ ...editingItem, wastagePct: Number(e.target.value) })}/>
                </div>
                <div className="flex items-end">
                  <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={!!editingItem.isOptional} onChange={e => setEditingItem({ ...editingItem, isOptional: e.target.checked })}/> Optional</label>
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

export default GlasscoBomMaster;
