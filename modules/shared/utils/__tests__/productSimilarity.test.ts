import { describe, it, expect } from 'vitest';
import { findSimilarProducts, levenshtein, normCode } from '../productSimilarity';

const P = (id: string, description: string, profileCode = '', modelNo = '') =>
  ({ id, description, profileCode, modelNo });

describe('productSimilarity', () => {
  it('levenshtein basic distances', () => {
    expect(levenshtein('CZS133', 'CZS133')).toBe(0);
    expect(levenshtein('CZS133', 'CZS134')).toBe(1);
    expect(levenshtein('ZCD08X545', 'ZCD08X5455')).toBe(1);
  });

  it('normCode strips separators + uppercases', () => {
    expect(normCode('t-msd35/ii')).toBe('TMSD35II');
    expect(normCode('CZS133-L55')).toBe('CZS133L55');
  });

  it('flags SAME code on a different id', () => {
    const existing = [P('NIP-HuangXing-H-102', 'Floor Spring', 'H-102')];
    const cand = P('NIP-KL-H-102', 'Floor Spring', 'H-102');
    const m = findSimilarProducts(cand, existing);
    expect(m).toHaveLength(1);
    expect(m[0].reason).toBe('same-code');
  });

  it('flags SAME code when a decimal/separator normalizes away', () => {
    // ZCD-08X54.5 and ZCD-08X545 both normalize to ZCD08X545 → same code.
    const existing = [P('a', 'Linking Rod', 'ZCD-08X54.5')];
    const cand = P('b', 'Linking Rod', 'ZCD-08X545');
    const m = findSimilarProducts(cand, existing);
    expect(m).toHaveLength(1);
    expect(m[0].reason).toBe('same-code');
  });

  it('flags NEAR code (single edit apart)', () => {
    const existing = [P('a', 'Handle Alpha', 'CZS133')];
    const cand = P('b', 'Rod Zulu', 'CZS134');
    const m = findSimilarProducts(cand, existing);
    expect(m).toHaveLength(1);
    expect(m[0].reason).toBe('near-code');
  });

  it('flags SAME name (codes too short to trigger near-code)', () => {
    const existing = [P('a', 'Silicone Sealant Bottle', 'A1')];
    const cand = P('b', 'SILICONE SEALANT BOTTLE', 'B2');
    const m = findSimilarProducts(cand, existing);
    expect(m).toHaveLength(1);
    expect(m[0].reason).toBe('same-name');
  });

  it('does NOT flag clearly different products', () => {
    const existing = [P('a', 'Spider Fitting', 'A250A1')];
    const cand = P('b', 'Casement Window Handle', 'CZS133');
    expect(findSimilarProducts(cand, existing)).toHaveLength(0);
  });

  it('excludes self when editing (selfId)', () => {
    const existing = [P('same-id', 'Handle', 'CZS133')];
    const cand = P('same-id', 'Handle', 'CZS133');
    expect(findSimilarProducts(cand, existing, { selfId: 'same-id' })).toHaveLength(0);
  });

  it('ranks same-code above name matches', () => {
    const existing = [
      P('a', 'Handle', 'ZZZ999'),           // same name only
      P('b', 'Different name', 'CZS133'),   // same code
    ];
    const cand = P('c', 'Handle', 'CZS133');
    const m = findSimilarProducts(cand, existing);
    expect(m[0].reason).toBe('same-code');
  });
});
