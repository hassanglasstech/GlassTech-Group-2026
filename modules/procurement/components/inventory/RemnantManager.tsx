/**
 * RemnantManager.tsx — Phase 7
 *
 * Complete remnant lifecycle:
 * - List all available remnants with bin location
 * - Create remnant manually (post-cutting)
 * - Shape: Rectangle or L-Shape with dimensions
 * - Suggest: next job fit check — show which jobs can use this remnant
 * - Age alert: 45+ days unused → flagged
 * - Scrap: mandatory reason, history recorded
 * - History-based threshold suggestion (not fixed)
 * - Tag print trigger
 */

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { toast } from 'sonner';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Remnant, RemnantDimensions, RemnantShape, RemnantHistoryEntry } from '@/modules/procurement/types/inventory';
import { GlassCoRemnantTagPrint, RemnantTagData } from '@/modules/glassco/core/prints/GlassCoSheetTagPrint';
import { postScrapDisposalGL } from '@/modules/procurement/services/grnGLService';
import {
  Plus, Trash2, Tag, MapPin, AlertTriangle, CheckCircle2,
  Clock, Search, ChevronDown, ChevronRight, Printer, Archive
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────
function calcRemnantSqft(shape: RemnantShape, dims: RemnantDimensions): number {
  if (shape === 'Rectangle') {
    const w = dims.widthInch || 0;
    const h = dims.heightInch || 0;
    return Number(((w * h) / 144).toFixed(3));
  }
  // L-Shape: two rectangles
  const a = ((dims.rect1Width || 0) * (dims.rect1Height || 0)) / 144;
  const b = ((dims.rect2Width || 0) * (dims.rect2Height || 0)) / 144;
  return Number((a + b).toFixed(3));
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function genRemnantId(thickness: string, company: string): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const seq = String(Math.floor(Math.random() * 900) + 100);
  const th = thickness.replace('mm', '');
  return `REM-${th}MM-${mm}${yy}-${seq}`;
}

const SCRAP_REASONS = [
  'Too small for any current orders',
  'Shape awkward — not usable',
  'Edge damaged — unusable',
  'Age too long — risk of damage',
  'Glass type not in demand',
  'Other',
];

const THICKNESS_OPTIONS = ['3mm', '4mm', '5mm', '6mm', '8mm', '10mm', '12mm', '15mm', '19mm'];
const GLASS_CATEGORIES = ['Plain', 'Clear', 'Mirror', 'Color', 'Fluted', 'Tinted', 'Frosted', 'Reflective'];

// ── Blank form ─────────────────────────────────────────────────────────────
function blankForm() {
  return {
    parentTagId: '',
    parentGrnId: '',
    thickness: '5mm',
    glassCategory: 'Plain',
    subCategory: '',
    shape: 'Rectangle' as RemnantShape,
    dimensions: {} as RemnantDimensions,
    binLocation: '',
    estimatedWeightKg: 0,
  };
}

// ══════════════════════════════════════════════════════════════════════════
const RemnantManager: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);

  const [search, setSearch]               = useState('');
  const [filterStatus, setFilterStatus]   = useState<'Available' | 'All'>('Available');
  const [showCreate, setShowCreate]       = useState(false);
  const [form, setForm]                   = useState(blankForm());
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [scrapModal, setScrapModal]       = useState<{ remnant: Remnant } | null>(null);
  const [scrapReason, setScrapReason]     = useState('');
  const [printTags, setPrintTags]         = useState<RemnantTagData[] | null>(null);

  // ── Data ─────────────────────────────────────────────────────────────
  const allRemnants = useMemo(() =>
    InventoryService.getRemnants()
      .filter(r => r.company === company)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  [company, showCreate, scrapModal, expanded]);

  const filtered = useMemo(() => {
    let list = allRemnants;
    if (filterStatus === 'Available') list = list.filter(r => r.status === 'Available');
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.id.toLowerCase().includes(q) ||
        r.thickness.toLowerCase().includes(q) ||
        r.glassCategory.toLowerCase().includes(q) ||
        r.binLocation.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allRemnants, filterStatus, search]);

  // Stats
  const stats = useMemo(() => ({
    total:     allRemnants.filter(r => r.status === 'Available').length,
    totalSqft: allRemnants.filter(r => r.status === 'Available').reduce((s, r) => s + r.sqft, 0),
    aged:      allRemnants.filter(r => r.status === 'Available' && daysSince(r.createdAt) >= 45).length,
  }), [allRemnants]);

  // ── Suggestion from history ───────────────────────────────────────────
  const getSuggestion = (thickness: string, sqft: number) => {
    return InventoryService.getRemnantSuggestion(company, thickness, sqft);
  };

  // ── Create remnant ────────────────────────────────────────────────────
  const handleCreate = () => {
    const sqft = calcRemnantSqft(form.shape, form.dimensions);
    if (sqft <= 0) { toast.error('Enter valid dimensions'); return; }
    if (!form.binLocation.trim()) { toast.error('Bin location required'); return; }

    const suggestion = getSuggestion(form.thickness, sqft);
    const id = genRemnantId(form.thickness, company);

    const remnant: Remnant = {
      id,
      company,
      parentTagId: form.parentTagId || 'MANUAL',
      parentGrnId: form.parentGrnId || 'MANUAL',
      materialId: `${form.glassCategory}-${form.thickness}`,
      thickness: form.thickness,
      glassCategory: form.glassCategory,
      subCategory: form.subCategory,
      shape: form.shape,
      dimensions: form.dimensions,
      sqft,
      estimatedWeightKg: form.estimatedWeightKg || 0,
      binLocation: form.binLocation,
      status: 'Available',
      createdAt: new Date().toISOString(),
      createdBy: 'Store',
    };

    InventoryService.upsertRemnant(remnant);

    // Update store item remnant count
    const store = InventoryService.getStore();
    const idx = store.findIndex(s =>
      s.company === company &&
      s.name?.toLowerCase().includes(form.thickness.toLowerCase()) &&
      s.name?.toLowerCase().includes(form.glassCategory.toLowerCase())
    );
    if (idx !== -1) {
      store[idx] = {
        ...store[idx],
        remnantCount: (store[idx].remnantCount || 0) + 1,
        remnantSqft:  (store[idx].remnantSqft  || 0) + sqft,
      };
      InventoryService.saveStore(store);
    }

    toast.success(`${id} created — ${sqft.toFixed(1)} sqft${suggestion.recommendation === 'Treat as Scrap' ? ' (history suggests this size often gets scrapped)' : ''}`);
    setShowCreate(false);
    setForm(blankForm());
  };

  // ── Scrap remnant ──────────────────────────────────────────────────────
  const handleScrap = () => {
    if (!scrapModal) return;
    if (!scrapReason) { toast.error('Select scrap reason'); return; }

    const r = scrapModal.remnant;
    const days = daysSince(r.createdAt);

    // Update remnant status
    InventoryService.upsertRemnant({
      ...r,
      status: 'Scrapped',
      scrapReason,
      scrapDate: new Date().toISOString(),
      scrapSqft: r.sqft,
    });

    // Record history for threshold suggestion
    const histEntry: RemnantHistoryEntry = {
      id: `RH-${Date.now()}`,
      company,
      thickness: r.thickness,
      sqft: r.sqft,
      outcome: 'Scrapped',
      daysInStock: days,
      scrapReason,
      recordedAt: new Date().toISOString(),
    };
    InventoryService.addRemnantHistoryEntry(histEntry);

    // Update store item
    const store = InventoryService.getStore();
    const idx = store.findIndex(s =>
      s.company === company && s.id === r.materialId
    );
    if (idx !== -1) {
      store[idx] = {
        ...store[idx],
        remnantCount: Math.max(0, (store[idx].remnantCount || 0) - 1),
        remnantSqft:  Math.max(0, (store[idx].remnantSqft  || 0) - r.sqft),
        scrapSqft:    (store[idx].scrapSqft    || 0) + r.sqft,
        scrapWeightKG:(store[idx].scrapWeightKG|| 0) + (r.estimatedWeightKg || 0),
      };
      InventoryService.saveStore(store);
    }

    // Phase 9 GL — scrap disposal entry
    const nominalKg = r.estimatedWeightKg || r.sqft * 0.14;
    const nominalValue = Number((nominalKg * 5).toFixed(2));
    postScrapDisposalGL({ company, disposalId: `SCR-${r.id}`, disposalDate: new Date().toISOString().split('T')[0], actualAmountReceived: 0, nominalBookValue: nominalValue, notes: scrapReason });

    toast.success(`${r.id} scrapped — GL entry posted`);
    setScrapModal(null);
    setScrapReason('');
  };

  // ── Print tag ─────────────────────────────────────────────────────────
  const handlePrintTag = (r: Remnant) => {
    const tagData: RemnantTagData = {
      tagId: r.id,
      parentTagId: r.parentTagId,
      grnId: r.parentGrnId,
      thickness: r.thickness,
      shape: r.shape,
      sqft: r.sqft,
      binLocation: r.binLocation,
      dimensions: r.dimensions,
      createdAt: new Date(r.createdAt).toLocaleDateString(),
    };
    setPrintTags([tagData]);
  };

  // ── Dimensions form ────────────────────────────────────────────────────
  const dimsValid = calcRemnantSqft(form.shape, form.dimensions) > 0;
  const suggestion = dimsValid
    ? getSuggestion(form.thickness, calcRemnantSqft(form.shape, form.dimensions))
    : null;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Print overlay */}
      {printTags && (
        <GlassCoRemnantTagPrint tags={printTags} onClose={() => setPrintTags(null)}/>
      )}

      {/* Scrap modal */}
      {scrapModal && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[500] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-sm font-black uppercase text-slate-800 mb-1">Scrap Remnant</h3>
            <p className="text-[10px] text-slate-500 font-bold mb-4">
              {scrapModal.remnant.id} — {scrapModal.remnant.sqft.toFixed(1)} sqft — {daysSince(scrapModal.remnant.createdAt)} days in stock
            </p>
            <div className="space-y-2 mb-5">
              <label className="text-[10px] font-black uppercase text-slate-400">Reason *</label>
              {SCRAP_REASONS.map(r => (
                <button key={r} onClick={() => setScrapReason(r)}
                  className={`w-full text-left text-xs font-bold px-4 py-2.5 rounded-xl border transition-colors ${scrapReason === r ? 'bg-red-600 text-white border-red-600' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setScrapModal(null); setScrapReason(''); }}
                className="px-5 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500">Cancel</button>
              <button onClick={handleScrap}
                className="px-6 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase hover:bg-red-700">
                Confirm Scrap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-sm font-black uppercase text-slate-800">Remnant Manager</h2>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              {stats.total} available · {stats.totalSqft.toFixed(1)} sqft
              {stats.aged > 0 && <span className="text-amber-600 ml-2">· {stats.aged} aged 45+ days</span>}
            </p>
          </div>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase ${showCreate ? 'border border-slate-200 text-slate-600' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg'}`}>
          {showCreate ? '✕ Cancel' : <><Plus size={13}/> Create Remnant</>}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-6 space-y-5">
          <h3 className="text-xs font-black uppercase text-slate-700 pb-3 border-b">New Remnant</h3>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Thickness</label>
              <select className="sap-input w-full font-bold" value={form.thickness}
                onChange={e => setForm(f => ({ ...f, thickness: e.target.value }))}>
                {THICKNESS_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Glass Category</label>
              <select className="sap-input w-full font-bold" value={form.glassCategory}
                onChange={e => setForm(f => ({ ...f, glassCategory: e.target.value }))}>
                {GLASS_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Shape</label>
              <select className="sap-input w-full font-bold" value={form.shape}
                onChange={e => setForm(f => ({ ...f, shape: e.target.value as RemnantShape, dimensions: {} }))}>
                <option value="Rectangle">Rectangle</option>
                <option value="L-Shape">L-Shape</option>
              </select>
            </div>
          </div>

          {/* Dimensions */}
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase text-slate-400">Dimensions (inches)</label>
            {form.shape === 'Rectangle' ? (
              <div className="flex items-center gap-3">
                <input type="number" min="0" className="sap-input w-32 font-bold" placeholder='Width "'
                  value={form.dimensions.widthInch || ''}
                  onChange={e => setForm(f => ({ ...f, dimensions: { ...f.dimensions, widthInch: Number(e.target.value) } }))}/>
                <span className="text-slate-400 font-bold">×</span>
                <input type="number" min="0" className="sap-input w-32 font-bold" placeholder='Height "'
                  value={form.dimensions.heightInch || ''}
                  onChange={e => setForm(f => ({ ...f, dimensions: { ...f.dimensions, heightInch: Number(e.target.value) } }))}/>
                {dimsValid && (
                  <span className="text-emerald-600 font-black text-sm">
                    = {calcRemnantSqft(form.shape, form.dimensions).toFixed(2)} sqft
                  </span>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-black text-slate-400 w-16">Rect 1:</span>
                  <input type="number" min="0" className="sap-input w-28 font-bold" placeholder='W "'
                    value={form.dimensions.rect1Width || ''}
                    onChange={e => setForm(f => ({ ...f, dimensions: { ...f.dimensions, rect1Width: Number(e.target.value) } }))}/>
                  <span className="text-slate-400">×</span>
                  <input type="number" min="0" className="sap-input w-28 font-bold" placeholder='H "'
                    value={form.dimensions.rect1Height || ''}
                    onChange={e => setForm(f => ({ ...f, dimensions: { ...f.dimensions, rect1Height: Number(e.target.value) } }))}/>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-black text-slate-400 w-16">Rect 2:</span>
                  <input type="number" min="0" className="sap-input w-28 font-bold" placeholder='W "'
                    value={form.dimensions.rect2Width || ''}
                    onChange={e => setForm(f => ({ ...f, dimensions: { ...f.dimensions, rect2Width: Number(e.target.value) } }))}/>
                  <span className="text-slate-400">×</span>
                  <input type="number" min="0" className="sap-input w-28 font-bold" placeholder='H "'
                    value={form.dimensions.rect2Height || ''}
                    onChange={e => setForm(f => ({ ...f, dimensions: { ...f.dimensions, rect2Height: Number(e.target.value) } }))}/>
                  {dimsValid && (
                    <span className="text-emerald-600 font-black text-sm">
                      = {calcRemnantSqft(form.shape, form.dimensions).toFixed(2)} sqft
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Bin Location *</label>
              <input type="text" className="sap-input w-full font-bold uppercase" placeholder="e.g. A-01"
                value={form.binLocation}
                onChange={e => setForm(f => ({ ...f, binLocation: e.target.value.toUpperCase() }))}
                list="remnant-loc-list"
                onBlur={() => { if (form.binLocation.trim()) InventoryService.ensureLocation(company, form.binLocation); }}
              />
              <datalist id="remnant-loc-list">
                {InventoryService.getStockLocations(company).map(l => (
                  <option key={l.id} value={l.code}>{l.description || l.code}</option>
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Est. Weight KG</label>
              <input type="number" min="0" className="sap-input w-full font-bold" placeholder="0"
                value={form.estimatedWeightKg || ''}
                onChange={e => setForm(f => ({ ...f, estimatedWeightKg: Number(e.target.value) }))}/>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Parent Sheet Tag</label>
              <input type="text" className="sap-input w-full font-mono text-xs" placeholder="GLS-5MM-..."
                value={form.parentTagId}
                onChange={e => setForm(f => ({ ...f, parentTagId: e.target.value }))}/>
            </div>
          </div>

          {/* History suggestion */}
          {suggestion && dimsValid && (
            <div className={`rounded-xl p-3 border flex items-start gap-2 ${suggestion.recommendation === 'Treat as Scrap' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              {suggestion.recommendation === 'Treat as Scrap'
                ? <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5"/>
                : <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5"/>
              }
              <div className="text-[10px] font-bold">
                <span className={suggestion.recommendation === 'Treat as Scrap' ? 'text-amber-700' : 'text-emerald-700'}>
                  History: {suggestion.usedCount} used, {suggestion.scrappedCount} scrapped
                  {suggestion.avgDaysBeforeScrap > 0 ? ` (avg ${suggestion.avgDaysBeforeScrap} days before scrap)` : ''}
                </span>
                <span className="text-slate-500 ml-2">→ Suggestion: {suggestion.recommendation}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={handleCreate}
              className="bg-emerald-600 text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase hover:bg-emerald-700">
              Save Remnant
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input placeholder="Search by ID, thickness, category, bin…" value={search}
            onChange={e => setSearch(e.target.value)} className="sap-input w-full pl-9"/>
        </div>
        <div className="flex gap-1">
          {(['Available', 'All'] as const).map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              className={`text-xs font-black uppercase px-4 py-2 rounded-xl border ${filterStatus === f ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Remnant list */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-16 text-center">
          <Archive size={32} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-sm font-bold text-slate-400">No remnants found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const isAged   = daysSince(r.createdAt) >= 45;
            const days     = daysSince(r.createdAt);
            const isExp    = expanded === r.id;
            const suggest  = getSuggestion(r.thickness, r.sqft);

            return (
              <div key={r.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isAged ? 'border-amber-300' : 'border-slate-200'}`}>

                {/* Row */}
                <div className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpanded(isExp ? null : r.id)}>

                  <div className={`w-2 h-2 rounded-full shrink-0 ${r.status === 'Available' ? isAged ? 'bg-amber-400' : 'bg-emerald-400' : r.status === 'Scrapped' ? 'bg-red-300' : 'bg-slate-300'}`}/>

                  <div className="flex-1 grid grid-cols-5 gap-3 items-center">
                    <div>
                      <div className="font-mono text-xs font-black text-slate-700">{r.id}</div>
                      <div className="text-[9px] text-slate-400 font-bold">{r.glassCategory} · {r.thickness}</div>
                    </div>
                    <div>
                      <div className="text-xs font-black text-slate-800">{r.sqft.toFixed(1)} sqft</div>
                      <div className="text-[9px] text-slate-400 font-bold">
                        {r.shape === 'Rectangle'
                          ? `${r.dimensions.widthInch}"×${r.dimensions.heightInch}"`
                          : 'L-Shape'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin size={11} className="text-slate-400 shrink-0"/>
                      <span className="text-xs font-bold text-slate-700 uppercase">{r.binLocation || '—'}</span>
                    </div>
                    <div>
                      {isAged
                        ? <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><Clock size={9}/>{days} days — review</span>
                        : <span className="text-[9px] text-slate-400 font-bold">{days} days in stock</span>
                      }
                    </div>
                    <div className="text-right">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${r.status === 'Available' ? 'bg-emerald-100 text-emerald-700' : r.status === 'Scrapped' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                        {r.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    {r.status === 'Available' && (
                      <>
                        <button onClick={() => handlePrintTag(r)}
                          className="flex items-center gap-1 text-[9px] font-bold text-slate-400 hover:text-blue-600 border border-slate-200 hover:border-blue-200 px-2 py-1 rounded-lg">
                          <Printer size={10}/> Tag
                        </button>
                        <button onClick={() => setScrapModal({ remnant: r })}
                          className="flex items-center gap-1 text-[9px] font-bold text-red-400 hover:text-red-600 border border-red-100 hover:border-red-200 px-2 py-1 rounded-lg">
                          <Trash2 size={10}/> Scrap
                        </button>
                      </>
                    )}
                    {isExp ? <ChevronDown size={13} className="text-slate-300"/> : <ChevronRight size={13} className="text-slate-300"/>}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 space-y-3">
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <div className="text-[9px] font-black uppercase text-slate-400 mb-1">Dimensions</div>
                        {r.shape === 'Rectangle' ? (
                          <div className="font-bold text-slate-700">{r.dimensions.widthInch}" × {r.dimensions.heightInch}"</div>
                        ) : (
                          <div className="font-bold text-slate-700">
                            R1: {r.dimensions.rect1Width}"×{r.dimensions.rect1Height}"<br/>
                            R2: {r.dimensions.rect2Width}"×{r.dimensions.rect2Height}"
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-[9px] font-black uppercase text-slate-400 mb-1">Parent Sheet</div>
                        <div className="font-mono font-bold text-slate-700 text-[10px]">{r.parentTagId}</div>
                        <div className="font-mono text-[9px] text-slate-400">{r.parentGrnId}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-black uppercase text-slate-400 mb-1">Created</div>
                        <div className="font-bold text-slate-700">{new Date(r.createdAt).toLocaleDateString()}</div>
                        <div className="text-[9px] text-slate-400">by {r.createdBy}</div>
                      </div>
                    </div>

                    {/* History suggestion */}
                    <div className={`rounded-xl p-3 border flex items-center gap-2 ${suggest.recommendation === 'Treat as Scrap' ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                      <span className="text-[10px] font-bold text-slate-500">
                        History for {r.thickness} ~{r.sqft.toFixed(0)} sqft:
                        <span className="ml-1 font-black text-slate-700">{suggest.usedCount} used · {suggest.scrappedCount} scrapped</span>
                        {suggest.avgDaysBeforeScrap > 0 && <span className="ml-1 text-slate-400">(avg {suggest.avgDaysBeforeScrap}d before scrap)</span>}
                        <span className={`ml-2 font-black ${suggest.recommendation === 'Treat as Scrap' ? 'text-amber-600' : 'text-emerald-600'}`}>
                          → {suggest.recommendation}
                        </span>
                      </span>
                    </div>

                    {r.scrapReason && (
                      <div className="text-[10px] text-red-600 font-bold">Scrap reason: {r.scrapReason}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RemnantManager;
