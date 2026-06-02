#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/load-test.js — Sprint 34 (Performance at Scale)
 *
 * Bulk-inserts synthetic ERP rows into Supabase to stress-test the app.
 * Targets the 6-month projection from the sprint spec:
 *   • 36k invoices
 *   • 10k pieces in flight
 *   • Trial balance with 5 years of GL
 *
 * The script writes data with a `__loadtest=true` payload flag so it's
 * easy to nuke later via:
 *   DELETE FROM sales_invoices       WHERE data->>'__loadtest' = 'true';
 *   DELETE FROM production_pieces    WHERE data->>'__loadtest' = 'true';
 *   DELETE FROM ledger               WHERE data->>'__loadtest' = 'true';
 *
 * Or run with `--cleanup` to do that cleanup via REST.
 *
 * Usage:
 *   VITE_SUPABASE_URL=https://xxx.supabase.co \
 *   VITE_SUPABASE_ANON_KEY=eyJ... \
 *   node scripts/load-test.js --invoices 10000 --pieces 1000
 *
 *   # Cleanup after run:
 *   node scripts/load-test.js --cleanup
 *
 * Args:
 *   --invoices N     (default 1000)   — sales_invoices to insert
 *   --pieces  N      (default 100)    — production_pieces to insert
 *   --batch   N      (default 500)    — rows per insert call
 *   --company NAME   (default Glassco)
 *   --cleanup        — delete all __loadtest rows and exit
 *
 * Reports timing per batch + total throughput at end.
 */

const SUPA_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPA_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPA_URL || !SUPA_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or service-role key) must be set.');
  process.exit(1);
}

// ── arg parser ───────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  if (i === argv.length - 1) return true;
  const next = argv[i + 1];
  if (next.startsWith('--')) return true;
  return isNaN(Number(next)) ? next : Number(next);
};

const INVOICES = arg('invoices', 1000);
const PIECES   = arg('pieces',   100);
const BATCH    = arg('batch',    500);
const COMPANY  = arg('company',  'Glassco');
const CLEANUP  = !!arg('cleanup', false);

// ── REST helpers ─────────────────────────────────────────────────────
const restURL = path => `${SUPA_URL}/rest/v1${path}`;
const headers = {
  'apikey':         SUPA_KEY,
  'Authorization':  `Bearer ${SUPA_KEY}`,
  'Content-Type':   'application/json',
  'Prefer':         'return=minimal',
};

const insert = async (table, rows) => {
  const t0 = Date.now();
  const res = await fetch(restURL(`/${table}`), {
    method:  'POST',
    headers,
    body:    JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`insert ${table}: ${res.status} ${body.slice(0, 200)}`);
  }
  return Date.now() - t0;
};

const del = async (table, filter) => {
  const res = await fetch(restURL(`/${table}?${filter}`), { method: 'DELETE', headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`delete ${table}: ${res.status} ${body.slice(0, 200)}`);
  }
};

// ── synthetic data generators ────────────────────────────────────────
const TS = Date.now();
const rnd = (max) => Math.floor(Math.random() * max);
const pad = (n, w) => String(n).padStart(w, '0');

const isoDate = (offsetDays) => {
  const d = new Date(Date.now() - offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
};

const fakeInvoice = (i) => {
  const total = 5000 + rnd(95000);
  const gst   = Math.round(total * 0.17);
  return {
    id:               `LOADTEST-INV-${TS}-${pad(i, 6)}`,
    company:          COMPANY,
    client_id:        `LOADTEST-CL-${pad(i % 200, 4)}`,
    client_name:      `Load Test Client ${i % 200}`,
    invoice_date:     isoDate(rnd(365 * 2)),  // spread over 2 years
    due_date:         isoDate(rnd(365)),
    subtotal:         total,
    gst_amount:       gst,
    total_amount:     total + gst,
    status:           ['Draft', 'Sent', 'Paid', 'Overdue'][rnd(4)],
    data:             { __loadtest: true, batch_ts: TS },
  };
};

const fakePiece = (i) => ({
  id:               `LOADTEST-PCE-${TS}-${pad(i, 6)}`,
  company:          COMPANY,
  order_id:         `LOADTEST-SO-${pad(i % 500, 4)}`,
  description:      `Synthetic piece ${i}`,
  width:            300 + rnd(2000),
  height:           300 + rnd(2000),
  quantity:         1 + rnd(10),
  status:           ['cutting', 'tempering', 'qc', 'packing', 'dispatched'][rnd(5)],
  updated_at:       new Date(Date.now() - rnd(30) * 86400_000).toISOString(),
  data:             { __loadtest: true, batch_ts: TS },
});

// ── runner ───────────────────────────────────────────────────────────
const runBatched = async (name, total, generator, table) => {
  const t0 = Date.now();
  let inserted = 0;
  for (let off = 0; off < total; off += BATCH) {
    const sz = Math.min(BATCH, total - off);
    const rows = Array.from({ length: sz }, (_, k) => generator(off + k));
    try {
      const ms = await insert(table, rows);
      inserted += sz;
      const pct = ((inserted / total) * 100).toFixed(1);
      console.log(`  [${name}] ${pad(inserted, 6)} / ${total}  (${pct}%)  +${sz} in ${ms} ms`);
    } catch (e) {
      console.error(`  [${name}] batch ${off}-${off + sz} failed:`, e.message);
      // stop on schema errors — likely the table column set doesn't match
      if (/PGRST|column|invalid/i.test(e.message)) {
        console.error('  ↳ likely schema mismatch — aborting this table.');
        break;
      }
    }
  }
  const tot = Date.now() - t0;
  const tps = inserted / (tot / 1000);
  console.log(`✓ ${name}: ${inserted} rows in ${(tot / 1000).toFixed(1)}s (${tps.toFixed(0)} rows/sec)`);
  return { inserted, tot };
};

const cleanup = async () => {
  console.log('🧹 Cleaning up __loadtest rows ...');
  for (const t of ['sales_invoices', 'production_pieces', 'ledger']) {
    try {
      await del(t, `data->>__loadtest=eq.true`);
      console.log(`  ✓ purged ${t}`);
    } catch (e) {
      console.error(`  ✗ ${t}:`, e.message);
    }
  }
  console.log('Done.');
};

const main = async () => {
  console.log(`╔═══ Load Test ═════════════════════════════════════════`);
  console.log(`║ Target:    ${SUPA_URL}`);
  console.log(`║ Company:   ${COMPANY}`);
  if (CLEANUP) {
    console.log(`║ Mode:      CLEANUP`);
    console.log(`╚═══════════════════════════════════════════════════════`);
    await cleanup();
    return;
  }
  console.log(`║ Invoices:  ${INVOICES}`);
  console.log(`║ Pieces:    ${PIECES}`);
  console.log(`║ Batch:     ${BATCH}`);
  console.log(`╚═══════════════════════════════════════════════════════\n`);

  const T0 = Date.now();
  if (INVOICES > 0) await runBatched('sales_invoices',    INVOICES, fakeInvoice, 'sales_invoices');
  if (PIECES   > 0) await runBatched('production_pieces', PIECES,   fakePiece,   'production_pieces');

  const tot = ((Date.now() - T0) / 1000).toFixed(1);
  console.log(`\n╔═══ Done in ${tot}s ════════════════════════════════════`);
  console.log(`║ To clean up:`);
  console.log(`║   node scripts/load-test.js --cleanup`);
  console.log(`╚═══════════════════════════════════════════════════════`);
};

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
