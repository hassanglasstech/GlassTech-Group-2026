import React, { useState, useEffect, Suspense } from 'react';
import { GlobalErrorBoundary, ModuleErrorBoundary } from '@/modules/shared/components/ErrorBoundary';
import { HashRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, ShoppingBag, Landmark, ShieldCheck,
  Briefcase, Factory, Globe, Warehouse, Menu, Bell, Search, 
  Truck, Handshake, Folder, Loader2, X, LogOut, ChevronDown,
  Home, DollarSign, Settings, BarChart3
} from 'lucide-react';
import { Company } from '@/modules/shared/constants';
import { AppService } from '@/modules/shared/services/appService';
import { useAppStore } from '@/modules/shared/store/appStore';
import { SyncService } from '@/src/services/SyncService';
import { getNetworkStatus, OfflineQueue } from '@/modules/shared/services/networkService';
import { DataIntegrity } from '@/modules/shared/services/dataIntegrity';
import { checkSchemaVersion } from '@/modules/shared/services/utils';
import { Logger, setLogContext, installConsoleOverride } from '@/modules/shared/services/logger';
import { Toaster, toast } from 'sonner';
import { useAuthStore, isOfficeHours, ROLE_DEFAULT_COMPANY, ROLE_MODULES } from '@/modules/auth/authStore';
import LoginPage from '@/modules/auth/LoginPage';

import NotificationCenter from './modules/shared/components/NotificationCenter';
import { ConfirmProvider } from './modules/shared/components/ConfirmDialog';
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
const InventoryModule  = React.lazy(() => import('./modules/procurement/pages/InventoryModule'));
const LogisticsModule  = React.lazy(() => import('./modules/procurement/pages/LogisticsModule'));
const VendorHub        = React.lazy(() => import('./modules/procurement/pages/VendorHub'));
const MDDashboard       = React.lazy(() => import('./modules/md-dashboard/MDDashboard'));

// ── All nav items definition ─────────────────────────────────────────
const ALL_NAV = [
  { name: 'Launchpad',            path: '/',            icon: LayoutDashboard, key: 'dashboard'    },
  { name: 'Human Capital (HCM)',  path: '/hr',          icon: Users,           key: 'hr'           },
  { name: 'Sales & Dist. (SD)',   path: '/sales',       icon: Briefcase,       key: 'sales'        },
  { name: 'Project Systems (PS)', path: '/projects',    icon: Folder,          key: 'projects'     },
  { name: 'Material Mgmt (MM)',   path: '/inventory',   icon: Warehouse,       key: 'inventory'    },
  { name: 'Logistics (LE)',       path: '/logistics',   icon: Truck,           key: 'logistics'    },
  { name: 'Vendor Network',       path: '/vendors',     icon: Handshake,       key: 'vendors'      },
  { name: 'Production (PP)',      path: '/production',  icon: Factory,         key: 'production'   },
  { name: 'FICO Financials',      path: '/accounts',    icon: Landmark,        key: 'accounts'     },
  { name: 'Supply Chain Hub',     path: '/hub',         icon: Globe,           key: 'hub'          },
  { name: 'Procurement (PUR)',    path: '/requisitions',icon: ShoppingBag,     key: 'requisitions' },
  { name: 'MD Dashboard',          path: '/md-dashboard', icon: BarChart3,       key: 'md-dashboard' },
  { name: 'Basis Admin',          path: '/admin',       icon: ShieldCheck,     key: 'admin'        },
];

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

  // Compute which nav items to show
  const allowedModuleKeys = user?.allowedModules?.length
    ? user.allowedModules
    : null; // null = show all

  const navItems = ALL_NAV.filter(item => {
    // Module permission check
    if (allowedModuleKeys && !allowedModuleKeys.includes(item.key)) return false;
    // Production only for Glassco
    if (item.key === 'production' && selectedCompany !== 'Glassco') return false;
    // Hub not for Factory
    if (item.key === 'hub' && selectedCompany === 'Factory') return false;
    // Sales/Projects/Inventory not for Factory
    if (['sales','projects','inventory'].includes(item.key) && selectedCompany === 'Factory') return false;
    // Admin: only visible when Factory company is selected
    if (item.key === 'admin' && selectedCompany !== 'Factory') return false;
    if (item.key === 'md-dashboard' && user?.role !== 'super_admin' && user?.role !== 'gtk_admin') return false;
    return true;
  });

  const sidebarClasses = isMobile
    ? `fixed inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-72 shadow-2xl z-[100]`
    : `relative ${isSidebarOpen ? 'w-64' : 'w-16'} translate-x-0`;

  const roleLabels: Record<string, string> = {
    super_admin:        'Super Admin',
    gtk_admin:          'GTK Admin',
    glassco_admin:      'Glassco Admin',
    glassco_production: 'Production',
    nippon_admin:       'Nippon Admin',
  };
  
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

  // Run sync ONLY after user is authenticated
  useEffect(() => {
    if (!user) return;
    const init = async () => {
      // Schema version check + data integrity repair on startup
      checkSchemaVersion();
      DataIntegrity.autoRepairOnStartup();
      await SyncService.fetchFromCloud();
      await AppService.seedInitialData();
      AppService.checkAndTriggerAutoBackup();
    };
    init();
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
    }
  }, [user]);

  return (
    <GlobalErrorBoundary>
      <a href="#main-content" className="skip-to-content">Skip to main content</a>
    <ConfirmProvider>
    <HashRouter>
      <KeyboardShortcutsProvider />
      <Toaster position="top-right" richColors />
      {!user || !user.email || !user.role ? (
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
          <div className="flex-1 overflow-y-auto scroll-smooth pb-16 lg:pb-0">
            <div className="p-3 md:p-8 max-w-[1600px] mx-auto min-h-full flex flex-col">
              <Suspense fallback={
                <div className="h-full flex flex-col items-center justify-center text-slate-400 animate-pulse">
                  <div className="space-y-4 animate-slide-up"><div className="skeleton skeleton-heading"></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div className="skeleton skeleton-card"></div><div className="skeleton skeleton-card"></div><div className="skeleton skeleton-card"></div><div className="skeleton skeleton-card"></div></div><div className="skeleton skeleton-heading" style={{width:"30%",marginTop:"16px"}}></div><div className="skeleton skeleton-row"></div><div className="skeleton skeleton-row"></div><div className="skeleton skeleton-row"></div></div>
                </div>
              }>
                <Routes>
                  <Route path="/"             element={<ModuleErrorBoundary moduleName="Dashboard"><Dashboard /></ModuleErrorBoundary>} />
                  <Route path="/hr/*"          element={<ModuleErrorBoundary moduleName="HR"><HRModule /></ModuleErrorBoundary>} />
                  <Route path="/sales/*"       element={<ModuleErrorBoundary moduleName="Sales"><SalesCRM /></ModuleErrorBoundary>} />
                  <Route path="/inventory"     element={<ModuleErrorBoundary moduleName="Inventory"><InventoryModule /></ModuleErrorBoundary>} />
                  <Route path="/logistics"     element={<ModuleErrorBoundary moduleName="Logistics"><LogisticsModule /></ModuleErrorBoundary>} />
                  <Route path="/vendors"       element={<ModuleErrorBoundary moduleName="Vendors"><VendorHub /></ModuleErrorBoundary>} />
                  <Route path="/projects/*"    element={<ModuleErrorBoundary moduleName="Projects"><ProjectsModule /></ModuleErrorBoundary>} />
                  <Route path="/production"    element={<ModuleErrorBoundary moduleName="Production"><ProductionModule /></ModuleErrorBoundary>} />
                  <Route path="/hub/*"         element={<ModuleErrorBoundary moduleName="Supply Hub"><IntercompanyHub /></ModuleErrorBoundary>} />
                  <Route path="/requisitions"  element={<ModuleErrorBoundary moduleName="Procurement"><Requisitions /></ModuleErrorBoundary>} />
                  <Route path="/accounts/*"    element={<ModuleErrorBoundary moduleName="Finance"><AccountsModule /></ModuleErrorBoundary>} />
                  <Route path="/md-dashboard" element={<ModuleErrorBoundary moduleName="MD Dashboard"><MDDashboard /></ModuleErrorBoundary>} />
                  <Route path="/admin"         element={<ModuleErrorBoundary moduleName="Admin"><AdminSecurity /></ModuleErrorBoundary>} />
                  <Route path="*"              element={<Navigate to="/" replace />} />
                </Routes>              </Suspense>
            </div>
          </div>
        </main>
        <BottomNav allowedModules={user?.allowedModules?.length ? user.allowedModules : null} />
      </div>
      )}
    </HashRouter>
    </ConfirmProvider>
    </GlobalErrorBoundary>
  );
};

export default App;
