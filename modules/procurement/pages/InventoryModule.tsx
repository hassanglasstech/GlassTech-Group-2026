
import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { Company, StoreItem, MaterialLedgerEntry, Product, CostCenter, Project, HandlingUnit } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { FinanceService } from '@/modules/finance/services/financeService';
import ProductMaster from '@/modules/sales/pages/ProductMaster';
import StockOverview from '@/modules/procurement/components/inventory/StockOverview';
import GoodsIssue from '@/modules/procurement/components/inventory/GoodsIssue';
import GoodsReceiptMIGO from '@/modules/procurement/components/inventory/GoodsReceiptMIGO';
import RemnantManager from '@/modules/procurement/components/inventory/RemnantManager';

import NipponGoodsReceipt from '@/modules/procurement/components/inventory/NipponGoodsReceipt';
import GTKStoreReceipt from '@/modules/procurement/components/inventory/GTKStoreReceipt';
import ProjectConsumption from '@/modules/procurement/components/inventory/ProjectConsumption';
import ToolRegister from '@/modules/procurement/components/inventory/ToolRegister';
import AdvanceTracker from '@/modules/procurement/components/inventory/AdvanceTracker';
import OpeningBalance from '@/modules/procurement/components/inventory/OpeningBalance';
import GRNRegister from '@/modules/procurement/components/inventory/GRNRegister';
import WeightMaster from '@/modules/procurement/components/inventory/WeightMaster';
import { 
  LayoutGrid, ArrowUpRight, ShieldCheck, Truck, Database, Loader2, Layers, BarChart3, Wrench, Banknote, PackageOpen, ClipboardList, Scale
} from 'lucide-react';

const InventoryModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [activeTab, setActiveTab] = useState<'overview' | 'master' | 'issuance' | 'migo' | 'quality' | 'remnants' | 'consumption' | 'tools' | 'advances' | 'opening' | 'grnRegister' | 'weightMaster'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  
  const [items, setItems] = useState<StoreItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]); 
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ledger, setLedger] = useState<MaterialLedgerEntry[]>([]);
  const [handlingUnits, setHUs] = useState<HandlingUnit[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMigoOpen, setIsMigoOpen] = useState(false);

  useEffect(() => {
    const refreshData = async () => {
        setIsLoading(true);
        setItems(InventoryService.getStore().filter(i => i.company === company));
        setProducts(SalesService.getProducts().filter(p => p.company === company));
        setCostCenters(FinanceService.getCostCenters().filter(c => c.company === company));
        setProjects(SalesService.getProjects().filter(p => p.company === company && p.status === 'Active'));
        setHUs(InventoryService.getHandlingUnits());
        
        // Async Load Stock Ledger
        // Defer heavy IDB load - don't block initial render
        let allLedger: any[] = InventoryService.getStockLedger(); // sync first
        setLedger(allLedger.filter(l => l.company === company).sort((a,b) => b.timestamp.localeCompare(a.timestamp)));
        
        setIsLoading(false);
    };
    refreshData();
  }, [company, activeTab]); 

  const refreshSync = () => {
      // Helper for modal updates that might update sync stores
      setItems(InventoryService.getStore().filter(i => i.company === company));
      // Load full IDB data after render
      setTimeout(() => InventoryService.getStockLedgerAsync().then(all => {
          setLedger(all.filter(l => l.company === company).sort((a,b) => b.timestamp.localeCompare(a.timestamp)));
      }), 100);
  };

  const isGlassCompany = company === 'Glassco';
  const isNippon = company === 'Nippon';
  const isAluminiumCompany = company === 'GTK' || company === 'GTI';

  const tabs = [
    { id: 'overview', label: 'Stock Balances', icon: LayoutGrid },
    { id: 'master', label: 'Material Master', icon: Database },
    { id: 'opening', label: 'Opening Balance', icon: PackageOpen },
    { id: 'issuance', label: 'Goods Issue', icon: ArrowUpRight },
    { id: 'consumption', label: 'Project Consumption', icon: BarChart3 },
    // Tools tab only for aluminium companies
    ...(isAluminiumCompany ? [{ id: 'tools', label: 'Tool Register', icon: Wrench }] : []),
    ...(isAluminiumCompany ? [{ id: 'advances', label: 'Cash Advances', icon: Banknote }] : []),
    // Quality Hub & Remnants only for glass companies
    ...(!isAluminiumCompany ? [{ id: 'quality', label: 'Quality Hub', icon: ShieldCheck }] : []),
    ...(!isAluminiumCompany ? [{ id: 'remnants', label: 'Remnants', icon: Layers }] : []),
    ...(!isAluminiumCompany ? [{ id: 'grnRegister', label: 'GRN Register', icon: ClipboardList }] : []),
    ...(!isAluminiumCompany ? [{ id: 'weightMaster', label: 'Weight Master', icon: Scale }] : []),
  ];

  if (isLoading) return <div className="h-full flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Loading Inventory Data...</div>;

  return (
    <div className="space-y-6">
      {/* Industrial Navigation Terminal */}
      <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm no-print">
        <div className="sap-scroll-container">
          {tabs.map(tab => (
            <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)} 
                className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <tab.icon size={16} /><span>{tab.label}</span>
            </button>
          ))}
          <button onClick={() => setIsMigoOpen(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center space-x-2 shadow-xl hover:bg-blue-600 transition-all whitespace-nowrap">
            <Truck size={16} /><span>GRN (Stock In)</span>
          </button>
        </div>
      </div>

      {activeTab === 'overview' && (
        company === 'Nippon' ? (
            <StockOverview 
                items={items}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
            />
        ) : (
            <StockOverview 
                items={items}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
            />
        )
      )}

      {activeTab === 'master' && (
          <div className="animate-in fade-in duration-300">
              <ProductMaster />
          </div>
      )}

      {activeTab === 'issuance' && (
              <GoodsIssue 
                items={items}
                costCenters={costCenters}
                projects={projects}
                ledger={ledger}
                refreshData={refreshSync}
              />
      )}

      {activeTab === 'opening' && (
        <div className="animate-in fade-in duration-300">
          <OpeningBalance refreshData={refreshSync} />
        </div>
      )}

      {activeTab === 'remnants' && (
        <div className="animate-in fade-in duration-300">
          <RemnantManager />
        </div>
      )}

      {activeTab === 'consumption' && (
        <div className="animate-in fade-in duration-300">
          <ProjectConsumption />
        </div>
      )}

      {activeTab === 'tools' && (
        <div className="animate-in fade-in duration-300">
          <ToolRegister />
        </div>
      )}

      {activeTab === 'advances' && (
        <div className="animate-in fade-in duration-300">
          <AdvanceTracker />
        </div>
      )}

      {activeTab === 'grnRegister' && (
        <div className="animate-in fade-in duration-300">
          <GRNRegister />
        </div>
      )}

      {activeTab === 'weightMaster' && (
        <div className="animate-in fade-in duration-300">
          <WeightMaster />
        </div>
      )}

      {isAluminiumCompany ? (
          <GTKStoreReceipt
            isOpen={isMigoOpen}
            onClose={() => setIsMigoOpen(false)}
            refreshData={refreshSync}
          />
      ) : company === 'Nippon' ? (
          <NipponGoodsReceipt
            isOpen={isMigoOpen}
            onClose={() => setIsMigoOpen(false)}
            refreshData={refreshSync}
          />
      ) : (
          <GoodsReceiptMIGO 
            products={products}
            isOpen={isMigoOpen}
            onClose={() => setIsMigoOpen(false)}
            refreshData={refreshSync}
          />
      )}
    </div>
  );
};

export default React.memo(InventoryModule);
