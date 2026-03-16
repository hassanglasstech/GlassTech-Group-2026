import React, { useState } from 'react';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import AnalyticsView from '@/modules/production/components/AnalyticsView';
import { ShieldAlert, PackageCheck, Ban, BarChart3, ChevronLeft, User, LayoutGrid } from 'lucide-react';
import JobCard from '@/modules/production/components/sub/JobCard';

const DispatchView: React.FC = () => {
  const { 
    pieces, jobOrders, spots,
    selectedJobId, setSelectedJobId, getJobDetails,
    handleUpdatePieceStatus, setSelectedPieceForFault, analyticsData,
    openBinModal
  } = useProductionContext();

  const [activeSubTab, setActiveSubTab] = useState<'qc' | 'finished_goods' | 'faults' | 'analytics'>('qc');

  const renderGrid = (filterFn: (p: any) => boolean, renderAction: (p: any) => React.ReactNode) => {
    if (selectedJobId) {
        const jobData = getJobDetails(selectedJobId, filterFn);
        const relevantPieces = (pieces || []).filter(p => p.orderId === selectedJobId && filterFn(p));
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
                 {relevantPieces.map(p => (
                    <JobCard key={p.id} piece={p} jobOrder={jobOrders.find(j => j.orderNo === p.orderId)} spot={spots.find(s => s.id === p.spotId)} onBinClick={(e) => { e.stopPropagation(); openBinModal(p); }} actionRenderer={() => renderAction(p)} />
                 ))}
              </div>
           </div>
        );
    }

    const uniqueIds = Array.from(new Set<string>((pieces || []).filter(filterFn).map(p => p.orderId)));
    if (uniqueIds.length === 0) return <div className="py-20 text-center text-slate-300 font-black uppercase text-xs italic">No jobs pending here.</div>;

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
                          <span className={`bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase`}>{`${data.totalProgress}% Done`}</span>
                       </div>
                       <h4 className="text-lg font-black text-slate-900 uppercase leading-tight mb-1 truncate relative z-10">{data.projectName || 'Standard Order'}</h4>
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate relative z-10">{data.clientName}</p>
                       <p className="text-[9px] font-bold text-blue-300 uppercase tracking-widest mt-1 relative z-10">{id}</p>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 relative z-10">
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Pending Total</p><p className="text-xl font-black text-slate-800">{data.pendingQty} <span className="text-[9px] text-slate-400">Pcs</span></p></div>
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
            <button onClick={() => setActiveSubTab('qc')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'qc' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><ShieldAlert size={16} className="inline mr-2"/> Quality Hub</button>
            <button onClick={() => setActiveSubTab('finished_goods')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'finished_goods' ? 'bg-emerald-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><PackageCheck size={16} className="inline mr-2"/> Finished Goods</button>
            <button onClick={() => setActiveSubTab('faults')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'faults' ? 'bg-rose-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Ban size={16} className="inline mr-2"/> Fault Ledger</button>
            <button onClick={() => setActiveSubTab('analytics')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeSubTab === 'analytics' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><BarChart3 size={16} className="inline mr-2"/> Analytics</button>
        </div>

        {activeSubTab === 'qc' && (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                {!selectedJobId && <div className="bg-emerald-600 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-10"><ShieldAlert size={120} /></div><div><h2 className="text-2xl font-black uppercase">Quality Control Hub</h2><p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mt-1">Inspection & Grading</p></div></div>}
                {renderGrid(
                    (p) => p.status === 'QC-Pending',
                    (p) => (
                        <div className="flex space-x-2">
                            <button onClick={() => handleUpdatePieceStatus(p.id, 'QC-Passed')} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-emerald-700">Pass</button>
                            <button onClick={() => handleUpdatePieceStatus(p.id, 'QC-Failed')} className="flex-1 py-2 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-rose-700">Fail</button>
                        </div>
                    )
                )}
            </div>
        )}

        {activeSubTab === 'finished_goods' && (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                {!selectedJobId && <div className="bg-emerald-800 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-10"><PackageCheck size={120} /></div><div><h2 className="text-2xl font-black uppercase">Finished Goods</h2><p className="text-[10px] font-bold text-emerald-200 uppercase tracking-widest mt-1">Ready for Site Delivery</p></div></div>}
                {renderGrid(
                    (p) => p.status === 'Ready to Dispatch' && !p.dispatchId,
                    (p) => <div className="text-center text-[10px] font-bold text-emerald-600">Ready for Site</div>
                )}
            </div>
        )}

        {activeSubTab === 'faults' && (
            <div className="space-y-6 animate-in slide-in-from-bottom duration-300">
                <div className="bg-rose-900 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 p-8 opacity-10"><Ban size={120} /></div><div><h2 className="text-2xl font-black uppercase">Industrial Fault Ledger</h2><p className="text-[10px] font-bold text-rose-300 uppercase tracking-widest mt-1">Post-Delivery Feedback & Plant Breakage</p></div></div>
                <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                    <table className="w-full text-left sap-table">
                        <thead><tr><th>Piece ID</th><th>Status</th><th>Operation</th></tr></thead>
                        <tbody>
                            {(pieces || []).filter(p => p.status && ['Delivered', 'Tempered', 'QC-Passed'].includes(p.status)).map(p => (
                                <tr key={p.id}>
                                    <td className="font-black text-blue-600">{p.id}</td>
                                    <td><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{p.status}</span></td>
                                    <td><button onClick={() => setSelectedPieceForFault(p)} className="px-4 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-black uppercase hover:bg-rose-600 hover:text-white transition-all">Report Fault</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {activeSubTab === 'analytics' && (
            <AnalyticsView analyticsData={analyticsData} />
        )}
    </div>
  );
};

export default DispatchView;
