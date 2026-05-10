/**
 * ViewToggle — Sprint 15
 *
 * Kanban / List / Grid switcher for the Production Workbench.
 * Persists the chosen view per user via localStorage.
 *
 * Sprint 15 ships List + Grid views. Kanban is a stub that gets filled
 * out in Sprint 16 (drag-drop). The toggle button is enabled either way
 * so users can preview the empty state.
 */

import React, { useEffect } from 'react';
import { LayoutGrid, List, Columns } from 'lucide-react';

export type WorkbenchView = 'kanban' | 'list' | 'grid';

interface ViewToggleProps {
  value:    WorkbenchView;
  onChange: (v: WorkbenchView) => void;
  storageKey?: string;
  /** Disable kanban until Sprint 16 ships? Default false (allow preview). */
  disableKanban?: boolean;
}

const STORAGE_KEY = 'gtk_workbench_view';

const ViewToggle: React.FC<ViewToggleProps> = ({
  value,
  onChange,
  storageKey = STORAGE_KEY,
  disableKanban = false,
}) => {
  // Load saved preference once on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey) as WorkbenchView | null;
      if (saved && (saved === 'kanban' || saved === 'list' || saved === 'grid') && saved !== value) {
        onChange(saved);
      }
    } catch { /* localStorage disabled — silent */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change
  useEffect(() => {
    try { localStorage.setItem(storageKey, value); } catch { /* noop */ }
  }, [value, storageKey]);

  const opts: Array<{ value: WorkbenchView; label: string; icon: React.ReactNode; disabled?: boolean }> = [
    { value: 'kanban', label: 'Kanban', icon: <Columns size={13}/>,    disabled: disableKanban },
    { value: 'list',   label: 'List',   icon: <List size={13}/> },
    { value: 'grid',   label: 'Grid',   icon: <LayoutGrid size={13}/> },
  ];

  return (
    <div
      className="inline-flex bg-slate-100 rounded-lg p-0.5"
      role="radiogroup"
      aria-label="View mode"
    >
      {opts.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={`
              inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold
              transition-colors
              ${active
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'}
              ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}
            `}
          >
            {opt.icon}
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ViewToggle;
