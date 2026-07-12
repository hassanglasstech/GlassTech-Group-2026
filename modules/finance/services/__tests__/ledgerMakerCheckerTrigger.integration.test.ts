/**
 * ledgerMakerCheckerTrigger.integration.test.ts — REAL DB test that the
 * maker-checker gate is enforced by a Postgres TRIGGER on the ledger table
 * (enforce_jv_maker_checker), not only by the app's saveLedger. This is the
 * defense-in-depth layer: even a direct insert (service role, RLS-bypassing)
 * cannot post a manual JV without a distinct approver.
 *
 * Run against a LOCAL Supabase (Docker). Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { serviceClient, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { wipeCompany, TEST_COMPANY } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping ledgerMakerCheckerTrigger. Run `npm run supabase:start`.');
}

const jvRow = (id: string, over: Record<string, unknown>): Record<string, unknown> => ({
  id, company: TEST_COMPANY, doc_type: 'JV', doc_date: '2026-07-12', date: '2026-07-12',
  description: 'Manual JV', reference_id: 'ITEST', status: 'Posted',
  details: [
    { account_id: '5211', debit: 1000, credit: 0 },
    { account_id: '2211', debit: 0,    credit: 1000 },
  ],
  data: {}, updated_at: new Date().toISOString(),
  ...over,
});

describe.skipIf(!dbUp)('ledger maker-checker — enforced by a DB trigger', () => {
  beforeEach(async () => {
    await wipeCompany(TEST_COMPANY);
  });

  it('BLOCKS a Posted manual JV inserted with no approved_by', async () => {
    const { error } = await serviceClient.from('ledger').insert(jvRow('ITEST-JV-1', { created_by: 'maker@itest' }));
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/without approved_by|MakerChecker/i);
  });

  it('ALLOWS a Posted manual JV with a distinct approver (valid 4-eyes)', async () => {
    const { error } = await serviceClient.from('ledger').insert(
      jvRow('ITEST-JV-2', { created_by: 'maker@itest', drafted_by: 'maker@itest', approved_by: 'checker@itest' }),
    );
    expect(error).toBeNull();
  });

  it('BLOCKS when the approver is the same person as the drafter (4-eyes)', async () => {
    const { error } = await serviceClient.from('ledger').insert(
      jvRow('ITEST-JV-3', { created_by: 'maker@itest', drafted_by: 'same@itest', approved_by: 'same@itest' }),
    );
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/4-eyes|differ from drafter/i);
  });

  it('ALLOWS a system-auto JV without approval (trusted background posting)', async () => {
    const { error } = await serviceClient.from('ledger').insert(jvRow('ITEST-JV-4', { created_by: 'system-auto' }));
    expect(error).toBeNull();
  });
});
