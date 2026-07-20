/**
 * Store Issue P0 — the picked quantity must be the one that moves.
 *
 * The defect this pins: the pick sheet asked for a partial quantity, saved it,
 * and then issued the ORDERED quantity anyway. Eight counted off the shelf, ten
 * relieved from stock, order closed as fully delivered, customer billed for ten.
 *
 * See STORE_ISSUE_AUDIT_2026-07-20.md.
 */
import { describe, it, expect } from 'vitest';
import { issueQtyFor, remainingQty } from '@/modules/sales/companies/nippon/nipponFulfilmentService';
import { stockMovesForLine } from '@/modules/nippon/utils/productSets';
import type { QuotationItem } from '@/modules/production/types/production';
import type { Product } from '@/modules/procurement/types/inventory';

const line = (over: Partial<QuotationItem>): QuotationItem => ({
  id: 'ITM-1', description: 'HANDLE', locationCode: 'H1', glazingSpecs: '',
  qty: 10, width: 0, height: 0, totalSqFt: 0, pricePerUnit: 100, amount: 1000,
  ...over,
} as QuotationItem);

const HANDLE = {
  id: 'H1', company: 'Nippon', category: 'Hardware', description: 'HANDLE',
  basePrice: 100, unit: 'PCS', variants: [],
} as Product;

describe('issueQtyFor — what actually goes out', () => {
  it('issues what was PICKED, not what was ordered', () => {
    // The whole point. 8 counted → 8 leave, never 10.
    expect(issueQtyFor(line({ pickedQty: 8 }))).toBe(8);
  });

  it('issues the full remainder when the picker never opened the sheet', () => {
    // Untouched (undefined) is not the same as zero — it means "no partial pick
    // was recorded", which is the plain full-issue path from the queue.
    expect(issueQtyFor(line({ pickedQty: undefined }))).toBe(10);
  });

  it('treats an explicit 0 as nothing picked, not as untouched', () => {
    expect(issueQtyFor(line({ pickedQty: 0 }))).toBe(0);
  });

  it('cannot hand over more than the order owes, whatever was typed', () => {
    expect(issueQtyFor(line({ pickedQty: 999 }))).toBe(10);
  });

  it('counts only the outstanding remainder on a second visit', () => {
    const partIssued = line({ qty: 10, issuedQty: 8 });
    expect(remainingQty(partIssued)).toBe(2);
    expect(issueQtyFor({ ...partIssued, pickedQty: undefined })).toBe(2);
    // Typing the original 10 on the follow-up must not re-issue the first 8.
    expect(issueQtyFor({ ...partIssued, pickedQty: 10 })).toBe(2);
  });

  it('is exhausted once the order is fully issued — a repeat click moves nothing', () => {
    const done = line({ qty: 10, issuedQty: 10 });
    expect(remainingQty(done)).toBe(0);
    expect(issueQtyFor({ ...done, pickedQty: undefined })).toBe(0);
    expect(issueQtyFor({ ...done, pickedQty: 5 })).toBe(0);
  });
});

describe('the picked qty reaches the stock movement', () => {
  it('moves the picked qty, not the ordered qty', () => {
    const it8 = line({ pickedQty: 8 });
    const moves = stockMovesForLine(it8, [HANDLE], issueQtyFor(it8));
    expect(moves).toEqual([{ refId: 'H1', need: 8, product: HANDLE }]);
  });

  it('still reserves the FULL order at approve — the customer committed to 10', () => {
    // No override → ordered qty. Approve and void must not shrink to the pick.
    expect(stockMovesForLine(line({ pickedQty: 8 }), [HANDLE])[0].need).toBe(10);
  });

  it('explodes a SET line by the picked count, not the ordered count', () => {
    const setLine = line({
      qty: 3, pickedQty: 2,
      setComponents: [
        { productId: 'H1', description: 'HANDLE', unit: 'PCS', qtyPerSet: 4 },
      ],
    });
    // 2 sets picked × 4 per set = 8 handles leave, not 3 × 4 = 12.
    expect(stockMovesForLine(setLine, [HANDLE], issueQtyFor(setLine)))
      .toEqual([{ refId: 'H1', need: 8, product: HANDLE }]);
  });
});

describe('void reversal arithmetic', () => {
  // Mirrors handleVoid: unrestricted += ordered, reserved -= (ordered − issued),
  // quantity += issued. Approve reserves; issue moves physical. The formula has
  // to collapse correctly at both ends and in between.
  const reversal = (ordered: number, issued: number) => ({
    unrestricted: ordered,
    // `|| 0` normalises the -0 that negating zero produces; the real code clamps
    // with Math.max(0, …) so it never sees it.
    reserved: -(ordered - issued) || 0,
    quantity: issued,
  });

  it('never issued → release the reservation and invent no physical stock', () => {
    // The original bug: void added qty back to BOTH unrestricted and physical
    // and never cleared reservedQty, conjuring stock that never left.
    expect(reversal(10, 0)).toEqual({ unrestricted: 10, reserved: -10, quantity: 0 });
  });

  it('fully issued → goods come back, nothing left reserved', () => {
    expect(reversal(10, 10)).toEqual({ unrestricted: 10, reserved: 0, quantity: 10 });
  });

  it('part issued → returns the 8 that left and releases the 2 still reserved', () => {
    expect(reversal(10, 8)).toEqual({ unrestricted: 10, reserved: -2, quantity: 8 });
  });

  it('always nets back to the approve+issue effect, for any split', () => {
    for (const issued of [0, 1, 5, 9, 10]) {
      const r = reversal(10, issued);
      // approve: unrestricted −10, reserved +10 · issue: quantity −issued, reserved −issued
      expect(r.unrestricted + -10).toBe(0);
      expect(r.reserved + (10 - issued)).toBe(0);
      expect(r.quantity - issued).toBe(0);
    }
  });
});
