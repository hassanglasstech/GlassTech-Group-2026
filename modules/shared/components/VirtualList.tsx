import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface VirtualListProps {
  items: any[];
  rowHeight: number;
  overscan?: number;
  renderRow: (item: any, index: number) => React.ReactNode;
  className?: string;
  containerHeight?: number;
}

/**
 * Lightweight virtual list — renders only visible rows + overscan buffer.
 * No external dependencies. Works like react-window but simpler.
 * 
 * Usage:
 * <VirtualList
 *   items={myArray}
 *   rowHeight={48}
 *   renderRow={(item, idx) => <tr key={item.id}>...</tr>}
 * />
 */
const VirtualList: React.FC<VirtualListProps> = ({
  items,
  rowHeight,
  overscan = 5,
  renderRow,
  className = '',
  containerHeight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(containerHeight || 600);

  useEffect(() => {
    if (containerRef.current && !containerHeight) {
      const h = containerRef.current.parentElement?.clientHeight || 600;
      setViewHeight(Math.max(h, 400));
    }
  }, [containerHeight]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalHeight = items.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(items.length, Math.ceil((scrollTop + viewHeight) / rowHeight) + overscan);
  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto ${className}`}
      style={{ height: containerHeight || viewHeight, maxHeight: containerHeight || viewHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
          {visibleItems.map((item, i) => renderRow(item, startIndex + i))}
        </div>
      </div>
    </div>
  );
};

/**
 * VirtualTable — wraps a table with virtual scrolling.
 * thead stays fixed, tbody rows are virtualized.
 */
interface VirtualTableProps {
  items: any[];
  rowHeight?: number;
  overscan?: number;
  maxHeight?: number;
  renderHeader: () => React.ReactNode;
  renderRow: (item: any, index: number) => React.ReactNode;
  emptyMessage?: string;
  className?: string;
}

export const VirtualTable: React.FC<VirtualTableProps> = ({
  items,
  rowHeight = 52,
  overscan = 8,
  maxHeight = 600,
  renderHeader,
  renderRow,
  emptyMessage = 'No data',
  className = '',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalHeight = items.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(items.length, Math.ceil((scrollTop + maxHeight) / rowHeight) + overscan);
  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  if (items.length === 0) {
    return (
      <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${className}`}>
        <table className="w-full text-left sap-table">
          {renderHeader()}
        </table>
        <div className="py-12 text-center text-slate-300 font-bold uppercase text-xs italic">{emptyMessage}</div>
      </div>
    );
  }

  // For small lists (<50), render normally without virtualization
  if (items.length < 50) {
    return (
      <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${className}`}>
        <table className="w-full text-left sap-table">
          {renderHeader()}
          <tbody className="divide-y divide-slate-100">
            {items.map((item, idx) => renderRow(item, idx))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${className}`}>
      <table className="w-full text-left sap-table">
        {renderHeader()}
      </table>
      <div
        ref={scrollRef}
        style={{ maxHeight, overflowY: 'auto' }}
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <table className="w-full text-left sap-table" style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
            <tbody className="divide-y divide-slate-100">
              {visibleItems.map((item, i) => renderRow(item, startIndex + i))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="px-4 py-2 bg-slate-50 border-t text-[9px] font-bold text-slate-400 text-right">
        Showing {startIndex + 1}–{Math.min(endIndex, items.length)} of {items.length}
      </div>
    </div>
  );
};

export default VirtualList;
