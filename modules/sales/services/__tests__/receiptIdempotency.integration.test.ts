/**
 * receiptIdempotency.integration.test.ts — REGRESSION for the re-grade's #1
 * confirmed money bug: process_payment_receipt_v2 double-counted a partial
 * receipt when the SAME receipt id was submitted twice (retry / double-click).
 *
 * Root cause: the receipt row upsert was idempotent (ON CONFLICT id DO UPDATE)
 * but `invoices.received_amount = received_amount + amount` ran unconditionally,
 * and the over-pay guard only tripped on a FULL-payment retry. Fix: recompute
 * received_amount as SUM(payment_receipts) after the upsert (idempotent by
 * construction) + skip the GL insert when that GL id is already posted.
 *
 * Run against a LOCAL Supabase (Docker). Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient, clientForToken, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { wipeCompany, seedQuotation, makeUser, TEST_COMPANY, type TestUser } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping receiptIdempotency. Run `npm run supabase:start`.');
}

const invoiceGl = (id: string, amount: number): Record<string, unknown> => ({
  id, company: TEST_COMPANY, doc_type: 'INV', doc_date: '2026-07-12', date: '2026-07-12',
  description: 'AR / Revenue', reference_id: 'IDEMP', status: 'Posted',
  details: [{ account_id: '12210', debit: amount, credit: 0 }, { account_id: '4120', debit: 0, credit: amount }],
  data: {}, created_by: 'system-auto', updated_at: new Date().toISOString(),
});

describe.skipIf(!dbUp)('process_payment_receipt_v2 — retry idempotency (no double-count)', () => {
  let authed: SupabaseClient;
  let user: TestUser;

  beforeAll(async () => {
    if (!dbUp) return;
    user = await makeUser({ emailKey: 'idemp', company: TEST_COMPANY, allowedCompanies: [TEST_COMPANY], role: 'sales_manager' });
    authed = clientForToken(user.token);
  });

  beforeEach(async () => {
    await wipeCompany(TEST_COMPANY);
    await seedQuotation('IDEMP-Q1');
    await serviceClient.rpc('post_invoice_atomic', {
      p_payload: {
        company: TEST_COMPANY,
        invoice_row: { id: 'IDEMP-INV', company: TEST_COMPANY, order_id: 'IDEMP-Q1', total_amount: 100000, received_amount: 0, balance: 100000, status: 'Outstanding', date: '2026-07-12' },
        main_ledger_row: invoiceGl('IDEMP-INVGL', 100000),
      },
    });
  });

  const inv = async () => (await serviceClient.from('invoices').select('received_amount,balance,status').eq('id', 'IDEMP-INV').maybeSingle()).data;
  const receiptCount = async () => (await serviceClient.from('payment_receipts').select('id').eq('invoice_id', 'IDEMP-INV')).data?.length ?? 0;

  it('re-submitting the SAME partial receipt id does NOT double-count', async () => {
    // First 40k receipt → Partial, balance 60k.
    const r1 = await authed.rpc('process_payment_receipt_v2', {
      receipt_data: { id: 'IDEMP-RCPT', amount: 40000, date: '2026-07-12', method: 'Cash', reference: 'R' },
      p_invoice_id: 'IDEMP-INV', p_gl_row: null,
    });
    expect(r1.error).toBeNull();
    let s = await inv();
    expect(s?.received_amount).toBe(40000);
    expect(s?.balance).toBe(60000);

    // Retry the EXACT same receipt id (double-click / offline replay).
    const r2 = await authed.rpc('process_payment_receipt_v2', {
      receipt_data: { id: 'IDEMP-RCPT', amount: 40000, date: '2026-07-12', method: 'Cash', reference: 'R' },
      p_invoice_id: 'IDEMP-INV', p_gl_row: null,
    });
    expect(r2.error).toBeNull();

    // CORRECT behaviour: still 40k received, 60k balance, ONE receipt row.
    s = await inv();
    expect(s?.received_amount).toBe(40000);   // NOT 80,000
    expect(s?.balance).toBe(60000);           // NOT 20,000
    expect(s?.status).toBe('Partial');
    expect(await receiptCount()).toBe(1);
  });

  it('two DISTINCT receipts still accumulate correctly (fix does not break real partials)', async () => {
    await authed.rpc('process_payment_receipt_v2', {
      receipt_data: { id: 'IDEMP-RCPT-A', amount: 40000, date: '2026-07-12', method: 'Cash', reference: 'A' },
      p_invoice_id: 'IDEMP-INV', p_gl_row: null,
    });
    const r2 = await authed.rpc('process_payment_receipt_v2', {
      receipt_data: { id: 'IDEMP-RCPT-B', amount: 60000, date: '2026-07-12', method: 'Bank', reference: 'B' },
      p_invoice_id: 'IDEMP-INV', p_gl_row: null,
    });
    expect(r2.error).toBeNull();
    const s = await inv();
    expect(s?.received_amount).toBe(100000);
    expect(s?.balance).toBe(0);
    expect(s?.status).toBe('Paid');
    expect(await receiptCount()).toBe(2);
  });
});
