import React, { useState, useMemo } from 'react';
import { Company } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import LoanManagement from '@/modules/hr/pages/LoanManagement';
import PayrollManagement from '@/modules/hr/pages/PayrollManagement';
import ChartOfAccounts from '@/modules/finance/pages/ChartOfAccounts';
import GeneralLedger from '@/modules/finance/pages/GeneralLedger';
import CostCenterMaster from '@/modules/finance/pages/CostCenterMaster';
import PettyCashBook from '@/modules/finance/pages/PettyCashBook';
import RecurringExpenses from '@/modules/finance/pages/RecurringExpenses';
import FinancialRegistry from '@/modules/finance/pages/FinancialRegistry';
import PeriodManager from '@/modules/finance/pages/PeriodManager';
import BillingHub from '@/modules/finance/components/BillingHub';
import BankReconciliation from '@/modules/finance/components/BankReconciliation';
import ThreeWayMatching from '@/modules/finance/components/ThreeWayMatching';
import { toast } from 'sonner';
import GLConfiguration from '@/modules/finance/components/GLConfiguration';
import GLPostingRules from '@/modules/finance/components/GLPostingRules';
import GLCodeVerifier from '@/modules/finance/components/GLCodeVerifier';
import FinanceDashboardView from '@/modules/finance/components/FinanceDashboardView';
import AssetManagement from '@/modules/finance/components/AssetManagement';
import ReportsHub from '@/modules/finance/pages/ReportsHub';
import BudgetMaster from '@/modules/finance/components/BudgetMaster';
import CashFlowDashboard from '@/modules/finance/components/CashFlowDashboard';
import OverheadDashboard from '@/modules/finance/components/OverheadDashboard';
import JobPLDashboard from '@/modules/finance/components/JobPLDashboard';
import InventoryValuationReport from '@/modules/finance/pages/InventoryValuationReport';
import IntercompanySettlement from '@/modules/finance/components/IntercompanySettlement';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { 
  Landmark, CreditCard, ListTree, BookOpen, BarChart4,
  FilePieChart, Target, Wallet, RefreshCw, FileText,
  Inbox, Settings, Clock, Briefcase, Users, BarChart3, Package, ShieldCheck, Lock, BarChart2, Activity, Layers, TrendingUp, ArrowRightLeft
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
          { id: 'cash_flow', label: 'Cash Flow Forecast', icon: Activity },
          { id: 'job_pl',    label: 'Job P&L',            icon: TrendingUp },
          { id: 'registry', label: 'Event Registry', icon: Inbox },
          { id: 'cash_journal', label: 'Cash Journal', icon: Wallet },
          { id: 'ledger', label: 'General Ledger', icon: BookOpen },
          { id: 'billing', label: 'Invoice Billing', icon: FileText },
          { id: 'ico_settle', label: 'ICO Settlements', icon: ArrowRightLeft },
          { id: 'matching', label: 'Job P&L Check', icon: ShieldCheck },
        ]
      },
      reporting: {
        label: 'Financial Reporting',
        icon: BarChart4,
        tabs: [
          { id: 'reports_hub',  label: 'Reports Hub',           icon: FilePieChart },
          { id: 'inv_valuation',label: 'Inventory Valuation',   icon: Package },
          { id: 'bank_recon',   label: 'Bank Reconciliation',   icon: Landmark },
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
          { id: 'period_manager', label: 'Period Manager', icon: Lock },
          { id: 'monthly_actions', label: 'Monthly Actions', icon: Clock },
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
          {activeTab === 'registry' && <FinancialRegistry />}
          {activeTab === 'cash_journal' && <PettyCashBook company={company} />}
          {activeTab === 'ledger' && <GeneralLedger company={company} />}
          {activeTab === 'billing' && <BillingHub company={company} />}
          {activeTab === 'matching'      && <ThreeWayMatching company={company} />}
          {activeTab === 'ico_settle'    && <IntercompanySettlement />}
          {activeTab === 'budget_master'  && <BudgetMaster company={company} />}
          {activeTab === 'cash_flow'       && <CashFlowDashboard company={company} />}
          {activeTab === 'overhead_pool'    && <OverheadDashboard company={company} />}
          {activeTab === 'job_pl'           && <JobPLDashboard company={company} />}
          
          {/* Reporting */}
          {activeTab === 'reports_hub'   && <ReportsHub company={company} />}
          {activeTab === 'inv_valuation' && <InventoryValuationReport company={company} />}
          {activeTab === 'bank_recon' && <BankReconciliation company={company} />}
          
          {/* HR Finance */}
          {activeTab === 'loans' && <LoanManagement company={company} />}
          {activeTab === 'payroll' && <PayrollManagement company={company} />}

          {/* Assets */}
          {activeTab === 'assets' && <AssetManagement />}
          
          {/* Config */}
          {activeTab === 'coa' && <ChartOfAccounts company={company} />}
          {activeTab === 'cost_centers' && <CostCenterMaster company={company} />}
          {activeTab === 'gl_config' && (
            <div className="space-y-8">
              <GLConfiguration company={company} />
              <GLPostingRules company={company} />
              <GLCodeVerifier company={company} />
            </div>
          )}
          {activeTab === 'recurring' && <RecurringExpenses company={company} />}
          {activeTab === 'period_manager' && <PeriodManager company={company} />}
          
          {/* Monthly Actions */}
          {activeTab === 'monthly_actions' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-indigo-600 text-white p-8 rounded-[2rem] shadow-xl">
                
                <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-1">Run depreciation and recurring expenses for the current period</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-2xl border shadow-sm space-y-4">
                  <h3 className="text-sm font-black uppercase text-slate-800">Asset Depreciation</h3>
                  <p className="text-xs text-slate-500">Calculates monthly depreciation (Straight Line / Declining Balance) for all active assets and posts a single GL entry.</p>
                  <button onClick={async () => {
                    const month = new Date().toISOString().slice(0, 7);
                    if (!await confirmModal(`Run depreciation for ${month}?`)) return;
                    const result = FinanceService.postDepreciation(company, month);
                    if (result.posted > 0) toast.success(`Depreciation posted: ${result.posted} assets`);
                    else if (result.skipped > 0) toast.info(`Already posted for ${month} — ${result.skipped} assets skipped`);
                    else toast.error('No active assets found');
                  }} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-blue-700">Run Depreciation</button>
                </div>
                <div className="bg-white p-8 rounded-2xl border shadow-sm space-y-4">
                  <h3 className="text-sm font-black uppercase text-slate-800">Recurring Expenses</h3>
                  <p className="text-xs text-slate-500">Auto-posts all recurring expense entries (rent, utilities, etc.) that haven't been posted for the current month.</p>
                  <button onClick={async () => {
                    if (!await confirmModal('Post all due recurring expenses?')) return;
                    const result = FinanceService.postRecurringExpenses(company);
                    toast.success(`Posted: ${result.posted}, Skipped (already done): ${result.skipped}`);
                  }} className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-emerald-700">Post Recurring</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompanyAccounts;
