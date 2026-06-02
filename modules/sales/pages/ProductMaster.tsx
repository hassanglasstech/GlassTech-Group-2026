
import React from 'react';
import { useAppStore } from '../../shared/store/appStore';
import { Company } from '../../shared/types';
import SystemProductMaster from '../../system/pages/SystemProductMaster';
const GlasscoProductMaster: any = () => null;
import NipponProductMaster from '../companies/nippon/NipponProductMaster';

const ProductMaster: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  
  // GTK and GTI use the technical system-based profile master
  if (company === 'GTK' || company === 'GTI') {
    return <SystemProductMaster />;
  }

  // Nippon uses dedicated Hardware Master
  if (company === 'Nippon') {
    return <NipponProductMaster />;
  }

  // Glassco and Factory use the standard material library (Glass-focused)
  return <GlasscoProductMaster />;
};

export default ProductMaster;
