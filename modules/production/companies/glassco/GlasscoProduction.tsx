import React, { useState } from 'react';
import { ProductionProvider } from '@/modules/production/components/ProductionContext';
import { Scissors, Truck, ShieldCheck, Flame, BarChart3 } from 'lucide-react';

// Split Views
import FabricationView from './components/views/FabricationView';
import ProcessingView from './components/views/ProcessingView';
import DispatchView from './components/views/DispatchView';
import DashboardView from './components/views/DashboardView';

const GlasscoProductionContent: React.FC = () => {
  const [activeView, setActiveView] = useState<'dashboard' | 'fabrication' | 'processing' | 'dispatch'>('dashboard');

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Top Level Sub-Navigation */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 no-print shrink-0 sticky top-0 z-20 flex space-x-1 shadow-sm">
        <button 
          onClick={() => setActiveView('dashboard')} 
          className={`flex items-center space-x-2 px-6 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all border-b-4 ${activeView === 'dashboard' ? 'border-purple-600 text-purple-700 bg-purple-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
        >
          <BarChart3 size={16}/> <span>Dashboard</span>
        </button>
        <button 
          onClick={() => setActiveView('fabrication')} 
          className={`flex items-center space-x-2 px-6 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all border-b-4 ${activeView === 'fabrication' ? 'border-blue-600 text-blue-700 bg-blue-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
        >
          <Scissors size={16}/> <span>Fabrication Floor</span>
        </button>
        <button 
          onClick={() => setActiveView('processing')} 
          className={`flex items-center space-x-2 px-6 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all border-b-4 ${activeView === 'processing' ? 'border-orange-600 text-orange-700 bg-orange-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
        >
          <Flame size={16}/> <span>Processing & Logistics</span>
        </button>
        <button 
          onClick={() => setActiveView('dispatch')} 
          className={`flex items-center space-x-2 px-6 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all border-b-4 ${activeView === 'dispatch' ? 'border-emerald-600 text-emerald-700 bg-emerald-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
        >
          <ShieldCheck size={16}/> <span>Quality & Dispatch</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-[#f8fafc]">
        <div className="max-w-[1600px] mx-auto">
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'fabrication' && <FabricationView />}
          {activeView === 'processing' && <ProcessingView />}
          {activeView === 'dispatch' && <DispatchView />}
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
