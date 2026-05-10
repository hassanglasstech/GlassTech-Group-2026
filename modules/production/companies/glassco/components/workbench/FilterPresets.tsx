/**
 * FilterPresets — Sprint 20
 *
 * Save current workbench filter state as a named preset; restore with
 * one click. Lives at the bottom of the LensesSidebar.
 *
 * Storage: localStorage key `gtk_workbench_presets`. Each preset stores
 * the URL search params verbatim so any future filter additions
 * automatically round-trip without code changes here.
 *
 * Per-user (single-user go-live) — no Supabase persistence yet. Sprint 21+
 * can add a `user_workbench_presets` table if needed for multi-device.
 */

import React, { useEffect, useState } from 'react';
import { Bookmark, Save, X, Plus, Pin } from 'lucide-react';
import { toast } from 'sonner';

const STORAGE_KEY = 'gtk_workbench_presets';

// ── Types ─────────────────────────────────────────────────────────────

export interface FilterPreset {
  id:        string;
  name:      string;
  /** Serialized URL search string (without leading '?'), e.g. "lens=hold&date=today" */
  query:     string;
  pinned?:   boolean;
  createdAt: string;
}

interface FilterPresetsProps {
  /** Current URL search params (without leading '?'), used as the candidate to save. */
  currentQuery: string;
  /** Called when a preset is applied — receives a URLSearchParams instance. */
  onApply:      (params: URLSearchParams) => void;
}

// ── Storage helpers ───────────────────────────────────────────────────

function load(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr as FilterPreset[] : [];
  } catch { return []; }
}

function save(list: FilterPreset[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

// ── Component ─────────────────────────────────────────────────────────

const FilterPresets: React.FC<FilterPresetsProps> = ({ currentQuery, onApply }) => {
  const [presets, setPresets]   = useState<FilterPreset[]>([]);
  const [dialogOpen, setDialog] = useState(false);
  const [name, setName]         = useState('');

  useEffect(() => {
    setPresets(load());
  }, []);

  const persist = (next: FilterPreset[]) => {
    setPresets(next);
    save(next);
  };

  const saveCurrent = () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error('Name required'); return; }
    if (!currentQuery) {
      toast.error('No filters set — change at least one filter before saving');
      return;
    }
    const id = `p-${Date.now()}`;
    const next: FilterPreset = {
      id, name: trimmed, query: currentQuery, createdAt: new Date().toISOString(),
    };
    persist([next, ...presets]);
    toast.success(`Saved "${trimmed}"`);
    setName('');
    setDialog(false);
  };

  const remove = (id: string) => {
    const target = presets.find(p => p.id === id);
    if (!target) return;
    if (!confirm(`Delete preset "${target.name}"?`)) return;
    persist(presets.filter(p => p.id !== id));
  };

  const togglePin = (id: string) => {
    persist(presets.map(p => p.id === id ? { ...p, pinned: !p.pinned } : p));
  };

  const apply = (preset: FilterPreset) => {
    const params = new URLSearchParams(preset.query);
    onApply(params);
    toast.success(`Applied "${preset.name}"`);
  };

  // Sort: pinned first, then most recent
  const sorted = [...presets].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <>
      <div className="px-3 pt-1 pb-2 mt-2 border-t border-slate-200">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Presets
          </span>
          <button
            type="button"
            onClick={() => setDialog(true)}
            className="p-0.5 text-slate-400 hover:text-blue-600"
            title="Save current filters as preset"
            aria-label="Save preset"
          >
            <Plus size={13}/>
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic px-1 py-1">
            No saved presets yet.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {sorted.map(p => (
              <li key={p.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => apply(p)}
                  className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700 text-left truncate"
                  title={p.query}
                >
                  <Bookmark size={10} className={p.pinned ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}/>
                  <span className="truncate font-bold">{p.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => togglePin(p.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-amber-500"
                  title={p.pinned ? 'Unpin' : 'Pin to top'}
                  aria-label={p.pinned ? 'Unpin preset' : 'Pin preset'}
                >
                  <Pin size={10}/>
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-500"
                  title="Delete"
                  aria-label="Delete preset"
                >
                  <X size={11}/>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Save dialog */}
      {dialogOpen && (
        <>
          <div className="fixed inset-0 z-[300] bg-slate-900/40" onClick={() => setDialog(false)} aria-hidden/>
          <div
            role="dialog"
            aria-label="Save filter preset"
            className="fixed z-[301] left-1/2 top-1/3 -translate-x-1/2 bg-white rounded-xl shadow-2xl w-[360px] p-5"
          >
            <h2 className="text-base font-black text-slate-800 mb-1">Save filters as preset</h2>
            <p className="text-xs text-slate-500 mb-3">
              Quick way to come back to this exact view later.
            </p>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCurrent(); }}
              placeholder="e.g. Yesterday's Cuts"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 focus:outline-none mb-2"
            />
            {currentQuery && (
              <p className="text-[10px] text-slate-400 font-mono break-all mb-3">{currentQuery}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setName(''); setDialog(false); }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCurrent}
                disabled={!name.trim() || !currentQuery}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white flex items-center gap-1.5"
              >
                <Save size={11}/> Save
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default FilterPresets;
