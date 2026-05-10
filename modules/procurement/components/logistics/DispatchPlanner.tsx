import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Company, TemperingDispatch, ProductionPiece, Quotation, Client, PettyCashEntry, Vendor } from '@/modules/shared/types';
import { AppService } from '@/modules/shared/services/appService';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { DispatchService } from '@/modules/procurement/services/dispatchService';      // Sprint 11
import {
  ClipboardList, Plus, X, Activity, Truck, Calendar, Send,
  ShieldCheck, Printer, Ban, Receipt, ArrowRightLeft, Trash2
} from 'lucide-react';
import { UnifiedPaymentPrint } from '@/modules/finance/components/prints/UnifiedPaymentPrint';
import { ServiceOrderPrint } from '@/modules/sales/components/prints/ServiceOrderPrint';
import { useNavigate } from 'react-router-dom';

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
        vehicleId: '',
    });

    const allVehicles = InventoryService.getVehicles().filter(v => v.status === 'Active');

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
        if (!newStop.plantName || !newStop.serviceType) return alert("Destination and Service Type required.");
        const stop: PlannedStop = { id: `STOP-${Date.now()}`, plantName: newStop.plantName.toUpperCase(), serviceType: newStop.serviceType as any, pickLocation: tripHeader.originLocation, selectedPieceIds: [], expectedReturnDate: newStop.expectedReturnDate };
        setStops([...stops, stop]);
        setNewStop({ plantName: '', serviceType: 'Site Delivery', pickLocation: tripHeader.originLocation, selectedPieceIds: [], expectedReturnDate: '' });
        setIsStopConfigOpen(false);
    };

    const handleRemoveStop = (id: string) => setStops(stops.filter(s => s.id !== id));

    const handleFinalizeTrip = () => {
        if (stops.length === 0) return alert("Please add at least one drop/destination.");
        const selectedVehicle = allVehicles.find(v => v.id === tripHeader.vehicleId);
        const vehiclePlate = selectedVehicle?.plateNo || 'TBD';
        const driverName = selectedVehicle?.driverName || 'TBD';
        const today = new Date().toISOString().split('T')[0];
        const isFuture = tripHeader.date > today;
        const initialStatus = isFuture ? 'Scheduled' : 'Ready to Dispatch';
        const tripId = `TRIP-${Date.now().toString().slice(-6)}`;
        const allDispatches = ProductionService.getTemperingDispatches();
        
        const newDispatches: TemperingDispatch[] = stops.map((stop) => {
            const chlId = AppService.generateSequenceID('CH', company, allDispatches);
            const matchedVendor = vendors.find(v => v.name.toUpperCase() === stop.plantName.toUpperCase());

            // ── Per-mm rate snapshot from vendor price list ────────────────────
            // Snapshot at dispatch creation time so rate changes don't affect
            // historical GL entries. ratesByMm is used by postTemperingInwardGL()
            // to calculate exact cost per piece (each mm has different rate).
            const ratesByMm: Record<string, number> = {};
            // Sort by effectiveDate desc so most recent rate wins per mm
            const sortedRates = [...(matchedVendor?.rates || [])].sort(
                (a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''),
            );
            sortedRates.forEach(r => {
                const mm = String(r.thickness || '').replace(/[^0-9.]/g, '').trim();
                if (mm && r.rate > 0 && !ratesByMm[mm]) {
                    ratesByMm[mm] = r.rate; // first = most recent for this mm
                }
            });

            // chargesPerSqFt kept as display fallback (most recent overall rate)
            const vendorRate = sortedRates[0]?.rate || 0;

            return {
                id: chlId, tripId, company, date: tripHeader.date,
                dispatchTime: tripHeader.time, originLocation: tripHeader.originLocation,
                plantName: stop.plantName, pickLocation: stop.pickLocation,
                vehicleNo: vehiclePlate, driverName: driverName, serviceType: stop.serviceType,
                pieceIds: [], totalSqFt: 0, status: initialStatus,
                chargesPerSqFt: vendorRate,
                ratesByMm,             // per-mm rates for GL calculation
                totalCharges: 0, expectedReturnDate: stop.expectedReturnDate,
            };
        });

        ProductionService.saveTemperingDispatches([...allDispatches, ...newDispatches]);

        if (selectedVehicle) {
          const existingTrips = InventoryService.getVehicleTrips();
          // Determine load direction — Site Delivery/Supply = OneWayLoaded (return empty), others = Both (loaded both ways)
          const isReturnEmpty = newDispatches.some(d => d.serviceType === 'Site Delivery' || d.serviceType === 'Supply');
          const loadDir = isReturnEmpty ? 'OneWayLoaded' as const : 'Both' as const;
          const fullRate = selectedVehicle.owner === 'Hired' ? selectedVehicle.hireRate : 0;
          const tripFare = loadDir === 'OneWayLoaded' ? Math.round(fullRate * 0.5) : fullRate;

          const newVehicleTrips = newDispatches.map(d => ({
            id: `VT-${d.id}`, vehicleId: selectedVehicle.id, dispatchId: d.id, company,
            date: tripHeader.date, destination: d.plantName, serviceType: d.serviceType,
            fare: tripFare, fullRate, reducedRate: Math.round(fullRate * 0.5),
            loadDirection: loadDir,
            fuelCost: 0, tollCharges: 0, status: 'Scheduled' as const, paidStatus: 'Unpaid' as const,
          }));
          InventoryService.saveVehicleTrips([...existingTrips, ...newVehicleTrips]);

          // ── Auto GL: Transport Expense on trip creation ──
          if (tripFare > 0) {
            const accs = FinanceService.getAccounts().filter(a => a.company === company);
            const transportAcc = accs.find(a => a.code === '53210' || a.code?.startsWith('532') || a.name?.toUpperCase().includes('TRANSPORT') || a.name?.toUpperCase().includes('VEHICLE'))
              || accs.find(a => a.type === 'Expense');
            const cashAcc = accs.find(a => a.code === '11112' || a.name?.toUpperCase().includes('CASH'));
            if (transportAcc && cashAcc) {
              FinanceService.recordTransaction({
                id: `GL-TRIP-${tripId}`, company: company as any, docType: 'PV' as any,
                docDate: tripHeader.date, date: tripHeader.date,
                description: `Transport: ${stops.map(s => s.plantName).join(' → ')} (${selectedVehicle.plateNo}) ${loadDir === 'OneWayLoaded' ? '[One-way]' : '[Round-trip]'}`,
                referenceId: tripId, status: 'Parked',
                details: [
                  { accountId: transportAcc.id, debit: tripFare, credit: 0, text: `Trip ${tripId} — ${stops.map(s => s.serviceType).join(', ')}` },
                  { accountId: cashAcc.id, debit: 0, credit: tripFare, text: `Cash — ${selectedVehicle.owner === 'Hired' ? 'Hired vehicle' : 'Own vehicle'} ${selectedVehicle.plateNo}` },
                ],
              });
            }
          }
        }

        refreshData();
        setIsPlannerOpen(false);
        resetForm();

        localStorage.setItem('gtk_pending_trip_load', JSON.stringify({
          tripId, dispatchIds: newDispatches.map(d => d.id),
          firstDispatchId: newDispatches[0]?.id || '', timestamp: Date.now()
        }));

        const svcType = newDispatches[0]?.serviceType || '';
        if (['Tempering', 'Lamination', 'Double Glazing'].includes(svcType)) {
          navigate('/production');
        } else {
          alert(`Trip ${tripId} Created. ${newDispatches.length} stop(s).`);
        }
    };

    const resetForm = () => { setTripHeader({ date: new Date().toISOString().split('T')[0], time: '09:00', originLocation: 'Factory', vehicleId: '' }); setStops([]); };

    const handleDispatchAction = async (id: string) => {
        const allDispatches = ProductionService.getTemperingDispatches();
        const targetDispatch = allDispatches.find(d => d.id === id);
        if (!targetDispatch) return;

        // ── Sprint 13: Hard capacity block ────────────────────────────
        // Look up vehicle's max payload + compute total trip weight
        // (sum of piece sqft × glass weight per sqft from store MAP).
        try {
          const dispatchVehicles = await ProductionService.getDispatchVehicles(targetDispatch.company);
          const vehicle = dispatchVehicles.find(v => v.plate_number === targetDispatch.vehicleNo)
                       ?? dispatchVehicles.find(v => v.id === (targetDispatch as { dispatch_vehicle_id?: string }).dispatch_vehicle_id);

          if (vehicle && vehicle.max_payload_kg > 0) {
            const tripPieces = pieces.filter(p => p.dispatchId === id);
            const store      = InventoryService.getStore();
            let weightKg = 0;
            tripPieces.forEach(p => {
              const order = jobOrders.find(o => o.orderNo === p.orderId || o.id === p.orderId);
              const item  = order?.items[p.itemIndex];
              const sqft  = item?.totalSqFt ? item.totalSqFt / Math.max(item.qty || 1, 1) : 0;
              const thk   = String(item?.glassSize || '').replace(/[^0-9.]/g, '') || '6';
              const storeItem = store.find((s: { company: string; name?: string }) =>
                s.company === targetDispatch.company && (s.name || '').includes(`${thk}`));
              const perSqftKg = (storeItem as { perSqftWeightKg?: number })?.perSqftWeightKg ?? 0.14 * Number(thk);
              weightKg += sqft * perSqftKg;
            });

            if (weightKg > vehicle.max_payload_kg) {
              const overKg = Math.round(weightKg - vehicle.max_payload_kg);
              toast.error(
                `Vehicle overloaded: ${Math.round(weightKg).toLocaleString()} kg load vs ` +
                `${vehicle.max_payload_kg.toLocaleString()} kg capacity (+${overKg.toLocaleString()} kg over). ` +
                `Split into 2 trips or use a larger vehicle.`,
                { duration: 9000 },
              );
              return;
            }
          }
        } catch { /* capacity check best-effort — continue if it fails */ }

        // ── Sprint 11: Mandatory gate pass before Dispatched ──────────
        // Find a gate pass for this dispatch's company. The user must have
        // issued a GP through GateControl already; otherwise abort.
        const gatePasses = ProductionService.getGatePasses()
          .filter((gp: any) => gp.company === targetDispatch.company);

        // Prefer a GP already linked to this dispatch (re-authorization);
        // else the most recent unattached GP for the company.
        const linkedGp = gatePasses.find((gp: any) => gp.linkedDispatchId === id);
        const candidate: any = linkedGp ?? gatePasses
          .filter((gp: any) => !gp.linkedDispatchId)
          .sort((a: any, b: any) => String(b.id).localeCompare(String(a.id)))[0];

        if (!candidate) {
            toast.error(
              `Gate pass required before dispatch. Issue a gate pass for ${targetDispatch.company} ` +
              `in Logistics → Gate Control, then retry.`,
              { duration: 8000 },
            );
            return;
        }

        if (!confirm(
            `Mark trip as DISPATCHED?\n\n` +
            `Gate pass: ${candidate.id}\n` +
            `Vehicle: ${targetDispatch.vehicleNo}\n` +
            `Pieces: ${targetDispatch.pieceIds?.length ?? 0}\n\n` +
            `This freezes the manifest.`,
        )) return;

        // ── Sprint 11: Atomic authorize via DB RPC (DB-level guard) ───
        const auth = await DispatchService.authorizeDispatch(id, candidate.id);
        if (auth.error) {
            toast.error(auth.error, { duration: 9000 });
            return;
        }

        // 1. Update Dispatch Status (mirror to local cache so UI stays in sync)
        const updatedDispatches = allDispatches.map(d =>
          d.id === id
            ? { ...d, status: 'Dispatched' as const, gatePassId: candidate.id }
            : d,
        );
        ProductionService.saveTemperingDispatches(updatedDispatches);

        // Sprint 11: append GATE_OUT + IN_TRANSIT lifecycle events
        await DispatchService.markGateOut(id, candidate.id);
        await DispatchService.markInTransit(id);
        
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
        
        // 2b. Auto-update Sales Order status when Site Delivery completes
        if (targetDispatch.serviceType === 'Site Delivery') {
          const deliveredPieceIds = updatedPieces.filter(p => p.dispatchId === id).map(p => p.orderId);
          const affectedOrderNos = Array.from(new Set(deliveredPieceIds));
          for (const orderNo of affectedOrderNos) {
            const orderPieces = updatedPieces.filter(p => p.orderId === orderNo);
            if (orderPieces.length > 0 && orderPieces.every(p => p.status === 'Delivered')) {
              const allQ = SalesService.getQuotations();
              SalesService.saveQuotations(allQ.map(q => (q.orderNo === orderNo || q.id === orderNo) && q.status === 'Approved' ? { ...q, isAlreadyDispatched: true, actualDeliveryDate: new Date().toISOString().split('T')[0] } : q));
              const events = FinanceService.getFinancialEvents();
              const order = allQ.find(q => q.orderNo === orderNo || q.id === orderNo);
              const client = order?.clientId ? SalesService.getClients().find(c => c.id === order.clientId) : null;
              FinanceService.saveFinancialEvents([...events, { id: `EVT-DEL-${Date.now()}`, company, date: new Date().toISOString().split('T')[0], sourceModule: 'Sales' as const, description: `DELIVERY COMPLETE: ${orderNo} — ${client?.name || 'Client'}`, amount: 0, referenceId: orderNo, status: 'Pending' as const }]);
            }
          }
        }

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
        if (!confirm("CANCEL trip? Unloads items and deletes records.")) return;
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
        if (totalFare <= 0) return alert("No charges recorded for this trip.");

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
                                   <h4 className="font-black text-slate-800 uppercase text-sm leading-none">
                                     {group.vehicle} <span className="text-slate-400 mx-2">|</span> {group.driver}
                                     <span className={`ml-3 text-[9px] font-black px-2 py-0.5 rounded-full ${
                                       group.stops[0]?.company === 'Glassco' ? 'bg-blue-100 text-blue-700' :
                                       group.stops[0]?.company === 'GTK' ? 'bg-emerald-100 text-emerald-700' :
                                       group.stops[0]?.company === 'GTI' ? 'bg-purple-100 text-purple-700' :
                                       'bg-slate-100 text-slate-600'
                                     }`}>{group.stops[0]?.company || '—'}</span>
                                   </h4>
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
                                       <span className="text-[10px] font-black uppercase">Fare: {(Number(totalFare) || 0).toLocaleString()}</span>
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
                                   <th className="px-6 py-3 text-center">Pieces</th>
                                   <th className="px-6 py-3 text-center">Orders</th>
                                   <th className="px-6 py-3 text-right">SqFt</th>
                                   <th className="px-6 py-3 text-right">Action</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100 text-xs">
                               {group.stops.map((stop, idx) => {
                                   const stopPieces = pieces.filter(p => p.dispatchId === stop.id);
                                   const stopPieceCount = stopPieces.length;
                                   const stopOrderCount = new Set(stopPieces.map(p => p.orderId)).size;
                                   const stopSqFt = stop.totalSqFt || stopPieces.reduce((s, p) => s + (p.totalSqFt || 0), 0);
                                   return (
                                   <tr key={stop.id} className="hover:bg-slate-50">
                                       <td className="px-6 py-3 font-mono font-bold text-slate-500">{stop.id}</td>
                                       <td className="px-6 py-3 font-bold text-slate-800 uppercase">{stop.plantName}</td>
                                       <td className="px-6 py-3"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">{stop.serviceType}</span></td>
                                       <td className="px-6 py-3 text-center font-black">{stopPieceCount}</td>
                                       <td className="px-6 py-3 text-center font-bold text-blue-600">{stopOrderCount}</td>
                                       <td className="px-6 py-3 text-right font-bold text-slate-600">{stopSqFt.toFixed(1)}</td>
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
                              <div className="col-span-3 space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-indigo-600">Assign Vehicle</label>
                                  <select className="sap-input w-full font-bold uppercase" value={tripHeader.vehicleId} onChange={e => setTripHeader({...tripHeader, vehicleId: e.target.value})}>
                                      <option value="">-- Select Vehicle --</option>
                                      {allVehicles.map(v => (<option key={v.id} value={v.id}>{v.plateNo} — {v.driverName} ({v.owner})</option>))}
                                  </select>
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
             const MAX_ROWS = 25;
             const chunks: typeof allDispatchPieces[] = [];
             let currentChunk: typeof allDispatchPieces = [];
             allDispatchPieces.forEach((p, index) => {
                 currentChunk.push(p);
                 if (currentChunk.length === MAX_ROWS && index < allDispatchPieces.length - 1) {
                     chunks.push(currentChunk);
                     currentChunk = [];
                 }
             });
             if (currentChunk.length > 0) chunks.push(currentChunk);

             return (
               <div className="print-only bg-white text-black p-0 font-sans leading-tight min-h-screen flex flex-col">
                <style>{`
                      @media print {
                          @page { size: A4; margin: 10mm 12mm; }
                          body { margin: 10mm 12mm; padding: 0; }
                          html, body { height: auto !important; overflow: visible !important; background: white !important; }
                          body * { visibility: hidden; }
                          .print-only, .print-only * { visibility: visible; }
                          .print-only { position: absolute; top: 0; left: 0; width: 100%; background: white; z-index: 99999; }
                          .print-container { width: 100% !important; padding: 8mm !important; box-sizing: border-box !important; }
                          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                          .bg-slate-50 { background-color: #f8fafc !important; }
                          .bg-slate-100 { background-color: #f1f5f9 !important; }
                          table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
                          thead { display: table-header-group; }
                          tr { page-break-inside: avoid; page-break-after: auto; }
                          .page-break-before { page-break-before: always; }
                      }
                      .font-pill-challan { border: 2px solid #0f172a; border-radius: 9999px; padding: 6px 50px; font-weight: 900; letter-spacing: 0.2em; color: #0f172a; }
                  `}</style>

                <div className="print-container">
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

                     <div className="flex justify-center my-6">
                         <div className="font-pill-challan text-sm uppercase">D E L I V E R Y &nbsp; C H A L L A N</div>
                     </div>

                     <div className="flex justify-between mb-6 text-[10px]">
                         <div className="space-y-1">
                             <p className="text-slate-400 font-bold uppercase tracking-tighter">DESTINATION:</p>
                             <h3 className="text-2xl font-black text-slate-900 leading-none uppercase">{printingDispatch.plantName}</h3>
                             <p className="text-indigo-700 font-black uppercase">Service Type: {printingDispatch.serviceType}</p>
                         </div>
                         <div className="text-right space-y-1">
                             <div className="flex justify-end space-x-2">
                                 <span className="text-slate-400 font-bold uppercase">CHALLAN REF:</span>
                                 <span className="text-blue-700 font-black">{printingDispatch.id}</span>
                             </div>
                             <div className="flex justify-end space-x-2">
                                 <span className="text-slate-400 font-bold uppercase">DATE:</span>
                                 <span className="font-black text-slate-700">{printingDispatch.date}</span>
                             </div>
                             <div className="flex justify-end space-x-2">
                                 <span className="text-slate-400 font-bold uppercase">VEHICLE:</span>
                                 <span className="font-black text-slate-900">{printingDispatch.vehicleNo}</span>
                             </div>
                             <div className="flex justify-end space-x-2">
                                 <span className="text-slate-400 font-bold uppercase">DRIVER:</span>
                                 <span className="font-black text-slate-900">{printingDispatch.driverName}</span>
                             </div>
                         </div>
                     </div>

                     {(() => {
                         const totalSqFt = allDispatchPieces.reduce((sum, p) => {
                             const order = jobOrders.find(o => o.orderNo === p.orderId);
                             const item = order?.items[p.itemIndex];
                             return sum + (item ? (item.totalSqFt / (item.qty || 1)) : 0);
                         }, 0);
                         
                         return (
                             <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex items-center justify-between">
                                 <div className="flex space-x-8 border-r border-slate-200 pr-8">
                                     <div>
                                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Quantity</p>
                                         <p className="text-lg font-black text-slate-900">{allDispatchPieces.length} <span className="text-[10px] text-slate-400">Pcs</span></p>
                                     </div>
                                     <div>
                                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Estimated Ft²</p>
                                         <p className="text-lg font-black text-blue-700">{totalSqFt.toFixed(2)}</p>
                                     </div>
                                 </div>
                                 <div className="flex flex-wrap gap-x-4 gap-y-1 justify-end flex-1 pl-6">
                                     <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-md px-2 py-0.5">
                                         <span className="text-[8px] font-black text-slate-400 uppercase">LOAD TYPE:</span>
                                         <span className="text-[10px] font-black text-slate-700 uppercase">{printingDispatch.serviceType}</span>
                                     </div>
                                     <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-md px-2 py-0.5">
                                         <span className="text-[8px] font-black text-slate-400 uppercase">ORIGIN:</span>
                                         <span className="text-[10px] font-black text-slate-700 uppercase">{printingDispatch.pickLocation || 'FACTORY'}</span>
                                     </div>
                                 </div>
                             </div>
                         );
                     })()}

                     <div className="flex-1">
                         {chunks.map((chunk, chunkIdx) => (
                             <div key={chunkIdx} className={chunkIdx > 0 ? 'page-break-before mt-8' : ''}>
                                 <table className="w-full text-left border-collapse text-[10px]">
                                     <thead>
                                         <tr className="bg-slate-50 border-y border-slate-300 text-[9px] font-black uppercase tracking-widest text-slate-600">
                                             <th className="py-2.5 px-2 text-center w-10">S.No</th>
                                             <th className="py-2.5 px-2">Piece Description & Ref Order</th>
                                             <th className="py-2.5 px-2 text-center w-32">Size (Inches)</th>
                                             <th className="py-2.5 px-2 text-center w-16">Qty</th>
                                             <th className="py-2.5 px-2 text-center w-20">Received</th>
                                         </tr>
                                     </thead>
                                     <tbody className="divide-y divide-slate-200">
                                         {chunk.map((p, idx) => {
                                             const order = jobOrders.find(o => o.orderNo === p.orderId);
                                             const item = order?.items[p.itemIndex];
                                             return (
                                                 <tr key={p.id}>
                                                     <td className="py-2 px-2 text-center text-slate-400 font-bold">{chunkIdx * MAX_ROWS + idx + 1}</td>
                                                     <td className="py-2 px-2">
                                                         <p className="font-black text-slate-800 uppercase leading-tight">{p.id}</p>
                                                         <p className="text-[7.5px] font-bold text-blue-600 uppercase mt-0.5 tracking-tighter">Specs: {p.specs}</p>
                                                         <p className="text-[7px] text-slate-400 font-bold uppercase italic">Ref Order: {p.orderId}</p>
                                                     </td>
                                                     <td className="py-2 px-2 text-center font-bold text-slate-700">
                                                         {item ? `${item.inchW}.${item.sootW || 0} x ${item.inchH}.${item.sootH || 0}` : '-'}
                                                     </td>
                                                     <td className="py-2 px-2 text-center font-black text-slate-900">1</td>
                                                     <td className="py-2 px-2 text-center text-slate-300">_______</td>
                                                 </tr>
                                             );
                                         })}
                                     </tbody>
                                 </table>
                             </div>
                         ))}
                     </div>

                     <div className="mt-10 pt-6 border-t-2 border-slate-900 break-inside-avoid">
                         <div className="flex justify-between items-start">
                             <div className="w-[55%]">
                                 <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 mb-3 border-b border-slate-200 pb-1">Safety & Protocol</h4>
                                 <ul className="text-[9px] space-y-1.5 text-slate-600 font-bold leading-tight">
                                     <li className="flex items-start space-x-2"><span className="text-slate-300">•</span><span>Receiver acknowledges items in good condition.</span></li>
                                     <li className="flex items-start space-x-2"><span className="text-slate-300">•</span><span>Any breakage or mismatch must be reported immediately.</span></li>
                                     <li className="flex items-start space-x-2"><span className="text-rose-500">•</span><span className="text-slate-900 italic font-black uppercase">Fragile Material - Handle with Industrial Safety Standards.</span></li>
                                 </ul>
                             </div>
                         </div>

                         <div className="mt-24 grid grid-cols-3 gap-10">
                             <div className="border-t border-slate-900 pt-2 text-center text-[9px] font-black uppercase text-slate-400">Warehouse Controller</div>
                             <div className="border-t border-slate-900 pt-2 text-center text-[9px] font-black uppercase text-slate-400">Transporter</div>
                             <div className="border-t border-slate-900 pt-2 text-center text-[9px] font-black uppercase text-slate-900 font-black">Receiver's Signature</div>
                         </div>

                         <div className="mt-8 text-center">
                             <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-300 italic">
                                 Computer generated delivery document. Document ID: {printingDispatch.id}
                             </p>
                         </div>
                     </div>
                </div>
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
                       @page { size: A4; margin: 10mm 12mm; }
                       body { margin: 10mm 12mm; padding: 0; }
                       html, body { height: auto !important; overflow: visible !important; background: white !important; }
                       body * { visibility: hidden; }
                       .print-only, .print-only * { visibility: visible; }
                       .print-only { display: block !important; position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; background: white !important; z-index: 99999 !important; }
                       .print-container { width: 100% !important; padding: 8mm !important; box-sizing: border-box !important; }
                       * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                       .bg-slate-50 { background-color: #f8fafc !important; }
                       .bg-slate-100 { background-color: #f1f5f9 !important; }
                       table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
                          thead { display: table-header-group; }
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

export default React.memo(DispatchPlanner);
