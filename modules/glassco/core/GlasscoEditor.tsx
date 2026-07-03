import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Quotation, Client, Product } from '../../shared/types';
import { formatNumber } from '../../shared/utils/format';
import { ArrowLeft, Building2, ArrowRightLeft, Trash2, Copy, Plus, Layers, Hash, Save, FileText, CheckCircle2, AlertTriangle, Calculator, Circle as CircleIcon, Paperclip, ArrowUp, ArrowDown, X } from 'lucide-react';
import { PrintSummary } from './GlasscoPrintTemplate';
import { WastageCalculator } from './WastageCalculator';
import QuotationWastageTab, { useQuotationWastage } from '@/modules/glassco/core/QuotationWastageTab';
import NotchHoleDrawingTab from '@/modules/glassco/core/NotchHoleDrawingTab';
import AttachmentsTab from '@/modules/glassco/core/AttachmentsTab';
import { useAppStore } from '@/modules/shared/store/appStore';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { toast } from 'sonner';

interface GlasscoEditorProps {
    formData: Partial<Quotation>;
    clients: Client[];
    products: Product[];
    isMM: boolean;
    setIsMM: (val: boolean) => void;
    lastSerial?: number;
    onClose: () => void;
    onUpdateItem: (idx: number, field: string, val: unknown) => void;
    onAddItem: () => void;
    onAddSection: () => void;
    onDuplicateItem: (idx: number) => void;
    onRemoveItem: (idx: number) => void;
    onSave: (action: 'draft' | 'save' | 'approve') => void | Promise<void>;
    onSaveWastageDecision?: (decision: Record<string, unknown>) => void;
}

export const GlasscoEditor: React.FC<GlasscoEditorProps> = ({
    formData, clients, products, isMM, setIsMM, lastSerial = 2427, onClose,
    onUpdateItem, onAddItem, onAddSection, onDuplicateItem, onRemoveItem, onSave, onSaveWastageDecision
}) => {
    const totalAmount = (formData.items || []).reduce((s, i) => s + i.amount, 0);

    // Record-aware editor header (was a static "Order Configurator" for every
    // record — the operator couldn't tell which quote they were editing).
    const editorClientName = clients.find(c => c.id === formData.clientId)?.name;
    const editorTitle = formData.id ? `Editing ${formData.id}` : 'New Quotation';
    const editorStatus = formData.status || 'Draft';

    // Manual SqFt Modal State
    const [manualSqFtModal, setManualSqFtModal] = useState<{ isOpen: boolean, itemIndex: number, currentSqFt: number, sheetSizeLabel: string }>({
        isOpen: false,
        itemIndex: -1,
        currentSqFt: 0,
        sheetSizeLabel: ''
    });
    // P1-20: hold the manual override value in React state. Reading it back via
    // document.querySelector('[autofocus]') returned null in React 19 (autoFocus
    // is not reflected as a DOM attribute), so "Confirm Override" always saved 0.
    const [manualSqFtValue, setManualSqFtValue] = useState<string>('');

    const [activeTab, setActiveTab] = useState<'items' | 'drawing' | 'attachments' | 'wastage'>('items');
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);
    // Sprint 2 — surfaces version_conflict from update_with_version RPC.
    // Modal offers reload (drops local edits) or cancel (lets user copy
    // dirty fields before deciding).
    const [conflictModal, setConflictModal] = useState<{ action: 'draft' | 'save' | 'approve' } | null>(null);
    const tableRef = useRef<HTMLDivElement>(null);
    const gridBodyRef = useRef<HTMLTableSectionElement>(null);
    const [pendingFocusLastRow, setPendingFocusLastRow] = useState(false);

    const handleSaveClick = async (action: 'draft' | 'save' | 'approve') => {
      if (isSaving) return;
      // P2-09: lightweight client-side guard for save/approve (drafts may be
      // incomplete). The hook also validates server-side — this just gives fast
      // feedback and avoids a round-trip on obviously invalid input.
      if (action === 'save' || action === 'approve') {
        const items = formData.items || [];
        const lineItems = items.filter(i => !i.isSection);
        if (!formData.clientId) {
          toast.error('Select a client before saving.', { duration: 5000 });
          return;
        }
        if (lineItems.length === 0) {
          toast.error('Add at least one glass item before saving.', { duration: 5000 });
          return;
        }
        if (lineItems.some(i => (Number(i.qty) || 0) <= 0)) {
          toast.error('Every item must have quantity greater than 0.', { duration: 5000 });
          return;
        }
      }
      setIsSaving(true);
      try {
        await onSave(action);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('version_conflict')) {
          setConflictModal({ action });
        } else {
          // P2-10/P1-05: surface the error instead of re-throwing. This runs
          // from both button clicks and keyboard shortcuts (Ctrl+S/D/Enter);
          // re-throwing in the keyboard path produced a silent unhandled
          // promise rejection with no feedback to the user.
          toast.error('Save failed: ' + msg, { duration: 6000 });
        }
      } finally {
        setIsSaving(false);
      }
    };

    // Auto-scroll to bottom only when rows exceed 7
    useEffect(() => {
      const nonSectionItems = (formData.items || []).filter((i) => !i.isSection);
      if (nonSectionItems.length > 7 && tableRef.current) {
        tableRef.current.scrollTop = tableRef.current.scrollHeight;
      }
    }, [(formData.items || []).length]);

    // Keyboard: Enter in any grid input adds a new glass item and focuses it,
    // so the operator can rapid-enter rows without reaching for the mouse.
    const handleGridKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
      const el = e.target as HTMLElement;
      if (e.key === 'Enter' && el.tagName === 'INPUT') {
        e.preventDefault();
        onAddItem();
        setPendingFocusLastRow(true);
      }
    };
    useEffect(() => {
      if (!pendingFocusLastRow || !gridBodyRef.current) return;
      const rows = gridBodyRef.current.querySelectorAll('tr');
      const firstField = rows[rows.length - 1]?.querySelector('input, select') as HTMLElement | null;
      firstField?.focus();
      setPendingFocusLastRow(false);
    }, [(formData.items || []).length, pendingFocusLastRow]);

    // Focus mode — hide sidebar when editor open
    useEffect(() => {
      document.body.classList.add('erp-focus-mode');
      return () => document.body.classList.remove('erp-focus-mode');
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSaveClick('save'); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); handleSaveClick('draft'); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSaveClick('approve'); }
        if (e.key === 'Escape') { setCtxMenu(null); }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [onSave, isSaving]);

    // Unsaved changes warning
    useEffect(() => {
      const handler = (e: BeforeUnloadEvent) => {
        if (isDirty) { e.preventDefault(); e.returnValue = ''; }
      };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    // Close context menu on outside click
    useEffect(() => {
      const handler = () => setCtxMenu(null);
      window.addEventListener('click', handler);
      return () => window.removeEventListener('click', handler);
    }, []);
    const company = useAppStore(s => s.selectedCompany);
    const { isTriggered: wastageTriggered, usagePct: wastageUsagePct } = useQuotationWastage(formData.items || [], company);

    const notchItemCount = useMemo(() => {
        return (formData.items || []).filter(i => !i.isSection && (i.selectedServices || []).some(s => String(s).toLowerCase() === 'notch')).length;
    }, [formData.items]);
    const attachmentCount = (formData.attachments || []).length;
    const totalNotchCharges = useMemo(() => {
        return (formData.items || []).reduce((s, i) => s + ((i as any).notchCharges || 0), 0);
    }, [formData.items]);
    const totalAptCharges = useMemo(() => {
        return (formData.items || []).reduce((s, i) => s + ((i as any).aptCharges || 0), 0);
    }, [formData.items]);

    const glassMaster = useMemo(() => products.filter(p => p.category === 'Glass'), [products]);
    const categories = ['Plain', 'Color', 'Mirror', 'Fluted'];

    const getSubCategories = (category: string) => {
        if (category === 'Color') return ['One Side', 'Tinted'];
        if (category === 'Mirror') return ['Belgium', 'CFG', 'Euro Grey', 'Brown'];
        return ['Standard'];
    };

    const getThicknesses = (category: string, subCategory: string) => {
        const filtered = glassMaster.filter(p => 
            p.glassType === category && 
            (p.subCategory === subCategory || (subCategory === 'Standard' && !p.subCategory))
        );
        const thicknesses = Array.from(new Set(filtered.map(p => p.thickness).filter(Boolean))) as string[];
        return thicknesses.sort((a, b) => parseInt(a) - parseInt(b));
    };

    const getColors = (category: string, subCategory: string, thickness: string) => {
        const filtered = glassMaster.filter(p => 
            p.glassType === category && 
            (p.subCategory === subCategory || (subCategory === 'Standard' && !p.subCategory)) &&
            p.thickness === thickness
        );
        const colors = Array.from(new Set(filtered.map(p => p.finishColor).filter(Boolean))) as string[];
        return colors.length > 0 ? colors : ['Clear'];
    };

    const serviceNicks = useMemo(() => {
        const dbNicks = products.filter(p => p.category === 'Service' && p.serviceNick).map(p => p.serviceNick!);
        const standards = ['T/G', 'Notch', 'P/E', 'P/F', 'D/G', 'R/D', 'Frosted', 'L/G'];
        return Array.from(new Set([...standards, ...dbNicks]));
    }, [products]);

    const stdInputClass = "sap-input w-full text-center h-7 font-bold text-xs p-0 focus:ring-2 focus:ring-blue-500 rounded border-slate-300 transition-colors";
    
    const isBackdated = useMemo(() => {
        if (!formData.date) return false;
        const today = new Date().toISOString().split('T')[0];
        return formData.date < today;
    }, [formData.date]);

    // Enhanced Update Item to Check for Wastage Logic
    const handleUpdateItemWithLogic = (idx: number, field: string, val: unknown) => {
        onUpdateItem(idx, field, val);
        setIsDirty(true);
        
        // Logic Trigger: Only if modifying Sheet Size or Dimensions
        if (['sheetSize', 'inchW', 'sootW', 'inchH', 'sootH', 'mmW', 'mmH'].includes(field)) {
            const item = { ...formData.items![idx], [field]: val };
            
            let w = item.width;
            let h = item.height;
            
            if (field === 'inchW' || field === 'sootW') w = (Number(item.inchW)||0) + ((Number(item.sootW)||0)/8);
            if (field === 'inchH' || field === 'sootH') h = (Number(item.inchH)||0) + ((Number(item.sootH)||0)/8);
            if (field === 'mmW') w = (Number(item.mmW)||0) / 25.4;
            if (field === 'mmH') h = (Number(item.mmH)||0) / 25.4;

            const sheet = item.sheetSize || '144x96';
            
            // CRITICAL WASTAGE LOGIC (Applied to both 12x84 and 12x96)
            if (sheet === '144x84' || sheet === '144x96') {
                const widthInCritical = w >= 55 && w <= 60;
                const heightInCritical = h >= 115 && h <= 120;
                
                if ((widthInCritical || heightInCritical) && !item.isManualSqFt) {
                    const label = sheet === '144x84' ? '7x12 FT (84")' : '8x12 FT (96")';
                    // Trigger Modal
                    setTimeout(() => {
                        setManualSqFtValue(String(item.totalSqFt || 0));  // P1-20: prefill override
                        setManualSqFtModal({
                            isOpen: true,
                            itemIndex: idx,
                            currentSqFt: item.totalSqFt || 0,
                            sheetSizeLabel: label
                        });
                    }, 600); // Slight delay to allow typing to finish
                }
            }
        }
    };

    const handleSaveManualSqFt = (newSqFt: number) => {
        if (manualSqFtModal.itemIndex > -1) {
            onUpdateItem(manualSqFtModal.itemIndex, 'totalSqFt', newSqFt); 
            onUpdateItem(manualSqFtModal.itemIndex, 'isManualSqFt', true); 
            
            const item = formData.items![manualSqFtModal.itemIndex];
            const amount = Math.round(newSqFt * (item.pricePerUnit || 0));
            onUpdateItem(manualSqFtModal.itemIndex, 'amount', amount);
        }
        setManualSqFtValue('');
        setManualSqFtModal({ isOpen: false, itemIndex: -1, currentSqFt: 0, sheetSizeLabel: '' });
    };

    // P2-07: replaced inline positioning/sizing with Tailwind utilities
    return (
        <div className="bg-white w-full flex flex-col no-print fixed inset-0 h-screen z-top">
            {/* ── Fixed Action Bar — always visible ── */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-700 min-h-[52px]">
                {/* Left: Back + Title */}
                <div className="flex items-center gap-3">
                    <button
                      onClick={async () => {
                        if (!isDirty) { onClose(); return; }
                        if (!await confirmModal('Unsaved changes hain — wapas jayen?')) return;
                        onClose();
                      }}
                      className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest px-2 py-1.5 rounded-lg hover:bg-slate-800"
                    >
                      <ArrowLeft size={15}/> Back
                    </button>
                    <div className="h-4 w-px bg-slate-700" />
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center shrink-0"><Building2 size={13} className="text-white"/></div>
                      <div className="flex flex-col leading-tight">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold text-sm">{editorTitle}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600">{editorStatus}</span>
                          {isDirty && <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold">UNSAVED</span>}
                        </div>
                        {(editorClientName || formData.projectName) && (
                          <span className="text-[11px] text-slate-400 font-medium truncate max-w-[360px]">
                            {[editorClientName, formData.projectName].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                </div>

                {/* Right: All action buttons always visible */}
                <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsMM(!isMM)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase border transition-all flex items-center gap-1.5 ${isMM ? 'bg-primary text-white border-blue-600' : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'}`}
                    >
                      <ArrowRightLeft size={12}/>{isMM ? 'MM Mode' : 'Inch Mode'}
                    </button>

                    <div className="h-4 w-px bg-slate-700" />

                    <button
                      onClick={() => handleSaveClick('draft')}
                      disabled={isSaving}
                      title="Ctrl+D"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save size={13}/> {isSaving ? 'Saving…' : 'Draft'}
                      <span className="text-[9px] text-slate-500 font-normal hidden lg:block">Ctrl+D</span>
                    </button>

                    <button
                      onClick={() => handleSaveClick('save')}
                      disabled={isSaving}
                      title="Ctrl+S"
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FileText size={13}/> {isSaving ? 'Saving…' : 'Save Quotation'}
                      <span className="text-[9px] text-amber-200 font-normal hidden lg:block">Ctrl+S</span>
                    </button>

                    <button
                      onClick={() => handleSaveClick('approve')}
                      disabled={isSaving}
                      title="Ctrl+Enter"
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle2 size={13}/> {isSaving ? 'Saving…' : 'Approve & Order'}
                      <span className="text-[9px] text-emerald-200 font-normal hidden lg:block">Ctrl+↵</span>
                    </button>

                    <button
                      onClick={async () => {
                        if (!isDirty) { onClose(); return; }
                        if (!await confirmModal('Unsaved changes hain — discard karen?')) return;
                        onClose();
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-all"
                    >
                      <X size={14} /> Close
                    </button>
                </div>
            </div>
            
            {/* Replacement Order Info Bar */}
            {formData.orderType === 'Replacement' && (
              <div className="shrink-0 bg-orange-50 border-b border-orange-200 px-6 py-2.5 flex items-center gap-4">
                <span className="px-2.5 py-1 bg-orange-500 text-white text-[9px] font-black uppercase rounded tracking-wider">Replacement</span>
                {formData.originalOrderRef && (
                  <span className="text-xs font-bold text-orange-800">Original: <span className="font-black text-orange-900">{formData.originalOrderRef}</span></span>
                )}
                {formData.replacementReason && (
                  <span className="text-xs font-bold text-orange-700">Reason: {formData.replacementReason}</span>
                )}
                {formData.costBearer && (
                  <span className={`text-xs font-black px-2 py-0.5 rounded ${formData.costBearer === 'Customer' ? 'bg-blue-100 text-primary-hover' : 'bg-rose-100 text-rose-700'}`}>
                    Cost: {formData.costBearer}
                  </span>
                )}
              </div>
            )}

            <div className="flex-1 overflow-hidden p-6 bg-slate-50 flex flex-col">
                <div className="flex space-x-1 mb-4 no-print">
                    <button
                        onClick={() => setActiveTab('items')}
                        className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'items' ? 'bg-primary text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        <Hash size={14}/> Line Items
                    </button>
                    <button
                        onClick={() => setActiveTab('drawing')}
                        className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 relative ${activeTab === 'drawing' ? 'bg-primary text-white shadow-lg' : notchItemCount > 0 ? 'bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        <CircleIcon size={14}/> Notch / Hole Drawing
                        {notchItemCount > 0 && activeTab !== 'drawing' && (
                            <span className="ml-1 px-1.5 py-0.5 bg-rose-500 text-white text-[8px] font-black rounded-full">{notchItemCount}</span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('attachments')}
                        className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 relative ${activeTab === 'attachments' ? 'bg-primary text-white shadow-lg' : attachmentCount > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        <Paperclip size={14}/> Attachments
                        {attachmentCount > 0 && activeTab !== 'attachments' && (
                            <span className="ml-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[8px] font-black rounded-full">{attachmentCount}</span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('wastage')}
                        className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 relative ${activeTab === 'wastage' ? 'bg-primary text-white shadow-lg' : wastageTriggered ? 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        <Calculator size={14}/>
                        Wastage Analysis
                        {wastageTriggered && activeTab !== 'wastage' && (
                            <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-white text-[8px] font-black rounded-full">{wastageUsagePct.toFixed(0)}%</span>
                        )}
                    </button>
                </div>

                {activeTab === 'items' ? (
                    <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 grid grid-cols-8 gap-3 shrink-0 shadow-sm items-end">
                    <div className="space-y-1 col-span-2">
                        <label className="text-xs font-bold uppercase text-slate-400 tracking-widest ml-1">Client Selection</label>
                        <select className="sap-input w-full font-bold text-sm h-10 border-slate-300 min-w-[220px]" value={formData.clientId} onChange={e => handleUpdateItemWithLogic(-1, 'clientId', e.target.value)}>
                            <option value="">-- Search Customer --</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1 col-span-1">
                        <label className="text-xs font-bold uppercase text-primary tracking-widest ml-1">Project Ref</label>
                        <input type="text" className="sap-input w-full font-bold uppercase h-10 border-blue-100" value={formData.projectName} onChange={e => handleUpdateItemWithLogic(-1, 'projectName', e.target.value)} placeholder="e.g. MAIN" />
                    </div>
                    <div className="space-y-1 col-span-1">
                        <label className="text-xs font-bold uppercase text-slate-400 tracking-widest ml-1 flex items-center gap-1.5">
                          Order Date
                          {/* P2-12: surface the previously-unused isBackdated memo */}
                          {isBackdated && <span className="text-[8px] bg-amber-500 text-white px-1 py-0.5 rounded font-black tracking-wider">BACKDATED</span>}
                        </label>
                        <input type="date" className="sap-input w-full font-bold h-10 border-slate-300" value={formData.date} onChange={e => handleUpdateItemWithLogic(-1, 'date', e.target.value)} />
                    </div>
                    <div className="space-y-1 col-span-1 opacity-100 relative group">
                        <label className="text-xs font-bold uppercase text-primary tracking-widest ml-1">Reference ID</label>
                        <div className="sap-input w-full font-bold h-10 border-primary-border bg-primary-subtle flex items-center justify-center text-primary-hover text-xs">
                            {formData.id || 'NEW ORDER'}
                        </div>
                    </div>
                    <div className="space-y-1 col-span-1">
                        <label className="text-xs font-bold uppercase text-primary tracking-widest ml-1">Discount (PKR)</label>
                        <input type="number" className="sap-input w-full font-bold h-10 border-blue-100" value={formData.discountAmount || ''} onChange={e => handleUpdateItemWithLogic(-1, 'discountAmount', Number(e.target.value))} />
                    </div>
                    <div className="space-y-1 col-span-1">
                        <label className="text-xs font-bold uppercase text-rose-600 tracking-widest ml-1">Validity Due</label>
                        <input type="date" className="sap-input w-full font-bold h-10 text-rose-600 border-rose-100" value={formData.dueDate} onChange={e => handleUpdateItemWithLogic(-1, 'dueDate', e.target.value)} />
                    </div>
                    <div className="col-span-1">
                        <PrintSummary items={formData.items || []} />
                    </div>
                </div>

                <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    {/* P2-11: overflow-auto already covers vertical scroll; the table
                        min-width makes columns hold their size and scroll horizontally
                        on narrow screens instead of squishing. */}
                    <div className="flex-1 overflow-auto min-h-0" ref={tableRef}>
                        <table className="w-full text-left border-collapse min-w-[1100px]">
                            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                                <tr className="text-xs uppercase font-bold text-slate-400 tracking-widest">
                                    <th className="w-10 text-center py-2 bg-slate-50">#</th>
                                    <th className="w-[380px] py-2 bg-slate-50 pl-2">Glass Specification & Sheet Size</th>
                                    <th className="w-[110px] py-2 bg-slate-50 pl-2">Services</th>
                                    {isMM ? (
                                        <>
                                            <th className="w-24 text-center py-4 bg-slate-50">Width (mm)</th>
                                            <th className="w-24 text-center py-4 bg-slate-50">Height (mm)</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="w-36 text-center py-4 bg-slate-50">Width (In.St)</th>
                                            <th className="w-36 text-center py-4 bg-slate-50">Height (In.St)</th>
                                        </>
                                    )}
                                    <th className="w-20 text-center py-4 bg-slate-50">Qty</th>
                                    <th className="w-20 text-center py-4 bg-slate-50">Sq.Ft</th>
                                    <th className="w-28 text-right py-4 bg-slate-50 pr-4">Rate</th>
                                    <th className="w-32 text-right py-4 bg-slate-50 pr-6">Total</th>
                                    <th className="w-16 text-center py-4 bg-slate-50"></th>
                                </tr>
                            </thead>
                            <tbody ref={gridBodyRef} onKeyDown={handleGridKeyDown} className="divide-y divide-slate-100">
                                {(() => {
                                    let sNo = 0;
                                    return formData.items?.map((item, idx) => {
                                        if (!item.isSection) sNo++;
                                        const curCat = item.glassType || 'Plain';
                                        const curSub = item.subCategory || 'Standard';
                                        const curThick = item.glassSize || '5mm';
                                        const isNonTemperable = curCat === 'Mirror' || (curCat === 'Color' && curSub === 'One Side');

                                        return (
                                            <tr
                                              key={idx}
                                              className={`group transition-all ${item.isSection ? 'bg-slate-50' : 'hover:bg-blue-50/20'}`}
                                              onContextMenu={(e) => {
                                                if (!item.isSection) {
                                                  e.preventDefault();
                                                  // P2-08: clamp to viewport so the 192px-wide / ~200px-tall
                                                  // menu never overflows the window edge.
                                                  const MENU_W = 192;
                                                  const MENU_H = 200;
                                                  const x = Math.min(e.clientX, window.innerWidth - MENU_W);
                                                  const y = Math.min(e.clientY, window.innerHeight - MENU_H);
                                                  setCtxMenu({ x: Math.max(0, x), y: Math.max(0, y), idx });
                                                }
                                              }}
                                            >
                                                <td className="text-center font-bold text-slate-300 align-middle py-1">{item.isSection ? '' : sNo}</td>
                                                <td className="align-middle py-2 px-2">
                                                    {item.isSection ? (
                                                        <input type="text" className="w-full bg-transparent font-bold uppercase text-primary-hover outline-none h-10 text-xs tracking-widest border-b-2 border-blue-100 focus:border-blue-500 placeholder-blue-100" value={item.description} onChange={e => handleUpdateItemWithLogic(idx, 'description', e.target.value)} placeholder="SECTION HEADING (e.g. FRONT VIEW)..." />
                                                    ) : (
                                                        <div className="flex flex-col gap-1.5 py-1">
                                                            <input type="text" className="w-full font-bold uppercase text-xs h-7 border-none bg-transparent outline-none rounded placeholder-slate-300" value={item.description} onChange={e => handleUpdateItemWithLogic(idx, 'description', e.target.value)} placeholder="Item Detail..."/>
                                                            <div className="flex gap-1 items-center">
                                                                <select value={curCat} onChange={e => handleUpdateItemWithLogic(idx, 'glassType', e.target.value)} className="h-7 text-xs font-bold border border-slate-200 rounded-lg bg-primary-subtle px-1.5 outline-none w-24 uppercase">{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                                                <select value={curSub} onChange={e => handleUpdateItemWithLogic(idx, 'subCategory', e.target.value)} className="h-7 text-xs font-bold border border-slate-200 rounded-lg bg-white px-1.5 outline-none w-28 uppercase">{getSubCategories(curCat).map(s => <option key={s} value={s}>{s}</option>)}</select>
                                                                <select value={curThick} onChange={e => handleUpdateItemWithLogic(idx, 'glassSize', e.target.value)} className="h-7 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50 px-1.5 outline-none w-20 uppercase">{getThicknesses(curCat, curSub).map(t => <option key={t} value={t}>{t}</option>)}</select>
                                                                <select value={item.glassColor || 'Clear'} onChange={e => handleUpdateItemWithLogic(idx, 'glassColor', e.target.value)} className="h-7 text-xs font-bold border border-slate-200 rounded-lg bg-slate-100 px-1.5 outline-none w-24 uppercase">
                                                                    {getColors(curCat, curSub, curThick).map(c => <option key={c} value={c}>{c}</option>)}
                                                                </select>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="align-middle py-1 px-2">
                                                    {!item.isSection && (
                                                        // P2-07: width:90px -> Tailwind w-[90px]
                                                        <div className="w-[90px]">
                                                            <div className="grid grid-cols-3 gap-px">
                                                            {serviceNicks.map(nick => {
                                                                const isTGDisabled = nick === 'T/G' && isNonTemperable;
                                                                return (
                                                                    <button key={nick} disabled={isTGDisabled} onClick={() => { const current = item.selectedServices || []; const next = current.includes(nick) ? current.filter(s => s !== nick) : [...current, nick]; handleUpdateItemWithLogic(idx, 'selectedServices', next); }} className={`h-5 rounded-sm text-[7px] font-black leading-none transition-all ${isTGDisabled ? 'bg-slate-100 text-slate-300 opacity-50' : item.selectedServices?.includes(nick) ? 'bg-primary text-white' : 'bg-slate-50 text-slate-400 hover:bg-primary-subtle'}`}>{nick}</button>
                                                                );
                                                            })}
                                                            </div>
                                                            {/* SERVICE ONLY — client-supplied glass: services-only rate, no glass rate, no inventory consume */}
                                                            <button
                                                                onClick={() => handleUpdateItemWithLogic(idx, 'serviceOnly', !item.serviceOnly)}
                                                                title="Service Only — client brings their own glass. Charges services only (no glass rate); pieces still generate & track, but no glass is consumed from inventory."
                                                                className={`mt-0.5 w-full h-5 rounded-sm text-[7px] font-black leading-none uppercase transition-all ${item.serviceOnly ? 'bg-amber-500 text-white' : 'bg-slate-50 text-slate-400 hover:bg-amber-100'}`}
                                                            >{item.serviceOnly ? '✓ SVC ONLY' : 'SVC ONLY'}</button>
                                                        </div>
                                                    )}
                                                </td>
                                                {isMM ? (
                                                    <><td className="align-middle px-1"><input type="number" className={stdInputClass} value={item.mmW || ''} onChange={e => handleUpdateItemWithLogic(idx, 'mmW', e.target.value)}/></td><td className="align-middle px-1"><input type="number" className={stdInputClass} value={item.mmH || ''} onChange={e => handleUpdateItemWithLogic(idx, 'mmH', e.target.value)}/></td></>
                                                ) : (
                                                    <>
                                                        <td className="align-middle px-1">
                                                            <div className="flex justify-center gap-0.5 items-center">
                                                                <input type="number" className={`${stdInputClass} w-16 border-slate-200`} value={item.inchW} onChange={e => handleUpdateItemWithLogic(idx, 'inchW', e.target.value)}/>
                                                                <span className="font-bold text-slate-400">.</span>
                                                                <input type="number" className={`${stdInputClass} w-10 text-slate-400 bg-slate-50`} value={item.sootW} onChange={e => handleUpdateItemWithLogic(idx, 'sootW', e.target.value)} placeholder="0" max="7"/>
                                                            </div>
                                                        </td>
                                                        <td className="align-middle px-1">
                                                            <div className="flex justify-center gap-0.5 items-center">
                                                                <input type="number" className={`${stdInputClass} w-16 border-slate-200`} value={item.inchH} onChange={e => handleUpdateItemWithLogic(idx, 'inchH', e.target.value)}/>
                                                                <span className="font-bold text-slate-400">.</span>
                                                                <input type="number" className={`${stdInputClass} w-10 text-slate-400 bg-slate-50`} value={item.sootH} onChange={e => handleUpdateItemWithLogic(idx, 'sootH', e.target.value)} placeholder="0" max="7"/>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                                <td className="align-middle px-1">
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <input type="number" className={`${stdInputClass} w-16 bg-amber-50 border-amber-200 text-amber-900`} value={item.qty} onChange={e => handleUpdateItemWithLogic(idx, 'qty', e.target.value)}/>
                                                        {item.selectedServices?.some(s => s === 'D/G' || s === 'Double Glaze' || s === 'Double Glazing') && !item.isSection && (
                                                            <span className="text-[8px] font-black uppercase text-indigo-600 bg-indigo-50 border border-indigo-200 px-1 rounded">SET (2 pcs)</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="text-center font-bold text-slate-500 align-middle text-xs relative group/sqft">
                                                    {item.isSection ? '' : item.totalSqFt}
                                                    {item.isManualSqFt && <span className="absolute -top-1 -right-1 text-xs text-white bg-rose-600 px-1 rounded-full">M</span>}
                                                </td>
                                                <td className="text-right align-middle px-2">
                                                    <input type="number" className={`${stdInputClass} text-right text-primary-hover bg-primary-subtle border-primary-border pr-2`} value={item.pricePerUnit} onChange={e => handleUpdateItemWithLogic(idx, 'pricePerUnit', e.target.value)}/>
                                                </td>
                                                <td className="text-right font-bold align-middle px-3 text-sm text-slate-900">{item.isSection ? '' : formatNumber(item.amount)}</td>
                                                <td className="text-center align-middle px-1">
                                                    <div className="flex items-center space-x-1 justify-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                                        <button onClick={() => onDuplicateItem(idx)} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-subtle rounded transition-all" title="Duplicate" aria-label="Duplicate row"><Copy size={14}/></button>
                                                        <button onClick={() => onRemoveItem(idx)} className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-all" title="Delete" aria-label="Delete row"><Trash2 size={14}/></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="flex space-x-3 shrink-0">
                    <button onClick={onAddItem} className="px-6 py-2.5 bg-white border border-slate-300 rounded-xl shadow-sm text-xs font-bold uppercase text-primary hover:bg-primary-subtle transition-all flex items-center gap-2" aria-label="Add"><Plus size={16}/> Add Glass Item</button>
                    <button onClick={onAddSection} className="px-6 py-2.5 bg-white border border-slate-300 rounded-xl shadow-sm text-xs font-bold uppercase text-slate-600 hover:bg-slate-100 transition-all flex items-center gap-2"><Layers size={16}/> Insert Heading</button>
                </div>
            </div>
            ) : activeTab === 'drawing' ? (
                <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <NotchHoleDrawingTab
                        items={formData.items || []}
                        products={products}
                        onUpdateItem={(idx, field, val) => { onUpdateItem(idx, field, val); setIsDirty(true); }}
                    />
                </div>
            ) : activeTab === 'attachments' ? (
                <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <AttachmentsTab
                        attachments={formData.attachments || []}
                        onUpdate={(atts) => { onUpdateItem(-1, 'attachments', atts); setIsDirty(true); }}
                    />
                </div>
            ) : (
                <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <QuotationWastageTab items={formData.items || []} onSaveDecision={onSaveWastageDecision} />
                </div>
            )}
        </div>
            
            <div className="px-10 py-5 bg-slate-900 text-white flex justify-between items-center shrink-0 border-t-4 border-blue-600">
               <div className="flex flex-col md:flex-row md:space-x-10 items-center">
                   <div>
                       {/* P1-21: show glass-only subtotal. item.amount already bakes in
                           notchCharges, so displaying totalAmount here AND a separate
                           "+ Notch Charges" line below double-counted notch visually and
                           disagreed with the print (which shows glass subtotal + notch line
                           separately). Net Contract Value below is unchanged and correct. */}
                       <p className="text-xs font-bold uppercase text-slate-400 tracking-[0.2em]">Glass Subtotal</p>
                       <p className="text-3xl font-bold tracking-tight">PKR {formatNumber(totalAmount - totalNotchCharges)}</p>
                   </div>
                   {totalNotchCharges > 0 && (
                     <div>
                         <p className="text-xs font-bold uppercase text-rose-400 tracking-[0.2em]">Notch Charges</p>
                         <p className="text-xl font-bold text-rose-400">+ PKR {formatNumber(totalNotchCharges)}</p>
                     </div>
                   )}
                   {totalAptCharges > 0 && (
                     <div>
                         <p className="text-xs font-bold uppercase text-purple-400 tracking-[0.2em]">APT Charges</p>
                         <p className="text-xl font-bold text-purple-400">+ PKR {formatNumber(totalAptCharges)}</p>
                     </div>
                   )}
                   <div className="h-10 w-px bg-slate-700 hidden md:block"></div>
                   <div>
                       <p className="text-xs font-bold uppercase text-blue-400 tracking-[0.2em]">Net Contract Value</p>
                       <p className="text-2xl font-bold text-blue-400">PKR {formatNumber(totalAmount + totalAptCharges - (formData.discountAmount || 0))}</p>
                   </div>
                   <div className="h-10 w-px bg-slate-700 hidden md:block"></div>
                   <div>
                       <p className="text-xs font-bold uppercase text-blue-400 tracking-[0.2em]">Advance Required</p>
                       <p className="text-2xl font-bold text-blue-400">PKR {formatNumber(Math.round((totalAmount + totalAptCharges - (formData.discountAmount || 0)) * 0.5))}</p>
                   </div>
               </div>
               <button onClick={onAddItem} className="px-6 py-2 text-blue-400 font-bold uppercase text-xs tracking-widest hover:text-white transition-colors flex items-center gap-1"><Plus size={14}/> Add Row</button>
            </div>

            {/* RIGHT-CLICK CONTEXT MENU */}
            {ctxMenu && (
              <div
                className="fixed z-popover bg-white border border-slate-200 rounded-xl shadow-2xl py-1 w-48"
                style={{ left: ctxMenu.x, top: ctxMenu.y }}
                onClick={e => e.stopPropagation()}
              >
                {[
                  { label: 'Duplicate Row', icon: Copy,      danger: false, action: () => { onDuplicateItem(ctxMenu.idx); setCtxMenu(null); } },
                  { label: 'Move Up',       icon: ArrowUp,    danger: false, action: () => { if (ctxMenu.idx > 0) { const items = [...(formData.items||[])]; [items[ctxMenu.idx-1], items[ctxMenu.idx]] = [items[ctxMenu.idx], items[ctxMenu.idx-1]]; items.forEach((item,i) => onUpdateItem(i, '__reorder__', item)); } setCtxMenu(null); } },
                  { label: 'Move Down',     icon: ArrowDown,  danger: false, action: () => { const items = formData.items||[]; if (ctxMenu.idx < items.length-1) { const arr = [...items]; [arr[ctxMenu.idx], arr[ctxMenu.idx+1]] = [arr[ctxMenu.idx+1], arr[ctxMenu.idx]]; arr.forEach((item,i) => onUpdateItem(i, '__reorder__', item)); } setCtxMenu(null); } },
                  { label: '─',             icon: null,       danger: false, action: null },
                  { label: 'Delete Row',    icon: Trash2,     danger: true,  action: () => { onRemoveItem(ctxMenu.idx); setCtxMenu(null); } },
                ].map((item, i) => item.action === null ? (
                  <div key={i} className="h-px bg-slate-100 my-1" />
                ) : (
                  <button key={i} onClick={item.action}
                    className={`w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-2 transition-colors ${item.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-primary-subtle hover:text-primary-hover'}`}>
                    {item.icon && <item.icon size={14} />}
                    {item.label}
                  </button>
                ))}
              </div>
            )}

            {/* MANUAL SQFT MODAL */}
            {manualSqFtModal.isOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-modal animate-in zoom-in duration-200" role="dialog" aria-modal="true" aria-labelledby="manual-sqft-title">
                    <div className="bg-white rounded-3xl p-8 w-96 shadow-2xl border-2 border-amber-400">
                        <div className="flex items-center space-x-3 mb-4 text-amber-600">
                            <AlertTriangle size={32}/>
                            {/* P3-08: id referenced by aria-labelledby on the dialog */}
                            <h3 id="manual-sqft-title" className="text-lg font-bold uppercase">Wastage Alert</h3>
                        </div>
                        <p className="text-xs font-bold text-slate-600 mb-4 leading-relaxed">
                            The dimensions for this item (using {manualSqFtModal.sheetSizeLabel} Sheet) fall into a high-wastage zone (55-60" width or 115-120" height).
                        </p>
                        <p className="text-xs text-slate-500 mb-6">
                            Please manually define the <strong>Billing Sq.Ft</strong> for this piece to cover the wastage cost.
                        </p>
                        <div className="space-y-2 mb-6">
                            <label className="text-xs font-bold uppercase text-slate-400">Standard Calculated Sq.Ft</label>
                            <input type="number" disabled value={manualSqFtModal.currentSqFt} className="w-full p-3 bg-slate-100 border rounded-xl font-bold text-slate-500" />
                            
                            <label className="text-xs font-bold uppercase text-primary mt-2 block">Manual Billed Sq.Ft</label>
                            <div className="relative">
                                <Calculator className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" size={16}/>
                                <input
                                    type="number"
                                    className="w-full pl-10 p-3 bg-primary-subtle border-2 border-primary-border rounded-xl font-bold text-lg text-primary-hover focus:outline-none focus:border-blue-500"
                                    autoFocus
                                    value={manualSqFtValue}
                                    onChange={(e) => setManualSqFtValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveManualSqFt(Number(manualSqFtValue || 0));
                                    }}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => { setManualSqFtValue(''); setManualSqFtModal({...manualSqFtModal, isOpen: false, itemIndex: -1, currentSqFt: 0, sheetSizeLabel: ''}); }} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600">Cancel</button>
                            <button
                                onClick={() => handleSaveManualSqFt(Number(manualSqFtValue || 0))}
                                className="bg-amber-500 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase shadow-lg hover:bg-amber-600"
                            >
                                Confirm Override
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sprint 2 — version-conflict reload prompt */}
            {conflictModal && (
                <div className="fixed inset-0 bg-slate-900/70 z-popover flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="px-6 py-4 bg-red-600 text-white rounded-t-2xl flex items-center gap-2">
                            <span className="font-black uppercase text-sm">Edit Conflict</span>
                        </div>
                        <div className="p-5 space-y-3">
                            <p className="text-xs text-slate-700 font-bold">
                                Someone else edited this record while you were working on it.
                                Your changes were NOT saved.
                            </p>
                            <p className="text-[11px] text-slate-500">
                                Reload to see the latest version. Copy any unsaved fields
                                before reloading — your local edits will be discarded.
                            </p>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                            <button
                                onClick={() => setConflictModal(null)}
                                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-white"
                            >
                                Keep Editing
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-6 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase hover:bg-red-700"
                            >
                                Reload Now
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
