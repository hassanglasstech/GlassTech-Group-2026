/**
 * ResponsiveTable — Sprint 26
 *
 * Renders a data table on desktop and the SAME data as a card list on
 * mobile. Single declaration, two surfaces. Avoids the
 * sea-of-horizontally-scrolled-cells problem on phones.
 *
 * Design contract:
 *   - Pass an array of rows + a column config
 *   - Each column declares: key, header label, cell renderer, optional
 *     `mobileRole` ('title' | 'subtitle' | 'meta' | 'badge' | 'hidden')
 *   - Mobile card layout reads mobileRole hints; columns without a hint
 *     stack as `meta` lines
 *
 * Why not just show the table with overflow-x scroll on mobile?
 *   - Tables with > 4 columns become unscannable
 *   - Card pattern matches Linear / Notion / native iOS list UX
 *   - Accessibility — screen readers announce rows linearly
 */

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useIsMobile } from '@/modules/shared/hooks/useMediaQuery';

// ── Types ─────────────────────────────────────────────────────────────

export type MobileRole = 'title' | 'subtitle' | 'meta' | 'badge' | 'hidden';

export interface Column<T> {
  key:         string;
  header:      React.ReactNode;
  /** Render a cell for a given row. */
  render:      (row: T, idx: number) => React.ReactNode;
  /** Mobile placement hint. Defaults to 'meta'. */
  mobileRole?: MobileRole;
  /** Header alignment. Default 'left'. */
  align?:      'left' | 'right' | 'center';
  /** Column width on desktop (any CSS unit). */
  width?:      string;
  /** Hide the column on desktop too (mobile-only data). */
  desktopHidden?: boolean;
  className?:  string;
}

interface ResponsiveTableProps<T> {
  rows:    T[];
  columns: Column<T>[];
  /** Stable key extractor — avoids index-as-key reorder bugs. */
  rowKey:  (row: T, idx: number) => string;
  /** Click handler — applies to both surfaces. */
  onRowClick?: (row: T) => void;
  /** Empty-state node when rows.length === 0. */
  emptyState?: React.ReactNode;
  /** Per-row className (computed). */
  rowClassName?: (row: T) => string;
  /** Override the auto mobile/desktop switch (testing). */
  forceMode?: 'mobile' | 'desktop';
  /** Row cap — useful when the underlying data may be huge. */
  maxRows?: number;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────

function ResponsiveTable<T>({
  rows, columns, rowKey, onRowClick, emptyState, rowClassName, forceMode, maxRows, className = '',
}: ResponsiveTableProps<T>) {
  const isMobileEnv = useIsMobile();
  const isMobile = forceMode === 'mobile' ? true
                 : forceMode === 'desktop' ? false
                 : isMobileEnv;

  const visibleRows = maxRows ? rows.slice(0, maxRows) : rows;

  if (rows.length === 0) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm ${className}`}>
        {emptyState ?? 'No rows to display.'}
      </div>
    );
  }

  // ── Desktop: real table ──────────────────────────────────────────
  if (!isMobile) {
    const desktopCols = columns.filter(c => !c.desktopHidden);
    return (
      <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${className}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                {desktopCols.map(c => (
                  <th
                    key={c.key}
                    style={{ width: c.width, textAlign: c.align ?? 'left' }}
                    className="px-3 py-2"
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => (
                <tr
                  key={rowKey(row, idx)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`
                    border-t border-slate-100
                    ${onRowClick ? 'hover:bg-blue-50/30 cursor-pointer' : ''}
                    ${rowClassName ? rowClassName(row) : ''}
                  `}
                >
                  {desktopCols.map(c => (
                    <td
                      key={c.key}
                      style={{ textAlign: c.align ?? 'left' }}
                      className={`px-3 py-2 ${c.className ?? ''}`}
                    >
                      {c.render(row, idx)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {maxRows && rows.length > maxRows && (
          <div className="px-3 py-2 bg-amber-50 text-xs text-amber-700 border-t border-amber-200">
            Showing first {maxRows} of {rows.length} — narrow filters to see more.
          </div>
        )}
      </div>
    );
  }

  // ── Mobile: card list ────────────────────────────────────────────
  return (
    <div className={`space-y-2 ${className}`}>
      {visibleRows.map((row, idx) => {
        const titleCols    = columns.filter(c => c.mobileRole === 'title');
        const subtitleCols = columns.filter(c => c.mobileRole === 'subtitle');
        const badgeCols    = columns.filter(c => c.mobileRole === 'badge');
        const metaCols     = columns.filter(c => !c.mobileRole || c.mobileRole === 'meta');

        return (
          <article
            key={rowKey(row, idx)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`
              bg-white rounded-xl border border-slate-200 p-3 flex items-start gap-3
              ${onRowClick ? 'hover:border-blue-300 cursor-pointer active:bg-slate-50' : ''}
              ${rowClassName ? rowClassName(row) : ''}
            `}
          >
            <div className="flex-1 min-w-0 space-y-1">
              {/* Title row */}
              {titleCols.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {titleCols.map(c => (
                    <div key={c.key} className="text-sm font-bold text-slate-800 min-w-0 truncate">
                      {c.render(row, idx)}
                    </div>
                  ))}
                  {badgeCols.map(c => (
                    <div key={c.key} className="shrink-0">
                      {c.render(row, idx)}
                    </div>
                  ))}
                </div>
              )}

              {/* Subtitle */}
              {subtitleCols.length > 0 && (
                <div className="text-xs text-slate-500">
                  {subtitleCols.map(c => (
                    <span key={c.key}>{c.render(row, idx)}</span>
                  ))}
                </div>
              )}

              {/* Meta rows — show as label · value pairs */}
              {metaCols.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] mt-1.5">
                  {metaCols.map(c => (
                    <React.Fragment key={c.key}>
                      <dt className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">{c.header}</dt>
                      <dd className="text-slate-700 text-right truncate">{c.render(row, idx)}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
            </div>

            {onRowClick && (
              <ChevronRight size={14} className="text-slate-300 mt-1 shrink-0"/>
            )}
          </article>
        );
      })}
      {maxRows && rows.length > maxRows && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 text-center">
          Showing first {maxRows} of {rows.length} — narrow filters to see more.
        </div>
      )}
    </div>
  );
}

export default ResponsiveTable;
