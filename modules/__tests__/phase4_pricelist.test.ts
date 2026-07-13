// Phase 4 (WS2) — customer-tier price-list pricing.
// Unit tests over the REAL pricing engine (no mocks) so any drift in the
// override / APT-flat behaviour is caught. Covers:
//   • buildPriceListResolver — wildcard vs specific, sheet vs service, no-match
//   • calculateAutoRate      — master fallback (regression) + tier overrides
//   • calculateLineItemTotal — configurable Mirror+APT per-piece flat
import { describe, it, expect } from 'vitest';
import {
  buildPriceListResolver,
  calculateAutoRate,
  calculateLineItemTotal,
} from '@/modules/glassco/core/GlasscoUtils';
import { Product, QuotationItem } from '@/modules/shared/types';

// Minimal product master. Only the fields the pricing engine reads are set.
const products = [
  { id: 'G1', category: 'Glass', thickness: '5mm', glassType: 'Plain', subCategory: 'Standard', finishColor: 'Clear', basePrice: 100, temperingPrice: 150 },
  { id: 'G2', category: 'Glass', thickness: '5mm', glassType: 'Mirror', subCategory: 'Mirror', finishColor: 'Clear', basePrice: 200 },
  { id: 'S1', category: 'Service', serviceNick: 'P/E', thickness: '5mm', basePrice: 20 },
] as unknown as Product[];

const mkMirrorItem = (services: string[]): QuotationItem => ({
  id: 'i', qty: 2, width: 12, height: 12, glassType: 'Mirror', subCategory: 'Mirror',
  selectedServices: services, pricePerUnit: 0, isSection: false, holes: [],
} as unknown as QuotationItem);

describe('buildPriceListResolver', () => {
  const resolver = buildPriceListResolver([
    { glassType: '', thickness: '', subCategory: '', serviceNick: '', rate: 80 },       // sheet, all-wildcard
    { glassType: 'Mirror', thickness: '5mm', subCategory: '', serviceNick: '', rate: 60 }, // sheet, specific
    { glassType: '', thickness: '', subCategory: '', serviceNick: 'P/E', rate: 15 },     // service override
    { glassType: '', thickness: '', subCategory: '', serviceNick: '', rate: -5 },        // invalid (ignored)
  ]);

  it('returns the wildcard sheet rate when nothing more specific matches', () => {
    expect(resolver('Plain', '5mm', 'Standard', null)).toBe(80);
  });

  it('prefers the most specific matching row (Mirror/5mm beats Any/Any)', () => {
    expect(resolver('Mirror', '5mm', 'Mirror', null)).toBe(60);
  });

  it('resolves a per-service override by nick (case-insensitive)', () => {
    expect(resolver('Plain', '5mm', 'Standard', 'p/e')).toBe(15);
  });

  it('returns undefined when no row matches the requested service', () => {
    expect(resolver('Plain', '5mm', 'Standard', 'R/D')).toBeUndefined();
  });

  it('ignores rows with a non-positive rate', () => {
    // The -5 wildcard row must never win over the 80 wildcard row.
    expect(resolver('Plain', '5mm', 'Standard', null)).toBe(80);
  });
});

describe('calculateAutoRate — master fallback (no override)', () => {
  it('returns the master base rate for a plain sheet', () => {
    expect(calculateAutoRate('5mm', 'Plain', 'Standard', [], products)).toBe(100);
  });

  it('adds a per-sqft service to the base rate', () => {
    expect(calculateAutoRate('5mm', 'Plain', 'Standard', ['P/E'], products)).toBe(120);
  });

  it('charges the tempering rate when T/G is selected', () => {
    expect(calculateAutoRate('5mm', 'Plain', 'Standard', ['T/G'], products)).toBe(150);
  });
});

describe('calculateAutoRate — tier price-list override', () => {
  it('replaces the sheet base with the tier rate', () => {
    const ov = buildPriceListResolver([{ serviceNick: '', rate: 80 }]);
    expect(calculateAutoRate('5mm', 'Plain', 'Standard', [], products, undefined, false, ov)).toBe(80);
  });

  it('replaces both sheet base and a service with tier rates', () => {
    const ov = buildPriceListResolver([
      { serviceNick: '', rate: 80 },
      { serviceNick: 'P/E', rate: 15 },
    ]);
    expect(calculateAutoRate('5mm', 'Plain', 'Standard', ['P/E'], products, undefined, false, ov)).toBe(95);
  });

  it('still zeroes the base for service-only even with a sheet override', () => {
    const ov = buildPriceListResolver([
      { serviceNick: '', rate: 80 },
      { serviceNick: 'P/E', rate: 15 },
    ]);
    expect(calculateAutoRate('5mm', 'Plain', 'Standard', ['P/E'], products, undefined, true, ov)).toBe(15);
  });

  it('falls back to the master rate when the tier has no matching row', () => {
    const ov = buildPriceListResolver([{ glassType: 'Mirror', serviceNick: '', rate: 60 }]);
    // Plain query → no Mirror match → master 100.
    expect(calculateAutoRate('5mm', 'Plain', 'Standard', [], products, undefined, false, ov)).toBe(100);
  });
});

describe('calculateLineItemTotal — Mirror+APT per-piece flat', () => {
  it('defaults to Rs 1000 per piece when no per-piece APT service exists', () => {
    const { aptCharges } = calculateLineItemTotal(mkMirrorItem(['APT']), products);
    expect(aptCharges).toBe(2000); // qty 2 × 1000
  });

  it('uses a configured per-piece APT service rate when defined', () => {
    const withApt = [
      ...products,
      { id: 'APT1', category: 'Service', serviceNick: 'apt', unit: 'Piece', basePrice: 1500 },
    ] as unknown as Product[];
    const { aptCharges } = calculateLineItemTotal(mkMirrorItem(['APT']), withApt);
    expect(aptCharges).toBe(3000); // qty 2 × 1500
  });

  it('charges no APT flat when the item is not a mirror', () => {
    const nonMirror = { ...mkMirrorItem(['APT']), glassType: 'Plain', subCategory: 'Standard' } as unknown as QuotationItem;
    const { aptCharges } = calculateLineItemTotal(nonMirror, products);
    expect(aptCharges).toBe(0);
  });
});
