import React from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import WarehouseModule from '@/modules/procurement/components/warehouse/WarehouseModule';

const WarehouseModulePage: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  return <WarehouseModule company={company} />;
};

export default React.memo(WarehouseModulePage);