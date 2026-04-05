/**
 * PurchaseReturnModule.tsx — Phase 2 (EC-02)
 * Purchase Return / Debit Note against a vendor.
 *
 * GL: Dr AP (vendor payable) / Cr Inventory (at MAP)
 * Links to original GRN where available.
 */

import React, { useState, useEffect } from 'react';
import { Company } from '@/modules/shared/types/core';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { FinanceService }   from '@/modules/finance/services/financeService';
import { SalesService }     from '@/modules/sales/services/salesService';
import { confirmModal }     from '@/modules/shared/components/ConfirmDialog';
import { useAuthStore }     from '@/modules/auth/authStore';
import { PackageX, Plus, X, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface Props { company: Company; }

export interface PurchaseReturn {
  id:          string;
  company:     Company;
  date:        string;
  vendorId:    string;
  vendorName:  string;
  grnRef?:     string;
  items:       ReturnLine[];
  totalAmount: number;
  reason:      string;
  glTxId:      string;
  postedBy:    string;
  createdAt:   string;
}

interface ReturnLine {
  materialDesc: string;
  quantity:     number;
  unit:         string;
  ratePerUnit:  number;
  amount:       number;
  storeItemId?: string;
}

const RET_KEY = (co: Company) => `gtk_erp_purchase_returns_${co}`;

const getPurchaseReturns = (co: Company): PurchaseReturn[] => {
  try { return JSON.parse(localStorage.getItem(RET_KEY(co)) || '[]'); } catch { return []; }
};
const savePurchaseReturns = (co: Company, data: PurchaseReturn[]) =>
  localStorage.setItem(RET_KEY(co), JSON.stringify(data));

const getNextDNNumber = (company: Company): string => {
  const year = new Date().getFullYear();
  const key  = `gtk_erp_dn_seq_${company}_${year}`;
  const next = parseInt(localStorage.getItem(key) || '0', 10) + 1;
  localStorage.setItem(key, String(next));
  return `DN-${company.substring(0, 3).toUpperCase()}-${year}-${String(next).padStart(4, '0')}`;
};

const BLANK_LINE = (): ReturnLine => ({
  materialDesc: '', quantity: 1, unit: 'Sheet', ratePerUnit: 0, amount: 0,
});

const REASONS = [
  'Substandard Quality', 'Wrong Specification', 'Excess Quantity Received',
  'Pricing Discrepancy', 'Damaged in Transit', 'Other',
];

const PurchaseReturnModule: React.FC<Props> = ({ company }) => {
  const { user } = useAuthStore();
  const actor = user?.fullName || user?.email || 'System';

  const [returns,   setReturns]   = useState<PurchaseReturn[]>([]);
  const [vendors,   setVendors]   = useState<any[]>([]);
  const [storeItems,setStoreItems]= useState<any[]>([]);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);

  // form state
  const [vendorId,  setVendorId]  = useState('');
  const [grnRef,    setGrnRef]    = useState('');
  const [reason,    setReason]    = useState(REASONS[0]);
  const [lines,     setLines]     = useState<ReturnLine[]>([BLANK_LINE()]);
  const [date,      setDate]      = useState(new Date().toISOString().split('T')[0]);

  const load = () => {
    setReturns(getPurchaseReturns(company));
    setVendors(SalesService.getVendors().filter((v: any) => !v.company || v.company === company));
    setStoreItems(InventoryService.getStore().filter(i => i.company === company && i.quantity > 0));
  };
  useEffect(() => { load(); }, [company]);

  const selectedVendor = vendors.find(v => v.id === vendorId);
  const totalAmount = lines.reduce((s, l) => s + (l.quantity * l.ratePerUnit), 0);

  const updateLine = (idx: number, field: keyof ReturnLine, val: any) => {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      if (field === 'quantity' || field === 'ratePerUnit') {
        next[idx].amount = next[idx].quantity * next[idx].ratePerUnit;
      }
      if (field === 'storeItemId' && val) {
        const item = storeItems.find(i => i.id === val);
        if (item) {
          next[idx].materialDesc  = item.name;
          next[idx].unit          = item.unit;
          next[idx].ratePerUnit   = item.movingAveragePrice;
          next[idx].amount        = next[idx].quantity * item.movingAveragePrice;
        }
      }
      return next;
    });
  };

  const handlePost = async () => {
    if (!vendorId) { toast.error('Select vendor.'); return; }
    if (lines.some(l => !l.materialDesc || l.quantity <= 0 || l.ratePerUnit <= 0)) {
      toast.error('Fill all line items correctly.'); return;
    }

    const ok = await confirmModal(
      `Post Purchase Return (Debit Note) of PKR ${totalAmount.toLocaleString()} to ${selectedVendor?.name}?\n\nGL: Dr AP / Cr Inventory\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setSaving(true);
    try {
      const dnId  = getNextDNNumber(company);
      const txId  = `GL-${dnId}`;
      const today = date;

      // ── Find AP account for this vendor ──────────────────────────────────
      const allAccounts = FinanceService.getAccounts().filter((a: any) => a.company === company);
      const apAcc = allAccounts.find((a: any) =>
        a.name?.toUpperCase().includes('PAYABLE') && (a.code?.startsWith('221') || a.type === 'Liability')
      );
      const apAccId = apAcc?.id ?? `${company}-21114`;

      // ── Find Inventory account ────────────────────────────────────────────
      const invAcc = allAccounts.find((a: any) =>
        a.code?.startsWith('115') || a.name?.toUpperCase().includes('INVENTORY')
      );
      const invAccId = invAcc?.id ?? `${company}-11511`;

      // ── Post GL ───────────────────────────────────────────────────────────
      FinanceService.recordTransaction({
        id: txId, company, docType: 'RV',
        docDate: today, date: today,
        description: `PURCHASE RETURN ${dnId} — ${selectedVendor?.name || vendorId}${grnRef ? ` — GRN: ${grnRef}` : ''} — ${reason}`,
        referenceId: dnId,
        status: 'Posted',
        details: [
          { accountId: apAccId,  debit: totalAmount, credit: 0,           text: `AP reduction: ${selectedVendor?.name || vendorId}` },
          { accountId: invAccId, debit: 0,           credit: totalAmount, text: `Inventory return: ${lines.map(l => l.materialDesc).join(', ').slice(0, 60)}` },
        ],
      });

      // ── Reduce inventory quantity for linked items ────────────────────────
      const allStore = InventoryService.getStore();
      lines.forEach(line => {
        if (!line.storeItemId) return;
        const idx = allStore.findIndex(i => i.id === line.storeItemId);
        if (idx < 0) return;
        allStore[idx] = {
          ...allStore[idx],
          quantity:          Math.max(0, allStore[idx].quantity - line.quantity),
          unrestrictedQty:   Math.max(0, (allStore[idx].unrestrictedQty || 0) - line.quantity),
        };
      });
      InventoryService.saveStore(allStore);

      // ── Save return record ────────────────────────────────────────────────
      const ret: PurchaseReturn = {
        id: dnId, company, date: today,
        vendorId, vendorName: selectedVendor?.name || vendorId,
        grnRef: grnRef || undefined,
        items: lines.map(l => ({ ...l, amount: l.quantity * l.ratePerUnit })),
        totalAmount, reason, glTxId: txId,
        postedBy: actor, createdAt: new Date().toISOString(),
      };
      savePurchaseReturns(company, [...getPurchaseReturns(company), ret]);

      toast.success(`Debit Note ${dnId} posted — PKR ${totalAmount.toLocaleString()} returned to ${selectedVendor?.name}.`);
      setShowForm(false);
      setVendorId(''); setGrnRef(''); setLines([BLANK_LINE()]); setReason(REASONS[0]);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to post purchase return.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-rose-700 text-white p-6 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PackageX size={20} />
          <div>
            <p className="text-[10px] font-bold text-rose-200 uppercase tracking-widest">
              {company} — Purchase Returns / Debit Notes
            </p>
            <p className="font-black text-lg">
              {returns.length} returns · PKR {returns.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()} total
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-rose-700 rounded-xl font-black uppercase text-xs hover:bg-rose-50 shadow"
        >
          <Plus size={14} /> New Return
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-rose-700 text-white px-8 py-5 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <PackageX size={18} />
                <span className="font-black uppercase tracking-widest text-sm">Purchase Return — Debit Note</span>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-white/10 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-8 space-y-5 bg-slate-50">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Date *</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="sap-input w-full font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Vendor *</label>
                  <select value={vendorId} onChange={e => setVendorId(e.target.value)} className="sap-input w-full font-bold">
                    <option value="">— Select Vendor —</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">GRN Reference (optional)</label>
                  <input
                    value={grnRef}
                    onChange={e => setGrnRef(e.target.value)}
                    placeholder="GRN-2026-001"
                    className="sap-input w-full font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Reason *</label>
                  <select value={reason} onChange={e => setReason(e.target.value)} className="sap-input w-full font-bold">
                    {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              {/* Lines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Return Items *</p>
                  <button
                    onClick={() => setLines(l => [...l, BLANK_LINE()])}
                    className="text-[10px] font-black text-rose-600 uppercase flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Line
                  </button>
                </div>
                <div className="space-y-2">
                  {lines.map((line, idx) => (
                    <div key={idx} className="bg-white border rounded-xl p-3 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <label className="text-[9px] font-black text-slate-400 uppercase">Material</label>
                        <select
                          value={line.storeItemId || ''}
                          onChange={e => updateLine(idx, 'storeItemId', e.target.value)}
                          className="sap-input w-full text-xs font-bold"
                        >
                          <option value="">— Select or type below —</option>
                          {storeItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                        {!line.storeItemId && (
                          <input
                            value={line.materialDesc}
                            onChange={e => updateLine(idx, 'materialDesc', e.target.value)}
                            placeholder="Description"
                            className="sap-input w-full text-xs mt-1"
                          />
                        )}
                      </div>
                      <div className="col-span-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase">Qty</label>
                        <input
                          type="number" min={0}
                          value={line.quantity}
                          onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          className="sap-input w-full text-xs font-bold"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase">Unit</label>
                        <input
                          value={line.unit}
                          onChange={e => updateLine(idx, 'unit', e.target.value)}
                          className="sap-input w-full text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase">Rate</label>
                        <input
                          type="number" min={0}
                          value={line.ratePerUnit}
                          onChange={e => updateLine(idx, 'ratePerUnit', parseFloat(e.target.value) || 0)}
                          className="sap-input w-full text-xs font-bold"
                        />
                      </div>
                      <div className="col-span-1 text-right">
                        <label className="text-[9px] font-black text-slate-400 uppercase">Amount</label>
                        <p className="font-black text-slate-800 text-xs">
                          {(line.quantity * line.ratePerUnit).toLocaleString()}
                        </p>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {lines.length > 1 && (
                          <button
                            onClick={() => setLines(l => l.filter((_, i) => i !== idx))}
                            className="text-rose-400 hover:text-rose-600"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total + GL preview */}
              <div className="bg-white border rounded-xl p-4 flex justify-between items-center">
                <div className="text-xs font-mono text-slate-500 space-y-1">
                  <p>Dr  AP — {selectedVendor?.name || 'Vendor'} ....... PKR {totalAmount.toLocaleString()}</p>
                  <p>Cr  Inventory ........................ PKR {totalAmount.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Total Return Amount</p>
                  <p className="text-2xl font-black text-rose-700">PKR {totalAmount.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="px-8 py-5 bg-white border-t flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border rounded-xl text-slate-500 font-black uppercase text-xs">
                Cancel
              </button>
              <button
                onClick={handlePost}
                disabled={saving || totalAmount <= 0}
                className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-black uppercase text-xs hover:bg-rose-700 shadow disabled:opacity-50"
              >
                {saving ? 'Posting…' : 'Post Debit Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Returns list */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-slate-50">
          <p className="font-black uppercase text-slate-700 text-xs tracking-widest">
            Purchase Returns Register — {company}
          </p>
        </div>
        <table className="w-full sap-table">
          <thead>
            <tr>
              <th className="px-5 py-3 text-left">DN No</th>
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-5 py-3 text-left">Vendor</th>
              <th className="px-5 py-3 text-left">GRN Ref</th>
              <th className="px-5 py-3 text-left">Reason</th>
              <th className="px-5 py-3 text-right">Amount (PKR)</th>
              <th className="px-5 py-3 text-left">GL Ref</th>
            </tr>
          </thead>
          <tbody>
            {returns.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-300 italic text-sm">
                  No purchase returns posted.
                </td>
              </tr>
            )}
            {[...returns].reverse().map(r => (
              <tr key={r.id}>
                <td className="px-5 py-3 font-black text-rose-700 text-sm">{r.id}</td>
                <td className="px-5 py-3 text-slate-500 text-xs">{r.date}</td>
                <td className="px-5 py-3 font-bold text-slate-800">{r.vendorName}</td>
                <td className="px-5 py-3 text-xs text-slate-400">{r.grnRef || '—'}</td>
                <td className="px-5 py-3 text-xs text-slate-600">{r.reason}</td>
                <td className="px-5 py-3 text-right font-black text-rose-700">
                  {r.totalAmount.toLocaleString()}
                </td>
                <td className="px-5 py-3 text-xs text-slate-400 font-mono">{r.glTxId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PurchaseReturnModule;
