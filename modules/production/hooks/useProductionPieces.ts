/**
 * useProductionPieces — Sprint 3 / Day 17-18
 *
 * Postgres-primary read for the piece state machine. Pairs with realtime
 * (Sprint 2) so the cutter / QC / dispatcher see each other's state
 * changes within ~1s.
 *
 * Pieces are version-tracked for safe concurrent updates — use the
 * mutation hook below instead of direct ProductionService.savePieces.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/modules/shared/store/appStore';
import { ProductionService } from '../services/productionService';
import { qk } from '@/src/services/queryClient';
import { updateWithVersion } from '@/modules/shared/services/versionedUpdate';
import type { ProductionPiece } from '../types/production';

export function useProductionPieces() {
  const company = useAppStore(s => s.selectedCompany);
  return useQuery({
    queryKey: qk.productionPieces(company),
    queryFn: async () => {
      // ProductionService.getProductionPiecesAsync(company) reads from
      // Supabase first, falls back to localStorage.
      const all = await ProductionService.getProductionPiecesAsync(company);
      return all as ProductionPiece[];
    },
    // Floor needs near-live updates — short staleTime + realtime invalidation
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect:   true,
  });
}

/**
 * Optimistic-concurrency piece status update. Throws version_conflict
 * when another user beat us to it.
 */
export function useUpdateProductionPiece() {
  const qc = useQueryClient();
  const company = useAppStore(s => s.selectedCompany);
  return useMutation({
    mutationFn: async (params: {
      id: string;
      patch: Partial<ProductionPiece>;
      expectedVersion: number;
    }) => {
      const { id, patch, expectedVersion } = params;
      const result = await updateWithVersion(
        'production_pieces', id, patch as Record<string, unknown>, expectedVersion
      );
      if (result.error === 'version_conflict') throw new Error('version_conflict');
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.productionPieces(company) });
    },
  });
}
