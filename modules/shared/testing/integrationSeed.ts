/**
 * integrationSeed.ts — seed + cleanup helpers for integration tests, run with
 * the SERVICE-ROLE client (bypasses RLS) against the LOCAL Supabase.
 *
 * Tests use dedicated company codes (ITEST / ITEST2) so wipeCompany() can clear
 * only their rows between runs without touching anything else in the local DB.
 */
import { serviceClient, anonClient } from './integrationClient';

export const TEST_COMPANY = 'ITEST';
export const TEST_COMPANY_B = 'ITEST2';

export interface TestUser { id: string; email: string; token: string; }

/**
 * Create (or recreate) a real authenticated user + its user_profiles row, and
 * return a JWT. `auth_user_companies()` / `auth_user_is_super()` read that
 * profile, so this is how RLS + the SECURITY DEFINER company guards can be
 * exercised as a specific logged-in caller. Idempotent across reruns.
 */
export const makeUser = async (opts: {
  emailKey: string;
  company: string;
  role?: string;
  allowedCompanies?: string[];
}): Promise<TestUser> => {
  const email = `itest_${opts.emailKey}@itest.local`;
  const password = 'itest-Password123!';

  // Clean any stale auth user + profile for this email so reruns start fresh.
  await serviceClient.from('user_profiles').delete().eq('email', email);
  const { data: list } = await serviceClient.auth.admin.listUsers();
  const stale = list?.users?.find((u) => u.email === email);
  if (stale) await serviceClient.auth.admin.deleteUser(stale.id);

  const { data: created, error: cErr } = await serviceClient.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (cErr || !created?.user) throw new Error(`makeUser createUser failed: ${cErr?.message}`);
  const id = created.user.id;

  // NOTE: user_profiles has NO `company` column (the live schema uses
  // allowed_companies text[]; profile.company is a phantom). auth_user_companies()
  // reads allowed_companies, so that is what scopes this user.
  const { error: pErr } = await serviceClient.from('user_profiles').upsert({
    id, email,
    allowed_companies: opts.allowedCompanies ?? [opts.company],
    role: opts.role ?? 'sales_manager',
  });
  if (pErr) throw new Error(`makeUser profile failed: ${pErr.message}`);

  const { data: sess, error: sErr } = await anonClient.auth.signInWithPassword({ email, password });
  if (sErr || !sess?.session) throw new Error(`makeUser signIn failed: ${sErr?.message}`);

  return { id, email, token: sess.session.access_token };
};

/** Tables the integration suites write, in FK-safe delete order. */
const WIPE_TABLES = ['payment_receipts', 'ledger', 'production_pieces', 'invoices', 'quotations', 'clients'];

/** Delete every row belonging to a test company (idempotent; safe on empty). */
export const wipeCompany = async (company: string): Promise<void> => {
  for (const t of WIPE_TABLES) {
    await serviceClient.from(t).delete().eq('company', company);
  }
};

export interface SeedInvoiceInput {
  id: string;
  company?: string;
  totalAmount?: number;
  receivedAmount?: number;
  status?: string;
  clientId?: string;
  clientName?: string;
}

/** Insert one invoice row (+ its parent quotation, since order_id is NOT NULL
 *  and FK-references quotations(id)). client_id is left NULL (FK skipped). */
export const seedInvoice = async (input: SeedInvoiceInput): Promise<void> => {
  const company = input.company ?? TEST_COMPANY;
  const total = input.totalAmount ?? 100000;
  const received = input.receivedAmount ?? 0;
  const orderId = `${input.id}-ORD`;

  // invoices.order_id is NOT NULL with an FK → quotations(id); seed the parent.
  const { error: qErr } = await serviceClient.from('quotations').upsert({
    id: orderId, company, status: 'Delivered',
  });
  if (qErr) throw new Error(`seedInvoice(${input.id}) order seed failed: ${qErr.message}`);

  const { error } = await serviceClient.from('invoices').insert({
    id: input.id,
    company,
    order_id: orderId,
    // client_id left NULL — FK to clients(id) is skipped for NULL.
    client_id: input.clientId ?? null,
    client_name: input.clientName ?? 'Integration Test Client',
    date: '2026-07-12',
    due_date: '2026-08-12',
    total_amount: total,
    received_amount: received,
    balance: total - received,
    status: input.status ?? 'Outstanding',
    items: [],
    service_charges: [],
    data: {},
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`seedInvoice(${input.id}) failed: ${error.message}`);
};

/** Insert one quotation row (the parent "order" for invoices). Minimal set. */
export const seedQuotation = async (id: string, company = TEST_COMPANY, status = 'Draft'): Promise<void> => {
  const { error } = await serviceClient.from('quotations').upsert({ id, company, status });
  if (error) throw new Error(`seedQuotation(${id}) failed: ${error.message}`);
};

export interface SeedPieceInput {
  id: string;
  company?: string;
  status?: string;
  orderId?: string;
}

/** Insert one production_pieces row (minimal flat set the live schema needs). */
export const seedPiece = async (input: SeedPieceInput): Promise<void> => {
  const { error } = await serviceClient.from('production_pieces').insert({
    id: input.id,
    company: input.company ?? TEST_COMPANY,
    order_id: input.orderId ?? 'ITEST-ORDER',
    item_index: 0,
    status: input.status ?? 'Cut',
    data: {},
    last_updated: new Date().toISOString(),
  });
  if (error) throw new Error(`seedPiece(${input.id}) failed: ${error.message}`);
};

export interface GlRowInput {
  id: string;
  company?: string;
  /** debit/credit legs; defaults to a balanced 5000 Dr Cash / Cr AR pair */
  details?: Array<{ account_id?: string; debit: number; credit: number }>;
  approvedBy?: string;
  createdBy?: string;
}

/** Build a ledger row object for process_payment_receipt_v2's p_gl_row. */
export const glRow = (input: GlRowInput): Record<string, unknown> => ({
  id: input.id,
  company: input.company ?? TEST_COMPANY,
  doc_type: 'RV',
  doc_date: '2026-07-12',
  date: '2026-07-12',
  description: 'Integration test cash receipt',
  reference_id: 'ITEST',
  status: 'Posted',
  details: input.details ?? [
    { account_id: '1111',  debit: 5000, credit: 0 },
    { account_id: '12210', debit: 0,    credit: 5000 },
  ],
  data: {},
  approved_by: input.approvedBy ?? 'checker@itest',
  created_by: input.createdBy ?? 'system-auto',
  updated_at: new Date().toISOString(),
});
