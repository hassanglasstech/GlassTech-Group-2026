
import React from 'react';
import { useAppStore } from '../../shared/store/appStore';

// Sub-Modules
import GTKProduction from '../../system/pages/GTKProduction';
import GTIProduction from '../../system/pages/GTIProduction';
import NipponProduction from '../companies/nippon/NipponProduction';
import FactoryProduction from '../../factory/pages/FactoryProduction';
const GlasscoProduction: any = () => null;

const ProductionModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  
  // Router Logic for Companies
  if (company === 'GTK') return <GTKProduction />;
  if (company === 'GTI') return <GTIProduction />;
  if (company === 'Nippon') return <NipponProduction />;
  if (company === 'Factory') return <FactoryProduction />;

  // Default to Glassco
  return <GlasscoProduction />;
};

export default React.memo(ProductionModule);
