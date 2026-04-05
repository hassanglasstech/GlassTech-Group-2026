import React, { useState, useEffect } from 'react';
import {
  Sun,
  Factory, ShoppingBag, Wrench, Users, Truck, Building2,
  Plus, Clock, AlertTriangle, CheckCircle2, Circle, Loader2,
  ChevronRight, Bell, FileText, Home, Wrench as WrenchIcon, ShieldCheck, CheckSquare, Send, Handshake, Zap, LayoutGrid, BarChart2, Scissors, BarChart3, DollarSign, Calculator, Landmark, Brain, Sparkles, MessageCircle, Inbox
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';
import FactoryEventForm from '../components/incharge/FactoryEventForm';
import ReqClosureTracker from '../components/incharge/ReqClosureTracker';
import FactoryDailySummary from '../components/incharge/FactoryDailySummary';
import EscalationAlerts from '../components/incharge/EscalationAlerts';
import AssetRegister from '../components/incharge/AssetRegister';
import HSEModule from '../components/incharge/HSEModule';
import DailyReportViewer from '../components/incharge/DailyReportViewer';
import AgentWatchlist from '../components/agent/AgentWatchlist';
import TaskManager from '../components/agent/TaskManager';
import TelegramSetup from '../components/agent/TelegramSetup';
import VendorSLAMaster from '../components/agent/VendorSLAMaster';
import GapDetection from '../components/agent/GapDetection';
import FactoryVisualBoard from '../components/production/FactoryVisualBoard';
import AnimatedOrderFlow from '../components/production/AnimatedOrderFlow';
import FloorPlannerUpgrade from '../components/production/FloorPlannerUpgrade';
import VehicleLoadOptimizer from '../components/production/VehicleLoadOptimizer';
import CuttingSequencePlanner from '../components/production/CuttingSequencePlanner';
import WorkerKPIDashboard from '../components/production/WorkerKPIDashboard';
import MISDashboard from '../components/mis/MISDashboard';
import JobPL from '../components/mis/JobPL';
import TrueCostPerSqft from '../components/mis/TrueCostPerSqft';
import VendorIntelligence from '../components/mis/VendorIntelligence';
import DeliveryKPIDashboard from '../components/mis/DeliveryKPIDashboard';
import FinancialStatementsMobile from '../components/mis/FinancialStatementsMobile';
import StrategicMemoryModule from '../components/strategic/StrategicMemoryModule';
import AIChatInterface from '../components/strategic/AIChatInterface';
import MorningBriefingModule from '../components/briefing/MorningBriefingModule';
import PredictiveAlerts from '../components/strategic/PredictiveAlerts';
import ReportNarrativeViewer from '../components/strategic/ReportNarrativeViewer';
import WhatsAppIntegration from '../components/strategic/WhatsAppIntegration';
import InboxIntelligence from '../components/agent/InboxIntelligence';
import AIActivationDashboard from '../components/strategic/AIActivationDashboard';
import { usePWAInstall, useOnlineStatus, usePullToRefresh } from '../hooks/usePWA';

// ── Types ─────────────────────────────────────────────────────────────
export type Sector = 'Production' | 'Store' | 'Maintenance' | 'HR' | 'Logistics' | 'Office';
export type Priority = 'Urgent' | 'Medium' | 'Low';
export type EventStatus = 'Open' | 'Pending' | 'In Progress' | 'Resolved' | 'Closed';

export interface FactoryEvent {
  id: string;
  sector: Sector;
  event_type: string;
  detail: string;
  priority: Priority;
  status: EventStatus;
  logged_by: string;
  created_at: string;
  updated_at: string;
  req_id?: string;        // linked requisition if any
  resolved_at?: string;
  notes?: string;
}

// ── Sector config ─────────────────────────────────────────────────────
const SECTORS: { key: Sector; label: string; icon: React.ElementType; color: string; events: string[] }[] = [
  {
    key: 'Production',
    label: 'Production',
    icon: Factory,
    color: 'blue',
    events: ['Table Issue', 'Cutting Problem', 'QC Rejection', 'Breakage', 'Team Shortage', 'Order Delay', 'Machine Stop', 'Other'],
  },
  {
    key: 'Store',
    label: 'Store / Procurement',
    icon: ShoppingBag,
    color: 'purple',
    events: ['Material Needed', 'Tool Request', 'Stock Low', 'GRN Issue', 'Item Damaged', 'Other'],
  },
  {
    key: 'Maintenance',
    label: 'Maintenance',
    icon: Wrench,
    color: 'orange',
    events: ['Generator Issue', 'Machine Breakdown', 'Repair Needed', 'Preventive Check', 'Downtime Log', 'Other'],
  },
  {
    key: 'HR',
    label: 'HR / Admin',
    icon: Users,
    color: 'green',
    events: ['Absent Worker', 'Overtime Request', 'Incident Report', 'Leave Request', 'Discipline Issue', 'Other'],
  },
  {
    key: 'Logistics',
    label: 'Logistics',
    icon: Truck,
    color: 'cyan',
    events: ['Vehicle Issue', 'Trip Log', 'Diesel Request', 'Dispatch Problem', 'Driver Issue', 'Other'],
  },
  {
    key: 'Office',
    label: 'Office / Utilities',
    icon: Building2,
    color: 'rose',
    events: ['WAPDA Issue', 'Printer Problem', 'AC Issue', 'Supply Needed', 'Visitor Log', 'Other'],
  },
];

const COLOR_MAP: Record<string, string> = {
  blue:   'bg-blue-500/10 text-blue-400 border-blue-500/30',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  green:  'bg-green-500/10 text-green-400 border-green-500/30',
  cyan:   'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  rose:   'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

const PRIORITY_BADGE: Record<Priority, string> = {
  Urgent: 'bg-red-500/20 text-red-400 border border-red-500/30',
  Medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  Low:    'bg-slate-500/20 text-slate-400 border border-slate-500/30',
};

const STATUS_ICON: Record<EventStatus, React.ElementType> = {
  Open:        Circle,
  Pending:     Clock,
  'In Progress': Loader2,
  Resolved:    CheckCircle2,
  Closed:      CheckCircle2,
};

type Group = 'overview' | 'production' | 'mis' | 'ai' | 'management';

type Tab =
  | 'home' | Sector
  | 'tracker' | 'summary'
  | 'assets' | 'hse'
  | 'agent' | 'tasks' | 'telegram' | 'vendors' | 'gaps'
  | 'board' | 'flow' | 'floor' | 'vehicle' | 'cut' | 'workers'
  | 'mis' | 'jobpl' | 'cost' | 'vintel' | 'delivery' | 'finance'
  | 'strategy' | 'ai' | 'ai_activate' | 'briefing' | 'predict' | 'report' | 'whatsapp' | 'inbox'
  | 'fmdash';

// ── Group definitions ──────────────────────────────────────────────────
const GROUPS: {
  id: Group;
  label: string;
  icon: string;
  tabs: { tab: Tab; label: string }[];
}[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: '🏠',
    tabs: [
      { tab: 'home',    label: 'Home'        },
      { tab: 'fmdash',  label: 'FM Dashboard'},
      { tab: 'summary', label: 'Daily Log'   },
      { tab: 'tracker', label: 'Requests'    },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    icon: '🏭',
    tabs: [
      { tab: 'board',   label: 'Visual Board'  },
      { tab: 'flow',    label: 'Order Flow'    },
      { tab: 'floor',   label: 'Floor Planner' },
      { tab: 'vehicle', label: 'Vehicle Opt.'  },
      { tab: 'cut',     label: 'Cut Sequence'  },
      { tab: 'workers', label: 'Worker KPI'    },
      { tab: 'hse',     label: 'HSE'           },
      { tab: 'assets',  label: 'Assets'        },
    ],
  },
  {
    id: 'mis',
    label: 'MIS & Reports',
    icon: '📊',
    tabs: [
      { tab: 'mis',      label: 'MIS Dashboard'   },
      { tab: 'jobpl',    label: 'Job P&L'          },
      { tab: 'cost',     label: 'Cost / Sqft'      },
      { tab: 'vintel',   label: 'Vendor Intel'     },
      { tab: 'delivery', label: 'Delivery KPI'     },
      { tab: 'finance',  label: 'Financials'       },
    ],
  },
  {
    id: 'ai',
    label: 'AI & Alerts',
    icon: '🤖',
    tabs: [
      { tab: 'ai_activate', label: 'AI Status'       },
      { tab: 'briefing',    label: 'Morning Briefing' },
      { tab: 'ai',          label: 'AI Chat'          },
      { tab: 'predict',     label: 'Predictions'      },
      { tab: 'agent',       label: 'Agent Watchlist'  },
      { tab: 'inbox',       label: 'Inbox AI'         },
      { tab: 'gaps',        label: 'Gap Detection'    },
      { tab: 'report',      label: 'AI Report'        },
      { tab: 'whatsapp',    label: 'WhatsApp'         },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    icon: '⚙',
    tabs: [
      { tab: 'tasks',    label: 'Tasks'        },
      { tab: 'vendors',  label: 'Vendor SLA'   },
      { tab: 'strategy', label: 'Strategy'     },
      { tab: 'telegram', label: 'Telegram'     },
    ],
  },
];

// ── Main Component ────────────────────────────────────────────────────
const FactoryInchargeModule: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [activeGroup, setActiveGroup] = useState<Group>('overview');
  const [activeSector, setActiveSector] = useState<Sector | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [events, setEvents] = useState<FactoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [urgentCount, setUrgentCount] = useState(0);

  const { canInstall, install }  = usePWAInstall();
  const online                   = useOnlineStatus();
  const { pullY, refreshing }    = usePullToRefresh(async () => { await loadEvents(); });

  useEffect(() => { loadEvents(); }, []);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('factory_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (!error && data) {
        setEvents(data as FactoryEvent[]);
        setUrgentCount(data.filter(e => e.priority === 'Urgent' && e.status === 'Open').length);
      }
    } catch {
      // silently fallback — table may not exist yet
    }
    setLoading(false);
  };

  const openSector = (sector: Sector) => {
    setActiveSector(sector);
    setActiveTab(sector);
    setShowEventForm(false);
  };

  const sectorEvents = activeSector ? events.filter(e => e.sector === activeSector) : [];
  const todayStr = new Date().toDateString();
  const todayEvents = events.filter(e => new Date(e.created_at).toDateString() === todayStr);

  // ── Home Screen ───────────────────────────────────────────────────
  const HomeScreen = () => (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-white">{todayEvents.length}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Today's Events</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-red-400">{urgentCount}</div>
          <div className="text-[10px] text-red-400 uppercase tracking-widest mt-1">Urgent Open</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-white">
            {events.filter(e => e.status === 'Open' || e.status === 'Pending').length}
          </div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Pending</div>
        </div>
      </div>

      {/* Escalation Alerts */}
      <EscalationAlerts />

      {/* 6 Sector Tiles */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">Select Sector to Log Event</p>
        <div className="grid grid-cols-2 gap-3">
          {SECTORS.map(s => {
            const Icon = s.icon;
            const sCount = events.filter(e => e.sector === s.key && (e.status === 'Open' || e.status === 'Pending')).length;
            return (
              <button
                key={s.key}
                onClick={() => openSector(s.key)}
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all hover:scale-[1.02] ${COLOR_MAP[s.color]}`}
              >
                <Icon size={22} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{s.label}</div>
                  {sCount > 0 && (
                    <div className="text-[10px] mt-0.5 opacity-70">{sCount} open</div>
                  )}
                </div>
                <ChevronRight size={14} className="opacity-50" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent events */}
      {todayEvents.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">Today's Log</p>
          <div className="space-y-2">
            {todayEvents.slice(0, 5).map(ev => {
              const StatusIcon = STATUS_ICON[ev.status];
              return (
                <div key={ev.id} className="bg-slate-800 rounded-xl p-3 flex items-center gap-3">
                  <StatusIcon size={14} className={ev.priority === 'Urgent' ? 'text-red-400' : 'text-slate-400'} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">{ev.event_type}</div>
                    <div className="text-[10px] text-slate-500">{ev.sector} · {ev.detail.slice(0, 40)}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${PRIORITY_BADGE[ev.priority]}`}>
                    {ev.priority}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // ── Sector Screen ─────────────────────────────────────────────────
  const SectorScreen = () => {
    const sConfig = SECTORS.find(s => s.key === activeSector)!;
    const Icon = sConfig.icon;
    return (
      <div className="space-y-4">
        {/* Sector header */}
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${COLOR_MAP[sConfig.color]}`}>
          <Icon size={24} />
          <div>
            <div className="font-black text-lg">{sConfig.label}</div>
            <div className="text-[10px] uppercase tracking-widest opacity-70">
              {sectorEvents.filter(e => e.status === 'Open').length} open events
            </div>
          </div>
          <button
            onClick={() => setShowEventForm(true)}
            className="ml-auto flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-bold transition-all"
          >
            <Plus size={14} /> Log Event
          </button>
        </div>

        {/* Event form */}
        {showEventForm && (
          <FactoryEventForm
            sector={activeSector!}
            eventTypes={sConfig.events}
            loggedBy={user?.name || 'Incharge'}
            onSaved={() => { setShowEventForm(false); loadEvents(); }}
            onCancel={() => setShowEventForm(false)}
          />
        )}

        {/* Sector events list */}
        {sectorEvents.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">No events logged for this sector</div>
        ) : (
          <div className="space-y-2">
            {sectorEvents.map(ev => {
              const StatusIcon = STATUS_ICON[ev.status];
              return (
                <div key={ev.id} className="bg-slate-800 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <StatusIcon size={16} className="mt-0.5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm">{ev.event_type}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${PRIORITY_BADGE[ev.priority]}`}>
                          {ev.priority}
                        </span>
                        <span className="text-[10px] text-slate-500">{ev.status}</span>
                      </div>
                      <p className="text-sm text-slate-400 mt-1">{ev.detail}</p>
                      <div className="text-[10px] text-slate-600 mt-2">
                        {new Date(ev.created_at).toLocaleString('en-PK')} · {ev.logged_by}
                        {ev.req_id && <span className="ml-2 text-blue-400">📋 Req linked</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* Pull-to-refresh indicator */}
      {pullY > 10 && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-2 pointer-events-none">
          <div className="bg-slate-700 rounded-full px-4 py-1.5 text-xs text-slate-300 flex items-center gap-2">
            <Loader2 size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : pullY >= 60 ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        </div>
      )}

      {/* Offline banner */}
      {!online && (
        <div className="bg-yellow-500/20 border-b border-yellow-500/30 px-4 py-2 text-center text-xs text-yellow-400 font-bold">
          ⚠️ Offline — Cached data dikh raha hai
        </div>
      )}

      {/* Install prompt */}
      {canInstall && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-blue-400">📱 Home Screen pe install karo</span>
          <button onClick={install}
            className="bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-lg hover:bg-blue-600 transition-all">
            Install
          </button>
        </div>
      )}

      {/* Top Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight">Factory Incharge</h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">
            {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {urgentCount > 0 && (
            <div className="flex items-center gap-1 bg-red-500/20 border border-red-500/30 text-red-400 text-xs px-3 py-1.5 rounded-full">
              <AlertTriangle size={12} />
              {urgentCount} Urgent
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 max-w-2xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-slate-500" />
          </div>
        ) : (
          <>
            {activeTab === 'home' && <HomeScreen />}
            {SECTORS.map(s => s.key).includes(activeTab as Sector) && <SectorScreen />}
            {activeTab === 'tracker' && (
              <ReqClosureTracker />
            )}
            {activeTab === 'summary' && <DailyReportViewer />}
            {activeTab === 'assets' && <AssetRegister />}
            {activeTab === 'hse' && <HSEModule />}
            {activeTab === 'agent' && <AgentWatchlist />}
            {activeTab === 'tasks' && <TaskManager />}
            {activeTab === 'telegram' && <TelegramSetup />}
            {activeTab === 'vendors' && <VendorSLAMaster />}
            {activeTab === 'gaps' && <GapDetection />}
            {activeTab === 'board' && <FactoryVisualBoard />}
            {activeTab === 'flow' && <AnimatedOrderFlow />}
            {activeTab === 'floor' && <FloorPlannerUpgrade />}
            {activeTab === 'vehicle' && <VehicleLoadOptimizer />}
            {activeTab === 'cut' && <CuttingSequencePlanner />}
            {activeTab === 'workers' && <WorkerKPIDashboard />}
            {activeTab === 'mis' && <MISDashboard />}
            {activeTab === 'jobpl' && <JobPL />}
            {activeTab === 'cost' && <TrueCostPerSqft />}
            {activeTab === 'vintel' && <VendorIntelligence />}
            {activeTab === 'delivery' && <DeliveryKPIDashboard />}
            {activeTab === 'finance' && <FinancialStatementsMobile />}
            {activeTab === 'strategy' && <StrategicMemoryModule />}
            {activeTab === 'ai_activate' && <AIActivationDashboard />}
            {activeTab === 'ai' && <AIChatInterface />}
            {activeTab === 'briefing' && <MorningBriefingModule />}
            {activeTab === 'predict' && <PredictiveAlerts />}
            {activeTab === 'report' && <ReportNarrativeViewer />}
            {activeTab === 'whatsapp' && <WhatsAppIntegration />}
            {activeTab === 'inbox' && <InboxIntelligence />}
          </>
        )}
      </div>

      {/* ── Grouped Navigation ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800" style={{zIndex:50}}>

        {/* Sub-tabs for active group */}
        {(() => {
          const grp = GROUPS.find(g => g.id === activeGroup);
          if (!grp || grp.tabs.length === 0) return null;
          return (
            <div className="flex overflow-x-auto border-b border-slate-800" style={{scrollbarWidth:'none'}}>
              {grp.tabs.map(({ tab, label }) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setActiveSector(null); setShowEventForm(false); }}
                  className="flex-shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap"
                  style={{
                    color: activeTab === tab ? '#ffffff' : '#475569',
                    borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                    background: 'none',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          );
        })()}

        {/* 5 group buttons */}
        <div className="flex">
          {GROUPS.map(grp => {
            const isActive = activeGroup === grp.id;
            return (
              <button
                key={grp.id}
                onClick={() => {
                  setActiveGroup(grp.id);
                  const firstTab = grp.tabs[0]?.tab;
                  if (firstTab) { setActiveTab(firstTab); setActiveSector(null); setShowEventForm(false); }
                }}
                className="flex-1 flex flex-col items-center py-2.5 transition-colors"
                style={{ color: isActive ? '#ffffff' : '#475569', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <span style={{fontSize:'16px', lineHeight:1, marginBottom:'3px'}}>{grp.icon}</span>
                <span style={{fontSize:'9px', fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', whiteSpace:'nowrap'}}>{grp.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom padding for nav */}
      <div className="h-20" />
    </div>
  );
};

export default FactoryInchargeModule;
