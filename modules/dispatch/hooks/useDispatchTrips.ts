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

  const refresh = useCallback(() => {
    setLoading(true);
    try {
      const all: TemperingDispatch[] = ProductionService.getTemperingDispatches()
        .filter(d => d.company === company);

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
        const results = legs.map(l => deriveDispatchColumn(signalsFromDispatch(l)));
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
      setColumns(next);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => { refresh(); }, [refresh]);

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
