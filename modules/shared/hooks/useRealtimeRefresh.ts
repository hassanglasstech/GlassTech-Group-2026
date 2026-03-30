/**
 * useRealtimeRefresh — React hook for Supabase Realtime auto-refresh
 *
 * Kaise use karein:
 *   const { refreshKey } = useRealtimeRefresh(['employees', 'attendance']);
 *   // refreshKey change hone pe component automatically re-render hoga
 *
 * Ya sirf ek table ke liye:
 *   const { refreshKey } = useRealtimeRefresh('quotations');
 *
 * Phir is refreshKey ko useEffect dependency mein daalein:
 *   useEffect(() => { loadData(); }, [refreshKey]);
 */

import { useState, useEffect, useCallback } from 'react';

type TableName = string;

export const useRealtimeRefresh = (tables: TableName | TableName[]) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastTable, setLastTable] = useState<string>('');
  const [lastEventType, setLastEventType] = useState<string>('');

  const watchTables = Array.isArray(tables) ? tables : [tables];

  useEffect(() => {
    const handler = (e: Event) => {
      const event = e as CustomEvent<{ table: string; localKey: string; eventType: string }>;
      const { table, eventType } = event.detail;

      // Only trigger for tables we care about
      // If watchTables is empty or has '*', refresh for any table
      if (
        watchTables.length === 0 ||
        watchTables.includes('*') ||
        watchTables.includes(table)
      ) {
        setRefreshKey(k => k + 1);
        setLastTable(table);
        setLastEventType(eventType);
      }
    };

    window.addEventListener('gtk_realtime_update', handler);
    return () => window.removeEventListener('gtk_realtime_update', handler);
  }, [watchTables.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const forceRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return {
    /** Changes when a watched table receives a Realtime update */
    refreshKey,
    /** Which table just triggered the refresh */
    lastTable,
    /** INSERT / UPDATE / DELETE */
    lastEventType,
    /** Manually trigger a refresh */
    forceRefresh,
  };
};

/**
 * Convenience: subscribe to ALL tables
 * Use when you don't know which table will change
 */
export const useRealtimeRefreshAll = () => useRealtimeRefresh('*');
