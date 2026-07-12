/**
 * SyncService.pushTable.test.ts — REAL regression net for God-mode P0 #1:
 * "a FAILED Supabase push must NOT be reported as success."
 *
 * Before the fix, all three error classes (schema-mismatch, FK, auth/RLS)
 * `return`ed from inside the retry callback, which resolved the promise
 * SUCCESSFULLY → pushTable returned true → the pending flag was cleared →
 * the write survived only in localStorage until the next authoritative pull
 * wiped it. Silent data loss behind a green "synced ✓" toast.
 *
 * These tests drive the REAL SyncService.pushPending() (the public contract
 * the app calls) with a mocked supabase that returns each error class, and
 * assert the observable behavior:
 *   - a failing push is counted as `failed`, NOT `pushed`
 *   - the change STAYS in the pending queue (localStorage) → it will retry
 *   - auth failures (401/403/42501) emit 'erp:session-invalid' so the app
 *     can force a re-login instead of dropping the write
 *   - a subsequent successful push DOES flush the pending queue (recovery)
 *
 * No production symbol is re-implemented here — the actual module under
 * src/services runs, only its I/O boundaries (supabase, network retry,
 * toast) are stubbed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── in-memory localStorage (fully controlled, deterministic) ────────────
const _store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem:    (k: string) => _store[k] ?? null,
  setItem:    (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
  clear:      () => { Object.keys(_store).forEach(k => delete _store[k]); },
  get length() { return Object.keys(_store).length; },
  key:        (i: number) => Object.keys(_store)[i] ?? null,
});

// ── supabase mock: upsert resolves to { error } where error is per-test ──
// vi.hoisted so the spies exist before vi.mock's hoisted factory runs.
const mocks = vi.hoisted(() => {
  const state = { error: null as unknown };
  const upsertSpy = vi.fn(() => Promise.resolve({ error: state.error }));
  const fromSpy = vi.fn(() => ({ upsert: upsertSpy }));
  return { state, upsertSpy, fromSpy };
});
vi.mock('@/src/services/supabaseClient', () => ({
  supabase: { from: mocks.fromSpy },
}));

// ── network layer: faithful retry-on-throw, but WITHOUT real delays ──────
// Mirrors withRetry's contract (retry maxRetries times on throw, then rethrow)
// so pushTable's throw→retry→outer-catch path is genuinely exercised, fast.
vi.mock('@/modules/shared/services/networkService', () => ({
  translateError: (e: { message?: string }) => e?.message ?? String(e),
  OfflineQueue: class {},
  withRetry: async (fn: () => Promise<unknown>, opts?: { maxRetries?: number }) => {
    const max = opts?.maxRetries ?? 0;
    let last: unknown;
    for (let i = 0; i <= max; i++) {
      try { return await fn(); } catch (e) { last = e; }
    }
    throw last;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/modules/shared/services/supabaseDB', () => ({
  flushOfflineQueue: vi.fn(() => Promise.resolve()),
  getDBStatus: vi.fn(() => ({})),
}));
vi.mock('@/modules/shared/services/utils', () => ({ safeFetch: vi.fn() }));
// Neutralise soft-delete tombstone logic — not under test here.
vi.mock('@/modules/shared/config/softDelete', () => ({
  SOFT_DELETE_ENABLED: false,
  SOFT_DELETE_TABLES: new Set<string>(),
}));

import { SyncService } from '@/src/services/SyncService';

const PENDING_KEY = 'gtk_erp_pending_sync';
const Q_KEY = 'gtk_erp_quotations';               // TABLE_MAP['quotations']

const seedOneQuotationPending = (): void => {
  localStorage.setItem(Q_KEY, JSON.stringify([{ id: 'q1', company: 'Glassco', status: 'Sent' }]));
  localStorage.setItem(PENDING_KEY, JSON.stringify([
    { table: 'quotations', localKey: Q_KEY, changedAt: new Date().toISOString() },
  ]));
};
const readPending = (): Array<{ table: string }> =>
  JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');

/** Capture whether the session-invalid event fired during `run`. */
const captureSessionInvalid = async (run: () => Promise<unknown>): Promise<boolean> => {
  let fired = false;
  const handler = (): void => { fired = true; };
  window.addEventListener('erp:session-invalid', handler);
  try { await run(); } finally { window.removeEventListener('erp:session-invalid', handler); }
  return fired;
};

beforeEach(() => {
  Object.keys(_store).forEach(k => delete _store[k]);
  mocks.state.error = null;
  mocks.upsertSpy.mockClear();
  mocks.fromSpy.mockClear();
});

describe('SyncService.pushPending — success path (control)', () => {
  it('clears the pending queue only when the upsert actually succeeds', async () => {
    seedOneQuotationPending();
    mocks.state.error = null;

    const res = await SyncService.pushPending();

    expect(res).toEqual({ pushed: 1, failed: 0 });
    expect(mocks.upsertSpy).toHaveBeenCalledTimes(1);
    expect(readPending()).toHaveLength(0);            // flushed
  });
});

describe('SyncService.pushPending — failed push KEEPS the change pending', () => {
  it('schema mismatch (PGRST204): failed, not pushed, still pending', async () => {
    seedOneQuotationPending();
    mocks.state.error = { code: 'PGRST204', message: 'column "foo" does not exist' };

    const res = await SyncService.pushPending();

    expect(res).toEqual({ pushed: 0, failed: 1 });
    expect(readPending()).toHaveLength(1);            // NOT dropped
    expect(readPending()[0].table).toBe('quotations');
  });

  it('foreign-key violation (23503): failed, still pending, no session event', async () => {
    seedOneQuotationPending();
    mocks.state.error = { code: '23503', message: 'insert violates foreign key constraint' };

    const fired = await captureSessionInvalid(async () => {
      const res = await SyncService.pushPending();
      expect(res).toEqual({ pushed: 0, failed: 1 });
    });

    expect(readPending()).toHaveLength(1);
    expect(fired).toBe(false);                        // FK is not an auth problem
  });

  it('auth 401: failed, still pending, emits erp:session-invalid', async () => {
    seedOneQuotationPending();
    mocks.state.error = { status: 401, message: 'JWT expired' };

    const fired = await captureSessionInvalid(async () => {
      const res = await SyncService.pushPending();
      expect(res).toEqual({ pushed: 0, failed: 1 });
    });

    expect(readPending()).toHaveLength(1);
    expect(fired).toBe(true);
  });

  it('RLS 42501: failed, still pending, emits erp:session-invalid', async () => {
    seedOneQuotationPending();
    mocks.state.error = { code: '42501', message: 'new row violates row-level security policy' };

    const fired = await captureSessionInvalid(async () => {
      const res = await SyncService.pushPending();
      expect(res).toEqual({ pushed: 0, failed: 1 });
    });

    expect(readPending()).toHaveLength(1);
    expect(fired).toBe(true);
  });
});

describe('SyncService.pushPending — recovery flushes the retained change', () => {
  it('a change kept pending on failure IS pushed once the error clears', async () => {
    seedOneQuotationPending();

    // 1st attempt fails (RLS) → stays pending
    mocks.state.error = { code: '42501', message: 'rls' };
    const first = await SyncService.pushPending();
    expect(first).toEqual({ pushed: 0, failed: 1 });
    expect(readPending()).toHaveLength(1);

    // 2nd attempt succeeds → queue drains
    mocks.state.error = null;
    const second = await SyncService.pushPending();
    expect(second).toEqual({ pushed: 1, failed: 0 });
    expect(readPending()).toHaveLength(0);
  });
});
