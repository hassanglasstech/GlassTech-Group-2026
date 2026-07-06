/**
 * useDispatchTrips.ts — One-Window Dispatch cockpit (Phase 1)
 *
 * Read-only hook. Loads the same cached two-tier TemperingDispatch data the
 * rest of the app already uses (no new Supabase call, no writes), filters by
 * company (CHANGE 4 — the audit found the legacy logistics read was
 * unfiltered), groups rows into trips, and buckets each trip into one of the
 * six lifecycle columns via the pure deriveDispatchColumn resolver.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Company, TemperingDispatch } from '@/modules/shared/types';
import { ProductionService } from '@/modules/production/services/productionService';
import { DispatchService, type DispatchEventType } from '@/modules/procurement/services/dispatchService';
import {
  DISPATCH_COLUMNS,
  type DispatchColumn,
  deriveDispatchColumn,
  deriveTripColumn,
  signalsFromDispatch,
} from '@/modules/dispatch/services/deriveDispatchColumn';

export interface DispatchTripVM {
  key: string;
  tripId?: string;
  dispatchIds: string[];
  column: DispatchColumn;
  conflict: boolean;
  conflictReason?: string;
  vehicleNo: string;
  driverName: string;
  plantName: string;
  serviceType: string;
  pieceCount: number;
  totalSqFt: number;
  date: string;
}

export interface UseDispatchTripsResult {
  columns: Record<DispatchColumn, DispatchTripVM[]>;
  counts: Record<DispatchColumn, number>;
  conflictCount: number;
  total: number;
  loading: boolean;
  refresh: () => void;
}

function emptyColumns(): Record<DispatchColumn, DispatchTripVM[]> {
  return DISPATCH_COLUMNS.reduce((acc, c) => {
    acc[c] = [];
    return acc;
  }, {} as Record<DispatchColumn, DispatchTripVM[]>);
}

export function useDispatchTrips(company: Company): UseDispatchTripsResult {
  const [columns, setColumns] = useState<Record<DispatchColumn, DispatchTripVM[]>>(emptyColumns);
  const [loading, setLoading] = useState<boolean>(true);

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const all: TemperingDispatch[] = ProductionService.getTemperingDispatches()
        .filter(d => d.company === company);

      // Fuse the append-only dispatch_events log (best-effort): the cockpit now
      // reflects GATE_OUT / IN_TRANSIT / RECEIVING / INVOICE_RECORDED — the truth
      // stream the Logistics gate flow records — not just the optimistic row
      // status. Offline / failure → status-only (prior behaviour).
      const latestByDispatch = new Map<string, DispatchEventType>();
      try {
        const { data: events } = await DispatchService.getRecentEvents(company, 500);
        for (const ev of events ?? []) {
          // getRecentEvents is newest-first, so the first seen per dispatch is latest
          if (!latestByDispatch.has(ev.dispatch_id)) latestByDispatch.set(ev.dispatch_id, ev.event_type);
        }
      } catch { /* best-effort — fall back to status-only */ }
      if (!active) return;

      // Group by trip; a dispatch with no tripId is its own single-leg trip.
      const groups = new Map<string, TemperingDispatch[]>();
      for (const d of all) {
        const key = d.tripId && d.tripId.trim() ? d.tripId : d.id;
        const arr = groups.get(key);
        if (arr) arr.push(d);
        else groups.set(key, [d]);
      }

      const next = emptyColumns();
      for (const [key, legs] of groups) {
        const results = legs.map(l =>
          deriveDispatchColumn({ ...signalsFromDispatch(l), latestEvent: latestByDispatch.get(l.id) }));
        const { column, conflict, conflictReason } = deriveTripColumn(results);
        const head = legs[0];
        next[column].push({
          key,
          tripId: head.tripId,
          dispatchIds: legs.map(l => l.id),
          column,
          conflict,
          conflictReason,
          vehicleNo: head.vehicleNo || '—',
          driverName: head.driverName || '—',
          plantName: head.plantName || head.originLocation || '—',
          serviceType: head.serviceType,
          pieceCount: legs.reduce((n, l) => n + (Array.isArray(l.pieceIds) ? l.pieceIds.length : 0), 0),
          totalSqFt: legs.reduce((n, l) => n + (Number(l.totalSqFt) || 0), 0),
          date: head.date || '',
        });
      }

      for (const c of DISPATCH_COLUMNS) {
        next[c].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      }
      if (!active) return;
      setColumns(next);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [company, refreshKey]);

  const { counts, total, conflictCount } = useMemo(() => {
    const counts = DISPATCH_COLUMNS.reduce((acc, c) => {
      acc[c] = columns[c].length;
      return acc;
    }, {} as Record<DispatchColumn, number>);
    const total = DISPATCH_COLUMNS.reduce((n, c) => n + columns[c].length, 0);
    const conflictCount = DISPATCH_COLUMNS.reduce(
      (n, c) => n + columns[c].filter(v => v.conflict).length, 0,
    );
    return { counts, total, conflictCount };
  }, [columns]);

  return { columns, counts, conflictCount, total, loading, refresh };
}
