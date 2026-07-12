/**
 * rlsIsolation.integration.test.ts — REAL database proof of cross-company
 * isolation, as an authenticated user (not the app-side .eq mock).
 *
 * Covers:
 *   - table RLS on invoices: a user of company A cannot SELECT or INSERT
 *     company B's rows (policies keyed on auth_user_companies()).
 *   - the SECURITY DEFINER company guards added in the RBAC migration:
 *       • update_piece_status_atomic (P0 #10-C) — can't restatus B's piece
 *       • process_payment_receipt_v2 (P0 #10-D) — can't post to B's invoice
 *
 * Run against a LOCAL Supabase (Docker). Skips cleanly if the stack is down.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { serviceClient, clientForToken, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import {
  makeUser, seedInvoice, seedPiece, glRow, wipeCompany,
  TEST_COMPANY, TEST_COMPANY_B, type TestUser,
} from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping rlsIsolation. Run `npm run supabase:start`.');
}

describe.skipIf(!dbUp)('RLS + cross-company guards — real DB (P0 #5 / #10)', () => {
  let userA: TestUser;

  beforeAll(async () => {
    if (!dbUp) return;
    // A non-super user whose only allowed company is ITEST.
    userA = await makeUser({ emailKey: 'a', company: TEST_COMPANY, allowedCompanies: [TEST_COMPANY], role: 'sales_manager' });
  });

  beforeEach(async () => {
    await wipeCompany(TEST_COMPANY);
    await wipeCompany(TEST_COMPANY_B);
  });

  it('RLS SELECT: user sees ONLY their own company invoices', async () => {
    await seedInvoice({ id: 'ITEST-INV-A', company: TEST_COMPANY });
    await seedInvoice({ id: 'ITEST-INV-B', company: TEST_COMPANY_B });

    const a = clientForToken(userA.token);
    const { data, error } = await a.from('invoices').select('id,company');

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain('ITEST-INV-A');      // own row visible
    expect(ids).not.toContain('ITEST-INV-B');  // other company invisible
    expect((data ?? []).some((r) => r.company === TEST_COMPANY_B)).toBe(false);
  });

  it('RLS INSERT: user cannot create a row stamped with another company', async () => {
    const a = clientForToken(userA.token);
    const { error } = await a.from('invoices').insert({ id: 'ITEST-INV-X', company: TEST_COMPANY_B });
    expect(error).not.toBeNull();              // WITH CHECK violation
  });

  it('piece guard: user cannot restatus another company\'s piece (42501)', async () => {
    await seedPiece({ id: 'ITEST-P-B', company: TEST_COMPANY_B, status: 'Cut' });

    const a = clientForToken(userA.token);
    const { error } = await a.rpc('update_piece_status_atomic', {
      p_piece_id: 'ITEST-P-B', p_new_status: 'QC-Pending', p_changed_by: 'userA',
    });

    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/not_authorized|outside caller/i);
  });

  it('receipt guard: user cannot post a receipt to another company\'s invoice', async () => {
    await seedInvoice({ id: 'ITEST-INV-B2', company: TEST_COMPANY_B, totalAmount: 50000 });

    const a = clientForToken(userA.token);
    const { error } = await a.rpc('process_payment_receipt_v2', {
      receipt_data: { id: 'ITEST-RCPT-B', amount: 1000, date: '2026-07-12', method: 'Cash', reference: 'X' },
      p_invoice_id: 'ITEST-INV-B2',
      p_gl_row: null,
    });

    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/cross-company|not in caller/i);
  });
});

// ── RLS breadth: the same isolation must hold on the other core money tables,
//    not just invoices — proves the strict policies genuinely landed everywhere.
describe.skipIf(!dbUp)('RLS breadth — isolation on core money tables (P0 #5)', () => {
  let userA: TestUser;

  beforeAll(async () => {
    if (!dbUp) return;
    userA = await makeUser({ emailKey: 'breadth', company: TEST_COMPANY, allowedCompanies: [TEST_COMPANY], role: 'sales_manager' });
  });

  const seeders: Record<string, (id: string, company: string) => Promise<void>> = {
    quotations: async (id, company) => {
      const { error } = await serviceClient.from('quotations').insert({ id, company, status: 'Draft' });
      if (error) throw new Error(`seed quotations ${id}: ${error.message}`);
    },
    production_pieces: (id, company) => seedPiece({ id, company, status: 'Cut' }),
    ledger: async (id, company) => {
      const { error } = await serviceClient.from('ledger').insert(glRow({ id, company }));
      if (error) throw new Error(`seed ledger ${id}: ${error.message}`);
    },
  };

  for (const [table, seed] of Object.entries(seeders)) {
    it(`${table}: a company-A user sees only company-A rows`, async () => {
      await wipeCompany(TEST_COMPANY);
      await wipeCompany(TEST_COMPANY_B);
      await seed(`ITEST-${table}-A`, TEST_COMPANY);
      await seed(`ITEST-${table}-B`, TEST_COMPANY_B);

      const a = clientForToken(userA.token);
      const { data, error } = await a.from(table).select('id,company');

      expect(error).toBeNull();
      const ids = (data ?? []).map((r) => r.id);
      expect(ids).toContain(`ITEST-${table}-A`);
      expect(ids).not.toContain(`ITEST-${table}-B`);
      expect((data ?? []).some((r) => r.company === TEST_COMPANY_B)).toBe(false);
    });
  }
});
