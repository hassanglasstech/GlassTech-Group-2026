# Store Issue — Audit & Phased Fix Plan
**Date:** 2026-07-20 · **Screen:** `modules/sales/companies/nippon/StoreIssueScreen.tsx`
**Route:** `#/store-issue` (store-only role, module `store-issue`)

---

## The headline

The picking screen is, today, **record-keeping theatre**. It asks the picker for a
partial quantity, a bin and a note, saves all three to the cloud — and then issues
stock using the *ordered* quantity, ignoring every one of them.

`pickedQty` is written and read **only inside this one file**. Nothing downstream
consumes it.

> Picker enters 8 of 10 → **10** leave stock, the order is marked fully
> **Delivered**, and (once `finance.gl_enabled` is on) the invoice bills **10**.
> Two pieces left on paper but not off the shelf.

---

## Decision taken (founder did not answer; recommended default applied)

**Partial pick → issue what was picked, keep the order open.**
Short lines stay in the store queue with the remainder outstanding. This is
standard WMS behaviour and the only IFRS-defensible one: inventory is relieved
when control actually transfers, so what never left the building is still ours.

Consequence, deliberate: **a partial issue does NOT generate an invoice.** Billing
waits for full delivery, otherwise the customer is charged for goods still on our
shelf. (Moot while `finance.gl_enabled` is OFF, but the gate is written now so
flipping the flag later stays safe.)

To reverse it (close the order on a short issue instead), change the `fullyIssued`
branch in `nipponFulfilmentService.issueNipponOrder` — that one flag decides the
status, the `issuedAt` stamp and whether an invoice is raised.

---

## Phases

### P0 — data integrity & audit truth  ✅ DONE (commit e37f912, on main + GT-Production)
| # | Finding | Fix |
|---|---|---|
| P0-1 | `pickedQty` never reaches the stock movement — issue uses ordered qty | Issue moves the **picked** qty; per-line `issuedQty` accumulates; order closes only when every line is fully issued |
| P0-2 | Counter lies: `openDetail` pre-fills `pickedQty` = full qty, so the header reads "Picked 10/10" before a shelf is touched | Picked starts **empty**; "Pick all" is one explicit click |
| P0-3 | `pickedBy`/`pickedAt` stamped on Save Progress *and* on issue — so the stamp means "last edited", not "picked" | Stamp only on a real Mark Picked; issue records `issuedBy`/`issuedAt` separately |

### P1 — the ceremony is bypassable / data can be blank  ✅ DONE
| # | Finding | Fix |
|---|---|---|
| P1-1 | List-row **Issue** skips picking entirely | Shortcut survives only for a `Picked` order; anything else shows "Open Pick List" and opens the sheet |
| P1-2 | Gate pass is advisory end-to-end — zero guards anywhere in sales services | The issue confirm now names the missing pass (and says whether one was requested). Still non-blocking, deliberately — the store must not be held hostage to the office |
| P1-3 | Cold boot shows on-hand 0 / blank images for a store-only user — screen uses sync localStorage reads while the rest of the app is async | Screen **and** `issueNipponOrder` now read async. **This was worse than a display bug**: the service also read the sync store, so on a fresh device every move found no row, changed nothing, and the order was still stamped Delivered — goods out, stock untouched. A guard now refuses the issue when no move lands |

### P2 — correctness under concurrency / discoverability  ✅ DONE
| # | Finding | Fix |
|---|---|---|
| P2-1 | `savePick` writes the whole order from stale state — Sales revising while the store picks = silent clobber | Fixed at the root instead of merely detected: `savePick` re-reads the order and merges back ONLY the three fields the store owns (bin, picked qty, note) + pick status, so a concurrent Sales edit survives. A changed line set is refused with a clear message. See the note below on why `version` was not used |
| P2-2 | `ProcurementHub.tsx` hides Logistics for Nippon, but the store's own toast says "the office will issue it from Logistics" | Un-hidden. `LogisticsModule` short-circuits for Nippon and renders ONLY the gate-pass desk — the other half of "Request Gate Pass" — so the original "trader has no factory logistics" reasoning did not apply to it |

### P3 — UI / workflow polish  ✅ DONE
| # | Finding | Fix |
|---|---|---|
| P3-1 | Card `<button>` contains the Issue `<button>` — invalid HTML, browsers split the markup and the inner control leaves the tab order | Card → `<div role="button" tabIndex={0}>` with Enter/Space handling and a focus ring |
| P3-2 | Mark Picked closes the sheet, but Request Gate Pass lives in that same toolbar | Sheet stays open; the toast points at the next step |
| P3-3 | Issued orders vanish — no way to reprint a gate pass | "Issued in the last 24 hours" section under the queue, with the gate pass + Urdu driver slip still reachable |
| P3-4 | Bin corrections stay on the order, never reach the product's master bin, so the same wrong bin prints forever | Saving a pick writes a corrected bin back to the stock row (fire-and-forget — a bin sync must never fail the pick) |

---

## P0 implementation notes

**New field:** `QuotationItem.issuedQty?: number` — cumulative, rides the items
jsonb, no migration (same precedent as `pickedQty`, `setComponents`, `taxPercent`).

**`stockMovesForLine(item, products, qtyOverride?)`** gained an override so the
issue path can pass the picked-and-remaining qty while approve/void keep using the
ordered qty. Reserve is still made against the full order — the customer committed
to 10, so 10 stays reserved until the order closes or is voided.

**Order lifecycle**

```
Approved ──issue(full)──────────────► Delivered   (issuedAt set, invoice if GL on)
   │
   └────issue(partial)──► Approved    (issuedAt NOT set → stays in the store queue,
                                       pickStatus reset to Pending, remainder shown)
```

**Idempotency:** the old guard was `if (issuedAt) return 'already issued'`. That
still holds for a fully-delivered order. A partially-issued order has no
`issuedAt`, so it can legitimately be issued again — for the remainder only, which
`remainingQty` enforces. Double-clicking Issue on a fully-picked order moves
nothing the second time because the remainder is 0.

---

## Not fixed here, deliberately

- **No true optimistic lock.** `quotations.version` exists and a DB trigger keeps
  it in sync, but nothing on the write path *checks* it — `saveQuotations` is a
  plain upsert, and adding a conditional-update RPC needs a migration (founder-run).
  P2-1 instead removes the clobber by construction: the store only ever writes the
  three fields it owns. A same-field race (two pickers on one order) is still
  last-write-wins.
- Nippon store issue moves stock **locally then syncs** — it is not an atomic RPC
  like `consume_glass_stock`. Two devices issuing the same order concurrently can
  both move stock. Needs a migration; still open.
- The Factory gatekeeper reads gate passes from **notification titles**
  (`FactoryGatekeeper.tsx:68-74`, matches the literal prefix `gate pass`), not from
  `quotation.gatePass`. Renaming that toast silently empties the gate queue. Its
  IN/OUT stamps live in `localStorage` (`gk_gate_log`) — per-device, lost on cache
  clear. Both are real, both are outside this screen.
