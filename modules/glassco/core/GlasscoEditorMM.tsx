import React, { useMemo, useState } from 'react';
import { Quotation, Client, Product, QuotationItem } from '../../shared/types';
import { ArrowLeft, ArrowRightLeft, Trash2, Copy, Plus, Layers, Calculator } from 'lucide-react';
import { PrintSummary } from './GlasscoPrintTemplate';

interface Props {
    formData: Partial<Quotation>;
    clients: Client[];
    products: Product[];
    lastSerial: number;
    onClose: () => void;
    onUpdateItem: (idx: number, field: string, val: any) => void;
    onAddItem: () => void;
    onAddSection: () => void;
    onDuplicateItem: (idx: number) => void;
    onRemoveItem: (idx: number) => void;
    onSave: (action: 'draft' | 'save' | 'approve') => void;
    onSwitchMode: () => void;
}

export const GlasscoEditorMM: React.FC<Props> = ({
    formData, clients, products, lastSerial, onClose, onUpdateItem, onAddItem, onAddSection, 
    onDuplicateItem, onRemoveItem, onSave, onSwitchMode
}) => {
    const totalAmount = (formData.items || []).reduce((s, i) => s + i.amount, 0);
    const [manualSqFtModal, setManualSqFtModal] = useState({ isOpen: false, idx: -1, val: 0 });

    const glassMaster = useMemo(() => products.filter(p => (p.category || '').toLowerCase() === 'glass'), [products]);
    
    const categories = useMemo(() => {
        const types = Array.from(new Set(glassMaster.map(p => p.glassType).filter(Boolean))) as string[];
        return types.length > 0 ? types.sort() : ['Plain', 'Color', 'Mirror', 'Fluted'];
    }, [glassMaster]);

    const getSubCategories = (category: string) => {
        const filtered = glassMaster.filter(p => p.glassType === category);
        const subs = Array.from(new Set(filtered.map(p => p.subCategory || 'Standard').filter(Boolean))) as string[];
        return subs.length > 0 ? subs.sort() : ['Standard'];
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
        return Array.from(new Set(['T/G', 'Notch', 'P/E', 'P/F', 'D/G', 'R/D', 'Frosted', ...dbNicks]));
    }, [products]);

    const handleConfirmManualSqFt = () => {
        onUpdateItem(manualSqFtModal.idx, 'totalSqFt', manualSqFtModal.val);
        onUpdateItem(manualSqFtModal.idx, 'isManualSqFt', true);
        setManualSqFtModal({ isOpen: false, idx: -1, val: 0 });
    };

    const isWastageZone = (item: QuotationItem) => {
        if (item.isSection) return false;
        const w = (Number(item.mmW) || 0) / 25.4;
        const h = (Number(item.mmH) || 0) / 25.4;
        // Alert if Width >= 55" (1397mm) or Height >= 115" (2921mm)
        return w >= 55 || h >= 115;
    };

    const stdInput = "sap-input w-full text-center h-9 font-bold text-xs p-0 border-slate-300";

    return (
        <div className="bg-white rounded-3xl w-full h-[95vh] shadow-2xl flex flex-col overflow-hidden border border-slate-300 no-print">
            <div className="sap-object-header flex justify-between items-center py-4 px-6 bg-white border-b shrink-0">
                <div className="flex items-center space-x-4">
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft/></button>
                    <h3 className="text-xl font-black uppercase text-slate-800 tracking-tight">MM Configurator</h3>
                </div>
                <div className="flex space-x-3">
                    <button onClick={onSwitchMode} className="px-4 py-2 rounded-xl text-xs font-black uppercase border bg-white text-slate-600 border-slate-300 flex items-center hover:bg-slate-50 transition-all">
                        <ArrowRightLeft size={14} className="mr-2"/> Switch to Inch
                    </button>
                    <button onClick={() => onSave('draft')} className="bg-slate-100 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-slate-200 transition-all">Save Draft</button>
                    <button onClick={() => onSave('save')} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase shadow-md hover:bg-blue-700 transition-all">Save</button>
                    <button onClick={() => onSave('approve')} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase shadow-md hover:bg-emerald-700 transition-all">Approve & Order</button>
                </div>
            </div>
            
            <div className="flex-1 overflow-hidden p-6 bg-[#f8fafc] flex flex-col space-y-4">
                <div className="bg-white p-5 rounded-2xl border grid grid-cols-12 gap-3 items-end shadow-sm shrink-0">
                    <div className="col-span-2 space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400">Client</label>
                        <select className="sap-input w-full font-black text-sm h-10 border-slate-300" value={formData.clientId} onChange={e => onUpdateItem(-1, 'clientId', e.target.value)}>
                            <option value="">-- Customer --</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="col-span-2 space-y-1">
                        <label className="text-[10px] font-black uppercase text-blue-600">Project Ref</label>
                        <input type="text" className="sap-input w-full font-black uppercase h-10 border-blue-100" value={formData.projectName} onChange={e => onUpdateItem(-1, 'projectName', e.target.value)} />
                    </div>
                    <div className="col-span-1 space-y-1 relative group">
                        <div className="absolute -top-4 left-1 text-[9px] font-black text-blue-600 uppercase bg-blue-50 px-1.5 rounded border border-blue-100 transition-opacity whitespace-nowrap shadow-sm">Last: {lastSerial}</div>
                        <label className="text-[10px] font-black uppercase text-indigo-600 ml-1">Serial #</label>
                        <input 
                            type="text" 
                            placeholder={String(lastSerial + 1)}
                            className="sap-input w-full font-black h-10 border-indigo-200 bg-indigo-50" 
                            value={formData.manualSerial || ''} 
                            onChange={e => onUpdateItem(-1, 'manualSerial', e.target.value)} 
                        />
                    </div>
                    <div className="col-span-2 space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Due Date</label>
                        <input type="date" className="sap-input w-full font-black h-10 border-slate-300 text-xs" value={formData.dueDate || ''} onChange={e => onUpdateItem(-1, 'dueDate', e.target.value)} />
                    </div>
                    <div className="col-span-5">
                        <PrintSummary items={formData.items || []} />
                    </div>
                </div>

                <div className="flex-1 bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-auto min-h-[500px]">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-10 bg-slate-50 border-b">
                                <tr className="text-[10px] uppercase font-black text-slate-400 tracking-widest">
                                    <th className="w-10 text-center py-4">#</th>
                                    <th className="w-[380px] py-4 pl-2">Glass Spec</th>
                                    <th className="w-[280px] py-4 pl-2">Services</th>
                                    <th className="w-32 text-center py-4">Width (mm)</th>
                                    <th className="w-32 text-center py-4">Height (mm)</th>
                                    <th className="w-20 text-center py-4">Qty</th>
                                    <th className="w-24 text-center py-4">Sq.Ft</th>
                                    <th className="w-28 text-right py-4 pr-4">Rate</th>
                                    <th className="w-32 text-right py-4 pr-6">Total</th>
                                    <th className="w-24 text-center py-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {formData.items?.map((item, idx) => {
                                    const isWastage = isWastageZone(item);
                                    return (
                                        <tr key={idx} className={`${item.isSection ? 'bg-slate-50' : 'hover:bg-blue-50/20'}`}>
                                            <td className="text-center font-bold text-slate-300">{item.isSection ? '' : idx+1}</td>
                                            <td className="py-2 px-2">
                                                {item.isSection ? (
                                                    <input type="text" className="w-full bg-transparent font-black uppercase text-blue-700 outline-none text-xs h-8 border-b border-blue-100" value={item.description} onChange={e => onUpdateItem(idx, 'description', e.target.value)} placeholder="SECTION HEADING..." />
                                                ) : (
                                                    <div className="flex flex-col gap-1">
                                                        <input type="text" className="w-full font-bold uppercase text-[11px] h-6 outline-none" value={item.description} onChange={e => onUpdateItem(idx, 'description', e.target.value)} placeholder="Detail..."/>
                                                        <div className="flex gap-1">
                                                            <select value={item.glassType || 'Plain'} onChange={e => onUpdateItem(idx, 'glassType', e.target.value)} className="h-6 text-[9px] font-black border rounded bg-blue-50 uppercase px-1">{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                                            <select value={item.subCategory || 'Standard'} onChange={e => onUpdateItem(idx, 'subCategory', e.target.value)} className="h-6 text-[9px] font-black border rounded bg-white px-1 uppercase">{getSubCategories(item.glassType || 'Plain').map(s => <option key={s} value={s}>{s}</option>)}</select>
                                                            <select value={item.glassSize || '5mm'} onChange={e => onUpdateItem(idx, 'glassSize', e.target.value)} className="h-6 text-[9px] font-black border rounded bg-slate-50 px-1 uppercase">{getThicknesses(item.glassType || 'Plain', item.subCategory || 'Standard').map(t => <option key={t} value={t}>{t}</option>)}</select>
                                                            <select value={item.glassColor || 'Clear'} onChange={e => onUpdateItem(idx, 'glassColor', e.target.value)} className="h-6 text-[9px] font-black border rounded bg-slate-100 px-1 uppercase">
                                                                {getColors(item.glassType || 'Plain', item.subCategory || 'Standard', item.glassSize || '5mm').map(c => <option key={c} value={c}>{c}</option>)}
                                                            </select>
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-1 px-2">
                                                {!item.isSection && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {serviceNicks.map(nick => (
                                                            <button key={nick} onClick={() => { const cur = item.selectedServices || []; onUpdateItem(idx, 'selectedServices', cur.includes(nick) ? cur.filter(s => s !== nick) : [...cur, nick]); }} className={`px-1.5 h-6 rounded text-[9px] font-black border transition-all ${item.selectedServices?.includes(nick) ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:border-blue-400'}`}>{nick}</button>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-1"><input type="number" className={stdInput} value={item.mmW || ''} onChange={e => onUpdateItem(idx, 'mmW', e.target.value)} placeholder="0"/></td>
                                            <td className="px-1"><input type="number" className={stdInput} value={item.mmH || ''} onChange={e => onUpdateItem(idx, 'mmH', e.target.value)} placeholder="0"/></td>
                                            <td><input type="number" className={`${stdInput} w-14 bg-amber-50 border-amber-200`} value={item.qty} onChange={e => onUpdateItem(idx, 'qty', e.target.value)}/></td>
                                            <td className="text-center align-middle">
                                                {!item.isSection && (
                                                    <div className={`mx-auto w-20 py-1.5 rounded-lg border-2 transition-all font-black text-xs ${item.isManualSqFt ? 'border-blue-500 bg-blue-50 text-blue-700' : isWastage ? 'border-rose-500 bg-rose-50 text-rose-700 animate-pulse' : 'border-slate-100 text-slate-600'}`}>
                                                        {item.totalSqFt}
                                                        {item.isManualSqFt && <span className="ml-1 text-[8px] bg-blue-600 text-white px-1 rounded">M</span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td><input type="number" className={`${stdInput} text-right pr-2 text-blue-700 bg-blue-50/50`} value={item.pricePerUnit} onChange={e => onUpdateItem(idx, 'pricePerUnit', e.target.value)}/></td>
                                            <td className="text-right font-black pr-6 text-slate-900">{item.isSection ? '' : item.amount.toLocaleString()}</td>
                                            <td className="text-center">
                                                {!item.isSection && (
                                                    <div className="flex items-center justify-center space-x-1">
                                                        <button 
                                                            onClick={() => setManualSqFtModal({ isOpen: true, idx, val: item.totalSqFt })}
                                                            className={`p-1.5 rounded transition-colors ${isWastage && !item.isManualSqFt ? 'text-rose-600 bg-rose-50 hover:bg-rose-100' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                                            title="Override Sq.Ft"
                                                        >
                                                            <Calculator size={14}/>
                                                        </button>
                                                        <button onClick={() => onDuplicateItem(idx)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all" title="Duplicate"><Copy size={14}/></button>
                                                        <button onClick={() => onRemoveItem(idx)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all" title="Delete"><Trash2 size={14}/></button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="flex justify-between items-center shrink-0">
                    <div className="flex space-x-3">
                        <button onClick={onAddItem} className="px-6 py-2.5 bg-white border border-slate-300 rounded-xl shadow-sm text-xs font-black uppercase text-blue-600 flex items-center gap-2 hover:bg-blue-50 transition-all"><Plus size={16}/> Add Glass</button>
                        <button onClick={onAddSection} className="px-6 py-2.5 bg-white border border-slate-300 rounded-xl shadow-sm text-xs font-black uppercase text-slate-600 flex items-center gap-2 hover:bg-slate-50 transition-all"><Layers size={16}/> Heading</button>
                    </div>
                    <div className="flex items-center space-x-4 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center space-x-2">
                            <label className="text-[10px] font-black uppercase text-slate-500">Disc %</label>
                            <input type="number" className="sap-input w-20 font-black h-8 text-right" value={formData.discountPercent || ''} onChange={e => onUpdateItem(-1, 'discountPercent', Number(e.target.value))} />
                        </div>
                        <div className="flex items-center space-x-2">
                            <label className="text-[10px] font-black uppercase text-slate-500">Disc Amt</label>
                            <input type="number" className="sap-input w-24 font-black h-8 text-right" value={formData.discountAmount || ''} onChange={e => onUpdateItem(-1, 'discountAmount', Number(e.target.value))} />
                        </div>
                    </div>
                </div>
            </div>
            
            {manualSqFtModal.isOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[500] animate-in zoom-in duration-200">
                    <div className="bg-white rounded-[2rem] p-8 w-96 border-2 border-blue-400 shadow-2xl">
                        <div className="flex items-center space-x-3 mb-4 text-blue-600">
                            <Calculator size={32}/>
                            <h3 className="text-lg font-black uppercase">Override Billing Sq.Ft</h3>
                        </div>
                        <p className="text-xs font-bold text-slate-600 mb-6 uppercase leading-relaxed">
                            Manually define the billing area for this item.
                        </p>
                        <input 
                            type="number" 
                            step="0.01"
                            className="w-full p-4 bg-blue-50 border-2 border-blue-200 rounded-xl font-black text-xl text-center focus:border-blue-500 outline-none" 
                            autoFocus 
                            value={manualSqFtModal.val}
                            onChange={e => setManualSqFtModal({...manualSqFtModal, val: Number(e.target.value)})}
                            onKeyDown={e => e.key === 'Enter' && handleConfirmManualSqFt()} 
                        />
                        <div className="flex justify-end mt-6 space-x-3">
                            <button onClick={() => setManualSqFtModal({ isOpen: false, idx: -1, val: 0 })} className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest">Cancel</button>
                            <button onClick={handleConfirmManualSqFt} className="bg-blue-600 text-white px-6 py-2 rounded-xl text-xs font-black uppercase shadow-lg">Confirm</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="px-10 py-5 bg-slate-900 text-white flex justify-between items-center shrink-0 border-t-4 border-blue-600">
               <div className="flex flex-col md:flex-row md:space-x-12 items-center">
                   <div>
                       <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Gross Subtotal</p>
                       <p className="text-3xl font-black tracking-tight">PKR {(Number(totalAmount) || 0).toLocaleString()}</p>
                   </div>
                   <div className="h-10 w-px bg-slate-700 hidden md:block"></div>
                   <div>
                       <p className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.2em]">Net Contract Value</p>
                       <p className="text-2xl font-black text-indigo-400">PKR {(totalAmount - (formData.discountAmount || ((totalAmount * (formData.discountPercent || 0)) / 100))).toLocaleString()}</p>
                   </div>
                   <div className="h-10 w-px bg-slate-700 hidden md:block"></div>
                   <div>
                       <p className="text-[10px] font-black uppercase text-blue-400 tracking-[0.2em]">Advance Required</p>
                       <p className="text-2xl font-black text-blue-400">PKR {Math.round((totalAmount - (formData.discountAmount || ((totalAmount * (formData.discountPercent || 0)) / 100))) * 0.5).toLocaleString()}</p>
                   </div>
               </div>
               <button onClick={onClose} className="px-10 py-3 text-slate-500 font-black uppercase text-xs tracking-widest hover:text-white transition-colors">Discard & Exit</button>
            </div>
        </div>
    );
};
