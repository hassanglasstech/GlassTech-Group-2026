import React, { useState } from 'react';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import JobRegistryView from '@/modules/production/components/JobRegistryView';
import ServiceFloorView from '@/modules/production/components/ServiceFloorView';
import { ClipboardCheck, Scissors, Sparkles, Check, ChevronLeft, User, LayoutGrid, Printer } from 'lucide-react';
import JobCard from '@/modules/production/components/sub/JobCard';
import { GlasscoPrintTemplate } from '@/modules/glassco/core/GlasscoPrintTemplate';
import { Quotation } from '@/modules/shared/types';

const FabricationView: React.FC = () => {
  const { 
    pieces, jobOrders, dispatches, clients, spots,
    selectedClientFilter, setSelectedClientFilter, filterDate, setFilterDate,
    selectedJobId, setSelectedJobId, getJobDetails,
    handleCuttingOutput, openBinModal
  } = useProductionContext();

  const [activeSubTab, setActiveSubTab] = useState<'jobs' | 'queue' | 'services'>('jobs');
  const [printingJob, setPrintingJob] = useState<Quotation | null>(null);

  const handlePrintJobCard = (e: React.MouseEvent, jobId: string) => {
      e.stopPropagation();
      const job = jobOrders.find(j => j.orderNo === jobId);
      if (job) {
          setPrintingJob(job);
          setTimeout(() => {
              window.print();
              setPrintingJob(null);
          }, 500);
      }
  };

  const renderJobGrid = () => {
     if (selectedJobId) {
        const jobData = getJobDetails(selectedJobId, (p) => p.status === 'Cut');
        const relevantPieces = pieces.filter(p => p.orderId === selectedJobId && p.status === 'Cut');
        
        if (relevantPieces.length === 0) {
            setSelectedJobId(null);
            return null;
        }

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
                    <JobCard 
                      key={p.id}
                      piece={p}
                      jobOrder={jobOrders.find(j => j.orderNo === p.orderId)}
                      spot={spots.find(s => s.id === p.spotId)}
                      onBinClick={(e) => { e.stopPropagation(); openBinModal(p); }}
                      actionRenderer={() => (
                        <button onClick={() => handleCuttingOutput(p)} className="w-full py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg text-[10px] font-black uppercase flex items-center justify-center space-x-2 transition-all">
                           <Check size={12}/> <span>Process Output</span>
                        </button>
                      )}
                    />
                 ))}
              </div>
           </div>
        );
     }

     // Group View
     const uniqueIds = Array.from(new Set<string>(pieces.filter(p => p.status === 'Cut').map(p => p.orderId)));
     if (uniqueIds.length === 0) return <div className="py-20 text-center text-slate-300 font-black uppercase text-xs italic">No jobs pending in cutting.</div>;

     // Sort latest first — safe null check
     const sortedIds = [...uniqueIds].sort((a, b) => {
        const jobA = jobOrders.find(j => j?.orderNo === a);
        const jobB = jobOrders.find(j => j?.orderNo === b);
        const dateA = jobA?.date ? new Date(jobA.date).getTime() : 0;
        const dateB = jobB?.date ? new Date(jobB.date).getTime() : 0;
        return dateB - dateA;
     });

     return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in zoom-in duration-300">
           {sortedIds.map(id => {
              const data = getJobDetails(id, (p) => p.status === 'Cut');
              // Extract numeric part for display, excluding revisions
              const numericIdDisplay = id.split('-').filter(part => !part.startsWith('R')).pop() || id;

              return (
                 <div key={id} onClick={() => setSelectedJobId(id)} className={`bg-white p-6 rounded-[2rem] border-2 shadow-sm transition-all cursor-pointer group flex flex-col justify-between h-full relative overflow-hidden border-slate-200 hover:shadow-xl hover:border-blue-400`}>
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform"><LayoutGrid size={100}/></div>
                    <div>
                       <div className="flex justify-between items-start mb-4 relative z-10">
                          <div className={`p-3 rounded-2xl transition-colors bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white`}>
                             <User size={24}/>
                          </div>
                          <div className="flex items-center space-x-2">
                              <button 
                                onClick={(e) => handlePrintJobCard(e, id)}
                                className="bg-orange-50 text-orange-600 p-2 rounded-xl hover:bg-orange-500 hover:text-white transition-all shadow-sm z-20 border border-orange-100" 
                                title="Print Job Card"
                              >
                                <Printer size={16} strokeWidth={2.5} />
                              </button>
                              <span className={`bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase`}>
                                 {`${data.totalProgress}% Done`}
                              </span>
                          </div>
                       </div>
                       <h4 className="text-lg font-black text-slate-900 uppercase leading-tight mb-1 truncate relative z-10">{data.projectName || 'Standard Order'}</h4>
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate relative z-10">{data.clientName}</p>
                       <p className="text-[9px] font-bold text-blue-300 uppercase tracking-widest mt-1 relative z-10">{numericIdDisplay}</p>
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
        {printingJob && (
            <GlasscoPrintTemplate 
                printingQuote={printingJob} 
                clients={clients} 
                printMode="JobCard"
            />
        )}

        <div className="flex space-x-1 bg-white p-1 rounded-2xl border w-fit shadow-sm">
            <button onClick={() => setActiveSubTab('jobs')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'jobs' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><ClipboardCheck size={16} className="inline mr-2"/> Registry</button>
            <button onClick={() => setActiveSubTab('queue')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'queue' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Scissors size={16} className="inline mr-2"/> Cutting</button>
            <button onClick={() => setActiveSubTab('services')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'services' ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Sparkles size={16} className="inline mr-2"/> Services</button>
        </div>

        {activeSubTab === 'jobs' && (
            <JobRegistryView 
                jobOrders={jobOrders} pieces={pieces} dispatches={dispatches} clients={clients}
                selectedClientFilter={selectedClientFilter} setSelectedClientFilter={setSelectedClientFilter}
                filterDate={filterDate} setFilterDate={setFilterDate}
            />
        )}

        {activeSubTab === 'queue' && (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                {!selectedJobId && (
                    <div className="bg-blue-600 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10"><Scissors size={120} /></div>
                        <div>
                            <h2 className="text-2xl font-black uppercase">Cutting Floor</h2>
                            <p className="text-[10px] font-bold text-blue-100 uppercase tracking-widest mt-1">Select Job to Process</p>
                        </div>
                    </div>
                )}
                {renderJobGrid()}
            </div>
        )}

        {activeSubTab === 'services' && (
            <ServiceFloorView pieces={pieces} onUpdateStatus={useProductionContext().handleUpdatePieceStatus} />
        )}
    </div>
  );
};

export default FabricationView;
