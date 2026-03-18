
import React from 'react';
import { useAppStore } from '../../shared/store/appStore';
import GlasscoAccounts from '../companies/glassco/GlasscoAccounts';
import NipponAccounts from '../companies/nippon/NipponAccounts';
import GTKAccounts from '../companies/gtk/GTKAccounts';
import GTIAccounts from '../companies/gti/GTIAccounts';
import FactoryAccounts from '../companies/factory/FactoryAccounts';

const AccountsModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);

  if (company === 'Nippon')  return <NipponAccounts />;
  if (company === 'GTK')     return <GTKAccounts />;
  if (company === 'GTI')     return <GTIAccounts />;
  if (company === 'Factory') return <FactoryAccounts />;
  return <GlasscoAccounts />;
};

export default React.memo(AccountsModule);
