# Nippon — Payment → Approval → Receipt (God-Mode Plan, IFRS-aligned)
**Date:** 2026-07-18 · **Scope:** Nippon (trading) · **Owner-driven approval + prepayment**
**Status:** PLAN-FIRST. Finance-critical — needs owner sign-off on the accounting
treatment (Finding 1) before build. `finance.gl_enabled` for Nippon is **OFF** today,
so the double-entry below fires only when it is switched ON.

---

## 0. The flow you described (as one chain)

```
Customer query
  → office converts to Quotation (PDF appears in the customer portal)
  → CUSTOMER: Accept quotation + enter payment amount + attach screenshot   (a CLAIM)
  → OWNER (Finance): records a Payment Receipt against the ORDER no,
       enters Cash / Online details, marks Received
       → prints receipt (customer's print format, else default)
       → system posts the required GL entries
  → System POPUP to owner: "Payment received PKR X. Approve order (release goods)?
       or keep as Prepayment?"
       → if owner says "enough → release": order becomes APPROVED
  → order goes to Store → Gate Pass (office/Logistics) → Factory gatekeeper → Deliver
  → CUSTOMER portal shows OUR official receipt (not their screenshot)
```

**Two hard rules you set:** (a) **only the Owner (and Hassan) can approve an order**;
(b) some clients are **payment-exempt** (approve without payment) — flagged at client
creation.

---

## 1. ⚠️ AUDIT / IFRS FINDINGS (read before building)

### FINDING 1 — P0 · IFRS 15 §106 / IAS 37: money received BEFORE delivery is a LIABILITY, not AR/revenue
The model is "pay first, then release goods." At payment, control of the goods has
**not** transferred → the cash is a **contract liability (advance from customer)**, not
revenue and not a reduction of receivables (there is no invoice/AR yet).

- **Correct at receipt (advance):** `Dr Bank/Cash  ·  Cr 21123 Client Advance — External`.
- **WRONG:** `Dr Bank · Cr 1121x AR` — the existing `process_payment_receipt_v2` RPC does
  exactly this (it settles an **invoice**). Using it on a pre-invoice order creates a
  **phantom negative AR**. → We need a **distinct "Advance Receipt against Order"**, not the
  invoice-receipt path.
- **At delivery** (existing `deliveryInvoiceService` at goods-issue): recognise
  `Dr 1121x AR · Cr 4120 Hardware Sales · Dr 5114 COGS · Cr 11514 Inventory`, **then apply
  the advance**: `Dr 21123 Client Advance · Cr 1121x AR` (contra `11221 Client Advance
  Applied`). Net: the advance clears the fresh AR; revenue lands at delivery, not at payment.

**Good news:** the Nippon COA already has `21123 Client Advance — External` and `11221
Client Advance Applied`. No new accounts needed.

### FINDING 2 — P1 · SoD: the customer's amount + screenshot is a CLAIM, never a GL source
Only the **owner's confirmed receipt** posts GL and unblocks approval. The customer's
"accept + amount + screenshot" is stored as an unverified claim on the order. Code must
guarantee a customer write can **never** set `paymentConfirmed` or post to the ledger.
(This is exactly your rule 9 — the client sees OUR receipt, not their upload.)

### FINDING 3 — P1 · IFRS 15 §47: discount timing
"disc ki entry" at payment is only correct for a **settlement (early-payment) discount**
(`Dr Discount Allowed` contra-revenue). A **trade discount** must already be inside the
quotation/invoice net — it is **not** a receipt entry. Recommend: trade discount stays on
the order (net revenue at delivery); settlement discount is an optional, separate receipt
line. **Decision needed** (see §6).

### FINDING 4 — P1 · FBR sales tax = time of supply
In Pakistan sales tax is generally due at **supply (delivery / tax invoice)**, not at
advance receipt (unless a tax invoice is raised for the advance). So GST posts on the
**delivery invoice** (existing behaviour), and the **advance receipt takes gross cash into
the liability with no tax split**. Don't split GST at advance.

### FINDING 5 — P2 · SoD concentration (owner = maker + checker)
The owner **receives the money, posts the receipt, and approves the order**. That is
maker=checker. Acceptable for an owner-run micro-business, but it **bypasses the DB 4-eyes
control** (`enforce_jv_maker_checker`). Decision: either (a) exempt owner-approval from
4-eyes and record an explicit **audit-log override**, or (b) require a second poster for the
JV. Recommend (a) with a hard audit trail (posted_by, approved_by, timestamps, immutable).

### FINDING 6 — P1 · Receipt numbering + immutability
Receipts need a **gapless sequential number** (FBR/audit), must be **immutable once posted**
(fix via a reversal/refund receipt, never edit/delete), and the print must show the receipt
no + "system-generated" mark. The current `PaymentReceipt` type has no order link, no
sequential no, and no advance concept — it must be extended.

### FINDING 7 — P2 · Partial & over-payment
Track an **advance balance per order**. Partial advance → order stays "Prepaid (partial)";
the owner decides at the popup whether it's enough to release (your rule 6). Overpayment →
excess stays in `21123` as a refund liability.

### FINDING 8 — P1 · finance.gl_enabled is OFF for Nippon
Today Nippon is single-entry. The receipt system can still record receipts as
**cash-management + control records** (no, amount, method, order link, print) with GL OFF.
The double-entry (advance liability → revenue-at-delivery → advance application) fires only
when GL is ON. Everything below is wrapped in the existing **non-blocking finance** gate.

### FINDING 9 — P2 · Refund on cancellation with advance held
If an order carrying an advance is voided, the advance is a **refund liability** — needs a
documented refund receipt (`Dr 21123 · Cr Bank`). Today `handleVoid` returns stock but
ignores a held advance. Add a guard: block/void-with-refund when an advance exists.

### FINDING 10 — P2 · PKR rounding
Round receipt + advance-application amounts to whole PKR so a 1-rupee residual never leaves
a tiny open advance/AR.

---

## 2. Chart-of-accounts mapping (real Nippon COA — no new accounts)

| Event | Debit | Credit |
|---|---|---|
| Advance receipt (pre-delivery) | Bank/Cash (111xx) | **21123 Client Advance — External** |
| Delivery invoice (goods issue) | 1121x AR | 4120 Hardware Sales Income |
| Delivery COGS | 5114 General Hardware COGS | 11514 Hardware Inventory |
| Apply advance to the new invoice | **21123 Client Advance** | 1121x AR |
| Settlement discount (optional) | Discount Allowed (contra-rev) | 1121x AR |
| GST at supply | 1121x AR | 21211 Sales Tax Payable |
| Refund on cancel | 21123 Client Advance | Bank/Cash |

---

## 3. Data model (all ride in existing `data` jsonb — zero migration for the order side)

**Quotation (order) — add:**
- `accepted?`, `acceptedAt?` — customer accepted the quotation (portal).
- `paymentClaimAmount?` — the amount the customer says they paid (a CLAIM only).
- (already have `paymentProof`, `paymentSubmittedAt`, `paymentConfirmed…`).
- `advanceReceived?` (number), `advanceReceiptIds?` (string[]) — running advance held.
- `prepaymentReleased?` — owner chose "release goods" against a prepayment.

**PaymentReceipt (finance) — extend (needs a small migration or ride in receipt_data jsonb):**
- `orderId?` (attach to the ORDER, not only an invoice), `receiptNo` (sequential, gapless),
  `kind: 'advance' | 'invoice'`, `method` (+ `bankRef`/`onlineRef`/`cashBy`), `postedBy`,
  `printType` (customer's preferred), `reversedBy?`. Immutable once posted.

**Client — add:** `approveWithoutPayment?: boolean` (payment-exempt; set on the customer form).

---

## 4. RBAC — owner-only approval (your rule 7)

- Approve action allowed only for roles **`owner`, `hassan`, `super_admin`**. All other
  roles: Approve button hidden/disabled + server guard.
- Enforce in `useNipponQuotations.handleSave` (client) **and** ideally a DB guard on the
  status→Approved transition (defence-in-depth; RLS/trigger). Client-only is not enough for
  audit.
- Payment-exempt clients (rule 8) skip the payment hard-gate but **still need owner
  approval** (exempt = "no cash required", not "auto-approve").

---

## 5. Phased build plan (each a verified + pushed slice)

- **Phase A — Notification / Alert centre (rule 2).** In-app per-user alerts (the header
  bell). Events: new customer query · payment claim submitted · receipt posted · order
  approved · gate-pass requested/issued/approved. Build on `crossCompanyNotifService` (the
  existing real-time primitive) + a per-user feed. Non-financial, low risk — good first slice.
- **Phase B — Customer accept + payment claim (rules 1, 9).** Portal: "Accept Quotation" +
  enter amount + screenshot → stored as CLAIM (`accepted`, `paymentClaimAmount`,
  `paymentProof`). No GL. Portal later shows OUR receipt, not the upload.
- **Phase C — Owner "Advance Receipt against Order" (rules 3, 4, 5) — the core finance slice.**
  Finance → new receipt kind `advance`: attach order no, method + details, amount, mark
  received → sequential immutable receipt no → **GL (gated): Dr Bank · Cr 21123** (NOT AR) →
  print in the customer's `preferredPrintType` (else default). Needs Finance-Agent review.
- **Phase D — Approval popup + prepayment (rule 6).** After a receipt (or when advance ≥
  threshold), popup to owner: "Approve (release goods)?" / "Keep as prepayment." Approve →
  order Approved; advance stays a liability until delivery.
- **Phase E — Owner-only approval (rule 7).** Gate approve to owner/hassan/super_admin
  (client + DB guard) + audit log.
- **Phase F — Payment-exempt clients (rule 8).** `approveWithoutPayment` on the customer
  form; bypasses the payment hard-gate (still owner-approved).
- **Phase G — Delivery revenue + advance application (rule 5, IFRS).** At goods-issue:
  invoice + COGS (existing) **then apply advance** (`Dr 21123 · Cr AR`). GL-gated.
- **Phase H — Customer sees official receipt (rule 9).** Portal shows the posted receipt
  (no, amount, method, date, PDF) instead of the screenshot.

Suggested order: **A → B → E/F (RBAC + exempt, cheap) → C → D → G → H.**
Phases C, D, G are the finance-critical ones and stay behind `finance.gl_enabled`.

---

## 6. Decisions I need from you (owner's call)

1. **Advance accounting (Finding 1):** confirm advances post to **21123 Client Advance
   (liability)** at receipt, and revenue is recognised at **delivery** (IFRS-correct). This
   is the recommended treatment — just need your yes.
2. **Discount (Finding 3):** is the discount a **trade discount** (already in the order net —
   no receipt entry) or a **settlement/early-payment discount** (a receipt-time contra-revenue)?
3. **4-eyes vs owner-override (Finding 5):** since the owner both posts and approves, do we
   **document the owner-override** (recommended) or require a second poster for the JV?
4. **GL now or later:** keep `finance.gl_enabled` OFF (receipts recorded as control/cash
   records only) until you're ready, then flip ON to activate the double-entry? (Recommended:
   build behind the flag, flip at go-live.)

Once you confirm 1–4, I'll build A first (notifications), then the rest in verified slices.
