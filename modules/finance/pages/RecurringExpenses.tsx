
import React, { useState, useEffect } from 'react';
import { Company, RecurringExpense, Account, CostCenter, LedgerTransaction } from '../../shared/types';
import { FinanceService } from '../services/financeService';
import { Plus, Search, RefreshCw, Trash2, X, Zap, Save, CheckCircle2 } from 'lucide-react';

const RecurringExpenses: React.FC<{ company: Company }> = ({ company }) => {
  const [templates, setTemplates] = useState<RecurringExpense[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [formData, setFormData] = useState<Partial<RecurringExpense>>({ name: '', amount: 0, debitAccountId: '', creditAccountId: '', costCenterId: '', dayOfMonth: 1 });

  useEffect(() => { refreshData(); }, [company]);

  const refreshData = () => {
    setTemplates(FinanceService.getRecurringExpenses().filter(t => t.company === company));
    setAccounts(FinanceService.getAccounts().filter(a => a.company === company && (a.level === 4 || a.level === 5)));
    setCostCenters(FinanceService.getCostCenters().filter(cc => cc.company === company));
  };

  const postRecurringVoucher = (template: RecurringExpense) => {
    if (template.lastPostedMonth === currentMonth) return alert("Already posted for this month.");
    const txId = `AUT-${Date.now().toString().slice(-6)}`;
    const tx: LedgerTransaction = {
      id: txId, company, docType: 'SA', docDate: new Date().toISOString().split('T')[0],
      date: new Date().toISOString().split('T')[0], description: `AUTO: ${template.name.toUpperCase()}`,
      referenceId: template.id, status: 'Posted',
      details: [
        { accountId: template.debitAccountId, debit: template.amount, credit: 0, text: `AUTO POST`, costCenterId: template.costCenterId },
        { accountId: template.creditAccountId, debit: 0, credit: template.amount, text: `AUTO OFFSET` }
      ]
    };
    FinanceService.recordTransaction(tx);
    const updated = FinanceService.getRecurringExpenses().map(t => t.id === template.id ? { ...t, lastPostedMonth: currentMonth } : t);
    FinanceService.saveRecurringExpenses(updated);
    refreshData();
    alert(`Posted: Document ${txId}`);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="bg-white border border-slate-200 p-4 shadow-sm flex justify-between items-center no-print">
        <div className="flex items-center space-x-6">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Transaction: FBD1 Recurring Docs</h3>
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Filter automation..." className="sap-input w-full pl-9 py-1.5 text-xs font-bold" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="sap-btn-primary flex items-center space-x-2">
          <Plus size={14} /> <span>Create Template</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map(t => (
          <div key={t.id} className="bg-white p-6 rounded border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-400 transition-all border-t-4 border-t-indigo-600">
             <div className="flex justify-between items-start mb-4">
                <div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">ID: {t.id}</p>
                   <h4 className="text-base font-bold text-slate-800 uppercase leading-none">{t.name}</h4>
                </div>
                <div className="text-right">
                   <p className="text-sm font-black text-indigo-600">PKR {t.amount.toLocaleString()}</p>
                </div>
             </div>

             <div className="space-y-2 mb-6 bg-slate-50 p-3 rounded">
                <div className="flex justify-between items-center text-[10px] font-medium text-slate-500">
                   <span className="uppercase">Debit:</span>
                   <span className="text-slate-900 font-bold">{accounts.find(a => a.id === t.debitAccountId)?.code || '-'}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-medium text-slate-500">
                   <span className="uppercase">Credit:</span>
                   <span className="text-slate-900 font-bold">{accounts.find(a => a.id === t.creditAccountId)?.code || '-'}</span>
                </div>
             </div>

             <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="flex flex-col">
                   <p className="text-[9px] font-bold text-slate-400 uppercase">Last Run</p>
                   <p className="text-xs font-black text-slate-800">{t.lastPostedMonth || 'NEVER'}</p>
                </div>
                <div className="flex space-x-2">
                   <button onClick={() => postRecurringVoucher(t)} disabled={t.lastPostedMonth === currentMonth} className={`px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all ${t.lastPostedMonth === currentMonth ? 'bg-slate-100 text-slate-400' : 'sap-btn-primary'}`}>
                      {t.lastPostedMonth === currentMonth ? 'Run Successful' : 'Execute Run'}
                   </button>
                   {/* Corrected sequential calls below from && to a block */}
                   <button onClick={() => { FinanceService.saveRecurringExpenses(FinanceService.getRecurringExpenses().filter(x => x.id !== t.id)); refreshData(); }} className="p-2 text-slate-300 hover:text-red-600"><Trash2 size={16}/></button>
                </div>
             </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[450]">
          <div className="bg-white rounded w-full max-w-xl shadow-2xl overflow-hidden flex flex-col border border-slate-300 animate-in zoom-in duration-300">
            <div className="sap-object-header flex justify-between items-start shrink-0">
               <div>
                  <div className="flex items-center space-x-3 text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-2">
                    <RefreshCw size={14}/> <span>Transaction: FBD1 Automation</span>
                  </div>
                  <h3 className="text-2xl font-bold uppercase tracking-tight">Recurring Post Template</h3>
               </div>
               <button onClick={() => setIsModalOpen(false)} className="hover:bg-white/10 p-2 rounded transition-colors"><X size={24} /></button>
            </div>
            
            <div className="p-8 space-y-6 bg-slate-50">
               <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Template Title</label>
                  <input type="text" placeholder="e.g. FACTORY RENT" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="sap-input w-full font-black uppercase"/>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-400">Amount (PKR)</label>
                     <input type="number" value={formData.amount || ''} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} className="sap-input w-full font-black text-indigo-600"/>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-400">Due Day</label>
                     <input type="number" min="1" max="28" value={formData.dayOfMonth} onChange={e => setFormData({...formData, dayOfMonth: Number(e.target.value)})} className="sap-input w-full font-bold"/>
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-400">Debit Account</label>
                     <select value={formData.debitAccountId} onChange={e => setFormData({...formData, debitAccountId: e.target.value})} className="sap-input w-full font-bold">
                        <option value="">Select Account...</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                     </select>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold uppercase text-slate-400">Credit Account</label>
                     <select value={formData.creditAccountId} onChange={e => setFormData({...formData, creditAccountId: e.target.value})} className="sap-input w-full font-bold">
                        <option value="">Select Account...</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                     </select>
                  </div>
               </div>
            </div>

            <div className="px-8 py-4 bg-white border-t flex justify-end space-x-3 shrink-0">
               <button onClick={() => setIsModalOpen(false)} className="sap-btn-ghost">Cancel</button>
               <button onClick={() => {
                 const newTemplate = { ...(formData as RecurringExpense), id: `REC-${Date.now().toString().slice(-6)}`, company };
                 FinanceService.saveRecurringExpenses([...FinanceService.getRecurringExpenses(), newTemplate]);
                 refreshData(); setIsModalOpen(false);
               }} className="sap-btn-primary flex items-center space-x-2"><Zap size={14}/><span>Finalize Template</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecurringExpenses;
