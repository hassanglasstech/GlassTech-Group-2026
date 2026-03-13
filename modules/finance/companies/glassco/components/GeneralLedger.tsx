import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Company, LedgerTransaction, Account, LedgerDocType, LedgerStatus, CostCenter } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { JournalTemplateService, BusinessTransaction } from '@/modules/finance/constants/journalTemplates';
import { 
  Search, Plus, X, Trash2, Clock, ShieldCheck, Save, ChevronDown,
  AlertCircle, Calculator, Play, FileText, History, RotateCcw,
  CheckCircle2, Target, Filter, ArrowRight, FileClock, PenTool,
  BookOpen, Building, Zap, Settings, Tag, Link2, Edit2
} from 'lucide-react';
import Pagination from '@/components/Pagination';

const GeneralLedger: React.FC<{ company: Company }> = ({ company }) => {
  const [activeTab, setActiveTab] = useState<'Posted' | 'Parked' | 'System'>('Posted');
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Business Transaction
  const [templates, setTemplates] = useState<BusinessTransaction[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<BusinessTransaction | null>(null);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ code: '', name: '', docType: 'SA' as LedgerDocType, description: '' });

  // REQ Linking
  const [approvedReqs, setApprovedReqs] = useState<any[]>([]);
  const [selectedReqId, setSelectedReqId] = useState('');

  // Cross-Company Posting
  const [selectedTargetCompany, setSelectedTargetCompany] = useState<Company>(company);
  const [modalAccounts, setModalAccounts] = useState<Account[]>([]);
  const [modalCostCenters, setModalCostCenters] = useState<CostCenter[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  const initialFormState = {
    docType: 'SA' as LedgerDocType,
    docDate: new Date().toISOString().split('T')[0],
    postDate: new Date().toISOString().split('T')[0],
    description: '',
    referenceId: '',
    details: [
      { accountId: '', debit: 0, credit: 0, text: '', costCenterId: '' },
      { accountId: '', debit: 0, credit: 0, text: '', costCenterId: '' },
    ]
  };
  const [formData, setFormData] = useState(initialFormState);

  const refreshData = useCallback(() => {
    const ledgerData = FinanceService.getLedger();
    const sorted = ledgerData.filter(t => t.company === company).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setTransactions(sorted);
    setAccounts(FinanceService.getAccounts().filter(a => a.company === company));
    setCostCenters(FinanceService.getCostCenters().filter(cc => cc.company === company));
  }, [company]);

  useEffect(() => {
    refreshData();
    setTemplates(JournalTemplateService.getAll());
    // Load approved requisitions for this company
    try {
      const reqs = InventoryService.getRequisitions().filter(r => r.company === company && r.status === 'Approved');
      setApprovedReqs(reqs);
    } catch { setApprovedReqs([]); }
  }, [company, refreshData]);

  useEffect(() => {
    if (isModalOpen) {
      const allAccounts = FinanceService.getAccounts();
      const filteredAccounts = allAccounts.filter(a => a.company === selectedTargetCompany && a.level === 5);
      setModalAccounts(filteredAccounts);
      setModalCostCenters(FinanceService.getCostCenters().filter(c => c.company === selectedTargetCompany));
    }
  }, [selectedTargetCompany, isModalOpen]);

  // Filter accounts based on selected template — only show relevant accounts
  const filteredModalAccounts = useMemo(() => {
    if (!selectedTemplate || !modalAccounts.length) return modalAccounts;
    const prefixes = selectedTemplate.lines.map(l => l.accountCodePrefix).filter(Boolean);
    if (!prefixes.length) return modalAccounts;
    // Show accounts matching any prefix hint, plus all if no match found
    const matched = modalAccounts.filter(a => prefixes.some(p => a.code.startsWith(p!)));
    return matched.length > 0 ? matched : modalAccounts;
  }, [selectedTemplate, modalAccounts]);

  // Apply template — auto-fill lines and docType
  const applyTemplate = (template: BusinessTransaction) => {
    setSelectedTemplate(template);
    setFormData(prev => ({
      ...prev,
      docType: template.docType as LedgerDocType,
      description: template.name.toUpperCase(),
      details: template.lines.map(line => {
        // Try to auto-find the account by code prefix
        const acc = modalAccounts.find(a => line.accountCodePrefix && a.code.startsWith(line.accountCodePrefix));
        return {
          accountId: acc?.id || '',
          debit: line.side === 'Dr' ? 0 : 0,
          credit: 0,
          text: line.label,
          costCenterId: ''
        };
      })
    }));
  };

  // Apply REQ — auto fill description and reference
  const applyReq = (reqId: string) => {
    setSelectedReqId(reqId);
    const req = approvedReqs.find(r => r.id === reqId);
    if (!req) return;
    setFormData(prev => ({
      ...prev,
      referenceId: req.id,
      description: `REQ: ${req.headerText || req.id} — ${req.requisitioner || ''}`.toUpperCase(),
      details: prev.details.map((d, i) => ({
        ...d,
        text: i === 0 ? `Payment for ${req.headerText || req.id}` : d.text
      }))
    }));
  };

  // Save new custom template
  const handleSaveTemplate = () => {
    if (!newTemplate.code || !newTemplate.name) return alert('Code and Name required.');
    const t: BusinessTransaction = {
      id: `CUSTOM-${Date.now()}`,
      ...newTemplate,
      lines: formData.details.map((d, i) => ({
        side: d.debit > 0 ? 'Dr' : 'Cr',
        accountTypeHint: 'CUSTOM',
        accountCodePrefix: modalAccounts.find(a => a.id === d.accountId)?.code?.slice(0, 4),
        label: d.text || `Line ${i + 1}`
      })),
      company: 'ALL'
    };
    JournalTemplateService.add(t);
    setTemplates(JournalTemplateService.getAll());
    setShowAddTemplate(false);
    setNewTemplate({ code: '', name: '', docType: 'SA', description: '' });
  };

  // Posting accounts — level 5 only (no posting to control accounts)
  const postingAccounts = filteredModalAccounts.filter(a => a.level === 5);

  const filteredTransactions = useMemo(() => {
    let result = transactions;
    if (activeTab !== 'System') result = result.filter(t => t.status === activeTab);
    else result = result.filter(t => ['OB', 'SA'].includes(t.docType) && t.status === 'Posted');
    if (searchTerm) result = result.filter(t =>
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.referenceId?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return result;
  }, [transactions, activeTab, searchTerm]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  useEffect(() => setCurrentPage(1), [searchTerm, activeTab]);

  const totalDebit = formData.details.reduce((sum, d) => sum + (Number(d.debit) || 0), 0);
  const totalCredit = formData.details.reduce((sum, d) => sum + (Number(d.credit) || 0), 0);
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

  const handleSaveDocument = (status: LedgerStatus) => {
    if (!isBalanced) return alert('Document is not balanced.');
    const txId = editingDocId || `${formData.docType}-${Date.now().toString().slice(-6)}`;
    const tx: LedgerTransaction = {
      id: txId,
      company: selectedTargetCompany,
      docType: formData.docType, docDate: formData.docDate,
      date: formData.postDate, description: formData.description.toUpperCase(),
      referenceId: selectedReqId ? `REQ:${selectedReqId}|${formData.referenceId}` : formData.referenceId,
      status,
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
    alert(status === 'Posted' ? `Posted: ${txId} to ${selectedTargetCompany}.` : `Parked: ${txId}.`);
  };

  const resetForm = () => {
    setFormData(initialFormState);
    setEditingDocId(null);
    setSelectedTargetCompany(company);
    setSelectedTemplate(null);
    setSelectedReqId('');
  };

  const handleEditParked = (tx: LedgerTransaction) => {
    setEditingDocId(tx.id);
    setSelectedTargetCompany(tx.company);
    setFormData({
      docType: tx.docType, docDate: tx.docDate, postDate: tx.date,
      description: tx.description, referenceId: tx.referenceId,
      details: tx.details.map(d => ({ ...d, debit: d.debit, credit: d.credit, text: d.text || '', costCenterId: d.costCenterId || '' }))
    });
    setIsModalOpen(true);
  };

  const handleDeleteParked = (id: string) => {
    if (confirm('Delete this parked document?')) {
      FinanceService.saveLedger(FinanceService.getLedger().filter(t => t.id !== id));
      refreshData();
    }
  };

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || 'Unknown';
  const getAccountCode = (id: string) => accounts.find(a => a.id === id)?.code || '0000';
  const getCCCode = (id: string) => costCenters.find(cc => cc.id === id)?.code || '-';

  const DOC_TYPE_LABELS: Record<string, string> = {
    SA: 'SA — G/L', KR: 'KR — Vendor Invoice', DR: 'DR — Customer Invoice',
    DZ: 'DZ — Customer Payment', KZ: 'KZ — Vendor Payment', CJ: 'CJ — Cash Journal',
    OB: 'OB — Opening Balance', PV: 'PV — Payment Voucher', RV: 'RV — Receipt Voucher', JV: 'JV — Journal Voucher'
  };

  // Group templates by category
  const templateGroups = useMemo(() => {
    const groups: Record<string, BusinessTransaction[]> = {};
    templates.forEach(t => {
      const cat = t.code.split('-')[0];
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    return groups;
  }, [templates]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Tabs */}
      <div className="flex items-center space-x-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-full md:w-fit no-print">
        {(['Posted', 'Parked', 'System'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === tab ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
            {tab === 'Parked' && transactions.filter(t => t.status === 'Parked').length > 0 &&
              <span className="mr-1.5 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">{transactions.filter(t => t.status === 'Parked').length}</span>
            }
            {tab}
          </button>
        ))}
        <button onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="ml-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center space-x-2">
          <Plus size={14}/><span>New Entry</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
        <input type="text" placeholder="Search entries..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          className="sap-input w-full pl-9 py-2 text-xs"/>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left sap-table">
          <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
            <tr>
              <th className="px-4 py-3">Doc No</th><th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Date</th><th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3 text-right">Credit</th>
              <th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedTransactions.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-sm">No entries found</td></tr>
            )}
            {paginatedTransactions.map(tx => {
              const dr = tx.details.reduce((s, d) => s + d.debit, 0);
              const cr = tx.details.reduce((s, d) => s + d.credit, 0);
              return (
                <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-blue-600 text-xs">{tx.id}</td>
                  <td className="px-4 py-3"><span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded">{tx.docType}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600">{tx.docDate}</td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-800 max-w-xs truncate">{tx.description}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{tx.referenceId}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-slate-900">{dr.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-blue-600">{cr.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tx.status === 'Posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{tx.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-1">
                      {tx.status === 'Parked' && <>
                        <button onClick={() => handleEditParked(tx)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"><Edit2 size={12}/></button>
                        <button onClick={() => handleDeleteParked(tx.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"><Trash2 size={12}/></button>
                      </>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage}/>}

      {/* GL ENTRY MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-start justify-center p-4 z-[300] overflow-y-auto">
          <div className="bg-white w-full max-w-6xl my-4 rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[95vh]">

            {/* Header */}
            <div className="bg-slate-900 text-white px-8 py-5 flex justify-between items-center rounded-t-2xl shrink-0">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">{editingDocId ? 'Edit Document' : 'New Journal Entry'}</h3>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">All entries park first — review before posting</p>
              </div>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="hover:bg-white/10 p-2 rounded-lg transition-colors"><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* Business Transaction Selector */}
              <div className="px-8 pt-6 pb-4 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center space-x-1.5"><Tag size={12}/><span>Business Transaction</span></label>
                  <button onClick={() => setShowAddTemplate(!showAddTemplate)}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1">
                    <Plus size={12}/><span>{showAddTemplate ? 'Cancel' : '+ Add New Transaction Type'}</span>
                  </button>
                </div>

                {/* Template Groups */}
                <div className="flex flex-wrap gap-2">
                  {Object.entries(templateGroups).map(([cat, ts]) => (
                    <div key={cat} className="relative group">
                      <button className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${selectedTemplate && ts.find(t => t.id === selectedTemplate.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                        {cat} <ChevronDown size={10} className="inline ml-0.5"/>
                      </button>
                      <div className="absolute top-8 left-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[280px] hidden group-hover:block">
                        {ts.map(t => (
                          <button key={t.id} onClick={() => applyTemplate(t)}
                            className={`w-full text-left px-4 py-2.5 text-xs hover:bg-blue-50 transition-colors flex items-center justify-between ${selectedTemplate?.id === t.id ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700'}`}>
                            <span>{t.name}</span>
                            <span className="text-[9px] text-slate-400 font-mono">{t.code}</span>
                          </button>
                        ))}
                        {!ts[0]?.isSystem && (
                          <button onClick={() => { JournalTemplateService.delete(ts[0].id); setTemplates(JournalTemplateService.getAll()); }}
                            className="w-full text-left px-4 py-2 text-[10px] text-red-500 hover:bg-red-50 border-t">Delete Custom</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {selectedTemplate && (
                  <div className="mt-2 text-[10px] text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 font-medium">
                    ✓ {selectedTemplate.name} — {selectedTemplate.description}
                  </div>
                )}

                {/* Add New Template Form */}
                {showAddTemplate && (
                  <div className="mt-3 p-4 bg-white border border-blue-100 rounded-xl space-y-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">New Transaction Type — will save current line layout as template</p>
                    <div className="grid grid-cols-4 gap-3">
                      <div><label className="text-[10px] font-bold text-slate-500 block mb-1">Code</label>
                        <input value={newTemplate.code} onChange={e => setNewTemplate({...newTemplate, code: e.target.value.toUpperCase()})} placeholder="XX-001" className="sap-input w-full text-xs"/></div>
                      <div className="col-span-2"><label className="text-[10px] font-bold text-slate-500 block mb-1">Name</label>
                        <input value={newTemplate.name} onChange={e => setNewTemplate({...newTemplate, name: e.target.value})} placeholder="e.g. Factory Fuel Purchase" className="sap-input w-full text-xs"/></div>
                      <div><label className="text-[10px] font-bold text-slate-500 block mb-1">Doc Type</label>
                        <select value={newTemplate.docType} onChange={e => setNewTemplate({...newTemplate, docType: e.target.value as LedgerDocType})} className="sap-input w-full text-xs">
                          {Object.entries(DOC_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                        </select></div>
                    </div>
                    <button onClick={handleSaveTemplate} className="sap-btn-primary text-xs">Save Template</button>
                  </div>
                )}
              </div>

              {/* Form Header Fields */}
              <div className="px-8 py-5 border-b border-slate-100">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Company</label>
                    <select value={selectedTargetCompany} onChange={e => setSelectedTargetCompany(e.target.value as Company)} className="sap-input w-full font-bold text-xs">
                      {['GTK','GTI','Glassco','Nippon','Factory'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Doc Type</label>
                    <select value={formData.docType} onChange={e => setFormData({...formData, docType: e.target.value as LedgerDocType})} className="sap-input w-full font-bold text-xs">
                      {Object.entries(DOC_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Doc Date</label>
                    <input type="date" value={formData.docDate} onChange={e => setFormData({...formData, docDate: e.target.value})} className="sap-input w-full text-xs"/>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Post Date</label>
                    <input type="date" value={formData.postDate} onChange={e => setFormData({...formData, postDate: e.target.value})} className="sap-input w-full text-xs"/>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Header Text</label>
                    <input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="sap-input w-full font-bold uppercase text-xs" placeholder="Description..."/>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Reference</label>
                    <input type="text" value={formData.referenceId} onChange={e => setFormData({...formData, referenceId: e.target.value})} className="sap-input w-full font-bold uppercase text-xs"/>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1 flex items-center space-x-1"><Link2 size={10}/><span>Link Requisition</span></label>
                    <select value={selectedReqId} onChange={e => applyReq(e.target.value)} className="sap-input w-full text-xs">
                      <option value="">— None —</option>
                      {approvedReqs.map(r => (
                        <option key={r.id} value={r.id}>{r.id} | {r.headerText || 'REQ'} | PKR {(r.totalValue || 0).toLocaleString()}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="px-8 py-4">
                <table className="w-full text-left min-w-[900px]">
                  <thead className="bg-slate-50 border border-slate-200 rounded">
                    <tr className="text-[10px] font-black uppercase text-slate-500">
                      <th className="px-3 py-2 w-8 text-center">#</th>
                      <th className="px-3 py-2">G/L Account</th>
                      <th className="px-3 py-2 w-40">Cost Center</th>
                      <th className="px-3 py-2">Item Text</th>
                      <th className="px-3 py-2 w-36 text-right">Debit (PKR)</th>
                      <th className="px-3 py-2 w-36 text-right">Credit (PKR)</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {formData.details.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-center text-[10px] font-bold text-slate-300">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <select value={row.accountId} onChange={e => { const next = [...formData.details]; next[idx].accountId = e.target.value; setFormData({...formData, details: next}); }}
                            className="sap-input w-full py-1 text-xs">
                            <option value="">— Select G/L Account —</option>
                            {postingAccounts.sort((a,b) => a.code.localeCompare(b.code)).map(a => (
                              <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select value={row.costCenterId} onChange={e => { const next = [...formData.details]; next[idx].costCenterId = e.target.value; setFormData({...formData, details: next}); }}
                            className="sap-input w-full py-1 text-xs">
                            <option value="">N/A</option>
                            {modalCostCenters.map(cc => <option key={cc.id} value={cc.id}>[{cc.code}] {cc.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={row.text} onChange={e => { const next = [...formData.details]; next[idx].text = e.target.value; setFormData({...formData, details: next}); }}
                            className="sap-input w-full py-1 text-xs"/>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={row.debit || ''} onChange={e => { const next = [...formData.details]; next[idx].debit = Number(e.target.value); next[idx].credit = 0; setFormData({...formData, details: next}); }}
                            className="sap-input w-full py-1 text-right font-bold text-slate-900 text-xs"/>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={row.credit || ''} onChange={e => { const next = [...formData.details]; next[idx].credit = Number(e.target.value); next[idx].debit = 0; setFormData({...formData, details: next}); }}
                            className="sap-input w-full py-1 text-right font-bold text-blue-600 text-xs"/>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => { if (formData.details.length > 2) setFormData({...formData, details: formData.details.filter((_, i) => i !== idx)}); }}
                            className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => setFormData({...formData, details: [...formData.details, { accountId: '', debit: 0, credit: 0, text: '', costCenterId: '' }]})}
                  className="mt-2 text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                  <Plus size={12}/><span>Add Line</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center rounded-b-2xl shrink-0">
              <div className="flex items-center space-x-4 text-xs">
                <div className={`px-4 py-2 rounded-xl font-bold border ${isBalanced ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                  {isBalanced ? '✓ Balanced' : `Difference: ${(totalDebit - totalCredit).toLocaleString()}`}
                </div>
                <span className="text-slate-500">Dr: <strong>{totalDebit.toLocaleString()}</strong></span>
                <span className="text-slate-500">Cr: <strong>{totalCredit.toLocaleString()}</strong></span>
              </div>
              <div className="flex space-x-3">
                <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="sap-btn-ghost text-xs">Cancel</button>
                <button onClick={() => handleSaveDocument('Parked')} disabled={!isBalanced}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2 rounded-xl text-xs font-bold uppercase transition-all shadow-md flex items-center space-x-2 disabled:opacity-40">
                  <FileClock size={14}/><span>Park</span>
                </button>
                <button onClick={() => handleSaveDocument('Posted')} disabled={!isBalanced}
                  className="sap-btn-primary text-xs flex items-center space-x-2 disabled:opacity-40">
                  <Save size={14}/><span>Post to Ledger</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneralLedger;
