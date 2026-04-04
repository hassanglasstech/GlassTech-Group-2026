/**
 * useSupabaseData.ts — React hook for Supabase-primary data
 *
 * Replaces the pattern of:
 *   const [data, setData] = useState(safeParse('gtk_erp_clients'))
 *
 * With:
 *   const { data, loading, refresh } = useSupabaseData('gtk_erp_clients', [])
 *
 * On first render: returns localStorage cache immediately (instant UI)
 * Then: fetches fresh data from Supabase and updates state
 */

import { useState, useEffect, useCallback } from 'react';
import { safeParse, safeFetch } from '../services/utils';

export function useSupabaseData<T>(
  localKey: string,
  defaultValue: T[] = [],
  options: { autoRefresh?: boolean } = {}
): {
  data: T[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (newData: T[]) => void;
} {
  const [data, setData] = useState<T[]>(() => {
    const cached = safeParse(localKey);
    return Array.isArray(cached) && cached.length > 0 ? cached : defaultValue;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await safeFetch(localKey);
      if (Array.isArray(fresh)) {
        setData(fresh as T[]);
      }
    } catch (err: any) {
      setError(err.message);
      // Keep showing cached data
    } finally {
      setLoading(false);
    }
  }, [localKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback((newData: T[]) => {
    setData(newData);
    // safeSave handles both localStorage cache + Supabase push
    import('../services/utils').then(({ safeSave }) => safeSave(localKey, newData));
  }, [localKey]);

  return { data, loading, error, refresh, save };
}

/**
 * Prefetch critical tables on app start.
 * Call this once in your App.tsx or main layout.
 *
 * Usage:
 *   import { prefetchCriticalTables } from '@/modules/shared/hooks/useSupabaseData';
 *   // in App.tsx useEffect:
 *   prefetchCriticalTables();
 */
export const CRITICAL_TABLES = [
  'gtk_erp_employees',
  'gtk_erp_clients',
  'gtk_erp_vendors',
  'gtk_erp_products',
  'gtk_erp_ledger',
  'gtk_erp_accounts',
  'gtk_erp_requisitions',
  'gtk_erp_stock_ledger',
  'gtk_erp_quotations',
  'gtk_erp_invoices',
];

export const prefetchCriticalTables = async (): Promise<void> => {
  const { prefetchToCache } = await import('../services/utils');
  await prefetchToCache(CRITICAL_TABLES);
};
