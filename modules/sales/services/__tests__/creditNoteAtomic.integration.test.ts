/**
 * creditNoteAtomic.integration.test.ts — REAL DB test for credit_note_atomic:
 * posts the reversing GL + the credit_notes row + reduces the invoice balance
 * (server-side, from the LIVE locked balance) in ONE transaction.
 *
 * Run against a LOCAL Supabase (Docker). Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { serviceClient, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { wipeCompany, seedInvoice, TEST_COMPANY } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping creditNoteAtomic. Run `npm run supabase:start`.');
}

const cnLedger = (
  id: string,
  amount: number,
  details?: Array<{ account_id: string; debit: number; credit: number }>,
): Record<string, unknown> => ({
  id, company: TEST_COMPANY, doc_type: 'CN', doc_date: '2026-07-12', date: '2026-07-12',
  description: 'Credit note reversal', reference_id: 'ITEST', status: 'Posted',
  details: details ?? [
    { account_id: '4120',  debit: amount, credit: 0 },   // Dr Revenue (reverse)
    { account_id: '12210', debit: 0,      credit: amount }, // Cr AR (reverse)
  ],
  data: {}, created_by: 'system-auto', updated_at: new Date().toISOString(),
});

const cnPayload = (
  cnId: string, invoiceId: string, glId: string, amount: number,
  badDetails?: Array<{ account_id: string; debit: number; credit: number }>,
) => ({
  company: TEST_COMPANY,
  cn_id: cnId,
  invoice_id: invoiceId,
  invoice_new_status: 'Partial',
  reversal_ledger_row: cnLedger(glId, amount, badDetails),
  cn_data: { amount, invoiceId, invoiceNo: invoiceId, reason: 'Integration test', date: '2026-07-12', createdBy: 'itest' },
});

describe.skipIf(!dbUp)('credit_note_atomic — real DB atomicity + guards', () => {
  beforeEach(async () => {
    await wipeCompany(TEST_COMPANY);
  });

  it('posts reversal GL + CN row + reduces invoice balance in ONE transaction', async () => {
    await seedInvoice({ id: 'ITEST-CNI-1', totalAmount: 100000, receivedAmount: 0, status: 'Outstanding' });

    const { error } = await serviceClient.rpc('credit_note_atomic', {
      p_payload: cnPayload('ITEST-CN-1', 'ITEST-CNI-1', 'ITEST-CNGL-1', 30000),
    });

    expect(error).toBeNull();
    const { data: inv } = await serviceClient.from('invoices').select('balance,status').eq('id', 'ITEST-CNI-1').maybeSingle();
    expect(inv?.balance).toBe(70000);           // 100000 − 30000 CN
    const { data: cn } = await serviceClient.from('credit_notes').select('status,gl_tx_id').eq('id', 'ITEST-CN-1').maybeSingle();
    expect(cn?.status).toBe('Posted');
    const { data: led } = await serviceClient.from('ledger').select('id').eq('id', 'ITEST-CNGL-1').maybeSingle();
    expect(led).toBeTruthy();
  });

  it('ROLLS BACK on an imbalanced reversal GL (invoice + CN + ledger untouched)', async () => {
    await seedInvoice({ id: 'ITEST-CNI-2', totalAmount: 100000, receivedAmount: 0, status: 'Outstanding' });

    const { error } = await serviceClient.rpc('credit_note_atomic', {
      p_payload: cnPayload('ITEST-CN-2', 'ITEST-CNI-2', 'ITEST-CNGL-2', 30000, [
        { account_id: '4120',  debit: 30000, credit: 0 },
        { account_id: '12210', debit: 0,     credit: 20000 },  // imbalanced
      ]),
    });

    expect(error).not.toBeNull();
    const { data: inv } = await serviceClient.from('invoices').select('balance').eq('id', 'ITEST-CNI-2').maybeSingle();
    expect(inv?.balance).toBe(100000);          // untouched
    const { data: cn } = await serviceClient.from('credit_notes').select('id').eq('id', 'ITEST-CN-2').maybeSingle();
    expect(cn).toBeNull();
    const { data: led } = await serviceClient.from('ledger').select('id').eq('id', 'ITEST-CNGL-2').maybeSingle();
    expect(led).toBeNull();
  });

  it('rejects a credit note that exceeds the live invoice balance', async () => {
    await seedInvoice({ id: 'ITEST-CNI-3', totalAmount: 5000, receivedAmount: 0, status: 'Outstanding' });

    const { error } = await serviceClient.rpc('credit_note_atomic', {
      p_payload: cnPayload('ITEST-CN-3', 'ITEST-CNI-3', 'ITEST-CNGL-3', 10000),
    });

    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/exceeds_live_balance|exceeds invoice/i);
    const { data: inv } = await serviceClient.from('invoices').select('balance').eq('id', 'ITEST-CNI-3').maybeSingle();
    expect(inv?.balance).toBe(5000);            // untouched
  });

  it('is idempotent — re-posting with the SAME reversal GL id is rejected', async () => {
    await seedInvoice({ id: 'ITEST-CNI-4', totalAmount: 100000, receivedAmount: 0, status: 'Outstanding' });
    const first = await serviceClient.rpc('credit_note_atomic', { p_payload: cnPayload('ITEST-CN-4', 'ITEST-CNI-4', 'ITEST-CNGL-4', 10000) });
    expect(first.error).toBeNull();

    // a different CN re-using the already-posted reversal GL id
    const second = await serviceClient.rpc('credit_note_atomic', { p_payload: cnPayload('ITEST-CN-4b', 'ITEST-CNI-4', 'ITEST-CNGL-4', 10000) });
    expect(second.error).not.toBeNull();
    expect(second.error?.message ?? '').toMatch(/gl_already_posted/i);
  });
});
