
import React, { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '@/modules/shared/hooks/useDebounce';
import { Company, Quotation, ProductionPiece, LedgerTransaction, Invoice, PaymentReceipt } from '../../shared/types';
import { FinanceService } from '../services/financeService';
import { SalesService } from '../../sales/services/salesService';
import { AsyncSalesService } from '../../sales/services/asyncSalesService';
import { ProductionService } from '../../production/services/productionService';
import { generateDeliveryInvoice } from '@/modules/sales/services/deliveryInvoiceService';
import SalesInvoicePrint from '@/modules/sales/components/prints/SalesInvoicePrint';
import { 
  FileText, CheckCircle2, Ban, ArrowRightLeft, DollarSign, Search,
  Receipt, XCircle, X, Save, Banknote, AlertCircle, Clock, Eye, CreditCard, Printer
} from 'lucide-react';
import { toast } from 'sonner';

const BillingHub: React.FC<{ company: Company }> = ({ company }) => {
  const [activeView, setActiveView] = useState<'billing' | 'receivables' | 'receipts'>('billing');
  const [orders, setOrders] = useState<Quotation[]>([]);
  const [pieces, setPieces] = useState<ProductionPiece[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Payment receipt modal
  const [receiptModalInvoice, setReceiptModalInvoice] = useState<Invoice | null>(null);
  const [receiptForm, setReceiptForm] = useState({ amount: 0, method: 'Bank Transfer' as PaymentReceipt['method'], reference: '' });

  // GST modal
  const [gstModalOrder, setGstModalOrder] = useState<Quotation | null>(null);
  const [gstPercent, setGstPercent] = useState(0);

  // Print modal
  const [printInvoice, setPrintInvoice] = useState<any | null>(null);

  useEffect(() => {
    refreshData();
  }, [company]);

  const refreshData = async () => {
    const today = new Date().toISOString().split('T')[0];
    const allInvoices = await AsyncSalesService.getInvoices();
    const hasOverdueToUpdate = allInvoices.some(
      (i: any) => i.company === company && i.status === 'Outstanding' && i.dueDate < today
    );
    if (hasOverdueToUpdate) {
      await AsyncSalesService.saveInvoices(
        allInvoices.map((i: any) =>
          i.company === company && i.status === 'Outstanding' && i.dueDate < today
            ? { ...i, status: 'Overdue' }
            : i
        )
      );
    }
    const [allQuotations, allClients, freshInvoices, allReceipts] = await Promise.all([
      AsyncSalesService.getQuotations(),
      AsyncSalesService.getClients(),
      AsyncSalesService.getInvoices(),
      AsyncSalesService.getPaymentReceipts(),
    ]);
    setOrders(allQuotations.filter(q => q.company === company && (q.status === 'Approved' || q.status === 'Invoiced' || q.status === 'Partial' || q.status === 'Paid')));
    setPieces(ProductionService.getProductionPieces());
    setClients(allClients);
    setInvoices(freshInvoices.filter((i: Invoice) => i.company === company));
    setReceipts(allReceipts.filter((r: any) => {
      const inv = freshInvoices.find((i: any) => i.id === r.invoiceId);
      return inv?.company === company;
    }));
  };

  const isCycleComplete = (orderNo?: string) => {
    if (!orderNo) return false;
    const orderPieces = pieces.filter(p => p.orderId === orderNo);
    if (orderPieces.length === 0) return true; // Service orders without pieces
    return orderPieces.every(p => p.status === 'Delivered');
  };

  const isAlreadyInvoiced = (orderId: string) => {
    return invoices.some(inv => inv.orderId === orderId);
  };

  // ── GENERATE INVOICE — open GST modal first ──────────────────────
  const handleGenerateInvoice = (order: Quotation) => {
    if (isAlreadyInvoiced(order.id)) return toast.error('Already invoiced — check Receivables tab.');
    setGstPercent(0);
    setGstModalOrder(order);
  };

  const confirmGenerateInvoice = () => {
    if (!gstModalOrder) return;
    const client = clients.find((c: any) => c.id === gstModalOrder.clientId);
    if (client) {
      const creditLimit = (client as any).creditLimit || 0;
      if (creditLimit > 0) {
        const outstanding = invoices
          .filter((i: any) => i.clientId === gstModalOrder.clientId && i.status !== 'Paid')
          .reduce((s: number, i: any) => s + (i.balance || 0), 0);
        const orderTotal = (gstModalOrder.items || []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
        if (outstanding + orderTotal > creditLimit) {
          toast.error(
            `Credit limit exceeded for ${client.name}.`,
            { duration: 8000 }
          );
          return;
        }
      }
    }
    try {
      const result = generateDeliveryInvoice(gstModalOrder, company, gstPercent);
      setGstModalOrder(null);
      refreshData();
      toast.success(
        `Invoice ${result.invoiceId} — PKR ${result.grandTotal.toLocaleString('en-PK')} — Posted to GL. AR: ${result.clientName}`,
        { duration: 6000 }
      );
    } catch (err) {
      console.error('[BillingHub] Invoice generation failed:', err);
      toast.error('Invoice generation failed.');
    }
  };

  // ── RECORD PAYMENT RECEIPT ──
  const handleRecordPayment = async () => {
    if (!receiptModalInvoice) return;
    if (receiptForm.amount <= 0) return toast.error('Amount must be greater than 0');
    if (receiptForm.amount > receiptModalInvoice.balance) return toast.error(`Cannot exceed balance of PKR ${receiptModalInvoice.balance.toLocaleString()}`);

    // ── Payment method → specific GL account ──
    const METHOD_ACCOUNT_MAP: Record<string, { code: string; name: string }> = {
      'Cash':          { code: '1111', name: 'CASH IN HAND' },
      'Bank Transfer':  { code: '1112', name: 'CASH AT BANK' },
      'Cheque':         { code: '1112', name: 'CASH AT BANK' },
      'Online':         { code: '1113', name: 'ONLINE COLLECTIONS' },
    };
    const methodMap = METHOD_ACCOUNT_MAP[receiptForm.method] || METHOD_ACCOUNT_MAP['Cash'];

    // JIT: Create payment method account if needed
    const cashParent = FinanceService.ensureAccount(company as any, 'ASSETS', 1, null, 'Asset', '10');
    const cashCurrent = FinanceService.ensureAccount(company as any, 'CURRENT ASSETS', 2, cashParent.id, 'Asset', '11');
    const cashBank = FinanceService.ensureAccount(company as any, 'CASH & BANK', 3, cashCurrent.id, 'Asset', '111');
    const methodParent = FinanceService.ensureAccount(company as any, methodMap.name, 4, cashBank.id, 'Asset', methodMap.code);
    const cashAcc = FinanceService.ensureAccount(company as any, `${methodMap.name} — MAIN`, 5, methodParent.id, 'Asset', `${methodMap.code}0`);

    // Client AR account (same hierarchy as invoice)
    const arParent = FinanceService.ensureAccount(company as any, 'ASSETS', 1, null, 'Asset', '10');
    const arCurrent = FinanceService.ensureAccount(company as any, 'CURRENT ASSETS', 2, arParent.id, 'Asset', '11');
    const arTrade = FinanceService.ensureAccount(company as any, 'TRADE RECEIVABLES', 3, arCurrent.id, 'Asset', '122');
    const arControl = FinanceService.ensureAccount(company as any, 'CUSTOMERS CONTROL', 4, arTrade.id, 'Asset', '1221');
    const clientAR = FinanceService.ensureAccount(
      company as any,
      receiptModalInvoice.clientName.toUpperCase(),
      5, arControl.id, 'Asset', '12210'
    );

    const receiptId = `REC-${Date.now().toString().slice(-6)}`;
    const txId = `GL-${receiptId}`;

    // ── GL Entry: Posted directly ──
    const glTx: LedgerTransaction = {
      id: txId, company, docType: 'DZ', docDate: new Date().toISOString().split('T')[0],
      date: new Date().toISOString().split('T')[0],
      description: `RECEIPT ${receiptId}: ${receiptModalInvoice.clientName} — ${receiptModalInvoice.id} via ${receiptForm.method}`,
      referenceId: receiptId, status: 'Posted',
      reqId: receiptModalInvoice.orderId,
      details: [
        { accountId: cashAcc.id, debit: receiptForm.amount, credit: 0, text: `${receiptForm.method} received${receiptForm.reference ? ': ' + receiptForm.reference : ''}` },
        { accountId: clientAR.id, debit: 0, credit: receiptForm.amount, text: `AR settled: ${receiptModalInvoice.clientName} — ${receiptModalInvoice.id}` }
      ]
    };
    FinanceService.saveLedger([...FinanceService.getLedger(), glTx]);

    // ── Cash Journal entry (if method is Cash) ──
    if (receiptForm.method === 'Cash') {
      const cashEntries = FinanceService.getPettyCashEntries();
      const lastBalance = cashEntries.filter((e: any) => e.company === company).sort((a: any, b: any) => b.id.localeCompare(a.id))[0]?.balance || 0;
      const newEntry: any = {
        id: `CJ-${receiptId}`, company, date: new Date().toISOString().split('T')[0],
        description: `Cash received: ${receiptModalInvoice.clientName} — ${receiptModalInvoice.id}`,
        type: 'Receipt', amount: receiptForm.amount, balance: lastBalance + receiptForm.amount,
        recordedBy: 'System', status: 'Posted',
        glAccountId: cashAcc.id, businessTransaction: 'Customer Payment',
        referenceDoc: receiptId
      };
      FinanceService.savePettyCashEntries([...cashEntries, newEntry]);
    }

    // ── Event Registry entry ──
    const events = FinanceService.getFinancialEvents();
    FinanceService.saveFinancialEvents([...events, {
      id: `EVT-${receiptId}`, company, date: new Date().toISOString().split('T')[0],
      sourceModule: 'Sales', description: `Payment received: ${receiptModalInvoice.clientName} — PKR ${receiptForm.amount.toLocaleString()} via ${receiptForm.method}`,
      amount: receiptForm.amount, referenceId: receiptId, status: 'Pending'
    }]);

    // ── Update Invoice ──
    const allInvoices = await AsyncSalesService.getInvoices() as Invoice[];
    const newReceived = receiptModalInvoice.receivedAmount + receiptForm.amount;
    const newBalance = receiptModalInvoice.totalAmount - newReceived;
    const newStatus = newBalance <= 0 ? 'Paid' : 'Partial';

    const payment: PaymentReceipt = {
      id: receiptId, invoiceId: receiptModalInvoice.id, date: new Date().toISOString().split('T')[0],
      amount: receiptForm.amount, method: receiptForm.method, reference: receiptForm.reference, glTxId: txId
    };

    const updatedInvoices = allInvoices.map(inv =>
      inv.id === receiptModalInvoice.id
        ? { ...inv, receivedAmount: newReceived, balance: newBalance, status: newStatus, payments: [...(inv.payments || []), payment] }
        : inv
    );
    await AsyncSalesService.saveInvoices(updatedInvoices);
    const allReceipts = await AsyncSalesService.getPaymentReceipts();
    await AsyncSalesService.savePaymentReceipts([...allReceipts, payment]);

    // Update Quotation status
    const allQ = await AsyncSalesService.getQuotations();
    const updQ = allQ.map(q => q.id === receiptModalInvoice.orderId
      ? { ...q, status: (newBalance <= 0 ? 'Paid' : 'Partial') as any, receivedAmount: newReceived }
      : q
    );
    await AsyncSalesService.saveQuotations(updQ);

    refreshData();
    setReceiptModalInvoice(null);
    setReceiptForm({ amount: 0, method: 'Bank Transfer', reference: '' });
    toast.success(`PKR ${receiptForm.amount.toLocaleString()} recorded via ${receiptForm.method} — GL Parked. ${newBalance <= 0 ? 'FULLY PAID' : `Balance: PKR ${newBalance.toLocaleString()}`}`);

  };

  // ── Aging calculation ──
  const getAgingDays = (dueDate: string) => {
    const diff = Math.floor((Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  // ── Filtered data ──
  const billableOrders = orders.filter(o => o.status === 'Approved' && !isAlreadyInvoiced(o.id));
  const outstandingInvoices = invoices.filter(i => i.status !== 'Paid');
  const totalAR = outstandingInvoices.reduce((s, i) => s + i.balance, 0);
  const overdueInvoices = outstandingInvoices.filter(i => getAgingDays(i.dueDate) > 0);

  const handleBulkPostGL = () => {
    const ledger = FinanceService.getLedger();
    const parked = ledger.filter((t: any) => t.company === company && t.status === 'Parked');
    if (parked.length === 0) return toast.error('No parked GL entries to post.');
    const posted = ledger.map((t: any) =>
      t.company === company && t.status === 'Parked' ? { ...t, status: 'Posted' } : t
    );
    FinanceService.saveLedger(posted);
    toast.success(`${parked.length} GL entries posted.`);
    refreshData();
  };
  const parkedCount = FinanceService.getLedger().filter((t: any) => t.company === company && t.status === 'Parked').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header with AR Summary */}
      <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10"><FileText size={120} /></div>
        <div className="flex justify-between items-start relative z-10">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">SD Billing & Collections</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Invoice → AR → Payment Receipt → GL Auto-Post</p>
          </div>
          <div className="flex space-x-6 text-right">
            <div><p className="text-[9px] font-bold text-slate-400 uppercase">Total AR Outstanding</p><p className="text-2xl font-black text-amber-400">PKR {totalAR.toLocaleString()}</p></div>
            <div><p className="text-[9px] font-bold text-slate-400 uppercase">Overdue</p><p className="text-2xl font-black text-rose-400">{overdueInvoices.length}</p></div>
            <div><p className="text-[9px] font-bold text-slate-400 uppercase">Invoices</p><p className="text-2xl font-black text-emerald-400">{invoices.length}</p></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border shadow-sm w-fit">
        <button onClick={() => setActiveView('billing')} className={`flex items-center space-x-2 px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeView === 'billing' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <FileText size={15}/><span>Generate Invoice</span>
          {billableOrders.length > 0 && <span className="bg-amber-400 text-amber-900 text-[9px] font-black px-1.5 rounded-full">{billableOrders.length}</span>}
        </button>
        <button onClick={() => setActiveView('receivables')} className={`flex items-center space-x-2 px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeView === 'receivables' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <CreditCard size={15}/><span>Accounts Receivable</span>
          {outstandingInvoices.length > 0 && <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 rounded-full">{outstandingInvoices.length}</span>}
        </button>
        <button onClick={() => setActiveView('receipts')} className={`flex items-center space-x-2 px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeView === 'receipts' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <Receipt size={15}/><span>Payment History</span>
        </button>
      </div>
      </div>

      {/* ═══ TAB: GENERATE INVOICE ═══ */}
      {activeView === 'billing' && (
        <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
          <table className="w-full text-left sap-table">
            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
              <tr>
                <th className="px-6 py-3">Order Ref</th>
                <th className="px-6 py-3">Client</th>
                <th className="px-6 py-3">Amount (PKR)</th>
                <th className="px-6 py-3">Production</th>
                <th className="px-6 py-3">Inter-Co</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {billableOrders.map(order => {
                const complete = isCycleComplete(order.orderNo);
                const client = clients.find(c => c.id === order.clientId);
                const isInterCo = ['GTI', 'GTK', 'NIPPON', 'GLASSCO', 'FACTORY'].some(c => client?.name?.toUpperCase().includes(c));
                const total = order.items.reduce((s, i) => s + i.amount, 0);

                return (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-black text-blue-600">{order.orderNo || order.id}</td>
                    <td className="px-6 py-4 font-bold text-slate-700">{client?.name || 'Walk-in'}</td>
                    <td className="px-6 py-4 font-black">PKR {total.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        {complete ? <CheckCircle2 size={14} className="text-emerald-500"/> : <Clock size={14} className="text-amber-500"/>}
                        <span className={`text-[10px] font-black uppercase ${complete ? 'text-emerald-600' : 'text-amber-600'}`}>{complete ? 'Ready' : 'In Progress'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {isInterCo ? (
                        <div className="flex items-center space-x-1 text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit border border-indigo-100">
                          <ArrowRightLeft size={11}/><span className="text-[9px] font-black uppercase">Auto-Mirror</span>
                        </div>
                      ) : <span className="text-[9px] text-slate-400">—</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleGenerateInvoice(order)} disabled={!complete}
                        className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${complete ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
                        Generate Invoice
                      </button>
                    </td>
                  </tr>
                );
              })}
              {billableOrders.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-300 font-bold uppercase text-xs italic">No billable orders. Approved orders with complete production will appear here.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ TAB: ACCOUNTS RECEIVABLE ═══ */}
      {activeView === 'receivables' && (
        <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
            <h3 className="font-black text-slate-800 uppercase text-sm">Outstanding Invoices</h3>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="Search invoices..." className="sap-input w-full pl-9 text-xs" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <table className="w-full text-left sap-table">
            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
              <tr>
                <th className="px-6 py-3">Invoice #</th>
                <th className="px-6 py-3">Client</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Due Date</th>
                <th className="px-6 py-3 text-right">Total</th>
                <th className="px-6 py-3 text-right">Received</th>
                <th className="px-6 py-3 text-right">Balance</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.filter(i => !searchTerm || i.id.toLowerCase().includes(searchTerm.toLowerCase()) || i.clientName.toLowerCase().includes(searchTerm.toLowerCase())).map(inv => {
                const aging = getAgingDays(inv.dueDate);
                const isOverdue = inv.status !== 'Paid' && aging > 0;
                return (
                  <tr key={inv.id} className={`hover:bg-slate-50 ${isOverdue ? 'bg-rose-50/30' : ''}`}>
                    <td className="px-6 py-3 font-black text-blue-600">{inv.id}</td>
                    <td className="px-6 py-3 font-bold text-slate-700 text-xs uppercase">{inv.clientName}</td>
                    <td className="px-6 py-3 text-xs text-slate-500">{inv.date}</td>
                    <td className="px-6 py-3 text-xs">
                      <span className={isOverdue ? 'text-rose-600 font-bold' : 'text-slate-500'}>{inv.dueDate}</span>
                      {isOverdue && <span className="ml-1 text-[9px] text-rose-500 font-black">({aging}d overdue)</span>}
                    </td>
                    <td className="px-6 py-3 text-right font-black text-xs">{inv.totalAmount.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right font-bold text-emerald-600 text-xs">{inv.receivedAmount.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right font-black text-xs">{inv.balance.toLocaleString()}</td>
                    <td className="px-6 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                        inv.status === 'Partial' ? 'bg-amber-100 text-amber-700' :
                        isOverdue ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                      }`}>{isOverdue && inv.status !== 'Paid' ? 'Overdue' : inv.status}</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setPrintInvoice(inv)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                          <Printer size={14}/>
                        </button>
                        {inv.status !== 'Paid' && (
                          <button onClick={() => { setReceiptModalInvoice(inv); setReceiptForm({ amount: inv.balance, method: 'Bank Transfer', reference: '' }); }}
                            className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-700">
                            Receive Payment
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {invoices.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-slate-300 font-bold uppercase text-xs italic">No invoices yet. Generate from billing tab.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ TAB: PAYMENT HISTORY ═══ */}
      {activeView === 'receipts' && (
        <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b"><h3 className="font-black text-slate-800 uppercase text-sm">Payment Receipts</h3></div>
          <table className="w-full text-left sap-table">
            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
              <tr>
                <th className="px-6 py-3">Receipt #</th>
                <th className="px-6 py-3">Invoice</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Method</th>
                <th className="px-6 py-3">Reference</th>
                <th className="px-6 py-3 text-right">Amount (PKR)</th>
                <th className="px-6 py-3">GL Ref</th>
              </tr>
            </thead>
            <tbody>
              {receipts.sort((a, b) => b.date.localeCompare(a.date)).map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-black text-emerald-600">{r.id}</td>
                  <td className="px-6 py-3 font-bold text-blue-600 text-xs">{r.invoiceId}</td>
                  <td className="px-6 py-3 text-xs text-slate-500">{r.date}</td>
                  <td className="px-6 py-3"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px] font-black uppercase">{r.method}</span></td>
                  <td className="px-6 py-3 text-xs font-bold text-slate-600">{r.reference || '—'}</td>
                  <td className="px-6 py-3 text-right font-black">{r.amount.toLocaleString()}</td>
                  <td className="px-6 py-3 text-[9px] font-bold text-slate-400">{r.glTxId}</td>
                </tr>
              ))}
              {receipts.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-300 font-bold uppercase text-xs italic">No payments recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ MODAL: RECEIVE PAYMENT ═══ */}
      {receiptModalInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="px-8 py-6 bg-emerald-600 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase">Receive Payment</h3>
                <p className="text-[10px] font-bold text-emerald-200 uppercase tracking-widest">{receiptModalInvoice.id} — {receiptModalInvoice.clientName}</p>
              </div>
              <button onClick={() => setReceiptModalInvoice(null)}><XCircle size={24}/></button>
            </div>
            <div className="p-8 bg-slate-50 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border text-center">
                  <p className="text-[9px] font-black uppercase text-slate-400">Invoice Total</p>
                  <p className="text-lg font-black">{receiptModalInvoice.totalAmount.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border text-center">
                  <p className="text-[9px] font-black uppercase text-emerald-500">Already Received</p>
                  <p className="text-lg font-black text-emerald-600">{receiptModalInvoice.receivedAmount.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border text-center">
                  <p className="text-[9px] font-black uppercase text-rose-500">Balance Due</p>
                  <p className="text-lg font-black text-rose-600">{receiptModalInvoice.balance.toLocaleString()}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Amount Received (PKR)</label>
                  <input type="number" className="sap-input w-full font-black text-lg" value={receiptForm.amount} onChange={e => setReceiptForm({...receiptForm, amount: Number(e.target.value)})} /></div>
                <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Payment Method</label>
                  <select className="sap-input w-full font-bold" value={receiptForm.method} onChange={e => setReceiptForm({...receiptForm, method: e.target.value as any})}>
                    <option value="Bank Transfer">Bank Transfer</option><option value="Cash">Cash</option><option value="Cheque">Cheque</option><option value="Online">Online</option>
                  </select></div>
                <div><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Reference / Cheque No</label>
                  <input type="text" className="sap-input w-full font-bold uppercase" value={receiptForm.reference} onChange={e => setReceiptForm({...receiptForm, reference: e.target.value})} placeholder="Optional" /></div>
              </div>
            </div>
            <div className="px-8 py-6 bg-white border-t flex justify-end space-x-3">
              <button onClick={() => setReceiptModalInvoice(null)} className="px-6 py-3 text-slate-400 font-black uppercase text-xs">Cancel</button>
              <button onClick={handleRecordPayment} className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center space-x-2">
                <Banknote size={16}/><span>Record Payment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: GST CONFIRMATION ═══ */}
      {gstModalOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-blue-700 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black uppercase">Generate Invoice</h3>
                <p className="text-[10px] font-bold text-blue-200 uppercase">{gstModalOrder.orderNo || gstModalOrder.id} — {clients.find(c => c.id === gstModalOrder.clientId)?.name || 'Client'}</p>
              </div>
              <button onClick={() => setGstModalOrder(null)}><XCircle size={22}/></button>
            </div>
            <div className="p-8 space-y-5 bg-slate-50">
              <div className="bg-white p-4 rounded-xl border text-center">
                <p className="text-[9px] font-black uppercase text-slate-400">Order Value</p>
                <p className="text-xl font-black text-slate-900">PKR {(gstModalOrder.items || []).reduce((s: number, i: any) => s + (i.amount || 0), 0).toLocaleString()}</p>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">GST % (0 = exempt)</label>
                <select
                  className="sap-input w-full font-bold text-lg"
                  value={gstPercent}
                  onChange={e => setGstPercent(Number(e.target.value))}
                >
                  <option value={0}>0% — GST Exempt</option>
                  <option value={5}>5%</option>
                  <option value={13}>13%</option>
                  <option value={17}>17% — Standard Rate</option>
                  <option value={18}>18%</option>
                </select>
              </div>
              {gstPercent > 0 && (() => {
                const base = (gstModalOrder.items || []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
                const gst = Math.round(base * gstPercent / 100);
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs font-bold text-amber-800 text-center">
                    GST: PKR {gst.toLocaleString()} → Grand Total: PKR {(base + gst).toLocaleString()}
                  </div>
                );
              })()}
            </div>
            <div className="px-8 py-5 bg-white border-t flex justify-end gap-3">
              <button onClick={() => setGstModalOrder(null)} className="px-6 py-2.5 text-slate-400 font-black uppercase text-xs">Cancel</button>
              <button onClick={confirmGenerateInvoice} className="bg-blue-700 text-white px-8 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-800 shadow-lg flex items-center gap-2">
                <FileText size={14}/> Generate & Post
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ INVOICE PRINT ═══ */}
      {printInvoice && (
        <SalesInvoicePrint
          invoice={printInvoice}
          company={company}
          onClose={() => setPrintInvoice(null)}
        />
      )}
    </div>
  );
};

export default React.memo(BillingHub);
