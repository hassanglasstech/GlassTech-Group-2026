
import React, { useState, useMemo } from 'react';
import { Product, QuotationItem } from '../../shared/types';
import { X, Component, Anchor, PaintBucket, Layers, CheckCircle2 } from 'lucide-react';

interface GTKEstimatorProps {
    isOpen: boolean;
    onClose: () => void;
    products: Product[];
    onConfirm: (item: QuotationItem) => void;
}

const GTKEstimator: React.FC<GTKEstimatorProps> = ({ isOpen, onClose, products, onConfirm }) => {
    const [recipeConfig, setRecipeConfig] = useState({
        category: 'Window' as 'Window' | 'Door',
        system: '',
        type: '2-Panel Sliding' as 'Fixed' | 'Casement' | '2-Panel Sliding' | '3-Panel Sliding' | 'Lift & Slide',
        widthFt: 8,
        heightFt: 8,
        glassId: '',
        finishId: '',
        hardwareId: '',
        qty: 1,
        marginPercent: 35
    });

    const availableSystems = useMemo(() => Array.from(new Set(products.filter(p => p.category === 'Profile').map(p => p.serviceNick).filter(Boolean))) as string[], [products]);
    const availableGlass = useMemo(() => products.filter(p => p.category === 'Glass'), [products]);
    const availableFinishes = useMemo(() => products.filter(p => p.category === 'Finish'), [products]);
    const availableHardware = useMemo(() => products.filter(p => p.category === 'Hardware'), [products]);
    
    // Auto-calculate Rubber rate (Accessory) - finds average or specific
    const rubberRate = useMemo(() => {
        const rubber = products.find(p => p.category === 'Accessory' && (p.description.includes('RUBBER') || p.description.includes('GASKET')));
        return rubber ? (rubber.costPrice || 0) : 45; // Default if not found
    }, [products]);

    const calculateRecipe = () => {
        if (!recipeConfig.system) return { 
            total: 0, 
            unitPrice: 0,
            sections: { profile: 0, hardware: 0, acc: 0, glass: 0, labor: 0 }, 
            specs: { weight: '0', area: '0', perim: '0' },
            summary: [] 
        };

        // 1. DIMENSIONS
        const W = recipeConfig.widthFt;
        const H = recipeConfig.heightFt;
        const Area = W * H;
        const Perimeter = (W + H) * 2;

        // 2. PROFILE COST
        let runningFt = 0;
        switch (recipeConfig.type) {
            case 'Fixed': runningFt = Perimeter; break; 
            case 'Casement': runningFt = Perimeter * 2; break; 
            case '2-Panel Sliding': runningFt = (W * 4) + (H * 4); break; 
            case 'Lift & Slide': runningFt = (W * 4) + (H * 4) + H; break; 
            case '3-Panel Sliding': runningFt = (W * 6) + (H * 6); break; 
            default: runningFt = Perimeter * 1.5;
        }
        runningFt = runningFt * 1.10; // Wastage

        let weightPerFt = 1.2; 
        if(recipeConfig.system.includes('100')) weightPerFt = 1.5;
        if(recipeConfig.system.includes('Lift')) weightPerFt = 2.5; 
        if(recipeConfig.system.includes('26')) weightPerFt = 0.8; 

        const totalWeight = runningFt * weightPerFt;
        
        // Find Base Rate from "Raw Profile" or system default (Assuming 1450 if not found)
        const baseProfileRate = 1450; 
        
        // Dynamic Finish Rate
        const selectedFinish = products.find(p => p.id === recipeConfig.finishId);
        const finishRate = selectedFinish ? (selectedFinish.costPrice || 0) : 0;
        
        const costProfile = totalWeight * (baseProfileRate + finishRate);

        // 3. HARDWARE COST (Dynamic)
        const selectedHardware = products.find(p => p.id === recipeConfig.hardwareId);
        // If specific hardware selected, use its price. Else fallback to estimation logic.
        let costHardware = 0;
        if (selectedHardware) {
            costHardware = selectedHardware.costPrice || 0;
        } else {
            // Fallback Logic
            if(recipeConfig.type === 'Lift & Slide') costHardware = 45000; 
            else if(recipeConfig.type.includes('Sliding')) costHardware = 2500; 
            else if(recipeConfig.type === 'Casement') costHardware = 3500; 
            else costHardware = 500; 
        }

        // 4. ACCESSORIES COST
        const rubberRun = runningFt * 2; 
        const costAcc = (rubberRun * rubberRate) + (Perimeter * 50); // Sealant estimate

        // 5. GLAZING COST
        const selectedGlass = products.find(p => p.id === recipeConfig.glassId);
        const glassRate = selectedGlass ? (selectedGlass.costPrice || 0) : 0;
        const costGlass = Area * glassRate;

        // TOTALS
        const fabricationLabor = Area * 120; 
        const totalBasicCost = costProfile + costHardware + costAcc + costGlass + fabricationLabor;
        
        const marginAmount = totalBasicCost * (recipeConfig.marginPercent / 100);
        const finalPrice = totalBasicCost + marginAmount;

        return {
            total: Math.round(finalPrice * recipeConfig.qty),
            unitPrice: Math.round(finalPrice),
            sections: { profile: costProfile, hardware: costHardware, acc: costAcc, glass: costGlass, labor: fabricationLabor },
            specs: { weight: totalWeight.toFixed(1), area: Area.toFixed(1), perim: Perimeter.toFixed(1) }
        };
    };

    const handleAdd = () => {
        const calc = calculateRecipe();
        if (calc.total === 0) return;

        const hwName = products.find(p => p.id === recipeConfig.hardwareId)?.description || 'Std Kit';
        const fnName = products.find(p => p.id === recipeConfig.finishId)?.description || 'Mill Finish';
        const glassDesc = products.find(p => p.id === recipeConfig.glassId)?.description || 'No Glass';

        const desc = `${recipeConfig.system} ${recipeConfig.category} ${recipeConfig.type} (${recipeConfig.widthFt}' x ${recipeConfig.heightFt}')`;
        const techSpecs = `HW: ${hwName} | Fin: ${fnName}`;

        const newItem: QuotationItem = {
            id: `SYS-${Date.now()}`,
            description: desc,
            glazingSpecs: `${glassDesc} [${techSpecs}]`,
            locationCode: `W-AUTO`,
            qty: recipeConfig.qty,
            width: recipeConfig.widthFt * 12,
            height: recipeConfig.heightFt * 12,
            inchW: recipeConfig.widthFt * 12, inchH: recipeConfig.heightFt * 12, sootW: 0, sootH: 0,
            totalSqFt: Number(calc.specs.area) * recipeConfig.qty,
            pricePerUnit: calc.unitPrice,
            amount: calc.total,
            selectedServices: ['Fabrication', 'Assembly'],
            glassSize: '', glassType: '' 
        };
        onConfirm(newItem);
    };

    const recipeCalc = calculateRecipe();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 z-[300]">
            <div className="bg-white rounded-[2.5rem] w-full max-w-6xl h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-700 animate-in zoom-in duration-300">
                <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-orange-600 rounded-2xl shadow-lg shadow-orange-900/50"><Component size={24} className="text-white"/></div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight">System Recipe Engine</h3>
                            <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mt-1">Live Database Pricing</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-full"><X size={28}/></button>
                </div>

                <div className="flex-1 overflow-hidden flex bg-slate-50">
                    {/* Left: Input Panel */}
                    <div className="w-[40%] p-8 border-r border-slate-200 overflow-y-auto space-y-8 bg-white">
                        <div className="space-y-4">
                            <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest border-b pb-2">1. System Specs</h4>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500">Element Category</label>
                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                    <button onClick={() => setRecipeConfig({...recipeConfig, category: 'Window'})} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${recipeConfig.category === 'Window' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>Window</button>
                                    <button onClick={() => setRecipeConfig({...recipeConfig, category: 'Door'})} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${recipeConfig.category === 'Door' ? 'bg-white shadow text-orange-600' : 'text-slate-400'}`}>Door</button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500">Opening Type</label>
                                <select className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm" value={recipeConfig.type} onChange={e => setRecipeConfig({...recipeConfig, type: e.target.value as any})}>
                                    <option>Fixed</option><option>Casement</option><option>2-Panel Sliding</option><option>3-Panel Sliding</option><option>Lift & Slide</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500">System Profile</label>
                                <select className="w-full p-3 bg-slate-50 border rounded-xl font-bold uppercase text-sm" value={recipeConfig.system} onChange={e => setRecipeConfig({...recipeConfig, system: e.target.value})}>
                                    <option value="">-- Select Series --</option>
                                    {availableSystems.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-[10px] font-black uppercase text-slate-500">Width (Ft)</label><input type="number" className="w-full p-3 bg-slate-50 border rounded-xl font-black" value={recipeConfig.widthFt} onChange={e => setRecipeConfig({...recipeConfig, widthFt: Number(e.target.value)})} /></div>
                                <div><label className="text-[10px] font-black uppercase text-slate-500">Height (Ft)</label><input type="number" className="w-full p-3 bg-slate-50 border rounded-xl font-black" value={recipeConfig.heightFt} onChange={e => setRecipeConfig({...recipeConfig, heightFt: Number(e.target.value)})} /></div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest border-b pb-2">2. Components</h4>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500">Hardware Kit</label>
                                <select className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm" value={recipeConfig.hardwareId} onChange={e => setRecipeConfig({...recipeConfig, hardwareId: e.target.value})}>
                                    <option value="">-- Auto Calculate --</option>
                                    {availableHardware.map(h => <option key={h.id} value={h.id}>{h.description} ({h.costPrice})</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500">Profile Finish</label>
                                <select className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm" value={recipeConfig.finishId} onChange={e => setRecipeConfig({...recipeConfig, finishId: e.target.value})}>
                                    <option value="">-- Mill Finish --</option>
                                    {availableFinishes.map(f => <option key={f.id} value={f.id}>{f.description} (+{f.costPrice}/kg)</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest border-b pb-2">3. Glass Configuration</h4>
                            <select className="w-full p-3 bg-slate-50 border rounded-xl font-bold uppercase text-sm" value={recipeConfig.glassId} onChange={e => setRecipeConfig({...recipeConfig, glassId: e.target.value})}>
                                <option value="">-- No Glass --</option>
                                {availableGlass.map(g => <option key={g.id} value={g.id}>{g.description}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Right: Recipe Breakdown Panel */}
                    <div className="w-[60%] p-10 flex flex-col">
                        <div className="flex-1 space-y-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-black text-slate-800 text-lg uppercase">Bill of Materials (BOM) Preview</h3>
                                <span className="bg-slate-200 text-slate-600 px-3 py-1 rounded-full text-xs font-bold uppercase">{recipeConfig.qty} Units</span>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Component size={20}/></div>
                                    <div>
                                        <p className="text-xs font-black uppercase text-slate-700">Section 1: Aluminium Structure</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{recipeConfig.system} - {recipeCalc.specs.weight} KG (Approx)</p>
                                    </div>
                                </div>
                                <p className="font-black text-slate-800">PKR {Math.round(recipeCalc.sections.profile).toLocaleString()}</p>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                    <div className="p-3 bg-orange-50 text-orange-600 rounded-xl"><Anchor size={20}/></div>
                                    <div>
                                        <p className="text-xs font-black uppercase text-slate-700">Section 2: Mechanism Kit</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{products.find(p => p.id === recipeConfig.hardwareId)?.description || 'Standard Logic Applied'}</p>
                                    </div>
                                </div>
                                <p className="font-black text-slate-800">PKR {Math.round(recipeCalc.sections.hardware).toLocaleString()}</p>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                    <div className="p-3 bg-slate-100 text-slate-600 rounded-xl"><PaintBucket size={20}/></div>
                                    <div>
                                        <p className="text-xs font-black uppercase text-slate-700">Section 3: Accessories & Sealants</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">EPDM Rubber: {Number(recipeCalc.specs.perim)*2} ft | Silicon | Screws</p>
                                    </div>
                                </div>
                                <p className="font-black text-slate-800">PKR {Math.round(recipeCalc.sections.acc).toLocaleString()}</p>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Layers size={20}/></div>
                                    <div>
                                        <p className="text-xs font-black uppercase text-slate-700">Section 4: Glazing Unit</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{recipeCalc.specs.area} SqFt | {products.find(p => p.id === recipeConfig.glassId)?.description}</p>
                                    </div>
                                </div>
                                <p className="font-black text-slate-800">PKR {Math.round(recipeCalc.sections.glass).toLocaleString()}</p>
                            </div>

                            <div className="border-t pt-4 mt-4 grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400">Labor & Overhead</label>
                                    <p className="font-bold text-slate-600">PKR {Math.round(recipeCalc.sections.labor).toLocaleString()}</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400">Target Margin %</label>
                                    <input type="number" className="w-20 p-1 border rounded text-center font-bold text-sm ml-2" value={recipeConfig.marginPercent} onChange={e => setRecipeConfig({...recipeConfig, marginPercent: Number(e.target.value)})} />
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-200">
                            <div className="flex justify-between items-end mb-6">
                                <div>
                                    <p className="text-xs font-black uppercase text-slate-400">Unit Selling Price</p>
                                    <p className="text-4xl font-black text-slate-800">PKR {(Number(recipeCalc.unitPrice) || 0).toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-black uppercase text-emerald-600 mb-1">Total Line Value</p>
                                    <p className="text-2xl font-black text-emerald-600">PKR {(Number(recipeCalc.total) || 0).toLocaleString()}</p>
                                </div>
                            </div>
                            <button onClick={handleAdd} disabled={recipeCalc.total === 0} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black uppercase text-sm tracking-widest shadow-xl hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2">
                                <CheckCircle2 size={18}/> <span>Confirm & Add to Quote</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GTKEstimator;
