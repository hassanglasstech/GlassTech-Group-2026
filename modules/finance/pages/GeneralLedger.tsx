
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDebounce } from '@/modules/shared/hooks/useDebounce';
import { useSupabasePage } from '@/modules/shared/hooks/useSupabasePage';
import { Company, LedgerTransaction, Account, LedgerDocType, LedgerStatus, CostCenter } from '../../shared/types';
import { FinanceService } from '../services/financeService';
import { 
  Search, Plus, X, Trash2, Clock, ShieldCheck, Save, ChevronDown, 
  AlertCircle, Calculator, Play, FileText, History, RotateCcw, 
  CheckCircle2, Target, Filter, ArrowRight, FileClock, PenTool, BookOpen, Loader2, Building, Zap
} from 'lucide-react';
import Pagination from '../../../components/Pagination';

const GeneralLedger: React.FC<{ company: Company }> = ({ company }) => {
  const [activeTab, setActiveTab] = useState<'Posted' | 'Parked' | 'System'>('Posted');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Cross-Company Posting State
  const [selectedTargetCompany, setSelectedTargetCompany] = useState<Company>(company);
  const [modalAccounts, setModalAccounts] = useState<Account[]>([]);
  const [modalCostCenters, setModalCostCenters] = useState<CostCenter[]>([]);

  // ── Server-side pagination via Supabase ───────────────────────────
  const itemsPerPage = 15;

  const {
    data: transactions,
    total: totalTransactions,
    loading: isLoading,
    page: currentPage,
    setPage: setCurrentPage,
    search: searchTerm,
    setSearch: setSearchTerm,
    refresh: refreshLedger,
  } = useSupabasePage<LedgerTransaction>({
    table: 'ledger',
    company,
    pageSize: itemsPerPage,
    filters: activeTab === 'System' ? {} : { status: activeTab },
    orderBy: 'date',
    orderDesc: true,
    searchColumn: 'description',
  });

  const debouncedSearchTerm = searchTerm;

  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  const initialFormState = {
    docType: 'SA' as LedgerDocType,
    docDate: new Date().toISOString().split('T')[0],
    postDate: new Date().toISOString().split('T')[0],
    description: '',
    referenceId: '',
    details: [
      { accountId: '', debit: 0, credit: 0, text: '', costCenterId: '' },
      { accountId: '', debit: 0, credit: 0, text: '', costCenterId: '' }
    ]
  };

  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => { refreshData(); }, [company]);

  // Effect to load specific company data when target company changes in Modal
  useEffect(() => {
      if (isModalOpen) {
          // Always fetch fresh accounts from storage to ensure we have the latest
          const allAccounts = FinanceService.getAccounts();
          const allCostCenters = FinanceService.getCostCenters();
          
          const filteredAccounts = allAccounts.filter(a => a.company === selectedTargetCompany);
          const filteredCC = allCostCenters.filter(c => c.company === selectedTargetCompany);
          
          setModalAccounts(filteredAccounts);
          setModalCostCenters(filteredCC);
      }
  }, [selectedTargetCompany, isModalOpen]);

  const refreshData = () => {
    // Ledger data comes from useSupabasePage hook (server-side)
    // Just reload accounts and cost centers from localStorage cache
    setAccounts(FinanceService.getAccounts().filter(a => a.company === company));
    setCostCenters(FinanceService.getCostCenters().filter(cc => cc.company === company));
    refreshLedger(); // trigger hook re-fetch
  };

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || 'Unknown';
  const getAccountCode = (id: string) => accounts.find(a => a.id === id)?.code || '0000';
  const getCCCode = (id: string) => costCenters.find(cc => cc.id === id)?.code || '-';
  
  // Accounts for the dropdown in modal (filtered by selected target company)
  const postingAccounts = modalAccounts.filter(a => a.level === 4 || a.level === 5);

  // Server-side: transactions already filtered+paginated by Supabase hook
  // paginatedTransactions alias kept for JSX compatibility
  const filteredTransactions = transactions;
  const paginatedTransactions = transactions;

  // Reset page when tab changes
  useEffect(() => setCurrentPage(1), [activeTab]);

  const totalDebit = (formData.details || []).reduce((sum, d) => sum + (Number(d.debit) || 0), 0);
  const totalCredit = (formData.details || []).reduce((sum, d) => sum + (Number(d.credit) || 0), 0);
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

  const handleSaveDocument = async (status: LedgerStatus) => {
    if (!isBalanced) return alert("System Error: Document is not balanced.");
    const txId = editingDocId || `${formData.docType}-${Date.now().toString().slice(-6)}`;
    
    // ── If posting a previously Parked PV, use postParkedPV (auto-updates linked Requisition) ──
    if (editingDocId && status === 'Posted') {
      const existingTx = transactions.find(t => t.id === editingDocId);
      if (existingTx && existingTx.status === 'Parked') {
        // First update the PV with any edits Finance made
        const allTxs = FinanceService.getLedger();
        const editedPV: LedgerTransaction = {
          id: editingDocId,
          company: selectedTargetCompany,
          docType: formData.docType, docDate: formData.docDate,
          date: formData.postDate, description: formData.description.toUpperCase(),
          referenceId: formData.referenceId, status: 'Parked' as const,
          reqId: existingTx.reqId,
          details: formData.details.map(d => ({ ...d, debit: Number(d.debit), credit: Number(d.credit) }))
        };
        const updatedTxs = allTxs.map(t => t.id === editingDocId ? editedPV : t);
        FinanceService.saveLedger(updatedTxs);

        // Now post it — this also marks linked Requisition as "Paid"
        const posted = FinanceService.postParkedPV(editingDocId);
        refreshData();
        setIsModalOpen(false);
        resetForm();
        alert(`Success: PV ${editingDocId} Posted to ${selectedTargetCompany} Ledger.${posted?.reqId ? ` Requisition ${posted.reqId} marked as Paid.` : ''}`);
        return;
      }
    }

    // ── Standard flow for new documents or non-Parked edits ──
    const tx: LedgerTransaction = {
      id: txId, 
      company: selectedTargetCompany,
      docType: formData.docType, docDate: formData.docDate,
      date: formData.postDate, description: formData.description.toUpperCase(),
      referenceId: formData.referenceId, status: status,
      details: formData.details.map(d => ({ ...d, debit: Number(d.debit), credit: Number(d.credit) }))
    };

    const allTxs = FinanceService.getLedger();
    let updatedTxs = [...allTxs];
    if (editingDocId) updatedTxs = updatedTxs.map(t => t.id === editingDocId ? tx : t);
    else updatedTxs.push(tx);

    FinanceService.saveLedger(updatedTxs);
    
    refreshData();
    setIsModalOpen(false);
    resetForm();
    alert(status === 'Posted' ? `Success: Document ${txId} Posted to ${selectedTargetCompany} Ledger.` : `Document ${txId} Parked successfully.`);
  };

  const resetForm = () => {
      setFormData(initialFormState);
      setEditingDocId(null);
      setSelectedTargetCompany(company); // Reset to current context
  };

  const handleEditParked = (tx: LedgerTransaction) => {
      setEditingDocId(tx.id);
      setSelectedTargetCompany(tx.company); // Set context to transaction's company
      setFormData({
          docType: tx.docType, docDate: tx.docDate, postDate: tx.date, description: tx.description, referenceId: tx.referenceId,
          details: tx.details.map(d => ({...d, debit: d.debit, credit: d.credit, text: d.text || '', costCenterId: d.costCenterId || ''}))
      });
      setIsModalOpen(true);
  };

  const handleDeleteParked = async (id: string) => {
      if(confirm("Delete this parked document?")) {
          const allTxs = FinanceService.getLedger();
          const updated = allTxs.filter(t => t.id !== id);
          FinanceService.saveLedger(updated);
          refreshData();
      }
  };

  if (isLoading) return <div className="h-full flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Accessing Ledger DB...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center space-x-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-full md:w-fit no-print">
        <button onClick={() => setActiveTab('Posted')} className={`flex-1 md:flex-none flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'Posted' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <BookOpen size={16} /><span>Posted</span>
        </button>
        <button onClick={() => setActiveTab('Parked')} className={`flex-1 md:flex-none flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'Parked' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <FileClock size={16} /><span>Parked</span>
          <span className="bg-white/20 px-2 rounded-full text-[9px]">{transactions.filter(t => t.status === 'Parked').length}</span>
        </button>
        <button onClick={() => setActiveTab('System')} className={`flex-1 md:flex-none flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'System' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <Zap size={16} /><span>System Generated</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row justify-between items-center rounded-xl gap-4">
        <div className="flex items-center space-x-6 w-full md:w-auto">
           <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Filter Documents..." className="sap-input w-full pl-9 py-1.5 text-xs" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="sap-btn-primary flex items-center space-x-2 w-full md:w-auto justify-center"><Plus size={14} /> <span>New Entry</span></button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[600px]">
        <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left sap-table min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                <tr>
                <th className="px-4 py-3 w-32">Posting Date</th>
                <th className="px-4 py-3 w-40">Doc. Number</th>
                <th className="px-4 py-3">Narration / Details</th>
                <th className="px-4 py-3 text-right w-32">Debit (PKR)</th>
                <th className="px-4 py-3 text-right w-32">Credit (PKR)</th>
                <th className="px-4 py-3 text-center w-24">Status</th>
                {activeTab === 'Parked' && <th className="px-4 py-3 text-center w-32">Action</th>}
                </tr>
            </thead>
            <tbody>
                {paginatedTransactions.map(tx => (
                <React.Fragment key={tx.id}>
                    <tr className={`${activeTab === 'Parked' ? 'bg-amber-50/50' : 'bg-slate-50/50'}`}>
                    <td className="px-4 py-2 font-bold text-slate-400 text-xs">{tx.date}</td>
                    <td className="px-4 py-2 font-black text-blue-600 text-xs">{tx.id}</td>
                    <td className="px-4 py-2 font-bold text-slate-800 uppercase text-xs">
                      {tx.description}
                      {activeTab === 'Parked' && (tx.reqId || tx.referenceId?.startsWith('REQ')) && (
                        <span className="ml-2 text-[9px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-100">
                          REQ: {tx.reqId || tx.referenceId}
                        </span>
                      )}
                    </td>
                    <td colSpan={2}></td>
                    <td className="px-4 py-2 text-center"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${tx.status === 'Posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{tx.status}</span></td>
                    {activeTab === 'Parked' && (
                        <td className="px-4 py-2 text-center">
                            <div className="flex items-center justify-center space-x-2">
                                <button onClick={() => handleEditParked(tx)} className="bg-blue-600 text-white p-1.5 rounded shadow hover:bg-blue-700" title="Review & Post"><PenTool size={12}/></button>
                                <button onClick={() => handleDeleteParked(tx.id)} className="bg-white border border-slate-200 text-slate-400 p-1.5 rounded hover:text-red-600" title="Delete"><Trash2 size={12}/></button>
                            </div>
                        </td>
                    )}
                    </tr>
                    {tx.details.map((d, i) => (
                    <tr key={`${tx.id}-${i}`}>
                        <td></td><td></td>
                        <td className="pl-8 py-2 px-4">
                        <div className="flex items-center space-x-3">
                            <span className="text-[10px] font-mono font-bold text-slate-400">{getAccountCode(d.accountId)}</span>
                            <span className="text-xs font-medium text-slate-600">{getAccountName(d.accountId)}</span>
                            {d.costCenterId && <span className="bg-indigo-50 text-indigo-700 text-[8px] font-black px-1 rounded">CC: {getCCCode(d.costCenterId)}</span>}
                            {d.text && <span className="text-[9px] text-slate-400 italic border-l pl-2 ml-2">{d.text}</span>}
                        </div>
                        </td>
                        <td className="px-4 py-2 text-right font-black text-slate-900 text-xs">{d.debit > 0 ? d.debit.toLocaleString() : ''}</td>
                        <td className="px-4 py-2 text-right font-black text-blue-600 text-xs">{d.credit > 0 ? d.credit.toLocaleString() : ''}</td>
                        <td></td>
                        {activeTab === 'Parked' && <td></td>}
                    </tr>
                    ))}
                </React.Fragment>
                ))}
                {paginatedTransactions.length === 0 && (
                    <tr><td colSpan={activeTab === 'Parked' ? 7 : 6} className="text-center py-12 text-slate-300 font-bold uppercase italic text-xs">No {activeTab} documents found.</td></tr>
                )}
            </tbody>
            </table>
        </div>
        
        <Pagination 
            totalItems={totalTransactions}
            itemsPerPage={itemsPerPage}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
        />
      </div>

      {activeTab === 'System' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-3xl border shadow-sm flex items-center space-x-4">
                      <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><BookOpen size={24}/></div>
                      <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Total System Accounts</p>
                          <p className="text-2xl font-black text-slate-900">{FinanceService.getAccounts().filter(a => a.company === company && a.level === 5).length}</p>
                      </div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border shadow-sm flex items-center space-x-4">
                      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><Zap size={24}/></div>
                      <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Automated Postings</p>
                          <p className="text-2xl font-black text-slate-900">{transactions.filter(t => t.description.includes('Automated') || t.description.includes('Approved')).length}</p>
                      </div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border shadow-sm flex items-center space-x-4">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><ShieldCheck size={24}/></div>
                      <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Audit Compliance</p>
                          <p className="text-2xl font-black text-slate-900">100%</p>
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                      <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
                          <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest">System-Generated Level 5 Accounts</h4>
                          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black uppercase">Auto-Managed</span>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-left sap-table">
                              <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                  <tr>
                                      <th className="px-6 py-4">Account Code</th>
                                      <th className="px-6 py-4">Account Name</th>
                                      <th className="px-6 py-4">Status</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {FinanceService.getAccounts().filter(a => a.company === company && a.level === 5).reverse().slice(0, 10).map(acc => {
                                      return (
                                          <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                                              <td className="px-6 py-4 font-black text-slate-900 text-xs">{acc.code}</td>
                                              <td className="px-6 py-4 font-bold text-blue-600 text-xs uppercase">{acc.name}</td>
                                              <td className="px-6 py-4">
                                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase">Active</span>
                                              </td>
                                          </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      </div>
                  </div>

                  <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                      <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
                          <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest">Recent Automated Postings</h4>
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase">Real-Time</span>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-left sap-table">
                              <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                  <tr>
                                      <th className="px-6 py-4">Date</th>
                                      <th className="px-6 py-4">Description</th>
                                      <th className="px-6 py-4 text-right">Value</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {transactions.filter(t => t.description.includes('Automated') || t.description.includes('Approved') || t.description.includes('PAYROLL')).slice(0, 10).map(tx => {
                                      const totalValue = (tx.details || []).reduce((sum, d) => sum + d.debit, 0);
                                      return (
                                          <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                                              <td className="px-6 py-4 text-xs text-slate-500">{tx.date}</td>
                                              <td className="px-6 py-4 font-bold text-slate-900 text-xs uppercase">{tx.description}</td>
                                              <td className="px-6 py-4 text-right font-black text-blue-600 text-xs">{(Number(totalValue) || 0).toLocaleString()}</td>
                                          </tr>
                                      );
                                  })}
                                  {transactions.filter(t => t.description.includes('Automated') || t.description.includes('Approved') || t.description.includes('PAYROLL')).length === 0 && (
                                      <tr>
                                          <td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic text-xs">No automated postings found.</td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
           <div className="bg-white rounded w-full max-w-6xl h-[94vh] shadow-2xl flex flex-col overflow-hidden border border-slate-300 animate-in zoom-in duration-200">
              <div className="sap-object-header flex justify-between items-start shrink-0">
                 <div><div className="flex items-center space-x-3 text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-2"><FileText size={14}/> <span>Transaction: FB50 / FV50</span></div><h3 className="text-2xl font-black uppercase tracking-tight">{editingDocId ? 'Post Parked Document' : 'Manual G/L Voucher Entry'}</h3></div>
                 <button onClick={() => setIsModalOpen(false)} className="hover:bg-white/10 p-2 rounded transition-colors"><X size={24} /></button>
              </div>
              <div className="flex-1 overflow-hidden p-6 bg-[#f3f4f5] flex flex-col">
                 <div className="bg-white p-6 rounded shadow-sm border border-slate-200 mb-6 shrink-0">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                        {/* COMPANY SELECTION (Only enable for Factory) */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-blue-600 flex items-center gap-1"><Building size={10}/> Company Code</label>
                            <select 
                                value={selectedTargetCompany} 
                                onChange={e => {
                                    if(company === 'Factory') {
                                        setSelectedTargetCompany(e.target.value as Company);
                                        // Reset details when switching company to prevent bad IDs
                                        setFormData(prev => ({...prev, details: prev.details.map(d => ({...d, accountId: '', costCenterId: ''}))}));
                                    }
                                }} 
                                disabled={company !== 'Factory'}
                                className={`sap-input w-full font-black uppercase ${company === 'Factory' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-100 text-slate-500 cursor-not-allowed'}`}
                            >
                                <option value="GTK">GTK</option>
                                <option value="GTI">GTI</option>
                                <option value="Glassco">GlassCo</option>
                                <option value="Nippon">Nippon</option>
                                <option value="Factory">Factory</option>
                            </select>
                        </div>

                        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Doc Type</label><select value={formData.docType} onChange={e => setFormData({...formData, docType: e.target.value as any})} className="sap-input w-full font-bold"><option value="SA">SA - G/L Posting</option><option value="KR">KR - Vendor Invoice</option><option value="DR">DR - Cust. Invoice</option></select></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Post Date</label><input type="date" value={formData.postDate} onChange={e => setFormData({...formData, postDate: e.target.value})} className="sap-input w-full font-bold" /></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Reference</label><input type="text" value={formData.referenceId} onChange={e => setFormData({...formData, referenceId: e.target.value})} className="sap-input w-full font-bold uppercase" /></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Header Text</label><input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="sap-input w-full font-bold uppercase" /></div>
                    </div>
                 </div>
                 <div className="flex-1 bg-white rounded border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="overflow-x-auto h-full">
                       <table className="w-full text-left sap-table min-w-[900px]">
                          <thead className="sticky top-0 z-10"><tr><th className="w-12 text-center">Pos</th><th className="w-72">G/L Account ({selectedTargetCompany})</th><th className="w-48 text-center">Cost Center</th><th>Item Text</th><th className="w-40 text-right">Debit (PKR)</th><th className="w-40 text-right">Credit (PKR)</th><th className="w-12"></th></tr></thead>
                          <tbody>
                             {formData.details.map((row, idx) => (
                               <tr key={idx}>
                                  <td className="text-center font-bold text-slate-300">{idx+1}</td>
                                  <td><select value={row.accountId} onChange={e => { const next = [...formData.details]; next[idx].accountId = e.target.value; setFormData({...formData, details: next}); }} className="sap-input w-full py-1 text-xs"><option value="">-- Choose G/L --</option>{postingAccounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}</select></td>
                                  <td><select value={row.costCenterId} onChange={e => { const next = [...formData.details]; next[idx].costCenterId = e.target.value; setFormData({...formData, details: next}); }} className="sap-input w-full py-1 text-xs uppercase"><option value="">N/A</option>{modalCostCenters.map(cc => <option key={cc.id} value={cc.id}>[{cc.code}] {cc.name}</option>)}</select></td>
                                  <td><input type="text" value={row.text} onChange={e => { const next = [...formData.details]; next[idx].text = e.target.value; setFormData({...formData, details: next}); }} className="sap-input w-full py-1 text-xs" /></td>
                                  <td><input type="number" value={row.debit || ''} onChange={e => { const next = [...formData.details]; next[idx].debit = Number(e.target.value); next[idx].credit = 0; setFormData({...formData, details: next}); }} className="sap-input w-full py-1 text-right font-bold text-slate-900" /></td>
                                  <td><input type="number" value={row.credit || ''} onChange={e => { const next = [...formData.details]; next[idx].credit = Number(e.target.value); next[idx].debit = 0; setFormData({...formData, details: next}); }} className="sap-input w-full py-1 text-right font-bold text-blue-600" /></td>
                                  <td className="text-center"><button onClick={() => { if(formData.details.length > 2) setFormData({...formData, details: formData.details.filter((_,i) => i !== idx)}); }} className="text-slate-300 hover:text-red-600"><Trash2 size={14}/></button></td>
                               </tr>
                             ))}
                          </tbody>
                       </table>
                       <div className="p-4 bg-slate-50/50"><button onClick={() => setFormData({...formData, details: [...formData.details, { accountId: '', debit: 0, credit: 0, text: '', costCenterId: '' }]})} className="sap-btn-ghost flex items-center space-x-2 text-[10px]"><Plus size={14}/><span>Append Line</span></button></div>
                    </div>
                 </div>
              </div>
              <div className="px-8 py-4 bg-white border-t flex justify-between items-center shrink-0">
                 <div className="flex items-center space-x-4"><div className={`px-4 py-1.5 rounded text-[10px] font-bold uppercase border ${isBalanced ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>Balance: {(totalDebit - totalCredit).toLocaleString()}</div></div>
                 <div className="flex space-x-3"><button onClick={() => setIsModalOpen(false)} className="sap-btn-ghost">Cancel</button><button onClick={() => handleSaveDocument('Parked')} disabled={!isBalanced} className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase transition-all shadow-lg flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"><FileClock size={14} /> <span>Park Document</span></button><button onClick={() => handleSaveDocument('Posted')} disabled={!isBalanced} className="sap-btn-primary flex items-center space-x-2 disabled:opacity-30"><Save size={14} /> <span>Post to Ledger</span></button></div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(GeneralLedger);
