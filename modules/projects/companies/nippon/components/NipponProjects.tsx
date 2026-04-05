
import React, { useState, useEffect } from 'react';
import { Company, Project, Client, PurchaseOrder } from '@/modules/shared/types';
import { ProjectService } from '@/modules/projects/services/projectService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import ProjectPortfolio from '@/modules/projects/components/ProjectPortfolio';
import CostControlSheet from '@/modules/projects/components/CostControlSheet';

const NipponProjects: React.FC<{ company: Company }> = ({ company }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  useEffect(() => {
    refreshData();
  }, [company]);

  const refreshData = () => {
    const loadedProjects = ProjectService.getProjects().filter(p => p.company === company);
    setProjects(loadedProjects.sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()));
    setClients(SalesService.getClients().filter(c => c.company === company));
    setPurchaseOrders(ProductionService.getPurchaseOrders().filter(p => p.fromCompany === company || p.toVendor === company));
  };

  const updateProjectValue = (newValue: number) => {
      if (!activeProject) return;
      const all = ProjectService.getProjects();
      const updated = all.map(p => p.id === activeProject.id ? { ...p, finalSettlementValue: newValue } : p);
      ProjectService.saveProjects(updated);
      refreshData();
      setActiveProject({ ...activeProject, finalSettlementValue: newValue });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
        <ProjectPortfolio 
            projects={projects} 
            clients={clients} 
            onSelectProject={setActiveProject}
            refreshData={refreshData}
            company={company}
        />

        {activeProject && (
            <CostControlSheet 
                project={activeProject}
                client={clients.find(c => c.id === activeProject.clientId)}
                purchaseOrders={purchaseOrders.filter(po => po.projectId === activeProject.id)}
                onClose={() => setActiveProject(null)}
                onUpdateValue={updateProjectValue}
                company={company}
                onRefresh={refreshData}
            />
        )}
    </div>
  );
};

export default NipponProjects;
