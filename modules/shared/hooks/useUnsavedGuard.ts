/**
 * useUnsavedGuard — register an editor's dirty state with the global nav guard.
 *
 * While `dirty` is true, clicking any in-app navigation link prompts the user to
 * confirm before leaving (see unsavedGuard.ts). Clears automatically on unmount
 * or when the editor becomes clean.
 *
 * Usage: useUnsavedGuard(isDirty);   // optionally a custom message
 */

import { useEffect } from 'react';
import { setUnsavedDirty, clearUnsavedDirty, installUnsavedGuard } from '@/modules/shared/services/unsavedGuard';

export function useUnsavedGuard(dirty: boolean, message?: string): void {
  // Install the global click interceptor once (idempotent; the passive listener
  // stays put — it no-ops whenever nothing is dirty).
  useEffect(() => { installUnsavedGuard(); }, []);
  useEffect(() => {
    setUnsavedDirty(dirty, message);
    return () => clearUnsavedDirty();
  }, [dirty, message]);
}
