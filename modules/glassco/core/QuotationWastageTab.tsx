/**
 * QuotationWastageTab.tsx
 *
 * Wastage preview tab for GlassCo quotation editor.
 * Activated when order sqft ≥ 50% of one sheet.
 *
 * Features:
 * 1. Per-sheet 2D cutting diagram (planning mode)
 * 2. Wastage % vs historical avg + industry benchmark
 * 3. Rate increment suggestion with logic
 * 4. Override with management note
 * 5. Save decision to Quotation.wastageDecision
 */

import React, { useState, useMemo, useCallback } from 'react';
import { QuotationItem } from '../../shared/types';
import CuttingDiagram, { buildPackingPiecesFromQuotation } from './CuttingDiagram';
import { getWastageTolerance, PackingResult } from './binPacking';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { useAppStore } from '@/modules/shared/store/appStore';
import {
  Scissors, Layers, AlertTriangle, CheckCircle2,
  Info, ChevronDown, ChevronUp, MessageSquare, ThumbsUp,
  BarChart2, RefreshCw, AlertCircle, TrendingUp, Save,
  Calculator, ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

const SHEET_SIZES = [
  { label: '84×144  (7×12 ft)', w: 84, h: 144 },
  { label: '84×120  (7×10 ft)', w: 84, h: 120 },
  { label: '72×120  (6×10 ft)', w: 72, h: 120 },
  { label: '96×144  (8×12 ft)', w: 96, h: 144 },
  { label: '72×96   (6×8 ft)',  w: 72, h: 96  },
  { label: '60×96   (5×8 ft)',  w: 60, h: 96  },
  { label: '48×96   (4×8 ft)',  w: 48, h: 96  },
];

const INDUSTRY_BENCHMARK: Record<string, number> = {
  Plain: 12, Color: 14, Tinted: 14,
  Mirror: 15, Frosted: 14, Laminated: 16, default: 12,
};

const TRIGGER_THRESHOLD = 50; // % of sheet

// ─────────────────────────────────────────────────────────────────────────
// Rate increment logic
// ─────────────────────────────────────────────────────────────────────────

interface RateSuggestion {
  incrementPct: number;         // e.g. 8.5
  reason: string;
  formula: string;
  newRatePerSqft: number | null;
}

function computeRateSuggestion(
  actualWastagePct: number,
  benchmark: number,
  currentAvgRatePerSqft: number | null,
): RateSuggestion {
  const excess = Math.max(0, actualWastagePct - benchmark);

  if (excess <= 0) {
    return {
      incrementPct: 0,
      reason: 'Wastage within benchmark — no rate adjustment needed.',
      formula: `Actual ${actualWastagePct.toFixed(1)}% ≤ benchmark ${benchmark}%`,
      newRatePerSqft: currentAvgRatePerSqft,
    };
  }

  // Logic:
  // Each 1% excess wastage = cost of (1/100) extra sqft of glass per sqft sold.
  // Rate increment % = excess wastage % / (1 - actualWastage/100)
  // This ensures revenue covers the extra material consumed.
  const usableFraction = 1 - actualWastagePct / 100;
  const incrementPct = usableFraction > 0
    ? Number(((excess / 100) / usableFraction * 100).toFixed(1))
    : excess;

  const newRate = currentAvgRatePerSqft != null
    ? Number((currentAvgRatePerSqft * (1 + incrementPct / 100)).toFixed(0))
    : null;

  return {
    incrementPct,
    reason: `Excess wastage of ${excess.toFixed(1)}% above benchmark (${benchmark}%) needs rate coverage.`,
    formula: `Increment = excess% ÷ usable fraction = ${excess.toFixed(1)}% ÷ ${(usableFraction * 100).toFixed(1)}% = ${incrementPct.toFixed(1)}%`,
    newRatePerSqft: newRate,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────

export function useQuotationWastage(items: QuotationItem[], company: string) {
  const sheetSqft = (w: number, h: number) => (w * h) / 144;

  const historicalAvg = useMemo(() => {
    try {
      const sessions = InventoryService.getCuttingSessions()
        .filter((s) => s.company === company && s.status === 'Closed' && s.actualWastagePct != null);
      if (sessions.length === 0) return null;
      return Number((sessions.reduce((sum: number, s) => sum + (s.actualWastagePct || 0), 0) / sessions.length).toFixed(1));
    } catch { return null; }
  }, [company]);

  const stockBySizeKey = useMemo(() => {
    try {
      const store = InventoryService.getStore().filter((i) => i.company === company && i.category === 'Raw');
      const map: Record<string, number> = {};
      store.forEach((item) => {
        const m = item.name.match(/(\d+)\s*x\s*(\d+)/i);
        if (!m) return;
        map[`${m[1]}x${m[2]}`] = (map[`${m[1]}x${m[2]}`] || 0) + (item.unrestrictedQty || item.quantity || 0);
      });
      return map;
    } catch { return {}; }
  }, [company]);

  const dimensionItems = useMemo(() =>
    items.filter(i => !i.isSection && ((i.inchW && i.inchH) || (i.mmW && i.mmH))),
    [items]
  );

  const totalSqft = dimensionItems.reduce((s, i) => s + (i.totalSqFt || 0), 0);
  const defaultSheet = SHEET_SIZES[0];
  const defaultSheetSqft = sheetSqft(defaultSheet.w, defaultSheet.h);
  const usagePct = defaultSheetSqft > 0 ? (totalSqft / defaultSheetSqft) * 100 : 0;
  const isTriggered = usagePct >= TRIGGER_THRESHOLD;

  const dominantType = useMemo(() => {
    const counts: Record<string, number> = {};
    dimensionItems.forEach(i => {
      const t = i.glassType || i.subCategory || 'Plain';
      counts[t] = (counts[t] || 0) + (i.totalSqFt || 0);
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Plain';
  }, [dimensionItems]);

  const industryBenchmark = INDUSTRY_BENCHMARK[dominantType] || INDUSTRY_BENCHMARK.default;
  const tolerance = getWastageTolerance(dominantType);

  // Current avg rate from items
  const currentAvgRate = useMemo(() => {
    const ratedItems = dimensionItems.filter(i => i.pricePerUnit > 0 && i.totalSqFt > 0);
    if (ratedItems.length === 0) return null;
    const totalAmt = ratedItems.reduce((s, i) => s + i.amount, 0);
    const totalSqFt = ratedItems.reduce((s, i) => s + i.totalSqFt, 0);
    return totalSqFt > 0 ? Number((totalAmt / totalSqFt).toFixed(0)) : null;
  }, [dimensionItems]);

  return {
    isTriggered, usagePct, totalSqft, dimensionItems,
    historicalAvg, industryBenchmark, tolerance, dominantType,
    stockBySizeKey, defaultSheet, currentAvgRate,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Decision type
// ─────────────────────────────────────────────────────────────────────────

type Decision = 'approve' | 'review' | 'override';

function buildSuggestion(actual: number, historical: number | null, benchmark: number, tolerance: number) {
  const vs = historical ?? benchmark;
  const diff = actual - vs;
  if (actual <= tolerance) return { decision: 'approve' as Decision, title: 'Within acceptable range', body: `Wastage ${actual.toFixed(1)}% is within ${tolerance}% tolerance. Order can proceed without rate adjustment.`, color: 'emerald' };
  if (actual <= benchmark + 3) return { decision: 'review' as Decision, title: 'Slightly above benchmark', body: `Wastage ${actual.toFixed(1)}% is ${diff > 0 ? '+' : ''}${diff.toFixed(1)}% vs ${historical != null ? 'your historical avg' : 'industry benchmark'} (${vs.toFixed(1)}%). Rate adjustment recommended.`, color: 'amber' };
  return { decision: 'override' as Decision, title: 'High wastage — management approval needed', body: `Wastage ${actual.toFixed(1)}% significantly exceeds benchmark (${vs.toFixed(1)}%). Apply rate surcharge or adjust dimensions before confirming.`, color: 'rose' };
}

// ─────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────

interface Props {
  items: QuotationItem[];
  onSaveDecision?: (decision: NonNullable<any>) => void; // receives wastageDecision object
}

const QuotationWastageTab: React.FC<Props> = ({ items, onSaveDecision }) => {
  const company = useAppStore(s => s.selectedCompany);
  const {
    isTriggered, usagePct, totalSqft, dimensionItems,
    historicalAvg, industryBenchmark, tolerance, dominantType,
    stockBySizeKey, defaultSheet, currentAvgRate,
  } = useQuotationWastage(items, company);

  const [selectedSize, setSelectedSize] = useState(defaultSheet);
  const [overrideNote, setOverrideNote] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const [packingResult, setPackingResult] = useState<PackingResult | null>(null);

  const cuttingPieces = useMemo(() => buildPackingPiecesFromQuotation(dimensionItems), [dimensionItems]);

  const actualWastagePct = packingResult?.totalWastagePct ?? 0;
  const suggestion = packingResult ? buildSuggestion(actualWastagePct, historicalAvg, industryBenchmark, tolerance) : null;

  const rateSuggestion = useMemo(() =>
    packingResult ? computeRateSuggestion(actualWastagePct, industryBenchmark, currentAvgRate) : null,
    [packingResult, actualWastagePct, industryBenchmark, currentAvgRate]
  );

  const stockForSize = stockBySizeKey[`${selectedSize.w}x${selectedSize.h}`]
    ?? stockBySizeKey[`${selectedSize.h}x${selectedSize.w}`] ?? 0;

  const canConfirm = suggestion?.decision === 'approve' || overrideNote.trim().length > 0;

  const handleConfirm = useCallback(() => {
    if (!packingResult || !suggestion || !rateSuggestion) return;
    const dec = {
      actualWastagePct,
      historicalAvgPct: historicalAvg,
      industryBenchmarkPct: industryBenchmark,
      suggestedRateIncrementPct: rateSuggestion.incrementPct,
      suggestedNewRatePerSqft: rateSuggestion.newRatePerSqft,
      decision: suggestion.decision,
      overrideNote: overrideNote.trim(),
      approvedAt: new Date().toISOString(),
      sheetsRequired: packingResult.totalSheetsUsed,
      selectedSheetSize: `${selectedSize.w}x${selectedSize.h}`,
    };
    onSaveDecision?.(dec);
    setIsConfirmed(true);
    toast.success('Wastage decision saved to quotation.');
  }, [packingResult, suggestion, rateSuggestion, actualWastagePct, historicalAvg, industryBenchmark, overrideNote, selectedSize, onSaveDecision]);

  // ── Not triggered ────────────────────────────────────────────────────
  if (!isTriggered) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
          <Scissors size={28} className="text-slate-300" />
        </div>
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Wastage Preview Not Required</h3>
        <p className="text-xs text-slate-300 mt-2 max-w-sm">
          Activated when order exceeds {TRIGGER_THRESHOLD}% of a full sheet
          ({((SHEET_SIZES[0].w * SHEET_SIZES[0].h) / 144 * TRIGGER_THRESHOLD / 100).toFixed(1)} sqft).
        </p>
        <div className="mt-4 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-400">
          Current: {totalSqft.toFixed(1)} sqft · {usagePct.toFixed(0)}% of sheet
        </div>
      </div>
    );
  }

  if (cuttingPieces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Info size={32} className="text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-400">Add inch/mm dimensions to items to see cutting plan.</p>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5 overflow-y-auto">

      {/* ── Sheet selector + stock ───────────────────────────────────── */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
            <Layers size={10} className="inline mr-1" />Sheet Size
          </label>
          <select
            value={`${selectedSize.w}x${selectedSize.h}`}
            onChange={e => {
              const [w, h] = e.target.value.split('x').map(Number);
              const found = SHEET_SIZES.find(s => s.w === w && s.h === h);
              setSelectedSize(found ?? { label: `${w}x${h}`, w, h });
              setPackingResult(null);
              setIsConfirmed(false);
            }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-blue-400"
          >
            {SHEET_SIZES.map(s => (
              <option key={`${s.w}x${s.h}`} value={`${s.w}x${s.h}`}>{s.label}</option>
            ))}
          </select>
        </div>
        {/* Stock is intentionally NOT shown here — the cutting plan is about sheet
            SIZE + wastage only, independent of what's in stock. */}
        <div className="px-3 py-2 rounded-xl text-[10px] font-black border bg-blue-50 text-blue-700 border-blue-200">
          {totalSqft.toFixed(1)} sqft · {usagePct.toFixed(0)}% of sheet
        </div>
        {currentAvgRate && (
          <div className="px-3 py-2 rounded-xl text-[10px] font-black border bg-slate-50 text-slate-600 border-slate-200">
            Current avg rate: PKR {currentAvgRate.toLocaleString()}/sqft
          </div>
        )}
        <div className="ml-auto text-[9px] text-slate-300 font-bold flex items-center gap-1">
          <RefreshCw size={9} /> Live
        </div>
      </div>

      {/* ── 2D Diagram ───────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <CuttingDiagram
          pieces={cuttingPieces}
          sheetWidthInch={selectedSize.w}
          sheetHeightInch={selectedSize.h}
          glassType={dominantType}
          quotationMode={true}
          onWastageCalculated={r => { setPackingResult(r); setIsConfirmed(false); }}
        />
      </div>

      {/* ── Analysis ─────────────────────────────────────────────────── */}
      {packingResult && suggestion && rateSuggestion && (
        <div className="space-y-4">

          {/* Benchmark comparison */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                <BarChart2 size={12} /> Wastage Comparison
              </p>
              <button onClick={() => setShowDetails(p => !p)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1">
                {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {showDetails ? 'Less' : 'Per sheet'}
              </button>
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-100">
              <div className="p-4 text-center">
                <p className="text-[9px] font-black uppercase text-slate-400 mb-1">This Order</p>
                <p className={`text-2xl font-black ${actualWastagePct > tolerance ? 'text-rose-600' : actualWastagePct > industryBenchmark ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {actualWastagePct.toFixed(1)}%
                </p>
                <p className="text-[9px] text-slate-400 mt-0.5">{packingResult.totalSheetsUsed} sheet{packingResult.totalSheetsUsed !== 1 ? 's' : ''}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-[9px] font-black uppercase text-slate-400 mb-1">Your Historical Avg</p>
                {historicalAvg != null ? (
                  <>
                    <p className="text-2xl font-black text-blue-600">{historicalAvg.toFixed(1)}%</p>
                    <p className={`text-[9px] font-black mt-0.5 ${actualWastagePct > historicalAvg ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {actualWastagePct > historicalAvg ? '▲' : '▼'} {Math.abs(actualWastagePct - historicalAvg).toFixed(1)}%
                    </p>
                  </>
                ) : (
                  <><p className="text-lg font-black text-slate-300">—</p><p className="text-[9px] text-slate-300 mt-0.5">No data yet</p></>
                )}
              </div>
              <div className="p-4 text-center">
                <p className="text-[9px] font-black uppercase text-slate-400 mb-1">Industry Benchmark</p>
                <p className="text-2xl font-black text-slate-600">{industryBenchmark}%</p>
                <p className={`text-[9px] font-black mt-0.5 ${actualWastagePct > industryBenchmark ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {actualWastagePct > industryBenchmark ? '▲' : '▼'} {Math.abs(actualWastagePct - industryBenchmark).toFixed(1)}%
                </p>
              </div>
            </div>
            {showDetails && packingResult.plans.length > 0 && (
              <div className="border-t border-slate-100 px-5 py-3 space-y-1.5">
                {packingResult.plans.map((plan, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="font-black text-slate-500 w-16">Sheet {i + 1}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${plan.wastagePct > tolerance ? 'bg-rose-400' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.min(100, plan.wastagePct * 3)}%` }} />
                    </div>
                    <span className={`font-black w-12 text-right ${plan.wastagePct > tolerance ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {plan.wastagePct.toFixed(1)}%
                    </span>
                    <span className="text-[9px] text-slate-400">{plan.usedSqft.toFixed(1)} used · {plan.scrapSqft.toFixed(1)} scrap</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Rate Suggestion ──────────────────────────────────────── */}
          <div className={`rounded-2xl border-2 overflow-hidden ${
            rateSuggestion.incrementPct === 0
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-300'
          }`}>
            <div className="px-5 py-4 flex items-start gap-3">
              <TrendingUp size={18} className={rateSuggestion.incrementPct === 0 ? 'text-emerald-600 mt-0.5' : 'text-amber-600 mt-0.5'} />
              <div className="flex-1">
                <p className={`text-sm font-black uppercase ${rateSuggestion.incrementPct === 0 ? 'text-emerald-800' : 'text-amber-800'}`}>
                  {rateSuggestion.incrementPct === 0 ? 'No Rate Adjustment Needed' : `Suggested Rate Increment: +${rateSuggestion.incrementPct.toFixed(1)}%`}
                </p>

                {rateSuggestion.incrementPct > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {/* Current rate */}
                    <div className="bg-white/70 rounded-xl p-3">
                      <p className="text-[9px] font-black uppercase text-slate-400 mb-1">Current Avg Rate</p>
                      <p className="text-lg font-black text-slate-700">
                        {currentAvgRate != null ? `PKR ${currentAvgRate.toLocaleString()}` : '—'}
                        <span className="text-[10px] text-slate-400 font-bold">/sqft</span>
                      </p>
                    </div>
                    {/* Suggested new rate */}
                    <div className="bg-amber-100 rounded-xl p-3 border border-amber-300">
                      <p className="text-[9px] font-black uppercase text-amber-600 mb-1">Suggested New Rate</p>
                      <p className="text-lg font-black text-amber-800 flex items-center gap-1">
                        {rateSuggestion.newRatePerSqft != null
                          ? `PKR ${rateSuggestion.newRatePerSqft.toLocaleString()}`
                          : <span className="text-sm text-amber-500">Set rates first</span>
                        }
                        {rateSuggestion.newRatePerSqft && (
                          <ArrowUpRight size={14} className="text-amber-600" />
                        )}
                        <span className="text-[10px] text-amber-600 font-bold">/sqft</span>
                      </p>
                    </div>
                  </div>
                )}

                <p className="text-xs text-slate-600 mt-2 leading-relaxed">{rateSuggestion.reason}</p>

                {/* Formula toggle */}
                <button
                  onClick={() => setShowFormula(p => !p)}
                  className="mt-2 text-[9px] font-black uppercase text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
                >
                  <Calculator size={9} /> {showFormula ? 'Hide' : 'Show'} formula
                </button>
                {showFormula && (
                  <div className="mt-2 bg-white/60 border border-slate-200 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-mono text-slate-600">{rateSuggestion.formula}</p>
                    <p className="text-[9px] text-slate-400 mt-1">
                      Logic: Rate must cover extra glass consumed due to excess wastage.
                      Each 1% excess wastage = material cost for {(1/Math.max(0.01, (1 - actualWastagePct/100))).toFixed(2)}× sqft sold.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Decision + Override ──────────────────────────────────── */}
          <div className={`rounded-2xl border-2 p-5 ${
            suggestion.color === 'emerald' ? 'bg-emerald-50 border-emerald-300' :
            suggestion.color === 'amber'   ? 'bg-amber-50 border-amber-300' :
            'bg-rose-50 border-rose-300'
          }`}>
            <div className="flex items-start gap-3 mb-3">
              <div className={`mt-0.5 flex-shrink-0 ${suggestion.color === 'emerald' ? 'text-emerald-600' : suggestion.color === 'amber' ? 'text-amber-600' : 'text-rose-600'}`}>
                {suggestion.decision === 'approve'  && <CheckCircle2 size={18} />}
                {suggestion.decision === 'review'   && <AlertCircle size={18} />}
                {suggestion.decision === 'override' && <AlertTriangle size={18} />}
              </div>
              <div>
                <p className={`text-sm font-black uppercase ${suggestion.color === 'emerald' ? 'text-emerald-800' : suggestion.color === 'amber' ? 'text-amber-800' : 'text-rose-800'}`}>
                  {suggestion.title}
                </p>
                <p className="text-xs font-medium text-slate-600 mt-1 leading-relaxed">{suggestion.body}</p>
              </div>
            </div>

            {/* Note field — required for review/override, optional for approve */}
            {!isConfirmed && (
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1">
                  <MessageSquare size={9} />
                  {suggestion.decision === 'approve' ? 'Management Note (optional)' : 'Management Note / Override Reason (required)'}
                </label>
                <textarea
                  value={overrideNote}
                  onChange={e => setOverrideNote(e.target.value)}
                  rows={2}
                  placeholder={
                    suggestion.decision === 'approve'
                      ? 'Optional: add note for records...'
                      : 'e.g. MD approved. Rate adjusted to cover wastage cost. Client informed.'
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                />
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
                    canConfirm
                      ? 'bg-slate-800 text-white hover:bg-slate-700 shadow-md'
                      : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                  }`}
                >
                  <Save size={12} />
                  Save to Quotation
                </button>
              </div>
            )}

            {isConfirmed && (
              <div className="flex items-start gap-2 bg-white/60 px-3 py-2.5 rounded-xl border border-emerald-200">
                <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-black text-emerald-700">Decision saved to quotation</p>
                  {overrideNote && <p className="text-[10px] text-slate-500 mt-0.5">"{overrideNote}"</p>}
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    Wastage: {actualWastagePct.toFixed(1)}% ·
                    Rate increment: {rateSuggestion.incrementPct > 0 ? `+${rateSuggestion.incrementPct.toFixed(1)}%` : 'none'} ·
                    Sheets: {packingResult.totalSheetsUsed}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuotationWastageTab;
