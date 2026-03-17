import React, { useState, useEffect, useMemo } from 'react';
import { Company, PettyCashEntry, CostCenter, Account, LedgerTransaction, Requisition } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SidePanel } from '@/modules/shared/components/SidePanel';
import { Plus, Search, ArrowUpRight, ArrowDownLeft, X, Save, Wallet, Check, AlertTriangle, Fingerprint, Printer } from 'lucide-react';
import { UnifiedPaymentPrint } from '@/modules/finance/components/prints/UnifiedPaymentPrint';

const BUSINESS_TRANSACTIONS = [
    // RECEIPTS
    { code: 'E10', name: 'Cash Withdrawal from Bank', type: 'Receipt', accountType: 'Bank' },
    { code: 'E20', name: 'Customer Payment (Cash)', type: 'Receipt', accountType: 'Receivable' },
    { code: 'E30', name: 'Loan Recovery / Advance Return', type: 'Receipt', accountType: 'Asset' },
    { code: 'E90', name: 'Misc. Scrap Sale / Income', type: 'Receipt', accountType: 'Revenue' },
    
    // PAYMENTS
    { code: 'A10', name: 'Office Supplies (Stationery)', type: 'Payment', accountType: 'Expense' },
    { code: 'A20', name: 'Repair & Maintenance', type: 'Payment', accountType: 'Expense' },
    { code: 'A25', name: 'Factory Overheads / Utilities', type: 'Payment', accountType: 'Expense' },
    { code: 'A30', name: 'Consumables Purchase (Direct)', type: 'Payment', accountType: 'Expense' },
    { code: 'A35', name: 'Inventory Material Purchase', type: 'Payment', accountType: 'Inventory' },
    { code: 'A40', name: 'Fuel & Logistics', type: 'Payment', accountType: 'Expense' },
    { code: 'A50', name: 'Cash Deposit to Bank', type: 'Payment', accountType: 'Bank' },
    { code: 'A60', name: 'Vendor Payment (Cash)', type: 'Payment', accountType: 'Payable' },
    { code: 'A70', name: 'Staff Salary / Advance', type: 'Payment', accountType: 'Asset' },
];

const PettyCashBook: React.FC<{ company: Company }> = ({ company }) => {
  const [entries, setEntries] = useState<PettyCashEntry[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [authorizedReqs, setAuthorizedReqs] = useState<Requisition[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'Receipt' | 'Payment'>('Payment');
  
  // Printing State
  const [printingEntry, setPrintingEntry] = useState<PettyCashEntry | null>(null);

  const [formData, setFormData] = useState<Partial<PettyCashEntry>>({ 
      amount: 0, description: '', costCenterId: '', recordedBy: '', businessTransaction: '', glAccountId: '', referenceDoc: ''
  });

  const [linkedReqId, setLinkedReqId] = useState('');

  useEffect(() => { refreshData(); }, [company]);

  const refreshData = () => {
    const all = FinanceService.getPettyCashEntries();
    // Filter for THIS company OR Parked entries assigned to this company by Factory
    const filtered = all.filter(e => e.company === company || (e.targetCompany === company && e.status === 'Parked'));
    setEntries(filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    setCostCenters(FinanceService.getCostCenters().filter(cc => cc.company === company));
    setAccounts(FinanceService.getAccounts().filter(a => a.company === company && a.level === 5));

    // Fetch Authorized Requisitions for Linking (Expense/Maintenance/General/Overtime)
    const allReqs = InventoryService.getRequisitions().filter(Boolean);
    const relevant = allReqs.filter(r => 
        r.company === company && 
        r.status === 'Approved' && 
        ['Expense', 'Maintenance', 'General', 'Overtime', 'Consumable'].includes(r.reqType || '')
    );
    setAuthorizedReqs(relevant);
  };

  const handleLinkRequisition = (reqId: string) => {
      const req = authorizedReqs.find(r => r.id === reqId);
      if (req) {
          setLinkedReqId(reqId);
          setFormData(prev => ({
              ...prev,
              amount: req.totalValue,
              description: `REQ: ${req.headerText} (${req.requisitioner})`,
              referenceDoc: req.id
          }));
      } else {
          setLinkedReqId('');
          setFormData(prev => ({ ...prev, referenceDoc: '' }));
      }
  };

  const currentBalance = useMemo(() => entries.filter(e => e.status === 'Posted').reduce((acc, curr) => curr.type === 'Receipt' ? acc + curr.amount : acc - curr.amount, 0), [entries]);

  const mainCashAccount = useMemo(() => {
      return accounts.find(a => a.code === '12320-01') || 
             accounts.find(a => a.code.startsWith('12320')) || 
             accounts.find(a => a.name.toUpperCase().includes('PETTY CASH')) ||
             accounts.find(a => a.name.toUpperCase().includes('CASH IN HAND'));
  }, [accounts]);

  const handlePostEntry = (entryOrForm: Partial<PettyCashEntry>, isNew: boolean) => {
    if (!entryOrForm.description || !entryOrForm.amount) return alert("Amount and Description required.");
    
    // For Parked entry approval, we need to ensure GL is selected
    if (!isNew && !entryOrForm.glAccountId && !formData.glAccountId) return alert("Please map a GL Account to approve this Factory entry.");

    const glId = isNew ? entryOrForm.glAccountId : formData.glAccountId;
    const bizTrans = isNew ? entryOrForm.businessTransaction : formData.businessTransaction;
    const ccId = isNew ? entryOrForm.costCenterId : formData.costCenterId;

    if (!mainCashAccount) return alert("System Error: Main Cash GL not found.");

    // Ledger Posting
    const debitLine = entryOrForm.type === 'Receipt' 
        ? { accountId: mainCashAccount.id, debit: entryOrForm.amount!, credit: 0, text: `CJ: ${bizTrans}` }
        : { accountId: glId!, debit: entryOrForm.amount!, credit: 0, text: `CJ: ${entryOrForm.description}`, costCenterId: ccId };

    const creditLine = entryOrForm.type === 'Receipt'
        ? { accountId: glId!, debit: 0, credit: entryOrForm.amount!, text: `CJ: ${entryOrForm.description}`, costCenterId: ccId }
        : { accountId: mainCashAccount.id, debit: 0, credit: entryOrForm.amount!, text: `CJ: ${bizTrans}` };

    const txId = `CJ-${Date.now().toString().slice(-6)}`;
    const ledgerTx: LedgerTransaction = {
        id: txId, company, docType: 'CJ', docDate: selectedDate, date: selectedDate,
        description: `FBCJ: ${bizTrans} - ${entryOrForm.description}`,
        referenceId: entryOrForm.referenceDoc || 'CASH_DESK',
        status: 'Posted',
        details: [debitLine, creditLine]
    };

    FinanceService.recordTransaction(ledgerTx);

    // Update Storage
    if (isNew) {
        const newEntry: PettyCashEntry = {
            ...(entryOrForm as PettyCashEntry),
            id: txId, company, date: selectedDate, balance: currentBalance + (entryOrForm.type==='Receipt' ? entryOrForm.amount! : -entryOrForm.amount!),
            status: 'Posted', recordedBy: 'LOCAL_USER'
        };
        FinanceService.savePettyCashEntries([...FinanceService.getPettyCashEntries(), newEntry]);

        // Phase 3: Mark Linked Requisition as Completed
        if (linkedReqId) {
            const allReqs = InventoryService.getRequisitions();
            const updatedReqs = allReqs.map(r => r.id === linkedReqId ? { ...r, status: 'Completed' as const } : r);
            InventoryService.saveRequisitions(updatedReqs);
        }

    } else {
        // Update existing parked entry
        const allEntries = FinanceService.getPettyCashEntries();
        const updated = allEntries.map(e => e.id === entryOrForm.id ? { ...e, status: 'Posted' as const, glAccountId: glId, businessTransaction: bizTrans, balance: currentBalance + (e.type==='Receipt'?e.amount:-e.amount) } : e);
        FinanceService.savePettyCashEntries(updated);
    }

    refreshData();
    setIsModalOpen(false);
    setFormData({ amount: 0, description: '', costCenterId: '', glAccountId: '', businessTransaction: '', referenceDoc: '' });
    setLinkedReqId('');
    alert("Cash Entry Posted Successfully.");
  };

  const getFilteredGLAccounts = (bizTransCode: string) => {
      if (!bizTransCode) return accounts;
      const config = BUSINESS_TRANSACTIONS.find(b => b.code === bizTransCode);
      if (!config) return accounts;
      if (config.accountType === 'Expense') return accounts.filter(a => a.type === 'Expense');
      if (config.accountType === 'Revenue') return accounts.filter(a => a.type === 'Revenue');
      if (config.accountType === 'Bank') return accounts.filter(a => a.name.toUpperCase().includes('BANK'));
      if (config.accountType === 'Inventory') return accounts.filter(a => a.code.startsWith('121'));
      if (config.accountType === 'Asset') return accounts.filter(a => a.type === 'Asset');
      if (config.accountType === 'Payable') return accounts.filter(a => a.type === 'Liability');
      return accounts;
  };

  const handlePrint = (entry: PettyCashEntry) => {
      setPrintingEntry(entry);
      setTimeout(() => {
          window.print();
          setPrintingEntry(null);
      }, 500);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-[#354a5f] text-white p-6 rounded shadow-sm relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10"><Wallet size={80} /></div>
           <p className="text-[10px] font-bold uppercase text-blue-200 tracking-widest mb-1">Cash Balance (FBCJ)</p>
           <p className="text-3xl font-black">PKR {currentBalance.toLocaleString()}</p>
        </div>
        {/* ... (Other stat cards) ... */}
      </div>

      <div className="bg-white border border-slate-200 p-4 shadow-sm flex justify-between items-center no-print">
        <div className="flex items-center space-x-6">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Transaction: FBCJ Cash Journal</h3>
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search narrative..." className="sap-input w-full pl-9 py-1.5 text-xs font-bold" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="sap-btn-primary flex items-center space-x-2">
          <Plus size={14} /> <span>Post Cash Document</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden no-print">
        <table className="w-full text-left sap-table">
          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
            <tr>
              <th className="px-4 py-3 w-24">Date</th>
              <th className="px-4 py-3 w-32">Status</th>
              <th className="px-4 py-3">Narrative / Description</th>
              <th className="px-4 py-3 w-48 text-center">Offsetting G/L</th>
              <th className="px-4 py-3 w-32 text-right">Receipt (Dr)</th>
              <th className="px-4 py-3 w-32 text-right">Payment (Cr)</th>
              <th className="px-4 py-3 w-40 text-right">Balance</th>
              <th className="px-4 py-3 w-24 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.filter(e => e.description.includes(searchTerm.toUpperCase())).reverse().map(e => (
              <tr key={e.id} className={e.status === 'Parked' ? 'bg-amber-50' : ''}>
                <td className="px-4 py-2 text-slate-400 font-bold text-[11px] uppercase">{e.date}</td>
                <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${e.status === 'Posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {e.status}
                    </span>
                </td>
                <td className="px-4 py-2 font-bold text-slate-800 text-xs uppercase">{e.description}</td>
                <td className="px-4 py-2 text-center">
                    <span className="text-[10px] font-mono font-bold text-slate-500">
                        {accounts.find(a => a.id === e.glAccountId)?.code || '-'}
                    </span>
                </td>
                <td className="px-4 py-2 text-right font-black text-[#107e3e]">{e.type === 'Receipt' ? e.amount.toLocaleString() : '-'}</td>
                <td className="px-4 py-2 text-right font-black text-[#bb0000]">{e.type === 'Payment' ? e.amount.toLocaleString() : '-'}</td>
                <td className="px-4 py-2 text-right font-black text-slate-900 text-xs">{e.status === 'Posted' ? `PKR ${e.balance.toLocaleString()}` : '-'}</td>
                <td className="px-4 py-2 text-right">
                    <div className="flex justify-center space-x-2">
                        {e.status === 'Parked' && (
                            <button onClick={() => { setFormData({...e}); setIsModalOpen(true); }} className="bg-emerald-600 text-white px-2 py-1 rounded text-[9px] font-bold uppercase hover:bg-emerald-700">Approve</button>
                        )}
                        {e.status === 'Posted' && (
                            <button onClick={() => handlePrint(e)} className="text-slate-400 hover:text-blue-600 p-1" title="Print Receipt/Voucher"><Printer size={16}/></button>
                        )}
                    </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PRINT OVERLAY */}
      {printingEntry && (
          <UnifiedPaymentPrint data={printingEntry} company={company} partyName="Authorized Personnel" />
      )}

      <SidePanel isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Payment Entry" width="lg">
        <div className="p-6 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[450]">
          <div className="bg-white rounded w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-300 animate-in zoom-in duration-300">
            <div className="sap-object-header flex justify-between items-start shrink-0">
               <div>
                  <h3 className="text-2xl font-bold uppercase tracking-tight">{formData.status === 'Parked' ? 'Approve Factory Entry' : 'Cash Journal Entry'}</h3>
               </div>
               <button onClick={() => setIsModalOpen(false)} className="hover:bg-white/10 p-2 rounded transition-colors"><X size={24} /></button>
            </div>
            
            <div className="p-8 space-y-6 bg-slate-50 flex-1">
               {formData.status === 'Parked' && (
                   <div className="bg-amber-50 p-4 border border-amber-200 rounded text-amber-800 text-xs font-bold uppercase">
                       This entry was initiated by Factory Central. Please assign a G/L Code to Post.
                   </div>
               )}
               {/* FBCJ Tabs (Only for new) */}
               {!formData.id && (
                   <div className="flex space-x-1 border-b border-slate-300 pb-1">
                      <button onClick={() => { setActiveTab('Payment'); setFormData({...formData, type: 'Payment', businessTransaction: '', glAccountId: ''}); }} className={`px-6 py-2 text-xs font-bold uppercase rounded-t-lg transition-all ${activeTab === 'Payment' ? 'bg-[#bb0000] text-white' : 'bg-slate-200 text-slate-500'}`}>Cash Payments</button>
                      <button onClick={() => { setActiveTab('Receipt'); setFormData({...formData, type: 'Receipt', businessTransaction: '', glAccountId: ''}); }} className={`px-6 py-2 text-xs font-bold uppercase rounded-t-lg transition-all ${activeTab === 'Receipt' ? 'bg-[#107e3e] text-white' : 'bg-slate-200 text-slate-500'}`}>Cash Receipts</button>
                   </div>
               )}

               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
                   
                   {!formData.id && activeTab === 'Payment' && authorizedReqs.length > 0 && (
                       <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                           <label className="text-[10px] font-black uppercase text-emerald-700 ml-1 mb-1 block flex items-center gap-1"><Fingerprint size={10}/> Pay Against Approved Request (Optional)</label>
                           <select 
                               className="w-full bg-white border border-emerald-200 p-2 rounded-lg text-xs font-bold outline-none text-emerald-900"
                               onChange={(e) => handleLinkRequisition(e.target.value)}
                               value={linkedReqId}
                           >
                               <option value="">-- Direct Payment (No Link) --</option>
                               {authorizedReqs.map(req => (
                                   <option key={req.id} value={req.id}>
                                       {req.id} | {req.reqType?.toUpperCase() || 'N/A'} | PKR {req.totalValue?.toLocaleString() || '0'}
                                   </option>
                               ))}
                           </select>
                       </div>
                   )}

                   <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                         <label className="text-[10px] font-bold uppercase text-slate-500">Business Transaction</label>
                         <select 
                            className="sap-input w-full font-bold" 
                            value={formData.businessTransaction} 
                            onChange={e => setFormData({...formData, businessTransaction: e.target.value})}
                         >
                            <option value="">-- Select --</option>
                            {BUSINESS_TRANSACTIONS.filter(b => b.type === (formData.type || activeTab)).map(b => (
                                <option key={b.code} value={b.code}>[{b.code}] {b.name}</option>
                            ))}
                         </select>
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] font-bold uppercase text-slate-500">GL Account</label>
                         <select 
                            className="sap-input w-full font-bold" 
                            value={formData.glAccountId} 
                            onChange={e => setFormData({...formData, glAccountId: e.target.value})}
                         >
                            <option value="">-- Map to GL --</option>
                            {getFilteredGLAccounts(formData.businessTransaction || '').map(a => (
                                <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>
                            ))}
                         </select>
                      </div>
                   </div>
                   
                   <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Amount</label><input type="number" disabled={!!formData.id} value={formData.amount} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} className="sap-input w-full font-black text-lg" /></div>
                   <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Description</label><input type="text" disabled={!!formData.id} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="sap-input w-full font-bold uppercase" /></div>
               </div>
            </div>

            <div className="px-8 py-4 bg-white border-t flex justify-end space-x-3 shrink-0">
               <button onClick={() => setIsModalOpen(false)} className="sap-btn-ghost">Discard</button>
               <button onClick={() => handlePostEntry(formData, !formData.id)} className="sap-btn-primary flex items-center space-x-2"><Save size={14}/><span>{formData.status === 'Parked' ? 'Accept & Post' : 'Post Entry'}</span></button>
            </div>
          </div>
        </div>
      )}
    </SidePanel>
  );
};

export default PettyCashBook;
