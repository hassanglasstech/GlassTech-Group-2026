/**
 * ShortcutSheet — Sprint 20
 *
 * Press `?` anywhere on the workbench → modal listing all keyboard
 * shortcuts. Esc / `?` again closes.
 *
 * Self-mounting — drop <ShortcutSheet/> into Workbench.tsx and it
 * registers its own listeners. No props required.
 *
 * The list lives next to its callsite (each shortcut's "owning"
 * component still installs its own keydown handler — this sheet is
 * just the documentation surface).
 */

import React, { useEffect, useState } from 'react';
import { X, Keyboard } from 'lucide-react';

interface Shortcut {
  keys:  string[];
  label: string;
}

const GROUPS: Array<{ name: string; items: Shortcut[] }> = [
  {
    name: 'Search & navigation',
    items: [
      { keys: ['⌘ K', 'Ctrl K'], label: 'Focus search' },
      { keys: ['Esc'],            label: 'Clear search · close panel · clear selection' },
      { keys: ['?'],              label: 'Show this sheet' },
    ],
  },
  {
    name: 'Detail panel',
    items: [
      { keys: ['Click'],           label: 'Open piece detail (List / Grid)' },
      { keys: ['Double-click'],    label: 'Open piece detail (Kanban card)' },
      { keys: ['→'],               label: 'Next piece' },
      { keys: ['←'],               label: 'Previous piece' },
      { keys: ['Esc', '⌘ .'],      label: 'Close panel' },
    ],
  },
  {
    name: 'Kanban',
    items: [
      { keys: ['Drag'],           label: 'Move piece between columns (mouse)' },
      { keys: ['Long-press'],     label: 'Move piece between columns (touch, 200 ms)' },
      { keys: ['Click ID'],       label: 'Toggle bulk selection' },
      { keys: ['Esc'],            label: 'Clear bulk selection' },
    ],
  },
];

const ShortcutSheet: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).matches('input, textarea, select')) return;
      // `?` (Shift+/) opens; pressing it again toggles
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[300] bg-slate-900/40"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="fixed z-[301] inset-x-4 bottom-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 bg-white rounded-2xl shadow-2xl max-w-2xl md:w-[680px] max-h-[80vh] overflow-hidden flex flex-col"
      >
        <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-blue-600"/>
            <h2 className="text-base font-black text-slate-800">Keyboard shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={16}/>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {GROUPS.map(g => (
            <section key={g.name}>
              <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                {g.name}
              </h3>
              <ul className="divide-y divide-slate-100">
                {g.items.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <span className="text-slate-700">{s.label}</span>
                    <span className="flex gap-1.5 shrink-0">
                      {s.keys.map((k, j) => (
                        <React.Fragment key={k}>
                          {j > 0 && <span className="text-slate-300 self-center">/</span>}
                          <kbd className="bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-700">
                            {k}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="px-5 py-2.5 border-t border-slate-200 text-[10px] text-slate-400 text-center shrink-0">
          Press <kbd className="bg-slate-100 border border-slate-200 rounded px-1 font-mono">?</kbd> any time to reopen
        </footer>
      </div>
    </>
  );
};

export default ShortcutSheet;
