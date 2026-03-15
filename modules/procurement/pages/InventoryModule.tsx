
import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
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

const InventoryModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [activeTab, setActiveTab] = useState<'overview' | 'master' | 'issuance' | 'migo' | 'quality'>('overview');
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

  const tabs = [
    { id: 'overview', label: 'Stock Balances', icon: LayoutGrid },
    { id: 'master', label: 'Material Master', icon: Database },
    { id: 'issuance', label: 'Goods Issue', icon: ArrowUpRight },
    { id: 'quality', label: 'Quality Hub', icon: ShieldCheck }
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
            <NipponStockOverview 
                items={items}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
            />
        ) : (
            <GlasscoStockOverview 
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
          company === 'Nippon' ? (
              <NipponGoodsIssue 
                items={items}
                costCenters={costCenters}
                projects={projects}
                ledger={ledger}
                refreshData={refreshSync}
              />
          ) : (
              <GlasscoGoodsIssue 
                items={items}
                costCenters={costCenters}
                projects={projects}
                ledger={ledger}
                refreshData={refreshSync}
              />
          )
      )}

      {company === 'Nippon' ? (
          <NipponGoodsReceipt
            isOpen={isMigoOpen}
            onClose={() => setIsMigoOpen(false)}
            refreshData={refreshSync}
          />
      ) : (
          <GlasscoGoodsReceiptMIGO 
            products={products}
            isOpen={isMigoOpen}
            onClose={() => setIsMigoOpen(false)}
            refreshData={refreshSync}
          />
      )}
    </div>
  );
};

export default InventoryModule;
