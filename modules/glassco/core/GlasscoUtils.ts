import { Product, QuotationItem } from '../../shared/types';

export const getBillingDimension = (dim: number, threshold: number, inclusive: boolean = false) => {
    if (!dim || dim <= 0) return 0;
    const isBelow = inclusive ? dim <= threshold : dim < threshold;
    if (isBelow) {
        return Math.ceil(dim / 6) * 6;
    }
    return Math.ceil(dim / 12) * 12;
};

const normalize = (s: unknown) => String(s || '').trim().toLowerCase();

/**
 * Phase 4 (WS2) — customer-tier price-list override.
 * Given a line's (glassType, thickness, subCategory) and either the sheet
 * (serviceNick === null) or a specific service, return the tier rate — or
 * undefined to fall through to the master product rate.
 */
export type PriceListResolver = (
  glassType: string,
  thickness: string,
  subCategory: string,
  serviceNick: string | null,
) => number | undefined;

/** Minimal shape of a price-list override row (camelCase, as read from the DB). */
export interface PriceListRateItem {
  glassType?: string;
  thickness?: string;
  subCategory?: string;
  serviceNick?: string;
  rate: number;
}

/**
 * Build a rate resolver from a client's assigned price-list items. A blank item
 * field is a wildcard ("Any"); a blank serviceNick means the sheet (base glass)
 * rate, a set serviceNick targets that one service. The most specific match wins
 * (a (Mirror, 5mm) row beats an (Any, Any) row), so broad tier defaults and
 * narrow exceptions can coexist in the same list.
 */
export const buildPriceListResolver = (items: PriceListRateItem[]): PriceListResolver => {
  return (glassType, thickness, subCategory, serviceNick) => {
    const wantNick = serviceNick === null ? '' : normalize(serviceNick);
    let best: { rate: number; specificity: number } | undefined;
    for (const it of items) {
      if (normalize(it.serviceNick) !== wantNick) continue;   // sheet vs service must match exactly
      let specificity = 0;
      if (it.glassType && it.glassType.trim()) { if (normalize(it.glassType) !== normalize(glassType)) continue; specificity++; }
      if (it.thickness && it.thickness.trim()) { if (normalize(it.thickness) !== normalize(thickness)) continue; specificity++; }
      if (it.subCategory && it.subCategory.trim()) { if (normalize(it.subCategory) !== normalize(subCategory)) continue; specificity++; }
      const rate = Number(it.rate);
      if (!isFinite(rate) || rate <= 0) continue;
      if (!best || specificity > best.specificity) best = { rate, specificity };
    }
    return best?.rate;
  };
};

/**
 * Calculate per-sqft rate (base glass + per-sqft services only).
 * NOTE: Notch is EXCLUDED here — it is charged per-notch-count in calculateLineItemTotal.
 * NOTE: APT on Mirror glass is EXCLUDED here — it becomes per-piece flat in calculateLineItemTotal.
 * `override` (Phase 4) applies a client-tier price-list rate over the master rate,
 * per component (sheet base + each per-sqft service).
 */
export const calculateAutoRate = (size: string, type: string, subType: string, services: string[], products: Product[], finishColor?: string, serviceOnly: boolean = false, override?: PriceListResolver) => {
    const sSize = normalize(size);
    const sType = normalize(type);
    const sSubType = normalize(subType || 'Standard');
    const sColor = normalize(finishColor || 'Clear');
    const isMirrorType = sType === 'mirror' || sSubType === 'mirror';

    const glass = products.find(p => {
        if (normalize(p.category) !== 'glass') return false;

        const pThickness = normalize(p.thickness);
        if (pThickness !== sSize) return false;

        const pType = normalize(p.glassType);
        if (pType !== sType) return false;

        const pSub = normalize(p.subCategory || 'standard');
        const normPSub = (pSub === '' || pSub === 'n/a') ? 'standard' : pSub;
        const normSSub = (sSubType === '' || sSubType === 'n/a') ? 'standard' : sSubType;
        if (normPSub !== normSSub) return false;

        const pColor = normalize(p.finishColor || 'clear');
        const normPColor = (pColor === 'n/a' || pColor === '' || pColor === 'na') ? 'clear' : pColor;
        const normSColor = (sColor === 'n/a' || sColor === '' || sColor === 'na') ? 'clear' : sColor;
        if (normPColor !== normSColor) return false;

        return true;
    });

    const isTempered = services.some(s => normalize(s) === 't/g');
    let baseRate = 0;
    if (glass) {
        baseRate = (isTempered && glass.temperingPrice) ? glass.temperingPrice : (glass.basePrice || 0);
    }
    // Phase 4: a client-tier sheet override replaces the master base/tempering rate.
    if (override) {
        const o = override(sType, sSize, sSubType, null);
        if (o !== undefined) baseRate = o;
    }
    // SERVICE ONLY (client-supplied glass): never charge the glass base/tempering
    // rate — only the selected services below contribute to the line rate.
    if (serviceOnly) baseRate = 0;

    let serviceTotal = 0;
    services.forEach(srvNick => {
        const sNick = normalize(srvNick);
        if (sNick === 't/g') return;

        // Notch is ALWAYS per-count — handled in calculateLineItemTotal
        if (sNick === 'notch') return;

        // Tempered glass can't have these services applied after tempering
        if (isTempered && ['p/e', 'r/d', 'holes'].includes(sNick)) return;

        // Mirror + APT = per-piece Rs 1000 flat (not per sqft) — handled in calculateLineItemTotal
        if (sNick === 'apt' && isMirrorType) return;

        const srv = products.find(p =>
            normalize(p.category) === 'service' &&
            normalize(p.serviceNick) === sNick &&
            normalize(p.thickness) === sSize
        ) || products.find(p =>
            normalize(p.category) === 'service' &&
            normalize(p.serviceNick) === sNick &&
            (normalize(p.thickness) === 'all' || !p.thickness)
        );

        let contribution = srv ? (srv.basePrice || 0) : 0;
        // Phase 4: a client-tier service override replaces that service's master rate.
        if (override) {
            const o = override(sType, sSize, sSubType, sNick);
            if (o !== undefined) contribution = o;
        }
        serviceTotal += contribution;
    });

    return baseRate + serviceTotal;
};

/**
 * Calculate line total including:
 *  - Billing sqft (with rounding + D/G ×2)
 *  - Base amount = sqft × pricePerUnit
 *  - APT charges: Mirror+APT = qty × 1000 flat (per piece)
 *  - Notch charges: holes.length × notchRate × qty (per notch count)
 *
 *  Final amount = round(sqft × rate) + notchCharges  (aptCharges tracked separately)
 */
export const calculateLineItemTotal = (item: QuotationItem, products: Product[]) => {
    if (item.isSection) return { totalSqFt: 0, amount: 0, aptCharges: 0, notchCharges: 0 };

    const qty = Number(item.qty) || 1;
    const isDG = item.selectedServices?.some(s => s === 'D/G' || s === 'Double Glaze' || s === 'Double Glazing');

    const isMirror = normalize(item.subCategory) === 'mirror' || normalize(item.glassType) === 'mirror';
    const hasAPT = item.selectedServices?.some(s => normalize(s) === 'apt');
    const hasNotch = item.selectedServices?.some(s => normalize(s) === 'notch');
    const isTempered = item.selectedServices?.some(s => normalize(s) === 't/g');

    // Mirror + APT = per-piece flat (replaces per-sqft APT rate). Default Rs 1000,
    // but configurable: a Service product with nick 'apt' billed per piece
    // (unit Piece/PCS/Nos/Each) supplies the flat rate when one is defined.
    const aptFlat = (() => {
        const p = products.find(pr =>
            normalize(pr.category) === 'service' &&
            normalize(pr.serviceNick) === 'apt' &&
            ['piece', 'pcs', 'nos', 'no', 'each', 'pc'].includes(normalize(pr.unit)));
        const r = Number(p?.basePrice);
        return (p && isFinite(r) && r > 0) ? r : 1000;
    })();
    const aptCharges = (hasAPT && isMirror) ? qty * aptFlat : 0;

    // Notch: per-count charge (based on holes[] placed in 2D drawing tab)
    let notchCharges = 0;
    if (hasNotch && !isTempered && item.holes && item.holes.length > 0) {
        const notchObj = products.find(p =>
            normalize(p.category) === 'service' && normalize(p.serviceNick) === 'notch'
        );
        notchCharges = (notchObj?.basePrice || 0) * item.holes.length * qty;
    }

    // Manual SqFt override — don't recalculate area, just amount
    if (item.isManualSqFt) {
        const amount = Math.round((item.totalSqFt * (item.pricePerUnit || 0))) + notchCharges;
        return { totalSqFt: item.totalSqFt, amount, aptCharges, notchCharges };
    }

    // Billing area
    const billW = getBillingDimension(item.width, 72, true);
    const billH = getBillingDimension(item.height, 120, false);

    const totalSqFt = Number(((billW * billH) / 144 * qty * (isDG ? 2 : 1)).toFixed(2));

    const amount = Math.round((totalSqFt * (item.pricePerUnit || 0))) + notchCharges;
    return { totalSqFt, amount, aptCharges, notchCharges };
};
