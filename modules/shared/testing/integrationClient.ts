/**
 * integrationClient.ts — real supabase-js clients for INTEGRATION tests that
 * run against a LOCAL Supabase (Docker: `supabase start`), never prod.
 *
 * Unlike the unit-test spy (supabaseSpy.ts), these tests hit an actual Postgres
 * with the real schema + RPCs + RLS applied from supabase/migrations, so they
 * prove the *database* logic: atomic RPCs, ledger balance, and RLS isolation.
 *
 * Keys: `supabase start` prints an API URL + anon + service_role key. Copy them
 * into `.env.test` (see .env.test.example). The values below are the standard
 * Supabase local demo keys — identical on every machine — used as fallback so
 * the suite runs out-of-the-box against a default local stack.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Standard Supabase LOCAL demo keys (same on every `supabase start`). These are
// NOT secrets — they only work against 127.0.0.1. Prod keys never live here.
const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';
const LOCAL_SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.M2d2z4SFn5C7HlJlaSLfrzuYim9nbY_XI40uWFN3hEE';

export const TEST_URL     = process.env.SUPABASE_TEST_URL     ?? LOCAL_URL;
export const TEST_ANON    = process.env.SUPABASE_TEST_ANON_KEY ?? LOCAL_ANON;
export const TEST_SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY ?? LOCAL_SERVICE;

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };

/**
 * Service-role client — BYPASSES RLS. Use ONLY for seeding/cleanup and for
 * asserting final DB state, never to prove isolation.
 */
export const serviceClient: SupabaseClient = createClient(TEST_URL, TEST_SERVICE, noPersist);

/** Anonymous (anon-key) client — subject to RLS as an unauthenticated caller. */
export const anonClient: SupabaseClient = createClient(TEST_URL, TEST_ANON, noPersist);

/**
 * A client authenticated as a specific access token (JWT). RLS + auth.uid()
 * evaluate as that user — this is how isolation is proven for real.
 */
export const clientForToken = (accessToken: string): SupabaseClient =>
  createClient(TEST_URL, TEST_ANON, {
    ...noPersist,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

/**
 * Is a local Supabase reachable? Integration suites call this in beforeAll and
 * skip (with a clear message) when Docker/`supabase start` isn't running, so a
 * developer without the stack up doesn't see a wall of connection errors.
 */
export const isTestDbReachable = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${TEST_URL}/rest/v1/`, {
      headers: { apikey: TEST_ANON },
    });
    return res.ok || res.status === 400 || res.status === 404;
  } catch {
    return false;
  }
};
