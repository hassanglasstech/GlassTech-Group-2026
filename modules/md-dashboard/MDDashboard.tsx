import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, CreditCard, Users,
  ArrowUpRight, ArrowDownRight, Factory, Wallet, AlertTriangle,
  Clock, CheckCircle, FileText, ShoppingBag, BarChart3,
  ArrowLeft, Briefcase, Banknote, Receipt, Building2
} from 'lucide-react';
import { FinanceService } from '@/modules/finance/services/financeService';
import { HRService } from '@/modules/hr/services/hrService';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { LedgerTransaction, Account } from '@/modules/finance/types/finance';
import { Company } from '@/modules/shared/constants';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';

const ALL_COMPANIES: Company[] = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];
const COMPANY_COLORS: Record<string, string> = { GTK: '#2563eb', GTI: '#7c3aed', Glassco: '#059669', Nippon: '#d97706', Factory: '#64748b' };
const PIE_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#64748b'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type AnalyticsView = 'overview' | 'expenses' | 'hr' | 'sales' | 'procurement' | 'production';
const ANALYTICS_OPTIONS: { id: AnalyticsView; label: string }[] = [
  { id: 'overview', label: 'Executive Overview' },
  { id: 'sales', label: 'Sales & Revenue' },
  { id: 'expenses', label: 'Expenses & P&L' },
  { id: 'hr', label: 'Human Resources' },
  { id: 'procurement', label: 'Procurement' },
  { id: 'production', label: 'Production' },
];

const getMonthKey = (d: string) => { if (!d) return ''; const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; };
const getMonthLabel = (k: string) => { const [y,m] = k.split('-'); return `${MONTHS[parseInt(m)-1]} ${y?.slice(2)}`; };
const fmt = (n: number) => Math.abs(n) >= 1e6 ? `${(n/1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${(n/1e3).toFixed(0)}K` : n.toLocaleString();

const colorMap: Record<string, any> = {
  blue: { bg:'bg-blue-50', icon:'text-blue-600', value:'text-blue-700', border:'border-blue-100' },
  emerald: { bg:'bg-emerald-50', icon:'text-emerald-600', value:'text-emerald-700', border:'border-emerald-100' },
  amber: { bg:'bg-amber-50', icon:'text-amber-600', value:'text-amber-700', border:'border-amber-100' },
  rose: { bg:'bg-rose-50', icon:'text-rose-600', value:'text-rose-700', border:'border-rose-100' },
  slate: { bg:'bg-slate-50', icon:'text-slate-600', value:'text-slate-700', border:'border-slate-100' },
};

const KPICard: React.FC<{title:string;value:string;subtitle?:string;trend?:number;icon:React.FC<any>;color:string}> = ({title,value,subtitle,trend,icon:Icon,color}) => {
  const c = colorMap[color] || colorMap.slate;
  return (
    <div className={`bg-white rounded-2xl border ${c.border} p-5 shadow-sm hover:shadow-md transition-all`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}><Icon size={20} className={c.icon}/></div>
        {trend !== undefined && trend !== 0 && <div className={`flex items-center gap-1 text-xs font-bold ${trend>=0?'text-emerald-600':'text-rose-600'}`}>{trend>=0?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>}{Math.abs(trend).toFixed(1)}%</div>}
      </div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{title}</p>
      <p className={`text-2xl font-bold ${c.value}`}>{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
};

const ChartCard: React.FC<{title:string;subtitle?:string;children:React.ReactNode;className?:string}> = ({title,subtitle,children,className=''}) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 ${className}`}>
    <div className="mb-4"><h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{title}</h3>{subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}</div>
    {children}
  </div>
);

const CustomTooltip = ({active,payload,label}:any) => {
  if (!active||!payload?.length) return null;
  return (<div className="bg-slate-800 text-white px-3 py-2 rounded-lg shadow-xl text-xs"><p className="font-bold mb-1">{label}</p>{payload.map((p:any,i:number)=>(<p key={i} className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{background:p.color}}/>{p.name}: <span className="font-bold">PKR {Number(p.value).toLocaleString()}</span></p>))}</div>);
};

const MDDashboard: React.FC = () => {
  const selectedCompany = useAppStore(s => s.selectedCompany);
  const user = useAuthStore(s => s.user);
  const isFactory = selectedCompany === 'Factory';
  const isSuperAdmin = user?.role === 'super_admin';
  // super_admin sees all companies always; Factory user sees all; others see their own
  const isGroupView = isFactory || isSuperAdmin;
  const [activeView, setActiveView] = useState<'overview'|'factory'>('overview');
  const effectiveView = isGroupView ? activeView : 'overview';
  const [analyticsView, setAnalyticsView] = useState<AnalyticsView>('overview');
  const [drillCompany, setDrillCompany] = useState<string|null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // visible companies: group view = all, others = allowed companies from profile
  const visibleCompanies = isGroupView
    ? ALL_COMPANIES
    : (user?.allowedCompanies?.length ? user.allowedCompanies as Company[] : [selectedCompany]);

  const [ledger, setLedger] = useState<LedgerTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [pettyCash, setPettyCash] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Pull fresh from Supabase first (if online), then read localStorage
        const { supabase } = await import('@/src/services/supabaseClient');
        const tables = ['ledger','accounts','employees','quotations','requisitions','loans','petty_cash'];
        await Promise.all(tables.map(t =>
          supabase.from(t).select('*').then(({ data }) => {
            if (!data || data.length === 0) return;
            const unwrapped = data.map((row: any) =>
              row.data && typeof row.data === 'object' ? { ...row.data, id: row.id, company: row.company } : row
            );
            // Update localStorage cache
            const keyMap: Record<string,string> = {
              ledger:'gtk_erp_ledger', accounts:'gtk_erp_accounts', employees:'gtk_erp_employees',
              quotations:'gtk_erp_quotations', requisitions:'gtk_erp_requisitions',
              loans:'gtk_erp_loans', petty_cash:'gtk_erp_petty_cash'
            };
            if (keyMap[t]) localStorage.setItem(keyMap[t], JSON.stringify(unwrapped));
          })
        ));
      } catch(e) { console.warn('[MD] Supabase fetch failed, using cache:', e); }

      // Read from localStorage (now fresh)
      try {
        setLedger(FinanceService.getLedger()); setAccounts(FinanceService.getAccounts());
        setEmployees(HRService.getEmployees()); setQuotations(SalesService.getQuotations());
        setRequisitions(InventoryService.getRequisitions()); setLoans(HRService.getLoans());
        setPettyCash(FinanceService.getPettyCashEntries());
      } catch(e) { console.warn('[MD]',e); }
      setIsLoading(false);
    };
    loadData();
  }, []);

  const filtered = useMemo(() => {
    const vc = new Set(visibleCompanies);
    return { ledger:ledger.filter(t=>vc.has(t.company)), accounts:accounts.filter(a=>vc.has(a.company)), employees:employees.filter(e=>vc.has(e.company)), quotations:quotations.filter(q=>vc.has(q.company)), requisitions:requisitions.filter(r=>vc.has(r.company)), loans:loans.filter(l=>vc.has(l.company)), pettyCash:pettyCash.filter(p=>vc.has(p.company)) };
  }, [visibleCompanies, ledger, accounts, employees, quotations, requisitions, loans, pettyCash]);

  const analytics = useMemo(() => {
    const now = new Date();
    const expIds = new Set(filtered.accounts.filter(a=>a.code?.startsWith('5')||a.code?.startsWith('6')).map(a=>a.id));
    const cashIds = new Set(filtered.accounts.filter(a=>a.code?.startsWith('1001')||a.code?.startsWith('111')).map(a=>a.id));
    const recIds = new Set(filtered.accounts.filter(a=>a.code?.startsWith('12')).map(a=>a.id));
    const posted = filtered.ledger.filter(t=>t.status==='Posted');
    const approved = filtered.quotations.filter(q=>q.status==='Approved');
    const sumItems = (q:any) => (q.items||[]).reduce((s:number,i:any)=>s+(i.amount||i.total||0),0);

    const totalRevenue = approved.reduce((s,q)=>s+sumItems(q),0);
    const totalExpenses = posted.reduce((s,t)=>s+(t.details||[]).filter(d=>expIds.has(d.accountId)).reduce((si,d)=>si+(d.debit||0),0),0);
    const cashIn = posted.reduce((s,t)=>s+(t.details||[]).filter(d=>cashIds.has(d.accountId)).reduce((si,d)=>si+(d.debit||0),0),0);
    const cashOut = posted.reduce((s,t)=>s+(t.details||[]).filter(d=>cashIds.has(d.accountId)).reduce((si,d)=>si+(d.credit||0),0),0);
    const totalRec = posted.reduce((s,t)=>s+(t.details||[]).filter(d=>recIds.has(d.accountId)).reduce((si,d)=>si+((d.debit||0)-(d.credit||0)),0),0);
    const activeEmps = filtered.employees.filter(e=>e.status!=='Inactive'&&e.status!=='Terminated');
    const activeLoans = filtered.loans.filter(l=>l.status==='Active'||l.status==='Running'||!l.status);
    const pendingReqs = filtered.requisitions.filter(r=>r.status==='Pending'||r.status==='Draft');

    // Monthly
    const md: Record<string,{revenue:number;expenses:number}> = {};
    for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);md[getMonthKey(d.toISOString())]={revenue:0,expenses:0};}
    approved.forEach(q=>{const mk=getMonthKey(q.date);if(md[mk])md[mk].revenue+=sumItems(q);});
    posted.forEach(t=>{const mk=getMonthKey(t.date||t.docDate);if(md[mk])(t.details||[]).forEach(d=>{if(expIds.has(d.accountId))md[mk].expenses+=(d.debit||0);});});
    const monthlyChartData = Object.entries(md).map(([k,v])=>({month:getMonthLabel(k),revenue:Math.round(v.revenue),expenses:Math.round(v.expenses)}));

    const companyRevenue = visibleCompanies.map(c=>({name:c,value:Math.round(approved.filter(q=>q.company===c).reduce((s,q)=>s+sumItems(q),0))})).filter(c=>c.value>0);

    // Aging
    const todayMs=now.getTime(); const aging:Record<string,number>={'0-30':0,'31-60':0,'61-90':0,'90+':0};
    approved.forEach(q=>{const days=Math.floor((todayMs-new Date(q.date).getTime())/864e5);const a=sumItems(q);if(days<=30)aging['0-30']+=a;else if(days<=60)aging['31-60']+=a;else if(days<=90)aging['61-90']+=a;else aging['90+']+=a;});
    const agingData=[{bucket:'0-30 days',amount:Math.round(aging['0-30']),fill:'#2563eb'},{bucket:'31-60 days',amount:Math.round(aging['31-60']),fill:'#d97706'},{bucket:'61-90 days',amount:Math.round(aging['61-90']),fill:'#ea580c'},{bucket:'90+ days',amount:Math.round(aging['90+']),fill:'#e11d48'}];

    // Expense categories
    const expCat:Record<string,number>={};
    posted.forEach(t=>(t.details||[]).forEach(d=>{if(expIds.has(d.accountId)){const acc=filtered.accounts.find(a=>a.id===d.accountId);expCat[acc?.name||'Other']=(expCat[acc?.name||'Other']||0)+(d.debit||0);}}));
    const topExpenses = Object.entries(expCat).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([n,v])=>({name:n.length>25?n.slice(0,25)+'...':n,value:Math.round(v)}));

    // HR
    const deptCount:Record<string,number>={};
    activeEmps.forEach(e=>{const d=e.work?.department||e.department||'Unassigned';deptCount[d]=(deptCount[d]||0)+1;});
    const deptData = Object.entries(deptCount).sort((a,b)=>b[1]-a[1]).map(([n,v])=>({name:n,value:v}));
    const totalSalary = activeEmps.reduce((s,e)=>{const b=e.salary?.basic||e.basic||0;const h=e.salary?.houseRent||e.houseRent||e.house_rent||0;const c=e.salary?.conveyance||e.conveyance||0;const sp=e.salary?.specialAllowance||e.specialAllowance||e.special_allowance||0;return s+b+h+c+sp;},0);

    const pipeline = { drafts:filtered.quotations.filter(q=>q.status==='Draft').length, approved:approved.length, total:filtered.quotations.length };

    const factoryData = visibleCompanies.map(company=>({
      company, employees:activeEmps.filter(e=>e.company===company).length,
      pendingReqs:pendingReqs.filter(r=>r.company===company).length,
      pendingReqValue:pendingReqs.filter(r=>r.company===company).reduce((s,r)=>s+(r.totalValue||r.estimatedAmount||0),0),
      loansOutstanding:activeLoans.filter(l=>l.company===company).reduce((s,l)=>s+(l.balance||l.amount||0),0),
      pettyCashBalance:filtered.pettyCash.filter(p=>p.company===company).reduce((s,p)=>s+(p.type==='Receipt'?(p.amount||0):-(p.amount||0)),0),
      revenue:approved.filter(q=>q.company===company).reduce((s,q)=>s+sumItems(q),0),
      expenses:posted.filter(t=>t.company===company).reduce((s,t)=>s+(t.details||[]).filter(d=>expIds.has(d.accountId)).reduce((si,d)=>si+(d.debit||0),0),0),
      salary:activeEmps.filter(e=>e.company===company).reduce((s,e)=>s+(e.salary?.basic||e.basic||0)+(e.salary?.houseRent||e.houseRent||0)+(e.salary?.conveyance||e.conveyance||0)+(e.salary?.specialAllowance||e.specialAllowance||0),0),
      color:COMPANY_COLORS[company]||'#64748b',
    }));

    return { totalRevenue, totalExpenses, netProfit:totalRevenue-totalExpenses, cashPosition:cashIn-cashOut, totalReceivables:totalRec, activeEmployees:activeEmps.length, loansOutstanding:activeLoans.reduce((s,l)=>s+(l.balance||l.amount||0),0), pendingReqs:pendingReqs.length, pendingReqValue:pendingReqs.reduce((s,r)=>s+(r.totalValue||r.estimatedAmount||0),0), monthlyChartData, companyRevenue, agingData, topExpenses, deptData, totalSalary, pipeline, factoryData };
  }, [filtered, visibleCompanies]);

  // Phase 11 — Low stock
  const lowStockItems = useMemo(() => {
    try { return InventoryService.getLowStockItems(selectedCompany); } catch { return []; }
  }, [selectedCompany]);
  const criticalCount = lowStockItems.filter(a => a.alertLevel === 'red').length;
  const lowCount = lowStockItems.filter(a => a.alertLevel === 'orange').length;

  if(isLoading) return <div className="space-y-6 animate-slide-up"><div className="skeleton skeleton-heading"/><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({length:8}).map((_,i)=><div key={i} className="skeleton skeleton-card"/>)}</div></div>;

  // ── DRILL DOWN ──────────────────────────────────────────────────────
  if(drillCompany){
    const cd = analytics.factoryData.find(d=>d.company===drillCompany);
    if(!cd){setDrillCompany(null);return null;}
    const compEmps = filtered.employees.filter(e=>e.company===drillCompany&&e.status!=='Inactive');
    const compReqs = filtered.requisitions.filter(r=>r.company===drillCompany);
    const compLoans = filtered.loans.filter(l=>l.company===drillCompany&&(l.status==='Active'||l.status==='Running'||!l.status));
    const compPc = filtered.pettyCash.filter(p=>p.company===drillCompany).slice(-10).reverse();
    return (
      <div className="space-y-6 animate-slide-up">
        <div className="flex items-center gap-4">
          <button onClick={()=>setDrillCompany(null)} className="p-2 bg-white rounded-xl border border-slate-200 hover:bg-slate-50" aria-label="Go back"><ArrowLeft size={20} className="text-slate-600"/></button>
          <div><h1 className="text-2xl font-bold text-slate-900">{drillCompany} — Detailed View</h1><p className="text-sm text-slate-400">Business unit drill-down</p></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-stagger">
          <KPICard title="Revenue" value={`PKR ${fmt(cd.revenue)}`} icon={TrendingUp} color="blue"/>
          <KPICard title="Expenses" value={`PKR ${fmt(cd.expenses)}`} icon={Receipt} color="rose"/>
          <KPICard title="Employees" value={String(cd.employees)} icon={Users} color="blue" subtitle={`Salary: PKR ${fmt(cd.salary)}`}/>
          <KPICard title="Petty Cash" value={`PKR ${fmt(cd.pettyCashBalance)}`} icon={Wallet} color="emerald"/>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title={`Employees`} subtitle={`${compEmps.length} active`}>
            <div className="max-h-[300px] overflow-auto"><table className="w-full sap-table"><thead><tr><th>Name</th><th>Designation</th><th className="text-right">Salary</th></tr></thead><tbody>
            {compEmps.slice(0,15).map((e:any)=><tr key={e.id}><td className="font-bold">{e.personal?.name||e.name||'\u2014'}</td><td className="text-slate-500">{e.work?.designation||e.designation||'\u2014'}</td><td className="text-right font-bold">PKR {((e.salary?.basic||e.basic||0)+(e.salary?.houseRent||e.houseRent||0)+(e.salary?.conveyance||e.conveyance||0)+(e.salary?.specialAllowance||e.specialAllowance||0)).toLocaleString()}</td></tr>)}
            </tbody></table></div>
          </ChartCard>
          <ChartCard title={`Requisitions`} subtitle={`${compReqs.filter(r=>r.status==='Pending'||r.status==='Draft').length} pending`}>
            <div className="max-h-[300px] overflow-auto"><table className="w-full sap-table"><thead><tr><th>ID</th><th>Status</th><th className="text-right">Value</th></tr></thead><tbody>
            {compReqs.slice(0,15).map((r:any)=><tr key={r.id}><td className="font-bold text-blue-600">{r.id}</td><td><span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${r.status==='Approved'?'bg-emerald-50 text-emerald-700':r.status==='Pending'?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-600'}`}>{r.status}</span></td><td className="text-right font-bold">PKR {(r.totalValue||r.estimatedAmount||0).toLocaleString()}</td></tr>)}
            </tbody></table></div>
          </ChartCard>
          <ChartCard title={`Loans & Advances`} subtitle={`${compLoans.length} active`}>
            <div className="max-h-[300px] overflow-auto"><table className="w-full sap-table"><thead><tr><th>Employee</th><th>Type</th><th className="text-right">Balance</th></tr></thead><tbody>
            {compLoans.slice(0,10).map((l:any)=><tr key={l.id}><td className="font-bold">{l.employeeName||l.employee_name||'\u2014'}</td><td className="text-slate-500">{l.loanType||l.type||'Loan'}</td><td className="text-right font-bold text-blue-700">PKR {(l.balance||l.amount||0).toLocaleString()}</td></tr>)}
            {compLoans.length===0&&<tr><td colSpan={3} className="text-center text-slate-400 py-6">No active loans</td></tr>}
            </tbody></table></div>
          </ChartCard>
          <ChartCard title={`Petty Cash`} subtitle={`Balance: PKR ${cd.pettyCashBalance.toLocaleString()}`}>
            <div className="max-h-[300px] overflow-auto"><table className="w-full sap-table"><thead><tr><th>Date</th><th>Description</th><th className="text-right">Amount</th></tr></thead><tbody>
            {compPc.map((p:any)=><tr key={p.id}><td className="text-slate-500">{p.date}</td><td className="font-bold">{p.description||'\u2014'}</td><td className={`text-right font-bold ${p.type==='Receipt'?'text-emerald-700':'text-rose-700'}`}>{p.type==='Receipt'?'+':'-'}PKR {(p.amount||0).toLocaleString()}</td></tr>)}
            {compPc.length===0&&<tr><td colSpan={3} className="text-center text-slate-400 py-6">No transactions</td></tr>}
            </tbody></table></div>
          </ChartCard>
        </div>
      </div>
    );
  }

  // ── MAIN RENDER ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-slide-up">
      {/* Phase 11 — Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5"/>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-black uppercase text-red-700">Low Stock Alert</span>
              {criticalCount > 0 && <span className="text-[10px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full">{criticalCount} Critical</span>}
              {lowCount > 0 && <span className="text-[10px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full">{lowCount} Low</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.slice(0, 8).map(a => (
                <div key={a.item.id} className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-xl border ${a.alertLevel === 'red' ? 'bg-red-100 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                  <span className="uppercase">{a.item.name.slice(0,18)}</span>
                  <span className="font-black">{a.unrestrictedQty.toFixed(0)} {a.item.unit}</span>
                  <span className="text-[9px] opacity-60">/ {a.reorderPoint} ROP</span>
                </div>
              ))}
              {lowStockItems.length > 8 && <span className="text-[10px] text-red-400 font-bold self-center">+{lowStockItems.length - 8} more in Inventory</span>}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">MD Dashboard</h1><p className="text-sm text-slate-400 mt-1">{isFactory?'GlassTech Group \u2014 All Companies':`${selectedCompany} Unit`}</p></div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={analyticsView} onChange={e=>{setAnalyticsView(e.target.value as AnalyticsView);setActiveView('overview');}} className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold uppercase text-slate-700 cursor-pointer hover:border-blue-300 transition-colors">
            {ANALYTICS_OPTIONS.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          {isGroupView && <div className="bg-white rounded-xl border border-slate-200 p-1 flex">
            <button onClick={()=>setActiveView('overview')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${effectiveView==='overview'?'bg-blue-600 text-white shadow-sm':'text-slate-500 hover:bg-slate-50'}`}><BarChart3 size={14} className="inline mr-1.5"/>Charts</button>
            <button onClick={()=>setActiveView('factory')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${effectiveView==='factory'?'bg-blue-600 text-white shadow-sm':'text-slate-500 hover:bg-slate-50'}`}><Factory size={14} className="inline mr-1.5"/>Companies</button>
          </div>}
        </div>
      </div>

      {effectiveView==='overview' && <>
        {analyticsView==='overview' && <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-stagger">
            <KPICard title="Total Revenue" value={`PKR ${fmt(analytics.totalRevenue)}`} icon={TrendingUp} color="blue"/>
            <KPICard title="Total Expenses" value={`PKR ${fmt(analytics.totalExpenses)}`} icon={CreditCard} color="rose"/>
            <KPICard title="Net Profit" value={`PKR ${fmt(analytics.netProfit)}`} icon={DollarSign} color={analytics.netProfit>=0?'emerald':'rose'}/>
            <KPICard title="Cash Position" value={`PKR ${fmt(analytics.cashPosition)}`} icon={Wallet} color="emerald"/>
            <KPICard title="Receivables" value={`PKR ${fmt(analytics.totalReceivables)}`} icon={Clock} color="amber"/>
            <KPICard title="Pending Reqs" value={String(analytics.pendingReqs)} icon={ShoppingBag} color="amber" subtitle={`PKR ${analytics.pendingReqValue.toLocaleString()}`}/>
            <KPICard title="Employees" value={String(analytics.activeEmployees)} icon={Users} color="blue"/>
            <KPICard title="Loans Outstanding" value={`PKR ${fmt(analytics.loansOutstanding)}`} icon={FileText} color="slate"/>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartCard title="Revenue vs Expenses" subtitle="Last 6 months" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={280}><BarChart data={analytics.monthlyChartData} barGap={4}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)}/><Tooltip content={<CustomTooltip/>}/><Bar dataKey="revenue" name="Revenue" fill="#2563eb" radius={[6,6,0,0]}/><Bar dataKey="expenses" name="Expenses" fill="#e11d48" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Revenue by Company">
              {analytics.companyRevenue.length>0?<ResponsiveContainer width="100%" height={280}><PieChart><Pie data={analytics.companyRevenue} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">{analytics.companyRevenue.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}</Pie><Tooltip formatter={(v:number)=>[`PKR ${v.toLocaleString()}`,'Revenue']}/><Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11,fontWeight:700}}/></PieChart></ResponsiveContainer>:<div className="h-[280px] flex items-center justify-center text-sm text-slate-400">No data</div>}
            </ChartCard>
          </div>
        </>}

        {analyticsView==='sales' && <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-stagger">
            <KPICard title="Total Revenue" value={`PKR ${fmt(analytics.totalRevenue)}`} icon={TrendingUp} color="blue"/>
            <KPICard title="Quotations" value={String(analytics.pipeline.total)} icon={FileText} color="slate"/>
            <KPICard title="Approved" value={String(analytics.pipeline.approved)} icon={CheckCircle} color="emerald"/>
            <KPICard title="Drafts" value={String(analytics.pipeline.drafts)} icon={Clock} color="amber"/>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartCard title="Monthly Revenue" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={280}><AreaChart data={analytics.monthlyChartData}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)}/><Tooltip content={<CustomTooltip/>}/><Area type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" fill="#dbeafe" strokeWidth={2}/></AreaChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Receivables Aging">
              <ResponsiveContainer width="100%" height={280}><BarChart data={analytics.agingData} layout="vertical" barSize={24}><XAxis type="number" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)}/><YAxis type="category" dataKey="bucket" tick={{fontSize:11,fill:'#64748b',fontWeight:700}} axisLine={false} tickLine={false} width={80}/><Tooltip formatter={(v:number)=>[`PKR ${v.toLocaleString()}`,'Amount']}/><Bar dataKey="amount" radius={[0,8,8,0]}>{analytics.agingData.map((e,i)=><Cell key={i} fill={e.fill}/>)}</Bar></BarChart></ResponsiveContainer>
            </ChartCard>
          </div>
        </>}

        {analyticsView==='expenses' && <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-stagger">
            <KPICard title="Total Expenses" value={`PKR ${fmt(analytics.totalExpenses)}`} icon={Receipt} color="rose"/>
            <KPICard title="Salary Cost" value={`PKR ${fmt(analytics.totalSalary)}`} icon={Users} color="amber" subtitle="Monthly"/>
            <KPICard title="Net Profit" value={`PKR ${fmt(analytics.netProfit)}`} icon={DollarSign} color={analytics.netProfit>=0?'emerald':'rose'}/>
            <KPICard title="Expense Ratio" value={analytics.totalRevenue>0?`${((analytics.totalExpenses/analytics.totalRevenue)*100).toFixed(1)}%`:'\u2014'} icon={TrendingDown} color="slate"/>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Top Expense Categories">
              <ResponsiveContainer width="100%" height={320}><BarChart data={analytics.topExpenses} layout="vertical" barSize={20}><XAxis type="number" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)}/><YAxis type="category" dataKey="name" tick={{fontSize:10,fill:'#64748b',fontWeight:600}} axisLine={false} tickLine={false} width={160}/><Tooltip formatter={(v:number)=>[`PKR ${v.toLocaleString()}`,'Amount']}/><Bar dataKey="value" name="Expense" fill="#e11d48" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Revenue vs Expenses Trend">
              <ResponsiveContainer width="100%" height={320}><LineChart data={analytics.monthlyChartData}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)}/><Tooltip content={<CustomTooltip/>}/><Line type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2.5} dot={{r:4}}/><Line type="monotone" dataKey="expenses" name="Expenses" stroke="#e11d48" strokeWidth={2.5} dot={{r:4}}/><Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11,fontWeight:700}}/></LineChart></ResponsiveContainer>
            </ChartCard>
          </div>
        </>}

        {analyticsView==='hr' && <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-stagger">
            <KPICard title="Active Employees" value={String(analytics.activeEmployees)} icon={Users} color="blue"/>
            <KPICard title="Monthly Salary" value={`PKR ${fmt(analytics.totalSalary)}`} icon={Banknote} color="amber"/>
            <KPICard title="Loans Outstanding" value={`PKR ${fmt(analytics.loansOutstanding)}`} icon={CreditCard} color="rose"/>
            <KPICard title="Departments" value={String(analytics.deptData.length)} icon={Building2} color="slate"/>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Employees by Department">
              <ResponsiveContainer width="100%" height={280}><BarChart data={analytics.deptData} layout="vertical" barSize={20}><XAxis type="number" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" tick={{fontSize:11,fill:'#64748b',fontWeight:700}} axisLine={false} tickLine={false} width={120}/><Tooltip/><Bar dataKey="value" name="Count" fill="#2563eb" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Headcount by Company">
              <ResponsiveContainer width="100%" height={280}><PieChart><Pie data={analytics.factoryData.map(d=>({name:d.company,value:d.employees}))} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">{analytics.factoryData.map((d,i)=><Cell key={i} fill={d.color}/>)}</Pie><Tooltip/><Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11,fontWeight:700}}/></PieChart></ResponsiveContainer>
            </ChartCard>
          </div>
        </>}

        {analyticsView==='procurement' && <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-stagger">
            <KPICard title="Pending Reqs" value={String(analytics.pendingReqs)} icon={ShoppingBag} color="amber" subtitle={`PKR ${analytics.pendingReqValue.toLocaleString()}`}/>
            <KPICard title="Total Reqs" value={String(filtered.requisitions.length)} icon={FileText} color="slate"/>
            <KPICard title="Approved" value={String(filtered.requisitions.filter(r=>r.status==='Approved').length)} icon={CheckCircle} color="emerald"/>
            <KPICard title="Rejected" value={String(filtered.requisitions.filter(r=>r.status==='Rejected').length)} icon={AlertTriangle} color="rose"/>
          </div>
          <ChartCard title="Requisitions by Company">
            <ResponsiveContainer width="100%" height={280}><BarChart data={visibleCompanies.map(c=>({company:c,pending:filtered.requisitions.filter(r=>r.company===c&&(r.status==='Pending'||r.status==='Draft')).length,approved:filtered.requisitions.filter(r=>r.company===c&&r.status==='Approved').length}))} barGap={4}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="company" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="pending" name="Pending" fill="#d97706" radius={[6,6,0,0]}/><Bar dataKey="approved" name="Approved" fill="#059669" radius={[6,6,0,0]}/><Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11,fontWeight:700}}/></BarChart></ResponsiveContainer>
          </ChartCard>
        </>}

        {analyticsView==='production' && <div className="text-center py-20"><Factory size={48} className="text-slate-300 mx-auto mb-4"/><h3 className="text-lg font-bold text-slate-600">Production Analytics</h3><p className="text-sm text-slate-400 mt-2">Coming soon</p></div>}
      </>}

      {effectiveView==='factory' && <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-stagger">
          {analytics.factoryData.map(d=>(
            <div key={d.company} onClick={()=>setDrillCompany(d.company)} tabIndex={0} role="button" onKeyDown={(e:any)=>e.key==='Enter'&&setDrillCompany(d.company)} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer group">
              <div className="h-1.5 group-hover:h-2 transition-all" style={{background:d.color}}/>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{background:d.color}}>{d.company.slice(0,2).toUpperCase()}</div>
                  <div className="flex-1"><h3 className="text-sm font-bold text-slate-800 uppercase">{d.company}</h3><p className="text-xs text-slate-400">Click for details</p></div>
                  <ArrowUpRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors"/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 font-bold uppercase">Revenue</p><p className="text-lg font-bold text-slate-800">PKR {fmt(d.revenue)}</p></div>
                  <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 font-bold uppercase">Employees</p><p className="text-lg font-bold text-slate-800">{d.employees}</p></div>
                  <div className="bg-amber-50 rounded-xl p-3"><p className="text-xs text-amber-600 font-bold uppercase">Pending Reqs</p><p className="text-lg font-bold text-amber-700">{d.pendingReqs}</p></div>
                  <div className="bg-emerald-50 rounded-xl p-3"><p className="text-xs text-emerald-600 font-bold uppercase">Petty Cash</p><p className="text-lg font-bold text-emerald-700">PKR {fmt(d.pettyCashBalance)}</p></div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <ChartCard title="Cross-Company Summary">
          <div className="overflow-x-auto"><table className="w-full sap-table"><thead><tr><th>Company</th><th className="text-right">Revenue</th><th className="text-right">Expenses</th><th className="text-right">Employees</th><th className="text-right">Pending</th><th className="text-right">Petty Cash</th></tr></thead><tbody>
          {analytics.factoryData.map(d=><tr key={d.company} className="cursor-pointer hover:bg-blue-50" onClick={()=>setDrillCompany(d.company)}><td className="font-bold"><span className="w-3 h-3 rounded-full inline-block mr-2" style={{background:d.color}}/>{d.company}</td><td className="text-right font-bold">PKR {d.revenue.toLocaleString()}</td><td className="text-right font-bold text-rose-600">PKR {d.expenses.toLocaleString()}</td><td className="text-right">{d.employees}</td><td className="text-right">{d.pendingReqs>0?<span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">{d.pendingReqs}</span>:'\u2014'}</td><td className="text-right font-bold text-emerald-700">PKR {d.pettyCashBalance.toLocaleString()}</td></tr>)}
          <tr className="border-t-2 border-slate-300 bg-slate-50"><td className="font-bold">TOTAL</td><td className="text-right font-bold">PKR {analytics.factoryData.reduce((s,d)=>s+d.revenue,0).toLocaleString()}</td><td className="text-right font-bold text-rose-600">PKR {analytics.factoryData.reduce((s,d)=>s+d.expenses,0).toLocaleString()}</td><td className="text-right font-bold">{analytics.factoryData.reduce((s,d)=>s+d.employees,0)}</td><td className="text-right font-bold">{analytics.factoryData.reduce((s,d)=>s+d.pendingReqs,0)}</td><td className="text-right font-bold text-emerald-700">PKR {analytics.factoryData.reduce((s,d)=>s+d.pettyCashBalance,0).toLocaleString()}</td></tr>
          </tbody></table></div>
        </ChartCard>
      </>}
    </div>
  );
};

export default MDDashboard;
