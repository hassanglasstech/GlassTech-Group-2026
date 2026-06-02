
import React, { useState } from 'react';
import { Project, PurchaseOrder, Client } from '../../shared/types';
import { ProjectService } from '../services/projectService';
import { X, Coins, FileText, Plus, CheckCircle2, Clock, AlertTriangle, Info, Save } from 'lucide-react';
import { toast } from 'sonner';

interface CostControlSheetProps {
    project: Project;
    client?: Client;
    purchaseOrders: PurchaseOrder[];
    onClose: () => void;
    onUpdateValue: (val: number) => void;
    onRefresh?: () => void;
    company?: string;
}

const CostControlSheet: React.FC<CostControlSheetProps> = ({ project, client, purchaseOrders, onClose, onUpdateValue, onRefresh, company }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'costs' | 'timeline'>('overview');
    const [showCostForm, setShowCostForm] = useState(false);
    const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
    const [costForm, setCostForm] = useState({
        costType: 'Glass' as 'Glass' | 'Aluminium' | 'Hardware' | 'Installation' | 'Other',
        amount: '',
        description: '',
    });

    const totalConsumed = (project.glassConsumed || 0) + (project.aluminiumConsumed || 0) + (project.hardwareConsumed || 0) + (project.consumablesConsumed || 0) + (project.otherConsumed || 0);
    const finalVal = project.finalSettlementValue || project.value || 0;
    const profit = finalVal - totalConsumed;
    const margin = finalVal > 0 ? (profit / finalVal) * 100 : 0;

    const handleAddCost = () => {
        const amt = Number(costForm.amount);
        if (!amt || amt <= 0) { toast.error('Valid amount zaroori hai'); return; }
        if (!costForm.description.trim()) { toast.error('Description zaroori hai'); return; }
        ProjectService.postProjectCost({
            projectId: project.id,
            company: (company || project.company) as any,
            costType: costForm.costType,
            amount: amt,
            description: costForm.description,
        });
        setCostForm({ costType: 'Glass', amount: '', description: '' });
        setShowCostForm(false);
        onRefresh?.();
        toast.success(`${costForm.costType} cost added — PKR ${amt.toLocaleString()}`);
    };

    const handleComplete = () => {
        ProjectService.completeProject(project.id, (company || project.company) as any, finalVal);
        setShowCompleteConfirm(false);
        onRefresh?.();
        onClose();
        toast.success('Project completed — Revenue GL posted');
    };

    // Timeline icon helper
    const TimelineIcon = ({ type }: { type: string }) => {
        if (type === 'success') return <CheckCircle2 size={14} className="text-emerald-500" />;
        if (type === 'alert')   return <AlertTriangle size={14} className="text-amber-500" />;
        return <Info size={14} className="text-blue-500" />;
    };

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in zoom-in duration-300">
            <div className="bg-white rounded-[2.5rem] w-full max-w-5xl h-[90vh] shadow-2xl overflow-hidden flex flex-col border border-slate-300">

                {/* ── Header ── */}
                <div className="px-10 py-6 bg-white border-b flex justify-between items-start shrink-0">
                    <div>
                        <h2 className="text-2xl font-black uppercase text-slate-900 leading-none">{project.title}</h2>
                        <p className="text-sm font-bold text-blue-600 uppercase mt-1">{client?.name} | {project.manualRef || project.id}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {project.status === 'Active' && (
                            <button
                                onClick={() => setShowCompleteConfirm(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase hover:bg-emerald-700 transition-all">
                                <CheckCircle2 size={14}/> Mark Complete
                            </button>
                        )}
                        <button
                            onClick={() => setShowCostForm(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-blue-700 transition-all">
                            <Plus size={14}/> Add Cost
                        </button>
                        <button onClick={onClose} className="hover:bg-slate-100 p-2 rounded-full transition-colors">
                            <X size={28}/>
                        </button>
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div className="flex border-b bg-slate-50 px-10 shrink-0">
                    {(['overview', 'costs', 'timeline'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                                activeTab === tab
                                    ? 'border-blue-600 text-blue-700 bg-white'
                                    : 'border-transparent text-slate-400 hover:text-slate-700'
                            }`}>
                            {tab === 'overview' ? 'Overview & Financials' : tab === 'costs' ? 'Cost Ledger (POs)' : 'Timeline'}
                        </button>
                    ))}
                </div>

                {/* ── Content ── */}
                <div className="flex-1 overflow-y-auto p-10 bg-slate-50 space-y-8">

                    {/* ── OVERVIEW TAB ── */}
                    {activeTab === 'overview' && (
                        <>
                            {/* KPI Cards */}
                            <div className="grid grid-cols-4 gap-5">
                                <div className="bg-white p-5 rounded-2xl border shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase">Contract Value</p>
                                    <p className="text-xl font-black text-emerald-600">PKR {finalVal.toLocaleString()}</p>
                                </div>
                                <div className="bg-white p-5 rounded-2xl border shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase">Consumed Cost</p>
                                    <p className="text-xl font-black text-rose-600">PKR {totalConsumed.toLocaleString()}</p>
                                </div>
                                <div className={`p-5 rounded-2xl border shadow-sm ${profit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                                    <p className="text-[10px] font-black text-slate-400 uppercase">Est. Profit</p>
                                    <p className={`text-xl font-black ${profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>PKR {profit.toLocaleString()}</p>
                                </div>
                                <div className="bg-white p-5 rounded-2xl border shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase">Margin</p>
                                    <p className={`text-xl font-black ${margin >= 15 ? 'text-emerald-600' : 'text-amber-600'}`}>{margin.toFixed(1)}%</p>
                                </div>
                            </div>

                            {/* Budget vs Actual table */}
                            <div className="bg-white rounded-2xl border overflow-hidden">
                                <div className="px-6 py-4 bg-slate-50 border-b">
                                    <h3 className="font-black text-slate-700 uppercase text-sm">Budget vs Actual by Category</h3>
                                </div>
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-500">
                                        <tr>
                                            <th className="px-6 py-3 text-left">Category</th>
                                            <th className="px-6 py-3 text-right">Budgeted</th>
                                            <th className="px-6 py-3 text-right">Actual</th>
                                            <th className="px-6 py-3 text-right">Remaining</th>
                                            <th className="px-6 py-3 text-right">Utilised</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {[
                                            { label: 'Glass',       budget: project.glassValue || 0,       actual: project.glassConsumed || 0 },
                                            { label: 'Aluminium',   budget: project.aluminiumValue || 0,   actual: project.aluminiumConsumed || 0 },
                                            { label: 'Hardware',    budget: project.hardwareValue || 0,    actual: project.hardwareConsumed || 0 },
                                            { label: 'Consumables', budget: project.consumablesValue || 0, actual: project.consumablesConsumed || 0 },
                                            { label: 'Installation',budget: project.installationValue || 0,actual: project.otherConsumed || 0 },
                                        ].map(row => {
                                            const rem  = row.budget - row.actual;
                                            const pct  = row.budget > 0 ? (row.actual / row.budget * 100) : (row.actual > 0 ? 100 : 0);
                                            const over = row.actual > row.budget && row.budget > 0;
                                            return (
                                                <tr key={row.label} className="hover:bg-slate-50">
                                                    <td className="px-6 py-3 font-bold text-slate-700">{row.label}</td>
                                                    <td className="px-6 py-3 text-right text-slate-500">{row.budget.toLocaleString()}</td>
                                                    <td className={`px-6 py-3 text-right font-bold ${over ? 'text-rose-600' : 'text-slate-800'}`}>{row.actual.toLocaleString()}</td>
                                                    <td className={`px-6 py-3 text-right font-bold ${rem < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{rem.toLocaleString()}</td>
                                                    <td className="px-6 py-3 text-right">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${over ? 'bg-rose-100 text-rose-700' : pct > 80 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                            {pct.toFixed(0)}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="bg-slate-800 text-white">
                                            <td className="px-6 py-3 font-black">TOTAL</td>
                                            <td className="px-6 py-3 text-right font-black">{project.value?.toLocaleString()}</td>
                                            <td className="px-6 py-3 text-right font-black">{totalConsumed.toLocaleString()}</td>
                                            <td className="px-6 py-3 text-right font-black">{(project.value - totalConsumed).toLocaleString()}</td>
                                            <td className="px-6 py-3 text-right font-black">{project.value > 0 ? (totalConsumed/project.value*100).toFixed(0) : 0}%</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Contract value edit */}
                            <div className="bg-white p-6 rounded-2xl border">
                                <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">
                                    Update Final Contract Value
                                </label>
                                <div className="flex gap-3 items-center">
                                    <span className="text-sm font-bold text-slate-400">PKR</span>
                                    <input
                                        type="number"
                                        className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-lg text-slate-800 focus:border-blue-500 outline-none"
                                        value={project.finalSettlementValue || project.value}
                                        onChange={e => onUpdateValue(Number(e.target.value))}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── COSTS TAB ── */}
                    {activeTab === 'costs' && (
                        <div className="bg-white rounded-2xl border overflow-hidden">
                            <div className="p-6 border-b bg-slate-50 flex items-center gap-3">
                                <FileText className="text-slate-500" />
                                <h3 className="font-black text-slate-700 uppercase tracking-tight">Purchase Orders / Cost Ledger</h3>
                            </div>
                            <table className="w-full text-left">
                                <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-500 tracking-widest border-b">
                                    <tr>
                                        <th className="px-6 py-3">Date</th>
                                        <th className="px-6 py-3">PO Reference</th>
                                        <th className="px-6 py-3">Vendor</th>
                                        <th className="px-6 py-3">Category</th>
                                        <th className="px-6 py-3 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 text-sm">
                                    {purchaseOrders.map(po => (
                                        <tr key={po.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 font-bold text-slate-500 text-xs">{po.date}</td>
                                            <td className="px-6 py-3 font-black text-blue-600">{po.id}</td>
                                            <td className="px-6 py-3 font-bold text-slate-800 uppercase">{po.toVendor}</td>
                                            <td className="px-6 py-3">
                                                <span className="px-2 py-1 rounded text-[10px] font-black uppercase bg-slate-100 text-slate-600">{po.category}</span>
                                            </td>
                                            <td className="px-6 py-3 text-right font-black text-rose-600">{(po.totalAmount || 0).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                    {purchaseOrders.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-slate-300 font-bold uppercase text-xs">
                                                No Purchase Orders linked to this project
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ── TIMELINE TAB ── */}
                    {activeTab === 'timeline' && (
                        <div className="bg-white rounded-2xl border overflow-hidden">
                            <div className="p-6 border-b bg-slate-50 flex items-center gap-3">
                                <Clock className="text-slate-500" />
                                <h3 className="font-black text-slate-700 uppercase">Project Timeline & Milestones</h3>
                            </div>
                            <div className="p-6 space-y-3">
                                {(project.timeline || []).length === 0 && (
                                    <p className="text-center text-slate-300 font-bold uppercase text-xs py-8">No timeline events yet</p>
                                )}
                                {[...(project.timeline || [])].reverse().map((event, i) => (
                                    <div key={i} className="flex items-start gap-4 p-4 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100">
                                        <div className="mt-0.5 shrink-0"><TimelineIcon type={event.type} /></div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-700 break-words">{event.event}</p>
                                        </div>
                                        <span className="text-[10px] font-black text-slate-400 shrink-0">{event.date}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Add Cost Modal ── */}
            {showCostForm && (
                <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[300]">
                    <div className="bg-white rounded-2xl w-full max-w-md p-8 shadow-2xl space-y-5">
                        <div className="flex justify-between items-center">
                            <h3 className="font-black text-slate-800 uppercase">Add Project Cost</h3>
                            <button onClick={() => setShowCostForm(false)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Cost Type</label>
                                <select
                                    value={costForm.costType}
                                    onChange={e => setCostForm({...costForm, costType: e.target.value as any})}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-400">
                                    {['Glass','Aluminium','Hardware','Installation','Other'].map(t => <option key={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Amount (PKR)</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={costForm.amount}
                                    onChange={e => setCostForm({...costForm, amount: e.target.value})}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Description</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 10mm glass 40sqft, Schuco T80 profile..."
                                    value={costForm.description}
                                    onChange={e => setCostForm({...costForm, description: e.target.value})}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-400"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button onClick={() => setShowCostForm(false)} className="px-5 py-2 text-slate-400 font-bold text-sm">Cancel</button>
                            <button onClick={handleAddCost} className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-all">
                                <Save size={14}/> Post Cost
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Complete Confirm Modal ── */}
            {showCompleteConfirm && (
                <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[300]">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-8 shadow-2xl text-center space-y-5">
                        <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
                        <h3 className="font-black text-slate-800 uppercase">Complete Project?</h3>
                        <p className="text-sm text-slate-500">
                            Revenue GL entry post hogi — PKR {finalVal.toLocaleString()}<br/>
                            Project status <strong>Completed</strong> ho jayega.
                        </p>
                        <div className="flex justify-center gap-3">
                            <button onClick={() => setShowCompleteConfirm(false)} className="px-5 py-2 text-slate-400 font-bold text-sm">Cancel</button>
                            <button onClick={handleComplete} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-black hover:bg-emerald-700 transition-all">
                                <CheckCircle2 size={14}/> Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


export default CostControlSheet;
