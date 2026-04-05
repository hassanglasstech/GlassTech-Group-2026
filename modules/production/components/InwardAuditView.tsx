
import React from 'react';
import { Quotation, ProductionPiece, TemperingDispatch, Client } from '@/modules/shared/types';
import { Truck, Send, Check, MapPin, CheckCircle2 } from 'lucide-react';
import { getVendorColorClass, getVendorTextClass, isInternal } from './ProductionUtils';

interface InwardAuditViewProps {
    jobOrders: Quotation[];
    pieces: ProductionPiece[];
    dispatches: TemperingDispatch[];
    clients: Client[];
    activeInwardDispatchId: string;
    setActiveInwardDispatchId: (val: string) => void;
    inwardAuditablePieces: ProductionPiece[];
    selectedPiecesForDelivery: Set<string>;
    togglePieceForDelivery: (id: string) => void;
    setIsDirectDeliveryModalOpen: (val: boolean) => void;
    handleInwardPiece: (id: string) => void;
    openBinModal: (p: ProductionPiece) => void;
}

const InwardAuditView: React.FC<InwardAuditViewProps> = ({
    jobOrders, dispatches, clients,
    activeInwardDispatchId, setActiveInwardDispatchId,
    inwardAuditablePieces,
    selectedPiecesForDelivery, togglePieceForDelivery,
    setIsDirectDeliveryModalOpen, handleInwardPiece, openBinModal
}) => {
    
    const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || 'Walk-in Partner';

    return (
        <div className="space-y-6 animate-in zoom-in duration-300">
           <div className="bg-blue-900 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10"><Truck size={120} /></div>
              <div>
                 
                 <p className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mt-1">Reconcile Returned Material</p>
              </div>
              <div className="flex items-center space-x-4 relative z-10">
                 <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-blue-200 ml-1">Current Inward Dispatch</label>
                    <select value={activeInwardDispatchId} onChange={e => setActiveInwardDispatchId(e.target.value)} className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm font-black outline-none w-64 text-white">
                       <option value="" className="text-slate-900">-- Select Return Trip --</option>
                       {dispatches.filter(d => 
                          (d.status === 'Dispatched' || d.status === 'Ready to Dispatch') && 
                          isInternal(d.plantName) 
                       ).map(d => (
                         <option key={d.id} value={d.id} className="text-slate-900">[{d.id}] From: {d.pickLocation} - {d.vehicleNo}</option>
                       ))}
                    </select>
                 </div>
                 <button onClick={() => setIsDirectDeliveryModalOpen(true)} className="bg-emerald-50 hover:bg-emerald-400 text-white px-4 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg transition-all flex items-center space-x-2 mt-5">
                    <Send size={14}/> <span>Direct Site Delivery</span>
                 </button>
              </div>
           </div>

           {selectedPiecesForDelivery.size > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex justify-between items-center animate-in slide-in-from-top">
                 <span className="text-emerald-700 font-bold text-xs uppercase">{selectedPiecesForDelivery.size} Pieces Selected for Direct Dispatch</span>
                 <button onClick={() => {}} className="text-[10px] font-black uppercase text-emerald-600 hover:underline">Clear Selection</button>
              </div>
           )}

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {jobOrders.map(job => {
                const pendingPieces = inwardAuditablePieces.filter(p => p.orderId === job.orderNo);
                const isActive = pendingPieces.length > 0;
                if (!activeInwardDispatchId && !isActive) return null;
                const inwardTrip = dispatches.find(d => d.id === activeInwardDispatchId);
                const vendorName = inwardTrip?.pickLocation;
                
                return (
                <div key={job.id} className={`bg-white p-6 rounded-[2rem] border-2 shadow-sm transition-all flex flex-col ${isActive ? getVendorColorClass(vendorName) + ' opacity-100' : 'border-slate-100 opacity-40 grayscale pointer-events-none'}`}>
                   <div className="flex justify-between items-start mb-4">
                      <span className="px-3 py-1 bg-white text-slate-900 rounded-full text-[10px] font-black uppercase shadow-sm">{job.orderNo}</span>
                      <div className="text-right">
                          <p className="text-[9px] font-black opacity-60 uppercase">Pending Return</p>
                          <p className={`text-lg font-black ${isActive ? getVendorTextClass(vendorName) : 'text-slate-400'}`}>{pendingPieces.length} Pcs</p>
                      </div>
                   </div>
                   <div className="mb-6">
                      <h4 className="font-black text-slate-800 uppercase text-sm leading-tight truncate">{job.projectName || 'General Order'}</h4>
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tight truncate mt-1">{getClientName(job.clientId)}</p>
                   </div>
                   
                   {isActive && (
                       <div className="space-y-2">
                          {pendingPieces.map(p => {
                            const isSelectedForDirect = selectedPiecesForDelivery.has(p.id);
                            return (
                              <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all bg-white ${isSelectedForDirect ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-100'}`}>
                                 <div className="flex items-center space-x-2">
                                    <button onClick={() => togglePieceForDelivery(p.id)} className={`w-4 h-4 rounded border flex items-center justify-center ${isSelectedForDirect ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-100 border-slate-300'}`}>
                                       {isSelectedForDirect && <Check size={10}/>}
                                    </button>
                                    <span className="text-xs font-black text-slate-800">{p.id}</span>
                                 </div>
                                 <div className="flex space-x-1">
                                    <button onClick={() => openBinModal(p)} className={`p-2 rounded-lg transition-all ${p.spotId ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 hover:text-blue-600'}`} title="Putaway Strategy">
                                       <MapPin size={14} />
                                    </button>
                                    <button onClick={() => handleInwardPiece(p.id)} className="p-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg shadow-sm hover:bg-emerald-600 hover:text-white transition-all" title="Receive to Warehouse"><CheckCircle2 size={14}/></button>
                                 </div>
                              </div>
                            );
                          })}
                       </div>
                   )}
                </div>
              )})}
           </div>
        </div>
    );
};

export default InwardAuditView;
