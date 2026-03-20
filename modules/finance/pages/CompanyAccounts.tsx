import React, { useState, useMemo } from 'react';
import { Company } from '@/modules/shared/types';
import LoanManagement from '@/modules/hr/pages/LoanManagement';
import PayrollManagement from '@/modules/hr/pages/PayrollManagement';
import ChartOfAccounts from '@/modules/finance/pages/ChartOfAccounts';
import GeneralLedger from '@/modules/finance/pages/GeneralLedger';
import TrialBalance from '@/modules/finance/pages/TrialBalance';
import FinancialStatements from '@/modules/finance/pages/FinancialStatements';
import CostCenterMaster from '@/modules/finance/pages/CostCenterMaster';
import PettyCashBook from '@/modules/finance/pages/PettyCashBook';
import RecurringExpenses from '@/modules/finance/pages/RecurringExpenses';
import FinancialRegistry from '@/modules/finance/pages/FinancialRegistry';
import BillingHub from '@/modules/finance/components/BillingHub';
import GLConfiguration from '@/modules/finance/components/GLConfiguration';
import AgingReport from '@/modules/finance/components/AgingReport';
import FinanceDashboardView from '@/modules/finance/components/FinanceDashboardView';
import AssetManagement from '@/modules/finance/components/AssetManagement';
import { 
  Landmark, CreditCard, ListTree, BookOpen, BarChart4, 
  FilePieChart, Target, Wallet, RefreshCw, FileText, 
  Inbox, Settings, Clock, Briefcase, LayoutGrid, Users, BarChart3, Package
} from 'lucide-react';

type CategoryKey = 'ops' | 'reporting' | 'hr' | 'assets' | 'config';

const CompanyAccounts: React.FC<{ company: Company }> = ({ company }) => {
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('ops');
  const [activeTab, setActiveTab] = useState<string>('registry');

  const structure = useMemo(() => {
    return {
      ops: {
        label: 'Core Operations',
        icon: Briefcase,
        tabs: [
          { id: 'dashboard', label: 'Finance Dashboard', icon: BarChart3 },
          { id: 'registry', label: 'Event Registry', icon: Inbox },
          { id: 'cash_journal', label: 'Cash Journal', icon: Wallet },
          { id: 'ledger', label: 'General Ledger', icon: BookOpen },
          { id: 'billing', label: 'Invoice Billing', icon: FileText },
        ]
      },
      reporting: {
        label: 'Financial Reporting',
        icon: BarChart4,
        tabs: [
          { id: 'trial', label: 'Trial Balance', icon: LayoutGrid },
          { id: 'aging', label: 'Aging Report', icon: Clock },
          { id: 'reports', label: 'Financial Statements', icon: FilePieChart },
        ]
      },
      hr: {
        label: 'HR Finance',
        icon: Users,
        tabs: [
          { id: 'loans', label: 'Loan Management', icon: CreditCard },
          { id: 'payroll', label: 'Payroll Processing', icon: Landmark },
        ]
      },
      assets: {
        label: 'Asset Management',
        icon: Package,
        tabs: [
          { id: 'assets', label: 'Assets & Tools', icon: Package },
        ]
      },
      config: {
        label: 'Configuration',
        icon: Settings,
        tabs: [
          { id: 'coa', label: 'Chart of Accounts', icon: ListTree },
          { id: 'cost_centers', label: 'Cost Centers', icon: Target },
          { id: 'gl_config', label: 'GL Configuration', icon: Settings },
          { id: 'recurring', label: 'Recurring Entries', icon: RefreshCw },
        ]
      }
    };
  }, []);

  const currentTabs = structure[activeCategory].tabs;

  return (
    <div className="flex flex-col h-full -m-6 bg-[#f8fafc]">
      {/* 1. Main Category Navigation */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 no-print shrink-0 sticky top-0 z-30 shadow-sm">
        <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-1">
          {(Object.keys(structure) as CategoryKey[]).map((key) => {
            const cat = structure[key];
            const isActive = activeCategory === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setActiveCategory(key);
                  setActiveTab(structure[key].tabs[0].id);
                }}
                className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl transition-all ${
                  isActive 
                    ? 'bg-slate-800 text-white shadow-lg transform scale-105' 
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                <cat.icon size={18} className={isActive ? 'text-blue-300' : 'text-slate-400'} />
                <span className="font-bold text-xs uppercase tracking-wide">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Sub-Module Tabs */}
      <div className="bg-slate-100 border-b border-slate-200 px-6 py-2 no-print shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex space-x-4">
          {currentTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all whitespace-nowrap border ${
                  isActive 
                    ? 'bg-white text-blue-600 border-blue-200 shadow-sm' 
                    : 'bg-transparent text-slate-500 border-transparent hover:bg-white/50'
                }`}
              >
                <tab.icon size={14} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1600px] mx-auto animate-in fade-in duration-300">
          {/* Operations */}
          {activeTab === 'dashboard' && <FinanceDashboardView company={company} />}
          {activeTab === 'registry' && <FinancialRegistry company={company} />}
          {activeTab === 'cash_journal' && <PettyCashBook company={company} />}
          {activeTab === 'ledger' && <GeneralLedger company={company} />}
          {activeTab === 'billing' && <BillingHub company={company} />}
          
          {/* Reporting */}
          {activeTab === 'trial' && <TrialBalance company={company} />}
          {activeTab === 'aging' && <AgingReport company={company} />}
          {activeTab === 'reports' && <FinancialStatements company={company} />}
          
          {/* HR Finance */}
          {activeTab === 'loans' && <LoanManagement company={company} />}
          {activeTab === 'payroll' && <PayrollManagement company={company} />}

          {/* Assets */}
          {activeTab === 'assets' && <AssetManagement />}
          
          {/* Config */}
          {activeTab === 'coa' && <ChartOfAccounts company={company} />}
          {activeTab === 'cost_centers' && <CostCenterMaster company={company} />}
          {activeTab === 'gl_config' && <GLConfiguration company={company} />}
          {activeTab === 'recurring' && <RecurringExpenses company={company} />}
        </div>
      </div>
    </div>
  );
};

export default CompanyAccounts;
