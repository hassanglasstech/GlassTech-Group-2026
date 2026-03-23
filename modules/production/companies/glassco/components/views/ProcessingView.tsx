import React, { useState } from 'react';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import InwardAuditView from '@/modules/production/components/InwardAuditView';
import { Flame, ArrowDownLeft, Hourglass, Layers, ChevronLeft, User, LayoutGrid, Clock } from 'lucide-react';
import JobCard from '@/modules/production/components/sub/JobCard';
import { isInternal } from '@/modules/production/components/ProductionUtils';

const ProcessingView: React.FC = () => {
  const { 
    pieces, jobOrders, dispatches, clients, spots, company,
    activeDispatchIdForLoading, setActiveDispatchIdForLoading,
    activeInwardDispatchId, setActiveInwardDispatchId,
    inwardAuditablePieces, selectedPiecesForDelivery,
    togglePieceForDelivery, setIsDirectDeliveryModalOpen, handleInwardPiece, openBinModal,
    selectedJobId, setSelectedJobId, getJobDetails, togglePieceToDispatch
  } = useProductionContext();

  const [activeSubTab, setActiveSubTab] = useState<'tempering' | 'inward' | 'wip' | 'lamination' | 'double_glaze'>('tempering');

  // ── Auto-detect pending trip from Logistics ──
  React.useEffect(() => {
    const pending = localStorage.getItem('gtk_pending_trip_load');
    if (pending) {
      try {
        const data = JSON.parse(pending);
        // Only auto-load if created within last 30 minutes
        if (Date.now() - data.timestamp < 30 * 60 * 1000 && data.firstDispatchId) {
          setActiveSubTab('tempering'); // Switch to Loading tab
          setActiveDispatchIdForLoading(data.firstDispatchId);
          localStorage.removeItem('gtk_pending_trip_load');
        }
      } catch {}
    }
  }, [dispatches]);

  const renderGrid = (filterFn: (p: any) => boolean, renderAction: (p: any) => React.ReactNode, title: string, color: string) => {
    if (selectedJobId) {
        const jobData = getJobDetails(selectedJobId, filterFn);
        const relevantPieces = pieces.filter(p => p.orderId === selectedJobId && filterFn(p));
        
        // Sort by piece number ascending (e.g. 2428/1, 2428/2, 2428/10)
        relevantPieces.sort((a, b) => {
          const getNum = (id: string) => {
            const part = id.split('/').pop() || '0';
            return parseInt(part.replace(/[^0-9]/g, '')) || 0;
          };
          return getNum(a.id) - getNum(b.id);
        });
        
        if (relevantPieces.length === 0) { setSelectedJobId(null); return null; }

        return (
           <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
              <div className="flex items-center space-x-4 bg-white p-4 rounded-2xl border shadow-sm">
                 <button onClick={() => setSelectedJobId(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ChevronLeft size={24}/></button>
                 <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase">{jobData.projectName || 'Standard Order'}</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{jobData.clientName} | {selectedJobId}</p>
                 </div>
                 <div className="ml-auto flex items-center space-x-6 text-right">
                    <div><p className="text-[10px] font-black text-slate-400 uppercase">Pending Qty</p><p className="text-lg font-black">{jobData.pendingQty} <span className="text-[10px] text-slate-400">Pcs</span></p></div>
                    <div><p className="text-[10px] font-black text-slate-400 uppercase">Volume</p><p className="text-lg font-black">{jobData.pendingSqFt} <span className="text-[10px] text-slate-400">Ft²</span></p></div>
                 </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {relevantPieces.map(p => {
                    const isWaitingAtTempering = p.status === 'Dispatched' && (activeSubTab === 'lamination' || activeSubTab === 'double_glaze' || activeSubTab === 'wip');
                    return (
                        <div key={p.id} className="relative">
                            {isWaitingAtTempering && (
                                <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] z-10 rounded-xl flex flex-col items-center justify-center text-white p-4 text-center">
                                    <Clock size={20} className="mb-2 animate-pulse text-amber-400"/>
                                    <p className="text-[10px] font-black uppercase tracking-widest">At External Plant</p>
                                </div>
                            )}
                            <JobCard piece={p} jobOrder={jobOrders.find(j => j.orderNo === p.orderId)} spot={spots.find(s => s.id === p.spotId)} onBinClick={(e) => { e.stopPropagation(); openBinModal(p); }} actionRenderer={() => isWaitingAtTempering ? <div className="h-10"></div> : renderAction(p)} />
                        </div>
                    );
                 })}
              </div>
           </div>
        );
    }

    const uniqueIds = Array.from(new Set<string>(pieces.filter(filterFn).map(p => p.orderId)));
    if (uniqueIds.length === 0) return <div className="py-20 text-center text-slate-300 font-black uppercase text-xs italic">No jobs pending in this queue.</div>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in zoom-in duration-300">
           {uniqueIds.map(id => {
              const data = getJobDetails(id, filterFn);
              return (
                 <div key={id} onClick={() => setSelectedJobId(id)} className={`bg-white p-6 rounded-[2rem] border-2 shadow-sm transition-all cursor-pointer group flex flex-col justify-between h-full relative overflow-hidden border-slate-200 hover:shadow-xl hover:border-blue-400`}>
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform"><LayoutGrid size={100}/></div>
                    <div>
                       <div className="flex justify-between items-start mb-4 relative z-10">
                          <div className={`p-3 rounded-2xl transition-colors bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white`}>
                             <User size={24}/>
                          </div>
                          <span className={`bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase`}>
                             {`${data.totalProgress}% Done`}
                          </span>
                       </div>
                       <h4 className="text-lg font-black text-slate-900 uppercase leading-tight mb-1 truncate relative z-10">{data.projectName || 'Standard Order'}</h4>
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate relative z-10">{data.clientName}</p>
                       <p className="text-[9px] font-bold text-blue-300 uppercase tracking-widest mt-1 relative z-10">{id}</p>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 relative z-10">
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Pending Items</p><p className="text-xl font-black text-slate-800">{data.pendingQty} <span className="text-[9px] text-slate-400">Pcs</span></p></div>
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Area</p><p className="text-xl font-black text-slate-800">{data.pendingSqFt} <span className="text-[9px] text-slate-400">Ft²</span></p></div>
                    </div>
                 </div>
              );
           })}
        </div>
    );
  };

  return (
    <div className="space-y-6">
        <div className="flex space-x-1 bg-white p-1 rounded-2xl border w-fit shadow-sm overflow-x-auto">
            <button onClick={() => setActiveSubTab('tempering')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'tempering' ? 'bg-rose-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Flame size={16} className="inline mr-2"/> Loading</button>
            <button onClick={() => setActiveSubTab('inward')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'inward' ? 'bg-blue-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><ArrowDownLeft size={16} className="inline mr-2"/> Inward Audit</button>
            <button onClick={() => setActiveSubTab('wip')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'wip' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Hourglass size={16} className="inline mr-2"/> WIP (Tempering)</button>
            <button onClick={() => setActiveSubTab('lamination')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'lamination' ? 'bg-orange-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Layers size={16} className="inline mr-2"/> Lamination</button>
            <button onClick={() => setActiveSubTab('double_glaze')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'double_glaze' ? 'bg-cyan-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Layers size={16} className="inline mr-2"/> Double Glaze</button>
        </div>

        {activeSubTab === 'tempering' && (
            <div className="space-y-6 animate-in fade-in duration-300">
               {!selectedJobId && (
                 <div className="bg-rose-600 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10"><Flame size={120} /></div>
                    <div><h2 className="text-2xl font-black uppercase">Destination Trip Loading</h2><p className="text-[10px] font-bold text-rose-200 uppercase tracking-widest mt-1">Load Material to Outgoing Trip</p></div>
                    <div className="space-y-2 relative z-10"><label className="text-[9px] font-black uppercase text-rose-200 ml-1">Select Outgoing Trip</label><select value={activeDispatchIdForLoading} onChange={e => setActiveDispatchIdForLoading(e.target.value)} className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm font-black outline-none w-64 text-white"><option value="" className="text-slate-900">-- Select Trip to Load --</option>{dispatches.filter(d => d.status === 'Ready to Dispatch' || d.status === 'Scheduled').map(d => (<option key={d.id} value={d.id} className="text-slate-900">{d.originLocation && d.originLocation !== 'Factory' ? `🔄 TRANSFER: ${d.originLocation} -> ` : (d.serviceType === 'Site Delivery' ? '📦 SITE: ' : '🔥 PLANT: ')}{d.plantName} ({d.vehicleNo})</option>))}</select></div>
                 </div>
               )}

               {/* ── Loaded Summary Bar ── */}
               {activeDispatchIdForLoading && !selectedJobId && (() => {
                 const selectedTrip = dispatches.find(d => d.id === activeDispatchIdForLoading);
                 const loadedPieces = pieces.filter(p => p.dispatchId === activeDispatchIdForLoading);
                 const loadedSqFt = loadedPieces.reduce((s, p) => s + (p.totalSqFt || 0), 0);
                 const uniqueOrders = Array.from(new Set(loadedPieces.map(p => p.orderId)));
                 if (!selectedTrip) return null;
                 return (
                   <div className="bg-white border-2 border-rose-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                     <div className="flex items-center space-x-6">
                       <div className="bg-rose-100 text-rose-600 p-3 rounded-xl"><Flame size={20}/></div>
                       <div>
                         <p className="text-xs font-black text-slate-800 uppercase">{selectedTrip.serviceType}: {selectedTrip.plantName}</p>
                         <p className="text-[10px] text-slate-400 font-bold">{selectedTrip.id} | Origin: {selectedTrip.originLocation || 'Factory'}</p>
                       </div>
                     </div>
                     <div className="flex items-center space-x-8 text-right">
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Loaded</p><p className="text-xl font-black text-rose-600">{loadedPieces.length} <span className="text-[10px] text-slate-400">Pcs</span></p></div>
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Area</p><p className="text-xl font-black text-slate-700">{loadedSqFt.toFixed(1)} <span className="text-[10px] text-slate-400">Ft²</span></p></div>
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Orders</p><p className="text-xl font-black text-blue-600">{uniqueOrders.length}</p></div>
                     </div>
                   </div>
                 );
               })()}

               {renderGrid(
                 (p) => {
                    const selectedTrip = dispatches.find(d => d.id === activeDispatchIdForLoading);
                    if (!selectedTrip) return false;
                    if (p.dispatchId === activeDispatchIdForLoading) return true;
                    const origin = selectedTrip.originLocation || 'Factory';
                    if (origin === 'Factory') {
                        const isSiteDelivery = selectedTrip.serviceType === 'Site Delivery';
                        if (isSiteDelivery) return p.status === 'Ready to Dispatch' && !p.dispatchId;
                        if (company === 'Glassco' && (selectedTrip.serviceType === 'Lamination' || selectedTrip.serviceType === 'Double Glazing')) {
                            const order = jobOrders.find(j => j.orderNo === p.orderId);
                            const item = order?.items[p.itemIndex];
                            if (!item) return false;
                            const services = item.selectedServices || [];
                            const glassType = item.glassType || 'Clear';
                            const isLamTrip = selectedTrip.serviceType === 'Lamination';
                            const needsService = isLamTrip ? (services.includes('Lamination') || services.includes('Laminated') || glassType === 'Laminated') : (services.includes('Double Glaze') || services.includes('Double Glazed') || services.includes('D/G'));
                            if (!needsService) return false;
                            const isTemperedSpec = glassType === 'Tempered' || services.includes('T/G') || services.includes('Tempered');
                            if (isTemperedSpec) return p.status === 'Tempered' && !p.dispatchId;
                            else return (p.status === 'QC-Passed' || p.status === 'Ready to Dispatch') && !p.dispatchId;
                        }
                        if (selectedTrip.serviceType === 'Tempering') return p.status === 'QC-Passed' && !p.dispatchId;
                        return false;
                    } else {
                        if (p.status !== 'Dispatched') return false;
                        const lastTrip = dispatches.find(d => d.id === p.dispatchId);
                        if (!lastTrip) return false;
                        return lastTrip.plantName === origin;
                    }
                 },
                 (p) => {
                   const isLoaded = p.dispatchId === activeDispatchIdForLoading;
                   const selectedTrip = dispatches.find(d => d.id === activeDispatchIdForLoading);
                   const isRemote = selectedTrip && selectedTrip.originLocation !== 'Factory';
                   return <button onClick={() => togglePieceToDispatch(p.id)} className={`w-full py-2 rounded-lg text-[10px] font-black uppercase transition-all ${isLoaded ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{isLoaded ? 'Loaded' : (isRemote ? 'Remote Load' : 'Load to Trip')}</button>;
                 },
                 "Tempering Loading", "rose"
               )}
            </div>
        )}

        {activeSubTab === 'inward' && (
            <InwardAuditView 
                jobOrders={jobOrders} pieces={pieces} dispatches={dispatches} clients={clients}
                activeInwardDispatchId={activeInwardDispatchId} setActiveInwardDispatchId={setActiveInwardDispatchId}
                inwardAuditablePieces={inwardAuditablePieces} selectedPiecesForDelivery={selectedPiecesForDelivery}
                togglePieceForDelivery={togglePieceForDelivery} setIsDirectDeliveryModalOpen={setIsDirectDeliveryModalOpen}
                handleInwardPiece={handleInwardPiece} openBinModal={openBinModal}
            />
        )}

        {activeSubTab === 'wip' && (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
               {!selectedJobId && <div className="bg-amber-500 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-10"><Hourglass size={120} /></div><div><h2 className="text-2xl font-black uppercase">WIP (Tempering Stack)</h2><p className="text-[10px] font-bold text-amber-100 uppercase tracking-widest mt-1">QC Passed Material Pending Tempering Trip</p></div></div>}
               {renderGrid(
                 (p) => {
                    const order = jobOrders.find(j => j.orderNo === p.orderId);
                    const item = order?.items[p.itemIndex];
                    if (!item) return false;
                    const services = item.selectedServices || [];
                    const glassType = item.glassType || 'Clear';
                    const needsTempering = services.includes('T/G') || services.includes('Tempered') || glassType === 'Tempered';
                    
                    if (p.status === 'QC-Passed' && needsTempering && !p.dispatchId) return true;
                    
                    // Show if currently dispatched to an external plant for tempering
                    if (p.status === 'Dispatched' && p.dispatchId) {
                        const dispatch = dispatches.find(d => d.id === p.dispatchId);
                        return dispatch && !isInternal(dispatch.plantName) && dispatch.serviceType === 'Tempering';
                    }
                    
                    return false;
                 },
                 (p) => <div className="text-center text-[10px] font-bold text-amber-600">Pending Return from Tempering</div>,
                 "WIP", "amber"
               )}
            </div>
        )}

        {activeSubTab === 'lamination' && (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
               {!selectedJobId && <div className="bg-orange-600 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-10"><Layers size={120} /></div><div><h2 className="text-2xl font-black uppercase">Lamination Queue</h2><p className="text-[10px] font-bold text-orange-200 uppercase tracking-widest mt-1">Staging for Lamination Service</p></div></div>}
               {renderGrid(
                 (p) => {
                    const order = jobOrders.find(j => j.orderNo === p.orderId);
                    const item = order?.items[p.itemIndex];
                    if (!item) return false;
                    const services = item.selectedServices || [];
                    const glassType = item.glassType || 'Clear';
                    const needsLam = services.includes('Lamination') || services.includes('Laminated') || glassType === 'Laminated';
                    if (!needsLam) return false;
                    
                    const isAtTempering = p.status === 'Dispatched'; 
                    return (p.status === 'Tempered' || (p.status === 'QC-Passed' && !services.includes('T/G')) || isAtTempering) && !p.dispatchId;
                 },
                 (p) => <div className="text-center text-[10px] font-bold text-orange-600">Ready to Process</div>,
                 "Lamination", "orange"
               )}
            </div>
        )}

        {activeSubTab === 'double_glaze' && (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
               {!selectedJobId && <div className="bg-cyan-600 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-10"><Layers size={120} /></div><div><h2 className="text-2xl font-black uppercase">Double Glazing Queue</h2><p className="text-[10px] font-bold text-cyan-200 uppercase tracking-widest mt-1">Staging for D/G Service</p></div></div>}
               {renderGrid(
                 (p) => {
                    const order = jobOrders.find(j => j.orderNo === p.orderId);
                    const item = order?.items[p.itemIndex];
                    if (!item) return false;
                    const services = item.selectedServices || [];
                    const needsDG = services.includes('Double Glaze') || services.includes('Double Glazed') || services.includes('D/G');
                    if (!needsDG) return false;
                    
                    const isAtTempering = p.status === 'Dispatched';
                    return (p.status === 'Tempered' || (p.status === 'QC-Passed' && !services.includes('T/G')) || isAtTempering) && !p.dispatchId;
                 },
                 (p) => <div className="text-center text-[10px] font-bold text-cyan-600">Ready to Process</div>,
                 "Double Glaze", "cyan"
               )}
            </div>
        )}
    </div>
  );
};

export default ProcessingView;
