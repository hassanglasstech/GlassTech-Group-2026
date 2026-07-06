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
| **3. Pay & Collect (inward)** | Cash-on-collection: `Dr WIP / Cr AP` then `Dr AP / Cr Cash`, settle commitment | **GL** (IFRS-correct) | ⏳ Pending |

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

## Step 3 — remaining work (finance-critical)

Wire pay-&-collect into `ProductionContext.handleInwardPiece` (~line 473, where
`postTemperingInwardGL` is already called on last-piece-received):

1. Capture the AP amount: `const apAmount = postTemperingInwardGL({...})`.
2. Settle in cash: `FinanceService.postVendorPaymentGL({ company, vendorName: dispatch.plantName, amount: apAmount, apAccountCode: '22113', paidBy: 'Cash', invoiceRef: dispatchId, ... })`.
3. `TemperingCommitmentService.settle(dispatchId, ref)`.

### ⚠ Two P1 guards (do NOT ship without these)
- **`apAccountCode: '22113'` is mandatory** — the default is `21113` (Other
  Vendors), which would leave the tempering AP unsettled (dangling 21113/22113).
- **Idempotency guard `PV-TEMP-{dispatchId}`** — `postVendorPaymentGL` builds a
  non-deterministic PV id, so a double inward would post a **duplicate cash
  payment**. Guard on a deterministic ref before posting.

### Open question for owner
- Pay-&-collect is usually **Cash** (11111). Is it ever **Bank** (1112)? If yes,
  add a Cash/Bank choice in the inward UI.

### Step-3 tests to add (`glassco_tempering_sit.test.ts`)
- Full inward → two balanced txns (`GL-TEMP-{id}` Dr 11513/Cr 22113; settlement
  Dr 22113/Cr 11111), vendor AP nets to 0, commitment `Settled`.
- Idempotency: inward twice → exactly one settlement PV.
- Partial/broken pieces → broken loss posted, settlement = received-good AP only.
