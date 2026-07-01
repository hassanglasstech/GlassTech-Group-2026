import React from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

/**
 * Standing online / offline / syncing indicator for offline-first surfaces.
 * Uses the brand design tokens (rounded-control, primary-*) defined in
 * index.html / index.css.
 */
export const NetworkStatusBadge: React.FC = () => {
  const { isOnline, queuedWrites } = useNetworkStatus();

  if (!isOnline) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-control text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
        title="Offline — changes are saved locally and will sync automatically when you reconnect"
      >
        <WifiOff size={12} /> Offline
        {queuedWrites > 0 && <span className="ml-0.5">· {queuedWrites} pending</span>}
      </span>
    );
  }

  if (queuedWrites > 0) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-control text-[11px] font-semibold bg-primary-subtle text-primary border border-primary-border"
        title={`${queuedWrites} change(s) syncing to the cloud`}
      >
        <RefreshCw size={12} className="animate-spin" /> {queuedWrites} syncing
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-control text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
      title="Online — all changes synced to the cloud"
    >
      <Wifi size={12} /> Synced
    </span>
  );
};

export default NetworkStatusBadge;
