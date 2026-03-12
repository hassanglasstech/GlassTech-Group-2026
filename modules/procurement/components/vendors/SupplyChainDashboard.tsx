
import React, { useMemo } from 'react';
import { TemperingDispatch, ProductionPiece, Vendor, Quotation } from '@/modules/shared/types';
import { Factory, Truck, Flame, Layers, AlertTriangle, ArrowRight, DollarSign, Calendar, ShieldCheck } from 'lucide-react';

interface SupplyChainDashboardProps {
    company: string;
    activeTab: 'Tempering' | 'Glass' | 'Transport';
    setActiveTab: (val: 'Tempering' | 'Glass' | 'Transport') => void;
    activeVendor: string | null;
    setActiveVendor: (val: string | null) => void;
    vendors: Vendor[];
    dispatches: TemperingDispatch[];
    pieces: ProductionPiece[];
    onReconcile: (id: string) => void;
    onUpdateReturnDate: (id: string, date: string) => void;
    returnDates: Record<string, string>;
}

const SupplyChainDashboard: React.FC<SupplyChainDashboardProps> = ({ 
    company, activeTab, setActiveTab, activeVendor, setActiveVendor, 
    vendors, dispatches, pieces, onReconcile, onUpdateReturnDate, returnDates 
}) => {

    const getVendorType = (name: string): Vendor['type'] => {
        const stored = vendors.find(v => v.name === name);
        if (stored) return stored.type;
        if (['CITY LOGISTICS', 'SPEED TRANS'].some(t => name.includes(t))) return 'Transport';
        if (['NIPPON', 'GLASSCO'].some(g => name.includes(g))) return 'Glass';
        return 'Tempering';
    };

    const dashboardVendors = useMemo(() => {
        const historyVendors = dispatches.map(d => d.plantName).filter(Boolean);
        const storedVendors = vendors.map(v => v.name);
        const allNames = Array.from(new Set([...historyVendors, ...storedVendors]));
        return allNames.filter(name => getVendorType(name) === activeTab);
    }, [dispatches, vendors, activeTab]);

    const getVendorStats = (vendorName: string) => {
        const vendorDispatches = dispatches.filter(d => d.plantName === vendorName);
        const dispatchIds = vendorDispatches.map(d => d.id);
        const wipPieces = pieces.filter(p => p.status === 'Dispatched' && dispatchIds.includes(p.dispatchId || ''));
        const wipSqFt = vendorDispatches.filter(d => d.status === 'Dispatched').reduce((sum, d) => sum + d.totalSqFt, 0); 
        const billableAmount = vendorDispatches.filter(d => d.status === 'Received' || d.status === 'Dispatched').reduce((sum, d) => sum + (d.totalCharges || 0), 0);
        const brokenAtVendor = pieces.filter(p => p.fault?.description.includes('[VENDOR FAULT]') && dispatchIds.includes(p.dispatchId || ''));
        const deductions = brokenAtVendor.reduce((sum, p) => sum + (p.fault?.costImpact || 0), 0);
        const overdueCount = wipPieces.filter(p => {
            const dispatch = dispatches.find(d => d.id === p.dispatchId);
            if (!dispatch) return false;
            return Math.ceil(Math.abs(new Date().getTime() - new Date(dispatch.date).getTime()) / (86400000)) > 3;
        }).length;
        return { wipCount: wipPieces.length, wipSqFt, billableAmount, deductions, overdueCount };
    };

    if (activeVendor) {
        const stats = getVendorStats(activeVendor);
        const vendorDispatches = dispatches.filter(d => d.plantName === activeVendor).sort((a,b) => b.date.localeCompare(a.date));
        const storedVendor = vendors.find(v => v.name === activeVendor);
        const isTransport = activeTab === 'Transport';

        return (
            <div className="space-y-8 animate-in slide-in-from-right duration-300">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                        <button onClick={() => setActiveVendor(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowRight className="rotate-180" size={24}/></button>
                        <div>
                            <h2 className="text-2xl font-black uppercase text-slate-800">{activeVendor}</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{activeTab} Partner</p>
                            {storedVendor && <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Contact: {storedVendor.contactPerson} | {storedVendor.phone}</p>}
                        </div>
                    </div>
                    <div className="flex space-x-8 text-right">
                        {!isTransport && <div><p className="text-[10px] font-black uppercase text-slate-400">Current WIP</p><p className="text-xl font-black text-blue-600">{stats.wipCount} <span className="text-xs text-slate-400">Pcs</span></p></div>}
                        <div><p className="text-[10px] font-black uppercase text-slate-400">Total Payable</p><p className="text-xl font-black text-emerald-600">PKR {((stats.billableAmount || 0) - (stats.deductions || 0)).toLocaleString()}</p></div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                    <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                       <h3 className="font-black uppercase text-sm tracking-tight text-slate-700">{isTransport ? 'Trip Billing Ledger' : 'Active Supply Chain Trips'}</h3>
                    </div>
                    <table className="w-full text-left sap-table">
                        <thead><tr><th>Trip ID</th><th>Date</th><th>Vehicle</th><th>{isTransport ? 'Route' : 'Items'}</th>{isTransport ? <th className="text-right">Fare</th> : <th>Exp. Return</th>}<th>Status</th>{!isTransport && <th>Action</th>}</tr></thead>
                        <tbody>
                            {vendorDispatches.map(disp => (
                                <tr key={disp.id} className="hover:bg-slate-50">
                                    <td className="font-mono font-black text-blue-600">{disp.id}</td>
                                    <td className="font-bold text-slate-500 text-xs">{disp.date}</td>
                                    <td className="font-bold text-slate-700 text-xs uppercase">{disp.vehicleNo}</td>
                                    <td className="font-black text-xs uppercase">{isTransport ? `${disp.pickLocation || 'Factory'} -> ${disp.plantName}` : `${disp.pieceIds.length} Pcs`}</td>
                                    {isTransport ? <td className="text-right font-black text-emerald-600">{(disp.totalCharges || 0).toLocaleString()}</td> : (
                                        <td><div className="flex items-center space-x-2 bg-white border rounded-lg px-2 py-1 w-fit"><Calendar size={12} className="text-slate-400"/><input type="date" className="text-[10px] font-bold uppercase outline-none bg-transparent w-24" value={returnDates[disp.id] || ''} onChange={(e) => onUpdateReturnDate(disp.id, e.target.value)}/></div></td>
                                    )}
                                    <td><span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${disp.status === 'Dispatched' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{disp.status}</span></td>
                                    {!isTransport && <td>{disp.status === 'Dispatched' && <button onClick={() => onReconcile(disp.id)} className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center space-x-2"><ShieldCheck size={12}/> <span>Reconcile</span></button>}</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="flex justify-between items-center bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-full no-print">
                <div className="flex items-center space-x-1">
                    <button onClick={() => setActiveTab('Tempering')} className={`flex items-center space-x-2 px-6 py-2 rounded-lg font-bold text-xs transition-all whitespace-nowrap ${activeTab === 'Tempering' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}><Flame size={14} /><span>Tempering Partners</span></button>
                    <button onClick={() => setActiveTab('Glass')} className={`flex items-center space-x-2 px-6 py-2 rounded-lg font-bold text-xs transition-all whitespace-nowrap ${activeTab === 'Glass' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}><Layers size={14} /><span>Glass Suppliers</span></button>
                    <button onClick={() => setActiveTab('Transport')} className={`flex items-center space-x-2 px-6 py-2 rounded-lg font-bold text-xs transition-all whitespace-nowrap ${activeTab === 'Transport' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}><Truck size={14} /><span>Logistics & Transport</span></button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {dashboardVendors.map(v => {
                    const stats = getVendorStats(v);
                    return (
                        <div key={v} onClick={() => setActiveVendor(v)} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all cursor-pointer group flex flex-col justify-between h-64 relative overflow-hidden">
                            <div className="flex justify-between items-start relative z-10">
                                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-800 font-black text-xl border">{v.charAt(0)}</div>
                                {stats.overdueCount > 0 && activeTab !== 'Transport' && <div className="flex items-center space-x-1 bg-rose-50 text-rose-600 px-3 py-1 rounded-full border border-rose-100 ml-auto"><AlertTriangle size={12}/> <span className="text-[9px] font-black uppercase">{stats.overdueCount} Overdue</span></div>}
                            </div>
                            <div className="relative z-10">
                                <h3 className="text-2xl font-black text-slate-900 uppercase mb-1">{v}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{activeTab} Vendor</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 border-t pt-4 relative z-10">
                                {activeTab === 'Transport' ? (
                                    <><div><p className="text-[9px] font-black uppercase text-slate-400">Trips</p><p className="text-lg font-black text-slate-800">{dispatches.filter(d => d.plantName === v).length}</p></div><div className="text-right"><p className="text-[9px] font-black uppercase text-slate-400">Billed</p><p className="text-lg font-black text-emerald-600">{(stats.billableAmount/1000).toFixed(1)}k</p></div></>
                                ) : (
                                    <><div><p className="text-[9px] font-black uppercase text-slate-400">WIP Load</p><p className="text-lg font-black text-slate-800">{stats.wipSqFt.toFixed(0)} <span className="text-[9px]">ft²</span></p></div><div className="text-right"><p className="text-[9px] font-black uppercase text-slate-400">Payable</p><p className="text-lg font-black text-emerald-600">{((stats.billableAmount-stats.deductions)/1000).toFixed(1)}k</p></div></>
                                )}
                            </div>
                            <div className="absolute -bottom-6 -right-6 text-slate-50 group-hover:text-blue-50 transition-colors"><Factory size={140}/></div>
                        </div>
                    );
                })}
            </div>
        </>
    );
};

export default SupplyChainDashboard;
