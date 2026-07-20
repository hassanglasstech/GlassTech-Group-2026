/**
 * Nippon product SETS — a set is sold as ONE priced line.
 *
 * The two things that can silently go wrong here both cost real money:
 *   • the money: if components ever carried their own amount, the quotation
 *     subtotal would double-count the bundle,
 *   • the goods: a set is assembled from loose hardware at issue, so the store
 *     must relieve the COMPONENTS, not a phantom "set" stock row.
 * Both are pinned below.
 */
import { describe, it, expect } from 'vitest';
import {
  componentsValue, explodeSetLine, isSetLine, setsOf, snapshotSetComponents,
} from '@/modules/nippon/utils/productSets';
import type { Product } from '@/modules/procurement/types/inventory';
import type { QuotationItem } from '@/modules/production/types/production';

const product = (over: Partial<Product>): Product => ({
  id: 'P1', company: 'Nippon', category: 'Hardware', description: 'ITEM',
  basePrice: 0, unit: 'PCS', variants: [], ...over,
} as Product);

const HANDLE = product({ id: 'H1', description: 'HANDLE', basePrice: 1200 });
const HINGE = product({ id: 'HG1', description: 'HINGE', basePrice: 300 });

const DOOR_SET = product({
  id: 'SET-DOOR-01', description: 'DOOR KIT', unit: 'Set', basePrice: 2000, isSet: true,
  setComponents: [
    { id: 'C1', productId: 'H1', code: 'H-1', description: 'HANDLE', unit: 'PCS', qtyPerSet: 1, rate: 1200 },
    { id: 'C2', productId: 'HG1', code: 'HG-1', description: 'HINGE', unit: 'PCS', qtyPerSet: 4, rate: 300 },
  ],
});

describe('Nippon sets — catalogue', () => {
  it('lists only real sets, ignoring a set flag with no contents', () => {
    const empty = product({ id: 'SET-EMPTY', isSet: true, setComponents: [] });
    expect(setsOf([HANDLE, HINGE, DOOR_SET, empty]).map(s => s.id)).toEqual(['SET-DOOR-01']);
  });

  it('values the components as if sold loose — the suggested set price', () => {
    // 1 handle @1200 + 4 hinges @300 = 2400 loose, sold as a 2000 bundle.
    expect(componentsValue(DOOR_SET.setComponents!)).toBe(2400);
  });
});

describe('Nippon sets — quotation line', () => {
  const line = (over: Partial<QuotationItem> = {}): QuotationItem => ({
    id: 'ITM-1', description: 'DOOR KIT', locationCode: 'SET-DOOR-01', glazingSpecs: '',
    qty: 3, width: 0, height: 0, totalSqFt: 0,
    pricePerUnit: 2000, amount: 6000,
    setComponents: snapshotSetComponents(DOOR_SET), ...over,
  } as QuotationItem);

  it('freezes the contents onto the line so an old quote reprints as sold', () => {
    const snap = snapshotSetComponents(DOOR_SET);
    expect(snap).toEqual([
      { productId: 'H1', code: 'H-1', description: 'HANDLE', unit: 'PCS', qtyPerSet: 1 },
      { productId: 'HG1', code: 'HG-1', description: 'HINGE', unit: 'PCS', qtyPerSet: 4 },
    ]);
    // Re-speccing the set later must NOT rewrite a quotation already sent.
    const reSpecced = { ...DOOR_SET, setComponents: [] };
    expect(snap.length).toBe(2);
    expect(snapshotSetComponents(reSpecced as Product)).toEqual([]);
  });

  it('carries NO money on the components — the subtotal counts the set once', () => {
    const items = [line()];
    const subTotal = items.reduce((s, i) => s + i.amount, 0);
    expect(subTotal).toBe(6000);                       // 3 sets × 2000, not 3 × 2400
    // No component may ever hold an amount, or the subtotal double-counts.
    const money = (items[0].setComponents || []) as unknown as Array<Record<string, unknown>>;
    money.forEach(c => {
      expect(c.amount).toBeUndefined();
      expect(c.pricePerUnit).toBeUndefined();
    });
  });

  it('explodes to what the store actually hands over: per-set qty × sets ordered', () => {
    expect(explodeSetLine(line().setComponents, 3)).toEqual([
      { productId: 'H1', code: 'H-1', description: 'HANDLE', unit: 'PCS', qtyPerSet: 1, totalQty: 3 },
      { productId: 'HG1', code: 'HG-1', description: 'HINGE', unit: 'PCS', qtyPerSet: 4, totalQty: 12 },
    ]);
  });

  it('relieves the components, never a phantom set stock row', () => {
    // Mirrors nipponFulfilmentService: a set line issues its components.
    const issued = explodeSetLine(line().setComponents, 3)
      .map(c => ({ refId: c.productId, need: c.totalQty }));
    expect(issued).toEqual([{ refId: 'H1', need: 3 }, { refId: 'HG1', need: 12 }]);
    expect(issued.some(i => i.refId === 'SET-DOOR-01')).toBe(false);
  });

  it('treats a plain product as a normal line', () => {
    const plain = line({ setComponents: undefined, locationCode: 'H1', pricePerUnit: 1200, amount: 3600 });
    expect(isSetLine(plain)).toBe(false);
    expect(explodeSetLine(plain.setComponents, plain.qty)).toEqual([]);
  });

  it('survives a zero/blank qty without inventing stock movement', () => {
    expect(explodeSetLine(line().setComponents, 0).every(c => c.totalQty === 0)).toBe(true);
  });
});
