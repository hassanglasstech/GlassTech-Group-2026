import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { StoreItem } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import ProductMaster from '@/modules/sales/pages/ProductMaster';
import StockOverview from '@/modules/procurement/components/inventory/StockOverview';
import NipponGoodsReceipt from '@/modules/procurement/components/inventory/NipponGoodsReceipt';
import OpeningBalance from '@/modules/procurement/components/inventory/OpeningBalance';
import GRNRegister from '@/modules/procurement/components/inventory/GRNRegister';
import PurchaseReturnModule from '@/modules/procurement/components/inventory/PurchaseReturnModule';
import {
  LayoutGrid, ArrowUpRight, Truck, Database, Loader2, PackageOpen, ClipboardList
} from 'lucide-react';

// ── Nippon-only Material Management ───────────────────────────────────
// Trading company: no production-floor goods issue, no glass remnants /
// weight master / MRP, no aluminium tool register. Clean 4-group layout.
type SubTabId  = 'overview' | 'master' | 'opening' | 'grnRegister' | 'purchase_return';
type MainTabId = 'stock' | 'master' | 'movements' | 'grn';

const SUB_TO_MAIN: Record<SubTabId, MainTabId> = {
  overview:        'stock',
  opening:         'stock',
  master:          'master',
  purchase_return: 'movements',
  grnRegister:     'grn',
};

const MAIN_DEFAULT_SUB: Record<MainTabId, SubTabId> = {
  stock:     'overview',
  master:    'master',
  movements: 'purchase_return',
  grn:       'grnRegister',
};

const InventoryModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);

  // Deep-link from URL hash (?invtab=xxx) for shareable views
  const initialSub: SubTabId = (() => {
    const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    const t = q.get('invtab') as SubTabId | null;
    return t && t in SUB_TO_MAIN ? t : 'overview';
  })();
  const [activeTab, setActiveTab] = useState<SubTabId>(initialSub);
  const activeMain: MainTabId = SUB_TO_MAIN[activeTab];

  const switchMain = (m: MainTabId) => {
    if (SUB_TO_MAIN[activeTab] === m) return;
    setActiveTab(MAIN_DEFAULT_SUB[m]);
  };

  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMigoOpen, setIsMigoOpen] = useState(false);

  useEffect(() => {
    const refreshData = async () => {
      setIsLoading(true);
      const storeItems = await InventoryService.getStoreAsync();
      setItems(storeItems.filter(i => i.company === company));
      setIsLoading(false);
    };
    refreshData();
  }, [company, activeTab]);

  const refreshSync = () => {
    InventoryService.getStoreAsync().then(list => setItems(list.filter(i => i.company === company)));
  };

  const subTabs: Array<{ id: SubTabId; label: string; icon: React.ElementType }> = [
    { id: 'overview',        label: 'Stock Balances',  icon: LayoutGrid },
    { id: 'master',          label: 'Material Master', icon: Database },
    { id: 'opening',         label: 'Opening Balance', icon: PackageOpen },
    { id: 'grnRegister',     label: 'GRN Register',    icon: ClipboardList },
    { id: 'purchase_return', label: 'Purchase Return', icon: ArrowUpRight },
  ];
  const visibleSubTabs = subTabs.filter(t => SUB_TO_MAIN[t.id] === activeMain);

  const mainGroups: Array<{ id: MainTabId; label: string; icon: React.ElementType }> = [
    { id: 'stock',     label: 'Stock',     icon: LayoutGrid },
    { id: 'master',    label: 'Master',    icon: Database },
    { id: 'movements', label: 'Movements', icon: ArrowUpRight },
    { id: 'grn',       label: 'GRN',       icon: Truck },
  ];

  // Reflect activeTab → URL ?invtab= for shareable links
  useEffect(() => {
    const url = new URL(window.location.href);
    const hashParts = window.location.hash.split('?');
    const params = new URLSearchParams(hashParts[1] ?? '');
    if (activeTab === 'overview') params.delete('invtab');
    else                          params.set('invtab', activeTab);
    const search = params.toString();
    const newHash = search ? `${hashParts[0]}?${search}` : hashParts[0];
    if (newHash !== window.location.hash) {
      window.history.replaceState(null, '', `${url.pathname}${newHash}`);
    }
  }, [activeTab]);

  if (isLoading) return <div className="h-full flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Loading Inventory Data...</div>;

  return (
    <div className="space-y-6">
      {/* Top tier — main groups + Hardware GRN action */}
      <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm no-print">
        <div className="sap-scroll-container">
          {mainGroups.map(g => (
            <button
              key={g.id}
              onClick={() => switchMain(g.id)}
              className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${activeMain === g.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <g.icon size={16}/><span>{g.label}</span>
            </button>
          ))}
          <button onClick={() => setIsMigoOpen(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center space-x-2 shadow-xl hover:bg-blue-600 transition-all whitespace-nowrap">
            <Truck size={16} /><span>Hardware GRN</span>
          </button>
        </div>
      </div>

      {/* Sub-tab strip */}
      {visibleSubTabs.length > 1 && (
        <div className="bg-slate-50 px-2 py-1 rounded-xl border border-slate-200 no-print -mt-3">
          <div className="sap-scroll-container">
            {visibleSubTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg font-bold text-[11px] transition-all whitespace-nowrap ${activeTab === t.id ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <t.icon size={12}/><span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'overview' && (
        <StockOverview items={items} searchTerm={searchTerm} setSearchTerm={setSearchTerm} onStockUpdate={refreshSync} />
      )}

      {activeTab === 'master' && (
        <div className="animate-in fade-in duration-300"><ProductMaster /></div>
      )}

      {activeTab === 'opening' && (
        <div className="animate-in fade-in duration-300"><OpeningBalance refreshData={refreshSync} /></div>
      )}

      {activeTab === 'grnRegister' && (
        <div className="animate-in fade-in duration-300"><GRNRegister /></div>
      )}

      {activeTab === 'purchase_return' && (
        <PurchaseReturnModule company={company} />
      )}

      <NipponGoodsReceipt
        isOpen={isMigoOpen}
        onClose={() => setIsMigoOpen(false)}
        refreshData={refreshSync}
      />
    </div>
  );
};

export default React.memo(InventoryModule);
