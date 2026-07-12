/**
 * supabaseSpy.ts — a reusable, recording supabase mock for unit tests.
 *
 * The real `supabase` client is a fluent builder: `from(t).select('*')
 * .eq('company', c).order(...)` finally awaits to `{ data, error }`. This
 * helper reproduces that shape AND records every call, so a test can assert
 * the query was actually scoped (e.g. `.eq('company', 'Glassco')`) or that a
 * specific RPC ran with a given payload — the things company-isolation and
 * atomicity depend on.
 *
 * Usage (delegation pattern, because a vi.mock factory is hoisted above
 * imports and cannot reference a spy built in the test body):
 *
 *   vi.mock('@/src/services/supabaseClient', async () => {
 *     const m = await import('@/modules/shared/testing/supabaseSpy');
 *     return { supabase: m.supabaseMockClient };
 *   });
 *   import { createSupabaseSpy, installSupabaseSpy } from '@/modules/shared/testing/supabaseSpy';
 *
 *   let spy: SupabaseSpy;
 *   beforeEach(() => { spy = createSupabaseSpy({ tableResults: { clients: { data: rows, error: null } } });
 *                      installSupabaseSpy(spy); });
 *   ...
 *   expect(spy.calls.eq).toContainEqual({ table: 'clients', col: 'company', val: 'Glassco' });
 */

export interface SbResult { data: unknown; error: unknown }

export interface SupabaseSpyConfig {
  /** default terminal result when no per-table/rpc override matches */
  result?: SbResult;
  /** result keyed by table name (from(<table>)) */
  tableResults?: Record<string, SbResult>;
  /** result keyed by rpc function name */
  rpcResults?: Record<string, SbResult>;
  /** authenticated user returned by auth.getUser() */
  user?: unknown;
}

export interface SupabaseSpyCalls {
  from: string[];
  select: Array<{ table: string; columns: string }>;
  eq: Array<{ table: string; col: string; val: unknown }>;
  in: Array<{ table: string; col: string; vals: unknown }>;
  upsert: Array<{ table: string; rows: unknown; options?: unknown }>;
  insert: Array<{ table: string; rows: unknown }>;
  update: Array<{ table: string; rows: unknown }>;
  delete: Array<{ table: string }>;
  rpc: Array<{ name: string; payload: unknown }>;
}

export interface SupabaseSpy {
  client: {
    from: (table: string) => SbChain;
    rpc: (name: string, payload?: unknown) => Promise<SbResult>;
    auth: { getUser: () => Promise<{ data: { user: unknown }; error: null }> };
  };
  calls: SupabaseSpyCalls;
}

/** A chainable, thenable query builder bound to one table. */
interface SbChain extends PromiseLike<SbResult> {
  select: (columns?: string) => SbChain;
  eq: (col: string, val: unknown) => SbChain;
  neq: (col: string, val: unknown) => SbChain;
  in: (col: string, vals: unknown) => SbChain;
  is: (col: string, val: unknown) => SbChain;
  gte: (col: string, val: unknown) => SbChain;
  lte: (col: string, val: unknown) => SbChain;
  gt: (col: string, val: unknown) => SbChain;
  lt: (col: string, val: unknown) => SbChain;
  ilike: (col: string, val: unknown) => SbChain;
  like: (col: string, val: unknown) => SbChain;
  order: (col: string, opts?: unknown) => SbChain;
  limit: (n: number) => SbChain;
  range: (a: number, b: number) => SbChain;
  or: (expr: string) => SbChain;
  upsert: (rows: unknown, options?: unknown) => SbChain;
  insert: (rows: unknown) => SbChain;
  update: (rows: unknown) => SbChain;
  delete: () => SbChain;
  single: () => Promise<SbResult>;
  maybeSingle: () => Promise<SbResult>;
}

export const createSupabaseSpy = (config: SupabaseSpyConfig = {}): SupabaseSpy => {
  const calls: SupabaseSpyCalls = {
    from: [], select: [], eq: [], in: [], upsert: [], insert: [], update: [], delete: [], rpc: [],
  };
  const defaultResult: SbResult = config.result ?? { data: [], error: null };
  const resultFor = (table: string): SbResult => config.tableResults?.[table] ?? defaultResult;

  const makeChain = (table: string): SbChain => {
    const result = () => Promise.resolve(resultFor(table));
    const chain: SbChain = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (onFulfilled: any, onRejected?: any) => result().then(onFulfilled, onRejected),
      select: (columns = '*') => { calls.select.push({ table, columns }); return chain; },
      eq: (col, val) => { calls.eq.push({ table, col, val }); return chain; },
      neq: () => chain,
      in: (col, vals) => { calls.in.push({ table, col, vals }); return chain; },
      is: () => chain,
      gte: () => chain,
      lte: () => chain,
      gt: () => chain,
      lt: () => chain,
      ilike: () => chain,
      like: () => chain,
      order: () => chain,
      limit: () => chain,
      range: () => chain,
      or: () => chain,
      upsert: (rows, options) => { calls.upsert.push({ table, rows, options }); return chain; },
      insert: (rows) => { calls.insert.push({ table, rows }); return chain; },
      update: (rows) => { calls.update.push({ table, rows }); return chain; },
      delete: () => { calls.delete.push({ table }); return chain; },
      single: () => result(),
      maybeSingle: () => result(),
    };
    return chain;
  };

  const client: SupabaseSpy['client'] = {
    from: (table: string) => { calls.from.push(table); return makeChain(table); },
    rpc: (name: string, payload?: unknown) => {
      calls.rpc.push({ name, payload });
      return Promise.resolve(config.rpcResults?.[name] ?? { data: null, error: null });
    },
    auth: { getUser: () => Promise.resolve({ data: { user: config.user ?? null }, error: null }) },
  };

  return { client, calls };
};

// ── Delegation shim so a hoisted vi.mock factory can point at whatever spy
//    the current test installed in beforeEach. ────────────────────────────
let _current: SupabaseSpy | null = null;

export const installSupabaseSpy = (spy: SupabaseSpy): void => { _current = spy; };

const notInstalled = (): never => {
  throw new Error('supabaseMockClient used before installSupabaseSpy() — call it in beforeEach');
};

export const supabaseMockClient = {
  from: (table: string) => (_current ?? notInstalled()).client.from(table),
  rpc: (name: string, payload?: unknown) => (_current ?? notInstalled()).client.rpc(name, payload),
  auth: {
    getUser: () =>
      _current
        ? _current.client.auth.getUser()
        : Promise.resolve({ data: { user: null }, error: null }),
  },
};
