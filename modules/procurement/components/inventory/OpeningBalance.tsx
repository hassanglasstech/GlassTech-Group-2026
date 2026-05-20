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
  // Inventory accounts per THICKNESS for Glassco (per-thickness tracking)
  INVENTORY_GLASS_4MM:   '115111',  // 4mm Glass inventory
  INVENTORY_GLASS_6MM:   '115112',  // 6mm Glass inventory
  INVENTORY_GLASS_8MM:   '115113',  // 8mm Glass inventory
  INVENTORY_GLASS_10MM:  '115114',  // 10mm Glass inventory
  INVENTORY_GLASS_12MM:  '115115',  // 12mm Glass inventory
  INVENTORY_GLASS_OTHER: '115119',  // Other thickness Glass inventory

  // Generic inventory for non-Glassco companies
  INVENTORY_GLASS:  '11511',   // Float Glass inventory (default)
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
  // ── Sheet → SqFt → Value calculation ───────────────────────────
  sheetCount: number;           // number of sheets
  sqftPerSheet: number;         // auto from sheetSize (WxH / 144)
  totalSqft: number;            // sheetCount × sqftPerSheet
  rate: number;                 // rate per sqft
  totalValue: number;           // totalSqft × rate
  storageBin: string;
  // ── Weight ─────────────────────────────────────────────────────
  weightKg: number;             // our own measured weight
  biltyWeightKg: number;        // bilty/transporter weight (includes packaging)
  // For glass items
  thickness?: string;
  sheetSize?: string;           // "84x144"
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
  sheetCount: 0, sqftPerSheet: 0, totalSqft: 0,
  rate: 0, totalValue: 0, storageBin: 'MAIN',
  weightKg: 0, biltyWeightKg: 0,
  searchQuery: '', showSuggestions: false,
});

// ── Helpers ────────────────────────────────────────────────────────────────
function sqftOf(size: string): number {
  const [w, h] = (size || '').split('x').map(Number);
  return w && h ? Number(((w * h) / 144).toFixed(3)) : 0;
}

/**
 * Parse glass attributes from free-text description.
 * Examples:
 *   "6mm Clear Plain"      → { thickness: '6mm', color: 'Clear', glassType: 'Plain' }
 *   "8 mm Tinted Green"    → { thickness: '8mm', color: 'Green', glassType: 'Tinted' }
 *   "5mm Mirror Bronze"    → { thickness: '5mm', color: 'Bronze', glassType: 'Mirror' }
 *   "Fluted 4mm"           → { thickness: '4mm', color: 'Clear', glassType: 'Fluted' }
 */
function parseGlassAttrs(desc: string): { thickness: string; color: string; glassType: string } {
  const text = (desc || '').trim();

  // Thickness: "4mm", "6 mm", "10MM" → "6mm"
  const tMatch = text.match(/(\d{1,2})\s*mm/i);
  const thickness = tMatch ? `${parseInt(tMatch[1])}mm` : '';

  // Glass type keywords
  const lower = text.toLowerCase();
  let glassType = 'Plain';
  if (lower.includes('mirror')) glassType = 'Mirror';
  else if (lower.includes('fluted') || lower.includes('flute')) glassType = 'Fluted';
  else if (lower.includes('tinted') || lower.includes('tint')) glassType = 'Tinted';
  else if (lower.includes('color') || lower.includes('colour')) glassType = 'Color';
  else if (lower.includes('reflect')) glassType = 'Reflective';

  // Color keywords (common glass colors)
  let color = 'Clear';
  const colorWords = ['clear', 'green', 'bronze', 'blue', 'grey', 'gray', 'black', 'white', 'brown', 'golden', 'gold', 'pink', 'amber'];
  for (const c of colorWords) {
    if (lower.includes(c)) {
      color = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }

  return { thickness, color, glassType };
}

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

  // Glass-only entry flow: Glassco sells per-sheet glass measured in sqft,
  // so its OB needs Sheet Count × Sheet Size → Total SqFt × Rate/SqFt.
  // Nippon (trading) and GTK/GTI (aluminium) don't measure stock in sqft —
  // they enter Quantity × Rate directly. Toggle the form per-company.
  const isGlassCompany = company === 'Glassco' || company === 'GlassCo';

  // Initial line for non-glass companies uses PCS + sqftPerSheet=1 so the
  // value pipeline collapses to qty × rate without requiring sheet size.
  React.useEffect(() => {
    if (isGlassCompany) return;
    setLines(prev => prev.length === 1 && prev[0].sheetCount === 0 && prev[0].rate === 0
      ? [{ ...prev[0], unit: 'PCS', sqftPerSheet: 1 }]
      : prev);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGlassCompany]);

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
      if ('sheetSize' in patch && patch.sheetSize) {
        updated.sqftPerSheet = sqftOf(patch.sheetSize);
      }
      // Non-glass companies: there is no per-sheet sqft conversion, so
      // sqftPerSheet stays at 1 and totalSqft tracks quantity directly.
      // Glass company: classic sheet × sqft-per-sheet × rate.
      if (!isGlassCompany) updated.sqftPerSheet = 1;
      if ('sheetCount' in patch || 'sqftPerSheet' in patch || 'rate' in patch || 'sheetSize' in patch) {
        updated.totalSqft = Number(((updated.sheetCount || 0) * (updated.sqftPerSheet || 1)).toFixed(2));
        updated.totalValue = Number(((updated.totalSqft || 0) * (updated.rate || 0)).toFixed(2));
      }
      return updated;
    }));
  };

  const selectProduct = (idx: number, product: Product) => {
    // For non-glass companies, default sqftPerSheet to 1 so the existing
    // value-calc pipeline (totalSqft = qty × sqftPerSheet, totalValue =
    // totalSqft × rate) collapses to qty × rate without needing UI changes
    // downstream of updateLine.
    const spf = isGlassCompany ? sqftOf(product.sheetSize || '') : 1;
    updateLine(idx, {
      productId: product.id,
      description: product.description,
      category: product.category || (isGlassCompany ? 'Raw' : 'Hardware'),
      unit: product.unit || (isGlassCompany ? 'SqFt' : 'PCS'),
      thickness: product.thickness,
      sheetSize: isGlassCompany ? product.sheetSize : '',
      sqftPerSheet: spf,
      searchQuery: product.description,
      showSuggestions: false,
    });
  };

  const addLine = () => setLines(prev => [...prev, {
    ...emptyLine(),
    // Default new-line shape for non-glass companies: PCS-based, sqftPerSheet=1
    // so the value pipeline collapses to qty × rate.
    ...(isGlassCompany ? {} : { unit: 'PCS', sqftPerSheet: 1 }),
  }]);
  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Resolve Inventory GL Account by THICKNESS (Glassco) or CATEGORY (others) ───────
  const getInventoryAccount = (category: string, thickness?: string) => {
    const isGlass = company === 'Glassco' || company === 'GlassCo';
    const isAlum = company === 'GTK' || company === 'GTI';
    let result;

    // For Glassco, use per-thickness accounts
    if (isGlass && (category === 'Raw' || category === 'Glass')) {
      // Extract thickness (e.g. "6mm" → 6, "6" → 6)
      const thicknessNum = thickness ? parseInt(thickness) : null;

      switch (thicknessNum) {
        case 4:
          result = { code: OB_GL.INVENTORY_GLASS_4MM, name: 'Glass Inventory — 4mm' };
          break;
        case 6:
          result = { code: OB_GL.INVENTORY_GLASS_6MM, name: 'Glass Inventory — 6mm' };
          break;
        case 8:
          result = { code: OB_GL.INVENTORY_GLASS_8MM, name: 'Glass Inventory — 8mm' };
          break;
        case 10:
          result = { code: OB_GL.INVENTORY_GLASS_10MM, name: 'Glass Inventory — 10mm' };
          break;
        case 12:
          result = { code: OB_GL.INVENTORY_GLASS_12MM, name: 'Glass Inventory — 12mm' };
          break;
        default:
          result = { code: OB_GL.INVENTORY_GLASS_OTHER, name: 'Glass Inventory — Other' };
      }
    } else if (category === 'Hardware') {
      result = { code: OB_GL.INVENTORY_HW, name: 'Hardware Inventory' };
    } else if (category === 'Consumable') {
      result = { code: OB_GL.INVENTORY_CONS, name: 'Consumables Inventory' };
    } else if (isAlum || category === 'Profile') {
      result = { code: OB_GL.INVENTORY_ALUM, name: 'Aluminium / Profile Inventory' };
    } else {
      result = { code: OB_GL.INVENTORY_GLASS, name: 'Glass Inventory' };
    }

    // FIX 7: Log thickness-based mapping to debug GL posting
    console.log(`[OB Account Resolution] category="${category}", thickness="${thickness}" → accountCode="${result.code}" (${result.name})`);
    return result;
  };

  // ══════════════════════════════════════════════════════════════════════
  // POST OPENING BALANCE
  // ══════════════════════════════════════════════════════════════════════
  const postOpeningBalances = async (linesToPost: OBLine[]) => {
    // ── Validation ────────────────────────────────────────────────────────
    const errors: string[] = [];
    linesToPost.forEach((l, i) => {
      if (!l.description)
        errors.push(`Line ${i + 1}: Material description is required`);
      if (l.sheetCount <= 0 && l.totalSqft <= 0)
        errors.push(`Line ${i + 1}: ${isGlassCompany ? 'Sheet count or total sqft' : 'Quantity'} must be > 0`);
      if (l.rate <= 0)
        errors.push(`Line ${i + 1}: Rate must be > 0`);
      // Sheet-size requirement is glass-only. Non-glass companies enter
      // quantity directly, no per-sheet conversion needed.
      if (isGlassCompany && l.sheetCount > 0 && l.totalSqft <= 0)
        errors.push(`Line ${i + 1}: Sheet size required (e.g. 84x144) — needed to compute SqFt & value`);
    });
    if (errors.length > 0) {
      errors.forEach(e => toast.error(e));
      return false;
    }

    setIsPosting(true);

    try {
      const store = InventoryService.getStore();
      const obId  = `OB-${company}-${obDate.replace(/-/g, '')}`;

      // FIX 2: use async read for de-duplication — avoids stale localStorage
      // when >1000 movements have pushed old OB entries out of the local cache.
      let allStoreLedger: MaterialLedgerEntry[];
      try {
        allStoreLedger = await InventoryService.getStockLedgerAsync();
      } catch {
        allStoreLedger = InventoryService.getStockLedger(); // graceful fallback
      }

      const oldOBEntries = allStoreLedger.filter(l => l.referenceDoc === obId);
      const ledger       = allStoreLedger.filter(l => l.referenceDoc !== obId);

      // Reversal map: materialId → { qty, value } to subtract before re-adding
      const reversalMap: Record<string, { qty: number; value: number }> = {};
      oldOBEntries.forEach(e => {
        if (!reversalMap[e.materialId]) reversalMap[e.materialId] = { qty: 0, value: 0 };
        // Guard against same materialId appearing twice in prior OB (e.g. CSV duplicate)
        reversalMap[e.materialId].qty   += e.qty;
        reversalMap[e.materialId].value += e.qty * (e.valuation || 0);
      });

      let glTotal = 0;

      linesToPost.forEach((line, lineIdx) => {
        // ── Resolve material ID ──────────────────────────────────────
        const newMaterialId = line.productId
          || `MAT-${company}-${obDate.replace(/-/g, '')}-${line.description.replace(/\s+/g, '_').slice(0, 20)}`;

        let itemIdx = store.findIndex(s => s.company === company && s.id === newMaterialId);
        if (itemIdx === -1 && !line.productId) {
          itemIdx = store.findIndex(s =>
            s.company === company &&
            s.name.toLowerCase() === line.description.toLowerCase()
          );
        }

        const effectiveMaterialId = itemIdx !== -1 ? store[itemIdx].id : newMaterialId;
        let item: StoreItem;

        if (itemIdx !== -1) {
          item = { ...store[itemIdx] };
        } else {
          // Category defaults differ per company:
          //   Glassco: blank/Raw → Glass (so it appears in GlasscoEditor)
          //   Nippon / GTK / GTI: blank → Hardware (trading / fabrication default)
          let itemCategory: StoreItem['category'];
          if (isGlassCompany) {
            itemCategory = ((line.category || 'Raw') === 'Raw' ? 'Glass' : line.category) as StoreItem['category'];
          } else {
            itemCategory = (line.category && line.category !== 'Raw' ? line.category : 'Hardware') as StoreItem['category'];
          }
          item = {
            id: effectiveMaterialId, company: company as any,
            name: line.description,
            category: itemCategory,
            quantity: 0, unrestrictedQty: 0, qiQty: 0,
            blockedQty: 0, reservedQty: 0, consignmentQty: 0,
            unit: line.unit || (isGlassCompany ? 'SqFt' : 'PCS'),
            minLevel: 0, reorderPoint: 0,
            movingAveragePrice: 0, totalValue: 0,
            storageBin: line.storageBin || 'MAIN',
            lastMovementDate: obDate,
          };
        }

        // ── Stock Quantities (REPLACE, not ADD, on re-post) ──────────
        const stockQty  = line.totalSqft > 0 ? line.totalSqft : line.sheetCount;
        const reversal  = reversalMap[effectiveMaterialId];
        const prevQty   = reversal?.qty   ?? 0;
        const prevValue = reversal?.value ?? 0;

        item.quantity        = Math.max(0, (item.quantity        || 0) - prevQty   + stockQty);
        item.unrestrictedQty = Math.max(0, (item.unrestrictedQty || 0) - prevQty   + stockQty);
        item.totalValue      = Math.max(0, (item.totalValue      || 0) - prevValue + line.totalValue);
        item.movingAveragePrice = item.quantity > 0
          ? Number((item.totalValue / item.quantity).toFixed(2))
          : line.rate;
        item.lastMovementDate = obDate;
        if (line.weightKg > 0) {
          item.perSheetWeightKg = line.sheetCount > 0
            ? Number((line.weightKg / line.sheetCount).toFixed(3)) : 0;
          item.perSqftWeightKg  = stockQty > 0
            ? Number((line.weightKg / stockQty).toFixed(4)) : 0;
        }

        if (itemIdx !== -1) store[itemIdx] = item; else store.push(item);

        // ── Material Ledger Entry ────────────────────────────────────
        // FIX 3: use noon PKT (UTC+5) to prevent date showing as previous day
        const obTimestamp = new Date(`${obDate}T12:00:00+05:00`).toISOString();
        // Glass companies measure & post in SqFt; trading / aluminium use the
        // raw line unit (PCS / SET). Remarks string also reads differently —
        // "X sheets, 84x144" is meaningless for hardware.
        const ledgerUom = isGlassCompany
          ? (line.totalSqft > 0 ? 'SqFt' : (line.unit || 'SqFt'))
          : (line.unit || 'PCS');
        const ledgerRemarks = isGlassCompany
          ? `Opening Balance — ${line.description} (${line.sheetCount} sheets${line.sheetSize ? ', ' + line.sheetSize + '"' : ''}${line.weightKg > 0 ? ', Own Wt: ' + line.weightKg + 'kg' : ''}${line.biltyWeightKg > 0 ? ', Bilty Wt: ' + line.biltyWeightKg + 'kg' : ''})${remarks ? ' | ' + remarks : ''}`
          : `Opening Balance — ${line.description} (${line.sheetCount} ${line.unit || 'PCS'})${remarks ? ' | ' + remarks : ''}`;

        ledger.push({
          id:            `${obId}-L${lineIdx + 1}`,
          company:       company as any,
          materialId:    effectiveMaterialId,
          timestamp:     obTimestamp,
          mvmntCode:     '561',
          qty:           stockQty,
          uom:           ledgerUom,
          valuation:     line.rate,
          balanceAfter:  item.quantity,
          referenceDoc:  obId,
          user:          'Opening Balance',
          remarks:       ledgerRemarks,
          // sheetCount/weight only meaningful for glass — omit for hardware
          sheetCount:    isGlassCompany ? (line.sheetCount || undefined) : undefined,
          lineWeightKg:  isGlassCompany ? (line.weightKg || undefined) : undefined,
          biltyWeightKg: isGlassCompany ? (line.biltyWeightKg || undefined) : undefined,
        } as MaterialLedgerEntry);

        glTotal += line.totalValue;
      });

      // FIX 4: GL FIRST — if _assertGLBalance throws, stock is NOT yet saved
      // ── GL Entry: Dr Inventory / Cr Opening Balance Equity ─────────
      if (glTotal > 0) {
        try {
          const obEquityAcc = FinanceService.ensureAccount(
            company as any, 'Opening Balance Equity', 4, null, 'Equity', OB_GL.OB_EQUITY
          );

          // Group lines by inventory account code (one debit line per category+thickness combo for Glassco)
          const invGroups: Record<string, { amount: number; name: string; count: number }> = {};
          linesToPost.forEach(line => {
            const { code, name } = getInventoryAccount(line.category, line.thickness);
            if (!invGroups[code]) invGroups[code] = { amount: 0, name, count: 0 };
            invGroups[code].amount += line.totalValue;
            invGroups[code].count  += 1;
          });

          const glDetails: any[] = [];
          let totalDebits = 0;
          Object.entries(invGroups).forEach(([accCode, { amount, name, count }]) => {
            const invAcc = FinanceService.ensureAccount(
              company as any, name, 4, null, 'Asset', accCode
            );
            // FIX 7: LOG account details to verify correct GL accounts are being used
            console.log(`[OB GL Debug] Inventory Account: code=${accCode}, name=${name}, type=Asset, accountId=${invAcc.id}, debit=${amount}`);
            totalDebits += amount;
            glDetails.push({
              accountId: invAcc.id,
              debit:     amount,
              credit:    0,
              text:      `Opening Balance — ${name} (${count} item${count > 1 ? 's' : ''})`,
            });
          });

          // FIX 7: LOG equity account and GL balance check
          console.log(`[OB GL Debug] OB Equity Account: code=${OB_GL.OB_EQUITY}, name=Opening Balance Equity, type=Equity, accountId=${obEquityAcc.id}, credit=${glTotal}`);
          console.log(`[OB GL Balance] Total Debits=${totalDebits.toFixed(2)}, Total Credits=${glTotal.toFixed(2)}, Balanced=${Math.abs(totalDebits - glTotal) < 0.01}`);

          glDetails.push({
            accountId: obEquityAcc.id,
            debit:     0,
            credit:    glTotal,
            text:      `Opening Balance Equity — Stock ${obDate}`,
          });

          const allGLLedger = FinanceService.getLedger().filter((e: any) => e.id !== `GL-${obId}`);
          const glEntry = {
            id:          `GL-${obId}`,
            company:     company as any,
            docType:     'OB' as any,
            docDate:     obDate,
            date:        obDate,
            description: `Opening Balance — ${linesToPost.length} material(s) — PKR ${glTotal.toLocaleString()}`,
            referenceId: obId,
            status:      'Posted',
            createdBy:   'system-auto',
            details:     glDetails,
          } as any;

          allGLLedger.push(glEntry);

          // _assertGLBalance runs here — throws LedgerImbalanceError BEFORE stock save if imbalanced
          console.log(`[OB GL Save] Saving GL entry ${glEntry.id} with ${glDetails.length} detail lines`);
          FinanceService.saveLedger(allGLLedger);
          console.log(`[OB GL Success] GL entry posted successfully`);
        } catch (glError: any) {
          console.error('[OB GL Error]', glError);
          throw glError; // Re-throw to be caught by outer try-catch
        }
      }

      // Stock saves AFTER GL succeeds — maintains commit order integrity
      InventoryService.saveStore(store);
      InventoryService.saveStockLedger(ledger);

      // FIX 5: SYNC TO PRODUCTS — newly created materials must be added to products list
      // so they appear in Material Master, GlasscoEditor, and Order Configurator
      const existingProducts = SalesService.getProducts();
      const updatedProducts = [...existingProducts];
      let productsAdded = 0;

      linesToPost.forEach((line, idx) => {
        const newMaterialId = line.productId
          || `MAT-${company}-${obDate.replace(/-/g, '')}-${line.description.replace(/\s+/g, '_').slice(0, 20)}`;

        // Check if this product already exists
        const alreadyExists = existingProducts.some(p => p.id === newMaterialId);
        if (!alreadyExists) {
          // Glass-attr parsing only makes sense for Glassco. For Nippon /
          // GTK / GTI we skip it so a row like "Door Handle CZS133" doesn't
          // get auto-tagged as 4mm Clear Plain glass and corrupt the master.
          if (isGlassCompany) {
            const parsed = parseGlassAttrs(line.description);
            const isGlassProduct = line.category === 'Raw' || line.category === 'Glass' || !!parsed.thickness;
            const resolvedThickness = line.thickness || parsed.thickness || '';
            const resolvedColor     = parsed.color || 'Clear';
            const resolvedGlassType = parsed.glassType || 'Plain';

            const newProduct: Product = {
              id: newMaterialId,
              company: company as any,
              description: line.description,
              category: isGlassProduct ? 'Glass' : (line.category as any),
              basePrice: line.rate || 0,
              unit: (line.unit || 'SqFt') as any,
              variants: [],
              thickness: resolvedThickness,
              sheetSize: line.sheetSize,
              modelNo: '',
              ...(isGlassProduct && {
                glassType: resolvedGlassType as any,
                subCategory: 'Standard' as any,
                finishColor: resolvedColor,
              }),
            };
            console.log(`[OB Product Sync · Glass] id=${newMaterialId} desc="${line.description}" → thickness="${resolvedThickness}", glassType="${resolvedGlassType}", color="${resolvedColor}"`);
            updatedProducts.push(newProduct);
            productsAdded++;
          } else {
            // Hardware / aluminium / trading branch — no glass attrs, no
            // thickness, no sheet size. Category respects the chosen value
            // (defaults to Hardware for Nippon trading).
            const newProduct: Product = {
              id: newMaterialId,
              company: company as any,
              description: line.description,
              category: (line.category && line.category !== 'Raw' ? line.category : 'Hardware') as any,
              basePrice: line.rate || 0,
              unit: (line.unit || 'PCS') as any,
              variants: [],
              modelNo: '',
            };
            console.log(`[OB Product Sync · Non-Glass] id=${newMaterialId} desc="${line.description}" category="${newProduct.category}"`);
            updatedProducts.push(newProduct);
            productsAdded++;
          }
        }
      });

      // Save updated products list if any new products were added
      if (productsAdded > 0) {
        SalesService.saveProducts(updatedProducts);
      }

      toast.success(`✅ Opening Balance posted: ${linesToPost.length} item(s) — PKR ${glTotal.toLocaleString()}${productsAdded > 0 ? ` (${productsAdded} added to Material Master)` : ''}`);
      setLines([emptyLine()]);
      setRemarks('');
      setParsedRows([]);
      setCsvText('');
      refreshData();
      setIsPosting(false);
      return true;

    } catch (err: any) {
      console.error('[OB Post Error]', err);
      toast.error(`Failed to post: ${err?.message || 'Check console for details'}`);
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

    // CSV format differs per company:
    //   Glassco: Description, Category, Sheets, SheetSize, Rate/SqFt, WeightKg, BiltyKg, StorageBin
    //   Nippon / GTK / GTI: Description, Category, Quantity, Unit, Rate, StorageBin
    const startIdx = rawLines[0]?.toLowerCase().includes('description') ? 1 : 0;
    const minCols = isGlassCompany ? 5 : 4;

    rawLines.slice(startIdx).forEach((raw, i) => {
      const cols = raw.split(',').map(c => c.trim());
      if (cols.length < minCols) {
        errors.push(`Row ${i + 1}: Need at least ${minCols} columns (${isGlassCompany
          ? 'Description, Category, Sheets, SheetSize, Rate'
          : 'Description, Category, Quantity, Rate'})`);
        return;
      }

      if (isGlassCompany) {
        // ── Glassco CSV path (sheet × sqft × rate/sqft) ───────────────
        const [desc, cat, sheetsStr, sizeStr, rateStr, wtStr, biltyStr, bin] = cols;
        const sheets = parseFloat(sheetsStr);
        const rate = parseFloat(rateStr);
        const wt = parseFloat(wtStr) || 0;
        const biltyWt = parseFloat(biltyStr) || 0;

        if (!desc) { errors.push(`Row ${i + 1}: Description empty`); return; }
        if (isNaN(sheets) || sheets <= 0) { errors.push(`Row ${i + 1}: Invalid sheets "${sheetsStr}"`); return; }
        if (isNaN(rate) || rate <= 0) { errors.push(`Row ${i + 1}: Invalid rate "${rateStr}"`); return; }

        const matchedProduct = allProducts.find(p =>
          p.description.toLowerCase() === desc.toLowerCase()
        );
        const spf = sqftOf(sizeStr || matchedProduct?.sheetSize || '');
        const totalSqft = Number((sheets * spf).toFixed(2));

        rows.push({
          id: `OB-CSV-${i}`,
          productId: matchedProduct?.id || '',
          description: desc,
          category: cat || 'Raw',
          unit: 'SqFt',
          sheetCount: sheets,
          sqftPerSheet: spf,
          totalSqft,
          rate,
          totalValue: Number((totalSqft * rate).toFixed(2)),
          storageBin: bin || 'MAIN',
          weightKg: wt,
          biltyWeightKg: biltyWt,
          thickness: matchedProduct?.thickness,
          sheetSize: sizeStr || matchedProduct?.sheetSize,
          searchQuery: desc,
          showSuggestions: false,
        });
      } else {
        // ── Trading / aluminium CSV path (quantity × rate) ────────────
        const [desc, cat, qtyStr, unitOrRate, rateMaybe, bin] = cols;
        // Two layouts supported:
        //   4 cols: desc, cat, qty, rate            → unit defaults PCS
        //   5+ cols: desc, cat, qty, unit, rate, [bin]
        const hasUnitCol = cols.length >= 5 && isNaN(parseFloat(unitOrRate));
        const qty  = parseFloat(qtyStr);
        const unit = hasUnitCol ? (unitOrRate || 'PCS') : 'PCS';
        const rate = parseFloat(hasUnitCol ? rateMaybe : unitOrRate);
        const storageBin = hasUnitCol ? bin : cols[4];

        if (!desc) { errors.push(`Row ${i + 1}: Description empty`); return; }
        if (isNaN(qty) || qty <= 0) { errors.push(`Row ${i + 1}: Invalid quantity "${qtyStr}"`); return; }
        if (isNaN(rate) || rate <= 0) { errors.push(`Row ${i + 1}: Invalid rate`); return; }

        const matchedProduct = allProducts.find(p =>
          p.description.toLowerCase() === desc.toLowerCase()
        );

        rows.push({
          id: `OB-CSV-${i}`,
          productId: matchedProduct?.id || '',
          description: desc,
          category: cat || 'Hardware',
          unit,
          sheetCount: qty,        // for non-glass, sheetCount holds the quantity
          sqftPerSheet: 1,        // → totalSqft = qty × 1 = qty
          totalSqft: qty,
          rate,
          totalValue: Number((qty * rate).toFixed(2)),
          storageBin: storageBin || 'MAIN',
          weightKg: 0,
          biltyWeightKg: 0,
          searchQuery: desc,
          showSuggestions: false,
        });
      }
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

                {/* Second Row — glass: Sheets / Sheet Size / SqFt/Sheet / Total SqFt / Rate / Value
                                    non-glass: Quantity / Rate / Value */}
                <div className={`grid grid-cols-2 ${isGlassCompany ? 'md:grid-cols-6' : 'md:grid-cols-3'} gap-3`}>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                      {isGlassCompany ? 'Sheets' : `Quantity (${line.unit || 'PCS'})`} *
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={line.sheetCount > 0 ? line.sheetCount : ''}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        updateLine(idx, { sheetCount: parseFloat(val) || 0 });
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {isGlassCompany && (
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                      Sheet Size (W×H)
                      {!line.sheetSize && line.sheetCount > 0 && (
                        <span className="ml-1 text-amber-500">⚠ needed for SqFt</span>
                      )}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 84x144"
                      value={line.sheetSize || ''}
                      onChange={e => updateLine(idx, { sheetSize: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 ${!line.sheetSize && line.sheetCount > 0 ? 'border-amber-400 bg-amber-50' : ''}`}
                    />
                  </div>
                  )}
                  {isGlassCompany && (
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">SqFt/Sheet</label>
                    <div className={`px-3 py-2 border rounded-lg text-xs font-black ${line.sqftPerSheet > 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-300'}`}>
                      {line.sqftPerSheet > 0 ? line.sqftPerSheet.toFixed(2) : '—'}
                    </div>
                  </div>
                  )}
                  {isGlassCompany && (
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Total SqFt</label>
                    <div className={`px-3 py-2 border rounded-lg text-xs font-black ${line.totalSqft > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-300'}`}>
                      {line.totalSqft > 0 ? line.totalSqft.toLocaleString() : '—'}
                    </div>
                  </div>
                  )}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                      {isGlassCompany ? 'Rate/SqFt (PKR)' : `Rate per ${line.unit || 'PCS'} (PKR)`} *
                    </label>
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
                </div>

                {/* Third Row — glass: Weight + Bilty + Diff + Bin
                                    non-glass: just Storage Bin (no weight tracking for hardware) */}
                <div className={`grid grid-cols-2 ${isGlassCompany ? 'md:grid-cols-4' : 'md:grid-cols-1'} gap-3`}>
                  {isGlassCompany && (
                    <>
                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Our Weight (KG)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Manual weight"
                          value={line.weightKg > 0 ? line.weightKg : ''}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            updateLine(idx, { weightKg: parseFloat(val) || 0 });
                          }}
                          className="w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Bilty Weight (KG)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Transporter wt"
                          value={line.biltyWeightKg > 0 ? line.biltyWeightKg : ''}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            updateLine(idx, { biltyWeightKg: parseFloat(val) || 0 });
                          }}
                          className="w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      {line.biltyWeightKg > 0 && line.weightKg > 0 && (
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Packaging Diff</label>
                          <div className={`px-3 py-2 border rounded-lg text-xs font-black ${(line.biltyWeightKg - line.weightKg) > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-400'}`}>
                            {(line.biltyWeightKg - line.weightKg).toFixed(1)} KG
                            <span className="text-[8px] ml-1 text-slate-400">(pallet/plastic/paper)</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Storage Bin</label>
                    <input
                      type="text"
                      placeholder={isGlassCompany ? 'MAIN' : 'e.g. A-01'}
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
              {isGlassCompany ? (
                <>
                  <span className="font-bold text-slate-500">Sheets: <span className="font-black text-slate-800">{lines.reduce((s, l) => s + l.sheetCount, 0)}</span></span>
                  <span className="font-bold text-slate-500">SqFt: <span className="font-black text-slate-800">{lines.reduce((s, l) => s + l.totalSqft, 0).toFixed(1)}</span></span>
                </>
              ) : (
                <span className="font-bold text-slate-500">
                  Total Qty: <span className="font-black text-slate-800">{lines.reduce((s, l) => s + l.sheetCount, 0).toLocaleString()}</span>
                </span>
              )}
              <span className="font-black text-blue-700 text-sm">
                Total: PKR {lines.reduce((s, l) => s + l.totalValue, 0).toLocaleString()}
              </span>
            </div>
            <button
              onClick={() => postOpeningBalances(lines)}
              disabled={isPosting || lines.every(l => !l.description || (l.sheetCount <= 0 && l.totalSqft <= 0))}
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
              Format: <span className="font-mono bg-slate-100 px-1 rounded">{isGlassCompany
                ? 'Description, Category, Sheets, SheetSize, Rate, WeightKg, BiltyKg, StorageBin'
                : 'Description, Category, Quantity, Unit, Rate, StorageBin'}</span>
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
              placeholder={isGlassCompany
                ? `Description, Category, Sheets, SheetSize, Rate, WeightKg, BiltyKg, StorageBin\nClear Glass 5mm, Raw, 20, 84x144, 45, 1200, 1350, MAIN\nMirror 6mm Belgium, Raw, 10, 84x144, 120, 800, 920, RACK-A\nColor Glass 5mm Grey, Raw, 15, 78x144, 55, 900, 1050, MAIN`
                : `Description, Category, Quantity, Unit, Rate, StorageBin\nKin Long Handle CZS133, Hardware, 50, PCS, 2100, A-01\nFriction Stay 12in, Hardware, 30, PCS, 900, A-02\nSilicone Sealant, Consumable, 10, Tube, 650, B-03`}
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
                      {isGlassCompany ? (
                        <>
                          <th className="px-4 py-2 text-right">Sheets</th>
                          <th className="px-4 py-2">Size</th>
                          <th className="px-4 py-2 text-right">SqFt</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-2 text-right">Qty</th>
                          <th className="px-4 py-2">Unit</th>
                        </>
                      )}
                      <th className="px-4 py-2 text-right">Rate</th>
                      <th className="px-4 py-2 text-right">Value</th>
                      {isGlassCompany && <th className="px-4 py-2 text-right">Wt KG</th>}
                      <th className="px-4 py-2">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-4 py-2 font-bold">{r.description}</td>
                        <td className="px-4 py-2">{r.category}</td>
                        {isGlassCompany ? (
                          <>
                            <td className="px-4 py-2 text-right font-bold">{r.sheetCount}</td>
                            <td className="px-4 py-2 text-[10px]">{r.sheetSize || '—'}</td>
                            <td className="px-4 py-2 text-right font-bold">{r.totalSqft.toLocaleString()}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2 text-right font-bold">{r.sheetCount.toLocaleString()}</td>
                            <td className="px-4 py-2 text-[10px]">{r.unit || 'PCS'}</td>
                          </>
                        )}
                        <td className="px-4 py-2 text-right">{r.rate.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-black text-blue-600">{r.totalValue.toLocaleString()}</td>
                        {isGlassCompany && (
                          <td className="px-4 py-2 text-right text-slate-500">{r.weightKg > 0 ? r.weightKg : '—'}</td>
                        )}
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
