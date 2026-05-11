#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/nightly-export.js — Sprint 32 (Backup + DR)
 *
 * Off-site backup script. Designed to run on a Linux server (Hassan's
 * NAS / a small EC2 / a home Raspberry Pi) under cron at 03:00 PKT,
 * one hour after the in-DB pg_cron snapshot fires.
 *
 * What it does:
 *   1. Hits the Supabase REST endpoint to list all snapshots from the
 *      last 24 hours that haven't been mirrored locally yet
 *      (erp_snapshot_summary view).
 *   2. For each snapshot, calls erp_snapshot_export(id) RPC to pull
 *      the full JSONB payload.
 *   3. Writes one gzipped JSON file per snapshot under OUT_DIR with
 *      naming   YYYY-MM-DD_HHMMSS_<company>_<label>.json.gz
 *   4. Prunes locally — keeps only the most recent KEEP_DAYS files.
 *
 * Why off-site?
 *   • Supabase PITR + pg_cron snapshots cover Supabase failures.
 *   • If Supabase project itself is deleted (account compromise,
 *     billing lapse, accidental terraform destroy), only an off-site
 *     copy survives.
 *
 * Usage (manual):
 *   VITE_SUPABASE_URL=...  VITE_SUPABASE_ANON_KEY=...  \
 *   OUT_DIR=/srv/glasstech-backups  KEEP_DAYS=30  \
 *   node scripts/nightly-export.js
 *
 * Usage (cron):
 *   0 22 * * *  cd /opt/glasstech && /usr/bin/node scripts/nightly-export.js >> /var/log/glasstech-backup.log 2>&1
 *
 * No npm install required for the script itself — uses only Node 20+
 * built-ins (fetch, fs/promises, zlib, path, crypto).
 */

import { promises as fs }  from 'fs';
import path                from 'path';
import zlib                from 'zlib';
import { promisify }       from 'util';
import { createWriteStream } from 'fs';

const gzip = promisify(zlib.gzip);

// ── Config ───────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const OUT_DIR      = process.env.OUT_DIR     || './backups';
const KEEP_DAYS    = Number(process.env.KEEP_DAYS || 30);
const SINCE_HOURS  = Number(process.env.SINCE_HOURS || 26);    // 26h = catch-up if a daily run misses
const QUIET        = process.env.QUIET === '1';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (or SUPABASE_URL/SUPABASE_ANON_KEY).');
  process.exit(2);
}

const log  = (...args) => { if (!QUIET) console.log('[nightly-export]', ...args); };
const warn = (...args) => console.warn('[nightly-export]', ...args);
const die  = (msg, code = 1) => { console.error('[nightly-export] FATAL:', msg); process.exit(code); };

// ── Tiny REST client (no @supabase/supabase-js dep) ──────────────────────
const headers = {
  apikey:        SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer:        'return=representation',
};

async function rpc(name, body = {}) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${name}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`RPC ${name} ${res.status}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}

async function rest(path, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${path}${query}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`REST ${path} ${res.status}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}

// ── Main flow ────────────────────────────────────────────────────────────
async function main() {
  log('Starting nightly export. SUPABASE_URL=', SUPABASE_URL);
  log('OUT_DIR=', OUT_DIR, 'KEEP_DAYS=', KEEP_DAYS, 'SINCE_HOURS=', SINCE_HOURS);

  // Ensure output dir exists
  await fs.mkdir(OUT_DIR, { recursive: true });

  // 1. List recent snapshots (use erp_snapshot_index view + filter)
  const sinceIso = new Date(Date.now() - SINCE_HOURS * 3_600_000).toISOString();
  const snapshots = await rest(
    'erp_snapshot_index',
    `?backup_date=gte.${encodeURIComponent(sinceIso)}&order=backup_date.asc`
  );
  log(`Found ${snapshots.length} snapshot(s) in the last ${SINCE_HOURS}h.`);

  // 2. List local files to skip already-mirrored snapshots
  const existingFiles = new Set(
    (await fs.readdir(OUT_DIR).catch(() => [])).filter(f => f.endsWith('.json.gz'))
  );

  let exported = 0;
  let skipped  = 0;
  let failed   = 0;

  // 3. For each snapshot, export + write gzipped JSON
  for (const snap of snapshots) {
    try {
      const ts = String(snap.backup_date).replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      const co = (snap.company || 'ALL').replace(/[^A-Za-z0-9]/g, '');
      const lb = (snap.label   || 'manual').replace(/[^A-Za-z0-9_-]/g, '');
      const fileName = `${ts}_${co}_${lb}.json.gz`;
      const fullPath = path.join(OUT_DIR, fileName);

      // Idempotent — skip if already mirrored
      if (existingFiles.has(fileName)) {
        skipped++;
        continue;
      }

      // Pull the full payload via RPC
      const payload = await rpc('erp_snapshot_export', { p_id: snap.id });
      const json = JSON.stringify(payload);
      const gz   = await gzip(Buffer.from(json, 'utf8'));
      await fs.writeFile(fullPath, gz);
      const sizeKB = Math.round(gz.length / 1024);
      log(`✓ ${fileName} (${sizeKB} KB, ${payload.record_count || 0} records)`);
      exported++;
    } catch (e) {
      failed++;
      warn(`✗ ${snap.id} export failed:`, e.message);
    }
  }

  // 4. Local prune — drop files older than KEEP_DAYS
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  let pruned = 0;
  for (const f of await fs.readdir(OUT_DIR)) {
    if (!f.endsWith('.json.gz')) continue;
    const stat = await fs.stat(path.join(OUT_DIR, f));
    if (stat.mtime.getTime() < cutoff) {
      await fs.unlink(path.join(OUT_DIR, f));
      pruned++;
    }
  }
  if (pruned > 0) log(`Pruned ${pruned} file(s) older than ${KEEP_DAYS} days.`);

  log(`Done. Exported=${exported}, skipped=${skipped}, failed=${failed}, pruned=${pruned}.`);

  // Exit code: non-zero if any export failed (cron monitor catches this)
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => die(e?.stack || e?.message || String(e)));
