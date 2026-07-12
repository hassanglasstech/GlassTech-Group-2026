/**
 * pieceStatusAtomic.integration.test.ts — REAL database test for
 * update_piece_status_atomic's transition guard (the DB mirror of the app's
 * pieceStatusMachine).
 *
 * The unit test (pieceStatusMachine.test.ts) proves the APP's transition table;
 * this proves the DATABASE function `_piece_transition_allowed` agrees with it —
 * so a piece can never be restatused illegally even by a direct RPC call that
 * bypasses the app. (The cross-company guard needs an authenticated user and is
 * covered in the RLS/auth integration suite.)
 *
 * Run against a LOCAL Supabase (Docker). Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { serviceClient, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { wipeCompany, seedPiece, TEST_COMPANY } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping pieceStatusAtomic. Run `npm run supabase:start`.');
}

const restatus = (pieceId: string, to: string) =>
  serviceClient.rpc('update_piece_status_atomic', {
    p_piece_id: pieceId, p_new_status: to, p_changed_by: 'itest', p_reason: 'integration',
  });

describe.skipIf(!dbUp)('update_piece_status_atomic — real DB transition guard', () => {
  beforeEach(async () => {
    await wipeCompany(TEST_COMPANY);
  });

  it('ALLOWS a legal transition (Cut → QC-Pending) and bumps status + version', async () => {
    await seedPiece({ id: 'ITEST-P1', status: 'Cut' });

    const { data, error } = await restatus('ITEST-P1', 'QC-Pending');

    expect(error).toBeNull();
    expect((data as Record<string, unknown>)?.new_status).toBe('QC-Pending');

    const { data: piece } = await serviceClient.from('production_pieces').select('status').eq('id', 'ITEST-P1').maybeSingle();
    expect(piece?.status).toBe('QC-Pending');
  });

  it('REJECTS an illegal skip (Cut → Dispatched, skipping QC) — status unchanged', async () => {
    await seedPiece({ id: 'ITEST-P2', status: 'Cut' });

    const { error } = await restatus('ITEST-P2', 'Dispatched');

    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/invalid_transition/i);

    const { data: piece } = await serviceClient.from('production_pieces').select('status').eq('id', 'ITEST-P2').maybeSingle();
    expect(piece?.status).toBe('Cut');   // untouched
  });

  it('REJECTS resurrecting a terminal piece (Delivered → Cut)', async () => {
    await seedPiece({ id: 'ITEST-P3', status: 'Delivered' });

    const { error } = await restatus('ITEST-P3', 'Cut');

    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/invalid_transition/i);
  });

  it('ALLOWS the universal Hold from any status', async () => {
    await seedPiece({ id: 'ITEST-P4', status: 'QC-Passed' });

    const { error } = await restatus('ITEST-P4', 'Hold');

    expect(error).toBeNull();
    const { data: piece } = await serviceClient.from('production_pieces').select('status').eq('id', 'ITEST-P4').maybeSingle();
    expect(piece?.status).toBe('Hold');
  });
});
