import { useState, useEffect } from 'react';
import { getNetworkStatus } from '../services/networkService';

export interface NetworkStatus {
  isOnline: boolean;
  /** Writes buffered offline, waiting to push to Supabase. */
  queuedWrites: number;
}

/**
 * Reactive online/offline + offline-queue depth.
 *
 * The app is offline-first (localStorage/IDB → Supabase) but no UI ever read
 * `getNetworkStatus()` — sync state surfaced only as transient toasts. This
 * hook lets any surface show a standing indicator. Updates on the browser
 * online/offline events and polls the queue depth (which changes without an
 * event) on a light interval.
 */
export const useNetworkStatus = (pollMs = 4000): NetworkStatus => {
  const read = (): NetworkStatus => {
    const s = getNetworkStatus();
    return { isOnline: s.isOnline, queuedWrites: s.queuedWrites };
  };
  const [status, setStatus] = useState<NetworkStatus>(read);

  useEffect(() => {
    const refresh = () => setStatus(read());
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    const id = window.setInterval(refresh, pollMs);
    refresh();
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.clearInterval(id);
    };
  }, [pollMs]);

  return status;
};
