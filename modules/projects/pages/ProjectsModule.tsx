import React from 'react';
import NipponProjects from '../companies/nippon/components/NipponProjects';
import GlasscoProjects from '../companies/glassco/components/GlasscoProjects';
import { useAppStore } from '../../shared/store/appStore';

// Per-company projects view.
const ProjectsModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  if (company === 'Nippon') return <NipponProjects company={company} />;
  return <GlasscoProjects company={company} />;
};

export default React.memo(ProjectsModule);
