import React, { useState, useMemo } from 'react';
import { Company, TemperingDispatch, ProductionPiece, Quotation, Client, PettyCashEntry, Vendor } from '@/modules/shared/types';
import { AppService } from '@/modules/shared/services/appService';
import { ProductionService } from '@/modules/production/services/productionService';
import { 
  ClipboardList, Plus, X, Activity, Truck, Calendar, Send, 
  ShieldCheck, Printer, Ban, Receipt, ArrowRightLeft, Trash2
} from 'lucide-react';
import { UnifiedPaymentPrint } from '@/modules/finance/components/prints/UnifiedPaymentPrint';
import { ServiceOrderPrint } from '@/modules/sales/components/prints/ServiceOrderPrint';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
// Inline ConfirmDialog — no external dependency needed
const ConfirmDialog: React.FC<{
    title: string; message: string; confirmLabel: string;
    severity?: 'danger' | 'warning' | 'info';
    onConfirm: () => void; onCancel: () => void;
}> = ({ title, message, confirmLabel, severity = 'info', onConfirm, onCancel }) => {
    const btnColor = severity === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : severity === 'warning' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700';
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[600] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in zoom-in duration-150">
                <h3 className="text-sm font-black uppercase text-slate-800 tracking-tight">{title}</h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">{message}</p>
                <div className="flex justify-end gap-3 pt-2">
                    <button onClick={onCancel} className="px-4 py-2 text-xs font-bold text-slate-400 uppercase hover:text-slate-600 transition-colors">Cancel</button>
                    <button onClick={onConfirm} className={`px-5 py-2 text-xs font-black text-white uppercase rounded-xl tracking-widest transition-colors ${btnColor}`}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
};

interface DispatchPlannerProps {
    company: Company;
    dispatches: TemperingDispatch[];
    pieces: ProductionPiece[];
    jobOrders: Quotation[];
    clients: Client[];
    vendors: Vendor[];
    refreshData: () => void;
}

interface PlannedStop {
    id: string;
    plantName: string; // Destination
    serviceType: 'Tempering' | 'Lamination' | 'Site Delivery' | 'Supply' | 'Double Glazing' | 'Tempering Return';
    pickLocation: string;
    selectedPieceIds: string[];
    expectedReturnDate?: string;
}

const DispatchPlanner: React.FC<DispatchPlannerProps> = ({
    company, dispatches, pieces, jobOrders, clients, vendors, refreshData 
}) => {
    const navigate = useNavigate();
    const [dialog, setDialog] = React.useState<{
    title: string; message: string; confirmLabel: string;
    severity: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  } | null>(null);
  const closeDialog = () => setDialog(null);

  const [viewMode, setViewMode] = useState<'Operations' | 'Planning'>('Operations');
    const [isPlannerOpen, setIsPlannerOpen] = useState(false);
    const [printingDispatch, setPrintingDispatch] = useState<TemperingDispatch | null>(null);
    const [printingGatePass, setPrintingGatePass] = useState<TemperingDispatch | null>(null);
    
    // Voucher Printing State
    const [printingVoucher, setPrintingVoucher] = useState<{data: PettyCashEntry, recipient: string} | null>(null);
    const [printingServiceOrder, setPrintingServiceOrder] = useState<TemperingDispatch | null>(null);
    const [isServiceOrderModalOpen, setIsServiceOrderModalOpen] = useState(false);

    const [tripHeader, setTripHeader] = useState({
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        originLocation: 'Factory',
    });

    const [stops, setStops] = useState<PlannedStop[]>([]);
    const [newStop, setNewStop] = useState<Partial<PlannedStop>>({
        plantName: '',
        serviceType: 'Site Delivery',
        pickLocation: company === 'Factory' ? 'GTK Factory' : company,
        selectedPieceIds: [],
        expectedReturnDate: ''
    });
    const [isStopConfigOpen, setIsStopConfigOpen] = useState(false);

    const groupedDispatches = useMemo(() => {
        const groups: Record<string, { id: string, date: string, vehicle: string, driver: string, origin: string, stops: TemperingDispatch[], status: string }> = {};
        const today = new Date().toISOString().split('T')[0];
        dispatches.forEach(d => {
            const isFuture = d.date > today;
            if (viewMode === 'Operations' && isFuture) return;
            if (viewMode === 'Planning' && !isFuture) return;
            const tripId = d.tripId || d.id;
            if (!groups[tripId]) {
                groups[tripId] = { id: tripId, date: d.date, vehicle: d.vehicleNo, driver: d.driverName, origin: d.originLocation || 'Factory', stops: [], status: d.status };
            }
            groups[tripId].stops.push(d);
        });
        return Object.values(groups).sort((a,b) => b.date.localeCompare(a.date));
    }, [dispatches, viewMode]);

    const temperingVendors = useMemo(() => vendors.filter(v => v.type === 'Tempering'), [vendors]);

    const handleAddStop = () => {
        if (!newStop.plantName || !newStop.serviceType) { toast.error("Destination and Service Type required."); return; }
        const stop: PlannedStop = { id: `STOP-${Date.now()}`, plantName: newStop.plantName.toUpperCase(), serviceType: newStop.serviceType as any, pickLocation: tripHeader.originLocation, selectedPieceIds: [], expectedReturnDate: newStop.expectedReturnDate };
        setStops([...stops, stop]);
        setNewStop({ plantName: '', serviceType: 'Site Delivery', pickLocation: tripHeader.originLocation, selectedPieceIds: [], expectedReturnDate: '' });
        setIsStopConfigOpen(false);
    };

    const handleRemoveStop = (id: string) => setStops(stops.filter(s => s.id !== id));

    const handleFinalizeTrip = () => {
        if (stops.length === 0) { toast.error("Please add at least one drop/destination."); return; }
        const today = new Date().toISOString().split('T')[0];
        const isFuture = tripHeader.date > today;
        const initialStatus = isFuture ? 'Scheduled' : 'Ready to Dispatch';
        const tripId = `TRIP-${Date.now().toString().slice(-6)}`;
        const allDispatches = ProductionService.getTemperingDispatches();
        
        const newDispatches: TemperingDispatch[] = stops.map((stop) => {
            const chlId = AppService.generateSequenceID('CH', company, allDispatches);
            return {
                id: chlId, tripId: tripId, company, date: tripHeader.date, dispatchTime: tripHeader.time, originLocation: tripHeader.originLocation,
                plantName: stop.plantName, pickLocation: stop.pickLocation, vehicleNo: "TBD", driverName: "TBD", serviceType: stop.serviceType,
                pieceIds: [], totalSqFt: 0, status: initialStatus, chargesPerSqFt: 0, totalCharges: 0, expectedReturnDate: stop.expectedReturnDate
            };
        });

        ProductionService.saveTemperingDispatches([...allDispatches, ...newDispatches]);
        refreshData();
        setIsPlannerOpen(false);
        resetForm();
        toast.info(`Trip ${tripId} Created. Go to 'Destination Trip Loading' in Production to assign pieces.`);
    };

    const resetForm = () => { setTripHeader({ date: new Date().toISOString().split('T')[0], time: '09:00', originLocation: 'Factory' }); setStops([]); };

    const handleDispatchAction = (id: string) => {
        setDialog({
      title: 'Confirm',
      message: "Mark trip as DISPATCHED? This freezes the manifest.",
      confirmLabel: 'Proceed',
      severity: 'warning',
      onConfirm: () => { closeDialog(); },
    }); return;
        
        const allDispatches = ProductionService.getTemperingDispatches();
        const targetDispatch = allDispatches.find(d => d.id === id);
        if (!targetDispatch) return;

        // 1. Update Dispatch Status
        const updatedDispatches = allDispatches.map(d => d.id === id ? { ...d, status: 'Dispatched' as const } : d);
        ProductionService.saveTemperingDispatches(updatedDispatches);
        
        // 2. Update Production Pieces Status
        const allPieces = ProductionService.getProductionPieces();
        const updatedPieces = allPieces.map(p => {
          if (p.dispatchId === id) {
            const finalStatus = targetDispatch.serviceType === 'Site Delivery' ? 'Delivered' : 'Dispatched';
            return { ...p, status: finalStatus as any, lastUpdated: new Date().toISOString() };
          }
          return p;
        });
        ProductionService.saveProductionPieces(updatedPieces);
        
        refreshData();

        // 3. Automated Service Order Trigger
        if (targetDispatch.serviceType !== 'Site Delivery' && targetDispatch.serviceType !== 'Supply') {
             const relatedPieces = allPieces.filter(p => p.dispatchId === id);
             const uniqueOrderIds = Array.from(new Set(relatedPieces.map(p => p.orderId)));
             
             if (uniqueOrderIds.length > 0) {
                 if (confirm(`Trip Dispatched to ${targetDispatch.plantName}.\n\nDo you want to issue Service Orders (Vendor POs) for the ${uniqueOrderIds.length} related Sales Orders now?`)) {
                     navigate('/sales', { 
                         state: { 
                             serviceOrderQueue: uniqueOrderIds,
                             autoTriggerVendor: targetDispatch.plantName
                         } 
                     });
                 }
             }
        }
    };

    const handleCancelTrip = (tripId: string) => {
        setDialog({
      title: 'Confirm',
      message: "CANCEL trip? Unloads items and deletes records.",
      confirmLabel: 'Proceed',
      severity: 'danger',
      onConfirm: () => { closeDialog(); },
    }); return;
        const allDispatches = ProductionService.getTemperingDispatches();
        const dispatchesToProcess = allDispatches.filter(d => (d.tripId === tripId) || (d.id === tripId)); 
        const dispatchIdsToProcess = new Set(dispatchesToProcess.map(d => d.id));
        if (dispatchIdsToProcess.size === 0) return;

        let allPieces = ProductionService.getProductionPieces();
        let updatedDispatches = [...allDispatches]; // Create a mutable copy

        dispatchesToProcess.forEach(dispatch => {
            if (dispatch.serviceType === 'Tempering Return') {
                updatedDispatches = updatedDispatches.map(d => {
                    if (d.id === dispatch.id) {
                        const piecesInThisDispatch = allPieces.filter(p => p.dispatchId === d.id).map(p => p.id);
                        allPieces = allPieces.map(p => {
                            if (p.dispatchId === d.id) {
                                return { ...p, status: 'Received-From-Tempering' as const, lastUpdated: new Date().toISOString() };
                            }
                            return p;
                        });
                        return { ...d, status: 'Received' as const, receivedPieceIds: piecesInThisDispatch };
                    }
                    return d;
                });
            } else {
                allPieces = allPieces.map(p => {
                    if (p.dispatchId === dispatch.id) {
                        let newStatus = 'Ready to Dispatch';
                        if (dispatch.serviceType === 'Tempering') newStatus = 'QC-Passed';
                        else if (['Lamination', 'Double Glazing'].includes(dispatch.serviceType)) newStatus = 'Tempered';
                        return { ...p, dispatchId: undefined, status: newStatus as any, lastUpdated: new Date().toISOString() };
                    }
                    return p;
                });
                updatedDispatches = updatedDispatches.filter(d => d.id !== dispatch.id);
            }
        });

        ProductionService.saveProductionPieces(allPieces);
        ProductionService.saveTemperingDispatches(updatedDispatches);
        refreshData();
    };

    const handlePrint = (disp: TemperingDispatch) => { setPrintingDispatch(disp); setTimeout(() => { window.print(); setPrintingDispatch(null); }, 500); };
    const handlePrintGatePass = (disp: TemperingDispatch) => { setPrintingGatePass(disp); setTimeout(() => { window.print(); setPrintingGatePass(null); }, 500); };

    const handlePrintVoucher = (group: { id: string, stops: TemperingDispatch[], driver: string }) => {
        const totalFare = group.stops.reduce((s, stop) => s + (stop.totalCharges || 0), 0);
        if (totalFare <= 0) { toast.info("No charges recorded for this trip."); return; }

        const dummyEntry: PettyCashEntry = {
            id: `PV-${Date.now().toString().slice(-6)}`,
            company,
            date: new Date().toISOString().split('T')[0],
            description: `Logistics Fare for Trip ${group.id}`,
            amount: totalFare,
            type: 'Payment',
            balance: 0,
            recordedBy: 'Logistics',
            status: 'Posted',
            businessTransaction: 'Transport Fare',
            referenceDoc: group.id
        };

        setPrintingVoucher({ data: dummyEntry, recipient: group.driver });
        setTimeout(() => {
            window.print();
            setPrintingVoucher(null);
        }, 500);
    };

    const handlePrintServiceOrder = (disp: TemperingDispatch) => {
        setPrintingServiceOrder(disp);
        setTimeout(() => {
            window.print();
            setPrintingServiceOrder(null);
        }, 500);
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
           {dialog && (
               <ConfirmDialog
                   isOpen
                   title={dialog.title}
                   message={dialog.message}
                   confirmLabel={dialog.confirmLabel}
                   severity={dialog.severity}
                   onConfirm={dialog.onConfirm}
                   onCancel={closeDialog}
               />
           )}
           {printingVoucher && (
               <UnifiedPaymentPrint 
                   data={printingVoucher.data} 
                   company={company} 
                   partyName={printingVoucher.recipient} 
               />
           )}

           {printingServiceOrder && (
               <ServiceOrderPrint 
                   dispatch={printingServiceOrder} 
                   pieces={pieces} 
                   jobOrders={jobOrders} 
               />
           )}

           {isServiceOrderModalOpen && (
               <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[450] flex items-center justify-center p-4">
                   <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl p-8 animate-in zoom-in duration-200">
                       <div className="flex justify-between items-center mb-6">
                           <h3 className="text-xl font-black uppercase text-slate-800">Issue Service Order</h3>
                           <button onClick={() => setIsServiceOrderModalOpen(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20}/></button>
                       </div>
                       <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                           {dispatches
                               .filter(d => d.serviceType !== 'Site Delivery' && d.serviceType !== 'Supply' && d.status !== 'Draft')
                               .sort((a,b) => b.date.localeCompare(a.date))
                               .map(d => (
                                   <div key={d.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-400 transition-all group">
                                       <div>
                                           <div className="flex items-center space-x-2 mb-1">
                                               <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-black uppercase">{d.id}</span>
                                               <span className="text-xs font-black text-slate-800 uppercase">{d.plantName}</span>
                                           </div>
                                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{d.serviceType} | {d.date} | {d.vehicleNo}</p>
                                       </div>
                                       <button onClick={() => { handlePrintServiceOrder(d); setIsServiceOrderModalOpen(false); }} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all flex items-center space-x-2">
                                           <Printer size={14}/> <span>Print Order</span>
                                       </button>
                                   </div>
                               ))}
                           {dispatches.filter(d => d.serviceType !== 'Site Delivery' && d.serviceType !== 'Supply' && d.status !== 'Draft').length === 0 && (
                               <div className="text-center py-10 text-slate-400 text-xs font-bold uppercase italic">No active service trips found.</div>
                           )}
                       </div>
                   </div>
               </div>
           )}

           <div className="bg-blue-600 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10"><ClipboardList size={120} /></div>
              <div>
                 <h2 className="text-3xl font-black uppercase tracking-tight">Logistics Command</h2>
                 <p className="text-blue-100 font-bold uppercase tracking-widest text-[10px]">Fleet Management & Route Planning</p>
              </div>
              <button onClick={() => { resetForm(); setIsPlannerOpen(true); }} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl hover:bg-blue-600 hover:text-white transition-all flex items-center space-x-3 relative z-10">
                 <Plus size={20}/> <span>Plan New Dispatch</span>
              </button>
           </div>

           <div className="flex justify-between items-center">
               <div className="flex space-x-1 bg-white p-1 rounded-xl border border-slate-200 w-fit">
                   <button onClick={() => setViewMode('Operations')} className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase transition-all ${viewMode === 'Operations' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>Daily Operations</button>
                   <button onClick={() => setViewMode('Planning')} className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase transition-all ${viewMode === 'Planning' ? 'bg-emerald-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>Future Planning</button>
               </div>
               <button onClick={() => setIsServiceOrderModalOpen(true)} className="bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all flex items-center space-x-2 shadow-sm">
                   <Printer size={16}/> <span>Issue Service Order</span>
               </button>
           </div>

           <div className="space-y-4">
               {groupedDispatches.map(group => {
                   const isArrived = group.stops.some(s => s.status === 'Received');
                   const isDeparted = group.stops.every(s => s.status === 'Dispatched');
                   const isScheduled = group.stops.some(s => s.status === 'Scheduled');
                   const totalFare = group.stops.reduce((s, stop) => s + (stop.totalCharges || 0), 0);

                   return (
                   <div key={group.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                       <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
                           <div className="flex items-center space-x-4">
                               <div className="p-2 bg-blue-100 text-blue-700 rounded-lg"><Truck size={18}/></div>
                               <div>
                                   <h4 className="font-black text-slate-800 uppercase text-sm leading-none">{group.vehicle} <span className="text-slate-400 mx-2">|</span> {group.driver}</h4>
                                   <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Trip ID: {group.id}</p>
                               </div>
                           </div>
                           <div className="flex items-center space-x-6">
                               <div className="text-right">
                                   <p className="text-[9px] font-bold text-slate-400 uppercase">Dispatch Date</p>
                                   <div className="flex items-center space-x-1 text-slate-800 font-bold text-xs"><Calendar size={12}/> <span>{group.date}</span></div>
                               </div>
                               {totalFare > 0 && (
                                   <button 
                                       onClick={() => handlePrintVoucher(group)}
                                       className="flex items-center space-x-1 bg-white border border-slate-200 px-3 py-1 rounded-lg hover:border-blue-400 transition-all text-blue-600"
                                       title="Print Driver Payment Voucher"
                                   >
                                       <Receipt size={12}/>
                                       <span className="text-[10px] font-black uppercase">Fare: {totalFare.toLocaleString()}</span>
                                   </button>
                               )}
                               <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${isArrived ? 'bg-blue-100 text-blue-700' : isDeparted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                   {isArrived ? 'Arrived' : isScheduled ? 'Scheduled' : isDeparted ? 'Departed' : 'Loading'}
                               </div>
                               <button 
                                   onClick={() => handleCancelTrip(group.id)} 
                                   className="p-2 text-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100" 
                                   title="Cancel Trip & Unload Items"
                               >
                                   <Ban size={18} />
                               </button>
                           </div>
                       </div>
                       <table className="w-full text-left sap-table">
                           <thead className="bg-white text-[9px] font-black uppercase text-slate-400">
                               <tr>
                                   <th className="px-6 py-3 w-32">Drop #</th>
                                   <th className="px-6 py-3">Destination</th>
                                   <th className="px-6 py-3">Type</th>
                                   <th className="px-6 py-3 text-center">Load</th>
                                   <th className="px-6 py-3 text-right">Action</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100 text-xs">
                               {group.stops.map((stop, idx) => {
                                   const stopPieceCount = pieces.filter(p => p.dispatchId === stop.id || (stop.receivedPieceIds && stop.receivedPieceIds.includes(p.id))).length;
                                   return (
                                   <tr key={stop.id} className="hover:bg-slate-50">
                                       <td className="px-6 py-3 font-mono font-bold text-slate-500">{stop.id}</td>
                                       <td className="px-6 py-3 font-bold text-slate-800 uppercase">{stop.plantName}</td>
                                       <td className="px-6 py-3"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">{stop.serviceType}</span></td>
                                       <td className="px-6 py-3 text-center font-black">{stopPieceCount} Pcs</td>
                                       <td className="px-6 py-3 text-right">
                                           <div className="flex justify-end space-x-2">
                                               {(stop.status === 'Ready to Dispatch' || stop.status === 'Scheduled') && (
                                                   <button onClick={() => handleDispatchAction(stop.id)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="Dispatch"><Send size={14}/></button>
                                               )}
                                               {stop.status === 'Dispatched' && (
                                                   <button onClick={() => handlePrintGatePass(stop)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded" title="Gate Pass"><ShieldCheck size={14}/></button>
                                               )}
                                               <button onClick={() => handlePrint(stop)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded" title="Print Challan"><Printer size={14}/></button>
                                           </div>
                                       </td>
                                   </tr>
                                )})}
                           </tbody>
                       </table>
                   </div>
               )})}
               {groupedDispatches.length === 0 && <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-3xl"><p className="text-slate-300 font-black uppercase text-sm">No {viewMode} Trips Found</p></div>}
           </div>

           {isPlannerOpen && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
               <div className="bg-white rounded-[2.5rem] w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-200">
                  <div className="px-10 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                     <div className="flex items-center space-x-4"><Activity size={24}/><div><h3 className="text-2xl font-black uppercase tracking-tight">Dispatch Planner</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Multi-Drop Logistics</p></div></div>
                     <button onClick={() => setIsPlannerOpen(false)}><X size={28}/></button>
                  </div>
                  
                  <div className="flex-1 overflow-hidden flex bg-slate-50">
                      <div className="w-1/3 p-8 border-r border-slate-200 overflow-y-auto space-y-6 bg-white">
                          <div>
                              <h4 className="text-xs font-black uppercase text-slate-400 mb-4 border-b pb-2">Trip Header</h4>
                              <div className="space-y-4">
                                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Dispatch Date</label><input type="date" className="sap-input w-full font-bold" value={tripHeader.date} onChange={e => setTripHeader({...tripHeader, date: e.target.value})}/></div>
                                  <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Time</label><input type="time" className="sap-input w-full font-bold" value={tripHeader.time} onChange={e => setTripHeader({...tripHeader, time: e.target.value})}/></div>
                                  <div className="space-y-1">
                                      <label className="text-[10px] font-bold uppercase text-blue-600">Origin / Start Point</label>
                                      <div className="relative">
                                          <ArrowRightLeft className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" size={14} />
                                          <select className="sap-input w-full pl-9 font-bold uppercase" value={tripHeader.originLocation} onChange={e => setTripHeader({...tripHeader, originLocation: e.target.value})}>
                                              <option value="Factory">Factory Warehouse</option>
                                              {temperingVendors.map(v => (
                                                  <option key={v.id} value={v.name}>{v.name}</option>
                                              ))}
                                              <option value="D/G Plant">D/G Plant</option>
                                              <option value="Lamination Plant">Lamination Plant</option>
                                          </select>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>
                      <div className="flex-1 p-8 overflow-y-auto flex flex-col">
                          <div className="flex justify-between items-center mb-6">
                              <h4 className="text-sm font-black uppercase text-slate-800">Delivery Itinerary</h4>
                              <button onClick={() => setIsStopConfigOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center space-x-2 shadow-lg hover:bg-blue-700 transition-all"><Plus size={14}/> <span>Add Stop</span></button>
                          </div>
                          <div className="space-y-4 flex-1">
                              {stops.map((stop, idx) => (
                                  <div key={stop.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center group hover:border-blue-300 transition-all">
                                      <div className="flex items-center space-x-4">
                                          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-xs">{idx + 1}</div>
                                          <div>
                                              <h5 className="font-black text-slate-800 uppercase">{stop.plantName}</h5>
                                              <p className="text-[10px] font-bold text-slate-400 uppercase">{stop.serviceType}</p>
                                          </div>
                                      </div>
                                      <button onClick={() => handleRemoveStop(stop.id)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                                  </div>
                              ))}
                          </div>
                          <div className="mt-8 pt-6 border-t"><button onClick={handleFinalizeTrip} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center space-x-2"><Send size={16}/> <span>Finalize & Create Trip</span></button></div>
                      </div>
                  </div>
               </div>
            </div>
           )}

           {isStopConfigOpen && (
               <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[450] flex items-center justify-center p-4">
                   <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-8 animate-in zoom-in duration-200">
                       <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-black uppercase text-slate-800">Add Delivery Drop</h3><button onClick={() => setIsStopConfigOpen(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20}/></button></div>
                       <div className="space-y-4 mb-6">
                           <div className="space-y-1">
                               <label className="text-[10px] font-bold uppercase text-slate-400">Service / Purpose</label>
                               <select className="sap-input w-full font-bold" value={newStop.serviceType} onChange={e => {
                                       const sType = e.target.value as any;
                                       let dest = newStop.plantName;
                                       if (sType === 'Double Glazing') dest = 'D/G Plant';
                                       else if (sType === 'Lamination') dest = 'Lamination Plant';
                                       else if (['D/G Plant', 'Lamination Plant'].includes(dest || '')) dest = '';
                                       setNewStop({...newStop, serviceType: sType === 'Supply' ? 'Tempering Return' : sType, plantName: dest})
                                   }}>
                                   <option value="Site Delivery">Site Delivery</option>
                                   <option value="Tempering">Tempering Service</option>
                                   <option value="Lamination">Lamination</option>
                                   <option value="Double Glazing">Double Glazing</option>
                                   <option value="Tempering Return">Tempering Return</option>
                               </select>
                           </div>
                           <div className="space-y-1">
                               <label className="text-[10px] font-bold uppercase text-slate-400">Destination</label>
                               {newStop.serviceType === 'Site Delivery' ? (
                                   <input type="text" placeholder="Site Name" className="sap-input w-full font-bold uppercase" value={newStop.plantName} onChange={e => setNewStop({...newStop, plantName: e.target.value})}/>
                               ) : (
                                   <select className="sap-input w-full font-bold" value={newStop.plantName} onChange={e => {
                                       const dest = e.target.value;
                                       setNewStop({
                                           ...newStop, 
                                           plantName: dest,
                                           serviceType: dest === 'Factory' ? 'Tempering Return' : newStop.serviceType
                                       });
                                   }}>
                                       <option value="">-- Select Plant --</option>
                                       {tripHeader.originLocation !== 'Factory' && <option value="Factory">Factory (Return Trip)</option>}
                                       {temperingVendors.map(v => (
                                           <option key={v.id} value={v.name}>{v.name}</option>
                                       ))}
                                       <option value="D/G Plant">D/G Plant</option>
                                       <option value="Lamination Plant">Lamination Plant</option>
                                   </select>
                               )}
                           </div>
                       </div>
                       <button onClick={handleAddStop} className="w-full py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-600 transition-all">Confirm Stop</button>
                   </div>
               </div>
           )}

           {/* UNIFIED PRINT CHALLAN DESIGN */}
           {printingDispatch && (() => {
             const allDispatchPieces = pieces.filter(p => p.dispatchId === printingDispatch.id);
             const totalSqFt = allDispatchPieces.reduce((sum, p) => {
                 const order = jobOrders.find(o => o.orderNo === p.orderId);
                 const item = order?.items[p.itemIndex];
                 return sum + (item ? (item.totalSqFt / (item.qty || 1)) : 0);
             }, 0);

             // Chunk pieces into pages
             const MAX_ROWS = 25;
             const chunks: typeof allDispatchPieces[] = [];
             let rem = [...allDispatchPieces];
             // Page 1 has less rows due to header
             chunks.push(rem.splice(0, 18));
             while (rem.length > 0) chunks.push(rem.splice(0, MAX_ROWS));
             if (chunks.length === 0) chunks.push([]);

             return (
               <div className="print-only bg-white text-black font-sans leading-tight">
                <style>{`
                    @media screen { .print-only { display: none !important; } }
                    @media print {
                        @page { size: A4; margin: 0; }
                        body { margin: 0; padding: 0; }
                        html, body { height: auto !important; overflow: visible !important; background: white !important; }
                        body * { visibility: hidden; }
                        .print-only, .print-only * { visibility: visible; }
                        .print-only { position: absolute; top: 0; left: 0; width: 100%; background: white; z-index: 99999; }
                        .print-container { width: 100% !important; padding: 15mm !important; box-sizing: border-box !important; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        .bg-slate-50  { background-color: #f8fafc !important; }
                        .bg-slate-100 { background-color: #f1f5f9 !important; }
                        .bg-slate-200 { background-color: #e2e8f0 !important; }
                        table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
                        tr { page-break-inside: avoid; page-break-after: auto; }
                        th, td { border: 1.5px solid #000 !important; }
                        .page-break-before { page-break-before: always; }
                        .no-print { display: none !important; }
                    }
                    .font-pill-challan { border: 2px solid #0f172a; border-radius: 9999px; padding: 5px 48px; font-weight: 900; letter-spacing: 0.25em; color: #0f172a; display: inline-block; }
                `}</style>

                {chunks.map((chunk, chunkIdx) => {
                    const isFirst = chunkIdx === 0;
                    const isLast  = chunkIdx === chunks.length - 1;

                    return (
                        <div key={chunkIdx} className={chunkIdx > 0 ? 'page-break-before' : ''}>
                            <div className="print-container">

                                {/* PAGE 1 HEADER */}
                                {isFirst && (
                                    <>
                                        {/* Letterhead */}
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h1 className="text-4xl font-bold tracking-tighter text-slate-900">GlassTech</h1>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Complete Architectural Glass Solutions</p>
                                                <p className="text-[9px] font-medium text-slate-400">KORANGI INDUSTRIAL AREA, KARACHI.</p>
                                            </div>
                                            <div className="text-right">
                                                <h2 className="text-4xl font-bold tracking-tighter text-slate-900">{company}</h2>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">GLASS PROCESSING UNIT</p>
                                            </div>
                                        </div>

                                        {/* Title pill */}
                                        <div className="flex justify-center my-5">
                                            <span className="font-pill-challan text-sm uppercase">D E L I V E R Y &nbsp; C H A L L A N</span>
                                        </div>

                                        {/* Destination + meta */}
                                        <div className="flex justify-between mb-4">
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">DESTINATION:</p>
                                                <h3 className="text-2xl font-black text-slate-900 uppercase leading-none">{printingDispatch.plantName}</h3>
                                                <p className="text-[11px] font-black text-indigo-700 uppercase mt-1">SERVICE TYPE: {printingDispatch.serviceType}</p>
                                            </div>
                                            <div className="text-right space-y-1 text-[11px]">
                                                <div className="flex justify-end space-x-2">
                                                    <span className="text-slate-400 font-bold uppercase">CHALLAN REF:</span>
                                                    <span className="text-blue-700 font-black">{printingDispatch.id}</span>
                                                </div>
                                                <div className="flex justify-end space-x-2">
                                                    <span className="text-slate-400 font-bold uppercase">DATE:</span>
                                                    <span className="font-black">{printingDispatch.date}</span>
                                                </div>
                                                <div className="flex justify-end space-x-2">
                                                    <span className="text-slate-400 font-bold uppercase">VEHICLE:</span>
                                                    <span className="font-black">{printingDispatch.vehicleNo || 'TBD'}</span>
                                                </div>
                                                <div className="flex justify-end space-x-2">
                                                    <span className="text-slate-400 font-bold uppercase">DRIVER:</span>
                                                    <span className="font-black">{printingDispatch.driverName || 'TBD'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Summary bar */}
                                        <div className="border-2 border-black bg-slate-50 p-3 mb-4 flex items-center justify-between">
                                            <div className="flex space-x-8 border-r-2 border-black pr-8">
                                                <div>
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">TOTAL QUANTITY</p>
                                                    <p className="text-xl font-black text-slate-900">{allDispatchPieces.length} <span className="text-[10px] font-bold text-slate-400">Pcs</span></p>
                                                </div>
                                                <div>
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">ESTIMATED FT²</p>
                                                    <p className="text-xl font-black text-blue-700">{totalSqFt.toFixed(2)}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-4 pl-6">
                                                <div className="border border-black px-3 py-1">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase">LOAD TYPE: </span>
                                                    <span className="text-[10px] font-black uppercase">{printingDispatch.serviceType}</span>
                                                </div>
                                                <div className="border border-black px-3 py-1">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase">ORIGIN: </span>
                                                    <span className="text-[10px] font-black uppercase">{printingDispatch.pickLocation || 'FACTORY'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* CONTINUATION HEADER (page 2+) */}
                                {!isFirst && (
                                    <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-3">
                                        <p className="text-sm font-black uppercase">{printingDispatch.id} — {printingDispatch.plantName}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Page {chunkIdx + 1}</p>
                                    </div>
                                )}

                                {/* TABLE */}
                                <table className="w-full text-left border-2 border-black text-[10px]">
                                    <thead className="bg-slate-200">
                                        <tr>
                                            <th className="py-2 px-2 border-2 border-black text-center w-10 text-[9px] font-black uppercase">S.NO</th>
                                            <th className="py-2 px-2 border-2 border-black text-[9px] font-black uppercase">Piece Description &amp; Ref Order</th>
                                            <th className="py-2 px-2 border-2 border-black text-center w-32 text-[9px] font-black uppercase">Size (Inches)</th>
                                            <th className="py-2 px-2 border-2 border-black text-center w-14 text-[9px] font-black uppercase">Qty</th>
                                            <th className="py-2 px-2 border-2 border-black text-center w-20 text-[9px] font-black uppercase">Received</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {chunk.map((p, idx) => {
                                            const globalIdx = chunkIdx === 0 ? idx : 18 + (chunkIdx - 1) * MAX_ROWS + idx;
                                            const order = jobOrders.find(o => o.orderNo === p.orderId);
                                            const item  = order?.items[p.itemIndex];
                                            const sizeStr = item
                                                ? ((item.mmW || item.mmH)
                                                    ? `${item.mmW || 0} x ${item.mmH || 0}`
                                                    : `${item.inchW || 0}.${item.sootW || 0} x ${item.inchH || 0}.${item.sootH || 0}`)
                                                : '—';
                                            return (
                                                <tr key={p.id}>
                                                    <td className="py-2 px-2 border-2 border-black text-center font-bold text-slate-500">{globalIdx + 1}</td>
                                                    <td className="py-2 px-2 border-2 border-black">
                                                        <p className="font-black text-slate-900 uppercase leading-tight">{p.id}</p>
                                                        <p className="text-[8px] font-bold text-blue-600 uppercase mt-0.5">SPECS: {p.specs}</p>
                                                        <p className="text-[8px] text-slate-400 font-bold uppercase italic">REF ORDER: {p.orderId}</p>
                                                    </td>
                                                    <td className="py-2 px-2 border-2 border-black text-center font-black text-slate-800">{sizeStr}</td>
                                                    <td className="py-2 px-2 border-2 border-black text-center font-black">1</td>
                                                    <td className="py-2 px-2 border-2 border-black text-center text-slate-300 font-bold">_______</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {/* FOOTER — last page only */}
                                {isLast && (
                                    <div className="mt-10 pt-4 border-t-2 border-black">
                                        <div className="w-[60%]">
                                            <h4 className="text-[9px] font-black uppercase tracking-widest mb-2">SAFETY &amp; PROTOCOL</h4>
                                            <p className="text-[9px] font-bold text-slate-600 leading-relaxed">• Receiver acknowledges items in good condition.</p>
                                            <p className="text-[9px] font-bold text-slate-600 leading-relaxed">• Any breakage or mismatch must be reported immediately.</p>
                                            <p className="text-[9px] font-black uppercase italic leading-relaxed">• FRAGILE MATERIAL - HANDLE WITH INDUSTRIAL SAFETY STANDARDS.</p>
                                        </div>

                                        <div className="mt-16 grid grid-cols-3 gap-10">
                                            <div className="border-t-2 border-black pt-2 text-center text-[9px] font-black uppercase text-slate-500">Warehouse Controller</div>
                                            <div className="border-t-2 border-black pt-2 text-center text-[9px] font-black uppercase text-slate-500">Transporter</div>
                                            <div className="border-t-2 border-black pt-2 text-center text-[9px] font-black uppercase font-black">Receiver's Signature</div>
                                        </div>

                                        <div className="mt-6 text-center">
                                            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-300 italic">
                                                C O M P U T E R &nbsp; G E N E R A T E D &nbsp; D E L I V E R Y &nbsp; D O C U M E N T . &nbsp; D O C U M E N T &nbsp; I D : &nbsp; {printingDispatch.id}
                                            </p>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>
                    );
                })}
               </div>
             );
          })()}
    
          {/* SYNCED PRINT GATE PASS DESIGN */}
          {printingGatePass && (() => {
            const allGatePassPieces = pieces.filter(p => p.dispatchId === printingGatePass.id);
            const MAX_ROWS = 25;
            const chunks: typeof allGatePassPieces[] = [];
            let currentChunk: typeof allGatePassPieces = [];
            allGatePassPieces.forEach((p, index) => {
                currentChunk.push(p);
                if (currentChunk.length === MAX_ROWS && index < allGatePassPieces.length - 1) {
                    chunks.push(currentChunk);
                    currentChunk = [];
                }
            });
            if (currentChunk.length > 0) chunks.push(currentChunk);

            return (
            <div className="print-only bg-white text-black p-0 font-sans leading-tight min-h-screen flex flex-col">
               <style>{`
                   @media print {
                       @page { size: A4; margin: 0; }
                       body { margin: 0; padding: 0; }
                       html, body { height: auto !important; overflow: visible !important; background: white !important; }
                       body * { visibility: hidden; }
                       .print-only, .print-only * { visibility: visible; }
                       .print-only { display: block !important; position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; background: white !important; z-index: 99999 !important; }
                       .print-container { width: 100% !important; padding: 15mm !important; box-sizing: border-box !important; }
                       * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                       .bg-slate-50 { background-color: #f8fafc !important; }
                       .bg-slate-100 { background-color: #f1f5f9 !important; }
                       table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
                       tr { page-break-inside: avoid; page-break-after: auto; }
                       .page-break-before { page-break-before: always; }
                   }
                   .font-pill-gp { border: 2px solid #0f172a; border-radius: 9999px; padding: 6px 50px; font-weight: 900; letter-spacing: 0.2em; color: #0f172a; }
               `}</style>

               <div className="print-container">
                    <div className="mb-6 pb-4 flex justify-between items-start">
                        <div>
                            <h1 className="text-4xl font-bold tracking-tighter text-slate-900">GlassTech</h1>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Security & Gate Division</p>
                        </div>
                        <div className="text-right">
                            <h2 className="text-4xl font-bold tracking-tighter text-slate-900">{company}</h2>
                        </div>
                    </div>

                    <div className="flex justify-center my-6">
                        <div className="font-pill-gp text-sm uppercase">G A T E &nbsp; P A S S</div>
                    </div>

                    <div className="grid grid-cols-2 gap-10 mb-8 p-6 bg-slate-50 rounded-2xl border">
                        <div className="space-y-3">
                            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized Transport</p><p className="text-2xl font-black text-slate-900">{printingGatePass.vehicleNo}</p></div>
                            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Driver Identity</p><p className="text-sm font-bold uppercase text-slate-700">{printingGatePass.driverName}</p></div>
                        </div>
                        <div className="text-right space-y-3">
                            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pass Registry ID</p><p className="text-2xl font-black text-blue-700">GP-{printingGatePass.id.slice(-6)}</p></div>
                            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Issue Timestamp</p><p className="text-sm font-bold uppercase text-slate-700">{new Date().toLocaleString()}</p></div>
                        </div>
                    </div>

                    <div className="mb-10 flex-1">
                        <h3 className="text-[10px] font-black uppercase text-slate-900 mb-4 border-b-2 border-slate-900 pb-2 tracking-widest">Consolidated Material Load Summary</h3>
                        {chunks.map((chunk, chunkIdx) => (
                            <div key={chunkIdx} className={chunkIdx > 0 ? 'page-break-before mt-8' : ''}>
                                <table className="w-full text-left text-[10px] border border-slate-300">
                                    <thead className="bg-slate-100 font-black">
                                        <tr className="border-b border-slate-300">
                                            <th className="w-10 border-r p-2 text-center">Sr.</th>
                                            <th className="border-r p-2">Material / Piece Description</th>
                                            <th className="border-r p-2">Ref Order</th>
                                            <th className="p-2 text-center w-16">Qty</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {chunk.map((p, idx) => (
                                            <tr key={p.id} className="border-b border-slate-200">
                                                <td className="border-r p-2 text-center font-bold text-slate-400">{chunkIdx * MAX_ROWS + idx + 1}</td>
                                                <td className="border-r p-2 font-bold uppercase text-slate-800">{p.specs || p.id}</td>
                                                <td className="border-r p-2 uppercase text-blue-600 font-black">{p.orderId}</td>
                                                <td className="p-2 text-center font-black">1</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {chunkIdx === chunks.length - 1 && (
                                        <tfoot className="bg-slate-50 font-black">
                                            <tr>
                                                <td colSpan={3} className="p-2 text-right uppercase tracking-widest">Total Manifest Units:</td>
                                                <td className="p-2 text-center bg-slate-900 text-white text-sm">{allGatePassPieces.length}</td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        ))}
                    </div>
        
                    <div className="mt-auto grid grid-cols-3 gap-10 text-center break-inside-avoid">
                        <div className="border-t-2 border-slate-900 pt-2"><p className="text-[10px] font-black uppercase text-slate-400">Security Officer</p></div>
                        <div className="border-t-2 border-slate-900 pt-2"><p className="text-[10px] font-black uppercase text-slate-400">Store Incharge</p></div>
                        <div className="border-t-2 border-slate-900 pt-2"><p className="text-[10px] font-black uppercase text-slate-900">Carrier Dispatch</p></div>
                    </div>
                </div>
            </div>
          )})}
         </div>
    );
};

export default DispatchPlanner;
