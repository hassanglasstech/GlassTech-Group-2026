
import { SalesService } from '../../sales/services/salesService';

export const getBrandNick = (brandName: string): string => {
    if (!brandName || brandName === 'N/A' || brandName === '-') return brandName;
    
    // Get all vendors
    const vendors = SalesService.getVendors();
    
    // Find vendor by name (case insensitive)
    const vendor = vendors.find(v => 
        v.name.toLowerCase() === brandName.toLowerCase() || 
        v.nickName?.toLowerCase() === brandName.toLowerCase()
    );
    
    return vendor?.nickName || brandName;
};
