# Nippon — Sales + Finance + Inventory Go-Live Plan
**Date:** 2026-07-16 · **Roles:** CA + CMA (IFRS), BA (BABOK As-Is/To-Be), Scrum (phased backlog)
**Scope:** Take Nippon (trading) order-to-cash LIVE: Quotation → Approve → **Store pick/issue** → Delivery → Invoice → **GL entries** → Receipt. Advance-optional. IFRS-compliant.

---

## 1. Current state (verified 2026-07-16, not assumed)

| Area | As-Is |
|---|---|
| **Finance recording** | `erp_config` for Nippon is **empty** → `finance.gl_enabled` = **OFF** (default). Invoices generate but **no GL entries post**. So sales are **NOT** in the books yet. |
| **Quotation → approval** | On **Approve**, the quote becomes a Sales Order AND stock is **decremented immediately** (over-sell guarded). There is **no store-issue step** in between. |
| **Store / goods-issue** | No Nippon **outbound pick/issue** screen. Stock just drops at approval. |
| **Invoice GL mapping** | `deliveryInvoiceService` (isTradingCompany) posts Revenue→**4120**, COGS→**5114**, AR→**12210**. |
| **Real COA (coa.nippon.ts)** | Those codes **do NOT exist**. Real: Revenue `41121-41124`, COGS `51111-51114`, AR `11211-11213`, Inventory `11511-11514`, **Client Advance (liability)** `21121-21123`, Sales Tax `21211`, AP `21111-21113`. |

> **⛔ GO-LIVE BLOCKER (the 2 finance P0s):** the invoice-GL account mapping points at **phantom accounts**. If GL is switched on today, every invoice either errors ("account not found") or posts to orphans → broken books. **This must be reconciled BEFORE finance go-live.**

---

## 2. IFRS treatment (CA/CMA)

- **Revenue recognition (IFRS 15):** recognise revenue when **control transfers = at delivery / goods-issue**, NOT at quotation/approval and NOT when an advance is received.
- **Customer advance = contract liability** (IFRS 15). On receipt: Dr Cash / Cr *Client Advance* (21121-23). It becomes revenue only when the goods are delivered; then the advance is applied against the receivable.
- **Inventory (IAS 2):** carried at cost via **Moving Average Price (MAP)** fed from GRN. **COGS at delivery** = qty × MAP. Lower-of-cost-and-NRV review is a period-end task (out of MVP scope).
- **Sales tax** (if registered): output tax is a liability (21211), not revenue — invoice shows Net + Tax = Gross.
- **Segregation of duties (CMA control):** *Sales* approves the order; *Store* issues the goods. The approval ≠ physical issue split is a real internal control — hence the store-incharge step.

---

## 3. To-Be workflow (BABOK As-Is → To-Be)

```
Quotation (Draft)
   │  edit / price / add items (variant-aware later)
   ▼
APPROVE ──► Sales Order  [stock RESERVED, not issued]   ← advance may be recorded any time here
   │
   ▼
STORE INCHARGE screen: "Pending Issue" queue
   │  store sees pick list (item · qty · bin · image), picks physically
   ▼
CONFIRM ISSUE ──► Goods Issue  [stock DECREMENTS from reserved] + Delivery Challan
   │
   ▼
INVOICE (auto) ──► GL posts: revenue + tax + COGS   (only when finance.gl_enabled = ON)
   │
   ▼
RECEIPT ──► apply advance + collect balance ──► Paid
```

**Change vs today:** move the stock decrement from *approval* to *store-issue*; add the store screen; make invoice+GL fire at issue/delivery.

---

## 4. IFRS journal entries (real COA codes)

Account routing is **by customer** (external wholesale vs GTK/GTI intercompany) and **by product brand** (Kin Long / General Hardware / …).

### A) Advance-based sale
**1. Advance received (before delivery)** — contract liability
```
Dr  1011x  Cash / Bank                      Advance
    Cr  21123  Client Advance — External         Advance
```
**2. Store issues + Delivery + Invoice** — revenue recognised
```
Dr  11213  Receivable — External             Gross (Net+Tax)
    Cr  41124  Wholesale Sales — General HW       Net
    Cr  21211  Sales Tax Payable                  Tax
Dr  51114  COGS — General HW                  qty × MAP
    Cr  11514  Inventory — General HW              qty × MAP
```
**3. Apply advance to the invoice**
```
Dr  21123  Client Advance — External         Advance applied
    Cr  11213  Receivable — External              Advance applied
```
**4. Balance receipt**
```
Dr  1011x  Cash / Bank                        Balance
    Cr  11213  Receivable — External              Balance
```

### B) No-advance sale (cash or credit)
Skip step 1 & 3. At delivery post step 2; then step 4 collects the full amount (immediately if cash, later if credit — AR ages until paid).

*(Kin Long products route to 41121 / 51111 / 11511; General Hardware to 41124 / 51114 / 11514; GTK/GTI customers use AR 11211/11212 + Client Advance 21121/21122.)*

---

## 5. Scrum backlog (epics → sprints)

### EPIC 0 — Finance foundation (BLOCKER, do first) · CA/CMA + founder SQL
- **0.1** Reconcile the invoice-GL mapping to the REAL COA (4120→41121-24, 5114→51111-14, 12210→11211-13, advance→21121-23) in `deliveryInvoiceService` / `grnGLService` (per brand + per customer).
- **0.2** Verify the atomic money RPCs work for trading (`post_invoice_atomic`, `process_payment_receipt_v2`, `credit_note_atomic`) with Nippon codes; add a **customer-advance** apply path.
- **0.3** Nippon SIT: invoice + COGS + receipt all **balance (Dr=Cr)** on real codes.
- **0.4** Only then flip `finance.gl_enabled = ON` for Nippon (founder, via Admin → Feature Flags or SQL).
- **Acceptance:** a test order posts a balanced set of entries to accounts that exist; stock-value ↔ inventory-GL reconciles.

### EPIC 1 — Order lifecycle (reserve, don't issue at approve)
- **1.1** On Approve → Sales Order + **reserve** stock (new `reservedQty`), stop the immediate decrement.
- **1.2** Status model: `Draft → Approved(SO) → Picking → Issued/Delivered → Invoiced → Partly-Paid → Paid` (+ Void/Return).
- **Acceptance:** approving does not change on-hand; it moves qty to reserved; over-sell still blocked.

### EPIC 2 — Store Incharge pick/issue screen
- **2.1** "Pending Issue" queue = approved SOs; each shows pick list (item · qty · bin · image).
- **2.2** Confirm Issue → goods-issue (decrement reserved→out, write stock ledger 201) + Delivery Challan (print).
- **Acceptance:** store user issues; stock ledger shows the movement; SO moves to Issued.

### EPIC 3 — Invoice + GL at issue/delivery
- **3.1** On issue/delivery → auto-invoice + GL (EPIC 0 mapping), gated on the flag.
- **Acceptance:** invoice number generated; with flag ON, balanced GL posts; with flag OFF, invoice still records (no GL).

### EPIC 4 — Advances & receipts
- **4.1** Record customer advance (contract liability) any time after approval.
- **4.2** Apply advance on invoice; collect balance; AR aging report.
- **Acceptance:** advance sits as liability until delivery; applied correctly; AR nets to zero when fully paid.

### EPIC 5 — COGS / MAP
- **5.1** Ensure MAP flows from GRN → COGS at issue; owner can adjust cost.
- **Acceptance:** COGS = qty × MAP; negative-MAP guarded.

### EPIC 6 — Reports (period-end / MIS)
- Sales register, AR aging, stock valuation ↔ GL reconciliation, simple IFRS P&L slice.

**Suggested sprints:** S1 = EPIC 0 + 1 · S2 = EPIC 2 + 3 · S3 = EPIC 4 + 5 + 6.

---

## 6. Open decisions (need your call before building)

1. **Store step reality:** is there a **separate store person** (own login/screen), or is it **you** doing both approve + issue? (Affects RBAC + whether we enforce segregation. For a solo owner we still keep the 2-step for control, one login.)
2. **Sales tax:** are you **GST-registered** for Nippon? If yes, what rate (e.g. 18%)? If no, invoices are tax-free (skip 21211).
3. **Advance:** partial advances allowed? apply oldest-first to the invoice?
4. **Go-live style:** flip GL **ON after EPIC 0** (post from day one), OR run **parallel** (record sales, keep GL off a week, verify, then flip)?
5. **Reserve-at-approve:** OK to change today's behaviour (approve reserves instead of decrements)? Or keep decrement-at-approve and just add invoice+GL?

---

*Nothing is coded yet — this is the design. On your confirmation of §6, Sprint 1 (EPIC 0 finance foundation + EPIC 1 lifecycle) begins. Finance foundation includes founder-run SQL (I'm read-only on the DB).*
