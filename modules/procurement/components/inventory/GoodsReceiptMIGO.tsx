/**
 * GoodsReceiptMIGO.tsx — Phase 2 Complete Rebuild
 * Glass GRN: Vendor, PO link, DC/Bilty, per-line sqmtr/sqft/weight,
 * per-sheet inspection (OK/Defective/Broken), defect photos,
 * freight A/B, post → stock + GL + NCR + vendor claim draft
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { NCRService } from '@/modules/production/services/ncrService';
import { GRNPrint } from '@/modules/glassco/core/prints/GRNPrint';
import { orchestrateGRNGL } from '@/modules/procurement/services/grnGLService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { SCMService } from '@/modules/procurement/services/scmService';
import {
  StoreItem, MaterialLedgerEntry, GRNSheetEntry, VendorDefectReport,
  PurchaseOrder, PalletRateEntry
} from '@/modules/procurement/types/inventory';
import {
  X, Plus, Trash2, ChevronDown, ChevronRight, Camera, AlertTriangle,
  Package, Truck, FileText, CheckCircle2, Search, Printer, Building2,
  Tag, Scale, Info, History, Users, CreditCard
} from 'lucide-react';
import { Product } from '@/modules/shared/types';
import { Vendor } from '@/modules/sales/types/crm';

// ── Constants ─────────────────────────────────────────────────────────────
const DEFECT_CODES = [
  { value: 'BR-01', label: 'BR-01 — Transit Damage' },
  { value: 'BR-02', label: 'BR-02 — Edge Chipping' },
  { value: 'BR-03', label: 'BR-03 — Surface Scratch' },
  { value: 'BR-04', label: 'BR-04 — Manufacturing Defect' },
  { value: 'BR-05', label: 'BR-05 — Complete Break' },
  { value: 'BR-06', label: 'BR-06 — Bubbles' },
];

const SQFT_TO_SQM = 0.092903;

// ── Types ─────────────────────────────────────────────────────────────────
interface GRNLine {
  id: string;
  // Search
  searchQuery: string;
  showSuggestions: boolean;
  // Resolved item
  productId: string;
  description: string;
  category: string;
  thickness: string;
  sheetSize: string;          // "84x144"
  // Quantities
  sheetCount: number;
  sqftPerSheet: number;       // auto from size
  totalSqft: number;          // sheetCount × sqftPerSheet
  totalSqmtr: number;         // editable — for vendor challan verify
  weightKg: number;           // total weight this line
  // Pricing
  ratePKR: number;
  lineValue: number;
  // Computed weights (set on post)
  perSheetWeightKg: number;
  perSqftWeightKg: number;
  // Tags generated
  tagIds: string[];
  // Sheet inspections (one per sheet)
  sheetInspections: SheetInspection[];
  expanded: boolean;
  // ── Undergauge / Custom Size ──────────────────────────────────
  isUndergauge: boolean;
  customWidth: string;         // editable width in inches
  customHeight: string;        // editable height in inches
  showSizeEditor: boolean;     // toggle inline size editor
}

interface SheetInspection {
  tagId: string;
  serial: number;
  status: 'OK' | 'Defective' | 'Broken';
  defectCode: string;
  usableSqft: number;
  cutterNote: string;
  photos: string[];
}

interface SuggestionItem {
  label: string;
  productId: string;
  category: string;
  thickness: string;
  sheetSize: string;
  lastMAP: number;
  stockOnHand: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function sqftOf(size: string): number {
  const [w, h] = size.split('x').map(Number);
  return w && h ? Number(((w * h) / 144).toFixed(3)) : 0;
}

function blankLine(): GRNLine {
  return {
    id: `GL${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    searchQuery: '', showSuggestions: false,
    productId: '', description: '', category: '', thickness: '', sheetSize: '',
    sheetCount: 0, sqftPerSheet: 0, totalSqft: 0, totalSqmtr: 0,
    weightKg: 0, ratePKR: 0, lineValue: 0,
    perSheetWeightKg: 0, perSqftWeightKg: 0,
    tagIds: [], sheetInspections: [], expanded: false,
    isUndergauge: false, customWidth: '', customHeight: '', showSizeEditor: false,
  };
}

function calcLine(l: GRNLine): GRNLine {
  const spf = sqftOf(l.sheetSize) || l.sqftPerSheet;
  const totalSqft = Number((l.sheetCount * spf).toFixed(2));
  const totalSqmtr = Number((totalSqft * SQFT_TO_SQM).toFixed(3));
  const lineValue = Number((totalSqft * l.ratePKR).toFixed(2));
  const perSheetWeightKg = l.sheetCount > 0 ? Number((l.weightKg / l.sheetCount).toFixed(3)) : 0;
  const perSqftWeightKg = totalSqft > 0 ? Number((l.weightKg / totalSqft).toFixed(4)) : 0;
  return { ...l, sqftPerSheet: spf, totalSqft, totalSqmtr, lineValue, perSheetWeightKg, perSqftWeightKg };
}

function generateGRNId(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `GRN-GLS-${mm}${yy}-${seq}`;
}

function generateTagId(thickness: string, mmyy: string, batch: string, serial: number): string {
  const th = thickness.replace('mm', '').padStart(2, '0');
  return `GLS-${th}MM-${mmyy}-${batch}-${String(serial).padStart(2, '0')}`;
}

// ── Props ─────────────────────────────────────────────────────────────────
interface Props {
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  refreshData: () => void;
}

// ══════════════════════════════════════════════════════════════════════════
const GoodsReceiptMIGO: React.FC<Props> = ({ products, isOpen, onClose, refreshData }) => {
  const company = useAppStore(s => s.selectedCompany);

  // ── Header state ─────────────────────────────────────────────────────
  const [vendorId, setVendorId]         = useState('');
  const [poId, setPoId]                 = useState('');
  const [dcNo, setDcNo]                 = useState('');
  const [biltyNo, setBiltyNo]           = useState('');
  const [vendorSoNo, setVendorSoNo]     = useState('');
  const [vehicleNo, setVehicleNo]       = useState('');
  const [driverName, setDriverName]     = useState('');
  const [driverPhone, setDriverPhone]   = useState('');
  const [grnDate, setGrnDate]           = useState(new Date().toISOString().split('T')[0]);

  // ── Lines ─────────────────────────────────────────────────────────────
  const [lines, setLines] = useState<GRNLine[]>(() => Array.from({ length: 3 }, blankLine));

  // ── Footer — Charges ────────────────────────────────────────────────
  const [freightPKR, setFreightPKR]     = useState(0);
  const [freightType, setFreightType]   = useState<'Vendor Included' | 'Own Expense'>('Vendor Included');
  const [otherCharges, setOtherCharges] = useState(0);
  const [otherChargesDesc, setOtherChargesDesc] = useState('');
  const [cashPaymentRef, setCashPaymentRef] = useState('');

  // ── Crane ──────────────────────────────────────────────────────────
  const [craneVendorId, setCraneVendorId] = useState('');
  const [craneAmount, setCraneAmount]     = useState(0);

  // ── Labour + Packing ──────────────────────────────────────────────
  const [labourVendorId, setLabourVendorId]   = useState('');
  const [labourCharges, setLabourCharges]     = useState(0);
  const [palletCount, setPalletCount]         = useState(0);
  const [palletRate, setPalletRate]           = useState(0);
  const [showPalletHistory, setShowPalletHistory] = useState(false);

  // ── Bilty Weight ──────────────────────────────────────────────────
  const [biltyWeight, setBiltyWeight] = useState(0);

  // ── Tags generated flag ───────────────────────────────────────────────
  const [tagsGenerated, setTagsGenerated] = useState(false);
  const [printData, setPrintData] = useState<any>(null);
  const [grnId] = useState(() => generateGRNId());

  // ── Suggestion refs ───────────────────────────────────────────────────
  const suggRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── Data ─────────────────────────────────────────────────────────────
  const glassVendors = useMemo(() =>
    SalesService.getVendors().filter((v: any) =>
      (!v.company || v.company === company)
    ), [company]);

  const glassPOs: PurchaseOrder[] = useMemo(() =>
    ProductionService.getPurchaseOrders().filter(p =>
      p.fromCompany === company &&
      p.category === 'Glass' &&
      (p.status === 'Sent' || p.status === 'GRN Pending')
    ), [company]);

  const selectedVendor = useMemo(() =>
    glassVendors.find((v: any) => v.id === vendorId), [vendorId, glassVendors]);

  const selectedPO = useMemo(() =>
    glassPOs.find(p => p.id === poId), [poId, glassPOs]);

  // ── Crane & Labour vendor lists ────────────────────────────────────
  const allVendors: Vendor[] = useMemo(() =>
    SalesService.getVendors().filter((v: any) => !v.company || v.company === company), [company]);
  const craneVendors = useMemo(() => allVendors.filter(v => v.type === 'Crane/Unloading'), [allVendors]);
  const labourVendors = useMemo(() => allVendors.filter(v => v.type === 'Labour'), [allVendors]);
  const selectedCraneVendor = useMemo(() => craneVendors.find(v => v.id === craneVendorId), [craneVendorId, craneVendors]);
  const selectedLabourVendor = useMemo(() => labourVendors.find(v => v.id === labourVendorId), [labourVendorId, labourVendors]);

  // ── Pallet rate history (last 5) ──────────────────────────────────
  const palletRateHistory = useMemo(() =>
    InventoryService.getRecentPalletRates(company as string, 5), [company]);

  // ── Packing computed ──────────────────────────────────────────────
  const packingBuyback = palletCount * palletRate;
  const labourNetPayable = labourCharges - packingBuyback;

  // Build suggestion catalogue from product master + GRN history
  const catalogue: SuggestionItem[] = useMemo(() => {
    const items: SuggestionItem[] = [];
    const seen = new Set<string>();
    const storeItems = InventoryService.getStore().filter((s: StoreItem) => s.company === company);

    SalesService.getProducts()
      .filter((p: any) =>
        (p.company === company || !p.company) &&
        p.category !== 'Service'  // Include all materials, exclude services
      )
      .forEach((p: any) => {
        const th = p.thickness || '';
        const sz = p.sheetSize || '';
        const key = `${p.glassType || p.category}-${th}-${sz}-${p.id}`;
        if (seen.has(key)) return; seen.add(key);
        const store = storeItems.find((s: StoreItem) => s.id === p.id);
        items.push({
          label: [p.glassType || p.category, p.subCategory || '', th, sz ? `${sz}"` : ''].filter(Boolean).join(' ').trim() || p.description,
          productId: p.id, category: p.glassType || p.category || 'Plain',
          thickness: th, sheetSize: sz,
          lastMAP: store?.movingAveragePrice || p.costPrice || 0,
          stockOnHand: store?.unrestrictedQty || 0,
        });
      });
    return items;
  }, [company]);

  function getSuggestions(query: string): SuggestionItem[] {
    if (!query.trim()) return catalogue.slice(0, 10);
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return catalogue.filter(item => {
      const hay = [item.label, item.category, item.thickness, item.sheetSize].join(' ').toLowerCase();
      return tokens.every(t => hay.includes(t));
    }).slice(0, 10);
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

  // When PO selected — auto-fill lines
  useEffect(() => {
    if (!selectedPO) return;
    const poLines = selectedPO.items || [];
    if (!poLines.length) return;

    // Auto-fill freight type from PO if available
    if ((selectedPO as any).freightType) setFreightType((selectedPO as any).freightType);
    if ((selectedPO as any).totalFreight) setFreightPKR((selectedPO as any).totalFreight);

    const newLines: GRNLine[] = poLines.map(item => {
      let meta: any = {};
      try { meta = JSON.parse(item.specs || '{}'); } catch {}
      const sheetSize = meta.sheetSize || '';
      const thickness = meta.thickness || '';
      const spf = sqftOf(sheetSize);
      const sheetCount = meta.sheetCount || 0;
      const totalSqft = Number((sheetCount * spf).toFixed(2));
      return calcLine({
        ...blankLine(),
        searchQuery: item.description || '',
        description: item.description || '',
        productId: meta.productId || '',
        category: meta.category || '',
        thickness,
        sheetSize,
        sheetCount,
        sqftPerSheet: spf,
        totalSqft,
        totalSqmtr: Number((totalSqft * SQFT_TO_SQM).toFixed(3)),
        ratePKR: item.rate || 0,
        lineValue: Number((totalSqft * (item.rate || 0)).toFixed(2)),
      });
    });

    // Pad to minimum 3 lines
    while (newLines.length < 3) newLines.push(blankLine());
    setLines(newLines);
    setTagsGenerated(false);
    toast.success(`PO ${selectedPO.id} — ${poLines.length} lines loaded`);
  }, [poId]);

  // ── Line operations ───────────────────────────────────────────────────
  const updateLine = (id: string, patch: Partial<GRNLine>) =>
    setLines(prev => prev.map(l => l.id === id ? calcLine({ ...l, ...patch }) : l));

  const pickSuggestion = (lineId: string, s: SuggestionItem) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      return calcLine({
        ...l,
        searchQuery: s.label, showSuggestions: false,
        productId: s.productId, description: s.label,
        category: s.category, thickness: s.thickness, sheetSize: s.sheetSize,
        sqftPerSheet: sqftOf(s.sheetSize),
        ratePKR: l.ratePKR > 0 ? l.ratePKR : s.lastMAP,
      });
    }));
  };

  const addLine = () => setLines(prev => [...prev, blankLine()]);
  const removeLine = (id: string) =>
    lines.length > 1 && setLines(prev => prev.filter(l => l.id !== id));

  // ── Generate Tags ─────────────────────────────────────────────────────
  const handleGenerateTags = () => {
    const filled = lines.filter(l => l.sheetCount > 0 && l.thickness);
    if (!filled.length) { toast.error('Enter at least one line with sheets and thickness'); return; }
    if (!vendorId) { toast.error('Select vendor first'); return; }
    if (!dcNo)    { toast.error('DC number required before generating tags'); return; }

    const d = new Date(grnDate);
    const mmyy = `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`;
    const batchSeq = grnId.split('-').pop() || '001';

    let globalSerial = 1;
    const updatedLines = lines.map(l => {
      if (!l.sheetCount || !l.thickness) return l;
      const tags: string[] = [];
      const inspections: SheetInspection[] = [];
      for (let i = 0; i < l.sheetCount; i++) {
        const tagId = generateTagId(l.thickness, mmyy, batchSeq, globalSerial++);
        tags.push(tagId);
        inspections.push({
          tagId, serial: globalSerial - 1,
          status: 'OK', defectCode: '', usableSqft: l.sqftPerSheet,
          cutterNote: '', photos: [],
        });
      }
      return { ...l, tagIds: tags, sheetInspections: inspections, expanded: true };
    });

    setLines(updatedLines);
    setTagsGenerated(true);
    const totalTags = updatedLines.reduce((s, l) => s + l.tagIds.length, 0);
    toast.success(`${totalTags} tags generated — ready to print`);
  };

  // ── Update sheet inspection ───────────────────────────────────────────
  const updateInspection = (lineId: string, tagId: string, patch: Partial<SheetInspection>) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      return {
        ...l,
        sheetInspections: l.sheetInspections.map(s =>
          s.tagId === tagId
            ? { ...s, ...patch,
                usableSqft: patch.status === 'OK' ? l.sqftPerSheet
                  : (patch.usableSqft !== undefined ? patch.usableSqft : s.usableSqft) }
            : s
        )
      };
    }));
  };

  // Photo capture (base64)
  const handlePhoto = async (lineId: string, tagId: string) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setLines(prev => prev.map(l => {
          if (l.id !== lineId) return l;
          return {
            ...l,
            sheetInspections: l.sheetInspections.map(s =>
              s.tagId === tagId ? { ...s, photos: [...s.photos, base64] } : s
            )
          };
        }));
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // ── Totals ────────────────────────────────────────────────────────────
  const filledLines = lines.filter(l => l.sheetCount > 0);
  const totalSheets  = filledLines.reduce((s, l) => s + l.sheetCount, 0);
  const totalSqft    = filledLines.reduce((s, l) => s + l.totalSqft, 0);
  const totalSqmtr   = filledLines.reduce((s, l) => s + l.totalSqmtr, 0);
  const totalWeight  = filledLines.reduce((s, l) => s + l.weightKg, 0);
  const totalMaterial = filledLines.reduce((s, l) => s + l.lineValue, 0);
  const grandTotal   = totalMaterial + freightPKR + craneAmount + labourCharges + otherCharges - packingBuyback;

  // Defect summary
  const allInspections = lines.flatMap(l => l.sheetInspections);
  const defectCount  = allInspections.filter(s => s.status !== 'OK').length;
  const brokenCount  = allInspections.filter(s => s.status === 'Broken').length;

  // ── POST GRN ─────────────────────────────────────────────────────────
  const handlePost = () => {
    if (!vendorId)          { toast.error('Vendor required'); return; }
    if (!dcNo)              { toast.error('DC number required'); return; }
    if (!filledLines.length){ toast.error('At least one line required'); return; }
    if (!tagsGenerated)     { toast.error('Generate tags first before posting'); return; }
    if (freightType === 'Vendor Included' && freightPKR > 0 && !cashPaymentRef) {
      toast.error('Cash payment reference required for Vendor Included freight'); return;
    }
    if (otherCharges > 0 && !otherChargesDesc) {
      toast.error('Other charges description required'); return;
    }

    const allStore = InventoryService.getStore();
    const allLedger = InventoryService.getStockLedger();
    const grnSheetEntries: GRNSheetEntry[] = [];

    const d = new Date(grnDate);
    const mmyy = `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`;
    const batchSeq = grnId.split('-').pop() || '001';

    filledLines.forEach((line, lineIdx) => {
      // Get or create store item
      let itemIdx = allStore.findIndex(s => s.id === line.productId);
      let item: StoreItem;

      // Calculate per-sheet and per-sqft weights
      const perSheetKg = line.sheetCount > 0 ? Number((line.weightKg / line.sheetCount).toFixed(3)) : 0;
      const perSqftKg  = line.totalSqft > 0  ? Number((line.weightKg / line.totalSqft).toFixed(4)) : 0;

      // Classify inspections
      const okSheets  = line.sheetInspections.filter(s => s.status === 'OK');
      const defSheets = line.sheetInspections.filter(s => s.status === 'Defective' || s.status === 'Broken');

      const okSqft       = okSheets.reduce((s, i) => s + line.sqftPerSheet, 0);
      const defUsableSqft = defSheets.reduce((s, i) => s + (i.usableSqft || 0), 0);
      const lineTotalSqft = okSqft + defUsableSqft;

      // ── Landed cost allocation (IAS 2 — weight basis) ────────────
      // Primary: line weight / total GRN weight
      // Fallback: if any line has zero weight, use bilty weight distributed by sqft
      const totalGRNWeight = filledLines.reduce((s, l) => s + (l.weightKg || 0), 0);
      const allLinesHaveWeight = filledLines.every(l => (l.weightKg || 0) > 0);
      const totalLandedCharges = freightPKR + craneAmount + Math.max(0, labourNetPayable) + otherCharges;

      let lineShareOfCharges = 0;
      if (totalLandedCharges > 0) {
        if (allLinesHaveWeight && totalGRNWeight > 0) {
          // Weight basis — all lines have weight entered
          lineShareOfCharges = Number(((line.weightKg / totalGRNWeight) * totalLandedCharges).toFixed(2));
        } else if (biltyWeight > 0) {
          // Fallback: bilty weight distributed by sqft ratio
          const totalGRNSqft = filledLines.reduce((s, l) => {
            const ok = l.sheetInspections.filter(i => i.status === 'OK').reduce((ss, _i) => ss + l.sqftPerSheet, 0);
            const def = l.sheetInspections.filter(i => i.status !== 'OK').reduce((ss, i) => ss + (i.usableSqft || 0), 0);
            return s + ok + def;
          }, 0);
          const lineTotalSqftForAlloc = okSqft + defUsableSqft;
          lineShareOfCharges = totalGRNSqft > 0
            ? Number(((lineTotalSqftForAlloc / totalGRNSqft) * totalLandedCharges).toFixed(2))
            : 0;
        }
        // If neither weight nor bilty weight available — charges not allocated (stay as period expense)
      }

      const okValue  = Number((okSqft * line.ratePKR).toFixed(2));
      const defValue = Number((defUsableSqft * line.ratePKR).toFixed(2));
      const totalStockValue = okValue + defValue + lineShareOfCharges;

      if (itemIdx !== -1) {
        item = { ...allStore[itemIdx] };
      } else {
        // Create new store item
        const prod = SalesService.getProducts().find((p: any) => p.id === line.productId);
        item = {
          id: line.productId || `STORE-${Date.now()}-${lineIdx}`,
          company, name: line.description,
          category: 'Raw', quantity: 0, unrestrictedQty: 0, qiQty: 0,
          blockedQty: 0, reservedQty: 0, consignmentQty: 0,
          unit: 'SqFt', minLevel: 0, reorderPoint: 0,
          movingAveragePrice: line.ratePKR, totalValue: 0,
          storageBin: 'MAIN', lastMovementDate: grnDate,
          defectiveSheets: 0, defectiveQty: 0, defectiveSqft: 0,
          defectiveValue: 0, remnantCount: 0, remnantSqft: 0,
          scrapSqft: 0, scrapWeightKG: 0,
        };
      }

      // Update MAP
      const newTotalValue = item.totalValue + totalStockValue;
      const newTotalQty   = item.quantity + okSqft + defUsableSqft;
      item.movingAveragePrice = newTotalQty > 0 ? Number((newTotalValue / newTotalQty).toFixed(2)) : line.ratePKR;
      item.totalValue         = newTotalValue;
      item.quantity           = newTotalQty;

      // OK qty
      item.unrestrictedQty = (item.unrestrictedQty || 0) + okSqft;

      // Defective qty
      item.defectiveSheets = (item.defectiveSheets || 0) + defSheets.length;
      item.defectiveSqft   = (item.defectiveSqft   || 0) + defUsableSqft;
      item.defectiveQty    = item.defectiveSqft;
      item.defectiveValue  = (item.defectiveValue  || 0) + defValue;

      // Weight reference
      item.perSheetWeightKg = perSheetKg;
      item.perSqftWeightKg  = perSqftKg;
      item.lastMovementDate = grnDate;

      if (itemIdx !== -1) allStore[itemIdx] = item; else allStore.push(item);

      // ── Material Ledger Entry ─────────────────────────────────────
      const ledgerEntry: MaterialLedgerEntry = {
        id: `MAT-${grnId}-L${lineIdx + 1}`,
        company, materialId: item.id,
        timestamp: new Date(grnDate).toISOString(),
        mvmntCode: '101',
        qty: okSqft + defUsableSqft,
        uom: 'SqFt', valuation: item.movingAveragePrice,
        balanceAfter: item.quantity,
        referenceDoc: grnId, user: 'Store',
        remarks: `GRN ${grnId} — ${line.description}${line.isUndergauge ? ' [UNDERGAUGE ' + line.sheetSize + '"]' : ''}`,
        // GRN extended fields
        dcNo, biltyNo, vendorSoNo, vehicleNo, driverName, driverPhone,
        freightType, freightPKR,
        otherChargesPKR: otherCharges, otherChargesDesc,
        lineWeightKg: line.weightKg,
        perSheetWeightKg: perSheetKg, perSqftWeightKg: perSqftKg,
        vendorId, vendorName: selectedVendor?.name || '',
        poId, sheetCount: line.sheetCount,
        glassCategory: line.category,
        sheetTags: line.tagIds,
        sheetTagMeta: {
          thickness: line.thickness, sheetSize: line.sheetSize,
          vendorName: selectedVendor?.name || '',
          grnRef: grnId, grnDate,
          batchSeq,
        },
      };
      allLedger.push(ledgerEntry);

      // ── GRN Sheet Entries (per sheet) ──────────────────────────────
      line.sheetInspections.forEach(insp => {
        const entry: GRNSheetEntry = {
          id: insp.tagId,
          grnId, company,
          tagId: insp.tagId,
          lineIndex: lineIdx,
          materialId: item.id,
          thickness: line.thickness,
          sheetSize: line.sheetSize,
          sqftPerSheet: line.sqftPerSheet,
          status: insp.status,
          defectCode: insp.defectCode as any || undefined,
          defectDescription: insp.defectCode
            ? DEFECT_CODES.find(d => d.value === insp.defectCode)?.label || ''
            : '',
          usableSqft: insp.status === 'OK' ? line.sqftPerSheet : insp.usableSqft,
          cutterNote: insp.cutterNote,
          photos: insp.photos,
          inspectedBy: 'Store Incharge',
          inspectedAt: new Date().toISOString(),
          claimAmount: insp.status !== 'OK'
            ? Number(((line.sqftPerSheet - (insp.usableSqft || 0)) * line.ratePKR).toFixed(2))
            : 0,
          claimStatus: insp.status !== 'OK' ? 'Pending' : 'Pending',
          // ── Undergauge / Custom Size ──
          isUndergauge: line.isUndergauge || undefined,
          actualSize: line.isUndergauge && line.customWidth && line.customHeight
            ? `${line.customWidth}x${line.customHeight}` : undefined,
        };
        grnSheetEntries.push(entry);

        // NCR for fully broken sheets
        if (insp.status === 'Broken' && (insp.usableSqft || 0) === 0) {
          try {
            NCRService.createNCR({
              company, stage: 'Inward-Inspection',
              cause: 'BR-05-Complete-Break',
              description: `GRN ${grnId} — Tag ${insp.tagId}: Complete break, zero usable area`,
              reportedBy: 'Store Incharge',
              sqftLost: line.sqftPerSheet,
              glassType: line.category, thickness: line.thickness,
              estimatedValue: Number((line.sqftPerSheet * line.ratePKR).toFixed(2)),
              action: 'Vendor-Claim',
              vendorId, vendorName: selectedVendor?.name,
              purchaseRef: grnId,
            });
          } catch (e) { console.warn('[GRN] NCR creation failed:', e); }
        }
      });
    });

    // ── Vendor Defect Report Draft ──────────────────────────────────
    const defectEntries = grnSheetEntries
      .filter(e => e.status !== 'OK')
      .map(e => {
        const line = filledLines.find(l => l.tagIds.includes(e.tagId))!;
        return {
          tagId: e.tagId,
          defectCode: e.defectCode || '',
          defectDescription: e.defectDescription || '',
          originalSqft: line.sqftPerSheet,
          usableSqft: e.usableSqft || 0,
          originalValue: Number((line.sqftPerSheet * line.ratePKR).toFixed(2)),
          usableValue: Number(((e.usableSqft || 0) * line.ratePKR).toFixed(2)),
          adjustmentAmount: e.claimAmount || 0,
          photos: e.photos || [],
        };
      });

    if (defectEntries.length > 0) {
      const report: VendorDefectReport = {
        id: `VDR-${grnId}`,
        company, grnId, vendorId,
        vendorName: selectedVendor?.name || '',
        reportDate: grnDate,
        defectEntries,
        totalAdjustment: defectEntries.reduce((s, e) => s + e.adjustmentAmount, 0),
        preparedBy: 'Store Incharge',
        status: 'Draft',
      };
      InventoryService.upsertVendorDefectReport(report);
    }

    // ── Update PO status ────────────────────────────────────────────
    if (poId) {
      const allPOs = ProductionService.getPurchaseOrders();
      ProductionService.savePurchaseOrders(
        allPOs.map(p => p.id === poId
          ? { ...p, status: 'GRN Done' as any, grnRef: grnId, grnDate }
          : p
        )
      );
    }

    // ── Save (atomic with rollback) ────────────────────────────────
    // Snapshot current state for rollback on failure
    const snapshotStore = JSON.parse(JSON.stringify(InventoryService.getStore()));
    const snapshotLedger = JSON.parse(JSON.stringify(InventoryService.getStockLedger()));
    const snapshotSheets = JSON.parse(JSON.stringify(InventoryService.getGRNSheetEntries()));
    const snapshotGL = JSON.parse(JSON.stringify(FinanceService.getLedger()));
    const snapshotReports = JSON.parse(JSON.stringify(InventoryService.getVendorDefectReports()));

    try {
      // Step 1: Stock
      InventoryService.saveStore(allStore);
      // Step 2: Ledger
      InventoryService.saveStockLedger([...InventoryService.getStockLedger(), ...allLedger]);

      // Step 3: GL entries — IAS 2 landed cost
      // Material value at vendor rate (for GR/IR clearing — vendor payable amount)
      const materialOKValue  = filledLines.reduce((s, l) => {
        const okSheets  = l.sheetInspections.filter(i => i.status === 'OK');
        return s + okSheets.reduce((ss) => ss + l.sqftPerSheet * l.ratePKR, 0);
      }, 0);
      const materialDefVal = filledLines.reduce((s, l) => {
        const defSheets = l.sheetInspections.filter(i => i.status !== 'OK');
        return s + defSheets.reduce((ss, i) => ss + (i.usableSqft || 0) * l.ratePKR, 0);
      }, 0);
      // Total landed charges (freight+crane+labour net+other) — these capitalize into inventory
      const totalLandedForGL = freightPKR + craneAmount + Math.max(0, labourNetPayable) + otherCharges;

      const glResult = orchestrateGRNGL({
        company, grnId, grnDate,
        vendorName: selectedVendor?.name || vendorId,
        totalOKValue: materialOKValue, totalDefectiveValue: materialDefVal,
        freightType, freightAmount: freightPKR, cashPaymentRef,
        otherCharges, otherChargesDesc,
        craneVendorName: selectedCraneVendor?.name || '',
        craneAmount,
        labourVendorName: selectedLabourVendor?.name || '',
        labourGross: labourCharges,
        packingBuyback,
        labourNetPayable,
        // IAS 2 — total landed charges to capitalize into inventory
        landedChargesTotal: totalLandedForGL,
      });
      if (glResult === 0) {
        // GL posting completely failed — rollback and abort
        InventoryService.saveStore(snapshotStore);
        InventoryService.saveStockLedger(snapshotLedger);
        InventoryService.saveGRNSheetEntries(snapshotSheets);
        FinanceService.saveLedger(snapshotGL);
        InventoryService.saveVendorDefectReports(snapshotReports);
        toast.error(`GRN ${grnId} ABORTED: GL posting failed — all changes rolled back. Check COA and GL Code Verifier.`, { duration: 10000 });
        return;
      }

      // Step 4: Pallet Rate History
      if (palletCount > 0 && palletRate > 0) {
        InventoryService.addPalletRate({
          id: `PLT-${grnId}`,
          company: company as any,
          grnId,
          date: grnDate,
          vendorId: labourVendorId,
          vendorName: selectedLabourVendor?.name || '',
          ratePerPallet: palletRate,
          palletCount,
          totalPacking: packingBuyback,
        });
      }

      // Step 5: Sheet entries
      const existingSheets = InventoryService.getGRNSheetEntries();
      InventoryService.saveGRNSheetEntries([...existingSheets, ...grnSheetEntries]);

      // Step 6: Auto-populate WeightMaster from GRN lines
      filledLines.forEach(line => {
        if (line.weightKg > 0 && line.sheetCount > 0 && line.thickness) {
          const spf = sqftOf(line.sheetSize) || line.sqftPerSheet;
          InventoryService.addWeightEntry({
            id: `WM-${grnId}-${line.id}`,
            company: company as any,
            productId: line.productId,
            productName: line.description,
            thickness: line.thickness,
            sheetSize: line.sheetSize,
            date: grnDate,
            recordedBy: 'GRN Auto',
            totalWeightKg: line.weightKg,
            sheetCount: line.sheetCount,
            perSheetKg: Number((line.weightKg / line.sheetCount).toFixed(3)),
            sqftPerSheet: spf,
            perSqftKg: spf > 0 ? Number((line.weightKg / (line.sheetCount * spf)).toFixed(4)) : 0,
            source: 'GRN',
            grnId,
            vendorId: vendorId,
            vendorName: selectedVendor?.name || '',
          });
        }
      });

    } catch (err) {
      // ── ROLLBACK on any failure ──
      console.error('[GRN POST] FAILED — rolling back:', err);
      InventoryService.saveStore(snapshotStore);
      InventoryService.saveStockLedger(snapshotLedger);
      InventoryService.saveGRNSheetEntries(snapshotSheets);
      FinanceService.saveLedger(snapshotGL);
      InventoryService.saveVendorDefectReports(snapshotReports);
      toast.error(`GRN ${grnId} post FAILED — all changes rolled back. Error: ${(err as Error).message}`, { duration: 10000 });
      return;
    }

    // ── Post Summary ─────────────────────────────────────────────────
    const pvParts: string[] = [];
    if (craneAmount > 0) pvParts.push(`Crane: PKR ${craneAmount.toLocaleString()}`);
    if (labourCharges > 0) pvParts.push(`Labour Net: PKR ${labourNetPayable.toLocaleString()}`);

    const summary = [
      `GRN ${grnId} posted`,
      `${totalSheets} sheets — ${totalSqft.toFixed(1)} sqft`,
      defectCount > 0 ? `${defectCount} defect(s) recorded` : '',
      defectCount > 0 ? 'Vendor defect report draft created' : '',
      pvParts.length > 0 ? `${pvParts.length} PV(s) generated (${pvParts.join(', ')})` : '',
    ].filter(Boolean).join(' | ');

    toast.success(summary, { duration: 6000 });

    // SCM: record lead time for vendor scorecard
    if (poId && vendorId && selectedPO?.date) {
      const rejected = allInspections.filter((s: any) => s.status !== 'OK').length;
      SCMService.recordLeadTime(
        company, vendorId, poId,
        selectedPO.date, grnDate,
        totalSheets, rejected
      );
    }

    refreshData();
    // Prepare print data — modal stays open for print option
    setPrintData({
      grnId, grnDate, vendorName: selectedVendor?.name || vendorId,
      dcNo, biltyNo, vendorSoNo, vehicleNo, driverName, poId,
      freightType, freightPKR, otherCharges, otherChargesDesc,
      craneAmount, craneVendorName: selectedCraneVendor?.name || '',
      labourCharges, labourVendorName: selectedLabourVendor?.name || '',
      palletCount, palletRate, packingBuyback, labourNetPayable,
      biltyWeight,
      lines: filledLines.map(l => ({
        description: l.description, thickness: l.thickness, sheetSize: l.sheetSize,
        sheetCount: l.sheetCount, sqftPerSheet: l.sqftPerSheet, totalSqft: l.totalSqft,
        totalSqmtr: l.totalSqmtr, weightKg: l.weightKg, ratePKR: l.ratePKR,
        lineValue: l.lineValue, tagIds: l.tagIds,
      })),
      sheetEntries: grnSheetEntries,
      totalSheets, totalSqft, totalWeight,
      grandTotal, postedBy: 'Store',
    });
  };

  const handleClose = () => {
    setVendorId(''); setPoId(''); setDcNo(''); setBiltyNo('');
    setVendorSoNo(''); setVehicleNo(''); setDriverName(''); setDriverPhone('');
    setGrnDate(new Date().toISOString().split('T')[0]);
    setLines(Array.from({ length: 3 }, blankLine));
    setFreightPKR(0); setOtherCharges(0); setOtherChargesDesc(''); setCashPaymentRef('');
    setCraneVendorId(''); setCraneAmount(0);
    setLabourVendorId(''); setLabourCharges(0); setPalletCount(0); setPalletRate(0);
    setBiltyWeight(0); setShowPalletHistory(false);
    setTagsGenerated(false);
    onClose();
  };

  if (!isOpen) return null;

  // ── Print overlay ──
  if (printData) {
    return <GRNPrint data={printData} onClose={() => { setPrintData(null); handleClose(); }}/>;
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-start justify-center z-[400] overflow-y-auto py-4 px-3">
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col">

        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between px-7 py-4 bg-slate-900 text-white rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600 rounded-xl"><Package size={18}/></div>
            <div>
              <h2 className="text-base font-black uppercase tracking-tight">Goods Receipt — Glass</h2>
              <p className="text-[10px] text-slate-400 font-bold font-mono mt-0.5">{grnId}</p>
            </div>
          </div>
          <button onClick={handleClose} className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center">
            <X size={18}/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Section 1: Header ── */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 pb-3 border-b mb-4">
              <Building2 size={14} className="text-blue-600"/>
              <span className="text-xs font-black uppercase tracking-widest text-slate-700">GRN Header</span>
            </div>
            <div className="grid grid-cols-3 gap-4">

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Glass Vendor *</label>
                <select className="sap-input w-full font-bold" value={vendorId} onChange={e => setVendorId(e.target.value)}>
                  <option value="">— Select Vendor —</option>
                  {glassVendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">PO Number (Optional)</label>
                <select className="sap-input w-full font-bold" value={poId} onChange={e => setPoId(e.target.value)}>
                  <option value="">— No PO / Select PO —</option>
                  {glassPOs.filter(p => !vendorId || (p as any).vendorId === vendorId || p.toVendor === selectedVendor?.name).map(p => (
                    <option key={p.id} value={p.id}>{p.id} — {p.toVendor}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">GRN Date</label>
                <input type="date" className="sap-input w-full" value={grnDate} onChange={e => setGrnDate(e.target.value)}/>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">DC Number *</label>
                <input type="text" className="sap-input w-full font-bold uppercase" placeholder="DC-XXXX"
                  value={dcNo} onChange={e => setDcNo(e.target.value)}/>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Bilty Number *</label>
                <input type="text" className="sap-input w-full font-bold uppercase" placeholder="BLT-XXXX"
                  value={biltyNo} onChange={e => setBiltyNo(e.target.value)}/>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Vendor SO Number</label>
                <input type="text" className="sap-input w-full font-bold uppercase" placeholder="Vendor SO ref"
                  value={vendorSoNo} onChange={e => setVendorSoNo(e.target.value)}/>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Vehicle Number</label>
                <input type="text" className="sap-input w-full font-bold uppercase" placeholder="LEA-XXXX"
                  value={vehicleNo} onChange={e => setVehicleNo(e.target.value)}/>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Driver Name</label>
                <input type="text" className="sap-input w-full font-bold uppercase" placeholder="Driver name (for PV)"
                  value={driverName} onChange={e => setDriverName(e.target.value)}/>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Driver Phone</label>
                <input type="text" className="sap-input w-full font-bold" placeholder="03XX-XXXXXXX"
                  value={driverPhone} onChange={e => setDriverPhone(e.target.value)}/>
              </div>
            </div>
          </div>

          {/* ── Section 2: Line Items ── */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between pb-3 border-b mb-3">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-emerald-600"/>
                <span className="text-xs font-black uppercase tracking-widest">Line Items</span>
                <span className="text-[9px] text-slate-400 font-bold">Search: 5mm, plain 84, mirror — token match</span>
              </div>
              <button onClick={addLine}
                className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase hover:bg-emerald-700">
                <Plus size={12}/> Add Line
              </button>
            </div>

            {/* Column labels */}
            <div className="grid text-[9px] font-black uppercase text-slate-400 mb-1.5 px-1 gap-2"
              style={{ gridTemplateColumns: '1fr 70px 68px 68px 70px 80px 80px 24px' }}>
              <span>Glass Specification</span>
              <span className="text-right">Sheets</span>
              <span className="text-right">SqFt</span>
              <span className="text-right">Sq Mtr</span>
              <span className="text-right">Weight KG</span>
              <span className="text-right">Rate/sqft</span>
              <span className="text-right">Line Total</span>
              <span></span>
            </div>

            <div className="space-y-1.5">
              {lines.map((line, idx) => {
                const suggs = getSuggestions(line.searchQuery);
                const isFilled = line.sheetCount > 0;
                const hasDefects = line.sheetInspections.some(s => s.status !== 'OK');
                return (
                  <div key={line.id} ref={el => { suggRefs.current[line.id] = el; }}>
                    {/* Main row */}
                    <div className={`rounded-xl border transition-colors ${isFilled ? hasDefects ? 'border-amber-200 bg-amber-50/20' : 'border-emerald-200 bg-emerald-50/20' : 'border-slate-100 bg-slate-50/40'}`}>
                      <div className="p-2.5 grid gap-2 items-start"
                        style={{ gridTemplateColumns: '1fr 70px 68px 68px 70px 80px 80px 24px' }}>

                        {/* Search */}
                        <div className="relative">
                          <div className="flex items-center gap-1 mb-1 min-h-[16px]">
                            <span className="text-[9px] font-black text-slate-400">#{idx+1}</span>
                            {line.thickness && (
                              <span className="text-[9px] font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                {line.category} {line.thickness} {line.sheetSize}"
                              </span>
                            )}
                            {line.isUndergauge && (
                              <span className="text-[8px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                                UNDERGAUGE
                              </span>
                            )}
                            {line.sheetInspections.length > 0 && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${hasDefects ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {line.sheetInspections.filter(s => s.status === 'OK').length} OK
                                {hasDefects ? ` · ${line.sheetInspections.filter(s => s.status !== 'OK').length} defect` : ''}
                              </span>
                            )}
                          </div>
                          <input type="text" className="sap-input w-full text-xs font-bold"
                            placeholder="e.g. plain 5mm, mirror 84x144, 6mm…"
                            value={line.searchQuery} autoComplete="off"
                            onChange={e => updateLine(line.id, { searchQuery: e.target.value, showSuggestions: true })}
                            onFocus={() => updateLine(line.id, { showSuggestions: true })}/>
                          {line.showSuggestions && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
                              {suggs.length === 0
                                ? <div className="px-3 py-2 text-[10px] text-slate-400 italic">No matches</div>
                                : suggs.map(s => (
                                  <button key={s.label}
                                    className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-50 last:border-0 flex items-center justify-between"
                                    onMouseDown={e => { e.preventDefault(); pickSuggestion(line.id, s); }}>
                                    <span className="text-xs font-black text-slate-800 uppercase">{s.label}</span>
                                    {s.lastMAP > 0 && (
                                      <span className="text-[9px] font-bold text-emerald-600 ml-3">MAP {s.lastMAP.toFixed(0)}</span>
                                    )}
                                  </button>
                                ))
                              }
                              {/* ── Add Custom / Undergauge Size ── */}
                              <button
                                className="w-full text-left px-3 py-2.5 hover:bg-amber-50 border-t border-slate-200 flex items-center gap-2 bg-slate-50"
                                onMouseDown={e => {
                                  e.preventDefault();
                                  updateLine(line.id, {
                                    showSuggestions: false,
                                    showSizeEditor: true,
                                    isUndergauge: true,
                                  });
                                }}>
                                <Plus size={12} className="text-amber-600"/>
                                <span className="text-xs font-black text-amber-700 uppercase">Custom / Undergauge Size</span>
                                <span className="text-[9px] text-slate-400 font-bold ml-auto">Enter W×H manually</span>
                              </button>
                            </div>
                          )}
                          {/* ── Inline Size Editor (for undergauge / custom) ── */}
                          {(line.showSizeEditor || line.isUndergauge) && (
                            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                              {line.isUndergauge && (
                                <span className="text-[8px] font-black uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">Undergauge</span>
                              )}
                              <input type="text" inputMode="decimal" placeholder="W"
                                className="w-14 px-1.5 py-1 border border-amber-200 rounded text-[10px] font-black text-center bg-amber-50 outline-none focus:ring-1 focus:ring-amber-400"
                                value={line.customWidth}
                                onChange={e => {
                                  const w = e.target.value.replace(/[^0-9.]/g, '');
                                  const h = line.customHeight;
                                  const newSize = w && h ? `${w}x${h}` : line.sheetSize;
                                  updateLine(line.id, { customWidth: w, sheetSize: newSize });
                                }}/>
                              <span className="text-[10px] font-black text-slate-400">×</span>
                              <input type="text" inputMode="decimal" placeholder="H"
                                className="w-14 px-1.5 py-1 border border-amber-200 rounded text-[10px] font-black text-center bg-amber-50 outline-none focus:ring-1 focus:ring-amber-400"
                                value={line.customHeight}
                                onChange={e => {
                                  const h = e.target.value.replace(/[^0-9.]/g, '');
                                  const w = line.customWidth;
                                  const newSize = w && h ? `${w}x${h}` : line.sheetSize;
                                  updateLine(line.id, { customHeight: h, sheetSize: newSize });
                                }}/>
                              <span className="text-[9px] text-slate-400 font-bold">inch</span>
                              {line.customWidth && line.customHeight && (
                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  = {sqftOf(`${line.customWidth}x${line.customHeight}`).toFixed(1)} sqft
                                </span>
                              )}
                              <button
                                className="text-[9px] text-slate-400 hover:text-red-500 ml-1"
                                onClick={() => updateLine(line.id, { isUndergauge: false, showSizeEditor: false, customWidth: '', customHeight: '' })}
                                title="Remove custom size">
                                <X size={10}/>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Sheets */}
                        <input type="number" min="0" className="sap-input text-xs font-black text-right mt-[16px]"
                          placeholder="0" value={line.sheetCount || ''}
                          onChange={e => {
                            const cnt = Number(e.target.value);
                            updateLine(line.id, { sheetCount: cnt });
                          }}/>

                        {/* Sqft */}
                        <div className={`sap-input text-xs font-black text-right mt-[16px] cursor-not-allowed ${line.totalSqft > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-300'}`}>
                          {line.totalSqft > 0 ? line.totalSqft.toFixed(1) : '—'}
                        </div>

                        {/* Sqmtr — editable */}
                        <input type="number" min="0" step="0.001"
                          className="sap-input text-xs font-bold text-right text-blue-700 mt-[16px]"
                          placeholder="—" value={line.totalSqmtr || ''}
                          onChange={e => updateLine(line.id, { totalSqmtr: Number(e.target.value) })}/>

                        {/* Weight */}
                        <input type="number" min="0"
                          className="sap-input text-xs font-bold text-right mt-[16px]"
                          placeholder="0 kg" value={line.weightKg || ''}
                          onChange={e => updateLine(line.id, { weightKg: Number(e.target.value) })}/>

                        {/* Rate */}
                        <div className="mt-[16px]">
                          <input type="number" min="0"
                            className="sap-input text-xs font-black text-right w-full"
                            placeholder="0.00" value={line.ratePKR || ''}
                            onChange={e => updateLine(line.id, { ratePKR: Number(e.target.value) })}/>
                        </div>

                        {/* Total */}
                        <div className={`text-xs font-black text-right pr-1 mt-[16px] ${line.lineValue > 0 ? 'text-emerald-700' : 'text-slate-200'}`}>
                          {line.lineValue > 0 ? Math.round(line.lineValue).toLocaleString() : '—'}
                        </div>

                        {/* Remove */}
                        <button onClick={() => removeLine(line.id)}
                          className={`w-6 h-6 rounded flex items-center justify-center mt-[16px] ${lines.length > 1 ? 'text-red-300 hover:text-red-600' : 'text-slate-100 cursor-not-allowed'}`}>
                          <Trash2 size={11}/>
                        </button>
                      </div>

                      {/* Weight computed display */}
                      {isFilled && line.weightKg > 0 && (
                        <div className="px-3 pb-2 flex gap-4 text-[9px] font-bold text-slate-500">
                          <span>Per sheet: <span className="text-slate-700">{line.perSheetWeightKg.toFixed(2)} kg</span></span>
                          <span>Per sqft: <span className="text-slate-700">{line.perSqftWeightKg.toFixed(4)} kg</span></span>
                        </div>
                      )}

                      {/* ── Sheet Inspections ── */}
                      {line.sheetInspections.length > 0 && (
                        <div className="border-t border-slate-100 mx-3 mb-2">
                          <button
                            className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-500 hover:text-slate-800 py-2 w-full"
                            onClick={() => updateLine(line.id, { expanded: !line.expanded })}>
                            {line.expanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                            Sheet Inspection ({line.sheetInspections.length} tags)
                            {hasDefects && <span className="text-amber-600">— {line.sheetInspections.filter(s=>s.status!=='OK').length} defect(s)</span>}
                          </button>

                          {line.expanded && (
                            <div className="space-y-1 pb-2 max-h-72 overflow-y-auto">
                              {/* Inspection header */}
                              <div className="grid text-[8px] font-black uppercase text-slate-400 px-1 gap-1"
                                style={{ gridTemplateColumns: '120px 90px 80px 70px 1fr 60px' }}>
                                <span>Tag ID</span>
                                <span>Status</span>
                                <span>Defect Code</span>
                                <span>Usable sqft</span>
                                <span>Cutter Note</span>
                                <span>Photo</span>
                              </div>
                              {line.sheetInspections.map(insp => (
                                <div key={insp.tagId}
                                  className={`grid gap-1 px-1 py-1 rounded-lg items-center ${insp.status !== 'OK' ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}
                                  style={{ gridTemplateColumns: '120px 90px 80px 70px 1fr 60px' }}>

                                  <span className="text-[9px] font-mono font-bold text-slate-600">{insp.tagId}</span>

                                  {/* Status */}
                                  <select
                                    className={`text-[9px] font-black border rounded px-1 py-0.5 ${insp.status === 'OK' ? 'text-emerald-700 border-emerald-200' : insp.status === 'Defective' ? 'text-amber-700 border-amber-200' : 'text-red-700 border-red-200'}`}
                                    value={insp.status}
                                    onChange={e => updateInspection(line.id, insp.tagId, { status: e.target.value as any, usableSqft: e.target.value === 'OK' ? line.sqftPerSheet : insp.usableSqft })}>
                                    <option value="OK">OK</option>
                                    <option value="Defective">Defective</option>
                                    <option value="Broken">Broken</option>
                                  </select>

                                  {/* Defect code */}
                                  {insp.status !== 'OK'
                                    ? <select className="text-[9px] border rounded px-1 py-0.5 border-amber-200"
                                        value={insp.defectCode}
                                        onChange={e => updateInspection(line.id, insp.tagId, { defectCode: e.target.value })}>
                                        <option value="">— Code —</option>
                                        {DEFECT_CODES.map(d => <option key={d.value} value={d.value}>{d.value}</option>)}
                                      </select>
                                    : <span className="text-[9px] text-slate-300">—</span>
                                  }

                                  {/* Usable sqft */}
                                  {insp.status !== 'OK'
                                    ? <input type="number" min="0" max={line.sqftPerSheet}
                                        className="text-[9px] border border-amber-200 rounded px-1 py-0.5 w-full text-right font-bold"
                                        value={insp.usableSqft || ''}
                                        onChange={e => updateInspection(line.id, insp.tagId, { usableSqft: Number(e.target.value) })}/>
                                    : <span className="text-[9px] text-slate-400 text-right">{line.sqftPerSheet.toFixed(1)}</span>
                                  }

                                  {/* Cutter note */}
                                  <input type="text"
                                    className="text-[9px] border border-slate-200 rounded px-1 py-0.5 w-full"
                                    placeholder="Instruction for cutter…"
                                    value={insp.cutterNote}
                                    onChange={e => updateInspection(line.id, insp.tagId, { cutterNote: e.target.value })}/>

                                  {/* Photo */}
                                  <button onClick={() => handlePhoto(line.id, insp.tagId)}
                                    className={`flex items-center gap-0.5 text-[9px] font-bold px-2 py-1 rounded ${insp.photos.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-blue-50'}`}>
                                    <Camera size={10}/>
                                    {insp.photos.length > 0 ? `${insp.photos.length}` : '+'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Generate Tags Button ── */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex gap-4 text-xs">
                <span className="font-bold text-slate-500">Lines: <span className="font-black text-slate-800">{filledLines.length}/{lines.length}</span></span>
                <span className="font-bold text-slate-500">Sheets: <span className="font-black text-slate-800">{totalSheets}</span></span>
                <span className="font-bold text-slate-500">SqFt: <span className="font-black text-slate-800">{totalSqft.toFixed(1)}</span></span>
                <span className="font-bold text-slate-500">Sq Mtr: <span className="font-black text-slate-800">{totalSqmtr.toFixed(2)}</span></span>
                <span className="font-bold text-slate-500">Weight: <span className="font-black text-slate-800">{totalWeight.toFixed(1)} kg</span></span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleGenerateTags}
                  className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase ${tagsGenerated ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-900 text-white hover:bg-blue-700'}`}>
                  <Tag size={13}/>
                  {tagsGenerated ? `Tags Generated (${lines.reduce((s,l)=>s+l.tagIds.length,0)}) ✓` : 'Generate Tags'}
                </button>
                {tagsGenerated && (
                  <button onClick={() => {
                    const tagLines = lines.filter(l => l.tagIds.length > 0);
                    const printContent = tagLines.map(l =>
                      l.tagIds.map(t => `<div style="border:1px dashed #999;padding:8px;margin:4px;display:inline-block;font-family:monospace;font-size:11px;min-width:220px;">
                        <div style="font-weight:900;font-size:13px;">${t}</div>
                        <div>${l.category} ${l.thickness} ${l.sheetSize}"</div>
                        <div style="color:#666;">${selectedVendor?.name || ''} | ${grnId}</div>
                        <div style="color:#666;">${grnDate}</div>
                      </div>`).join('')
                    ).join('');
                    const w = window.open('', '_blank', 'width=800,height=600');
                    if (w) {
                      w.document.write(`<html><head><title>Sheet Tags — ${grnId}</title></head><body style="padding:16px;">
                        <h3 style="font-family:sans-serif;margin-bottom:12px;">Sheet Tags — ${grnId} (${lines.reduce((s,l)=>s+l.tagIds.length,0)} tags)</h3>
                        <div style="display:flex;flex-wrap:wrap;gap:4px;">${printContent}</div>
                        <script>setTimeout(()=>window.print(),500)<\/script>
                      </body></html>`);
                      w.document.close();
                    }
                  }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-700">
                    <Printer size={13}/> Print Tags
                  </button>
                )}
              </div>
            </div>

            {/* Defect summary */}
            {defectCount > 0 && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5"/>
                <div className="text-[10px] text-amber-800 font-bold">
                  {defectCount} defective sheet(s) recorded —
                  {brokenCount > 0 ? ` ${brokenCount} fully broken (NCR will auto-generate)` : ' vendor claim draft will be created on post'}
                </div>
              </div>
            )}
          </div>

          {/* ── Section 3: Footer / Charges ── */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 pb-3 border-b mb-4">
              <Truck size={14} className="text-slate-600"/>
              <span className="text-xs font-black uppercase tracking-widest">Charges & Unloading</span>
            </div>

            {/* ── ROW A: Freight (existing — keep as is) ── */}
            <div className="mb-4">
              <div className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest flex items-center gap-1.5">
                <Truck size={10}/> Freight
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Freight PKR</label>
                  <input type="number" min="0" className="sap-input w-full font-bold"
                    value={freightPKR || ''} onChange={e => setFreightPKR(Number(e.target.value))}/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Freight Type</label>
                  <select className="sap-input w-full font-bold" value={freightType} onChange={e => setFreightType(e.target.value as any)}>
                    <option value="Vendor Included">Vendor Included (Paid to transporter)</option>
                    <option value="Own Expense">Own Expense</option>
                  </select>
                </div>
                {freightType === 'Vendor Included' && freightPKR > 0 && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-amber-600">Cash Payment Ref *</label>
                    <input type="text" className="sap-input w-full font-bold border-amber-200" placeholder="Receipt / reference"
                      value={cashPaymentRef} onChange={e => setCashPaymentRef(e.target.value)}/>
                  </div>
                )}
              </div>
            </div>

            {/* ── ROW B: Crane (new) ── */}
            <div className="mb-4 border-t border-slate-100 pt-4">
              <div className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest flex items-center gap-1.5">
                <Package size={10}/> Crane / Unloading
                <span className="text-[8px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded ml-1">Auto PV</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Crane Vendor</label>
                  <select className="sap-input w-full font-bold" value={craneVendorId} onChange={e => setCraneVendorId(e.target.value)}>
                    <option value="">— Select Crane Vendor —</option>
                    {craneVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  {craneVendors.length === 0 && (
                    <p className="text-[8px] text-amber-600 font-bold">No Crane vendors registered — add in Vendor Hub</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Crane Amount PKR</label>
                  <input type="number" min="0" className="sap-input w-full font-bold"
                    value={craneAmount || ''} onChange={e => setCraneAmount(Number(e.target.value))}/>
                </div>
                {craneAmount > 0 && (
                  <div className="flex items-end pb-1">
                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      PV: Dr Unloading Expense 51215 / Cr Cash 11112 = PKR {craneAmount.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ── ROW C: Labour + Packing (new — IFRS gross) ── */}
            <div className="mb-4 border-t border-slate-100 pt-4">
              <div className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest flex items-center gap-1.5">
                <Users size={10}/> Labour & Packing Buyback
                <span className="text-[8px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded ml-1">IFRS Gross</span>
                <span className="text-[8px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">Auto PV</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Labour Vendor</label>
                  <select className="sap-input w-full font-bold" value={labourVendorId} onChange={e => setLabourVendorId(e.target.value)}>
                    <option value="">— Select Labour —</option>
                    {labourVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  {labourVendors.length === 0 && (
                    <p className="text-[8px] text-amber-600 font-bold">No Labour vendors — add in Vendor Hub</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Labour Charges PKR (Gross)</label>
                  <input type="number" min="0" className="sap-input w-full font-bold"
                    value={labourCharges || ''} onChange={e => setLabourCharges(Number(e.target.value))}/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">No. of Pallets</label>
                  <input type="number" min="0" className="sap-input w-full font-bold"
                    value={palletCount || ''} onChange={e => setPalletCount(Number(e.target.value))}/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
                    Rate/Pallet PKR
                    <button onClick={() => setShowPalletHistory(!showPalletHistory)} className="text-blue-500 hover:text-blue-700" title="View rate history">
                      <History size={10}/>
                    </button>
                  </label>
                  <input type="number" min="0" className="sap-input w-full font-bold"
                    value={palletRate || ''} onChange={e => setPalletRate(Number(e.target.value))}/>
                </div>
              </div>

              {/* Pallet Rate History */}
              {showPalletHistory && palletRateHistory.length > 0 && (
                <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <div className="text-[8px] font-black uppercase text-blue-500 mb-1.5 tracking-widest">Last 5 Pallet Rates</div>
                  <div className="space-y-1">
                    {palletRateHistory.map(r => (
                      <div key={r.id} className="flex items-center justify-between text-[9px] font-bold text-slate-600 bg-white px-2 py-1 rounded">
                        <span className="font-mono">{r.date}</span>
                        <span>{r.vendorName}</span>
                        <span>{r.palletCount} pallets × PKR {r.ratePerPallet}</span>
                        <span className="font-black text-blue-700">= PKR {r.totalPacking.toLocaleString()}</span>
                        <span className="text-[8px] text-slate-400">{r.grnId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {showPalletHistory && palletRateHistory.length === 0 && (
                <div className="mt-2 text-[9px] text-slate-400 font-bold italic">No pallet rate history yet</div>
              )}

              {/* Computed summary */}
              {labourCharges > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 rounded-xl px-3 py-2 text-center">
                    <div className="text-[8px] font-black uppercase text-slate-400">Packing Buyback</div>
                    <div className="text-sm font-black text-emerald-600">PKR {Math.round(packingBuyback).toLocaleString()}</div>
                    <div className="text-[8px] text-slate-400">{palletCount} × {palletRate}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl px-3 py-2 text-center">
                    <div className="text-[8px] font-black uppercase text-slate-400">Net Payable</div>
                    <div className={`text-sm font-black ${labourNetPayable >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      PKR {Math.round(labourNetPayable).toLocaleString()}
                    </div>
                    <div className="text-[8px] text-slate-400">{labourCharges} − {Math.round(packingBuyback)}</div>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                    <div className="text-[8px] font-black uppercase text-blue-500">PV Entry (3 lines)</div>
                    <div className="space-y-0.5 mt-1">
                      <div className="text-[8px] font-bold text-slate-600">Dr 51216 Unloading Labour = {labourCharges.toLocaleString()}</div>
                      <div className="text-[8px] font-bold text-emerald-600">Cr 44112 Packing Income = {Math.round(packingBuyback).toLocaleString()}</div>
                      <div className="text-[8px] font-bold text-red-600">Cr 11112 Cash = {Math.round(labourNetPayable).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── ROW D: Bilty Weight ── */}
            <div className="mb-4 border-t border-slate-100 pt-4">
              <div className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest flex items-center gap-1.5">
                <Scale size={10}/> Weight Reconciliation
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Bilty Weight (KG)</label>
                  <input type="number" min="0" className="sap-input w-full font-bold"
                    value={biltyWeight || ''} onChange={e => setBiltyWeight(Number(e.target.value))}/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Glass Weight (KG)</label>
                  <div className="sap-input w-full font-bold bg-slate-50 text-slate-700 cursor-not-allowed">
                    {totalWeight.toFixed(1)}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Packing Weight (KG)</label>
                  <div className={`sap-input w-full font-black ${biltyWeight > 0 && biltyWeight > totalWeight ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-400'}`}>
                    {biltyWeight > 0 ? (biltyWeight - totalWeight).toFixed(1) : '—'}
                  </div>
                </div>
                {biltyWeight > 0 && biltyWeight < totalWeight && (
                  <div className="flex items-end pb-1">
                    <span className="text-[9px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded flex items-center gap-1">
                      <AlertTriangle size={10}/> Glass weight exceeds bilty weight!
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ── ROW E: Other Charges (existing — keep) ── */}
            <div className="border-t border-slate-100 pt-4">
              <div className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest flex items-center gap-1.5">
                <CreditCard size={10}/> Other Charges
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Other Charges PKR</label>
                  <input type="number" min="0" className="sap-input w-full font-bold"
                    value={otherCharges || ''} onChange={e => setOtherCharges(Number(e.target.value))}/>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">
                    Other Charges Description {otherCharges > 0 && <span className="text-red-500">*</span>}
                  </label>
                  <input type="text" className="sap-input w-full font-bold uppercase"
                    placeholder="e.g. Loading charges, miscellaneous"
                    value={otherChargesDesc} onChange={e => setOtherChargesDesc(e.target.value)}/>
                </div>
              </div>
            </div>

            {/* ── Grand Total Bar ── */}
            <div className="mt-5 bg-slate-900 rounded-2xl p-4">
              <div className="flex flex-wrap gap-4 text-xs text-slate-400 mb-2">
                <span>Material: <span className="font-black text-white">PKR {Math.round(totalMaterial).toLocaleString()}</span></span>
                {freightPKR > 0 && <span>Freight: <span className="font-black text-blue-400">PKR {freightPKR.toLocaleString()}</span></span>}
                {craneAmount > 0 && <span>Crane: <span className="font-black text-cyan-400">PKR {craneAmount.toLocaleString()}</span></span>}
                {labourCharges > 0 && <span>Labour: <span className="font-black text-orange-400">PKR {labourCharges.toLocaleString()}</span></span>}
                {packingBuyback > 0 && <span>Packing: <span className="font-black text-emerald-400">−PKR {Math.round(packingBuyback).toLocaleString()}</span></span>}
                {otherCharges > 0 && <span>Other: <span className="font-black text-slate-300">PKR {otherCharges.toLocaleString()}</span></span>}
              </div>
              <div className="flex justify-between items-center">
                <div className="flex gap-3">
                  {(craneAmount > 0 || labourCharges > 0) && (
                    <span className="text-[9px] font-bold text-blue-400 bg-blue-900/30 px-2 py-1 rounded">
                      {(craneAmount > 0 ? 1 : 0) + (labourCharges > 0 ? 1 : 0)} PV(s) will be generated (Parked)
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold mr-3">Grand Total</span>
                  <span className="text-xl font-black text-white">PKR {Math.round(grandTotal).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ── Modal Footer ── */}
        <div className="px-6 py-4 bg-slate-50 border-t rounded-b-2xl flex justify-between items-center shrink-0">
          <div className="text-[10px] text-slate-500 font-bold space-x-3">
            {!tagsGenerated && <span className="text-amber-600">⚠ Generate tags before posting</span>}
            {tagsGenerated && <span className="text-emerald-600">✓ Tags ready</span>}
            {defectCount > 0 && <span className="text-amber-600">· {defectCount} defect(s)</span>}
          </div>
          <div className="flex gap-3">
            <button onClick={handleClose}
              className="px-6 py-2.5 border border-slate-300 rounded-xl text-xs font-black uppercase text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button onClick={handlePost}
              className="bg-blue-700 text-white px-10 py-2.5 rounded-xl text-xs font-black uppercase shadow-lg flex items-center gap-2 hover:bg-blue-800">
              <CheckCircle2 size={14}/> Post GRN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoodsReceiptMIGO;
