# GlassTech Group ERP — Master Testing Plan

> **Target:** 95% go-live confidence for Glassco Sales module.
> **Reference standard:** SAP Activate "Realize" + "Deploy" phases (per ERP Implementation Lifecycle Report).
> **Owner:** Hassan (RSH Advisory) — Lead Developer + QA.
> **Status:** Phase 0 in progress.

---

## Why the original 6-phase plan was insufficient

Industry-standard SAP Activate prescribes 5 testing types (UT → SIT → Data Migration → Security → UAT) + Go-Live Audit. Functional correctness ko ye 6 phases ~75% cover karte hain. **Lekin Pakistani manufacturing ERP for real business mein 95% confidence k liye 3 critical phases ADD ki gayi hain:**

| Added Phase | Why critical |
|---|---|
| **4.5 · Chaos & Performance** | Happy-path tests fail-modes nahi pakarte (net drop, Supabase timeout, localStorage full, concurrent click). Without this, week-1 post-go-live mein 3–5 P1 bugs guaranteed. |
| **5.5 · Parallel Run** | 5 days of real-data entry on BOTH legacy system AND new ERP, with daily reconciliation. **Sab se bara missing piece.** Without parallel run, customer pakar le ga ke "aap ka ledger galat hai" — credibility loss. |
| **7 · Hypercare** | First 2 weeks post-launch — dedicated standby, <4h P1 SLA, daily standup. Bina iske week-3 disaster hota hai. |

---

## Final Plan — 10 Phases · 20 working days · 95% confidence

| # | Phase | Days | Cumulative confidence |
|---|---|---|---|
| 0 | **Pre-Flight Gate** (static checks) | 2 | 5% |
| 1 | **Unit Testing** (46 UTs) | 2 | 15% |
| 2 | **System Integration Testing** (8 flows) | 2 | 30% |
| 3 | **Data Migration Testing** | 1 | 40% |
| 4 | **Multi-Tenancy & Security** (data bleed) | 1 | 50% |
| 4.5 | **Chaos & Performance** ⭐ NEW | 2 | 60% |
| 5 | **User Acceptance Testing** (20 scripts) | 3 | 75% |
| 5.5 | **Parallel Run** ⭐⭐ NEW · CRITICAL | 5 | 90% |
| 5.6 | **Operational Readiness Drill** ⭐ NEW | 1 | 92% |
| 6 | **Pre Go-Live Audit** | 1 | **95%** |
| **GO LIVE** | | | |
| 7 | **Hypercare** (post go-live) ⭐ NEW | 10 | post-launch |

---

# Phase 0 · Pre-Flight Static Quality Gate (2 days)

**Purpose:** Catch errors WITHOUT running the system. Cheapest place to find bugs.

## P1 Checks (block go-live if any fail)

| # | Check | Tool | Pass Criteria |
|---|---|---|---|
| 1 | TypeScript compile (sales scope) | `npx tsc --noEmit` | 0 errors in `modules/sales/**` and `modules/glassco/**` |
| 2 | Company filter on every Supabase query | `scripts/phase0_audit.sh` greps for `.from(...)` without `.eq('company',` | 0 violations in sales services |
| 3 | RLS policy on every table | SQL: `pg_tables vs pg_policies` cross-check | 100% coverage |
| 4 | No `any` types in sales | grep for `: any` in sales scope | 0 results |
| 5 | No direct ledger insert (bypass) | grep `from('ledger').insert` outside finance services | 0 bypass calls |
| 6 | No hardcoded secrets | grep for `eyJ`, `sk_live`, supabase URLs | 0 results |
| 7 | No `console.log` in production code | grep `console.log` in sales/glassco | ≤5 (Logger only) |

## P2 Checks (fix before testing)

| # | Check | Tool | Pass Criteria |
|---|---|---|---|
| 8 | ESLint warnings | `npm run lint` | 0 errors, ≤10 warnings |
| 9 | Production build | `npm run build` | Success, main chunk <2 MB |
| 10 | Bundle size per route | vite-bundle-visualizer | No lazy chunk >500 KB |
| 11 | Unused exports | `npx ts-prune` | <20 in sales scope |
| 12 | Circular deps | `npx madge --circular` | 0 |
| 13 | npm audit | `npm audit --production` | 0 High/Critical CVEs |
| 14 | Migration order sanity | Manual + `ls migrations/` | No forward FK dependency |

## P3 Checks (track as debt)

| # | Check | Pass Criteria |
|---|---|---|
| 15 | Inline styles in sales | ≤5 occurrences |
| 16 | Try/catch on async services | 100% |
| 17 | `useAuthStore` BUG-1 pattern (user + profile both) | 100% of usages |
| 18 | Lazy-load all routed pages | 100% |
| 19 | Foreign key orphans (clients/invoices/etc) | 0 orphans |
| 20 | TODO/FIXME debt count | Tracked in `KNOWN_DEBT.md` |

## Phase 0 Output Artifacts

```
docs/testing/phase0/
├── PHASE0_REPORT.md          ← summary with P1/P2/P3 pass counts
├── TS_ERRORS_BY_SCOPE.md     ← sales vs out-of-scope breakdown
├── COMPANY_FILTER_AUDIT.md   ← every query missing .eq('company')
├── RLS_COVERAGE_MATRIX.md    ← table × policy_exists matrix
└── KNOWN_DEBT.md             ← accepted P3 deferred post-go-live
```

---

# Phase 1 · Unit Testing (2 days · 46 UTs)

**Target services & test counts:**

| Service | UTs |
|---|---|
| `salesService.ts` | 8 |
| `deliveryInvoiceService.ts` | 12 |
| `creditNoteService.ts` | 5 |
| `glasscoGLService.ts` | 6 |
| `financeService.ts` | 4 |
| `cutoverService.ts` | 5 |
| `csvImportService.ts` | 6 |

**Stack:** Vitest 4 (already in deps) · `jsdom` env · `@supabase/supabase-js` mocked via `vi.mock`.

**Pass criteria:** ≥90% green. **Zero** `LedgerImbalanceError` bypass.

---

# Phase 2 · System Integration Testing (2 days · 8 flows)

| Flow | Path |
|---|---|
| F1 | Client create → Quotation save → SO auto-generate |
| F2 | SO → Production cutting → Pieces → QC → Delivery mark |
| F3 | Delivery → Invoice auto-gen → GL post (Dr AR / Cr Revenue / Cr GST / + COGS) |
| F4 | Invoice → Receipt → AR balance reduce → GL post (Dr Cash / Cr AR) |
| F5 | Credit Note issue → AR reverse + revenue reverse |
| F6 | Stock OB → Stock ledger → Inventory Valuation Report matches |
| F7 | CSV import (clients) → SalesCRM dropdown reflects |
| F8 | AR Opening Balance import → AR Aging shows day-1 |

**Method:** Manual run + screenshot at each step. Existing `/e2e-verify` page used as orchestrator.

---

# Phase 3 · Data Migration Testing (1 day)

Cutover Wizard (Sprint 30) accuracy validation:

```
Source CSV total ─── must equal ─── Trial Balance / Aging Report total
                                    │
                                    └── Within ±PKR 1 tolerance
```

| Test | Source | Target |
|---|---|---|
| 100 client CSV import | CSV row count | `clients` table row count |
| 50 product CSV import | sum(rate_per_unit) | sum in DB |
| 20 AR opening invoices | sum(amount) | AR control account balance |
| Stock OB | CSV qty × rate | Inventory Valuation total |

---

# Phase 4 · Multi-Tenancy & Security (Data Bleed) Testing (1 day)

10 TCs (full detail in `docs/testing/SECURITY_BLEED_TESTS.md`):

```
TC-SEC-01  Glassco user → SalesCRM → only Glassco clients
TC-SEC-02  Switch GTK → only GTK, zero Glassco rows
TC-SEC-03  RLS bypass via direct REST + foreign company JWT
TC-SEC-04  JWT spoofing
TC-SEC-05  Anon role direct SELECT
TC-SEC-06  Cross-company FK reference rejection
TC-SEC-07  P&L export Excel bleed check
TC-SEC-08  allowed_companies dropdown enforcement
TC-SEC-09  Realtime channel cross-bleed
TC-SEC-10  Edge function company scope
```

**Pass criteria:** Zero cross-company rows in ANY response.

---

# Phase 4.5 · Chaos & Performance Testing ⭐ NEW (2 days)

**Why added:** Happy-path testing misses real-world fail-modes. This phase explicitly breaks things.

## Chaos Test Cases (8 TCs)

| TC | Scenario | Expected Behavior |
|---|---|---|
| TC-CHA-01 | Net disconnect mid invoice save | Auto-queue in localStorage; toast on retry; no duplicate on reconnect |
| TC-CHA-02 | Supabase 30s timeout | Show timeout toast; offer retry; no half-saved row |
| TC-CHA-03 | localStorage quota exhausted | Graceful degrade; offer to clear cache; no silent fail |
| TC-CHA-04 | Rapid 30x click on "Save Invoice" | Idempotent — 1 invoice created, not 30 |
| TC-CHA-05 | Browser tab refresh mid-save | Either complete or rollback; no ledger imbalance |
| TC-CHA-06 | Printer offline during PDF print | PDF generated to file; clear error if print fails |
| TC-CHA-07 | Concurrent edit same quotation (2 tabs) | Last-write-wins OR optimistic lock error; warn user |
| TC-CHA-08 | Supabase service outage simulation | Read-only mode banner; offline queue intact |

## Performance Tests (3 TCs)

| TC | Scenario | Pass Criteria |
|---|---|---|
| TC-PERF-01 | SalesCRM with 5,000 quotations | Initial render <2s; scroll smooth (60fps) |
| TC-PERF-02 | Trial Balance on 100,000 ledger rows | Page load <5s |
| TC-PERF-03 | CSV import 10,000 clients | <60s end-to-end; UI responsive throughout |

**Tools:** Chrome DevTools (Network throttle, CPU throttle, Coverage), `k6` for load testing.

---

# Phase 5 · User Acceptance Testing (3 days · 20 scripts)

**Format (per CLAUDE.md):**
```
TC-XX: [action] → Expected: [result] | Severity: P1/P2/P3
```

Full list in `docs/testing/UAT_SCRIPTS.md`. Sample:

```
TC-UAT-01  New client → Quotation → PDF print → Approve → SO auto-create
           Expected: All steps complete, quote_number sequential, PDF readable
           Severity: P1

TC-UAT-02  Bulk-import 500 clients via CSV
           Expected: <30s, no duplicates, all visible in SalesCRM dropdown
           Severity: P1

TC-UAT-03  Quotation with 50 line items
           Expected: All items saved, totals correct, print fits on pages
           Severity: P2
... (17 more)
```

**Triage:** P1 = STOP. P2 = workaround OK. P3 = post-go-live backlog.

---

# Phase 5.5 · Parallel Run ⭐⭐ NEW · CRITICAL (5 days)

> **This is the most important phase.** Skipping or shortcutting this is the single biggest go-live risk.

## Concept

For 5 consecutive working days, **every** business transaction is entered into BOTH:
1. Legacy system (current Excel / manual ledger)
2. New ERP (Glassco Sales module)

Every evening at 6 PM, reconciliation script (`scripts/parallel_reconcile.sh`) compares:

| Metric | Legacy | ERP | Variance |
|---|---|---|---|
| Total invoices issued today | ₨ X | ₨ Y | Must be ≤ PKR 1 |
| AR closing balance | ₨ X | ₨ Y | Must be ≤ PKR 1 |
| Stock on hand (top 20 items) | qty | qty | Must be 0 variance |
| Cash receipts today | ₨ X | ₨ Y | Must be ≤ PKR 1 |

## Pass Criteria

- **5 consecutive clean days** = green light to cutover
- Even 1 mismatch = +1 additional day required
- 3+ mismatches in any day = investigate root cause, escalate

## Daily Cadence

- 9 AM: Day starts, both systems live
- 6 PM: Reconciliation report runs (auto-emailed)
- 6:30 PM: Hassan reviews variance, logs in `docs/testing/PARALLEL_RUN_LOG.md`
- 7 PM: If clean, mark day green. If variance, raise issue, plan fix for tomorrow

---

# Phase 5.6 · Operational Readiness Drill ⭐ NEW (1 day)

| Drill | Method | Pass Criteria |
|---|---|---|
| **Backup restore drill** | Restore yesterday's Supabase backup into staging project | Data 100% intact, app works against restored DB |
| **DR scenario** | Simulate Supabase region outage; check app fallback | Read-only mode kicks in; localStorage queue intact |
| **Monitoring active** | Check Sprint 35 alerts wired (Telegram/WhatsApp) | At least 1 test alert delivered |
| **Runbook test** | Hassan absent for a day; alternate user follows runbook | Common issues resolved without Hassan |
| **Escalation matrix** | 24h on-call for go-live week defined | Documented with phone numbers |

---

# Phase 6 · Pre Go-Live Audit (1 day)

Final 6-item checklist (per PDF + GlassTech additions):

| # | Item | Owner | Sign-off |
|---|---|---|---|
| 1 | All UAT scripts pass (P1 + P2 closed) | Hassan | ☐ |
| 2 | Opening balances reconciled (Stock + GL + AR) | Hassan + Accountant | ☐ |
| 3 | Backup strategy: daily Supabase snapshot active | Dev | ☐ |
| 4 | Rollback plan documented + tested | Dev | ☐ |
| 5 | Production load test passed (10 concurrent users 30 min) | Dev | ☐ |
| 6 | Cutover Wizard locked + cutover_date set | Hassan | ☐ |
| 7 | Parallel-run 5/5 clean days | Hassan | ☐ |
| 8 | Operational readiness drill passed | Hassan | ☐ |
| 9 | Hypercare standby confirmed (Hassan + RSH Advisory) | Hassan | ☐ |
| 10 | Go/No-Go meeting held with stakeholders | All | ☐ |

---

# Phase 7 · Hypercare ⭐ NEW (2 weeks post go-live)

**First 14 days post-launch:**

| Day | Activity |
|---|---|
| 1–3 | Hassan on-site, monitor every transaction, dev on standby for 4h response |
| 4–7 | Hassan onsite half-day; daily 15-min standup; bug log review |
| 8–14 | Daily check-in 9 AM; weekly retro on day 7 + day 14 |

**SLA:**
- P1 bug: <4h fix turnaround
- P2 bug: <24h
- P3 bug: weekly batch

**Exit criteria (end of Hypercare):**
- Zero P1 open
- ≤3 P2 open with workaround
- 1 week of stable operations
- Hassan signs off "Steady state achieved"

---

# Honest Confidence Assessment

| Phases Completed | Confidence |
|---|---|
| 0 only | 5% (build works) |
| 0–3 | 40% (basic functions work) |
| 0–4 | 50% (no obvious bleeds) |
| 0–5 | 75% (real users tested) |
| 0–5.5 | **90%** (parallel run validates real-world) |
| 0–6 | **95%** (audit signed off) |
| 0–7 | 98% (steady state proven) |

**100% confidence is impossible.** Anyone claiming higher than 95% is selling something. 95% is the realistic ceiling for a Pakistani manufacturing ERP run by a small team.

---

# Tax / GST Strategy

Per business reality: customers don't request GST invoices today. Plan accordingly:

1. **Tax settings toggle** (admin page) — disable tax checks by default
2. When tax-related testing required (future regulator demand or new customer), flip toggle → tax checks come live
3. See `modules/admin/services/taxSettingsService.ts` for the toggle

**Phase 0 audit reads this config:** if `tax_settings.enabled = false`, GST hardcode checks are SKIPPED. If true, full GST validation enforced.

---

**Last updated:** Sprint 36 complete · Testing phase 0 starting.
