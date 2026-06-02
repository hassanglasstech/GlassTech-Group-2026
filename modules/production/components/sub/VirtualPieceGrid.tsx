/**
 * VirtualPieceGrid.tsx — Sprint 9
 *
 * Virtualised wrapper around the existing piece-card grids in
 * ProcessingView / DispatchView. Renders only the visible rows so a
 * 1000-piece queue doesn't ship 1000 React subtrees on every render.
 *
 * Strategy:
 *   • Uses `react-window` v2 `List` (one row at a time) rather than
 *     `Grid` because our card layouts already use Tailwind responsive
 *     columns, and a row-level virtualiser composes cleanly with that
 *     existing styling.
 *   • Computes `columnCount` from the container width via ResizeObserver
 *     (sm < 640 → 1 col, < 1024 → 2 col, else 3 col — matches existing
 *     grid breakpoints in ProcessingView).
 *   • `cellRenderer(piece, index)` returns whatever the caller wants
 *     (typically a JobCard).
 *   • Falls through to plain rendering when piece count <= threshold
 *     (default 100) so the small-list case has zero virtualisation
 *     overhead.
 *
 * Why a wrapper not direct usage?
 *   • Existing call sites already render via .map(); a drop-in component
 *     means we only touch ProcessingView in one place.
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { List, RowComponentProps } from 'react-window';

interface VirtualPieceGridProps<T> {
  items:           T[];
  /** Function that renders one card given the underlying item. */
  cellRenderer:    (item: T, index: number) => React.ReactNode;
  /** Stable id for React key. */
  getKey:          (item: T) => string;
  /** Approximate height of one card row in px. Default 220 (matches JobCard). */
  rowHeight?:      number;
  /** Minimum item count before virtualisation kicks in. Default 100. */
  threshold?:      number;
  /** Max viewport height in px when virtualising. Default 70vh. */
  maxHeightPx?:    number;
  /** Optional class on the outer container. */
  className?:      string;
}

const VirtualPieceGrid = <T,>({
  items, cellRenderer, getKey,
  rowHeight = 220,
  threshold = 100,
  maxHeightPx,
  className = '',
}: VirtualPieceGridProps<T>): React.ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        // Use offsetWidth via getBoundingClientRect for sub-pixel accuracy
        const w = e.contentRect.width;
        if (w !== width) setWidth(w);
      }
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columnCount = useMemo(() => {
    if (width === 0)     return 2;            // sane default before measure
    if (width < 640)     return 1;            // < sm
    if (width < 1024)    return 2;            // < lg
    return 3;
  }, [width]);

  const rowCount = Math.ceil(items.length / columnCount);

  // ── Below threshold: plain render (no virt overhead) ────────────────
  if (items.length <= threshold) {
    return (
      <div ref={containerRef} className={className}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {items.map((it, i) => (
            <React.Fragment key={getKey(it)}>{cellRenderer(it, i)}</React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  // ── Virtualised path ────────────────────────────────────────────────
  // Cap viewport height so very long lists don't push the page footer
  // off the bottom. Default = 70 vh.
  const listHeightPx = maxHeightPx ?? Math.round(window.innerHeight * 0.7);

  // Row component for react-window v2 List — receives index + style.
  // Declared as a plain function (not React.FC) because the v2 type
  // signature wants `(props) => ReactElement` exactly, not a generic
  // ComponentType. Memoised so List can compare row identity.
  const RowComponent = useCallback(
    (props: RowComponentProps<{}>) => {
      const { index, style } = props as { index: number; style: React.CSSProperties };
      const startIdx = index * columnCount;
      const rowItems = items.slice(startIdx, startIdx + columnCount);
      return (
        <div
          style={style}
          className="px-0"
        >
          <div
            className="grid gap-3 sm:gap-4 pb-3 sm:pb-4 h-full"
            style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            {rowItems.map((it, j) => (
              <React.Fragment key={getKey(it)}>
                {cellRenderer(it, startIdx + j)}
              </React.Fragment>
            ))}
            {/* Pad incomplete final row so flex doesn't collapse */}
            {rowItems.length < columnCount && Array.from({ length: columnCount - rowItems.length }).map((_, k) => (
              <div key={`pad-${k}`} aria-hidden/>
            ))}
          </div>
        </div>
      );
    },
    [items, columnCount, cellRenderer, getKey]
  );

  return (
    <div ref={containerRef} className={className} style={{ minHeight: 200 }}>
      <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-2">
        ⚡ Virtualised — {items.length} items, {columnCount}-column ({rowCount} rows)
      </p>
      <div style={{ height: listHeightPx }}>
        <List
          rowCount={rowCount}
          rowHeight={rowHeight}
          rowComponent={RowComponent}
          rowProps={{}}
          overscanCount={3}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
};

export default VirtualPieceGrid;
