/**
 * realtimeQueryBridge.ts — Sprint 3
 *
 * Listens to the `gtk_realtime_update` window event (dispatched by
 * RealtimeService whenever a Supabase postgres_change lands) and
 * invalidates the matching TanStack queries so dependent hooks refetch.
 *
 * Without this bridge, useClients() / useInvoices() / etc. would only
 * see remote changes after the next staleTime tick. With it, User A's
 * commit reaches User B's UI within ~1 second.
 *
 * Single instance — call `startRealtimeQueryBridge()` once at app boot
 * (App.tsx after RealtimeService.start). Idempotent.
 */

import { queryClient, tableToQueryKeys } from './queryClient';
import { useAppStore } from '../../modules/shared/store/appStore';

let started = false;

export function startRealtimeQueryBridge(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  window.addEventListener('gtk_realtime_update', (e: Event) => {
    const ev = e as CustomEvent<{ table: string; eventType: string }>;
    const table = ev.detail?.table;
    if (!table) return;

    // Use the currently selected company for invalidation key shape.
    // RealtimeService events are not company-scoped (yet — Sprint 27),
    // but the queryKey IS — invalidating the active company's cache is
    // the only thing the visible UI needs to refresh.
    const company = useAppStore.getState().selectedCompany;
    const keys = tableToQueryKeys(table, company);

    keys.forEach(key => {
      queryClient.invalidateQueries({ queryKey: key });
    });
  });
}

export function stopRealtimeQueryBridge(): void {
  // Bridge intentionally never tears down — listener is cheap and
  // RealtimeService.stop() / start() cycles around it.
  started = false;
}
