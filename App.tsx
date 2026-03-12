
import React, { useState, useEffect, Suspense } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ShoppingBag, Landmark, ShieldCheck, Briefcase, Factory, Globe, Warehouse, Menu, Bell, Search, Truck, Handshake, Folder, Loader2, X } from 'lucide-react';
import { Company } from './modules/shared/constants';
import { AppService } from './modules/shared/services/appService';
import { useAppStore } from './modules/shared/store/appStore';
import { SyncService } from './src/services/SyncService';
import { Toaster, toast } from 'sonner';


// --- LAZY LOAD MODULES ---
const Dashboard = React.lazy(() => import('./modules/shared/pages/Dashboard'));
const HRModule = React.lazy(() => import('./modules/hr/pages/HRModule'));
const AccountsModule = React.lazy(() => import('./modules/finance/pages/AccountsModule'));
const Requisitions = React.lazy(() => import('./modules/procurement/pages/Requisitions'));
const AdminSecurity = React.lazy(() => import('./modules/shared/pages/AdminSecurity'));
const SalesCRM = React.lazy(() => import('./modules/sales/pages/SalesCRM'));
const ProjectsModule = React.lazy(() => import('./modules/projects/pages/ProjectsModule'));
const IntercompanyHub = React.lazy(() => import('./modules/shared/pages/IntercompanyHub'));
const ProductionModule = React.lazy(() => import('./modules/production/pages/ProductionModule'));
const InventoryModule = React.lazy(() => import('./modules/procurement/pages/InventoryModule'));
const LogisticsModule = React.lazy(() => import('./modules/procurement/pages/LogisticsModule'));
const VendorHub = React.lazy(() => import('./modules/procurement/pages/VendorHub'));

const Sidebar = ({ isMobile }: { isMobile: boolean }) => {
  const location = useLocation();
  const { selectedCompany, setSelectedCompany, isSidebarOpen, toggleSidebar } = useAppStore();
  const companies: Company[] = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];

  const navItems = [
    { name: 'Launchpad', path: '/', icon: LayoutDashboard },
    { name: 'Human Capital (HCM)', path: '/hr', icon: Users },
    ...(selectedCompany !== 'Factory' ? [
      { name: 'Sales & Dist. (SD)', path: '/sales', icon: Briefcase },
      { name: 'Project Systems (PS)', path: '/projects', icon: Folder },
      { name: 'Material Mgmt (MM)', path: '/inventory', icon: Warehouse },
    ] : []),
    { name: 'Logistics (LE)', path: '/logistics', icon: Truck },
    { name: 'Vendor Network', path: '/vendors', icon: Handshake },
    ...(selectedCompany === 'Glassco' ? [{ name: 'Production (PP)', path: '/production', icon: Factory }] : []),
    { name: 'FICO Financials', path: '/accounts', icon: Landmark },
    ...(selectedCompany !== 'Factory' ? [{ name: 'Supply Chain Hub', path: '/hub', icon: Globe }] : []),
    { name: 'Procurement (PUR)', path: '/requisitions', icon: ShoppingBag },
    { name: 'Basis Admin', path: '/admin', icon: ShieldCheck },
  ];

  const sidebarClasses = isMobile 
    ? `fixed inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-72 shadow-2xl z-[100]`
    : `relative ${isSidebarOpen ? 'w-64' : 'w-16'} translate-x-0`;

  return (
    <>
      {isMobile && isSidebarOpen && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] no-print" onClick={toggleSidebar} />}
      <aside className={`${sidebarClasses} bg-[#2f3e4d] text-white flex flex-col no-print transition-all duration-300 ease-in-out shrink-0`}>
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/5 shrink-0 bg-[#354a5f]">
          <div className="flex items-center">
            {!isMobile && <button onClick={toggleSidebar} className="hover:bg-white/10 p-1.5 rounded transition-colors mr-3"><Menu size={20} /></button>}
            {(isSidebarOpen || isMobile) && <span className="font-bold text-sm tracking-tight text-blue-200 uppercase print-hidden">GlassTech 2026</span>}
          </div>
          {isMobile && <button onClick={toggleSidebar} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>}
        </div>
        <div className={`p-4 border-b border-white/5 ${(!isSidebarOpen && !isMobile) && 'hidden'}`}>
          <p className="text-[10px] font-black text-slate-400 uppercase mb-2 px-1">Control Unit</p>
          <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value as Company)} className="w-full bg-[#1c2936] border border-white/10 rounded-xl p-3 text-xs font-bold focus:outline-none cursor-pointer text-blue-100">
            {companies.map(c => <option key={c} value={c}>{c === 'Glassco' ? 'GlassCo' : c} Group</option>)}
          </select>
        </div>
        <nav className="flex-1 mt-2 space-y-1 overflow-y-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path === '/' ? '____' : item.path) || (item.path === '/' && location.pathname === '/');
            return (
              <Link key={item.path} to={item.path} onClick={() => isMobile && toggleSidebar()} className={`flex items-center h-12 px-4 transition-all ${isActive ? 'bg-[#1a2b3c] border-l-4 border-blue-500 text-blue-200 shadow-inner' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
                <item.icon size={20} className="shrink-0" />
                {(isSidebarOpen || isMobile) && <span className="ml-4 font-medium text-xs whitespace-nowrap uppercase tracking-wide">{item.name}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/5 bg-[#253240] print-hidden"><p className="text-[8px] font-bold text-slate-500 text-center uppercase tracking-widest">© 2026 GLASSTECH GROUP</p></div>
      </aside>
    </>
  );
};

const App: React.FC = () => {
  const { selectedCompany, isSidebarOpen, setSidebarOpen } = useAppStore();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const init = async () => {
      await SyncService.fetchFromCloud();
      await AppService.seedInitialData();
      // TRIGGER AUTO BACKUP on App Mount (Phase 3 Requirement)
      AppService.checkAndTriggerAutoBackup(); 
    };
    init();
    
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
      else setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <HashRouter>
      <Toaster position="top-right" richColors />
      <div className="flex h-screen bg-[#eff4f9] font-['Inter'] overflow-hidden">
        <Sidebar isMobile={isMobile} />
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <header className="sap-shell no-print shrink-0 z-[80] flex items-center justify-between px-3 md:px-4">
            <div className="flex items-center space-x-3">
              {isMobile && <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-white/10 rounded"><Menu size={20} /></button>}
              <div className="hidden sm:flex items-center space-x-3"><div className="w-8 h-8 flex items-center justify-center bg-white/10 rounded"><span className="font-black text-xs text-blue-300">GT</span></div><span className="font-bold text-sm tracking-tight hidden md:inline print-hidden">Glasstech ERP 2026</span></div>
              <div className="h-4 w-px bg-white/20 hidden sm:block"></div>
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-widest bg-blue-500/20 px-2 py-1 rounded whitespace-nowrap">{selectedCompany} UNIT</span>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
              {console.log("Rendering Sync Button")}
              <button 
                onClick={async () => {
                  setIsSyncing(true);
                  const res = await SyncService.syncAll();
                  setIsSyncing(false);
                  if (res.success) toast.success("Synced to Cloud!");
                  else toast.error("Sync Failed!");
                }}
                disabled={isSyncing}
                className="hover:bg-white/10 p-2 rounded-full text-white transition-colors"
                title="Sync to Cloud"
              >
                {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <Globe size={18} />}
              </button>
              <div className="relative hidden lg:block"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Transaction Search..." className="bg-white/10 border-none rounded-lg py-1.5 px-8 text-xs w-48 placeholder-slate-400 focus:ring-1 focus:ring-blue-400 outline-none transition-all" /></div>
              <button className="hover:bg-white/10 p-2 rounded-full relative"><Bell size={18}/><span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-[#354a5f]"></span></button>
              <div className="flex items-center space-x-2 cursor-pointer hover:bg-white/10 p-1 rounded-lg transition-colors border border-white/5"><div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-[10px] shadow-lg">AD</div></div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto scroll-smooth">
            <div className="p-3 md:p-8 max-w-[1600px] mx-auto min-h-full flex flex-col">
              <Suspense fallback={<div className="h-full flex flex-col items-center justify-center text-slate-400 animate-pulse"><Loader2 size={48} className="animate-spin text-blue-500 mb-4" /><p className="text-[10px] font-black uppercase tracking-[0.3em]">Authenticating Terminal...</p></div>}>
                <Routes>
                  <Route path="/" element={<Dashboard company={selectedCompany} />} />
                  <Route path="/hr/*" element={<HRModule />} />
                  <Route path="/sales/*" element={<SalesCRM />} />
                  <Route path="/inventory" element={<InventoryModule />} />
                  <Route path="/logistics" element={<LogisticsModule />} />
                  <Route path="/vendors" element={<VendorHub />} />
                  <Route path="/projects/*" element={<ProjectsModule />} />
                  <Route path="/production" element={<ProductionModule />} />
                  <Route path="/hub/*" element={<IntercompanyHub />} />
                  <Route path="/requisitions" element={<Requisitions />} />
                  <Route path="/accounts/*" element={<AccountsModule />} />
                  <Route path="/admin" element={<AdminSecurity />} />
                </Routes>
              </Suspense>
            </div>
          </div>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;
