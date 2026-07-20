// Variant grouping rules — one place, so every screen agrees.
//
// Once a product has variants it stops being a thing you stock, price or sell
// and becomes a CATALOGUE GROUPING: you order the 10ft length, not "the
// profile". Every major system models it this way — SAP generic article,
// NetSuite matrix item, Dynamics product master, Odoo product template — and in
// all of them the parent is non-transactable while stock and price live on the
// variant.
//
// Two consequences, both handled here:
//   • pickers must not offer the parent (it has no meaningful stock or price)
//   • totals must not count it, or the group is counted twice

import type { Product } from '@/modules/shared/types';

/** IDs of products that at least one other product points at via variantOf. */
export const variantParentIds = (products: Product[]): Set<string> =>
  new Set(products.map(p => p.variantOf).filter(Boolean) as string[]);

/**
 * Drop grouping parents. Use wherever products are COUNTED or offered for
 * SELECTION. Not for the catalogue list itself — parents stay browsable there,
 * and they are never deleted because historical documents still reference them.
 */
export const withoutVariantParents = (products: Product[]): Product[] => {
  const parents = variantParentIds(products);
  return parents.size ? products.filter(p => !parents.has(p.id)) : products;
};

/** The axis that distinguishes a variant, e.g. "Length 10" — for badges. */
export const variantLabelOf = (p: Product): string => {
  const attrs = (p as { variantAttributes?: Record<string, string> }).variantAttributes;
  if (!attrs) return '';
  return Object.entries(attrs).map(([k, v]) => `${k} ${v}`).join(' · ');
};
