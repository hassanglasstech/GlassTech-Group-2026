
import React from 'react';
import { useAppStore } from '../../shared/store/appStore';
import GlasscoAccounts from '../companies/glassco/GlasscoAccounts';
import NipponAccounts from '../companies/nippon/NipponAccounts';

const AccountsModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);

  if (company === 'Nippon') return <NipponAccounts />;
  
  // Default to Glassco
  return <GlasscoAccounts />;
};

export default AccountsModule;
