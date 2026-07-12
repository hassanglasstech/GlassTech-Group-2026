/**
 * rbacHrModuleGate.integration.test.ts — REAL-DB proof for the RBAC write-layer
 * slice 1 (migration 20260712080000_rbac_owner_scope_and_hr_module_gate.sql):
 *
 *   ISSUE 1 — `owner` is no longer a GLOBAL super. auth_user_is_super() now
 *   returns true only for super_admin/hassan, so an owner is company-scoped and
 *   cannot write another company's rows.
 *
 *   ISSUE 2 — the HR-exclusive tables (employees, attendance) are module-gated:
 *   a user must hold the 'hr' module (or be a company admin / super) to write
 *   them. A sales-only user is blocked; shared tables (quotations) are NOT gated.
 *
 * Runs against a LOCAL Supabase (Docker) with all migrations applied
 * (`supabase db reset`). Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { serviceClient, clientForToken, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { makeUser, TEST_COMPANY, TEST_COMPANY_B, type TestUser } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping rbacHrModuleGate. Run `npm run supabase:start`.');
}

const cleanup = async (): Promise<void> => {
  for (const t of ['employees', 'attendance']) {
    await serviceClient.from(t).delete().in('company', [TEST_COMPANY, TEST_COMPANY_B]);
  }
  await serviceClient.from('quotations').delete().in('company', [TEST_COMPANY, TEST_COMPANY_B]);
};

describe.skipIf(!dbUp)('RBAC write-layer — owner scope + HR module gate', () => {
  let superU: TestUser;   // super_admin, EMPTY modules (founder-style)
  let ownerU: TestUser;   // owner, NO hr module, single company
  let hrU: TestUser;      // admin_officer WITH hr module
  let salesU: TestUser;   // admin_officer with sales module only

  beforeAll(async () => {
    superU = await makeUser({ emailKey: 'rbac_super', company: TEST_COMPANY, role: 'super_admin',
      allowedCompanies: [TEST_COMPANY, TEST_COMPANY_B], allowedModules: [] });
    ownerU = await makeUser({ emailKey: 'rbac_owner', company: TEST_COMPANY, role: 'owner',
      allowedCompanies: [TEST_COMPANY], allowedModules: [] });
    hrU = await makeUser({ emailKey: 'rbac_hr', company: TEST_COMPANY, role: 'admin_officer',
      allowedCompanies: [TEST_COMPANY], allowedModules: ['hr'] });
    salesU = await makeUser({ emailKey: 'rbac_sales', company: TEST_COMPANY, role: 'admin_officer',
      allowedCompanies: [TEST_COMPANY], allowedModules: ['sales'] });
  });

  beforeEach(cleanup);
  afterAll(cleanup);

  // ── ISSUE 1: owner is company-scoped, not a global super ──────────────────
  it('owner CANNOT write another company\'s rows (no longer a global super)', async () => {
    const c = clientForToken(ownerU.token);
    const { error } = await c.from('quotations').insert({ id: 'ITEST-RBAC-Q-XCO', company: TEST_COMPANY_B, status: 'Draft' });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/row-level security/i);
  });

  // Lockout-safety: owner keeps FULL write in its OWN company, incl. HR tables,
  // via the company-admin branch even with no 'hr' module.
  it('owner CAN write its own company employees without the hr module (company-admin)', async () => {
    const c = clientForToken(ownerU.token);
    const { error } = await c.from('employees').insert({ id: 'ITEST-RBAC-EMP-OWNER', company: TEST_COMPANY });
    expect(error).toBeNull();
  });

  // ── ISSUE 2: the HR module gate ───────────────────────────────────────────
  it('a user WITH the hr module CAN insert an employee in its company', async () => {
    const c = clientForToken(hrU.token);
    const { error } = await c.from('employees').insert({ id: 'ITEST-RBAC-EMP-HR', company: TEST_COMPANY });
    expect(error).toBeNull();
  });

  it('a sales-only user CANNOT insert an employee (hr module gate blocks it)', async () => {
    const c = clientForToken(salesU.token);
    const { error } = await c.from('employees').insert({ id: 'ITEST-RBAC-EMP-SALES', company: TEST_COMPANY });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/row-level security/i);
  });

  it('a sales-only user CANNOT insert attendance either (hr gate covers attendance)', async () => {
    const c = clientForToken(salesU.token);
    const { error } = await c.from('attendance').insert({ id: 'ITEST-RBAC-ATT-SALES', company: TEST_COMPANY, date: '2026-07-12' });
    expect(error).not.toBeNull();
  });

  it('super_admin CAN insert an employee even with empty allowed_modules', async () => {
    const c = clientForToken(superU.token);
    const { error } = await c.from('employees').insert({ id: 'ITEST-RBAC-EMP-SUPER', company: TEST_COMPANY });
    expect(error).toBeNull();
  });

  // The gate is TARGETED, not a blanket lockout: a sales-only user still writes
  // the shared (non-gated) quotations table in its own company.
  it('the hr gate is targeted — a sales-only user still writes quotations in its company', async () => {
    const c = clientForToken(salesU.token);
    const { error } = await c.from('quotations').insert({ id: 'ITEST-RBAC-Q-SALES', company: TEST_COMPANY, status: 'Draft' });
    expect(error).toBeNull();
  });
});
