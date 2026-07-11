import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { GatePass, ProductionPiece, TemperingDispatch, Quotation, Client } from '@/modules/shared/types';
import { ProductionService } from '@/modules/production/services/productionService';
import { ShieldCheck, Package, CheckCircle2, ScanLine } from 'lucide-react';
import { getClientName, isInternal } from '@/modules/procurement/components/logistics/LogisticsUtils';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';

interface SecurityAuditProps {
    gatePasses: GatePass[];
    pieces: ProductionPiece[];
    dispatches: TemperingDispatch[];
    jobOrders: Quotation[];
    clients: Client[];
    refreshData: () => void;
}

export const SecurityAudit: React.FC<SecurityAuditProps> = ({ gatePasses, pieces, dispatches, jobOrders, clients, refreshData }) => {
    const [selectedPassForCheck, setSelectedPassForCheck] = useState<GatePass | null>(null);
    const [verifiedPieces, setVerifiedPieces] = useState<Set<string>>(new Set());

    const toggleVerifiedPiece = (id: string) => {
        const next = new Set(verifiedPieces);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setVerifiedPieces(next);
    };

    const handleAllowGatePass = async (id: string) => {
        if (!await confirmModal("Confirm security check complete? This will allow the vehicle movement.")) return;
        
        const currentPass = gatePasses.find(g => g.id === id);
        if (currentPass && currentPass.type === 'Inward') {
            const allPieces = ProductionService.getProductionPieces();
            const updatedPieces = allPieces.map(p => {
                if (verifiedPieces.has(p.id)) {
                    const isFromVendor = !isInternal(currentPass.fromVendor);
                    return { 
                        ...p, 
                        status: (isFromVendor ? 'Tempered' : 'Ready to Dispatch') as any, 
                        lastUpdated: new Date().toISOString() 
                    };
                }
                return p;
            });
            ProductionService.saveProductionPiecesBg(updatedPieces);
        }
    
        const all = ProductionService.getGatePasses();
        const updated = all.map(g => g.id === id ? { ...g, status: 'Allowed' as const } : g);
        ProductionService.saveGatePasses(updated);
        
        refreshData();
        setSelectedPassForCheck(null);
        setVerifiedPieces(new Set());
        toast.success("Authorization Successful: Pieces updated in Job Cards.", { duration: 3000 });
    };

    const getVerifyGroups = useMemo(() => {
        if (!selectedPassForCheck) return [];
        
        let flatItems: any[] = [];
        if (!selectedPassForCheck.linkedDispatchId) {
            flatItems = [{ 
                id: 'MANUAL-ENTRY', 
                orderId: 'MANUAL',
                desc: selectedPassForCheck.materialDetails, 
                client: selectedPassForCheck.fromVendor || 'Direct'
            }];
        } else {
            const dispatch = dispatches.find(d => d.id === selectedPassForCheck.linkedDispatchId);
            if (!dispatch) return [];
            flatItems = dispatch.pieceIds.map(pid => {
                const p = pieces.find(x => x.id === pid);
                return {
                    id: pid,
                    orderId: p?.orderId || 'UNKNOWN',
                    desc: p?.specs || 'Unknown Piece',
                    client: getClientName(p?.orderId || '', jobOrders, clients)
                };
            });
        }
    
        const groups: Record<string, { orderId: string, client: string, items: any[] }> = {};
        flatItems.forEach(item => {
            if (!groups[item.orderId]) {
                groups[item.orderId] = { orderId: item.orderId, client: item.client, items: [] };
            }
            groups[item.orderId].items.push(item);
        });
    
        return Object.values(groups);
    }, [selectedPassForCheck, pieces, dispatches, jobOrders, clients]);

    return (
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)] animate-in slide-in-from-right duration-300">
            <div className="col-span-4 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div className="p-4 bg-slate-50 border-b font-black uppercase text-xs text-slate-500 tracking-widest flex items-center justify-between">
                    <span>Pending Verification</span>
                    <span className="bg-amber-50 text-white px-2 py-0.5 rounded-full text-[9px]">{gatePasses.filter(g => g.status === 'Pending').length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {gatePasses.filter(g => g.status === 'Pending').map(gp => (
                        <div 
                            key={gp.id} 
                            onClick={() => { setSelectedPassForCheck(gp); setVerifiedPieces(new Set()); }}
                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedPassForCheck?.id === gp.id ? 'border-emerald-500 bg-emerald-50' : 'border-transparent hover:bg-slate-50'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${gp.type === 'Inward' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{gp.type}</span>
                                <span className="text-[10px] font-black text-slate-400">{gp.id}</span>
                            </div>
                            <h4 className="font-black text-slate-800 uppercase leading-none mb-1">{gp.vehicleNo}</h4>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">{gp.driverName}</p>
                        </div>
                    ))}
                    {gatePasses.filter(g => g.status === 'Pending').length === 0 && (
                        <div className="text-center py-20 text-slate-300 italic text-xs font-bold uppercase">Safe Harbor: All vehicles cleared</div>
                    )}
                </div>
            </div>

            <div className="col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden relative">
                {selectedPassForCheck ? (
                    <>
                        <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                            <div className="flex items-center space-x-4">
                                <div className="p-3 bg-emerald-500 rounded-xl shadow-lg shadow-emerald-500/20"><ShieldCheck size={24}/></div>
                                <div>
                                    
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                        Ref: {selectedPassForCheck.id} | {selectedPassForCheck.vehicleNo}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-black uppercase text-emerald-400">{selectedPassForCheck.type} LOG</p>
                                <p className="text-[10px] text-slate-500 font-bold uppercase">{selectedPassForCheck.timestamp}</p>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-8 space-y-8">
                            {getVerifyGroups.map((group, gIdx) => (
                                <div key={group.orderId} className="space-y-4">
                                    <div className="flex items-center justify-between border-b pb-2">
                                        <div className="flex items-center space-x-3">
                                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Package size={16}/></div>
                                            <div>
                                                <h4 className="text-sm font-black text-slate-800 uppercase leading-none">{group.orderId}</h4>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{group.client}</p>
                                            </div>
                                        </div>
                                        <span className="text-[9px] font-black text-slate-400 uppercase">{group.items.length} Units</span>
                                    </div>
                                    <div className="space-y-2 pl-4">
                                        {group.items.map(item => {
                                            const isVerified = verifiedPieces.has(item.id);
                                            return (
                                                <div key={item.id} onClick={() => toggleVerifiedPiece(item.id)} className={`flex items-center p-3 rounded-xl border transition-all cursor-pointer ${isVerified ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100 hover:border-blue-200 shadow-sm'}`}>
                                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 mr-4 transition-all ${isVerified ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 text-transparent'}`}>
                                                        <CheckCircle2 size={16} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className={`text-xs font-black uppercase ${isVerified ? 'text-emerald-800' : 'text-slate-800'}`}>{item.id}</p>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5 truncate">{item.desc}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-6 border-t bg-slate-50 shrink-0">
                            <button 
                                onClick={() => handleAllowGatePass(selectedPassForCheck.id)}
                                className="w-full py-4 rounded-2xl bg-slate-900 hover:bg-emerald-600 text-white font-black uppercase text-sm tracking-[0.25em] shadow-xl transition-all active:scale-95 flex items-center justify-center space-x-3"
                            >
                                <ScanLine size={20}/> <span>Authorize & Sync Production</span>
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-300">
                        <div className="w-32 h-32 bg-slate-50 rounded-[3rem] flex items-center justify-center mb-6">
                            <ShieldCheck size={64} className="opacity-10"/>
                        </div>
                        <p className="font-black uppercase tracking-[0.3em] text-xs">Security Check Terminal Idle</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">Select a pending gate pass to begin verification</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default React.memo(SecurityAudit);
