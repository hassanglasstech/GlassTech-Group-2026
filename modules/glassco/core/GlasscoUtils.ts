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
 * Calculate per-sqft rate (base glass + per-sqft services only).
 * NOTE: Notch is EXCLUDED here — it is charged per-notch-count in calculateLineItemTotal.
 * NOTE: APT on Mirror glass is EXCLUDED here — it becomes per-piece Rs 1000 flat in calculateLineItemTotal.
 */
export const calculateAutoRate = (size: string, type: string, subType: string, services: string[], products: Product[], finishColor?: string, serviceOnly: boolean = false) => {
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

        if (srv) serviceTotal += (srv.basePrice || 0);
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

    // Mirror + APT = Rs 1000 per piece flat (replaces per-sqft APT rate)
    const aptCharges = (hasAPT && isMirror) ? qty * 1000 : 0;

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
