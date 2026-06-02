/**
 * useDraftAutoSave — Sprint 21
 *
 * Auto-saves form data to localStorage every N ms while the user is
 * editing. On reload, the parent component can call `restoreDraft(key)`
 * to pre-populate state from the last save.
 *
 * Designed for "Tab close mid-form" recovery — not a substitute for
 * proper server-side draft persistence.
 *
 * Usage:
 *   const { saveNow, hasDraft, clearDraft, lastSavedAt } =
 *     useDraftAutoSave('quotation:new', formState, { intervalMs: 10_000 });
 *
 *   // On mount, parent decides whether to restore:
 *   const draft = restoreDraft<FormState>('quotation:new');
 *   if (draft) { setFormState(draft); }
 *
 *   // After successful submit:
 *   clearDraft();
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'gtk_draft:';

interface DraftMeta {
  savedAt: string;
}

interface DraftEnvelope<T> {
  data: T;
  meta: DraftMeta;
}

interface UseDraftAutoSaveOptions {
  /** Interval between saves while the data is "dirty". Default 10 000 ms. */
  intervalMs?: number;
  /** Skip saving when data is null/undefined. Default true. */
  skipEmpty?: boolean;
  /** Disable autosave entirely (e.g., when form is read-only). Default false. */
  disabled?: boolean;
}

export interface DraftAutoSaveAPI {
  /** Force-save right now (ignores debounce). */
  saveNow:      () => void;
  /** Check whether a draft exists in localStorage for the key. */
  hasDraft:     boolean;
  /** Drop the persisted draft (call after successful server submit). */
  clearDraft:   () => void;
  /** ISO of last successful save in this session, or null. */
  lastSavedAt:  string | null;
}

// ── Static helpers (callable from anywhere — restore on mount, etc.) ──

export function restoreDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as DraftEnvelope<T>;
    return env.data ?? null;
  } catch { return null; }
}

export function getDraftMeta(key: string): DraftMeta | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as DraftEnvelope<unknown>;
    return env.meta ?? null;
  } catch { return null; }
}

export function clearDraftFor(key: string): void {
  try { localStorage.removeItem(PREFIX + key); } catch { /* noop */ }
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useDraftAutoSave<T>(
  key:   string,
  data:  T,
  opts:  UseDraftAutoSaveOptions = {},
): DraftAutoSaveAPI {
  const { intervalMs = 10_000, skipEmpty = true, disabled = false } = opts;

  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasDraft,    setHasDraft]    = useState<boolean>(false);
  const lastSerialRef                 = useRef<string | null>(null);
  const timerRef                      = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial check: does a draft exist?
  useEffect(() => {
    setHasDraft(!!localStorage.getItem(PREFIX + key));
  }, [key]);

  const persist = useCallback(() => {
    if (disabled) return;
    if (skipEmpty && (data == null || data === '')) return;
    let serial: string;
    try { serial = JSON.stringify(data); } catch { return; }
    if (serial === lastSerialRef.current) return;       // unchanged — skip

    const env: DraftEnvelope<T> = {
      data,
      meta: { savedAt: new Date().toISOString() },
    };
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(env));
      lastSerialRef.current = serial;
      setLastSavedAt(env.meta.savedAt);
      setHasDraft(true);
    } catch { /* quota / disabled — silent */ }
  }, [key, data, disabled, skipEmpty]);

  // Set up interval timer
  useEffect(() => {
    if (disabled) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(persist, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [persist, intervalMs, disabled]);

  // Save once on unmount / tab-hide so we don't lose the last 10s
  useEffect(() => {
    const onHide = () => persist();
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      onHide();
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [persist]);

  const clearDraft = useCallback(() => {
    clearDraftFor(key);
    lastSerialRef.current = null;
    setHasDraft(false);
    setLastSavedAt(null);
  }, [key]);

  return { saveNow: persist, hasDraft, clearDraft, lastSavedAt };
}
