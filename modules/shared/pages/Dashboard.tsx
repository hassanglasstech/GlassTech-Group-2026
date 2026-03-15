
import React, { useMemo, useState, useEffect } from 'react';
import { Company, ProductionPiece, StoreItem, LedgerTransaction } from '../types';
import { HRService } from '../../hr/services/hrService';
import { SalesService } from '../../sales/services/salesService';
import { ProductionService } from '../../production/services/productionService';
import { InventoryService } from '../../procurement/services/inventoryService';
import { FinanceService } from '../../finance/services/financeService';
import { useNavigate } from 'react-router-dom';
import { Users, Clock, Landmark, Factory, Briefcase, Warehouse, ShoppingBag, Globe, ShieldCheck, TrendingUp, AlertTriangle, Activity, Calendar, Truck, Loader2 } from 'lucide-react';

import { useAppStore } from '../store/appStore';

const Dashboard: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  
  // Local state for async data
  const [employees, setEmployees] = useState(HRService.getEmployees().filter(e => e.company === company));
  const [quotations, setQuotations] = useState(SalesService.getQuotations().filter(q => q.company === company));
  const [pieces, setPieces] = useState<ProductionPiece[]>([]);
  const [store, setStore] = useState<StoreItem[]>([]);
  const [ledger, setLedger] = useState<LedgerTransaction[]>([]);

  useEffect(() => {
    const loadHeavyData = async () => {
        setIsLoading(true);
        // Load employees/quotations first (sync/fast)
        const emps = HRService.getEmployees().filter(e => e.company === company);
        const quos = SalesService.getQuotations().filter(q => q.company === company);
        setEmployees(emps);
        setQuotations(quos);

        // Load heavy items async (IDB)
        const [allPieces, allStore, allLedger] = await Promise.all([
            ProductionService.getProductionPiecesAsync(),
            Promise.resolve(InventoryService.getStore()), // Store is still relatively small but can be async'd
            Promise.resolve(FinanceService.getLedger())
        ]);

        setPieces(allPieces);
        setStore(allStore.filter(i => i.company === company));
        setLedger(allLedger.filter(t => t.company === company));
        setIsLoading(false);
    };
    loadHeavyData();
  }, [company]);

  // Derived Analytics
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.slice(0, 7);

    const activeStaff = employees.length;
    
    const monthSales = quotations
      .filter(q => q.status === 'Approved' && q.date.startsWith(currentMonth))
      .reduce((sum, q) => sum + q.items.reduce((s, i) => s + (i.amount || 0), 0), 0);

    const factoryPieces = company === 'Factory' || company === 'Glassco' ? pieces : pieces.filter(p => p.specs.includes(company)); 
    const producedToday = factoryPieces.filter(p => p.lastUpdated.startsWith(today) && (p.status === 'Cut' || p.status === 'Tempered')).length;
    const pendingDispatch = factoryPieces.filter(p => p.status === 'Ready to Dispatch').length;

    const lowStockCount = store.filter(i => i.quantity <= i.minLevel).length;
    const inventoryValue = store.reduce((sum, i) => sum + (i.totalValue || 0), 0);

    const cashFlow = ledger.filter(t => t.date.startsWith(currentMonth)).length;

    return { activeStaff, monthSales, producedToday, pendingDispatch, lowStockCount, inventoryValue, cashFlow };
  }, [employees, quotations, pieces, store, ledger, company]);

  const tiles = [
    { title: 'My Home', subtitle: 'Launchpad', icon: Clock, path: '/' },
    { title: 'HCM Registry', subtitle: `${stats.activeStaff} Personnel`, icon: Users, path: '/hr' },
    ...(company !== 'Factory' ? [
        { title: 'SD Orders', subtitle: 'Sales & Distrib.', icon: Briefcase, path: '/sales' },
        { title: 'MM Inventory', subtitle: 'Logistics', icon: Warehouse, path: '/inventory' },
    ] : []),
    ...(company === 'Glassco' ? [{ title: 'PP Production', subtitle: 'Floor Control', icon: Factory, path: '/production' }] : []),
    { title: 'FI Financials', subtitle: 'Gen. Ledger', icon: Landmark, path: '/accounts' },
    { title: 'PUR Logistics', subtitle: 'Purchasing', icon: ShoppingBag, path: '/requisitions' },
    ...(company !== 'Factory' ? [{ title: 'IC Hub', subtitle: 'Intercompany', icon: Globe, path: '/hub' }] : []),
    { title: 'BASIS Admin', subtitle: 'System Mgmt', icon: ShieldCheck, path: '/admin' },
  ];

  if (isLoading) return <div className="h-full flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Loading Dashboard Analytics...</div>;

  return (
    <div className="space-y-4 md:space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
         <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-5 md:p-6 rounded-2xl md:rounded-[2rem] shadow-xl relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-20"><Briefcase size={80}/></div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Monthly Revenue</p>
            <p className="text-2xl md:text-3xl font-black">PKR {(stats.monthSales / 1000000).toFixed(2)}M</p>
            <div className="mt-3 md:mt-4 flex items-center space-x-2 text-[10px] font-bold bg-white/10 w-fit px-2 py-1 rounded"><TrendingUp size={12}/> <span>Target: 85% Achieved</span></div>
         </div>
         
         <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 text-white p-5 md:p-6 rounded-2xl md:rounded-[2rem] shadow-xl relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-20"><Factory size={80}/></div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Production Pulse</p>
            <p className="text-2xl md:text-3xl font-black">{stats.producedToday} <span className="text-sm opacity-60">Units</span></p>
            <div className="mt-3 md:mt-4 flex items-center space-x-2 text-[10px] font-bold bg-white/10 w-fit px-2 py-1 rounded"><Activity size={12}/> <span>Efficiency: High</span></div>
         </div>

         <div className="bg-white p-5 md:p-6 rounded-2xl md:rounded-[2rem] shadow-sm border border-slate-200 relative overflow-hidden group hover:border-blue-300 transition-all">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Inventory Alert</p>
            <p className={`text-2xl md:text-3xl font-black ${stats.lowStockCount > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{stats.lowStockCount}</p>
            <p className="text-xs font-bold text-slate-500">Items Below Safety</p>
            {stats.lowStockCount > 0 && <div className="absolute bottom-4 right-4 text-rose-500 animate-pulse"><AlertTriangle size={24}/></div>}
         </div>

         <div className="bg-white p-5 md:p-6 rounded-2xl md:rounded-[2rem] shadow-sm border border-slate-200 relative overflow-hidden group hover:border-blue-300 transition-all">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Ready for Dispatch</p>
            <p className="text-2xl md:text-3xl font-black text-indigo-600">{stats.pendingDispatch}</p>
            <p className="text-xs font-bold text-slate-500">Staged Units</p>
            <div className="absolute bottom-4 right-4 text-indigo-100"><Truck size={32}/></div>
         </div>
      </div>

      <div>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em] mb-3 md:mb-4">Launchpad Favorites</h3>
        <div className="flex flex-wrap gap-3 md:gap-4">
          {tiles.map((tile) => (
            <div key={tile.title} onClick={() => navigate(tile.path)} className="sap-tile">
              <div className="sap-tile-title">{tile.title}</div>
              <div className="sap-tile-subtitle">{tile.subtitle}</div>
              <div className="sap-tile-icon"><tile.icon size={32} strokeWidth={1.5} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
             <h3 className="text-xs md:text-sm font-black uppercase tracking-widest text-slate-700">Live Notifications</h3>
             <span className="text-[10px] font-bold text-blue-600 cursor-pointer hover:underline uppercase">Dismiss All</span>
          </div>
          <div className="space-y-3 md:space-y-4 flex-1">
            {stats.lowStockCount > 0 && (
               <div className="p-3 md:p-4 bg-rose-50 border-l-4 border-rose-500 rounded-xl flex items-start space-x-3">
                  <AlertTriangle className="text-rose-600 shrink-0" size={16}/>
                  <div><p className="text-xs font-black text-rose-800 uppercase">Material Shortage</p><p className="text-[10px] text-rose-600 font-medium">{stats.lowStockCount} items below safety levels.</p></div>
               </div>
            )}
            <div className="p-3 md:p-4 bg-blue-50 border-l-4 border-blue-500 rounded-xl flex items-start space-x-3">
               <Activity className="text-blue-600 shrink-0" size={16}/>
               <div><p className="text-xs font-black text-blue-800 uppercase">System Maintenance</p><p className="text-[10px] text-blue-600 font-medium">Optimization runs nightly at 02:00 AM.</p></div>
            </div>
          </div>
        </div>
        
        <div className="bg-slate-900 text-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-xl relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-5"><Activity size={150}/></div>
           <h3 className="text-xs md:text-sm font-black uppercase tracking-widest text-slate-400 mb-6 border-b border-slate-700 pb-4">Executive Summary</h3>
           <div className="space-y-6 md:space-y-8 relative z-10">
              <div className="flex justify-between items-center">
                 <div className="flex items-center space-x-3 md:space-x-4">
                    <div className="p-2 md:p-3 bg-white/10 rounded-xl"><Warehouse size={18} className="text-blue-400"/></div>
                    <div><p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase">Inventory Asset</p><p className="text-lg md:text-xl font-black">PKR {(stats.inventoryValue || 0).toLocaleString()}</p></div>
                 </div>
                 <div className="text-right"><p className="text-[9px] md:text-[10px] font-bold text-emerald-400 uppercase">Healthy</p></div>
              </div>
              <div className="flex justify-between items-center">
                 <div className="flex items-center space-x-3 md:space-x-4">
                    <div className="p-2 md:p-3 bg-white/10 rounded-xl"><Users size={18} className="text-indigo-400"/></div>
                    <div><p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase">Human Capital</p><p className="text-lg md:text-xl font-black">{stats.activeStaff} Staff</p></div>
                 </div>
                 <div className="text-right"><p className="text-[9px] md:text-[10px] font-bold text-blue-400 uppercase">Active</p></div>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-700">
                 <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-500">System Date</span>
                    <span className="text-[10px] md:text-xs font-bold flex items-center space-x-2"><Calendar size={12}/> <span>{new Date().toLocaleDateString('en-GB')}</span></span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(Dashboard);
