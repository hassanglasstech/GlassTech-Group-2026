import React, { useState, useEffect, useMemo } from 'react';
import { Company, PettyCashEntry, CostCenter, Account, LedgerTransaction, Requisition } from '../../shared/types';
import { FinanceService } from '../services/financeService';
import { InventoryService } from '../../procurement/services/inventoryService';
import { Plus, Search, ArrowUpRight, ArrowDownLeft, X, Save, Wallet, Check, AlertTriangle, Fingerprint, Printer, Link2, Clock, CheckCircle2, AlertCircle, DollarSign, ChevronDown } from 'lucide-react';
import { UnifiedPaymentPrint } from '../components/prints/UnifiedPaymentPrint';

const BUSINESS_TRANSACTIONS = [
    { code: 'E10', name: 'Cash Withdrawal from Bank',        type: 'Receipt',  accountType: 'Bank' },
    { code: 'E20', name: 'Customer Payment (Cash)',           type: 'Receipt',  accountType: 'Receivable' },
    { code: 'E30', name: 'Loan Recovery / Advance Return',   type: 'Receipt',  accountType: 'Asset' },
    { code: 'E90', name: 'Misc. Scrap Sale / Income',        type: 'Receipt',  accountType: 'Revenue' },
    { code: 'A10', name: 'Office Supplies (Stationery)',      type: 'Payment',  accountType: 'Expense' },
    { code: 'A20', name: 'Repair & Maintenance',             type: 'Payment',  accountType: 'Expense' },
    { code: 'A25', name: 'Factory Overheads / Utilities',    type: 'Payment',  accountType: 'Expense' },
    { code: 'A30', name: 'Consumables Purchase (Direct)',    type: 'Payment',  accountType: 'Expense' },
    { code: 'A35', name: 'Inventory Material Purchase',      type: 'Payment',  accountType: 'Inventory' },
    { code: 'A40', name: 'Fuel & Logistics',                 type: 'Payment',  accountType: 'Expense' },
    { code: 'A50', name: 'Cash Deposit to Bank',             type: 'Payment',  accountType: 'Bank' },
    { code: 'A60', name: 'Vendor Payment (Cash)',            type: 'Payment',  accountType: 'Payable' },
    { code: 'A70', name: 'Staff Salary / Advance',           type: 'Payment',  accountType: 'Asset' },
    { code: 'A80', name: 'REQ Payment — Approved Request',   type: 'Payment',  accountType: 'Expense' },
];

const PettyCashBook: React.FC<{ company: Company }> = ({ company }) => {
  const [entries, setEntries]                   = useState<PettyCashEntry[]>([]);
  const [costCenters, setCostCenters]           = useState<CostCenter[]>([]);
  const [accounts, setAccounts]                 = useState<Account[]>([]);
  const [authorizedReqs, setAuthorizedReqs]     = useState<Requisition[]>([]);
  const [paymentQueueReqs, setPaymentQueueReqs] = useState<Requisition[]>([]);
  const [linkedReqId, setLinkedReqId]           = useState('');
  const [selectedDate, setSelectedDate]         = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab]               = useState<'Payment' | 'Receipt'>('Payment');
  const [activeView, setActiveView]             = useState<'journal' | 'queue'>('journal');
  const [searchTerm, setSearchTerm]             = useState('');
  const [isModalOpen, setIsModalOpen]           = useState(false);
  const [printingEntry, setPrintingEntry]       = useState<PettyCashEntry | null>(null);

  const [formData, setFormData] = useState<Partial<PettyCashEntry>>({
    amount: 0, description: '', costCenterId: '', glAccountId: '', businessTransaction: '', referenceDoc: ''
  });

  const refreshData = () => {
    const allEntries = FinanceService.getPettyCashEntries().filter(e => e.company === company);
    setEntries(allEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setAccounts(FinanceService.getAccounts().filter(a => a.company === company && a.level === 5));
    setCostCenters(FinanceService.getCostCenters().filter(c => c.company === company));

    const allReqs = InventoryService.getRequisitions().filter(Boolean);

    // Payment queue: approved REQs flagged as requiresCashPayment and not yet paid
    const queue = allReqs.filter(r =>
      r.company === company &&
      r.status === 'Approved' &&
      r.requiresCashPayment === true &&
      r.paymentStatus !== 'Paid'
    );
    setPaymentQueueReqs(queue);

    // Linkable reqs: approved, any type (old + new)
    const linkable = allReqs.filter(r =>
      r.company === company &&
      r.status === 'Approved'
    );
    setAuthorizedReqs(linkable);
  };

  useEffect(() => { refreshData(); }, [company]);

  const handleLinkRequisition = (reqId: string) => {
    const req = authorizedReqs.find(r => r.id === reqId);
    if (req) {
      setLinkedReqId(reqId);
      setFormData(prev => ({
        ...prev,
        amount: req.totalValue || req.estimatedAmount || 0,
        description: `REQ: ${req.headerText} (${req.requisitioner})`,
        referenceDoc: req.id,
        businessTransaction: 'A80',
        glAccountId: req.glAccountHint
          ? accounts.find(a => a.code.startsWith(req.glAccountHint!))?.id || ''
          : ''
      }));
    } else {
      setLinkedReqId('');
      setFormData(prev => ({ ...prev, referenceDoc: '', businessTransaction: '' }));
    }
  };

  // Open modal pre-filled from payment queue
  const handlePayFromQueue = (req: Requisition) => {
    setActiveTab('Payment');
    setLinkedReqId(req.id);
    setFormData({
      amount: req.totalValue || req.estimatedAmount || 0,
      description: `REQ PAYMENT: ${req.headerText} (${req.requisitioner})`,
      referenceDoc: req.id,
      businessTransaction: 'A80',
      type: 'Payment',
      glAccountId: req.glAccountHint
        ? accounts.find(a => a.code.startsWith(req.glAccountHint!))?.id || ''
        : ''
    });
    setIsModalOpen(true);
  };

  const currentBalance = useMemo(() =>
    entries.filter(e => e.status === 'Posted')
      .reduce((acc, e) => e.type === 'Receipt' ? acc + e.amount : acc - e.amount, 0),
    [entries]
  );

  const mainCashAccount = useMemo(() =>
    accounts.find(a => a.code === '12320-01') ||
    accounts.find(a => a.code.startsWith('12320')) ||
    accounts.find(a => a.name.toUpperCase().includes('PETTY CASH')) ||
    accounts.find(a => a.name.toUpperCase().includes('CASH IN HAND')),
    [accounts]
  );

  const handlePostEntry = (entryOrForm: Partial<PettyCashEntry>, isNew: boolean) => {
    if (!entryOrForm.description || !entryOrForm.amount) return alert('Amount and Description required.');
    if (!isNew && !entryOrForm.glAccountId && !formData.glAccountId) return alert('Please map a GL Account to approve this entry.');
    if (!mainCashAccount) return alert('System Error: Main Cash GL not found. Setup Chart of Accounts first.');

    const glId      = isNew ? entryOrForm.glAccountId : formData.glAccountId;
    const bizTrans  = isNew ? entryOrForm.businessTransaction : formData.businessTransaction;
    const ccId      = isNew ? entryOrForm.costCenterId : formData.costCenterId;
    const entryType = entryOrForm.type || activeTab;

    const debitLine  = entryType === 'Receipt'
      ? { accountId: mainCashAccount.id, debit: entryOrForm.amount!, credit: 0, text: `CJ: ${bizTrans}` }
      : { accountId: glId!, debit: entryOrForm.amount!, credit: 0, text: `CJ: ${entryOrForm.description}`, costCenterId: ccId };

    const creditLine = entryType === 'Receipt'
      ? { accountId: glId!, debit: 0, credit: entryOrForm.amount!, text: `CJ: ${entryOrForm.description}`, costCenterId: ccId }
      : { accountId: mainCashAccount.id, debit: 0, credit: entryOrForm.amount!, text: `CJ: ${bizTrans}` };

    const txId = `CJ-${Date.now().toString().slice(-6)}`;
    const ledgerTx: LedgerTransaction = {
      id: txId, company, docType: 'CJ', docDate: selectedDate, date: selectedDate,
      description: `FBCJ: ${bizTrans} — ${entryOrForm.description}`,
      referenceId: entryOrForm.referenceDoc || 'CASH_DESK',
      status: 'Posted',
      details: [debitLine, creditLine]
    };
    FinanceService.recordTransaction(ledgerTx);

    if (isNew) {
      const newEntry: PettyCashEntry = {
        ...(entryOrForm as PettyCashEntry),
        id: txId, company, date: selectedDate,
        balance: currentBalance + (entryType === 'Receipt' ? entryOrForm.amount! : -entryOrForm.amount!),
        status: 'Posted', recordedBy: 'LOCAL_USER'
      };
      FinanceService.savePettyCashEntries([...FinanceService.getPettyCashEntries(), newEntry]);

      // ── PHASE 3: Mark linked REQ as Paid ──────────────────────────────
      if (linkedReqId) {
        const allReqs = InventoryService.getRequisitions().filter(Boolean);
        const updatedReqs = allReqs.map(r => r.id === linkedReqId ? {
          ...r,
          status: 'Completed' as const,
          paymentStatus: 'Paid' as const,
          paidAmount: entryOrForm.amount,
          paymentRef: txId,
          paymentDate: selectedDate
        } : r);
        InventoryService.saveRequisitions(updatedReqs);
      }
    } else {
      const allEntries = FinanceService.getPettyCashEntries();
      const updated = allEntries.map(e => e.id === entryOrForm.id
        ? { ...e, status: 'Posted' as const, glAccountId: glId, businessTransaction: bizTrans, balance: currentBalance + (e.type === 'Receipt' ? e.amount : -e.amount) }
        : e
      );
      FinanceService.savePettyCashEntries(updated);
    }

    refreshData();
    setIsModalOpen(false);
    setFormData({ amount: 0, description: '', costCenterId: '', glAccountId: '', businessTransaction: '', referenceDoc: '' });
    setLinkedReqId('');
    alert('Cash Entry Posted Successfully.');
  };

  const getFilteredGLAccounts = (bizTransCode: string) => {
    if (!bizTransCode) return accounts;
    const config = BUSINESS_TRANSACTIONS.find(b => b.code === bizTransCode);
    if (!config) return accounts;
    if (config.accountType === 'Expense')   return accounts.filter(a => a.type === 'Expense');
    if (config.accountType === 'Revenue')   return accounts.filter(a => a.type === 'Revenue');
    if (config.accountType === 'Bank')      return accounts.filter(a => a.name.toUpperCase().includes('BANK'));
    if (config.accountType === 'Inventory') return accounts.filter(a => a.code.startsWith('121'));
    if (config.accountType === 'Asset')     return accounts.filter(a => a.type === 'Asset');
    if (config.accountType === 'Payable')   return accounts.filter(a => a.type === 'Liability');
    return accounts;
  };

  const handlePrint = (entry: PettyCashEntry) => {
    setPrintingEntry(entry);
    setTimeout(() => { window.print(); setPrintingEntry(null); }, 500);
  };

  const filteredEntries = entries.filter(e =>
    e.description?.toUpperCase().includes(searchTerm.toUpperCase()) ||
    e.referenceDoc?.toUpperCase().includes(searchTerm.toUpperCase())
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#354a5f] text-white p-6 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Wallet size={80}/></div>
          <p className="text-[10px] font-bold uppercase text-blue-200 tracking-widest mb-1">Cash Balance (FBCJ)</p>
          <p className="text-3xl font-black">PKR {currentBalance.toLocaleString()}</p>
        </div>
        <div className={`p-6 rounded-2xl shadow-sm relative overflow-hidden border ${paymentQueueReqs.length > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-slate-500">Payment Queue</p>
          <p className={`text-3xl font-black ${paymentQueueReqs.length > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {paymentQueueReqs.length} Pending
          </p>
          {paymentQueueReqs.length > 0 && (
            <p className="text-xs text-rose-600 font-bold mt-1">
              PKR {paymentQueueReqs.reduce((s, r) => s + (r.totalValue || 0), 0).toLocaleString()} awaiting
            </p>
          )}
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1">Today</p>
          <p className="text-xl font-black text-slate-800">{new Date().toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="mt-2 sap-input w-full text-xs font-bold"/>
        </div>
      </div>

      {/* View Toggle + Actions */}
      <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-sm flex justify-between items-center no-print flex-wrap gap-3">
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
          <button onClick={() => setActiveView('journal')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeView === 'journal' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
            Cash Journal
          </button>
          <button onClick={() => setActiveView('queue')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center space-x-1.5 ${activeView === 'queue' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
            <span>Payment Queue</span>
            {paymentQueueReqs.length > 0 && (
              <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{paymentQueueReqs.length}</span>
            )}
          </button>
        </div>
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13}/>
            <input type="text" placeholder="Search entries..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="sap-input pl-9 py-2 text-xs w-56"/>
          </div>
          <button onClick={() => { setFormData({ amount: 0, description: '', costCenterId: '', glAccountId: '', businessTransaction: '', referenceDoc: '' }); setLinkedReqId(''); setIsModalOpen(true); }}
            className="sap-btn-primary flex items-center space-x-2 text-xs">
            <Plus size={14}/><span>Post Cash Document</span>
          </button>
        </div>
      </div>

      {/* ── PAYMENT QUEUE VIEW ───────────────────────────────── */}
      {activeView === 'queue' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight flex items-center space-x-2">
                <DollarSign size={16} className="text-rose-500"/><span>Finance Payment Queue</span>
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Approved requisitions awaiting cash payment — raised by all departments</p>
            </div>
          </div>
          {paymentQueueReqs.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3"/>
              <p className="text-slate-500 font-bold text-sm">All clear — no pending payments</p>
            </div>
          ) : (
            <table className="w-full text-left sap-table">
              <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
                <tr>
                  <th className="px-5 py-3">REQ No</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Requested By</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3 text-right">Amount (PKR)</th>
                  <th className="px-5 py-3">GL Hint</th>
                  <th className="px-5 py-3 text-center">Priority</th>
                  <th className="px-5 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentQueueReqs.map(req => (
                  <tr key={req.id} className={`hover:bg-rose-50 transition-colors ${req.priority === 'Urgent' ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-5 py-3 font-mono font-black text-blue-600 text-xs">{req.id}</td>
                    <td className="px-5 py-3">
                      <span className="bg-slate-100 text-slate-700 text-[9px] font-black px-2 py-0.5 rounded uppercase">{req.category}</span>
                      <span className="block text-[9px] text-slate-400 mt-0.5">{req.subCategory}</span>
                    </td>
                    <td className="px-5 py-3 text-xs font-bold text-slate-800 max-w-[200px] truncate">{req.headerText}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{req.requisitioner}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{req.date}</td>
                    <td className="px-5 py-3 text-right font-black text-slate-900 text-sm">
                      {(req.totalValue || req.estimatedAmount || 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-[10px] font-mono text-slate-500">{req.glAccountHint || '—'}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${req.priority === 'Urgent' ? 'bg-red-100 text-red-700' : req.priority === 'Normal' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        {req.priority}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => handlePayFromQueue(req)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center space-x-1 mx-auto">
                        <DollarSign size={11}/><span>Pay Now</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── CASH JOURNAL VIEW ───────────────────────────────── */}
      {activeView === 'journal' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden no-print">
          <table className="w-full text-left sap-table">
            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
              <tr>
                <th className="px-4 py-3 w-24">Date</th>
                <th className="px-4 py-3 w-28">Status</th>
                <th className="px-4 py-3">Narrative</th>
                <th className="px-4 py-3 w-32">GL Code</th>
                <th className="px-4 py-3 w-28 text-right">Receipt</th>
                <th className="px-4 py-3 w-28 text-right">Payment</th>
                <th className="px-4 py-3 w-32 text-right">Balance</th>
                <th className="px-4 py-3 w-20 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.length === 0 && (
                <tr><td colSpan={8} className="py-12 text-center text-slate-400 text-sm">No entries found</td></tr>
              )}
              {filteredEntries.map(e => (
                <tr key={e.id} className={`transition-colors ${e.status === 'Parked' ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                  <td className="px-4 py-2.5 text-slate-500 font-bold text-[11px]">{e.date}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${e.status === 'Posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {e.status}
                    </span>
                    {e.referenceDoc && e.referenceDoc.startsWith('REQ-') && (
                      <span className="ml-1 text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        🔗 {e.referenceDoc}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-bold text-slate-800 text-xs uppercase">{e.description}</td>
                  <td className="px-4 py-2.5 text-center text-[10px] font-mono text-slate-500">
                    {accounts.find(a => a.id === e.glAccountId)?.code || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-black text-emerald-700">{e.type === 'Receipt' ? e.amount.toLocaleString() : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-black text-rose-700">{e.type === 'Payment' ? e.amount.toLocaleString() : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-black text-slate-900 text-xs">{e.status === 'Posted' ? `PKR ${e.balance.toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      {e.status === 'Parked' && (
                        <button onClick={() => { setFormData({...e}); setIsModalOpen(true); }}
                          className="bg-emerald-600 text-white px-2 py-1 rounded text-[9px] font-bold uppercase hover:bg-emerald-700">Approve</button>
                      )}
                      {e.status === 'Posted' && (
                        <button onClick={() => handlePrint(e)} className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition-colors" title="Print">
                          <Printer size={15}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Print overlay */}
      {printingEntry && <UnifiedPaymentPrint data={printingEntry} company={company} partyName="Authorized Personnel"/>}

      {/* ── ENTRY MODAL ─────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[450]">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">

            <div className="bg-[#354a5f] text-white px-7 py-5 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">
                  {formData.status === 'Parked' ? 'Approve Factory Entry' : 'Cash Journal Entry'}
                </h3>
                <p className="text-[10px] text-blue-200 mt-0.5">FBCJ — {company}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="hover:bg-white/10 p-2 rounded-lg transition-colors"><X size={20}/></button>
            </div>

            <div className="p-7 space-y-5 bg-slate-50 flex-1 overflow-y-auto">

              {/* Parked entry banner */}
              {formData.status === 'Parked' && (
                <div className="bg-amber-50 p-3 border border-amber-200 rounded-xl text-amber-800 text-xs font-bold uppercase">
                  Factory entry — assign GL Account to post
                </div>
              )}

              {/* Tab — only for new entries */}
              {!formData.id && (
                <div className="flex space-x-1 p-1 bg-slate-200 rounded-xl">
                  <button onClick={() => setActiveTab('Payment')}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${activeTab === 'Payment' ? 'bg-rose-600 text-white shadow' : 'text-slate-600'}`}>
                    Cash Payment
                  </button>
                  <button onClick={() => setActiveTab('Receipt')}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${activeTab === 'Receipt' ? 'bg-emerald-600 text-white shadow' : 'text-slate-600'}`}>
                    Cash Receipt
                  </button>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">

                {/* REQ Linking — payments only */}
                {!formData.id && activeTab === 'Payment' && authorizedReqs.length > 0 && (
                  <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-xl">
                    <label className="text-[10px] font-black uppercase text-blue-700 block mb-1.5 flex items-center space-x-1">
                      <Link2 size={10}/><span>Link to Approved Requisition (Optional)</span>
                    </label>
                    <select value={linkedReqId} onChange={e => handleLinkRequisition(e.target.value)}
                      className="w-full bg-white border border-blue-200 p-2 rounded-lg text-xs font-bold text-blue-900 outline-none">
                      <option value="">— Direct Payment (No REQ Link) —</option>
                      {authorizedReqs.map(req => (
                        <option key={req.id} value={req.id}>
                          {req.id} | {req.headerText?.slice(0, 30)} | PKR {(req.totalValue || 0).toLocaleString()}
                          {req.requiresCashPayment ? ' ⚡' : ''}
                        </option>
                      ))}
                    </select>
                    {linkedReqId && (
                      <p className="text-[10px] text-blue-700 font-bold mt-1.5">
                        ✓ Payment will mark this REQ as Paid after posting
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Business Transaction</label>
                    <select value={formData.businessTransaction} onChange={e => setFormData({...formData, businessTransaction: e.target.value})}
                      className="sap-input w-full font-bold text-xs">
                      <option value="">— Select —</option>
                      {BUSINESS_TRANSACTIONS.filter(b => b.type === (formData.type || activeTab)).map(b => (
                        <option key={b.code} value={b.code}>[{b.code}] {b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">GL Account</label>
                    <select value={formData.glAccountId} onChange={e => setFormData({...formData, glAccountId: e.target.value})}
                      className="sap-input w-full font-bold text-xs">
                      <option value="">— Map to GL —</option>
                      {getFilteredGLAccounts(formData.businessTransaction || '').map(a => (
                        <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Amount (PKR)</label>
                  <input type="number" disabled={!!formData.id} value={formData.amount}
                    onChange={e => setFormData({...formData, amount: Number(e.target.value)})}
                    className="sap-input w-full font-black text-lg"/>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Description</label>
                  <input type="text" disabled={!!formData.id} value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    className="sap-input w-full font-bold uppercase text-xs"/>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Cost Center</label>
                    <select value={formData.costCenterId} onChange={e => setFormData({...formData, costCenterId: e.target.value})}
                      className="sap-input w-full text-xs">
                      <option value="">N/A</option>
                      {costCenters.map(cc => <option key={cc.id} value={cc.id}>[{cc.code}] {cc.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Reference Doc</label>
                    <input type="text" value={formData.referenceDoc}
                      onChange={e => setFormData({...formData, referenceDoc: e.target.value})}
                      className="sap-input w-full font-bold uppercase text-xs"/>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-7 py-4 bg-white border-t flex justify-end space-x-3">
              <button onClick={() => setIsModalOpen(false)} className="sap-btn-ghost text-xs">Cancel</button>
              <button onClick={() => handlePostEntry(formData, !formData.id)} className="sap-btn-primary flex items-center space-x-2 text-xs">
                <Save size={14}/>
                <span>{formData.status === 'Parked' ? 'Accept & Post' : 'Post Entry'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PettyCashBook;
