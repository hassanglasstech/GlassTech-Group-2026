import React, { useState } from 'react';
import { ProductionPiece } from '@/modules/shared/types';
import { Sparkles, Hammer, Drill, CheckCircle2, Circle } from 'lucide-react';

interface ServiceFloorViewProps {
    pieces: ProductionPiece[];
    onUpdateStatus: (id: string, status: any, extra?: Partial<ProductionPiece>) => void;
}

const ServiceFloorView: React.FC<ServiceFloorViewProps> = ({ pieces, onUpdateStatus }) => {
    const [activeService, setActiveService] = useState<'Polishing' | 'Grinding' | 'Notching' | 'Holes'>('Polishing');

    const filteredPieces = (pieces || []).filter(p => p.status === 'Service-Pending' && p.pendingServices?.includes(activeService));

    const handleServiceDone = (piece: ProductionPiece) => {
        const remaining = (piece.pendingServices || []).filter(s => s !== activeService);
        if (remaining.length === 0) {
            onUpdateStatus(piece.id, 'QC-Pending', { pendingServices: [] });
        } else {
            onUpdateStatus(piece.id, 'Service-Pending', { pendingServices: remaining });
        }
    };

    const getIcon = (service: string) => {
        if (service === 'Polishing') return <Sparkles size={16}/>;
        if (service === 'Grinding') return <Hammer size={16}/>;
        if (service === 'Notching') return <Drill size={16}/>;
        if (service === 'Holes') return <Circle size={16}/>;
        return <CheckCircle2 size={16}/>;
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <div className="bg-indigo-900 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10"><Sparkles size={120} /></div>
                <div>
                    <h2 className="text-2xl font-black uppercase">Processing Services</h2>
                    <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-1">Value Addition Floor</p>
                </div>
                <div className="bg-white/10 px-6 py-4 rounded-2xl border border-white/10 relative z-10 text-center">
                    <p className="text-[10px] font-black uppercase text-indigo-200 mb-1">Queue Load</p>
                    <p className="text-3xl font-black">{filteredPieces.length}</p>
                </div>
            </div>

            <div className="flex bg-white p-1 rounded-2xl border w-fit shadow-sm overflow-x-auto">
                <button onClick={() => setActiveService('Polishing')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeService === 'Polishing' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <Sparkles size={16}/> <span>Polish / Edge</span>
                </button>
                <button onClick={() => setActiveService('Grinding')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeService === 'Grinding' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <Hammer size={16}/> <span>Grinding (R/D)</span>
                </button>
                <button onClick={() => setActiveService('Notching')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeService === 'Notching' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <Drill size={16}/> <span>Notching</span>
                </button>
                <button onClick={() => setActiveService('Holes')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeService === 'Holes' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <Circle size={16}/> <span>Holes</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPieces.map(p => (
                    <div key={p.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-lg transition-all group relative">
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-xs font-black uppercase text-slate-400">{p.id}</span>
                            <div className="flex space-x-1">
                                {(p.pendingServices || []).map(s => (
                                    <div key={s} className={`p-1.5 rounded-lg ${s === activeService ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-300'}`}>
                                        {getIcon(s)}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 uppercase mb-6 leading-relaxed">{p.specs}</h4>
                        
                        <button 
                            onClick={() => handleServiceDone(p)}
                            className="w-full py-3 rounded-xl bg-indigo-50 text-indigo-600 font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center space-x-2"
                        >
                            <CheckCircle2 size={14}/> <span>Mark {activeService} Done</span>
                        </button>
                    </div>
                ))}
                {filteredPieces.length === 0 && (
                    <div className="col-span-full py-20 text-center text-slate-300 font-bold uppercase text-xs italic border-2 border-dashed rounded-[2rem]">
                        No pieces pending for {activeService}.
                    </div>
                )}
            </div>
        </div>
    );
};

export default ServiceFloorView;
