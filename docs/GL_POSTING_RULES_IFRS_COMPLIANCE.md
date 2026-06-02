# GL Posting Rules — IFRS Compliance Matrix

**Date:** 2026-04-17
**Standards Referenced:** IAS 1, IAS 2, IAS 8, IAS 19, IAS 24, IAS 37, IAS 39, IFRS 10, IFRS 15

---

## Compliance Matrix

| Rule ID | Transaction | Standard | Compliant | Gap | Remediation |
|---|---|---|---|---|---|
| GLR-001 | WIP Transfer | IAS 2 | GAP | No GL at cutting assignment | Add trigger in FloorPlanner |
| GLR-002 | Labor Absorption | IAS 2 | GAP | Labor rate not from payroll | Wire to hrService.getPayroll |
| GLR-003 | NCR Breakage | IAS 2 s.34 | PASS | Abnormal waste expensed immediately | None |
| GLR-004 | Vendor Debit Note | IAS 37 | PASS | Provision/recovery correct | None |
| GLR-005 | Remnant Creation | IAS 2 | GAP | No GL at remnant creation | Add trigger in RemnantManager |
| GLR-006 | NRV Write-down | IAS 2 s.28-33 | GAP | No automated NRV calculation | Build NRV engine |
| GLR-007 | Revenue | IFRS 15 | PARTIAL | On invoice, should be delivery date | Change trigger to DC signature |
| GLR-008 | COGS | IAS 2 | GAP | No COGS posting implemented | Build COGS auto-post with revenue |
| GLR-009 | Petty Cash | IAS 1 | PASS | Basic expense recognition | None |
| GLR-010 | GRN Material | IAS 2 | PASS | MAP-based landed cost | None |
| GLR-011 | Supplier Payment | IAS 1 | PASS | Liability settlement | None |
| GLR-012 | Intercompany | IAS 24/IFRS 10 | NEW | Built in Phase 7 | Elimination engine deployed |

**Overall: 5/12 fully compliant, 5 gaps, 2 partial**

---

## GL Posting Rules Summary

| Rule | Debit | Credit | Auto-Post? | IAS |
|---|---|---|---|---|
| GLR-001 | 1310 WIP | 1210 Raw Material | Yes (Production) | IAS 2 |
| GLR-002 | 1310 WIP | 2310 Wages Payable | Yes (Production) | IAS 2 |
| GLR-003 | 5110 Breakage Loss | 1310 WIP | Yes (QC) | IAS 2 |
| GLR-004 | 1150 Vendor Recv | 5110 Loss Reversal | Yes (QC) | IAS 37 |
| GLR-005 | 1320 Remnant | 1310 WIP | Yes (Production) | IAS 2 |
| GLR-006 | 5410 Write-Down | 1320 Remnant | Approval >50K | IAS 2 |
| GLR-007 | 1310 AR | 4110 Revenue | Always Approval | IFRS 15 |
| GLR-008 | 5010 COGS | 1350 Finished Goods | Auto with Revenue | IAS 2 |
| GLR-009 | 5XXX Expense | 1050 Petty Cash | Auto <5K | IAS 1 |
| GLR-010 | 1210 Raw Material | 2120 GRN Payable | Yes (Purchase) | IAS 2 |
| GLR-011 | 2120 Payable | 1111 Bank | Always Approval | IAS 1 |
| GLR-012 | 1220 ICO Recv | 4510 ICO Sales | Always Approval | IAS 24 |

---

## IAS 2 — Inventory Valuation

**Requirement:** Inventory at lower of cost and NRV.

**Implementation:**
- **Cost:** Moving Average Price (MAP) — implemented in `applyMAPOnGRN()`
- **NRV:** Estimated selling price - costs to sell
  - For remnants: last sold price for similar size × 0.7, minus PKR 500 handling
  - Automated NRV trigger: Finance Agent proposes at 45+ days age
  - Write-down requires owner confirmation if > PKR 50,000

---

## IFRS 15 — Revenue Recognition

**Five-step model applied to GlassCo:**

1. **Identify contract:** Sales order (quotation with status Approved)
2. **Identify obligations:** Deliver tempered glass to site
3. **Determine price:** Quotation total amount
4. **Allocate price:** Per-piece for partial deliveries
5. **Recognize revenue:** When delivery challan signed (BA-03)

**Current gap:** Revenue recognized on invoice creation, not delivery. Remediation documented.

---

## IAS 24 — Related Party Transactions

**Applicable:** GlassCo ↔ GTK ↔ GTI ↔ Nippon (common ownership)

**Implementation (Phase 7):**
- Separate ICO GL accounts (1220/2210/4510/5510)
- Dual-ledger posting via IntercompanySettlementAgent
- `intercompany_transaction_log` tracks all ICO transactions
- Month-end elimination via `generateEliminationEntries()`
- `elimination_log` records all IFRS 10 eliminations

**Disclosure:** ICO transactions flagged in consolidated trial balance for note preparation.

---

## IFRS 10 — Consolidation

**Group:** GlassTech Group (parent) → GlassCo, GTK, GTI, Nippon, Factory

**Elimination approach:**
- ICO Revenue (seller) ↔ ICO Purchases (buyer) — eliminate
- ICO Receivable (seller) ↔ ICO Payable (buyer) — eliminate
- Unrealized profit in inventory — eliminate (if ICO at markup)
- Current approach: ICO at cost → no unrealized profit → simpler elimination

---

## Safeguards

1. **Period lock is absolute** — no agent, no override
2. **Revenue always requires owner approval** — IFRS 15 compliance
3. **AGT-JV doc_type** — separates agent entries from manual for audit
4. **Negative balance alerts** — inventory and cash monitored post-posting
5. **Trial balance check** — after every agent-posted batch
