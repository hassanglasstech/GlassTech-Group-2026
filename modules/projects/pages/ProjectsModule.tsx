import React from 'react';
import { useAppStore } from '../../shared/store/appStore';
import GlasscoProjects from '../companies/glassco/components/GlasscoProjects';
import NipponProjects  from '../companies/nippon/components/NipponProjects';
import GTKProjects     from '../companies/gtk/components/GTKProjects';

const ProjectsModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);

  if (company === 'Glassco') return <GlasscoProjects company={company} />;
  if (company === 'Nippon')  return <NipponProjects  company={company} />;
  if (company === 'GTK')     return <GTKProjects     company={company} />;
  if (company === 'GTI')     return <GTKProjects     company={company} />;

  return (
    <div className="p-12 text-center">
      <h2 className="text-2xl font-black text-slate-300 uppercase tracking-widest">
        Factory projects — use GTK or GTI company selector
      </h2>
    </div>
  );
};

export default React.memo(ProjectsModule);
