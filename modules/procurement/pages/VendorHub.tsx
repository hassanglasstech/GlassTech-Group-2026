
import React from 'react';
import NipponVendorRegistry from '@/modules/procurement/components/vendors/NipponVendorRegistry';
import GlasscoVendorHub from '@/modules/procurement/companies/glassco/components/vendors/GlasscoVendorHub';
import GTKVendorHub from '@/modules/procurement/components/vendors/GTKVendorHub';
import { useAppStore } from '@/modules/shared/store/appStore';

const VendorHub: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  
  // GTK / GTI — simplified vendor + rate cards + PO from Req
  if (company === 'GTK' || company === 'GTI') {
      return <GTKVendorHub company={company} />;
  }

  // NIPPON SPECIFIC VIEW
  if (company === 'Nippon') {
      return <NipponVendorRegistry />;
  }

  // GLASSCO / DEFAULT VIEW
  return <GlasscoVendorHub company={company} />;
};

export default React.memo(VendorHub);
