import React from 'react';
import { Company } from '@/modules/shared/types';
import GlasscoWarehouseModule from '@/modules/procurement/companies/glassco/components/warehouse/GlasscoWarehouseModule';
import NipponWarehouseModule from '@/modules/procurement/companies/nippon/components/warehouse/NipponWarehouseModule';

const WarehouseModule: React.FC<{ company: Company }> = ({ company }) => {
  if (company === 'Nippon') {
    return <NipponWarehouseModule company={company} />;
  }
  
  return <GlasscoWarehouseModule company={company} />;
};

export default WarehouseModule;