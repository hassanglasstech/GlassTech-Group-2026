import React from 'react';
import NipponProjects from '../companies/nippon/components/NipponProjects';
import { useAppStore } from '../../shared/store/appStore';

// Nippon-only deployment — single company projects view.
const ProjectsModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  return <NipponProjects company={company} />;
};

export default React.memo(ProjectsModule);
