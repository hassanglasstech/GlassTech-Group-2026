/**
 * CommandPalette — Sprint 21
 *
 * Global Cmd+K (Ctrl+K) command palette. Searches across clients,
 * invoices, quotations, vendors, and pieces via the Sprint 21
 * `global_search` RPC + the Sprint 9 piece index.
 *
 * Behaviour:
 *   - ⌘K / Ctrl+K toggles open (skipped if user is typing in an input)
 *   - Type to search — debounced 200 ms, server-side FTS
 *   - ↑/↓ navigates results, Enter opens
 *   - Esc closes
 *   - Click result → navigate via EntityLink route map
 *
 * Plays nicely with the Workbench's local Cmd+K (Sprint 15): if the
 * user is already focused on the workbench search input, the local
 * handler runs first and `e.defaultPrevented` is true here.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/src/services/supabaseClient';
import { useAppStore } from '@/modules/shared/store/appStore';
import {
  Search as SearchIcon, Loader2, X, User, FileText, ScrollText, Building2, Package, Truck,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

type EntityType = 'client' | 'invoice' | 'quotation' | 'vendor' | 'piece';

interface SearchHit {
  entity_type: EntityType;
  entity_id:   string;
  title:       string;
  subtitle:    string;
  rank:        number;
}

const TYPE_META: Record<EntityType, { label: string; icon: React.ReactNode; route: (id: string) => string; tone: string }> = {
  client:    { label: 'Client',    icon: <User size={14}/>,        route: (id) => `/sales?client=${encodeURIComponent(id)}`,             tone: 'text-blue-600' },
  invoice:   { label: 'Invoice',   icon: <FileText size={14}/>,    route: (id) => `/sales?invoice=${encodeURIComponent(id)}`,            tone: 'text-emerald-600' },
  quotation: { label: 'Quotation', icon: <ScrollText size={14}/>,  route: (id) => `/sales?quotation=${encodeURIComponent(id)}`,          tone: 'text-violet-600' },
  vendor:    { label: 'Vendor',    icon: <Building2 size={14}/>,   route: (id) => `/vendors?id=${encodeURIComponent(id)}`,               tone: 'text-orange-600' },
  piece:     { label: 'Piece',     icon: <Package size={14}/>,     route: (id) => `/production/workbench?piece=${encodeURIComponent(id)}`, tone: 'text-blue-600' },
};

// ── Component ─────────────────────────────────────────────────────────

const CommandPalette: React.FC = () => {
  const navigate = useNavigate();
  const company  = useAppStore(s => s.selectedCompany);

  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState('');
  const [hits,    setHits]    = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active,  setActive]  = useState(0);

  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Open via ⌘K / Ctrl+K (skip if user is in an input) ──────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // If a local handler already preventDefault'd this event (e.g.,
      // the workbench search bar), don't reopen here.
      if (e.defaultPrevented) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const tag = (e.target as HTMLElement | null)?.tagName ?? '';
        const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
        if (inField) return;     // let the field's own ⌘K (if any) take it
        e.preventDefault();
        setOpen(o => !o);
      }
      if (open && e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Focus input on open ─────────────────────────────────────────
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery('');
      setHits([]);
      setActive(0);
    }
  }, [open]);

  // ── Debounced search ────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setHits([]); setLoading(false); return; }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const trimmed = query.trim();
      try {
        // Run server FTS in parallel with a piece-id prefix lookup
        // (pieces aren't in global_search since piece IDs follow a fixed
        // pattern — direct prefix match is fast enough)
        const [rpc, pieces] = await Promise.all([
          supabase.rpc('global_search', {
            p_query:   trimmed,
            p_company: company,
            p_limit:   20,
          }),
          supabase
            .from('production_pieces')
            .select('id, data')
            .eq('company', company)
            .ilike('id', `%${trimmed}%`)
            .limit(8),
        ]);

        const fts = (rpc.data ?? []) as SearchHit[];
        type PieceRow = { id: string; data?: { orderId?: string; status?: string } };
        const pieceHits: SearchHit[] = ((pieces.data ?? []) as PieceRow[]).map(p => ({
          entity_type: 'piece',
          entity_id:   p.id,
          title:       p.id,
          subtitle:    `${p.data?.orderId ?? ''} · ${p.data?.status ?? ''}`.trim(),
          rank:        1,
        }));

        // Dedupe — pieces never collide with FTS results, but client/inv could repeat
        const seen = new Set<string>();
        const merged = [...pieceHits, ...fts].filter(h => {
          const key = `${h.entity_type}:${h.entity_id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        setHits(merged.slice(0, 25));
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, company]);

  // ── Keyboard nav within the list ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(a => Math.min(a + 1, Math.max(0, hits.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(a => Math.max(a - 1, 0));
      } else if (e.key === 'Enter' && hits[active]) {
        e.preventDefault();
        openHit(hits[active]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hits, active]);

  const close = () => setOpen(false);

  const openHit = (h: SearchHit) => {
    const meta = TYPE_META[h.entity_type];
    if (!meta) return;
    navigate(meta.route(h.entity_id));
    close();
  };

  // ── Group hits by entity type for nicer rendering ───────────────
  const grouped = useMemo(() => {
    const m = new Map<EntityType, SearchHit[]>();
    hits.forEach(h => {
      if (!m.has(h.entity_type)) m.set(h.entity_type, []);
      m.get(h.entity_type)!.push(h);
    });
    return m;
  }, [hits]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[500] bg-slate-900/40 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Command palette"
        className="fixed z-[501] left-1/2 top-[12vh] -translate-x-1/2 bg-white rounded-2xl shadow-2xl w-[640px] max-w-[92vw] max-h-[72vh] flex flex-col overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <SearchIcon size={16} className="text-slate-400 shrink-0"/>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            placeholder="Search clients, invoices, quotations, pieces, vendors…"
            className="flex-1 text-sm bg-transparent outline-none"
          />
          {loading && <Loader2 size={14} className="animate-spin text-slate-400"/>}
          <kbd className="bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-500">Esc</kbd>
          <button type="button" onClick={close} className="p-1 text-slate-400 hover:text-slate-700">
            <X size={14}/>
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {!query.trim() && (
            <div className="px-6 py-10 text-center text-slate-400 text-xs">
              <SearchIcon className="mx-auto mb-2 text-slate-300" size={28}/>
              Type to search across all entities · {' '}
              <kbd className="bg-slate-100 border border-slate-200 rounded px-1 font-mono">⌘K</kbd>
              {' / '}
              <kbd className="bg-slate-100 border border-slate-200 rounded px-1 font-mono">↑↓</kbd>
              {' · '}
              <kbd className="bg-slate-100 border border-slate-200 rounded px-1 font-mono">Enter</kbd>
            </div>
          )}

          {query.trim() && hits.length === 0 && !loading && (
            <div className="px-6 py-10 text-center text-slate-400 text-xs italic">
              No matches for "{query}"
            </div>
          )}

          {Array.from(grouped.entries()).map(([type, list]) => {
            const meta = TYPE_META[type];
            return (
              <div key={type} className="border-b border-slate-100 last:border-b-0">
                <div className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50">
                  {meta.label}
                </div>
                <ul>
                  {list.map(h => {
                    const idx = hits.indexOf(h);
                    const isActive = idx === active;
                    return (
                      <li key={`${h.entity_type}:${h.entity_id}`}>
                        <button
                          type="button"
                          onClick={() => openHit(h)}
                          onMouseEnter={() => setActive(idx)}
                          className={`
                            w-full text-left flex items-center gap-3 px-4 py-2 text-sm
                            ${isActive ? 'bg-blue-50' : 'hover:bg-slate-50'}
                          `}
                        >
                          <span className={`shrink-0 ${meta.tone}`}>{meta.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className={`font-mono font-bold truncate ${meta.tone}`}>{h.title}</div>
                            {h.subtitle && (
                              <div className="text-[11px] text-slate-500 truncate">{h.subtitle}</div>
                            )}
                          </div>
                          {isActive && (
                            <kbd className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-500">↵</kbd>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
          <span>{hits.length} result{hits.length === 1 ? '' : 's'}</span>
          <span>
            <kbd className="bg-slate-100 border border-slate-200 rounded px-1 font-mono">↑↓</kbd>
            {' '}navigate ·{' '}
            <kbd className="bg-slate-100 border border-slate-200 rounded px-1 font-mono">↵</kbd>
            {' '}open ·{' '}
            <kbd className="bg-slate-100 border border-slate-200 rounded px-1 font-mono">Esc</kbd>
            {' '}close
          </span>
        </div>
      </div>
    </>
  );
};

export default CommandPalette;
