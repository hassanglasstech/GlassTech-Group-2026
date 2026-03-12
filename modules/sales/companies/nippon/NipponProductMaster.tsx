
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Product, StoreItem } from '@/modules/shared/types';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { supabase } from '@/src/services/supabaseClient';
import { getBrandNick } from '@/modules/shared/utils/brandUtils';
import { 
  Plus, Search, Edit2, Trash2, Package, Filter, Download, Box, 
  FileJson, FileSpreadsheet, FileUp, UploadCloud, LayoutGrid, List, Printer,
  TableProperties, ImagePlus, CheckCircle2, AlertCircle, Loader2, X, Link2
} from 'lucide-react';
import NipponProductForm from '@/modules/nippon/components/NipponProductForm';
import NipponSmartImporter from './components/NipponSmartImporter';
import { NipponCatalogPrint } from '@/modules/nippon/prints/NipponCatalogPrint';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────
type ActiveTab = 'list' | 'bulk' | 'excel' | 'import';

interface BulkRow {
  internalId: string; modelNo: string; description: string; brand: string;
  mainCategory: string; subCategory: string; unit: string;
  costPrice: string; salesPrice: string; finishColor: string;
  material: string; direction: string; tongueLength: string; spindleLength: string;
  hsCode: string; imageUrl: string;
}

interface ImageMatch {
  fileName: string; file: File; previewUrl: string;
  matchedModelNo: string; status: 'matched' | 'unmatched' | 'uploading' | 'done' | 'error';
  uploadedUrl?: string;
}

const EMPTY_ROW = (): BulkRow => ({
  internalId: '', modelNo: '', description: '', brand: '',
  mainCategory: '', subCategory: '', unit: 'PCS',
  costPrice: '', salesPrice: '', finishColor: '',
  material: '', direction: '', tongueLength: '', spindleLength: '',
  hsCode: '', imageUrl: ''
});

const BULK_COLS: { key: keyof BulkRow; label: string; width: string }[] = [
  { key: 'internalId',   label: 'Internal ID',    width: '100px' },
  { key: 'modelNo',      label: 'Model No',        width: '110px' },
  { key: 'description',  label: 'Description',     width: '200px' },
  { key: 'brand',        label: 'Brand',           width: '100px' },
  { key: 'mainCategory', label: 'Main Cat',        width: '130px' },
  { key: 'subCategory',  label: 'Sub Cat',         width: '100px' },
  { key: 'unit',         label: 'Unit',            width: '70px'  },
  { key: 'costPrice',    label: 'Cost (PKR)',       width: '90px'  },
  { key: 'salesPrice',   label: 'Sale (PKR)',       width: '90px'  },
  { key: 'finishColor',  label: 'Color/Finish',    width: '100px' },
  { key: 'material',     label: 'Material',        width: '120px' },
  { key: 'direction',    label: 'Direction',       width: '80px'  },
  { key: 'tongueLength', label: 'Size/Tongue',     width: '90px'  },
  { key: 'spindleLength',label: 'Spindle',         width: '80px'  },
  { key: 'hsCode',       label: 'HS Code',         width: '100px' },
  { key: 'imageUrl',     label: 'Image URL',       width: '160px' },
];

// ─── Main Component ───────────────────────────────────────────────────────────
const NipponProductMaster: React.FC = () => {
  const company = 'Nippon';
  const [products, setProducts] = useState<Product[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'catalog'>('table');
  const [activeTab, setActiveTab] = useState<ActiveTab>('list');
  const [isPrintingCatalog, setIsPrintingCatalog] = useState(false);

  // Bulk Paste state
  const [bulkRows, setBulkRows] = useState<BulkRow[]>(() => Array.from({ length: 20 }, EMPTY_ROW));
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSaved, setBulkSaved] = useState(0);
  const bulkTableRef = useRef<HTMLDivElement>(null);

  // Excel Import + Image Drop state
  const [excelRows, setExcelRows] = useState<BulkRow[]>([]);
  const [imageMatches, setImageMatches] = useState<ImageMatch[]>([]);
  const [isDroppingImages, setIsDroppingImages] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const excelImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => { refreshData(); }, []);

  const refreshData = async () => {
    const allProds = (await AsyncSalesService.getProducts()).filter(p => p.company === company);
    const allStore = InventoryService.getStore().filter(s => s.company === company);
    setProducts(allProds);
    setStoreItems(allStore);
  };

  const getStockLevel = (prodId: string) => storeItems.find(s => s.id === prodId)?.quantity ?? 0;

  // ─── Save single product helper ───────────────────────────────────────────
  const saveProductToStore = async (product: Product, allProds: Product[], allStore: StoreItem[]) => {
    const existing = allProds.find(p => p.id === product.id);
    if (existing) {
      allProds = allProds.map(p => p.id === product.id ? product : p);
    } else {
      allProds.push(product);
      allStore.push({
        id: product.id, company,
        name: product.description, category: product.category as any,
        quantity: 0, unrestrictedQty: 0, qiQty: 0, blockedQty: 0, reservedQty: 0, consignmentQty: 0,
        unit: product.unit, minLevel: 10, reorderPoint: 5,
        movingAveragePrice: product.costPrice || 0, totalValue: 0,
        storageBin: 'New', lastMovementDate: new Date().toISOString()
      });
    }
    return { allProds, allStore };
  };

  const handleSaveProduct = async (product: Product, storeItemData?: Partial<StoreItem>, silent?: boolean) => {
    let updatedProducts = await AsyncSalesService.getProducts();
    let updatedStore = InventoryService.getStore();
    const result = await saveProductToStore(product, updatedProducts, updatedStore);
    await AsyncSalesService.saveProducts(result.allProds);
    InventoryService.saveStore(result.allStore);
    await refreshData();
    if (!silent) {
      const isEdit = !!editingProduct;
      setIsModalOpen(false);
      setEditingProduct(null);
      toast.success(isEdit ? `"${product.description}" updated.` : `"${product.description}" added.`);
    }
  };

  // ─── BULK PASTE ───────────────────────────────────────────────────────────
  const handleBulkPaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    const lines = text.trim().split('\n').map(l => l.split('\t'));
    
    // Find active focused cell
    const focusedCell = document.activeElement as HTMLElement;
    const rowIdx = parseInt(focusedCell?.getAttribute('data-row') || '0');
    const colIdx = parseInt(focusedCell?.getAttribute('data-col') || '0');
    
    setBulkRows(prev => {
      const updated = [...prev];
      lines.forEach((line, li) => {
        const targetRow = rowIdx + li;
        while (updated.length <= targetRow) updated.push(EMPTY_ROW());
        const row = { ...updated[targetRow] };
        line.forEach((val, ci) => {
          const col = BULK_COLS[colIdx + ci];
          if (col) (row as any)[col.key] = val.trim();
        });
        updated[targetRow] = row;
      });
      return updated;
    });
  }, []);

  const updateBulkCell = (rowIdx: number, key: keyof BulkRow, val: string) => {
    setBulkRows(prev => {
      const updated = [...prev];
      updated[rowIdx] = { ...updated[rowIdx], [key]: val };
      return updated;
    });
  };

  const addBulkRows = (n = 10) => setBulkRows(prev => [...prev, ...Array.from({ length: n }, EMPTY_ROW)]);

  const clearBulkRows = () => {
    if (confirm('Clear all rows?')) setBulkRows(Array.from({ length: 20 }, EMPTY_ROW));
  };

  const saveBulkRows = async () => {
    const filled = bulkRows.filter(r => r.description.trim() || r.modelNo.trim());
    if (!filled.length) return;
    setBulkSaving(true);
    let allProds = await AsyncSalesService.getProducts();
    let allStore = InventoryService.getStore();
    let count = 0;
    for (const row of filled) {
      const id = `NIP-${row.modelNo.trim().toUpperCase() || Date.now()}`;
      const product: Product = {
        id, company: 'Nippon',
        description: row.description.trim().toUpperCase(),
        modelNo: row.modelNo.trim().toUpperCase(),
        brand: row.brand.trim().toUpperCase(),
        profileCode: row.internalId.trim().toUpperCase(),
        mainCategory: row.mainCategory.trim(),
        subCategory: row.subCategory.trim(),
        category: 'Hardware',
        unit: (row.unit || 'PCS') as any,
        costPrice: Number(row.costPrice) || 0,
        basePrice: Number(row.salesPrice) || 0,
        finishColor: row.finishColor.trim(),
        material: row.material.trim(),
        direction: row.direction.trim(),
        tongueLength: row.tongueLength.trim(),
        spindleLength: row.spindleLength.trim(),
        hsCode: row.hsCode.trim(),
        imageUrl: row.imageUrl.trim(),
        variants: [],
      };
      const result = await saveProductToStore(product, allProds, allStore);
      allProds = result.allProds;
      allStore = result.allStore;
      count++;
    }
    await AsyncSalesService.saveProducts(allProds);
    InventoryService.saveStore(allStore);
    await refreshData();
    setBulkSaved(count);
    setBulkSaving(false);
    toast.success(`${count} products saved!`);
    setTimeout(() => setBulkSaved(0), 3000);
  };

  // ─── EXCEL IMPORT ─────────────────────────────────────────────────────────
  const handleExcelImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(ws);
      const rows: BulkRow[] = raw.map(r => ({
        internalId:    String(r['Internal ID'] || r['internal_id'] || r['InternalID'] || ''),
        modelNo:       String(r['Model No'] || r['model_no'] || r['ModelNo'] || r['Code'] || ''),
        description:   String(r['Description'] || r['description'] || r['Item Name'] || ''),
        brand:         String(r['Brand'] || r['brand'] || ''),
        mainCategory:  String(r['Main Category'] || r['Main Cat'] || r['mainCategory'] || ''),
        subCategory:   String(r['Sub Category'] || r['Sub Cat'] || r['subCategory'] || ''),
        unit:          String(r['Unit'] || r['unit'] || 'PCS'),
        costPrice:     String(r['Cost Price'] || r['Cost (PKR)'] || r['costPrice'] || '0'),
        salesPrice:    String(r['Sales Price'] || r['Sale (PKR)'] || r['salesPrice'] || '0'),
        finishColor:   String(r['Finish'] || r['Color/Finish'] || r['finishColor'] || ''),
        material:      String(r['Material'] || r['material'] || ''),
        direction:     String(r['Direction'] || r['direction'] || ''),
        tongueLength:  String(r['Size/Tongue'] || r['Size'] || r['tongueLength'] || ''),
        spindleLength: String(r['Spindle'] || r['Spindle Length'] || r['spindleLength'] || ''),
        hsCode:        String(r['HS Code'] || r['hsCode'] || ''),
        imageUrl:      String(r['Image URL'] || r['imageUrl'] || ''),
      }));
      setExcelRows(rows);
      setImportResult(null);
    };
    reader.readAsBinaryString(file);
  };

  // ─── IMAGE DROP MATCHING ──────────────────────────────────────────────────
  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDroppingImages(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;

    const allProducts = products;
    const newMatches: ImageMatch[] = files.map(file => {
      const nameNoExt = file.name.replace(/\.[^.]+$/, '').trim().toUpperCase();
      // Try to match against model numbers (from excelRows first, then existing products)
      const sourceRows = excelRows.length ? excelRows : [];
      let matched = sourceRows.find(r => r.modelNo.toUpperCase() === nameNoExt)?.modelNo
        || allProducts.find(p => p.modelNo?.toUpperCase() === nameNoExt)?.modelNo
        || allProducts.find(p => p.modelNo?.toUpperCase().includes(nameNoExt) || nameNoExt.includes(p.modelNo?.toUpperCase() || '___'))?.modelNo
        || '';
      return {
        fileName: file.name,
        file,
        previewUrl: URL.createObjectURL(file),
        matchedModelNo: matched,
        status: matched ? 'matched' : 'unmatched'
      } as ImageMatch;
    });
    setImageMatches(prev => [...prev, ...newMatches]);
  }, [products, excelRows]);

  const updateImageMatch = (idx: number, modelNo: string) => {
    setImageMatches(prev => prev.map((m, i) => i === idx ? { ...m, matchedModelNo: modelNo, status: modelNo ? 'matched' : 'unmatched' } : m));
  };

  const removeImageMatch = (idx: number) => {
    setImageMatches(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const uploadImages = async () => {
    const toUpload = imageMatches.filter(m => m.status === 'matched');
    for (let i = 0; i < toUpload.length; i++) {
      const m = toUpload[i];
      setImageMatches(prev => prev.map(x => x.fileName === m.fileName ? { ...x, status: 'uploading' } : x));
      try {
        const slug = m.matchedModelNo.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        const fileName = `nippon/${slug}-${Date.now()}.jpg`;
        const blob = await compressImage(m.file, 300);
        const { error } = await supabase.storage.from('product-images').upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
        if (error) throw error;
        const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
        setImageMatches(prev => prev.map(x => x.fileName === m.fileName ? { ...x, status: 'done', uploadedUrl: data.publicUrl } : x));
        // Update excelRows imageUrl
        setExcelRows(prev => prev.map(r => r.modelNo.toUpperCase() === m.matchedModelNo.toUpperCase() ? { ...r, imageUrl: data.publicUrl } : r));
        // Update existing products
        const updProds = await AsyncSalesService.getProducts();
        const changed = updProds.map(p => p.modelNo?.toUpperCase() === m.matchedModelNo.toUpperCase() ? { ...p, imageUrl: data.publicUrl } : p);
        await AsyncSalesService.saveProducts(changed);
      } catch {
        setImageMatches(prev => prev.map(x => x.fileName === m.fileName ? { ...x, status: 'error' } : x));
      }
    }
    await refreshData();
  };

  const compressImage = (file: File, size: number): Promise<Blob> => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
        let w = img.width, h = img.height;
        if (w > h) { h = (h / w) * size; w = size; } else { w = (w / h) * size; h = size; }
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        canvas.toBlob(b => b ? res(b) : rej('fail'), 'image/jpeg', 0.82);
      };
      img.onerror = rej;
      img.src = e.target?.result as string;
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

  // ─── Excel + Image final import ───────────────────────────────────────────
  const handleFinalImport = async () => {
    if (!excelRows.length) return;
    setIsImporting(true);
    let allProds = await AsyncSalesService.getProducts();
    let allStore = InventoryService.getStore();
    let added = 0, skipped = 0;

    for (const row of excelRows) {
      if (!row.description.trim()) { skipped++; continue; }
      const id = `NIP-${row.modelNo.trim().toUpperCase() || Date.now()}`;
      // Merge uploaded image url if available
      const imgMatch = imageMatches.find(m => m.matchedModelNo.toUpperCase() === row.modelNo.toUpperCase() && m.uploadedUrl);
      const product: Product = {
        id, company: 'Nippon',
        description: row.description.trim().toUpperCase(),
        modelNo: row.modelNo.trim().toUpperCase(),
        brand: row.brand.trim().toUpperCase(),
        profileCode: row.internalId.trim().toUpperCase(),
        mainCategory: row.mainCategory.trim(),
        subCategory: row.subCategory.trim(),
        category: 'Hardware',
        unit: (row.unit || 'PCS') as any,
        costPrice: Number(row.costPrice) || 0,
        basePrice: Number(row.salesPrice) || 0,
        finishColor: row.finishColor.trim(),
        material: row.material.trim(),
        direction: row.direction.trim(),
        tongueLength: row.tongueLength.trim(),
        spindleLength: row.spindleLength.trim(),
        hsCode: row.hsCode.trim(),
        imageUrl: imgMatch?.uploadedUrl || row.imageUrl.trim(),
        variants: [],
      };
      const result = await saveProductToStore(product, allProds, allStore);
      allProds = result.allProds;
      allStore = result.allStore;
      added++;
    }
    await AsyncSalesService.saveProducts(allProds);
    InventoryService.saveStore(allStore);
    await refreshData();
    setImportResult({ added, skipped });
    setIsImporting(false);
  };

  // ─── Existing handlers (export/import JSON/Excel) ─────────────────────────
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify({ meta: { company, timestamp: new Date().toISOString() }, products }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Nippon_Backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        if (!data.products) throw new Error('Invalid');
        const others = (await AsyncSalesService.getProducts()).filter(p => p.company !== company);
        await AsyncSalesService.saveProducts([...others, ...data.products.map((p: any) => ({ ...p, company: 'Nippon' }))]);
        await refreshData();
      } catch { alert('Invalid JSON file'); }
    };
    reader.readAsText(file);
  };

  const handleExportExcel = () => {
    const data = products.map(p => ({
      'Internal ID': p.profileCode || '', 'Model No': p.modelNo || '', 'Description': p.description,
      'Brand': p.brand || '', 'Main Category': p.mainCategory || '', 'Sub Category': p.subCategory || '',
      'Unit': p.unit, 'Cost Price': p.costPrice || 0, 'Sales Price': p.basePrice || 0,
      'Color/Finish': p.finishColor || '', 'Material': p.material || '', 'Direction': p.direction || '',
      'Size/Tongue': p.tongueLength || '', 'Spindle': p.spindleLength || '',
      'HS Code': p.hsCode || '', 'Image URL': p.imageUrl || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'NipponMaster');
    XLSX.writeFile(wb, `Nippon_Template_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrintCatalog = () => { setIsPrintingCatalog(true); setTimeout(() => { window.print(); setIsPrintingCatalog(false); }, 500); };

  const filtered = useMemo(() => products
    .filter(p => {
      const q = searchTerm.toLowerCase();
      return (
        p.description.toLowerCase().includes(q) ||
        String(p.modelNo || '').toLowerCase().includes(q) ||
        String(p.profileCode || '').toLowerCase().includes(q) ||
        String(p.brand || '').toLowerCase().includes(q) ||
        String(p.finishColor || '').toLowerCase().includes(q) ||
        String(p.material || '').toLowerCase().includes(q) ||
        String(p.direction || '').toLowerCase().includes(q) ||
        String(p.mainCategory || '').toLowerCase().includes(q) ||
        String(p.subCategory || '').toLowerCase().includes(q) ||
        String(p.tongueLength || '').toLowerCase().includes(q) ||
        String(p.hsCode || '').toLowerCase().includes(q)
      )
        && (catFilter === 'All' || p.category === catFilter);
    })
    .sort((a, b) => a.description.localeCompare(b.description)),
    [products, searchTerm, catFilter]
  );

  // ─── TAB BUTTONS ─────────────────────────────────────────────────────────
  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'list',  label: 'Material Registry', icon: <List size={13}/> },
    { id: 'bulk',  label: 'Bulk Paste',         icon: <TableProperties size={13}/> },
    { id: 'excel', label: 'Excel + Images',     icon: <ImagePlus size={13}/> },
    { id: 'import',label: 'Smart Import',       icon: <UploadCloud size={13}/> },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* TABS */}
      <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-2xl w-fit no-print flex-wrap gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center gap-1.5
              ${activeTab === t.id ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── SMART IMPORT TAB ── */}
      {activeTab === 'import' && (
        <NipponSmartImporter onComplete={() => { setActiveTab('list'); refreshData(); }} />
      )}

      {/* ── BULK PASTE TAB ── */}
      {activeTab === 'bulk' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight flex items-center gap-2"><TableProperties size={16} className="text-red-600"/> Bulk Paste Entry</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Copy from Excel → click any cell → Ctrl+V. Rows auto-expand.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => addBulkRows(10)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all">+ 10 Rows</button>
              <button onClick={clearBulkRows} className="px-4 py-2 bg-slate-100 text-rose-500 rounded-xl font-black text-[10px] uppercase hover:bg-rose-50 transition-all">Clear</button>
              <button onClick={saveBulkRows} disabled={bulkSaving}
                className="px-6 py-2 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase hover:bg-red-700 transition-all flex items-center gap-2 disabled:opacity-50">
                {bulkSaving ? <Loader2 size={13} className="animate-spin"/> : <CheckCircle2 size={13}/>}
                {bulkSaved > 0 ? `Saved ${bulkSaved}!` : 'Save All'}
              </button>
            </div>
          </div>

          <div ref={bulkTableRef} className="bg-white rounded-2xl border border-slate-200 overflow-auto" onPaste={handleBulkPaste}>
            <table className="text-[11px] border-collapse" style={{ minWidth: '1800px' }}>
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-3 py-2 text-left font-black text-[9px] uppercase tracking-widest w-8 border-r border-slate-700">#</th>
                  {BULK_COLS.map(col => (
                    <th key={col.key} className="px-2 py-2 text-left font-black text-[9px] uppercase tracking-widest border-r border-slate-700 whitespace-nowrap" style={{ minWidth: col.width }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-3 py-0.5 text-slate-300 font-black text-[9px] border-r border-slate-100 text-center">{ri + 1}</td>
                    {BULK_COLS.map((col, ci) => (
                      <td key={col.key} className="px-0 py-0 border-r border-b border-slate-100">
                        <input
                          type="text"
                          data-row={ri} data-col={ci}
                          value={(row as any)[col.key]}
                          onChange={e => updateBulkCell(ri, col.key, e.target.value)}
                          className="w-full px-2 py-1.5 bg-transparent font-medium text-slate-700 uppercase focus:bg-blue-50 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400 transition-colors"
                          style={{ minWidth: col.width }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] font-bold text-slate-400 text-center uppercase">
            {bulkRows.filter(r => r.description.trim()).length} rows with data · Click any cell, then Ctrl+V to paste from Excel
          </p>
        </div>
      )}

      {/* ── EXCEL + IMAGE DROP TAB ── */}
      {activeTab === 'excel' && (
        <div className="space-y-4">
          {/* Step 1: Upload Excel */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center font-black">1</span>
              Upload Excel / Template
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handleExportExcel} className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 hover:bg-emerald-100 transition-all">
                <Download size={13}/> Download Template
              </button>
              <label className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 hover:bg-blue-100 transition-all cursor-pointer">
                <FileUp size={13}/> Upload Filled Excel
                <input type="file" className="hidden" accept=".xlsx,.xls" ref={excelImportRef} onChange={handleExcelImportFile}/>
              </label>
              {excelRows.length > 0 && (
                <span className="text-[10px] font-black text-emerald-600 uppercase flex items-center gap-1">
                  <CheckCircle2 size={13}/> {excelRows.length} rows loaded
                </span>
              )}
            </div>

            {excelRows.length > 0 && (
              <div className="mt-4 overflow-auto rounded-xl border border-slate-200 max-h-48">
                <table className="text-[10px] w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      {['#','Model No','Description','Brand','Unit','Cost','Sale','Color','Material'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-black text-[9px] uppercase text-slate-500 border-b border-slate-200 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelRows.slice(0, 50).map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-3 py-1.5 text-slate-300 font-black">{i+1}</td>
                        <td className="px-3 py-1.5 font-black text-blue-600 uppercase">{r.modelNo || '—'}</td>
                        <td className="px-3 py-1.5 font-bold text-slate-700 uppercase">{r.description}</td>
                        <td className="px-3 py-1.5 text-slate-500 uppercase">{r.brand}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.unit}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.costPrice}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.salesPrice}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.finishColor}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.material}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Step 2: Drop Images */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center font-black">2</span>
              Drop Product Images
              <span className="text-[9px] font-bold text-slate-400 normal-case tracking-normal ml-2">File name = Model No for auto-match (e.g. CZS133.jpg)</span>
            </h3>

            {/* Drop Zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDroppingImages(true); }}
              onDragLeave={() => setIsDroppingImages(false)}
              onDrop={handleImageDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${isDroppingImages ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50'}`}
            >
              <ImagePlus size={32} className={`mx-auto mb-2 ${isDroppingImages ? 'text-red-500' : 'text-slate-300'}`}/>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                {isDroppingImages ? 'Drop karo!' : 'Images yahan drag & drop karo'}
              </p>
              <p className="text-[10px] font-bold text-slate-300 mt-1">File Explorer se select karke browser window mein kheeench lao</p>
              <label className="inline-block mt-3 cursor-pointer px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 hover:bg-slate-100 transition-all">
                Ya Browse Karo
                <input type="file" multiple accept="image/*" className="hidden" onChange={e => {
                  if (!e.target.files) return;
                  const fakeDropEvent = { preventDefault: () => {}, dataTransfer: { files: e.target.files } } as any;
                  handleImageDrop(fakeDropEvent);
                }}/>
              </label>
            </div>

            {/* Image match list */}
            {imageMatches.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase">{imageMatches.filter(m => m.status === 'matched' || m.status === 'done').length}/{imageMatches.length} matched</p>
                  <button onClick={uploadImages}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 hover:bg-blue-700 transition-all">
                    <UploadCloud size={12}/> Upload All Matched
                  </button>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {imageMatches.map((m, idx) => (
                    <div key={idx} className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                      m.status === 'done' ? 'bg-emerald-50 border-emerald-200' :
                      m.status === 'error' ? 'bg-rose-50 border-rose-200' :
                      m.status === 'uploading' ? 'bg-blue-50 border-blue-200' :
                      m.status === 'matched' ? 'bg-white border-slate-200' :
                      'bg-amber-50 border-amber-200'
                    }`}>
                      <img src={m.previewUrl} alt="" className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-600 uppercase truncate">{m.fileName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Link2 size={10} className="text-slate-400 shrink-0"/>
                          <input
                            type="text"
                            value={m.matchedModelNo}
                            onChange={e => updateImageMatch(idx, e.target.value)}
                            placeholder="Model No..."
                            className="flex-1 text-[10px] font-black uppercase bg-transparent border-b border-slate-200 focus:outline-none focus:border-blue-400 text-blue-600 placeholder-slate-300"
                          />
                        </div>
                      </div>
                      <div className="shrink-0">
                        {m.status === 'done' && <CheckCircle2 size={16} className="text-emerald-500"/>}
                        {m.status === 'error' && <AlertCircle size={16} className="text-rose-500"/>}
                        {m.status === 'uploading' && <Loader2 size={16} className="text-blue-500 animate-spin"/>}
                        {m.status === 'matched' && <CheckCircle2 size={16} className="text-blue-400"/>}
                        {m.status === 'unmatched' && <AlertCircle size={16} className="text-amber-400"/>}
                      </div>
                      <button onClick={() => removeImageMatch(idx)} className="text-slate-300 hover:text-rose-500 transition-colors shrink-0"><X size={14}/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Final Import */}
          {excelRows.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center font-black">3</span>
                  Import to Product Master
                </h3>
                {importResult && (
                  <p className="text-[10px] font-black text-emerald-600 uppercase mt-1 flex items-center gap-1">
                    <CheckCircle2 size={12}/> {importResult.added} added, {importResult.skipped} skipped
                  </p>
                )}
              </div>
              <button onClick={handleFinalImport} disabled={isImporting}
                className="px-8 py-3 bg-red-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-red-700 transition-all flex items-center gap-2 disabled:opacity-50">
                {isImporting ? <Loader2 size={14} className="animate-spin"/> : <Box size={14}/>}
                {isImporting ? 'Importing...' : `Import ${excelRows.length} Products`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── LIST TAB ── */}
      {activeTab === 'list' && (
        <>
          {isPrintingCatalog && <div className="hidden print:block"><NipponCatalogPrint products={filtered}/></div>}

          {/* TOOLBAR */}
          <div className="flex flex-col lg:flex-row justify-between items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm w-full no-print gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-600 rounded-lg text-white shadow-inner"><Box size={20}/></div>
              <div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Nippon Hardware</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Kin Long & Accessories Registry</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 w-full lg:w-auto overflow-x-auto no-scrollbar pb-1">
              <input type="file" ref={jsonInputRef} className="hidden" accept=".json" onChange={handleImportJson}/>
              <input type="file" ref={excelInputRef} className="hidden" accept=".xlsx,.xls"/>
              <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
                <button onClick={handleExportJson} className="p-2 text-slate-600 hover:bg-white rounded-lg transition-all" title="Backup JSON"><FileJson size={18}/></button>
                <button onClick={handleExportExcel} className="p-2 text-emerald-600 hover:bg-white rounded-lg transition-all" title="Export Excel Template"><FileSpreadsheet size={18}/></button>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button onClick={() => jsonInputRef.current?.click()} className="p-2 text-slate-600 hover:bg-white rounded-lg transition-all" title="Restore JSON"><UploadCloud size={18}/></button>
              </div>
              <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl mr-2">
                <button onClick={() => setViewMode('table')} className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}><List size={18}/></button>
                <button onClick={() => setViewMode('catalog')} className={`p-2 rounded-lg transition-all ${viewMode === 'catalog' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}><LayoutGrid size={18}/></button>
              </div>
              <button onClick={handlePrintCatalog} className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-all mr-2"><Printer size={18}/></button>
              <div className="relative shrink-0">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                <select className="pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl font-bold text-xs uppercase focus:ring-2 focus:ring-red-500 outline-none" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                  <option value="All">All Groups</option>
                  <option value="Hardware">Hardware</option>
                  <option value="Accessory">Accessory</option>
                  <option value="Consumable">Consumable</option>
                </select>
              </div>
              <div className="relative w-48 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                <input type="text" placeholder="Search..." className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl font-bold text-xs uppercase focus:ring-2 focus:ring-red-500 outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
              </div>
              <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-red-600 transition-all flex items-center space-x-2">
                <Plus size={16}/><span>Add Item</span>
              </button>
            </div>
          </div>

          {viewMode === 'table' ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] no-print">
              <table className="w-full text-left sap-table">
                <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Internal ID</th><th>Image</th><th>System</th><th>Model No</th>
                    <th>Description</th><th>Brand</th><th>Color</th><th>Material</th><th>Dir</th>
                    <th>Size</th><th>Spindle</th><th>Category</th><th className="text-right">Unit Price</th>
                    <th className="text-right">Stock</th><th className="text-right pr-6">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(p => {
                    const stock = getStockLevel(p.id);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors text-xs group">
                        <td className="px-6 py-3 font-mono font-bold text-slate-400 uppercase">{p.profileCode || '-'}</td>
                        <td className="py-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center">
                            {p.imageUrl ? <img src={p.imageUrl} alt={p.description} className="w-full h-full object-cover"/> : <Package size={16} className="text-slate-300"/>}
                          </div>
                        </td>
                        <td className="font-black text-slate-500 uppercase">
                          <span className={`px-2 py-0.5 rounded border text-[9px] ${p.mainCategory === 'Aluminium Products' ? 'bg-blue-50 text-blue-700 border-blue-100' : p.mainCategory === 'UPVC' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500'}`}>
                            {p.mainCategory || 'Generic'}
                          </span>
                        </td>
                        <td className="font-black text-blue-600 uppercase">{p.modelNo || '-'}</td>
                        <td className="font-bold text-slate-800 uppercase">
                          <div className="flex flex-col"><span>{p.description}</span>{p.subCategory && <span className="text-[9px] text-slate-400 font-medium">TYPE: {p.subCategory}</span>}</div>
                        </td>
                        <td className="font-bold text-slate-500 text-[10px] uppercase">{getBrandNick(p.brand || '-')}</td>
                        <td className="font-medium text-slate-500 text-[10px] uppercase">{p.finishColor || '-'}</td>
                        <td className="font-medium text-slate-500 text-[10px] uppercase">{p.material || '-'}</td>
                        <td className="font-medium text-slate-500 text-[10px] uppercase">{p.direction || '-'}</td>
                        <td className="font-medium text-slate-500 text-[10px] uppercase">{p.tongueLength || p.thickness || '-'}</td>
                        <td className="font-medium text-slate-500 text-[10px] uppercase">{p.spindleLength || '-'}</td>
                        <td className="font-bold text-slate-500 text-[10px] uppercase"><span className="bg-slate-100 px-2 py-0.5 rounded border">{p.category}</span></td>
                        <td className="text-right font-bold text-slate-700 whitespace-nowrap">PKR {p.basePrice?.toLocaleString()}</td>
                        <td className="text-right"><span className={`text-sm font-black ${stock > 0 ? 'text-emerald-600' : 'text-rose-400'}`}>{stock.toLocaleString()}</span><span className="text-[9px] text-slate-400 ml-1 uppercase">{p.unit}</span></td>
                        <td className="pr-6 text-right">
                          <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded transition-all"><Edit2 size={12}/></button>
                            <button onClick={async () => { if(confirm(`"${p.description}" delete karen?`)) { try { await AsyncSalesService.deleteProduct(p.id); setProducts(prev => prev.filter(x => x.id !== p.id)); toast.success(`"${p.description}" deleted.`); } catch { toast.error('Delete failed'); } }}} className="p-1.5 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded transition-all"><Trash2 size={12}/></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="p-20 text-center text-slate-300 font-black uppercase italic text-xs tracking-widest"><Package size={48} className="mx-auto mb-4 opacity-10"/>No hardware items found.</div>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 no-print">
              {filtered.map(p => (
                <div key={p.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden group hover:shadow-xl transition-all flex flex-col">
                  <div className="aspect-square bg-slate-50 relative overflow-hidden flex items-center justify-center">
                    {p.imageUrl ? <img src={p.imageUrl} alt={p.description} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"/> : <Package size={48} className="text-slate-200"/>}
                    <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="p-2 bg-white/90 backdrop-blur shadow-lg rounded-xl text-blue-600 hover:bg-blue-600 hover:text-white transition-all"><Edit2 size={16}/></button>
                    </div>
                    <div className="absolute bottom-3 left-3"><span className="px-2 py-1 bg-slate-900/80 backdrop-blur text-white text-[9px] font-black uppercase rounded-lg tracking-widest">{p.modelNo || 'No Code'}</span></div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <h4 className="font-black text-slate-800 uppercase text-xs line-clamp-2 leading-tight h-8">{p.description}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{getBrandNick(p.brand || 'Generic')}</p>
                    <div className="mt-auto pt-3 border-t border-slate-100 flex justify-between items-end">
                      <div><p className="text-[9px] font-black text-slate-400 uppercase">Unit Price</p><p className="font-black text-slate-900 text-sm">PKR {p.basePrice?.toLocaleString()}</p></div>
                      <div className="text-right"><p className="text-[9px] font-black text-slate-400 uppercase">Stock</p><p className={`font-black text-sm ${getStockLevel(p.id) > 0 ? 'text-emerald-600' : 'text-rose-400'}`}>{getStockLevel(p.id)} <span className="text-[9px]">{p.unit}</span></p></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <NipponProductForm isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveProduct} editingProduct={editingProduct}/>
    </div>
  );
};

export default NipponProductMaster;
