# GLASSCO / GlassTech — Supabase BRUTAL AUDIT (live DB)

**Project:** `wfytbcmazixddtwpbego` · **Date:** 2026-07-11 · **Method:** Supabase advisors (172 security + 514 performance lints) + deep SQL via MCP (read-only).
**Auditor:** QA + Finance Agent. Nothing was changed — all findings are read-only; fix SQL below is for you to review and run.

> Headline: the **isolation MODEL is sound** (125/155 tables RLS-on with a working `auth_user_companies()` array helper, 0 NULL-company rows, 0 policyless-RLS tables). The danger is a set of **gaps around it** — 30 unprotected tables, 30 anon-callable privileged functions, an ambiguous COA, and an untracked schema.

---

## 🔴 CRITICAL

### C1 — 30 SECURITY DEFINER functions callable by **anon** (unauthenticated)
30 `SECURITY DEFINER` RPCs are executable by the `anon` role via `/rest/v1/rpc/<fn>` with **no login**, running as owner and **bypassing RLS**. The dangerous ones:
`disable_strict_company_rls`, `enable_strict_company_rls` (toggle tenant isolation!), `process_payment_receipt` (financial mutation), `verify_delivery_otp`, `authorize_dispatch`, `load_pieces_to_dispatch_atomic`, `update_piece_status_atomic`, `user_profiles_block_self_escalation`, `protect_hassan_from_delete`, `erp_trial_balance` / `trial_balance` / `ar_aging` / `erp_snapshot` (read all financials).
**Fix:** `REVOKE EXECUTE ON FUNCTION public.<fn>(...) FROM anon, PUBLIC;` for every function NOT meant to be public. Keep anon ONLY for the driver-portal set (`get_dispatch_for_driver`, `verify_delivery_otp`, `complete_pod`, `add_pod_photo`, `add_signature`, `ensure_driver_token`, `check_geofence_arrival`, `record_vehicle_location`) and gate each with an in-function token check.

### C2 — RLS **disabled** on 30 public tables (anon + any signed-in user reads/writes all)
Fully exposed to the anon/authenticated keys. Sensitive ones: **`permissions`, `role_permissions`** (RBAC config — anyone can read/rewrite who-can-do-what), **`employee_docs`, `employee_roles`** (PII/authz), **`whatsapp_log`, `saas_clients`, `agent_audit_log`, `agent_execution_log`** (leaks `session_id`), **`wazir_conversations`/`wazir_voice_samples`**, `business_manual`, `unknown_log`, and the whole `agent_*` cluster.
**Fix:** triage — for the 4 that already have policies (`employee_docs, employee_roles, permissions, role_permissions`) just `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` (activates existing policies, safe). For the rest add a company/role policy or move internal tables to a private (non-API) schema. Do NOT blanket-enable without policies — that blocks all access.

---

## 🟠 HIGH

### H1 — `accounts` has NO `unique(company, code)` → **live duplicate COA code** (confirms the CLAUDE.md collision warning)
`accounts` has only `PRIMARY KEY (id)`. Realized already: **Factory code `12210` maps to TWO accounts** — 'Loan to Staff' (Asset L4) AND 'Accum. Dep — Furniture' (Asset L5). Any code-based lookup (`postJournal`, COA resolution, the two account-code sources) picks an **arbitrary** row → can post to the wrong account. Balances are 0 today, so no damage yet — but the door is open on every company.
**Fix:** de-dup Factory `12210` (renumber one), then `CREATE UNIQUE INDEX accounts_company_code_uidx ON public.accounts(company, code);` and make code lookups fail loudly on >1 match.

### H2 — Orphan quotations point at non-existent clients (incl. an **APPROVED Glassco sales order**)
3 orphans. Worst: **`GT-SO-GLS-0726-2534`** (Glassco, **status=Approved** — a committed SO) → `clientId=BP-601901` which **doesn't exist**, and there are **ZERO Glassco clients** in the table at all. Plus the Nippon bug: `QT-0726-0031`, `QT-0726-0029` → `BP-302401` (absent). No FK enforces the link.
**Fix:** recreate/link the missing clients (the Glassco SO customer **before it's invoiced**); add a nightly integrity check `quotations(clientId)→clients(id)` scoped by company. (App-side: the `getClients` local-union fix already shipped; re-save the partners to push them to cloud.)

### H3 — 4 tables have RLS **policies but RLS not enabled** → policies are inert
`employee_docs, employee_roles, permissions, role_permissions` each have full CRUD policies that do nothing (false sense of security). **Fix:** just `ENABLE ROW LEVEL SECURITY` on each (subset of C2).

### H4 — 14 SECURITY DEFINER **views** bypass caller RLS
`v_ar_aging, v_gl_pnl, v_sales_analysis, v_project_profitability, v_stock_aging, v_ledger_imbalance_audit, erp_snapshot_summary`, … run as creator → cross-company data leak to any user who can read them.
**Fix:** `ALTER VIEW public.<v> SET (security_invoker = true);` for each.

### H5 — 15 tables have `WITH CHECK (true)` write policies → writes bypass isolation
`purchase_orders, dispatches, erp_backups, gl_posting_rules_v2 (GL config!), hse_incidents, factory_events, access_logs, …` — any authenticated user can insert/update/delete regardless of company. **Fix:** replace the always-true write policies with company-scoped `WITH CHECK`.

### H6 — RLS `auth.uid()` re-evaluated **per row** on 85 tables (biggest scalability drag)
Policies call `auth.uid()`/`current_setting()` directly → run once **per row** instead of per query. **Fix:** wrap in a scalar subselect: `(select auth.uid())`, and `company = (select company …)`. Applies to `user_profiles`, `dispatches`, `leads`, `assets`, etc.

### H7 — Double RLS cost: 84 tables carry **two** overlapping permissive policies
Legacy `company_isolation` + newer `*_company_scoped` both evaluate on every query (336 lint combos). **Fix:** drop the redundant legacy policy per table, keep one canonical policy per action.

---

## 🟡 MEDIUM

- **M1 — GL tables are EMPTY** (`ledger, invoices, financial_events, stock_ledger` = 0 rows) despite 45 quotations + 1,312 COA accounts. Either GL/COGS is **localStorage-only and never syncing to Postgres**, or go-live hasn't posted yet. Either way there's **no server-side double-entry trail** to reconcile — and it blocks the WIP-never-cleared / stock↔GL checks. **Verify `postJournal` writes to `public.ledger` on the server path.**
- **M2 — `activity_log` = 178,356 rows** in ~61 days, no retention/partitioning, jsonb before/after snapshots are the size driver. 2 orders of magnitude bigger than any other table → storage/cost/latency. **Fix:** retention (drop/archive >90–180d) + monthly partition by `changed_at`.
- **M3 — 46 functions with mutable `search_path`** (injection risk) — incl. finance DEFINER funcs `_insert_ledger_row, post_invoice_atomic, void_invoice_atomic, credit_note_atomic, post_grn_atomic, assert_ledger_balance`. **Fix:** `ALTER FUNCTION … SET search_path = pg_catalog, public;`
- **M4 — Duplicate / dead tables** (messy-schema correctness trap): 3 audit logs (`activity_log` 178k / `activity_logs` 19 / `audit_log` 87), 2 GL-rule tables (both empty), 3 dispatch tables (`dispatches` 6 / `tempering_dispatches` 0 / `dispatch_events` 0 — the known dispatch-unification debt). **Fix:** pick one canonical per concept, drop the rest.
- **M5 — Schema divergence from CLAUDE.md:** live `user_profiles` has **NO `company` column** (uses `allowed_companies` ARRAY + `auth_user_companies()`), so the documented RLS template `company = (SELECT company FROM user_profiles …)` and the BUG-1 `profile?.company` note are **STALE** — any policy written to that template silently breaks. Tables are **dual-shaped** (flat cols + jsonb `data`) with redundant pairs (`credit_limit` vs `creditLimit`; `client_id` col vs `data->>'clientId'`). **Fix:** update CLAUDE.md; pick one canonical field per concept.
- **M6 — Schema is UNTRACKED** — `list_migrations` is **empty**. The whole DB was built by ad-hoc SQL, not the repo migration system. **This is the root cause of every divergence** (094/095 had to be hand-applied; `production_pieces`/`clients` diverged). **Fix:** baseline the current schema into `supabase_migrations` so future changes are tracked.

---

## 🟢 LOW
- **L1** — `product-images` bucket has a broad `SELECT` policy → anyone can **list every file** (enumerate the whole Nippon catalog). Public URLs work without it → drop the listing policy.
- **L2** — Auth **leaked-password protection (HaveIBeenPwned) disabled** → enable in Dashboard → Auth → Password settings.
- **L3** — 7 duplicate index pairs (incl. `production_pieces`), 5 unindexed FKs (`credit_notes.client, projects.client_id, requisitions.employee_id, role_permissions.permission_id, stock_ledger.item_id`), 81 unused indexes (review before dropping — keep company/date composites).

---

## ✅ CLEAN (positive controls — keep as regression checks)
- 0 tables RLS-enabled-but-policyless (no silently-invisible-rows trap).
- 0 NULL-company rows in `accounts/clients/quotations/vendors/production_pieces/employees`.
- 125/155 tables RLS-on with a working `auth_user_companies()` array helper — the isolation engine itself is correct.
- All 5 `user_profiles` active with configured `allowed_companies` (super_admin = all 5; 2 Glassco, 3 Nippon).
- `production_pieces → quotation` references: 0 orphans.

---

## Suggested order of remediation
1. **C1 + C2/H3** (revoke anon EXECUTE; enable RLS on the 4 policy-ready tables) — biggest exposure, mostly low-risk SQL.
2. **H1** (accounts unique code) + **H2** (relink the approved Glassco SO's client) — financial correctness.
3. **H4/H5** (security_invoker views; fix always-true write policies).
4. **H6/H7** (RLS perf: scalar-subselect + dedupe policies) — do together, big scale win.
5. **M1** (confirm GL persists to Postgres) — go-live blocker for finance integrity.
6. **M6** (baseline migrations) + M3/M2/M4/M5 hygiene. Then L1–L3.

*Nothing here was auto-applied. Enabling RLS without policies blocks access — review each block before running.*
