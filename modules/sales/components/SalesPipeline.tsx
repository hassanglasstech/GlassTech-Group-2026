import React, { useState, useMemo } from 'react';
import { Quotation, Client } from '../../shared/types';
import { SalesService } from '../services/salesService';
import { useAppStore } from '../../shared/store/appStore';
import { BarChart3, TrendingUp, Users, FileSignature, DollarSign, Calendar, Filter } from 'lucide-react';

const SalesPipeline: React.FC = () => {
    const company = useAppStore(state => state.selectedCompany);
    const [timeframe, setTimeframe] = useState<'month' | 'quarter' | 'year'>('month');

    const quotations = useMemo(() => SalesService.getQuotations().filter(q => q.company === company), [company]);
    const clients = useMemo(() => SalesService.getClients().filter(c => c.company === company), [company]);

    const stats = useMemo(() => {
        const now = new Date();
        const filtered = quotations.filter(q => {
            const qDate = new Date(q.date);
            if (timeframe === 'month') {
                return qDate.getMonth() === now.getMonth() && qDate.getFullYear() === now.getFullYear();
            } else if (timeframe === 'quarter') {
                const qQuarter = Math.floor(qDate.getMonth() / 3);
                const currentQuarter = Math.floor(now.getMonth() / 3);
                return qQuarter === currentQuarter && qDate.getFullYear() === now.getFullYear();
            }
            return qDate.getFullYear() === now.getFullYear();
        });

        const totalQuotes = filtered.length;
        const approvedQuotes = filtered.filter(q => q.status === 'Approved');
        const pendingQuotes = filtered.filter(q => q.status !== 'Approved');

        const totalValue = filtered.reduce((sum, q) => sum + q.items.reduce((s, i) => s + i.amount, 0), 0);
        const wonValue = approvedQuotes.reduce((sum, q) => sum + q.items.reduce((s, i) => s + i.amount, 0), 0);
        const pendingValue = pendingQuotes.reduce((sum, q) => sum + q.items.reduce((s, i) => s + i.amount, 0), 0);

        const winRate = totalQuotes > 0 ? (approvedQuotes.length / totalQuotes) * 100 : 0;

        return {
            totalQuotes,
            wonQuotes: approvedQuotes.length,
            pendingQuotes: pendingQuotes.length,
            totalValue,
            wonValue,
            pendingValue,
            winRate
        };
    }, [quotations, timeframe]);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border shadow-sm no-print">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><BarChart3 size={20}/></div>
                    <div>
                        <h3 className="font-bold text-slate-700 uppercase">Sales Pipeline Analytics</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Performance & Forecasting</p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <Filter size={16} className="text-slate-400" />
                    <select 
                        className="sap-input py-1.5 text-xs font-bold uppercase"
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value as any)}
                    >
                        <option value="month">This Month</option>
                        <option value="quarter">This Quarter</option>
                        <option value="year">This Year</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><FileSignature size={24}/></div>
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Pipeline</span>
                    </div>
                    <div>
                        <h4 className="text-3xl font-black text-slate-800">{stats.totalQuotes}</h4>
                        <p className="text-xs font-bold text-slate-500 uppercase mt-1">PKR {stats.totalValue.toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><TrendingUp size={24}/></div>
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Won Deals</span>
                    </div>
                    <div>
                        <h4 className="text-3xl font-black text-emerald-600">{stats.wonQuotes}</h4>
                        <p className="text-xs font-bold text-emerald-500 uppercase mt-1">PKR {stats.wonValue.toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><DollarSign size={24}/></div>
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Pending Deals</span>
                    </div>
                    <div>
                        <h4 className="text-3xl font-black text-amber-600">{stats.pendingQuotes}</h4>
                        <p className="text-xs font-bold text-amber-500 uppercase mt-1">PKR {stats.pendingValue.toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Users size={24}/></div>
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Win Rate</span>
                    </div>
                    <div>
                        <h4 className="text-3xl font-black text-indigo-600">{stats.winRate.toFixed(1)}%</h4>
                        <p className="text-xs font-bold text-indigo-400 uppercase mt-1">Conversion</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="p-6 border-b bg-slate-50 flex items-center justify-between">
                    <h3 className="font-black text-slate-700 uppercase tracking-tight text-sm">Recent Pipeline Activity</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left sap-table">
                        <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Quote Ref</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Client</th>
                                <th className="px-6 py-4">Project</th>
                                <th className="px-6 py-4 text-right">Value (PKR)</th>
                                <th className="px-6 py-4 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {quotations.slice(0, 10).map(q => {
                                const clientName = clients.find(c => c.id === q.clientId)?.name || 'Unknown';
                                const totalAmount = q.items.reduce((s, i) => s + (i.amount || 0), 0);
                                return (
                                    <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-black text-blue-600 uppercase text-xs">{q.id}</td>
                                        <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{q.date}</td>
                                        <td className="px-6 py-4 font-black text-slate-800 uppercase text-xs">{clientName}</td>
                                        <td className="px-6 py-4 text-[10px] text-slate-500 font-bold uppercase">{q.projectName || '-'}</td>
                                        <td className="px-6 py-4 text-right font-black text-slate-900">{totalAmount.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                                q.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {q.status || 'Draft'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {quotations.length === 0 && (
                                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold uppercase text-xs">No pipeline data available</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SalesPipeline;
