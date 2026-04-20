# Prompt: Tempering Trip Cost Allocation into COGS

**Stage:** Future work — NOT current Glassco Sales go-live scope.
**Feed this prompt when:** tempering dispatch flow is ready to be wired into COGS (after sales go-live stabilises).

---

## Problem statement (from Hassan)

> Tempering ki cost COGS mein aa rahi hai — lekin uske saath trip (dispatch) ki cost bhi add honi chahiye.
> Jo trip jis vendor ke paas gaya, uski fare ko **per kg basis** pe har piece mein allocate kiya jaaye —
> taake har piece ka actual delivered cost mil sake (glass + tempering labour + tempering freight).

---

## Current state (what already exists)

1. **Tempering dispatch flow** — `modules/production/` tracks pieces going to vendors (PSG, AHM, Lakhani).
   - Pieces are batched into a dispatch trip.
   - Vendor charges per mm thickness → posted as AP via `postTemperingInboundGL` (see `modules/procurement/services/glasscoGLService.ts`).

2. **COGS posting at delivery** — `postDeliveryCOGS()` in `glasscoGLService.ts`:
   - Raw glass cost (MAP × sqft) → `5111 COGS—Glass Sales / 11511 Glass Inventory`
   - Cutting labour → `51311 Wages—Cutting / 11514 WIP—Direct Labour`
   - Processing labour → `51312 Wages—Processing / 11514 WIP—Direct Labour`
   - **GAP**: No freight/trip cost allocated.

3. **Piece weight** — each piece has implicit weight derivable from:
   - `sqft × thickness × glass density` (2.5 g/cm³ for standard float glass)
   - Or stored on piece as `weightKg` (if field exists — verify in `ProductionPiece` type)

4. **Vendor/trip tables** — verify these exist or need creation:
   - `tempering_dispatches` (trip header: vendor, date, vehicle, total_freight_pkr, total_weight_kg)
   - `tempering_dispatch_pieces` (junction: dispatch_id, piece_id, weight_kg)

---

## What needs to be built

### 1. Data capture at dispatch time

**UI: Dispatch form** (`modules/production/components/TemperingDispatch.tsx` or similar)
- Fields already on the trip: vendor, date, vehicle, driver.
- **Add:** `totalFreightPkr` (total trip fare paid to transporter)
- **Add:** `totalWeightKg` (sum of piece weights — auto-computed, editable)
- **Per piece:** `weightKg` (auto = sqft × thickness_mm × 2.5 / 1000, rounded)
- Validation: dispatch cannot post GL until `totalFreightPkr > 0` AND every piece has `weightKg > 0`.

### 2. Allocation logic (per-kg basis)

```
ratePerKg = trip.totalFreightPkr / trip.totalWeightKg
piece.freightCost = piece.weightKg × ratePerKg
```

Write this in a new service: `modules/production/services/temperingFreightService.ts`
```typescript
export interface FreightAllocation {
  dispatchId: string;
  ratePerKg: number;
  pieceFreight: Array<{ pieceId: string; weightKg: number; freightPkr: number }>;
  totalAllocated: number;  // should equal trip.totalFreightPkr ± rounding
}

export const allocateTripFreight = (dispatch: TemperingDispatch, pieces: ProductionPiece[]): FreightAllocation
```

Rounding: distribute rounding residual to the last piece so `sum(pieceFreight) === totalFreightPkr` exactly (no ledger imbalance).

### 3. GL posting at dispatch (Parked status)

New journal in `glasscoGLService.ts → postTemperingFreightGL(dispatchId, allocation)`:
```
Dr 11515  WIP—Tempering Freight     totalFreightPkr
Cr 21xxx  AP—Transporter (or Cash)  totalFreightPkr
```
- If transporter is cash-paid → credit `10111 Cash` instead of AP.
- TX ID: `GL-TEMP-FRT-{dispatchId}`
- Status: `Parked` (Finance approval gate)
- Stamp each piece with `piece.temperingFreightPerPiece = pieceFreight.freightPkr`

### 4. Release into COGS at delivery

Update `postDeliveryCOGS()` to add a fourth component:
```
temperingFreightCOGS = sum(piece.temperingFreightPerPiece for each delivered piece)
```

Add to existing COGS journal:
```
Dr 5113   COGS—Tempering Freight    temperingFreightCOGS
Cr 11515  WIP—Tempering Freight     temperingFreightCOGS
```

Account `5113` must be added to Glassco COA (Level 4 under `5100 COGS`).
Account `11515` must be added under `11500 WIP`.

### 5. Piece-level cost report

New report page or tab in production: **"True Piece Cost"**:
| Piece ID | Glass (MAP) | Cutting Labour | Processing Labour | Temp. Charges | Trip Freight | **Total Cost** | Sell Price | Margin |
|---|---|---|---|---|---|---|---|---|

This gives Finance the full delivered-cost picture for margin analysis.

---

## Acceptance criteria

- [ ] Dispatch form blocks save if trip freight or any piece weight missing.
- [ ] `allocateTripFreight()` always reconciles: `sum(pieceFreight) === totalFreightPkr` (no 1-rupee drift).
- [ ] GL journal at dispatch balances (`LedgerImbalanceError` if not).
- [ ] At delivery, WIP—Tempering Freight goes to zero for that piece.
- [ ] If a piece is scrapped before delivery, its freight cost posts to `5912 Scrap & Wastage` not COGS.
- [ ] Cross-company freight (if Glassco ships to GTK site) respects inter-company settlement rules.
- [ ] UAT: run 3 dispatches with mixed piece sizes → verify per-kg allocation, COGS release on delivery, inventory unaffected.

---

## Files likely touched

- `modules/production/types/production.ts` — extend `TemperingDispatch`, `ProductionPiece`
- `modules/production/services/temperingFreightService.ts` — NEW
- `modules/production/components/TemperingDispatch*.tsx` — UI for weight + freight
- `modules/procurement/services/glasscoGLService.ts` — new journal + COGS update
- `supabase/migrations/xxxx_tempering_freight.sql` — schema changes + RLS
- New COA seed: accounts `5113`, `11515` for Glassco

---

## Hand-over instructions to next Claude session

Feed this entire file as context. Confirm with Hassan **before coding**:

1. Is the trip freight always paid cash, or sometimes on account? (affects credit leg — AP vs Cash)
2. Glass density used — standard 2.5 g/cm³ for float, or per-type (tempered = same)?
3. Should `weightKg` be auto-calculated and locked, or editable (e.g. crate weight added)?
4. Scrap handling — does customer bear freight on scrapped pieces, or Glassco absorbs?
5. Is there a minimum trip charge (dead freight) even if partial load? How allocated?

Only start coding after these 5 answers.
