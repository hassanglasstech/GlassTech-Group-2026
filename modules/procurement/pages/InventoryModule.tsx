
import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useSearchParams } from 'react-router-dom';
import { Company, StoreItem, MaterialLedgerEntry, Product, CostCenter, Project, HandlingUnit } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { FinanceService } from '@/modules/finance/services/financeService';
import ProductMaster from '@/modules/sales/pages/ProductMaster';
import GlasscoStockOverview from '@/modules/procurement/companies/glassco/components/inventory/StockOverview';
import GlasscoGoodsIssue from '@/modules/procurement/companies/glassco/components/inventory/GoodsIssue';
import GlasscoGoodsReceiptMIGO from '@/modules/procurement/companies/glassco/components/inventory/GoodsReceiptMIGO';

import NipponStockOverview from '@/modules/procurement/companies/nippon/components/inventory/StockOverview';
import NipponGoodsIssue from '@/modules/procurement/companies/nippon/components/inventory/GoodsIssue';
import NipponGoodsReceipt from '@/modules/procurement/companies/nippon/components/inventory/GoodsReceipt';
import { 
  LayoutGrid, ArrowUpRight, ShieldCheck, Truck, Database, Loader2
} from 'lucide-react';

type TabId = 'overview' | 'master' | 'issuance' | 'migo' | 'quality';

const SkeletonRow = () => (
  <div className="flex gap-4 px-6 py-3 border-b border-slate-100 animate-pulse">
    <div className="h-3 bg-slate-200 rounded w-24"/>
    <div className="h-3 bg-slate-200 rounded w-48"/>
    <div className="h-3 bg-slate-200 rounded w-16"/>
    <div className="h-3 bg-slate-200 rounded w-20"/>
  </div>
);

const InventoryModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = (searchParams.get('inv_tab') as TabId) || 'overview';
  const [activeTab, setActiveTab] = useState<TabId>(tabFromUrl);
  const [isLoading, setIsLoading] = useState(true);
  
  const [items, setItems] = useState<StoreItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]); 
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ledger, setLedger] = useState<MaterialLedgerEntry[]>([]);
  const [handlingUnits, setHUs] = useState<HandlingUnit[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMigoOpen, setIsMigoOpen] = useState(false);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams({ inv_tab: tab }, { replace: true });
  };

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setItems(InventoryService.getStore().filter(i => i.company === company));
    setProducts(SalesService.getProducts().filter(p => p.company === company));
    setCostCenters(FinanceService.getCostCenters().filter(c => c.company === company));
    setProjects(SalesService.getProjects().filter(p => p.company === company && p.status === 'Active'));
    setHUs(InventoryService.getHandlingUnits());
    const allLedger = await InventoryService.getStockLedgerAsync();
    setLedger(allLedger.filter(l => l.company === company).sort((a,b) => b.timestamp.localeCompare(a.timestamp)));
    setIsLoading(false);
  }, [company]);

  useEffect(() => {
    refreshData();
  }, [company, activeTab, refreshData]);

  // Refresh when user comes back to this browser tab
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshData(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshData]);

  const refreshSync = () => {
    setItems(InventoryService.getStore().filter(i => i.company === company));
    InventoryService.getStockLedgerAsync().then(all => {
      setLedger(all.filter(l => l.company === company).sort((a,b) => b.timestamp.localeCompare(a.timestamp)));
    });
  };

  const tabs = [
    { id: 'overview', label: 'Stock Balances', icon: LayoutGrid },
    { id: 'master', label: 'Material Master', icon: Database },
    { id: 'issuance', label: 'Goods Issue', icon: ArrowUpRight },
    { id: 'quality', label: 'Quality Hub', icon: ShieldCheck }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm no-print">
        <div className="sap-scroll-container">
          {tabs.map(tab => (
            <button 
                key={tab.id}
                onClick={() => handleTabChange(tab.id as TabId)} 
                className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <tab.icon size={16}/><span>{tab.label}</span>
            </button>
          ))}
          <button onClick={() => setIsMigoOpen(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center space-x-2 shadow-xl hover:bg-blue-600 transition-all whitespace-nowrap">
            <Truck size={16}/><span>GRN (Stock In)</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="h-4 bg-slate-200 rounded w-32 animate-pulse"/>
            <div className="h-4 bg-slate-200 rounded w-24 animate-pulse"/>
          </div>
          {Array.from({length: 8}).map((_, i) => <SkeletonRow key={i}/>)}
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            company === 'Nippon' ? (
              <NipponStockOverview items={items} searchTerm={searchTerm} setSearchTerm={setSearchTerm}/>
            ) : (
              <GlasscoStockOverview items={items} searchTerm={searchTerm} setSearchTerm={setSearchTerm}/>
            )
          )}

          {activeTab === 'master' && (
            <div className="animate-in fade-in duration-300">
              <ProductMaster />
            </div>
          )}

          {activeTab === 'issuance' && (
            company === 'Nippon' ? (
              <NipponGoodsIssue items={items} costCenters={costCenters} projects={projects} ledger={ledger} refreshData={refreshSync}/>
            ) : (
              <GlasscoGoodsIssue items={items} costCenters={costCenters} projects={projects} ledger={ledger} refreshData={refreshSync}/>
            )
          )}
        </>
      )}

      {company === 'Nippon' ? (
        <NipponGoodsReceipt isOpen={isMigoOpen} onClose={() => setIsMigoOpen(false)} refreshData={refreshSync}/>
      ) : (
        <GlasscoGoodsReceiptMIGO products={products} isOpen={isMigoOpen} onClose={() => setIsMigoOpen(false)} refreshData={refreshSync}/>
      )}
    </div>
  );
};

export default InventoryModule;
