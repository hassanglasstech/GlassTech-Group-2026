/**
 * BulkActionBar.tsx + useBulkSelection — Sprint 8
 *
 * Shared primitive for "select N rows → run one action against all of
 * them" flows. Used by ProcessingView, DispatchView, and any future
 * grid that wants checkbox-style bulk operations.
 *
 * Two artefacts:
 *
 *   1. useBulkSelection<T>()
 *        toggle / clear / selectAll over a Set<id>; provides selectedIds
 *        and helpers + isSelected(id).
 *
 *   2. BulkActionBar
 *        sticky bottom bar that fades in when count > 0. Caller passes
 *        an array of {label, icon, color, onClick} actions and a
 *        confirmation handler (await before the action executes).
 *        Keyboard: Esc clears the selection.
 *
 * Mobile-aware: bar collapses to icon-only buttons under 480 px.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { CheckCircle2, X, ChevronUp, ChevronDown } from 'lucide-react';

// ── Hook ─────────────────────────────────────────────────────────────────
export function useBulkSelection<T = string>() {
  const [selected, setSelected] = useState<Set<T>>(() => new Set());

  const toggle = useCallback((id: T) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const isSelected = useCallback((id: T) => selected.has(id), [selected]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const selectAll = useCallback((ids: T[]) => {
    setSelected(new Set(ids));
  }, []);

  const replace = useCallback((ids: T[]) => {
    setSelected(new Set(ids));
  }, []);

  return {
    selected,
    selectedArray: Array.from(selected),
    count: selected.size,
    toggle,
    isSelected,
    clear,
    selectAll,
    replace,
  };
}

// ── Action bar ───────────────────────────────────────────────────────────
export interface BulkAction {
  /** Short label (visible on tablet + desktop). */
  label:   string;
  /** Icon component (lucide). */
  icon?:   React.ReactNode;
  /** Color theme — affects the button's bg + text. */
  tone?:   'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  /** Disable per current selection state. */
  disabled?: boolean;
  /** Tooltip / a11y label. */
  title?:  string;
  onClick: () => void | Promise<void>;
}

const TONE: Record<NonNullable<BulkAction['tone']>, string> = {
  primary:  'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white',
  success:  'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white',
  warning:  'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white',
  danger:   'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white',
  neutral:  'bg-slate-700 hover:bg-slate-800 active:bg-slate-900 text-white',
};

export const BulkActionBar: React.FC<{
  count:   number;
  total:   number;
  actions: BulkAction[];
  onClear: () => void;
  /** Optional: select-all callback when user clicks the count badge */
  onSelectAll?: () => void;
  /** Verbose label e.g. "pieces" / "dispatches". */
  noun?:   string;
}> = ({ count, total, actions, onClear, onSelectAll, noun = 'items' }) => {
  const [expanded, setExpanded] = useState(false);

  // Esc clears selection — keyboard accessible
  useEffect(() => {
    if (count === 0) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClear(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, onClear]);

  if (count === 0) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[400] bg-slate-900 text-white shadow-2xl border-t-2 border-blue-500 animate-in slide-in-from-bottom duration-200"
      role="toolbar"
      aria-label={`${count} ${noun} selected`}
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        {/* Selection count */}
        <button
          onClick={onSelectAll}
          className="flex items-center gap-2 bg-blue-500/20 border border-blue-400 rounded-xl px-3 py-2 hover:bg-blue-500/30 transition-colors"
          title={onSelectAll ? `Click to select all ${total}` : ''}
        >
          <CheckCircle2 size={16} className="text-blue-300"/>
          <span className="text-sm font-black">{count}<span className="text-slate-400 font-normal text-xs"> / {total}</span> selected</span>
        </button>

        {/* Action buttons (collapse on mobile) */}
        <div className={`${expanded ? 'flex' : 'hidden sm:flex'} items-center gap-2 flex-wrap order-3 sm:order-2 w-full sm:w-auto`}>
          {actions.map((a, idx) => (
            <button
              key={idx}
              onClick={a.onClick}
              disabled={a.disabled}
              title={a.title}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${TONE[a.tone || 'primary']}`}
            >
              {a.icon}
              <span>{a.label}</span>
            </button>
          ))}
        </div>

        {/* Mobile expand toggle + clear */}
        <div className="flex items-center gap-2 order-2 sm:order-3">
          <button
            onClick={() => setExpanded(e => !e)}
            className="sm:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700"
            aria-label={expanded ? 'Collapse actions' : 'Expand actions'}
          >
            {expanded ? <ChevronDown size={16}/> : <ChevronUp size={16}/>}
          </button>
          <button
            onClick={onClear}
            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-700"
            aria-label="Clear selection"
            title="Clear selection (Esc)"
          >
            <X size={16}/>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkActionBar;
