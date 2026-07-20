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
