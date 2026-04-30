/**
 * BillingHub.tsx — Design System v2
 *
 * UI Changes (business logic untouched):
 *  - Replaced bg-slate-900 rounded-[2rem] oval header → CompactPageHeader
 *    (AR outstanding, overdue count in meta; Bulk Post GL in actions)
 *  - Tab bar: pill-button style → compact border-b-2 tabs
 *  - Generate Invoice table   → DataGridCard (py-1.5 px-3)
 *  - Accounts Receivable table → DataGridCard (search in toolbar slot)
 *  - Payment History table    → DataGridCard
 *  - Alt+R wired via erp:refresh → refreshData()
 *  - Modal headers cleaned: bg-emerald-600 / bg-blue-700 → white border-b
 *  - rounded-[2rem] / rounded-[2.5rem] / rounded-3xl → rounded-xl / rounded-lg
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '@/modules/shared/hooks/useDebounce';
import { Company, Quotation, ProductionPiece, LedgerTransaction, Invoice, PaymentReceipt } from '../../shared/types';
import { FinanceService, LedgerImbalanceError } from '../services/financeService';
import { useAuthStore } from '@/modules/auth/authStore';
import { Logger } from '@/modules/shared/services/logger';
import { SalesService } from '../../sales/services/salesService';
import { AsyncSalesService } from '../../sales/services/asyncSalesService';
import { ProductionService } from '../../production/services/productionService';
import { generateDeliveryInvoice } from '@/modules/sales/services/deliveryInvoiceService';
import { voidInvoice } from '@/modules/sales/services/creditNoteService';
import CreditNoteModule from '@/modules/finance/components/CreditNoteModule';
import SalesInvoicePrint from '@/modules/sales/components/prints/SalesInvoicePrint';
import {
  FileText, CheckCircle2, Ban, ArrowRightLeft, DollarSign, Search,
  Receipt, XCircle, X, Save, Banknote, AlertCircle, Clock, Eye, CreditCard, Printer, FileMinus, Slash,
  RefreshCw, Layers
} from 'lucide-react';
import { toast } from 'sonner';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { CompactPageHeader } from '@/modules/shared/components/CompactPageHeader';
import { DataGridCard, GridColumn } from '@/modules/shared/components/DataGridCard';

// ── Invoice status chip ───────────────────────────────────────────────
const InvoiceStatus: React.FC<{ status: string; isOverdue: boolean }> = ({ status, isOverdue }) => (
  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
    status   === 'Paid'    ? 'bg-emerald-100 text-emerald-700' :
    status   === 'Partial' ? 'bg-amber-100 text-amber-700'    :
    isOverdue              ? 'bg-rose-100 text-rose-700'       :
                             'bg-blue-100 text-blue-700'
  }`}>
    {isOverdue && status !== 'Paid' ? 'Overdue' : status}
  </span>
);

// ── Tab definition ─────────────────────────────────────────────────────
type BillingView = 'billing' | 'receivables' | 'receipts' | 'credit_notes';
const BILLING_TABS: {
  id:        BillingView;
  label:     string;
  icon:      React.ReactNode;
  activeCls: string;
}[] = [
  { id: 'billing',      label: 'Generate Invoice',    icon: <FileText  size={13} />, activeCls: 'border-blue-600   text-blue-700   bg-white' },
  { id: 'receivables',  label: 'Accounts Receivable', icon: <CreditCard size={13}/>, activeCls: 'border-amber-500  text-amber-700  bg-white' },
  { id: 'receipts',     label: 'Payment History',     icon: <Receipt   size={13} />, activeCls: 'border-emerald-600 text-emerald-700 bg-white' },
  { id: 'credit_notes', label: 'Credit Notes',        icon: <FileMinus size={13} />, activeCls: 'border-purple-600 text-purple-700  bg-white' },
];

const BillingHub: React.FC<{ company: Company }> = ({ company }) => {
  const { user } = useAuthStore();
  const actor = user?.fullName || user?.email || 'System';

  const [activeView, setActiveView]           = useState<BillingView>('billing');
  const [orders, setOrders]                   = useState<Quotation[]>([]);
  const [pieces, setPieces]                   = useState<ProductionPiece[]>([]);
  const [clients, setClients]                 = useState<any[]>([]);
  const [invoices, setInvoices]               = useState<Invoice[]>([]);
  const [receipts, setReceipts]               = useState<PaymentReceipt[]>([]);
  const [searchTerm, setSearchTerm]           = useState('');
  const [loading, setLoading]                 = useState(false);

  const [receiptModalInvoice, setReceiptModalInvoice] = useState<Invoice | null>(null);
  const [receiptForm, setReceiptForm] = useState({
    amount: 0,
    method: 'Bank Transfer' as PaymentReceipt['method'],
    reference: '',
  });

  const [gstModalOrder, setGstModalOrder] = useState<Quotation | null>(null);
  const [gstPercent, setGstPercent]       = useState(0);

  const [printInvoice, setPrintInvoice]   = useState<any | null>(null);
  const [voidingId, setVoidingId]         = useState<string | null>(null);

  useEffect(() => { refreshData(); }, [company]);

  // ── Wire Alt+R ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => refreshData();
    window.addEventListener('erp:refresh', handler);
    return () => window.removeEventListener('erp:refresh', handler);
  }, [company]);

  // ── Esc to close modals ───────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (receiptModalInvoice) { setReceiptModalInvoice(null); return; }
      if (gstModalOrder)       { setGstModalOrder(null);       return; }
      if (printInvoice)        { setPrintInvoice(null);        return; }
    };
    window.addEventListener('erp:escape', handler);
    return () => window.removeEventListener('erp:escape', handler);
  }, [receiptModalInvoice, gstModalOrder, printInvoice]);

  const refreshData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const allInvoices = await AsyncSalesService.getInvoices();
      const hasOverdueToUpdate = allInvoices.some(
        (i: any) => i.company === company && i.status === 'Outstanding' && i.dueDate < today
      );
      if (hasOverdueToUpdate) {
        await AsyncSalesService.saveInvoices(
          allInvoices.map((i: any) =>
            i.company === company && i.status === 'Outstanding' && i.dueDate < today
              ? { ...i, status: 'Overdue' } : i
          )
        );
      }
      const [allQuotations, allClients, freshInvoices, allReceipts] = await Promise.all([
        AsyncSalesService.getQuotations(),
        AsyncSalesService.getClients(),
        AsyncSalesService.getInvoices(),
        AsyncSalesService.getPaymentReceipts(),
      ]);
      setOrders(allQuotations.filter((q: Quotation) =>
        q.company === company &&
        (q.status === 'Approved' || q.status === 'Invoiced' || q.status === 'Partial' || q.status === 'Paid')
      ));
      setPieces(ProductionService.getProductionPieces());
      setClients(allClients);
      setInvoices(freshInvoices.filter((i: Invoice) => i.company === company));
      setReceipts(allReceipts.filter((r: any) => {
        const inv = freshInvoices.find((i: any) => i.id === r.invoiceId);
        return inv?.company === company;
      }));
    } finally {
      setLoading(false);
    }
  };

  const isCycleComplete = (orderNo?: string) => {
    if (!orderNo) return false;
    const orderPieces = pieces.filter(p => p.orderId === orderNo);
    if (orderPieces.length === 0) return true;
    return orderPieces.every(p => p.status === 'Delivered');
  };

  const isAlreadyInvoiced = (orderId: string) =>
    invoices.some(inv => inv.orderId === orderId);

  const handleGenerateInvoice = (order: Quotation) => {
    if (isAlreadyInvoiced(order.id)) return toast.error('Already invoiced — check Receivables tab.');
    setGstPercent(0);
    setGstModalOrder(order);
  };

  const confirmGenerateInvoice = async () => {
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
          toast.error(`Credit limit exceeded for ${client.name}.`, { duration: 8000 });
          return;
        }
      }
    }
    try {
      const result = await generateDeliveryInvoice(gstModalOrder, company, gstPercent);
      setGstModalOrder(null);
      refreshData();
      toast.success(
        `Invoice ${result.invoiceId} — PKR ${result.grandTotal.toLocaleString('en-PK')} — Posted to GL. AR: ${result.clientName}`,
        { duration: 6000 }
      );
    } catch (err: any) {
      console.error('[BillingHub] Invoice generation failed:', err);
      // Phase-2 F3: surface credit-limit / validation errors instead of swallowing.
      toast.error(err?.message || 'Invoice generation failed.', { duration: 8000 });
    }
  };

  const handleVoidInvoice = async (invoice: Invoice) => {
    setVoidingId(invoice.id);
    try {
      await voidInvoice({ invoice, company, voidedBy: actor });
      toast.success(`Invoice ${invoice.id} voided — GL reversal posted.`);
      refreshData();
    } catch (e: any) {
      toast.error(e.message || 'Void failed.');
    } finally {
      setVoidingId(null);
    }
  };

  const handleRecordPayment = async () => {
    if (!receiptModalInvoice) return;
    if (receiptForm.amount <= 0) return toast.error('Amount must be greater than 0');
    if (receiptForm.amount > receiptModalInvoice.balance)
      return toast.error(`Cannot exceed balance of PKR ${receiptModalInvoice.balance.toLocaleString()}`);

    const METHOD_ACCOUNT_MAP: Record<string, { code: string; name: string }> = {
      'Cash':          { code: '1111', name: 'CASH IN HAND' },
      'Bank Transfer': { code: '1112', name: 'CASH AT BANK' },
      'Cheque':        { code: '1112', name: 'CASH AT BANK' },
      'Online':        { code: '1113', name: 'ONLINE COLLECTIONS' },
    };
    const methodMap = METHOD_ACCOUNT_MAP[receiptForm.method] || METHOD_ACCOUNT_MAP['Cash'];

    const cashParent  = FinanceService.ensureAccount(company as any, 'ASSETS',          1, null,             'Asset', '10');
    const cashCurrent = FinanceService.ensureAccount(company as any, 'CURRENT ASSETS',  2, cashParent.id,    'Asset', '11');
    const cashBank    = FinanceService.ensureAccount(company as any, 'CASH & BANK',     3, cashCurrent.id,   'Asset', '111');
    const methodParent= FinanceService.ensureAccount(company as any, methodMap.name,    4, cashBank.id,      'Asset', methodMap.code);
    const cashAcc     = FinanceService.ensureAccount(company as any, `${methodMap.name} — MAIN`, 5, methodParent.id, 'Asset', `${methodMap.code}0`);

    const arParent  = FinanceService.ensureAccount(company as any, 'ASSETS',              1, null,           'Asset', '10');
    const arCurrent = FinanceService.ensureAccount(company as any, 'CURRENT ASSETS',     2, arParent.id,    'Asset', '11');
    const arTrade   = FinanceService.ensureAccount(company as any, 'TRADE RECEIVABLES',  3, arCurrent.id,   'Asset', '122');
    const arControl = FinanceService.ensureAccount(company as any, 'CUSTOMERS CONTROL',  4, arTrade.id,     'Asset', '1221');
    const clientAR  = FinanceService.ensureAccount(company as any, receiptModalInvoice.clientName.toUpperCase(), 5, arControl.id, 'Asset', '12210');

    const receiptId = `REC-${Date.now().toString().slice(-6)}`;
    const txId      = `GL-${receiptId}`;

    const glTx: LedgerTransaction = {
      id: txId, company, docType: 'DZ', docDate: new Date().toISOString().split('T')[0],
      date: new Date().toISOString().split('T')[0],
      description: `RECEIPT ${receiptId}: ${receiptModalInvoice.clientName} — ${receiptModalInvoice.id} via ${receiptForm.method}`,
      referenceId: receiptId, status: 'Posted',
      reqId: receiptModalInvoice.orderId,
      details: [
        { accountId: cashAcc.id,   debit: receiptForm.amount, credit: 0,                  text: `${receiptForm.method} received${receiptForm.reference ? ': ' + receiptForm.reference : ''}` },
        { accountId: clientAR.id,  debit: 0,                  credit: receiptForm.amount, text: `AR settled: ${receiptModalInvoice.clientName} — ${receiptModalInvoice.id}` },
      ],
    };
    FinanceService.saveLedger([...FinanceService.getLedger(), glTx]);

    if (receiptForm.method === 'Cash') {
      const cashEntries  = FinanceService.getPettyCashEntries();
      const lastBalance  = cashEntries.filter((e: any) => e.company === company).sort((a: any, b: any) => b.id.localeCompare(a.id))[0]?.balance || 0;
      const newEntry: any = {
        id: `CJ-${receiptId}`, company, date: new Date().toISOString().split('T')[0],
        description: `Cash received: ${receiptModalInvoice.clientName} — ${receiptModalInvoice.id}`,
        type: 'Receipt', amount: receiptForm.amount, balance: lastBalance + receiptForm.amount,
        recordedBy: 'System', status: 'Posted',
        glAccountId: cashAcc.id, businessTransaction: 'Customer Payment', referenceDoc: receiptId,
      };
      FinanceService.savePettyCashEntries([...cashEntries, newEntry]);
    }

    const events = FinanceService.getFinancialEvents();
    FinanceService.saveFinancialEvents([...events, {
      id: `EVT-${receiptId}`, company, date: new Date().toISOString().split('T')[0],
      sourceModule: 'Sales',
      description: `Payment received: ${receiptModalInvoice.clientName} — PKR ${receiptForm.amount.toLocaleString()} via ${receiptForm.method}`,
      amount: receiptForm.amount, referenceId: receiptId, status: 'Pending',
    }]);

    const allInvoices = await AsyncSalesService.getInvoices() as Invoice[];
    const newReceived = receiptModalInvoice.receivedAmount + receiptForm.amount;
    const newBalance  = receiptModalInvoice.totalAmount - newReceived;
    const newStatus   = newBalance <= 0 ? 'Paid' : 'Partial';

    const payment: PaymentReceipt = {
      id: receiptId, invoiceId: receiptModalInvoice.id, date: new Date().toISOString().split('T')[0],
      amount: receiptForm.amount, method: receiptForm.method, reference: receiptForm.reference, glTxId: txId,
    };

    const updatedInvoices = allInvoices.map(inv =>
      inv.id === receiptModalInvoice.id
        ? { ...inv, receivedAmount: newReceived, balance: newBalance, status: newStatus, payments: [...(inv.payments || []), payment] }
        : inv
    );
    await AsyncSalesService.saveInvoices(updatedInvoices);
    const allReceipts2 = await AsyncSalesService.getPaymentReceipts();
    await AsyncSalesService.savePaymentReceipts([...allReceipts2, payment]);

    const allQ = await AsyncSalesService.getQuotations();
    const updQ = allQ.map((q: Quotation) =>
      q.id === receiptModalInvoice.orderId
        ? { ...q, status: (newBalance <= 0 ? 'Paid' : 'Partial') as any, receivedAmount: newReceived }
        : q
    );
    await AsyncSalesService.saveQuotations(updQ);

    refreshData();
    setReceiptModalInvoice(null);
    setReceiptForm({ amount: 0, method: 'Bank Transfer', reference: '' });
    toast.success(
      `PKR ${receiptForm.amount.toLocaleString()} recorded via ${receiptForm.method} — GL Parked. ` +
      `${newBalance <= 0 ? 'FULLY PAID' : `Balance: PKR ${newBalance.toLocaleString()}`}`
    );
  };

  const getAgingDays = (dueDate: string) => {
    const diff = Math.floor((Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  // M-5: Batch-post with per-entry GL balance validation
  const handleBulkPostGL = () => {
    const ledger = FinanceService.getLedger();
    const parked = ledger.filter((t: any) => t.company === company && t.status === 'Parked');
    if (parked.length === 0) return toast.error('No parked GL entries to post.');

    const imbalanceErrors: LedgerImbalanceError[] = [];
    const balancedIds = new Set<string>();

    for (const tx of parked) {
      try {
        FinanceService.assertGLBalance(tx);
        balancedIds.add(tx.id);
      } catch (err) {
        if (err instanceof LedgerImbalanceError) {
          imbalanceErrors.push(err);
          Logger.warn?.('BillingHub', `Batch rejected: ${err.message}`);
        }
      }
    }

    if (balancedIds.size === 0) {
      toast.error(
        `Batch rejected — all ${imbalanceErrors.length} parked entries are imbalanced. Nothing posted.`,
        { duration: 10000 }
      );
      return;
    }

    const updated = ledger.map((t: any) =>
      balancedIds.has(t.id) ? { ...t, status: 'Posted' } : t
    );
    FinanceService.saveLedger(updated);

    if (imbalanceErrors.length > 0) {
      toast.warning(
        `${balancedIds.size} of ${parked.length} entries posted. ` +
        `${imbalanceErrors.length} REJECTED (imbalanced):\n` +
        imbalanceErrors.map(e => `• ${e.txId}: Δ ${e.delta >= 0 ? '+' : ''}${e.delta.toFixed(2)}`).join('\n'),
        { duration: 12000 }
      );
    } else {
      toast.success(`${balancedIds.size} GL entries posted — all balanced. ✓`);
    }
    refreshData();
  };

  // ── Derived data ─────────────────────────────────────────────────
  const billableOrders      = orders.filter(o => o.status === 'Approved' && !isAlreadyInvoiced(o.id));
  const outstandingInvoices = invoices.filter(i => i.status !== 'Paid');
  const totalAR             = outstandingInvoices.reduce((s, i) => s + i.balance, 0);
  const overdueInvoices     = outstandingInvoices.filter(i => getAgingDays(i.dueDate) > 0);
  const parkedCount         = FinanceService.getLedger().filter((t: any) => t.company === company && t.status === 'Parked').length;

  const filteredInvoices    = invoices.filter(inv =>
    !searchTerm ||
    inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.clientName.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const sortedReceipts      = [...receipts].sort((a, b) => b.date.localeCompare(a.date));

  // ── Column definitions ────────────────────────────────────────────

  const BILLING_COLS: GridColumn<Quotation>[] = useMemo(() => [
    {
      key: 'orderNo', header: 'Order Ref', width: '120px',
      render: (_, o) => <span className="font-black text-blue-600">{o.orderNo || o.id}</span>,
    },
    {
      key: 'clientId', header: 'Client',
      render: (_, o) => {
        const client = clients.find(c => c.id === o.clientId);
        return <span className="font-semibold text-slate-700">{client?.name || 'Walk-in'}</span>;
      },
    },
    {
      key: 'items', header: 'Amount (PKR)', align: 'right', width: '130px',
      render: (_, o) => (
        <span className="font-black tabular-nums">
          PKR {o.items.reduce((s, i) => s + i.amount, 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'orderNo', header: 'Production', width: '110px',
      render: (_, o) => {
        const complete = isCycleComplete(o.orderNo);
        return (
          <div className="flex items-center gap-1.5">
            {complete
              ? <CheckCircle2 size={12} className="text-emerald-500" />
              : <Clock size={12} className="text-amber-500" />
            }
            <span className={`text-[10px] font-black uppercase ${complete ? 'text-emerald-700' : 'text-amber-700'}`}>
              {complete ? 'Ready' : 'In Progress'}
            </span>
          </div>
        );
      },
    },
    {
      key: 'clientId', header: 'Inter-Co', width: '100px',
      render: (_, o) => {
        const client   = clients.find(c => c.id === o.clientId);
        const isInterCo= ['GTI','GTK','NIPPON','GLASSCO','FACTORY'].some(c => client?.name?.toUpperCase().includes(c));
        return isInterCo ? (
          <div className="inline-flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
            <ArrowRightLeft size={10} /><span className="text-[9px] font-black uppercase">Auto-Mirror</span>
          </div>
        ) : <span className="text-[9px] text-slate-400">—</span>;
      },
    },
    {
      key: 'id', header: 'Action', align: 'right', width: '140px',
      render: (_, o) => {
        const complete = isCycleComplete(o.orderNo);
        return (
          <button
            onClick={() => handleGenerateInvoice(o)}
            disabled={!complete}
            className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wide transition-colors ${
              complete
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed'
            }`}
          >
            Generate Invoice
          </button>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [clients, invoices, pieces]);

  const AR_COLS: GridColumn<Invoice>[] = useMemo(() => [
    { key: 'id',       header: 'Invoice #',  width: '110px', render: (_, i) => <span className="font-black text-blue-600 tabular-nums">{i.id}</span> },
    { key: 'clientName', header: 'Client',   render: (_, i) => <span className="font-semibold text-slate-700 uppercase text-[11px]">{i.clientName}</span> },
    { key: 'date',     header: 'Date',       width: '90px',  render: (_, i) => <span className="text-slate-500 tabular-nums">{i.date}</span> },
    {
      key: 'dueDate',  header: 'Due Date',   width: '120px',
      render: (_, i) => {
        const aging = getAgingDays(i.dueDate);
        const isOverdue = i.status !== 'Paid' && aging > 0;
        return (
          <span className={isOverdue ? 'text-rose-600 font-bold' : 'text-slate-500'}>
            {i.dueDate}
            {isOverdue && <span className="ml-1 text-[9px] text-rose-500 font-black">({aging}d)</span>}
          </span>
        );
      },
    },
    { key: 'totalAmount',    header: 'Total',    align: 'right', width: '100px', render: (_, i) => <span className="font-black tabular-nums">{i.totalAmount.toLocaleString()}</span> },
    { key: 'receivedAmount', header: 'Received', align: 'right', width: '100px', render: (_, i) => <span className="font-bold text-emerald-600 tabular-nums">{i.receivedAmount.toLocaleString()}</span> },
    { key: 'balance',        header: 'Balance',  align: 'right', width: '100px', render: (_, i) => <span className="font-black tabular-nums">{i.balance.toLocaleString()}</span> },
    {
      key: 'status', header: 'Status', align: 'center', width: '80px',
      render: (_, i) => {
        const aging = getAgingDays(i.dueDate);
        const isOverdue = i.status !== 'Paid' && aging > 0;
        return <InvoiceStatus status={i.status} isOverdue={isOverdue} />;
      },
    },
    {
      key: 'id', header: 'Action', align: 'right', width: '180px',
      render: (_, inv) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            title="Void Invoice"
            disabled={voidingId === inv.id || (inv.receivedAmount || 0) > 0}
            onClick={async () => {
              const ok = await confirmModal(`Void invoice ${inv.id}?\n\nThis will reverse the GL entry and allow re-invoicing.`);
              if (ok) handleVoidInvoice(inv);
            }}
            className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-30"
          >
            <Slash size={13} />
          </button>
          <button
            onClick={() => setPrintInvoice(inv)}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            <Printer size={13} />
          </button>
          {inv.status !== 'Paid' && (
            <button
              onClick={() => { setReceiptModalInvoice(inv); setReceiptForm({ amount: inv.balance, method: 'Bank Transfer', reference: '' }); }}
              className="bg-emerald-600 text-white px-3 py-1 rounded text-[10px] font-black uppercase hover:bg-emerald-700 transition-colors"
            >
              Receive
            </button>
          )}
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [invoices, voidingId]);

  const RECEIPT_COLS: GridColumn<PaymentReceipt>[] = [
    { key: 'id',        header: 'Receipt #',    width: '110px', render: (_, r) => <span className="font-black text-emerald-600 tabular-nums">{r.id}</span> },
    { key: 'invoiceId', header: 'Invoice',       width: '110px', render: (_, r) => <span className="font-bold text-blue-600 tabular-nums">{r.invoiceId}</span> },
    { key: 'date',      header: 'Date',          width: '90px',  render: (_, r) => <span className="text-slate-500 tabular-nums">{r.date}</span> },
    {
      key: 'method', header: 'Method',            width: '120px',
      render: (_, r) => <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px] font-black uppercase">{r.method}</span>,
    },
    { key: 'reference', header: 'Reference',      render: (_, r) => <span className="text-[11px] font-semibold text-slate-600">{r.reference || '—'}</span> },
    { key: 'amount',    header: 'Amount (PKR)',   align: 'right', width: '110px', render: (_, r) => <span className="font-black tabular-nums">{r.amount.toLocaleString()}</span> },
    { key: 'glTxId',    header: 'GL Ref',         width: '100px', render: (_, r) => <span className="text-[9px] font-bold text-slate-400 tabular-nums">{r.glTxId}</span> },
  ];

  return (
    <div className="flex flex-col h-full gap-0 animate-in fade-in duration-500">

      {/* ── Compact Page Header ─────────────────────────────────────── */}
      <CompactPageHeader
        breadcrumbs={[{ label: 'Finance (FICO)' }, { label: 'Billing Hub' }]}
        title="Billing Hub"
        subtitle={`${company} · Invoice → AR → Receipt → GL`}
        meta={
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full tabular-nums">
              AR: PKR {totalAR.toLocaleString()}
            </span>
            {overdueInvoices.length > 0 && (
              <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full tabular-nums">
                {overdueInvoices.length} overdue
              </span>
            )}
          </div>
        }
        actions={[
          {
            label:    'Refresh',
            icon:     <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />,
            onClick:  refreshData,
            shortcut: 'Alt+R',
            disabled: loading,
          },
          ...(parkedCount > 0 ? [{
            label:   `Bulk Post GL (${parkedCount})`,
            icon:    <Layers size={12} />,
            onClick: handleBulkPostGL,
            variant: 'primary' as const,
          }] : []),
        ]}
      />

      {/* ── Content area ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-0">

        {/* ── Tab panel card ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-slate-200 rounded-lg overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-slate-200 bg-slate-50/60 overflow-x-auto shrink-0">
            {BILLING_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={[
                  'flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider',
                  'border-b-2 transition-colors whitespace-nowrap shrink-0',
                  activeView === tab.id
                    ? tab.activeCls
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/70',
                ].join(' ')}
              >
                {tab.icon}
                {tab.label}
                {tab.id === 'billing'     && billableOrders.length      > 0 && (
                  <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded-full tabular-nums">{billableOrders.length}</span>
                )}
                {tab.id === 'receivables' && outstandingInvoices.length > 0 && (
                  <span className="bg-rose-100 text-rose-700 text-[9px] font-black px-1.5 py-0.5 rounded-full tabular-nums">{outstandingInvoices.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Tab: Generate Invoice ──────────────────────────────── */}
          {activeView === 'billing' && (
            <DataGridCard
              columns={BILLING_COLS}
              rows={billableOrders}
              getRowKey={o => o.id}
              loading={loading}
              className="border-0 rounded-none flex-1"
              emptyState={
                <span className="text-xs text-slate-400 italic">
                  No billable orders. Approved orders with complete production appear here.
                </span>
              }
            />
          )}

          {/* ── Tab: Accounts Receivable ─────────────────────────── */}
          {activeView === 'receivables' && (
            <DataGridCard
              columns={AR_COLS}
              rows={filteredInvoices}
              getRowKey={i => i.id}
              loading={loading}
              className="border-0 rounded-none flex-1"
              toolbar={
                <div className="relative w-64">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search invoices…"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded outline-none focus:ring-1 focus:ring-blue-400 font-medium"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              }
              emptyState={
                <span className="text-xs text-slate-400 italic">No invoices yet. Generate from billing tab.</span>
              }
            />
          )}

          {/* ── Tab: Payment History ─────────────────────────────── */}
          {activeView === 'receipts' && (
            <DataGridCard
              columns={RECEIPT_COLS}
              rows={sortedReceipts}
              getRowKey={r => r.id}
              loading={loading}
              className="border-0 rounded-none flex-1"
              emptyState={
                <span className="text-xs text-slate-400 italic">No payments recorded yet.</span>
              }
            />
          )}

          {/* ── Tab: Credit Notes ────────────────────────────────── */}
          {activeView === 'credit_notes' && (
            <div className="flex-1 overflow-y-auto">
              <CreditNoteModule company={company} />
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: Receive Payment
      ══════════════════════════════════════════════════════════════ */}
      {receiptModalInvoice && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in duration-200">

            {/* Clean modal header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase">Receive Payment</h3>
                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                  {receiptModalInvoice.id} — {receiptModalInvoice.clientName}
                </p>
              </div>
              <button onClick={() => setReceiptModalInvoice(null)} className="p-1.5 hover:bg-slate-100 rounded transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            {/* Balance summary */}
            <div className="grid grid-cols-3 gap-2 px-6 py-3 bg-slate-50 border-b border-slate-100">
              {[
                { label: 'Invoice Total',    value: receiptModalInvoice.totalAmount.toLocaleString(),    cls: 'text-slate-900' },
                { label: 'Already Received', value: receiptModalInvoice.receivedAmount.toLocaleString(), cls: 'text-emerald-700' },
                { label: 'Balance Due',      value: receiptModalInvoice.balance.toLocaleString(),        cls: 'text-rose-700' },
              ].map(item => (
                <div key={item.label} className="bg-white border border-slate-200 rounded-lg p-3 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-400">{item.label}</p>
                  <p className={`text-base font-black tabular-nums mt-0.5 ${item.cls}`}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Form */}
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Amount Received (PKR)</label>
                <input
                  type="number"
                  className="sap-input w-full font-black text-lg"
                  value={receiptForm.amount}
                  onChange={e => setReceiptForm({ ...receiptForm, amount: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Payment Method</label>
                <select
                  className="sap-input w-full font-bold"
                  value={receiptForm.method}
                  onChange={e => setReceiptForm({ ...receiptForm, method: e.target.value as any })}
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Online">Online</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Reference / Cheque No</label>
                <input
                  type="text"
                  className="sap-input w-full font-bold uppercase"
                  value={receiptForm.reference}
                  onChange={e => setReceiptForm({ ...receiptForm, reference: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => setReceiptModalInvoice(null)} className="px-4 py-2 text-slate-500 font-bold uppercase text-[11px]">Cancel</button>
              <button
                onClick={handleRecordPayment}
                className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2 rounded-lg font-black uppercase text-[11px] shadow hover:bg-emerald-700 transition-colors"
              >
                <Banknote size={14} /> Record Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: GST Confirmation
      ══════════════════════════════════════════════════════════════ */}
      {gstModalOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in duration-200">

            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase">Generate Invoice</h3>
                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                  {gstModalOrder.orderNo || gstModalOrder.id} — {clients.find(c => c.id === gstModalOrder.clientId)?.name || 'Client'}
                </p>
              </div>
              <button onClick={() => setGstModalOrder(null)} className="p-1.5 hover:bg-slate-100 rounded transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4 bg-slate-50">
              <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
                <p className="text-[9px] font-black uppercase text-slate-400">Order Value</p>
                <p className="text-xl font-black text-slate-900 tabular-nums">
                  PKR {(gstModalOrder.items || []).reduce((s: number, i: any) => s + (i.amount || 0), 0).toLocaleString()}
                </p>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">GST % (0 = exempt)</label>
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
                const gst  = Math.round(base * gstPercent / 100);
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs font-bold text-amber-800 text-center">
                    GST: PKR {gst.toLocaleString()} → Grand Total: PKR {(base + gst).toLocaleString()}
                  </div>
                );
              })()}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => setGstModalOrder(null)} className="px-4 py-2 text-slate-500 font-bold uppercase text-[11px]">Cancel</button>
              <button
                onClick={confirmGenerateInvoice}
                className="inline-flex items-center gap-2 bg-blue-700 text-white px-5 py-2 rounded-lg font-black uppercase text-[11px] shadow hover:bg-blue-800 transition-colors"
              >
                <FileText size={13} /> Generate & Post
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invoice Print ─────────────────────────────────────────── */}
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
