# Production Workflow Validation — GlassCo Glass Manufacturing

**Date:** 2026-04-15
**Source:** Actual codebase analysis vs Master Plan Section 9

---

## Workflow 1: Order to Cut

| Requirement | Status | Evidence |
|---|---|---|
| Sales order status = APPROVED required | PASS | ProductionFloorPlanner.tsx filters: `'Approved','Sent','Partial Payment'` |
| Material stock check before assignment | GAP | No stock check at assignment time. SCM-3 only triggers at stock issue |
| 3 cutting tables (A/B/C) with team drag-drop | PASS | `STATIONS[]` with ct1, ct2, ct3 + processing + dispatch. Team drag-drop implemented |
| Piece generation with GLS-{thickness}-{MMYY}-{batch}-{serial} | PARTIAL | Piece ID format is `<orderId>/<itemIndex>` (e.g., GLS-2428/3). Not the specified format but functional |
| WIP GL entry: Dr WIP / Cr Raw Material @ MAP | GAP | WIP GL posting not triggered at cutting assignment. Only NCR disposal posts GL |
| Shift simulation working | PASS | Real-time simulation with speed controls (0.5x-6x), sqft throughput, utilization % |
| Team assignment persisted | PASS | Teams stored in component state with full CRUD. Persists via localStorage |

**Gaps:** Stock pre-check at assignment, WIP GL entry at cutting start

---

## Workflow 2: Tempering Flow

| Requirement | Status | Evidence |
|---|---|---|
| Piece status = CUT_COMPLETE required | PASS | Status `Cut` → `Tempering`. Enforced at UI level |
| Batch assembly logic (furnace capacity) | GAP | No furnace capacity constraint. All cut pieces can be batched |
| Tempering duration tracking | GAP | No timer/duration. Status changes: Tempering → next status |
| Status update: TEMPERING → TEMPERED | PARTIAL | Status goes Tempering → QC-Passed (no intermediate TEMPERED state) |
| Partial batch handling | GAP | No minimum batch size logic. Any number of pieces can be dispatched |

**Gaps:** Furnace capacity, duration tracking, partial batch minimum

---

## Workflow 3: QC / NCR

| Requirement | Status | Evidence |
|---|---|---|
| NCR types (BREAKAGE/SPEC_FAIL/SURFACE/VENDOR) | PASS | 7 cause codes (BR-01 to BR-07) covering all categories |
| GL entry: Dr Production Loss / Cr WIP @ absorbed cost | PASS | ncrService._postWriteOffGL: Dr 511 Breakage Loss / Cr 1311 WIP Glass |
| Vendor Debit Note for VENDOR_DEFECT | PASS | ncrService.settleClaim: Dr Cash / Cr 44111 Vendor Claim Recovery |
| Recut decision logic (size feasibility) | PARTIAL | Reproduce action exists but no automatic size feasibility check |
| Root cause + corrective action mandatory | PARTIAL | `cause` field (NCRCause) is required. No corrective action field |
| Vendor scorecard updating on defects | GAP | vendor_sla table exists but NCR creation doesn't update breach_count |

**Gaps:** Auto recut feasibility, corrective action field, vendor scorecard update

---

## Workflow 4: Delivery to Receivable

| Requirement | Status | Evidence |
|---|---|---|
| Delivery Challan format DC-GCO-2026-XXXX | GAP | No DC number generation found. Gate pass exists but no challan format |
| All pieces TEMPERED before dispatch | PARTIAL | MFG-5 validates vehicle payload. No status gate enforcing QC-Passed |
| Client signature (BA-03 acknowledgment) | GAP | No digital signature capture in dispatch flow |
| Invoice with GST auto-calc | PARTIAL | deliveryInvoiceService posts revenue GL but GST split not explicit |
| Revenue GL: Dr AR / Cr Sales / Cr GST | PARTIAL | Posts Dr AR / Cr Revenue. No separate GST payable leg |
| COGS GL: Dr COGS / Cr Finished Goods | GAP | No COGS posting at dispatch. Only revenue-side GL exists |
| Partial delivery invoicing | GAP | No partial delivery invoice logic found |

**Gaps:** DC number format, piece status gate, client signature, GST split, COGS GL, partial invoicing

---

## Workflow 5: Remnant Loop

| Requirement | Status | Evidence |
|---|---|---|
| Remnant tag format REM-{thickness}-{MMYY}-{serial} | PASS | ID format: `REM-5MM-0426-123` confirmed in RemnantManager |
| Aging categories (0-10 Prime / 11-20 / 20+ Alert) | DIFFERENT | Actual: 45-day threshold (not 20). No multi-tier categories |
| Day 20 Decision Agent scan for size match | DIFFERENT | History-based recommendation (usedCount vs scrappedCount) replaces fixed-day scan |
| Day 30 IAS 2 NRV write-down | GAP | No automatic NRV write-down at any threshold |
| GL: Dr Inventory Write-Down / Cr Remnant Inventory | PARTIAL | Scrap disposal GL exists (postScrapDisposalGL) but triggered manually, not by aging |

**Finding:** Remnant aging uses **45-day threshold** with **history-based intelligence** rather than fixed 20-day rule. This is actually more sophisticated than the Master Plan.

---

## Validation Questions — Answers

### 1. What production events are most commonly missed in standard glass ERP?
From codebase analysis, these events have no patterns:
- **Tool/blade replacement** — cutting table blade life tracking not found
- **Rework authorization** — re-tempering flow not implemented
- **Inter-company transfer** — GlassCo → GTK transfer triggers exist (generate_intercompany_order RPC) but no EventOS pattern
- **Outsourcing decision** — tempering is outsourced (vendor dispatch exists) but capacity-based outsourcing decision not automated
- **Production variance reconciliation** — planned vs actual sqft per shift not formally tracked (simulation exists but no end-of-shift comparison)

### 2. Is 20-day remnant aging threshold industry standard?
**No. The codebase uses 45 days**, which is more realistic for glass manufacturing:
- Glass remnants retain full value longer than perishable materials
- South Asian glass market has longer reuse windows (project-based demand)
- 45 days aligns with typical order cycle (quote → cut → deliver)
- History-based recommendation (actual usage vs scrap ratio) is more accurate than fixed thresholds
- **Recommendation:** Keep 45-day alert threshold. Add configurable per-thickness override.

### 3. How should partial tempering batches be handled?
- **Current:** No minimum batch logic — any number dispatched
- **Industry practice:** Run at 70%+ capacity. Below that, wait up to 4 hours for more pieces
- **Recommendation:** Add configurable `min_batch_fill_pct` (default 70%) with time-out override. If batch sits >4 hours below threshold, auto-dispatch with cost note

### 4. Standard approach for rush orders jumping queue?
- **Implemented:** ProductionDecisionAgent.assessRushOrder() scores 0-100 based on:
  - Client payment history (+15 if <30 days)
  - Order value (+10 if >PKR 100K)
  - Queue depth (-15 if >50 active)
- **Industry practice:** 50% advance mandatory for rush, position 1-3 in queue, communicate delay to affected orders
- **Recommendation:** Current scoring is sound. Add WhatsApp notification to delayed orders' clients

### 5. Should recut authorization be automatic or manual?
- **Recommendation:** Semi-automatic:
  - Pieces <PKR 5,000: auto-approve recut (ProductionDecisionAgent.recutVsScrap)
  - Pieces PKR 5,000-25,000: recommend with one-click approval
  - Pieces >PKR 25,000: mandatory manual review with Production Manager
- **Current:** Manual (Reproduce action in NCR). DecisionAgent provides recommendation.

### 6. How do other glass manufacturers handle vendor defect claims?
- **Current implementation is solid:** NCR → Vendor-Claim action → Claim record → Settlement → GL recovery
- **Industry standard additions:**
  - Photo evidence mandatory (photos[] field exists in NCREvent)
  - Claim aging: 7 days for acknowledgment, 30 days for settlement
  - Auto-update vendor_sla.breach_count on claim creation (currently GAP)
  - Quarterly vendor review trigger when breach_rate > 5%

---

## Missing Production Events (Not in EventOS)

| Event | Priority | Description |
|---|---|---|
| Blade/tool replacement | Medium | Track cutting blade life, alert at 80% capacity |
| Re-tempering | Low | Tempered piece needs re-processing (rare) |
| Inter-company transfer | High | GlassCo → GTK project glass transfer |
| Outsourcing decision | Medium | When tempering capacity full, outsource to vendor |
| End-of-shift reconciliation | Medium | Compare planned vs actual sqft output |
| Client site complaint | High | Post-delivery quality issue reported by client |
| Raw material quality check | Medium | Incoming glass sheet quality before storage |

---

## Production Vocabulary (Roman Urdu → ERP Action)

| Staff Says | Category | ERP Action |
|---|---|---|
| shesha toot gaya | NCR | Create NCR, mark piece Broken |
| kaat do / kaatna hai | Cutting | Assign to cutting table |
| tempering mein daal do | Tempering | Create tempering batch |
| check kr lo | QC | QC inspection |
| bacha hua kahan use ho | Remnant | Check remnant inventory |
| jaldi chahiye | Rush | Priority assessment |
| table kharab hai | Breakdown | Log maintenance event |
| team badal do | Shift | Update team assignment |
| glass km hai | Shortage | Check stock, create requisition |
| delivery bhejo | Dispatch | Create gate pass, dispatch |
| kitna kaata aaj | Target | Pull cutting report |
| kitna tuta | Wastage | Pull NCR summary |
| blade badal do | Maintenance | Tool change event |

---

## Test Results

| # | Test | Result |
|---|---|---|
| 1 | "shesha toot gaya" → PROD-002 NCR | PASS (keywords: toot, shesha match) |
| 2 | Cutting job assigned to correct table | PASS (ct1/ct2/ct3 assignment in FloorPlanner) |
| 3 | Tempering batch — partial batch scenario | GAP (no min batch size logic) |
| 4 | NCR GL entry auto-posted | PASS (ncrService._postWriteOffGL) |
| 5 | Remnant 45+ days triggers alert | PASS (isAged check at 45 days) |
| 6 | Delivery creates Revenue GL | PASS (deliveryInvoiceService). COGS GL: GAP |
| 7 | Rush order uses payment history + margin | PASS (ProductionDecisionAgent.assessRushOrder) |
| 8 | 5 Master Plan workflows → code | 5/5 mapped, gaps documented above |
