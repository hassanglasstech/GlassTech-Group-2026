/**
 * WeightMaster.tsx — Glass per-KG weight records
 * Shows all weight entries by product with date history.
 * Manual entry + auto-populated from GRN.
 */

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { WeightMasterEntry } from '@/modules/procurement/types/inventory';
import { Scale, Plus, Trash2, Search, ChevronDown, ChevronRight, History } from 'lucide-react';
import { toast } from 'sonner';

function sqftOf(size: string): number {
  const [w, h] = size.split('x').map(Number);
  return w && h ? Number(((w * h) / 144).toFixed(3)) : 0;
}

const WeightMaster: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Form state
  const [formProductId, setFormProductId] = useState('');
  const [formWeight, setFormWeight] = useState(0);
  const [formSheets, setFormSheets] = useState(0);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');

  // Products (glass only)
  const glassProducts = useMemo(() =>
    SalesService.getProducts().filter((p: any) =>
      p.company === company && (p.category === 'Glass' || p.glassType)
    ), [company]);

  // All weight entries
  const allEntries = useMemo(() =>
    InventoryService.getWeightByCompany(company as string)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [company, refreshKey]);

  // Group by product for summary view
  const productSummary = useMemo(() => {
    const map: Record<string, {
      productId: string;
      productName: string;
      thickness: string;
      sheetSize: string;
      latestPerSheetKg: number;
      latestPerSqftKg: number;
      latestDate: string;
      entryCount: number;
      latestSource: string;
    }> = {};

    allEntries.forEach(e => {
      if (!map[e.productId]) {
        map[e.productId] = {
          productId: e.productId,
          productName: e.productName,
          thickness: e.thickness,
          sheetSize: e.sheetSize,
          latestPerSheetKg: e.perSheetKg,
          latestPerSqftKg: e.perSqftKg,
          latestDate: e.date,
          entryCount: 0,
          latestSource: e.source,
        };
      }
      map[e.productId].entryCount++;
    });

    return Object.values(map).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [allEntries]);

  const filteredSummary = useMemo(() => {
    if (!searchTerm.trim()) return productSummary;
    const q = searchTerm.toLowerCase();
    return productSummary.filter(p =>
      p.productName.toLowerCase().includes(q) ||
      p.thickness.toLowerCase().includes(q)
    );
  }, [productSummary, searchTerm]);

  const selectedProduct = glassProducts.find((p: any) => p.id === formProductId);

  const handleAddEntry = () => {
    if (!formProductId) { toast.error('Select a product'); return; }
    if (formWeight <= 0) { toast.error('Enter total weight'); return; }
    if (formSheets <= 0) { toast.error('Enter sheet count'); return; }

    const prod = glassProducts.find((p: any) => p.id === formProductId);
    if (!prod) return;

    const spf = sqftOf(prod.sheetSize || '');
    const perSheet = Number((formWeight / formSheets).toFixed(3));
    const totalSqft = formSheets * spf;
    const perSqft = totalSqft > 0 ? Number((formWeight / totalSqft).toFixed(4)) : 0;

    const entry: WeightMasterEntry = {
      id: `WM-${Date.now()}`,
      company: company as any,
      productId: formProductId,
      productName: prod.description || '',
      thickness: prod.thickness || '',
      sheetSize: prod.sheetSize || '',
      date: formDate,
      recordedBy: 'Admin',
      totalWeightKg: formWeight,
      sheetCount: formSheets,
      perSheetKg: perSheet,
      sqftPerSheet: spf,
      perSqftKg: perSqft,
      source: 'Manual',
      notes: formNotes,
    };

    InventoryService.addWeightEntry(entry);
    setRefreshKey(k => k + 1);
    setFormProductId(''); setFormWeight(0); setFormSheets(0); setFormNotes('');
    setShowAddForm(false);
    toast.success(`Weight recorded: ${perSheet.toFixed(2)} kg/sheet, ${perSqft.toFixed(4)} kg/sqft`);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this weight entry?')) return;
    InventoryService.deleteWeightEntry(id);
    setRefreshKey(k => k + 1);
    toast.success('Weight entry deleted');
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-10"><Scale size={120}/></div>
        <div className="relative z-10">
          <h2 className="text-xl font-black uppercase tracking-tight">Weight Master</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {productSummary.length} product(s) · {allEntries.length} record(s)
          </p>
        </div>
        <div className="flex items-center gap-3 z-10">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
            <input type="text" placeholder="Search product, thickness…"
              className="w-full pl-9 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-xs font-bold text-white placeholder-slate-400 outline-none focus:bg-white/20"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 bg-white text-slate-900 px-5 py-2.5 rounded-xl text-xs font-black uppercase hover:bg-blue-600 hover:text-white transition-all">
            <Plus size={14}/> Manual Entry
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-[9px] font-black uppercase text-slate-400 mb-3 tracking-widest">New Weight Record (Manual)</div>
          <div className="grid grid-cols-5 gap-3">
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Glass Product *</label>
              <select className="sap-input w-full font-bold text-xs" value={formProductId} onChange={e => setFormProductId(e.target.value)}>
                <option value="">— Select Product —</option>
                {glassProducts.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.description} {p.thickness} {p.sheetSize ? `${p.sheetSize}"` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Total Weight KG *</label>
              <input type="number" min="0" step="0.1" className="sap-input w-full font-bold"
                value={formWeight || ''} onChange={e => setFormWeight(Number(e.target.value))}/>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Sheet Count *</label>
              <input type="number" min="0" className="sap-input w-full font-bold"
                value={formSheets || ''} onChange={e => setFormSheets(Number(e.target.value))}/>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Date</label>
              <input type="date" className="sap-input w-full font-bold text-xs"
                value={formDate} onChange={e => setFormDate(e.target.value)}/>
            </div>
          </div>
          {/* Computed preview */}
          {formWeight > 0 && formSheets > 0 && selectedProduct && (
            <div className="mt-3 flex gap-4 text-[10px] font-bold">
              <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg">Per Sheet: <span className="font-black">{(formWeight / formSheets).toFixed(2)} kg</span></span>
              <span className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg">Per SqFt: <span className="font-black">{(sqftOf(selectedProduct.sheetSize || '') > 0 ? (formWeight / (formSheets * sqftOf(selectedProduct.sheetSize || ''))).toFixed(4) : '—')} kg</span></span>
            </div>
          )}
          <div className="mt-3 flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Notes (optional)</label>
              <input type="text" className="sap-input w-full font-bold text-xs" placeholder="e.g. New consignment from AGC"
                value={formNotes} onChange={e => setFormNotes(e.target.value)}/>
            </div>
            <button onClick={handleAddEntry}
              className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-xs font-black uppercase hover:bg-emerald-700">
              Save
            </button>
            <button onClick={() => setShowAddForm(false)}
              className="border border-slate-300 text-slate-500 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Product Summary List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="grid text-[9px] font-black uppercase text-slate-400 tracking-widest bg-slate-50 border-b px-6 py-3 gap-2"
          style={{ gridTemplateColumns: '1fr 80px 80px 100px 100px 90px 60px' }}>
          <span>Product</span>
          <span>Thickness</span>
          <span>Sheet Size</span>
          <span className="text-right">Per Sheet (KG)</span>
          <span className="text-right">Per SqFt (KG)</span>
          <span>Last Updated</span>
          <span className="text-center">Records</span>
        </div>

        {filteredSummary.length === 0 ? (
          <div className="text-center py-16 text-slate-300 font-bold uppercase italic text-sm">
            {allEntries.length === 0 ? 'No weight records yet — add manually or post a GRN' : 'No results'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredSummary.map(p => {
              const isExpanded = expandedProduct === p.productId;
              const history = isExpanded ? allEntries.filter(e => e.productId === p.productId) : [];

              return (
                <div key={p.productId}>
                  <button onClick={() => setExpandedProduct(isExpanded ? null : p.productId)}
                    className="w-full grid items-center px-6 py-3 gap-2 hover:bg-slate-50 transition-colors text-left"
                    style={{ gridTemplateColumns: '1fr 80px 80px 100px 100px 90px 60px' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</span>
                      <span className="text-xs font-bold text-slate-700 uppercase truncate">{p.productName}</span>
                    </div>
                    <span className="text-xs font-black text-blue-700">{p.thickness}</span>
                    <span className="text-xs font-bold text-slate-500">{p.sheetSize}"</span>
                    <span className="text-xs font-black text-emerald-700 text-right">{p.latestPerSheetKg.toFixed(2)}</span>
                    <span className="text-xs font-black text-blue-700 text-right">{p.latestPerSqftKg.toFixed(4)}</span>
                    <span className="text-[10px] font-mono text-slate-500">{p.latestDate}</span>
                    <span className="text-center">
                      <span className="text-[9px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p.entryCount}</span>
                    </span>
                  </button>

                  {/* Expanded: History list */}
                  {isExpanded && (
                    <div className="bg-slate-50 border-t border-slate-100 px-10 py-4">
                      <div className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest flex items-center gap-1.5">
                        <History size={10}/> Weight History — {history.length} record(s)
                      </div>
                      <div className="space-y-1.5">
                        {history.map((e, i) => (
                          <div key={e.id} className={`flex items-center justify-between text-[10px] font-bold rounded-lg px-3 py-2 ${i === 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-white border border-slate-100'}`}>
                            <span className="font-mono text-slate-500 w-24">{e.date}</span>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${e.source === 'GRN' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{e.source}</span>
                            {e.grnId && <span className="text-[9px] text-blue-500 font-mono">{e.grnId}</span>}
                            <span className="text-slate-500">{e.sheetCount} sheets × {e.totalWeightKg.toFixed(1)} kg</span>
                            <span className="text-emerald-700 font-black">{e.perSheetKg.toFixed(2)} kg/sheet</span>
                            <span className="text-blue-700 font-black">{e.perSqftKg.toFixed(4)} kg/sqft</span>
                            <span className="text-slate-400 truncate max-w-[120px]">{e.notes || '—'}</span>
                            <button onClick={() => handleDelete(e.id)} className="text-slate-300 hover:text-red-500 p-1">
                              <Trash2 size={11}/>
                            </button>
                          </div>
                        ))}
                      </div>
                      {history.length > 1 && (
                        <div className="mt-2 text-[9px] text-emerald-600 font-bold">
                          ▲ Green row = latest/current weight reference
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default WeightMaster;
