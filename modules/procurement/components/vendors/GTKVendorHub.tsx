/**
 * GTKVendorHub.tsx — Session 7
 * GTK Vendor Management: Rate Agreements + Auto PO from Requisition
 * Regular vendors (Japan Metal, hardware suppliers) with fixed rates
 * Req approve → select vendor → PO auto-generates with agreed rates
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { Vendor, VendorRate } from '@/modules/sales/types/crm';
import { PurchaseOrder } from '@/modules/procurement/types/inventory';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { AppService } from '@/modules/shared/services/appService';
import { SyncService } from '@/src/services/SyncService';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';
import {
  Plus, Search, X, Save, Trash2, Edit2, CheckCircle2,
  Building2, Phone, Tag, FileText, ShoppingCart, Filter,
  ChevronDown, Star, Clock, Package
} from 'lucide-react';

// ── Extended VendorRate for GTK (profiles, hardware, consumables) ──────
interface GTKVendorRate {
  id: string;
  itemName: string;           // e.g. "D2 Profile", "F34 Connector", "EPDM Gasket"
  category: 'Profile' | 'Hardware' | 'Consumable' | 'Tool' | 'General';
  unit: string;               // KG, PCS, Mtr, RunningFt, etc.
  agreedRate: number;          // PKR per unit
  effectiveDate: string;
  expiryDate?: string;
  notes?: string;
}

// ── Vendor with GTK rates ─────────────────────────────────────────────
interface GTKVendor extends Vendor {
  gtkRates?: GTKVendorRate[];
  paymentTerms?: string;       // "Cash on Delivery" | "7 Days" | "30 Days" | "Credit"
  isRegular?: boolean;         // frequently used vendor
  lastPODate?: string;
}

// ── Storage ───────────────────────────────────────────────────────────
const VENDOR_RATES_KEY = 'gtk_erp_vendor_rates';
const getVendorRates = (vendorId: string): GTKVendorRate[] => {
  try {
    const all: Record<string, GTKVendorRate[]> = JSON.parse(localStorage.getItem(VENDOR_RATES_KEY) || '{}');
    return all[vendorId] || [];
  } catch { return []; }
};
const saveVendorRates = (vendorId: string, rates: GTKVendorRate[]) => {
  try {
    const all: Record<string, GTKVendorRate[]> = JSON.parse(localStorage.getItem(VENDOR_RATES_KEY) || '{}');
    all[vendorId] = rates;
    localStorage.setItem(VENDOR_RATES_KEY, JSON.stringify(all));
  } catch {}
};

// ── Constants ─────────────────────────────────────────────────────────
const RATE_CATEGORIES: GTKVendorRate['category'][] = ['Profile', 'Hardware', 'Consumable', 'Tool', 'General'];
const UNITS = ['KG', 'PCS', 'Mtr', 'RunningFt', 'Set', 'Pair', 'Roll', 'Pkt', 'Box', 'Ltr', 'Tube'];
const PAYMENT_TERMS = ['Cash on Delivery', '7 Days Credit', '15 Days Credit', '30 Days Credit', 'Advance'];

// ═══════════════════════════════════════════════════════════════════════
const GTKVendorHub: React.FC<{ company: string }> = ({ company }) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [activeVendorId, setActiveVendorId] = useState<string | null>(null);

  // Modals
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showRateCard, setShowRateCard] = useState<Vendor | null>(null);
  const [showCreatePO, setShowCreatePO] = useState<Vendor | null>(null);

  // ── Load ────────────────────────────────────────────────────────────

  const { refreshKey } = useRealtimeRefresh(['vendors', 'purchase_orders']);

  useEffect(() => {
    setVendors(SalesService.getVendors().filter(v => !v.company || v.company === company));
  }, [company, refreshKey]);

  const refresh = () => {
    setVendors(SalesService.getVendors().filter(v => !v.company || v.company === company));
  };

  // ── Dynamic vendor types (from existing vendors + defaults) ──────────
  const DEFAULT_TYPES = ['Hardware', 'Profile', 'General', 'Glass', 'Transport'];
  const vendorTypes = useMemo(() => {
    const fromVendors = vendors.map(v => v.type).filter(Boolean);
    return Array.from(new Set([...DEFAULT_TYPES, ...fromVendors])).sort();
  }, [vendors]);
  const filtered = useMemo(() => {
    return vendors.filter(v => {
      if (filterType !== 'All' && v.type !== filterType) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return v.name.toLowerCase().includes(q) || (v.contactPerson || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [vendors, searchTerm, filterType]);

  // ── Approved Requisitions (for PO creation) ─────────────────────────
  const approvedReqs = useMemo(() =>
    InventoryService.getRequisitions().filter(r =>
      r.company === company && r.status === 'Approved' &&
      !['Converted to PO'].includes(r.status as string)
    ),
    [company, showCreatePO]
  );

  // ── Stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: vendors.length,
    profile: vendors.filter(v => v.type !== 'Glass' && v.type !== 'Transport' && v.type !== 'Tempering').length,
    withRates: vendors.filter(v => getVendorRates(v.id).length > 0).length,
    pos: InventoryService.getPurchaseOrders().filter(p => p.fromCompany === company).length,
  }), [vendors, company]);

  // ═══════════════════════════════════════════════════════════════════
  //  ADD VENDOR
  // ═══════════════════════════════════════════════════════════════════
  const [vendorForm, setVendorForm] = useState({
    name: '', type: 'Hardware' as string, contactPerson: '', phone: '',
    address: '', paymentTerms: 'Cash on Delivery',
  });

  const handleAddVendor = () => {
    if (!vendorForm.name) return toast.error('Vendor name is required');
    const all = SalesService.getVendors();
    const newVendor: Vendor = {
      id: `V-${company}-${Date.now().toString().slice(-6)}`,
      company: company as any,
      name: vendorForm.name.toUpperCase(),
      type: vendorForm.type as any,
      contactPerson: vendorForm.contactPerson,
      phone: vendorForm.phone,
      address: vendorForm.address,
    };
    SalesService.saveVendors([...all, newVendor]);
    SyncService.markDirty('vendors');
    toast.success(`Vendor ${newVendor.name} added`);
    setShowAddVendor(false);
    setVendorForm({ name: '', type: 'Hardware', contactPerson: '', phone: '', address: '', paymentTerms: 'Cash on Delivery' });
    refresh();
  };

  // ═══════════════════════════════════════════════════════════════════
  //  RATE CARD
  // ═══════════════════════════════════════════════════════════════════
  const [rates, setRates] = useState<GTKVendorRate[]>([]);
  const [rateForm, setRateForm] = useState<Partial<GTKVendorRate>>({
    itemName: '', category: 'Hardware', unit: 'PCS', agreedRate: 0,
    effectiveDate: new Date().toISOString().split('T')[0], notes: '',
  });

  const openRateCard = (vendor: Vendor) => {
    setShowRateCard(vendor);
    setRates(getVendorRates(vendor.id));
  };

  const handleAddRate = () => {
    if (!rateForm.itemName || !rateForm.agreedRate) return toast.error('Item name and rate required');
    const newRate: GTKVendorRate = {
      id: `RATE-${Date.now()}`,
      itemName: (rateForm.itemName || '').toUpperCase(),
      category: rateForm.category || 'Hardware',
      unit: rateForm.unit || 'PCS',
      agreedRate: rateForm.agreedRate || 0,
      effectiveDate: rateForm.effectiveDate || new Date().toISOString().split('T')[0],
      notes: rateForm.notes,
    };
    const updated = [...rates, newRate];
    setRates(updated);
    saveVendorRates(showRateCard!.id, updated);
    toast.success(`Rate added: ${newRate.itemName} @ PKR ${newRate.agreedRate}/${newRate.unit}`);
    setRateForm({ itemName: '', category: 'Hardware', unit: 'PCS', agreedRate: 0,
      effectiveDate: new Date().toISOString().split('T')[0], notes: '' });
  };

  const handleDeleteRate = (rateId: string) => {
    const updated = rates.filter(r => r.id !== rateId);
    setRates(updated);
    if (showRateCard) saveVendorRates(showRateCard.id, updated);
  };

  // ═══════════════════════════════════════════════════════════════════
  //  CREATE PO FROM REQUISITION
  // ═══════════════════════════════════════════════════════════════════
  const [selectedReqId, setSelectedReqId] = useState('');
  const [poLines, setPoLines] = useState<{ desc: string; qty: number; rate: number; unit: string }[]>([]);
  const [poRemarks, setPoRemarks] = useState('');

  const openCreatePO = (vendor: Vendor) => {
    setShowCreatePO(vendor);
    setSelectedReqId('');
    setPoLines([]);
    setPoRemarks('');
  };

  const fillFromReq = (reqId: string) => {
    const req = approvedReqs.find(r => r.id === reqId);
    if (!req || !req.items?.length) return;
    const vendorRates = showCreatePO ? getVendorRates(showCreatePO.id) : [];

    setPoLines(req.items.map(item => {
      // Try to match vendor rate
      const matchedRate = vendorRates.find(r =>
        r.itemName.toLowerCase() === (item.materialDesc || '').toLowerCase()
      );
      return {
        desc: item.materialDesc || '',
        qty: item.qty || 0,
        rate: matchedRate?.agreedRate || item.estimatedRate || 0,
        unit: matchedRate?.unit || item.unit || 'PCS',
      };
    }));
  };

  const handleCreatePO = () => {
    if (!showCreatePO) return;
    const validPoLines = poLines.filter(l => l.desc && l.qty > 0);
    if (validPoLines.length === 0) return toast.error('Add at least one item');
    const totalAmount = validPoLines.reduce((s, l) => s + (l.qty * l.rate), 0);

    const allPOs = InventoryService.getPurchaseOrders();
    const poId = AppService.generateSequenceID('PO', company as any, allPOs);

    const newPO: PurchaseOrder = {
      id: poId,
      fromCompany: company as any,
      toVendor: showCreatePO.name,
      vendorId: showCreatePO.id,
      date: new Date().toISOString().split('T')[0],
      status: 'Sent',
      totalAmount,
      category: 'Hardware',
      items: validPoLines.map(l => ({
        description: l.desc,
        qty: l.qty,
        rate: l.rate,
        costCenter: '',
      })),
      reqId: selectedReqId || undefined,
      headerRemarks: poRemarks || undefined,
    };

    InventoryService.savePurchaseOrders([...allPOs, newPO]);
    SyncService.markDirty('purchase_orders');

    // Mark requisition as converted
    if (selectedReqId) {
      const allReqs = InventoryService.getRequisitions();
      const updated = allReqs.map(r =>
        r.id === selectedReqId ? { ...r, status: 'Converted to PO' as any } : r
      );
      InventoryService.saveRequisitions(updated);
      SyncService.markDirty('requisitions');
    }

    toast.success(`PO ${poId} created for ${showCreatePO.name}\nTotal: PKR ${totalAmount.toLocaleString()}`);
    setShowCreatePO(null);
    refresh();
  };

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── Stats ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-slate-400">Total vendors</p>
          <p className="text-2xl font-black text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-indigo-500">With rate cards</p>
          <p className="text-2xl font-black text-indigo-600">{stats.withRates}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-slate-400">Purchase orders</p>
          <p className="text-2xl font-black text-slate-800">{stats.pos}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-amber-500">Pending reqs</p>
          <p className="text-2xl font-black text-amber-600">{approvedReqs.length}</p>
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input type="text" placeholder="Search vendor..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <select className="px-3 py-2.5 bg-slate-50 border rounded-xl text-xs font-bold"
          value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="All">All Types</option>
          {vendorTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => setShowAddVendor(true)}
          className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center space-x-2">
          <Plus size={14} /><span>Add Vendor</span>
        </button>
      </div>

      {/* ── Vendor List ───────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <Building2 size={40} className="mx-auto text-slate-200 mb-3" />
          <p className="text-sm font-bold text-slate-400">No vendors found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(vendor => {
            const vRates = getVendorRates(vendor.id);
            return (
              <div key={vendor.id} className="bg-white rounded-2xl border overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="p-2.5 bg-indigo-50 rounded-xl">
                      <Building2 size={18} className="text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase text-slate-800">{vendor.name}</h3>
                      <div className="flex items-center space-x-3 mt-0.5">
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{vendor.type}</span>
                        {vendor.contactPerson && <span className="text-[10px] font-bold text-slate-500">{vendor.contactPerson}</span>}
                        {vendor.phone && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Phone size={10} />{vendor.phone}</span>}
                        {vRates.length > 0 && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{vRates.length} rates</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button onClick={() => openRateCard(vendor)}
                      className="px-3 py-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center gap-1">
                      <Tag size={12} />Rate Card
                    </button>
                    <button onClick={() => openCreatePO(vendor)}
                      className="px-3 py-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1">
                      <ShoppingCart size={12} />Create PO
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ ADD VENDOR MODAL ════════════════════════════════════ */}
      {showAddVendor && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3"><Building2 size={18} /><h3 className="text-sm font-black uppercase">Add vendor</h3></div>
              <button onClick={() => setShowAddVendor(false)} className="p-1 hover:bg-white/10 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Vendor name</label>
                  <input type="text" className="sap-input w-full font-bold uppercase" placeholder="e.g. JAPAN METAL"
                    value={vendorForm.name} onChange={e => setVendorForm({...vendorForm, name: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Type</label>
                  <select className="sap-input w-full font-bold" value={vendorForm.type}
                    onChange={e => {
                      if (e.target.value === '__ADD_NEW__') {
                        const newType = window.prompt('Enter new vendor type:');
                        if (newType && newType.trim()) {
                          setVendorForm({...vendorForm, type: newType.trim()});
                        }
                      } else {
                        setVendorForm({...vendorForm, type: e.target.value});
                      }
                    }}>
                    {vendorTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    <option value="__ADD_NEW__" style={{color:'#2563eb',fontWeight:700}}>+ Add new type</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Payment terms</label>
                  <select className="sap-input w-full font-bold" value={vendorForm.paymentTerms}
                    onChange={e => setVendorForm({...vendorForm, paymentTerms: e.target.value})}>
                    {PAYMENT_TERMS.map(pt => <option key={pt}>{pt}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Contact person</label>
                  <input type="text" className="sap-input w-full font-bold" value={vendorForm.contactPerson}
                    onChange={e => setVendorForm({...vendorForm, contactPerson: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Phone</label>
                  <input type="text" className="sap-input w-full font-bold" value={vendorForm.phone}
                    onChange={e => setVendorForm({...vendorForm, phone: e.target.value})} />
                </div>
              </div>
              <button onClick={handleAddVendor}
                className="w-full py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-600 flex items-center justify-center space-x-2">
                <CheckCircle2 size={16} /><span>Add vendor</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ RATE CARD MODAL ═════════════════════════════════════ */}
      {showRateCard && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 overflow-y-auto p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-3xl shadow-2xl overflow-hidden my-8">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3"><Tag size={18} /><h3 className="text-sm font-black uppercase">Rate card — {showRateCard.name}</h3></div>
              <button onClick={() => setShowRateCard(null)} className="p-1 hover:bg-white/10 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Add rate form */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">Add agreed rate</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <input type="text" className="sap-input font-bold uppercase text-sm col-span-2" placeholder="Item name"
                    value={rateForm.itemName || ''} onChange={e => setRateForm({...rateForm, itemName: e.target.value})} />
                  <select className="sap-input font-bold text-[11px]" value={rateForm.category}
                    onChange={e => setRateForm({...rateForm, category: e.target.value as any})}>
                    {RATE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <div className="flex gap-1">
                    <input type="number" className="sap-input font-black text-sm w-full" placeholder="Rate"
                      value={rateForm.agreedRate || ''} onChange={e => setRateForm({...rateForm, agreedRate: Number(e.target.value)})} />
                    <select className="sap-input font-bold text-[10px] w-20" value={rateForm.unit}
                      onChange={e => setRateForm({...rateForm, unit: e.target.value})}>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <button onClick={handleAddRate}
                    className="bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 flex items-center justify-center gap-1">
                    <Plus size={14} />Add
                  </button>
                </div>
              </div>

              {/* Rate list */}
              {rates.length === 0 ? (
                <p className="text-center text-sm text-slate-400 font-bold py-6">No rates added yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                        <th className="px-4 py-2 text-left">Item</th>
                        <th className="px-4 py-2 text-left">Category</th>
                        <th className="px-4 py-2 text-right">Rate</th>
                        <th className="px-4 py-2 text-left">Unit</th>
                        <th className="px-4 py-2 text-left">Effective</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rates.map(r => (
                        <tr key={r.id} className="border-b border-slate-50 hover:bg-indigo-50/30">
                          <td className="px-4 py-2 font-bold text-slate-800">{r.itemName}</td>
                          <td className="px-4 py-2"><span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-black">{r.category}</span></td>
                          <td className="px-4 py-2 text-right font-black text-indigo-700">PKR {r.agreedRate.toLocaleString()}</td>
                          <td className="px-4 py-2 font-bold text-slate-500">{r.unit}</td>
                          <td className="px-4 py-2 font-bold text-slate-400">{r.effectiveDate}</td>
                          <td className="px-4 py-2">
                            <button onClick={() => handleDeleteRate(r.id)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ CREATE PO MODAL ═════════════════════════════════════ */}
      {showCreatePO && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 overflow-y-auto p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-4xl shadow-2xl overflow-hidden my-8">
            <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3"><ShoppingCart size={18} /><h3 className="text-sm font-black uppercase">Purchase order — {showCreatePO.name}</h3></div>
              <button onClick={() => setShowCreatePO(null)} className="p-1 hover:bg-white/10 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">

              {/* Link Requisition */}
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-[10px] font-black uppercase text-blue-600 mb-2 tracking-widest">Link to approved requisition (optional)</p>
                <select className="sap-input w-full font-bold uppercase text-blue-700"
                  value={selectedReqId}
                  onChange={e => {
                    setSelectedReqId(e.target.value);
                    if (e.target.value) fillFromReq(e.target.value);
                  }}>
                  <option value="">— Direct PO (no requisition) —</option>
                  {approvedReqs.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.id} | {r.subCategory} | PKR {(r.totalValue || 0).toLocaleString()} | {r.headerText}
                    </option>
                  ))}
                </select>
              </div>

              {/* PO Lines */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left min-w-[200px]">Description</th>
                      <th className="px-3 py-2 text-center w-20">Qty</th>
                      <th className="px-3 py-2 text-left w-20">Unit</th>
                      <th className="px-3 py-2 text-right w-28">Rate</th>
                      <th className="px-3 py-2 text-right w-28">Amount</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {poLines.map((line, idx) => (
                      <tr key={idx} className="border-b border-slate-50">
                        <td className="px-3 py-2 text-slate-400 font-bold">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input type="text" className="w-full p-2 bg-slate-50 border rounded-lg font-bold uppercase text-sm"
                            value={line.desc} onChange={e => {
                              const updated = [...poLines];
                              updated[idx] = {...line, desc: e.target.value};
                              setPoLines(updated);
                            }} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" className="w-full p-2 bg-slate-50 border rounded-lg font-black text-center"
                            value={line.qty || ''} onChange={e => {
                              const updated = [...poLines];
                              updated[idx] = {...line, qty: Number(e.target.value)};
                              setPoLines(updated);
                            }} />
                        </td>
                        <td className="px-3 py-2">
                          <select className="w-full p-2 bg-slate-50 border rounded-lg font-bold text-[11px]"
                            value={line.unit} onChange={e => {
                              const updated = [...poLines];
                              updated[idx] = {...line, unit: e.target.value};
                              setPoLines(updated);
                            }}>
                            {UNITS.map(u => <option key={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" className="w-full p-2 bg-slate-50 border rounded-lg font-bold text-right"
                            value={line.rate || ''} onChange={e => {
                              const updated = [...poLines];
                              updated[idx] = {...line, rate: Number(e.target.value)};
                              setPoLines(updated);
                            }} />
                        </td>
                        <td className="px-3 py-2 text-right font-black">PKR {(line.qty * line.rate).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => setPoLines(poLines.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button onClick={() => setPoLines([...poLines, { desc: '', qty: 0, rate: 0, unit: 'PCS' }])}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <Plus size={14} />Add line
              </button>

              {/* Total + Post */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">PO total</p>
                  <p className="text-2xl font-black text-slate-800">
                    PKR {poLines.filter(l => l.desc && l.qty > 0).reduce((s, l) => s + (l.qty * l.rate), 0).toLocaleString()}
                  </p>
                </div>
                <button onClick={handleCreatePO}
                  disabled={poLines.filter(l => l.desc && l.qty > 0).length === 0}
                  className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center space-x-2">
                  <CheckCircle2 size={16} /><span>Create PO</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GTKVendorHub;
