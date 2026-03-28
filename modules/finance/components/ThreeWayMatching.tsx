import React, { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '@/modules/shared/hooks/useDebounce';
import { toast } from 'sonner';
import { Company, PurchaseOrder, Requisition, LedgerTransaction, Account } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { FinanceService } from '@/modules/finance/services/financeService';
// import { postDefectAdjustmentGL } from '@/modules/procurement/services/grnGLService'; // Phase 9 — add grnGLService.ts to deploy
import {
  CheckCircle2, AlertTriangle, Clock, X, Save, Search, Filter,
  FileText, Package, Receipt, CreditCard, Link2, ChevronRight,
  AlertCircle, Eye, ShieldCheck, TrendingUp, ArrowRight, Check,
  XCircle, Info, Zap, Building2
} from 'lucide-react';

// ── Release Strategy ───────────────────────────────────────────────────────
const getApprovalLevel = (amount: number): { level: string; label: string; limit: string } => {
  if (amount <= 100000)  return { level: 'L1', label: 'Dept. Manager',  limit: '< PKR 100K' };
  if (amount <= 500000)  return { level: 'L2', label: 'Director / GM',  limit: '100K – 500K' };
  return                        { level: 'L3', label: 'MD / CEO',        limit: '> PKR 500K' };
};

const MATCH_STATUS_STYLES: Record<string, string> = {
  'Pending':   'bg-slate-100 text-slate-600',
  '2-Way':     'bg-blue-100 text-blue-700',
  '3-Way':     'bg-emerald-100 text-emerald-700',
  'Mismatch':  'bg-rose-100 text-rose-700',
  'On-Hold':   'bg-amber-100 text-amber-700',
};

const PO_STATUS_STYLES: Record<string, string> = {
  'Sent':            'bg-slate-100 text-slate-600',
  'GRN Pending':     'bg-amber-100 text-amber-700',
  'GRN Done':        'bg-blue-100 text-blue-700',
  'Invoice Pending': 'bg-purple-100 text-purple-700',
  'Matched':         'bg-emerald-100 text-emerald-700',
  'Payment Pending': 'bg-rose-100 text-rose-700',
  'Paid':            'bg-emerald-200 text-emerald-800',
  'On Hold':         'bg-red-100 text-red-700',
};

const ThreeWayMatching: React.FC<{ company: Company }> = ({ company }) => {
  const [pos, setPOs]               = useState<PurchaseOrder[]>([]);
  const [reqs, setReqs]             = useState<Requisition[]>([]);
  const [accounts, setAccounts]     = useState<Account[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [activeStep, setActiveStep] = useState<'grn' | 'invoice' | 'match' | 'approval' | 'payment'>('grn');

  // Modal form states
  const [grnForm, setGrnForm]     = useState({ grnRef: '', grnDate: '', grnQty: 0, remarks: '' });
  const [invForm, setInvForm]     = useState({ vendorInvoiceNo: '', vendorInvoiceDate: '', vendorInvoiceAmount: 0 });
  const [approvalNote, setApprovalNote] = useState('');
  const [payGLId, setPayGLId]     = useState('');

  const refreshData = () => {
    const allPOs = ProductionService.getPurchaseOrders()
      .filter(p => p.fromCompany === company)
      .sort((a, b) => b.date.localeCompare(a.date));
    setPOs(allPOs);
    setReqs(InventoryService.getRequisitions().filter(r => r.company === company));
    setAccounts(FinanceService.getAccounts().filter(a => a.company === company && a.level === 5));
  };

  useEffect(() => { refreshData(); }, [company]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getReq = (po: PurchaseOrder) => po.reqId ? reqs.find(r => r.id === po.reqId) : null;

  const computeMatch = (po: PurchaseOrder): string => {
    if (!po.grnRef && !po.vendorInvoiceNo)        return 'Pending';
    if (po.grnRef && !po.vendorInvoiceNo)          return '2-Way';   // PO + GRN
    if (!po.grnRef && po.vendorInvoiceNo)          return '2-Way';   // PO + Invoice
    if (po.grnRef && po.vendorInvoiceNo) {
      const tolerance = 0.02; // 2% variance allowed
      const diff = Math.abs((po.vendorInvoiceAmount || 0) - po.totalAmount);
      if (diff / Math.max(po.totalAmount, 1) > tolerance) return 'Mismatch';
      return '3-Way'; // PO + GRN + Invoice all match
    }
    return 'Pending';
  };

  // ── GRN Confirm ───────────────────────────────────────────────────────────
  const handleConfirmGRN = () => {
    if (!grnForm.grnRef || !grnForm.grnDate) return toast.error('GRN Reference and Date required.', { duration: 4000 });
    if (!selectedPO) return;

    // ── GL: Dr Inventory / Cr GR/IR Clearing (only if GRN not already posted via MIGO) ──
    // If maal MIGO se already post hua hai to grnService ne ye entry already bana di hogi.
    // ThreeWayMatching mein sirf PO-level GRN link karte hain — duplicate GL avoid karne ke liye
    // hum sirf GL entry banate hain agar MIGO se koi matching WE- journal nahi mila.
    const existingGLs = FinanceService.getLedger().filter(
      gl => gl.referenceId === grnForm.grnRef && (gl.docType === 'WE' as any)
    );
    if (existingGLs.length === 0 && selectedPO.totalAmount > 0) {
      // GRN was not posted via MIGO — post GL now
      const invAccs  = accounts.filter(a => a.code?.startsWith('115') && a.level === 5);
      const grirAcc  = accounts.find(a => a.code === '21151');
      if (invAccs.length > 0 && grirAcc) {
        const invAcc = invAccs[0]; // first raw inventory account
        const grnAmount = grnForm.grnQty || selectedPO.totalAmount;
        const grnGLId = `WE-${grnForm.grnRef}-TW`;
        const grnGL: LedgerTransaction = {
          id: grnGLId, company, docType: 'KR',
          docDate: grnForm.grnDate,
          date: grnForm.grnDate,
          description: `GRN Confirm (3WM): ${selectedPO.toVendor} | ${grnForm.grnRef} | PO: ${selectedPO.id}`,
          referenceId: grnForm.grnRef,
          status: 'Posted',
          details: [
            { accountId: invAcc.id, debit: grnAmount, credit: 0, text: `Inventory in: ${selectedPO.toVendor} — ${grnForm.grnRef}` },
            { accountId: grirAcc.id, debit: 0, credit: grnAmount, text: `GR/IR clearing: ${grnForm.grnRef} (clear on invoice)` },
          ],
        };
        FinanceService.recordTransaction(grnGL);
      }
    }

    const all = ProductionService.getPurchaseOrders();
    const updated = all.map(p => p.id === selectedPO.id
      ? { ...p, grnRef: grnForm.grnRef, grnDate: grnForm.grnDate, grnQty: grnForm.grnQty || p.totalAmount,
          status: 'GRN Done' as any,
          matchStatus: 'Pending' as any }
      : p
    );
    ProductionService.savePurchaseOrders(updated);
    refreshData();
    setSelectedPO(prev => prev ? { ...prev, ...grnForm, status: 'GRN Done' as any } : null);
    setActiveStep('invoice');
    toast.success(`✓ GRN ${grnForm.grnRef} linked to ${selectedPO.id}.`, { duration: 4000 });
  };

  // ── Invoice Register (MIRO equivalent) ──────────────────────────────────
  // GL on 3-Way match: Dr GR/IR Clearing / Cr Accounts Payable Vendor
  // This clears the suspense GR/IR account created at GRN time.
  const handleRegisterInvoice = () => {
    if (!invForm.vendorInvoiceNo || !invForm.vendorInvoiceAmount) return toast.error('Invoice number and amount required.', { duration: 4000 });
    if (!selectedPO) return;
    const tolerance = 0.02;
    const diff = Math.abs(invForm.vendorInvoiceAmount - selectedPO.totalAmount);
    const matchSt = diff / Math.max(selectedPO.totalAmount, 1) > tolerance ? 'Mismatch' : '3-Way';
    const newStatus = matchSt === 'Mismatch' ? 'On Hold' : 'Matched';

    // ── GL Entry: Dr GR/IR / Cr Accounts Payable (only on clean match) ─────
    if (matchSt === '3-Way') {
      const grirAcc    = accounts.find(a => a.code === '21151');
      const payableAcc = accounts.find(a => a.code === '21111' || a.code?.startsWith('2111'));
      if (grirAcc && payableAcc) {
        const invoiceAmt = invForm.vendorInvoiceAmount;
        const mirId = `IR-${invForm.vendorInvoiceNo}-${Date.now().toString().slice(-5)}`;
        const miroGL: LedgerTransaction = {
          id: mirId, company, docType: 'KR',
          docDate: new Date().toISOString().split('T')[0],
          date: new Date().toISOString().split('T')[0],
          description: `Invoice Match (MIRO): ${selectedPO.toVendor} | Inv ${invForm.vendorInvoiceNo} | PO ${selectedPO.id}`,
          referenceId: invForm.vendorInvoiceNo,
          status: 'Posted',
          details: [
            {
              accountId: grirAcc.id, debit: invoiceAmt, credit: 0,
              text: `Clear GR/IR: ${selectedPO.grnRef || ''} — invoice received`,
            },
            {
              accountId: payableAcc.id, debit: 0, credit: invoiceAmt,
              text: `AP: ${selectedPO.toVendor} — Inv ${invForm.vendorInvoiceNo}`,
            },
          ],
        };
        FinanceService.recordTransaction(miroGL);
      }

      // Freight GR/IR clear — if PO had freight, clear 21152 → 21113
      const grirFrtAcc = accounts.find(a => a.code === '21152');
      const otherPayAcc = accounts.find(a => a.code === '21113');
      const freightAmt: number = (selectedPO as any).totalFreight || 0;
      if (grirFrtAcc && otherPayAcc && freightAmt > 0) {
        const frtMirId = `IR-FRT-${invForm.vendorInvoiceNo}`;
        const frtGL: LedgerTransaction = {
          id: frtMirId, company, docType: 'KR',
          docDate: new Date().toISOString().split('T')[0],
          date: new Date().toISOString().split('T')[0],
          description: `Freight Invoice Match: ${selectedPO.id} | Inv ${invForm.vendorInvoiceNo}`,
          referenceId: invForm.vendorInvoiceNo,
          status: 'Posted',
          details: [
            { accountId: grirFrtAcc.id, debit: freightAmt, credit: 0, text: `Clear GR/IR freight: ${selectedPO.id}` },
            { accountId: otherPayAcc.id, debit: 0, credit: freightAmt, text: `Transport payable: ${selectedPO.id}` },
          ],
        };
        FinanceService.recordTransaction(frtGL);
      }
    }

    const all = ProductionService.getPurchaseOrders();
    const updated = all.map(p => p.id === selectedPO.id
      ? { ...p, ...invForm, matchStatus: matchSt as any, status: newStatus as any }
      : p
    );
    ProductionService.savePurchaseOrders(updated);
    const fresh = { ...selectedPO, ...invForm, matchStatus: matchSt as any, status: newStatus as any };
    setSelectedPO(fresh);
    refreshData();
    if (matchSt === 'Mismatch') {
      toast.error(`⚠ MISMATCH: Invoice PKR ${invForm.vendorInvoiceAmount.toLocaleString()} vs PO PKR ${selectedPO.totalAmount.toLocaleString()}. PO On Hold.`, { duration: 5000 });
      setActiveStep('match');
    } else {
      toast.success(`✓ Invoice matched. GL posted: Dr GR/IR / Cr Payable. PO → Matched.`, { duration: 5000 });

      // ── Auto-post defect adjustment if vendor defect report exists and confirmed ──
      const vdrList = InventoryService.getVendorDefectReports()
        .filter((r: any) => r.grnId === (selectedPO.grnRef || '') && r.status === 'Verbally Confirmed');
      vdrList.forEach((vdr: any) => {
        // postDefectAdjustmentGL({ company, grnId: vdr.grnId, adjustmentDate: new Date().toISOString().split('T')[0], adjustmentAmount: vdr.totalAdjustment, vendorName: vdr.vendorName, defectReportId: vdr.id }); // Phase 9 — uncomment after adding grnGLService.ts
        InventoryService.upsertVendorDefectReport({ ...vdr, status: 'Settled', settlementRef: matchGL.id });
      });
      setActiveStep('approval');
    }
  };

  // ── Approval Action ───────────────────────────────────────────────────────
  const handleApproval = (action: 'Approved' | 'Rejected' | 'On-Hold') => {
    if (!selectedPO) return;
    const lvl = getApprovalLevel(selectedPO.totalAmount);
    const histEntry = { level: lvl.level, by: lvl.label, date: new Date().toISOString().split('T')[0], action, note: approvalNote };
    const newHistory = [...(selectedPO.approvalHistory || []), histEntry];
    const newStatus = action === 'Approved' ? 'Payment Pending' : action === 'Rejected' ? 'On Hold' : 'On Hold';

    const all = ProductionService.getPurchaseOrders();
    const updated = all.map(p => p.id === selectedPO.id
      ? { ...p, approvalHistory: newHistory, status: newStatus as any, approvalLevel: lvl.level as any }
      : p
    );
    ProductionService.savePurchaseOrders(updated);
    setSelectedPO(prev => prev ? { ...prev, approvalHistory: newHistory, status: newStatus as any } : null);
    refreshData();
    if (action === 'Approved') {
      toast.error(`✓ Approved by ${lvl.label}. Payment Voucher can now be raised.`, { duration: 4000 });
      setActiveStep('payment');
    } else {
      toast.error(`${action}: PO placed On Hold.`, { duration: 4000 });
      setIsModalOpen(false);
    }
  };

  // ── Post AP Payment ───────────────────────────────────────────────────────
  const handlePostPayment = () => {
    if (!selectedPO) return;
    if (!payGLId) return toast.error('Select Bank / Cash GL account for payment.', { duration: 4000 });

    // Find AP account — prefer 21111 (Glass Importers), fallback to any 2111x
    const payableAcc = accounts.find(a => a.code === '21111')
      || accounts.find(a => a.code?.startsWith('2111'));
    if (!payableAcc) return toast.error('Accounts Payable GL (21111) not found. Check GlassCo COA.', { duration: 4000 });

    const txId = `KZ-${Date.now().toString().slice(-6)}`;
    const ledgerTx: LedgerTransaction = {
      id: txId, company, docType: 'KZ',
      docDate: new Date().toISOString().split('T')[0],
      date: new Date().toISOString().split('T')[0],
      description: `VENDOR PMT: ${selectedPO.toVendor} — ${selectedPO.id}`,
      referenceId: selectedPO.vendorInvoiceNo || selectedPO.id,
      status: 'Parked', // Park first — accountant reviews
      details: [
        { accountId: payableAcc.id, debit: selectedPO.totalAmount, credit: 0, text: `Clear Payable: ${selectedPO.toVendor}` },
        { accountId: payGLId, debit: 0, credit: selectedPO.totalAmount, text: `Bank Payment: ${selectedPO.id}` },
      ]
    };
    FinanceService.recordTransaction(ledgerTx);

    const all = ProductionService.getPurchaseOrders();
    const updated = all.map(p => p.id === selectedPO.id
      ? { ...p, status: 'Paid' as any, apInvoiceId: txId }
      : p
    );
    ProductionService.savePurchaseOrders(updated);

    // Also mark linked REQ as Paid
    if (selectedPO.reqId) {
      const allReqs = InventoryService.getRequisitions().filter(Boolean);
      InventoryService.saveRequisitions(
        allReqs.map(r => r.id === selectedPO.reqId
          ? { ...r, paymentStatus: 'Paid' as const, paymentRef: txId, paymentDate: new Date().toISOString().split('T')[0] }
          : r
        )
      );
    }

    refreshData();
    setIsModalOpen(false);
    toast.error(`✓ Payment Voucher ${txId} parked. AP Ledger entry created.\nFinance to review and post.`, { duration: 4000 });
  };

  // ── Handle Hold Override ──────────────────────────────────────────────────
  const handleOverrideMismatch = (action: 'override' | 'reject') => {
    if (!selectedPO) return;
    const all = ProductionService.getPurchaseOrders();
    const updated = all.map(p => p.id === selectedPO.id
      ? { ...p, matchStatus: 'Mismatch' as any, status: action === 'override' ? 'Matched' as any : 'On Hold' as any,
          matchNotes: action === 'override' ? `Override: ${approvalNote}` : `Rejected: ${approvalNote}` }
      : p
    );
    ProductionService.savePurchaseOrders(updated);
    refreshData();
    if (action === 'override') setActiveStep('approval');
    else setIsModalOpen(false);
  };

  // ── Open PO detail ────────────────────────────────────────────────────────
  const openPO = (po: PurchaseOrder) => {
    const match = computeMatch(po);
    // Determine which step to land on
    let step: typeof activeStep = 'grn';
    if (!po.grnRef) step = 'grn';
    else if (!po.vendorInvoiceNo) step = 'invoice';
    else if (match === 'Mismatch') step = 'match';
    else if (po.status === 'Matched') step = 'approval';
    else if (po.status === 'Payment Pending') step = 'payment';
    else step = 'grn';
    setSelectedPO({ ...po, matchStatus: match as any });
    setGrnForm({ grnRef: po.grnRef || '', grnDate: po.grnDate || '', grnQty: po.grnQty || 0, remarks: '' });
    setInvForm({ vendorInvoiceNo: po.vendorInvoiceNo || '', vendorInvoiceDate: po.vendorInvoiceDate || '', vendorInvoiceAmount: po.vendorInvoiceAmount || po.totalAmount });
    setApprovalNote('');
    setPayGLId('');
    setActiveStep(step);
    setIsModalOpen(true);
  };

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filteredPOs = useMemo(() => {
    return pos.filter(po => {
      const matchSearch = !debouncedSearchTerm ||
        po.id.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        po.toVendor.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
      const matchStatus = statusFilter === 'All' || po.status === statusFilter ||
        (statusFilter === 'Mismatch' && computeMatch(po) === 'Mismatch');
      return matchSearch && matchStatus;
    });
  }, [pos, searchTerm, statusFilter]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:   pos.length,
    matched: pos.filter(p => computeMatch(p) === '3-Way').length,
    pending: pos.filter(p => !p.grnRef).length,
    mismatch:pos.filter(p => computeMatch(p) === 'Mismatch').length,
    awaitingPayment: pos.filter(p => p.status === 'Payment Pending').length,
    totalValue: pos.filter(p => p.status === 'Payment Pending')
                   .reduce((s, p) => s + p.totalAmount, 0),
  }), [pos]);

  const bankAccounts = accounts.filter(a =>
    a.name.toUpperCase().includes('BANK') || a.name.toUpperCase().includes('CASH')
  );

  const STEPS = [
    { key: 'grn',      label: '1. GRN',          icon: Package },
    { key: 'invoice',  label: '2. Invoice',       icon: Receipt },
    { key: 'match',    label: '3. Match',         icon: Link2 },
    { key: 'approval', label: '4. Approval',      icon: ShieldCheck },
    { key: 'payment',  label: '5. Payment',       icon: CreditCard },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total POs',      val: stats.total,           color: 'text-slate-800' },
          { label: 'GRN Pending',    val: stats.pending,         color: 'text-amber-600' },
          { label: '3-Way Matched',  val: stats.matched,         color: 'text-emerald-600' },
          { label: 'Mismatch',       val: stats.mismatch,        color: 'text-rose-600' },
          { label: 'Awaiting Pmt',   val: stats.awaitingPayment, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{s.label}</p>
            <p className={`text-3xl font-black mt-1 ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13}/>
            <input type="text" placeholder="Search PO / Vendor..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="sap-input pl-9 py-2 text-xs w-52"/>
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="sap-input py-2 text-xs font-bold">
            <option value="All">All Statuses</option>
            {['Sent','GRN Pending','GRN Done','Invoice Pending','Matched','Payment Pending','Paid','On Hold','Mismatch'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2 text-[10px] font-bold text-slate-500 uppercase">
          <Zap size={12} className="text-amber-500"/>
          <span>PKR {stats.totalValue.toLocaleString()} awaiting payment</span>
        </div>
      </div>

      {/* PO Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left sap-table">
          <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
            <tr>
              <th className="px-5 py-3">PO No</th>
              <th className="px-5 py-3">Vendor</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">REQ Ref</th>
              <th className="px-5 py-3 text-right">Amount (PKR)</th>
              <th className="px-5 py-3 text-center">GRN</th>
              <th className="px-5 py-3 text-center">Invoice</th>
              <th className="px-5 py-3 text-center">Match</th>
              <th className="px-5 py-3 text-center">Approval</th>
              <th className="px-5 py-3 text-center">Status</th>
              <th className="px-5 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredPOs.length === 0 && (
              <tr><td colSpan={12} className="py-14 text-center text-slate-400 text-sm">No Purchase Orders found</td></tr>
            )}
            {filteredPOs.map(po => {
              const match   = computeMatch(po);
              const req     = getReq(po);
              const lvl     = getApprovalLevel(po.totalAmount);
              const lastAppr = po.approvalHistory?.[po.approvalHistory.length - 1];
              return (
                <tr key={po.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openPO(po)}>
                  <td className="px-5 py-3 font-mono font-black text-blue-600 text-xs">{po.id}</td>
                  <td className="px-5 py-3 text-xs font-bold text-slate-800 max-w-[150px] truncate">{po.toVendor}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{po.date}</td>
                  <td className="px-5 py-3">
                    <span className="bg-slate-100 text-slate-600 text-[9px] font-black px-2 py-0.5 rounded uppercase">{po.category || '—'}</span>
                  </td>
                  <td className="px-5 py-3 text-[10px] font-mono text-slate-500">{req?.id || po.reqId || '—'}</td>
                  <td className="px-5 py-3 text-right font-black text-slate-900 text-sm">{po.totalAmount.toLocaleString()}</td>
                  <td className="px-5 py-3 text-center">
                    {po.grnRef
                      ? <CheckCircle2 size={16} className="text-emerald-500 mx-auto" title={po.grnRef}/>
                      : <Clock size={16} className="text-slate-300 mx-auto"/>
                    }
                  </td>
                  <td className="px-5 py-3 text-center">
                    {po.vendorInvoiceNo
                      ? <CheckCircle2 size={16} className="text-emerald-500 mx-auto" title={po.vendorInvoiceNo}/>
                      : <Clock size={16} className="text-slate-300 mx-auto"/>
                    }
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${MATCH_STATUS_STYLES[match] || 'bg-slate-100 text-slate-600'}`}>
                      {match}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    {lastAppr
                      ? <span className="text-[9px] font-bold text-slate-500">{lastAppr.level} {lastAppr.action === 'Approved' ? '✓' : '✗'}</span>
                      : <span className="text-[9px] text-slate-400">{lvl.level} req.</span>
                    }
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${PO_STATUS_STYLES[po.status] || 'bg-slate-100 text-slate-600'}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Eye size={14}/>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── PO DETAIL / WORKFLOW MODAL ─────────────────────────────────────── */}
      {isModalOpen && selectedPO && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-start justify-center p-4 z-[300] overflow-y-auto">
          <div className="bg-white w-full max-w-3xl my-4 rounded-2xl shadow-2xl border border-slate-200 flex flex-col">

            {/* Header */}
            <div className="bg-slate-900 text-white px-8 py-5 rounded-t-2xl flex justify-between items-start">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">{selectedPO.id}</h3>
                <p className="text-[10px] text-slate-400 mt-0.5 font-bold uppercase">
                  {selectedPO.toVendor} • PKR {selectedPO.totalAmount.toLocaleString()} • {selectedPO.category}
                  {selectedPO.reqId && <span className="ml-2 text-blue-400">🔗 {selectedPO.reqId}</span>}
                </p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="hover:bg-white/10 p-2 rounded-lg transition-colors"><X size={20}/></button>
            </div>

            {/* Step Progress Bar */}
            <div className="px-8 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center space-x-1">
                {STEPS.map((step, i) => {
                  const isActive   = activeStep === step.key;
                  const isDone = (
                    (step.key === 'grn'      && !!selectedPO.grnRef) ||
                    (step.key === 'invoice'  && !!selectedPO.vendorInvoiceNo) ||
                    (step.key === 'match'    && ['3-Way','2-Way','Matched'].includes(computeMatch(selectedPO))) ||
                    (step.key === 'approval' && selectedPO.approvalHistory?.some(h => h.action === 'Approved')) ||
                    (step.key === 'payment'  && selectedPO.status === 'Paid')
                  );
                  return (
                    <React.Fragment key={step.key}>
                      <button
                        onClick={() => setActiveStep(step.key as any)}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          isActive  ? 'bg-slate-900 text-white shadow' :
                          isDone    ? 'bg-emerald-100 text-emerald-700' :
                          'text-slate-400 hover:bg-slate-100'
                        }`}>
                        {isDone && !isActive
                          ? <CheckCircle2 size={12}/>
                          : <step.icon size={12}/>
                        }
                        <span>{step.label}</span>
                      </button>
                      {i < STEPS.length - 1 && <ArrowRight size={12} className="text-slate-300 shrink-0"/>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Step Content */}
            <div className="p-8 space-y-5 flex-1">

              {/* ── STEP 1: GRN ───────────────────────────────────────────────── */}
              {activeStep === 'grn' && (
                <div className="space-y-5">
                  <div className="flex items-center space-x-3 pb-3 border-b">
                    <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center"><Package size={16} className="text-blue-600"/></div>
                    <div>
                      <h4 className="font-black text-slate-800 text-sm uppercase">Goods Receipt Note (MIGO)</h4>
                      <p className="text-[10px] text-slate-400">Confirm physical goods received against this PO</p>
                    </div>
                  </div>

                  {/* PO Items preview */}
                  <div className="bg-slate-50 rounded-xl p-4 text-xs space-y-2">
                    <p className="font-black uppercase text-slate-500 text-[10px]">PO Line Items</p>
                    {selectedPO.items.map((item, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-slate-700 font-medium">{item.description || `Item ${i+1}`}</span>
                        <span className="font-bold">{item.qty || '—'} × PKR {(item.rate || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  {selectedPO.grnRef ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center space-x-3">
                      <CheckCircle2 size={20} className="text-emerald-600"/>
                      <div>
                        <p className="font-black text-emerald-800 text-sm">GRN Recorded: {selectedPO.grnRef}</p>
                        <p className="text-[10px] text-emerald-600">Received: {selectedPO.grnDate}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-500">GRN Reference*</label>
                          <input type="text" value={grnForm.grnRef} onChange={e => setGrnForm({...grnForm, grnRef: e.target.value})}
                            placeholder="e.g. GRN-2024-001" className="sap-input w-full text-xs font-bold uppercase"/>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-500">Date Received*</label>
                          <input type="date" value={grnForm.grnDate} onChange={e => setGrnForm({...grnForm, grnDate: e.target.value})}
                            className="sap-input w-full text-xs"/>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-500">Qty / Units Received</label>
                          <input type="number" value={grnForm.grnQty || ''} onChange={e => setGrnForm({...grnForm, grnQty: Number(e.target.value)})}
                            className="sap-input w-full text-xs font-bold"/>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-500">Remarks</label>
                        <input type="text" value={grnForm.remarks} onChange={e => setGrnForm({...grnForm, remarks: e.target.value})}
                          placeholder="Condition of goods, shortages, etc." className="sap-input w-full text-xs uppercase"/>
                      </div>
                      <button onClick={handleConfirmGRN}
                        className="sap-btn-primary flex items-center space-x-2 text-xs">
                        <Check size={14}/><span>Confirm GRN — Goods Received</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── STEP 2: INVOICE ───────────────────────────────────────────── */}
              {activeStep === 'invoice' && (
                <div className="space-y-5">
                  <div className="flex items-center space-x-3 pb-3 border-b">
                    <div className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center"><Receipt size={16} className="text-purple-600"/></div>
                    <div>
                      <h4 className="font-black text-slate-800 text-sm uppercase">Register Vendor Invoice</h4>
                      <p className="text-[10px] text-slate-400">Enter the invoice received from vendor — must match PO within 2% tolerance</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-600 uppercase">PO Amount</span>
                    <span className="text-lg font-black text-slate-900">PKR {selectedPO.totalAmount.toLocaleString()}</span>
                  </div>

                  {selectedPO.vendorInvoiceNo ? (
                    <div className={`border rounded-xl p-4 flex items-center space-x-3 ${computeMatch(selectedPO) === 'Mismatch' ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                      {computeMatch(selectedPO) === 'Mismatch'
                        ? <AlertTriangle size={20} className="text-rose-600"/>
                        : <CheckCircle2 size={20} className="text-emerald-600"/>
                      }
                      <div>
                        <p className={`font-black text-sm ${computeMatch(selectedPO) === 'Mismatch' ? 'text-rose-800' : 'text-emerald-800'}`}>
                          Invoice: {selectedPO.vendorInvoiceNo} — PKR {(selectedPO.vendorInvoiceAmount || 0).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-500">Date: {selectedPO.vendorInvoiceDate}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-500">Invoice No*</label>
                          <input type="text" value={invForm.vendorInvoiceNo} onChange={e => setInvForm({...invForm, vendorInvoiceNo: e.target.value})}
                            placeholder="Vendor's invoice #" className="sap-input w-full text-xs font-bold uppercase"/>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-500">Invoice Date</label>
                          <input type="date" value={invForm.vendorInvoiceDate} onChange={e => setInvForm({...invForm, vendorInvoiceDate: e.target.value})}
                            className="sap-input w-full text-xs"/>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-500">Invoice Amount (PKR)*</label>
                          <input type="number" value={invForm.vendorInvoiceAmount || ''} onChange={e => setInvForm({...invForm, vendorInvoiceAmount: Number(e.target.value)})}
                            className="sap-input w-full text-xs font-black"/>
                        </div>
                      </div>
                      {invForm.vendorInvoiceAmount > 0 && (
                        <div className={`p-3 rounded-xl text-xs font-bold border ${
                          Math.abs(invForm.vendorInvoiceAmount - selectedPO.totalAmount) / selectedPO.totalAmount <= 0.02
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          Variance: PKR {Math.abs(invForm.vendorInvoiceAmount - selectedPO.totalAmount).toLocaleString()}
                          {' '}({((Math.abs(invForm.vendorInvoiceAmount - selectedPO.totalAmount) / selectedPO.totalAmount) * 100).toFixed(1)}%)
                          {' — '}{Math.abs(invForm.vendorInvoiceAmount - selectedPO.totalAmount) / selectedPO.totalAmount <= 0.02 ? '✓ Within tolerance' : '⚠ Exceeds 2% — will flag mismatch'}
                        </div>
                      )}
                      <button onClick={handleRegisterInvoice}
                        className="sap-btn-primary flex items-center space-x-2 text-xs">
                        <Check size={14}/><span>Register Vendor Invoice</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── STEP 3: MATCH REVIEW ──────────────────────────────────────── */}
              {activeStep === 'match' && (
                <div className="space-y-5">
                  <div className="flex items-center space-x-3 pb-3 border-b">
                    <div className="w-8 h-8 bg-rose-100 rounded-xl flex items-center justify-center"><Link2 size={16} className="text-rose-600"/></div>
                    <div>
                      <h4 className="font-black text-slate-800 text-sm uppercase">Matching Review — Mismatch Detected</h4>
                      <p className="text-[10px] text-slate-400">Invoice amount does not match PO within 2% tolerance</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'PO Amount',      val: selectedPO.totalAmount, color: 'text-slate-800' },
                      { label: 'Invoice Amount', val: selectedPO.vendorInvoiceAmount || 0, color: 'text-rose-700' },
                      { label: 'Variance',       val: Math.abs((selectedPO.vendorInvoiceAmount || 0) - selectedPO.totalAmount), color: 'text-amber-700' },
                    ].map(c => (
                      <div key={c.label} className="bg-slate-50 rounded-xl p-4">
                        <p className="text-[10px] font-black uppercase text-slate-400">{c.label}</p>
                        <p className={`text-xl font-black mt-1 ${c.color}`}>PKR {c.val.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Override Justification / Note</label>
                    <input type="text" value={approvalNote} onChange={e => setApprovalNote(e.target.value)}
                      placeholder="Reason for override or rejection..." className="sap-input w-full text-xs uppercase"/>
                  </div>

                  <div className="flex space-x-3">
                    <button onClick={() => handleOverrideMismatch('override')}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center space-x-2">
                      <ShieldCheck size={14}/><span>Override & Proceed to Approval</span>
                    </button>
                    <button onClick={() => handleOverrideMismatch('reject')}
                      className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-2.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center space-x-2">
                      <XCircle size={14}/><span>Reject — Place On Hold</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 4: APPROVAL ──────────────────────────────────────────── */}
              {activeStep === 'approval' && (() => {
                const lvl = getApprovalLevel(selectedPO.totalAmount);
                const lastAppr = selectedPO.approvalHistory?.[selectedPO.approvalHistory.length - 1];
                return (
                  <div className="space-y-5">
                    <div className="flex items-center space-x-3 pb-3 border-b">
                      <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center"><ShieldCheck size={16} className="text-indigo-600"/></div>
                      <div>
                        <h4 className="font-black text-slate-800 text-sm uppercase">Payment Approval — {lvl.label}</h4>
                        <p className="text-[10px] text-slate-400">{lvl.limit} requires {lvl.label} approval before payment</p>
                      </div>
                    </div>

                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 grid grid-cols-3 gap-4 text-xs">
                      <div><p className="text-[10px] font-black uppercase text-indigo-400">Required Approver</p><p className="font-black text-indigo-800 text-sm">{lvl.label}</p></div>
                      <div><p className="text-[10px] font-black uppercase text-indigo-400">Level</p><p className="font-black text-indigo-800 text-sm">{lvl.level}</p></div>
                      <div><p className="text-[10px] font-black uppercase text-indigo-400">Amount</p><p className="font-black text-indigo-800 text-sm">PKR {selectedPO.totalAmount.toLocaleString()}</p></div>
                    </div>

                    {/* Approval history */}
                    {selectedPO.approvalHistory?.length ? (
                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase text-slate-500">Approval History</p>
                        {selectedPO.approvalHistory.map((h, i) => (
                          <div key={i} className={`flex justify-between items-center p-3 rounded-xl text-xs font-bold border ${h.action === 'Approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                            <span>{h.level} — {h.by}</span>
                            <span>{h.action} on {h.date}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {!lastAppr || lastAppr.action !== 'Approved' ? (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-500">Approval Note (Optional)</label>
                          <input type="text" value={approvalNote} onChange={e => setApprovalNote(e.target.value)}
                            className="sap-input w-full text-xs uppercase" placeholder="Remarks..."/>
                        </div>
                        <div className="flex space-x-3">
                          <button onClick={() => handleApproval('Approved')}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center space-x-2">
                            <Check size={14}/><span>Approve — Release for Payment</span>
                          </button>
                          <button onClick={() => handleApproval('On-Hold')}
                            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center space-x-2">
                            <Clock size={14}/><span>Hold</span>
                          </button>
                          <button onClick={() => handleApproval('Rejected')}
                            className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-2.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center space-x-2">
                            <XCircle size={14}/><span>Reject</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center space-x-3">
                        <CheckCircle2 size={20} className="text-emerald-600"/>
                        <p className="font-black text-emerald-800 text-sm">Approved by {lastAppr.by} on {lastAppr.date}</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── STEP 5: PAYMENT ───────────────────────────────────────────── */}
              {activeStep === 'payment' && (
                <div className="space-y-5">
                  <div className="flex items-center space-x-3 pb-3 border-b">
                    <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center"><CreditCard size={16} className="text-emerald-600"/></div>
                    <div>
                      <h4 className="font-black text-slate-800 text-sm uppercase">Payment Voucher — AP Clearing</h4>
                      <p className="text-[10px] text-slate-400">Create a parked AP payment entry — Finance posts after final review</p>
                    </div>
                  </div>

                  {selectedPO.status === 'Paid' ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-center space-x-4">
                      <CheckCircle2 size={28} className="text-emerald-600"/>
                      <div>
                        <p className="font-black text-emerald-800 text-base">Payment Complete</p>
                        <p className="text-[10px] text-emerald-600 mt-0.5">AP Doc: {selectedPO.apInvoiceId}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-4 text-xs">
                        <div><p className="text-[10px] font-black uppercase text-slate-400">Vendor</p><p className="font-black text-slate-800">{selectedPO.toVendor}</p></div>
                        <div><p className="text-[10px] font-black uppercase text-slate-400">Invoice No</p><p className="font-black text-slate-800">{selectedPO.vendorInvoiceNo || '—'}</p></div>
                        <div><p className="text-[10px] font-black uppercase text-slate-400">Amount</p><p className="font-black text-slate-900 text-base">PKR {selectedPO.totalAmount.toLocaleString()}</p></div>
                        <div><p className="text-[10px] font-black uppercase text-slate-400">PO Ref</p><p className="font-black text-slate-800">{selectedPO.id}</p></div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-500">Pay From (Bank / Cash GL)*</label>
                        <select value={payGLId} onChange={e => setPayGLId(e.target.value)}
                          className="sap-input w-full text-xs font-bold">
                          <option value="">— Select Bank / Cash Account —</option>
                          {bankAccounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                          {accounts.filter(a => a.type === 'Asset').slice(0, 10).map(a => (
                            <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 font-bold">
                        ⚡ This will create a PARKED AP entry (Dr: Payable, Cr: Bank). Finance reviews and posts.
                      </div>

                      <button onClick={handlePostPayment}
                        className="sap-btn-primary flex items-center space-x-2 text-xs w-full justify-center py-3">
                        <CreditCard size={14}/><span>Create Payment Voucher (AP)</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ThreeWayMatching);
