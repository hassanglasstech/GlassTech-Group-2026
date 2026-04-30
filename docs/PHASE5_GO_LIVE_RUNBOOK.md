# Phase 5 — GO-LIVE Runbook (GlassTech ERP, Glassco-first)

> **Audience:** Hassan + ops team
> **Scope:** Single-user / single-org launch (RLS + role gates intentionally deferred)
> **Pre-req:** Phases 1–4 commits merged on `main`. Last commit hash recorded.

This runbook is the **only thing you need to read end-to-end before going live**. It walks the operator through (1) confirming the database is at Phase-3 schema, (2) snapshotting current data, (3) deploying the build to Vercel, (4) running a smoke test of all changed flows, and (5) the rollback plan if anything goes sideways.

Every step has a **verification command** so you don't have to trust the runbook — you can check.

---

## 0 ▸ TL;DR — Day-of-Launch Order of Ops

```
┌─ T-2 hours ─────────────────────────────────┐
│ A. Apply migrations 032 / 033 / 034 / 035   │   ← §1
│ B. Run preflight                            │   ← §2
│ C. erp_snapshot('Glassco', 'pre-golive')    │   ← §3
└─────────────────────────────────────────────┘
┌─ T-1 hour ──────────────────────────────────┐
│ D. Deploy from main on Vercel               │   ← §4
│ E. Verify env vars on Vercel                │   ← §4
└─────────────────────────────────────────────┘
┌─ T-0 LAUNCH ────────────────────────────────┐
│ F. Smoke test (10 min, 8 steps)             │   ← §5
│ G. Open to live use                         │
└─────────────────────────────────────────────┘
┌─ T+24 hours ────────────────────────────────┐
│ H. Daily snapshot cron + monitoring         │   ← §7
└─────────────────────────────────────────────┘
```

If any step fails, jump to **§8 Rollback** before anything else.

---

## 1 ▸ Apply Migrations (in this exact order)

Run each in **Supabase → SQL Editor** as one block. Each is idempotent (safe to re-run).

| # | File | Purpose |
|---|---|---|
| 1 | `supabase/migrations/032_phase1_sales_data_layer.sql` | Adds flat columns to `invoices` / `clients` / `quotations`; creates `credit_notes`; rewrites `process_payment_receipt` RPC for single-user mode. |
| 2 | `supabase/migrations/033_phase2_serial_allocator.sql` | Creates `doc_serials` table + `allocate_serial(...)` RPC. |
| 3 | `supabase/migrations/034_phase3_customer_complaints.sql` | Creates `customer_complaints` table. |
| 4 | `supabase/migrations/035_phase5_preflight.sql` | Verifies 032/033/034 are applied; creates `erp_snapshot()` + `erp_snapshot_index`. |

**Confirm:**
```sql
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('credit_notes','doc_serials','customer_complaints');
-- expect 3 rows
```

---

## 2 ▸ Pre-flight Verification

Migration 035 includes an in-line `RAISE EXCEPTION` that hard-fails if anything is missing. After applying it, also paste this manually into the SQL Editor:

```sql
-- Phase-1: invoice flat columns (expect ~22 rows)
SELECT column_name FROM information_schema.columns
  WHERE table_name='invoices'
    AND column_name IN ('order_id','total_amount','received_amount','balance',
                        'status','payments','items','reverted_status','voided_at');

-- Phase-2: allocate_serial RPC smoke test (expect 1, then 2)
SELECT allocate_serial('PRE-FLIGHT-CHECK', 'TEST',
       extract(year from now())::INT, 1);
SELECT allocate_serial('PRE-FLIGHT-CHECK', 'TEST',
       extract(year from now())::INT, 1);

-- Phase-2: process_payment_receipt RPC exists
SELECT proname FROM pg_proc WHERE proname='process_payment_receipt';

-- Phase-3: customer_complaints table (expect ~18 columns)
SELECT count(*) FROM information_schema.columns
  WHERE table_name='customer_complaints';

-- Phase-1 RLS sanity (single-user — should NOT throw)
SELECT count(*) FROM credit_notes;
SELECT count(*) FROM customer_complaints;
SELECT count(*) FROM doc_serials;
```

If any block errors, **STOP — do not deploy**. Fix the underlying migration first.

Cleanup the test counters:
```sql
DELETE FROM doc_serials WHERE company='PRE-FLIGHT-CHECK';
```

---

## 3 ▸ Snapshot Current Data (before go-live)

Even with Supabase Pro PITR, take an in-database JSONB snapshot we can re-hydrate without re-routing the connection string.

```sql
-- Snapshot just Glassco (smaller, faster):
SELECT erp_snapshot('Glassco', 'pre-phase5-golive');

-- Or snapshot everything:
SELECT erp_snapshot(NULL, 'pre-phase5-golive');

-- Confirm:
SELECT id, company, label, record_count, table_count
  FROM erp_snapshot_index LIMIT 3;
```

The snapshot lives in `erp_backups.meta.payload` — restorable via the SQL in **§8 Rollback**.

> **Storage note:** snapshots are JSONB blobs in the same DB. Each Glassco snapshot is roughly proportional to current row counts × ~1 KB. Run a separate `pg_dump` for an off-site copy when row counts cross ~50k.

---

## 4 ▸ Vercel Deployment

### 4.1 Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<project>.supabase.co` | Already set if existing deploy works |
| `VITE_SUPABASE_ANON_KEY` | `eyJ…` | Same |
| `VITE_USE_EDGE_FUNCTIONS` | `true` | Optional |

Do **not** put service-role keys here. Edge-function secrets (Anthropic, WhatsApp, Telegram, Cron) are set in **Supabase → Settings → Secrets**, not Vercel.

### 4.2 Deploy

```
vercel.com → GlassTech project → Deployments → ⋮ → Redeploy "main"
```

Or push a new commit to `main` and let auto-deploy handle it.

**Confirm the deployment:**
1. Open the production URL.
2. DevTools → Console → no red errors on first load.
3. Bottom-right sync indicator shows green within 30 s.

---

## 5 ▸ Smoke Test (10 minutes — exercises every Phase 1–4 path)

Run all 8 steps in order on a non-critical Glassco client (create one called `SMOKE-TEST` if needed). Each step lists the **expected result**; treat any deviation as a launch blocker.

### 5.1 Quotation Approval (Phase 2 — credit limit + serial RPC + piece reorder)
1. Sales → Quotations → New Quotation
2. Client: SMOKE-TEST · 1 line item, 5 mm, 36×48", qty 2, T/G service
3. **Save Draft** → expect `DRF-GLS-MMYY-XXXX`
4. **Approve** → expect `GT-SO-GLS-MMYY-YYYY` (different sequence)
5. ✅ Production → Fabrication → Cutting → SMOKE-TEST shows **2 pieces** with id prefix `GLS-…/1`, `GLS-…/2`

### 5.2 Credit Limit Hard Block (Phase 2 + Phase 3)
1. Client Master → SMOKE-TEST → Credit Limit = 1
2. Sales → New Quotation for SMOKE-TEST · any item · Approve
3. ✅ Toast: `Credit limit exceeded for SMOKE-TEST: …` — quotation NOT approved.
4. Reset credit limit to 0 (= unlimited).

### 5.3 Auto-invoice on Delivery + ISO Date Validation (Phase 3)
1. Sales Orders → SMOKE-TEST order from §5.1
2. Type `Delivered` in Confirm Delivery Date → Update Order Records
3. ✅ Toast: warning that the date is invalid; **no invoice generated**.
4. Replace with `2026-05-30` → Update.
5. ✅ Toast: `Invoice GT-INV-GLS-MMYY-… generated` + COGS GL appears in Finance.

### 5.4 Receipt Posts Payment + GL (Phase 2 — F7 fix)
1. Same SMOKE-TEST order
2. Received Payment: enter half the order value · Method: Cash · Reference: blank
3. **Record + Print Receipt** button.
4. ✅ Receipt prints AND Finance → Ledger shows `Dr Cash / Cr AR` posted entry.
5. ✅ BillingHub → Invoice status now `Partial`, balance reduced.

### 5.5 Credit Note + COGS Reversal (Phase 3)
1. Finance → Credit Notes → Issue against the SMOKE-TEST invoice
2. Amount: 25% of invoice total · Reason: Smoke test
3. ✅ CN posts; invoice balance reduced; new GL `GL-COGS-REV-…` exists with debit-Inventory / credit-COGS at proportional values.

### 5.6 Service Order — Raw Sqft + Color (Phase 3 — I1 / I2 fix)
1. Production → mark dispatched pieces of SMOKE-TEST as Tempered
2. Sales → SMOKE-TEST → **Issue Service Order**
3. ✅ Modal shows `Raw Sq.Ft (unbilled)` (not the billing sqft). Glass type label shows next to thickness. PO total uses raw sqft × correct vendor rate for the color.

### 5.7 Cutter Scan Station + NCR (Phase 4 — orphan-code wiring)
1. Production → Fabrication → **Scan Station** tab
2. Select SMOKE-TEST job → Start Cutting Session
3. Click **Log piece (no scan)** before any scan
4. ✅ Toast: `MISSED SCAN — NCR-CUT raised` AND Production → NCR shows a new `NCR-CUT-…` event.

### 5.8 Blind QC + QR Print (Phase 4)
1. Production → QC & Dispatch → **Blind QC** tab
2. Confirm at least 1 piece appears; cutter assessment is hidden.
3. Decide Pass / Fail → Submit.
4. Print Job Card for SMOKE-TEST → ✅ **QR codes** visible at top-right (job-level) and in each piece row.
5. Sheet Tag print → ✅ each tag has a 16 mm scannable QR.

If all 8 pass → **GREEN-LIGHT for live use.** Mark a divider in your day, leave the SMOKE-TEST data in place for 24 h before deleting (helps if anything weird shows up later).

---

## 6 ▸ Day-1 Operating Notes

- **GST modal removed** — invoices now post at gross. If a client requires GST, capture it in the line item rate before approval.
- **Credit limit is enforced** — no silent over-credit. If a regular client hits the limit, raise it explicitly in Client Master.
- **Receipt button records the payment** — there is no longer a "print only" path. If a customer hands cash and you only want a printed receipt without recording, you cannot — the system will both record and print. This is intentional (audit F7 fix).
- **Re-approving an SO preserves in-progress pieces** — no more accidental wipe of Tempered/Delivered pieces. Removed/reduced items become "orphaned" pieces and are flagged with a toast; visit Production module to NCR them if scrap.

---

## 7 ▸ Daily Operations (post-launch)

### 7.1 Daily snapshot cron (recommended)

In Supabase → Database → Cron Jobs:

```sql
SELECT cron.schedule(
  'daily-erp-snapshot-glassco',
  '0 2 * * *',           -- 02:00 PKT every day
  $$ SELECT erp_snapshot('Glassco', 'cron-daily'); $$
);
```

Browse with:
```sql
SELECT * FROM erp_snapshot_index WHERE label='cron-daily' LIMIT 30;
```

### 7.2 Monitoring (zero-cost setup)

| Signal | Where | Trigger |
|---|---|---|
| Supabase API errors > 0 | Supabase → Logs → API | Investigate same day |
| Postgres errors with code `23P01` (serialisation) | Supabase → Logs → Postgres | Re-tune `process_payment_receipt` if it spikes |
| Vercel deploy fails | Vercel → Deployments | Auto-email |
| Sync toast shows red ("Cloud sync failed") repeatedly | Browser console + `gtk_erp_pending_sync` localStorage key | Phase-1 fix should auto-retry; investigate if queue grows beyond 10 |

### 7.3 Weekly data integrity (run every Monday)

```sql
-- Orphan invoices (no parent quotation)
SELECT i.id FROM invoices i
  LEFT JOIN quotations q ON q.id = i.order_id
  WHERE q.id IS NULL AND i.company = 'Glassco';

-- Quotations marked Invoiced but no invoice exists
SELECT q.id, q.order_no FROM quotations q
  WHERE q.status = 'Invoiced' AND q.company = 'Glassco'
    AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = q.id);

-- Receipts whose invoice is not Paid/Partial
SELECT r.id FROM payment_receipts r
  JOIN invoices i ON i.id = r.invoice_id
  WHERE i.company = 'Glassco' AND i.status NOT IN ('Paid','Partial','Voided');
```

Each query should return **0 rows** in steady state.

---

## 8 ▸ Rollback Plan

### 8.1 Code rollback (safe — schema-additive)

The Phase 1–4 migrations are all **additive** (new columns, new tables, new RPCs) — they never drop or rename anything. Rolling back the **frontend** is therefore safe even if you keep the new schema:

```bash
# Revert to last known-good commit (Phase-0 baseline)
git revert --no-edit 9379584^..0c880d8       # Phase-1 → Phase-4
git push origin main
```

This re-deploys the old frontend; the new DB columns just sit unused.

### 8.2 Data restore from snapshot

If go-live data got corrupted, restore the pre-launch snapshot from `erp_backups`:

```sql
DO $$
DECLARE
  v_payload JSONB;
  v_table   TEXT;
  v_tables  TEXT[] := ARRAY[
    'doc_serials','customer_complaints','credit_notes',
    'production_pieces','payment_receipts','invoices','quotations','clients'
  ];   -- restore order: child → parent
BEGIN
  SELECT meta->'payload' INTO v_payload
    FROM erp_backups
    WHERE id = 'SNAP-YYYYMMDD-HHMMSS-Glassco';     -- ← put your snapshot id

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Snapshot not found.';
  END IF;

  -- TRUNCATE Glassco data only (NEVER touch other companies)
  EXECUTE 'DELETE FROM payment_receipts WHERE company = ''Glassco''';
  EXECUTE 'DELETE FROM credit_notes WHERE company = ''Glassco''';
  EXECUTE 'DELETE FROM customer_complaints WHERE company = ''Glassco''';
  EXECUTE 'DELETE FROM invoices WHERE company = ''Glassco''';
  EXECUTE 'DELETE FROM quotations WHERE company = ''Glassco''';
  EXECUTE 'DELETE FROM clients WHERE company = ''Glassco''';
  -- production_pieces are not company-scoped → leave alone unless you snapshotted ALL

  FOREACH v_table IN ARRAY v_tables LOOP
    -- Insert each row from the JSONB array
    EXECUTE format(
      'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I, $1)',
      v_table, v_table
    ) USING (v_payload->v_table);
  END LOOP;

  RAISE NOTICE 'Restore complete from snapshot.';
END $$;
```

### 8.3 Migration rollback (only if absolutely required)

If a migration broke production and the only fix is to remove the new columns:

```sql
-- DESTRUCTIVE — only after taking a fresh snapshot and confirming no
-- production data depends on these columns:
ALTER TABLE invoices  DROP COLUMN IF EXISTS reverted_status;
DROP TABLE IF EXISTS credit_notes;
DROP TABLE IF EXISTS customer_complaints;
DROP TABLE IF EXISTS doc_serials;
DROP FUNCTION IF EXISTS allocate_serial(TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS erp_snapshot(TEXT, TEXT);
DROP VIEW IF EXISTS erp_snapshot_index;
```

You will lose any data written to these new tables. **Take a JSON dump first.**

---

## 9 ▸ Post-launch Backlog (Phase 6 candidates)

Items that were intentionally skipped for go-live but worth tracking:

| # | Item | Reason |
|---|---|---|
| 9.1 | RBAC + role gates on Approve / Discount / Delete buttons | Single-user — you handle approvals manually |
| 9.2 | RLS hardening (drop the `*_anon_rw` policies) | Same |
| 9.3 | Customer-tier price list | No tiered pricing in current product mix |
| 9.4 | BOM Master CRUD UI | MRP works without it for Glassco's product mix |
| 9.5 | Sales CRM Kanban / Lead Funnel | No leads-as-entity workflow yet |
| 9.6 | Combined ops dashboard (sales + production) | MD Dashboard already covers cross-company KPIs |
| 9.7 | Quotation status state machine (Sent / Rejected / Lost / Expired) | Current Draft / Approved / Invoiced is sufficient |
| 9.8 | Production exports (pieces, dispatch, NCR, MRP) | Sales exports already work; production exports are nice-to-have |

---

**Document version:** Phase 5 / 2026-04-30
**Last commit covered:** `0c880d8` (Phase 4 — orphan-code wiring)
**Maintainer:** Hassan
