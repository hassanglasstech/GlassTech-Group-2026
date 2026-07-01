/**
 * WeightMaster.tsx — Glass per-KG weight records
 * 3 sources: GRN (auto), Manual, Physical (periodic verification)
 * Features: variance alerts, vendor comparison, thickness benchmarks
 */

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { WeightMasterEntry } from '@/modules/procurement/types/inventory';
import { Scale, Plus, Trash2, Search, ChevronDown, ChevronRight, History, AlertTriangle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';

function sqftOf(size: string): number {
  const [w, h] = size.split('x').map(Number);
  return w && h ? Number(((w * h) / 144).toFixed(3)) : 0;
}

const THICKNESS_BENCHMARKS: Record<string, { kgPerSqm: number; kgPerSqft: number; label: string }> = {
  '3mm':  { kgPerSqm: 7.5,  kgPerSqft: 0.697, label: '3mm — 7.5 kg/m² — 0.697 kg/sqft' },
  '4mm':  { kgPerSqm: 10.0, kgPerSqft: 0.929, label: '4mm — 10 kg/m² — 0.929 kg/sqft' },
  '5mm':  { kgPerSqm: 12.5, kgPerSqft: 1.161, label: '5mm — 12.5 kg/m² — 1.161 kg/sqft' },
  '6mm':  { kgPerSqm: 15.0, kgPerSqft: 1.394, label: '6mm — 15 kg/m² — 1.394 kg/sqft' },
  '8mm':  { kgPerSqm: 20.0, kgPerSqft: 1.858, label: '8mm — 20 kg/m² — 1.858 kg/sqft' },
  '10mm': { kgPerSqm: 25.0, kgPerSqft: 2.323, label: '10mm — 25 kg/m² — 2.323 kg/sqft' },
  '12mm': { kgPerSqm: 30.0, kgPerSqft: 2.787, label: '12mm — 30 kg/m² — 2.787 kg/sqft' },
  '15mm': { kgPerSqm: 37.5, kgPerSqft: 3.484, label: '15mm — 37.5 kg/m² — 3.484 kg/sqft' },
  '19mm': { kgPerSqm: 47.5, kgPerSqft: 4.413, label: '19mm — 47.5 kg/m² — 4.413 kg/sqft' },
};

const VARIANCE_THRESHOLD = 0.05;

const WeightMaster: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showBenchmarks, setShowBenchmarks] = useState(false);
  const [entrySource, setEntrySource] = useState<'Manual' | 'Physical'>('Manual');

  const [formProductId, setFormProductId] = useState('');
  const [formWeight, setFormWeight] = useState(0);
  const [formSheets, setFormSheets] = useState(0);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');

  const glassProducts = useMemo(() =>
    SalesService.getProducts().filter((p: any) =>
      p.company === company && (p.category === 'Glass' || p.glassType)
    ), [company]);

  const allEntries = useMemo(() =>
    InventoryService.getWeightByCompany(company as string)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [company, refreshKey]);

  const productSummary = useMemo(() => {
    const map: Record<string, {
      productId: string; productName: string; thickness: string; sheetSize: string;
      latestPerSheetKg: number; latestPerSqftKg: number; latestDate: string; latestSource: string;
      entryCount: number; avgPerSheetKg: number; variancePct: number; hasVarianceAlert: boolean;
      vendors: Record<string, { name: string; avgPerSheetKg: number; count: number }>;
      benchmarkKgPerSqft: number | null; benchmarkVariancePct: number | null;
    }> = {};

    allEntries.forEach(e => {
      if (!map[e.productId]) {
        const bm = THICKNESS_BENCHMARKS[e.thickness];
        map[e.productId] = {
          productId: e.productId, productName: e.productName, thickness: e.thickness, sheetSize: e.sheetSize,
          latestPerSheetKg: e.perSheetKg, latestPerSqftKg: e.perSqftKg, latestDate: e.date, latestSource: e.source,
          entryCount: 0, avgPerSheetKg: 0, variancePct: 0, hasVarianceAlert: false,
          vendors: {}, benchmarkKgPerSqft: bm?.kgPerSqft || null, benchmarkVariancePct: null,
        };
      }
      map[e.productId].entryCount++;
      if (e.vendorName) {
        if (!map[e.productId].vendors[e.vendorName]) map[e.productId].vendors[e.vendorName] = { name: e.vendorName, avgPerSheetKg: 0, count: 0 };
        map[e.productId].vendors[e.vendorName].count++;
      }
    });

    Object.values(map).forEach(p => {
      const entries = allEntries.filter(e => e.productId === p.productId);
      if (!entries.length) return;
      const avg = entries.reduce((s, e) => s + e.perSheetKg, 0) / entries.length;
      p.avgPerSheetKg = Number(avg.toFixed(3));
      if (avg > 0) {
        p.variancePct = Number((Math.abs(p.latestPerSheetKg - avg) / avg * 100).toFixed(1));
        p.hasVarianceAlert = p.variancePct > (VARIANCE_THRESHOLD * 100);
      }
      if (p.benchmarkKgPerSqft && p.latestPerSqftKg > 0) {
        p.benchmarkVariancePct = Number(((p.latestPerSqftKg - p.benchmarkKgPerSqft) / p.benchmarkKgPerSqft * 100).toFixed(1));
      }
      Object.keys(p.vendors).forEach(vn => {
        const ve = entries.filter(e => e.vendorName === vn);
        if (ve.length) p.vendors[vn].avgPerSheetKg = Number((ve.reduce((s, e) => s + e.perSheetKg, 0) / ve.length).toFixed(3));
      });
    });

    return Object.values(map).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [allEntries]);

  const filteredSummary = useMemo(() => {
    if (!searchTerm.trim()) return productSummary;
    const q = searchTerm.toLowerCase();
    return productSummary.filter(p => p.productName.toLowerCase().includes(q) || p.thickness.toLowerCase().includes(q));
  }, [productSummary, searchTerm]);

  const selectedProduct = glassProducts.find((p: any) => p.id === formProductId);

  const getVarianceWarning = (): string | null => {
    if (!formProductId || formWeight <= 0 || formSheets <= 0) return null;
    const newPerSheet = formWeight / formSheets;
    const existing = allEntries.filter(e => e.productId === formProductId);
    if (!existing.length) return null;
    const avg = existing.reduce((s, e) => s + e.perSheetKg, 0) / existing.length;
    const variance = Math.abs(newPerSheet - avg) / avg;
    if (variance > VARIANCE_THRESHOLD) return `${(variance * 100).toFixed(1)}% variance from avg ${avg.toFixed(2)} kg/sheet`;
    return null;
  };

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

    InventoryService.addWeightEntry({
      id: `WM-${Date.now()}`, company: company as any, productId: formProductId,
      productName: prod.description || '', thickness: prod.thickness || '', sheetSize: prod.sheetSize || '',
      date: formDate, recordedBy: 'Admin', totalWeightKg: formWeight, sheetCount: formSheets,
      perSheetKg: perSheet, sqftPerSheet: spf, perSqftKg: perSqft,
      source: entrySource, notes: formNotes,
    });
    setRefreshKey(k => k + 1);
    setFormProductId(''); setFormWeight(0); setFormSheets(0); setFormNotes('');
    setShowAddForm(false);
    toast.success(`${entrySource} weight: ${perSheet.toFixed(2)} kg/sheet, ${perSqft.toFixed(4)} kg/sqft`);
  };

  const handleDelete = async (id: string) => {
    if (!await confirmModal('Delete this weight entry?')) return;
    InventoryService.deleteWeightEntry(id);
    setRefreshKey(k => k + 1);
    toast.success('Deleted');
  };

  const varianceWarning = getVarianceWarning();
  const alertCount = productSummary.filter(p => p.hasVarianceAlert).length;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-10"><Scale size={120}/></div>
        <div className="relative z-10">
          
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {productSummary.length} product(s) · {allEntries.length} record(s)
            {alertCount > 0 && <span className="text-amber-400 ml-2">· {alertCount} variance alert(s)</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 z-10">
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
            <input type="text" placeholder="Search…" className="w-full pl-9 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-xs font-bold text-white placeholder-slate-400 outline-none focus:bg-white/20" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
          </div>
          <button onClick={() => setShowBenchmarks(!showBenchmarks)} className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${showBenchmarks ? 'bg-blue-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>Benchmarks</button>
          <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-2 bg-white text-slate-900 px-5 py-2.5 rounded-xl text-xs font-black uppercase hover:bg-blue-600 hover:text-white transition-all"><Plus size={14}/> New Entry</button>
        </div>
      </div>

      {showBenchmarks && (
        <div className="bg-white border border-blue-200 rounded-2xl p-5">
          <div className="text-[9px] font-black uppercase text-blue-600 mb-3 tracking-widest">Industry standard — float glass weight (density 2.5 g/cm³)</div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(THICKNESS_BENCHMARKS).map(([th, bm]) => (
              <div key={th} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2 text-[10px] font-bold">
                <span className="font-black text-blue-800">{th}</span>
                <span className="text-slate-600">{bm.kgPerSqm} kg/m²</span>
                <span className="font-black text-blue-700">{bm.kgPerSqft} kg/sqft</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">New weight record</div>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
              <button onClick={() => setEntrySource('Manual')} className={`px-3 py-1 rounded text-[9px] font-black uppercase ${entrySource === 'Manual' ? 'bg-amber-500 text-white' : 'text-slate-400'}`}>Manual</button>
              <button onClick={() => setEntrySource('Physical')} className={`px-3 py-1 rounded text-[9px] font-black uppercase ${entrySource === 'Physical' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>Physical Check</button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-3">
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Glass product *</label>
              <select className="sap-input w-full font-bold text-xs" value={formProductId} onChange={e => setFormProductId(e.target.value)}>
                <option value="">— Select —</option>
                {glassProducts.map((p: any) => <option key={p.id} value={p.id}>{p.description} {p.thickness} {p.sheetSize ? `${p.sheetSize}"` : ''}</option>)}
              </select>
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Total weight KG *</label><input type="number" min="0" step="0.1" className="sap-input w-full font-bold" value={formWeight || ''} onChange={e => setFormWeight(Number(e.target.value))}/></div>
            <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Sheet count *</label><input type="number" min="0" className="sap-input w-full font-bold" value={formSheets || ''} onChange={e => setFormSheets(Number(e.target.value))}/></div>
            <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Date</label><input type="date" className="sap-input w-full font-bold text-xs" value={formDate} onChange={e => setFormDate(e.target.value)}/></div>
          </div>
          {formWeight > 0 && formSheets > 0 && selectedProduct && (
            <div className="mt-3 flex gap-3 items-center flex-wrap">
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg">Per sheet: <span className="font-black">{(formWeight / formSheets).toFixed(2)} kg</span></span>
              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg">Per sqft: <span className="font-black">{(sqftOf(selectedProduct.sheetSize || '') > 0 ? (formWeight / (formSheets * sqftOf(selectedProduct.sheetSize || ''))).toFixed(4) : '—')} kg</span></span>
              {varianceWarning && <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg border border-amber-200 flex items-center gap-1"><AlertTriangle size={11}/> {varianceWarning}</span>}
            </div>
          )}
          <div className="mt-3 flex gap-3 items-end">
            <div className="flex-1"><label className="text-[10px] font-black uppercase text-slate-400">Notes</label><input type="text" className="sap-input w-full font-bold text-xs" placeholder={entrySource === 'Physical' ? 'e.g. Monthly verification — area B' : 'e.g. New consignment'} value={formNotes} onChange={e => setFormNotes(e.target.value)}/></div>
            <button onClick={handleAddEntry} className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-xs font-black uppercase hover:bg-emerald-700">Save</button>
            <button onClick={() => setShowAddForm(false)} className="border border-slate-300 text-slate-500 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="grid text-[9px] font-black uppercase text-slate-400 tracking-widest bg-slate-50 border-b px-6 py-3 gap-2" style={{ gridTemplateColumns: '1fr 70px 70px 90px 90px 90px 80px 50px' }}>
          <span>Product</span><span>Thick.</span><span>Size</span><span className="text-right">KG/Sheet</span><span className="text-right">KG/SqFt</span><span className="text-right">Benchmark</span><span>Updated</span><span className="text-center">Rec</span>
        </div>

        {filteredSummary.length === 0 ? (
          <div className="text-center py-16 text-slate-300 font-bold uppercase italic text-sm">{allEntries.length === 0 ? 'No weight records — post a GRN or add manually' : 'No results'}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredSummary.map(p => {
              const isExpanded = expandedProduct === p.productId;
              const history = isExpanded ? allEntries.filter(e => e.productId === p.productId) : [];
              const vendorList = Object.values(p.vendors);

              return (
                <div key={p.productId}>
                  <button onClick={() => setExpandedProduct(isExpanded ? null : p.productId)}
                    className={`w-full grid items-center px-6 py-3 gap-2 hover:bg-slate-50 transition-colors text-left ${p.hasVarianceAlert ? 'bg-amber-50/50' : ''}`}
                    style={{ gridTemplateColumns: '1fr 70px 70px 90px 90px 90px 80px 50px' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</span>
                      <span className="text-xs font-bold text-slate-700 uppercase truncate">{p.productName}</span>
                      {p.hasVarianceAlert && <AlertTriangle size={12} className="text-amber-500 shrink-0"/>}
                    </div>
                    <span className="text-xs font-black text-blue-700">{p.thickness}</span>
                    <span className="text-xs font-bold text-slate-500">{p.sheetSize}"</span>
                    <span className="text-xs font-black text-emerald-700 text-right">{p.latestPerSheetKg.toFixed(2)}</span>
                    <span className="text-xs font-black text-blue-700 text-right">{p.latestPerSqftKg.toFixed(4)}</span>
                    <span className="text-right">{p.benchmarkKgPerSqft ? <span className={`text-[10px] font-black ${Math.abs(p.benchmarkVariancePct || 0) > 10 ? 'text-red-600' : 'text-emerald-600'}`}>{(p.benchmarkVariancePct || 0) > 0 ? '+' : ''}{p.benchmarkVariancePct}%</span> : <span className="text-[9px] text-slate-300">—</span>}</span>
                    <span className="text-[10px] font-mono text-slate-500">{p.latestDate}</span>
                    <span className="text-center"><span className="text-[9px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p.entryCount}</span></span>
                  </button>

                  {isExpanded && (
                    <div className="bg-slate-50 border-t border-slate-100 px-10 py-4 space-y-4">
                      {vendorList.length > 1 && (
                        <div>
                          <div className="text-[9px] font-black uppercase text-purple-600 mb-1.5 tracking-widest flex items-center gap-1.5"><Users size={10}/> Vendor weight comparison</div>
                          <div className="flex gap-3">
                            {vendorList.map(v => (
                              <div key={v.name} className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-[10px] font-bold">
                                <span className="text-purple-800 font-black">{v.name}</span>
                                <span className="text-purple-600 ml-2">{v.avgPerSheetKg.toFixed(2)} kg/sheet</span>
                                <span className="text-slate-400 ml-1">({v.count})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest flex items-center gap-1.5">
                          <History size={10}/> Weight history — {history.length} record(s)
                          <span className="text-slate-300 ml-2">Avg: {p.avgPerSheetKg.toFixed(2)} kg/sheet</span>
                          {p.hasVarianceAlert && <span className="text-amber-600">· Latest {p.variancePct}% from avg</span>}
                        </div>
                        <div className="space-y-1.5">
                          {history.map((e, i) => {
                            const entryVar = p.avgPerSheetKg > 0 ? Number(((e.perSheetKg - p.avgPerSheetKg) / p.avgPerSheetKg * 100).toFixed(1)) : 0;
                            const hasEntryAlert = Math.abs(entryVar) > VARIANCE_THRESHOLD * 100;
                            return (
                              <div key={e.id} className={`flex items-center justify-between text-[10px] font-bold rounded-lg px-3 py-2 ${i === 0 ? 'bg-emerald-50 border border-emerald-100' : hasEntryAlert ? 'bg-amber-50 border border-amber-100' : 'bg-white border border-slate-100'}`}>
                                <span className="font-mono text-slate-500 w-20">{e.date}</span>
                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${e.source === 'GRN' ? 'bg-blue-100 text-blue-700' : e.source === 'Physical' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{e.source}</span>
                                {e.vendorName ? <span className="text-[9px] text-purple-600 w-24 truncate">{e.vendorName}</span> : <span className="w-24"></span>}
                                {e.grnId ? <span className="text-[9px] text-blue-500 font-mono w-28 truncate">{e.grnId}</span> : <span className="w-28"></span>}
                                <span className="text-slate-500">{e.sheetCount} × {e.totalWeightKg.toFixed(1)} kg</span>
                                <span className="text-emerald-700 font-black w-20 text-right">{e.perSheetKg.toFixed(2)}</span>
                                <span className="text-blue-700 font-black w-20 text-right">{e.perSqftKg.toFixed(4)}</span>
                                {hasEntryAlert ? <span className="text-amber-600 w-16 text-right flex items-center justify-end gap-0.5"><AlertTriangle size={9}/>{entryVar > 0 ? '+' : ''}{entryVar}%</span> : <span className="text-slate-300 w-16 text-right">{entryVar !== 0 ? `${entryVar > 0 ? '+' : ''}${entryVar}%` : '—'}</span>}
                                <span className="text-slate-400 truncate max-w-[100px]">{e.notes || '—'}</span>
                                <button onClick={() => handleDelete(e.id)} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={11}/></button>
                              </div>
                            );
                          })}
                        </div>
                        {history.length > 1 && <div className="mt-2 text-[9px] text-emerald-600 font-bold">▲ Green row = latest record</div>}
                      </div>
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
