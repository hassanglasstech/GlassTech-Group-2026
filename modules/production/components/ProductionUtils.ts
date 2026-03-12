
export const getGlassSize = (specs: string) => {
    const match = specs.match(/(\d+)mm/i);
    return match ? `${match[1]}mm` : 'Other';
};

export const isInternal = (loc?: string) => {
    if (!loc) return false;
    const internalKeywords = ['GTK', 'GTI', 'GLASSCO', 'NIPPON', 'FACTORY', 'WAREHOUSE'];
    return internalKeywords.some(k => loc.toUpperCase().includes(k));
};

export const getVendorColorClass = (vendorName?: string) => {
    if (!vendorName) return 'border-slate-200 bg-white';
    const v = vendorName.toUpperCase();
    if (v.includes('PSG')) return 'border-orange-200 bg-orange-50';
    if (v.includes('AHM')) return 'border-purple-200 bg-purple-50';
    if (v.includes('LAKHANI')) return 'border-cyan-200 bg-cyan-50';
    return 'border-blue-200 bg-blue-50';
};

export const getVendorTextClass = (vendorName?: string) => {
    if (!vendorName) return 'text-slate-600';
    const v = vendorName.toUpperCase();
    if (v.includes('PSG')) return 'text-orange-700';
    if (v.includes('AHM')) return 'text-purple-700';
    if (v.includes('LAKHANI')) return 'text-cyan-700';
    return 'text-blue-700';
};

export const isDispatchOverdue = (dateStr: string, expectedReturnDate?: string) => {
    const today = new Date();
    if (expectedReturnDate) {
        const exp = new Date(expectedReturnDate);
        return today > exp;
    }
    return false;
};
