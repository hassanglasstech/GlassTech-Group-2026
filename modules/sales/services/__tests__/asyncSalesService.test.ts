/**
 * asyncSalesService.test.ts — REAL tests for two God-mode P0s that live in
 * this service:
 *
 *   P0 #5 — company isolation: reads MUST be scoped to the active company,
 *           and the offline localStorage fallback must NOT leak another
 *           company's cached rows.  (getClients)
 *
 *   P0 #9 — payment-receipt atomicity routing: when a GL row is supplied the
 *           save routes through the atomic process_payment_receipt_v2 and
 *           reports glPosted=true (so the caller does NOT double-post); when
 *           v2 is unavailable or no GL row is given it uses the legacy RPC and
 *           reports glPosted=false.  (savePaymentReceipts)
 *
 * The ACTUAL AsyncSalesService runs; only its supabase, stores and logger are
 * stubbed. The supabase mock is the shared recording spy, so we can assert the
 * exact `.eq('company', …)` scoping and which RPC actually fired.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PaymentReceipt } from '@/modules/finance/types/finance';

// ── in-memory localStorage ──────────────────────────────────────────────
const _store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem:    (k: string) => _store[k] ?? null,
  setItem:    (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
  clear:      () => { Object.keys(_store).forEach(k => delete _store[k]); },
  get length() { return Object.keys(_store).length; },
  key:        (i: number) => Object.keys(_store)[i] ?? null,
});

// mutable "active company" the store mocks read (hoisted so the factories see it)
const appState = vi.hoisted(() => ({ company: 'Glassco' }));

vi.mock('@/src/services/supabaseClient', async () => {
  const m = await import('@/modules/shared/testing/supabaseSpy');
  return { supabase: m.supabaseMockClient };
});
vi.mock('@/modules/shared/store/appStore', () => ({
  useAppStore: { getState: () => ({ selectedCompany: appState.company }) },
}));
vi.mock('@/modules/auth/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      profile: { company: appState.company, email: 'tester@glasstech.pk' },
      user: { email: 'tester@glasstech.pk' },
    }),
  },
}));
vi.mock('@/src/services/SyncService', () => ({
  SyncService: { markDirty: vi.fn(), pushTable: vi.fn(), pushPending: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/modules/shared/services/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), action: vi.fn(), success: vi.fn() },
}));

import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import {
  createSupabaseSpy, installSupabaseSpy, type SupabaseSpy, type SbResult,
} from '@/modules/shared/testing/supabaseSpy';

const CLIENTS_KEY = 'gtk_erp_clients';

beforeEach(() => {
  Object.keys(_store).forEach(k => delete _store[k]);
  appState.company = 'Glassco';
});

// ═══════════════════════════════════════════════════════════════════════
// P0 #5 — company isolation on read
// ═══════════════════════════════════════════════════════════════════════
describe('AsyncSalesService.getClients — company isolation', () => {
  it('scopes the Supabase query to the active company (.eq company)', async () => {
    const spy = createSupabaseSpy({
      tableResults: { clients: { data: [{ id: 'c1', company: 'Glassco', name: 'Acme' }], error: null } },
    });
    installSupabaseSpy(spy);

    const clients = await AsyncSalesService.getClients();

    expect(spy.calls.eq).toContainEqual({ table: 'clients', col: 'company', val: 'Glassco' });
    expect(clients.every(c => c.company === 'Glassco')).toBe(true);
  });

  it('follows the company switcher (appStore.selectedCompany), not auth default', async () => {
    appState.company = 'Nippon';
    const spy = createSupabaseSpy({
      tableResults: { clients: { data: [{ id: 'n1', company: 'Nippon', name: 'KinLong' }], error: null } },
    });
    installSupabaseSpy(spy);

    await AsyncSalesService.getClients();

    expect(spy.calls.eq).toContainEqual({ table: 'clients', col: 'company', val: 'Nippon' });
    expect(spy.calls.eq).not.toContainEqual({ table: 'clients', col: 'company', val: 'Glassco' });
  });

  it('on Supabase error, the localStorage fallback excludes other companies', async () => {
    // shared cache holds rows from multiple companies (RLS pull is unfiltered)
    localStorage.setItem(CLIENTS_KEY, JSON.stringify([
      { id: 'c1', company: 'Glassco', name: 'Mine' },
      { id: 'c2', company: 'Nippon',  name: 'NotMine' },
      { id: 'c3',                     name: 'LocalOnly' }, // unstamped — kept
    ]));
    const spy = createSupabaseSpy({
      tableResults: { clients: { data: null, error: { message: 'network down' } } },
    });
    installSupabaseSpy(spy);

    const clients = await AsyncSalesService.getClients();

    const ids = clients.map(c => c.id).sort();
    expect(ids).toEqual(['c1', 'c3']);                 // Glassco + unstamped
    expect(clients.some(c => c.company === 'Nippon')).toBe(false);  // NO leak
  });

  it('switching company re-scopes the SAME mixed cache to the new company', async () => {
    localStorage.setItem(CLIENTS_KEY, JSON.stringify([
      { id: 'c1', company: 'Glassco', name: 'Mine' },
      { id: 'c2', company: 'Nippon',  name: 'Theirs' },
    ]));
    const err: SbResult = { data: null, error: { message: 'down' } };
    installSupabaseSpy(createSupabaseSpy({ tableResults: { clients: err } }));

    appState.company = 'Nippon';
    const clients = await AsyncSalesService.getClients();

    expect(clients.map(c => c.id)).toEqual(['c2']);    // only Nippon now
  });
});

// ═══════════════════════════════════════════════════════════════════════
// P0 #9 — payment-receipt atomicity routing
// ═══════════════════════════════════════════════════════════════════════
describe('AsyncSalesService.savePaymentReceipts — atomic GL routing', () => {
  const receipt = (): PaymentReceipt[] => ([{
    id: 'r1', invoiceId: 'inv1', date: '2026-07-12', amount: 1000,
    method: 'Cash', reference: 'RCPT-1', glTxId: 'g1',
  } as unknown as PaymentReceipt]);

  const rpcNames = (spy: SupabaseSpy): string[] => spy.calls.rpc.map(c => c.name);

  it('with a GL row + v2 available → routes through process_payment_receipt_v2, glPosted=true', async () => {
    const spy = createSupabaseSpy({
      rpcResults: { process_payment_receipt_v2: { data: { ok: true }, error: null } },
    });
    installSupabaseSpy(spy);

    const res = await AsyncSalesService.savePaymentReceipts(receipt(), { debit_account_id: '1111', amount: 1000 });

    expect(res).toEqual({ glPosted: true });
    expect(rpcNames(spy)).toContain('process_payment_receipt_v2');
    expect(rpcNames(spy)).not.toContain('process_payment_receipt'); // no double-post via legacy
  });

  it('with a GL row but v2 NOT applied → falls back to legacy RPC, glPosted=false', async () => {
    const spy = createSupabaseSpy({
      rpcResults: {
        process_payment_receipt_v2: { data: null, error: { message: 'function does not exist' } },
        process_payment_receipt:    { data: { ok: true }, error: null },
      },
    });
    installSupabaseSpy(spy);

    const res = await AsyncSalesService.savePaymentReceipts(receipt(), { debit_account_id: '1111' });

    expect(res).toEqual({ glPosted: false });          // caller must post GL app-side
    expect(rpcNames(spy)).toEqual(['process_payment_receipt_v2', 'process_payment_receipt']);
  });

  it('without a GL row → never calls v2, uses legacy RPC, glPosted=false', async () => {
    const spy = createSupabaseSpy({
      rpcResults: { process_payment_receipt: { data: { ok: true }, error: null } },
    });
    installSupabaseSpy(spy);

    const res = await AsyncSalesService.savePaymentReceipts(receipt());

    expect(res).toEqual({ glPosted: false });
    expect(rpcNames(spy)).toEqual(['process_payment_receipt']);
  });
});
