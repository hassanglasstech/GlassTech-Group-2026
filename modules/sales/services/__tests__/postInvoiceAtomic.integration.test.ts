/**
 * postInvoiceAtomic.integration.test.ts — REAL DB test for post_invoice_atomic:
 * the invoice-creation RPC that folds the invoice row + its balanced GL (main /
 * COGS / mirror) into ONE transaction. Proves the sales→GL core is atomic and
 * balance-gated, and idempotent on a duplicate invoice id.
 *
 * Run against a LOCAL Supabase (Docker). Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { serviceClient, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { wipeCompany, seedQuotation, TEST_COMPANY } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping postInvoiceAtomic. Run `npm run supabase:start`.');
}

const mainLedger = (
  id: string,
  amount: number,
  details?: Array<{ account_id: string; debit: number; credit: number }>,
): Record<string, unknown> => ({
  id, company: TEST_COMPANY, doc_type: 'INV', doc_date: '2026-07-12', date: '2026-07-12',
  description: 'Integration invoice GL', reference_id: 'ITEST', status: 'Posted',
  details: details ?? [
    { account_id: '12210', debit: amount, credit: 0 },   // Dr AR
    { account_id: '4120',  debit: 0,      credit: amount }, // Cr Revenue
  ],
  data: {}, created_by: 'system-auto', updated_at: new Date().toISOString(),
});

const invoiceRow = (id: string, orderId: string, total: number): Record<string, unknown> => ({
  id, company: TEST_COMPANY, order_id: orderId,
  total_amount: total, received_amount: 0, balance: total,
  status: 'Outstanding', date: '2026-07-12',
});

describe.skipIf(!dbUp)('post_invoice_atomic — real DB atomicity', () => {
  beforeEach(async () => {
    await wipeCompany(TEST_COMPANY);
  });

  it('creates the invoice + its balanced GL in ONE transaction', async () => {
    await seedQuotation('ITEST-Q1');
    const { error } = await serviceClient.rpc('post_invoice_atomic', {
      p_payload: {
        company: TEST_COMPANY,
        invoice_row: invoiceRow('ITEST-PIA-1', 'ITEST-Q1', 100000),
        main_ledger_row: mainLedger('ITEST-GL-1', 100000),
      },
    });

    expect(error).toBeNull();
    const { data: inv } = await serviceClient.from('invoices').select('id,total_amount,status').eq('id', 'ITEST-PIA-1').maybeSingle();
    expect(inv?.total_amount).toBe(100000);
    const { data: led } = await serviceClient.from('ledger').select('id,details').eq('id', 'ITEST-GL-1').maybeSingle();
    expect(led).toBeTruthy();
    const details = led?.details as Array<{ debit: number; credit: number }>;
    expect(details.reduce((s, d) => s + d.debit, 0)).toBe(details.reduce((s, d) => s + d.credit, 0));
  });

  it('ROLLS BACK when the main ledger is imbalanced (no invoice, no GL)', async () => {
    await seedQuotation('ITEST-Q2');
    const { error } = await serviceClient.rpc('post_invoice_atomic', {
      p_payload: {
        company: TEST_COMPANY,
        invoice_row: invoiceRow('ITEST-PIA-2', 'ITEST-Q2', 100000),
        main_ledger_row: mainLedger('ITEST-GL-2', 100000, [
          { account_id: '12210', debit: 100000, credit: 0 },
          { account_id: '4120',  debit: 0,      credit: 90000 },  // imbalanced
        ]),
      },
    });

    expect(error).not.toBeNull();
    const { data: inv } = await serviceClient.from('invoices').select('id').eq('id', 'ITEST-PIA-2').maybeSingle();
    expect(inv).toBeNull();
    const { data: led } = await serviceClient.from('ledger').select('id').eq('id', 'ITEST-GL-2').maybeSingle();
    expect(led).toBeNull();
  });

  it('rejects a duplicate invoice id (idempotency guard)', async () => {
    await seedQuotation('ITEST-Q3');
    const payload = {
      company: TEST_COMPANY,
      invoice_row: invoiceRow('ITEST-PIA-3', 'ITEST-Q3', 5000),
      main_ledger_row: mainLedger('ITEST-GL-3a', 5000),
    };
    const first = await serviceClient.rpc('post_invoice_atomic', { p_payload: payload });
    expect(first.error).toBeNull();

    const second = await serviceClient.rpc('post_invoice_atomic', {
      p_payload: { ...payload, main_ledger_row: mainLedger('ITEST-GL-3b', 5000) },
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.message ?? '').toMatch(/invoice_already_exists/i);
  });
});
