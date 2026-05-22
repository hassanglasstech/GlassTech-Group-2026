import React, { useState, useEffect, Suspense } from 'react';
import { GlobalErrorBoundary, ModuleErrorBoundary } from '@/modules/shared/components/ErrorBoundary';
import { HashRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, ShoppingBag, Landmark, ShieldCheck,
  Briefcase, Factory, Globe, Warehouse, Menu, Bell, Search,
  Truck, Handshake, Folder, Loader2, X, LogOut, ChevronDown,
  Home, DollarSign, Settings, BarChart3, Package, ScanLine
} from 'lucide-react';
import { Company } from '@/modules/shared/constants';
import { AppService } from '@/modules/shared/services/appService';
import { useAppStore } from '@/modules/shared/store/appStore';
import { SyncService } from '@/src/services/SyncService';
import { RealtimeService } from '@/src/services/RealtimeService';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/src/services/queryClient';
import { startRealtimeQueryBridge } from '@/src/services/realtimeQueryBridge';
import { getNetworkStatus, OfflineQueue } from '@/modules/shared/services/networkService';
import { DataIntegrity } from '@/modules/shared/services/dataIntegrity';
import { checkSchemaVersion } from '@/modules/shared/services/utils';
import { prefetchCriticalTables } from '@/modules/shared/hooks/useSupabaseData';
import { flushOfflineQueue } from '@/modules/shared/services/supabaseDB';
import { Logger, setLogContext, installConsoleOverride } from '@/modules/shared/services/logger';
const OverrideModeBar = React.lazy(() => import('@/src/components/OverrideModeBar'));
import { Toaster, toast } from 'sonner';
import { useAuthStore, isOfficeHours, ROLE_DEFAULT_COMPANY, ROLE_DEFAULT_ROUTE, ROLE_MODULES, ROLE_LABELS } from '@/modules/auth/authStore';
import { HRService } from '@/modules/hr/services/hrService';
import { loadShiftRules } from '@/modules/hr/pages/ShiftMaster';
import { FinanceService } from '@/modules/finance/services/financeService';
import { SalesService } from '@/modules/sales/services/salesService';
import { BrandingService } from '@/modules/shared/services/brandingService'; // Sprint 33
import perfMonitor from '@/modules/shared/services/perfMonitor'; // Sprint 34
import { AlertService } from '@/modules/shared/services/alertService'; // Sprint 35
import LoginPage from '@/modules/auth/LoginPage';

import NotificationCenter from './modules/shared/components/NotificationCenter';
import { ConfirmProvider } from './modules/shared/components/ConfirmDialog';
import { ShortcutProvider } from './modules/shared/components/ShortcutProvider';
import useKeyboardShortcuts from './modules/shared/hooks/useKeyboardShortcuts';

// ── Lazy load modules ────────────────────────────────────────────────
const Dashboard        = React.lazy(() => import('./modules/shared/pages/Dashboard'));
const HRModule         = React.lazy(() => import('./modules/hr/pages/HRModule'));
const AccountsModule   = React.lazy(() => import('./modules/finance/pages/AccountsModule'));
const Requisitions     = React.lazy(() => import('./modules/procurement/pages/Requisitions'));
const AdminSecurity    = React.lazy(() => import('./modules/shared/pages/AdminSecurity'));
const SalesCRM         = React.lazy(() => import('./modules/sales/pages/SalesCRM'));
const ProjectsModule   = React.lazy(() => import('./modules/projects/pages/ProjectsModule'));
const IntercompanyHub  = React.lazy(() => import('./modules/shared/pages/IntercompanyHub'));
const ProductionModule = React.lazy(() => import('./modules/production/pages/ProductionModule'));
const ProductionLegacy = React.lazy(() => import('./modules/production/pages/ProductionLegacy'));   // Sprint 19
const InventoryModule  = React.lazy(() => import('./modules/procurement/pages/InventoryModule'));
const LogisticsModule  = React.lazy(() => import('./modules/procurement/pages/LogisticsModule'));
const VendorHub        = React.lazy(() => import('./modules/procurement/pages/VendorHub'));
const MDDashboard       = React.lazy(() => import('./modules/md-dashboard/MDDashboard'));
const FactoryInchargeModule = React.lazy(() => import('./modules/factory/pages/FactoryInchargeModule'));
const ProcurementHub   = React.lazy(() => import('./modules/procurement/pages/ProcurementHub'));
const EventOSChatWidget = React.lazy(() => import('./modules/factory/components/eventOS/ChatWidget').catch(() => ({ default: () => null })));
const WazirLauncher     = React.lazy(() => import('./modules/wazir/components/WazirLauncher').catch(() => ({ default: () => null })));
const TestSuite        = React.lazy(() => import('./modules/shared/pages/TestSuite'));
const HealthMonitor    = React.lazy(() => import('./modules/admin/pages/HealthMonitor'));
const LoanFlowChart    = React.lazy(() => import('./modules/shared/pages/LoanFlowChart'));
const GuidedTestFlows  = React.lazy(() => import('./modules/shared/pages/GuidedTestFlows'));
const E2EVerifier      = React.lazy(() => import('./modules/shared/pages/E2EVerifier'));
// Sprint 6 — dedicated mobile-first cutter workbench (route-gated to glassco_cutter)
const CutterWorkbench  = React.lazy(() => import('./modules/production/companies/glassco/pages/CutterWorkbench'));
// Sprint 7 — dedicated mobile-first QC workbench (dispatch_staff / supervisor)
const QCWorkbench      = React.lazy(() => import('./modules/production/companies/glassco/pages/QCWorkbench'));
// Sprint 8 — WIP aging + vendor SLA + cutter performance
const WIPAging         = React.lazy(() => import('./modules/production/companies/glassco/pages/WIPAging'));
const CutterPerformance= React.lazy(() => import('./modules/production/companies/glassco/pages/CutterPerformance'));
// Sprint 15 — Production Workbench (single page replacing 19 tabs + 12 sub-tabs)
const Workbench        = React.lazy(() => import('./modules/production/companies/glassco/pages/Workbench'));
// Sprint 18 — Role-based mini-apps
const DispatchWorkbench = React.lazy(() => import('./modules/production/companies/glassco/pages/DispatchWorkbench'));
// Sprint 21 — Global UX foundations
const CommandPalette    = React.lazy(() => import('./modules/shared/components/CommandPalette'));
const Breadcrumbs       = React.lazy(() => import('./modules/shared/components/Breadcrumbs'));
// Sprint 25 — Finance inbox
const FinanceInbox      = React.lazy(() => import('./modules/finance/pages/FinanceInbox'));
// Sprint 29 — Reporting pack: standalone operational reports
const VendorScorecard      = React.lazy(() => import('./modules/procurement/pages/VendorScorecard'));
const StockAging           = React.lazy(() => import('./modules/procurement/pages/StockAging'));
const ProjectProfitability = React.lazy(() => import('./modules/sales/pages/ProjectProfitability'));
// Sprint 30 — Cutover / Go-Live Wizard + CSV importers
const CutoverWizard        = React.lazy(() => import('./modules/finance/pages/CutoverWizard'));
const AROpeningBalance     = React.lazy(() => import('./modules/finance/pages/AROpeningBalance'));
const ClientImport         = React.lazy(() => import('./modules/sales/pages/ClientImport'));
const ProductImport        = React.lazy(() => import('./modules/sales/pages/ProductImport'));
// Sprint 31 — Period Lock + Year-End Close + Audit Trail
const YearEndClose         = React.lazy(() => import('./modules/finance/pages/YearEndClose'));
const AuditorView          = React.lazy(() => import('./modules/admin/pages/AuditorView'));
// Sprint 32 — DR Console (snapshot health + manual triggers + downloads)
const DRConsole            = React.lazy(() => import('./modules/admin/pages/DRConsole'));
// Sprint 33 — Print Document Compliance (branding + NTN/STRN + T&C)
const BrandingSettings     = React.lazy(() => import('./modules/admin/pages/BrandingSettings'));
// Pre-go-live — Tax/GST toggle (off by default; flip when business needs GST invoices)
const TaxSettings          = React.lazy(() => import('./modules/admin/pages/TaxSettings'));
// Sprint 34 — Performance at Scale (perf telemetry dashboard)
const HealthMetrics        = React.lazy(() => import('./modules/admin/pages/HealthMetrics'));
// Sprint 35 — Notifications + Alerts (threshold config)
const NotificationSettings = React.lazy(() => import('./modules/admin/pages/NotificationSettings'));
// Sprint 36 — Go-Live Readiness Dashboard (final sprint)
const GoLiveDashboard      = React.lazy(() => import('./modules/admin/pages/GoLiveDashboard'));
// Sprint 12 — public mobile driver POD page (no auth — token-gated)
const DriverScreen     = React.lazy(() => import('./src/pages/DriverScreen'));
// Sprint 14 — live GPS dashboard (supervisor) + public customer tracking
const LiveDispatchMap   = React.lazy(() => import('./src/pages/LiveDispatchMap'));
const PublicTrackingMap = React.lazy(() => import('./src/pages/LiveDispatchMap').then(m => ({ default: m.PublicTrackingMap })));

// ── All nav items definition ─────────────────────────────────────────
// ── Core nav — always visible (role-filtered) ───────────────────────
const CORE_NAV = [
  { name: 'Home',              path: '/',                 icon: LayoutDashboard, key: 'dashboard'        },
  { name: 'Sales & Orders',    path: '/sales',            icon: Briefcase,       key: 'sales'            },
  // Sprint 19: Single production entry — points to Workbench (Sprint 15-17).
  // Legacy tabs accessible via /production/legacy/* until 2026-06-10.
  { name: 'Workbench',         path: '/production/workbench', icon: Factory,     key: 'production'       },
  { name: 'Material Mgmt',     path: '/inventory',        icon: Warehouse,       key: 'inventory'        },
  { name: 'Procurement',       path: '/requisitions',     icon: Package,         key: 'requisitions'     },
  { name: 'Finance (FICO)',     path: '/accounts',         icon: Landmark,        key: 'accounts'         },
  { name: 'People (HCM)',       path: '/hr',               icon: Users,           key: 'hr'               },
  { name: 'UAT Test Suite',    path: '/test-suite',       icon: ShieldCheck,     key: 'test-suite'       },
  { name: 'E2E Verifier',      path: '/e2e-verify',       icon: ShieldCheck,     key: 'e2e-verify'       },
];

// ── Role-specific nav — shown based on user role ─────────────────────
const ROLE_NAV: Record<string, { name: string; path: string; icon: any; key: string }[]> = {
  super_admin:        [{ name: 'MD Dashboard', path: '/md-dashboard',    icon: BarChart3,  key: 'md-dashboard'     }, { name: 'Basis Admin', path: '/admin', icon: ShieldCheck, key: 'admin' }],
  owner:              [{ name: 'MD Dashboard', path: '/md-dashboard',    icon: BarChart3,  key: 'md-dashboard'     }],
  hassan:             [{ name: 'MD Dashboard', path: '/md-dashboard',    icon: BarChart3,  key: 'md-dashboard'     }, { name: 'Basis Admin', path: '/admin', icon: ShieldCheck, key: 'admin' }],
  factory_manager:    [{ name: 'Factory Desk', path: '/factory-incharge',icon: Factory,   key: 'factory-incharge' }],
  glassco_supervisor: [],
  gtk_supervisor:     [],
  gti_supervisor:     [],
  // Sprint 6 — direct link to mobile-first Cutter Workbench
  glassco_cutter:     [{ name: 'Cutter Workbench', path: '/cutter', icon: ScanLine, key: 'cutter' }],
  // Sprint 7 — direct link to mobile-first QC Workbench
  dispatch_staff:     [{ name: 'QC Workbench', path: '/qc', icon: ShieldCheck, key: 'qc' }],
  admin_officer:      [],
  gtk_admin:          [{ name: 'MD Dashboard', path: '/md-dashboard',    icon: BarChart3,  key: 'md-dashboard'     }],
  glassco_admin:      [],
  glassco_production: [],
  nippon_admin:       [],
};

// Legacy — kept for backward compat
const ALL_NAV = [
  ...CORE_NAV,
  { name: 'Factory Incharge', path: '/factory-incharge', icon: Factory,    key: 'factory-incharge' },
  { name: 'MD Dashboard',     path: '/md-dashboard',     icon: BarChart3,  key: 'md-dashboard'     },
  { name: 'Basis Admin',      path: '/admin',            icon: ShieldCheck,key: 'admin'            },
];

// ─────────────────────────────────────────────────────────────────────
// ROUTE ACCESS GUARD — Sprint 39 / BUG-1 fix
//
// Previously: Sidebar hid nav items based on `allowedModules`, but typing a
// URL directly (e.g. /#/accounts) bypassed RBAC entirely. This component
// enforces module access at the ROUTE level — if the user does not have the
// module in `allowedModules`, they get redirected to Dashboard with a toast.
//
// Full-access roles (super_admin, owner, hassan) bypass this guard.
// Empty `allowedModules` array now means NO ACCESS (was previously "all access")
// — admin must explicitly tick modules in Admin → Users → Edit.
// ─────────────────────────────────────────────────────────────────────
const FULL_ACCESS_ROLES = ['super_admin', 'owner', 'hassan'];

// Maps a URL pathname to its module key. Must match `key` values in CORE_NAV / ROLE_NAV.
// Any path not in this map is treated as "no module restriction" (Dashboard, public pages).
const pathToModuleKey = (pathname: string): string | null => {
  if (pathname === '/' || pathname === '') return null; // Dashboard always allowed
  if (pathname.startsWith('/sales'))           return 'sales';
  if (pathname.startsWith('/hr'))              return 'hr';
  if (pathname.startsWith('/inventory'))       return 'inventory';
  if (pathname.startsWith('/logistics'))       return 'logistics';
  if (pathname.startsWith('/vendors'))         return 'vendors';
  if (pathname.startsWith('/projects'))        return 'projects';
  if (pathname.startsWith('/production'))      return 'production';
  if (pathname.startsWith('/cutter'))          return 'production';
  if (pathname.startsWith('/qc'))              return 'production';
  if (pathname.startsWith('/dispatch'))        return 'logistics';
  if (pathname.startsWith('/requisitions'))    return 'requisitions';
  if (pathname.startsWith('/procurement'))     return 'requisitions';
  if (pathname.startsWith('/accounts'))        return 'accounts';
  if (pathname.startsWith('/finance'))         return 'accounts';
  if (pathname.startsWith('/hub'))             return 'hub';
  if (pathname.startsWith('/admin'))           return 'admin';
  if (pathname.startsWith('/md-dashboard'))    return 'md-dashboard';
  if (pathname.startsWith('/factory-incharge'))return 'factory-incharge';
  if (pathname.startsWith('/health'))          return 'admin';
  if (pathname.startsWith('/test-suite'))      return 'test-suite';
  if (pathname.startsWith('/e2e-verify'))      return 'e2e-verify';
  if (pathname.startsWith('/guided-tests'))    return 'test-suite';
  if (pathname.startsWith('/loan-flow'))       return 'hr';
  return null;
};

const RouteAccessGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();
  const location = useLocation();

  // No user yet = bail (Login handles redirect elsewhere)
  if (!user) return <>{children}</>;

  // Full-access roles always pass
  if (FULL_ACCESS_ROLES.includes(user.role)) return <>{children}</>;

  const moduleKey = pathToModuleKey(location.pathname);

  // Path doesn't map to any module (e.g. Dashboard) — allow
  if (!moduleKey) return <>{children}</>;

  const allowed = user.allowedModules || [];
  if (allowed.includes(moduleKey)) return <>{children}</>;

  // BLOCKED. Show a clean Forbidden screen with link back home.
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-4">
        <ShieldCheck size={28} className="text-rose-600" />
      </div>
      <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-1">Access Denied</h2>
      <p className="text-sm text-slate-500 max-w-md mb-1">
        Aap ke pas <strong className="text-slate-700">{moduleKey}</strong> module ka access nahi hai.
      </p>
      <p className="text-xs text-slate-400 mb-5">
        Admin se rabta karen agar yeh module aap ko chahiye.
      </p>
      <Link
        to="/"
        className="bg-slate-900 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
      >
        Dashboard pe wapas
      </Link>
    </div>
  );
};

// ── Session timeout watcher ───────────────────────────────────────────
const useSessionWatch = () => {
  const { user, signOut } = useAuthStore();

  useEffect(() => {
    if (!user?.timeRestricted) return;

    const check = () => {
      if (!isOfficeHours()) {
        toast.error('Office hours ended. Session closed.', { duration: 5000 });
        setTimeout(() => signOut(), 2000);
      }
    };

    // Check every 60 seconds
    const interval = setInterval(check, 60 * 1000);
    return () => clearInterval(interval);
  }, [user, signOut]);
};

// ── Sidebar ───────────────────────────────────────────────────────────
const Sidebar = ({ isMobile }: { isMobile: boolean }) => {
  const location   = useLocation();
  const { selectedCompany, setSelectedCompany, isSidebarOpen, toggleSidebar } = useAppStore();
  const { user, signOut } = useAuthStore();

  // Compute which companies this user can switch to
  const companies: Company[] = (user?.allowedCompanies?.length
    ? user.allowedCompanies
    : ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory']) as Company[];

  // Compute which nav items to show.
  // BUG-1 fix: empty allowedModules now means NO ACCESS (was: "all access").
  // Full-access roles (super_admin/owner/hassan) always see everything.
  const isFullAccessRole = ['super_admin', 'owner', 'hassan'].includes(user?.role || '');
  const allowedModuleKeys = isFullAccessRole ? null : (user?.allowedModules || []);

  // Build nav: core items filtered by role permissions + role-specific items
  const coreItems = CORE_NAV.filter(item => {
    if (allowedModuleKeys && !allowedModuleKeys.includes(item.key)) return false;
    if (item.key === 'production' && selectedCompany !== 'Glassco') return false;
    if (['sales'].includes(item.key) && selectedCompany === 'Factory') return false;
    return true;
  });

  const roleItems = (user?.role ? (ROLE_NAV[user.role] || []) : []);
  const navItems = [...coreItems, ...roleItems];

  const sidebarClasses = isMobile
    ? `fixed inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-72 shadow-2xl z-[100]`
    : `relative ${isSidebarOpen ? 'w-64' : 'w-16'} translate-x-0`;

  const roleLabels = ROLE_LABELS;
  
  if (!user || !user.email) {
    console.error('[Sidebar] user is null or invalid:', user);
    return null;
  }

  return (
    <>
      {isMobile && isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] no-print" onClick={toggleSidebar} />
      )}
      <aside className={`${sidebarClasses} bg-slate-800 text-white flex flex-col no-print transition-all duration-300 ease-in-out shrink-0`}>

        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/5 shrink-0 bg-slate-900">
          <div className="flex items-center">
            {!isMobile && <button onClick={toggleSidebar} className="hover:bg-white/10 p-1.5 rounded transition-colors mr-3" aria-label="Toggle menu"><Menu size={20} /></button>}
            {(isSidebarOpen || isMobile) && <span className="font-bold text-sm tracking-tight text-blue-200 uppercase">GlassTech 2026</span>}
          </div>
          {isMobile && <button onClick={toggleSidebar} className="p-2 hover:bg-white/10 rounded-full" aria-label="Close"><X size={20} /></button>}
        </div>

        {/* Company Switcher — only if multi-company access */}
        {(isSidebarOpen || isMobile) && (
          <div className="p-4 border-b border-white/5">
            {companies.length > 1 ? (
              <>
                <p className="text-xs font-bold text-slate-400 uppercase mb-2 px-1">Control Unit</p>
                <select
                  value={selectedCompany}
                  onChange={e => setSelectedCompany(e.target.value as Company)}
                  className="w-full bg-slate-900/80 border border-white/10 rounded-xl p-3 text-xs font-bold focus:outline-none cursor-pointer text-blue-100"
                >
                  {companies.map(c => <option key={c} value={c}>{c === 'Glassco' ? 'GlassCo' : c} Group</option>)}
                </select>
              </>
            ) : (
              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3 text-xs font-bold text-blue-100">
                {selectedCompany === 'Glassco' ? 'GlassCo' : selectedCompany} Group
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 mt-2 space-y-1 overflow-y-auto no-scrollbar">
          {navItems.map((item, idx) => {
            const isActive = location.pathname.startsWith(item.path === '/' ? '____' : item.path) || (item.path === '/' && location.pathname === '/');
            const shortcutNum = idx < 8 ? idx + 1 : null;
            return (
              <Link key={item.path} to={item.path} onClick={() => isMobile && toggleSidebar()}
                title={shortcutNum ? `${item.name} (Alt+${shortcutNum})` : item.name}
                className={`flex items-center h-12 px-4 transition-all ${isActive ? 'bg-slate-900/60 border-l-4 border-blue-500 text-blue-200 shadow-inner' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
                <item.icon size={20} className="shrink-0" />
                {(isSidebarOpen || isMobile) && <span className="ml-4 font-medium text-xs whitespace-nowrap uppercase tracking-wide flex-1">{item.name}</span>}
                {(isSidebarOpen || isMobile) && shortcutNum && <span className="text-xs text-slate-500 font-mono ml-2 hidden lg:inline">⌥{shortcutNum}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User info + logout */}
        {(isSidebarOpen || isMobile) && user && (
          <div className="p-4 border-t border-white/5 bg-slate-900/80">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{user.fullName || user.email}</p>
                <p className="text-xs text-blue-300 font-bold uppercase mt-0.5">{roleLabels[user.role] || user.role}</p>
              </div>
              <button onClick={() => { signOut(); toast.success('Logged out.'); }}
                className="ml-2 p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors shrink-0" title="Sign out">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="py-2 border-t border-white/5 bg-slate-800 print-hidden">
          <p className="text-xs font-bold text-slate-500 text-center uppercase tracking-widest">© 2026 GLASSTECH GROUP</p>
          <p className="text-[9px] text-slate-600 text-center font-mono mt-0.5 tracking-widest">v1.0.0-beta</p>
        </div>
      </aside>
    </>
  );
};


// ── Mobile Bottom Navigation ─────────────────────────────────────────
const BOTTOM_NAV_ITEMS = [
  { name: 'Home',    path: '/',         icon: Home,          key: 'dashboard'  },
  { name: 'Sales',   path: '/sales',    icon: Briefcase,     key: 'sales'      },
  { name: 'Finance', path: '/accounts', icon: DollarSign,    key: 'accounts'   },
  { name: 'HR',      path: '/hr',       icon: Users,         key: 'hr'         },
  { name: 'More',    path: '/requisitions', icon: Settings,  key: 'more'       },
];

const BottomNav: React.FC<{ allowedModules: string[] | null }> = ({ allowedModules }) => {
  const location = useLocation();
  const items = BOTTOM_NAV_ITEMS.filter(item =>
    !allowedModules?.length || allowedModules.includes(item.key)
  );
  return (
    <nav className="bottom-nav lg:hidden no-print" role="navigation" aria-label="Quick access">
      {items.slice(0, 5).map(item => {
        const isActive = item.path === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(item.path);
        return (
          <Link key={item.path} to={item.path}
            className={`bottom-nav-item ${isActive ? 'active' : ''}`}>
            <item.icon size={20}/>
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
};

// ── Main App ─────────────────────────────────────────────────────────
// Keyboard shortcuts — must be inside HashRouter for useNavigate
const KeyboardShortcutsProvider = () => { useKeyboardShortcuts(); return null; };

const App: React.FC = () => {
  const { selectedCompany, isSidebarOpen, setSidebarOpen, setSelectedCompany } = useAppStore();
  const { user, signOut } = useAuthStore();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    const handleOnline  = () => { setIsOnline(true); setJustReconnected(true); toast.success('Connection restored — System online'); setTimeout(() => setJustReconnected(false), 4000); };
    const handleOffline = () => { setIsOnline(false); setJustReconnected(false); toast.error('Connection lost — Working offline', { duration: 5000 }); };
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Session watch - only matters for time-restricted users

  // Install console override once on app load
  useEffect(() => {
    installConsoleOverride();
  }, []);

  // ── Global silent crash catcher (Phase F) ─────────────────────────
  // Catches the 161 try{} blocks that had no catch{} — they become
  // unhandled Promise rejections. Log them so data issues are visible.
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason) || 'Unknown error';
      // Ignore benign Supabase auth session-not-found (normal on first load)
      if (msg.includes('Auth session missing') || msg.includes('JWT')) return;
      Logger.error('UnhandledRejection', msg, event.reason);
      // Show toast only for DB/sync failures — not routine misses
      if (msg.toLowerCase().includes('upsert') || msg.toLowerCase().includes('supabase') || msg.toLowerCase().includes('fetch')) {
        toast.error(`Sync issue — ${msg.slice(0, 80)}`, { duration: 4000 });
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  useEffect(() => {
    if (!user) {
      RealtimeService.stop();
      return;
    }
    const init = async () => {
      // Sprint 34 — start boot timer + check storage on every login
      perfMonitor.startBootTimer();
      perfMonitor.checkStorageAndWarn();
      // Schema version check + data integrity repair on startup
      checkSchemaVersion();
      DataIntegrity.autoRepairOnStartup();
      perfMonitor.markBoot('schema_check');
      // Sprint 34 hotfix-4: skip fetchCritical() if cache is fresh (<30 min).
      // Returning users already have warm localStorage — no need to block boot
      // with 8 Supabase round-trips. New sessions (cold cache) still get full sync.
      const lastSync = localStorage.getItem('gtk_erp_last_sync');
      const cacheAgeMs = lastSync ? Date.now() - new Date(lastSync).getTime() : Infinity;
      const CACHE_FRESH_MS = 30 * 60 * 1000; // 30 minutes
      if (cacheAgeMs > CACHE_FRESH_MS) {
        // Cold cache (new device / first login / >30 min ago) — await priority tables
        await SyncService.fetchCritical();
        perfMonitor.markBoot('sync_critical');
      } else {
        // Warm cache — skip await, just fire background sync immediately
        perfMonitor.markBoot('sync_critical_skipped');
      }
      // Always run full sync in background regardless
      SyncService.fetchFromCloud().then(() => perfMonitor.markBoot('sync_full_done')).catch(() => {});
      // Sprint 34 hotfix-3: prefetchCriticalTables is a redundant double-fetch —
      // fetchCritical() already pulled the same 8/10 tables into localStorage.
      // Fire non-blocking so TanStack cache warms in background without blocking boot.
      prefetchCriticalTables().then(() => perfMonitor.markBoot('prefetch_done')).catch(() => {});
      perfMonitor.markBoot('prefetch_critical'); // marks immediately
      flushOfflineQueue().catch(() => {});        // push offline writes — non-blocking
      await AppService.seedInitialData();
      perfMonitor.markBoot('seed_data');
      // Sprint 34 hotfix-2: fire HR / Finance / Sales warm in background.
      // These services read from localStorage if available (sync already
      // seeded it via fetchCritical), falling back to Supabase only when
      // cache is cold. Awaiting them was blocking boot by 10-12s needlessly.
      HRService.loadCache()
        .then(() => loadShiftRules())
        .then(() => perfMonitor.markBoot('hr_cache_done'))
        .catch(() => {});
      perfMonitor.markBoot('hr_cache');   // marks immediately — async
      FinanceService.init()
        .then(() => perfMonitor.markBoot('finance_init_done'))
        .catch(() => {});
      perfMonitor.markBoot('finance_init'); // marks immediately — async
      SalesService.warmCache()
        .then(() => perfMonitor.markBoot('sales_warm_done'))
        .catch(() => {});
      perfMonitor.markBoot('sales_warm');   // marks immediately — async
      BrandingService.prefetchAll().catch(() => {}); // Sprint 33 — warm letterhead/footer cache
      AppService.checkAndTriggerAutoBackup();
      // Start Realtime AFTER initial fetch — live cross-device sync
      RealtimeService.start();
      // Sprint 3: bridge gtk_realtime_update events into TanStack cache
      // so hooks (useClients/useInvoices/...) refetch on remote changes.
      startRealtimeQueryBridge();
      perfMonitor.markBoot('realtime_started');
      // Sprint 34 — optional cloud upload of perf samples (off unless VITE_PERF_UPLOAD=1)
      perfMonitor.startCloudUpload();
      // Sprint 35 — fire ERP alert checks on boot (background, non-blocking)
      AlertService.runChecks(selectedCompany).catch(() => {});
      perfMonitor.markBoot('alert_checks');
    };
    init();
    // Sprint 35 — repeat alert checks every 15 minutes (non-blocking)
    const alertInterval = window.setInterval(() => {
      AlertService.runChecks(selectedCompany).catch(() => {});
    }, 15 * 60 * 1000);
    return () => { RealtimeService.stop(); clearInterval(alertInterval); };
  }, [user?.id]); // only when user changes

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
      else setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []); // resize listener always active

  // Set default company based on role on first login
  useEffect(() => {
    if (user) {
      // Set logger context
      setLogContext(user.fullName || user.email, user.allowedCompanies[0] || 'GTK');
      Logger.auth('LOGIN', user.email);
      const defaultCompany = ROLE_DEFAULT_COMPANY[user.role];
      if (defaultCompany && !user.allowedCompanies.includes(selectedCompany)) {
        setSelectedCompany(defaultCompany as Company);
      }

      // Sprint 18: role-based landing — if user is on root or empty hash,
      // jump to their dedicated mini-app/page (cutter → /cutter,
      // dispatch_staff → /dispatch, supervisors → /production/workbench).
      try {
        const currentHash = window.location.hash;
        const isRoot = currentHash === '' || currentHash === '#' || currentHash === '#/';
        const target = ROLE_DEFAULT_ROUTE[user.role];
        if (isRoot && target && target !== '/') {
          window.location.hash = `#${target}`;
        }
      } catch { /* noop */ }

      // Sprint 13 — daily SLA breach scan (idempotent server-side log)
      // Runs once per session; cheap (one RPC + one query) and surfaces
      // overdue tempering returns + driver-license expiries to supervisors.
      import('@/modules/procurement/services/vendorSLATracker').then(({ VendorSLATracker }) => {
        VendorSLATracker.runDailyScan(selectedCompany as Company).then(r => {
          if (r.error) {
            // Network blip or table missing — silent (Logger only)
            Logger.error('VendorSLATracker', 'daily scan failed', new Error(r.error));
            return;
          }
          const lateReturns     = r.data?.lateReturns ?? 0;
          const expiringDrivers = r.data?.expiringDrivers ?? 0;
          if (lateReturns > 0 || expiringDrivers > 0) {
            const parts: string[] = [];
            if (lateReturns > 0)     parts.push(`${lateReturns} overdue tempering`);
            if (expiringDrivers > 0) parts.push(`${expiringDrivers} driver doc${expiringDrivers > 1 ? 's' : ''} expiring`);
            toast.warning(`SLA alerts: ${parts.join(' · ')}`, { duration: 7000 });
          }
        });
      }).catch(() => { /* lazy import failure — silent */ });
    }
  }, [user]);

  return (
    <GlobalErrorBoundary>
      <a href="#main-content" className="skip-to-content">Skip to main content</a>
    <QueryClientProvider client={queryClient}>
    <ShortcutProvider>
    <ConfirmProvider>
    <HashRouter>
      <KeyboardShortcutsProvider />
      <Toaster position="top-right" richColors />
      {/* Sprint 12: public driver POD route — bypasses auth via token */}
      {/* Sprint 14: public customer tracking route — same pattern */}
      {window.location.hash.startsWith('#/driver/') || window.location.hash.startsWith('#/track/') ? (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={32}/></div>}>
          <Routes>
            <Route path="/driver/:tripId" element={<ModuleErrorBoundary moduleName="Driver POD"><DriverScreen /></ModuleErrorBoundary>} />
            <Route path="/track/:tripId"  element={<ModuleErrorBoundary moduleName="Customer Tracking"><PublicTrackingMap /></ModuleErrorBoundary>} />
          </Routes>
        </Suspense>
      ) : !user || !user.email || !user.role ? (
        <LoginPage />
      ) : (
      <div className="flex h-screen bg-slate-50 font-sans overflow-hidden"
           data-user={user.role}>
        <Sidebar isMobile={isMobile} />
        <main id="main-content" className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <header className="sap-shell no-print shrink-0 z-[80] flex items-center justify-between px-3 md:px-4" role="banner">
            <div className="flex items-center space-x-3">
              {isMobile && <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-white/10 rounded" aria-label="Open menu"><Menu size={20} /></button>}
              <div className="hidden sm:flex items-center space-x-3">
                <div className="w-8 h-8 flex items-center justify-center bg-white/10 rounded">
                  <span className="font-bold text-xs text-blue-300">GT</span>
                </div>
                <span className="font-bold text-sm tracking-tight hidden md:inline print-hidden">Glasstech ERP 2026</span>
              </div>
              <div className="h-4 w-px bg-white/20 hidden sm:block" />
              <span className="text-xs font-bold text-blue-200 uppercase tracking-widest bg-blue-500/20 px-2 py-1 rounded whitespace-nowrap">
                {selectedCompany} UNIT
              </span>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
              <button
                onClick={async () => {
                  setIsSyncing(true);
                  await SyncService.syncAll();
                  setIsSyncing(false);
                }}
                disabled={isSyncing}
                className="relative hover:bg-white/10 p-2 rounded-full text-white transition-colors"
                title="Sync to Cloud"
              >
                {isSyncing
                  ? <Loader2 size={18} className="animate-spin" />
                  : <Globe size={18} className={isOnline ? 'text-emerald-400' : 'text-rose-400 animate-pulse'} />
                }
                {!isOnline && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-rose-500 rounded-full border border-slate-700 animate-pulse"/>
                )}
              </button>
              <div className="relative hidden lg:block">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Transaction Search..." className="bg-white/10 border-none rounded-lg py-1.5 px-8 text-xs w-48 placeholder-slate-400 focus:ring-1 focus:ring-blue-400 outline-none" />
              </div>
              <div className="relative">
                <NotificationCenter />
              </div>
              {/* User badge */}
              <div className="flex items-center space-x-2 cursor-pointer hover:bg-white/10 p-1 rounded-lg border border-white/5"
                onClick={() => { Logger.auth('LOGOUT', user?.email || ''); signOut(); toast.success('Logged out.'); }}>
                <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-xs shadow-lg">
                  {user.fullName?.slice(0, 2).toUpperCase() || user.email.slice(0, 2).toUpperCase()}
                </div>
                <span className="hidden md:block text-xs text-blue-200 font-bold uppercase">
                  {user.fullName?.split(' ')[0] || 'User'}
                </span>
                <LogOut size={13} className="text-slate-400 hidden md:block" />
              </div>
            </div>
          </header>

          {!isOnline && (
            <div className="bg-gradient-to-r from-rose-600 to-rose-500 text-white text-center text-xs font-black uppercase tracking-widest py-2 px-4 no-print flex items-center justify-center space-x-3 animate-in fade-in shadow-lg">
              <span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse"/>
              <span>Offline Mode — All changes saved locally — Will sync when connected</span>
              <span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse"/>
            </div>
          )}
          {isOnline && justReconnected && (
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-center text-xs font-black uppercase tracking-widest py-2 px-4 no-print flex items-center justify-center space-x-3 animate-in fade-in shadow-lg">
              <span>Connected — System Online</span>
            </div>
          )}
          <Suspense fallback={null}><OverrideModeBar /></Suspense>
          {/* Sprint 21 — Persistent breadcrumbs (auto-hides on home + opt-out paths) */}
          <Suspense fallback={null}>
            <div className="px-3 md:px-8 pt-2 max-w-[1600px] mx-auto w-full no-print">
              <Breadcrumbs/>
            </div>
          </Suspense>
          <div className="flex-1 overflow-y-auto scroll-smooth pb-16 lg:pb-0">
            <div className="p-3 md:p-8 max-w-[1600px] mx-auto min-h-full flex flex-col">
              <Suspense fallback={
                <div className="h-full flex flex-col items-center justify-center text-slate-400 animate-pulse">
                  <div className="space-y-4 animate-slide-up"><div className="skeleton skeleton-heading"></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div className="skeleton skeleton-card"></div><div className="skeleton skeleton-card"></div><div className="skeleton skeleton-card"></div><div className="skeleton skeleton-card"></div></div><div className="skeleton skeleton-heading" style={{width:"30%",marginTop:"16px"}}></div><div className="skeleton skeleton-row"></div><div className="skeleton skeleton-row"></div><div className="skeleton skeleton-row"></div></div>
                </div>
              }>
                <RouteAccessGuard>
                <Routes>
                  <Route path="/"             element={<ModuleErrorBoundary moduleName="Dashboard"><Dashboard /></ModuleErrorBoundary>} />
                  <Route path="/hr/*"          element={<ModuleErrorBoundary moduleName="HR"><HRModule /></ModuleErrorBoundary>} />
                  <Route path="/sales/*"       element={<ModuleErrorBoundary moduleName="Sales"><SalesCRM /></ModuleErrorBoundary>} />
                  <Route path="/inventory"     element={<ModuleErrorBoundary moduleName="Inventory"><InventoryModule /></ModuleErrorBoundary>} />
                  <Route path="/logistics"     element={<ModuleErrorBoundary moduleName="Logistics"><LogisticsModule /></ModuleErrorBoundary>} />
                  <Route path="/vendors"       element={<ModuleErrorBoundary moduleName="Vendors"><VendorHub /></ModuleErrorBoundary>} />
                  <Route path="/projects/*"    element={<ModuleErrorBoundary moduleName="Projects"><ProjectsModule /></ModuleErrorBoundary>} />
                  {/* Sprint 19: /production now redirects to Workbench. Legacy tabs
                      moved under /production/legacy/* (deprecate after 30 days = 2026-06-10). */}
                  <Route path="/production"             element={<Navigate to="/production/workbench" replace/>} />
                  <Route path="/production/fabrication" element={<Navigate to="/production/workbench" replace/>} />
                  <Route path="/production/processing"  element={<Navigate to="/production/workbench" replace/>} />
                  <Route path="/production/qc-dispatch" element={<Navigate to="/production/workbench" replace/>} />
                  <Route path="/production/ncr"         element={<Navigate to="/production/workbench?lens=ncr" replace/>} />
                  <Route path="/production/legacy"      element={<ModuleErrorBoundary moduleName="Production (Legacy)"><ProductionLegacy /></ModuleErrorBoundary>} />
                  <Route path="/hub/*"         element={<ModuleErrorBoundary moduleName="Supply Hub"><IntercompanyHub /></ModuleErrorBoundary>} />
                  <Route path="/requisitions"  element={<ModuleErrorBoundary moduleName="Procurement"><ProcurementHub /></ModuleErrorBoundary>} />
                  <Route path="/accounts/*"    element={<ModuleErrorBoundary moduleName="Finance"><AccountsModule /></ModuleErrorBoundary>} />
                  {/* Sprint 25 — Finance inbox (single accountant action queue) */}
                  <Route path="/finance/inbox"  element={<ModuleErrorBoundary moduleName="Finance Inbox"><FinanceInbox /></ModuleErrorBoundary>} />
                  <Route path="/md-dashboard" element={<ModuleErrorBoundary moduleName="MD Dashboard"><MDDashboard /></ModuleErrorBoundary>} />
                  <Route path="/factory-incharge" element={<ModuleErrorBoundary moduleName="Factory Incharge"><FactoryInchargeModule /></ModuleErrorBoundary>} />
                  <Route path="/admin"         element={<ModuleErrorBoundary moduleName="Admin"><AdminSecurity /></ModuleErrorBoundary>} />
                  <Route path="/health"        element={<ModuleErrorBoundary moduleName="Health Monitor"><HealthMonitor /></ModuleErrorBoundary>} />
                  <Route path="/test-suite"    element={<ModuleErrorBoundary moduleName="UAT Test Suite"><TestSuite /></ModuleErrorBoundary>} />
                  <Route path="/loan-flow"     element={<ModuleErrorBoundary moduleName="Loan Flow Chart"><LoanFlowChart /></ModuleErrorBoundary>} />
                  <Route path="/guided-tests"  element={<ModuleErrorBoundary moduleName="Guided Tests"><GuidedTestFlows /></ModuleErrorBoundary>} />
                  <Route path="/e2e-verify"    element={<ModuleErrorBoundary moduleName="E2E Verifier"><E2EVerifier /></ModuleErrorBoundary>} />
                  {/* Sprint 6 — Cutter Workbench (mobile-first; CutterWorkbench enforces role gate internally) */}
                  <Route path="/cutter"        element={<ModuleErrorBoundary moduleName="Cutter Workbench"><CutterWorkbench /></ModuleErrorBoundary>} />
                  {/* Sprint 7 — QC Workbench (mobile-first; role gate enforced internally) */}
                  <Route path="/qc"            element={<ModuleErrorBoundary moduleName="QC Workbench"><QCWorkbench /></ModuleErrorBoundary>} />
                  {/* Sprint 8 — WIP aging + Vendor SLA + Cutter Performance */}
                  <Route path="/production/aging"             element={<ModuleErrorBoundary moduleName="WIP Aging"><WIPAging /></ModuleErrorBoundary>} />
                  <Route path="/production/cutter-performance" element={<ModuleErrorBoundary moduleName="Cutter Performance"><CutterPerformance /></ModuleErrorBoundary>} />
                  {/* Sprint 29 — Operational reports */}
                  <Route path="/procurement/vendor-scorecard"  element={<ModuleErrorBoundary moduleName="Vendor Scorecard"><VendorScorecard /></ModuleErrorBoundary>} />
                  <Route path="/procurement/stock-aging"       element={<ModuleErrorBoundary moduleName="Stock Aging"><StockAging /></ModuleErrorBoundary>} />
                  <Route path="/sales/project-profitability"   element={<ModuleErrorBoundary moduleName="Project Profitability"><ProjectProfitability /></ModuleErrorBoundary>} />
                  {/* Sprint 30 — Cutover / Go-Live Wizard + bulk importers */}
                  <Route path="/finance/cutover"               element={<ModuleErrorBoundary moduleName="Cutover Wizard"><CutoverWizard /></ModuleErrorBoundary>} />
                  <Route path="/finance/ar-opening"            element={<ModuleErrorBoundary moduleName="AR Opening Balance"><AROpeningBalance /></ModuleErrorBoundary>} />
                  <Route path="/sales/client-import"           element={<ModuleErrorBoundary moduleName="Client Import"><ClientImport /></ModuleErrorBoundary>} />
                  <Route path="/sales/product-import"          element={<ModuleErrorBoundary moduleName="Product Import"><ProductImport /></ModuleErrorBoundary>} />
                  {/* Sprint 31 — Period Lock + Year-End Close + Auditor Read-only View */}
                  <Route path="/finance/year-end"              element={<ModuleErrorBoundary moduleName="Year-End Close"><YearEndClose /></ModuleErrorBoundary>} />
                  <Route path="/admin/auditor"                 element={<ModuleErrorBoundary moduleName="Auditor View"><AuditorView /></ModuleErrorBoundary>} />
                  {/* Sprint 32 — DR Console (admin) */}
                  <Route path="/admin/dr"                      element={<ModuleErrorBoundary moduleName="DR Console"><DRConsole /></ModuleErrorBoundary>} />
                  {/* Sprint 33 — Branding Settings (admin) */}
                  <Route path="/admin/branding"                element={<ModuleErrorBoundary moduleName="Branding Settings"><BrandingSettings /></ModuleErrorBoundary>} />
                  {/* Pre-go-live — Tax/GST Settings toggle */}
                  <Route path="/admin/tax-settings"            element={<ModuleErrorBoundary moduleName="Tax Settings"><TaxSettings /></ModuleErrorBoundary>} />
                  {/* Sprint 34 — Performance Metrics (admin) */}
                  <Route path="/admin/health-metrics"          element={<ModuleErrorBoundary moduleName="Health Metrics"><HealthMetrics /></ModuleErrorBoundary>} />
                  {/* Sprint 35 — Alert / Notification Settings (admin) */}
                  <Route path="/admin/alert-settings"          element={<ModuleErrorBoundary moduleName="Alert Settings"><NotificationSettings /></ModuleErrorBoundary>} />
                  {/* Sprint 36 — Go-Live Readiness Dashboard (final sprint) */}
                  <Route path="/admin/go-live"                 element={<ModuleErrorBoundary moduleName="Go-Live Readiness"><GoLiveDashboard /></ModuleErrorBoundary>} />
                  {/* Sprint 14 — Live GPS dashboard (supervisor) */}
                  <Route path="/dispatch/live"  element={<ModuleErrorBoundary moduleName="Live Dispatch Map"><LiveDispatchMap /></ModuleErrorBoundary>} />
                  {/* Sprint 15 — Production Workbench (single page) */}
                  <Route path="/production/workbench" element={<ModuleErrorBoundary moduleName="Workbench"><Workbench /></ModuleErrorBoundary>} />
                  {/* Sprint 18 — Dispatch mini-app for dispatch_staff role */}
                  <Route path="/dispatch"            element={<ModuleErrorBoundary moduleName="Dispatch"><DispatchWorkbench /></ModuleErrorBoundary>} />
                  <Route path="*"              element={<Navigate to="/" replace />} />
                </Routes>
                </RouteAccessGuard>
              </Suspense>
            </div>
          </div>
        </main>
        <BottomNav allowedModules={['super_admin', 'owner', 'hassan'].includes(user?.role || '') ? null : (user?.allowedModules || [])} />
        <Suspense fallback={null}><EventOSChatWidget /></Suspense>
        <Suspense fallback={null}><WazirLauncher /></Suspense>
        {/* Sprint 21 — global ⌘K command palette (skips when in input field) */}
        <Suspense fallback={null}><CommandPalette /></Suspense>
      </div>
      )}
    </HashRouter>
    </ConfirmProvider>
    </ShortcutProvider>
    </QueryClientProvider>
    </GlobalErrorBoundary>
  );
};

export default App;
