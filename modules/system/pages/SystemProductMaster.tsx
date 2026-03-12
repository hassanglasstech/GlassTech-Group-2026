
import React from 'react';
import { useAppStore } from '../../shared/store/appStore';
import GlasscoProductMaster from '../companies/glassco/components/GlasscoProductMaster';
import NipponProductMaster from '../companies/nippon/components/NipponProductMaster';

const SystemProductMaster: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);

  if (company === 'Glassco') return <GlasscoProductMaster company={company} />;
  if (company === 'Nippon') return <NipponProductMaster company={company} />;

  return (
    <div className="p-12 text-center">
      <h2 className="text-2xl font-black text-slate-300 uppercase tracking-widest">Select a Company to View Product Master</h2>
    </div>
  );
};

export default SystemProductMaster;
