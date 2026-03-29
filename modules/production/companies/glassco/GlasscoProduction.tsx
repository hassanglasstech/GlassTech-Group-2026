import React, { useState } from 'react';
import { ProductionProvider } from '@/modules/production/components/ProductionContext';
import { Scissors, Truck, ShieldCheck, Flame, BarChart3, AlertTriangle, Zap, Users, Upload, Award } from 'lucide-react';
import NCRModule from './components/ncr/NCRModule';
import GeneratorLogModule from '@/modules/production/components/GeneratorLog';
import LabourLogModule from '@/modules/production/components/LabourLog';
import DataImportTool from '@/modules/production/components/DataImportTool';
import CutterDashboard from '@/modules/production/components/CutterDashboard';

// Split Views
import FabricationView from './components/views/FabricationView'; 
import ProcessingView from './components/views/ProcessingView';
import DispatchView from './components/views/DispatchView';
import DashboardView from './components/views/DashboardView';

const GlasscoProductionContent: React.FC = () => {
  const [activeView, setActiveView] = useState<'dashboard' | 'fabrication' | 'processing' | 'dispatch' | 'ncr' | 'energy' | 'labour' | 'import' | 'performance'>('dashboard');

  const tabClass = (id: string, activeColor: string, bgColor: string) => 
    `flex items-center space-x-2 px-5 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all border-b-4 whitespace-nowrap ${activeView === id ? `${activeColor} ${bgColor}` : 'border-transparent text-slate-500 hover:bg-slate-50'}`;

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Top Level Sub-Navigation */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 no-print shrink-0 sticky top-0 z-20 flex space-x-1 shadow-sm overflow-x-auto">
        <button onClick={() => setActiveView('dashboard')} className={tabClass('dashboard', 'border-purple-600 text-purple-700', 'bg-purple-50')}>
          <BarChart3 size={16}/> <span>Dashboard</span>
        </button>
        <button onClick={() => setActiveView('fabrication')} className={tabClass('fabrication', 'border-blue-600 text-blue-700', 'bg-blue-50')}>
          <Scissors size={16}/> <span>Fabrication</span>
        </button>
        <button onClick={() => setActiveView('processing')} className={tabClass('processing', 'border-orange-600 text-orange-700', 'bg-orange-50')}>
          <Flame size={16}/> <span>Processing</span>
        </button>
        <button onClick={() => setActiveView('dispatch')} className={tabClass('dispatch', 'border-emerald-600 text-emerald-700', 'bg-emerald-50')}>
          <ShieldCheck size={16}/> <span>QC & Dispatch</span>
        </button>
        <button onClick={() => setActiveView('ncr')} className={tabClass('ncr', 'border-rose-600 text-rose-700', 'bg-rose-50')}>
          <AlertTriangle size={16}/> <span>NCR</span>
        </button>
        <button onClick={() => setActiveView('energy')} className={tabClass('energy', 'border-amber-600 text-amber-700', 'bg-amber-50')}>
          <Zap size={16}/> <span>Energy</span>
        </button>
        <button onClick={() => setActiveView('labour')} className={tabClass('labour', 'border-sky-600 text-sky-700', 'bg-sky-50')}>
          <Users size={16}/> <span>Labour</span>
        </button>
        <button onClick={() => setActiveView('import')} className={tabClass('import', 'border-indigo-600 text-indigo-700', 'bg-indigo-50')}>
          <Upload size={16}/> <span>Import</span>
        </button>
        <button onClick={() => setActiveView('performance')} className={tabClass('performance', 'border-purple-600 text-purple-700', 'bg-purple-50')}>
          <Award size={16}/> <span>Cutters</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-[#f8fafc]">
        <div className="max-w-[1600px] mx-auto">
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'fabrication' && <FabricationView />}
          {activeView === 'processing' && <ProcessingView />}
          {activeView === 'dispatch' && <DispatchView />}
          {activeView === 'ncr' && <NCRModule />}
          {activeView === 'energy' && <GeneratorLogModule />}
          {activeView === 'labour' && <LabourLogModule />}
          {activeView === 'import' && <DataImportTool />}
          {activeView === 'performance' && <CutterDashboard />}
        </div>
      </div>
    </div>
  );
};

const GlasscoProduction: React.FC = () => {
  return (
    <ProductionProvider company="Glassco">
      <GlasscoProductionContent />
    </ProductionProvider>
  );
};

export default GlasscoProduction;
