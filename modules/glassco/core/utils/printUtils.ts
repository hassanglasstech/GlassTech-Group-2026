export const formatGlassDescription = (item: Record<string, unknown>) => {
    if (item.isSection) return item.description;
    
    let type = item.glassType || 'Plain';
    const isTempered = item.selectedServices?.includes('T/G') || item.selectedServices?.includes('Tempered');
    
    if (type === 'Plain') {
        type = isTempered ? 'Clear' : 'Plain';
    }
    if (type === 'Color') type = ''; // Don't print "Color"
    
    let color = item.glassColor || '';
    if (color.toLowerCase() === 'clear') color = ''; // Don't print "Clear" as color, since type handles it
    
    const parts = [
        item.description, // User input description first
        item.glassSize || '5mm', // Default to 5mm if missing
        color,
        item.subCategory || 'Standard',
        type
    ].filter(p => p && p !== 'N/A' && p !== 'Standard' && p.trim() !== '');
    
    return parts.join(' ');
};

export const formatServices = (services: string[]) => {
    if (!services || services.length === 0) return 'Standard Cut-to-Size';
    
    const SERVICE_FULL_NAMES: Record<string, string> = {
        'T/G': 'Tempered',
        'P/E': 'Polishing',
        'P/F': 'Protection Film',
        'APT': 'APT',
        'R/D': 'Rough Grinding',
        'Notch': 'Notching',
        'Holes': 'Holes',
        'Cutout': 'Cutout',
        'Bevel': 'Beveling',
        'Sandblast': 'Sandblasting',
        'D/G': 'Double Glazing',
        'Double Glaze': 'Double Glazing'
    };
    
    return services.map(s => SERVICE_FULL_NAMES[s] || s).join(', ');
};

export const formatGlassSize = (item: Record<string, unknown>) => {
    if (item.isSection) return '';
    if (item.inputUnit === 'MM' || item.mmW || item.mmH) {
        const w = item.mmW || Math.round((item.width || 0) * 25.4);
        const h = item.mmH || Math.round((item.height || 0) * 25.4);
        return `${w} x ${h} mm`;
    }
    return `${item.inchW || 0}.${item.sootW || 0}" x ${item.inchH || 0}.${item.sootH || 0}"`;
};

export const formatBillingSize = (item: Record<string, unknown>) => {
    if (item.isSection) return '';
    if (item.isManualSqFt) return 'Manual Sq.Ft';
    
    const getBillingDimension = (dim: number, threshold: number, inclusive: boolean = false) => {
        if (!dim || dim <= 0) return 0;
        const isBelow = inclusive ? dim <= threshold : dim < threshold;
        if (isBelow) {
            return Math.ceil(dim / 6) * 6;
        }
        return Math.ceil(dim / 12) * 12;
    };

    const billW = getBillingDimension(item.width, 72, true);
    const billH = getBillingDimension(item.height, 120, false);
    
    return `${billW} x ${billH}`;
};
