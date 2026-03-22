import React, { useState } from 'react';
import { Company } from '../../shared/types';
import ClientMaster from './ClientMaster';
import QuotationManager from './QuotationManager';
import NipponQuotationManager from '../companies/nippon/NipponQuotationManager';
import GlasscoQuotationManager from '../companies/glassco/GlasscoQuotationManager';
import DesignStudio from '../../production/pages/DesignStudio';
import SalesOrders from '../components/SalesOrders';
import SalesPipeline from '../components/SalesPipeline';
import { 
  Users, FileSignature, Layout, ShoppingCart, BarChart3
} from 'lucide-react';

import { useAppStore } from '../../shared/store/appStore';

const SalesCRM: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [activeTab, setActiveTab] = useState<'clients' | 'quotations' | 'orders' | 'design' | 'pipeline'>('clients');

  const tabs = [
    { id: 'clients', label: 'Business Partners', icon: Users },
    ...(company !== 'Glassco' && company !== 'Nippon' ? [{ id: 'design', label: 'Design Studio', icon: Layout }] : []),
    { id: 'quotations', label: 'Quotations', icon: FileSignature },
    { id: 'orders', label: 'Sales Orders', icon: ShoppingCart },
    { id: 'pipeline', label: 'Pipeline', icon: BarChart3 },
  ];

  return (
    <div className="flex flex-col h-full -m-6">
      <div className="no-print sticky top-0 z-30 shrink-0 bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <div className="sap-scroll-container p-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wide whitespace-nowrap transition-all ${
                activeTab === tab.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1600px] mx-auto">
            {/* Unified ClientMaster for all companies */}
            {activeTab === 'clients' && <ClientMaster />}

            {activeTab === 'design' && company !== 'Glassco' && company !== 'Nippon' && <DesignStudio />}
            
            {/* QuotationManager stays company-specific (glass vs hardware are too different) */}
            {activeTab === 'quotations' && (
                company === 'Nippon' ? <NipponQuotationManager /> :
                company === 'Glassco' ? <GlasscoQuotationManager /> :
                <QuotationManager />
            )}
            
            {/* Unified SalesOrders & Pipeline for all companies */}
            {activeTab === 'orders' && <SalesOrders />}
            {activeTab === 'pipeline' && <SalesPipeline />}
        </div>
      </div>
    </div>
  );
};

export default React.memo(SalesCRM);
