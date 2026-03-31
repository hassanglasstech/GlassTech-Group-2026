/**
 * OpeningBalance.tsx — Stock Opening Balance Entry
 * 
 * Purpose: Allow entering initial stock balances for materials that existed 
 * before ERP go-live. Creates StoreItem (if new), Material Ledger entry 
 * (mvmntCode 561), and GL entry (Dr Inventory / Cr Opening Balance Equity).
 *
 * Features:
 * - Single item entry with material search
 * - Bulk CSV upload for mass opening balances
 * - Data Health Dashboard — highlights missing/incomplete data across workflows
 * - Opening Balance ledger history view
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { StoreItem, MaterialLedgerEntry, Product } from '@/modules/shared/types';
import {
  Package, Upload, AlertTriangle, CheckCircle2, Search, Plus, Trash2,
  FileSpreadsheet, ClipboardCheck, ArrowDown, Info, BarChart3, X,
  ChevronDown, ChevronRight, ShieldAlert
} from 'lucide-react';

// ── GL Account for Opening Balance Equity ─────────────────────────────────
const OB_GL = {
  // Inventory accounts per company type
  INVENTORY_GLASS:  '11511',   // Float Glass inventory
  INVENTORY_HW:     '11512',   // Hardware inventory
  INVENTORY_ALUM:   '11513',   // Aluminium inventory (GTK/GTI)
  INVENTORY_CONS:   '11514',   // Consumables
  // Opening Balance Equity — will auto-create if not exists
  OB_EQUITY:        '31901',   // Opening Balance Equity
};

// ── Types ──────────────────────────────────────────────────────────────────
interface OBLine {
  id: string;
  productId: string;
  description: string;
  category: string;
  unit: string;
  qty: number;
  rate: number;
  totalValue: number;
  storageBin: string;
  // For glass items
  thickness?: string;
  sheetSize?: string;
  // Search
  searchQuery: string;
  showSuggestions: boolean;
}

interface HealthIssue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  itemId?: string;
  itemName?: string;
}

const emptyLine = (): OBLine => ({
  id: `OB-L-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  productId: '', description: '', category: '', unit: 'SqFt',
  qty: 0, rate: 0, totalValue: 0, storageBin: 'MAIN',
  searchQuery: '', showSuggestions: false,
});

// ══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════
const OpeningBalance: React.FC<{ refreshData: () => void }> = ({ refreshData }) => {
  const company = useAppStore(state => state.selectedCompany);
  const [activeView, setActiveView] = useState<'entry' | 'bulk' | 'health' | 'history'>('entry');

  // ── Single Entry State ────────────────────────────────────────────────
  const [obDate, setObDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<OBLine[]>([emptyLine()]);
  const [remarks, setRemarks] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  // ── Bulk Upload State ─────────────────────────────────────────────────
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<OBLine[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);

  // ── Data ───────────────────────────────────────────────────────────────
  const allProducts = useMemo(() => SalesService.getProducts().filter(p => p.company === company), [company]);
  const allStore = useMemo(() => InventoryService.getStore().filter(s => s.company === company), [company]);
  const allLedger = useMemo(() => InventoryService.getStockLedger().filter(l => l.company === company), [company]);

  // ── Product Search ─────────────────────────────────────────────────────
  const getFilteredProducts = useCallback((query: string) => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return allProducts.filter(p =>
      p.description.toLowerCase().includes(q) ||
      (p.modelNo || '').toLowerCase().includes(q) ||
      (p.thickness || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [allProducts]);

  // ── Line Handlers ──────────────────────────────────────────────────────
  const updateLine = (idx: number, patch: Partial<OBLine>) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, ...patch };
      if ('qty' in patch || 'rate' in patch) {
        updated.totalValue = Number(((updated.qty || 0) * (updated.rate || 0)).toFixed(2));
      }
      return updated;
    }));
  };

  const selectProduct = (idx: number, product: Product) => {
    updateLine(idx, {
      productId: product.id,
      description: product.description,
      category: product.category || 'Raw',
      unit: product.unit || 'SqFt',
      thickness: product.thickness,
      sheetSize: product.sheetSize,
      searchQuery: product.description,
      showSuggestions: false,
    });
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Resolve Inventory GL Account ───────────────────────────────────────
  const getInventoryAccount = (category: string) => {
    const isGlass = company === 'Glassco' || company === 'GlassCo';
    const isAlum = company === 'GTK' || company === 'GTI';
    if (category === 'Hardware') return { code: OB_GL.INVENTORY_HW, name: 'Hardware Inventory' };
    if (category === 'Consumable') return { code: OB_GL.INVENTORY_CONS, name: 'Consumables Inventory' };
    if (isAlum || category === 'Profile') return { code: OB_GL.INVENTORY_ALUM, name: 'Aluminium / Profile Inventory' };
    return { code: OB_GL.INVENTORY_GLASS, name: 'Glass Inventory' };
  };

  // ══════════════════════════════════════════════════════════════════════
  // POST OPENING BALANCE
  // ══════════════════════════════════════════════════════════════════════
  const postOpeningBalances = (linesToPost: OBLine[]) => {
    // Validation
    const errors: string[] = [];
    linesToPost.forEach((l, i) => {
      if (!l.description) errors.push(`Line ${i + 1}: Material description is required`);
      if (l.qty <= 0) errors.push(`Line ${i + 1}: Quantity must be > 0`);
      if (l.rate <= 0) errors.push(`Line ${i + 1}: Rate must be > 0`);
    });
    if (errors.length > 0) {
      errors.forEach(e => toast.error(e));
      return false;
    }

    setIsPosting(true);

    try {
      const store = InventoryService.getStore();
      const ledger = InventoryService.getStockLedger();
      const obId = `OB-${company}-${obDate.replace(/-/g, '')}`;
      let glTotal = 0;

      linesToPost.forEach((line, lineIdx) => {
        // ── Find or create StoreItem ─────────────────────────────────
        const materialId = line.productId || `MAT-${company}-${Date.now()}-${lineIdx}`;
        let itemIdx = store.findIndex(s => s.id === materialId && s.company === company);
        let item: StoreItem;

        if (itemIdx !== -1) {
          item = { ...store[itemIdx] };
        } else {
          // Create new StoreItem
          item = {
            id: materialId, company: company as any,
            name: line.description,
            category: (line.category || 'Raw') as StoreItem['category'],
            quantity: 0, unrestrictedQty: 0, qiQty: 0,
            blockedQty: 0, reservedQty: 0, consignmentQty: 0,
            unit: line.unit || 'SqFt',
            minLevel: 0, reorderPoint: 0,
            movingAveragePrice: 0, totalValue: 0,
            storageBin: line.storageBin || 'MAIN',
            lastMovementDate: obDate,
          };
        }

        // ── Update Stock Quantities ──────────────────────────────────
        item.quantity = (item.quantity || 0) + line.qty;
        item.unrestrictedQty = (item.unrestrictedQty || 0) + line.qty;
        item.totalValue = (item.totalValue || 0) + line.totalValue;
        item.movingAveragePrice = item.quantity > 0
          ? Number((item.totalValue / item.quantity).toFixed(2))
          : line.rate;
        item.lastMovementDate = obDate;

        if (itemIdx !== -1) store[itemIdx] = item; else store.push(item);

        // ── Material Ledger Entry ────────────────────────────────────
        const ledgerEntry: MaterialLedgerEntry = {
          id: `${obId}-L${lineIdx + 1}`,
          company: company as any,
          materialId,
          timestamp: new Date(obDate).toISOString(),
          mvmntCode: '561',
          qty: line.qty,
          uom: line.unit || 'SqFt',
          valuation: line.rate,
          balanceAfter: item.quantity,
          referenceDoc: obId,
          user: 'Opening Balance',
          remarks: `Opening Balance — ${line.description}${remarks ? ' | ' + remarks : ''}`,
        };
        ledger.push(ledgerEntry);
        glTotal += line.totalValue;
      });

      // ── Save Stock & Ledger ────────────────────────────────────────
      InventoryService.saveStore(store);
      InventoryService.saveStockLedger(ledger);

      // ── GL Entry: Dr Inventory / Cr Opening Balance Equity ─────────
      if (glTotal > 0) {
        // Ensure OB Equity account exists
        const obEquityAcc = FinanceService.ensureAccount(
          company as any,
          'Opening Balance Equity',
          4, null, 'Equity',
          OB_GL.OB_EQUITY
        );

        // Group by inventory account
        const invGroups: Record<string, number> = {};
        linesToPost.forEach(line => {
          const invAcc = getInventoryAccount(line.category);
          invGroups[invAcc.code] = (invGroups[invAcc.code] || 0) + line.totalValue;
        });

        const glDetails: any[] = [];
        Object.entries(invGroups).forEach(([accCode, amount]) => {
          const invAcc = FinanceService.ensureAccount(
            company as any,
            accCode === OB_GL.INVENTORY_GLASS ? 'Glass Inventory' :
            accCode === OB_GL.INVENTORY_HW ? 'Hardware Inventory' :
            accCode === OB_GL.INVENTORY_ALUM ? 'Aluminium/Profile Inventory' :
            'Consumables Inventory',
            4, null, 'Asset', accCode
          );
          glDetails.push({
            accountId: invAcc.id,
            debit: amount,
            credit: 0,
            text: `Opening Balance — Inventory (${linesToPost.length} items)`,
          });
        });

        glDetails.push({
          accountId: obEquityAcc.id,
          debit: 0,
          credit: glTotal,
          text: `Opening Balance Equity — Stock ${obDate}`,
        });

        FinanceService.recordTransaction({
          id: `GL-${obId}`,
          company: company as any,
          docType: 'JV' as any,
          docDate: obDate,
          date: obDate,
          description: `Opening Balance — ${linesToPost.length} material(s) — PKR ${glTotal.toLocaleString()}`,
          referenceId: obId,
          status: 'Posted',
          details: glDetails,
        });
      }

      toast.success(`Opening Balance posted: ${linesToPost.length} items, PKR ${glTotal.toLocaleString()}`);
      setLines([emptyLine()]);
      setRemarks('');
      setParsedRows([]);
      setCsvText('');
      refreshData();
      setIsPosting(false);
      return true;
    } catch (err) {
      console.error('[OB Post Error]', err);
      toast.error('Failed to post opening balance. Check console.');
      setIsPosting(false);
      return false;
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // CSV BULK PARSER
  // ══════════════════════════════════════════════════════════════════════
  const parseCSV = () => {
    if (!csvText.trim()) { toast.error('Paste CSV data first'); return; }
    const errors: string[] = [];
    const rows: OBLine[] = [];
    const rawLines = csvText.trim().split('\n');

    // Expected format: Description, Category, Unit, Qty, Rate, StorageBin
    // Skip header if present
    const startIdx = rawLines[0]?.toLowerCase().includes('description') ? 1 : 0;

    rawLines.slice(startIdx).forEach((raw, i) => {
      const cols = raw.split(',').map(c => c.trim());
      if (cols.length < 5) {
        errors.push(`Row ${i + 1}: Need at least 5 columns (Description, Category, Unit, Qty, Rate)`);
        return;
      }
      const [desc, cat, unit, qtyStr, rateStr, bin] = cols;
      const qty = parseFloat(qtyStr);
      const rate = parseFloat(rateStr);

      if (!desc) { errors.push(`Row ${i + 1}: Description empty`); return; }
      if (isNaN(qty) || qty <= 0) { errors.push(`Row ${i + 1}: Invalid qty "${qtyStr}"`); return; }
      if (isNaN(rate) || rate <= 0) { errors.push(`Row ${i + 1}: Invalid rate "${rateStr}"`); return; }

      // Try to match with existing product
      const matchedProduct = allProducts.find(p =>
        p.description.toLowerCase() === desc.toLowerCase()
      );

      rows.push({
        id: `OB-CSV-${i}`,
        productId: matchedProduct?.id || '',
        description: desc,
        category: cat || 'Raw',
        unit: unit || 'SqFt',
        qty, rate,
        totalValue: Number((qty * rate).toFixed(2)),
        storageBin: bin || 'MAIN',
        thickness: matchedProduct?.thickness,
        sheetSize: matchedProduct?.sheetSize,
        searchQuery: desc,
        showSuggestions: false,
      });
    });

    setBulkErrors(errors);
    setParsedRows(rows);
    if (rows.length > 0) toast.success(`Parsed ${rows.length} rows${errors.length > 0 ? `, ${errors.length} errors` : ''}`);
  };

  // ══════════════════════════════════════════════════════════════════════
  // DATA HEALTH CHECK
  // ══════════════════════════════════════════════════════════════════════
  const healthIssues = useMemo((): HealthIssue[] => {
    const issues: HealthIssue[] = [];

    allStore.forEach(item => {
      // Zero MAP (no rate set)
      if (item.quantity > 0 && (item.movingAveragePrice || 0) <= 0) {
        issues.push({
          severity: 'critical', category: 'Valuation',
          message: `Stock of ${item.quantity.toFixed(1)} ${item.unit} but zero rate — valuation incomplete`,
          itemId: item.id, itemName: item.name,
        });
      }

      // Negative balance
      if (item.quantity < 0 || item.unrestrictedQty < 0) {
        issues.push({
          severity: 'critical', category: 'Balance',
          message: `Negative stock balance: ${item.quantity.toFixed(1)} ${item.unit} — likely missed GRN or wrong issuance`,
          itemId: item.id, itemName: item.name,
        });
      }

      // Stock exists but no ledger trail
      const hasLedger = allLedger.some(l => l.materialId === item.id);
      if (item.quantity > 0 && !hasLedger) {
        issues.push({
          severity: 'warning', category: 'Audit Trail',
          message: `Stock exists but no movement history — consider adding Opening Balance entry`,
          itemId: item.id, itemName: item.name,
        });
      }

      // Missing reorder point for items with stock
      if (item.quantity > 0 && (item.reorderPoint || 0) <= 0) {
        issues.push({
          severity: 'info', category: 'Reorder',
          message: `No reorder point set — won't trigger low stock alerts`,
          itemId: item.id, itemName: item.name,
        });
      }

      // Unrestricted + Defective doesn't match total
      const calcTotal = (item.unrestrictedQty || 0) + (item.defectiveSqft || 0) + (item.qiQty || 0) + (item.blockedQty || 0);
      if (item.quantity > 0 && Math.abs(calcTotal - item.quantity) > 0.5) {
        issues.push({
          severity: 'warning', category: 'Stock Split',
          message: `Total (${item.quantity.toFixed(1)}) ≠ Unrestricted (${(item.unrestrictedQty || 0).toFixed(1)}) + Defective (${(item.defectiveSqft || 0).toFixed(1)}) + QI (${(item.qiQty || 0).toFixed(1)}) + Blocked (${(item.blockedQty || 0).toFixed(1)}) — mismatch of ${Math.abs(calcTotal - item.quantity).toFixed(1)}`,
          itemId: item.id, itemName: item.name,
        });
      }
    });

    // Products in master but no stock record
    allProducts.forEach(p => {
      const hasStore = allStore.some(s => s.id === p.id);
      if (!hasStore && p.category !== 'Service') {
        issues.push({
          severity: 'info', category: 'Coverage',
          message: `In Product Master but no stock record — add Opening Balance if physical stock exists`,
          itemId: p.id, itemName: p.description,
        });
      }
    });

    // Sort: critical first, then warning, then info
    const order = { critical: 0, warning: 1, info: 2 };
    return issues.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [allStore, allLedger, allProducts]);

  // ── OB History ─────────────────────────────────────────────────────────
  const obHistory = useMemo(() =>
    allLedger
      .filter(l => l.mvmntCode === '561')
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  [allLedger]);

  // ── Health Summary ─────────────────────────────────────────────────────
  const criticalCount = healthIssues.filter(i => i.severity === 'critical').length;
  const warningCount = healthIssues.filter(i => i.severity === 'warning').length;
  const infoCount = healthIssues.filter(i => i.severity === 'info').length;

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Health Summary Banner ─────────────────────────────────────── */}
      {healthIssues.length > 0 && (
        <div className={`rounded-2xl border p-4 flex items-center justify-between ${criticalCount > 0 ? 'bg-red-50 border-red-200' : warningCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex items-center gap-3">
            <ShieldAlert size={18} className={criticalCount > 0 ? 'text-red-500' : warningCount > 0 ? 'text-amber-500' : 'text-blue-500'} />
            <div>
              <p className="text-xs font-black uppercase">
                Data Health: {criticalCount > 0 ? 'Action Required' : warningCount > 0 ? 'Needs Attention' : 'Good'}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {criticalCount > 0 && <span className="text-red-600 font-bold mr-2">{criticalCount} Critical</span>}
                {warningCount > 0 && <span className="text-amber-600 font-bold mr-2">{warningCount} Warnings</span>}
                {infoCount > 0 && <span className="text-blue-600 font-bold">{infoCount} Suggestions</span>}
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveView('health')}
            className="text-[10px] font-black uppercase px-3 py-1.5 rounded-lg bg-white border shadow-sm hover:shadow-md transition-all"
          >
            View Details
          </button>
        </div>
      )}

      {/* ── Sub-Navigation ────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'entry', label: 'Single Entry', icon: Plus },
          { id: 'bulk', label: 'Bulk Upload (CSV)', icon: Upload },
          { id: 'health', label: `Data Health (${healthIssues.length})`, icon: ShieldAlert },
          { id: 'history', label: `OB History (${obHistory.length})`, icon: ClipboardCheck },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeView === tab.id ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border hover:bg-slate-50'}`}
          >
            <tab.icon size={14} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SINGLE ENTRY VIEW                                            */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeView === 'entry' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b bg-slate-50/50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black uppercase text-slate-800">Opening Balance Entry</h2>
              <p className="text-[10px] text-slate-400 mt-1">Add initial stock balances for materials that exist before ERP go-live</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-bold text-slate-500 uppercase">OB Date</label>
              <input
                type="date"
                value={obDate}
                onChange={e => setObDate(e.target.value)}
                className="px-3 py-2 border rounded-xl text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Lines */}
          <div className="p-6 space-y-4">
            {lines.map((line, idx) => (
              <div key={line.id} className="border rounded-xl p-4 bg-slate-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Line {idx + 1}</span>
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(idx)} className="text-red-400 hover:text-red-600 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  {/* Material Search — 5 cols */}
                  <div className="md:col-span-5 relative">
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Material *</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                      <input
                        type="text"
                        placeholder="Search material..."
                        value={line.searchQuery}
                        onChange={e => {
                          updateLine(idx, { searchQuery: e.target.value, showSuggestions: true });
                          if (!e.target.value) updateLine(idx, { productId: '', description: '' });
                        }}
                        onFocus={() => updateLine(idx, { showSuggestions: true })}
                        onBlur={() => setTimeout(() => updateLine(idx, { showSuggestions: false }), 200)}
                        className="w-full pl-9 pr-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {/* Suggestions Dropdown */}
                    {line.showSuggestions && line.searchQuery.length >= 2 && (
                      <div className="absolute z-20 mt-1 w-full bg-white border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {getFilteredProducts(line.searchQuery).map(p => (
                          <button
                            key={p.id}
                            onClick={() => selectProduct(idx, p)}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b last:border-0"
                          >
                            <p className="text-xs font-bold text-slate-700">{p.description}</p>
                            <p className="text-[9px] text-slate-400">{p.category} · {p.unit}{p.thickness ? ` · ${p.thickness}` : ''}</p>
                          </button>
                        ))}
                        {getFilteredProducts(line.searchQuery).length === 0 && (
                          <div className="px-3 py-2 text-[10px] text-slate-400 italic">
                            No match found — type description below to create new
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Description — editable fallback — 3 cols */}
                  <div className="md:col-span-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Description *</label>
                    <input
                      type="text"
                      value={line.description}
                      onChange={e => updateLine(idx, { description: e.target.value })}
                      placeholder="e.g. Clear Glass 5mm 84x144"
                      className="w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Category — 2 cols */}
                  <div className="md:col-span-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Category</label>
                    <select
                      value={line.category}
                      onChange={e => updateLine(idx, { category: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none bg-white cursor-pointer"
                    >
                      <option value="Raw">Raw</option>
                      <option value="Hardware">Hardware</option>
                      <option value="Consumable">Consumable</option>
                      <option value="Profile">Profile</option>
                    </select>
                  </div>

                  {/* Unit — 2 cols */}
                  <div className="md:col-span-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Unit</label>
                    <select
                      value={line.unit}
                      onChange={e => updateLine(idx, { unit: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none bg-white cursor-pointer"
                    >
                      {['SqFt','Unit','RunningFt','Inch','KG','Mtr','Sheet','PCS','Set','Pair','Roll','Pkt','Box','Ltr','Tube'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Second Row: Qty, Rate, Value, Bin */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Quantity *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={line.qty > 0 ? line.qty : ''}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        updateLine(idx, { qty: parseFloat(val) || 0 });
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Rate (PKR) *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={line.rate > 0 ? line.rate : ''}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        updateLine(idx, { rate: parseFloat(val) || 0 });
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Total Value</label>
                    <div className="px-3 py-2 border rounded-lg text-xs font-black bg-emerald-50 text-emerald-700">
                      PKR {line.totalValue.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Storage Bin</label>
                    <input
                      type="text"
                      value={line.storageBin}
                      onChange={e => updateLine(idx, { storageBin: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* Add Line + Remarks */}
            <div className="flex items-center justify-between">
              <button
                onClick={addLine}
                className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-xs font-bold"
              >
                <Plus size={14} /> Add Line
              </button>
              <div className="flex-1 max-w-md ml-4">
                <input
                  type="text"
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="General remarks (optional)"
                  className="w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Footer — Summary + Post Button */}
          <div className="p-6 border-t bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-6 text-xs">
              <span className="font-bold text-slate-500">{lines.filter(l => l.description).length} item(s)</span>
              <span className="font-black text-blue-700 text-sm">
                Total: PKR {lines.reduce((s, l) => s + l.totalValue, 0).toLocaleString()}
              </span>
            </div>
            <button
              onClick={() => postOpeningBalances(lines)}
              disabled={isPosting || lines.every(l => !l.description)}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg flex items-center gap-2"
            >
              {isPosting ? (
                <><span className="animate-spin">⏳</span> Posting...</>
              ) : (
                <><CheckCircle2 size={16} /> Post Opening Balance</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* BULK UPLOAD VIEW                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeView === 'bulk' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-6 border-b bg-slate-50/50">
            <h2 className="text-sm font-black uppercase text-slate-800">Bulk Opening Balance — CSV Upload</h2>
            <p className="text-[10px] text-slate-400 mt-1">
              Format: <span className="font-mono bg-slate-100 px-1 rounded">Description, Category, Unit, Qty, Rate, StorageBin</span>
            </p>
          </div>

          <div className="p-6 space-y-4">
            {/* Date */}
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-bold text-slate-500 uppercase">OB Date</label>
              <input
                type="date"
                value={obDate}
                onChange={e => setObDate(e.target.value)}
                className="px-3 py-2 border rounded-xl text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* CSV Input */}
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              rows={10}
              placeholder={`Description, Category, Unit, Qty, Rate, StorageBin\nClear Glass 5mm 84x144, Raw, SqFt, 500, 45, MAIN\nAluminium Handle Chrome, Hardware, PCS, 200, 350, RACK-A\nSilicone Tube, Consumable, Tube, 50, 120, SHELF-3`}
              className="w-full px-4 py-3 border rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />

            <div className="flex gap-3">
              <button
                onClick={parseCSV}
                className="px-6 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-black uppercase hover:bg-slate-900 transition-all flex items-center gap-2"
              >
                <FileSpreadsheet size={14} /> Parse CSV
              </button>
              {parsedRows.length > 0 && (
                <button
                  onClick={() => { setCsvText(''); setParsedRows([]); setBulkErrors([]); }}
                  className="px-4 py-2.5 border rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Parse Errors */}
            {bulkErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-xs font-black text-red-700 mb-2">Parse Errors:</p>
                {bulkErrors.map((e, i) => (
                  <p key={i} className="text-[10px] text-red-600">• {e}</p>
                ))}
              </div>
            )}

            {/* Parsed Preview */}
            {parsedRows.length > 0 && (
              <div className="border rounded-xl overflow-hidden">
                <div className="p-3 bg-emerald-50 border-b flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-700">
                    {parsedRows.length} rows parsed — Total: PKR {parsedRows.reduce((s, r) => s + r.totalValue, 0).toLocaleString()}
                  </span>
                  <button
                    onClick={() => postOpeningBalances(parsedRows)}
                    disabled={isPosting}
                    className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase hover:bg-emerald-700 disabled:opacity-40 transition-all flex items-center gap-2"
                  >
                    <CheckCircle2 size={14} /> Post All
                  </button>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400">
                    <tr>
                      <th className="px-4 py-2">#</th>
                      <th className="px-4 py-2">Description</th>
                      <th className="px-4 py-2">Category</th>
                      <th className="px-4 py-2">Unit</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Rate</th>
                      <th className="px-4 py-2 text-right">Value</th>
                      <th className="px-4 py-2">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-4 py-2 font-bold">{r.description}</td>
                        <td className="px-4 py-2">{r.category}</td>
                        <td className="px-4 py-2">{r.unit}</td>
                        <td className="px-4 py-2 text-right font-bold">{r.qty.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{r.rate.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-black text-blue-600">{r.totalValue.toLocaleString()}</td>
                        <td className="px-4 py-2">
                          {r.productId ? (
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Matched</span>
                          ) : (
                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">New Item</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* DATA HEALTH VIEW                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeView === 'health' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-6 border-b bg-slate-50/50">
            <h2 className="text-sm font-black uppercase text-slate-800">Data Health Dashboard</h2>
            <p className="text-[10px] text-slate-400 mt-1">
              Highlights incomplete or inconsistent data across your material management workflows
            </p>
          </div>

          {/* Summary Cards */}
          <div className="p-6 grid grid-cols-3 gap-4">
            <div className={`rounded-xl p-4 border ${criticalCount > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-2xl font-black text-red-600">{criticalCount}</p>
              <p className="text-[10px] font-bold text-red-500 uppercase mt-1">Critical Issues</p>
              <p className="text-[9px] text-slate-400 mt-1">Zero valuation, negative stock</p>
            </div>
            <div className={`rounded-xl p-4 border ${warningCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-2xl font-black text-amber-600">{warningCount}</p>
              <p className="text-[10px] font-bold text-amber-500 uppercase mt-1">Warnings</p>
              <p className="text-[9px] text-slate-400 mt-1">Missing audit trail, stock mismatch</p>
            </div>
            <div className={`rounded-xl p-4 border ${infoCount > 0 ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-2xl font-black text-blue-600">{infoCount}</p>
              <p className="text-[10px] font-bold text-blue-500 uppercase mt-1">Suggestions</p>
              <p className="text-[9px] text-slate-400 mt-1">Missing reorder points, unlinked items</p>
            </div>
          </div>

          {/* Issues List */}
          <div className="px-6 pb-6">
            {healthIssues.length === 0 ? (
              <div className="text-center py-12 text-slate-300">
                <CheckCircle2 size={40} className="mx-auto mb-3" />
                <p className="font-bold uppercase">All Clear — No issues found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {healthIssues.map((issue, i) => (
                  <div
                    key={i}
                    className={`rounded-xl px-4 py-3 border flex items-start gap-3 ${
                      issue.severity === 'critical' ? 'bg-red-50/50 border-red-100' :
                      issue.severity === 'warning' ? 'bg-amber-50/50 border-amber-100' :
                      'bg-blue-50/50 border-blue-100'
                    }`}
                  >
                    {issue.severity === 'critical' ? <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" /> :
                     issue.severity === 'warning' ? <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" /> :
                     <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          issue.severity === 'critical' ? 'bg-red-100 text-red-700' :
                          issue.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {issue.category}
                        </span>
                        {issue.itemName && (
                          <span className="text-[10px] font-black text-slate-600 truncate max-w-[200px]">{issue.itemName}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-600 mt-1">{issue.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* OB HISTORY VIEW                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeView === 'history' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-6 border-b bg-slate-50/50">
            <h2 className="text-sm font-black uppercase text-slate-800">Opening Balance History</h2>
            <p className="text-[10px] text-slate-400 mt-1">All stock entries posted via Opening Balance (mvmntCode 561)</p>
          </div>

          {obHistory.length === 0 ? (
            <div className="text-center py-16 text-slate-300">
              <Package size={40} className="mx-auto mb-3" />
              <p className="font-bold uppercase">No opening balances posted yet</p>
              <p className="text-[10px] mt-1">Use Single Entry or Bulk Upload to add initial stock</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b text-[9px] font-black uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Ref</th>
                    <th className="px-4 py-3">Material</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3">UoM</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-right">Balance After</th>
                    <th className="px-4 py-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {obHistory.map(entry => {
                    const storeItem = allStore.find(s => s.id === entry.materialId);
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold">{new Date(entry.timestamp).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-[10px] font-mono text-blue-600">{entry.referenceDoc}</td>
                        <td className="px-4 py-3 font-bold text-slate-700">{storeItem?.name || entry.materialId}</td>
                        <td className="px-4 py-3 text-right font-black">{entry.qty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-400">{entry.uom}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">PKR {(entry.valuation || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-black text-blue-700">PKR {((entry.qty || 0) * (entry.valuation || 0)).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold">{(entry.balanceAfter || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-[10px] text-slate-400 max-w-[200px] truncate">{entry.remarks}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(OpeningBalance);
