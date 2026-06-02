# Phase 0 · Manual SQL Checks (run in Supabase SQL Editor)

> **Why manual:** these checks need live database access. Run each query in
> Supabase Dashboard → SQL Editor and paste the result back into this file.

---

## P1 · #03 — RLS Policy Coverage

Every public table must have at least one RLS policy. Tables without policies
are wide open (data bleed risk).

```sql
SELECT
  t.tablename,
  COUNT(p.polname) AS policy_count
FROM   pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename
WHERE  t.schemaname = 'public'
GROUP BY t.tablename
HAVING COUNT(p.polname) = 0
ORDER BY t.tablename;
```

**Pass:** 0 rows returned (all tables have ≥1 policy).
**Fail:** Any row returned → that table is unprotected.

**Mitigation for any unprotected table:**
```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table>_company_isolation" ON <table_name>
  FOR ALL USING (
    company = (SELECT company FROM user_profiles WHERE id = auth.uid())
  );
```

---

## P1 · #03b — Verify RLS is actually ENABLED (not just policies exist)

A table can have policies but RLS disabled. Belt-and-braces check:

```sql
SELECT  schemaname, tablename, rowsecurity
FROM    pg_tables
WHERE   schemaname = 'public'
  AND   rowsecurity = FALSE
ORDER BY tablename;
```

**Pass:** 0 rows (RLS enabled on every public table).
**Fail:** Each row = vulnerable table.

**Fix:**
```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
```

---

## P3 · #19 — Foreign Key Orphans

Orphan rows = data integrity issue (parent deleted, child kept).

### A. Invoices referencing non-existent clients

```sql
SELECT COUNT(*) AS orphan_invoices,
       array_agg(id ORDER BY date DESC) FILTER (WHERE rn <= 10) AS sample_ids
FROM (
  SELECT i.id, i.date,
         ROW_NUMBER() OVER (ORDER BY i.date DESC) AS rn
  FROM invoices i
  LEFT JOIN clients c ON c.id = i.client_id
  WHERE i.client_id IS NOT NULL AND c.id IS NULL
) x;
```

**Pass:** orphan_invoices = 0.
**Fix:** Either restore missing clients, or update invoice.client_id to a valid one.

### B. Quotations referencing non-existent clients

```sql
SELECT COUNT(*) AS orphan_quotations
FROM quotations q
LEFT JOIN clients c ON c.id = q.client_id
WHERE q.client_id IS NOT NULL AND c.id IS NULL;
```

### C. Sales orders referencing non-existent quotations

```sql
SELECT COUNT(*) AS orphan_sos
FROM sales_orders so
LEFT JOIN quotations q ON q.id = so.quotation_id
WHERE so.quotation_id IS NOT NULL AND q.id IS NULL;
```

### D. Receipts referencing non-existent invoices

```sql
SELECT COUNT(*) AS orphan_receipts
FROM payment_receipts r
LEFT JOIN invoices i ON i.id = r.invoice_id
WHERE r.invoice_id IS NOT NULL AND i.id IS NULL;
```

### E. Production pieces referencing non-existent job orders

```sql
SELECT COUNT(*) AS orphan_pieces
FROM production_pieces pp
LEFT JOIN sales_orders so ON so.id = pp.job_order_id
WHERE pp.job_order_id IS NOT NULL AND so.id IS NULL;
```

**Pass criteria for all five:** every count = 0.

---

## BONUS · Data Sanity Quick Wins

### F. Ledger imbalance check

```sql
SELECT
  l.id, l.doc_date, l.description,
  COALESCE(SUM((d->>'debit')::numeric),  0) AS total_debit,
  COALESCE(SUM((d->>'credit')::numeric), 0) AS total_credit,
  COALESCE(SUM((d->>'debit')::numeric), 0)
    - COALESCE(SUM((d->>'credit')::numeric), 0) AS variance
FROM ledger l
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(l.details, l.data->'details', '[]'::jsonb)
) AS d
WHERE l.status = 'Posted'
GROUP BY l.id, l.doc_date, l.description
HAVING ABS(
  COALESCE(SUM((d->>'debit')::numeric), 0)
  - COALESCE(SUM((d->>'credit')::numeric), 0)
) > 0.01
ORDER BY l.doc_date DESC
LIMIT 20;
```

**Pass:** 0 rows. Even one row = LedgerImbalanceError got bypassed somewhere.
**P1 if any row appears** — go-live blocker.

### G. Duplicate invoice numbers (per company)

```sql
SELECT company, COUNT(*) AS dup_count,
       array_agg(id) AS invoice_ids,
       data->>'invoiceNumber' AS invoice_number
FROM invoices
WHERE data->>'invoiceNumber' IS NOT NULL
GROUP BY company, data->>'invoiceNumber'
HAVING COUNT(*) > 1
ORDER BY dup_count DESC
LIMIT 20;
```

**Pass:** 0 rows (every invoice number unique per company).
**Fail:** Race condition in invoice numbering — fix immediately.

### H. Negative inventory check

```sql
SELECT
  company,
  material_id,
  SUM(quantity) AS net_qty
FROM stock_ledger
GROUP BY company, material_id
HAVING SUM(quantity) < 0
ORDER BY net_qty ASC
LIMIT 20;
```

**Pass:** 0 rows (no negative stock anywhere).
**Fail:** Overselling detected — review delivery validations.

### I. Cutover lock status

```sql
SELECT company, cutover_date, status, locked_at, locked_by,
       masters_loaded, stock_ob_done, gl_ob_done, ar_ob_done, ap_ob_done
FROM cutover_snapshot
ORDER BY company;
```

**Expected for Glassco at go-live:** status = `locked`, all 5 checklist items = true.

---

## How to use this document

1. Open Supabase dashboard → SQL Editor for the project
2. Paste each query above one at a time
3. Run, capture result
4. Update this file with results in `<!-- result: ... -->` HTML comments
5. Commit the file when complete

## Expected execution time

| Query | Time |
|---|---|
| A–E (orphan checks) | <500ms each |
| F (ledger imbalance) | 2–5s on 100k+ rows |
| G (duplicate invoice numbers) | <1s |
| H (negative inventory) | 1–2s |
| I (cutover status) | <100ms |

**Total Phase 0 SQL run time:** ~30 seconds.

---

_Generated for Phase 0 audit. Update with results before proceeding to Phase 1._
