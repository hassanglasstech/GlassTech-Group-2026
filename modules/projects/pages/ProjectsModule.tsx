
import React, { useState, useEffect } from 'react';
import { Company, Project, Client, PurchaseOrder } from '../../shared/types';
import { ProjectService } from '../services/projectService';
import { SalesService } from '../../sales/services/salesService';
import { ProductionService } from '../../production/services/productionService';
import GlasscoProjects from '../companies/glassco/components/GlasscoProjects';
import NipponProjects from '../companies/nippon/components/NipponProjects';

import { useAppStore } from '../../shared/store/appStore';

const ProjectsModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);

  if (company === 'Glassco') return <GlasscoProjects company={company} />;
  if (company === 'Nippon') return <NipponProjects company={company} />;

  return (
    <div className="p-12 text-center">
      <h2 className="text-2xl font-black text-slate-300 uppercase tracking-widest">Select a Company to View Projects</h2>
    </div>
  );
};

export default React.memo(ProjectsModule);
