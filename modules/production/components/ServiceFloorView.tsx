import React, { useState } from 'react';
import { ProductionPiece, ServiceLogEntry, FloorStaff, FloorRole } from '@/modules/shared/types';
import { Sparkles, Hammer, Drill, CheckCircle2, Circle, User, X, ChevronDown } from 'lucide-react';

// Standard cost rates PKR/sqft per service (finance can override via prop)
// These are FALLBACK rates — replaced by monthly pool rate when available.
const DEFAULT_COST_RATES: Record<string, number> = {
    Polishing: 15,
    Grinding:  20,
    Notching:  45,
    Holes:     80,
};

// Which FloorRoles are eligible for each service tab
const SERVICE_ROLES: Record<string, FloorRole[]> = {
    Polishing: ['Polish Operator', 'Machine Operator', 'Helper'],
    Grinding:  ['Machine Operator', 'Polish Operator', 'Helper'],
    Notching:  ['Machine Operator', 'Polish Operator', 'Helper'],
    Holes:     ['Machine Operator', 'Helper'],
};

interface ServiceFloorViewProps {
    pieces: ProductionPiece[];
    onUpdateStatus: (id: string, status: any, extra?: Partial<ProductionPiece>) => void;
    floorStaff?: FloorStaff[];          // roster from ProductionService.getFloorStaff()
    serviceCostRates?: Record<string, number>; // override standard rates (e.g. monthly pool rate)
}

interface CaptureState {
    piece: ProductionPiece;
    service: string;
    workerId: string;
    workerName: string;
    sqft: string;
}

const ServiceFloorView: React.FC<ServiceFloorViewProps> = ({ pieces, onUpdateStatus, floorStaff, serviceCostRates }) => {
    const [activeService, setActiveService] = useState<'Polishing' | 'Grinding' | 'Notching' | 'Holes'>('Polishing');
    const [capture, setCapture] = useState<CaptureState | null>(null);

    const rates = { ...DEFAULT_COST_RATES, ...(serviceCostRates || {}) };
    const filteredPieces = (pieces || []).filter(p => p.status === 'Service-Pending' && p.pendingServices?.includes(activeService));

    // Workers eligible for the active service, filtered by role
    const eligibleWorkers = (floorStaff || []).filter(w =>
        w.isActive && (SERVICE_ROLES[activeService] || []).includes(w.role),
    );

    const openCapture = (piece: ProductionPiece) => {
        setCapture({
            piece,
            service: activeService,
            workerId: '',
            workerName: '',
            sqft: String(piece.sqft || 0),
        });
    };

    const confirmDone = () => {
        if (!capture) return;
        const { piece, service, workerId, workerName, sqft } = capture;
        const sqftNum = parseFloat(sqft) || 0;
        const rate    = rates[service] || 0;

        // Resolve worker name: dropdown selection takes priority over text input
        const resolvedWorker = eligibleWorkers.find(w => w.id === workerId);
        const finalName = resolvedWorker?.name || workerName.trim() || 'Unknown';
        const finalId   = resolvedWorker?.employeeId || workerId || undefined;

        const logEntry: ServiceLogEntry = {
            serviceNick:      service,
            workerId:         finalId,
            workerName:       finalName,
            sqft:             sqftNum,
            costRatePerSqft:  rate,
            totalCost:        Math.round(sqftNum * rate),
            completedAt:      new Date().toISOString(),
        };

        const updatedLog = [...(piece.serviceLog || []), logEntry];
        const remaining  = (piece.pendingServices || []).filter(s => s !== service);

        if (remaining.length === 0) {
            onUpdateStatus(piece.id, 'QC-Pending', { pendingServices: [], serviceLog: updatedLog });
        } else {
            onUpdateStatus(piece.id, 'Service-Pending', { pendingServices: remaining, serviceLog: updatedLog });
        }
        setCapture(null);
    };

    const getIcon = (service: string) => {
        if (service === 'Polishing') return <Sparkles size={16}/>;
        if (service === 'Grinding')  return <Hammer size={16}/>;
        if (service === 'Notching')  return <Drill size={16}/>;
        if (service === 'Holes')     return <Circle size={16}/>;
        return <CheckCircle2 size={16}/>;
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl">
                <Sparkles size={14} className="text-indigo-600 shrink-0"/>
                <span className="text-xs font-black uppercase tracking-widest text-indigo-700">Services Floor</span>
                <span className="text-[10px] text-slate-500 font-bold">Value Addition · Polish · Grind · Notch</span>
                <span className="ml-auto text-xs font-black text-indigo-700 bg-indigo-100 px-3 py-0.5 rounded-full">{filteredPieces.length} in queue</span>
            </div>

            <div className="flex bg-white p-1 rounded-2xl border w-fit shadow-sm overflow-x-auto">
                {(['Polishing', 'Grinding', 'Notching', 'Holes'] as const).map(svc => (
                    <button key={svc} onClick={() => setActiveService(svc)}
                        className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${activeService === svc ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>
                        {getIcon(svc)} <span>{svc === 'Polishing' ? 'Polish / Edge' : svc === 'Grinding' ? 'Grinding (R/D)' : svc}</span>
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPieces.map(p => (
                    <div key={p.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-lg transition-all group relative">
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-xs font-black uppercase text-slate-400">{p.id}</span>
                            <div className="flex space-x-1">
                                {(p.pendingServices || []).map(s => (
                                    <div key={s} className={`p-1.5 rounded-lg ${s === activeService ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-300'}`}>
                                        {getIcon(s)}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 uppercase mb-2 leading-relaxed">{p.specs}</h4>

                        {/* Prior service log for this piece */}
                        {(p.serviceLog || []).length > 0 && (
                            <div className="mb-4 space-y-1">
                                {p.serviceLog!.map((log, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[10px] text-slate-500 font-bold">
                                        <CheckCircle2 size={10} className="text-emerald-500 shrink-0"/>
                                        <span>{log.serviceNick}</span>
                                        <span className="text-slate-400">—</span>
                                        <User size={9}/>
                                        <span>{log.workerName}</span>
                                        <span className="ml-auto text-slate-400">{log.sqft.toFixed(1)} sqft</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={() => openCapture(p)}
                            className="w-full py-3 rounded-xl bg-indigo-50 text-indigo-600 font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center space-x-2"
                        >
                            <CheckCircle2 size={14}/> <span>Mark {activeService} Done</span>
                        </button>
                    </div>
                ))}
                {filteredPieces.length === 0 && (
                    <div className="col-span-full py-20 text-center text-slate-300 font-bold uppercase text-xs italic border-2 border-dashed rounded-[2rem]">
                        No pieces pending for {activeService}.
                    </div>
                )}
            </div>

            {/* ── Worker Capture Modal ───────────────────────────────── */}
            {capture && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm mx-4 p-8 space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-xs font-black uppercase tracking-widest text-indigo-600 mb-1">{capture.service} — Done</div>
                                <div className="text-sm font-bold text-slate-700">{capture.piece.specs}</div>
                                <div className="text-[10px] text-slate-400 font-bold">{capture.piece.id}</div>
                            </div>
                            <button onClick={() => setCapture(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
                                <X size={16}/>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">
                                    Worker *{eligibleWorkers.length > 0 && <span className="text-indigo-400 ml-1">({eligibleWorkers.length} available)</span>}
                                </label>
                                {eligibleWorkers.length > 0 ? (
                                    <div className="relative">
                                        <select
                                            value={capture.workerId}
                                            onChange={e => setCapture(c => c ? { ...c, workerId: e.target.value, workerName: '' } : c)}
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none bg-white"
                                            autoFocus
                                        >
                                            <option value="">— Select Worker —</option>
                                            {eligibleWorkers.map(w => (
                                                <option key={w.id} value={w.id}>
                                                    {w.name} ({w.role} · {w.skillGrade})
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                                    </div>
                                ) : (
                                    <input
                                        type="text"
                                        placeholder="e.g. Shabbir Ahmed"
                                        value={capture.workerName}
                                        onChange={e => setCapture(c => c ? { ...c, workerName: e.target.value } : c)}
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                        autoFocus
                                    />
                                )}
                                {eligibleWorkers.length === 0 && (
                                    <p className="text-[9px] text-amber-500 font-bold mt-1">Add floor staff in Production Setup to enable dropdown</p>
                                )}
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Sq Ft Processed</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={capture.sqft}
                                    onChange={e => setCapture(c => c ? { ...c, sqft: e.target.value } : c)}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            </div>
                            <div className="bg-slate-50 rounded-xl px-4 py-3 flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Labor Cost (@ PKR {rates[capture.service] || 0}/sqft)</span>
                                <span className="text-sm font-black text-indigo-700">
                                    PKR {Math.round((parseFloat(capture.sqft) || 0) * (rates[capture.service] || 0)).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setCapture(null)}
                                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all">
                                Cancel
                            </button>
                            <button onClick={confirmDone}
                                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                                <CheckCircle2 size={14}/> Confirm Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ServiceFloorView;
