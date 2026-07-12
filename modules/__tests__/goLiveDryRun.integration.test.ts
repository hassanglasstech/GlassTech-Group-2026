/**
 * goLiveDryRun.integration.test.ts — a full go-live "machinery proof" against a
 * REAL local Supabase: seed assumed-but-balanced opening balances, then drive 3
 * sales orders draft→execution through the SAME atomic RPCs the app UI calls
 * (post_invoice_atomic revenue+COGS, process_payment_receipt_v2 cash receipt,
 * consume_glass_stock production WIP), plus a payroll accrual — and prove the
 * WHOLE ledger reconciles: every voucher balances AND the company trial balance
 * nets to exactly zero (Σ debit = Σ credit) across all vouchers.
 *
 * The opening-balance numbers are ASSUMED (they only need to balance) — this
 * proves the transaction machinery + double-entry integrity end-to-end, not the
 * real books. Run against a LOCAL Supabase (Docker). Skips if the stack is down.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient, clientForToken, isTestDbReachable } from '@/modules/shared/testing/integrationClient';
import { wipeCompany, seedQuotation, makeUser, TEST_COMPANY, type TestUser } from '@/modules/shared/testing/integrationSeed';

const dbUp = await isTestDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Local Supabase not reachable — skipping goLiveDryRun. Run `npm run supabase:start`.');
}

type Leg = { account_id: string; debit: number; credit: number };

/** Post a balanced manual JV directly (system-auto bypasses the maker-checker
 *  trigger; the balance trigger still enforces Σdebit = Σcredit). */
const postJV = async (id: string, description: string, details: Leg[]): Promise<void> => {
  const { error } = await serviceClient.from('ledger').insert({
    id, company: TEST_COMPANY, doc_type: 'JV', doc_date: '2026-07-12', date: '2026-07-12',
    description, reference_id: 'DRYRUN', status: 'Posted', details,
    data: {}, created_by: 'system-auto', updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`postJV(${id}) failed: ${error.message}`);
};

/** Invoice GL = revenue + COGS in one balanced delivery voucher. */
const invoiceGL = (id: string, sale: number, cost: number): Record<string, unknown> => ({
  id, company: TEST_COMPANY, doc_type: 'INV', doc_date: '2026-07-12', date: '2026-07-12',
  description: 'Delivery invoice (revenue + COGS)', reference_id: 'DRYRUN', status: 'Posted',
  details: [
    { account_id: '12210', debit: sale, credit: 0 },     // Dr AR
    { account_id: '4120',  debit: 0,    credit: sale },   // Cr Revenue
    { account_id: '5114',  debit: cost, credit: 0 },      // Dr COGS
    { account_id: '11511', debit: 0,    credit: cost },   // Cr Inventory (COGS relief)
  ],
  data: {}, created_by: 'system-auto', updated_at: new Date().toISOString(),
});

const receiptGL = (id: string, amount: number): Record<string, unknown> => ({
  id, company: TEST_COMPANY, doc_type: 'RV', doc_date: '2026-07-12', date: '2026-07-12',
  description: 'Cash receipt', reference_id: 'DRYRUN', status: 'Posted',
  details: [
    { account_id: '1111',  debit: amount, credit: 0 },    // Dr Cash
    { account_id: '12210', debit: 0,      credit: amount }, // Cr AR
  ],
  data: {}, approved_by: 'checker@dryrun', created_by: 'system-auto', updated_at: new Date().toISOString(),
});

const seedMaterial = async (id: string, qty: number): Promise<void> => {
  const { error } = await serviceClient.from('store_items').insert({
    id, company: TEST_COMPANY, name: 'DryRun Glass Sheet', data: { unrestrictedQty: qty, quantity: qty },
  });
  if (error) throw new Error(`seedMaterial(${id}) failed: ${error.message}`);
};

describe.skipIf(!dbUp)('GO-LIVE DRY RUN — opening balances → 3 orders draft→execution → trial balance reconciles', () => {
  let authed: SupabaseClient;
  let user: TestUser;

  beforeAll(async () => {
    if (!dbUp) return;
    await wipeCompany(TEST_COMPANY);
    await serviceClient.from('store_items').delete().eq('company', TEST_COMPANY);
    await serviceClient.from('cutting_sessions').delete().eq('company', TEST_COMPANY);
    user = await makeUser({ emailKey: 'dryrun', company: TEST_COMPANY, allowedCompanies: [TEST_COMPANY], role: 'sales_manager' });
    authed = clientForToken(user.token);
  });

  it('runs the full cycle and the company trial balance nets to zero', async () => {
    // ── 1. OPENING BALANCES (assumed, balanced) ───────────────────────────
    // Dr Cash 500k + Dr AR 300k + Dr Inventory 300k = Cr Capital 1,100k
    await postJV('DRYRUN-OB', 'Opening balances (assumed)', [
      { account_id: '1111',  debit: 500000, credit: 0 },
      { account_id: '12210', debit: 300000, credit: 0 },
      { account_id: '11511', debit: 300000, credit: 0 },
      { account_id: '31100', debit: 0,      credit: 1100000 },
    ]);

    // ── 2. THREE SALES ORDERS: quotation → delivery invoice (rev+COGS) → receipt
    const orders = [
      { q: 'DRYRUN-Q1', inv: 'DRYRUN-INV1', sale: 100000, cost: 60000, receipt: 100000 }, // fully paid
      { q: 'DRYRUN-Q2', inv: 'DRYRUN-INV2', sale: 150000, cost: 90000, receipt: 100000 }, // partly paid
      { q: 'DRYRUN-Q3', inv: 'DRYRUN-INV3', sale:  80000, cost: 50000, receipt: 0 },       // unpaid
    ];
    for (const o of orders) {
      await seedQuotation(o.q, TEST_COMPANY, 'Delivered');
      const inv = await serviceClient.rpc('post_invoice_atomic', {
        p_payload: {
          company: TEST_COMPANY,
          invoice_row: { id: o.inv, company: TEST_COMPANY, order_id: o.q, total_amount: o.sale, received_amount: 0, balance: o.sale, status: 'Outstanding', date: '2026-07-12' },
          main_ledger_row: invoiceGL(`${o.inv}-GL`, o.sale, o.cost),
        },
      });
      expect(inv.error, `invoice ${o.inv}`).toBeNull();

      if (o.receipt > 0) {
        const r = await authed.rpc('process_payment_receipt_v2', {
          receipt_data: { id: `${o.inv}-RCPT`, amount: o.receipt, date: '2026-07-12', method: 'Cash', reference: o.inv },
          p_invoice_id: o.inv, p_gl_row: receiptGL(`${o.inv}-RGL`, o.receipt),
        });
        expect(r.error, `receipt ${o.inv}`).toBeNull();
      }
    }

    // Invoice statuses reflect the payments
    const invRows = await serviceClient.from('invoices').select('id,received_amount,balance,status').in('id', orders.map(o => o.inv));
    const byId = Object.fromEntries((invRows.data ?? []).map(r => [r.id, r]));
    expect(byId['DRYRUN-INV1'].status).toBe('Paid');
    expect(byId['DRYRUN-INV2'].status).toBe('Partial');
    expect(byId['DRYRUN-INV2'].balance).toBe(50000);
    expect(byId['DRYRUN-INV3'].status).toBe('Outstanding');

    // ── 3. PRODUCTION: consume glass stock → WIP GL (Dr WIP / Cr Inventory) ─
    await seedMaterial('DRYRUN-MAT', 100);
    await serviceClient.from('cutting_sessions').insert({ id: 'DRYRUN-SESS', company: TEST_COMPANY, job_order_id: 'DRYRUN-JOB', cutter_id: 'DRYRUN-CUT' });
    const consume = await serviceClient.rpc('consume_glass_stock', {
      p_company: TEST_COMPANY, p_session_id: 'DRYRUN-SESS',
      p_consumption: [{ material_id: 'DRYRUN-MAT', qty: 40 }],
      p_gl_row: {
        id: 'DRYRUN-WIPGL', company: TEST_COMPANY, doc_type: 'JV', doc_date: '2026-07-12', date: '2026-07-12',
        description: 'Glass consumed to WIP', reference_id: 'DRYRUN', status: 'Posted',
        details: [
          { account_id: '11523', debit: 40000, credit: 0 },   // Dr WIP
          { account_id: '11511', debit: 0,     credit: 40000 }, // Cr Inventory
        ],
        data: {}, created_by: 'system-auto', updated_at: new Date().toISOString(),
      },
      p_stock_rows: [{ id: 'DRYRUN-SL', data: { material_id: 'DRYRUN-MAT', qty: 40 } }],
      p_session_row: { id: 'DRYRUN-SESS', data: { status: 'Closed' } },
    });
    expect(consume.error, 'consume_glass_stock').toBeNull();

    // ── 4. PAYROLL ACCRUAL (Dr WIP-labour + Dr Admin salary / Cr Payable) ──
    await postJV('DRYRUN-PAY', 'Payroll accrual', [
      { account_id: '11523', debit: 30000, credit: 0 },   // Dr WIP-Direct-Labour
      { account_id: '52111', debit: 20000, credit: 0 },   // Dr Salaries-Admin
      { account_id: '2211',  debit: 0,     credit: 50000 }, // Cr Salaries Payable
    ]);

    // ── 5. TRIAL BALANCE — flatten every voucher's legs, sum per account ───
    const { data: allGl, error: glErr } = await serviceClient.from('ledger').select('details').eq('company', TEST_COMPANY);
    expect(glErr).toBeNull();
    const tb: Record<string, { debit: number; credit: number }> = {};
    let totalDr = 0, totalCr = 0;
    for (const row of allGl ?? []) {
      for (const leg of (row.details as Leg[] ?? [])) {
        const a = leg.account_id;
        tb[a] ??= { debit: 0, credit: 0 };
        tb[a].debit += leg.debit || 0;
        tb[a].credit += leg.credit || 0;
        totalDr += leg.debit || 0;
        totalCr += leg.credit || 0;
      }
    }

    // Print a readable trial balance for the operator.
    const lines = Object.entries(tb).sort(([a], [b]) => a.localeCompare(b))
      .map(([acc, v]) => `  ${acc.padEnd(8)}  Dr ${String(v.debit).padStart(10)}   Cr ${String(v.credit).padStart(10)}   net ${String(v.debit - v.credit).padStart(11)}`);
    // eslint-disable-next-line no-console
    console.log(`\n===== GO-LIVE DRY RUN — TRIAL BALANCE (company ${TEST_COMPANY}) =====\n${lines.join('\n')}\n  ${''.padEnd(8)}  ${'—'.repeat(38)}\n  TOTALS    Dr ${String(totalDr).padStart(10)}   Cr ${String(totalCr).padStart(10)}   diff ${String(totalDr - totalCr).padStart(10)}\n=====================================================================\n`);

    // ── PROOF: the whole ledger reconciles ────────────────────────────────
    expect(totalDr).toBe(totalCr);           // trial balance nets to zero
    expect(totalDr).toBeGreaterThan(0);      // and it actually posted vouchers
    // Expected grand total: OB 1,100,000 + 3 invoices (100+60 + 150+90 + 80+50)=530,000
    //   + 2 receipts (100k+100k)=200,000 + WIP 40,000 + payroll 50,000 = 1,920,000 each side.
    expect(totalDr).toBe(1920000);
  });
});
