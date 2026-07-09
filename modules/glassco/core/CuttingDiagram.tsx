/**
 * CuttingDiagram.tsx — Phase 4
 *
 * Renders 2D cutting plan as SVG per sheet.
 * - Pieces with piece number in centre
 * - Width dimension on inner horizontal, height on inner vertical
 * - Scrap zones shaded
 * - Defect zone (hatched) for defective sheets
 * - Hole marks with diameter
 * - Notch marks at corners
 * - Wastage % per sheet + overall
 * - Used in: Job Order view + Quotation wastage preview
 */

import React, { useMemo, useState } from 'react';
import {
  packPieces, PackingPiece, SheetCuttingPlan, PlacedPiece,
  getWastageTolerance, isWastageExcessive, PackingResult, HoleSpec, NotchSpec,
} from './binPacking';
import { Printer, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { QuotationItem } from '@/modules/shared/types';

// ── Colors ────────────────────────────────────────────────────────────────
const COLORS = [
  '#DBEAFE', '#D1FAE5', '#FEF3C7', '#FCE7F3', '#EDE9FE',
  '#CFFAFE', '#FEE2E2', '#F0FDF4', '#FFF7ED', '#F0F9FF',
];

// ── SVG Sheet Diagram ─────────────────────────────────────────────────────
const PADDING = 24; // px padding inside SVG for dimension labels

interface SheetSVGProps {
  plan: SheetCuttingPlan;
  sheetIndex: number;
  svgWidth?: number;         // display width in px
  showDefectZone?: boolean;
  defectZone?: { x: number; y: number; width: number; height: number };
  colorByPiece?: boolean;
}

export const SheetSVG: React.FC<SheetSVGProps> = ({
  plan, sheetIndex, svgWidth = 480, showDefectZone = false, defectZone, colorByPiece = true,
}) => {
  const scale = (svgWidth - PADDING * 2) / plan.sheetWidth;
  const svgH  = plan.sheetHeight * scale + PADDING * 2;

  const toX = (x: number) => PADDING + x * scale;
  const toY = (y: number) => PADDING + y * scale;
  const toW = (w: number) => w * scale;
  const toH = (h: number) => h * scale;

  // Unique piece IDs for color assignment
  const uniquePieceIds = [...new Set(plan.pieces.map(p => p.pieceId))];
  const colorMap: Record<string, string> = {};
  uniquePieceIds.forEach((id, i) => { colorMap[id] = COLORS[i % COLORS.length]; });

  // Hatch pattern for scrap/defect zones
  const hatchId = `hatch-${sheetIndex}`;
  const defHatchId = `defhatch-${sheetIndex}`;

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgH}`}
      width={svgWidth}
      height={svgH}
      style={{ border: '2px solid #0f172a', borderRadius: 4, background: 'white', display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '68vh' }}
    >
      <defs>
        {/* Scrap hatch */}
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#CBD5E1" strokeWidth="1.5"/>
        </pattern>
        {/* Defect zone hatch */}
        <pattern id={defHatchId} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#FCA5A5" strokeWidth="2.5"/>
        </pattern>
      </defs>

      {/* Sheet outline */}
      <rect x={PADDING} y={PADDING} width={toW(plan.sheetWidth)} height={toH(plan.sheetHeight)}
        fill="#F8FAFC" stroke="#0f172a" strokeWidth="2"/>

      {/* Sheet size label (top) */}
      <text x={PADDING + toW(plan.sheetWidth) / 2} y={PADDING - 6}
        textAnchor="middle" fontSize="9" fontWeight="700" fill="#475569" fontFamily="Arial">
        {plan.sheetWidth}" × {plan.sheetHeight}" ({plan.totalSqft.toFixed(1)} sqft)
      </text>

      {/* Scrap zones */}
      {plan.scrapZones.map((z, i) => (
        <rect key={`scrap-${i}`}
          x={toX(z.x)} y={toY(z.y)} width={toW(z.width)} height={toH(z.height)}
          fill={`url(#${hatchId})`} stroke="#CBD5E1" strokeWidth="0.5" strokeDasharray="3 2"/>
      ))}

      {/* Defect zone overlay */}
      {showDefectZone && defectZone && (
        <g>
          <rect x={toX(defectZone.x)} y={toY(defectZone.y)}
            width={toW(defectZone.width)} height={toH(defectZone.height)}
            fill={`url(#${defHatchId})`} stroke="#EF4444" strokeWidth="1.5" strokeDasharray="4 2"/>
          <text x={toX(defectZone.x) + toW(defectZone.width) / 2}
            y={toY(defectZone.y) + toH(defectZone.height) / 2}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="8" fontWeight="900" fill="#DC2626" fontFamily="Arial">
            DEFECT
          </text>
        </g>
      )}

      {/* Placed pieces */}
      {plan.pieces.map((piece, idx) => {
        const px = toX(piece.x);
        const py = toY(piece.y);
        const pw = toW(piece.width);
        const ph = toH(piece.height);
        const cx = px + pw / 2;
        const cy = py + ph / 2;
        const fill = colorByPiece ? colorMap[piece.pieceId] || '#E2E8F0' : '#DBEAFE';
        const fontSize = Math.max(6, Math.min(11, Math.min(pw, ph) / 4));
        const dimFont = Math.max(5.5, Math.min(9, Math.min(pw, ph) / 6));

        return (
          <g key={`piece-${idx}`}>
            {/* Piece rectangle */}
            <rect x={px} y={py} width={pw} height={ph}
              fill={fill} stroke="#1e293b" strokeWidth="1"/>

            {/* Piece number — centre */}
            <text x={cx} y={cy - (ph > 20 ? fontSize * 0.7 : 0)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={fontSize} fontWeight="900" fill="#0f172a" fontFamily="Arial">
              #{piece.pieceNo}{piece.rotated ? 'R' : ''}
            </text>

            {/* Width dimension — inner horizontal (bottom inside) */}
            {pw > 28 && ph > 20 && (
              <text x={cx} y={py + ph - 4}
                textAnchor="middle" dominantBaseline="auto"
                fontSize={dimFont} fontWeight="700" fill="#475569" fontFamily="Arial">
                {piece.width.toFixed(1)}"
              </text>
            )}

            {/* Height dimension — inner vertical (right inside) */}
            {ph > 28 && pw > 20 && (
              <text
                x={px + pw - 3} y={cy}
                textAnchor="end" dominantBaseline="middle"
                fontSize={dimFont} fontWeight="700" fill="#475569" fontFamily="Arial"
                transform={`rotate(-90, ${px + pw - 3}, ${cy})`}>
                {piece.height.toFixed(1)}"
              </text>
            )}

            {/* Holes */}
            {piece.holes?.map((hole, hi) => {
              const hx = toX(piece.x + hole.xFromLeft);
              const hy = toY(piece.y + hole.yFromTop);
              const hr = toW(hole.diameterInch / 2);
              return (
                <g key={`hole-${hi}`}>
                  <circle cx={hx} cy={hy} r={Math.max(hr, 3)}
                    fill="white" stroke="#1d4ed8" strokeWidth="1.5" strokeDasharray="2 1"/>
                  <text x={hx} y={hy + Math.max(hr, 3) + 5}
                    textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#1d4ed8" fontFamily="Arial">
                    ⌀{hole.diameterInch}"
                  </text>
                </g>
              );
            })}

            {/* Notches — shown as clipped corner */}
            {piece.notches?.map((notch, ni) => {
              const nw = toW(notch.widthInch);
              const nh = toH(notch.heightInch);
              let nx = px, ny = py;
              if (notch.corner === 'top-right')    { nx = px + pw - nw; ny = py; }
              if (notch.corner === 'bottom-left')  { nx = px; ny = py + ph - nh; }
              if (notch.corner === 'bottom-right') { nx = px + pw - nw; ny = py + ph - nh; }
              if (notch.corner === 'top-center')   { nx = cx - nw / 2; ny = py; }
              if (notch.corner === 'bottom-center'){ nx = cx - nw / 2; ny = py + ph - nh; }
              if (notch.corner === 'left-center')  { nx = px; ny = cy - nh / 2; }
              if (notch.corner === 'right-center') { nx = px + pw - nw; ny = cy - nh / 2; }
              return (
                <g key={`notch-${ni}`}>
                  <rect x={nx} y={ny} width={nw} height={nh}
                    fill="white" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="3 1"/>
                  <text x={nx + nw / 2} y={ny + nh / 2}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="5" fontWeight="700" fill="#7c3aed" fontFamily="Arial">
                    N
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Wastage label — bottom right */}
      <text x={toX(plan.sheetWidth) - 2} y={toY(plan.sheetHeight) + 12}
        textAnchor="end" fontSize="8" fontWeight="900"
        fill={plan.wastagePct > 15 ? '#DC2626' : '#059669'} fontFamily="Arial">
        Waste: {plan.wastagePct.toFixed(1)}%
      </text>
    </svg>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// MAIN CUTTING DIAGRAM COMPONENT
// ══════════════════════════════════════════════════════════════════════════

interface CuttingDiagramProps {
  // Input
  pieces: PackingPiece[];
  sheetWidthInch: number;
  sheetHeightInch: number;
  glassType?: string;
  jobOrderId?: string;
  quotationMode?: boolean;      // true = show wastage cost suggestion

  // Defective sheet support
  isDefectiveSheet?: boolean;
  defectiveUsableSqft?: number; // determines usable zone size

  // Events
  onWastageCalculated?: (result: PackingResult) => void;
  onClose?: () => void;
}

const CuttingDiagram: React.FC<CuttingDiagramProps> = ({
  pieces, sheetWidthInch, sheetHeightInch,
  glassType, jobOrderId, quotationMode = false,
  isDefectiveSheet = false, defectiveUsableSqft,
  onWastageCalculated, onClose,
}) => {
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [svgWidth, setSvgWidth] = useState(480);

  // For defective sheet: usable zone = rectangle at top-left of given sqft
  const defectZone = useMemo(() => {
    if (!isDefectiveSheet || !defectiveUsableSqft) return undefined;
    // Usable zone: from top, height = usable sqft / sheet width × 144
    const usableHeight = (defectiveUsableSqft * 144) / sheetWidthInch;
    return { x: 0, y: 0, width: sheetWidthInch, height: usableHeight };
  }, [isDefectiveSheet, defectiveUsableSqft, sheetWidthInch]);

  const result = useMemo(() => {
    if (!pieces.length) return null;
    const r = packPieces(pieces, sheetWidthInch, sheetHeightInch, defectZone || undefined);
    onWastageCalculated?.(r);
    return r;
  }, [pieces, sheetWidthInch, sheetHeightInch, defectZone]);

  const tolerance = getWastageTolerance(glassType);
  const isExcessive = result ? isWastageExcessive(result.totalWastagePct, glassType) : false;

  if (!result || !pieces.length) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-400">
        <Info size={20} className="mr-2"/> No pieces to display
      </div>
    );
  }

  const currentPlan = result.plans[selectedSheet];

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black uppercase text-slate-800">2D Cutting Plan</h3>
          <p className="text-[10px] text-slate-500 font-bold mt-0.5">
            {result.totalSheetsUsed} sheet(s) required — {pieces.reduce((s, p) => s + p.qty, 0)} pieces total
          </p>
        </div>
        {onClose && (
          <button onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xs font-bold border border-slate-200 px-3 py-1.5 rounded-lg">
            Close
          </button>
        )}
      </div>

      {/* ── Wastage summary ── */}
      <div className={`rounded-xl p-3 border flex items-start gap-3 ${isExcessive ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
        {isExcessive
          ? <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5"/>
          : <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5"/>
        }
        <div className="flex-1">
          <div className="grid grid-cols-4 gap-4 text-xs">
            {[
              { label: 'Sheets Used', val: result.totalSheetsUsed },
              { label: 'Used SqFt', val: result.totalUsedSqft.toFixed(1) },
              { label: 'Scrap SqFt', val: result.totalScrapSqft.toFixed(1) },
              { label: 'Wastage', val: `${result.totalWastagePct.toFixed(1)}% (tolerance: ${tolerance}%)` },
            ].map(s => (
              <div key={s.label}>
                <div className="text-[9px] font-black uppercase text-slate-400">{s.label}</div>
                <div className={`font-black ${s.label === 'Wastage' && isExcessive ? 'text-red-600' : 'text-slate-800'}`}>{s.val}</div>
              </div>
            ))}
          </div>
          {quotationMode && isExcessive && (
            <p className="text-[10px] text-red-600 font-bold mt-2">
              ⚠ Wastage exceeds tolerance ({tolerance}%). Consider adjusting rate to cover extra material cost.
            </p>
          )}
          {result.unplacedPieces.length > 0 && (
            <p className="text-[10px] text-amber-600 font-bold mt-1">
              ⚠ {result.unplacedPieces.length} piece(s) could not be placed — sheets too small or pieces too large.
            </p>
          )}
        </div>
      </div>

      {/* ── Sheet selector (multiple sheets) ── */}
      {result.plans.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {result.plans.map((plan, i) => (
            <button key={i} onClick={() => setSelectedSheet(i)}
              className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-xl border transition-colors ${selectedSheet === i ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              Sheet {i + 1}
              <span className={`ml-1.5 ${plan.wastagePct > tolerance ? 'text-red-400' : 'text-emerald-400'}`}>
                {plan.wastagePct.toFixed(0)}% waste
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── SVG Diagram ── */}
      {currentPlan && (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <SheetSVG
              plan={currentPlan}
              sheetIndex={selectedSheet}
              svgWidth={svgWidth}
              showDefectZone={isDefectiveSheet}
              defectZone={defectZone}
            />
          </div>

          {/* Piece legend */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
            <div className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">Pieces — Sheet {selectedSheet + 1}</div>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
              {currentPlan.pieces.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[9px] font-bold text-slate-700">
                  <div className="w-3 h-3 rounded-sm border border-slate-300 shrink-0"
                    style={{ background: COLORS[currentPlan.pieces.findIndex(x => x.pieceId === p.pieceId) % COLORS.length] }}/>
                  <span className="font-black">#{p.pieceNo}</span>
                  <span className="text-slate-500">{p.width.toFixed(1)}" × {p.height.toFixed(1)}"</span>
                  {p.rotated && <span className="text-blue-500 text-[8px]">↻</span>}
                  {(p.holes?.length || p.notches?.length) ? (
                    <span className="text-purple-500 text-[8px]">H/N</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Print button ── */}
      <div className="flex justify-end">
        <button onClick={() => window.print()}
          className="flex items-center gap-2 text-xs font-black uppercase border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50">
          <Printer size={13}/> Print Diagram
        </button>
      </div>

      <style>{`
        @media print {
          body > *:not(.cutting-print-root) { display: none !important; }
          .cutting-print-root { display: block !important; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
};

export default CuttingDiagram;

// ── Helper: build PackingPiece array from quotation items ─────────────────
// Quotation line item + optional hole/notch layout specs the cutting planner
// reads. Plain QuotationItem callers are structurally assignable (extra fields optional).
type PackingSourceItem = QuotationItem & {
  holeSpecs?:  Array<{ diameterInch?: number; xFromLeft?: number; yFromTop?: number }>;
  notchSpecs?: Array<{ widthInch?: number; heightInch?: number; corner?: NotchSpec['corner'] }>;
};

export function buildPackingPiecesFromQuotation(items: PackingSourceItem[]): PackingPiece[] {
  const pieces: PackingPiece[] = [];
  let pieceNo = 1;

  items.forEach(item => {
    if (item.isSection) return;
    // Dimensions can arrive as STRINGS from the editor (e.g. inchW "39", sootW "7").
    // Coerce to Number BEFORE any arithmetic — `"39" + 0.7` string-concatenates to
    // "390.7", which made every piece ~390" and unplaceable ("0 sheets" bug).
    const mmW = Number(item.mmW) || 0, mmH = Number(item.mmH) || 0;
    const isMM = mmW > 0 || mmH > 0;

    let widthInch: number;
    let heightInch: number;

    if (isMM) {
      widthInch  = mmW / 25.4;
      heightInch = mmH / 25.4;
    } else {
      widthInch  = Number(item.inchW || 0) + Number(item.sootW || 0) / 10;
      heightInch = Number(item.inchH || 0) + Number(item.sootH || 0) / 10;
    }

    if (widthInch <= 0 || heightInch <= 0) return;

    const hasHoles   = item.selectedServices?.includes('Holes');
    const hasNotches = item.selectedServices?.includes('Notch') || item.selectedServices?.includes('Notching');

    // Build holes from holeSpecs if present
    const holes: HoleSpec[] = (item.holeSpecs || []).map((h, i: number) => ({
      id: `hole-${pieceNo}-${i}`,
      diameterInch: h.diameterInch || 0.5,
      xFromLeft:    h.xFromLeft || widthInch / 2,
      yFromTop:     h.yFromTop  || heightInch / 2,
    }));

    // Default hole if service selected but no specs
    if (hasHoles && holes.length === 0) {
      holes.push({ id: `hole-${pieceNo}-0`, diameterInch: 0.5, xFromLeft: widthInch / 2, yFromTop: heightInch / 2 });
    }

    const notches: NotchSpec[] = (item.notchSpecs || []).map((n, i: number) => ({
      id: `notch-${pieceNo}-${i}`,
      widthInch:  n.widthInch  || 1,
      heightInch: n.heightInch || 1,
      corner:     n.corner     || 'top-left',
    }));

    if (hasNotches && notches.length === 0) {
      notches.push({ id: `notch-${pieceNo}-0`, widthInch: 1, heightInch: 1, corner: 'top-left' });
    }

    pieces.push({
      pieceId:     item.id || `item-${pieceNo}`,
      pieceNo:     pieceNo++,
      widthInch,
      heightInch,
      qty:         Number(item.qty) || 1,
      glassType:   item.glassType,
      thickness:   item.glassSize,
      description: item.description || '',
      holes:       holes.length > 0 ? holes : undefined,
      notches:     notches.length > 0 ? notches : undefined,
    });
  });

  return pieces;
}
