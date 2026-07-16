/**
 * Nippon customer (transfer-price) pricing — Intercompany P1.
 *
 * Nippon is a trading company, so a customer price list is a flat map of
 * productId -> negotiated unit rate (contrast Glassco's glass-attribute matrix
 * in GlasscoUtils.buildPriceListResolver). To stay migration-free, a Nippon
 * price list stores its rows INSIDE the price_lists row's `data.items` jsonb
 * (price_lists already round-trips a full `data` blob) — no price_list_items
 * rows and no schema change.
 *
 * A client links to at most one list via `client.priceListId` (the same
 * mechanism Glassco uses). When a linked customer is on a Nippon order, the
 * line rate resolves from that list before the product-master rate. This is
 * exactly the "GTK buys at agreed transfer rates" mechanism — and equally a
 * normal wholesale / retail / project tier for any ordinary customer.
 */

export interface NipponPriceRow {
  productId: string;   // Product.id this rate applies to
  label?: string;      // human label (product description) — display only
  code?: string;       // item code (modelNo/profileCode) — display only
  rate: number;        // customer's negotiated unit rate (PKR)
  uom?: string;        // unit (PCS / SET / …) — display only
}

/** A price list as surfaced by AsyncSalesService.getPriceLists (items ride in data.items). */
export interface NipponPriceList {
  id?: string;
  company: string;
  name: string;
  description?: string;
  isActive?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  items?: NipponPriceRow[];
}

export type NipponRateResolver = (productId: string) => number | undefined;

/** Build a productId -> rate resolver from a list's embedded rows. */
export const buildNipponPriceListResolver = (rows: NipponPriceRow[] | undefined): NipponRateResolver => {
  const map = new Map<string, number>();
  for (const r of rows || []) {
    const rate = Number(r?.rate);
    if (r?.productId && isFinite(rate) && rate > 0) map.set(String(r.productId), rate);
  }
  return (productId: string) => (productId ? map.get(String(productId)) : undefined);
};

/**
 * Resolve a customer's rate resolver from the pool of price lists + the client's
 * assigned `priceListId`. Returns a no-op resolver (always undefined) when the
 * client has no list or the list is inactive, so callers fall back to the
 * product-master rate.
 */
export const resolveClientRate = (
  clientPriceListId: string | undefined,
  lists: NipponPriceList[],
): NipponRateResolver => {
  if (!clientPriceListId) return () => undefined;
  const list = lists.find(l => l.id === clientPriceListId && l.isActive !== false);
  if (!list) return () => undefined;
  return buildNipponPriceListResolver(list.items);
};
