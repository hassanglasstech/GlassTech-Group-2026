/**
 * NipponDirectImporter — zero-AI bulk import.
 *
 * When the upload file already has column headers matching Product field
 * names (profileCode, modelNo, description, mainCategory, subCategory,
 * brand, unit, basePrice, etc.), there is no need for AI column-mapping.
 * This direct importer reads the xlsx, validates the required fields,
 * shows a preview, and saves — all client-side, no edge-function calls.
 *
 * It's the recommended path for the pre-formatted
 * Nippon_Bulk_Import_V2_2026-05-20.xlsx file produced by the migration
 * builder.
 */
import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { toast } from 'sonner';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, Save, X, Image as ImageIcon, Download } from 'lucide-react';
import { Product } from '@/modules/procurement/types/inventory';
import { StoreItem } from '@/modules/shared/types';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';

// Map workbook column header → Product field name (case-insensitive)
const FIELD_ALIASES: Record<string, keyof Product | string> = {
  profilecode:    'profileCode',
  internalid:     'profileCode',
  modelno:        'modelNo',
  model:          'modelNo',
  description:    'description',
  itemname:       'description',
  subdescription: 'subDescription',
  brand:          'brand',
  maincategory:   'mainCategory',
  subcategory:    'subCategory',
  category:       'category',
  unit:           'unit',
  uom:            'unit',
  costprice:      'costPrice',
  cost:           'costPrice',
  baseprice:      'basePrice',
  saleprice:      'basePrice',
  salesprice:     'basePrice',
  unitprice:      'basePrice',
  finishcolor:    'finishColor',
  color:          'finishColor',
  material:       'material',
  direction:      'direction',
  tonguelength:   'tongueLength',
  spindlelength:  'spindleLength',
  hscode:         'hsCode',
  minlevel:       'minLevel',
  // `Image File` / `Picture` columns are human-readable filename
  // references — we deliberately do NOT alias them to imageUrl. The
  // real image data comes from embedded media via ExcelJS, mapped
  // to rows by anchor position. See extractImagesFromBuffer().
};

// Headers that tell us whether a product already has an image in storage
// (e.g. the "Has Image" column in Nippon_Product_List.xlsx).
// Value "yes" / "true" / "1" → has image.  Anything else → missing.
const HAS_IMAGE_HEADERS = new Set([
  'hasimage', 'withimage', 'imagestatus', 'imageexists',
  'haspicture', 'pictureexists', 'hasphoto',
]);

const normHeader = (h: string) => String(h || '').toLowerCase().replace(/[^a-z]/g, '');

interface RawRow { [k: string]: unknown }
interface PreviewProduct extends Partial<Product> {
  _row: number;
  _errors: string[];
  /** true = xlsx column says image exists in storage; false = explicitly missing; null = column absent */
  _hasImageFlag: boolean | null;
}

// ── Extract embedded images from xlsx, mapped by row index ─────────
// xlsx files store images in `xl/media/` with anchor positions defined
// in drawing XML. ExcelJS exposes both. We map each image to its anchor
// row → base64 data URL → set on the matching Product.imageUrl.
async function extractImagesFromBuffer(
  buf: ArrayBuffer,
  targetSheet: string
): Promise<Map<number, string>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet(targetSheet);
  if (!ws) return new Map();

  const byRow = new Map<number, string>();
  const images = ws.getImages();
  // ExcelJS .d.ts doesn't expose `index` on Media but the runtime does
  // (matches the `imageId` from drawings). Cast to access it.
  const mediaList = wb.model.media as unknown as Array<{ index: number; type: string; extension: string; buffer: ArrayBuffer | Uint8Array }>;
  for (const img of images) {
    const media = mediaList.find(m => m.index === (img.imageId as unknown as number));
    if (!media) continue;
    const tlRow = img.range?.tl?.nativeRow != null ? img.range.tl.nativeRow + 1 : null;
    if (tlRow == null) continue;

    const ext = (media.extension || 'png').toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    const bytes = media.buffer instanceof Uint8Array
      ? media.buffer
      : new Uint8Array(media.buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    byRow.set(tlRow, `data:${mime};base64,${base64}`);
  }
  return byRow;
}

const NipponDirectImporter: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [products, setProducts] = useState<PreviewProduct[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [missingImageCount, setMissingImageCount] = useState(0);
  const [showMissingList, setShowMissingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Compute missing-image count after images are resolved */
  const computeMissing = (parsed: PreviewProduct[], embedded: Map<number, string>): number =>
    parsed.filter(p => {
      // Has embedded image → not missing
      if (embedded.has(p._row)) return false;
      // Has Image column says yes → not missing
      if (p._hasImageFlag === true) return false;
      // Has Image column says no → missing
      // Has Image column absent → treat as missing (unknown = flagged)
      return true;
    }).length;

  const parseSheet = (wb: XLSX.WorkBook, sn: string): PreviewProduct[] => {
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: '' });
    if (rows.length === 0) return [];

    // Build header → field map from this sheet's headers
    const headers = Object.keys(rows[0]);
    const headerMap: Record<string, string> = {};
    for (const h of headers) {
      const normalized = normHeader(h);
      const field = FIELD_ALIASES[normalized];
      if (field) headerMap[h] = field as string;
    }

    // Detect a "Has Image" column (e.g. Nippon_Product_List.xlsx style)
    const hasImgHeader = headers.find(h => HAS_IMAGE_HEADERS.has(normHeader(h))) ?? null;

    return rows.map((row, idx): PreviewProduct => {
      const p: Partial<Product> & { [k: string]: unknown } = {
        company: 'Nippon',
        category: 'Hardware',
        variants: [],
        technicalSpecs: {},
      };
      for (const [origHeader, field] of Object.entries(headerMap)) {
        const v = row[origHeader];
        if (v === '' || v === null || v === undefined) continue;
        if (field === 'costPrice' || field === 'basePrice' || field === 'minLevel') {
          p[field] = Number(v) || 0;
        } else {
          p[field] = String(v).trim();
        }
      }

      // Generate a stable id from profileCode/modelNo OR row index
      const idBase = (p.profileCode || p.modelNo || '').toString();
      p.id = idBase ? `NIP-${idBase}` : `NIP-IMPORT-${Date.now()}-${idx}`;

      // Validation
      const errors: string[] = [];
      if (!p.description) errors.push('description missing');
      if (!p.unit) errors.push('unit missing');
      if (p.description) p.description = String(p.description).toUpperCase();

      // Read Has Image flag from explicit column (if present)
      let hasImageFlag: boolean | null = null;
      if (hasImgHeader !== null) {
        const raw = String(row[hasImgHeader] ?? '').trim().toLowerCase();
        hasImageFlag = raw === 'yes' || raw === 'true' || raw === '1';
      }

      return { ...(p as Product), _row: idx + 2, _errors: errors, _hasImageFlag: hasImageFlag };
    });
  };

  const handleFile = async (file: File) => {
    try {
      setFileName(file.name);
      const buf = await file.arrayBuffer();
      setFileBuffer(buf);
      const wb = XLSX.read(buf, { type: 'array' });
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);
      const targetSheet = wb.SheetNames.includes('Products') ? 'Products' : wb.SheetNames[0];
      setSheetName(targetSheet);
      const parsed = parseSheet(wb, targetSheet);

      // Attach embedded images by row anchor
      const imagesByRow = await extractImagesFromBuffer(buf, targetSheet);
      let attached = 0;
      for (const p of parsed) {
        const url = imagesByRow.get(p._row);
        if (url) { p.imageUrl = url; attached++; }
      }

      setProducts(parsed);
      setValidCount(parsed.filter(p => p._errors.length === 0).length);
      setErrorCount(parsed.filter(p => p._errors.length > 0).length);
      setImageCount(attached);
      setMissingImageCount(computeMissing(parsed, imagesByRow));
      setStep(2);
    } catch (err) {
      toast.error(`Could not read file: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  };

  const handleSheetChange = async (sn: string) => {
    if (!workbook || !fileBuffer) return;
    setSheetName(sn);
    const parsed = parseSheet(workbook, sn);
    const imagesByRow = await extractImagesFromBuffer(fileBuffer, sn);
    let attached = 0;
    for (const p of parsed) {
      const url = imagesByRow.get(p._row);
      if (url) { p.imageUrl = url; attached++; }
    }
    setProducts(parsed);
    setValidCount(parsed.filter(p => p._errors.length === 0).length);
    setErrorCount(parsed.filter(p => p._errors.length > 0).length);
    setImageCount(attached);
    setMissingImageCount(computeMissing(parsed, imagesByRow));
  };

  const exportMissingImagesCsv = () => {
    const missing = products.filter(p => !p.imageUrl && p._hasImageFlag !== true);
    if (missing.length === 0) { toast.info('No missing images to export.'); return; }
    const header = 'ID,Description,Profile Code,Model No,Brand,Main Category\n';
    const rows = missing.map(p =>
      [p.id, p.description, p.profileCode, p.modelNo, p.brand, p.mainCategory]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nippon_Missing_Images_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${missing.length} missing-image products.`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const valid = products.filter(p => p._errors.length === 0).map(p => {
        const clean: Product = { ...(p as unknown as Product) };
        delete (clean as unknown as { _row?: number })._row;
        delete (clean as unknown as { _errors?: string[] })._errors;
        return clean;
      });

      const existingProducts = SalesService.getProducts();
      // Dedup by id — overwrite existing Nippon products that share id
      const newIds = new Set(valid.map(v => v.id));
      const kept = existingProducts.filter(p => !(p.company === 'Nippon' && newIds.has(p.id)));
      SalesService.saveProducts([...kept, ...valid]);

      // Create matching StoreItem rows (zero qty — opening stock is a
      // separate flow). Only add ones not already in store.
      const existingStore = InventoryService.getStore();
      const existingStoreIds = new Set(existingStore.filter(s => s.company === 'Nippon').map(s => s.id));
      const newStoreItems: StoreItem[] = valid
        .filter(p => !existingStoreIds.has(p.id))
        .map(p => {
          // minLevel comes from the workbook row but lives on StoreItem,
          // not Product. Carried through as a loose field — pull it
          // off via index access rather than type-cast gymnastics.
          const minLevel = Number((p as unknown as { minLevel?: number }).minLevel) || 10;
          return {
            id: p.id,
            company: 'Nippon',
            name: p.description,
            category: 'Hardware',
            quantity: 0,
            unrestrictedQty: 0,
            qiQty: 0,
            blockedQty: 0,
            reservedQty: 0,
            consignmentQty: 0,
            unit: p.unit,
            minLevel,
            reorderPoint: Math.max(5, Math.floor(minLevel / 2)),
            movingAveragePrice: Number(p.costPrice) || 0,
            totalValue: 0,
            storageBin: 'Imported',
            lastMovementDate: new Date().toISOString(),
          };
        });
      InventoryService.saveStore([...existingStore, ...newStoreItems]);

      toast.success(`Imported ${valid.length} products${newStoreItems.length ? ` · ${newStoreItems.length} new store items` : ''}.`);
      setStep(3);
      setTimeout(() => onComplete(), 1200);
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden min-h-[600px] flex flex-col">
      {/* HEADER */}
      <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-900/20">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Direct Bulk Import</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No AI · Headers match field names · Fast</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${step >= s ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                {step > s ? <CheckCircle2 size={16} /> : s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-emerald-600' : 'bg-slate-800'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-8">
        {/* STEP 1 — UPLOAD */}
        {step === 1 && (
          <div className="max-w-xl mx-auto py-12 text-center space-y-6">
            <h3 className="text-xl font-black uppercase text-slate-800">Upload Pre-Formatted Excel</h3>
            <p className="text-xs font-medium text-slate-500">
              Expected headers: <span className="font-mono">profileCode, modelNo, description, brand, mainCategory, subCategory, unit, costPrice, basePrice, finishColor, material, direction, tongueLength, spindleLength, hsCode, minLevel</span>
            </p>
            <p className="text-xs text-slate-400">
              Required per row: <span className="font-bold">description</span> + <span className="font-bold">unit</span>. Everything else optional.
            </p>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-4 border-dashed border-slate-200 rounded-3xl p-12 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all cursor-pointer"
            >
              <input type="file" ref={fileRef} className="hidden" accept=".xlsx,.xls"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <UploadCloud size={32} className="text-emerald-600 mx-auto mb-3" />
              <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Click to browse Excel file</span>
            </div>
          </div>
        )}

        {/* STEP 2 — PREVIEW */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-slate-50 rounded-2xl p-4 border border-slate-200">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">File</p>
                <p className="text-sm font-black text-slate-800">{fileName}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-[10px] font-black uppercase text-slate-400">Sheet</label>
                <select
                  value={sheetName}
                  onChange={e => handleSheetChange(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                >
                  {sheetNames.map(sn => <option key={sn} value={sn}>{sn}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-4">
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Ready</p>
                <p className="text-3xl font-black text-emerald-700 mt-1">{validCount}</p>
              </div>
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase text-rose-600 tracking-widest">Need fixing</p>
                <p className="text-3xl font-black text-rose-700 mt-1">{errorCount}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest">With image</p>
                <p className="text-3xl font-black text-blue-700 mt-1">{imageCount}</p>
              </div>
              <div
                className={`rounded-2xl p-4 cursor-pointer transition-all ${missingImageCount > 0 ? 'bg-amber-50 border border-amber-200 hover:bg-amber-100' : 'bg-slate-50 border border-slate-200'}`}
                onClick={() => missingImageCount > 0 && setShowMissingList(v => !v)}
                title={missingImageCount > 0 ? 'Click to see list' : undefined}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">No image ▾</p>
                <p className={`text-3xl font-black mt-1 ${missingImageCount > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{missingImageCount}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Total</p>
                <p className="text-3xl font-black text-slate-700 mt-1">{products.length}</p>
              </div>
            </div>

            {/* Missing Images collapsible list */}
            {missingImageCount > 0 && showMissingList && (
              <div className="border border-amber-200 bg-amber-50 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200">
                  <p className="text-[10px] font-black uppercase text-amber-700 tracking-widest">
                    {missingImageCount} products — image missing in Supabase bucket
                  </p>
                  <button
                    onClick={exportMissingImagesCsv}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all"
                  >
                    <Download size={12} /> Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-amber-100 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-black uppercase text-[9px] text-amber-700">#</th>
                        <th className="px-3 py-2 text-left font-black uppercase text-[9px] text-amber-700">ID</th>
                        <th className="px-3 py-2 text-left font-black uppercase text-[9px] text-amber-700">Description</th>
                        <th className="px-3 py-2 text-left font-black uppercase text-[9px] text-amber-700">Category</th>
                        <th className="px-3 py-2 text-left font-black uppercase text-[9px] text-amber-700">Brand</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {products
                        .filter(p => !p.imageUrl && p._hasImageFlag !== true)
                        .map((p, i) => (
                          <tr key={p._row} className="hover:bg-amber-100/50">
                            <td className="px-3 py-1.5 text-amber-500 font-mono">{i + 1}</td>
                            <td className="px-3 py-1.5 font-black text-blue-600 font-mono text-[10px]">{p.id}</td>
                            <td className="px-3 py-1.5 font-medium text-slate-700">{String(p.description || '').slice(0, 45)}</td>
                            <td className="px-3 py-1.5 text-slate-500">{String(p.mainCategory || '—')}</td>
                            <td className="px-3 py-1.5 text-slate-500">{String(p.brand || '—')}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {errorCount > 0 && (
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={18} />
                <div className="text-xs">
                  <p className="font-black text-rose-700 uppercase tracking-widest mb-1">{errorCount} rows have issues — they will be skipped</p>
                  {products.filter(p => p._errors.length > 0).slice(0, 5).map(p => (
                    <p key={p._row} className="text-rose-600 font-medium">Row {p._row}: {p._errors.join(', ')}</p>
                  ))}
                  {errorCount > 5 && <p className="text-rose-400 text-[10px] mt-1">+{errorCount - 5} more</p>}
                </div>
              </div>
            )}

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Preview · first 10 rows</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-black uppercase text-[9px] text-slate-500">#</th>
                      <th className="px-3 py-2 text-center font-black uppercase text-[9px] text-slate-500">Img</th>
                      <th className="px-3 py-2 text-left font-black uppercase text-[9px] text-slate-500">Code</th>
                      <th className="px-3 py-2 text-left font-black uppercase text-[9px] text-slate-500">Description</th>
                      <th className="px-3 py-2 text-left font-black uppercase text-[9px] text-slate-500">Main</th>
                      <th className="px-3 py-2 text-left font-black uppercase text-[9px] text-slate-500">Sub</th>
                      <th className="px-3 py-2 text-left font-black uppercase text-[9px] text-slate-500">Unit</th>
                      <th className="px-3 py-2 text-right font-black uppercase text-[9px] text-slate-500">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.slice(0, 10).map(p => (
                      <tr key={p._row} className={p._errors.length > 0 ? 'bg-rose-50' : ''}>
                        <td className="px-3 py-2 text-slate-400 font-mono">{p._row}</td>
                        <td className="px-3 py-2 text-center">
                          {p.imageUrl
                            ? <img src={p.imageUrl} alt="" className="w-10 h-10 rounded border border-slate-200 object-cover inline-block" />
                            : <ImageIcon size={14} className="text-slate-300 inline-block" />}
                        </td>
                        <td className="px-3 py-2 font-black text-blue-600">{p.profileCode || p.modelNo || '—'}</td>
                        <td className="px-3 py-2 font-bold text-slate-700">{String(p.description || '').slice(0, 50)}</td>
                        <td className="px-3 py-2 text-slate-600">{String(p.mainCategory || '—')}</td>
                        <td className="px-3 py-2 text-slate-500">{String(p.subCategory || '—')}</td>
                        <td className="px-3 py-2 text-slate-500">{String(p.unit || '—')}</td>
                        <td className="px-3 py-2 text-right font-black text-slate-700">{Number(p.basePrice) > 0 ? Number(p.basePrice).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4">
              <button
                onClick={() => { setStep(1); setProducts([]); setWorkbook(null); }}
                className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                <X size={14} /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || validCount === 0}
                className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                  saving || validCount === 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100'
                }`}
              >
                <Save size={14} /> {saving ? 'Saving…' : `Import ${validCount} Products`}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — DONE */}
        {step === 3 && (
          <div className="max-w-md mx-auto py-16 text-center space-y-6">
            <CheckCircle2 size={64} className="text-emerald-500 mx-auto" />
            <h3 className="text-2xl font-black uppercase text-slate-800">Done</h3>
            <p className="text-sm text-slate-500">{validCount} products imported into Nippon master.</p>
            {imageCount > 0 && (
              <p className="text-sm text-blue-600 font-bold">{imageCount} products had embedded images — saved directly.</p>
            )}
            {missingImageCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left space-y-3">
                <p className="text-sm font-black text-amber-700 uppercase tracking-wide">
                  ⚠ {missingImageCount} products are missing images
                </p>
                <p className="text-xs text-amber-600">
                  These products have no image in the Supabase <code>product-images</code> bucket.
                  Upload the matching PNGs to fix.
                </p>
                <button
                  onClick={exportMissingImagesCsv}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-black uppercase hover:bg-amber-700 transition-all"
                >
                  <Download size={14} /> Export Missing Images List (CSV)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NipponDirectImporter;
