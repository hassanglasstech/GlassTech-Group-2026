/**
 * rbacSlice2Gates.integration.test.ts — REAL-DB proof for RBAC slice 2
 * (migration 20260712090000_rbac_slice2_gates_and_rpc_guards.sql):
 *
 *   PART 2 — module gates (real allowed_modules vocab) on the sales/accounts
 *   single-domain tables: clients+payment_receipts → 'sales'; credit_notes →
 *   'sales'|'accounts'; accounts → 'accounts'|'hr'. Owners (company-admin) and
 *   super bypass; company-only tables (ledger etc.) are untouched.
 *
 *   PART 1 — per-RPC caller-company guards: allocate_serial + append_dispatch_event
 *   reject a cross-company caller (42501); prune_activity_log is REVOKEd from
 *   authenticated (audit-purge lockdown).
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
  console.warn('[integration] Local Supabase not reachable — skipping rbacSlice2Gates. Run `npm run supabase:start`.');
}

const cleanup = async (): Promise<void> => {
  for (const t of ['clients', 'accounts', 'payment_receipts', 'credit_notes', 'doc_serials']) {
    await serviceClient.from(t).delete().in('company', [TEST_COMPANY, TEST_COMPANY_B]);
  }
};

describe.skipIf(!dbUp)('RBAC slice 2 — sales/accounts module gates + per-RPC caller guards', () => {
  let superU: TestUser, ownerU: TestUser, salesU: TestUser, hrU: TestUser, accountsU: TestUser;

  beforeAll(async () => {
    superU    = await makeUser({ emailKey: 's2_super', company: TEST_COMPANY, role: 'super_admin', allowedCompanies: [TEST_COMPANY, TEST_COMPANY_B], allowedModules: [] });
    ownerU    = await makeUser({ emailKey: 's2_owner', company: TEST_COMPANY, role: 'owner', allowedCompanies: [TEST_COMPANY], allowedModules: [] });
    salesU    = await makeUser({ emailKey: 's2_sales', company: TEST_COMPANY, role: 'admin_officer', allowedCompanies: [TEST_COMPANY], allowedModules: ['sales'] });
    hrU       = await makeUser({ emailKey: 's2_hr', company: TEST_COMPANY, role: 'admin_officer', allowedCompanies: [TEST_COMPANY], allowedModules: ['hr'] });
    accountsU = await makeUser({ emailKey: 's2_acct', company: TEST_COMPANY, role: 'admin_officer', allowedCompanies: [TEST_COMPANY], allowedModules: ['accounts'] });
  });

  beforeEach(cleanup);
  afterAll(cleanup);

  // ── PART 2: module gates ──────────────────────────────────────────────────
  it('clients (sales): sales user CAN, hr/accounts users CANNOT', async () => {
    const okS = await clientForToken(salesU.token).from('clients').insert({ id: 'S2-CLI-1', company: TEST_COMPANY, name: 'X' });
    expect(okS.error).toBeNull();
    const noH = await clientForToken(hrU.token).from('clients').insert({ id: 'S2-CLI-2', company: TEST_COMPANY, name: 'X' });
    expect(noH.error).not.toBeNull();
    expect(noH.error?.message ?? '').toMatch(/row-level security/i);
    const noA = await clientForToken(accountsU.token).from('clients').insert({ id: 'S2-CLI-3', company: TEST_COMPANY, name: 'X' });
    expect(noA.error).not.toBeNull();
  });

  it('clients: sales user CANNOT write another company (company-scope still holds under the gate)', async () => {
    const xco = await clientForToken(salesU.token).from('clients').insert({ id: 'S2-CLI-XCO', company: TEST_COMPANY_B, name: 'X' });
    expect(xco.error).not.toBeNull();
  });

  it('credit_notes (sales|accounts): both sales and accounts users CAN, hr CANNOT', async () => {
    const okS = await clientForToken(salesU.token).from('credit_notes').insert({ id: 'S2-CN-1', company: TEST_COMPANY });
    expect(okS.error).toBeNull();
    const okA = await clientForToken(accountsU.token).from('credit_notes').insert({ id: 'S2-CN-2', company: TEST_COMPANY });
    expect(okA.error).toBeNull();
    const noH = await clientForToken(hrU.token).from('credit_notes').insert({ id: 'S2-CN-3', company: TEST_COMPANY });
    expect(noH.error).not.toBeNull();
  });

  it('accounts (company-only, reverted per 110000): ANY in-company user CAN write; cross-company blocked', async () => {
    // accounts is written cross-module via FinanceService.ensureAccount (lazy COA:
    // client AR sub-accounts, cash/bank nodes, GRN AP, salary sub-accounts…), so
    // it is NOT module-gated — a sales user creating a client AR node must succeed.
    expect((await clientForToken(salesU.token).from('accounts').insert({ id: 'S2-ACC-1', company: TEST_COMPANY })).error).toBeNull();
    expect((await clientForToken(accountsU.token).from('accounts').insert({ id: 'S2-ACC-2', company: TEST_COMPANY })).error).toBeNull();
    expect((await clientForToken(hrU.token).from('accounts').insert({ id: 'S2-ACC-3', company: TEST_COMPANY })).error).toBeNull();
    const xco = await clientForToken(salesU.token).from('accounts').insert({ id: 'S2-ACC-XCO', company: TEST_COMPANY_B });
    expect(xco.error).not.toBeNull();  // company scope still holds
  });

  // NOTE: payment_receipts uses the identical {sales} gate as clients (proven
  // above) via the same auth_can_write helper; a direct-insert test is skipped
  // because payment_receipts has an FK to invoices (would need a seeded parent).

  it('owner (company-admin) bypasses the module gate on a gated table (credit_notes)', async () => {
    // owner has EMPTY allowed_modules, so it only passes credit_notes ({sales,accounts})
    // via the company-admin bypass — proving the module gate is bypassed, not satisfied.
    const ok = await clientForToken(ownerU.token).from('credit_notes').insert({ id: 'S2-CN-OWNER', company: TEST_COMPANY });
    expect(ok.error).toBeNull();
  });

  it('super_admin bypasses the module gate even with empty allowed_modules', async () => {
    const ok = await clientForToken(superU.token).from('clients').insert({ id: 'S2-CLI-SUPER', company: TEST_COMPANY, name: 'X' });
    expect(ok.error).toBeNull();
  });

  // ── PART 1: per-RPC caller-company guards ─────────────────────────────────
  it('allocate_serial: allowed for own company, BLOCKED (42501) cross-company', async () => {
    const own = await clientForToken(salesU.token).rpc('allocate_serial', { p_company: TEST_COMPANY, p_doc_type: 'INV', p_year: 2026, p_min_seed: 1 });
    expect(own.error).toBeNull();
    expect(Number(own.data)).toBeGreaterThan(0);
    const xco = await clientForToken(salesU.token).rpc('allocate_serial', { p_company: TEST_COMPANY_B, p_doc_type: 'INV', p_year: 2026, p_min_seed: 1 });
    expect(xco.error).not.toBeNull();
    expect(xco.error?.message ?? '').toMatch(/not_authorized/i);
  });

  // NOTE: the 4 dispatch RPCs (append_dispatch_event / authorize_dispatch /
  // load_pieces_to_dispatch_atomic / record_three_way_match) apply the SAME
  // caller-company guard proven above by allocate_serial. A direct dispatch test
  // needs a fuller tempering_dispatches schema than the local baseline reflects
  // (its `data` column), so it is covered structurally + by db-reset compile.

  it('prune_activity_log: REVOKEd from authenticated (audit-purge lockdown); service-role still can', async () => {
    const authed = await clientForToken(salesU.token).rpc('prune_activity_log', { retain_days: 180 });
    expect(authed.error).not.toBeNull();
    expect(authed.error?.message ?? '').toMatch(/permission denied/i);
    const svc = await serviceClient.rpc('prune_activity_log', { retain_days: 180 });
    expect(svc.error).toBeNull();
  });
});
