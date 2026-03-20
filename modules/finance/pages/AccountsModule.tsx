import React from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import CompanyAccounts from './CompanyAccounts';

const AccountsModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  return <CompanyAccounts company={company} />;
};

export default React.memo(AccountsModule);
