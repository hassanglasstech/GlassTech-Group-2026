import { Product, QuotationItem } from '../../shared/types';

export const getBillingDimension = (dim: number, threshold: number, inclusive: boolean = false) => {
    if (!dim || dim <= 0) return 0;
    const isBelow = inclusive ? dim <= threshold : dim < threshold;
    if (isBelow) {
        return Math.ceil(dim / 6) * 6;
    }
    return Math.ceil(dim / 12) * 12;
};

export const calculateAutoRate = (size: string, type: string, subType: string, services: string[], products: Product[], finishColor?: string) => {
    const normalize = (s: any) => String(s || '').trim().toLowerCase();
    const sSize = normalize(size);
    const sType = normalize(type);
    const sSubType = normalize(subType || 'Standard');
    const sColor = normalize(finishColor || 'Clear');

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
        // N/A and empty both mean 'clear' (no special color)
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

    let serviceTotal = 0;
    services.forEach(srvNick => {
        const sNick = normalize(srvNick);
        if (sNick === 't/g') return;
        
        // Skip some services if tempered (logic from original code)
        if (isTempered && ['notch', 'p/e', 'r/d', 'holes'].includes(sNick)) return;

        let srv = products.find(p => 
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

export const calculateLineItemTotal = (item: QuotationItem, products: Product[]) => {
    if (item.isSection) return { totalSqFt: 0, amount: 0 };

    const qty = Number(item.qty) || 1;
    const isDG = item.selectedServices?.some(s => s === 'D/G' || s === 'Double Glaze' || s === 'Double Glazing');
    
    // If it's manual SqFt, we don't recalculate the area but we do recalculate the amount
    if (item.isManualSqFt) {
        const amount = Math.round((item.totalSqFt * (item.pricePerUnit || 0)));
        return { totalSqFt: item.totalSqFt, amount };
    }

    // Billing Area based on Updated Rounding Logic
    // Width: <= 72 -> 6", > 72 -> 12"
    // Height: < 120 -> 6", >= 120 -> 12"
    const billW = getBillingDimension(item.width, 72, true);
    const billH = getBillingDimension(item.height, 120, false);
    
    // Calculate total SqFt (Supporting decimals)
    const totalSqFt = Number(((billW * billH) / 144 * qty * (isDG ? 2 : 1)).toFixed(2));
    
    let extraCost = 0;
    const isTempered = item.selectedServices?.includes('T/G');
    if (!isTempered && (item.holes && item.holes.length > 0)) {
        const notchObj = products.find(p => p.category === 'Service' && p.serviceNick === 'Notch');
        extraCost = (notchObj?.basePrice || 0) * (item.holes.length) * qty;
    }

    const amount = Math.round((totalSqFt * (item.pricePerUnit || 0)) + extraCost);
    return { totalSqFt, amount };
};
