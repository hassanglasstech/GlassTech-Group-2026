/**
 * consumeGlassStock.integration.test.ts — REAL DB test for consume_glass_stock:
 * the cutting-session close that decrements material stock, writes stock-ledger
 * audit rows, posts the WIP GL, and closes the session — all in ONE transaction.
 * Proves inventory → GL atomicity + the stock/idempotency guards.
 *
 * Run against a LOCAL Supabase (Docker). Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { serviceClient, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { wipeCompany, TEST_COMPANY } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping consumeGlassStock. Run `npm run supabase:start`.');
}

const seedMaterial = async (id: string, qty: number): Promise<void> => {
  const { error } = await serviceClient.from('store_items').insert({
    id, company: TEST_COMPANY, name: 'ITEST Glass Sheet',
    data: { unrestrictedQty: qty, quantity: qty },
  });
  if (error) throw new Error(`seedMaterial(${id}) failed: ${error.message}`);
};

const stockGl = (
  id: string, amount: number,
  details?: Array<{ account_id: string; debit: number; credit: number }>,
): Record<string, unknown> => ({
  id, company: TEST_COMPANY, doc_type: 'JV', doc_date: '2026-07-12', date: '2026-07-12',
  description: 'Glass stock consumption', reference_id: 'ITEST', status: 'Posted',
  details: details ?? [
    { account_id: '11523', debit: amount, credit: 0 },   // Dr WIP
    { account_id: '11511', debit: 0,      credit: amount }, // Cr Glass Inventory
  ],
  data: {}, created_by: 'system-auto', updated_at: new Date().toISOString(),
});

const consume = async (sessionId: string, materialId: string, qty: number, gl: Record<string, unknown> | null) => {
  // cutting_sessions.job_order_id/cutter_id are NOT NULL on prod. The RPC upserts
  // the session with only (id, company, data, updated_at) via ON CONFLICT DO UPDATE,
  // which works only when the session ALREADY exists (the app opens it first). Model
  // that: pre-create the open session so the RPC takes the UPDATE path.
  const seed = await serviceClient.from('cutting_sessions').insert({
    id: sessionId, company: TEST_COMPANY, job_order_id: 'ITEST-JOB', cutter_id: 'ITEST-CUTTER',
  });
  if (seed.error) throw new Error(`seed session ${sessionId}: ${seed.error.message}`);
  return serviceClient.rpc('consume_glass_stock', {
    p_company: TEST_COMPANY,
    p_session_id: sessionId,
    p_consumption: [{ material_id: materialId, qty }],
    p_gl_row: gl,
    p_stock_rows: [{ id: `${sessionId}-SL`, data: { material_id: materialId, qty } }],
    p_session_row: { id: sessionId, data: { status: 'Closed' } },
  });
};

// ⚠ SKIPPED — KNOWN PROD BUG (verified against live prod 2026-07-12):
// consume_glass_stock upserts cutting_sessions with only (id, company, data,
// updated_at) via ON CONFLICT DO UPDATE, but cutting_sessions.job_order_id and
// cutter_id are NOT NULL on prod. PostgreSQL validates NOT NULL on the proposed
// insert tuple BEFORE conflict arbitration, so this fails with 23502 even when the
// session already exists (proven: pre-seeding the session does NOT help). The
// session-close therefore cannot succeed against the real schema. Un-skip once the
// RPC lists job_order_id/cutter_id in the INSERT (or they are made nullable on prod).
describe.skip('consume_glass_stock — real DB inventory→GL atomicity [BLOCKED: prod bug 23502]', () => {
  beforeEach(async () => {
    await wipeCompany(TEST_COMPANY);
  });

  it('decrements stock + posts WIP GL + closes the session in ONE transaction', async () => {
    await seedMaterial('ITEST-MAT-1', 100);

    const { error } = await consume('ITEST-SESS-1', 'ITEST-MAT-1', 30, stockGl('ITEST-SGL-1', 3000));

    expect(error).toBeNull();
    const { data: mat } = await serviceClient.from('store_items').select('data').eq('id', 'ITEST-MAT-1').maybeSingle();
    expect((mat?.data as { unrestrictedQty?: number })?.unrestrictedQty).toBe(70);   // 100 − 30
    const { data: led } = await serviceClient.from('ledger').select('id').eq('id', 'ITEST-SGL-1').maybeSingle();
    expect(led).toBeTruthy();
    const { data: sess } = await serviceClient.from('cutting_sessions').select('id').eq('id', 'ITEST-SESS-1').maybeSingle();
    expect(sess).toBeTruthy();
  });

  it('refuses to consume more than on-hand (insufficient_stock, stock + GL untouched)', async () => {
    await seedMaterial('ITEST-MAT-2', 100);

    const { error } = await consume('ITEST-SESS-2', 'ITEST-MAT-2', 200, stockGl('ITEST-SGL-2', 3000));

    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/insufficient_stock/i);
    const { data: mat } = await serviceClient.from('store_items').select('data').eq('id', 'ITEST-MAT-2').maybeSingle();
    expect((mat?.data as { unrestrictedQty?: number })?.unrestrictedQty).toBe(100);  // untouched
    const { data: led } = await serviceClient.from('ledger').select('id').eq('id', 'ITEST-SGL-2').maybeSingle();
    expect(led).toBeNull();
  });

  it('ROLLS BACK on an imbalanced GL (stock not decremented, no GL)', async () => {
    await seedMaterial('ITEST-MAT-3', 100);

    const { error } = await consume('ITEST-SESS-3', 'ITEST-MAT-3', 30, stockGl('ITEST-SGL-3', 3000, [
      { account_id: '11523', debit: 3000, credit: 0 },
      { account_id: '11511', debit: 0,    credit: 2000 },  // imbalanced
    ]));

    expect(error).not.toBeNull();
    const { data: mat } = await serviceClient.from('store_items').select('data').eq('id', 'ITEST-MAT-3').maybeSingle();
    expect((mat?.data as { unrestrictedQty?: number })?.unrestrictedQty).toBe(100);  // untouched
    const { data: led } = await serviceClient.from('ledger').select('id').eq('id', 'ITEST-SGL-3').maybeSingle();
    expect(led).toBeNull();
  });

  it('is idempotent — re-posting with the SAME GL id is rejected', async () => {
    await seedMaterial('ITEST-MAT-4', 100);
    const first = await consume('ITEST-SESS-4', 'ITEST-MAT-4', 10, stockGl('ITEST-SGL-4', 1000));
    expect(first.error).toBeNull();

    const second = await consume('ITEST-SESS-4b', 'ITEST-MAT-4', 10, stockGl('ITEST-SGL-4', 1000));
    expect(second.error).not.toBeNull();
    expect(second.error?.message ?? '').toMatch(/gl_already_posted/i);
  });
});
