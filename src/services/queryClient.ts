/**
 * queryClient.ts — Sprint 3 Postgres-primary read path
 *
 * Single TanStack Query (React Query v5) instance shared by the whole app.
 * Replaces the old "useEffect → SalesService.getX() from localStorage" pattern.
 *
 * Behaviour summary:
 *   - Source of truth: Supabase. localStorage demoted to offline cache.
 *   - On read: try Postgres → on error, fall back to localStorage.
 *   - On reconnect / window focus: auto-refetch.
 *   - On RealtimeService event: queries are invalidated (see realtimeQueryBridge).
 *
 * Stale time defaults to 30s so background refetches don't hammer the DB
 * during normal interaction. Tweak per-hook with `staleTime: 0` for
 * always-fresh data (e.g. live cutting board).
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:               30_000,   // 30s — covers most user flows
      gcTime:                  5 * 60_000, // 5 min cache retention after unmount
      refetchOnWindowFocus:    true,
      refetchOnReconnect:      true,
      refetchOnMount:          'always',
      retry:                   1,        // single retry is enough; on real failures fall back to localStorage
      retryDelay:              500,
    },
    mutations: {
      retry: 0, // mutations should never auto-retry — version_conflict needs explicit user action
    },
  },
});

/**
 * Centralised query keys — keeps invalidation precise + typo-proof.
 * Pattern: [domain, scope, ...filters]
 */
export const qk = {
  // Sales
  clients:           (company: string) => ['clients', company] as const,
  client:            (id: string)      => ['client', id] as const,
  invoices:          (company: string) => ['invoices', company] as const,
  invoice:           (id: string)      => ['invoice', id] as const,
  quotations:        (company: string) => ['quotations', company] as const,
  quotation:         (id: string)      => ['quotation', id] as const,
  paymentReceipts:   (company: string) => ['payment_receipts', company] as const,
  // Production
  productionPieces:  (company: string) => ['production_pieces', company] as const,
  productionPiece:   (id: string)      => ['production_piece', id] as const,
  // Procurement
  storeItems:        (company: string) => ['store_items', company] as const,
  cuttingSessions:   (company: string) => ['cutting_sessions', company] as const,
} as const;

/**
 * Map Supabase realtime table names → query keys to invalidate.
 * Used by realtimeQueryBridge so a single postgres_change event
 * refreshes every dependent hook in the app.
 */
export const tableToQueryKeys = (
  table: string,
  company: string,
): readonly (readonly unknown[])[] => {
  switch (table) {
    case 'clients':           return [qk.clients(company)];
    case 'invoices':          return [qk.invoices(company)];
    case 'quotations':        return [qk.quotations(company)];
    case 'payment_receipts':  return [qk.paymentReceipts(company)];
    case 'production_pieces': return [qk.productionPieces(company)];
    case 'store_items':       return [qk.storeItems(company)];
    case 'cutting_sessions':  return [qk.cuttingSessions(company)];
    default:                  return [];
  }
};
