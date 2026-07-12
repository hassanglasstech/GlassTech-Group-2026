# GlassTech ERP — Disaster Recovery Runbook

> **Sprint 32 deliverable.** Single source of truth for what to do when
> Supabase, Vercel, the office network, or someone's `DROP TABLE` ruins
> your day. Pin this to the wall behind the accounts desk.
>
> **Owner:** Hassan (GlassTech Group)
> **Last reviewed:** 2026-05-11 (Sprint 32 cutover)
> **Related:** `DISASTER_RECOVERY_RUNBOOK.md` (legacy, April 2026 — kept
> for historical commands; this file supersedes it).

---

## 0 ▸ TL;DR — Three things to know cold

1. **Daily snapshots** run automatically at **02:00 PKT** via Supabase
   pg_cron (migration 058). They're stored *inside* `erp_backups` —
   so if the whole project dies you also lose them. The off-site
   safety net is the **Node export** at **03:00 PKT** which downloads
   each snapshot as a `.json.gz` file to a different machine.
2. **PITR** (Point-in-Time Recovery) is a Supabase Pro feature; if
   we're paying for it we can rewind the entire DB up to 7 days back
   in 1-minute granularity. Verify in **Supabase Dashboard → Settings
   → Database → PITR** before assuming.
3. The in-app **DR Console** at `/admin/dr` lets any admin trigger an
   ad-hoc snapshot, list the snapshot history, and download any single
   snapshot as JSON without SSH. **Use it before any risky migration.**

---

## 1 ▸ Backup architecture (defense in depth)

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 — In-DB JSONB snapshots                                │
│  • erp_snapshot(company, label) RPC                             │
│  • Runs daily at 02:00 PKT for all 5 companies (migration 058)  │
│  • Stored in erp_backups table, 30 days kept (auto-pruned)      │
│  • Manual trigger: DR Console at /admin/dr or RPC in SQL Editor │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2 — Off-site nightly export (NODE CLI)                   │
│  • scripts/nightly-export.js                                    │
│  • Cron: 0 22 * * * (03:00 PKT, one hour after pg_cron)         │
│  • Downloads each new snapshot as YYYY-MM-DD_HHMMSS_*.json.gz   │
│  • Default OUT_DIR = ./backups; KEEP_DAYS = 30                  │
│  • Survives Supabase project deletion                           │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3 — Supabase Point-in-Time Recovery (PITR)               │
│  • Pro plan, ~USD 25/mo (or included in Team/Enterprise)        │
│  • 7-day window, 1-minute granularity                           │
│  • Restore to NEW project from Supabase dashboard               │
│  • Best for "I dropped a table 3 hours ago" recoveries          │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 4 — localStorage cache (per browser)                     │
│  • SyncService writes every Sales/Production change locally     │
│    BEFORE the cloud upsert                                      │
│  • Survives Supabase outages — data resyncs on reconnect        │
│  • NOT a long-term backup; just bridges short outages           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2 ▸ Health check (do this every Monday morning)

Five-minute weekly habit. Catches a broken cron before you need it.

### A. Supabase native backups
1. supabase.com → GlassTech project → **Settings → Backups**
2. Last automated backup ≤ 24 hours old? ✅
3. Plan is Pro or higher? ✅ (PITR depends on this)

### B. In-DB snapshot health
Run in Supabase SQL Editor:
```sql
SELECT * FROM erp_snapshot_summary;
```
Each row should show `health = 'healthy'` (last snapshot ≤ 26h old).
If any company shows `warn` (≤ 48h) or `stale` (>48h), the cron
schedule may have been disabled — check:
```sql
SELECT jobname, schedule, command, active
  FROM cron.job
 WHERE jobname LIKE 'erp_snapshot_%';
```

### C. Off-site export
SSH into the backup host (or check NAS):
```bash
ls -lh /srv/glasstech-backups/ | tail -10
```
Newest file should be from yesterday's date.

### D. Manual smoke snapshot
From DR Console, click **"Snapshot Now"**. Should appear in the list
within 5 seconds with current timestamp.

---

## 3 ▸ Outage scenarios — what to do

### Scenario A: Supabase API is slow / 5xx errors

**Symptoms:** users see "Cloud sync failed — saved locally" toasts
recurring; DR Console health is healthy but page loads stutter.

**Action:**
1. Open status.supabase.com — confirm it's their problem.
2. Tell users: **"Keep working — everything saves locally and will
   resync when Supabase recovers."**
3. SyncService auto-retries every 5 minutes. No manual intervention
   needed.
4. After Supabase recovers, watch the bottom-status indicator turn
   green → confirms localStorage drained to cloud.

### Scenario B: Supabase project completely down (>30 min)

**Symptoms:** Vercel app loads but every read errors; PostgREST
returns 503; cron jobs not running.

**Action:**
1. Check status.supabase.com — if global outage, wait it out.
2. If only **our project** is down (rare), open a support ticket
   with project ref + error timestamp.
3. Tell users: **stop entering data; wait for green status before
   resuming.** localStorage queues will drain on reconnect, but
   posting against a stale cache risks duplicate IDs.

### Scenario C: Bad data — accidental DELETE / wrong UPDATE

**Symptoms:** "Where did all our March invoices go?"

**Action — choose ONE based on age of damage:**

**< 7 days, < 1 minute granularity needed → PITR**
1. Supabase Dashboard → Settings → Backups → PITR.
2. Pick timestamp **just before** the bad operation.
3. Restore to a **new** project (don't overwrite!).
4. Verify the data exists in the new project.
5. If good: switch the app's `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` (Vercel Environment Variables) to the
   new project. Redeploy.
6. Decommission the old project.

**< 30 days, table-level granularity OK → erp_backups snapshot**
1. Open DR Console at `/admin/dr` (or SQL Editor).
2. Find the latest snapshot **before** the bad operation
   (`SELECT * FROM erp_snapshot_index WHERE backup_date < '...';`).
3. Click **"Download as JSON"** to grab the payload locally for
   inspection.
4. To restore a single table from the snapshot, run the script
   below in a **transaction** so you can roll back if it goes wrong:

```sql
BEGIN;

-- 1. Pull the payload
SELECT meta->'payload'->'invoices' INTO TEMP TABLE _restored
  FROM erp_backups WHERE id = 'SNAP-...';

-- 2. Reset the live table for the affected company
DELETE FROM invoices WHERE company = 'Glassco';

-- 3. Re-insert from the snapshot
INSERT INTO invoices
SELECT * FROM jsonb_populate_recordset(
  NULL::invoices,
  (SELECT meta->'payload'->'invoices' FROM erp_backups WHERE id = 'SNAP-...')
);

-- 4. Verify
SELECT count(*) FROM invoices WHERE company = 'Glassco';

-- 5. If good:
COMMIT;
-- If bad:
-- ROLLBACK;
```

**> 30 days OR Supabase project gone → off-site .json.gz**
1. Open the most recent `.json.gz` from the backup host:
   ```bash
   gunzip -c /srv/glasstech-backups/2026-05-09_*_Glassco_auto*.json.gz \
     | jq '.payload.invoices | length'
   ```
2. The file shape mirrors `erp_snapshot_export()` output — each
   payload key is a table name; values are arrays of rows.
3. Provision a new Supabase project, run all migrations 001–058,
   then `INSERT INTO ... SELECT FROM jsonb_populate_recordset(...)`
   one table at a time.

### Scenario D: Vercel deploy is broken

**Symptoms:** App returns 500 from CDN, build logs show errors.

**Action:**
1. Vercel Dashboard → Deployments → find last green deployment →
   **"Promote to Production"**. Takes ~30 seconds. App is back.
2. Identify the bad commit (`git log --oneline | head -5`) and
   `git revert <hash>`. Push.
3. The cron jobs in Supabase keep running independently of Vercel —
   data is safe even with a broken UI.

### Scenario E: Internet down at the office

**Symptoms:** Users can't reach the app at all.

**Action:**
1. Switch to phone hotspot — app is hosted on Vercel CDN, no LAN
   dependency.
2. localStorage is per-device, so each person's machine still has
   yesterday's data accessible if they had it open.

---

## 4 ▸ Disaster Drill (run quarterly)

Booked time: **2 hours**, on a Sunday or after-hours.

```
□ T-7 days: Notify Hassan + ops team. Schedule the drill window.
□ T-1 day:  Verify off-site backup file from yesterday is < 24h old.
□ T-0:00   Trigger drill — switch the app to "drill" mode by reading
            from a CLONED Supabase project (use PITR to clone NOW).
□ T-0:15   Simulate an outage: revoke the anon_key in Supabase
            settings (writes start failing).
□ T-0:30   Recovery: restore the last snapshot to the cloned project,
            re-issue a new anon_key, swap Vercel env, redeploy.
□ T-1:00   Verify: open BillingHub, ReportsHub. Sample invoice
            shows correct totals.
□ T-1:30   Tear down: switch app back to live project. Delete the
            cloned project (so we don't double-bill).
□ T-2:00   Post-mortem: what took longest, what failed, what to
            improve. File issues for any gaps.
```

**Pass criteria:** App fully recovered + verified within 30 minutes
of the simulated outage.

---

## 5 ▸ Reference: critical tables (do NOT lose these)

| Table | Owner module | Restore difficulty if lost |
|---|---|---|
| `ledger` | Finance | Catastrophic — every JV gone |
| `invoices` + `payment_receipts` | Sales | Catastrophic — AR & cash gone |
| `quotations` | Sales | Painful — re-key from PDFs |
| `production_pieces` | Production | Painful — re-issue work orders |
| `accounts` | Finance | Re-runnable from migration 003 (but custom accounts lost) |
| `clients` + `vendors` | Master data | Annoying — re-import from Excel |
| `fiscal_periods` | Finance | Re-seedable from migration 004 |
| `cutting_sessions` + `grn_sheet_entries` | Production | Lost = no inventory audit trail |

All of the above are included in the daily `erp_snapshot()` payload
(see migration 035 + extensions). If a snapshot succeeded it has
**every row** for every listed table.

---

## 6 ▸ Contact card

| | |
|---|---|
| **Supabase Support** | https://supabase.com/dashboard/support/new (Pro plan = priority) |
| **Vercel Support**   | https://vercel.com/help |
| **Hassan**           | (your phone here) |
| **Technical lead**   | (your phone here) |
| **Project Ref**      | (Supabase project ref — paste from dashboard URL) |
| **Vercel Project**   | (Vercel project name) |

---

## 7 ▸ Change log

| Date | Sprint | Author | Change |
|---|---|---|---|
| 2026-04-30 | Phase 5 | Claude | Initial DISASTER_RECOVERY_RUNBOOK.md (legacy) |
| 2026-05-11 | Sprint 32 | Claude | Rewritten as RUNBOOK_DISASTER_RECOVERY.md (this file). Adds pg_cron daily snapshot details, off-site Node export procedure, scenario playbook, quarterly drill checklist. |
