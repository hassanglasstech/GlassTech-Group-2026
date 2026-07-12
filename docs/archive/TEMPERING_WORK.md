# TEMPERING WORK — Glassco Tempering Flow (3-step build)

> Progress + resume doc for the one-window tempering dispatch work.
> Last updated: 2026-07-06. Branch: `GT-Production`.

---

## Goal

One-window tempering flow for Glassco: send QC-passed glass to a tempering
vendor (PSG / AHM / Lakhani), pay on collection, receive back — with the correct
IFRS accounting and minimal screen-hopping.

## The 3 steps

| Step | What | GL? | Status |
|------|------|-----|--------|
| **1. Dispatch-OUT** | One screen: ready-for-tempering pool → order-wise partial pick → vendor + vehicle/driver → dispatch → auto Service Order + Gate Pass print | **No GL** (own glass out for a service) | ✅ Done |
| **2. Commitment memo** | Non-GL "Expected Tempering Payment" created at dispatch-out → finance cash-forecast | **No GL** (IAS 37 commitment, disclosed only) | ✅ Done |
| **3. Pay & Collect (inward)** | Cash-on-collection: `Dr WIP / Cr AP` then `Dr AP / Cr Cash` (Cash **or** Bank), settle commitment | **GL** (IFRS-correct) | ✅ Wired (preview-test pending) |

---

## IFRS decisions (owner-confirmed)

- **Tempering payment is CASH-ON-COLLECTION, not an advance and not credit.** Our
  vehicle loads + checks the tempered glass at the vendor, we pay, then it
  departs. Service done + goods in our possession at payment = no timing gap.
- **Dispatch-OUT posts NO journal.** The future payment is only a *commitment*
  (IAS 37 — tracked/disclosed, never recognized). Booking a payable at
  dispatch-out would overstate liabilities.
- **At collection (Step 3):** `Dr WIP-Services (11513) / Cr AP-Tempering (22113)`
  then immediately `Dr AP (22113) / Cr Cash (11111)` (two-step keeps the vendor
  ledger + payment voucher). Cost stays in WIP until final delivery → COGS.

---

## What's built (Steps 1 & 2)

- `modules/production/pages/TemperingDispatchOut.tsx` — the one-window screen.
  Route: **`/#/production/tempering-dispatch`** (RBAC = production; role gate:
  dispatch_staff / supervisor / factory_manager / admin).
- `modules/procurement/components/prints/GatePassPrint.tsx` — reusable gate pass
  (extracted from DispatchPlanner). Service Order reuses
  `modules/sales/components/prints/ServiceOrderPrint.tsx`.
- `modules/finance/services/temperingCommitmentService.ts` — non-GL commitment
  (`gtk_erp_tempering_commitments`), idempotent `createFromDispatch/settle/cancel`.
- `modules/procurement/services/glasscoGLHelpers.ts` — added
  `computeTemperingCharges()` (shared per-piece formula = same as inward AP).
- `modules/__tests__/tempering_commitment.test.ts` — 7 tests.

**Verified:** tsc 0 errors, full vitest suite green (369 tests).

### How to test (Steps 1-2)
1. Company = **Glassco**, open `/#/production/tempering-dispatch`.
2. Pool shows QC-passed pieces (not already dispatched), grouped by order.
3. Tick pieces across orders (partial OK), pick vendor + vehicle/driver → **Dispatch + Print**.
4. Service Order auto-prints; Gate Pass one click. A commitment appears in storage (finance surface wiring is part of Step 3 polish).

---

## Step 3 — DONE (wired 2026-07-07, preview-test pending)

Wired into `ProductionContext.handleInwardPiece` (last-piece-received branch):
1. `const apAmount = postTemperingInwardGL({...})` (was discarding the return).
2. Settlement: `FinanceService.postVendorPaymentGL({ company, vendorName, amount: apAmount, paymentDate, paidBy: temperingPayMethod, apAccountCode: '22113', invoiceRef: dispatchId, createdBy: <operator> })` → `Dr AP 22113 / Cr Cash 11111` (or `Bank 1112`).
3. `TemperingCommitmentService.settle(dispatchId, pv.id)`.

**Cash/Bank:** owner confirmed BOTH → `temperingPayMethod` state (Cash|Bank) on ProductionContext + a toggle in the Inward page header.

### Two P1 guards (implemented)
- ✅ **`apAccountCode: '22113'`** passed explicitly (default 21113 would settle the wrong payable).
- ✅ **Idempotency** — gated on `apAmount > 0` (inward GL is idempotent on `GL-TEMP-{id}`) **plus** a deterministic ledger check `docType==='PV' && referenceId===dispatchId` before posting.

### A3 Inward page (this session)
- `modules/production/pages/InwardReceivePage.tsx` — route `/#/production/inward` (dark). Revives `InwardAuditView` + built the two missing modals (Direct Delivery → `executeDirectDelivery`/COGS, Putaway → `assignSpot`). GL reused unchanged.

### ⚠️ Preview-test (money-path — before promoting to main)
- [ ] `/#/production/inward`: select a Dispatched tempering trip → receive its pieces → on the LAST piece: AP posts AND payment settles (Cash/Bank per toggle); vendor AP nets to 0; commitment → Settled.
- [ ] Double-click last piece → exactly ONE settlement PV (no duplicate cash).
- [ ] Direct Site Delivery modal → COGS posts, pieces → Delivered.

### Still to do
- Hub card "Receive / Inward" in GlasscoProductionHub (after preview-test).
- Automated `glassco_tempering_sit.test.ts` (handleInwardPiece is provider-coupled — needs a mounted-provider harness; deferred to after preview-test).
- Broken/lost pieces at inward: current flow only completes when ALL pieces received (pre-existing gap; brokenPieceIds path not wired in InwardAuditView).
