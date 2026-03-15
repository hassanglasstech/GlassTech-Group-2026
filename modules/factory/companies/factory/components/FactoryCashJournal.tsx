
import React, { useState } from 'react';
import { Company, PettyCashEntry } from '../../../../shared/types';
import { FinanceService } from '../../../../finance/services/financeService';
import { Wallet, Save } from 'lucide-react';
import { toast } from 'sonner';

interface FactoryCashJournalProps {
    cashEntries: PettyCashEntry[];
    refreshData: () => void;
}

const FactoryCashJournal: React.FC<FactoryCashJournalProps> = ({ cashEntries, refreshData }) => {
    const [cashForm, setCashForm] = useState({
        targetCompany: 'Glassco' as Company,
        amount: 0,
        description: '',
        type: 'Payment' as 'Payment' | 'Receipt'
    });

    const handlePostCash = () => {
        if (!cashForm.amount || !cashForm.description) {
            toast.error("Amount and Description required.");
            return;
        }
        
        const newEntry: PettyCashEntry = {
            id: `CJ-FAC-${Date.now()}`,
            company: cashForm.targetCompany,
            date: new Date().toISOString().split('T')[0],
            description: `VIA FACTORY: ${cashForm.description.toUpperCase()}`,
            type: cashForm.type,
            amount: cashForm.amount,
            balance: 0,
            recordedBy: 'FACTORY_CENTRAL',
            status: 'Parked',
            targetCompany: cashForm.targetCompany
        };

        FinanceService.savePettyCashEntries([...FinanceService.getPettyCashEntries(), newEntry]);
        refreshData();
        setCashForm({ targetCompany: 'Glassco', amount: 0, description: '', type: 'Payment' });
        toast.success(`Entry Parked in ${cashForm.targetCompany} Cash Journal.`);
    };

    return (
        <div className="grid grid-cols-3 gap-8">
            <div className="col-span-1 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center space-x-3 text-emerald-600 mb-2">
                    <Wallet size={24}/>
                    <h3 className="font-black uppercase">Post Cash Entry</h3>
                </div>
                <div className="space-y-4">
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Target Company</label><select className="sap-input w-full font-bold" value={cashForm.targetCompany} onChange={e => setCashForm({...cashForm, targetCompany: e.target.value as any})}><option value="Glassco">GlassCo</option><option value="GTK">GTK</option><option value="Nippon">Nippon</option></select></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Entry Type</label><div className="flex bg-slate-100 p-1 rounded"><button onClick={() => setCashForm({...cashForm, type: 'Payment'})} className={`flex-1 py-1 rounded text-[10px] font-bold uppercase ${cashForm.type === 'Payment' ? 'bg-white shadow text-rose-600' : 'text-slate-400'}`}>Payment</button><button onClick={() => setCashForm({...cashForm, type: 'Receipt'})} className={`flex-1 py-1 rounded text-[10px] font-bold uppercase ${cashForm.type === 'Receipt' ? 'bg-white shadow text-emerald-600' : 'text-slate-400'}`}>Receipt</button></div></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Amount</label><input type="number" className="sap-input w-full font-black text-lg" value={cashForm.amount || ''} onChange={e => setCashForm({...cashForm, amount: Number(e.target.value)})}/></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Narrative</label><textarea className="sap-input w-full font-bold h-24" value={cashForm.description} onChange={e => setCashForm({...cashForm, description: e.target.value})}/></div>
                    <button onClick={handlePostCash} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-emerald-600 transition-all">Post to Ledger</button>
                </div>
            </div>
            <div className="col-span-2 bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b bg-slate-50"><h4 className="font-black uppercase text-xs text-slate-500">Recent Inter-Company Postings</h4></div>
                <table className="w-full text-left sap-table">
                    <thead><tr><th>Date</th><th>Target</th><th>Description</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
                    <tbody>
                        {cashEntries.map(e => (
                            <tr key={e.id}>
                                <td className="text-xs font-mono text-slate-500">{e.date}</td>
                                <td><span className="bg-slate-100 px-2 py-1 rounded text-[10px] font-black uppercase text-slate-600">{e.targetCompany}</span></td>
                                <td className="text-xs font-bold uppercase text-slate-800">{e.description}</td>
                                <td className={`text-right font-black text-xs ${e.type === 'Receipt' ? 'text-emerald-600' : 'text-rose-600'}`}>{(Number(e.amount) || 0).toLocaleString()}</td>
                                <td><span className="text-[10px] font-bold uppercase bg-amber-50 text-amber-700 px-2 py-1 rounded border border-amber-100">{e.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FactoryCashJournal;
