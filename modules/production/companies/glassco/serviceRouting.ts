/**
 * deriveServiceBuckets — maps an order line item's glass services to the four
 * Service-Floor buckets. Canonical mapping (mirrors the intent of
 * ProductionContext.handleCuttingOutput):
 *   P/E or P/F → Polishing, R/D → Grinding, Notch → Notching, any holes → Holes.
 * Used to auto-route a freshly-cut piece to Service-Pending (has services) vs
 * QC-Pending (none), so the Service Floor actually receives work.
 */
export interface ServiceItem {
  selectedServices?: string[];
  holes?: unknown[];
}

export function deriveServiceBuckets(item: ServiceItem | undefined): string[] {
  const s = item?.selectedServices ?? [];
  const out: string[] = [];
  if (s.includes('P/E') || s.includes('P/F')) out.push('Polishing');
  if (s.includes('R/D')) out.push('Grinding');
  if (s.includes('Notch')) out.push('Notching');
  if (Array.isArray(item?.holes) && (item?.holes?.length ?? 0) > 0) out.push('Holes');
  return out;
}
