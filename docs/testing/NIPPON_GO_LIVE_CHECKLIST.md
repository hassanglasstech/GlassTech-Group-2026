# Nippon Go-Live — Final Sign-Off Checklist

> **Owner:** Hassan (RSH Advisory)
> **Module:** Nippon — Hardware/accessories trading
> **Date target:** _____________________________
> **Sign-off by:** _____________________________

This is the **gate before Hassan begins data entry on Nippon**.
Do **not** check a box unless you have proof. Attach screenshots / SQL output to disputed items.

---

## 1. Code & Test Status

| # | Check | Command / Path | Pass? |
|---|---|---|---|
| 1.1 | Phase 0 audit reviewed | [NIPPON_AUDIT.md](NIPPON_AUDIT.md) — every P1 has a code commit | ⬜ |
| 1.2 | Phase 1 P1 fixes applied | 7/7 P1 closed in 6 files | ⬜ |
| 1.3 | Phase 2 SIT regression net | `npx vitest run modules/__tests__/nippon_sit.test.ts` → **6/6 pass** | ⬜ |
| 1.4 | Full test suite green | `npm run test -- --run` → **318/318 pass** | ⬜ |
| 1.5 | TypeScript build clean | `npm run build` succeeds without TS errors | ⬜ |
| 1.6 | Production build deployed | Vercel deploy URL responds | ⬜ |

---

## 2. Database — RLS & Schema

| # | Check | How to verify | Pass? |
|---|---|---|---|
| 2.1 | RLS enabled on every Nippon-touched table | Run [NIPPON_RLS_VERIFY.sql §1](../supabase/migrations/NIPPON_RLS_VERIFY.sql) — every row = `OK` | ⬜ |
| 2.2 | Cross-company leak check passes | Run [NIPPON_RLS_VERIFY.sql §2](../supabase/migrations/NIPPON_RLS_VERIFY.sql) as a Nippon user — only `Nippon` rows visible | ⬜ |
| 2.3 | GL balance trigger active (mig 065) | Run [NIPPON_RLS_VERIFY.sql §4](../supabase/migrations/NIPPON_RLS_VERIFY.sql) — trigger `tgenabled = 'O'` | ⬜ |
| 2.4 | All migrations 014, 026, 029, 032, 044, 054, 064, 067 applied | `SELECT name FROM supabase_migrations.schema_migrations` | ⬜ |
| 2.5 | `store_items.moving_average_price` populated for every Nippon item | Spot-check: zero NULL/0 rows in active inventory | ⬜ |

**Tables in scope (RLS must be ON + ≥1 policy):**
`clients · products · quotations · invoices · payment_receipts · credit_notes · store_items · stock_ledger · ledger · accounts · activity_logs`

---

## 3. Opening Balances (OB)

| # | Check | Pass? |
|---|---|---|
| 3.1 | OB template adapted with real Nippon figures: [PHASE1_OPENING_BALANCES_NIPPON.sql](../supabase/migrations/PHASE1_OPENING_BALANCES_NIPPON.sql) | ⬜ |
| 3.2 | OB JV inserted and STEP 2 verification returns `BALANCED ✓` | ⬜ |
| 3.3 | Customer-wise AR sub-ledger seeded for every existing debtor (STEP 3) | ⬜ |
| 3.4 | `store_items` seeded with on-hand qty + MAP (STEP 4) | ⬜ |
| 3.5 | STEP 5: `SUM(qty × MAP)` matches the inventory lines (11511..11514) in the OB JV | ⬜ |
| 3.6 | Trial balance after OB: Σdebit = Σcredit across the entire `ledger` table for `company='Nippon'` | ⬜ |

**Critical:** Step 3.4 — without MAP populated, every invoice posts COGS = 0 → wrong P&L from day 1 (P1-2 fix relies on this column).

---

## 4. Environment & Deployment

| # | Check | Where | Pass? |
|---|---|---|---|
| 4.1 | `VITE_SUPABASE_URL` set | Vercel env + local `.env` | ⬜ |
| 4.2 | `VITE_SUPABASE_ANON_KEY` set | Vercel env + local `.env` | ⬜ |
| 4.3 | `VITE_USE_EDGE_FUNCTIONS=true` | Vercel env | ⬜ |
| 4.4 | Anon key is the **public** key (NOT service role) | Vercel env | ⬜ |
| 4.5 | Production URL accessible: `https://<vercel-domain>/#/sales` loads | Browser | ⬜ |

**No Nippon-specific env vars needed** — module uses shared Supabase + Claude proxy.

---

## 5. UAT Sign-Off

| # | Check | Pass? |
|---|---|---|
| 5.1 | All 14 flows in [NIPPON_UAT_RUNBOOK.md](NIPPON_UAT_RUNBOOK.md) ✅ green | ⬜ |
| 5.2 | UAT bug log has zero P1 entries | ⬜ |
| 5.3 | Hassan personally verified Flow N-14 (multi-company isolation) | ⬜ |
| 5.4 | Hassan signed off on the printed invoice (Flow N-10) | ⬜ |
| 5.5 | At least 1 full cycle (client → quote → SO → invoice → receipt → CN) completed on STAGING | ⬜ |

---

## 6. User Access (RBAC)

| # | Check | Pass? |
|---|---|---|
| 6.1 | Nippon data-entry user exists | ⬜ |
| 6.2 | `allowed_companies = ['Nippon']` (or includes Nippon if multi-co) | ⬜ |
| 6.3 | `allowed_modules` includes `sales`, `inventory`, `accounts` (read-only on accounts) | ⬜ |
| 6.4 | `time_restricted = false` for owner; `true` for data-entry users (Mon–Fri 9-6 PKT) | ⬜ |
| 6.5 | User can log in and lands on Nippon by default | ⬜ |

---

## 7. Backup & Rollback

| # | Check | Pass? |
|---|---|---|
| 7.1 | Supabase plan is Pro+ (daily backups enabled) — see [DISASTER_RECOVERY_RUNBOOK.md §1](../../DISASTER_RECOVERY_RUNBOOK.md) | ⬜ |
| 7.2 | Manual DB snapshot taken < 24 hours before go-live | ⬜ |
| 7.3 | Rollback plan: if OB or first invoice corrupts data → restore-to-new-project, switch env vars, re-test (per DR runbook §2) | ⬜ |
| 7.4 | Schema dump exported and stored outside Supabase: `pg_dump --schema-only` | ⬜ |
| 7.5 | The 3 new artifacts (audit, SIT test, UAT runbook, OB SQL, RLS verify, this checklist) are committed to git on `main` | ⬜ |

---

## 8. Post-Go-Live Watch (First 48 Hours)

| # | Check | When | Pass? |
|---|---|---|---|
| 8.1 | Monitor `ledger` table — flag any row where Σdebit ≠ Σcredit | Every 4 hours, day 1 | ⬜ |
| 8.2 | Trial balance query at end of day 1: `SELECT SUM(d->>'debit'), SUM(d->>'credit') FROM ledger, jsonb_array_elements(data->'details') d WHERE company='Nippon'` — must equal | EOD day 1 | ⬜ |
| 8.3 | Inventory parity: `store_items.quantity` matches physical stock count | EOD day 1 | ⬜ |
| 8.4 | Console errors zero in Hassan's browser session | Throughout day 1 | ⬜ |
| 8.5 | First print (quotation OR invoice) shown to Hassan + accountant for format approval | Day 1 | ⬜ |
| 8.6 | UAT P2 bug log triaged into Sprint week-2 backlog | End of week 1 | ⬜ |

---

## 9. Known Deferred Items (NOT blockers)

These are documented in [NIPPON_AUDIT.md](NIPPON_AUDIT.md) as P2/P3 and may be deferred to week 2:

- `any` type cleanup (14 remaining TS errors — pre-existing)
- `NipponJobCardPrint` removal (dead code for trading)
- Client-side filter → server-side `.eq('company')` push-down
- Soft-delete + audit log on quotation delete
- Custom modal in place of native `confirm()`
- 95% duplicate code between `NipponQuotationPrint` and `NipponSalesOrderPrint`

---

## 10. Sign-Off

| Role | Name | Date | Signature |
|---|---|---|---|
| Developer / QA | Hassan | __________ | _______________ |
| Accountant (P&L review) | __________ | __________ | _______________ |
| Business Owner | __________ | __________ | _______________ |

---

## Emergency Contacts (Day-1 issues)

| Scenario | Action |
|---|---|
| App crashes / blank page | Check Vercel deploy logs; revert to last green commit |
| GL imbalance error in toast | Stop data entry. Capture the failing JV. Investigate before resuming. |
| Inventory wrong qty | Verify P1-5 idempotency (run UAT Flow N-07 step 6 again) |
| Print crash | Check Console — should NEVER crash post-P1-6 fix. Capture stack trace. |
| Cross-company data leak | **IMMEDIATE STOP.** Revoke user. Re-run §2.2 RLS check. |

---

**Bottom line:** Every box in §1 through §7 must be ✅ before Hassan starts entering live data. §8 is the watchlist for the first two days.
