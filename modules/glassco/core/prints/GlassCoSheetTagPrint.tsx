/**
 * GlassCoSheetTagPrint.tsx — Phase 3
 *
 * Prints sheet tags in batch after GRN tag generation.
 * Tag contains: ID only — NO status printed.
 * Status, defect info, usable area — system only.
 *
 * Layout: 3 columns × 4 rows = 12 tags per A4 page
 * Each tag: ~62mm × 62mm (business card size)
 */

import React from 'react';

// ── Types ─────────────────────────────────────────────────────────────────
export interface SheetTagData {
  tagId: string;           // e.g. GLS-5MM-0326-001-01
  grnId: string;
  grnDate: string;
  vendorName: string;
  dcNo: string;
  thickness: string;
  sheetSize: string;       // e.g. 84x144
  sqftPerSheet: number;
  weightKg?: number;       // per sheet weight (optional)
  batchSeq: string;
}

interface Props {
  tags: SheetTagData[];
  onClose: () => void;
}

// ── Print styles ───────────────────────────────────────────────────────────
const PRINT_CSS = `
  @media print {
    body > *:not(#tag-print-root) { display: none !important; }
    #tag-print-root { display: block !important; }
    @page { size: A4 portrait; margin: 8mm; }
    .no-print { display: none !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
  @media screen {
    #tag-print-root { background: #f1f5f9; padding: 24px; }
  }
`;

// ── Single Tag ─────────────────────────────────────────────────────────────
const SheetTag: React.FC<{ tag: SheetTagData; index: number }> = ({ tag, index }) => {
  // Parse tag parts: GLS-5MM-0326-001-01
  const parts = tag.tagId.split('-');
  // Serial is last segment
  const serial = parts[parts.length - 1];
  const batchPart = parts.slice(0, -1).join('-');

  return (
    <div style={{
      width: '62mm',
      height: '62mm',
      border: '1.5px solid #0f172a',
      borderRadius: '4px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      pageBreakInside: 'avoid',
      breakInside: 'avoid',
      background: 'white',
      fontFamily: 'Arial, sans-serif',
    }}>

      {/* Header bar — GlassTech branding */}
      <div style={{
        background: '#0f172a',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '2.5mm 3mm',
      }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '-0.03em' }}>GlassTech</div>
          <div style={{ fontSize: '5.5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>GlassCo</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '5.5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Sheet Tag</div>
          <div style={{ fontSize: '6px', fontWeight: 900, color: '#60a5fa' }}>#{String(index + 1).padStart(3, '0')}</div>
        </div>
      </div>

      {/* Tag ID — large, dominant */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2mm 3mm',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{ fontSize: '5.5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1mm' }}>
          Tag ID
        </div>
        {/* Batch prefix */}
        <div style={{ fontSize: '8px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', fontFamily: 'Courier, monospace' }}>
          {batchPart}
        </div>
        {/* Serial — biggest */}
        <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.05em', lineHeight: 1, fontFamily: 'Courier, monospace' }}>
          -{serial}
        </div>
      </div>

      {/* Specs row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        borderBottom: '1px solid #e2e8f0',
      }}>
        {[
          { label: 'Thick', val: tag.thickness },
          { label: 'Size', val: `${tag.sheetSize}"` },
          { label: 'SqFt', val: tag.sqftPerSheet.toFixed(1) },
        ].map(item => (
          <div key={item.label} style={{
            padding: '1.5mm 2mm',
            textAlign: 'center',
            borderRight: '1px solid #e2e8f0',
          }}>
            <div style={{ fontSize: '5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</div>
            <div style={{ fontSize: '8px', fontWeight: 900, color: '#1e293b' }}>{item.val}</div>
          </div>
        ))}
      </div>

      {/* Footer — GRN ref + vendor */}
      <div style={{ padding: '1.5mm 3mm', background: '#f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>GRN</div>
            <div style={{ fontSize: '6px', fontWeight: 900, color: '#334155', fontFamily: 'Courier, monospace' }}>{tag.grnId}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Vendor / DC</div>
            <div style={{ fontSize: '6px', fontWeight: 900, color: '#334155' }}>{tag.vendorName.slice(0, 14)} / {tag.dcNo}</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5mm' }}>
          <div style={{ fontSize: '5px', color: '#94a3b8', fontWeight: 700 }}>Date: <span style={{ color: '#475569' }}>{tag.grnDate}</span></div>
          {tag.weightKg && tag.weightKg > 0 && (
            <div style={{ fontSize: '5px', color: '#94a3b8', fontWeight: 700 }}>Wt: <span style={{ color: '#475569' }}>{tag.weightKg.toFixed(2)} kg</span></div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Remnant Tag ────────────────────────────────────────────────────────────
export interface RemnantTagData {
  tagId: string;          // e.g. REM-5MM-0326-001
  parentTagId: string;
  grnId: string;
  thickness: string;
  shape: 'Rectangle' | 'L-Shape';
  sqft: number;
  binLocation: string;
  dimensions: {
    widthInch?: number; heightInch?: number;
    rect1Width?: number; rect1Height?: number;
    rect2Width?: number; rect2Height?: number;
  };
  createdAt: string;
}

const RemnantTag: React.FC<{ tag: RemnantTagData; index: number }> = ({ tag, index }) => {
  const dimText = tag.shape === 'Rectangle'
    ? `${tag.dimensions.widthInch}"×${tag.dimensions.heightInch}"`
    : `L: ${tag.dimensions.rect1Width}"×${tag.dimensions.rect1Height}" + ${tag.dimensions.rect2Width}"×${tag.dimensions.rect2Height}"`;

  return (
    <div style={{
      width: '62mm', height: '62mm',
      border: '2px dashed #059669',
      borderRadius: '4px',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', pageBreakInside: 'avoid', breakInside: 'avoid',
      background: 'white', fontFamily: 'Arial, sans-serif',
    }}>
      {/* Header */}
      <div style={{ background: '#059669', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2.5mm 3mm' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 900 }}>GlassTech</div>
          <div style={{ fontSize: '5.5px', fontWeight: 700, color: '#a7f3d0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Remnant Tag</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '6px', fontWeight: 900, color: '#d1fae5' }}>REMNANT</div>
          <div style={{ fontSize: '6px', fontWeight: 700, color: '#a7f3d0' }}>#{String(index + 1).padStart(3, '0')}</div>
        </div>
      </div>

      {/* Remnant ID */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2mm 3mm', borderBottom: '1px solid #d1fae5' }}>
        <div style={{ fontSize: '5.5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '1mm' }}>Remnant ID</div>
        <div style={{ fontSize: '11px', fontWeight: 900, color: '#065f46', fontFamily: 'Courier, monospace', textAlign: 'center' }}>{tag.tagId}</div>
        <div style={{ fontSize: '8px', fontWeight: 700, color: '#475569', marginTop: '1mm' }}>{dimText}</div>
      </div>

      {/* Specs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #d1fae5' }}>
        {[
          { label: 'Thick', val: tag.thickness },
          { label: 'SqFt', val: tag.sqft.toFixed(1) },
          { label: 'Shape', val: tag.shape === 'Rectangle' ? 'Rect' : 'L' },
        ].map(item => (
          <div key={item.label} style={{ padding: '1.5mm 2mm', textAlign: 'center', borderRight: '1px solid #d1fae5' }}>
            <div style={{ fontSize: '5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{item.label}</div>
            <div style={{ fontSize: '8px', fontWeight: 900, color: '#065f46' }}>{item.val}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '1.5mm 3mm', background: '#f0fdf4' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Bin Location</div>
            <div style={{ fontSize: '7px', fontWeight: 900, color: '#065f46' }}>{tag.binLocation || '—'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Parent</div>
            <div style={{ fontSize: '5.5px', fontWeight: 900, color: '#475569', fontFamily: 'Courier, monospace' }}>{tag.parentTagId.slice(-8)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — Sheet Tag Print
// ══════════════════════════════════════════════════════════════════════════
export const GlassCoSheetTagPrint: React.FC<Props> = ({ tags, onClose }) => {
  const handlePrint = () => window.print();

  return (
    <>
      <style>{PRINT_CSS}</style>

      {/* Screen toolbar */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-slate-900 text-white flex items-center justify-between px-6 py-3 shadow-xl">
        <div>
          <span className="text-sm font-black uppercase">Sheet Tag Print Preview</span>
          <span className="text-[10px] text-slate-400 ml-3">{tags.length} tags — {Math.ceil(tags.length / 12)} page(s)</span>
        </div>
        <div className="flex gap-3">
          <button onClick={handlePrint}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase px-5 py-2 rounded-xl flex items-center gap-2">
            🖨 Print Tags
          </button>
          <button onClick={onClose}
            className="bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase px-4 py-2 rounded-xl">
            ✕ Close
          </button>
        </div>
      </div>

      {/* Print content */}
      <div id="tag-print-root" className="pt-16 pb-8 no-screen-pad" style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* Group into pages of 12 */}
        {Array.from({ length: Math.ceil(tags.length / 12) }, (_, pageIdx) => {
          const pageTags = tags.slice(pageIdx * 12, (pageIdx + 1) * 12);
          return (
            <div key={pageIdx} style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 62mm)',
              gap: '5mm',
              justifyContent: 'center',
              padding: '0',
              pageBreakAfter: pageIdx < Math.ceil(tags.length / 12) - 1 ? 'always' : 'auto',
              marginBottom: pageIdx < Math.ceil(tags.length / 12) - 1 ? '0' : '0',
            }}>
              {pageTags.map((tag, i) => (
                <SheetTag key={tag.tagId} tag={tag} index={pageIdx * 12 + i}/>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// REMNANT TAG PRINT — separate usage
// ══════════════════════════════════════════════════════════════════════════
interface RemnantPrintProps {
  tags: RemnantTagData[];
  onClose: () => void;
}

export const GlassCoRemnantTagPrint: React.FC<RemnantPrintProps> = ({ tags, onClose }) => {
  return (
    <>
      <style>{PRINT_CSS}</style>

      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-slate-900 text-white flex items-center justify-between px-6 py-3">
        <div>
          <span className="text-sm font-black uppercase">Remnant Tag Print</span>
          <span className="text-[10px] text-slate-400 ml-3">{tags.length} remnant(s)</span>
        </div>
        <div className="flex gap-3">
          <button onClick={() => window.print()} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase px-5 py-2 rounded-xl">🖨 Print</button>
          <button onClick={onClose} className="bg-white/10 text-white text-xs font-black uppercase px-4 py-2 rounded-xl">✕ Close</button>
        </div>
      </div>

      <div id="tag-print-root" className="pt-16">
        {Array.from({ length: Math.ceil(tags.length / 12) }, (_, pageIdx) => {
          const pageTags = tags.slice(pageIdx * 12, (pageIdx + 1) * 12);
          return (
            <div key={pageIdx} style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 62mm)',
              gap: '5mm', justifyContent: 'center',
              pageBreakAfter: pageIdx < Math.ceil(tags.length / 12) - 1 ? 'always' : 'auto',
            }}>
              {pageTags.map((tag, i) => (
                <RemnantTag key={tag.tagId} tag={tag} index={pageIdx * 12 + i}/>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
};

// ── Helper — build tag data from GRN sheet entries ─────────────────────────
export function buildTagsFromGRN(
  grnId: string,
  grnDate: string,
  vendorName: string,
  dcNo: string,
  lines: {
    tagIds: string[];
    thickness: string;
    sheetSize: string;
    sqftPerSheet: number;
    perSheetWeightKg: number;
    batchSeq: string;
  }[]
): SheetTagData[] {
  const tags: SheetTagData[] = [];
  lines.forEach(line => {
    line.tagIds.forEach(tagId => {
      tags.push({
        tagId, grnId, grnDate, vendorName, dcNo,
        thickness: line.thickness,
        sheetSize: line.sheetSize,
        sqftPerSheet: line.sqftPerSheet,
        weightKg: line.perSheetWeightKg,
        batchSeq: line.batchSeq,
      });
    });
  });
  return tags;
}

export default GlassCoSheetTagPrint;
