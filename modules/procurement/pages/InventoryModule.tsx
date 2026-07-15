
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
import GoodsReceiptMIGOWizard from '@/modules/procurement/components/inventory/GoodsReceiptMIGOWizard';   // Sprint 23
import RemnantManager from '@/modules/procurement/components/inventory/RemnantManager';

import NipponGoodsReceipt from '@/modules/procurement/components/inventory/NipponGoodsReceipt';
import GTKStoreReceipt from '@/modules/procurement/components/inventory/GTKStoreReceipt';
import ProjectConsumption from '@/modules/procurement/components/inventory/ProjectConsumption';
import ToolRegister from '@/modules/procurement/components/inventory/ToolRegister';
import AdvanceTracker from '@/modules/procurement/components/inventory/AdvanceTracker';
import OpeningBalance from '@/modules/procurement/components/inventory/OpeningBalance';
import GRNRegister from '@/modules/procurement/components/inventory/GRNRegister';
import WeightMaster from '@/modules/procurement/components/inventory/WeightMaster';
import PurchaseReturnModule from '@/modules/procurement/components/inventory/PurchaseReturnModule';
import GlasscoMRP from '@/modules/procurement/components/inventory/GlasscoMRP';
import { 
  LayoutGrid, ArrowUpRight, Truck, Database, Loader2, Layers, BarChart3, Wrench, Banknote, PackageOpen, ClipboardList, Scale, TrendingDown, Plus
} from 'lucide-react';

// ── Sprint 24: 13 sub-tabs → 5 logical groups ─────────────────────────
type SubTabId =
  | 'overview' | 'master' | 'issuance' | 'migo' | 'remnants' | 'consumption'
  | 'tools' | 'advances' | 'opening' | 'grnRegister' | 'weightMaster'
  | 'mrp' | 'purchase_return';

type MainTabId = 'stock' | 'master' | 'movements' | 'grn' | 'planning';

/** Sub-tab → main group mapping. Drives both the default sub-tab when a
 *  group is opened and the back-compat redirect from old links. */
const SUB_TO_MAIN: Record<SubTabId, MainTabId> = {
  overview:        'stock',
  opening:         'stock',     // Opening Balance is a stock-side transaction
  tools:           'stock',
  advances:        'stock',
  remnants:        'stock',
  master:          'master',
  weightMaster:    'master',
  issuance:        'movements',
  consumption:     'movements',
  purchase_return: 'movements',
  grnRegister:     'grn',
  migo:            'grn',
  mrp:             'planning',
};

const MAIN_DEFAULT_SUB: Record<MainTabId, SubTabId> = {
  stock:     'overview',
  master:    'master',
  movements: 'issuance',
  grn:       'grnRegister',
  planning:  'mrp',
};

const InventoryModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);

  // Sprint 24: read deep-link from URL hash (?invtab=xxx) for shareable views
  const initialSub: SubTabId = (() => {
    const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    const t = q.get('invtab') as SubTabId | null;
    return t && t in SUB_TO_MAIN ? t : 'overview';
  })();
  const [activeTab, setActiveTab] = useState<SubTabId>(initialSub);

  // Nippon-only: Purchase Return belongs under the GRN group (a return reverses a
  // GRN). For Nippon that empties the Movements group (which held only Purchase
  // Return), so it drops out below. Glassco/GTK mapping is untouched.
  const subToMain = (sub: SubTabId): MainTabId =>
    (company === 'Nippon' && sub === 'purchase_return') ? 'grn' : SUB_TO_MAIN[sub];
  const activeMain: MainTabId = subToMain(activeTab);

  // When user clicks a main group, jump to its default sub-tab (unless
  // the current sub-tab is already inside that group)
  const switchMain = (m: MainTabId) => {
    if (subToMain(activeTab) === m) return;
    // Nippon: the GRN group's default is the register; other companies unchanged.
    setActiveTab(MAIN_DEFAULT_SUB[m]);
  };
  const [isLoading, setIsLoading] = useState(true);
  
  const [items, setItems] = useState<StoreItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]); 
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ledger, setLedger] = useState<MaterialLedgerEntry[]>([]);
  const [handlingUnits, setHUs] = useState<HandlingUnit[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMigoOpen, setIsMigoOpen] = useState(false);
  // Glassco store-purchase MIGO. Glassco's
  // existing GoodsReceiptMIGO is glass-only (filters PO category='Glass')
  // and does NOT call FinanceService.settleAdvance — so local-purchase
  // requisitions (Maintenance, Tool Purchase, Consumables, etc.) had no
  // path to clear their Employee Advances PV after the actual bill came
  // in. GTKStoreReceipt already supports linkedReqId + settleAdvance.
  // Expose it as a second button for non-aluminium companies.
  const [isStoreMigoOpen, setIsStoreMigoOpen] = useState(false);

  useEffect(() => {
    const refreshData = async () => {
        setIsLoading(true);
        const storeItems = await InventoryService.getStoreAsync();
        setItems(storeItems.filter(i => i.company === company));
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
      InventoryService.getStoreAsync().then(items => setItems(items.filter(i => i.company === company)));
      // Load full IDB data after render
      setTimeout(() => InventoryService.getStockLedgerAsync().then(all => {
          setLedger(all.filter(l => l.company === company).sort((a,b) => b.timestamp.localeCompare(a.timestamp)));
      }), 100);
  };

  const isGlassCompany = company === 'Glassco';
  const isNippon = company === 'Nippon';
  const isAluminiumCompany = company === 'GTK' || company === 'GTI';

  // ── Sprint 24: 5 main groups (Stock / Master / Movements / GRN / Planning) ──
  // Sub-tab visibility — three audiences:
  //   isAluminiumCompany (GTK/GTI): Tool Register + Cash Advances
  //   isGlassCompany    (Glassco):  everything non-aluminium PLUS MRP +
  //                                 glass-specific Remnants, Weight Master,
  //                                 and Project Consumption
  //   isNippon          (trading):  cleaner cut — no production / glass-cutting
  //                                 leftovers, so Remnants, Weight Master, and
  //                                 Project Consumption are hidden. KIN LONG
  //                                 hardware doesn't have remnants or weight-
  //                                 per-sqft accounting.
  // Sub-tab list — gates by company type.
  // Nippon (trading) gets a CLEANER cut than Glassco/GTK:
  //   • No "Goods Issue" — trading sales auto-decrement stock on delivery.
  //     There's no production-floor issue flow to model.
  //   • Opening Balance moved to the Stock group (it's a stock-side action,
  //     not master data).
  //   • No Tool Register / Cash Advances / Remnants / Weight Master / MRP.
  const subTabs = [
    { id: 'overview',        label: 'Stock Balances',     icon: LayoutGrid },
    { id: 'master',          label: 'Material Master',    icon: Database },
    { id: 'opening',         label: 'Opening Balance',    icon: PackageOpen },
    // Goods Issue — Nippon (trading) doesn't need a manual issue flow.
    ...(!isNippon          ? [{ id: 'issuance',        label: 'Goods Issue',        icon: ArrowUpRight }] : []),
    ...(isGlassCompany      ? [{ id: 'consumption',  label: 'Project Consumption', icon: BarChart3 }] : []),
    ...(isAluminiumCompany  ? [{ id: 'tools',        label: 'Tool Register',       icon: Wrench       }] : []),
    ...(isAluminiumCompany  ? [{ id: 'advances',     label: 'Cash Advances',       icon: Banknote     }] : []),
    ...(isGlassCompany      ? [{ id: 'remnants',     label: 'Remnants',            icon: Layers       }] : []),
    ...(!isAluminiumCompany ? [{ id: 'grnRegister',  label: 'GRN Register',        icon: ClipboardList}] : []),
    ...(isGlassCompany      ? [{ id: 'weightMaster', label: 'Weight Master',       icon: Scale        }] : []),
    ...(isGlassCompany      ? [{ id: 'mrp',          label: 'MRP',                 icon: TrendingDown }] : []),
    ...(!isAluminiumCompany ? [{ id: 'purchase_return', label: 'Purchase Return',  icon: ArrowUpRight }] : []),
  ];

  // Filter sub-tabs to those in the active main group
  const visibleSubTabs = subTabs.filter(t => subToMain(t.id as SubTabId) === activeMain);

  // Main groups — only shown if at least one of their sub-tabs is visible
  // for the current company (planning is glass-only via the MRP gate above;
  // Movements drops out for Nippon once Purchase Return moves under GRN).
  const mainGroups: Array<{ id: MainTabId; label: string; icon: React.ElementType }> = [
    { id: 'stock',     label: 'Stock',     icon: LayoutGrid },
    { id: 'master',    label: 'Master',    icon: Database },
    { id: 'movements', label: 'Movements', icon: ArrowUpRight },
    { id: 'grn',       label: 'GRN',       icon: Truck },
    ...(isGlassCompany ? [{ id: 'planning' as MainTabId, label: 'Planning', icon: TrendingDown }] : []),
  ];
  const mainsWithTabs = new Set(subTabs.map(t => subToMain(t.id as SubTabId)));
  const visibleMainGroups = mainGroups.filter(g => mainsWithTabs.has(g.id));

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
      {/* Sprint 24: 2-tier navigation
          Top tier — 5 main groups (Stock / Master / Movements / GRN / Planning)
          Bottom tier — sub-tabs visible only for the active main group
          Action buttons (GRN / Local Purchase) sit in the top tier alongside */}
      <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm no-print">
        <div className="sap-scroll-container">
          {visibleMainGroups.map(g => (
            <button
              key={g.id}
              onClick={() => switchMain(g.id)}
              className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${activeMain === g.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <g.icon size={16}/><span>{g.label}</span>
            </button>
          ))}

          {/* Action buttons — promoted to top tier alongside main groups.
              Label and second-button visibility depend on the company:
                - GTK / GTI: "GRN (Stock In)" + Local Purchase GRN (aluminium flow)
                - Glassco:   "Glass GRN" + Local Purchase GRN (mixed glass-cutting + local)
                - Nippon:    "Hardware GRN" only — NipponGoodsReceipt already
                             handles both incoming KIN LONG shipments and any
                             local purchases. The Local Purchase button is
                             redundant + uses an aluminium-flow component. */}
          <button onClick={() => setIsMigoOpen(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center space-x-2 shadow-xl hover:bg-blue-600 transition-all whitespace-nowrap">
            <Plus size={16} /><span>{isAluminiumCompany ? 'New GRN (Stock In)' : isNippon ? 'New Hardware GRN' : 'New Glass GRN'}</span>
          </button>
          {isGlassCompany && (
            <button onClick={() => setIsStoreMigoOpen(true)} className="bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center space-x-2 shadow-xl hover:bg-emerald-800 transition-all whitespace-nowrap">
              <PackageOpen size={16} /><span>Local Purchase GRN</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-tab strip — only render if the current main group has more than 1 sub-tab */}
      {visibleSubTabs.length > 1 && (
        <div className="bg-slate-50 px-2 py-1 rounded-xl border border-slate-200 no-print -mt-3">
          <div className="sap-scroll-container">
            {visibleSubTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as SubTabId)}
                className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg font-bold text-[11px] transition-all whitespace-nowrap ${activeTab === t.id ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <t.icon size={12}/><span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* God Mode audit (Phase 2): removed dead-code ternary that rendered
          the SAME StockOverview in both branches. Component now reads
          company internally for branded column logic. */}
      {activeTab === 'overview' && (
        <StockOverview
          items={items}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onStockUpdate={refreshSync}
        />
      )}

      {activeTab === 'master' && (
          <div className="animate-in fade-in duration-300">
              <ProductMaster />
          </div>
      )}

      {activeTab === 'issuance' && !isNippon && (
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

      {activeTab === 'remnants' && isGlassCompany && (
        <div className="animate-in fade-in duration-300">
          <RemnantManager />
        </div>
      )}

      {activeTab === 'consumption' && isGlassCompany && (
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

      {activeTab === 'purchase_return' && (
        <PurchaseReturnModule company={company} />
      )}

      {activeTab === 'mrp' && isGlassCompany && (
        <GlasscoMRP />
      )}
      {activeTab === 'weightMaster' && isGlassCompany && (
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
      ) : (() => {
          // Sprint 23: opt-out via ?migo=v1 (legacy). Default = new 3-step wizard.
          const useLegacy = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('migo') === 'v1';
          const Migo = useLegacy ? GoodsReceiptMIGO : GoodsReceiptMIGOWizard;
          return (
            <Migo
              products={products}
              isOpen={isMigoOpen}
              onClose={() => setIsMigoOpen(false)}
              refreshData={refreshSync}
            />
          );
      })()}
      {/* P6-1: Local Purchase GRN — Glassco only. Nippon's NipponGoodsReceipt
          handles its full incoming flow so the second button is hidden for
          Nippon (mounting GTKStoreReceipt here would be dead UI). */}
      {isGlassCompany && (
        <GTKStoreReceipt
          isOpen={isStoreMigoOpen}
          onClose={() => setIsStoreMigoOpen(false)}
          refreshData={refreshSync}
        />
      )}
    </div>
  );
};

export default React.memo(InventoryModule);
