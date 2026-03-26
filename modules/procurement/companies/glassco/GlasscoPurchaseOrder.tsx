/**
 * GlasscoPurchaseOrder.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Create / view GlassCo Glass Purchase Orders.
 *
 * Features:
 *  - Multi-line PO: different thickness × size × category per line
 *  - Only Glass vendors shown (type === 'Glass')
 *  - PO ID sequential: PO-GLASSCO-MMYY-001
 *  - Status flow: Draft → Sent → GRN Pending → GRN Done → Invoice Pending → Paid
 *  - Saved via ProductionService.savePurchaseOrders (same store as ThreeWayMatching)
 *  - Each line has: category, thickness, sheetSize, qty (sheets), rate/sqft, freight line
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { PurchaseOrder } from '@/modules/procurement/types/inventory';
import { Vendor } from '@/modules/sales/types/crm';
import { toast } from 'sonner';
import {
  Plus, Trash2, X, FileText, CheckCircle2, Clock,
  Truck, Building2, Package, Send, Eye, ChevronDown, ChevronRight, Search
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface POLineItem {
  id: string;
  category: 'Plain' | 'Color' | 'Mirror' | 'Fluted';
  subCategory: string;
  thickness: string;   // e.g. "5mm"
  sheetSize: string;   // e.g. "84x144"
  sheetCount: number;
  sqftPerSheet: number;
  totalSqft: number;
  ratePKR: number;     // per sqft
  freightPKR: number;  // per line (optional)
  lineTotal: number;
  remarks: string;
}

const THICKNESS_OPTIONS = ['3mm', '4mm', '5mm', '6mm', '8mm', '10mm', '12mm', '15mm', '19mm'];
const WIDTH_OPTIONS      = ['84', '96', '120'];
const HEIGHT_OPTIONS     = ['120', '144', '168'];

const CATEGORY_SUB: Record<string, string[]> = {
  Plain:  ['Standard'],
  Color:  ['One Side', 'Tinted'],
  Mirror: ['Belgium', 'CFG', 'Euro Grey', 'Brown'],
  Fluted: ['Standard'],
};

function sqftOf(sheetSize: string): number {
  const [w, h] = sheetSize.split('x').map(Number);
  return w && h ? Number(((w * h) / 144).toFixed(3)) : 0;
}

// PO ID: PO-GLASSCO-MMYY-NNN
function generatePOId(existing: PurchaseOrder[]): string {
  const now    = new Date();
  const mm     = String(now.getMonth() + 1).padStart(2, '0');
  const yy     = String(now.getFullYear()).slice(-2);
  const prefix = `PO-GLASSCO-${mm}${yy}-`;
  const nums   = existing
    .filter(p => p.id?.startsWith(prefix))
    .map(p => parseInt(p.id.replace(prefix, '')) || 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

// blank line
function newLine(): POLineItem {
  return {
    id: `LINE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category: 'Plain', subCategory: 'Standard',
    thickness: '5mm', sheetSize: '84x144',
    sheetCount: 0, sqftPerSheet: sqftOf('84x144'),
    totalSqft: 0, ratePKR: 0, freightPKR: 0, lineTotal: 0, remarks: '',
  };
}

function calcLine(l: POLineItem): POLineItem {
  const sqftPerSheet = sqftOf(l.sheetSize) || l.sqftPerSheet;
  const totalSqft    = Number((l.sheetCount * sqftPerSheet).toFixed(2));
  const lineTotal    = Number((totalSqft * l.ratePKR + l.freightPKR).toFixed(2));
  return { ...l, sqftPerSheet, totalSqft, lineTotal };
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS: Record<string, string> = {
  Draft:            'bg-slate-100 text-slate-600',
  Sent:             'bg-blue-100 text-blue-700',
  'GRN Pending':    'bg-amber-100 text-amber-700',
  'GRN Done':       'bg-emerald-100 text-emerald-700',
  'Invoice Pending':'bg-purple-100 text-purple-700',
  Paid:             'bg-green-100 text-green-700',
  'On Hold':        'bg-red-100 text-red-700',
};

// ════════════════════════════════════════════════════════════════════════════
const GlasscoPurchaseOrder: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);

  const [view, setView]           = useState<'list' | 'create'>('list');
  const [expandedPO, setExpanded] = useState<string | null>(null);
  const [search, setSearch]       = useState('');

  // Form state
  const [vendorId, setVendorId]           = useState('');
  const [transportVendor, setTransVendor] = useState('');
  const [poDate, setPODate]               = useState(new Date().toISOString().split('T')[0]);
  const [deliveryDate, setDelivDate]      = useState('');
  const [payTerms, setPayTerms]           = useState('30 Days Net');
  const [headerRemarks, setHeaderRemarks] = useState('');
  const [lines, setLines]                 = useState<POLineItem[]>([newLine()]);

  // Data
  const allPOs = useMemo(() =>
    ProductionService.getPurchaseOrders()
      .filter(p => p.fromCompany === company && p.category === 'Glass')
      .sort((a, b) => (b.id || '').localeCompare(a.id || '')),
  [view, company]);

  // Glass vendors — no company filter because glass suppliers may be registered globally
  // Tempering vendors excluded (they go on tempering dispatches, not purchase orders)
  const glassVendors: Vendor[] = useMemo(() =>
    SalesService.getVendors().filter(v =>
      v.type === 'Glass' || v.type === 'Supplier' || (v as any).type === 'glass'
    ),
  []);

  const transportVendors: Vendor[] = useMemo(() =>
    SalesService.getVendors().filter(v => v.type === 'Transport'),
  []);

  // ── Line handlers ──────────────────────────────────────────────────────────
  const updateLine = (id: string, patch: Partial<POLineItem>) => {
    setLines(prev => prev.map(l => l.id === id ? calcLine({ ...l, ...patch }) : l));
  };

  const addLine    = () => setLines(prev => [...prev, newLine()]);
  const removeLine = (id: string) => setLines(prev => prev.filter(l => l.id !== id));

  const totalFreight = lines.reduce((s, l) => s + (l.freightPKR || 0), 0);
  const totalAmount  = lines.reduce((s, l) => s + l.lineTotal, 0);
  const totalSheets  = lines.reduce((s, l) => s + l.sheetCount, 0);
  const totalSqft    = lines.reduce((s, l) => s + l.totalSqft, 0);

  // ── Save PO ────────────────────────────────────────────────────────────────
  const handleSave = (status: 'Draft' | 'Sent') => {
    if (!vendorId) { toast.error('Glass vendor required'); return; }
    if (lines.some(l => l.sheetCount <= 0 || l.ratePKR <= 0)) {
      toast.error('All lines need qty and rate'); return;
    }

    const vendor = glassVendors.find(v => v.id === vendorId);
    const all    = ProductionService.getPurchaseOrders();
    const poId   = generatePOId(all);

    const po: PurchaseOrder = {
      id: poId,
      fromCompany: company,
      toVendor: vendor?.name || vendorId,
      date: poDate,
      status: status as any,
      totalAmount,
      category: 'Glass',
      items: lines.map(l => ({
        description: `${l.category} ${l.subCategory} ${l.thickness} ${l.sheetSize}"`,
        qty: l.totalSqft,
        rate: l.ratePKR,
        specs: JSON.stringify({
          category: l.category, subCategory: l.subCategory,
          thickness: l.thickness, sheetSize: l.sheetSize,
          sheetCount: l.sheetCount, sqftPerSheet: l.sqftPerSheet,
          freightPKR: l.freightPKR, lineTotal: l.lineTotal,
          remarks: l.remarks,
        }),
        costCenter: 'STORE',
      })),
      matchStatus: 'Pending',
      // Extended fields (stored in specs / costCenter workaround)
    } as any;

    // Attach extra meta
    (po as any).vendorId         = vendorId;
    (po as any).transportVendor  = transportVendor;
    (po as any).deliveryDate     = deliveryDate;
    (po as any).payTerms         = payTerms;
    (po as any).headerRemarks    = headerRemarks;
    (po as any).totalSheets      = totalSheets;
    (po as any).totalSqft        = totalSqft;
    (po as any).totalFreight     = totalFreight;

    ProductionService.savePurchaseOrders([...all, po]);
    toast.success(`${poId} saved as ${status}`);
    setView('list');
    resetForm();
  };

  const resetForm = () => {
    setVendorId(''); setTransVendor(''); setDelivDate('');
    setPayTerms('30 Days Net'); setHeaderRemarks('');
    setLines([newLine()]);
  };

  // ── Update PO status ────────────────────────────────────────────────────────
  const updateStatus = (poId: string, newStatus: string) => {
    const all = ProductionService.getPurchaseOrders();
    ProductionService.savePurchaseOrders(
      all.map(p => p.id === poId ? { ...p, status: newStatus as any } : p)
    );
    toast.success(`PO ${poId} → ${newStatus}`);
  };

  const filtered = allPOs.filter(p =>
    !search ||
    p.id?.toLowerCase().includes(search) ||
    p.toVendor?.toLowerCase().includes(search)
  );

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view === 'create' && (
            <button onClick={() => { setView('list'); resetForm(); }}
              className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800">
              <X size={14}/> Cancel
            </button>
          )}
          <h2 className="text-base font-black uppercase tracking-wide">
            {view === 'list' ? `Glass Purchase Orders (${allPOs.length})` : 'New Purchase Order'}
          </h2>
        </div>
        {view === 'list' && (
          <button onClick={() => setView('create')}
            className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-black uppercase text-xs flex items-center gap-2 hover:bg-blue-700 transition-colors">
            <Plus size={15}/> New PO
          </button>
        )}
      </div>

      {/* ── LIST VIEW ──────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input placeholder="Search by PO ID or vendor…" value={search}
              onChange={e => setSearch(e.target.value.toLowerCase())}
              className="sap-input w-full pl-9 text-sm"/>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-16 text-center">
              <FileText size={32} className="mx-auto text-slate-300 mb-3"/>
              <p className="text-sm font-bold text-slate-400">No Glass POs yet</p>
              <button onClick={() => setView('create')} className="mt-4 text-xs font-black text-blue-600 hover:underline">+ Create first PO</button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400">
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
                    const isExp = expandedPO === po.id;
                    const poItems = po.items.map(item => {
                      try { return { ...item, meta: JSON.parse(item.specs || '{}') }; }
                      catch { return { ...item, meta: {} }; }
                    });
                    return (
                      <React.Fragment key={po.id}>
                        <tr className="border-b hover:bg-slate-50 cursor-pointer"
                          onClick={() => setExpanded(isExp ? null : po.id)}>
                          <td className="px-4 py-3 text-slate-400">
                            {isExp ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-black text-xs text-blue-700 uppercase font-mono">{po.id}</div>
                          </td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-600">{po.date}</td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-800 uppercase">{po.toVendor}</td>
                          <td className="px-4 py-3 text-right text-xs font-black">{(po as any).totalSheets || '—'}</td>
                          <td className="px-4 py-3 text-right text-xs font-black text-emerald-700">
                            PKR {Math.round(po.totalAmount).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${STATUS[po.status] || 'bg-slate-100 text-slate-600'}`}>
                              {po.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {po.status === 'Draft' && (
                                <button onClick={e => { e.stopPropagation(); updateStatus(po.id, 'Sent'); }}
                                  className="flex items-center gap-1 text-[10px] font-bold text-blue-600 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-50">
                                  <Send size={10}/> Send
                                </button>
                              )}
                              {po.status === 'Sent' && (
                                <button onClick={e => { e.stopPropagation(); updateStatus(po.id, 'GRN Pending'); }}
                                  className="flex items-center gap-1 text-[10px] font-bold text-amber-600 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-50">
                                  <Clock size={10}/> Await GRN
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded line items */}
                        {isExp && (
                          <tr>
                            <td colSpan={8} className="bg-slate-50 border-b px-6 py-4">
                              <div className="text-[10px] font-black uppercase text-slate-400 mb-3">Line Items</div>
                              <table className="w-full text-xs">
                                <thead className="text-[9px] font-black uppercase text-slate-400 border-b">
                                  <tr>
                                    <th className="pb-2 text-left">Description</th>
                                    <th className="pb-2 text-right">Sheets</th>
                                    <th className="pb-2 text-right">SqFt</th>
                                    <th className="pb-2 text-right">Rate/SqFt</th>
                                    <th className="pb-2 text-right">Freight</th>
                                    <th className="pb-2 text-right">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {poItems.map((item, i) => (
                                    <tr key={i}>
                                      <td className="py-2 font-bold uppercase">{item.description}</td>
                                      <td className="py-2 text-right font-black">{item.meta.sheetCount || '—'}</td>
                                      <td className="py-2 text-right">{Number(item.qty || 0).toFixed(1)}</td>
                                      <td className="py-2 text-right">PKR {item.rate}</td>
                                      <td className="py-2 text-right text-blue-600">PKR {item.meta.freightPKR || 0}</td>
                                      <td className="py-2 text-right font-black text-emerald-700">PKR {Math.round(item.meta.lineTotal || 0).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="border-t-2 border-slate-200">
                                  <tr>
                                    <td colSpan={5} className="pt-2 text-right font-black uppercase text-slate-500 text-[10px]">Total</td>
                                    <td className="pt-2 text-right font-black text-emerald-700">PKR {Math.round(po.totalAmount).toLocaleString()}</td>
                                  </tr>
                                </tfoot>
                              </table>
                              {(po as any).headerRemarks && (
                                <p className="mt-3 text-[10px] text-slate-500"><span className="font-black uppercase">Remarks:</span> {(po as any).headerRemarks}</p>
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

      {/* ── CREATE VIEW ────────────────────────────────────────────────────── */}
      {view === 'create' && (
        <div className="space-y-6">

          {/* Header section */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
            <div className="flex items-center gap-3 pb-5 border-b mb-6">
              <div className="p-3 bg-blue-600 rounded-2xl"><Building2 size={18} className="text-white"/></div>
              <h3 className="text-sm font-black uppercase tracking-widest">PO Header</h3>
            </div>
            <div className="grid grid-cols-3 gap-5">
              <div className="col-span-1 space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400">Glass Vendor *</label>
                <select className="sap-input w-full font-bold" value={vendorId} onChange={e => setVendorId(e.target.value)}>
                  <option value="">— Select Glass Vendor —</option>
                  {glassVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                {glassVendors.length === 0 && (
                  <p className="text-[9px] text-amber-600 font-bold">No Glass vendors found. Add in Vendor Hub (type = Glass)</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400">Transport / Shipper</label>
                <select className="sap-input w-full font-bold" value={transportVendor} onChange={e => setTransVendor(e.target.value)}>
                  <option value="">— Select or type —</option>
                  {transportVendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                  <option value="SELF">Self Arranged</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400">Payment Terms</label>
                <select className="sap-input w-full font-bold" value={payTerms} onChange={e => setPayTerms(e.target.value)}>
                  {['Cash','7 Days Net','15 Days Net','30 Days Net','45 Days Net','60 Days Net','Against Delivery'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400">PO Date</label>
                <input type="date" className="sap-input w-full" value={poDate} onChange={e => setPODate(e.target.value)}/>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400">Expected Delivery</label>
                <input type="date" className="sap-input w-full" value={deliveryDate} onChange={e => setDelivDate(e.target.value)}/>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400">Remarks</label>
                <input type="text" className="sap-input w-full uppercase" value={headerRemarks}
                  onChange={e => setHeaderRemarks(e.target.value)} placeholder="Special instructions…"/>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
            <div className="flex items-center justify-between pb-5 border-b mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-600 rounded-2xl"><Package size={18} className="text-white"/></div>
                <h3 className="text-sm font-black uppercase tracking-widest">Line Items</h3>
              </div>
              <button onClick={addLine}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl font-black uppercase text-xs hover:bg-emerald-700">
                <Plus size={14}/> Add Line
              </button>
            </div>

            {/* Line header */}
            <div className="grid text-[9px] font-black uppercase text-slate-400 mb-2 px-2"
              style={{ gridTemplateColumns: '160px 100px 90px 90px 80px 80px 90px 80px 80px 36px' }}>
              <span>Category</span><span>Thickness</span><span>Width"</span><span>Height"</span>
              <span className="text-right">Sheets</span><span className="text-right">SqFt</span>
              <span className="text-right">Rate/sqft</span><span className="text-right">Freight</span>
              <span className="text-right">Total</span><span></span>
            </div>

            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div key={line.id} className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
                  {/* Row 1: specs */}
                  <div className="grid gap-2 items-end"
                    style={{ gridTemplateColumns: '160px 100px 90px 90px 80px 80px 90px 80px 80px 36px' }}>

                    {/* Category */}
                    <select className="sap-input text-xs font-bold" value={line.category}
                      onChange={e => updateLine(line.id, {
                        category: e.target.value as any,
                        subCategory: CATEGORY_SUB[e.target.value]?.[0] || 'Standard'
                      })}>
                      {['Plain','Color','Mirror','Fluted'].map(c => <option key={c}>{c}</option>)}
                    </select>

                    {/* Thickness */}
                    <select className="sap-input text-xs font-bold" value={line.thickness}
                      onChange={e => updateLine(line.id, { thickness: e.target.value })}>
                      {THICKNESS_OPTIONS.map(t => <option key={t}>{t}</option>)}
                    </select>

                    {/* Width */}
                    <select className="sap-input text-xs font-bold"
                      value={line.sheetSize.split('x')[0] || '84'}
                      onChange={e => {
                        const h = line.sheetSize.split('x')[1] || '144';
                        updateLine(line.id, { sheetSize: `${e.target.value}x${h}` });
                      }}>
                      {WIDTH_OPTIONS.map(w => <option key={w}>{w}</option>)}
                    </select>

                    {/* Height */}
                    <select className="sap-input text-xs font-bold"
                      value={line.sheetSize.split('x')[1] || '144'}
                      onChange={e => {
                        const w = line.sheetSize.split('x')[0] || '84';
                        updateLine(line.id, { sheetSize: `${w}x${e.target.value}` });
                      }}>
                      {HEIGHT_OPTIONS.map(h => <option key={h}>{h}</option>)}
                    </select>

                    {/* Sheet count */}
                    <input type="number" min="0" className="sap-input text-xs font-black text-right"
                      placeholder="0" value={line.sheetCount || ''}
                      onChange={e => updateLine(line.id, { sheetCount: Number(e.target.value) })}/>

                    {/* SqFt (computed) */}
                    <div className="sap-input text-xs font-black text-right bg-slate-100 text-slate-600 cursor-not-allowed">
                      {line.totalSqft.toFixed(1)}
                    </div>

                    {/* Rate */}
                    <input type="number" min="0" className="sap-input text-xs font-black text-right"
                      placeholder="0.00" value={line.ratePKR || ''}
                      onChange={e => updateLine(line.id, { ratePKR: Number(e.target.value) })}/>

                    {/* Freight */}
                    <input type="number" min="0" className="sap-input text-xs font-bold text-right text-blue-600"
                      placeholder="0" value={line.freightPKR || ''}
                      onChange={e => updateLine(line.id, { freightPKR: Number(e.target.value) })}/>

                    {/* Line total */}
                    <div className="text-xs font-black text-right text-emerald-700 pr-1">
                      {Math.round(line.lineTotal).toLocaleString()}
                    </div>

                    {/* Remove */}
                    <button onClick={() => lines.length > 1 && removeLine(line.id)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${lines.length > 1 ? 'text-red-400 hover:bg-red-50 hover:text-red-600' : 'text-slate-200 cursor-not-allowed'}`}>
                      <Trash2 size={14}/>
                    </button>
                  </div>

                  {/* Row 2: sub-cat + remarks */}
                  <div className="grid grid-cols-2 gap-3">
                    {CATEGORY_SUB[line.category].length > 1 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase text-slate-400 shrink-0">Sub-cat:</span>
                        <select className="sap-input text-xs flex-1" value={line.subCategory}
                          onChange={e => updateLine(line.id, { subCategory: e.target.value })}>
                          {CATEGORY_SUB[line.category].map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="flex items-center gap-2 col-span-1">
                      <span className="text-[9px] font-black uppercase text-slate-400 shrink-0">Remarks:</span>
                      <input type="text" className="sap-input text-xs flex-1"
                        placeholder={`Line ${idx + 1} note…`} value={line.remarks}
                        onChange={e => updateLine(line.id, { remarks: e.target.value })}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer totals */}
            <div className="mt-4 pt-4 border-t grid grid-cols-4 gap-4">
              {[
                { label: 'Total Lines', val: lines.length, unit: 'lines' },
                { label: 'Total Sheets', val: totalSheets, unit: 'sheets' },
                { label: 'Total SqFt', val: totalSqft.toFixed(1), unit: 'sqft' },
                { label: 'Total Freight', val: `PKR ${totalFreight.toLocaleString()}`, unit: '' },
              ].map(s => (
                <div key={s.label} className="bg-slate-50 rounded-xl p-3 border">
                  <div className="text-[9px] font-black uppercase text-slate-400">{s.label}</div>
                  <div className="text-lg font-black text-slate-800 mt-0.5">{s.val} <span className="text-xs font-bold text-slate-400">{s.unit}</span></div>
                </div>
              ))}
            </div>
            <div className="mt-3 bg-emerald-50 rounded-2xl p-4 border border-emerald-100 flex justify-between items-center">
              <span className="text-xs font-black uppercase text-emerald-700">Grand Total (Material + Freight)</span>
              <span className="text-2xl font-black text-emerald-700">PKR {Math.round(totalAmount).toLocaleString()}</span>
            </div>
          </div>

          {/* Save buttons */}
          <div className="flex justify-end gap-4">
            <button onClick={() => handleSave('Draft')}
              className="px-8 py-3 border border-slate-300 rounded-2xl font-black uppercase text-xs text-slate-600 hover:bg-slate-50">
              Save as Draft
            </button>
            <button onClick={() => handleSave('Sent')}
              className="bg-blue-600 text-white px-12 py-3 rounded-2xl font-black uppercase text-xs shadow-xl flex items-center gap-2 hover:bg-blue-700">
              <Send size={16}/> Issue PO to Vendor
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlasscoPurchaseOrder;
