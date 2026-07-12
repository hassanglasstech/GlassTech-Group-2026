/**
 * rlsAlwaysTrueClosed.integration.test.ts — proves migration
 * 20260712140000 closed the worst always-true RLS policies:
 *   - user_profiles: a non-super user now reads ONLY its own row (was: all)
 *   - erp_backups: a non-super user is blocked (was: authenticated ALL true)
 *   - employee_docs: scoped to the employee's company (was: all-CRUD true)
 * while super / same-company access still works.
 *
 * Run against a LOCAL Supabase (Docker). Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { serviceClient, clientForToken, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { makeUser, TEST_COMPANY, TEST_COMPANY_B, type TestUser } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping rlsAlwaysTrueClosed.');
}

describe.skipIf(!dbUp)('RLS — worst always-true policies closed (migration 140000)', () => {
  let userA: TestUser, userB: TestUser, superU: TestUser;

  beforeAll(async () => {
    if (!dbUp) return;
    userA  = await makeUser({ emailKey: 'rls_a', company: TEST_COMPANY, role: 'admin_officer', allowedCompanies: [TEST_COMPANY] });
    userB  = await makeUser({ emailKey: 'rls_b', company: TEST_COMPANY_B, role: 'admin_officer', allowedCompanies: [TEST_COMPANY_B] });
    superU = await makeUser({ emailKey: 'rls_super', company: TEST_COMPANY, role: 'super_admin', allowedCompanies: [TEST_COMPANY, TEST_COMPANY_B] });
  });

  it('user_profiles: a non-super user reads ONLY its own profile', async () => {
    const { data, error } = await clientForToken(userA.token).from('user_profiles').select('id,email');
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data?.[0]?.id).toBe(userA.id);   // not userB / super
  });

  it('user_profiles: a super_admin still reads all profiles', async () => {
    const { data, error } = await clientForToken(superU.token).from('user_profiles').select('id');
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThanOrEqual(3);   // sees A, B, super (+ any others)
  });

  it('erp_backups: a non-super user cannot read backup metadata', async () => {
    await serviceClient.from('erp_backups').delete().eq('id', 'RLS-BK-1');
    await serviceClient.from('erp_backups').insert({ id: 'RLS-BK-1', file_name: 'bk.sql', status: 'done' });
    const { data } = await clientForToken(userA.token).from('erp_backups').select('id').eq('id', 'RLS-BK-1');
    expect(data?.length ?? 0).toBe(0);       // blocked
    const svc = await serviceClient.from('erp_backups').select('id').eq('id', 'RLS-BK-1');
    expect(svc.data?.length).toBe(1);        // still there (service/super sees it)
    await serviceClient.from('erp_backups').delete().eq('id', 'RLS-BK-1');
  });

  it('employee_docs: scoped to the employee\'s company (cross-company blocked)', async () => {
    // seed a Glassco (TEST_COMPANY) employee + one doc
    await serviceClient.from('employee_docs').delete().eq('id', 'RLS-DOC-1');
    await serviceClient.from('employees').delete().eq('id', 'RLS-EMP-1');
    await serviceClient.from('employees').insert({ id: 'RLS-EMP-1', company: TEST_COMPANY });
    await serviceClient.from('employee_docs').insert({ id: 'RLS-DOC-1', employee_id: 'RLS-EMP-1', doc_type: 'cnic_front', file_name: 'x', file_url: 'x' });

    // userA (same company) sees it; userB (other company) does not.
    const seen = await clientForToken(userA.token).from('employee_docs').select('id').eq('id', 'RLS-DOC-1');
    expect(seen.data?.length).toBe(1);
    const notSeen = await clientForToken(userB.token).from('employee_docs').select('id').eq('id', 'RLS-DOC-1');
    expect(notSeen.data?.length ?? 0).toBe(0);

    await serviceClient.from('employee_docs').delete().eq('id', 'RLS-DOC-1');
    await serviceClient.from('employees').delete().eq('id', 'RLS-EMP-1');
  });
});
