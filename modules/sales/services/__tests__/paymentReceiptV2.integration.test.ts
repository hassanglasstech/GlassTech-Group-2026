/**
 * paymentReceiptV2.integration.test.ts — REAL database integration test for
 * God-mode P0 #9: process_payment_receipt_v2 folds receipt + invoice-balance +
 * balanced GL into ONE transaction, so they can never tear apart.
 *
 * This runs the ACTUAL Postgres function against a LOCAL Supabase (Docker),
 * not a mock — the unit test (asyncSalesService.test.ts) only proved the app
 * calls the right RPC; this proves the RPC itself is atomic and balance-gated.
 *
 * Run: install Docker → `npm run supabase:start` → `npm run db:reset`
 *      → `npm run test:integration`. Skips cleanly if the local stack is down.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { serviceClient, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { wipeCompany, seedInvoice, glRow, TEST_COMPANY } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping paymentReceiptV2. Run `npm run supabase:start`.');
}

describe.skipIf(!dbUp)('process_payment_receipt_v2 — real DB atomicity (P0 #9)', () => {
  beforeEach(async () => {
    await wipeCompany(TEST_COMPANY);
  });

  it('posts receipt + invoice-balance + balanced GL in ONE transaction', async () => {
    await seedInvoice({ id: 'ITEST-INV-1', totalAmount: 100000, receivedAmount: 0 });

    const { data, error } = await serviceClient.rpc('process_payment_receipt_v2', {
      receipt_data: { id: 'ITEST-RCPT-1', amount: 5000, date: '2026-07-12', method: 'Cash', reference: 'R1' },
      p_invoice_id: 'ITEST-INV-1',
      p_gl_row: glRow({ id: 'ITEST-PAY-1' }),
    });

    expect(error).toBeNull();
    expect((data as Record<string, unknown>)?.new_balance).toBe(95000);
    expect((data as Record<string, unknown>)?.status).toBe('Partial');

    // Receipt landed
    const { data: rcpt } = await serviceClient.from('payment_receipts').select('*').eq('id', 'ITEST-RCPT-1').maybeSingle();
    expect(rcpt?.amount).toBe(5000);
    expect(rcpt?.gl_tx_id).toBe('ITEST-PAY-1');

    // Invoice balance updated in the same txn
    const { data: inv } = await serviceClient.from('invoices').select('received_amount,balance,status').eq('id', 'ITEST-INV-1').maybeSingle();
    expect(inv?.received_amount).toBe(5000);
    expect(inv?.balance).toBe(95000);
    expect(inv?.status).toBe('Partial');

    // Balanced GL row landed
    const { data: led } = await serviceClient.from('ledger').select('id,details').eq('id', 'ITEST-PAY-1').maybeSingle();
    expect(led).toBeTruthy();
    const details = led?.details as Array<{ debit: number; credit: number }>;
    const dr = details.reduce((s, d) => s + (d.debit || 0), 0);
    const cr = details.reduce((s, d) => s + (d.credit || 0), 0);
    expect(dr).toBe(cr);
  });

  it('ROLLS BACK everything when the GL leg is imbalanced (all-or-nothing)', async () => {
    await seedInvoice({ id: 'ITEST-INV-2', totalAmount: 100000, receivedAmount: 0 });

    const { error } = await serviceClient.rpc('process_payment_receipt_v2', {
      receipt_data: { id: 'ITEST-RCPT-2', amount: 5000, date: '2026-07-12', method: 'Cash', reference: 'R2' },
      p_invoice_id: 'ITEST-INV-2',
      p_gl_row: glRow({ id: 'ITEST-PAY-2', details: [
        { account_id: '1111',  debit: 5000, credit: 0 },
        { account_id: '12210', debit: 0,    credit: 4000 },  // imbalanced on purpose
      ] }),
    });

    expect(error).not.toBeNull();                    // ledger_imbalance raised

    // NOTHING was written — receipt, invoice, and ledger all untouched
    const { data: rcpt } = await serviceClient.from('payment_receipts').select('id').eq('id', 'ITEST-RCPT-2').maybeSingle();
    expect(rcpt).toBeNull();
    const { data: inv } = await serviceClient.from('invoices').select('received_amount,balance,status').eq('id', 'ITEST-INV-2').maybeSingle();
    expect(inv?.received_amount).toBe(0);
    expect(inv?.balance).toBe(100000);
    const { data: led } = await serviceClient.from('ledger').select('id').eq('id', 'ITEST-PAY-2').maybeSingle();
    expect(led).toBeNull();
  });

  it('rejects an over-payment beyond the PKR 1 tolerance (invoice untouched)', async () => {
    await seedInvoice({ id: 'ITEST-INV-3', totalAmount: 5000, receivedAmount: 0 });

    const { error } = await serviceClient.rpc('process_payment_receipt_v2', {
      receipt_data: { id: 'ITEST-RCPT-3', amount: 10000, date: '2026-07-12', method: 'Cash', reference: 'R3' },
      p_invoice_id: 'ITEST-INV-3',
      p_gl_row: null,
    });

    expect(error).not.toBeNull();
    const { data: inv } = await serviceClient.from('invoices').select('received_amount,balance').eq('id', 'ITEST-INV-3').maybeSingle();
    expect(inv?.received_amount).toBe(0);
    expect(inv?.balance).toBe(5000);
  });
});
