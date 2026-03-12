
import React from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import GlasscoLogistics from '@/modules/procurement/companies/glassco/GlasscoLogistics';
import NipponLogistics from '@/modules/procurement/companies/nippon/NipponLogistics';

const LogisticsModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);

  if (company === 'Nippon') return <NipponLogistics />;
  
  // Default to Glassco
  return <GlasscoLogistics />;
};

export default LogisticsModule;
