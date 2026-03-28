/**
 * binPacking.ts — Phase 4
 * Guillotine bin packing algorithm for glass cutting optimization.
 * Handles rectangular pieces only (covers 95%+ of GlassCo use cases).
 * Also handles hole/notch placement on pieces.
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface PackingPiece {
  pieceId: string;          // from production piece ID
  pieceNo: number;          // display number
  widthInch: number;        // required width
  heightInch: number;       // required height
  qty: number;              // how many of this size
  glassType?: string;
  thickness?: string;
  description?: string;
  // Hole/notch specs
  holes?: HoleSpec[];
  notches?: NotchSpec[];
}

export interface HoleSpec {
  id: string;
  diameterInch: number;
  xFromLeft: number;        // position from left edge (inches)
  yFromTop: number;         // position from top edge (inches)
}

export interface NotchSpec {
  id: string;
  widthInch: number;
  heightInch: number;
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'left-center' | 'right-center';
}

export interface PlacedPiece {
  pieceId: string;
  pieceNo: number;
  instanceIdx: number;      // which copy of this piece (0-based)
  x: number;               // left edge on sheet (inches)
  y: number;               // top edge on sheet (inches)
  width: number;
  height: number;
  rotated: boolean;
  description?: string;
  holes?: HoleSpec[];
  notches?: NotchSpec[];
}

export interface ScrapZone {
  x: number; y: number;
  width: number; height: number;
}

export interface SheetCuttingPlan {
  sheetWidth: number;
  sheetHeight: number;
  pieces: PlacedPiece[];
  scrapZones: ScrapZone[];
  usedSqft: number;
  totalSqft: number;
  scrapSqft: number;
  wastagePct: number;
  defectZone?: { x: number; y: number; width: number; height: number };
}

export interface PackingResult {
  plans: SheetCuttingPlan[];         // one per sheet used
  unplacedPieces: { pieceId: string; pieceNo: number; widthInch: number; heightInch: number }[];
  totalSheetsUsed: number;
  totalWastagePct: number;
  totalUsedSqft: number;
  totalScrapSqft: number;
}

// ── Free Rectangle ────────────────────────────────────────────────────────
interface FreeRect {
  x: number; y: number;
  width: number; height: number;
}

// ── Core guillotine packer ────────────────────────────────────────────────
class GuillotinePacker {
  private freeRects: FreeRect[];
  private placed: PlacedPiece[] = [];
  private sheetW: number;
  private sheetH: number;
  private margin = 0.25; // 0.25 inch kerf/margin between pieces

  constructor(sheetWidthInch: number, sheetHeightInch: number, usableOverride?: { x: number; y: number; width: number; height: number }) {
    this.sheetW = sheetWidthInch;
    this.sheetH = sheetHeightInch;
    if (usableOverride) {
      this.freeRects = [usableOverride];
    } else {
      this.freeRects = [{ x: 0, y: 0, width: sheetWidthInch, height: sheetHeightInch }];
    }
  }

  // Try to place a piece — returns true if placed
  place(piece: {
    pieceId: string; pieceNo: number; instanceIdx: number;
    width: number; height: number;
    description?: string; holes?: HoleSpec[]; notches?: NotchSpec[];
  }): boolean {
    const w = piece.width + this.margin;
    const h = piece.height + this.margin;

    // Find best-fitting free rect (Best Short Side Fit)
    let bestRect: FreeRect | null = null;
    let bestShortSide = Infinity;
    let rotated = false;

    for (const rect of this.freeRects) {
      // Normal orientation
      if (rect.width >= w && rect.height >= h) {
        const shortSide = Math.min(rect.width - w, rect.height - h);
        if (shortSide < bestShortSide) {
          bestShortSide = shortSide;
          bestRect = rect;
          rotated = false;
        }
      }
      // Rotated orientation (only if meaningfully different)
      if (rect.width >= h && rect.height >= w && Math.abs(w - h) > 1) {
        const shortSide = Math.min(rect.width - h, rect.height - w);
        if (shortSide < bestShortSide) {
          bestShortSide = shortSide;
          bestRect = rect;
          rotated = true;
        }
      }
    }

    if (!bestRect) return false;

    const fw = rotated ? h : w;
    const fh = rotated ? w : h;
    const pw = rotated ? piece.height : piece.width;
    const ph = rotated ? piece.width : piece.height;

    this.placed.push({
      pieceId: piece.pieceId,
      pieceNo: piece.pieceNo,
      instanceIdx: piece.instanceIdx,
      x: bestRect.x, y: bestRect.y,
      width: pw, height: ph,
      rotated,
      description: piece.description,
      holes: piece.holes,
      notches: piece.notches,
    });

    // Split the used free rect (guillotine — horizontal split)
    const newRects: FreeRect[] = [];
    // Right of placed piece
    if (bestRect.width - fw > this.margin) {
      newRects.push({ x: bestRect.x + fw, y: bestRect.y, width: bestRect.width - fw, height: fh });
    }
    // Below placed piece (full width)
    if (bestRect.height - fh > this.margin) {
      newRects.push({ x: bestRect.x, y: bestRect.y + fh, width: bestRect.width, height: bestRect.height - fh });
    }

    // Remove used rect, add new ones
    this.freeRects = this.freeRects.filter(r => r !== bestRect);
    this.freeRects.push(...newRects);

    // Prune contained rects
    this.pruneFreeRects();

    return true;
  }

  private pruneFreeRects() {
    const pruned: FreeRect[] = [];
    for (let i = 0; i < this.freeRects.length; i++) {
      let dominated = false;
      for (let j = 0; j < this.freeRects.length; j++) {
        if (i === j) continue;
        const a = this.freeRects[i];
        const b = this.freeRects[j];
        if (b.x <= a.x && b.y <= a.y && b.x + b.width >= a.x + a.width && b.y + b.height >= a.y + a.height) {
          dominated = true; break;
        }
      }
      if (!dominated) pruned.push(this.freeRects[i]);
    }
    this.freeRects = pruned;
  }

  getPlaced(): PlacedPiece[] { return this.placed; }

  getScrapZones(): ScrapZone[] {
    // Significant free rects > 3 sqft are scrap zones worth showing
    return this.freeRects
      .filter(r => r.width * r.height > 3)
      .map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
  }

  getUsedArea(): number {
    return this.placed.reduce((s, p) => s + p.width * p.height, 0);
  }
}

// ── Main packing function ─────────────────────────────────────────────────

export function packPieces(
  pieces: PackingPiece[],
  sheetWidthInch: number,
  sheetHeightInch: number,
  // Optional: defective sheet usable zone
  defectiveUsableZone?: { x: number; y: number; width: number; height: number }
): PackingResult {
  const sheetSqft = (sheetWidthInch * sheetHeightInch) / 144;

  // Expand pieces by qty
  const expanded: { pieceId: string; pieceNo: number; instanceIdx: number; width: number; height: number; description?: string; holes?: HoleSpec[]; notches?: NotchSpec[] }[] = [];
  pieces.forEach(p => {
    for (let i = 0; i < p.qty; i++) {
      expanded.push({
        pieceId: p.pieceId,
        pieceNo: p.pieceNo,
        instanceIdx: i,
        width: p.widthInch,
        height: p.heightInch,
        description: p.description,
        holes: p.holes,
        notches: p.notches,
      });
    }
  });

  // Sort by area descending (largest first — better packing)
  expanded.sort((a, b) => (b.width * b.height) - (a.width * a.height));

  const plans: SheetCuttingPlan[] = [];
  const unplaced: typeof expanded = [...expanded];

  // Keep creating sheets until all pieces placed or no progress
  let maxSheets = 50; // safety
  while (unplaced.length > 0 && maxSheets-- > 0) {
    const packer = new GuillotinePacker(sheetWidthInch, sheetHeightInch, defectiveUsableZone);
    const failedThisSheet: typeof expanded = [];

    for (const piece of unplaced) {
      const placed = packer.place(piece);
      if (!placed) failedThisSheet.push(piece);
    }

    const placed = packer.getPlaced();
    if (placed.length === 0) break; // No progress

    const usedArea = packer.getUsedArea();
    const usedSqft = usedArea / 144;
    const scrapSqft = sheetSqft - usedSqft;

    plans.push({
      sheetWidth: sheetWidthInch,
      sheetHeight: sheetHeightInch,
      pieces: placed,
      scrapZones: packer.getScrapZones(),
      usedSqft: Number(usedSqft.toFixed(2)),
      totalSqft: Number(sheetSqft.toFixed(2)),
      scrapSqft: Number(scrapSqft.toFixed(2)),
      wastagePct: Number((scrapSqft / sheetSqft * 100).toFixed(1)),
      defectZone: defectiveUsableZone ? undefined : undefined,
    });

    // Only keep unplaced pieces for next sheet
    const placedIds = new Set(placed.map(p => `${p.pieceId}-${p.instanceIdx}`));
    unplaced.length = 0;
    for (const p of failedThisSheet) {
      if (!placedIds.has(`${p.pieceId}-${p.instanceIdx}`)) unplaced.push(p);
    }
  }

  const totalUsedSqft = plans.reduce((s, p) => s + p.usedSqft, 0);
  const totalSqft = plans.reduce((s, p) => s + p.totalSqft, 0);
  const totalScrapSqft = plans.reduce((s, p) => s + p.scrapSqft, 0);

  return {
    plans,
    unplacedPieces: unplaced.map(p => ({
      pieceId: p.pieceId, pieceNo: p.pieceNo,
      widthInch: p.width, heightInch: p.height,
    })),
    totalSheetsUsed: plans.length,
    totalWastagePct: totalSqft > 0 ? Number((totalScrapSqft / totalSqft * 100).toFixed(1)) : 0,
    totalUsedSqft: Number(totalUsedSqft.toFixed(2)),
    totalScrapSqft: Number(totalScrapSqft.toFixed(2)),
  };
}

// ── Wastage tolerance bands ────────────────────────────────────────────────
// Based on glass type — to be calibrated after 3 months of data
export const WASTAGE_TOLERANCE: Record<string, number> = {
  'Plain':   12,   // 12% acceptable
  'Clear':   12,
  'Mirror':  15,   // harder to cut
  'Color':   14,
  'Fluted':  18,
  'Tinted':  14,
  'Frosted': 14,
  'default': 12,
};

export function getWastageTolerance(glassType?: string): number {
  if (!glassType) return WASTAGE_TOLERANCE.default;
  return WASTAGE_TOLERANCE[glassType] || WASTAGE_TOLERANCE.default;
}

export function isWastageExcessive(actualPct: number, glassType?: string): boolean {
  return actualPct > getWastageTolerance(glassType);
}
