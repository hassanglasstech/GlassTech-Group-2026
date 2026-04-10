/**
 * DataGridCard.tsx — Design System v2
 *
 * A high-density data table wrapper that:
 *   - Uses py-1.5 row height (vs bloated py-4)
 *   - Applies subtle alternating-row (zebra) striping
 *   - Sticky thead — header never scrolls away
 *   - Optional toolbar slot (filters, search, chips) above the grid
 *   - Optional footer slot for totals / formula notes
 *   - Loading spinner built-in
 *   - Empty state slot
 *   - flex-1 + min-h-0 so it correctly fills available vertical space
 *     without adding an outer scroll container
 *
 * ZERO inline styles. Pure Tailwind.
 */

import React from 'react';

// ── Column definition ──────────────────────────────────────────────────
export interface GridColumn<T = Record<string, unknown>> {
  /** Must match a key on T OR be any unique string when using custom render */
  key: string;
  header: string;
  /** Fixed column width (Tailwind won't infer percentage from style prop — pass raw CSS value) */
  width?: string;
  align?: 'left' | 'center' | 'right';
  /** Custom cell renderer — receives (cellValue, row, rowIndex) */
  render?: (value: unknown, row: T, rowIndex: number) => React.ReactNode;
  /** Extra className applied to both th and td */
  className?: string;
  /** Extra className applied to th only */
  headerClassName?: string;
  /** Extra className applied to td only */
  cellClassName?: string;
}

// ── Props ──────────────────────────────────────────────────────────────
export interface DataGridCardProps<T = Record<string, unknown>> {
  columns: GridColumn<T>[];
  /** Structured row data. If omitted, pass raw <tr> children instead */
  rows?: T[];
  /** Key extractor for rows — falls back to row index */
  getRowKey?: (row: T, index: number) => string;
  /** Click handler — adds cursor-pointer + blue row hover */
  onRowClick?: (row: T) => void;
  /** Content rendered when rows === [] */
  emptyState?: React.ReactNode;
  /**
   * Footer content — rendered as children of a single <tr> inside <tfoot>.
   * Pass <td> / <th> elements directly:
   *   footer={<><td colSpan={3}>Total</td><td>PKR 1,000</td></>}
   */
  footer?: React.ReactNode;
  loading?: boolean;
  /** Extra className on the outer container div */
  className?: string;
  /**
   * Render raw <tr> rows instead of using the `rows` array.
   * Useful for grouped / nested rows that need custom markup.
   */
  children?: React.ReactNode;
  /**
   * Toolbar bar rendered above the table (inside the card border).
   * Pass filter controls, search inputs, count chips, etc.
   */
  toolbar?: React.ReactNode;
}

// ── Alignment utility ─────────────────────────────────────────────────
const ALIGN_CLS: Record<string, string> = {
  left:   'text-left',
  center: 'text-center',
  right:  'text-right',
};

// ── Spinner ───────────────────────────────────────────────────────────
const Spinner: React.FC = () => (
  <svg
    className="animate-spin h-4 w-4 text-blue-500"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────
export function DataGridCard<T extends Record<string, unknown>>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  emptyState,
  footer,
  loading = false,
  className = '',
  children,
  toolbar,
}: DataGridCardProps<T>) {

  const hasRows = rows && rows.length > 0;

  return (
    <div
      className={`bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col min-h-0 ${className}`}
    >
      {/* ── Toolbar slot ──────────────────────────────────────────── */}
      {toolbar && (
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/70 flex items-center gap-2 flex-wrap shrink-0">
          {toolbar}
        </div>
      )}

      {/* ── Scrollable table area ─────────────────────────────────── */}
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full border-collapse text-xs" role="grid">

          {/* ── Sticky header ──────────────────────────────────────── */}
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                  className={[
                    'py-2 px-3',
                    'text-[10px] font-bold uppercase tracking-wider',
                    'text-slate-500 bg-slate-50',
                    'border-b border-slate-200',
                    'whitespace-nowrap select-none',
                    ALIGN_CLS[col.align ?? 'left'],
                    col.className ?? '',
                    col.headerClassName ?? '',
                  ].join(' ')}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Body ─────────────────────────────────────────────── */}
          <tbody>
            {loading ? (
              /* Loading state */
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-10 text-center text-slate-400"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Spinner />
                    <span className="text-xs">Loading…</span>
                  </div>
                </td>
              </tr>

            ) : children ? (
              /* Custom rows passthrough */
              children

            ) : hasRows ? (
              /* Structured rows from `rows` prop */
              (rows as T[]).map((row, ri) => (
                <tr
                  key={getRowKey ? getRowKey(row, ri) : String(ri)}
                  onClick={() => onRowClick?.(row)}
                  className={[
                    'border-b border-slate-100 last:border-0',
                    /* Zebra */
                    ri % 2 === 1 ? 'bg-slate-50/50' : 'bg-white',
                    /* Hover */
                    onRowClick
                      ? 'cursor-pointer hover:bg-blue-50/50 transition-colors'
                      : 'hover:bg-slate-50/70 transition-colors',
                  ].join(' ')}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={[
                        'py-1.5 px-3 text-slate-700',
                        ALIGN_CLS[col.align ?? 'left'],
                        col.className ?? '',
                        col.cellClassName ?? '',
                      ].join(' ')}
                    >
                      {col.render
                        ? col.render(row[col.key], row, ri)
                        : (row[col.key] as React.ReactNode) ?? '—'}
                    </td>
                  ))}
                </tr>
              ))

            ) : (
              /* Empty state */
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-10 text-center text-slate-400"
                >
                  {emptyState ?? <span className="text-xs">No records found.</span>}
                </td>
              </tr>
            )}
          </tbody>

          {/* ── Footer (totals / formula row) ─────────────────────── */}
          {footer && !loading && (
            <tfoot>
              <tr className="bg-slate-800 text-white">
                {footer}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default DataGridCard;
