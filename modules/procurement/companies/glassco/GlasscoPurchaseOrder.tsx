/**
 * GlasscoPurchaseOrder.tsx
 * Glass-only PO with smart item search, 5-line default, A4 print
 *
 * SEARCH LOGIC:
 *   One search box per line. User types anything — thickness (5mm), size (84x144),
 *   category (plain, mirror), or partial description (e.g. "plain 5" or "84 mirror").
 *   Suggestions come from:
 *     1. Product Master (glass products for this company)
 *     2. Stock Ledger GRN history (materials received before)
 *   Picking a suggestion auto-fills: category, subCategory, thickness, sheetSize, ratePKR (MAP)
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { PurchaseOrder } from '@/modules/procurement/types/inventory';
import { Vendor } from '@/modules/sales/types/crm';
import { formatNumber, formatPKR, formatDate } from '@/modules/shared/utils/format';
import { sqftOf } from '@/modules/shared/utils/glass';
import { toast } from 'sonner';
import {
  Plus, Trash2, X, FileText, Send, ChevronDown, ChevronRight,
  Search, Printer, Building2, Package, Clock
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface POLineItem {
  id: string;
  searchQuery: string;
  showSuggestions: boolean;
  productId: string;
  description: string;
  category: string;
  subCategory: string;
  thickness: string;
  sheetSize: string;
  sheetCount: number;
  sqftPerSheet: number;
  totalSqft: number;
  ratePKR: number;
  freightPKR: number;
  lineTotal: number;
  stockOnHand: number;
  lastMAP: number;
  remarks: string;
}

interface SuggestionItem {
  key: string;
  label: string;
  category: string;
  subCategory: string;
  thickness: string;
  sheetSize: string;
  productId: string;
  lastMAP: number;
  stockOnHand: number;
  source: 'master' | 'stock';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcLine(l: POLineItem): POLineItem {
  const spf       = sqftOf(l.sheetSize) || l.sqftPerSheet || 0;
  const totalSqft = Number((l.sheetCount * spf).toFixed(2));
  const lineTotal = Number((totalSqft * l.ratePKR + (l.freightPKR || 0)).toFixed(2));
  return { ...l, sqftPerSheet: spf, totalSqft, lineTotal };
}

function blankLine(): POLineItem {
  return {
    id: `L${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    searchQuery: '', showSuggestions: false,
    productId: '', description: '',
    category: '', subCategory: '', thickness: '', sheetSize: '',
    sheetCount: 0, sqftPerSheet: 0, totalSqft: 0,
    ratePKR: 0, freightPKR: 0, lineTotal: 0,
    stockOnHand: 0, lastMAP: 0, remarks: '',
  };
}

function generatePOId(existing: PurchaseOrder[], forDate?: string): string {
  // Use the PO's own date (not today) so backdated POs get correct MMYY in ID
  const d      = forDate ? new Date(forDate) : new Date();
  const prefix = `PO-GLS-${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}-`;
  const nums   = existing
    .filter(p => p.id?.startsWith(prefix))
    .map(p => parseInt(p.id.replace(prefix, '')) || 0);
  return `${prefix}${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, '0')}`;
}

const STATUS_CLS: Record<string, string> = {
  Draft:             'bg-slate-100 text-slate-600',
  Sent:              'bg-blue-100 text-blue-700',
  'GRN Pending':     'bg-amber-100 text-amber-700',
  'GRN Done':        'bg-emerald-100 text-emerald-700',
  'Invoice Pending': 'bg-purple-100 text-purple-700',
  Paid:              'bg-green-100 text-green-700',
  'On Hold':         'bg-red-100 text-red-700',
};

// ── A4 Print Component ────────────────────────────────────────────────────────

const POPrint: React.FC<{ po: PurchaseOrder; onClose: () => void }> = ({ po, onClose }) => {
  const poMeta  = po as any;
  const items   = po.items.map(i => {
    let meta: any = {};
    try { meta = JSON.parse(i.specs || '{}'); } catch {}
    return { ...i, meta };
  });

  return (
    <div className="fixed inset-0 bg-slate-900/80 flex items-start justify-center z-popover overflow-y-auto py-6 px-4">
      <div className="bg-white w-[794px] shadow-2xl rounded-xl overflow-hidden">

        {/* Toolbar — hidden on print */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-900 text-white no-print">
          <span className="text-sm font-black uppercase tracking-wide">Print Preview — {po.id}</span>
          <div className="flex gap-3">
            <button onClick={() => window.print()}
              className="flex items-center gap-2 bg-blue-600 px-4 py-1.5 rounded-lg text-xs font-black uppercase hover:bg-blue-700">
              <Printer size={14}/> Print
            </button>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
              <X size={16}/>
            </button>
          </div>
        </div>

        {/* A4 Body */}
        <div className="p-10 text-black" style={{ fontFamily: 'Arial, sans-serif', minHeight: '257mm' }}>

          {/* Letterhead */}
          <div className="flex justify-between items-start pb-5 mb-6"
            style={{ borderBottom: '3px solid #0f172a' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, textTransform: 'uppercase', color: '#0f172a' }}>
                GlassTech Group
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginTop: 2 }}>
                GlassCo Pvt. Ltd. — Karachi, Pakistan
              </div>
              <div style={{ marginTop: 10, display: 'inline-block', background: '#1d4ed8', color: '#fff', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', padding: '3px 12px', borderRadius: 4 }}>
                Purchase Order
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'monospace', color: '#0f172a' }}>{po.id}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, fontWeight: 700 }}>Date: {formatDate(po.date)}</div>
              {poMeta.deliveryDate && (
                <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginTop: 2 }}>
                  Delivery By: {formatDate(poMeta.deliveryDate)}
                </div>
              )}
            </div>
          </div>

          {/* Vendor + Terms box */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
                Vendor / Supplier
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase' }}>{po.toVendor}</div>
              {poMeta.transportVendor && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: 700 }}>
                  Transport: {poMeta.transportVendor}
                </div>
              )}
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
                Order Details
              </div>
              <div style={{ fontSize: 11, fontWeight: 700 }}>
                Payment: {poMeta.payTerms || '—'}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3 }}>
                Total Sheets: {poMeta.totalSheets || '—'} &nbsp;|&nbsp;
                Total SqFt: {poMeta.totalSqft?.toFixed(1) || '—'}
              </div>
              {poMeta.headerRemarks && (
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>
                  {poMeta.headerRemarks}
                </div>
              )}
            </div>
          </div>

          {/* Items table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#fff' }}>
                {['#','Description','Thick','Size','Sheets','SqFt','Rate/SqFt','Freight','Line Total'].map((h, i) => (
                  <th key={h} style={{
                    padding: '7px 8px', fontWeight: 900, textTransform: 'uppercase',
                    fontSize: 9, letterSpacing: '0.05em',
                    textAlign: ['Sheets','SqFt','Rate/SqFt','Freight','Line Total'].includes(h) ? 'right' : 'left',
                    width: i === 0 ? 24 : undefined
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '0.5px solid #e2e8f0' }}>
                  <td style={{ padding: '7px 8px', color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 900, textTransform: 'uppercase' }}>
                    {item.description}
                    {item.meta.remarks && (
                      <div style={{ fontSize: 9, color: '#64748b', fontWeight: 400, fontStyle: 'italic', marginTop: 1 }}>
                        {item.meta.remarks}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '7px 8px', fontWeight: 700, textAlign: 'center' }}>{item.meta.thickness || '—'}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 700, textAlign: 'center' }}>
                    {item.meta.sheetSize ? `${item.meta.sheetSize}"` : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', fontWeight: 900, textAlign: 'right' }}>{item.meta.sheetCount || '—'}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{Number(item.qty || 0).toFixed(1)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>
                    {formatPKR(item.rate || 0)}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#1d4ed8' }}>
                    {formatPKR(item.meta.freightPKR || 0)}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 900, color: '#059669' }}>
                    {formatPKR(Math.round(item.meta.lineTotal || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc' }}>
                <td colSpan={8} style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 900, textTransform: 'uppercase', fontSize: 11, color: '#475569' }}>
                  Grand Total
                </td>
                <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 900, fontSize: 14, color: '#059669' }}>
                  {formatPKR(Math.round(po.totalAmount))}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 40, marginTop: 50 }}>
            {['Prepared By', 'Approved By', 'Vendor Acknowledgement'].map(label => (
              <div key={label} style={{ borderTop: '2px solid #0f172a', paddingTop: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>{label}</div>
                <div style={{ marginTop: 30, fontSize: 9, color: '#cbd5e1' }}>Signature / Stamp</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 30, paddingTop: 10, borderTop: '0.5px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8', fontWeight: 700 }}>
            <span>GlassTech Group — GlassCo Pvt. Ltd. | Karachi, Pakistan</span>
            <span>Printed: {formatDate(new Date().toISOString())}</span>
          </div>
        </div>
      </div>

      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 portrait; margin: 12mm; } }`}</style>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════

const GlasscoPurchaseOrder: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);

  const [view, setView]         = useState<'list' | 'create'>('list');
  const [printPO, setPrintPO]   = useState<PurchaseOrder | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch]     = useState('');

  // Form state
  const [vendorId, setVendorId]             = useState('');
  const [transVendor, setTransVendor]       = useState('');
  const [poDate, setPODate]                 = useState(new Date().toISOString().split('T')[0]);
  const [delivDate, setDelivDate]           = useState('');
  const [payTerms, setPayTerms]             = useState('30 Days Net');
  const [headerRemarks, setHeaderRemarks]   = useState('');
  // Default 5 blank lines
  const [lines, setLines] = useState<POLineItem[]>(() => Array.from({ length: 5 }, blankLine));

  const suggRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── Data ──────────────────────────────────────────────────────────────────
  const allPOs = useMemo(() =>
    ProductionService.getPurchaseOrders()
      .filter(p => p.fromCompany === company && p.category === 'Glass')
      .sort((a, b) => (b.id || '').localeCompare(a.id || '')),
  [view, company]);

  const glassVendors: Vendor[] = useMemo(() =>
    SalesService.getVendors().filter(v => v.type === 'Glass' || (v as any).type === 'Supplier'),
  []);

  const transportVendors: Vendor[] = useMemo(() =>
    SalesService.getVendors().filter(v => v.type === 'Transport'),
  []);

  // Build suggestion catalogue: Product Master + GRN history
  const catalogue: SuggestionItem[] = useMemo(() => {
    const items: SuggestionItem[] = [];
    const seen = new Set<string>();
    const storeItems = InventoryService.getStore().filter(s => s.company === company);

    // 1. Product Master — glass products
    SalesService.getProducts()
      .filter((p: any) =>
        (p.company === company || !p.company) &&
        (p.category === 'Glass' || p.glassType) &&
        p.thickness && p.sheetSize
      )
      .forEach((p: any) => {
        const key = `${p.glassType || p.category}-${p.subCategory || 'Std'}-${p.thickness}-${p.sheetSize}`;
        if (seen.has(key)) return;
        seen.add(key);
        const store = storeItems.find(s => s.id === p.id);
        items.push({
          key,
          label: [p.glassType || p.category, p.subCategory || '', p.thickness, `${p.sheetSize}"`]
            .filter(Boolean).join(' ').trim(),
          category:    p.glassType || p.category || 'Plain',
          subCategory: p.subCategory || 'Standard',
          thickness:   p.thickness,
          sheetSize:   p.sheetSize,
          productId:   p.id,
          lastMAP:     store?.movingAveragePrice || p.costPrice || 0,
          stockOnHand: store?.unrestrictedQty || 0,
          source: 'master',
        });
      });

    // 2. GRN history — items received before but maybe not in Product Master
    InventoryService.getStockLedger()
      .filter(e => e.company === company && e.mvmntCode === '101' && (e as any).sheetTagMeta)
      .forEach(e => {
        const meta      = (e as any).sheetTagMeta;
        const category  = (e as any).glassCategory || 'Plain';
        if (!meta?.thickness || !meta?.sheetSize) return;
        const key = `hist-${category}-${meta.thickness}-${meta.sheetSize}`;
        if (seen.has(key)) return;
        seen.add(key);
        const store = storeItems.find(s => s.id === e.materialId);
        items.push({
          key,
          label: `${category} ${meta.thickness} ${meta.sheetSize}"`,
          category, subCategory: 'Standard',
          thickness: meta.thickness, sheetSize: meta.sheetSize,
          productId: e.materialId,
          lastMAP:     store?.movingAveragePrice || e.valuation || 0,
          stockOnHand: store?.unrestrictedQty || 0,
          source: 'stock',
        });
      });

    return items;
  }, [company]);

  // Tokenised search — "5mm plain 84" matches any order
  function getSuggestions(query: string): SuggestionItem[] {
    if (!query.trim()) return catalogue.slice(0, 12);
    const tokens = query.toLowerCase().replace(/['"]/g, '').split(/\s+/).filter(Boolean);
    return catalogue
      .filter(item => {
        const hay = [item.label, item.category, item.subCategory, item.thickness, item.sheetSize]
          .join(' ').toLowerCase();
        return tokens.every(t => hay.includes(t));
      })
      .slice(0, 10);
  }

  // Close suggestions on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const inside = Object.values(suggRefs.current).some(r => r?.contains(e.target as Node));
      if (!inside) setLines(prev => prev.map(l => ({ ...l, showSuggestions: false })));
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Line ops ──────────────────────────────────────────────────────────────
  const updateLine = (id: string, patch: Partial<POLineItem>) =>
    setLines(prev => prev.map(l => l.id === id ? calcLine({ ...l, ...patch }) : l));

  const pickSuggestion = (lineId: string, s: SuggestionItem) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      return calcLine({
        ...l,
        searchQuery:    s.label,
        showSuggestions: false,
        productId:      s.productId,
        description:    s.label,
        category:       s.category,
        subCategory:    s.subCategory,
        thickness:      s.thickness,
        sheetSize:      s.sheetSize,
        sqftPerSheet:   sqftOf(s.sheetSize),
        lastMAP:        s.lastMAP,
        stockOnHand:    s.stockOnHand,
        ratePKR:        l.ratePKR > 0 ? l.ratePKR : s.lastMAP,
      });
    }));
  };

  const addLine    = () => setLines(prev => [...prev, blankLine()]);
  const removeLine = (id: string) =>
    lines.length > 1 && setLines(prev => prev.filter(l => l.id !== id));

  // ── Totals ────────────────────────────────────────────────────────────────
  const filledLines  = lines.filter(l => l.sheetCount > 0);
  const totalSheets  = filledLines.reduce((s, l) => s + l.sheetCount, 0);
  const totalSqft    = filledLines.reduce((s, l) => s + l.totalSqft, 0);
  const totalFreight = filledLines.reduce((s, l) => s + (l.freightPKR || 0), 0);
  const totalAmount  = filledLines.reduce((s, l) => s + l.lineTotal, 0);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = (status: 'Draft' | 'Sent') => {
    if (!vendorId)         { toast.error('Glass vendor required'); return; }
    if (!filledLines.length) { toast.error('At least one line item required'); return; }
    if (filledLines.some(l => l.ratePKR <= 0)) { toast.error('Rate required on all lines'); return; }

    const vendor = glassVendors.find(v => v.id === vendorId);
    const all    = ProductionService.getPurchaseOrders();
    const poId   = generatePOId(all, poDate);

    const po: any = {
      id: poId, fromCompany: company,
      toVendor: vendor?.name || vendorId,
      date: poDate, status, totalAmount, category: 'Glass',
      matchStatus: 'Pending',
      vendorId, transportVendor: transVendor,
      deliveryDate: delivDate, payTerms, headerRemarks,
      totalSheets, totalSqft: +totalSqft.toFixed(2), totalFreight,
      items: filledLines.map(l => ({
        description: l.description || `${l.category} ${l.thickness} ${l.sheetSize}"`,
        qty:  l.totalSqft,
        rate: l.ratePKR,
        costCenter: 'STORE',
        specs: JSON.stringify({
          category: l.category, subCategory: l.subCategory,
          thickness: l.thickness, sheetSize: l.sheetSize,
          sheetCount: l.sheetCount, sqftPerSheet: l.sqftPerSheet,
          freightPKR: l.freightPKR, lineTotal: l.lineTotal,
          remarks: l.remarks, productId: l.productId,
        }),
      })),
    };

    ProductionService.savePurchaseOrders([...all, po]);
    toast.success(`${poId} saved${status === 'Sent' ? ' — opening print' : ' as draft'}`);
    if (status === 'Sent') setTimeout(() => setPrintPO(po), 300);
    setView('list');
    resetForm();
  };

  const resetForm = () => {
    setVendorId(''); setTransVendor(''); setDelivDate('');
    setPayTerms('30 Days Net'); setHeaderRemarks('');
    setLines(Array.from({ length: 5 }, blankLine));
  };

  const updateStatus = (poId: string, st: string) => {
    const all = ProductionService.getPurchaseOrders();
    ProductionService.savePurchaseOrders(all.map(p => p.id === poId ? { ...p, status: st as any } : p));
    toast.success(`${poId} → ${st}`);
  };

  const filtered = allPOs.filter(p =>
    !search ||
    p.id?.toLowerCase().includes(search.toLowerCase()) ||
    p.toVendor?.toLowerCase().includes(search.toLowerCase())
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {printPO && <POPrint po={printPO} onClose={() => setPrintPO(null)}/>}

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view === 'create' && (
            <button onClick={() => { setView('list'); resetForm(); }}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg">
              <X size={13}/> Cancel
            </button>
          )}
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">
            {view === 'list'
              ? `Glass POs — ${allPOs.length} total`
              : 'New Glass Purchase Order'}
          </h2>
        </div>
        {view === 'list' && (
          <button onClick={() => setView('create')}
            className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-black uppercase text-xs flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg">
            <Plus size={14}/> New PO
          </button>
        )}
      </div>

      {/* ════ LIST ════════════════════════════════════════════════════════ */}
      {view === 'list' && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input placeholder="Search PO ID or vendor…" value={search}
              onChange={e => setSearch(e.target.value)} className="sap-input w-full pl-9"/>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-16 text-center">
              <FileText size={32} className="mx-auto text-slate-300 mb-3"/>
              <p className="text-sm font-bold text-slate-400">No Glass POs yet</p>
              <button onClick={() => setView('create')} className="mt-4 text-xs font-black text-blue-600 hover:underline">
                + Create first PO
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b text-2xs font-black uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3 w-6"></th>
                    <th className="px-4 py-3">PO ID</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3 text-right">Sheets</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(po => {
                    const isExp  = expanded === po.id;
                    const meta   = po as any;
                    const poItems = po.items.map(i => {
                      let m: any = {};
                      try { m = JSON.parse(i.specs || '{}'); } catch {}
                      return { ...i, m };
                    });
                    return (
                      <React.Fragment key={po.id}>
                        <tr className="border-b hover:bg-slate-50 cursor-pointer"
                          onClick={() => setExpanded(isExp ? null : po.id)}>
                          <td className="px-4 py-3 text-slate-300">
                            {isExp ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-black text-xs text-blue-700 font-mono uppercase">{po.id}</div>
                          </td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-600">{formatDate(po.date)}</td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-800 uppercase">{po.toVendor}</td>
                          <td className="px-4 py-3 text-right text-xs font-black">{meta.totalSheets || '—'}</td>
                          <td className="px-4 py-3 text-right text-xs font-black text-emerald-700">
                            {formatPKR(Math.round(po.totalAmount))}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-2xs font-black uppercase px-2 py-0.5 rounded-full ${STATUS_CLS[po.status] || 'bg-slate-100 text-slate-600'}`}>
                              {po.status}
                            </span>
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1.5">
                              <button onClick={() => setPrintPO(po)}
                                className="flex items-center gap-1 text-2xs font-bold text-slate-400 hover:text-blue-600 border border-slate-200 hover:border-blue-200 px-2 py-1 rounded-lg">
                                <Printer size={10}/> Print
                              </button>
                              {(po.status as string) === 'Draft' && (
                                <button onClick={() => updateStatus(po.id, 'Sent')}
                                  className="flex items-center gap-1 text-2xs font-bold text-blue-600 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-50">
                                  <Send size={10}/> Send
                                </button>
                              )}
                              {po.status === 'Sent' && (
                                <button onClick={() => updateStatus(po.id, 'GRN Pending')}
                                  className="flex items-center gap-1 text-2xs font-bold text-amber-600 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-50">
                                  <Clock size={10}/> GRN
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isExp && (
                          <tr>
                            <td colSpan={8} className="bg-slate-50 border-b px-6 py-4">
                              <p className="text-2xs font-black uppercase text-slate-400 mb-2 tracking-widest">Line Items</p>
                              <table className="w-full text-xs">
                                <thead className="text-2xs font-black uppercase text-slate-400 border-b">
                                  <tr>
                                    <th className="pb-1.5 text-left">Description</th>
                                    <th className="pb-1.5 text-right">Sheets</th>
                                    <th className="pb-1.5 text-right">SqFt</th>
                                    <th className="pb-1.5 text-right">Rate</th>
                                    <th className="pb-1.5 text-right">Freight</th>
                                    <th className="pb-1.5 text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {poItems.map((item, i) => (
                                    <tr key={i}>
                                      <td className="py-1.5 font-bold uppercase">{item.description}</td>
                                      <td className="py-1.5 text-right font-black">{item.m.sheetCount || '—'}</td>
                                      <td className="py-1.5 text-right">{Number(item.qty || 0).toFixed(1)}</td>
                                      <td className="py-1.5 text-right">{formatPKR(item.rate || 0)}</td>
                                      <td className="py-1.5 text-right text-blue-600">{formatPKR(item.m.freightPKR || 0)}</td>
                                      <td className="py-1.5 text-right font-black text-emerald-700">
                                        {formatPKR(Math.round(item.m.lineTotal || 0))}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="border-t-2 border-slate-300">
                                  <tr>
                                    <td colSpan={5} className="pt-2 text-right text-2xs font-black text-slate-500 uppercase">Total</td>
                                    <td className="pt-2 text-right font-black text-emerald-700">{formatPKR(Math.round(po.totalAmount))}</td>
                                  </tr>
                                </tfoot>
                              </table>
                              {(po as any).headerRemarks && (
                                <p className="mt-2 text-2xs text-slate-500 italic">{(po as any).headerRemarks}</p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════ CREATE ══════════════════════════════════════════════════════ */}
      {view === 'create' && (
        <div className="space-y-5">

          {/* Header */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-7">
            <div className="flex items-center gap-3 pb-4 border-b mb-5">
              <div className="p-2.5 bg-blue-600 rounded-xl"><Building2 size={16} className="text-white"/></div>
              <h3 className="text-xs font-black uppercase tracking-widest">PO Header</h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-2xs font-black uppercase text-slate-400">Glass Vendor *</label>
                <select className="sap-input w-full font-bold" value={vendorId} onChange={e => setVendorId(e.target.value)}>
                  <option value="">— Select Glass Vendor —</option>
                  {glassVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                {glassVendors.length === 0 && (
                  <p className="text-2xs text-amber-600 font-bold">No Glass vendors. Add in Vendor Hub (type = Glass)</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-2xs font-black uppercase text-slate-400">Transport / Shipper</label>
                <select className="sap-input w-full font-bold" value={transVendor} onChange={e => setTransVendor(e.target.value)}>
                  <option value="">— Optional —</option>
                  {transportVendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                  <option value="SELF">Self Arranged</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-2xs font-black uppercase text-slate-400">Payment Terms</label>
                <select className="sap-input w-full font-bold" value={payTerms} onChange={e => setPayTerms(e.target.value)}>
                  {['Cash','7 Days Net','15 Days Net','30 Days Net','45 Days Net','60 Days Net','Against Delivery'].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-2xs font-black uppercase text-slate-400">PO Date</label>
                <input type="date" className="sap-input w-full" value={poDate} onChange={e => setPODate(e.target.value)}/>
              </div>
              <div className="space-y-1.5">
                <label className="text-2xs font-black uppercase text-slate-400">Expected Delivery</label>
                <input type="date" className="sap-input w-full" value={delivDate} onChange={e => setDelivDate(e.target.value)}/>
              </div>
              <div className="space-y-1.5">
                <label className="text-2xs font-black uppercase text-slate-400">Remarks</label>
                <input type="text" className="sap-input w-full uppercase" placeholder="Special instructions…"
                  value={headerRemarks} onChange={e => setHeaderRemarks(e.target.value)}/>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-7">
            <div className="flex items-center justify-between pb-4 border-b mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-600 rounded-xl"><Package size={16} className="text-white"/></div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest">Line Items</h3>
                  <p className="text-2xs text-slate-400 font-bold mt-0.5">
                    Search by anything — "5mm", "plain 84", "mirror 6mm", partial match works
                  </p>
                </div>
              </div>
              <button onClick={addLine}
                className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-xl font-black uppercase text-xs hover:bg-emerald-700">
                <Plus size={13}/> Add Line
              </button>
            </div>

            {/* Column labels */}
            <div className="grid text-2xs font-black uppercase text-slate-400 mb-2 px-2 gap-2"
              style={{ gridTemplateColumns: '1fr 90px 72px 90px 86px 90px 32px' }}>
              <span>Glass Specification</span>
              <span className="text-right">Sheets</span>
              <span className="text-right">SqFt</span>
              <span className="text-right">Rate/sqft</span>
              <span className="text-right">Freight PKR</span>
              <span className="text-right">Line Total</span>
              <span></span>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => {
                const suggs = getSuggestions(line.searchQuery);
                const isFilled = line.sheetCount > 0;
                return (
                  <div key={line.id}
                    ref={el => { suggRefs.current[line.id] = el; }}
                    className={`rounded-2xl border transition-colors ${isFilled ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-100 bg-slate-50/40'}`}>

                    <div className="p-3 grid gap-2 items-start"
                      style={{ gridTemplateColumns: '1fr 90px 72px 90px 86px 90px 32px' }}>

                      {/* Search input + suggestions */}
                      <div className="relative">
                        <div className="flex items-center gap-1.5 mb-1 min-h-[18px]">
                          <span className="text-2xs font-black text-slate-400">#{idx + 1}</span>
                          {line.thickness && (
                            <span className="text-2xs font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded leading-none">
                              {line.category} · {line.thickness} · {line.sheetSize}"
                            </span>
                          )}
                          {line.stockOnHand > 0 && (
                            <span className="text-2xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded leading-none">
                              {line.stockOnHand.toFixed(0)} sqft in stock
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          className="sap-input w-full text-xs font-bold"
                          placeholder={`e.g. plain 5mm, mirror 84x144, 6mm clear…`}
                          value={line.searchQuery}
                          autoComplete="off"
                          onChange={e => updateLine(line.id, { searchQuery: e.target.value, showSuggestions: true })}
                          onFocus={() => updateLine(line.id, { showSuggestions: true })}
                        />
                        {line.showSuggestions && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                            {suggs.length === 0 ? (
                              <div className="px-4 py-3 text-2xs text-slate-400 italic">
                                No matches — you can still fill fields manually below
                              </div>
                            ) : suggs.map(s => (
                              <button key={s.key}
                                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0 flex items-center justify-between"
                                onMouseDown={e => { e.preventDefault(); pickSuggestion(line.id, s); }}>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-slate-800 uppercase">{s.label}</span>
                                  <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${s.source === 'master' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {s.source === 'master' ? 'Product Master' : 'GRN History'}
                                  </span>
                                </div>
                                <div className="text-right text-2xs shrink-0 ml-4">
                                  {s.lastMAP > 0 && <div className="font-black text-emerald-700">MAP {s.lastMAP.toFixed(0)}/sqft</div>}
                                  {s.stockOnHand > 0 && <div className="text-slate-400">{s.stockOnHand.toFixed(0)} sqft</div>}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Sheets */}
                      <input type="number" min="0"
                        className="sap-input text-xs font-black text-right mt-[18px]"
                        placeholder="0"
                        value={line.sheetCount || ''}
                        onChange={e => updateLine(line.id, { sheetCount: Number(e.target.value) })}/>

                      {/* SqFt */}
                      <div className={`sap-input text-xs font-black text-right mt-[18px] cursor-not-allowed ${line.totalSqft > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-300'}`}>
                        {line.totalSqft > 0 ? line.totalSqft.toFixed(1) : '—'}
                      </div>

                      {/* Rate */}
                      <div className="mt-[18px]">
                        {line.lastMAP > 0 && (
                          <div className="text-2xs font-bold text-emerald-600 text-right mb-0.5 leading-none">
                            prev MAP {line.lastMAP.toFixed(0)}
                          </div>
                        )}
                        <input type="number" min="0"
                          className={`sap-input text-xs font-black text-right w-full ${!line.lastMAP ? 'mt-[13px]' : ''}`}
                          placeholder="0.00"
                          value={line.ratePKR || ''}
                          onChange={e => updateLine(line.id, { ratePKR: Number(e.target.value) })}/>
                      </div>

                      {/* Freight */}
                      <input type="number" min="0"
                        className="sap-input text-xs font-bold text-right text-blue-600 mt-[18px]"
                        placeholder="0"
                        value={line.freightPKR || ''}
                        onChange={e => updateLine(line.id, { freightPKR: Number(e.target.value) })}/>

                      {/* Line total */}
                      <div className={`text-sm font-black text-right pr-1 mt-[18px] ${line.lineTotal > 0 ? 'text-emerald-700' : 'text-slate-200'}`}>
                        {line.lineTotal > 0 ? formatNumber(Math.round(line.lineTotal)) : '—'}
                      </div>

                      {/* Remove */}
                      <button onClick={() => removeLine(line.id)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center mt-[18px] ${lines.length > 1 ? 'text-red-300 hover:text-red-600 hover:bg-red-50' : 'text-slate-100 cursor-not-allowed'}`}>
                        <Trash2 size={12}/>
                      </button>
                    </div>

                    {/* Note row — only on filled lines */}
                    {isFilled && (
                      <div className="px-3 pb-3 flex items-center gap-2">
                        <span className="text-2xs font-black uppercase text-slate-400 shrink-0">Note:</span>
                        <input type="text"
                          className="sap-input text-2xs flex-1 py-1"
                          placeholder="Batch preference, colour note, special requirement…"
                          value={line.remarks}
                          onChange={e => updateLine(line.id, { remarks: e.target.value })}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <div className="mt-5 pt-4 border-t">
              <div className="grid grid-cols-4 gap-3 mb-3">
                {[
                  { label: 'Lines filled', val: `${filledLines.length}/${lines.length}` },
                  { label: 'Total Sheets', val: formatNumber(totalSheets) },
                  { label: 'Total SqFt', val: totalSqft.toFixed(1) },
                  { label: 'Total Freight', val: formatPKR(totalFreight) },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="text-2xs font-black uppercase text-slate-400">{s.label}</div>
                    <div className="text-base font-black text-slate-800 mt-0.5">{s.val}</div>
                  </div>
                ))}
              </div>
              <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 flex justify-between items-center">
                <span className="text-xs font-black uppercase text-emerald-700">Grand Total (Material + Freight)</span>
                <span className="text-2xl font-black text-emerald-700">{formatPKR(Math.round(totalAmount))}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 pb-6">
            <button onClick={() => handleSave('Draft')}
              className="px-8 py-3 border border-slate-300 rounded-2xl font-black uppercase text-xs text-slate-600 hover:bg-slate-50">
              Save Draft
            </button>
            <button onClick={() => handleSave('Sent')}
              className="bg-blue-600 text-white px-12 py-3 rounded-2xl font-black uppercase text-xs shadow-xl flex items-center gap-2 hover:bg-blue-700">
              <Send size={15}/> Issue PO + Print
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlasscoPurchaseOrder;
