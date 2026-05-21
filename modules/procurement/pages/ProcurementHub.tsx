import React, { useState, useMemo } from 'react';
import { Package, Warehouse, Truck, Handshake, Globe, ClipboardList } from 'lucide-react';
import { useAppStore } from '@/modules/shared/store/appStore';

// Lazy load all sub-modules
const Requisitions   = React.lazy(() => import('./Requisitions'));
const InventoryModule = React.lazy(() => import('./InventoryModule'));
const LogisticsModule = React.lazy(() => import('./LogisticsModule'));
const VendorHub       = React.lazy(() => import('./VendorHub'));
const IntercompanyHub = React.lazy(() => import('@/modules/shared/pages/IntercompanyHub'));
import SCMDashboard from '@/modules/procurement/components/SCMDashboard';

type ProcTab = 'requisitions' | 'stock' | 'logistics' | 'vendors' | 'supplychain' | 'scm';

const css = `
  .ph-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    margin: -24px;
  }
  .ph-nav {
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    padding: 0 20px;
    display: flex;
    align-items: stretch;
    gap: 2px;
    position: sticky;
    top: 0;
    z-index: 30;
    box-shadow: 0 1px 3px rgba(0,0,0,.06);
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .ph-nav::-webkit-scrollbar { display: none; }
  .ph-tab {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 13px 18px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: #64748b;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    white-space: nowrap;
    transition: color .15s, border-color .15s, background .15s;
    font-family: inherit;
  }
  .ph-tab:hover { color: #1e293b; background: #f8fafc; }
  .ph-tab.active { color: #b45000; border-bottom-color: #b45000; background: #fff7ed; }
  .ph-body {
    flex: 1;
    overflow-y: auto;
    background: #f8fafc;
  }
`;

// Master tab list (filtered per-company below in the component)
const ALL_TABS: { id: ProcTab; label: string; icon: React.ReactNode }[] = [
  { id: 'requisitions', label: 'Requisitions',   icon: <ClipboardList size={14}/> },
  { id: 'stock',        label: 'Stock / Material', icon: <Warehouse size={14}/> },
  { id: 'logistics',    label: 'Logistics',       icon: <Truck size={14}/> },
  { id: 'vendors',      label: 'Vendors',         icon: <Handshake size={14}/> },
  { id: 'supplychain',  label: 'Supply Chain',    icon: <Globe size={14}/> },
  { id: 'scm',          label: 'SCM Dashboard',   icon: <Package size={14}/> },
];

const ProcurementHub: React.FC = () => {
  const [active, setActive] = useState<ProcTab>('requisitions');
  const company = useAppStore(state => state.selectedCompany);

  // God Mode audit (Day 1): hide tabs that have no business meaning for the
  // active company. Nippon is a hardware trader — no factory logistics
  // (gate passes, vehicle trips, dispatch planner) and the SCMDashboard
  // is glass-factory analytics; the IntercompanyHub stays because Nippon
  // legitimately sells to GTK/GTI (intercompany transfers).
  const TABS = useMemo(() => {
    return ALL_TABS.filter(t => {
      if (company === 'Nippon') {
        // Hide: logistics (factory-only), scm (glass-only analytics)
        if (t.id === 'logistics' || t.id === 'scm') return false;
      }
      return true;
    });
  }, [company]);

  // If the active tab got hidden after a company switch, reset to first visible
  React.useEffect(() => {
    if (!TABS.find(t => t.id === active)) {
      setActive(TABS[0]?.id ?? 'requisitions');
    }
  }, [TABS, active]);

  return (
    <div className="ph-wrap">
      <style>{css}</style>

      <nav className="ph-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`ph-tab${active === t.id ? ' active' : ''}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      <div className="ph-body">
        <React.Suspense fallback={
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'200px', color:'#94a3b8', fontSize:'13px' }}>
            Loading...
          </div>
        }>
          {active === 'requisitions' && <Requisitions />}
          {active === 'stock'        && <InventoryModule />}
          {active === 'logistics'    && <LogisticsModule />}
          {active === 'vendors'      && <VendorHub />}
          {active === 'supplychain'  && <IntercompanyHub />}
          {active === 'scm'          && <SCMDashboard />}
        </React.Suspense>
      </div>
    </div>
  );
};

export default ProcurementHub;
