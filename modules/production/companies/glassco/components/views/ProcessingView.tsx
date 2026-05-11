import { toast } from 'sonner';
import React, { useState, useMemo } from 'react';
import QCCheckPanel from '@/modules/glassco/core/QCCheckPanel';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import InwardAuditView from '@/modules/production/components/InwardAuditView';
import { Flame, ArrowDownLeft, Hourglass, Layers, ChevronLeft, User, LayoutGrid, Clock, CheckCircle2, ArrowLeft, ShieldCheck, Truck, AlertTriangle } from 'lucide-react';
import JobCard from '@/modules/production/components/sub/JobCard';
import VirtualPieceGrid from '@/modules/production/components/sub/VirtualPieceGrid';   // Sprint 9
import { isInternal, getGlassSize } from '@/modules/production/components/ProductionUtils';
import { useNavigate } from 'react-router-dom';
import { FinanceService } from '@/modules/finance/services/financeService';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';

const ProcessingView: React.FC = () => {
  const { 
    pieces, jobOrders, dispatches, clients, spots, company, handleUpdatePieceStatus,
    activeDispatchIdForLoading, setActiveDispatchIdForLoading,
    activeInwardDispatchId, setActiveInwardDispatchId,
    inwardAuditablePieces, selectedPiecesForDelivery,
    togglePieceForDelivery, setIsDirectDeliveryModalOpen, handleInwardPiece, openBinModal,
    selectedJobId, setSelectedJobId, getJobDetails, togglePieceToDispatch, loadAllPiecesToDispatch
  } = useProductionContext();

  const [activeSubTab, setActiveSubTab] = useState<'qc' | 'tempering' | 'inward' | 'wip' | 'lamination' | 'double_glaze'>('qc');
  const [expandedLoadingJob, setExpandedLoadingJob] = useState<string | null>(null);
  const navigate = useNavigate();

  // ── Vehicle Payload Guard state ─────────────────────────────────
  const [dispatchVehicles, setDispatchVehicles] = useState<{ id: string; vehicle_name: string; plate_number: string; max_payload_kg: number; vehicle_type: string }[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');

  React.useEffect(() => {
    ProductionService.getDispatchVehicles(company).then(setDispatchVehicles);
  }, [company]);

  // Live payload calculation for loaded pieces
  const payloadInfo = React.useMemo(() => {
    if (!activeDispatchIdForLoading) return { totalKg: 0, maxKg: 0, pct: 0, overloaded: false };
    const loadedPcs = pieces.filter(p => p.dispatchId === activeDispatchIdForLoading);
    const store = InventoryService.getStore();
    let totalKg = 0;
    loadedPcs.forEach((p: any) => {
      const storeItem = store.find((si: any) => si.company === company && si.name?.includes(getGlassSize(p.specs || '')));
      const sqFt = p.sqft || 0;
      totalKg += sqFt * (storeItem?.perSqftWeightKg || 0.14);
    });
    totalKg = Math.round(totalKg * 10) / 10;
    const vehicle = dispatchVehicles.find(v => v.id === selectedVehicleId);
    const maxKg = vehicle?.max_payload_kg || 0;
    const pct = maxKg > 0 ? Math.round((totalKg / maxKg) * 100) : 0;
    return { totalKg, maxKg, pct, overloaded: maxKg > 0 && totalKg > maxKg };
  }, [activeDispatchIdForLoading, pieces, selectedVehicleId, dispatchVehicles, company]);

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

  // ── Sprint 9 perf — pre-build lookup maps once so the per-piece render
  // doesn't repeatedly do array.find() (was O(n*m) for n pieces × m jobs/spots).
  const jobOrderByOrderNo = useMemo(() => {
    const m = new Map<string, any>();
    jobOrders.forEach(j => {
      const k = (j as any).orderNo || j.id;
      if (k) m.set(k, j);
    });
    return m;
  }, [jobOrders]);
  const spotById = useMemo(() => {
    const m = new Map<string, any>();
    spots.forEach(s => { if (s.id) m.set(s.id, s); });
    return m;
  }, [spots]);

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
              <div className="bg-white p-4 rounded-2xl border shadow-sm">
                 <div className="flex items-center gap-3 mb-3">
                    <button onClick={() => setSelectedJobId(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center"><ChevronLeft size={22}/></button>
                    <div className="min-w-0 flex-1">
                       <h3 className="text-base sm:text-xl font-black text-slate-800 uppercase truncate">{jobData.projectName || 'Standard Order'}</h3>
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">{jobData.clientName} | {selectedJobId}</p>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                    <div className="bg-slate-50 rounded-xl p-3 text-center"><p className="text-[9px] font-black text-slate-400 uppercase mb-1">Pending Qty</p><p className="text-xl font-black text-slate-800">{jobData.pendingQty} <span className="text-[9px] text-slate-400">Pcs</span></p></div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center"><p className="text-[9px] font-black text-slate-400 uppercase mb-1">Volume</p><p className="text-xl font-black text-slate-800">{jobData.pendingSqFt} <span className="text-[9px] text-slate-400">Ft²</span></p></div>
                 </div>
              </div>
              {/* Sprint 9 — VirtualPieceGrid; falls through to plain grid for ≤100 items */}
              <VirtualPieceGrid
                items={relevantPieces}
                getKey={(p) => p.id}
                rowHeight={236}
                threshold={100}
                cellRenderer={(p) => {
                  const isWaitingAtTempering = p.status === 'Dispatched' && (activeSubTab === 'lamination' || activeSubTab === 'double_glaze' || activeSubTab === 'wip');
                  // Sprint 9 perf — use pre-built lookup maps instead of array.find()
                  const jobOrder = jobOrderByOrderNo.get(p.orderId);
                  const spot = p.spotId ? spotById.get(p.spotId) : undefined;
                  return (
                    <div className="relative">
                      {isWaitingAtTempering && (
                        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] z-10 rounded-xl flex flex-col items-center justify-center text-white p-4 text-center">
                          <Clock size={20} className="mb-2 animate-pulse text-amber-400"/>
                          <p className="text-[10px] font-black uppercase tracking-widest">At External Plant</p>
                        </div>
                      )}
                      <JobCard
                        piece={p}
                        jobOrder={jobOrder}
                        spot={spot}
                        onBinClick={(e) => { e.stopPropagation(); openBinModal(p); }}
                        actionRenderer={() => isWaitingAtTempering ? <div className="h-10"></div> : renderAction(p)}
                      />
                    </div>
                  );
                }}
              />
           </div>
        );
    }

    const uniqueIds = Array.from(new Set<string>(pieces.filter(filterFn).map(p => p.orderId)));
    if (uniqueIds.length === 0) return <div className="py-20 text-center text-slate-300 font-black uppercase text-xs italic">No jobs pending in this queue.</div>;

    // Sort latest first — safe null check
    const sortedIds = [...uniqueIds].sort((a, b) => {
        const jobA = jobOrders.find(j => j?.orderNo === a);
        const jobB = jobOrders.find(j => j?.orderNo === b);
        const dateA = jobA?.date ? new Date(jobA.date).getTime() : 0;
        const dateB = jobB?.date ? new Date(jobB.date).getTime() : 0;
        return dateB - dateA;
    });

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-in zoom-in duration-300">
           {sortedIds.map(id => {
              const data = getJobDetails(id, filterFn);
              return (
                 <div key={id} onClick={() => setSelectedJobId(id)} className={`bg-white p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border-2 shadow-sm transition-all cursor-pointer group flex flex-col justify-between h-full relative overflow-hidden border-slate-200 hover:shadow-xl hover:border-blue-400 active:scale-[0.98]`}>
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
        {/* Mobile-scrollable tabs */}
        <div className="flex space-x-1 bg-white p-1 rounded-2xl border shadow-sm overflow-x-auto scrollbar-none -mx-1 px-1">
            <button onClick={() => setActiveSubTab('qc')} className={`px-3 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap flex items-center gap-1.5 min-h-[40px] ${activeSubTab === 'qc' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><ShieldCheck size={14}/><span>QC Check</span></button>
            <button onClick={() => setActiveSubTab('tempering')} className={`px-3 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap flex items-center gap-1.5 min-h-[40px] ${activeSubTab === 'tempering' ? 'bg-rose-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Flame size={14}/><span className="hidden sm:inline">Loading</span><span className="sm:hidden">Load</span></button>
            <button onClick={() => setActiveSubTab('inward')} className={`px-3 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap flex items-center gap-1.5 min-h-[40px] ${activeSubTab === 'inward' ? 'bg-blue-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><ArrowDownLeft size={14}/><span className="hidden sm:inline">Inward Audit</span><span className="sm:hidden">Inward</span></button>
            <button onClick={() => setActiveSubTab('wip')} className={`px-3 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap flex items-center gap-1.5 min-h-[40px] ${activeSubTab === 'wip' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Hourglass size={14}/>WIP</button>
            <button onClick={() => setActiveSubTab('lamination')} className={`px-3 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap flex items-center gap-1.5 min-h-[40px] ${activeSubTab === 'lamination' ? 'bg-orange-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Layers size={14}/><span className="hidden sm:inline">Lamination</span><span className="sm:hidden">Lam</span></button>
            <button onClick={() => setActiveSubTab('double_glaze')} className={`px-3 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap flex items-center gap-1.5 min-h-[40px] ${activeSubTab === 'double_glaze' ? 'bg-cyan-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Layers size={14}/>D/G</button>
        </div>

        {activeSubTab === 'qc' && (
            <div className="animate-in fade-in duration-300">
              <QCCheckPanel
                pieces={pieces}
                jobOrders={jobOrders}
                /* QCCheckPanel prop is looser (id, status: string, extra?: any) => void;
                   context provides strict (id, status: PieceStatus, ...) => Promise<void>.
                   Cast keeps runtime identical, narrows TS noise. */
                handleUpdatePieceStatus={handleUpdatePieceStatus as any}
              />
            </div>
        )}

        {activeSubTab === 'tempering' && (
            <div className="space-y-4 animate-in fade-in duration-300">
               {/* Header */}
               <div className="bg-rose-600 text-white p-4 sm:p-6 rounded-[2rem] shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10 hidden sm:block"><Flame size={120} /></div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative z-10">
                  
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10">
                    <div className="space-y-1"><label className="text-[9px] font-black uppercase text-rose-200">Active Trip</label><select value={activeDispatchIdForLoading} onChange={e => setActiveDispatchIdForLoading(e.target.value)} className="bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm font-black outline-none w-full sm:w-56 text-white min-h-[44px]"><option value="" className="text-slate-900">-- Select --</option>{dispatches.filter(d => d.status === 'Ready to Dispatch' || d.status === 'Scheduled').map(d => (<option key={d.id} value={d.id} className="text-slate-900">{d.serviceType === 'Site Delivery' ? '📦 ' : '🔥 '}{d.plantName} ({d.vehicleNo})</option>))}</select></div>
                    {activeDispatchIdForLoading && (() => {
                      const loaded = pieces.filter(p => p.dispatchId === activeDispatchIdForLoading).length;
                      const selectedTrip = dispatches.find(d => d.id === activeDispatchIdForLoading);
                      return loaded > 0 ? (
                        <button onClick={() => {
                          // ── Phase 8: Defective piece check ──────────────────
                          const loadedPiecesList = pieces.filter(p => p.dispatchId === activeDispatchIdForLoading);
                          const tripVendor = SalesService.getVendors().find((v: any) =>
                            v.name?.toUpperCase() === selectedTrip?.plantName?.toUpperCase()
                          );
                          const vendorAcceptsDefective = (tripVendor as any)?.acceptsDefectivePieces !== false;

                          if (!vendorAcceptsDefective) {
                            // Check if any loaded piece is from a defective sheet
                            const allSheetEntries = InventoryService.getGRNSheetEntries();
                            const defectivePieceTags = loadedPiecesList.filter(p => {
                              // Check if piece's tag is marked defective
                              const tagId = (p as any).sheetTagId;
                              if (!tagId) return false;
                              const entry = allSheetEntries.find(e => e.tagId === tagId);
                              return entry && entry.status !== 'OK';
                            });

                            if (defectivePieceTags.length > 0) {
                              toast.error(
                                `BLOCKED: ${selectedTrip?.plantName} does not accept defective pieces. ${defectivePieceTags.length} defective piece(s) in this trip. Remove them first.`,
                                { duration: 8000 }
                              );
                              return; // BLOCK trip close
                            }
                          }

                          if (!confirm(`Finalize loading? ${loaded} pieces will be dispatched.`)) return;
                          const allDisp = ProductionService.getTemperingDispatches();
                          const allPcs = ProductionService.getProductionPieces();
                          const loadedPcs = allPcs.filter(p => p.dispatchId === activeDispatchIdForLoading);
                          const isSite = selectedTrip?.serviceType === 'Site Delivery';

                          // ── Calculate totalSqFt and thickness-wise cost ──
                          let totalSqFt = 0;
                          let totalCost = 0;
                          const vendor = selectedTrip ? SalesService.getVendors().find(v => v.name.toUpperCase() === selectedTrip.plantName.toUpperCase()) : null;
                          const vendorRates = vendor?.rates?.sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || '')) || [];

                          loadedPcs.forEach(p => {
                            const sqFt = p.sqft || 0;
                            totalSqFt += sqFt;
                            // Match piece thickness to vendor rate
                            const thickness = getGlassSize(p.specs || ''); // e.g. "5mm"
                            const matchedRate = vendorRates.find(r => r.thickness === thickness) || vendorRates.find(r => r.thickness === 'All') || vendorRates[0];
                            const rate = matchedRate?.rate || selectedTrip?.chargesPerSqFt || 0;
                            totalCost += sqFt * rate;
                          });
                          totalCost = Math.round(totalCost);

                          // ── Phase 8: Fare distribution per piece (weight-based) ──
                          const farePerKg = totalSqFt > 0
                            ? totalCost / loadedPcs.reduce((s: number, p: any) => {
                                const storeItem = InventoryService.getStore().find((si: any) =>
                                  si.company === company && si.name?.includes(getGlassSize(p.specs || ''))
                                );
                                const sqFt = p.sqft || 0;
                                return s + sqFt * (storeItem?.perSqftWeightKg || 0.14);
                              }, 0)
                            : 0;
                          // Store fare distribution on each piece for job costing
                          loadedPcs.forEach((p: any) => {
                            const storeItem = InventoryService.getStore().find((si: any) =>
                              si.company === company && si.name?.includes(getGlassSize(p.specs || ''))
                            );
                            const pieceWeightKg = (p.sqft || 0) * (storeItem?.perSqftWeightKg || 0.14);
                            const allocatedFare = Number((pieceWeightKg * farePerKg).toFixed(2));
                            // Save on piece for job cost reporting (stored in specs extension)
                            const existingSpecs = (() => { try { return JSON.parse(p.specs || '{}'); } catch { return {}; } })();
                            handleUpdatePieceStatus(p.id, p.status, {
                              specs: JSON.stringify({ ...existingSpecs, allocatedFarePKR: allocatedFare }),
                            });
                          });

                          // ── Update dispatch with calculated totals ──
                          const updDisp = allDisp.map(d => d.id === activeDispatchIdForLoading
                            ? { ...d, status: 'Dispatched' as const, totalSqFt, totalCharges: totalCost }
                            : d);
                          ProductionService.saveTemperingDispatches(updDisp);

                          // ── Update piece statuses ──
                          const updPcs = allPcs.map(p => p.dispatchId === activeDispatchIdForLoading
                            ? { ...p, status: (isSite ? 'Delivered' : 'Dispatched') as any, lastUpdated: new Date().toISOString() }
                            : p);
                          ProductionService.saveProductionPieces(updPcs);

                          // ── COGS GL entry (Parked via recordTransaction) ──
                          if (selectedTrip && !isSite && selectedTrip.serviceType !== 'Supply' && totalCost > 0) {
                            const accs = FinanceService.getAccounts().filter(a => a.company === company);
                            const cogsAcc = accs.find(a => a.name.toUpperCase().includes('COGS') || a.name.toUpperCase().includes('DIRECT COST') || a.code.startsWith('51')) || accs.find(a => a.type === 'Expense');
                            const vendorPayable = accs.find(a => a.name.toUpperCase().includes('PAYABLE') || a.code.startsWith('211')) || accs.find(a => a.type === 'Liability');
                            if (cogsAcc && vendorPayable) {
                              const txId = `GL-SO-${selectedTrip.id}`;
                              FinanceService.recordTransaction({
                                id: txId, company: company as any, docType: 'KR' as any,
                                docDate: new Date().toISOString().split('T')[0],
                                date: new Date().toISOString().split('T')[0],
                                description: `SERVICE ORDER: ${selectedTrip.serviceType} — ${selectedTrip.plantName} — ${loadedPcs.length} pcs / ${totalSqFt.toFixed(1)} sqft — PKR ${totalCost.toLocaleString()}`,
                                referenceId: selectedTrip.id, status: 'Parked',
                                details: [
                                  { accountId: cogsAcc.id, debit: totalCost, credit: 0, text: `${selectedTrip.serviceType}: ${selectedTrip.plantName} (${loadedPcs.length} pcs)` },
                                  { accountId: vendorPayable.id, debit: 0, credit: totalCost, text: `Payable: ${selectedTrip.plantName}` }
                                ]
                              });

                              // ── Cash Journal entry ──
                              const cashEntries = FinanceService.getPettyCashEntries();
                              const lastBal = cashEntries.filter((e: any) => e.company === company).sort((a: any, b: any) => b.id.localeCompare(a.id))[0]?.balance || 0;
                              FinanceService.savePettyCashEntries([...cashEntries, {
                                id: `CJ-SO-${selectedTrip.id}`, company, date: new Date().toISOString().split('T')[0],
                                description: `Service Order: ${selectedTrip.serviceType} — ${selectedTrip.plantName} — ${loadedPcs.length} pcs`,
                                type: 'Payment', amount: totalCost, balance: lastBal - totalCost,
                                recordedBy: 'System', status: 'Parked', glAccountId: cogsAcc.id,
                                businessTransaction: 'Service Order', referenceDoc: txId
                              } as any]);

                              // ── Event Registry ──
                              const evts = FinanceService.getFinancialEvents();
                              FinanceService.saveFinancialEvents([...evts, {
                                id: `EVT-SO-${selectedTrip.id}`, company, date: new Date().toISOString().split('T')[0],
                                sourceModule: 'Sales' as const,
                                description: `Service Order dispatched: ${selectedTrip.serviceType} — ${selectedTrip.plantName} — PKR ${totalCost.toLocaleString()}`,
                                amount: totalCost, referenceId: selectedTrip.id, status: 'Pending' as const
                              }]);
                            }
                          }
                          setActiveDispatchIdForLoading(''); setExpandedLoadingJob(null);
                          navigate('/logistics');
                        }} className="bg-white text-rose-600 px-6 py-3 rounded-xl font-black uppercase text-xs shadow-lg flex items-center space-x-2 hover:bg-rose-50">
                          <CheckCircle2 size={16}/><span>Finalize Loading ({loaded} pcs)</span>
                        </button>
                      ) : null;
                    })()}
                  </div></div>
               </div>

               {/* Summary bar + Vehicle Payload Guard */}
               {activeDispatchIdForLoading && (() => {
                 const st = dispatches.find(d => d.id === activeDispatchIdForLoading);
                 const lp = pieces.filter(p => p.dispatchId === activeDispatchIdForLoading);
                 if (!st) return null;
                 return (
                   <div className="space-y-2">
                     <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                       <div className="flex items-center space-x-3">
                         <div className="bg-rose-100 text-rose-600 p-2 rounded-lg"><Flame size={16}/></div>
                         <div>
                           <p className="text-xs font-black text-slate-800 uppercase">Outward Subcontracting ({st.serviceType}): {st.plantName}</p>
                           <p className="text-[10px] text-slate-400 font-bold">{st.id} | {st.vehicleNo}</p>
                         </div>
                       </div>
                       <div className="flex items-center space-x-4 text-right">
                         <div><p className="text-[9px] font-black text-slate-400 uppercase">Loaded</p><p className="text-sm font-black text-rose-600">{lp.length} Pcs</p></div>
                         <div><p className="text-[9px] font-black text-slate-400 uppercase">Area</p><p className="text-sm font-black text-slate-700">{lp.reduce((s, p) => s + (p.sqft || 0), 0).toFixed(1)} Ft²</p></div>
                       </div>
                     </div>

                     {/* ── Vehicle Payload Guard ── */}
                     <div className="bg-white border border-slate-200 rounded-lg p-3">
                       <div className="flex items-center gap-3 flex-wrap">
                         <div className="flex items-center gap-1.5">
                           <Truck size={14} className="text-slate-500" />
                           <span className="text-[10px] font-black text-slate-500 uppercase">Dispatch Vehicle</span>
                         </div>
                         <select
                           value={selectedVehicleId}
                           onChange={e => setSelectedVehicleId(e.target.value)}
                           className="text-xs font-bold border border-slate-200 rounded px-2 py-1.5 bg-white min-w-[200px]"
                         >
                           <option value="">-- Select Vehicle --</option>
                           {dispatchVehicles.map(v => (
                             <option key={v.id} value={v.id}>{v.vehicle_name} ({v.plate_number}) — {v.max_payload_kg} kg</option>
                           ))}
                         </select>
                         {selectedVehicleId && payloadInfo.maxKg > 0 && (
                           <div className="flex-1 flex items-center gap-3 min-w-[200px]">
                             <div className="flex-1">
                               <div className="flex justify-between text-[9px] font-black mb-0.5">
                                 <span className={payloadInfo.overloaded ? 'text-rose-600' : 'text-slate-500'}>
                                   Payload: {payloadInfo.totalKg} / {payloadInfo.maxKg} kg
                                 </span>
                                 <span className={payloadInfo.overloaded ? 'text-rose-600' : payloadInfo.pct > 80 ? 'text-amber-600' : 'text-emerald-600'}>
                                   {payloadInfo.pct}%
                                 </span>
                               </div>
                               <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                 <div
                                   className={`h-full rounded-full transition-all ${
                                     payloadInfo.overloaded ? 'bg-rose-500' : payloadInfo.pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                                   }`}
                                   style={{ width: `${Math.min(payloadInfo.pct, 100)}%` }}
                                 />
                               </div>
                             </div>
                             {payloadInfo.overloaded && (
                               <div className="flex items-center gap-1 text-[10px] font-black text-rose-600 bg-rose-50 border border-rose-200 rounded px-2 py-1 whitespace-nowrap">
                                 <AlertTriangle size={10} /> OVERLOADED — Remove pieces!
                               </div>
                             )}
                           </div>
                         )}
                       </div>
                     </div>
                   </div>
                 );
               })()}

               {/* Job list — always show eligible pieces regardless of trip selection */}
               {(() => {
                 const selectedTrip = activeDispatchIdForLoading ? dispatches.find(d => d.id === activeDispatchIdForLoading) : null;
                 
                 // If trip selected: show eligible for that trip. Otherwise: show all QC-Passed (ready for tempering)
                 const getEligible = (p: any) => {
                   if (selectedTrip) {
                     if (p.dispatchId === activeDispatchIdForLoading) return true;
                     const origin = selectedTrip.originLocation || 'Factory';
                     if (origin === 'Factory') {
                       if (selectedTrip.serviceType === 'Site Delivery') return p.status === 'Ready to Dispatch' && !p.dispatchId;
                       if (selectedTrip.serviceType === 'Lamination' || selectedTrip.serviceType === 'Double Glazing') {
                         const order = jobOrders.find(j => j.orderNo === p.orderId); const item = order?.items[p.itemIndex]; if (!item) return false;
                         const svcs = item.selectedServices || []; const gt = item.glassType || 'Clear';
                         const isLam = selectedTrip.serviceType === 'Lamination';
                         const needs = isLam ? (svcs.includes('Lamination') || svcs.includes('Laminated') || gt === 'Laminated') : (svcs.includes('Double Glaze') || svcs.includes('Double Glazed') || svcs.includes('D/G'));
                         if (!needs) return false;
                         const isTmp = gt === 'Tempered' || svcs.includes('T/G') || svcs.includes('Tempered');
                         return isTmp ? (p.status === 'Tempered' && !p.dispatchId) : ((p.status === 'QC-Passed' || p.status === 'Ready to Dispatch') && !p.dispatchId);
                       }
                       if (selectedTrip.serviceType === 'Tempering') return p.status === 'QC-Passed' && !p.dispatchId;
                       return false;
                     } else { if (p.status !== 'Dispatched') return false; const lt = dispatches.find(d => d.id === p.dispatchId); return lt ? lt.plantName === origin : false; }
                   }
                   // No trip selected — show all QC-Passed ready for processing
                   return (p.status === 'QC-Passed' || p.status === 'Ready to Dispatch') && !p.dispatchId;
                 };

                 const eligiblePieces = pieces.filter(getEligible);
                 const uniqueOrderIds = Array.from(new Set(eligiblePieces.map(p => p.orderId)));
                 if (uniqueOrderIds.length === 0) return <div className="py-12 text-center text-slate-300 font-bold uppercase text-xs italic">{selectedTrip ? 'No eligible orders for this trip' : 'No pieces ready for processing'}</div>;

                 return (
                   <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                     <div className="overflow-x-auto">
                     <table className="w-full text-left min-w-[400px]"><thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest"><tr><th className="px-3 sm:px-5 py-3">Order</th><th className="px-3 sm:px-5 py-3">Client / Project</th><th className="px-3 sm:px-5 py-3 text-center">Pcs</th><th className="px-3 sm:px-5 py-3 text-center">{selectedTrip ? 'Loaded' : 'Status'}</th>{selectedTrip && <th className="px-3 sm:px-5 py-3 text-right">Action</th>}</tr></thead>
                     <tbody>
                       {uniqueOrderIds.map(orderId => {
                         const order = jobOrders.find(j => j.orderNo === orderId);
                         const client = order ? clients.find(c => c.id === order.clientId) : null;
                         const orderPieces = eligiblePieces.filter(p => p.orderId === orderId);
                         const loadedCount = selectedTrip ? orderPieces.filter(p => p.dispatchId === activeDispatchIdForLoading).length : 0;
                         const isExpanded = expandedLoadingJob === orderId;
                         return (
                           <React.Fragment key={orderId}>
                             <tr className={`hover:bg-slate-50 cursor-pointer transition-colors ${isExpanded ? 'bg-rose-50' : ''}`} onClick={() => setExpandedLoadingJob(isExpanded ? null : orderId)}>
                               <td className="px-3 sm:px-5 py-3 font-black text-blue-600 text-sm">{orderId}</td>
                               <td className="px-3 sm:px-5 py-3"><p className="text-xs font-bold uppercase text-slate-800">{order?.projectName || 'Order'}</p><p className="text-[10px] text-slate-400">{client?.name || ''}</p></td>
                               <td className="px-5 py-3 text-center font-black">{orderPieces.length}</td>
                               <td className="px-5 py-3 text-center">{selectedTrip ? <span className={`px-3 py-1 rounded-full text-[10px] font-black ${loadedCount === orderPieces.length && loadedCount > 0 ? 'bg-emerald-100 text-emerald-700' : loadedCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>{loadedCount}/{orderPieces.length}</span> : <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[9px] font-black uppercase">Ready</span>}</td>
                               {selectedTrip && <td className="px-5 py-3 text-right"><button onClick={e => { e.stopPropagation(); const unloaded = orderPieces.filter(p => p.dispatchId !== activeDispatchIdForLoading).map(p => p.id); if (unloaded.length > 0) loadAllPiecesToDispatch(unloaded); }} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase min-h-[36px] ${loadedCount === orderPieces.length ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-600 text-white'}`}>{loadedCount === orderPieces.length ? 'All Loaded' : `Load All (${orderPieces.length - loadedCount})`}</button></td>}
                             </tr>
                             {isExpanded && orderPieces.map(p => {
                               const isLoaded = p.dispatchId === activeDispatchIdForLoading;
                               return (
                                 <tr key={p.id} className="bg-slate-50/50 border-t border-dashed border-slate-200">
                                   <td className="pl-10 pr-5 py-2 text-[10px] font-bold text-slate-500">{p.id}</td>
                                   <td className="px-5 py-2 text-[10px] text-slate-500">{getGlassSize(p.specs)} | {(() => { try { return JSON.parse(p.specs || '{}').thickness || ''; } catch { return ''; } })()}mm</td>
                                   <td className="px-5 py-2 text-center text-[10px] text-slate-400">{p.status}</td>
                                   <td className="px-5 py-2 text-center">{isLoaded && <CheckCircle2 size={14} className="text-rose-600 mx-auto"/>}</td>
                                   {selectedTrip && <td className="px-5 py-2 text-right"><button onClick={() => togglePieceToDispatch(p.id)} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase min-h-[36px] ${isLoaded ? 'bg-slate-200 text-slate-600' : 'bg-blue-600 text-white'}`}>{isLoaded ? 'Unload' : 'Load'}</button></td>}
                                 </tr>
                               );
                             })}
                           </React.Fragment>
                         );
                       })}
                     </tbody></table>
                     </div>
                   </div>
                 );
               })()}
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
                        return !!(dispatch && !isInternal(dispatch.plantName) && dispatch.serviceType === 'Tempering');
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
