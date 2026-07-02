/**
 * GTKStoreReceipt.tsx — Session 3
 * Simplified Store Inward for GTK: Profiles, Hardware, Consumables, Tools
 * Links to Requisition/PO, updates StoreItem qty + MAP, stock ledger + GL
 * NO glass — GTK buys glass from GlassCo (intercompany)
 */

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { StoreItem, MaterialLedgerEntry } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { SyncService } from '@/src/services/SyncService';
import {
  X, Plus, Trash2, Package, CheckCircle2,
  Search, ShoppingBag, Wrench, AlertTriangle
} from 'lucide-react';
import { ToolService } from '@/modules/procurement/services/toolService';

// ── Types ─────────────────────────────────────────────────────────────────
interface ReceiptLine {
  id: string;
  description: string;
  category: 'Hardware' | 'Profile' | 'Consumable' | 'Raw' | 'Service';
  materialType: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  condition: 'OK' | 'Damaged' | 'Short';
  remarks: string;
  storeItemId: string;
}

interface GTKStoreReceiptProps {
  isOpen: boolean;
  onClose: () => void;
  refreshData: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────
const UNITS = ['PCS', 'KG', 'Mtr', 'RunningFt', 'Set', 'Pair', 'Roll', 'Pkt', 'Box', 'Ltr', 'Tube'];
const CATEGORIES: ReceiptLine['category'][] = ['Hardware', 'Profile', 'Consumable', 'Raw', 'Service'];
const MATERIAL_TYPES = ['BOM Component', 'Consumable', 'Returnable Tool', 'Capital Asset', 'Profile', 'General'];

const blankLine = (): ReceiptLine => ({
  id: `SRL-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
  description: '', category: 'Hardware', materialType: 'BOM Component',
  qty: 0, unit: 'PCS', rate: 0, amount: 0,
  condition: 'OK', remarks: '', storeItemId: '',
});

// ── GL Account mapping by category ────────────────────────────────────────
const CATEGORY_GL: Record<string, { debitCode: string; debitName: string }> = {
  'Hardware':   { debitCode: '11513', debitName: 'Hardware & Accessories' },
  'Profile':    { debitCode: '11511', debitName: 'Aluminium Profiles — Stock' },
  'Consumable': { debitCode: '11531', debitName: 'Consumables — Fabrication' },
  'Raw':        { debitCode: '11513', debitName: 'Hardware & Accessories' },
  'Service':    { debitCode: '53817', debitName: 'Miscellaneous Expenses' },
};

// ═══════════════════════════════════════════════════════════════════════════
const GTKStoreReceipt: React.FC<GTKStoreReceiptProps> = ({ isOpen, onClose, refreshData }) => {
  const company = useAppStore(state => state.selectedCompany);

  // ── Header ──────────────────────────────────────────────────────────
  const [header, setHeader] = useState({
    vendorName: '',
    challanNo: '',
    challanDate: new Date().toISOString().split('T')[0],
    receiptDate: new Date().toISOString().split('T')[0],
    linkedReqId: '',
    paymentMode: 'Cash' as string,
    receivedBy: '',
    remarks: '',
  });

  // ── Lines ───────────────────────────────────────────────────────────
  const [lines, setLines] = useState<ReceiptLine[]>([blankLine(), blankLine(), blankLine()]);

  // ── Existing data ───────────────────────────────────────────────────
  const storeItems = useMemo(() =>
    InventoryService.getStore().filter(s => s.company === company),
    [company, isOpen]
  );
  const requisitions = useMemo(() =>
    InventoryService.getRequisitions().filter(r =>
      r.company === company && r.status === 'Approved'
    ),
    [company, isOpen]
  );

  // ── Item search ─────────────────────────────────────────────────────
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  const getSearchResults = (query: string) => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return storeItems.filter(s =>
      s.name.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q)
    ).slice(0, 8);
  };

  // ── Line operations ─────────────────────────────────────────────────
  const updateLine = (id: string, updates: Partial<ReceiptLine>) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, ...updates };
      updated.amount = (updated.qty || 0) * (updated.rate || 0);
      return updated;
    }));
  };

  const selectStoreItem = (lineId: string, item: StoreItem) => {
    updateLine(lineId, {
      description: item.name,
      category: (item.category || 'Hardware') as ReceiptLine['category'],
      unit: item.unit || 'PCS',
      rate: item.movingAveragePrice || 0,
      storeItemId: item.id,
    });
    setActiveLineId(null);
  };

  const addLine = () => setLines([...lines, blankLine()]);
  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    setLines(lines.filter(l => l.id !== id));
  };

  // ── Auto-fill from Requisition ──────────────────────────────────────
  const fillFromRequisition = (reqId: string) => {
    const req = requisitions.find(r => r.id === reqId);
    if (!req || !req.items?.length) return;

    const newLines: ReceiptLine[] = req.items.map((item, idx) => ({
      ...blankLine(),
      id: `SRL-${Date.now()}-${idx}`,
      description: item.materialDesc || '',
      qty: item.qty || 0,
      unit: item.unit || 'PCS',
      rate: item.estimatedRate || 0,
      amount: (item.qty || 0) * (item.estimatedRate || 0),
      category: 'Hardware' as const,
      materialType: (req as any).materialType || 'General',
    }));

    if (newLines.length > 0) {
      setLines(newLines);
      toast.success(`Loaded ${newLines.length} items from ${reqId}`);
    }
  };

  // ── Totals ──────────────────────────────────────────────────────────
  const validLines = lines.filter(l => l.description && l.qty > 0);
  const totalAmount = validLines.reduce((s, l) => s + l.amount, 0);
  const totalQty = validLines.reduce((s, l) => s + l.qty, 0);
  const damagedLines = validLines.filter(l => l.condition !== 'OK');

  // ── POST Receipt ────────────────────────────────────────────────────
  const handlePost = () => {
    if (validLines.length === 0) return toast.error('Add at least one item with description and quantity.');
    if (!header.receivedBy) return toast.error('Enter who received the goods.');

    let settlementInfo: { settlementId: string; variance: number; status: string } | null = null;
    const allStore = InventoryService.getStore();
    const allLedger = InventoryService.getStockLedger();
    const receiptId = `GRN-${company.slice(0,3)}-${Date.now().toString().slice(-8)}`;
    const today = new Date().toISOString();

    // ── Process each line ─────────────────────────────────────────────
    for (const line of validLines) {
      if (line.condition === 'Damaged' || line.condition === 'Short') {
        // Record but don't add to unrestricted stock
        allLedger.push({
          id: `${receiptId}-${line.id}-DMG`,
          company, materialId: line.storeItemId || line.description,
          timestamp: today, mvmntCode: '102' as any,
          qty: line.qty, uom: line.unit,
          valuation: line.rate, balanceAfter: 0,
          referenceDoc: receiptId,
          user: header.receivedBy,
          remarks: `[${line.condition.toUpperCase()}] ${line.description} — ${line.remarks || 'No details'}`,
        });
        continue;
      }

      // ── Find or create StoreItem ──────────────────────────────────
      let storeIdx = allStore.findIndex(s => s.id === line.storeItemId && s.company === company);

      if (storeIdx === -1 && line.description) {
        // Try matching by name
        storeIdx = allStore.findIndex(s =>
          s.company === company && s.name.toLowerCase() === line.description.toLowerCase()
        );
      }

      if (storeIdx >= 0) {
        // Update existing item — MAP formula
        const existing = allStore[storeIdx];
        const oldValue = existing.quantity * existing.movingAveragePrice;
        const newValue = line.qty * line.rate;
        const newQty = existing.quantity + line.qty;
        const newMAP = newQty > 0 ? (oldValue + newValue) / newQty : line.rate;

        allStore[storeIdx] = {
          ...existing,
          quantity: newQty,
          unrestrictedQty: (existing.unrestrictedQty || 0) + line.qty,
          movingAveragePrice: Math.round(newMAP * 100) / 100,
          totalValue: Math.round(newQty * newMAP),
          lastMovementDate: today.split('T')[0],
        };
      } else {
        // Create new StoreItem
        const newItem: StoreItem = {
          id: `STORE-${company}-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
          company,
          name: line.description.toUpperCase(),
          category: line.category,
          quantity: line.qty,
          unrestrictedQty: line.qty,
          qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0,
          unit: line.unit,
          minLevel: 5,
          reorderPoint: 10,
          movingAveragePrice: line.rate,
          totalValue: line.amount,
          storageBin: 'GTK-STORE-01',
          lastMovementDate: today.split('T')[0],
        };
        allStore.push(newItem);
        // Update line's storeItemId for ledger
        line.storeItemId = newItem.id;
      }

      // ── Stock Ledger Entry (Movement 101 = GRN) ─────────────────
      const afterItem = allStore.find(s => s.id === line.storeItemId || s.name.toUpperCase() === line.description.toUpperCase());
      allLedger.push({
        id: `${receiptId}-${line.id}`,
        company,
        materialId: line.storeItemId || line.description,
        timestamp: today,
        mvmntCode: '101',
        qty: line.qty,
        uom: line.unit,
        valuation: line.rate,
        balanceAfter: afterItem?.quantity || line.qty,
        referenceDoc: receiptId,
        user: header.receivedBy,
        remarks: `Vendor: ${header.vendorName || 'Walk-in'} | DC: ${header.challanNo || '—'} | ${line.description}`,
        vendorName: header.vendorName,
        dcNo: header.challanNo,
      });
    }

    // ── Save store + ledger ────────────────────────────────────────────
    InventoryService.saveStore(allStore);
    InventoryService.saveStockLedger(allLedger);
    SyncService.markDirty('store_items');
    SyncService.markDirty('stock_ledger');

    // ── GL Entry ─────────────────────────────────────────────────────────
    if (totalAmount > 0) {
      try {
        // Group by category for GL
        const categoryTotals: Record<string, number> = {};
        for (const line of validLines) {
          if (line.condition === 'OK') {
            const cat = line.category || 'Hardware';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + line.amount;
          }
        }

        if (header.linkedReqId) {
          // ── ADVANCE SETTLEMENT: Req linked → settle advance ──────────
          const result = FinanceService.settleAdvance({
            company: company as any,
            reqId: header.linkedReqId,
            grnId: receiptId,
            actualAmount: totalAmount,
            categoryTotals,
            purchaserName: header.receivedBy,
          });

          SyncService.markDirty('ledger');
          settlementInfo = result; // used in toast below

        } else {
          // ── NO REQUISITION: Direct purchase, standard GL ─────────────
          const PAYMENT_CREDIT: Record<string, { code: string; name: string }> = {
            'Cash':             { code: '11112', name: 'Cash in Hand — Main' },
            'Petty Cash':       { code: '11111', name: 'Petty Cash' },
            'Personal Account': { code: '21114', name: 'Payable — Other Vendors' },
            'Bank Transfer':    { code: '11121', name: 'Bank — MCB Current' },
          };

          const creditAcc = PAYMENT_CREDIT[header.paymentMode] || PAYMENT_CREDIT['Cash'];
          const debitDetails = Object.entries(categoryTotals).map(([cat, amt]) => {
            const gl = CATEGORY_GL[cat] || CATEGORY_GL['Hardware'];
            return {
              accountId: `${company}-${gl.debitCode}`,
              debit: Math.round(amt),
              credit: 0,
              text: `${gl.debitCode} ${gl.debitName}`,
            };
          });

          const glTx = {
            id: `GL-${receiptId}`,
            company,
            docType: 'KR' as const,
            docDate: header.receiptDate,
            date: header.receiptDate,
            description: `[PARKED] GRN: ${header.vendorName || 'Walk-in'} | DC:${header.challanNo || '—'} | ${validLines.length} items`.toUpperCase(),
            referenceId: receiptId,
            status: 'Parked' as const,
            details: [
              ...debitDetails,
              {
                accountId: `${company}-${creditAcc.code}`,
                debit: 0,
                credit: Math.round(totalAmount),
                text: `${creditAcc.code} ${creditAcc.name} | ${header.paymentMode}`,
              }
            ],
          };

          const allGL = FinanceService.getLedger();
          allGL.push(glTx as any);
          FinanceService.saveLedger(allGL);
          SyncService.markDirty('ledger');
        }
      } catch (e) {
        console.error('GL posting failed:', e);
      }
    }

    // ── Auto-register tools in Tool Register ────────────────────────────
    let toolRegResult: { registered: number; toolIds: string[] } | null = null;
    const toolLines = validLines.filter(l =>
      l.condition === 'OK' && (
        l.materialType === 'Returnable Tool' ||
        l.materialType === 'Capital Asset' ||
        l.description.toUpperCase().match(/GRINDER|DRILL|SAW|PLIER|SCREWDRIVER|HAMMER|WRENCH|CUTTER|LEVEL|TAPE MEASURE|RIVET GUN|SILICONE GUN|TOOLBOX|KIT|CLAMP/)
      )
    );

    if (toolLines.length > 0) {
      try {
        toolRegResult = ToolService.autoRegisterFromGRN({
          company: company as string,
          lines: toolLines.map(l => ({
            description: l.description,
            qty: l.qty,
            rate: l.rate,
            category: l.category,
            materialType: l.materialType,
          })),
          grnId: receiptId,
          reqId: header.linkedReqId || undefined,
          receivedBy: header.receivedBy,
          purchaseDate: header.receiptDate,
        });
      } catch (e) {
        console.error('Tool auto-register failed:', e);
      }
    }

    // ── Update linked requisition status ───────────────────────────────
    if (header.linkedReqId) {
      try {
        const allReqs = InventoryService.getRequisitions();
        const reqIdx = allReqs.findIndex(r => r.id === header.linkedReqId);
        if (reqIdx >= 0) {
          (allReqs[reqIdx] as any).receiptStatus = 'Received';
          (allReqs[reqIdx] as any).receiptRef = receiptId;
          (allReqs[reqIdx] as any).receiptDate = header.receiptDate;
          InventoryService.saveRequisitions(allReqs);
        }
      } catch {}
    }

    // ── Done ──────────────────────────────────────────────────────────
    const settlementMsg = settlementInfo
      ? `\nAdvance Settlement: ${settlementInfo.status}${settlementInfo.variance !== 0 ? ` (PKR ${Math.abs(settlementInfo.variance).toLocaleString()} ${settlementInfo.variance < 0 ? 'refund due' : 'extra paid'})` : ''}`
      : '\nParked GL entry created.';

    const toolMsg = toolRegResult && toolRegResult.registered > 0
      ? `\n${toolRegResult.registered} tool(s) auto-registered: ${toolRegResult.toolIds.join(', ')}`
      : '';

    toast.success(
      `GRN ${receiptId} posted!\n${validLines.length} items received, ${damagedLines.length} damaged/short.${settlementMsg}${toolMsg}`,
      { duration: 6000 }
    );

    refreshData();
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setHeader({
      vendorName: '', challanNo: '',
      challanDate: new Date().toISOString().split('T')[0],
      receiptDate: new Date().toISOString().split('T')[0],
      linkedReqId: '', paymentMode: 'Cash',
      receivedBy: '', remarks: '',
    });
    setLines([blankLine(), blankLine(), blankLine()]);
  };

  if (!isOpen) return null;

  // ═══════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 overflow-y-auto p-4">
      <div className="bg-slate-50 rounded-[2rem] shadow-2xl w-full max-w-6xl my-8 overflow-hidden">

        {/* ── Header Bar ──────────────────────────────────────────── */}
        <div className="bg-slate-900 text-white px-8 py-5 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-emerald-500/20 rounded-xl"><Package size={22} /></div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-wide">GRN — Goods Receipt — {company}</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Aluminium · Hardware · Consumables · Tools
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X size={20} /></button>
        </div>

        <div className="p-8 space-y-6">

          {/* ── Receipt Header ──────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Vendor / Supplier</label>
                <input type="text" className="sap-input w-full font-bold uppercase"
                  placeholder="e.g. Japan Metal, Chawla..."
                  value={header.vendorName} onChange={e => setHeader({...header, vendorName: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Delivery Challan #</label>
                <input type="text" className="sap-input w-full font-bold uppercase"
                  value={header.challanNo} onChange={e => setHeader({...header, challanNo: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Receipt Date</label>
                <input type="date" className="sap-input w-full font-bold"
                  value={header.receiptDate} onChange={e => setHeader({...header, receiptDate: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Received By</label>
                <input type="text" className="sap-input w-full font-bold uppercase"
                  placeholder="Store keeper name"
                  value={header.receivedBy} onChange={e => setHeader({...header, receivedBy: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Link Requisition</label>
                <select className="sap-input w-full font-bold uppercase text-blue-600"
                  value={header.linkedReqId}
                  onChange={e => {
                    setHeader({...header, linkedReqId: e.target.value});
                    if (e.target.value) fillFromRequisition(e.target.value);
                  }}>
                  <option value="">— None —</option>
                  {requisitions.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.id} | {r.subCategory} | PKR {(r.totalValue || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Payment Mode</label>
                <select className="sap-input w-full font-bold uppercase text-emerald-600"
                  value={header.paymentMode}
                  onChange={e => setHeader({...header, paymentMode: e.target.value})}>
                  <option>Cash</option>
                  <option>Petty Cash</option>
                  <option>Personal Account</option>
                  <option>Bank Transfer</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Remarks</label>
                <input type="text" className="sap-input w-full font-bold"
                  placeholder="Any notes..."
                  value={header.remarks} onChange={e => setHeader({...header, remarks: e.target.value})} />
              </div>
            </div>
          </div>

          {/* ── Line Items Table ────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <ShoppingBag size={16} className="text-slate-500" />
                <span className="text-xs font-black uppercase text-slate-600 tracking-widest">Line Items</span>
              </div>
              <button onClick={addLine} className="flex items-center space-x-1 text-xs font-bold text-blue-600 hover:text-blue-800">
                <Plus size={14} /><span>Add Line</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest text-[10px]">
                    <th className="px-3 py-3 text-left w-8">#</th>
                    <th className="px-3 py-3 text-left min-w-[200px]">Description</th>
                    <th className="px-3 py-3 text-left w-28">Category</th>
                    <th className="px-3 py-3 text-left w-28">Type</th>
                    <th className="px-3 py-3 text-center w-20">Qty</th>
                    <th className="px-3 py-3 text-left w-24">Unit</th>
                    <th className="px-3 py-3 text-right w-24">Rate</th>
                    <th className="px-3 py-3 text-right w-28">Amount</th>
                    <th className="px-3 py-3 text-center w-24">Condition</th>
                    <th className="px-3 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={line.id} className="border-b border-slate-50 hover:bg-blue-50/30">
                      <td className="px-3 py-2 text-slate-400 font-bold">{idx + 1}</td>
                      <td className="px-3 py-2 relative">
                        <input type="text" className="w-full p-2 bg-slate-50 border rounded-lg font-bold uppercase text-sm"
                          placeholder="Type to search or enter new..."
                          value={line.description}
                          onFocus={() => setActiveLineId(line.id)}
                          onChange={e => {
                            updateLine(line.id, { description: e.target.value });
                            setActiveLineId(line.id);
                          }}
                        />
                        {activeLineId === line.id && line.description.length >= 2 && (
                          <div className="absolute z-50 top-full left-3 right-3 bg-white border rounded-xl shadow-xl max-h-40 overflow-y-auto">
                            {getSearchResults(line.description).map(item => (
                              <button key={item.id}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs font-bold border-b border-slate-50"
                                onClick={() => selectStoreItem(line.id, item)}>
                                <span className="text-slate-800">{item.name}</span>
                                <span className="text-slate-400 ml-2">({item.quantity} {item.unit} in stock)</span>
                              </button>
                            ))}
                            {getSearchResults(line.description).length === 0 && (
                              <div className="px-3 py-2 text-slate-400 text-[10px] font-bold">
                                New item — will be created in store
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select className="w-full p-2 bg-slate-50 border rounded-lg font-bold text-[11px]"
                          value={line.category} onChange={e => updateLine(line.id, { category: e.target.value })}>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select className={`w-full p-2 border rounded-lg font-bold text-[11px] ${
                          line.materialType === 'Returnable Tool' || line.materialType === 'Capital Asset' ? 'bg-purple-50 text-purple-700' : 'bg-slate-50'
                        }`}
                          value={line.materialType} onChange={e => updateLine(line.id, { materialType: e.target.value })}>
                          {MATERIAL_TYPES.map(mt => <option key={mt} value={mt}>{mt}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" className="w-full p-2 bg-slate-50 border rounded-lg font-black text-center"
                          value={line.qty || ''} onChange={e => updateLine(line.id, { qty: Number(e.target.value) })} />
                      </td>
                      <td className="px-3 py-2">
                        <select className="w-full p-2 bg-slate-50 border rounded-lg font-bold text-[11px]"
                          value={line.unit} onChange={e => updateLine(line.id, { unit: e.target.value })}>
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" className="w-full p-2 bg-slate-50 border rounded-lg font-bold text-right"
                          value={line.rate || ''} onChange={e => updateLine(line.id, { rate: Number(e.target.value) })} />
                      </td>
                      <td className="px-3 py-2 text-right font-black text-slate-700">
                        PKR {line.amount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <select className={`w-full p-2 border rounded-lg font-bold text-[11px] ${
                          line.condition === 'OK' ? 'bg-emerald-50 text-emerald-700' :
                          line.condition === 'Damaged' ? 'bg-red-50 text-red-700' :
                          'bg-amber-50 text-amber-700'
                        }`}
                          value={line.condition} onChange={e => updateLine(line.id, { condition: e.target.value })}>
                          <option value="OK">OK</option>
                          <option value="Damaged">Damaged</option>
                          <option value="Short">Short</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeLine(line.id)} className="p-1 text-slate-300 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Totals Footer ──────────────────────────────────── */}
            <div className="px-6 py-4 bg-slate-50 border-t flex items-center justify-between">
              <div className="flex items-center space-x-6 text-xs">
                <span className="font-bold text-slate-500">{validLines.length} items</span>
                <span className="font-bold text-slate-500">{totalQty} total qty</span>
                {damagedLines.length > 0 && (
                  <span className="font-bold text-red-500 flex items-center gap-1">
                    <AlertTriangle size={12} /> {damagedLines.length} damaged/short
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase text-slate-400">Total Value</p>
                <p className="text-2xl font-black text-slate-800">PKR {totalAmount.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* ── GL Preview ─────────────────────────────────────── */}
          {validLines.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">GL Entry Preview (Parked)</p>
              <div className="space-y-2">
                {Object.entries(
                  validLines.filter(l => l.condition === 'OK').reduce((acc, l) => {
                    const cat = l.category || 'Hardware';
                    acc[cat] = (acc[cat] || 0) + l.amount;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([cat, amt]) => {
                  const gl = CATEGORY_GL[cat] || CATEGORY_GL['Hardware'];
                  return (
                    <div key={cat} className="flex justify-between items-center bg-rose-50 rounded-xl px-4 py-2">
                      <span className="text-xs font-bold text-rose-700">Dr {gl.debitCode} — {gl.debitName}</span>
                      <span className="text-xs font-black text-rose-800">PKR {Math.round(amt).toLocaleString()}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between items-center bg-emerald-50 rounded-xl px-4 py-2">
                  <span className="text-xs font-bold text-emerald-700">
                    Cr {header.paymentMode === 'Petty Cash' ? '11111' : header.paymentMode === 'Personal Account' ? '21114' : header.paymentMode === 'Bank Transfer' ? '11121' : '11112'} — {header.paymentMode}
                  </span>
                  <span className="text-xs font-black text-emerald-800">PKR {totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Action Buttons ──────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="px-8 py-3 rounded-xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-100">
              Cancel
            </button>
            <button onClick={handlePost}
              disabled={validLines.length === 0}
              className="px-10 py-3 bg-emerald-600 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 active:scale-95 transition-all">
              <CheckCircle2 size={18} /><span>Post Receipt ({validLines.length} items)</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default GTKStoreReceipt;
