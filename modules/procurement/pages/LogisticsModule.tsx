import React from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import CompanyLogistics from '@/modules/procurement/companies/glassco/GlasscoLogistics';

const LogisticsModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  return <CompanyLogistics company={company} />;
};

export default React.memo(LogisticsModule);
