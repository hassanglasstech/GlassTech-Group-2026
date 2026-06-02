/**
 * ShortcutProvider.tsx — Design System v2
 *
 * Global keyboard-shortcut registry + built-in command palette.
 *
 * ── Built-in global shortcuts ─────────────────────────────────────────
 *   Ctrl+K        — Toggle command palette (works even inside inputs)
 *   Esc           — Close palette / broadcasts 'erp:escape' for modals
 *   Alt+N         — Broadcasts 'erp:new' for "New Entry" actions
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *   // 1. Wrap your app (inside <HashRouter> so navigate() works):
 *   <ShortcutProvider>
 *     <App />
 *   </ShortcutProvider>
 *
 *   // 2. Register page-scoped shortcuts from any component:
 *   const { register, unregister } = useShortcuts();
 *   useEffect(() => {
 *     register('my-new-btn', {
 *       key: 'alt+n',
 *       description: 'New Purchase Order',
 *       handler: () => setShowModal(true),
 *     });
 *     return () => unregister('my-new-btn');
 *   }, []);
 *
 *   // 3. Listen for Esc from a modal:
 *   useEffect(() => {
 *     const handler = () => setShowModal(false);
 *     window.addEventListener('erp:escape', handler);
 *     return () => window.removeEventListener('erp:escape', handler);
 *   }, []);
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ArrowRight, Command, Search } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────
export interface ShortcutRegistration {
  /** Shortcut string e.g. "ctrl+k", "alt+n", "escape", "ctrl+shift+p" */
  key: string;
  /** Human-readable description shown in the command palette */
  description: string;
  handler: () => void;
  /**
   * If true, shortcut fires even when an <input>/<textarea> is focused.
   * Default: false (inputs are excluded so users can type freely).
   */
  global?: boolean;
}

interface ShortcutContextValue {
  register:    (id: string, reg: ShortcutRegistration) => void;
  unregister:  (id: string) => void;
  openPalette: () => void;
  closePalette:() => void;
  isPaletteOpen: boolean;
}

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  group?: string;
  action: () => void;
}

// ── Shortcut matcher ───────────────────────────────────────────────────
const matchesShortcut = (shortcut: string, e: KeyboardEvent): boolean => {
  const parts     = shortcut.toLowerCase().split('+');
  const needCtrl  = parts.includes('ctrl') || parts.includes('control');
  const needAlt   = parts.includes('alt');
  const needShift = parts.includes('shift');
  const mainKey   = parts[parts.length - 1];

  return (
    e.ctrlKey  === needCtrl  &&
    e.altKey   === needAlt   &&
    e.shiftKey === needShift &&
    e.key.toLowerCase() === mainKey
  );
};

// ── Context ────────────────────────────────────────────────────────────
const ShortcutContext = createContext<ShortcutContextValue>({
  register:      () => {},
  unregister:    () => {},
  openPalette:   () => {},
  closePalette:  () => {},
  isPaletteOpen: false,
});

export const useShortcuts = (): ShortcutContextValue => useContext(ShortcutContext);

// ── Built-in navigation commands shown in the palette ─────────────────
const NAV_COMMANDS: CommandItem[] = [
  { id: 'nav-home',        group: 'Navigate', label: 'Dashboard',             shortcut: 'Alt+1', action: () => { window.location.hash = '#/'; } },
  { id: 'nav-sales',       group: 'Navigate', label: 'Sales & Orders',        shortcut: 'Alt+2', action: () => { window.location.hash = '#/sales'; } },
  { id: 'nav-production',  group: 'Navigate', label: 'Production',            shortcut: 'Alt+3', action: () => { window.location.hash = '#/production'; } },
  { id: 'nav-inventory',   group: 'Navigate', label: 'Material Management',   shortcut: 'Alt+4', action: () => { window.location.hash = '#/inventory'; } },
  { id: 'nav-procurement', group: 'Navigate', label: 'Procurement',           shortcut: 'Alt+5', action: () => { window.location.hash = '#/requisitions'; } },
  { id: 'nav-finance',     group: 'Navigate', label: 'Finance (FICO)',        shortcut: 'Alt+6', action: () => { window.location.hash = '#/accounts'; } },
  { id: 'nav-hr',          group: 'Navigate', label: 'People (HCM)',          shortcut: 'Alt+7', action: () => { window.location.hash = '#/hr'; } },
  { id: 'nav-md',          group: 'Navigate', label: 'MD Dashboard',          shortcut: 'Alt+8', action: () => { window.location.hash = '#/md-dashboard'; } },
];

// ── Keyboard hint chip ─────────────────────────────────────────────────
const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
    {children}
  </kbd>
);

// ── Command Palette ────────────────────────────────────────────────────
const CommandPalette: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  registered: React.MutableRefObject<Map<string, ShortcutRegistration>>;
}> = ({ isOpen, onClose, registered }) => {
  const [query, setQuery]       = useState('');
  const [focused, setFocused]   = useState(0);
  const inputRef                = useRef<HTMLInputElement>(null);
  const listRef                 = useRef<HTMLDivElement>(null);

  // Focus input when palette opens, reset query
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFocused(0);
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Build command list from registered + built-in
  const registeredCommands: CommandItem[] = Array.from(registered.current.entries()).map(
    ([id, reg]) => ({
      id,
      label:    reg.description,
      shortcut: reg.key
        .replace('ctrl',  'Ctrl')
        .replace('alt',   'Alt')
        .replace('shift', 'Shift')
        .replace(/\+(\w)/g, (_, c: string) => `+${c.toUpperCase()}`),
      group:  'Actions',
      action: reg.handler,
    }),
  );

  const allCommands = [...registeredCommands, ...NAV_COMMANDS];
  const filtered    = query.trim()
    ? allCommands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : allCommands;

  // Group by `group` field
  const groups = filtered.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
    const g = cmd.group ?? 'Other';
    (acc[g] ??= []).push(cmd);
    return acc;
  }, {});

  // Flat ordered list for keyboard navigation
  const flatList = Object.values(groups).flat();

  const execute = (cmd: CommandItem) => {
    cmd.action();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape')     { onClose(); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); setFocused(f => Math.min(f + 1, flatList.length - 1)); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    if (e.key === 'Enter')      { e.preventDefault(); flatList[focused] && execute(flatList[focused]); }
  };

  // ── Backdrop + palette card ──────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center pt-[12vh] bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Search bar ──────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Search size={14} className="text-slate-400 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setFocused(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, modules, shortcuts…"
            className="flex-1 text-sm outline-none text-slate-800 placeholder-slate-400 bg-transparent"
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>ESC</Kbd>
        </div>

        {/* ── Results ─────────────────────────────────────────────── */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1.5">
          {flatList.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No commands found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            Object.entries(groups).map(([groupName, cmds]) => (
              <div key={groupName}>
                {/* Group label */}
                <div className="px-4 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  {groupName}
                </div>

                {cmds.map(cmd => {
                  const flatIdx = flatList.indexOf(cmd);
                  const isFocused = flatIdx === focused;
                  return (
                    <button
                      key={cmd.id}
                      onMouseEnter={() => setFocused(flatIdx)}
                      onClick={() => execute(cmd)}
                      className={[
                        'w-full flex items-center justify-between px-4 py-2 text-left transition-colors',
                        isFocused ? 'bg-blue-50' : 'hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2.5">
                        <ArrowRight
                          size={11}
                          className={isFocused ? 'text-blue-500' : 'text-slate-300'}
                        />
                        <span className="text-xs font-medium text-slate-700">
                          {cmd.label}
                        </span>
                      </div>
                      {cmd.shortcut && <Kbd>{cmd.shortcut}</Kbd>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* ── Footer hint bar ──────────────────────────────────────── */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span><Kbd>↑↓</Kbd> navigate</span>
            <span><Kbd>↵</Kbd> select</span>
            <span><Kbd>Esc</Kbd> close</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <Command size={10} />
            <span>GlassTech ERP 2026</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Provider ────────────────────────────────────────────────────────────
export const ShortcutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const registered = useRef<Map<string, ShortcutRegistration>>(new Map());

  const register   = useCallback((id: string, reg: ShortcutRegistration) => {
    registered.current.set(id, reg);
  }, []);

  const unregister = useCallback((id: string) => {
    registered.current.delete(id);
  }, []);

  const openPalette  = useCallback(() => setIsPaletteOpen(true),  []);
  const closePalette = useCallback(() => setIsPaletteOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target   = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT'    ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'   ||
        target.isContentEditable;

      // ── Ctrl+K — always intercept (even in inputs) ──────────────
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen(prev => !prev);
        return;
      }

      // ── Esc — close palette; otherwise broadcast ────────────────
      if (e.key === 'Escape') {
        if (isPaletteOpen) {
          setIsPaletteOpen(false);
          return;
        }
        window.dispatchEvent(new CustomEvent('erp:escape'));
        return;
      }

      // ── Alt+N — broadcast "new entry" ──────────────────────────
      if (e.altKey && e.key.toLowerCase() === 'n' && !isTyping) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('erp:new'));
        return;
      }

      // ── Alt+R — broadcast "refresh" ────────────────────────────
      if (e.altKey && e.key.toLowerCase() === 'r' && !isTyping) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('erp:refresh'));
        return;
      }

      // ── Registered shortcuts ────────────────────────────────────
      registered.current.forEach(reg => {
        if (!reg.global && isTyping) return;
        if (matchesShortcut(reg.key, e)) {
          e.preventDefault();
          reg.handler();
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPaletteOpen]);

  return (
    <ShortcutContext.Provider
      value={{ register, unregister, openPalette, closePalette, isPaletteOpen }}
    >
      {children}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={closePalette}
        registered={registered}
      />
    </ShortcutContext.Provider>
  );
};

export default ShortcutProvider;
