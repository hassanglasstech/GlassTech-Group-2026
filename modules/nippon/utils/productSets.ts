// Product SET (kit) rules — one place, so the builder, the quotation and the
// print all agree on what a set is.
//
// A set is a catalogue product flagged `isSet` that carries a list of the real
// products inside it. It is sold as ONE priced line: the customer sees what the
// bundle contains and how many of each, but a single amount — that is the whole
// point of bundling. Pricing per component would just be a discount table with
// extra steps, and it makes the set impossible to quote at a round number.
//
// This mirrors how sales kits work elsewhere (SAP sales BOM with header pricing,
// NetSuite kit/package item, Odoo kit BoM): components explode for picking and
// stock, the money stays on the header.

import type { Product, ProductComponent } from '@/modules/procurement/types/inventory';
import type { QuoteSetComponent } from '@/modules/production/types/production';

/** Sets only — the bundles themselves, not their contents. */
export const setsOf = (products: Product[]): Product[] =>
  products.filter(p => p.isSet && (p.setComponents?.length || 0) > 0);

/** What the components would fetch if sold loose. The suggested set price. */
export const componentsValue = (components: ProductComponent[]): number =>
  components.reduce((sum, c) => sum + (Number(c.rate) || 0) * (Number(c.qtyPerSet) || 0), 0);

/**
 * Freeze a set's contents onto the line that sells it.
 *
 * Snapshot rather than a live lookup: re-opening last quarter's quotation must
 * show the set as it was sold, even after the set has since been re-specced or
 * a component discontinued.
 */
export const snapshotSetComponents = (set: Product): QuoteSetComponent[] =>
  (set.setComponents || []).map(c => ({
    productId: c.productId,
    code: c.code,
    description: c.description,
    unit: c.unit,
    qtyPerSet: Number(c.qtyPerSet) || 0,
  }));

/**
 * What actually gets delivered for a set line: components × how many sets.
 * The customer ordered 3 sets of a 4-hinge kit, so 12 hinges leave the store.
 */
export const explodeSetLine = (
  components: QuoteSetComponent[] | undefined,
  setQty: number,
): Array<QuoteSetComponent & { totalQty: number }> =>
  (components || []).map(c => ({ ...c, totalQty: (Number(c.qtyPerSet) || 0) * (Number(setQty) || 0) }));

/** True when this quotation line is a set sold as one priced bundle. */
export const isSetLine = (item: { setComponents?: QuoteSetComponent[] }): boolean =>
  (item.setComponents?.length || 0) > 0;

/** One stock row a line touches, and by how much. */
export interface StockMove {
  /** store_items id to move — always a real product, never a set. */
  refId: string;
  /** Units moved. Sign is the caller's business (reserve, issue, return). */
  need: number;
  /** Catalogue product behind refId, when one matched. */
  product?: Product;
}

/**
 * What stock a quotation line actually moves — the ONE place that answers it.
 *
 * Approve (reserve), issue (relieve) and void (return) must agree exactly, or
 * inventory drifts: reserve the set id but relieve the components and every
 * number is wrong in both directions. They each used to carry their own copy of
 * the product-matching logic; now they share this.
 *
 * A set moves its COMPONENTS, never itself — a set is assembled at issue, so
 * there is no set on a shelf to move.
 */
export const stockMovesForLine = (
  item: {
    isSection?: boolean;
    qty?: number;
    productRef?: string;
    locationCode?: string;
    setComponents?: QuoteSetComponent[];
  },
  products: Product[],
  /**
   * Move this many instead of the ordered qty. The issue path passes what was
   * actually picked (which can be less); approve and void pass nothing and get
   * the ordered qty, because the customer committed to the whole order.
   */
  qtyOverride?: number,
): StockMove[] => {
  if (item.isSection) return [];
  const qty = qtyOverride !== undefined ? Number(qtyOverride) || 0 : Number(item.qty) || 0;

  if (isSetLine(item)) {
    return explodeSetLine(item.setComponents, qty)
      .filter(c => !!c.productId)
      .map(c => ({
        refId: c.productId as string,
        need: c.totalQty,
        product: products.find(p => p.id === c.productId),
      }));
  }

  // A manually typed line carries only locationCode (the visible code), so match
  // that back to a product — otherwise the move lands on an orphan row keyed by
  // the bare code and the real stock row never changes.
  const matched = products.find(p =>
    (item.productRef && p.id === item.productRef)
    || (item.locationCode && (p.id === item.locationCode || p.modelNo === item.locationCode || p.profileCode === item.locationCode)));
  const refId = matched?.id || item.productRef || item.locationCode;
  return refId ? [{ refId, need: qty, product: matched }] : [];
};
