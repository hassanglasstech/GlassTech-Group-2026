import React, { useState, useRef, useEffect } from 'react';
import { ProductionProvider } from '@/modules/production/components/ProductionContext';
import { 
  Scissors, Truck, ShieldCheck, Flame, BarChart3, AlertTriangle, 
  Zap, Users, Upload, Award, TrendingUp, LayoutGrid, Brain,
  Building2, ChevronDown
} from 'lucide-react';
import NCRModule from './components/ncr/NCRModule';
import GeneratorLogModule from '@/modules/production/components/GeneratorLog';
import LabourLogModule from '@/modules/production/components/LabourLog';
import DataImportTool from '@/modules/production/components/DataImportTool';
import CutterDashboard from '@/modules/production/components/CutterDashboard';
import FinancialIntelligenceHub from '@/modules/finance/components/FinancialIntelligenceHub';
import ProductionFloorPlanner from './components/ProductionFloorPlanner';
import CuttingIntelligenceHub from './components/CuttingIntelligenceHub';
import AIFloorPlanAdvisor from '@/modules/production/components/AIFloorPlanAdvisor';
import CrossCompanyStatusBoard from '@/modules/production/components/CrossCompanyStatusBoard';
import FabricationView from './components/views/FabricationView'; 
import ProcessingView from './components/views/ProcessingView';
import DispatchView from './components/views/DispatchView';
import DashboardView from './components/views/DashboardView';

type ActiveView = 
  'dashboard' | 'floorplan' | 'cutting' | 'ai_plan' | 'cross_company' |
  'fabrication' | 'processing' | 'dispatch' | 'ncr' | 'energy' | 
  'labour' | 'import' | 'performance' | 'finance';

// ── Primary tabs — daily workflow ─────────────────────────────────────
const PRIMARY_TABS: { id: ActiveView; label: string; icon: React.ReactNode }[] = [
  { id: 'fabrication', label: 'Fabrication',   icon: <Scissors size={14}/> },
  { id: 'processing',  label: 'Processing',    icon: <Flame size={14}/> },
  { id: 'dispatch',    label: 'QC & Dispatch', icon: <ShieldCheck size={14}/> },
  { id: 'ncr',         label: 'NCR',           icon: <AlertTriangle size={14}/> },
  { id: 'dashboard',   label: 'Dashboard',     icon: <BarChart3 size={14}/> },
];

// ── More tabs — management / planning ────────────────────────────────
const MORE_TABS: { id: ActiveView; label: string; icon: React.ReactNode; group: string }[] = [
  { id: 'floorplan',     label: 'Floor Planner',    icon: <LayoutGrid size={14}/>,  group: 'Planning' },
  { id: 'ai_plan',       label: 'AI Plan',           icon: <Zap size={14}/>,         group: 'Planning' },
  { id: 'cutting',       label: 'Cutting Intel',     icon: <Brain size={14}/>,       group: 'Planning' },
  { id: 'cross_company', label: 'GTK / GTI Orders',  icon: <Building2 size={14}/>,   group: 'Planning' },
  { id: 'performance',   label: 'Cutter Performance',icon: <Award size={14}/>,       group: 'Management' },
  { id: 'energy',        label: 'Energy / Generator',icon: <Zap size={14}/>,         group: 'Management' },
  { id: 'labour',        label: 'Labour Log',        icon: <Users size={14}/>,       group: 'Management' },
  { id: 'finance',       label: 'Finance Intel',     icon: <TrendingUp size={14}/>,  group: 'Management' },
  { id: 'import',        label: 'Data Import',       icon: <Upload size={14}/>,      group: 'Management' },
];

const styles = `
  .pp-nav {
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    padding: 0 16px;
    display: flex;
    align-items: stretch;
    gap: 2px;
    position: sticky;
    top: 0;
    z-index: 20;
    box-shadow: 0 1px 3px rgba(0,0,0,.06);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .pp-nav::-webkit-scrollbar { display: none; }

  .pp-tab {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 12px 16px;
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
  .pp-tab:hover {
    color: #1e293b;
    background: #f8fafc;
  }
  .pp-tab.active {
    color: #1e40af;
    border-bottom-color: #2563eb;
    background: #eff6ff;
  }
  .pp-tab.active-more {
    color: #6d28d9;
    border-bottom-color: #7c3aed;
    background: #f5f3ff;
  }

  /* More dropdown */
  .pp-more-wrap {
    position: relative;
    display: flex;
    align-items: stretch;
    margin-left: auto;
    flex-shrink: 0;
  }
  .pp-more-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: #94a3b8;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    border-left: 1px solid #e2e8f0;
    cursor: pointer;
    white-space: nowrap;
    transition: all .15s;
    font-family: inherit;
  }
  .pp-more-btn:hover { color: #475569; background: #f8fafc; }
  .pp-more-btn.open { color: #6d28d9; background: #f5f3ff; border-bottom-color: #7c3aed; }

  .pp-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,.12);
    min-width: 220px;
    z-index: 100;
    overflow: hidden;
    animation: ddFadeIn .12s ease;
  }
  @keyframes ddFadeIn {
    from { opacity:0; transform: translateY(-4px); }
    to   { opacity:1; transform: translateY(0); }
  }

  .pp-dd-group {
    padding: 6px 0;
    border-bottom: 1px solid #f1f5f9;
  }
  .pp-dd-group:last-child { border-bottom: none; }

  .pp-dd-group-label {
    padding: 6px 14px 4px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .pp-dd-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    font-size: 12px;
    font-weight: 600;
    color: #374151;
    background: none;
    border: none;
    width: 100%;
    text-align: left;
    cursor: pointer;
    transition: background .12s, color .12s;
    font-family: inherit;
  }
  .pp-dd-item:hover { background: #f8fafc; color: #111827; }
  .pp-dd-item.active { background: #f5f3ff; color: #6d28d9; }
  .pp-dd-item svg { opacity: .6; flex-shrink: 0; }
  .pp-dd-item.active svg { opacity: 1; }

  .pp-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    background: #f8fafc;
  }
  .pp-body-inner { max-width: 1600px; margin: 0 auto; }
`;

const GlasscoProductionContent: React.FC = () => {
  const [activeView, setActiveView] = useState<ActiveView>('fabrication');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isMoreActive = MORE_TABS.some(t => t.id === activeView);

  const selectView = (id: ActiveView) => {
    setActiveView(id);
    setMoreOpen(false);
  };

  // Group more tabs
  const groups = Array.from(new Set(MORE_TABS.map(t => t.group)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', margin: '-24px' }}>
      <style>{styles}</style>

      {/* ── Navigation ── */}
      <nav className="pp-nav">

        {/* Primary tabs */}
        {PRIMARY_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => selectView(tab.id)}
            className={`pp-tab${activeView === tab.id ? ' active' : ''}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}

        {/* More dropdown */}
        <div className="pp-more-wrap" ref={moreRef}>
          <button
            className={`pp-more-btn${moreOpen ? ' open' : ''}${isMoreActive && !moreOpen ? ' active-more' : ''}`}
            onClick={() => setMoreOpen(o => !o)}
          >
            {isMoreActive && !moreOpen
              ? MORE_TABS.find(t => t.id === activeView)?.label
              : 'More'}
            <ChevronDown size={12} style={{ transform: moreOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}/>
          </button>

          {moreOpen && (
            <div className="pp-dropdown">
              {groups.map(group => (
                <div key={group} className="pp-dd-group">
                  <div className="pp-dd-group-label">{group}</div>
                  {MORE_TABS.filter(t => t.group === group).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => selectView(tab.id)}
                      className={`pp-dd-item${activeView === tab.id ? ' active' : ''}`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* ── Content ── */}
      <div className="pp-body">
        <div className="pp-body-inner">
          {activeView === 'fabrication'   && <FabricationView />}
          {activeView === 'processing'    && <ProcessingView />}
          {activeView === 'dispatch'      && <DispatchView />}
          {activeView === 'ncr'           && <NCRModule />}
          {activeView === 'dashboard'     && <DashboardView />}
          {activeView === 'floorplan'     && <ProductionFloorPlanner />}
          {activeView === 'ai_plan'       && <AIFloorPlanAdvisor />}
          {activeView === 'cutting'       && <CuttingIntelligenceHub />}
          {activeView === 'cross_company' && <CrossCompanyStatusBoard />}
          {activeView === 'performance'   && <CutterDashboard />}
          {activeView === 'energy'        && <GeneratorLogModule />}
          {activeView === 'labour'        && <LabourLogModule />}
          {activeView === 'finance'       && <FinancialIntelligenceHub />}
          {activeView === 'import'        && <DataImportTool />}
        </div>
      </div>
    </div>
  );
};

const GlasscoProduction: React.FC = () => (
  <ProductionProvider company="Glassco">
    <GlasscoProductionContent />
  </ProductionProvider>
);

export default GlasscoProduction;
