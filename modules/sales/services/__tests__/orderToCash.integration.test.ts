/**
 * orderToCash.integration.test.ts — REAL DB end-to-end chain that ties the
 * atomic RPCs together the way the app does: quotation → invoice → receipts →
 * credit note. Proves the invoice balance/status accumulate correctly across
 * independent transactions and that the live-balance guard sees prior receipts.
 *
 * Run against a LOCAL Supabase (Docker). Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient, clientForToken, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { wipeCompany, seedQuotation, glRow, makeUser, TEST_COMPANY, type TestUser } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping orderToCash. Run `npm run supabase:start`.');
}

const invoiceGl = (id: string, amount: number): Record<string, unknown> => ({
  id, company: TEST_COMPANY, doc_type: 'INV', doc_date: '2026-07-12', date: '2026-07-12',
  description: 'AR / Revenue', reference_id: 'E2E', status: 'Posted',
  details: [
    { account_id: '12210', debit: amount, credit: 0 },
    { account_id: '4120',  debit: 0,      credit: amount },
  ],
  data: {}, created_by: 'system-auto', updated_at: new Date().toISOString(),
});

const receiptGl = (id: string, amount: number) => glRow({
  id, details: [
    { account_id: '1111',  debit: amount, credit: 0 },   // Dr Cash
    { account_id: '12210', debit: 0,      credit: amount }, // Cr AR
  ],
});

const invStatus = async (id: string) =>
  (await serviceClient.from('invoices').select('received_amount,balance,status').eq('id', id).maybeSingle()).data;

describe.skipIf(!dbUp)('order-to-cash — real DB end-to-end chain', () => {
  let authed: SupabaseClient;
  let user: TestUser;

  beforeAll(async () => {
    if (!dbUp) return;
    user = await makeUser({ emailKey: 'e2e', company: TEST_COMPANY, allowedCompanies: [TEST_COMPANY], role: 'sales_manager' });
    authed = clientForToken(user.token);
  });

  beforeEach(async () => {
    await wipeCompany(TEST_COMPANY);
  });

  it('quotation → invoice → partial receipt → full receipt drives the invoice to Paid', async () => {
    await seedQuotation('E2E-Q1');

    // 1. Create the invoice (+ its GL) atomically.
    const inv = await serviceClient.rpc('post_invoice_atomic', {
      p_payload: {
        company: TEST_COMPANY,
        invoice_row: { id: 'E2E-INV-1', company: TEST_COMPANY, order_id: 'E2E-Q1', total_amount: 100000, received_amount: 0, balance: 100000, status: 'Outstanding', date: '2026-07-12' },
        main_ledger_row: invoiceGl('E2E-INVGL-1', 100000),
      },
    });
    expect(inv.error).toBeNull();

    // 2. Partial receipt 40,000 → Partial.
    const r1 = await authed.rpc('process_payment_receipt_v2', {
      receipt_data: { id: 'E2E-RCPT-1', amount: 40000, date: '2026-07-12', method: 'Cash', reference: 'R1' },
      p_invoice_id: 'E2E-INV-1', p_gl_row: receiptGl('E2E-RGL-1', 40000),
    });
    expect(r1.error).toBeNull();
    expect((r1.data as Record<string, unknown>)?.status).toBe('Partial');
    let s = await invStatus('E2E-INV-1');
    expect(s?.received_amount).toBe(40000);
    expect(s?.balance).toBe(60000);
    expect(s?.status).toBe('Partial');

    // 3. Final receipt 60,000 → Paid, balance 0.
    const r2 = await authed.rpc('process_payment_receipt_v2', {
      receipt_data: { id: 'E2E-RCPT-2', amount: 60000, date: '2026-07-12', method: 'Bank', reference: 'R2' },
      p_invoice_id: 'E2E-INV-1', p_gl_row: receiptGl('E2E-RGL-2', 60000),
    });
    expect(r2.error).toBeNull();
    expect((r2.data as Record<string, unknown>)?.status).toBe('Paid');
    s = await invStatus('E2E-INV-1');
    expect(s?.received_amount).toBe(100000);
    expect(s?.balance).toBe(0);
    expect(s?.status).toBe('Paid');

    // Ledger accumulated all three balanced entries (invoice + 2 receipts).
    const { data: gls } = await serviceClient.from('ledger').select('id').in('id', ['E2E-INVGL-1', 'E2E-RGL-1', 'E2E-RGL-2']);
    expect(gls?.length).toBe(3);
  });

  it('a credit note against a partially-paid invoice respects the LIVE balance', async () => {
    await seedQuotation('E2E-Q2');
    await serviceClient.rpc('post_invoice_atomic', {
      p_payload: {
        company: TEST_COMPANY,
        invoice_row: { id: 'E2E-INV-2', company: TEST_COMPANY, order_id: 'E2E-Q2', total_amount: 100000, received_amount: 0, balance: 100000, status: 'Outstanding', date: '2026-07-12' },
        main_ledger_row: invoiceGl('E2E-INVGL-2', 100000),
      },
    });
    // pay 40k → live balance 60k
    await authed.rpc('process_payment_receipt_v2', {
      receipt_data: { id: 'E2E-RCPT-3', amount: 40000, date: '2026-07-12', method: 'Cash', reference: 'R3' },
      p_invoice_id: 'E2E-INV-2', p_gl_row: receiptGl('E2E-RGL-3', 40000),
    });

    // a 70k credit note now EXCEEDS the live 60k balance → rejected
    const tooBig = await serviceClient.rpc('credit_note_atomic', {
      p_payload: {
        company: TEST_COMPANY, cn_id: 'E2E-CN-BIG', invoice_id: 'E2E-INV-2', invoice_new_status: 'Partial',
        reversal_ledger_row: { id: 'E2E-CNGL-BIG', company: TEST_COMPANY, doc_type: 'CN', doc_date: '2026-07-12', date: '2026-07-12', description: 'CN', reference_id: 'E2E', status: 'Posted', details: [{ account_id: '4120', debit: 70000, credit: 0 }, { account_id: '12210', debit: 0, credit: 70000 }], data: {}, created_by: 'system-auto', updated_at: new Date().toISOString() },
        cn_data: { amount: 70000, invoiceId: 'E2E-INV-2', invoiceNo: 'E2E-INV-2', reason: 'over', date: '2026-07-12', createdBy: 'itest' },
      },
    });
    expect(tooBig.error).not.toBeNull();
    expect(tooBig.error?.message ?? '').toMatch(/exceeds_live_balance|exceeds invoice/i);

    // a 30k credit note fits (<= 60k) → balance drops to 30k
    const ok = await serviceClient.rpc('credit_note_atomic', {
      p_payload: {
        company: TEST_COMPANY, cn_id: 'E2E-CN-OK', invoice_id: 'E2E-INV-2', invoice_new_status: 'Partial',
        reversal_ledger_row: { id: 'E2E-CNGL-OK', company: TEST_COMPANY, doc_type: 'CN', doc_date: '2026-07-12', date: '2026-07-12', description: 'CN', reference_id: 'E2E', status: 'Posted', details: [{ account_id: '4120', debit: 30000, credit: 0 }, { account_id: '12210', debit: 0, credit: 30000 }], data: {}, created_by: 'system-auto', updated_at: new Date().toISOString() },
        cn_data: { amount: 30000, invoiceId: 'E2E-INV-2', invoiceNo: 'E2E-INV-2', reason: 'adj', date: '2026-07-12', createdBy: 'itest' },
      },
    });
    expect(ok.error).toBeNull();
    const s = await invStatus('E2E-INV-2');
    expect(s?.balance).toBe(30000);   // 60k live − 30k CN
  });
});
