/**
 * voidInvoiceAtomic.integration.test.ts — REAL DB test for void_invoice_atomic:
 * folds the reversing GL + the invoice status flip (→ Voided, balance 0) into
 * ONE transaction, with the void-eligibility guards (double-void, paid, has
 * payments) enforced in the DB.
 *
 * Run against a LOCAL Supabase (Docker). Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { serviceClient, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { wipeCompany, seedInvoice, TEST_COMPANY } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping voidInvoiceAtomic. Run `npm run supabase:start`.');
}

const reversalLedger = (
  id: string,
  amount: number,
  details?: Array<{ account_id: string; debit: number; credit: number }>,
): Record<string, unknown> => ({
  id, company: TEST_COMPANY, doc_type: 'JV', doc_date: '2026-07-12', date: '2026-07-12',
  description: 'Void reversal', reference_id: 'ITEST', status: 'Posted',
  details: details ?? [
    { account_id: '4120',  debit: amount, credit: 0 },   // Dr Revenue (reverse)
    { account_id: '12210', debit: 0,      credit: amount }, // Cr AR (reverse)
  ],
  data: {}, created_by: 'system-auto', updated_at: new Date().toISOString(),
});

const voidPayload = (invoiceId: string, glId: string, amount: number, badDetails?: Array<{ account_id: string; debit: number; credit: number }>) => ({
  company: TEST_COMPANY,
  invoice_id: invoiceId,
  voided_by: 'itest',
  voided_at: '2026-07-12',
  reversal_ledger_row: reversalLedger(glId, amount, badDetails),
});

describe.skipIf(!dbUp)('void_invoice_atomic — real DB atomicity + guards', () => {
  beforeEach(async () => {
    await wipeCompany(TEST_COMPANY);
  });

  it('voids the invoice + posts a balanced reversal GL in ONE transaction', async () => {
    await seedInvoice({ id: 'ITEST-V1', totalAmount: 100000, receivedAmount: 0, status: 'Outstanding' });

    const { error } = await serviceClient.rpc('void_invoice_atomic', { p_payload: voidPayload('ITEST-V1', 'ITEST-VGL-1', 100000) });

    expect(error).toBeNull();
    const { data: inv } = await serviceClient.from('invoices').select('status,balance').eq('id', 'ITEST-V1').maybeSingle();
    expect(inv?.status).toBe('Voided');
    expect(inv?.balance).toBe(0);
    const { data: led } = await serviceClient.from('ledger').select('id').eq('id', 'ITEST-VGL-1').maybeSingle();
    expect(led).toBeTruthy();
  });

  it('ROLLS BACK when the reversal GL is imbalanced (invoice stays Outstanding)', async () => {
    await seedInvoice({ id: 'ITEST-V2', totalAmount: 100000, receivedAmount: 0, status: 'Outstanding' });

    const { error } = await serviceClient.rpc('void_invoice_atomic', {
      p_payload: voidPayload('ITEST-V2', 'ITEST-VGL-2', 100000, [
        { account_id: '4120',  debit: 100000, credit: 0 },
        { account_id: '12210', debit: 0,      credit: 90000 },  // imbalanced
      ]),
    });

    expect(error).not.toBeNull();
    const { data: inv } = await serviceClient.from('invoices').select('status').eq('id', 'ITEST-V2').maybeSingle();
    expect(inv?.status).toBe('Outstanding');   // untouched
    const { data: led } = await serviceClient.from('ledger').select('id').eq('id', 'ITEST-VGL-2').maybeSingle();
    expect(led).toBeNull();
  });

  it('rejects a double-void (invoice_already_voided)', async () => {
    await seedInvoice({ id: 'ITEST-V3', totalAmount: 5000, receivedAmount: 0, status: 'Outstanding' });
    const first = await serviceClient.rpc('void_invoice_atomic', { p_payload: voidPayload('ITEST-V3', 'ITEST-VGL-3a', 5000) });
    expect(first.error).toBeNull();

    const second = await serviceClient.rpc('void_invoice_atomic', { p_payload: voidPayload('ITEST-V3', 'ITEST-VGL-3b', 5000) });
    expect(second.error).not.toBeNull();
    expect(second.error?.message ?? '').toMatch(/already_voided/i);
  });

  it('refuses to void an invoice that has received payments', async () => {
    await seedInvoice({ id: 'ITEST-V4', totalAmount: 100000, receivedAmount: 30000, status: 'Partial' });

    const { error } = await serviceClient.rpc('void_invoice_atomic', { p_payload: voidPayload('ITEST-V4', 'ITEST-VGL-4', 100000) });

    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/has_payments|credit note/i);
    const { data: inv } = await serviceClient.from('invoices').select('status').eq('id', 'ITEST-V4').maybeSingle();
    expect(inv?.status).toBe('Partial');   // untouched
  });
});
