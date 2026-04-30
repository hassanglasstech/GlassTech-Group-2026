import React, { useState, useMemo } from 'react';
import CuttingDiagram, { buildPackingPiecesFromQuotation } from '@/modules/glassco/core/CuttingDiagram';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import JobRegistryView from '@/modules/production/components/JobRegistryView';
import ServiceFloorView from '@/modules/production/components/ServiceFloorView';
import SheetSelector from '@/modules/glassco/core/SheetSelector';
import CutterScanPanel from '@/modules/glassco/core/CutterScanPanel';                  // Phase-4 (4.1)
import { exportProductionPieces } from '@/modules/production/services/productionExporter';  // Phase-6 (6.7)
import { toast } from 'sonner';
import { ClipboardCheck, Scissors, Sparkles, Check, ChevronLeft, User, LayoutGrid, Printer, Sun, Moon, AlertTriangle, Layers, ScanLine, FileSpreadsheet } from 'lucide-react';
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

  const [activeSubTab, setActiveSubTab] = useState<'jobs' | 'queue' | 'scan' | 'services'>('jobs');
  const [printingJob, setPrintingJob] = useState<Quotation | null>(null);
  const [showCuttingDiagram, setShowCuttingDiagram] = useState(false);
  const [selectedSheetSize, setSelectedSheetSize] = useState<{ width: number; height: number }>({ width: 84, height: 144 });

  // Stage 2C: Shift planning suggestion
  const shiftSuggestion = useMemo(() => {
    const cutJobs = pieces.filter(p => p.status === 'Cut');
    const jobThicknesses: { jobId: string; thickness: string; mm: number }[] = [];
    cutJobs.forEach(p => {
      const job = jobOrders.find(j => j.orderNo === p.orderId || j.id === p.orderId);
      if (!job) return;
      const items = job.items || [];
      items.forEach((item: any) => {
        const thk = item.glassThickness || item.thickness || '';
        const mm = parseInt(thk) || 0;
        if (mm > 0) jobThicknesses.push({ jobId: p.orderId, thickness: thk, mm });
      });
    });
    const thick = jobThicknesses.filter(t => t.mm >= 8);
    const thin = jobThicknesses.filter(t => t.mm < 8);
    if (thick.length === 0 && thin.length === 0) return null;
    return { thickCount: thick.length, thinCount: thin.length };
  }, [pieces, jobOrders]);

  // Stage 2B: Jobs sorted by due date for batch cutting
  const dueDateSortedJobs = useMemo(() => {
    const cutJobIds = Array.from(new Set(pieces.filter(p => p.status === 'Cut').map(p => p.orderId)));
    return cutJobIds.map(id => {
      const job = jobOrders.find(j => j.orderNo === id || j.id === id);
      return { id, job, dueDate: job?.dueDate || '', projectName: job?.projectName || id };
    }).sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [pieces, jobOrders]);

  // Phase-6 (6.7) — export the visible cutting-queue pieces
  const handleExportPieces = () => {
    try {
      const cutPieces = pieces.filter(p => p.status === 'Cut');
      if (cutPieces.length === 0) { toast.error('No pieces in cutting queue to export.'); return; }
      exportProductionPieces(cutPieces, jobOrders, clients, 'cutting-queue');
      toast.success(`Exported ${cutPieces.length} pieces.`);
    } catch (e: any) {
      toast.error(e?.message || 'Export failed.');
    }
  };

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
                 <div className="ml-auto flex items-center space-x-4 text-right">
                    <div><p className="text-[10px] font-black text-slate-400 uppercase">Pending Qty</p><p className="text-lg font-black">{jobData.pendingQty} <span className="text-[10px] text-slate-400">Pcs</span></p></div>
                    <div><p className="text-[10px] font-black text-slate-400 uppercase">Volume</p><p className="text-lg font-black">{jobData.pendingSqFt} <span className="text-[10px] text-slate-400">Ft²</span></p></div>
                    <button
                      onClick={() => setShowCuttingDiagram(!showCuttingDiagram)}
                      className={`flex items-center gap-2 text-xs font-black uppercase px-4 py-2 rounded-xl border transition-colors ${showCuttingDiagram ? 'bg-blue-700 text-white border-blue-700' : 'border-blue-200 text-blue-600 hover:bg-blue-50'}`}>
                      ✂ {showCuttingDiagram ? 'Hide' : 'Cutting Plan'}
                    </button>
                 </div>
              </div>

              {/* Stage 3D: Buffer Cutting Alert */}
              {(() => {
                const job = jobOrders.find(j => j.orderNo === selectedJobId || j.id === selectedJobId);
                if (!job) return null;
                const allServices = new Set<string>();
                (job.items || []).forEach((item: any) => (item.selectedServices || []).forEach((s: string) => allServices.add(s)));
                const needsOutsourcing = allServices.has('Tempering') || allServices.has('Toughening') || allServices.has('Lamination') || allServices.has('Double Glazing') || allServices.has('DG');
                const totalAmount = (job.items || []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
                const isHighValue = totalAmount > 300000;
                if (!needsOutsourcing) return null;
                return (
                  <div className={`rounded-2xl p-4 flex items-center gap-3 ${isHighValue ? 'bg-amber-50 border-2 border-amber-300' : 'bg-blue-50 border border-blue-200'}`}>
                    <AlertTriangle size={20} className={isHighValue ? 'text-amber-600' : 'text-blue-500'}/>
                    <div>
                      <p className={`text-xs font-black uppercase ${isHighValue ? 'text-amber-700' : 'text-blue-700'}`}>
                        {isHighValue ? '⚠ BUFFER CUTTING REQUIRED' : 'Outsourcing Risk — Consider Buffer'}
                      </p>
                      <p className="text-[10px] font-bold text-slate-600 mt-0.5">
                        {isHighValue
                          ? `Order >${(totalAmount/100000).toFixed(0)} lac with ${Array.from(allServices).join(', ')}. Cut 10-15% extra pieces to cover vendor breakage (industry avg 1-3%).`
                          : `This order includes ${Array.from(allServices).join(', ')}. Buffer pieces recommended for orders >3 lac.`
                        }
                      </p>
                    </div>
                    {isHighValue && (
                      <div className="ml-auto bg-amber-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black whitespace-nowrap">
                        +10% BUFFER
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 2D Cutting Diagram with Sheet Selector */}
              {showCuttingDiagram && (() => {
                const job = jobOrders.find(j => j.orderNo === selectedJobId || j.id === selectedJobId);
                const cuttingPieces = job ? buildPackingPiecesFromQuotation(job.items || []) : [];
                const totalRequiredSqft = cuttingPieces.reduce((s, p) => s + (p.widthInch * p.heightInch * p.qty) / 144, 0);
                const thicknessFromJob = job?.items?.[0]?.glassThickness || job?.items?.[0]?.thickness || '';
                return cuttingPieces.length > 0 ? (
                  <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">2D Cutting Plan</p>
                      {job?.dueDate && (
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${new Date(job.dueDate) < new Date() ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          Due: {new Date(job.dueDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>
                    {/* Sheet Size Selector */}
                    <SheetSelector
                      company={job?.company || 'Glassco'}
                      selectedSheet={selectedSheetSize}
                      onSelect={(w, h) => setSelectedSheetSize({ width: w, height: h })}
                      requiredSqft={totalRequiredSqft}
                      filterThickness={thicknessFromJob}
                    />
                    <CuttingDiagram
                      pieces={cuttingPieces}
                      sheetWidthInch={selectedSheetSize.width}
                      sheetHeightInch={selectedSheetSize.height}
                      glassType={cuttingPieces[0]?.glassType}
                      jobOrderId={selectedJobId}
                    />
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-400 font-bold">
                    No piece dimensions found — add width/height to quotation items
                  </div>
                );
              })()}

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

     // Sort by due date (dueDateSortedJobs already sorted)
     const sortedIds = dueDateSortedJobs.map(j => j.id);

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
                       {(() => {
                         const job = jobOrders.find(j => j?.orderNo === id || j?.id === id);
                         if (!job?.dueDate) return null;
                         const isOverdue = new Date(job.dueDate) < new Date();
                         return (
                           <span className={`mt-1.5 inline-block text-[9px] font-black px-2 py-0.5 rounded-full relative z-10 ${isOverdue ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                             {isOverdue ? '⚠ OVERDUE' : 'Due'}: {new Date(job.dueDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}
                           </span>
                         );
                       })()}
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

        <div className="flex justify-between items-center">
            <div className="flex space-x-1 bg-white p-1 rounded-2xl border w-fit shadow-sm">
                <button onClick={() => setActiveSubTab('jobs')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'jobs' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><ClipboardCheck size={16} className="inline mr-2"/> Registry</button>
                <button onClick={() => setActiveSubTab('queue')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'queue' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Scissors size={16} className="inline mr-2"/> Cutting</button>
                {/* Phase-4 (4.1) — Cutter scan station: scan sheet tag → log session → auto NCR on missed/late */}
                <button onClick={() => setActiveSubTab('scan')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'scan' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><ScanLine size={16} className="inline mr-2"/> Scan Station</button>
                <button onClick={() => setActiveSubTab('services')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeSubTab === 'services' ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Sparkles size={16} className="inline mr-2"/> Services</button>
            </div>
            {/* Phase-6 (6.7) — Excel export for cutting queue */}
            {activeSubTab === 'queue' && (
                <button onClick={handleExportPieces} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-700 flex items-center gap-2 shadow-sm">
                    <FileSpreadsheet size={14}/> Export Cutting Queue
                </button>
            )}
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
                    <>
                    <div className="bg-blue-600 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10"><Scissors size={120} /></div>
                        <div>
                            
                            <p className="text-[10px] font-bold text-blue-100 uppercase tracking-widest mt-1">
                              {dueDateSortedJobs.length} jobs — sorted by due date
                            </p>
                        </div>
                        {dueDateSortedJobs.length > 0 && dueDateSortedJobs[0].dueDate && (
                          <div className="text-right z-10">
                            <p className="text-[9px] font-bold text-blue-200 uppercase">Most Urgent</p>
                            <p className="text-sm font-black">{dueDateSortedJobs[0].projectName}</p>
                            <p className="text-[10px] font-bold text-yellow-300">
                              Due: {new Date(dueDateSortedJobs[0].dueDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}
                            </p>
                          </div>
                        )}
                    </div>
                    {/* Stage 2C: Shift Planning Suggestion */}
                    {shiftSuggestion && (
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="p-2 bg-amber-100 rounded-xl"><Sun size={16} className="text-amber-600"/></div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase">Morning Shift</p>
                            <p className="text-xs font-bold text-slate-700">Thick glass (8mm+): {shiftSuggestion.thickCount} items</p>
                            <p className="text-[9px] text-slate-400">Heavy glass first — cutter fresh, fewer breakage</p>
                          </div>
                        </div>
                        <div className="w-px h-10 bg-slate-200"/>
                        <div className="flex items-center gap-3 flex-1">
                          <div className="p-2 bg-indigo-100 rounded-xl"><Moon size={16} className="text-indigo-600"/></div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase">Afternoon Shift</p>
                            <p className="text-xs font-bold text-slate-700">Thin glass ({'<'}8mm): {shiftSuggestion.thinCount} items</p>
                            <p className="text-[9px] text-slate-400">Lighter glass — less fatigue risk</p>
                          </div>
                        </div>
                      </div>
                    )}
                    </>
                )}
                {renderJobGrid()}
            </div>
        )}

        {/* Phase-4 (4.1) — Cutter scan workstation (live sheet scan + NCR auto-gen) */}
        {activeSubTab === 'scan' && (
            <div className="animate-in fade-in slide-in-from-right duration-300">
                <CutterScanPanel />
            </div>
        )}

        {activeSubTab === 'services' && (
            <ServiceFloorView pieces={pieces} onUpdateStatus={useProductionContext().handleUpdatePieceStatus} />
        )}
    </div>
  );
};

export default FabricationView;
