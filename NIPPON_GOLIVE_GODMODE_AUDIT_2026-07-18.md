# Nippon (Hardware Trading) — God-Mode Go-Live Audit

**Date:** 2026-07-18 · **Branch:** GT-Production · **Scope:** Nippon ONLY (not the group).
**Method:** 3 parallel principal auditors (finance money-trust · data/ops blockers · security &
customer portal) doing real file reads + live Supabase (MCP, read-only) queries + `pg_policies` /
`pg_trigger` verification, plus the quality gates (tsc / eslint / vitest / build) and a live data
census. Brutal, evidence-first — every finding cited to `file:line`, a live policy, or a gate result.

Prior anchors: [NIPPON_GODMODE_RATING_2026-07-15.md](NIPPON_GODMODE_RATING_2026-07-15.md) (4.4→~4.8)
and [NIPPON_GODMODE_AUDIT_2026-07-16.md](NIPPON_GODMODE_AUDIT_2026-07-16.md) (4.4, vs Odoo/Zoho/Cin7).
This one re-tests every P0 those raised **plus** everything shipped since (payment/receipt epic,
customer portal, gate-pass redesign, owner-approval guard).

---

## Verdict — two postures, one honest number

| Go-live posture | Grade | One line |
|---|:---:|---|
| **Internal-only** (staff sell; portal NOT exposed to customers) | **6.8 / 10** | GO — after one 15-min finance-gate fix, eyes open on overselling |
| **Customer portal EXPOSED to external customers** | **4.2 / 10** | DO NOT SHIP — one RLS layer stands between you and a customer-data breach |
| **Whole slice as-it-stands (portal-exposed config)** | **5.4 / 10** | A genuinely deep trading ERP whose newest headline feature isn't safe to expose yet |

**Confidence guidance for the owner:** be **confident** about internal trading operations (quote →
order → issue from stock) — that is real and works. Be **not-yet-confident** about (a) turning the
customer portal loose on real customers and (b) switching finance GL ON. Both are gated behind
specific, known, small-to-medium fixes — not rewrites.

### Live data census (why finance risk is "latent, not active")
`134 products · 16 clients · 38 quotations · 0 invoices · 0 ledger rows · 150 COA accounts.`
Finance GL has **never fired** in production. `finance.gl_enabled` default = **OFF**
([featureFlags.ts:51](modules/shared/config/featureFlags.ts:51)).

### Quality gates (all green, this branch)
`tsc --noEmit` clean · `eslint --quiet` 0 errors · `vite build` OK · 240 vitest tests pass.
(Bundle note: `vendor-misc` chunk = 2.5 MB / 756 KB gz — worth code-splitting later.)

---

## Scorecard (same rubric + weights as the Glassco/Nippon 07-12/07-15 ratings)

| # | Dimension | Wt | Grade | Verdict |
|---|-----------|:--:|:-----:|---------|
| 5 | Feature Completeness | 12% | **7.0** | End-to-end trading + customer portal + IFRS payment epic; ahead of prior 6.8 |
| 4 | Data Integrity & Persistence | 20% | **6.0** | Day-one data bugs fixed; non-atomic stock + customer-writable orders remain |
| 6 | Reliability & UX | 12% | **6.5** | Green-toast-lies / print-crash / stuck-dashboard all fixed; solid |
| 3 | Finance & GL Correctness | 25% | **5.0** | Advance-receipt IFRS-correct + phantom codes fixed; 1 live flag-OFF GL hole + 3 latent GL-ON blockers |
| 7 | Testing & QA | 5% | **4.5** | 240 green incl. 6 Nippon SIT; portal isolation + the GL hole untested |
| 1 | Architecture & Code | 8% | **4.5** | tsc clean, but inconsistent authz model (legacy `FOR ALL` vs `auth_can_write`), base64-in-jsonb |
| 8 | Ops / Build / Schema | 3% | **5.0** | Gates green, owner-approval migration applied; COA constants still not reconciled to live |
| 2 | Security, Auth & RBAC | 15% | **4.0** | Owner-approval DB-enforced (good) — but portal isolation is client-side only → **P0 leak** |

**Weighted = 5.4 / 10** (portal-exposed config). Internal-only reweights Security's portal P0 out → **~6.8**.

---

## 🔴 P0 — blockers (must fix before the matching posture goes live)

### P0-1 · Customer portal has NO per-customer isolation (client-side `.filter()` only) — *blocks portal exposure*
`CustomerPortal.load()` filters in React by `clientId` ([CustomerPortal.tsx:74](modules/sales/companies/nippon/CustomerPortal.tsx:74)),
but `AsyncSalesService.getQuotations()` fetches the **whole company**
([asyncSalesService.ts:478](modules/sales/services/asyncSalesService.ts:478)). The only server gate is
RLS, and the **live** policy is company-scoped, not customer-scoped
(`quotations_strict_select … company = ANY(auth_user_companies())` — verified via `pg_policies`).
There is **no** RLS keying quotations to the caller's client-id/email (all migrations grepped).
→ Any `customer` JWT can hit `/rest/v1/quotations?company=eq.Nippon&select=*` and read **every**
customer's orders, prices, discounts, payment-proof screenshots and claim amounts. Same company-only
SELECT on `clients` / `invoices` / `store_items` → all 16 clients' PII + credit terms, all invoices,
all stock/cost rows. **Confirmed exploitable:** a real `role='customer'` profile exists; 38 quotes
across 16 clients are readable by that one JWT.

### P0-2 · Customer JWT can write/delete other customers' orders + the product catalogue — *blocks portal exposure*
`quotations` UPDATE/DELETE and `products` use plain company-scoped policies (`FOR ALL`), **not** the
module-gated `auth_can_write`. A customer JWT can UPDATE/DELETE any Nippon quotation and
INSERT/UPDATE/**DELETE** the Nippon product master via REST. Authorization model is inconsistent:
`clients`/`invoices`/`store_items` writes are `auth_can_write`-gated (a customer fails them), but
`quotations`/`products`/`erp_alerts`/`gate_passes` still use the legacy "any company member" pattern.

### P0-3 · Orders tab auto-invoices + posts GL even with finance OFF — *blocks finance-OFF integrity (internal too)*
`generateDeliveryInvoice` posts the invoice + Dr AR / Cr Revenue (+COGS) via `post_invoice_atomic`
**unconditionally** — no flag gate around the RPC
([deliveryInvoiceService.ts:677](modules/sales/services/deliveryInvoiceService.ts:677)); the flag only
guards the pieces-gate (:393) and advance-application (:744). "Books off" is achieved by gating
*callers* — BillingHub does; **SalesOrders does not**
([SalesOrders.tsx:326-328](modules/sales/components/SalesOrders.tsx:326)), and
[SalesCRM.tsx:199](modules/sales/pages/SalesCRM.tsx:199) renders `<SalesOrders/>` for Nippon.
→ A Nippon user entering a valid delivery date on the Orders tab **posts a real invoice + ledger
entry today**, despite finance being "OFF." (0 ledger rows only because nobody has done it yet.)
**Fix:** wrap the auto-invoice in `isFinanceGLEnabled(company)` + an issued/delivered check, mirroring
`BillingHub.confirmGenerateInvoice`. ~15 min.

---

## 🟠 P1 — fix before finance GL is switched ON (all latent today: 0 ledger rows)

- **P1-a · No hard COGS-at-delivery gate for Nippon.** Unmatched line → `console.warn`+`toast.warning`,
  posts Revenue+AR with COGS=0 ([deliveryInvoiceService.ts:148-165](modules/sales/services/deliveryInvoiceService.ts:148));
  Glassco `throw`s for the same condition. Must throw when GL is ON.
- **P1-b · COGS credited to flat 11514, not the per-brand account GRN debited** (11511/11512/11513)
  ([grnGLService.ts:708-716](modules/procurement/services/grnGLService.ts:708) vs
  [deliveryInvoiceService.ts:171](modules/sales/services/deliveryInvoiceService.ts:171)) → KIN LONG
  stock never relieved, 11514 driven negative.
- **P1-c · Nippon GRN GL is a non-atomic torn write** (fire-and-forget `saveLedger`, then separate
  stock write; ignores `post_grn_atomic`).
- **P1-d · Customer can self-confirm order state via REST.** Payment proof is base64 stuffed into
  `quotations.data` jsonb ([CustomerPortal.tsx:200-214](modules/sales/companies/nippon/CustomerPortal.tsx:200)),
  client-side validation only; nothing server-side stops a customer setting `paymentConfirmed`,
  `receivedAmount`, `advanceReceipts`, or `status` (every value **except** `'Approved'`, which the
  trigger guards). Row/audit bloat risk too.
- **P1-e · Smart (AI) importer** declares success before the cloud round-trip and appends duplicates
  with throwaway ids ([NipponSmartImporter.tsx:400-433](modules/sales/companies/nippon/components/NipponSmartImporter.tsx:400)).
  **Use the green Direct/Bulk importer, not the red one.**

## 🟡 P2 — hygiene (from live security advisors: 91 lints, all WARN, 0 ERROR)

- `access_logs` world-readable + insertable (`USING(true)`) → any user reads/forge cross-company login records.
- `product-images` bucket allows listing (enumerate every product id).
- `auth_can_write` has a mutable `search_path` (pin it — it's the function gating the "safe" tables).
- HaveIBeenPwned leaked-password protection **disabled** — turn on for an externally-exposed login.
- Non-atomic trading stock (full-array localStorage write, no negative guard); over-sell allowed
  by design today (`ENFORCE_STOCK_ON_APPROVE=false`) until GRN goes live. Matters under concurrency.
- Gate-pass issuance is client-side (no server role check); physical risk bounded by the guard QR scan.

---

## ✅ What is genuinely FIXED / strong (credit where due)

- **Advance-receipt payment epic is CA-grade & IFRS-15 correct:** money-before-delivery = Dr Cash/Bank
  · Cr Client Advance **21123** (a liability, not AR); flag-gated; balanced (`assertGLBalance`);
  sequential atomic receipt no (`allocate_serial`); reversal + double-reversal block; advance nets AR
  at delivery ([nipponAdvanceReceiptService.ts](modules/sales/companies/nippon/nipponAdvanceReceiptService.ts)).
- **Phantom account codes fixed** — revenue 41124/41111, AR via `resolveClientARAccount`→11213/11211/11212,
  cash via `resolveCashAccount`→11112/11121. Resolver is wired into both invoice DEBIT and receipt CREDIT.
- **BillingHub is fully gated** (flag check + issued/delivered restriction + real cash accounts).
- **Owner-approval is DB-enforced AND applied live:** trigger `trg_nippon_owner_approval` present +
  enabled (`pg_trigger tgenabled='O'`) — blocks Draft→Approved for non-owner Nippon JWTs (42501).
  Defence-in-depth with the client-side owner gate. *(Corrects the earlier "pending founder action" note.)*
- **Day-one data bugs fixed:** `Delivered` status leak, lying "Remove Duplicates", destructive
  re-import (green importer now awaits cloud + field-merges), product hard-delete now reference-guarded.
- **RLS is enabled with policies on every public table** (advisors: 0 `rls_disabled`, 0 `security_definer_view`).
- Green-toast-on-failure, print blank-screen, and stuck-dashboard reliability bugs all fixed.

---

## The fix list, in order

**To open the customer portal to real customers (P0-1, P0-2):** add a customer-scoped RLS layer —
a `customer` JWT sees/writes only rows for its own client-id/email — on `quotations`, and read-restrict
`clients`/`invoices`/`store_items`; move `quotations`/`products`/`erp_alerts` writes onto `auth_can_write`.
*(DB migration; founder-applied.)* **Until then, treat the portal as internal-only.**

**To make internal go-live airtight (P0-3):** gate the SalesOrders auto-invoice on `isFinanceGLEnabled`
+ issued/delivered. ~15 min, then internal trading is a clean GO.

**Before finance.gl_enabled is EVER switched ON (P1-a…c):** COGS hard-gate (throw), per-brand COGS
credit, atomic GRN RPC.

---

---

## Remediation applied (2026-07-18, same day — post-audit)

Founder directive: *"go live for real customers + fix the audit findings."* Actioned:

| Finding | Action | Where |
|---|---|---|
| **P0-3** finance-OFF leak | **FIXED (code, deployed)** — Orders-tab auto-invoice now gated behind `isFinanceGLEnabled(company)`; flag-OFF saves delivery details only, no GL. | [SalesOrders.tsx:326](modules/sales/components/SalesOrders.tsx:326) |
| **P0-1** portal read-leak | **FIXED (migration — founder applies)** — customer-scoped RLS: a `customer` JWT sees only its own client's quotations (matched by `clients.email` = login email); `clients` select restricted to own row; `invoices`/`store_items`/`price_lists` select closed to customers. | `supabase/migrations/20260718150000_nippon_customer_portal_rls.sql` |
| **P0-2** portal write-leak | **FIXED (migration)** — `products`/`price_lists`/`erp_alerts` writes now exclude the `customer` role; customers keep read-only catalogue + notification-insert only; cannot delete quotations. | same migration |
| **P1-d** customer self-confirm | **FIXED (migration)** — trigger `enforce_nippon_customer_write` blocks a customer from setting privileged status / `paymentConfirmed` / `glTxId` / receipts / `receivedAmount`. | same migration |
| **P1-a** COGS hard-gate | **FIXED (code)** — Nippon now `throw`s on an unmatched/zero-cost line when GL is ON (mirrors Glassco); still warns+continues when GL OFF. | [deliveryInvoiceService.ts:148](modules/sales/services/deliveryInvoiceService.ts:148) |
| **P1-e** Smart importer | **FIXED (code)** — `handleSaveAll` now awaits the cloud, gates success on no-error, and dedup-merges (no more duplicate append). | [NipponSmartImporter.tsx:400](modules/sales/companies/nippon/components/NipponSmartImporter.tsx:400) |
| **P2** access_logs / search_path | **FIXED (migration)** — `access_logs` SELECT restricted to group-admins; `auth_can_write` search_path pinned. | same migration |

**DEFERRED (documented, low urgency):** P1-b (per-brand COGS credit) and P1-c (GRN atomic RPC) — both **inert until `finance.gl_enabled` is ON** (which needs finance sign-off regardless), and the current flat-11514 relief still *balances* (a sub-account misclassification, not an imbalance). P2 `product-images` bucket-listing left as-is (images are public-read by design; ids aren't secret) — touching storage policy risks breaking image display.

### FOUNDER — three actions to actually go live for customers
1. **Run** `supabase/migrations/20260718150000_nippon_customer_portal_rls.sql` in the Supabase SQL editor (transactional; rolls back on any error). This is the hard gate for portal exposure.
2. **Set `clients.email` = the customer's login email** for every customer you onboard (only 1 of 16 Nippon clients has an email today). No match → that customer safely sees nothing.
3. **Turn ON** Supabase Auth → leaked-password protection (HaveIBeenPwned) before external logins. Keep `finance.gl_enabled` **OFF**.

After steps 1–2, the customer-portal posture moves from **4.2 → ~7**, and the whole slice to a defensible **~7.5**.

---

*Bottom line: the accounting/valuation engines and the new payment epic are strong — often above SMB
SaaS — and internal single-user trading is ready behind one small fix (now applied). The grade was held
down by the newest, most-visible feature (the customer portal) shipping with client-side-only isolation,
and by a finance auto-post path that leaked through the "off" switch. Both are now closed in code +
a founder-applied migration. Close the 3 founder actions above → confident customer-portal launch.*
