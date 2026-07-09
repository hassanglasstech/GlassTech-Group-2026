/**
 * CutPlanTab — 2D cutting-plan panel for a job order (supervisor + cutter).
 *
 * Wraps the existing guillotine engine (binPacking + CuttingDiagram) with:
 *   - a thickness filter (one glass thickness per sheet — you can't cut 6mm
 *     and 12mm from the same sheet),
 *   - a sheet-size picker (standard catalogue + Custom W×H), and
 *   - "Auto (best)" intelligence: runs the packer across every standard sheet
 *     and recommends the one that places all pieces in the fewest sheets at the
 *     lowest wastage.
 *
 * The sheet catalogue is a constant for now; Phase E moves it to the admin
 * "cutting settings" so the shop can maintain its real sheet sizes.
 */
import React, { useMemo, useState } from 'react';
import CuttingDiagram, { buildPackingPiecesFromQuotation } from '@/modules/glassco/core/CuttingDiagram';
import { packPieces } from '@/modules/glassco/core/binPacking';
import { QuotationItem } from '@/modules/shared/types';

// Standard Glassco sheet catalogue (inches). Phase E → admin-configurable.
export const STD_SHEETS: { w: number; h: number; label: string }[] = [
  { w: 84, h: 144, label: '84" × 144"' },
  { w: 96, h: 144, label: '96" × 144"' },
  { w: 84, h: 120, label: '84" × 120"' },
  { w: 60, h: 96,  label: '60" × 96"' },
];

interface Props {
  items: QuotationItem[];
  /** Optional sheet catalogue override (e.g. from material master / settings). */
  sheets?: { w: number; h: number; label: string }[];
}

const thkOf = (it: QuotationItem): string => String(it.glassSize || it.glassThickness || '—');

export const CutPlanTab: React.FC<Props> = ({ items, sheets = STD_SHEETS }) => {
  const cutItems = useMemo(() => (items || []).filter(i => !i.isSection), [items]);
  const thicknesses = useMemo(() => [...new Set(cutItems.map(thkOf))], [cutItems]);

  const [thk, setThk] = useState<string>('');
  const activeThk = thk || thicknesses[0] || '';
  const [choice, setChoice] = useState<string>('auto');
  const [cw, setCw] = useState(84);
  const [ch, setCh] = useState(144);

  const pieces = useMemo(
    () => buildPackingPiecesFromQuotation(cutItems.filter(i => thkOf(i) === activeThk)),
    [cutItems, activeThk],
  );
  const glassType = cutItems.find(i => thkOf(i) === activeThk)?.glassType;

  // Intelligence: pick the sheet that places the most pieces, then fewest
  // sheets, then lowest wastage.
  const best = useMemo(() => {
    if (!pieces.length) return null;
    let bc = sheets[0]; let br = packPieces(pieces, bc.w, bc.h);
    for (const c of sheets.slice(1)) {
      const r = packPieces(pieces, c.w, c.h);
      const better =
        r.unplacedPieces.length < br.unplacedPieces.length ||
        (r.unplacedPieces.length === br.unplacedPieces.length &&
          (r.totalSheetsUsed < br.totalSheetsUsed ||
            (r.totalSheetsUsed === br.totalSheetsUsed && r.totalWastagePct < br.totalWastagePct)));
      if (better) { bc = c; br = r; }
    }
    return { c: bc, r: br };
  }, [pieces, sheets]);

  const sel = choice === 'auto'
    ? (best?.c || sheets[0])
    : choice === 'custom'
      ? { w: cw, h: ch, label: `${cw}" × ${ch}"` }
      : sheets.find(s => `${s.w}x${s.h}` === choice) || sheets[0];

  if (cutItems.length === 0) {
    return <div className="text-center text-slate-400 text-xs font-bold py-8">No cut-sized items on this job.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap bg-white rounded-card border-2 border-slate-200 p-3">
        {thicknesses.length > 1 && (
          <>
            <label className="text-2xs font-black uppercase tracking-widest text-slate-500">Thickness</label>
            <select value={activeThk} onChange={e => setThk(e.target.value)}
              className="sap-input px-2 py-1.5 text-xs rounded-control border border-slate-200 font-bold">
              {thicknesses.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="mx-1 text-slate-200">|</span>
          </>
        )}
        <label className="text-2xs font-black uppercase tracking-widest text-slate-500">Sheet</label>
        <select value={choice} onChange={e => setChoice(e.target.value)}
          className="sap-input px-2 py-1.5 text-xs rounded-control border border-slate-200 font-bold">
          <option value="auto">Auto — best{best ? ` (${best.c.label} · ${best.r.totalSheetsUsed} sheets · ${best.r.totalWastagePct.toFixed(0)}% waste)` : ''}</option>
          {sheets.map(s => <option key={s.label} value={`${s.w}x${s.h}`}>{s.label}</option>)}
          <option value="custom">Custom…</option>
        </select>
        {choice === 'custom' && (
          <span className="inline-flex items-center gap-1">
            <input type="number" value={cw} onChange={e => setCw(Number(e.target.value) || 0)} className="sap-input w-16 px-2 py-1 text-xs" />
            <span className="text-xs text-slate-400">×</span>
            <input type="number" value={ch} onChange={e => setCh(Number(e.target.value) || 0)} className="sap-input w-16 px-2 py-1 text-xs" />
            <span className="text-2xs text-slate-400">inch</span>
          </span>
        )}
      </div>

      <CuttingDiagram
        pieces={pieces}
        sheetWidthInch={sel.w}
        sheetHeightInch={sel.h}
        glassType={glassType}
      />
    </div>
  );
};

export default CutPlanTab;
