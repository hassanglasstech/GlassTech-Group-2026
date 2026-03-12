
import React, { useState, useEffect, useMemo } from 'react';
import { Company, FinancialEvent, Account, LedgerTransaction, CostCenter } from '../../shared/types';
import { FinanceService } from '../services/financeService';
import { 
  Inbox, Search, CheckCircle2, ArrowRight, Ban, 
  Settings, AlertCircle, Save, BookOpen, Clock, Zap, X
} from 'lucide-react';
import { useAppStore } from '../../shared/store/appStore';
import { toast } from 'sonner';

const FinancialRegistry: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [events, setEvents] = useState<FinancialEvent[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedEvent, setSelectedEvent] = useState<FinancialEvent | null>(null);
  
  // Mapping Form
  const [mappingForm, setMappingForm] = useState({
      debitAccountId: '',
      creditAccountId: '',
      costCenterId: '',
      saveRule: false
  });

  useEffect(() => { refreshData(); }, [company]);

  const refreshData = () => {
    setEvents(FinanceService.getFinancialEvents().filter(e => e.company === company && e.status === 'Pending').sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setAccounts(FinanceService.getAccounts().filter(a => a.company === company && (a.level === 4 || a.level === 5)));
    setCostCenters(FinanceService.getCostCenters().filter(cc => cc.company === company));
  };

  const handleOpenMap = (event: FinancialEvent) => {
      setSelectedEvent(event);
      setMappingForm({
          debitAccountId: event.suggestedGlId || '',
          creditAccountId: '', // Usually implies Cash or Inventory Control depending on source
          costCenterId: '',
          saveRule: false
      });
      setIsModalOpen(true);
  };

  const handlePost = () => {
      if (!selectedEvent) return;
      if (!mappingForm.debitAccountId || !mappingForm.creditAccountId) {
          toast.error("Debit and Credit accounts are required.");
          return;
      }

      const txId = `REG-${Date.now().toString().slice(-6)}`;
      const tx: LedgerTransaction = {
          id: txId,
          company,
          docType: 'SA',
          docDate: selectedEvent.date,
          date: new Date().toISOString().split('T')[0],
          description: `REGISTRY: ${selectedEvent.description}`,
          referenceId: selectedEvent.referenceId || selectedEvent.id,
          status: 'Posted',
          details: [
              { accountId: mappingForm.debitAccountId, debit: selectedEvent.amount, credit: 0, text: selectedEvent.description, costCenterId: mappingForm.costCenterId },
              { accountId: mappingForm.creditAccountId, debit: 0, credit: selectedEvent.amount, text: "Contra Entry" }
          ]
      };

      // 1. Post to Ledger
      FinanceService.recordTransaction(tx);

      // 2. Update Event Status
      const allEvents = FinanceService.getFinancialEvents();
      const updatedEvents = allEvents.map(e => e.id === selectedEvent.id ? { ...e, status: 'Posted' as const } : e);
      FinanceService.saveFinancialEvents(updatedEvents);

      // 3. Save Rule if checked
      if (mappingForm.saveRule) {
          const rule = {
              id: `RULE-${Date.now()}`,
              company,
              keyword: selectedEvent.description.split(' ')[0], // Simple heuristic: first word
              targetGlId: mappingForm.debitAccountId,
              targetCostCenterId: mappingForm.costCenterId
          };
          FinanceService.saveMappingRules([...FinanceService.getMappingRules(), rule]);
      }

      refreshData();
      setIsModalOpen(false);
      toast.success("Event Posted Successfully.");
  };

  const handleIgnore = (id: string) => {
      if (!window.confirm("Remove this event from registry? It will not be posted.")) return;
      const allEvents = FinanceService.getFinancialEvents();
      const updatedEvents = allEvents.map(e => e.id === id ? { ...e, status: 'Ignored' as const } : e);
      FinanceService.saveFinancialEvents(updatedEvents);
      refreshData();
  };

  const filteredEvents = events.filter(e => e.description.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
        <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl flex justify-between items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10"><Inbox size={140} /></div>
            <div>
                <h2 className="text-2xl font-black uppercase tracking-tight">Financial Event Registry</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Pending Operational Transactions</p>
            </div>
            <div className="bg-white/10 px-6 py-4 rounded-2xl border border-white/10 relative z-10">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Items Pending</p>
                <p className="text-3xl font-black">{events.length}</p>
            </div>
        </div>

        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                <div className="flex items-center space-x-3">
                    <Search className="text-slate-400" size={18}/>
                    <input 
                        type="text" 
                        placeholder="Search unposted items..." 
                        className="bg-transparent font-bold text-sm outline-none w-64"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <table className="w-full text-left sap-table">
                <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400">
                    <tr>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Source</th>
                        <th className="px-6 py-4">Description / Narrative</th>
                        <th className="px-6 py-4 text-right">Amount (PKR)</th>
                        <th className="px-6 py-4">Smart Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredEvents.map(e => (
                        <tr key={e.id} className="hover:bg-blue-50/50 transition-colors">
                            <td className="px-6 py-4 font-bold text-slate-500 text-xs">{e.date}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${e.sourceModule === 'Inventory' ? 'bg-orange-100 text-orange-700' : e.sourceModule === 'PettyCash' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {e.sourceModule}
                                </span>
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-800 text-sm uppercase">{e.description}</td>
                            <td className="px-6 py-4 text-right font-black text-slate-900">{(e.amount || 0).toLocaleString()}</td>
                            <td className="px-6 py-4">
                                <div className="flex space-x-2">
                                    <button onClick={() => handleOpenMap(e)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm hover:bg-blue-700 transition-all flex items-center space-x-2">
                                        {e.suggestedGlId && <Zap size={10} className="text-yellow-300 fill-current"/>}
                                        <span>Map & Post</span>
                                    </button>
                                    <button onClick={() => handleIgnore(e.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Ban size={16}/></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {filteredEvents.length === 0 && (
                        <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-300 italic font-bold uppercase">All financial events are cleared.</td></tr>
                    )}
                </tbody>
            </table>
        </div>

        {isModalOpen && selectedEvent && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
                <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200 border">
                    <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                        <div><h3 className="text-xl font-black uppercase">Post Financial Event</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assign GL Accounts</p></div>
                        <button onClick={() => setIsModalOpen(false)}><X size={24}/></button>
                    </div>
                    <div className="p-8 space-y-6 bg-slate-50">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <p className="text-[10px] font-black text-slate-400 uppercase">Event Detail</p>
                            <p className="text-sm font-bold text-slate-900 uppercase mt-1">{selectedEvent.description}</p>
                            <div className="mt-2 flex justify-between items-end">
                                <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase">{selectedEvent.sourceModule}</span>
                                <span className="text-lg font-black text-blue-600">PKR {(selectedEvent.amount || 0).toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Debit Account (Expense/Asset)</label>
                                <select 
                                    className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-blue-500"
                                    value={mappingForm.debitAccountId}
                                    onChange={e => setMappingForm({...mappingForm, debitAccountId: e.target.value})}
                                >
                                    <option value="">-- Select GL Account --</option>
                                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                                </select>
                            </div>
                            
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Credit Account (Source/Liability)</label>
                                <select 
                                    className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-blue-500"
                                    value={mappingForm.creditAccountId}
                                    onChange={e => setMappingForm({...mappingForm, creditAccountId: e.target.value})}
                                >
                                    <option value="">-- Select GL Account --</option>
                                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Cost Center (Optional)</label>
                                <select 
                                    className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-blue-500 uppercase"
                                    value={mappingForm.costCenterId}
                                    onChange={e => setMappingForm({...mappingForm, costCenterId: e.target.value})}
                                >
                                    <option value="">-- No Assignment --</option>
                                    {costCenters.map(cc => <option key={cc.id} value={cc.id}>[{cc.code}] {cc.name}</option>)}
                                </select>
                            </div>

                            <div className="flex items-center space-x-3 pt-2">
                                <input 
                                    type="checkbox" 
                                    id="saveRule"
                                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    checked={mappingForm.saveRule}
                                    onChange={e => setMappingForm({...mappingForm, saveRule: e.target.checked})}
                                />
                                <label htmlFor="saveRule" className="text-xs font-bold text-slate-700">Remember this mapping for future?</label>
                            </div>
                        </div>
                    </div>
                    <div className="px-10 py-6 bg-white border-t flex justify-end space-x-4">
                        <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-slate-400 font-black uppercase text-xs">Cancel</button>
                        <button onClick={handlePost} className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center space-x-2">
                            <Save size={14}/> <span>Post to Ledger</span>
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default FinancialRegistry;
