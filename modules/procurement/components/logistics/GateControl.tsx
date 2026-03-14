import React, { useState } from 'react';
import { toast } from 'sonner';
import { Company, GatePass, TemperingDispatch } from '@/modules/shared/types';
import { AppService } from '@/modules/shared/services/appService';
import { ProductionService } from '@/modules/production/services/productionService';
import { Truck, MoveRight, Printer, X, ShieldCheck, Wallet } from 'lucide-react';
import { isInternal } from '@/modules/procurement/components/logistics/LogisticsUtils';

interface GateControlProps {
    company: Company;
    gatePasses: GatePass[];
    dispatches: TemperingDispatch[];
    refreshData: () => void;
}

export const GateControl: React.FC<GateControlProps> = ({ company, gatePasses, dispatches, refreshData }) => {
    const [isGateModalOpen, setIsGateModalOpen] = useState(false);
    const [gateForm, setGateForm] = useState<Partial<GatePass>>({
        type: 'Inward', mvmntCode: '101', vehicleNo: '', vehicleType: 'Mazda', 
        driverName: '', materialDetails: '', qty: 0, unit: 'KG',
        tareWeight: 0, grossWeight: 0, isReturnable: false, status: 'Pending',
        linkedDispatchId: '', fromVendor: ''
    });
    const [secondaryDispatchId, setSecondaryDispatchId] = useState<string>('');
    const [tripFare, setTripFare] = useState<number>(0);

    const handleLinkDispatch = (dispatchId: string) => {
        const trip = dispatches.find(d => d.id === dispatchId);
        if (!trip) return;
        setGateForm({
          ...gateForm,
          linkedDispatchId: dispatchId,
          vehicleNo: trip.vehicleNo !== 'TBD' ? trip.vehicleNo : '',
          driverName: trip.driverName !== 'TBD' ? trip.driverName : '',
          materialDetails: `REF: ${trip.plantName} - ${trip.serviceType}`,
          fromVendor: trip.plantName
        });
        if(trip.totalCharges > 0) setTripFare(trip.totalCharges);
    };

    const handleSaveGatePass = () => {
        if (!gateForm.vehicleNo || !gateForm.driverName) return toast.error("Validation Error: Vehicle and Driver name are mandatory.", { duration: 4000 });
        if (gateForm.type === 'Inward' && !gateForm.fromVendor && !gateForm.linkedDispatchId) return toast.error("Validation Error: Source Vendor or Linked Dispatch is required for Inward Entry.", { duration: 4000 });
    
        const prefix = gateForm.type === 'Inward' ? 'GP-IN' : 'GP-OUT';
        const allGPs = ProductionService.getGatePasses();
        const gpId = AppService.generateSequenceID(prefix, company, allGPs);
    
        const newPass: GatePass = {
          ...(gateForm as GatePass),
          id: gpId,
          company, timestamp: new Date().toLocaleString(), status: 'Pending'
        };
        ProductionService.saveGatePasses([...allGPs, newPass]);

        if (gateForm.linkedDispatchId || secondaryDispatchId) {
            const allDispatches = ProductionService.getTemperingDispatches();
            let updatedDispatches = [...allDispatches];

            let allPieces = ProductionService.getProductionPieces();
            let piecesUpdated = false;

            const updateDispatchList = (targetId: string, isPrimary: boolean) => {
                const targetDispatch = updatedDispatches.find(d => d.id === targetId);
                if (targetDispatch) {
                    const tripId = targetDispatch.tripId;
                    
                    updatedDispatches = updatedDispatches.map(d => {
                        // Vehicle and driver update for all stops in the trip
                        if (d.tripId === tripId) {
                            const updates: any = { 
                                vehicleNo: gateForm.vehicleNo!, 
                                driverName: gateForm.driverName!
                            };
                            
                            // Specific stop-level updates (Status & Primary Fare)
                            if (d.id === targetId) {
                                if (isPrimary) updates.totalCharges = tripFare;
                                
                                if (gateForm.type === 'Outward') {
                                    updates.status = 'Dispatched';
                                } else if (gateForm.type === 'Inward') {
                                    updates.status = 'Received';
                                }
                            }
                            
                            return { ...d, ...updates };
                        }
                        return d;
                    });

                    // Pieces status update (specific to target stop)
                    if (gateForm.type === 'Outward') {
                        targetDispatch.pieceIds.forEach(pid => {
                            const pIndex = allPieces.findIndex(p => p.id === pid);
                            if(pIndex > -1) {
                                allPieces[pIndex].status = 'Dispatched'; 
                                allPieces[pIndex].lastUpdated = new Date().toISOString();
                                piecesUpdated = true;
                            }
                        });
                    } else if (gateForm.type === 'Inward') {
                        targetDispatch.pieceIds.forEach(pid => {
                            const pIndex = allPieces.findIndex(p => p.id === pid);
                            if(pIndex > -1) {
                                // For inward, we might update status to 'Received' or similar, 
                                // but usually Security Audit handles the final piece verification.
                                // Here we just mark the dispatch as received.
                            }
                        });
                    }
                }
            };

            if (gateForm.linkedDispatchId) updateDispatchList(gateForm.linkedDispatchId, true);
            if (secondaryDispatchId) updateDispatchList(secondaryDispatchId, false);

            ProductionService.saveTemperingDispatches(updatedDispatches);
            if(piecesUpdated) ProductionService.saveProductionPieces(allPieces);
        }

        setIsGateModalOpen(false);
        setGateForm({ type: 'Inward', mvmntCode: '101', vehicleNo: '', vehicleType: 'Mazda', driverName: '', materialDetails: '', qty: 0, unit: 'KG', tareWeight: 0, grossWeight: 0, isReturnable: false, status: 'Pending', linkedDispatchId: '', fromVendor: '' });
        setSecondaryDispatchId('');
        setTripFare(0);
        refreshData();
    };

    return (
        <div className="bg-white rounded-lg shadow p-4 border border-slate-200">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Truck className="w-5 h-5 text-blue-600" />
                    Gate Control & Weighbridge
                </h3>
                <button onClick={() => setIsGateModalOpen(true)} className="sap-btn-primary">
                    <MoveRight className="w-4 h-4 mr-2" />
                    New Gate Pass
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-medium border-b">
                        <tr>
                            <th className="p-3">GP ID</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Vehicle / Driver</th>
                            <th className="p-3">Material</th>
                            <th className="p-3">Weight (Net)</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {gatePasses.length === 0 ? (
                            <tr><td colSpan={7} className="p-4 text-center text-slate-500">No gate passes recorded today.</td></tr>
                        ) : (
                            gatePasses.map(gp => (
                                <tr key={gp.id} className="hover:bg-slate-50">
                                    <td className="p-3 font-medium">{gp.id}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded-full text-xs ${gp.type === 'Inward' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {gp.type}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <div className="font-medium">{gp.vehicleNo}</div>
                                        <div className="text-xs text-slate-500">{gp.driverName}</div>
                                    </td>
                                    <td className="p-3">{gp.materialDetails}</td>
                                    <td className="p-3">{gp.grossWeight - gp.tareWeight} {gp.unit}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded-full text-xs ${gp.status === 'Allowed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {gp.status}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <button className="p-1 hover:bg-slate-200 rounded text-slate-600" title="Print Gate Pass">
                                            <Printer className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Gate Pass Modal */}
            {isGateModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center p-4 border-b bg-slate-50">
                            <h3 className="font-semibold text-lg">New Gate Pass Entry</h3>
                            <button onClick={() => setIsGateModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Movement Type</label>
                                    <select 
                                        className="sap-input w-full"
                                        value={gateForm.type}
                                        onChange={(e) => setGateForm({...gateForm, type: e.target.value as 'Inward' | 'Outward'})}
                                    >
                                        <option value="Inward">Inward (Arrival)</option>
                                        <option value="Outward">Outward (Dispatch)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Movement Code</label>
                                    <select 
                                        className="sap-input w-full"
                                        value={gateForm.mvmntCode}
                                        onChange={(e) => setGateForm({...gateForm, mvmntCode: e.target.value})}
                                    >
                                        <option value="101">101 - Goods Receipt</option>
                                        <option value="102">102 - Goods Issue</option>
                                        <option value="501">501 - Returnable Gate Pass</option>
                                        <option value="502">502 - Non-Returnable</option>
                                    </select>
                                </div>
                            </div>

                            {/* Dispatch Linking Section */}
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4" />
                                    Link Dispatch / Trip
                                </h4>
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-blue-700 mb-1">Primary Dispatch (Auto-fills Vehicle/Driver)</label>
                                        <select 
                                            className="sap-input w-full border-blue-200"
                                            value={gateForm.linkedDispatchId}
                                            onChange={(e) => handleLinkDispatch(e.target.value)}
                                        >
                                            <option value="">-- Select Dispatch --</option>
                                            {dispatches
                                                .filter(d => gateForm.type === 'Outward' ? d.status === 'Ready to Dispatch' : d.status === 'Dispatched')
                                                .map(d => (
                                                <option key={d.id} value={d.id}>
                                                    {d.tripId || d.id} - {d.plantName} ({d.serviceType}) [{d.vehicleNo}]
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    {gateForm.type === 'Outward' && (
                                        <div>
                                            <label className="block text-xs font-medium text-blue-700 mb-1">Secondary Dispatch (Multi-drop)</label>
                                            <select 
                                                className="sap-input w-full border-blue-200"
                                                value={secondaryDispatchId}
                                                onChange={(e) => setSecondaryDispatchId(e.target.value)}
                                            >
                                                <option value="">-- Select Secondary Dispatch --</option>
                                                {dispatches
                                                    .filter(d => d.status === 'Ready to Dispatch' && d.id !== gateForm.linkedDispatchId)
                                                    .map(d => (
                                                    <option key={d.id} value={d.id}>
                                                        {d.tripId || d.id} - {d.plantName} ({d.serviceType})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle No</label>
                                    <input 
                                        type="text" 
                                        className="sap-input w-full uppercase"
                                        placeholder="LEA-1234"
                                        value={gateForm.vehicleNo}
                                        onChange={(e) => setGateForm({...gateForm, vehicleNo: e.target.value.toUpperCase()})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Driver Name</label>
                                    <input 
                                        type="text" 
                                        className="sap-input w-full"
                                        placeholder="Driver Name"
                                        value={gateForm.driverName}
                                        onChange={(e) => setGateForm({...gateForm, driverName: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Type</label>
                                    <select 
                                        className="sap-input w-full"
                                        value={gateForm.vehicleType}
                                        onChange={(e) => setGateForm({...gateForm, vehicleType: e.target.value})}
                                    >
                                        <option value="Mazda">Mazda</option>
                                        <option value="Shehzore">Shehzore</option>
                                        <option value="Suzuki">Suzuki</option>
                                        <option value="Bike">Bike</option>
                                        <option value="Truck">Truck (Large)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Source / Vendor</label>
                                    <select 
                                        className="sap-input w-full"
                                        value={gateForm.fromVendor}
                                        onChange={(e) => setGateForm({...gateForm, fromVendor: e.target.value})}
                                        disabled={!!gateForm.linkedDispatchId}
                                    >
                                        <option value="">-- Select Source --</option>
                                        {company === 'Glassco' ? (
                                            <>
                                                <option value="PSG">PSG</option>
                                                <option value="AHM">AHM</option>
                                                <option value="Lakhani">Lakhani</option>
                                                <option value="D/G Plant">D/G Plant</option>
                                                <option value="Lamination Plant">Lamination Plant</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="GTK">GTK (Aluminium Plant)</option>
                                                <option value="GTI">GTI (Tempering Plant)</option>
                                                <option value="NIPPON">NIPPON (Glass Source)</option>
                                                <option value="GLASSCO">GlassCo (Processing)</option>
                                                <option value="EXTERNAL">External Vendor</option>
                                            </>
                                        )}
                                        <option value="Customer">Customer Return</option>
                                        <option value="Market">Market Purchase</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Material Details</label>
                                <textarea 
                                    className="sap-input w-full"
                                    rows={2}
                                    placeholder="Describe items..."
                                    value={gateForm.materialDetails}
                                    onChange={(e) => setGateForm({...gateForm, materialDetails: e.target.value})}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Tare Weight (Empty)</label>
                                    <div className="relative">
                                        <input 
                                            type="number" 
                                            className="sap-input w-full pr-8"
                                            value={gateForm.tareWeight}
                                            onChange={(e) => setGateForm({...gateForm, tareWeight: Number(e.target.value)})}
                                        />
                                        <span className="absolute right-3 top-2 text-xs text-slate-400">KG</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Gross Weight (Loaded)</label>
                                    <div className="relative">
                                        <input 
                                            type="number" 
                                            className="sap-input w-full pr-8"
                                            value={gateForm.grossWeight}
                                            onChange={(e) => setGateForm({...gateForm, grossWeight: Number(e.target.value)})}
                                        />
                                        <span className="absolute right-3 top-2 text-xs text-slate-400">KG</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Net Weight</label>
                                    <div className="sap-input w-full bg-slate-100 flex items-center text-slate-600">
                                        {(gateForm.grossWeight || 0) - (gateForm.tareWeight || 0)} KG
                                    </div>
                                </div>
                            </div>

                            {/* Trip Fare Section */}
                            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                                <h4 className="text-sm font-semibold text-yellow-800 mb-3 flex items-center gap-2">
                                    <Wallet className="w-4 h-4" />
                                    Trip Fare / Logistics Cost
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-yellow-700 mb-1">Total Trip Fare</label>
                                        <input 
                                            type="number" 
                                            className="sap-input w-full border-yellow-200"
                                            value={tripFare}
                                            onChange={(e) => setTripFare(Number(e.target.value))}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div className="flex items-center">
                                        <p className="text-xs text-yellow-600 mt-4">
                                            This amount will be recorded against the primary dispatch for accounting.
                                        </p>
                                    </div>
                                </div>
                            </div>

                        </div>
                        
                        <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
                            <button onClick={() => setIsGateModalOpen(false)} className="sap-btn-secondary">Cancel</button>
                            <button onClick={handleSaveGatePass} className="sap-btn-primary">Create Gate Pass</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GateControl;
