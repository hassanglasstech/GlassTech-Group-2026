
import React, { useState } from 'react';
import { Company, Requisition, LedgerTransaction } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { FileText, CheckCircle2, Send } from 'lucide-react';
import { toast } from 'sonner';

interface FactoryRequisitionsProps {
    requisitions: Requisition[];
    refreshData: () => void;
}

const FactoryRequisitions: React.FC<FactoryRequisitionsProps> = ({ requisitions, refreshData }) => {
    const [reqForm, setReqForm] = useState({
        targetCompany: 'Glassco' as Company,
        type: 'Expense' as any,
        amount: 0,
        description: ''
    });

    const handleCreateRequisition = () => {
        if (!reqForm.amount || !reqForm.description) {
            toast.error("Details required.");
            return;
        }

        const newReq: Requisition = {
            id: `REQ-FAC-${Date.now().toString().slice(-6)}`,
            company: 'Factory',
            targetCompany: reqForm.targetCompany,
            date: new Date().toISOString().split('T')[0],
            headerText: reqForm.description.toUpperCase(),
            requisitioner: 'Factory Admin',
            priority: 'Normal',
            reqType: reqForm.type,
            items: [],
            totalValue: reqForm.amount,
            status: 'Pending'
        };

        InventoryService.saveRequisitions([...InventoryService.getRequisitions().filter(Boolean), newReq]);
        refreshData();
        setReqForm({ targetCompany: 'Glassco', type: 'Expense', amount: 0, description: '' });
        toast.success("Requisition Created. Pending Approval.");
    };

    const handleApproveRequisition = (req: Requisition) => {
        if (!req) return;
        if (!window.confirm(`Approve ${req.reqType} for ${req.targetCompany}? This will create a PARKED voucher in their ledger.`)) return;

        const allReqs = InventoryService.getRequisitions().filter(Boolean);
        const updatedReqs = allReqs.map(r => r.id === req.id ? { ...r, status: 'Approved' as const } : r);
        InventoryService.saveRequisitions(updatedReqs);

        if (req.targetCompany) {
            const tx: LedgerTransaction = {
                id: `JV-${req.id}`,
                company: req.targetCompany,
                docType: 'SA',
                docDate: new Date().toISOString().split('T')[0],
                date: new Date().toISOString().split('T')[0],
                description: `FAC-REQ: ${req.headerText} (${req.reqType})`,
                referenceId: req.id,
                status: 'Parked',
                details: [
                    { accountId: 'PENDING_GL_DR', debit: req.totalValue, credit: 0, text: `Approved by Factory (${req.reqType})` },
                    { accountId: 'PENDING_GL_CR', debit: 0, credit: req.totalValue, text: 'Payable / Cash' }
                ]
            };
            FinanceService.recordTransaction(tx);
        }

        refreshData();
        toast.success("Approved & Posted to Target Ledger (Parked).");
    };

    return (
        <div className="grid grid-cols-12 gap-8">
            <div className="col-span-4 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center space-x-3 text-indigo-600 mb-2">
                    <FileText size={24}/>
                    <h3 className="font-black uppercase">Create Requisition</h3>
                </div>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Beneficiary</label><select className="sap-input w-full font-bold" value={reqForm.targetCompany} onChange={e => setReqForm({...reqForm, targetCompany: e.target.value as any})}><option value="Glassco">GlassCo</option><option value="GTK">GTK</option><option value="Nippon">Nippon</option></select></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Category</label><select className="sap-input w-full font-bold" value={reqForm.type} onChange={e => setReqForm({...reqForm, type: e.target.value as any})}><option>Expense</option><option>Loan</option><option>Advance</option><option>Consumable</option><option>Maintenance</option><option>Overtime</option><option>Inventory</option></select></div>
                    </div>
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Est. Amount</label><input type="number" className="sap-input w-full font-black text-lg" value={reqForm.amount || ''} onChange={e => setReqForm({...reqForm, amount: Number(e.target.value)})}/></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Requirement Detail</label><textarea className="sap-input w-full font-bold h-24" value={reqForm.description} onChange={e => setReqForm({...reqForm, description: e.target.value})}/></div>
                    <button onClick={handleCreateRequisition} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-indigo-700 transition-all">Submit Request</button>
                </div>
            </div>
            <div className="col-span-8 bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b bg-slate-50"><h4 className="font-black uppercase text-xs text-slate-500">Central Approval Desk</h4></div>
                <table className="w-full text-left sap-table">
                    <thead><tr><th>Ref ID</th><th>Beneficiary</th><th>Category</th><th>Description</th><th className="text-right">Value</th><th>Action</th></tr></thead>
                    <tbody>
                        {requisitions.filter(Boolean).map(r => (
                            <tr key={r.id}>
                                <td className="font-black text-indigo-600">{r.id}</td>
                                <td><span className="bg-slate-100 px-2 py-1 rounded text-[10px] font-black uppercase text-slate-600">{r.targetCompany}</span></td>
                                <td><span className="text-[10px] font-bold uppercase text-slate-500">{r.reqType?.toUpperCase() || 'N/A'}</span></td>
                                <td className="text-xs font-bold uppercase text-slate-800">{r.headerText}</td>
                                <td className="text-right font-black text-xs">{r.totalValue?.toLocaleString() || '0'}</td>
                                <td>
                                    {r.status === 'Pending' ? (
                                        <button onClick={() => handleApproveRequisition(r)} className="bg-emerald-600 text-white px-3 py-1 rounded text-[10px] font-black uppercase hover:bg-emerald-700 transition-all flex items-center space-x-1">
                                            <CheckCircle2 size={10}/> <span>Approve</span>
                                        </button>
                                    ) : (
                                        <span className="text-[10px] font-black uppercase text-emerald-600 flex items-center space-x-1"><Send size={10}/> <span>Posted</span></span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FactoryRequisitions;
