/**
 * useQuotations — Sprint 3 / Day 14-16
 *
 * High-mutation table — pairs with Sprint 2 version field. Edits go
 * through `update_with_version` RPC (via updateWithVersion helper), so
 * concurrent edits surface `version_conflict` instead of last-write-wins.
 *
 * Mutation usage:
 *   const updateQuote = useUpdateQuotation();
 *   try {
 *     await updateQuote.mutateAsync({
 *       id, patch: { status: 'Approved' }, expectedVersion: quote.version || 1,
 *     });
 *   } catch (e) {
 *     if (String(e).includes('version_conflict')) showReloadModal();
 *   }
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/modules/shared/store/appStore';
import { AsyncSalesService } from '../services/asyncSalesService';
import { qk } from '@/src/services/queryClient';
import { updateWithVersion } from '@/modules/shared/services/versionedUpdate';
import type { Quotation } from '@/modules/shared/types';

export function useQuotations() {
  const company = useAppStore(s => s.selectedCompany);
  return useQuery({
    queryKey: qk.quotations(company),
    queryFn: async () => {
      const all = await AsyncSalesService.getQuotations();
      return all.filter((q: Quotation) => q.company === company);
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

/** Bulk save (for new quotations or batch import). */
export function useSaveQuotations() {
  const qc = useQueryClient();
  const company = useAppStore(s => s.selectedCompany);
  return useMutation({
    mutationFn: async (data: Quotation[]) => {
      await AsyncSalesService.saveQuotations(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.quotations(company) });
    },
  });
}

/**
 * Optimistic-concurrency single-row update.
 * Throws Error('version_conflict') on stale write.
 */
export function useUpdateQuotation() {
  const qc = useQueryClient();
  const company = useAppStore(s => s.selectedCompany);
  return useMutation({
    mutationFn: async (params: {
      id: string;
      patch: Partial<Quotation>;
      expectedVersion: number;
    }) => {
      const { id, patch, expectedVersion } = params;
      const result = await updateWithVersion(
        'quotations', id, patch as Record<string, unknown>, expectedVersion
      );
      if (result.error === 'version_conflict') throw new Error('version_conflict');
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.quotations(company) });
    },
  });
}
