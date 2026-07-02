/**
 * useSupabasePage — Server-side pagination hook
 * 
 * Use this for heavy tables: ledger, requisitions, production_pieces, stock_ledger
 * Fetches directly from Supabase with .range() — no full table load
 * 
 * Usage:
 *   const { data, total, loading, page, setPage, setSearch } = useSupabasePage({
 *     table: 'ledger',
 *     company: 'GTK',
 *     pageSize: 15,
 *     filters: { status: 'Posted' },    // optional exact-match filters
 *     orderBy: 'date',                  // optional column to sort by
 *     orderDesc: true,
 *   });
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/src/services/supabaseClient';

interface UseSupabasePageOptions {
  table: string;
  company: string;
  pageSize?: number;
  filters?: Record<string, string | number | boolean>;  // exact match filters
  orderBy?: string;
  orderDesc?: boolean;
  searchColumn?: string;   // which column to search in
  enabled?: boolean;       // set false to pause fetching
}

interface UseSupabasePageResult<T> {
  data: T[];
  total: number;
  loading: boolean;
  error: string | null;
  page: number;
  setPage: (p: number) => void;
  search: string;
  setSearch: (s: string) => void;
  refresh: () => void;
}

export function useSupabasePage<T = any>({
  table,
  company,
  pageSize = 15,
  filters = {},
  orderBy = 'updated_at',
  orderDesc = true,
  searchColumn,
  enabled = true,
}: UseSupabasePageOptions): UseSupabasePageResult<T> {

  const [data, setData]       = useState<T[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [tick, setTick]       = useState(0); // for manual refresh

  // Debounce search
  const searchRef = useRef('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleSetSearch = useCallback((s: string) => {
    searchRef.current = s;
    setSearch(s);
    setPage(1);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setTick(t => t + 1), 350);
  }, []);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!enabled || !company) return;

    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      setError(null);

      try {
        const from = (page - 1) * pageSize;
        const to   = from + pageSize - 1;

        // ── Count query ───────────────────────────────────────────
        let countQ = supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('company', company);

        // Apply extra filters
        for (const [col, val] of Object.entries(filters)) {
          countQ = countQ.eq(col, val);
        }

        // Apply search
        if (search && searchColumn) {
          countQ = countQ.ilike(searchColumn, `%${search}%`);
        }

        const { count, error: countErr } = await countQ;
        if (countErr) throw countErr;

        // ── Data query ────────────────────────────────────────────
        let dataQ = supabase
          .from(table)
          .select('*')
          .eq('company', company);

        for (const [col, val] of Object.entries(filters)) {
          dataQ = dataQ.eq(col, val);
        }

        if (search && searchColumn) {
          dataQ = dataQ.ilike(searchColumn, `%${search}%`);
        }

        dataQ = dataQ
          .order(orderBy, { ascending: !orderDesc })
          .range(from, to);

        const { data: rows, error: dataErr } = await dataQ;
        if (dataErr) throw dataErr;

        if (!cancelled) {
          // For JSONB tables: unwrap 'data' column back to app objects
          const unwrapped = (rows || []).map((row: any) => {
            if (row.data && typeof row.data === 'object' && !Array.isArray(row.data)) {
              // HYBRID tables (e.g. `ledger`) keep the real fields in FLAT columns
              // and only a PARTIAL blob in `data` (ledger.data is just {reqId}).
              // The old `{...row.data, id, company}` dropped every flat-only field
              // — so General Ledger showed blank date/narration/amounts and no
              // detail lines (details lives in the flat `details` column). Merge
              // flat columns FIRST, then overlay `data`, so flat-only fields
              // survive while the JSONB blob still wins for any field it owns.
              return { ...row, ...row.data, id: row.id, company: row.company };
            }
            return row;
          });
          setData(unwrapped as T[]);
          setTotal(count || 0);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Fetch failed');
          console.warn(`[useSupabasePage] ${table} error:`, err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, company, page, pageSize, orderBy, orderDesc, searchColumn, enabled, tick,
      // filters as stable string to avoid infinite loop
      JSON.stringify(filters), search]);

  return { data, total, loading, error, page, setPage, search, setSearch: handleSetSearch, refresh };
}
