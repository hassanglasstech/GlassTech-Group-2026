/**
 * DataGridCard.tsx — Design System v2 (hardened)
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
 *
 * Phase-1 harden — all ADDITIVE and opt-in (existing callers render identically):
 *   - density?: 'compact' | 'comfortable'         (default 'compact' = current look)
 *   - column.sortable                              (click header to sort)
 *   - selectable + selectedKeys + onSelectionChange (leading checkbox column)
 *   - rowContextMenu(row, i)                       (right-click row → ContextMenu)
 *
 * ZERO inline styles (except dynamic column width). Pure Tailwind.
 */

import React, { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { ContextMenuPortal, type ContextMenuItem } from './ContextMenu';

// ── Column definition ──────────────────────────────────────────────────
export interface GridColumn<T = any> {
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
  /** Enable click-to-sort on this column (opt-in). */
  sortable?: boolean;
  /** Custom sort value extractor (defaults to row[key]). */
  sortAccessor?: (row: T) => string | number;
}

// ── Props ──────────────────────────────────────────────────────────────
export interface DataGridCardProps<T = any> {
  columns: GridColumn<T>[];
  rows?: T[];
  getRowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
  className?: string;
  children?: React.ReactNode;
  toolbar?: React.ReactNode;

  // ── Hardened, opt-in ──────────────────────────────────────────────
  /** Row vertical density. 'compact' (default) keeps the current look. */
  density?: 'compact' | 'comfortable';
  /** Show a leading checkbox column for multi-select. Requires getRowKey. */
  selectable?: boolean;
  /** Controlled set of selected row keys. */
  selectedKeys?: Set<string>;
  /** Fires with the next selection set when a checkbox toggles. */
  onSelectionChange?: (keys: Set<string>) => void;
  /** Right-click a row → context menu items for that row. */
  rowContextMenu?: (row: T, index: number) => ContextMenuItem[];
}

// ── Alignment utility ─────────────────────────────────────────────────
const ALIGN_CLS: Record<string, string> = {
  left:   'text-left',
  center: 'text-center',
  right:  'text-right',
};

// ── Spinner ───────────────────────────────────────────────────────────
const Spinner: React.FC = () => (
  <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────
export function DataGridCard<T = any>({
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
  density = 'compact',
  selectable = false,
  selectedKeys,
  onSelectionChange,
  rowContextMenu,
}: DataGridCardProps<T>) {

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [menu, setMenu] = useState<{ pos: { top: number; left: number }; items: ContextMenuItem[] } | null>(null);

  const cellPadY = density === 'comfortable' ? 'py-3' : 'py-1.5';
  const headPadY = density === 'comfortable' ? 'py-2.5' : 'py-2';

  const keyOf = (row: T, i: number) => (getRowKey ? getRowKey(row, i) : String(i));

  // Apply sort (only on the structured `rows` path).
  const sortedRows = useMemo(() => {
    if (!rows || !sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const acc = col.sortAccessor ?? ((r: T) => (r as Record<string, unknown>)[sort.key] as string | number);
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = acc(a), bv = acc(b);
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort, columns]);

  const hasRows = sortedRows && sortedRows.length > 0;
  const colSpan = columns.length + (selectable ? 1 : 0);

  const toggleSort = (key: string) =>
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' });

  // Selection helpers
  const sel = selectedKeys ?? new Set<string>();
  const visibleKeys = (sortedRows ?? []).map((r, i) => keyOf(r, i));
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => sel.has(k));
  const toggleAll = () => {
    const next = new Set(sel);
    if (allSelected) visibleKeys.forEach((k) => next.delete(k));
    else visibleKeys.forEach((k) => next.add(k));
    onSelectionChange?.(next);
  };
  const toggleOne = (k: string) => {
    const next = new Set(sel);
    next.has(k) ? next.delete(k) : next.add(k);
    onSelectionChange?.(next);
  };

  return (
    <div className={`bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col min-h-0 ${className}`}>
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
              {selectable && (
                <th scope="col" className={`${headPadY} px-3 w-10 bg-slate-50 border-b border-slate-200`}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {columns.map(col => {
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                    className={[
                      headPadY, 'px-3',
                      'text-[10px] font-bold uppercase tracking-wider',
                      'text-slate-500 bg-slate-50',
                      'border-b border-slate-200',
                      'whitespace-nowrap select-none',
                      col.sortable ? 'cursor-pointer hover:text-slate-700' : '',
                      ALIGN_CLS[col.align ?? 'left'],
                      col.className ?? '',
                      col.headerClassName ?? '',
                    ].join(' ')}
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  >
                    <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
                      {col.header}
                      {col.sortable && (
                        active
                          ? (sort!.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
                          : <ChevronsUpDown size={11} className="opacity-30" />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ── Body ─────────────────────────────────────────────── */}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="py-10 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <Spinner /><span className="text-xs">Loading…</span>
                  </div>
                </td>
              </tr>

            ) : children ? (
              children

            ) : hasRows ? (
              (sortedRows as T[]).map((row, ri) => {
                const rk = keyOf(row, ri);
                const isSel = sel.has(rk);
                return (
                  <tr
                    key={rk}
                    onClick={() => onRowClick?.(row)}
                    onContextMenu={rowContextMenu ? (e) => {
                      e.preventDefault();
                      setMenu({ pos: { top: e.clientY, left: e.clientX }, items: rowContextMenu(row, ri) });
                    } : undefined}
                    className={[
                      'border-b border-slate-100 last:border-0',
                      isSel ? 'bg-info-subtle' : (ri % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'),
                      onRowClick
                        ? 'cursor-pointer hover:bg-blue-50/50 transition-colors'
                        : 'hover:bg-slate-50/70 transition-colors',
                    ].join(' ')}
                  >
                    {selectable && (
                      <td className={`${cellPadY} px-3`} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleOne(rk)}
                          aria-label="Select row"
                        />
                      </td>
                    )}
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={[
                          cellPadY, 'px-3 text-slate-700',
                          ALIGN_CLS[col.align ?? 'left'],
                          col.className ?? '',
                          col.cellClassName ?? '',
                        ].join(' ')}
                      >
                        {col.render
                          ? col.render((row as Record<string, unknown>)[col.key], row, ri)
                          : ((row as Record<string, unknown>)[col.key] as React.ReactNode) ?? '—'}
                      </td>
                    ))}
                  </tr>
                );
              })

            ) : (
              <tr>
                <td colSpan={colSpan} className="py-10 text-center text-slate-400">
                  {emptyState ?? <span className="text-xs">No records found.</span>}
                </td>
              </tr>
            )}
          </tbody>

          {/* ── Footer (totals / formula row) ─────────────────────── */}
          {footer && !loading && (
            <tfoot>
              <tr className="bg-slate-800 text-white">
                {selectable && <td className={`${cellPadY} px-3`} />}
                {footer}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Row right-click menu (portal — tables can't wrap <tr>) */}
      {menu && (
        <ContextMenuPortal items={menu.items} pos={menu.pos} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

export default DataGridCard;
