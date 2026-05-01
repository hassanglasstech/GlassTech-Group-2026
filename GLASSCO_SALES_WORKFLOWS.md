# Glassco Sales Module — Complete Workflow Map

**Coverage:** Every workflow, every state, every side-effect.
**Date:** 2026-05-02 (Phase-7 go-live audit)

---

## 1. SURFACE AREA (UI Pages & Tabs)

```
SalesCRM (/#/sales)  ─┬─ orders        → SalesOrders.tsx
                      ├─ quotations    → GlasscoQuotationManager
                      ├─ clients       → ClientMaster
                      ├─ design        → GlasscoEditor (glass cutting layout)
                      ├─ pipeline      → SalesPipeline (kanban: Lead/Quote/SO/Invoice)
                      ├─ invoices      → Invoice list + detail
                      └─ complaints    → CustomerComplaintModule

ProductMaster (/#/sales)  → glass rates per thickness/type
GlasscoLeadKanban         → leads pipeline (drag/drop stages)
ClientStatementModal      → AR statement per client (PDF)
```

---

## 2. WORKFLOW INVENTORY (20 distinct workflows)

| # | Code | Name | Mutates |
|---|------|------|---------|
| 1 | **W-CM** | Client Master CRUD | clients |
| 2 | **W-PM** | Product Master CRUD | products |
| 3 | **W-LK** | Lead → Opportunity (Kanban) | leads, quotations |
| 4 | **W-Q** | Quotation Lifecycle | quotations, doc_serials |
| 5 | **W-WD** | Wastage Decision | quotations.wastageDecision |
| 6 | **W-SO** | Sales Order auto-create | quotations (status=Approved + orderNo) |
| 7 | **W-PP** | Production Pieces auto-create | production_pieces |
| 8 | **W-CUT** | Cutting Session close | production_pieces, store_items, ledger |
| 9 | **W-TMP** | Tempering Dispatch & Inward | production_pieces, ledger (AP) |
| 10 | **W-NCR** | NCR (breakage) | production_pieces, ledger (Scrap-Loss/WIP) |
| 11 | **W-DM** | Delivery Marking | production_pieces (Delivered) |
| 12 | **W-INV** | Invoice Generation | invoices, ledger, doc_serials |
| 13 | **W-COGS** | COGS Posting | ledger (Dr COGS / Cr WIP+Inv) |
| 14 | **W-IC** | Inter-company Mirror | ledger (target company KR) |
| 15 | **W-PR** | Payment Receipt | payment_receipts, invoices, ledger |
| 16 | **W-CN** | Credit Note (partial reversal) | credit_notes, invoices, ledger |
| 17 | **W-VOID** | Invoice Void (full reversal) | invoices.status=Voided, ledger |
| 18 | **W-CC** | Customer Complaint | customer_complaints |
| 19 | **W-CS** | Client Statement (AR aging) | (read-only — produces PDF) |
| 20 | **W-LOG** | Activity Logging | activity_logs |

---

## 3. THE PRIMARY FLOW (One Glass Order — Full Disposal)

This is **one event** traced from cradle to grave:

```
Day 0 ─ Inquiry
        Lead created in Kanban (W-LK)
            │ status: New
            │ table: leads
            ▼
Day 1 ─ Quotation
        Lead → "Convert to Quote" (W-Q)
            │ allocateSerial('Glassco','QUT',2026,1) → 0001
            │ id = GT-QUT-GLS-0526-0001
            │ status: Draft
            │ table: quotations (insert)
            │ doc_serials (counter +1)
            │
        GlasscoEditor → add line items (sqft, mm, type)
            │ Wastage Calculator runs → suggests new rate (W-WD)
            │ wastageDecision = { decision:'auto', suggestedNewRatePerSqft }
            │
        SAL-1 guard: discountAmount ≤ subtotal ✓
        Save → Submitted
            │ table: quotations (update status, items, totals)
            ▼
Day 2 ─ Client approves
        QuotationManager → "Approve" button (W-SO)
            │ allocateSerial('Glassco','SO',2026,1) → 0001
            │ orderNo = GT-SO-GLS-0526-0001
            │ status: Approved
            │ table: quotations (update orderNo + status)
            │
        SIDE EFFECT — production pieces auto-created (W-PP)
            │ for each glass item × qty:
            │   piece = { orderId: orderNo, status:'Cut',
            │             pieceCode: GLS-PC-XXXX, sqft, mm, type }
            │ table: production_pieces (bulk insert)
            ▼
Day 3-5 ─ Production
        Cutting Session opened (W-CUT)
            │ Scan raw glass sheets (QR tags from GRN)
            │ assertSufficientStock() — pre-flight check (B8 fix)
            │ Close session →
            │   GL: Dr WIP-Glass / Cr Inventory-Glass (createdBy: system-auto)
            │   table: store_items (qty deducted)
            │   table: stock_ledger (consumption row)
            │
        Pieces flow through state machine (B5 enforced):
            Cut → Service-Pending → QC-Pending → QC-Passed → Ready to Dispatch
            │
        Tempering Dispatch (W-TMP-out)
            │ Pieces dispatched to PSG/AHM/Lakhani
            │ Status: Dispatched
            │ NO GL (correct per IAS 37 — liability not yet incurred)
            │
        Tempering Inward (W-TMP-in)
            │ Pieces received back tempered
            │ Status: Tempered → Ready to Dispatch
            │ GL: Dr WIP-Tempering / Cr AP-Tempering Vendors (Posted, system-auto)
            │ B9 guard: missing rate THROWS — operator must add rate
            ▼
Day 6 ─ Delivery
        SalesOrders → "Mark Delivered" (W-DM)
            │ piece.status = Delivered (state machine: Ready→Delivered)
            │
        Auto-trigger invoice generation (W-INV)
            │ B10 pre-check:
            │   if hasGlassItems && pieceIds.length === 0 → THROW
            │ allocateSerial('Glassco','INV',2026,1) → 0001
            │ invoiceId = GT-INV-GLS-0526-0001
            │
            │ JIT account creation (FinanceService.ensureAccount):
            │   • AR Trade → Customers Control → <Client Name | Project>
            │   • Service Revenue → Glass Processing Services → Service Income
            │   • GST Payable (if gstPercent > 0)
            │
            │ GL Entry — Dr/Cr (createdBy: system-auto)
            │   Dr  Customer AR Sub-Ledger             grandTotal
            │   Cr  Service Income (revenue)           finalAmount
            │   Cr  GST Payable                        gstAmount
            │   FinanceService.assertGLBalance() ✓ (B1)
            │   FinanceService.recordTransaction() — abort on imbalance
            │
            │ table: invoices (insert with status=Outstanding)
            │ table: financial_events (audit row)
            │ table: quotations (update status=Invoiced + invoiceNo)
            │
        Wastage applied (if decision = 'override' or 'review')
            │ effectiveItems use suggestedNewRatePerSqft
            │ table: quotations.items + wastageAppliedAt + wastageAppliedInvoiceId
            │
        COGS Posting (W-COGS)
            │ pieceIds linked → postDeliveryCOGS():
            │   GL Entry (createdBy: system-auto):
            │     Dr  COGS — Glass Processing            (raw glass MAP × sqft)
            │     Dr  COGS — Direct Labour               (WIP-Labour absorbed)
            │     Cr  Inventory-Glass                    (raw value)
            │     Cr  WIP-Direct-Labour                  (labour absorbed)
            │   table: store_items (raw glass qty deducted)
            │
        Inter-company Mirror (W-IC) — if client name matches sister company
            │ Client = "GTI Industries" → mirror creates BILL-* in GTI:
            │   Dr  Material Consumed (target co.)
            │   Cr  Payable to Glassco (target co.)
            │   table: ledger (target_company row, createdBy: system-auto)
            ▼
Day 30 ─ Payment
        SalesOrders → Add payment (W-PR)
            │ allocateSerial('Glassco','RC',2026,1) → 0001
            │ receiptId = GT-RC-GLS-0526-0001
            │ AsyncSalesService.savePaymentReceipts([payment])
            │   → Supabase RPC process_payment_receipt() ATOMIC
            │     • inserts payment_receipts row
            │     • updates invoices.received_amount + invoices.balance
            │     • posts GL: Dr Cash/Bank / Cr Customer AR
            │     • updates invoices.status: Outstanding → Partial → Paid
            │
        STATE MACHINE:
            Outstanding ──(partial)──→ Partial ──(full)──→ Paid
            ▼
Day N (terminal) — Invoice closed, AR cleared, books balanced.
```

---

## 4. EXCEPTION FLOWS (Reverse Disposal)

### 4a. CREDIT NOTE (W-CN) — partial reversal

```
Trigger: Customer returns 5/100 sqft (defective)
   │
   ▼
SalesOrders / Invoice detail → "Issue Credit Note"
   │ allocateSerial('Glassco','CN',2026,1) → 0001
   │ cnId = CN-GLA-2026-0001
   │
   ▼
issueCreditNote({ invoice, amount: 25000, reason: 'defect-return' })
   │ Hard guard (P2-2): if !origTx → THROW
   │   "Original invoice GL not found — restore or post manual reversal"
   │ Hard guard: amount > invoice.balance → THROW
   │
   ▼
GL Reversal (createdBy: system-auto, docType: RV)
   Dr  Service Revenue                     25000   (reversal)
   Cr  Customer AR Sub-Ledger              25000   (AR cleared)

table: credit_notes (insert)
table: invoices (balance reduced 100000→75000)
table: ledger (reversing tx)
   │
   ▼
COGS Reversal (proportional!)
   reversalRatio = 25000 / 100000 = 0.25
   Dr  Inventory-Glass                     (raw × 0.25)
   Dr  WIP-Direct-Labour                   (labour × 0.25)
   Cr  COGS — Glass Processing             (raw × 0.25)
   Cr  COGS — Direct Labour                (labour × 0.25)
   │
   ▼
Financial Event row inserted
Books balanced. Invoice still "Outstanding" but for 75000.
```

### 4b. INVOICE VOID (W-VOID) — full reversal

```
Trigger: Customer cancels entirely (before any payment)
   │
   ▼
voidInvoice({ invoice, voidedBy: 'Hassan' })
   │ Guard: invoice.status !== 'Paid'        (can't void paid)
   │ Guard: invoice.receivedAmount === 0     (use CN if partial)
   │ Guard: invoice.status !== 'Voided'      (already voided)
   │
   ▼
GL: full reversal of original invoice GL (swap debit↔credit)
table: invoices (status='Voided', revertedStatus=prevStatus, balance=0,
                  voidedBy, voidedAt)
   │
   ▼
COGS reversed at 100% (full proportion)
   │
   ▼
Quotation status restored: Invoiced → Approved
   │ invoiceNo cleared
   │
   ▼
Terminal: Voided. revertedStatus preserves prior status for audit.
```

### 4c. CUSTOMER COMPLAINT (W-CC)

```
Trigger: Customer raises issue (defect, late delivery, etc.)
   │
   ▼
SalesCRM → Complaints tab → "New Complaint"
   │ Fields: clientId, invoiceId, type (Defect/Damage/Late/Other),
   │         description, severity, expectedResolution
   │ State: Open
   │ table: customer_complaints (insert)
   │ FK to clients.id (P3 — Phase-7 037 migration)
   │ FK to invoices.id (P3)
   │
   ▼
State machine (CHECK constraint in 037):
   Open → In Progress → Resolved → Closed
                     ↘ Rejected
   │
   ▼
Resolution path may trigger:
   • W-CN (refund via credit note)
   • W-VOID (cancel invoice)
   • Manual: replacement piece (no GL — internal only)
   • Mark Resolved (no GL — informational)
```

---

## 5. STATE MACHINES (visual)

### 5a. QUOTATION
```
┌─────────┐  edit   ┌───────────┐  approve  ┌──────────┐  invoice  ┌──────────┐
│  Draft  │────────▶│ Submitted │──────────▶│ Approved │──────────▶│ Invoiced │
└─────────┘         └───────────┘           └──────────┘           └──────────┘
     │                    │                       │                      │
     │                    └─reject───┐            │                      │
     │                               ▼            │                      ▼
     ▼                          ┌─────────┐       │ void                ┌─────────┐
   delete                       │Rejected │◀──────┘                     │  Paid   │
                                └─────────┘                             └─────────┘
                                                                              │
   (all states still in CHECK constraint via migration 037)                   ▼
                                                                          terminal
```

### 5b. INVOICE
```
                          ┌──────────────┐
              ┌──────────▶│ Outstanding  │──── partial pay ────┐
              │           └──────────────┘                     ▼
   create  ───┘                  │                      ┌────────────┐
                                 │ full pay             │  Partial   │
                                 ▼                      └────────────┘
                          ┌──────────────┐                     │
                          │    Paid      │◀── full pay ────────┘
                          └──────────────┘
                                 ▲
                          credit note clears balance
                                 │
   ┌──────────────┐  void  ┌──────────────┐
   │Outstanding/  │───────▶│   Voided     │
   │  Partial     │        │ (revertedSt. │
   └──────────────┘        │  preserved)  │
                           └──────────────┘
```

### 5c. PRODUCTION PIECE
```
Cut ──▶ Service-Pending ──▶ QC-Pending ──▶ QC-Passed ──▶ Ready to Dispatch
 │                                ▲              │              │
 │                                │              │              ▼
 └──── QC-Failed ───┐              │              │         Dispatched
                    │              │              │              │
                    ▼              │              │              ▼
               (rework loop) ──────┘              │         Tempered
                                                  │              │
                                                  ▼              ▼
                                       Received-From-Tempering
                                                  │
                                                  ▼
                                            Delivered (terminal)

Universal (any non-terminal): → Hold | Broken | Returned
B5 enforces: illegal jumps blocked with toast error.
```

---

## 6. GL ACCOUNT MAP (Glassco Sales)

| Event | Debit | Credit |
|-------|-------|--------|
| Invoice (revenue) | 12210 Customer AR — Sub-ledger | 41110 Service Income |
| Invoice (GST) | (above for grandTotal) | 2214 GST Payable |
| Cutting consumption | 11513 WIP-Direct-Material | 1151X Inventory-Glass-{mm}mm |
| Tempering inward | 11513 WIP-Tempering | 22113 AP-Tempering-{vendor} |
| COGS at delivery | 5111 COGS-Glass + 51311 COGS-Labour | Inventory-Glass + 11514 WIP-Labour |
| Payment receipt (cash) | 11111 Cash in Hand | 12210 Customer AR — Sub-ledger |
| Payment receipt (bank) | 1112 Bank — MCB | 12210 Customer AR — Sub-ledger |
| Credit Note | 41110 Service Income (reversal) | 12210 Customer AR — Sub-ledger |
| CN COGS reversal (proportional) | Inventory + WIP-Labour | COGS-Glass + COGS-Labour |
| NCR breakage | 5118 Scrap-Loss | 11513 WIP |
| Inter-company mirror (target co.) | 5114 Material Consumed | 22114 Payable to Glassco |

---

## 7. PHASE-7 GUARDS (validation summary)

| Guard | Where | What it blocks |
|-------|-------|---------------|
| **B1** | deliveryInvoiceService L223 | GL imbalance → invoice creation aborts |
| **B4** | deliveryInvoiceService L48 | Duplicate invoice numbers (atomic via allocate_serial) |
| **B5** | ProductionContext | Illegal piece state transitions (e.g. Cut→Dispatched) |
| **B6** | ncrService L73 | NCR write-off GL invisible (now visible toast on fail) |
| **B8** | CuttingIntelligenceHub L142 | Negative stock from cutting (pre-flight `assertSufficientStock`) |
| **B9** | glasscoGLService L313 | Tempering AP under-recognized (missing rate now THROWS) |
| **B10** | deliveryInvoiceService L150 | Glass invoice with no pieces (revenue without COGS) |
| **P2-2** | creditNoteService L110 | CN posts to wrong account (hardcoded fallback removed) |
| **P2-3** | asyncSalesService L---  | Discount > subtotal (SAL-1) |
| **037** | DB CHECK constraints | Bad status values (`Voided` not `Void`) |
| **037** | DB UNIQUE constraint | Duplicate quotation order numbers |
| **037** | DB FK constraints | Orphan credit_notes / payment_receipts / complaints |

---

## 8. CROSS-MODULE TRIGGERS (Sales → other modules)

| Sales Event | Triggers in Other Module |
|-------------|--------------------------|
| Quotation Approved | Production: pieces created from items |
| Cutting Session closed | Inventory: stock deducted; Finance: WIP GL |
| Tempering Inward | Procurement: AP recognized for vendor |
| Invoice generated | Finance: AR + Revenue + GST GL |
| Invoice generated (sister-co. client) | Finance (target company): mirror BILL entry |
| Delivery marked | Finance: COGS GL posted |
| Payment receipt | Finance: Cash/Bank Dr / AR Cr (atomic via RPC) |
| Credit Note issued | Finance: Revenue Dr / AR Cr + COGS reversal |
| Invoice Voided | Finance: full reversal; Sales: quotation reverts to Approved |
| Customer Complaint logged | (no automatic GL — informational only) |

---

## 9. ARTIFACTS (Documents Produced)

| Doc Type | Component | Trigger | Output |
|----------|-----------|---------|--------|
| Quotation | GlassCoQuotationPrint | "Print Quote" | PDF for client |
| Sales Order | GlassCoSalesOrderPrint | After approval | PDF for production |
| Job Card | GlassCoJobCardPrint | After SO | PDF for cutter |
| Sheet Tag | GlassCoSheetTagPrint | After cutting | QR tags for pieces |
| Service Order | GlasscoServiceOrderPrint | Tempering dispatch | Vendor doc |
| GRN | GRNPrint | (procurement) | Receipt slip |
| Invoice | SalesInvoicePrint | After invoice gen | PDF for client |
| Client Statement | ClientStatementModal | On demand | AR aging PDF |
| NCR Defect Report | NCRDefectPrint | When NCR raised | Internal slip |

---

## 10. SERIAL NUMBER ALLOCATION (atomic via allocate_serial RPC)

| Doc Prefix | Format | Counter Key |
|-----------|--------|-------------|
| Quote | `GT-QUT-GLS-MMYY-XXXX` | Glassco_QUT_2026 |
| Sales Order | `GT-SO-GLS-MMYY-XXXX` | Glassco_SO_2026 |
| Invoice | `GT-INV-GLS-MMYY-XXXX` | Glassco_INV_2026 |
| Receipt | `GT-RC-GLS-MMYY-XXXX` | Glassco_RC_2026 |
| Credit Note | `CN-GLA-2026-XXXX` | Glassco_CN_2026 |
| Parked PV | `GT-PV-GLS-MMYY-XXXX` (12001+) | Glassco_PV |
| Production Piece | `GLS-PC-XXXXXX` | (sequential) |
| GRN | `GRN-GLS-XXXXXXXX` | (timestamp suffix) |

All allocated atomically via Postgres `allocate_serial(company, prefix, year, qty)` RPC — collision-safe.

---

## 11. SHORTCOMINGS (Tracked, Not Blocking Go-Live)

- **Wastage AI agent**: Phase-1 uses formula-based; Phase-2 will add ML refinement.
- **Lead Kanban**: drag-drop functional but no auto-conversion-to-quote button.
- **AR Aging**: 30/60/90 buckets calculated client-side; no server view.
- **Activity Log retention**: stays in `activity_logs` indefinitely; needs purge policy.
- **Sales pipeline forecasting**: probability % per stage not yet wired.

---

## 12. GO-LIVE READINESS (per workflow)

| Workflow | Status |
|----------|--------|
| W-CM Client Master | ✅ |
| W-PM Product Master | ✅ |
| W-Q Quotation Lifecycle | ✅ |
| W-WD Wastage Decision | ✅ |
| W-SO Sales Order auto-create | ✅ |
| W-PP Production Pieces auto-create | ✅ |
| W-CUT Cutting Session | ✅ (B8 stock guard) |
| W-TMP Tempering | ✅ (B9 rate guard, B2 system-auto) |
| W-NCR NCR | ✅ (B6 visible) |
| W-DM Delivery Marking | ✅ |
| W-INV Invoice Generation | ✅ (B1, B4, B10 guards) |
| W-COGS COGS Posting | ✅ (proportional CN reversal) |
| W-IC Inter-company Mirror | ✅ (system-auto) |
| W-PR Payment Receipt | ✅ (atomic RPC) |
| W-CN Credit Note | ✅ (P2-2 hard-fail on missing GL) |
| W-VOID Invoice Void | ✅ (revertedStatus preserved) |
| W-CC Customer Complaint | ✅ (FK + CHECK in 037) |
| W-CS Client Statement | ✅ |
| W-LK Lead Kanban | ✅ |
| W-LOG Activity Logging | ✅ |

**Total: 20/20 workflows production-ready.**

---

*End of map.*
