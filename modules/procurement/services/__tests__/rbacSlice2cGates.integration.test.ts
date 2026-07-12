/**
 * rbacSlice2cGates.integration.test.ts — REAL-DB proof for RBAC slice 2c
 * (migration 20260712100000_rbac_slice2c_procurement_production_gates.sql):
 * module gates on the procurement + production-floor tables, using the REAL
 * allowed_modules vocabulary.
 *
 *   store_items       → inventory | requisitions | sales | production
 *   vendors           → vendors   | requisitions | sales
 *   purchase_orders   → requisitions | accounts | sales   (on from_company)
 *   production_pieces → production
 *   cutting_sessions  → production   (write-gated; SELECT preserved)
 *
 * Owners bypass (company-admin); super bypasses all. Runs against a LOCAL
 * Supabase (Docker) with all migrations applied. Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { serviceClient, clientForToken, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { makeUser, TEST_COMPANY, TEST_COMPANY_B, type TestUser } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping rbacSlice2cGates. Run `npm run supabase:start`.');
}

const cleanup = async (): Promise<void> => {
  for (const t of ['store_items', 'vendors', 'production_pieces', 'cutting_sessions']) {
    await serviceClient.from(t).delete().in('company', [TEST_COMPANY, TEST_COMPANY_B]);
  }
  await serviceClient.from('purchase_orders').delete().in('from_company', [TEST_COMPANY, TEST_COMPANY_B]);
};

describe.skipIf(!dbUp)('RBAC slice 2c — procurement + production-floor module gates', () => {
  let superU: TestUser, ownerU: TestUser;
  let inventoryU: TestUser, requisitionsU: TestUser, salesU: TestUser, productionU: TestUser, accountsU: TestUser, hrU: TestUser;

  beforeAll(async () => {
    const mk = (key: string, mods: string[], role = 'admin_officer') =>
      makeUser({ emailKey: key, company: TEST_COMPANY, role, allowedCompanies: [TEST_COMPANY], allowedModules: mods });
    superU        = await makeUser({ emailKey: 's2c_super', company: TEST_COMPANY, role: 'super_admin', allowedCompanies: [TEST_COMPANY, TEST_COMPANY_B], allowedModules: [] });
    ownerU        = await makeUser({ emailKey: 's2c_owner', company: TEST_COMPANY, role: 'owner', allowedCompanies: [TEST_COMPANY], allowedModules: [] });
    inventoryU    = await mk('s2c_inv', ['inventory']);
    requisitionsU = await mk('s2c_req', ['requisitions']);
    salesU        = await mk('s2c_sales', ['sales']);
    productionU   = await mk('s2c_prod', ['production']);
    accountsU     = await mk('s2c_acct', ['accounts']);
    hrU           = await mk('s2c_hr', ['hr']);
  });

  beforeEach(cleanup);
  afterAll(cleanup);

  const insStore = (u: TestUser, id: string, company = TEST_COMPANY) =>
    clientForToken(u.token).from('store_items').insert({ id, company, name: 'ITEST' });
  const insVendor = (u: TestUser, id: string) =>
    clientForToken(u.token).from('vendors').insert({ id, company: TEST_COMPANY, name: 'ITEST' });
  const insPO = (u: TestUser, id: string, fromCompany = TEST_COMPANY) =>
    clientForToken(u.token).from('purchase_orders').insert({ id, from_company: fromCompany });
  const insPiece = (u: TestUser, id: string) =>
    clientForToken(u.token).from('production_pieces').insert({ id, company: TEST_COMPANY });
  const insCut = (u: TestUser, id: string) =>
    clientForToken(u.token).from('cutting_sessions').insert({ id, company: TEST_COMPANY, job_order_id: 'ITEST-JOB', cutter_id: 'ITEST-CUT' });

  // ── store_items → {inventory, requisitions, sales, production} ─────────────
  it('store_items: inventory/requisitions/sales/production users CAN; hr CANNOT', async () => {
    expect((await insStore(inventoryU, 'S2C-SI-1')).error).toBeNull();
    expect((await insStore(requisitionsU, 'S2C-SI-2')).error).toBeNull();
    expect((await insStore(salesU, 'S2C-SI-3')).error).toBeNull();
    expect((await insStore(productionU, 'S2C-SI-4')).error).toBeNull();   // cutter consume path
    const noH = await insStore(hrU, 'S2C-SI-5');
    expect(noH.error).not.toBeNull();
    expect(noH.error?.message ?? '').toMatch(/row-level security/i);
  });

  it('store_items: cross-company write is still blocked', async () => {
    const xco = await insStore(requisitionsU, 'S2C-SI-XCO', TEST_COMPANY_B);
    expect(xco.error).not.toBeNull();
  });

  // ── vendors → {vendors, requisitions, sales} ──────────────────────────────
  it('vendors: requisitions/sales users CAN; hr and inventory-only CANNOT', async () => {
    expect((await insVendor(requisitionsU, 'S2C-V-1')).error).toBeNull();
    expect((await insVendor(salesU, 'S2C-V-2')).error).toBeNull();
    expect((await insVendor(hrU, 'S2C-V-3')).error).not.toBeNull();
    expect((await insVendor(inventoryU, 'S2C-V-4')).error).not.toBeNull();  // inventory ∉ vendors gate
  });

  // ── purchase_orders → {requisitions, accounts, sales} (from_company) ───────
  it('purchase_orders: requisitions/accounts/sales users CAN; hr CANNOT', async () => {
    expect((await insPO(requisitionsU, 'S2C-PO-1')).error).toBeNull();
    expect((await insPO(accountsU, 'S2C-PO-2')).error).toBeNull();
    expect((await insPO(salesU, 'S2C-PO-3')).error).toBeNull();
    expect((await insPO(hrU, 'S2C-PO-4')).error).not.toBeNull();
  });

  // ── production_pieces → {production} ──────────────────────────────────────
  it('production_pieces: production user CAN; sales and hr CANNOT', async () => {
    expect((await insPiece(productionU, 'S2C-PP-1')).error).toBeNull();
    expect((await insPiece(salesU, 'S2C-PP-2')).error).not.toBeNull();
    expect((await insPiece(hrU, 'S2C-PP-3')).error).not.toBeNull();
  });

  // ── cutting_sessions → {production} (write-gated; SELECT preserved) ────────
  it('cutting_sessions: production user CAN write; sales CANNOT', async () => {
    expect((await insCut(productionU, 'S2C-CS-1')).error).toBeNull();
    expect((await insCut(salesU, 'S2C-CS-2')).error).not.toBeNull();
  });

  it('cutting_sessions: SELECT is NOT module-gated — a company user still reads', async () => {
    // seed via service-role, then read as an hr user (no production module):
    // reads must remain company-scoped only, not module-gated.
    const { error: seedErr } = await serviceClient.from('cutting_sessions').insert({
      id: 'S2C-CS-READ', company: TEST_COMPANY, job_order_id: 'ITEST-JOB', cutter_id: 'ITEST-CUT',
    });
    expect(seedErr).toBeNull();
    const { data } = await clientForToken(hrU.token).from('cutting_sessions').select('id').eq('id', 'S2C-CS-READ').maybeSingle();
    expect(data?.id).toBe('S2C-CS-READ');
  });

  // ── bypass ────────────────────────────────────────────────────────────────
  it('owner (company-admin) bypasses these gates', async () => {
    expect((await insPiece(ownerU, 'S2C-PP-OWNER')).error).toBeNull();
    expect((await insCut(ownerU, 'S2C-CS-OWNER')).error).toBeNull();
  });

  it('super_admin bypasses these gates even with empty allowed_modules', async () => {
    expect((await insPiece(superU, 'S2C-PP-SUPER')).error).toBeNull();
    expect((await insStore(superU, 'S2C-SI-SUPER')).error).toBeNull();
  });
});
