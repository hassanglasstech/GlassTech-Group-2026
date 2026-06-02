
import React, { useState, useEffect } from 'react';
import { PettyCashEntry, GatePass, Requisition, TemperingDispatch } from '../../shared/types';
import { FinanceService } from '../../finance/services/financeService';
import { ProductionService } from '../../production/services/productionService';
import { InventoryService } from '../../procurement/services/inventoryService';
import FactoryCashJournal from '../companies/factory/components/FactoryCashJournal';
import FactoryGateControl from '../companies/factory/components/FactoryGateControl';
import FactoryRequisitions from '../companies/factory/components/FactoryRequisitions';
import FactoryFinanceDashboardView from '../../finance/components/FactoryFinanceDashboardView';
import ChartOfAccounts from '../../finance/pages/ChartOfAccounts';
import { BarChart3, ListTree } from 'lucide-react';

const FactoryProduction: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'coa' | 'cash' | 'gate' | 'requisition'>('dashboard');
  
  const [cashEntries, setCashEntries] = useState<PettyCashEntry[]>([]);
  const [dispatches, setDispatches] = useState<TemperingDispatch[]>([]);
  const [gatePasses, setGatePasses] = useState<GatePass[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);

  useEffect(() => { refreshData(); }, []);

  const refreshData = () => {
      const allCash = FinanceService.getPettyCashEntries();
      setCashEntries(allCash.filter(c => c.company !== 'Factory' && c.recordedBy === 'FACTORY_CENTRAL').reverse());

      const allDispatches = ProductionService.getTemperingDispatches();
      setDispatches(allDispatches.filter(d => 
          (d.status === 'Ready to Dispatch' || d.status === 'Scheduled')
      ));
      setGatePasses(ProductionService.getGatePasses().filter(g => g.company === 'Factory'));

      const allReqs = InventoryService.getRequisitions().filter(Boolean);
      setRequisitions(allReqs.filter(r => r.company === 'Factory' || r.targetCompany === 'Factory').reverse());
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl flex items-center justify-between">
         <div>
            <h2 className="text-3xl font-black uppercase tracking-tight">Factory Central Hub</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Centralized Operations Command</p>
         </div>
         <div className="flex space-x-2 bg-white/10 p-1 rounded-xl">
            <button onClick={() => setActiveTab('dashboard')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'dashboard' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'}`}>Dashboard</button>
            <button onClick={() => setActiveTab('coa')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'coa' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'}`}>COA</button>
            <button onClick={() => setActiveTab('cash')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'cash' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'}`}>Central Cash</button>
            <button onClick={() => setActiveTab('gate')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'gate' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'}`}>Gate Control</button>
            <button onClick={() => setActiveTab('requisition')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'requisition' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'}`}>Requisitions</button>
         </div>
      </div>

      {activeTab === 'dashboard' && <FactoryFinanceDashboardView metrics={{expenses: 500000, repairMaintenance: 150000, assetPurchases: 200000, consumablePurchases: 50000}} />}
      {activeTab === 'coa' && <ChartOfAccounts company="Factory" />}
      {activeTab === 'cash' && <FactoryCashJournal cashEntries={cashEntries} refreshData={refreshData} />}
      {activeTab === 'gate' && <FactoryGateControl dispatches={dispatches} gatePasses={gatePasses} refreshData={refreshData} />}
      {activeTab === 'requisition' && <FactoryRequisitions requisitions={requisitions} refreshData={refreshData} />}
    </div>
  );
};

export default FactoryProduction;
