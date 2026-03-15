
import React from 'react';
import { Project, PurchaseOrder, Client } from '../../shared/types';
import { X, Coins, FileText } from 'lucide-react';

interface CostControlSheetProps {
    project: Project;
    client?: Client;
    purchaseOrders: PurchaseOrder[];
    onClose: () => void;
    onUpdateValue: (val: number) => void;
}

const CostControlSheet: React.FC<CostControlSheetProps> = ({ project, client, purchaseOrders, onClose, onUpdateValue }) => {
    const totalConsumed = (project.glassConsumed || 0) + (project.aluminiumConsumed || 0) + (project.hardwareConsumed || 0) + (project.consumablesConsumed || 0) + (project.otherConsumed || 0);
    const finalVal = project.finalSettlementValue || project.value || 0;
    const profit = finalVal - totalConsumed;
    const margin = finalVal > 0 ? (profit / finalVal) * 100 : 0;

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in zoom-in duration-300">
            <div className="bg-white rounded-[2.5rem] w-full max-w-5xl h-[90vh] shadow-2xl overflow-hidden flex flex-col border border-slate-300">
                <div className="px-10 py-8 bg-white border-b flex justify-between items-start shrink-0">
                    <div>
                        <h2 className="text-3xl font-black uppercase text-slate-900 leading-none">{project.title}</h2>
                        <p className="text-sm font-bold text-blue-600 uppercase mt-2">{client?.name} | {project.manualRef || project.id}</p>
                    </div>
                    <button onClick={onClose} className="hover:bg-slate-100 p-2 rounded-full transition-colors"><X size={32}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-10 bg-slate-50 space-y-10">
                    <div className="grid grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-2xl border shadow-sm">
                            <p className="text-[10px] font-black text-slate-400 uppercase">Total Budget</p>
                            <p className="text-2xl font-black text-emerald-600">PKR {project.value.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border shadow-sm">
                            <p className="text-[10px] font-black text-slate-400 uppercase">Consumed Actuals</p>
                            <p className="text-2xl font-black text-rose-600">PKR {(totalConsumed ?? 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border shadow-sm col-span-2">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Category Consumption</p>
                            <div className="flex space-x-2 h-4 rounded-full overflow-hidden bg-slate-100">
                                <div className="bg-blue-500 h-full" style={{ width: `${((project.glassConsumed || 0) / project.value) * 100}%` }} title="Glass"></div>
                                <div className="bg-orange-500 h-full" style={{ width: `${((project.aluminiumConsumed || 0) / project.value) * 100}%` }} title="Aluminium"></div>
                                <div className="bg-slate-600 h-full" style={{ width: `${((project.hardwareConsumed || 0) / project.value) * 100}%` }} title="Hardware"></div>
                                <div className="bg-purple-500 h-full" style={{ width: `${((project.otherConsumed || 0) / project.value) * 100}%` }} title="Other"></div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[2rem] border border-blue-200 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -mr-8 -mt-8 opacity-50"></div>
                        <div className="flex items-center space-x-3 mb-6">
                            <Coins className="text-blue-600" size={24} />
                            <h3 className="font-black text-slate-800 uppercase text-lg">Commercials & Profitability</h3>
                        </div>

                        <div className="grid grid-cols-3 gap-12">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Final Contract Value</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">PKR</span>
                                    <input
                                        type="number"
                                        className="w-full pl-10 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-lg text-slate-800 focus:border-blue-500 outline-none transition-all"
                                        value={project.finalSettlementValue || project.value}
                                        onChange={(e) => onUpdateValue(Number(e.target.value))}
                                    />
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Actual Cost</p>
                                <p className="text-3xl font-black text-rose-600">PKR {(totalConsumed ?? 0).toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Net Estimated Profit</p>
                                <p className={`text-3xl font-black ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>PKR {(profit ?? 0).toLocaleString()}</p>
                                <p className={`text-xs font-bold mt-1 ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{margin.toFixed(1)}% Margin</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b bg-slate-50 flex items-center gap-3">
                            <FileText className="text-slate-500" />
                            <h3 className="font-black text-slate-700 uppercase tracking-tight">Financial Consumption Ledger (POs)</h3>
                        </div>
                        <table className="w-full text-left">
                            <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-500 tracking-widest border-b">
                                <tr><th className="px-8 py-4">Date</th><th className="px-8 py-4">PO Reference</th><th className="px-8 py-4">Vendor</th><th className="px-8 py-4">Category</th><th className="px-8 py-4 text-right">Amount</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-sm">
                                {purchaseOrders.map(po => (
                                    <tr key={po.id} className="hover:bg-slate-50">
                                        <td className="px-8 py-4 font-bold text-slate-500 text-xs">{po.date}</td>
                                        <td className="px-8 py-4 font-black text-blue-600">{po.id}</td>
                                        <td className="px-8 py-4 font-bold text-slate-800 uppercase">{po.toVendor}</td>
                                        <td className="px-8 py-4"><span className="px-2 py-1 rounded text-[10px] font-black uppercase bg-slate-100 text-slate-600">{po.category}</span></td>
                                        <td className="px-8 py-4 text-right font-black text-rose-600">{(po.totalAmount || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {purchaseOrders.length === 0 && <tr><td colSpan={5} className="px-8 py-16 text-center text-slate-300 font-bold uppercase italic text-xs">No Purchase Orders linked.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CostControlSheet;
