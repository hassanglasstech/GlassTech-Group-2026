import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Product, Quotation, QuotationItem } from '@/modules/shared/types';
import { NipponDocPreview } from '@/modules/nippon/prints/NipponDocPreview';
import { SharedQuotationList } from '@/modules/sales/components/SharedQuotationList';
import { getBrandNick } from '@/modules/shared/utils/brandUtils';
import {
  Printer, X, Plus, Trash2, FileSignature,
  Search, Calendar, Edit2, FileCheck, Eye, Save, ArrowLeft, Layers, Copy, Gift, PackageCheck, CheckCircle2, Loader2
} from 'lucide-react';
import { useNipponQuotations } from './useNipponQuotations';
import { useAuthStore } from '@/modules/auth/authStore';
import { recordAdvanceReceipt } from './nipponAdvanceReceiptService';
import NipponReceiptsList from './NipponReceiptsList';
import { NipponReceiptPrint } from '@/modules/nippon/prints/NipponReceiptPrint';
import { NipponAdvanceReceipt } from '@/modules/production/types/production';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { useUnsavedGuard } from '@/modules/shared/hooks/useUnsavedGuard';
import { toast } from 'sonner';

const NipponQuotationManager: React.FC = () => {
  // Default print header is Kin Long (Nippon's primary supplier). A customer's own
  // preferred header (set on the customer form) overrides this whenever selected.
  const [nipponPrintType, setNipponPrintType] = React.useState<'KinLong' | 'Glasstech' | 'General'>('KinLong');
  const {
    quotations,
    clients,
    products,
    storeItems,
    view,
    setView,
    searchTerm,
    setSearchTerm,
    printingQuote,
    setPrintingQuote,
    activeDropdown,
    setActiveDropdown,
    dropdownRef,
    formData,
    setFormData,
    subTotal,
    lastSerial,
    handleAddSection,
    handleAddItem,
    pendingSetSuggestion,
    setPendingSetSuggestion,
    addFullSet,
    updateItem,
    applyClientPricing,
    toggleItemSample,
    handleRemoveItem,
    handleDuplicateItem,
    handleSave,
    handleDelete,
    handleVoid,
    issueOrder,
    refreshData,
    selectProduct,
    initialQuotation,
    isSaving,
  } = useNipponQuotations();
  const [proofView, setProofView] = React.useState<string | null>(null);   // payment-proof lightbox
  // Only the owner (or Hassan / super_admin) may approve orders (rule 7).
  const role = useAuthStore(s => s.profile?.role || s.user?.role || '');
  const actorName = useAuthStore(s => s.profile?.fullName || s.profile?.email || s.user?.email || 'owner');
  const isOwner = ['owner', 'hassan', 'super_admin'].includes(role);
  // Advance-receipt (Phase C) modal + print state.
  const [receiptOrder, setReceiptOrder] = React.useState<Partial<Quotation> | null>(null);
  const [receiptForm, setReceiptForm] = React.useState<{ amount: string; method: NipponAdvanceReceipt['method']; reference: string }>({ amount: '', method: 'Cash', reference: '' });
  const [recordingReceipt, setRecordingReceipt] = React.useState(false);
  const [printReceipt, setPrintReceipt] = React.useState<{ order: Quotation; receipt: NipponAdvanceReceipt } | null>(null);

  // Quotations vs Sales Orders vs Store Issue tab. Orders = approved-and-beyond
  // (+ voided, kept for audit). Store Issue = approved orders not yet physically
  // issued by the store. Revise mode unlocks an approved order for editing.
  // docTab in the URL (?doc=) so Back / refresh / deep-link work at this level too
  // — the parent Sales tab uses ?tab=, so a distinct key avoids any collision.
  const [docParams, setDocParams] = useSearchParams();
  const DOC_TABS = ['quotations', 'queries', 'orders', 'issue', 'receipts'] as const;
  type DocTab = typeof DOC_TABS[number];
  const docRaw = docParams.get('doc');
  const docTab: DocTab =
    (DOC_TABS as readonly string[]).includes(docRaw || '') ? (docRaw as DocTab) : 'quotations';
  const setDocTab = (t: DocTab): void => {
    const next = new URLSearchParams(docParams);
    next.set('doc', t);
    setDocParams(next);
  };
  const [reviseMode, setReviseMode] = React.useState(false);
  // 'Delivered' = approved order whose goods were issued from the store. It MUST
  // live in the ORDER bucket — without it, an issued order fails this test and
  // silently falls back into the Quotations tab (P0-1), disappearing from tracking.
  const ORDER_STATUSES = ['Approved', 'Delivered', 'Invoiced', 'Partial Payment', 'Paid', 'Void'];

  // Unsaved-changes guard. Snapshot the doc when the editor opens; if formData
  // diverges, warn before leaving. Snapshot is taken in openEditor().
  const editSnapshotRef = React.useRef<string>('');
  const isDirty = view === 'edit' && JSON.stringify(formData) !== editSnapshotRef.current;
  // Guard in-app navigation while the editor has unsaved edits (save/draft alert).
  useUnsavedGuard(isDirty);

  const openEditor = (q: Partial<Quotation>, revise: boolean) => {
    setReviseMode(revise);
    setFormData(q);
    editSnapshotRef.current = JSON.stringify(q);
    setView('edit');
  };

  const leaveEditor = () => {
    if (isDirty && !window.confirm('Discard unsaved changes? Your edits will be lost.')) return;
    setView('list');
  };

  // A customer's preferred print header overrides the default whenever they are the
  // selected client in the editor ("always override").
  React.useEffect(() => {
    const cli = clients.find(c => c.id === formData.clientId);
    if (cli?.preferredPrintType) setNipponPrintType(cli.preferredPrintType);
  }, [formData.clientId, clients]);

  const printLabel = (t: string): string => (t === 'KinLong' ? 'Kin Long' : t);
  // Print guard: if the chosen header differs from THIS customer's preferred one,
  // prompt + offer to switch (override still allowed).
  const promptAndPrint = async (q: Quotation): Promise<void> => {
    const cli = clients.find(c => c.id === q.clientId);
    const pref = cli?.preferredPrintType;
    if (pref && pref !== nipponPrintType) {
      const switchToPref = await confirmModal(
        `"${cli?.name}" ke liye preferred print "${printLabel(pref)}" hai, lekin abhi "${printLabel(nipponPrintType)}" selected hai.\n\nOK = "${printLabel(pref)}" pe switch kar ke print · Cancel = "${printLabel(nipponPrintType)}" hi rakho.`,
      );
      if (switchToPref) setNipponPrintType(pref);
    }
    setPrintingQuote(q);
  };

  // Phase C — owner records a payment RECEIVED against this order (advance).
  const openReceiptModal = (): void => {
    const net = subTotal - (formData.discountAmount || 0);
    setReceiptForm({ amount: String(formData.paymentClaimAmount || net || ''), method: 'Cash', reference: '' });
    setReceiptOrder(formData);
  };
  const submitReceipt = async (): Promise<void> => {
    if (!receiptOrder) return;
    const amount = Number(receiptForm.amount) || 0;
    if (amount <= 0) { toast.error('Enter the amount received.'); return; }
    setRecordingReceipt(true);
    const cli = clients.find(c => c.id === receiptOrder.clientId);
    const res = await recordAdvanceReceipt({
      order: receiptOrder as Quotation, company: 'Nippon',
      clientName: cli?.name || receiptOrder.clientId || '',
      amount, method: receiptForm.method, reference: receiptForm.reference, by: actorName,
    });
    setRecordingReceipt(false);
    if (res.error || !res.data) { toast.error(`Receipt failed — ${res.error || 'unknown'}`, { duration: 8000 }); return; }
    const { order: updated, receipt, glPosted } = res.data;
    setFormData(updated);
    setReceiptOrder(null);
    toast.success(`Receipt ${receipt.receiptNo} recorded${glPosted ? ' + posted to GL' : ''}.`);
    setPrintReceipt({ order: updated, receipt });
    await refreshData();
    // Prepayment popup (rule 6) — owner decides whether to release goods now.
    if (isOwner && await confirmModal(`Payment recorded for ${updated.orderNo || updated.manualSerial || updated.id}. Approve the order and release goods to the store now?`)) {
      handleSave(true, updated);
    }
  };

  // "<Client> <Project> <QUT|SO>-<serial4>" — used as the print/PDF filename.
  const pdfFileName = (q: Quotation): string => {
    const client = clients.find(c => c.id === q.clientId);
    const clientName = (client?.name || 'Client').trim();
    const project = (q.projectName || '').trim();
    const docType = ORDER_STATUSES.includes(q.status as string) ? 'SO' : 'QUT';
    const digits = (q.manualSerial || q.orderNo || q.id || '').replace(/\D/g, '');
    const last4 = digits.slice(-4) || (q.manualSerial || '');
    const raw = [clientName, project, `${docType}-${last4}`].filter(Boolean).join(' ');
    // Drop characters illegal in filenames, collapse whitespace.
    return raw.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  };

  // Warn on browser close / refresh / hard-nav while there are unsaved edits.
  React.useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Focus mode: while the Nippon editor view is open, add `erp-focus-mode` to
  // <body> so index.css hides the app shell header (.sap-shell) + Sales tab bar
  // (.sd-nav) — otherwise the tabs bleed over the editor (same fix as Glassco).
  React.useEffect(() => {
    if (view === 'list') { document.body.classList.remove('erp-focus-mode'); return; }
    document.body.classList.add('erp-focus-mode');
    return () => document.body.classList.remove('erp-focus-mode');
  }, [view]);

  const isLocked = formData.status === 'Approved' && !reviseMode;

  // Free samples: keep the net at 0 by mirroring a 100% discount to the running
  // subtotal (so stock still moves + it's tracked, but revenue is 0).
  React.useEffect(() => {
    if (formData.isSample && formData.sampleType === 'Free' && (formData.discountAmount || 0) !== subTotal) {
      setFormData(prev => ({ ...prev, discountPercent: 100, discountAmount: subTotal }));
    }
  }, [subTotal, formData.isSample, formData.sampleType, formData.discountAmount, setFormData]);

  // Customer queries (portal-placed, not yet an order) get their OWN tab — they no
  // longer clutter the office "Quotations" tab. quotations = office drafts only;
  // queries = customerPlaced drafts; orders = approved-and-beyond.
  const isOrderStatus = (q: Quotation): boolean => ORDER_STATUSES.includes(q.status as string);
  const isCustomerQuery = (q: Quotation): boolean => !!q.customerPlaced && !isOrderStatus(q);

  const filteredQuotations = useMemo(() => {
    let result = quotations.filter(q => {
      if (docTab === 'orders') return isOrderStatus(q);
      if (docTab === 'queries') return isCustomerQuery(q);
      // 'quotations' tab: office-created drafts only (exclude customer queries).
      return !isOrderStatus(q) && !q.customerPlaced;
    });
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(q =>
        q.id.toLowerCase().includes(lower) ||
        (q.projectName || '').toLowerCase().includes(lower) ||
        clients.find(c => c.id === q.clientId)?.name.toLowerCase().includes(lower)
      );
    }
    return result;
  }, [quotations, searchTerm, clients, docTab]);

  const getProductSpecs = (p: Product) => {
    const specs = [
      p.thickness,
      p.sheetSize,
      p.finishColor,
      p.material,
      p.glassType,
      p.subCategory,
      p.modelNo,
      p.direction,
      p.tongueLength,
      p.spindleLength,
      p.profileRole,
      p.systemSubClass,
      ...(p.technicalSpecs ? Object.values(p.technicalSpecs) : [])
    ].filter(Boolean).join(' | ');
    return specs;
  };

  const handleAddSetComponents = () => {
    if (!pendingSetSuggestion) return;
    const idx = pendingSetSuggestion.index;
    const comps = pendingSetSuggestion.remainingComponents;
    const newLines = comps.map((c, ci) => {
      const matchProd = products.find((p) =>
        p.id === c.id || p.description.toUpperCase() === c.description.toUpperCase()
      );
      const qtyPerSet = c.qtyPerSet || 1;
      return {
        id: `SET-ADD-${Date.now()}-${ci}`,
        description: matchProd ? matchProd.description : c.description,
        locationCode: matchProd?.profileCode || '',
        glazingSpecs: matchProd?.brand || '',
        glassSize: c.unit || 'PCS',
        qty: qtyPerSet,
        width: 0, height: 0, totalSqFt: 0,
        pricePerUnit: matchProd?.basePrice || 0,
        amount: qtyPerSet * (matchProd?.basePrice || 0),
        isSetMember: true,
        setId: pendingSetSuggestion.setProduct.id,
      } as QuotationItem;
    });
    setFormData((prev: Partial<Quotation>) => {
      const next = [...(prev.items || [])];
      next.splice(idx + 1, 0, ...newLines);
      return { ...prev, items: next };
    });
    setPendingSetSuggestion(null);
  };

  return (
    <div className="space-y-6">
      {printingQuote && (
        <NipponDocPreview
          printingQuote={printingQuote}
          clients={clients}
          products={products}
          printType={nipponPrintType}
          fileName={pdfFileName(printingQuote)}
          onClose={() => setPrintingQuote(null)}
        />
      )}

      <div className="no-print bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <Printer size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Print Settings</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Select header format for Nippon Hardware</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {(['KinLong', 'Glasstech', 'General'] as const).map(type => (
            <button
              key={type}
              onClick={() => setNipponPrintType(type)}
              className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                nipponPrintType === type 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' 
                  : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
              }`}
            >
              {type === 'KinLong' ? 'Kin Long' : type === 'Glasstech' ? 'Glasstech' : 'General'}
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        <>
        <div className="no-print flex items-center gap-2">
          {([['quotations', 'Quotations'], ['queries', 'Customer Queries'], ['orders', 'Sales Orders'], ['issue', 'Store Issue'], ['receipts', 'Receipts']] as const).map(([key, label]) => {
            const count =
              key === 'issue' ? quotations.filter(q => q.status === 'Approved' && !(q as { issuedAt?: string }).issuedAt).length
              : key === 'orders' ? quotations.filter(isOrderStatus).length
              : key === 'queries' ? quotations.filter(isCustomerQuery).length
              : key === 'receipts' ? quotations.reduce((s, q) => s + (q.advanceReceipts?.length || 0), 0)
              : quotations.filter(q => !isOrderStatus(q) && !q.customerPlaced).length;
            const activeCls = key === 'issue' ? 'bg-amber-600 text-white border-amber-600 shadow'
              : key === 'queries' ? 'bg-teal-600 text-white border-teal-600 shadow'
              : key === 'receipts' ? 'bg-emerald-600 text-white border-emerald-600 shadow'
              : 'bg-blue-600 text-white border-blue-600 shadow';
            return (
              <button key={key} onClick={() => setDocTab(key)}
                className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-all flex items-center ${docTab === key ? activeCls : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}>
                {label}
                <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded-full ${docTab === key ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        {docTab === 'receipts' ? (
          <NipponReceiptsList />
        ) : docTab === 'issue' ? (
          (() => {
            const pending = quotations.filter(q => q.status === 'Approved' && !(q as { issuedAt?: string }).issuedAt);
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2 no-print">
                  <PackageCheck size={16} className="text-amber-600"/>
                  <h3 className="text-xs font-black uppercase tracking-widest text-amber-800">Store — Pending Issue</h3>
                  <span className="ml-auto text-[10px] font-bold text-amber-600">{pending.length} order(s) to issue</span>
                </div>
                {pending.length === 0 ? (
                  <div className="p-16 text-center text-slate-300 font-black uppercase italic text-xs tracking-widest">No approved orders waiting to be issued.</div>
                ) : (
                  <table className="w-full min-w-[640px] text-left">
                    <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400"><tr>
                      <th className="px-5 py-3">Order</th><th className="px-5 py-3">Customer</th>
                      <th className="px-5 py-3 text-center">Items</th><th className="px-5 py-3 text-right">Value</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {pending.map(q => {
                        const cli = clients.find(c => c.id === q.clientId);
                        const nLines = (q.items || []).filter(i => !i.isSection).length;
                        const val = (q as { total?: number }).total ?? (q.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
                        return (
                          <tr key={q.id} className="hover:bg-slate-50">
                            <td className="px-5 py-3 font-black text-blue-600 text-xs uppercase whitespace-nowrap">{q.orderNo || q.id}</td>
                            <td className="px-5 py-3 font-bold text-slate-700 text-xs uppercase">{cli?.name || (q as { clientName?: string }).clientName || '—'}</td>
                            <td className="px-5 py-3 text-center text-xs font-bold text-slate-600">{nLines}</td>
                            <td className="px-5 py-3 text-right text-xs font-black tabular-nums">{Number(val).toLocaleString()}</td>
                            <td className="px-5 py-3 text-right">
                              {/* Gate pass is NOT issued from Sales — the store REQUESTS it (Store Issue
                                  screen) and the office issues it in Logistics → Gate Pass. */}
                              <button
                                onClick={async () => { if (await confirmModal(`Issue goods for ${q.orderNo || q.id}? On-hand stock will be reduced and the order marked Delivered.`)) issueOrder(q.id); }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black uppercase text-[10px] tracking-widest inline-flex items-center gap-1.5 transition-all">
                                <PackageCheck size={13}/> Issue / Deliver
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })()
        ) : (
          <SharedQuotationList
            companyName="Nippon"
            title={docTab === 'queries' ? 'Customer Queries' : undefined}
            subtitle={docTab === 'queries' ? 'Placed by customers via the portal — open to review, price & convert to a quotation' : undefined}
            hideCreate={docTab === 'queries'}
            quotations={filteredQuotations}
            clients={clients}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onNew={() => openEditor(initialQuotation, false)}
            onEdit={(q) => openEditor(q, docTab === 'orders' && q.status !== 'Void')}
            onPrint={promptAndPrint}
            onApprove={isOwner ? (q) => handleSave(true, q) : undefined}
            onDelete={handleDelete}
            onVoid={docTab === 'orders' ? handleVoid : undefined}
          />
        )}
        </>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[560px] h-[calc(100dvh-170px)]">
            {/* Editor Header — compact so the items table gets more vertical room */}
            <div className="bg-slate-900 text-white px-4 py-2 flex justify-between items-center shrink-0">
                <div className="flex items-center space-x-3">
                  <button onClick={leaveEditor} className="p-1.5 hover:bg-slate-800 rounded-full transition-colors">
                    <ArrowLeft size={16} />
                  </button>
                  <h2 className="text-sm font-bold flex items-center gap-1.5">
                    <span className="text-blue-400">NIPPON</span>
                    <span className="text-slate-300 font-medium">·</span>
                    <span>Quotation Editor</span>
                  </h2>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${formData.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {formData.status || 'Draft'}
                  </span>
                </div>
            </div>
            
            <div className="flex-1 overflow-hidden p-3 bg-slate-50/50 flex flex-col space-y-2">
              {/* Header Fields — tighter padding so items table gets more room */}
              <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-2 shrink-0">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Client</label>
                  <select disabled={isLocked} className="sap-input w-full font-bold" value={formData.clientId} onChange={e => applyClientPricing(e.target.value)}>
                    <option value="">Select Client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Project / Store</label><input disabled={isLocked} type="text" className="sap-input w-full font-bold" value={formData.projectName} onChange={e => setFormData({...formData, projectName: e.target.value})} /></div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 flex justify-between">
                    <span>Serial No</span>
                    <span className="text-blue-500 lowercase font-medium">Last: {lastSerial}</span>
                  </label>
                  <input 
                    disabled={isLocked} 
                    type="text" 
                    placeholder="e.g. 0001"
                    className={`sap-input w-full font-black ${formData.manualSerial && quotations.some(q => q.company === 'Nippon' && q.manualSerial === formData.manualSerial && q.id !== formData.id) ? 'border-red-500 text-red-600' : 'text-blue-600'}`}
                    value={formData.manualSerial || ''} 
                    onChange={e => setFormData({...formData, manualSerial: e.target.value})} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400">Date</label><input disabled={isLocked} type="date" className="sap-input w-full font-bold" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div>
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-rose-500">Valid Till</label><input disabled={isLocked} type="date" className="sap-input w-full font-bold text-rose-600" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} /></div>
                </div>
              </div>

              {/* Sample toggle — record a sample given to a client (charged or free) */}
              <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 flex-wrap shrink-0">
                <label className="flex items-center gap-2 text-[11px] font-black uppercase text-slate-600 cursor-pointer">
                  <input type="checkbox" disabled={isLocked} checked={!!formData.isSample}
                    onChange={e => {
                      const on = e.target.checked;
                      setFormData(prev => ({
                        ...prev,
                        isSample: on,
                        sampleType: on ? (prev.sampleType || 'Free') : undefined,
                        ...(on && (prev.sampleType || 'Free') === 'Free' ? { discountPercent: 100, discountAmount: subTotal } : {}),
                        ...(!on ? { discountPercent: 0, discountAmount: 0 } : {}),
                      }));
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                  Sample
                </label>
                {formData.isSample && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(['Free', 'Paid'] as const).map(t => (
                      <button key={t} type="button" disabled={isLocked}
                        onClick={() => setFormData(prev => ({
                          ...prev, sampleType: t,
                          ...(t === 'Free' ? { discountPercent: 100, discountAmount: subTotal } : { discountPercent: 0, discountAmount: 0 }),
                        }))}
                        className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg border transition-all ${formData.sampleType === t ? (t === 'Free' ? 'bg-amber-600 text-white border-amber-600' : 'bg-blue-600 text-white border-blue-600') : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                        {t} sample
                      </button>
                    ))}
                    <span className="text-[10px] text-slate-400 font-bold">
                      {formData.sampleType === 'Free' ? 'Net 0 · stock still moves · tracked per client' : 'Charged at price · tracked per client'}
                    </span>
                  </div>
                )}
              </div>

              {/* Gate Pass A — office instruction thread + priority. These ride the
                  order to the store picker (StoreIssueScreen) and, later, the driver
                  gate pass. One thread, set once, seen by everyone downstream. */}
              <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 flex-wrap shrink-0">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-black uppercase text-slate-400">Priority</span>
                  {(['Normal', 'Urgent'] as const).map(pr => (
                    <button key={pr} type="button" disabled={isLocked}
                      onClick={() => setFormData(prev => ({ ...prev, priority: pr }))}
                      className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg border transition-all ${(formData.priority || 'Normal') === pr ? (pr === 'Urgent' ? 'bg-rose-600 text-white border-rose-600' : 'bg-slate-700 text-white border-slate-700') : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                      {pr}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                  <span className="text-[10px] font-black uppercase text-slate-400 shrink-0">Instructions</span>
                  <input disabled={isLocked} type="text" placeholder="Fragile · call before delivery · partial OK · deliver by…"
                    className="sap-input w-full text-xs" value={formData.specialInstructions || ''}
                    onChange={e => setFormData({ ...formData, specialInstructions: e.target.value })}/>
                </div>
              </div>

              {/* Payment — the customer's claim (screenshot + amount) is shown for the
                  owner to verify; the owner records the official RECEIPT (Dr Cash/Bank ·
                  Cr Client Advance) which confirms payment + unblocks approval. */}
              {formData.customerPlaced && (
                <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 flex-wrap shrink-0">
                  <span className="text-[10px] font-black uppercase text-slate-400 shrink-0">Payment</span>
                  {formData.paymentProof ? (
                    <>
                      <button type="button" onClick={() => setProofView(formData.paymentProof || null)}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase text-blue-600 hover:text-blue-800">
                        <Eye size={13}/> Customer proof
                      </button>
                      <span className="text-[10px] font-bold text-slate-400">
                        Claim{formData.paymentClaimAmount ? ` PKR ${Number(formData.paymentClaimAmount).toLocaleString()}` : ''}{formData.paymentSubmittedAt ? ` · ${new Date(formData.paymentSubmittedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400">No customer proof yet — record the receipt when payment arrives.</span>
                  )}
                  {formData.paymentConfirmed ? (
                    <span className="ml-auto flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600">
                      <CheckCircle2 size={13}/> Payment confirmed{formData.advanceReceipts?.length ? ` · ${formData.advanceReceipts.length} receipt(s)` : ''}
                    </span>
                  ) : (
                    <button type="button" disabled={!isOwner} title={!isOwner ? 'Only the owner records payments' : undefined}
                      onClick={openReceiptModal}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-[10px] font-black uppercase tracking-widest">
                      <CheckCircle2 size={13}/> Record Payment Receipt
                    </button>
                  )}
                </div>
              )}

              {/* Items Grid */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-auto">
                  <table className="w-full min-w-[760px] text-left sap-table sap-table-dense relative">
                    <thead className="sticky top-0 bg-white z-10 shadow-sm">
                    <tr>
                      <th className="w-10 text-center">#</th>
                      <th className="w-32">Item Code</th>
                      <th className="w-[300px]">Item Name</th>
                      <th className="w-32">Brand</th>
                      <th className="w-20 text-center">Unit</th>
                      <th className="w-20 text-center">Qty</th>
                      <th className="w-28 text-right">Rate</th>
                      <th className="w-28 text-right">Total</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs font-medium">
                    {formData.items?.map((item, idx) => (
                      <tr key={idx} className={
                        item.isSetHeader
                          ? "bg-amber-50 border-l-4 border-amber-400"
                          : (item as any).isSetMember
                          ? "bg-amber-50/30 pl-4"
                          : item.isSection
                          ? "bg-slate-100/80"
                          : item.isSample
                          ? "bg-amber-50/60 hover:bg-amber-50"
                          : "hover:bg-slate-50"
                      }>
                        <td className="text-center text-slate-300 font-bold">
                          {item.isSetHeader
                            ? <span className="text-[9px] text-amber-400 font-black uppercase">SET</span>
                            : (item.isSection && !item.isSetHeader)
                            ? ''
                            : (() => {
                                // Count only non-section, non-setHeader items before this index
                                const serialNo = formData.items!.slice(0, idx).filter(
                                  (i: QuotationItem) => !i.isSection && !i.isSetHeader
                                ).length + 1;
                                return serialNo;
                              })()
                          }
                        </td>
                        {item.isSection ? (
                          <td colSpan={7} className="py-2">
                            {item.isSetHeader ? (
                              <div className="flex items-center space-x-2">
                                <span className="bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">SET</span>
                                <span className="font-black uppercase tracking-widest text-amber-800 text-xs">{item.description}</span>
                                {!isLocked && (
                                  <button onClick={() => { const next = [...(formData.items||[])]; next.splice(idx,1); }} className="ml-auto text-[10px] text-rose-400 hover:text-rose-600 font-bold">Remove Set Header</button>
                                )}
                              </div>
                            ) : (
                              <input 
                                readOnly={isLocked} 
                                type="text" 
                                placeholder="Section Heading..." 
                                className="w-full bg-transparent border-none outline-none font-black uppercase tracking-widest text-slate-700 italic placeholder:text-slate-300" 
                                value={item.description} 
                                onChange={e => updateItem(idx, 'description', e.target.value)} 
                              />
                            )}
                          </td>
                        ) : (
                          <>
                            <td className="w-32">
                                <input readOnly={isLocked} type="text" placeholder="Code" className="sap-input w-full py-0.5 text-xs font-mono font-bold text-blue-600 uppercase" value={item.locationCode || ''} onChange={e => updateItem(idx, 'locationCode', e.target.value)} />
                            </td>
                            <td className="relative w-[300px]">
                               <textarea
                                 readOnly={isLocked}
                                 placeholder="Search Product..."
                                 className="sap-input w-full py-0.5 text-xs font-bold uppercase resize-none leading-tight"
                                 rows={1}
                                 value={item.description} 
                                 onChange={e => {
                                   updateItem(idx, 'description', e.target.value);
                                   setActiveDropdown(idx);
                                 }}
                                 onFocus={() => setActiveDropdown(idx)}
                               />
                               {activeDropdown === idx && !isLocked && (() => {
                                 // Stock-driven dropdown — show actual store_items, enrich
                                 // each row with matching product metadata (specs, brand,
                                 // image) when one exists. Items that have a stock row
                                 // but no master-catalog product still appear.
                                 const q = (item.description || '').toLowerCase();
                                 // Source from the PRODUCT master (every product searchable by
                                 // name / ERP code / KinLong code / nick — even with no stock row).
                                 // Stock qty is joined from store_items just for display.
                                 const storeById = new Map(storeItems.map(s => [s.id, s]));
                                 // A product that has variants is a CATALOGUE GROUPING, not a
                                 // sellable item — you order the length, not "the profile".
                                 // Standard everywhere (SAP generic article, NetSuite matrix
                                 // item, D365 product master, Odoo template): the parent is
                                 // non-transactable, stock and price live on the variant.
                                 // It stays SEARCHABLE though — typing the parent's code
                                 // surfaces its variants, so old codes still lead somewhere.
                                 const productById = new Map(products.map(p => [p.id, p]));
                                 const parentIds = new Set(
                                   products.map(p => p.variantOf).filter(Boolean) as string[],
                                 );
                                 const hay = (p: typeof products[number]) => [
                                   p.description, p.name, p.modelNo, p.itemCode, p.profileCode, p.brand,
                                   (p as { nickName?: string }).nickName,
                                 ].filter(Boolean).join(' ').toLowerCase();
                                 const matches = products.filter(p => {
                                   if (parentIds.has(p.id)) return false;        // grouping row, not orderable
                                   if (!q) return true;
                                   if (hay(p).includes(q)) return true;
                                   const parent = p.variantOf ? productById.get(p.variantOf) : null;
                                   return parent ? hay(parent).includes(q) : false;
                                 }).slice(0, 60);
                                 return (
                                   <div ref={dropdownRef} className="absolute z-50 w-[360px] mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[420px] overflow-y-auto">
                                     {matches.map(p => {
                                       const s = storeById.get(p.id);
                                       const available = s?.unrestrictedQty ?? 0;
                                       const total = s?.quantity ?? 0;
                                       const displayName = p.description || p.name || p.id;
                                       const code = p.modelNo || p.itemCode || p.profileCode || p.id;
                                       const unit = p.unit || s?.unit || 'PCS';
                                       const price = p.price || p.basePrice || s?.movingAveragePrice || 0;
                                       const brand = p.brand || '';
                                       const parentOf = p.variantOf ? productById.get(p.variantOf) : null;
                                       const vAttrs = (p as { variantAttributes?: Record<string, string> }).variantAttributes;
                                       const variantLabel = vAttrs
                                         ? Object.entries(vAttrs).map(([k, v]) => `${k} ${v}`).join(' · ')
                                         : '';
                                       return (
                                         <div
                                           key={p.id}
                                           className="px-3 py-1.5 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0"
                                           onClick={() => {
                                             selectProduct(idx, p);
                                             setActiveDropdown(null);
                                           }}
                                         >
                                           <div className="flex items-center justify-between gap-2">
                                             <div className="font-bold text-slate-800 uppercase text-xs leading-tight truncate">{displayName}</div>
                                             {/* Variants sit in the same list as standalone products,
                                                 badged with the axis value that distinguishes them. */}
                                             {parentOf && (
                                               <span className="shrink-0 text-[8px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                                                 {variantLabel || 'Variant'}
                                               </span>
                                             )}
                                             {brand && (
                                               <span className="shrink-0 text-[8px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                                 {getBrandNick(brand)}
                                               </span>
                                             )}
                                           </div>
                                           <div className="text-[9px] text-slate-400 font-medium mt-0.5 truncate">
                                             {parentOf && (
                                               <span className="font-bold text-amber-600">
                                                 ↳ {parentOf.profileCode || parentOf.modelNo || parentOf.id}
                                                 {getProductSpecs(p) ? ' · ' : ''}
                                               </span>
                                             )}
                                             {getProductSpecs(p)}
                                           </div>
                                           <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                                             <div className="flex items-center gap-2">
                                               <span className="font-mono font-bold text-blue-600">{code}</span>
                                               <span className={`text-[9px] font-black ${available > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                 {available}/{total} {unit}
                                               </span>
                                             </div>
                                             <span className="font-black text-slate-700">Rs {price.toLocaleString()}/{unit}</span>
                                           </div>
                                         </div>
                                       );
                                     })}
                                     {matches.length === 0 && (
                                       <div className="px-3 py-4 text-center text-slate-400 text-xs">
                                         {products.length === 0 ? 'No products loaded — check sync' : 'No matching products'}
                                       </div>
                                     )}
                                   </div>
                                 );
                               })()}
                            </td>
                            <td className="w-32">
                                <input readOnly={isLocked} type="text" placeholder="Brand" className="sap-input w-full py-0.5 text-xs font-bold uppercase" value={item.glazingSpecs || ''} onChange={e => updateItem(idx, 'glazingSpecs', e.target.value)} />
                            </td>
                            <td className="w-20">
                                <input readOnly={isLocked} type="text" placeholder="Unit" className="sap-input w-full py-0.5 text-center text-xs font-bold uppercase" value={item.glassSize || ''} onChange={e => updateItem(idx, 'glassSize', e.target.value)} />
                            </td>
                            <td className="w-20">
                                <input readOnly={isLocked} type="number" className="sap-input w-full py-0.5 text-center text-xs font-bold" value={item.qty || ''} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} />
                            </td>
                            <td className="w-28">
                                {/* Rate defaults from the product master but is EDITABLE per line so a
                                    trader can key a negotiated unit price (P1-2, per the audit). Locked
                                    on a saved order and for a free sample. amount recomputes via
                                    updateItem. Guardrail: a below-cost rate turns red so a loss sale
                                    can't slip through unseen (the approval-gate is a separate P1). */}
                                {(() => {
                                  const cp = products.find(pp => pp.id === item.productRef || pp.id === item.locationCode
                                    || pp.modelNo === item.locationCode || pp.profileCode === item.locationCode);
                                  const cost = Number(cp?.costPrice) || 0;
                                  const belowCost = !item.isSample && cost > 0
                                    && Number(item.pricePerUnit) > 0 && Number(item.pricePerUnit) < cost;
                                  return (
                                    <input readOnly={isLocked || item.isSample} type="number"
                                        title={belowCost
                                          ? `⚠ Below cost (Rs ${cost.toLocaleString()}) — selling at a loss`
                                          : 'Negotiated unit price — defaults from the product master, editable per line'}
                                        className={`sap-input w-full py-0.5 text-right text-xs font-bold ${belowCost ? 'text-rose-700 bg-rose-50 border border-rose-400' : 'text-blue-600'} ${(isLocked || item.isSample) ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                                        value={item.pricePerUnit || ''}
                                        onChange={e => updateItem(idx, 'pricePerUnit', Number(e.target.value))} />
                                  );
                                })()}
                            </td>
                            <td className="w-28 text-right font-black text-slate-800 pr-4">
                                {item.isSample
                                  ? <span className="text-amber-600 text-[10px] font-black uppercase tracking-widest">Sample</span>
                                  : (item.amount || 0).toLocaleString()}
                            </td>
                          </>
                        )}
                        <td className="w-12 text-center">
                            {!isLocked && (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => {
                                  const title = prompt("Enter Section Heading:");
                                  if (title !== null) handleAddSection(title, idx);
                                }} className="text-slate-400 hover:text-emerald-600" title="Add Section Below"><Layers size={14}/></button>
                                <button onClick={() => handleDuplicateItem(idx)} className="text-slate-400 hover:text-blue-600" title="Duplicate Row"><Copy size={14}/></button>
                                <button onClick={() => toggleItemSample(idx)} className={item.isSample ? "text-amber-600" : "text-slate-400 hover:text-amber-600"} title={item.isSample ? "Unmark free sample" : "Give this item as a free sample"}><Gift size={14}/></button>
                                <button onClick={() => handleRemoveItem(idx)} className="text-slate-400 hover:text-red-500" title="Remove Row"><Trash2 size={14}/></button>
                              </div>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                
                {/* Footer Controls — compact so more rows / dropdown space fit above */}
                <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex flex-col space-y-2 shrink-0">
                  {/* Totals Row */}
                  <div className="flex justify-end items-center space-x-8">
                    <div className="flex items-center space-x-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Discount %</label>
                        <input disabled={isLocked} type="number" className="sap-input w-20 text-right font-bold text-rose-600 py-1" value={formData.discountPercent || ''} onChange={e => {
                            const pct = Number(e.target.value);
                            setFormData({...formData, discountPercent: pct, discountAmount: subTotal * (pct/100)});
                        }} />
                    </div>
                    <div className="flex items-center space-x-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Discount Rs</label>
                        <input disabled={isLocked} type="number" className="sap-input w-24 text-right font-bold text-rose-600 py-1" value={formData.discountAmount || ''} onChange={e => {
                            const amt = Number(e.target.value);
                            setFormData({...formData, discountAmount: amt, discountPercent: subTotal > 0 ? Number(((amt/subTotal)*100).toFixed(2)) : 0});
                        }} />
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black uppercase text-slate-400">Net Total</div>
                      <div className="text-xl font-black text-slate-800 leading-none mt-1">Rs {(subTotal - (formData.discountAmount || 0)).toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Seller-only live margin (P1-2) — NEVER printed on the customer quote.
                      Cost is looked up from the product master by line, so a trader sees
                      gross profit before giving a discount / editing a rate. */}
                  {(() => {
                    const findCost = (it: { productRef?: string; locationCode?: string }): number => {
                      const p = products.find(pp => pp.id === it.productRef || pp.id === it.locationCode
                        || pp.modelNo === it.locationCode || pp.profileCode === it.locationCode);
                      return Number(p?.costPrice) || 0;
                    };
                    const lines = (formData.items || []).filter(i => !i.isSection && !i.isSample);
                    const totalCost = lines.reduce((s, it) => s + findCost(it) * (Number(it.qty) || 0), 0);
                    const net = subTotal - (formData.discountAmount || 0);
                    const gp = net - totalCost;
                    const gpPct = net > 0 ? (gp / net) * 100 : 0;
                    const missingCost = lines.some(it => findCost(it) <= 0);
                    if (lines.length === 0) return null;
                    return (
                      <div className="no-print flex justify-end items-center gap-6 text-[10px] font-black uppercase tracking-widest pt-0.5">
                        <span className="text-slate-400">Cost <span className="text-slate-600 tabular-nums">Rs {Math.round(totalCost).toLocaleString()}</span></span>
                        <span className={gp >= 0 ? 'text-emerald-600' : 'text-rose-600'}>GP <span className="tabular-nums">Rs {Math.round(gp).toLocaleString()}</span></span>
                        <span className={`px-2 py-0.5 rounded ${gpPct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'} tabular-nums`}>GP {gpPct.toFixed(1)}%</span>
                        {missingCost && <span className="text-amber-600 normal-case" title="Some lines have no master cost — margin is understated">⚠ cost missing on some lines</span>}
                      </div>
                    );
                  })()}

                  {/* Buttons Row */}
                  <div className="flex justify-between items-center">
                    <div className="flex space-x-2">
                      <button
                        disabled={isLocked}
                        onClick={() => handleAddItem()}
                        className={`text-[10px] py-1.5 px-4 flex items-center space-x-2 shadow-md font-black uppercase tracking-widest transition-all rounded-lg ${isLocked ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100'}`}
                      >
                        <Plus size={14}/> <span>Add New Line</span>
                      </button>
                      <button 
                        disabled={isLocked} 
                        onClick={() => {
                          const title = prompt("Enter Section Heading:");
                          if (title !== null) handleAddSection(title);
                        }} 
                        className={`text-[10px] py-2.5 px-6 flex items-center space-x-2 shadow-sm font-black uppercase tracking-widest transition-all rounded-lg border ${isLocked ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                      >
                        <Layers size={16}/> <span>Add New Section</span>
                      </button>
                    </div>

                    {reviseMode ? (
                    <div className="flex items-center space-x-3">
                      <button
                        disabled={isSaving}
                        onClick={() => handleSave(false, formData, true)}
                        className={`text-[10px] py-2.5 px-8 flex items-center space-x-2 shadow-xl font-black uppercase tracking-widest transition-all rounded-lg ${isSaving ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-100'}`}
                      >
                        <FileCheck size={16}/> <span>{isSaving ? 'Saving…' : 'Save Revision (R)'}</span>
                      </button>
                    </div>
                    ) : (
                    <div className="flex items-center space-x-3">
                      <button
                        disabled={isLocked || isSaving}
                        onClick={() => handleSave(false)}
                        className={`text-[10px] py-2.5 px-6 flex items-center space-x-2 shadow-sm font-black uppercase tracking-widest transition-all rounded-lg border ${(isLocked || isSaving) ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                      >
                        <Save size={16}/> <span>{isSaving ? 'Saving…' : 'Save Draft'}</span>
                      </button>
                      <button
                        disabled={isLocked || isSaving}
                        onClick={() => handleSave(false)}
                        className={`text-[10px] py-2.5 px-6 flex items-center space-x-2 shadow-sm font-black uppercase tracking-widest transition-all rounded-lg border ${(isLocked || isSaving) ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' : 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100'}`}
                      >
                        <Save size={16}/> <span>{isSaving ? 'Saving…' : 'Save Quotation'}</span>
                      </button>
                      <button
                        disabled={isLocked || isSaving || !isOwner}
                        onClick={() => handleSave(true)}
                        title={!isOwner ? 'Only the owner can approve orders' : undefined}
                        className={`text-[10px] py-2.5 px-8 flex items-center space-x-2 shadow-xl font-black uppercase tracking-widest transition-all rounded-lg ${(isLocked || isSaving || !isOwner) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100'}`}
                      >
                        <FileCheck size={16}/> <span>{isSaving ? 'Approving…' : !isOwner ? 'Owner Approves' : 'Approve Order'}</span>
                      </button>
                    </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
        </div>
      )}

      {/* Payment-proof lightbox */}
      {proofView && (
        <div className="fixed inset-0 bg-slate-900/80 z-[600] flex items-center justify-center p-4" onClick={() => setProofView(null)}>
          <img src={proofView} alt="Payment proof" className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => setProofView(null)} className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-xl text-white"><X size={18} /></button>
        </div>
      )}

      {/* Record Payment Receipt (Phase C) */}
      {receiptOrder && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[600]">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-black uppercase tracking-tight">Record Payment Receipt</span>
              <button onClick={() => setReceiptOrder(null)} className="p-1 hover:bg-white/10 rounded"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{receiptOrder.orderNo || receiptOrder.manualSerial || receiptOrder.id} · {clients.find(c => c.id === receiptOrder.clientId)?.name || 'Customer'}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Amount (PKR) *</label>
                  <input type="number" min={0} value={receiptForm.amount} onChange={e => setReceiptForm(f => ({ ...f, amount: e.target.value }))} className="sap-input w-full text-sm font-black"/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Method *</label>
                  <select value={receiptForm.method} onChange={e => setReceiptForm(f => ({ ...f, method: e.target.value as NipponAdvanceReceipt['method'] }))} className="sap-input w-full text-xs font-bold">
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Online">Online</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Reference (txn / cheque no)</label>
                <input type="text" value={receiptForm.reference} onChange={e => setReceiptForm(f => ({ ...f, reference: e.target.value }))} className="sap-input w-full text-xs" placeholder="e.g. MCB-889912 · cheque 4521"/>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-[10px] font-bold text-blue-800 leading-snug">
                Dr Cash/Bank · Cr Client Advance (21123). Advance delivery pe AR se net ho jayega. GL sirf finance.gl_enabled ON hone par post hoga.
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t flex justify-end gap-2">
              <button onClick={() => setReceiptOrder(null)} className="px-4 py-2 text-xs font-bold text-slate-500 border rounded-lg">Cancel</button>
              <button onClick={submitReceipt} disabled={recordingReceipt} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-50">
                {recordingReceipt ? <Loader2 size={13} className="animate-spin"/> : <CheckCircle2 size={13}/>} Record &amp; Post
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment receipt print (customer's preferred format) */}
      {printReceipt && (
        <NipponReceiptPrint
          receipt={printReceipt.receipt}
          order={printReceipt.order}
          clients={clients}
          printType={clients.find(c => c.id === printReceipt.order.clientId)?.preferredPrintType || nipponPrintType}
          onClose={() => setPrintReceipt(null)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════
           SET SUGGESTION MODAL — appears when set product selected
      ══════════════════════════════════════════════════════════ */}
      {pendingSetSuggestion && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-amber-600 text-white px-7 py-5">
              <h4 className="font-black uppercase tracking-tight text-base">Set Product Detected</h4>
              <p className="text-[10px] text-amber-100 mt-0.5 font-bold uppercase">
                {pendingSetSuggestion.setProduct.description}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 font-medium">This product is part of a set with {pendingSetSuggestion.remainingComponents.length} components:</p>
              <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 border border-slate-200">
                {pendingSetSuggestion.remainingComponents.map((c, ci) => (
                  <div key={ci} className="flex justify-between text-xs">
                    <span className="font-bold text-slate-800 uppercase">{c.description}</span>
                    <span className="text-slate-500 font-medium">{c.qtyPerSet} {c.unit}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <button
                  onClick={() => setPendingSetSuggestion(null)}
                  className="col-span-1 py-2.5 text-xs font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors uppercase"
                >
                  This Item Only
                </button>
                <button
                  onClick={handleAddSetComponents}
                  className="col-span-1 py-2.5 text-xs font-bold text-blue-700 border border-blue-200 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors uppercase"
                >
                  Add Other Items
                </button>
                <button
                  onClick={() => addFullSet(pendingSetSuggestion.index, pendingSetSuggestion.setProduct, products)}
                  className="col-span-1 py-2.5 text-xs font-bold text-white bg-amber-600 rounded-xl hover:bg-amber-700 transition-colors uppercase shadow-md"
                >
                  Add Full Set
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NipponQuotationManager;
