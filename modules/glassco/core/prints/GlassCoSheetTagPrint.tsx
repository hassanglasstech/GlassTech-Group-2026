/**
 * GlassCoSheetTagPrint.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders A4-ready glass sheet inventory tags.
 * Layout: 3 columns × 4 rows = 12 tags per A4 page.
 * Each tag shows: Tag ID (barcode-style), serial, company header, vendor,
 * thickness, sheet size, GRN ref, date.
 *
 * Usage (inside a printable container):
 *   <GlassCoSheetTagPrint entry={ledgerEntry} vendorName="XYZ Imports" />
 *
 * Call window.print() to print — the @media print styles suppress the
 * on-screen wrapper and render only .sheet-tag-print-root.
 */

import React from 'react';
import { MaterialLedgerEntry } from '@/modules/procurement/types/inventory';

interface Props {
    entry: MaterialLedgerEntry;
    vendorName?: string;
}

// ── Barcode-style visual (CSS-only stripes) ──────────────────────────────────
const BarcodeStripes: React.FC<{ value: string }> = ({ value }) => {
    // Deterministic stripe widths from char codes — purely decorative
    const stripes = Array.from(value).map((c, i) => {
        const code = c.charCodeAt(0);
        return { width: (code % 3) + 1, dark: i % 2 === 0 };
    });
    return (
        <div style={{ display: 'flex', alignItems: 'stretch', height: '36px', gap: '1px', overflow: 'hidden', borderRadius: '2px' }}>
            {stripes.map((s, i) => (
                <div
                    key={i}
                    style={{
                        width: `${s.width * 2}px`,
                        background: s.dark ? '#0f172a' : '#cbd5e1',
                        flexShrink: 0,
                    }}
                />
            ))}
        </div>
    );
};

// ── Single Tag ───────────────────────────────────────────────────────────────
const SheetTag: React.FC<{ tagId: string; serial: number; meta: NonNullable<MaterialLedgerEntry['sheetTagMeta']>; vendorName: string }> = ({
    tagId, serial, meta, vendorName
}) => (
    <div style={{
        border: '1.5px solid #1e293b',
        borderRadius: '6px',
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        background: '#ffffff',
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
        pageBreakInside: 'avoid',
        fontFamily: "'Arial', sans-serif",
    }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1.5px solid #0f172a', paddingBottom: '4px', marginBottom: '2px' }}>
            <div>
                <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0f172a' }}>GlassTech Group</div>
                <div style={{ fontSize: '7px', fontWeight: 700, textTransform: 'uppercase', color: '#475569', marginTop: '1px' }}>GlassCo Pvt. Ltd. · Karachi</div>
            </div>
            <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '7px', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase' }}>SHEET TAG</div>
                <div style={{ fontSize: '9px', fontWeight: 900, color: '#0f172a' }}>#{String(serial).padStart(3, '0')}</div>
            </div>
        </div>

        {/* Tag ID — prominent */}
        <div style={{ background: '#0f172a', color: '#ffffff', borderRadius: '3px', padding: '3px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.12em', fontFamily: 'monospace' }}>{tagId}</div>
        </div>

        {/* Barcode visual */}
        <BarcodeStripes value={tagId} />

        {/* Data rows */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px', marginTop: '2px' }}>
            <Cell label="Thickness" value={meta.thickness.toUpperCase()} />
            <Cell label="Sheet Size" value={meta.sheetSize ? `${meta.sheetSize}"` : '—'} />
            <Cell label="GRN Ref" value={meta.grnRef || '—'} />
            <Cell label="Date" value={meta.grnDate || '—'} />
        </div>

        {/* Vendor — full width */}
        <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '3px', marginTop: '2px' }}>
            <div style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>Vendor</div>
            <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vendorName || '—'}</div>
        </div>

        {/* Batch indicator */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
            <div style={{ fontSize: '7px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.05em' }}>BATCH {meta.batchSeq}</div>
        </div>
    </div>
);

const Cell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div>
        <div style={{ fontSize: '6.5px', fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8' }}>{label}</div>
        <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#0f172a', marginTop: '1px' }}>{value}</div>
    </div>
);

// ── Print stylesheet injected once ───────────────────────────────────────────
const PRINT_STYLE = `
@media print {
  body > *:not(.sheet-tag-print-root) { display: none !important; }
  .sheet-tag-print-root { display: block !important; }
  @page { size: A4 portrait; margin: 10mm; }
}
`;

// ── Main export ──────────────────────────────────────────────────────────────
export const GlassCoSheetTagPrint: React.FC<Props> = ({ entry, vendorName = '' }) => {
    const tags = entry.sheetTags || [];
    const meta = entry.sheetTagMeta;

    if (tags.length === 0 || !meta) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontFamily: 'Arial' }}>
                <p style={{ fontSize: '14px', fontWeight: 700 }}>No sheet tags found on this GRN entry.</p>
                <p style={{ fontSize: '11px', marginTop: '8px' }}>Tags are generated automatically when GRN is posted in Glass Sheet mode with Sheets qty mode.</p>
            </div>
        );
    }

    // Split into pages of 12
    const pages: string[][] = [];
    for (let i = 0; i < tags.length; i += 12) {
        pages.push(tags.slice(i, i + 12));
    }

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />
            <div
                className="sheet-tag-print-root"
                style={{ background: '#f8fafc', padding: '16px', fontFamily: 'Arial, sans-serif' }}
            >
                {/* Screen header */}
                <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#1e293b', color: '#fff', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="no-print">
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sheet Tag Sheet — GRN {meta.grnRef}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>{tags.length} tags · {meta.thickness} · {meta.sheetSize}" · Batch {meta.batchSeq}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{pages.length} page{pages.length > 1 ? 's' : ''}</div>
                </div>

                {pages.map((pageTagIds, pageIdx) => (
                    <div
                        key={pageIdx}
                        style={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '16px',
                            marginBottom: '24px',
                            pageBreakAfter: 'always',
                        }}
                    >
                        {/* Page header (print only styling via CSS) */}
                        <div style={{ marginBottom: '12px', borderBottom: '2px solid #0f172a', paddingBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>GlassTech Group — GlassCo</div>
                                <div style={{ fontSize: '9px', fontWeight: 700, color: '#475569', marginTop: '2px', textTransform: 'uppercase' }}>
                                    Glass Sheet Inventory Tags · {meta.thickness} · {meta.sheetSize}" · Batch {meta.batchSeq}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '9px', color: '#64748b' }}>
                                <div style={{ fontWeight: 700 }}>GRN: {meta.grnRef}</div>
                                <div>{meta.grnDate}</div>
                                <div>Page {pageIdx + 1} / {pages.length}</div>
                            </div>
                        </div>

                        {/* 3 × 4 grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            gap: '8px',
                        }}>
                            {pageTagIds.map((tagId, tagIdx) => {
                                const globalSerial = pageIdx * 12 + tagIdx + 1;
                                return (
                                    <div key={tagId} style={{ minHeight: '170px' }}>
                                        <SheetTag
                                            tagId={tagId}
                                            serial={globalSerial}
                                            meta={meta}
                                            vendorName={vendorName}
                                        />
                                    </div>
                                );
                            })}
                            {/* Fill empty cells to maintain grid alignment */}
                            {Array.from({ length: 12 - pageTagIds.length }).map((_, i) => (
                                <div key={`empty-${i}`} style={{ minHeight: '170px', border: '1px dashed #e2e8f0', borderRadius: '6px' }} />
                            ))}
                        </div>

                        {/* Page footer */}
                        <div style={{ marginTop: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#94a3b8', fontWeight: 700 }}>
                            <span>GLASSTECH GROUP — STORE COPY</span>
                            <span>Tags {pageIdx * 12 + 1}–{pageIdx * 12 + pageTagIds.length} of {tags.length}</span>
                            <span>Printed: {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
};

export default GlassCoSheetTagPrint;
