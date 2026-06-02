
import React, { useState } from 'react';
import { GatePass, TemperingDispatch } from '../../../../shared/types';
import { ProductionService } from '../../../../production/services/productionService';
import { Truck } from 'lucide-react';
import { toast } from 'sonner';

interface FactoryGateControlProps {
    dispatches: TemperingDispatch[];
    gatePasses: GatePass[];
    refreshData: () => void;
}

const FactoryGateControl: React.FC<FactoryGateControlProps> = ({ dispatches, gatePasses, refreshData }) => {
    const [gateForm, setGateForm] = useState({
        vehicleNo: '',
        driverName: '',
        linkedDispatchId: '',
        remarks: ''
    });

    const handleCreateGatePass = () => {
        if (!gateForm.vehicleNo || !gateForm.linkedDispatchId) {
            toast.error("Vehicle and Dispatch Link required.");
            return;
        }
        
        const dispatch = dispatches.find(d => d.id === gateForm.linkedDispatchId);
        if (!dispatch) return;

        const newPass: GatePass = {
            id: `GP-FAC-${Date.now().toString().slice(-6)}`,
            company: 'Factory',
            type: 'Outward',
            mvmntCode: '601',
            vehicleNo: gateForm.vehicleNo.toUpperCase(),
            driverName: gateForm.driverName.toUpperCase(),
            materialDetails: `${dispatch.company} Shipment: ${dispatch.pieceIds.length} Items -> ${dispatch.plantName}`,
            qty: dispatch.pieceIds.length,
            unit: 'Units',
            tareWeight: 0, grossWeight: 0, isReturnable: false,
            timestamp: new Date().toLocaleString(),
            status: 'Allowed',
            linkedDispatchId: dispatch.id
        };

        ProductionService.saveGatePasses([...ProductionService.getGatePasses(), newPass]);

        const allDispatches = ProductionService.getTemperingDispatches();
        const updatedDispatches = allDispatches.map(d => 
            d.id === dispatch.id ? { ...d, status: 'Dispatched' as const, vehicleNo: gateForm.vehicleNo, driverName: gateForm.driverName } : d
        );
        ProductionService.saveTemperingDispatches(updatedDispatches);

        ProductionService.getProductionPiecesAsync().then(allPieces => {
            const updatedPieces = allPieces.map(p => {
                if (p.dispatchId === dispatch.id) {
                    return { ...p, status: 'Dispatched' as any, lastUpdated: new Date().toISOString() };
                }
                return p;
            });
            ProductionService.saveProductionPieces(updatedPieces);
        });

        refreshData();
        setGateForm({ vehicleNo: '', driverName: '', linkedDispatchId: '', remarks: '' });
        toast.success(`Gate Pass Issued. ${dispatch.company} trip marked as Dispatched.`);
    };

    return (
        <div className="grid grid-cols-3 gap-8">
            <div className="col-span-1 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center space-x-3 text-blue-600 mb-2">
                    <Truck size={24}/>
                    <h3 className="font-black uppercase">Issue Central Pass</h3>
                </div>
                <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-2">
                        <label className="text-[10px] font-black uppercase text-blue-700">Link Pending Dispatch</label>
                        <select className="w-full bg-white border border-blue-200 rounded p-2 text-xs font-bold" value={gateForm.linkedDispatchId} onChange={e => setGateForm({...gateForm, linkedDispatchId: e.target.value})}>
                            <option value="">-- Select Shipment --</option>
                            {dispatches.map(d => (
                                <option key={d.id} value={d.id}>[{d.company}] &rarr; {d.plantName} ({d.pieceIds.length} Pcs)</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Vehicle No</label><input type="text" className="sap-input w-full font-black uppercase" value={gateForm.vehicleNo} onChange={e => setGateForm({...gateForm, vehicleNo: e.target.value})}/></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Driver Name</label><input type="text" className="sap-input w-full font-bold uppercase" value={gateForm.driverName} onChange={e => setGateForm({...gateForm, driverName: e.target.value})}/></div>
                    <button onClick={handleCreateGatePass} className="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-blue-700 transition-all">Generate & Dispatch</button>
                </div>
            </div>
            <div className="col-span-2 bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b bg-slate-50"><h4 className="font-black uppercase text-xs text-slate-500">Active Gate Passes (All Units)</h4></div>
                <table className="w-full text-left sap-table">
                    <thead><tr><th>Pass ID</th><th>Movement</th><th>Details</th><th>Status</th></tr></thead>
                    <tbody>
                        {gatePasses.map(g => (
                            <tr key={g.id}>
                                <td className="font-black text-blue-600">{g.id}</td>
                                <td><p className="text-xs font-bold uppercase">{g.vehicleNo}</p><p className="text-[10px] text-slate-400">{g.driverName}</p></td>
                                <td className="text-xs font-medium uppercase text-slate-600">{g.materialDetails}</td>
                                <td><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-black uppercase">Allowed</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FactoryGateControl;
