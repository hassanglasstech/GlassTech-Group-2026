/**
 * postGrnAtomic.integration.test.ts — REAL DB test for post_grn_atomic: the
 * goods-receipt posting that upserts the received stock + posts the material GL
 * (JV) in ONE transaction, with a grn-already-posted idempotency guard.
 *
 * Run against a LOCAL Supabase (Docker). Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { serviceClient, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { wipeCompany, TEST_COMPANY } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping postGrnAtomic. Run `npm run supabase:start`.');
}

const grnGl = (
  id: string, grnId: string, amount: number,
  details?: Array<{ account_id: string; debit: number; credit: number }>,
): Record<string, unknown> => ({
  id, company: TEST_COMPANY, doc_type: 'JV', doc_date: '2026-07-12', date: '2026-07-12',
  description: 'GRN material receipt', reference_id: grnId, status: 'Posted',
  details: details ?? [
    { account_id: '11511', debit: amount, credit: 0 },   // Dr Glass Inventory
    { account_id: '21151', debit: 0,      credit: amount }, // Cr GR/IR clearing
  ],
  // system-auto so the DB maker-checker trigger (enforce_jv_maker_checker) passes.
  data: {}, created_by: 'system-auto', updated_at: new Date().toISOString(),
});

const grnPayload = (
  grnId: string, glId: string, amount: number,
  badDetails?: Array<{ account_id: string; debit: number; credit: number }>,
) => ({
  company: TEST_COMPANY,
  grn_id: grnId,
  store_rows: [{
    id: `${grnId}-MAT`, company: TEST_COMPANY, name: 'GRN Glass Sheet',
    quantity: 50, unrestricted_qty: 50, moving_average_price: amount / 50, total_value: amount,
  }],
  ledger_rows: [grnGl(glId, grnId, amount, badDetails)],
});

describe.skipIf(!dbUp)('post_grn_atomic — real DB inventory + GL atomicity', () => {
  beforeEach(async () => {
    await wipeCompany(TEST_COMPANY);
  });

  it('upserts the received stock + posts the material GL in ONE transaction', async () => {
    const { data, error } = await serviceClient.rpc('post_grn_atomic', { p_payload: grnPayload('ITEST-GRN-1', 'ITEST-GRNGL-1', 5000) });

    expect(error).toBeNull();
    expect((data as Record<string, unknown>)?.ledger_written).toBe(1);
    const { data: mat } = await serviceClient.from('store_items').select('unrestricted_qty').eq('id', 'ITEST-GRN-1-MAT').maybeSingle();
    expect(Number(mat?.unrestricted_qty)).toBe(50);
    const { data: led } = await serviceClient.from('ledger').select('id,details').eq('id', 'ITEST-GRNGL-1').maybeSingle();
    expect(led).toBeTruthy();
    const details = led?.details as Array<{ debit: number; credit: number }>;
    expect(details.reduce((s, d) => s + d.debit, 0)).toBe(details.reduce((s, d) => s + d.credit, 0));
  });

  it('rejects a double-post of the same GRN (grn_already_posted)', async () => {
    const first = await serviceClient.rpc('post_grn_atomic', { p_payload: grnPayload('ITEST-GRN-2', 'ITEST-GRNGL-2a', 5000) });
    expect(first.error).toBeNull();

    const second = await serviceClient.rpc('post_grn_atomic', { p_payload: grnPayload('ITEST-GRN-2', 'ITEST-GRNGL-2b', 5000) });
    expect(second.error).not.toBeNull();
    expect(second.error?.message ?? '').toMatch(/grn_already_posted/i);
  });

  it('ROLLS BACK when the material GL is imbalanced (no stock, no GL)', async () => {
    const { error } = await serviceClient.rpc('post_grn_atomic', {
      p_payload: grnPayload('ITEST-GRN-3', 'ITEST-GRNGL-3', 5000, [
        { account_id: '11511', debit: 5000, credit: 0 },
        { account_id: '21151', debit: 0,    credit: 4000 },  // imbalanced
      ]),
    });

    expect(error).not.toBeNull();
    const { data: mat } = await serviceClient.from('store_items').select('id').eq('id', 'ITEST-GRN-3-MAT').maybeSingle();
    expect(mat).toBeNull();
    const { data: led } = await serviceClient.from('ledger').select('id').eq('id', 'ITEST-GRNGL-3').maybeSingle();
    expect(led).toBeNull();
  });
});
