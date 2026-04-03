import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Quotation, Client, Product } from '../../shared/types';
import { ArrowLeft, Building2, ArrowRightLeft, Trash2, Copy, Plus, Layers, Hash, Save, FileText, CheckCircle2, AlertTriangle, Calculator } from 'lucide-react';
import { PrintSummary } from './GlasscoPrintTemplate';
import { WastageCalculator } from './WastageCalculator';
import QuotationWastageTab, { useQuotationWastage } from '@/modules/glassco/core/QuotationWastageTab';
import { useAppStore } from '@/modules/shared/store/appStore';

interface GlasscoEditorProps {
    formData: Partial<Quotation>;
    clients: Client[];
    products: Product[];
    isMM: boolean;
    setIsMM: (val: boolean) => void;
    lastSerial?: number;
    onClose: () => void;
    onUpdateItem: (idx: number, field: string, val: any) => void;
    onAddItem: () => void;
    onAddSection: () => void;
    onDuplicateItem: (idx: number) => void;
    onRemoveItem: (idx: number) => void;
    onSave: (action: 'draft' | 'save' | 'approve') => void;
    onSaveWastageDecision?: (decision: any) => void;
}

export const GlasscoEditor: React.FC<GlasscoEditorProps> = ({
    formData, clients, products, isMM, setIsMM, lastSerial = 2427, onClose,
    onUpdateItem, onAddItem, onAddSection, onDuplicateItem, onRemoveItem, onSave, onSaveWastageDecision
}) => {
    const totalAmount = (formData.items || []).reduce((s, i) => s + i.amount, 0);

    // Manual SqFt Modal State
    const [manualSqFtModal, setManualSqFtModal] = useState<{ isOpen: boolean, itemIndex: number, currentSqFt: number, sheetSizeLabel: string }>({ 
        isOpen: false, 
        itemIndex: -1, 
        currentSqFt: 0,
        sheetSizeLabel: ''
    });

    const [activeTab, setActiveTab] = useState<'items' | 'wastage'>('items');
    const [isDirty, setIsDirty] = useState(false);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    // Focus mode — hide sidebar when editor open
    useEffect(() => {
      document.body.classList.add('erp-focus-mode');
      return () => document.body.classList.remove('erp-focus-mode');
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSave('save'); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); onSave('draft'); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onSave('approve'); }
        if (e.key === 'Escape') { setCtxMenu(null); }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [onSave]);

    // Unsaved changes warning
    useEffect(() => {
      const handler = (e: BeforeUnloadEvent) => {
        if (isDirty) { e.preventDefault(); e.returnValue = ''; }
      };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    // Close context menu on outside click
    useEffect(() => {
      const handler = () => setCtxMenu(null);
      window.addEventListener('click', handler);
      return () => window.removeEventListener('click', handler);
    }, []);
    const company = useAppStore(s => s.selectedCompany);
    const { isTriggered: wastageTriggered, usagePct: wastageUsagePct } = useQuotationWastage(formData.items || [], company);

    const glassMaster = useMemo(() => products.filter(p => p.category === 'Glass'), [products]);
    const categories = ['Plain', 'Color', 'Mirror', 'Fluted'];

    const getSubCategories = (category: string) => {
        if (category === 'Color') return ['One Side', 'Tinted'];
        if (category === 'Mirror') return ['Belgium', 'CFG', 'Euro Grey', 'Brown'];
        return ['Standard'];
    };

    const getThicknesses = (category: string, subCategory: string) => {
        const filtered = glassMaster.filter(p => 
            p.glassType === category && 
            (p.subCategory === subCategory || (subCategory === 'Standard' && !p.subCategory))
        );
        const thicknesses = Array.from(new Set(filtered.map(p => p.thickness).filter(Boolean))) as string[];
        return thicknesses.sort((a, b) => parseInt(a) - parseInt(b));
    };

    const getColors = (category: string, subCategory: string, thickness: string) => {
        const filtered = glassMaster.filter(p => 
            p.glassType === category && 
            (p.subCategory === subCategory || (subCategory === 'Standard' && !p.subCategory)) &&
            p.thickness === thickness
        );
        const colors = Array.from(new Set(filtered.map(p => p.finishColor).filter(Boolean))) as string[];
        return colors.length > 0 ? colors : ['Clear'];
    };

    const serviceNicks = useMemo(() => {
        const dbNicks = products.filter(p => p.category === 'Service' && p.serviceNick).map(p => p.serviceNick!);
        const standards = ['T/G', 'Notch', 'P/E', 'P/F', 'D/G', 'R/D', 'Frosted', 'L/G'];
        return Array.from(new Set([...standards, ...dbNicks]));
    }, [products]);

    const stdInputClass = "sap-input w-full text-center h-7 font-bold text-xs p-0 focus:ring-2 focus:ring-blue-500 rounded border-slate-300 transition-colors";
    
    const isBackdated = useMemo(() => {
        if (!formData.date) return false;
        const today = new Date().toISOString().split('T')[0];
        return formData.date < today;
    }, [formData.date]);

    // Enhanced Update Item to Check for Wastage Logic
    const handleUpdateItemWithLogic = (idx: number, field: string, val: any) => {
        onUpdateItem(idx, field, val);
        setIsDirty(true);
        
        // Logic Trigger: Only if modifying Sheet Size or Dimensions
        if (['sheetSize', 'inchW', 'sootW', 'inchH', 'sootH', 'mmW', 'mmH'].includes(field)) {
            const item = { ...formData.items![idx], [field]: val };
            
            let w = item.width;
            let h = item.height;
            
            if (field === 'inchW' || field === 'sootW') w = (Number(item.inchW)||0) + ((Number(item.sootW)||0)/8);
            if (field === 'inchH' || field === 'sootH') h = (Number(item.inchH)||0) + ((Number(item.sootH)||0)/8);
            if (field === 'mmW') w = (Number(item.mmW)||0) / 25.4;
            if (field === 'mmH') h = (Number(item.mmH)||0) / 25.4;

            const sheet = item.sheetSize || '144x96';
            
            // CRITICAL WASTAGE LOGIC (Applied to both 12x84 and 12x96)
            if (sheet === '144x84' || sheet === '144x96') {
                const widthInCritical = w >= 55 && w <= 60;
                const heightInCritical = h >= 115 && h <= 120;
                
                if ((widthInCritical || heightInCritical) && !item.isManualSqFt) {
                    const label = sheet === '144x84' ? '7x12 FT (84")' : '8x12 FT (96")';
                    // Trigger Modal
                    setTimeout(() => {
                        setManualSqFtModal({ 
                            isOpen: true, 
                            itemIndex: idx, 
                            currentSqFt: item.totalSqFt || 0,
                            sheetSizeLabel: label
                        });
                    }, 600); // Slight delay to allow typing to finish
                }
            }
        }
    };

    const handleSaveManualSqFt = (newSqFt: number) => {
        if (manualSqFtModal.itemIndex > -1) {
            onUpdateItem(manualSqFtModal.itemIndex, 'totalSqFt', newSqFt); 
            onUpdateItem(manualSqFtModal.itemIndex, 'isManualSqFt', true); 
            
            const item = formData.items![manualSqFtModal.itemIndex];
            const amount = Math.round(newSqFt * (item.pricePerUnit || 0));
            onUpdateItem(manualSqFtModal.itemIndex, 'amount', amount);
        }
        setManualSqFtModal({ isOpen: false, itemIndex: -1, currentSqFt: 0, sheetSizeLabel: '' });
    };

    return (
        <div className="bg-white w-full flex flex-col no-print" style={{height:'100vh', position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:1000}}>
            {/* ── Fixed Action Bar — always visible ── */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-700" style={{minHeight:'52px'}}>
                {/* Left: Back + Title */}
                <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (isDirty && !window.confirm('Unsaved changes hain — wapas jayen?')) return;
                        onClose();
                      }}
                      className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest px-2 py-1.5 rounded-lg hover:bg-slate-800"
                    >
                      <ArrowLeft size={15}/> Back
                    </button>
                    <div className="h-4 w-px bg-slate-700" />
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center"><Building2 size={13} className="text-white"/></div>
                      <span className="text-white font-bold text-sm uppercase tracking-wide">Order Configurator</span>
                      {isDirty && <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold">UNSAVED</span>}
                    </div>
                </div>

                {/* Right: All action buttons always visible */}
                <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsMM(!isMM)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase border transition-all flex items-center gap-1.5 ${isMM ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'}`}
                    >
                      <ArrowRightLeft size={12}/>{isMM ? 'MM Mode' : 'Inch Mode'}
                    </button>

                    <div className="h-4 w-px bg-slate-700" />

                    <button
                      onClick={() => onSave('draft')}
                      title="Ctrl+D"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all"
                    >
                      <Save size={13}/> Draft
                      <span className="text-[9px] text-slate-500 font-normal hidden lg:block">Ctrl+D</span>
                    </button>

                    <button
                      onClick={() => onSave('save')}
                      title="Ctrl+S"
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-lg"
                    >
                      <FileText size={13}/> Save Quotation
                      <span className="text-[9px] text-amber-200 font-normal hidden lg:block">Ctrl+S</span>
                    </button>

                    <button
                      onClick={() => onSave('approve')}
                      title="Ctrl+Enter"
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-lg"
                    >
                      <CheckCircle2 size={13}/> Approve & Order
                      <span className="text-[9px] text-emerald-200 font-normal hidden lg:block">Ctrl+↵</span>
                    </button>

                    <button
                      onClick={() => {
                        if (isDirty && !window.confirm('Unsaved changes hain — discard karen?')) return;
                        onClose();
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-all"
                    >
                      ✕ Close
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-hidden p-6 bg-slate-50 flex flex-col">
                <div className="flex space-x-1 mb-4 no-print">
                    <button 
                        onClick={() => setActiveTab('items')}
                        className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'items' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        <Hash size={14}/> Line Items
                    </button>
                    <button 
                        onClick={() => setActiveTab('wastage')}
                        className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 relative ${activeTab === 'wastage' ? 'bg-blue-600 text-white shadow-lg' : wastageTriggered ? 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        <Calculator size={14}/>
                        Wastage Analysis
                        {wastageTriggered && activeTab !== 'wastage' && (
                            <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-white text-[8px] font-black rounded-full">{wastageUsagePct.toFixed(0)}%</span>
                        )}
                    </button>
                </div>

                {activeTab === 'items' ? (
                    <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 grid grid-cols-8 gap-3 shrink-0 shadow-sm items-end">
                    <div className="space-y-1 col-span-2">
                        <label className="text-xs font-bold uppercase text-slate-400 tracking-widest ml-1">Client Selection</label>
                        <select className="sap-input w-full font-bold text-sm h-10 border-slate-300 min-w-[220px]" value={formData.clientId} onChange={e => handleUpdateItemWithLogic(-1, 'clientId', e.target.value)}>
                            <option value="">-- Search Customer --</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1 col-span-1">
                        <label className="text-xs font-bold uppercase text-blue-600 tracking-widest ml-1">Project Ref</label>
                        <input type="text" className="sap-input w-full font-bold uppercase h-10 border-blue-100" value={formData.projectName} onChange={e => handleUpdateItemWithLogic(-1, 'projectName', e.target.value)} placeholder="e.g. MAIN" />
                    </div>
                    <div className="space-y-1 col-span-1">
                        <label className="text-xs font-bold uppercase text-slate-400 tracking-widest ml-1">Order Date</label>
                        <input type="date" className="sap-input w-full font-bold h-10 border-slate-300" value={formData.date} onChange={e => handleUpdateItemWithLogic(-1, 'date', e.target.value)} />
                    </div>
                    <div className="space-y-1 col-span-1 opacity-100 relative group">
                        <label className="text-xs font-bold uppercase text-blue-600 tracking-widest ml-1">Reference ID</label>
                        <div className="sap-input w-full font-bold h-10 border-blue-200 bg-blue-50 flex items-center justify-center text-blue-700 text-xs">
                            {formData.id || 'NEW ORDER'}
                        </div>
                    </div>
                    <div className="space-y-1 col-span-1">
                        <label className="text-xs font-bold uppercase text-blue-600 tracking-widest ml-1">Discount (PKR)</label>
                        <input type="number" className="sap-input w-full font-bold h-10 border-blue-100" value={formData.discountAmount || ''} onChange={e => handleUpdateItemWithLogic(-1, 'discountAmount', Number(e.target.value))} />
                    </div>
                    <div className="space-y-1 col-span-1">
                        <label className="text-xs font-bold uppercase text-rose-600 tracking-widest ml-1">Validity Due</label>
                        <input type="date" className="sap-input w-full font-bold h-10 text-rose-600 border-rose-100" value={formData.dueDate} onChange={e => handleUpdateItemWithLogic(-1, 'dueDate', e.target.value)} />
                    </div>
                    <div className="col-span-1">
                        <PrintSummary items={formData.items || []} />
                    </div>
                </div>

                <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-auto min-h-[500px]">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                                <tr className="text-xs uppercase font-bold text-slate-400 tracking-widest">
                                    <th className="w-10 text-center py-2 bg-slate-50">#</th>
                                    <th className="w-[380px] py-2 bg-slate-50 pl-2">Glass Specification & Sheet Size</th>
                                    <th className="w-[110px] py-2 bg-slate-50 pl-2">Services</th>
                                    {isMM ? (
                                        <>
                                            <th className="w-24 text-center py-4 bg-slate-50">Width (mm)</th>
                                            <th className="w-24 text-center py-4 bg-slate-50">Height (mm)</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="w-36 text-center py-4 bg-slate-50">Width (In.St)</th>
                                            <th className="w-36 text-center py-4 bg-slate-50">Height (In.St)</th>
                                        </>
                                    )}
                                    <th className="w-20 text-center py-4 bg-slate-50">Qty</th>
                                    <th className="w-20 text-center py-4 bg-slate-50">Sq.Ft</th>
                                    <th className="w-28 text-right py-4 bg-slate-50 pr-4">Rate</th>
                                    <th className="w-32 text-right py-4 bg-slate-50 pr-6">Total</th>
                                    <th className="w-16 text-center py-4 bg-slate-50"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {(() => {
                                    let sNo = 0;
                                    return formData.items?.map((item, idx) => {
                                        if (!item.isSection) sNo++;
                                        const curCat = item.glassType || 'Plain';
                                        const curSub = item.subCategory || 'Standard';
                                        const curThick = item.glassSize || '5mm';
                                        const isNonTemperable = curCat === 'Mirror' || (curCat === 'Color' && curSub === 'One Side');

                                        return (
                                            <tr
                                              key={idx}
                                              className={`group transition-all ${item.isSection ? 'bg-slate-50' : 'hover:bg-blue-50/20'}`}
                                              onContextMenu={(e) => {
                                                if (!item.isSection) {
                                                  e.preventDefault();
                                                  setCtxMenu({ x: e.clientX, y: e.clientY, idx });
                                                }
                                              }}
                                            >
                                                <td className="text-center font-bold text-slate-300 align-middle py-1">{item.isSection ? '' : sNo}</td>
                                                <td className="align-middle py-2 px-2">
                                                    {item.isSection ? (
                                                        <input type="text" className="w-full bg-transparent font-bold uppercase text-blue-700 outline-none h-10 text-xs tracking-widest border-b-2 border-blue-100 focus:border-blue-500 placeholder-blue-100" value={item.description} onChange={e => handleUpdateItemWithLogic(idx, 'description', e.target.value)} placeholder="SECTION HEADING (e.g. FRONT VIEW)..." />
                                                    ) : (
                                                        <div className="flex flex-col gap-1.5 py-1">
                                                            <input type="text" className="w-full font-bold uppercase text-xs h-7 border-none bg-transparent focus:ring-0 outline-none placeholder-slate-300" value={item.description} onChange={e => handleUpdateItemWithLogic(idx, 'description', e.target.value)} placeholder="Item Detail..."/>
                                                            <div className="flex gap-1 items-center">
                                                                <select value={curCat} onChange={e => handleUpdateItemWithLogic(idx, 'glassType', e.target.value)} className="h-7 text-xs font-bold border border-slate-200 rounded-lg bg-blue-50 px-1.5 outline-none w-24 uppercase">{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                                                <select value={curSub} onChange={e => handleUpdateItemWithLogic(idx, 'subCategory', e.target.value)} className="h-7 text-xs font-bold border border-slate-200 rounded-lg bg-white px-1.5 outline-none w-28 uppercase">{getSubCategories(curCat).map(s => <option key={s} value={s}>{s}</option>)}</select>
                                                                <select value={curThick} onChange={e => handleUpdateItemWithLogic(idx, 'glassSize', e.target.value)} className="h-7 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50 px-1.5 outline-none w-20 uppercase">{getThicknesses(curCat, curSub).map(t => <option key={t} value={t}>{t}</option>)}</select>
                                                                <select value={item.glassColor || 'Clear'} onChange={e => handleUpdateItemWithLogic(idx, 'glassColor', e.target.value)} className="h-7 text-xs font-bold border border-slate-200 rounded-lg bg-slate-100 px-1.5 outline-none w-24 uppercase">
                                                                    {getColors(curCat, curSub, curThick).map(c => <option key={c} value={c}>{c}</option>)}
                                                                </select>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="align-middle py-1 px-2">
                                                    {!item.isSection && (
                                                        <div className="grid grid-cols-3 gap-px" style={{width:'90px'}}>
                                                            {serviceNicks.map(nick => {
                                                                const isTGDisabled = nick === 'T/G' && isNonTemperable;
                                                                return (
                                                                    <button key={nick} disabled={isTGDisabled} onClick={() => { const current = item.selectedServices || []; const next = current.includes(nick) ? current.filter(s => s !== nick) : [...current, nick]; handleUpdateItemWithLogic(idx, 'selectedServices', next); }} className={`h-5 rounded-sm text-[7px] font-black leading-none transition-all ${isTGDisabled ? 'bg-slate-100 text-slate-300 opacity-50' : item.selectedServices?.includes(nick) ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400 hover:bg-blue-50'}`}>{nick}</button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </td>
                                                {isMM ? (
                                                    <><td className="align-middle px-1"><input type="number" className={stdInputClass} value={item.mmW || ''} onChange={e => handleUpdateItemWithLogic(idx, 'mmW', e.target.value)}/></td><td className="align-middle px-1"><input type="number" className={stdInputClass} value={item.mmH || ''} onChange={e => handleUpdateItemWithLogic(idx, 'mmH', e.target.value)}/></td></>
                                                ) : (
                                                    <>
                                                        <td className="align-middle px-1">
                                                            <div className="flex justify-center gap-0.5 items-center">
                                                                <input type="number" className={`${stdInputClass} w-16 border-slate-200`} value={item.inchW} onChange={e => handleUpdateItemWithLogic(idx, 'inchW', e.target.value)}/>
                                                                <span className="font-bold text-slate-400">.</span>
                                                                <input type="number" className={`${stdInputClass} w-10 text-slate-400 bg-slate-50`} value={item.sootW} onChange={e => handleUpdateItemWithLogic(idx, 'sootW', e.target.value)} placeholder="0" max="7"/>
                                                            </div>
                                                        </td>
                                                        <td className="align-middle px-1">
                                                            <div className="flex justify-center gap-0.5 items-center">
                                                                <input type="number" className={`${stdInputClass} w-16 border-slate-200`} value={item.inchH} onChange={e => handleUpdateItemWithLogic(idx, 'inchH', e.target.value)}/>
                                                                <span className="font-bold text-slate-400">.</span>
                                                                <input type="number" className={`${stdInputClass} w-10 text-slate-400 bg-slate-50`} value={item.sootH} onChange={e => handleUpdateItemWithLogic(idx, 'sootH', e.target.value)} placeholder="0" max="7"/>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                                <td className="align-middle px-1">
                                                    <input type="number" className={`${stdInputClass} w-16 bg-amber-50 border-amber-200 text-amber-900`} value={item.qty} onChange={e => handleUpdateItemWithLogic(idx, 'qty', e.target.value)}/>
                                                </td>
                                                <td className="text-center font-bold text-slate-500 align-middle text-xs relative group/sqft">
                                                    {item.isSection ? '' : item.totalSqFt}
                                                    {item.isManualSqFt && <span className="absolute -top-1 -right-1 text-xs text-white bg-rose-600 px-1 rounded-full">M</span>}
                                                </td>
                                                <td className="text-right align-middle px-2">
                                                    <input type="number" className={`${stdInputClass} text-right text-blue-700 bg-blue-50 border-blue-200 pr-2`} value={item.pricePerUnit} onChange={e => handleUpdateItemWithLogic(idx, 'pricePerUnit', e.target.value)}/>
                                                </td>
                                                <td className="text-right font-bold align-middle px-3 text-sm text-slate-900">{item.isSection ? '' : item.amount.toLocaleString()}</td>
                                                <td className="text-center align-middle px-1">
                                                    <div className="flex items-center space-x-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => onDuplicateItem(idx)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all" title="Duplicate"><Copy size={14}/></button>
                                                        <button onClick={() => onRemoveItem(idx)} className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-all" title="Delete" aria-label="Delete"><Trash2 size={14}/></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="flex space-x-3 shrink-0">
                    <button onClick={onAddItem} className="px-6 py-2.5 bg-white border border-slate-300 rounded-xl shadow-sm text-xs font-bold uppercase text-blue-600 hover:bg-blue-50 transition-all flex items-center gap-2" aria-label="Add"><Plus size={16}/> Add Glass Item</button>
                    <button onClick={onAddSection} className="px-6 py-2.5 bg-white border border-slate-300 rounded-xl shadow-sm text-xs font-bold uppercase text-slate-600 hover:bg-slate-100 transition-all flex items-center gap-2"><Layers size={16}/> Insert Heading</button>
                </div>
            </div>
            ) : (
                <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <QuotationWastageTab items={formData.items || []} onSaveDecision={onSaveWastageDecision} />
                </div>
            )}
        </div>
            
            <div className="px-10 py-5 bg-slate-900 text-white flex justify-between items-center shrink-0 border-t-4 border-blue-600">
               <div className="flex flex-col md:flex-row md:space-x-12 items-center">
                   <div>
                       <p className="text-xs font-bold uppercase text-slate-400 tracking-[0.2em]">Gross Subtotal</p>
                       <p className="text-3xl font-bold tracking-tight">PKR {totalAmount.toLocaleString()}</p>
                   </div>
                   <div className="h-10 w-px bg-slate-700 hidden md:block"></div>
                   <div>
                       <p className="text-xs font-bold uppercase text-blue-400 tracking-[0.2em]">Net Contract Value</p>
                       <p className="text-2xl font-bold text-blue-400">PKR {(totalAmount - (formData.discountAmount || 0)).toLocaleString()}</p>
                   </div>
                   <div className="h-10 w-px bg-slate-700 hidden md:block"></div>
                   <div>
                       <p className="text-xs font-bold uppercase text-blue-400 tracking-[0.2em]">Advance Required</p>
                       <p className="text-2xl font-bold text-blue-400">PKR {Math.round((totalAmount - (formData.discountAmount || 0)) * 0.5).toLocaleString()}</p>
                   </div>
               </div>
               <button onClick={onAddItem} className="px-6 py-2 text-blue-400 font-bold uppercase text-xs tracking-widest hover:text-white transition-colors flex items-center gap-1"><Plus size={14}/> Add Row</button>
            </div>

            {/* RIGHT-CLICK CONTEXT MENU */}
            {ctxMenu && (
              <div
                className="fixed z-[600] bg-white border border-slate-200 rounded-xl shadow-2xl py-1 w-48"
                style={{ left: ctxMenu.x, top: ctxMenu.y }}
                onClick={e => e.stopPropagation()}
              >
                {[
                  { label: '📋 Duplicate Row', action: () => { onDuplicateItem(ctxMenu.idx); setCtxMenu(null); } },
                  { label: '⬆️ Move Up', action: () => { if (ctxMenu.idx > 0) { const items = [...(formData.items||[])]; [items[ctxMenu.idx-1], items[ctxMenu.idx]] = [items[ctxMenu.idx], items[ctxMenu.idx-1]]; items.forEach((item,i) => onUpdateItem(i, '__reorder__', item)); } setCtxMenu(null); } },
                  { label: '⬇️ Move Down', action: () => { const items = formData.items||[]; if (ctxMenu.idx < items.length-1) { const arr = [...items]; [arr[ctxMenu.idx], arr[ctxMenu.idx+1]] = [arr[ctxMenu.idx+1], arr[ctxMenu.idx]]; arr.forEach((item,i) => onUpdateItem(i, '__reorder__', item)); } setCtxMenu(null); } },
                  { label: '─', action: null },
                  { label: '🗑️ Delete Row', action: () => { onRemoveItem(ctxMenu.idx); setCtxMenu(null); } },
                ].map((item, i) => item.action === null ? (
                  <div key={i} className="h-px bg-slate-100 my-1" />
                ) : (
                  <button key={i} onClick={item.action}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                    {item.label}
                  </button>
                ))}
              </div>
            )}

            {/* MANUAL SQFT MODAL */}
            {manualSqFtModal.isOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[500] animate-in zoom-in duration-200" role="dialog" aria-modal="true">
                    <div className="bg-white rounded-3xl p-8 w-96 shadow-2xl border-2 border-amber-400">
                        <div className="flex items-center space-x-3 mb-4 text-amber-600">
                            <AlertTriangle size={32}/>
                            <h3 className="text-lg font-bold uppercase">Wastage Alert</h3>
                        </div>
                        <p className="text-xs font-bold text-slate-600 mb-4 leading-relaxed">
                            The dimensions for this item (using {manualSqFtModal.sheetSizeLabel} Sheet) fall into a high-wastage zone (55-60" width or 115-120" height).
                        </p>
                        <p className="text-xs text-slate-500 mb-6">
                            Please manually define the <strong>Billing Sq.Ft</strong> for this piece to cover the wastage cost.
                        </p>
                        <div className="space-y-2 mb-6">
                            <label className="text-xs font-bold uppercase text-slate-400">Standard Calculated Sq.Ft</label>
                            <input type="number" disabled value={manualSqFtModal.currentSqFt} className="w-full p-3 bg-slate-100 border rounded-xl font-bold text-slate-500" />
                            
                            <label className="text-xs font-bold uppercase text-blue-600 mt-2 block">Manual Billed Sq.Ft</label>
                            <div className="relative">
                                <Calculator className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" size={16}/>
                                <input 
                                    type="number" 
                                    className="w-full pl-10 p-3 bg-blue-50 border-2 border-blue-200 rounded-xl font-bold text-lg text-blue-700 focus:outline-none focus:border-blue-500"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveManualSqFt(Number(e.currentTarget.value));
                                    }}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setManualSqFtModal({...manualSqFtModal, isOpen: false, itemIndex: -1, currentSqFt: 0, sheetSizeLabel: ''})} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600">Cancel</button>
                            <button 
                                onClick={() => {
                                    const input = document.querySelector('input[type="number"][autofocus]') as HTMLInputElement;
                                    handleSaveManualSqFt(Number(input?.value || 0));
                                }} 
                                className="bg-amber-500 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase shadow-lg hover:bg-amber-600"
                            >
                                Confirm Override
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
