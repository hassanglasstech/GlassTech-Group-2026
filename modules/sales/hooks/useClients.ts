/**
 * useClients — Sprint 3 / Day 10-11
 *
 * Postgres-primary reads via TanStack Query. localStorage demoted to
 * offline cache (handled inside AsyncSalesService.getClients).
 *
 * Replaces the pattern:
 *   const [clients, setClients] = useState([]);
 *   useEffect(() => { setClients(SalesService.getClients()); }, [refreshKey]);
 *
 * with:
 *   const { data: clients = [], isLoading } = useClients();
 *
 * Realtime invalidation is handled centrally by realtimeQueryBridge.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/modules/shared/store/appStore';
import { AsyncSalesService } from '../services/asyncSalesService';
import { qk } from '@/src/services/queryClient';
import { updateWithVersion } from '@/modules/shared/services/versionedUpdate';
import type { Client } from '../types/crm';

/** Read all clients for the active company. */
export function useClients() {
  const company = useAppStore(s => s.selectedCompany);
  return useQuery({
    queryKey: qk.clients(company),
    queryFn:  async () => {
      const all = await AsyncSalesService.getClients();
      return all.filter(c => c.company === company);
    },
    staleTime: 60_000, // clients are read-heavy, low mutation
  });
}

/**
 * Bulk save (legacy path). Use updateClient for single-row optimistic
 * concurrency. Kept for backward compatibility with bulk import flows.
 */
export function useSaveClients() {
  const qc = useQueryClient();
  const company = useAppStore(s => s.selectedCompany);
  return useMutation({
    mutationFn: async (clients: Client[]) => {
      await AsyncSalesService.saveClients(clients);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.clients(company) });
    },
  });
}

/**
 * Optimistic-concurrency single-row update.
 * Throws `version_conflict` on stale write — caller should show reload modal.
 */
export function useUpdateClient() {
  const qc = useQueryClient();
  const company = useAppStore(s => s.selectedCompany);
  return useMutation({
    mutationFn: async (params: {
      id: string;
      patch: Partial<Client>;
      expectedVersion: number;
    }) => {
      const { id, patch, expectedVersion } = params;
      const result = await updateWithVersion('clients', id, patch as Record<string, unknown>, expectedVersion);
      if (result.error === 'version_conflict') {
        throw new Error('version_conflict');
      }
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.clients(company) });
    },
  });
}
