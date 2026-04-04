import React, { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  Users, AlertTriangle, RefreshCw, Loader2,
  ShoppingBag, BarChart3, CheckCircle2, Clock
} from 'lucide-react';
import { FinanceService } from '@/modules/finance/services/financeService';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { HRService } from '@/modules/hr/services/hrService';
import { supabase } from '@/src/services/supabaseClient';

// ── Helpers ───────────────────────────────────────────────────────────
const fmt = (n: number): string =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` :
  Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(0)}K` :
  n.toLocaleString();

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ── KPI Card ──────────────────────────────────────────────────────────
const KPICard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  trend?: number;
  icon: React.ElementType;
  color: string;
  alert?: boolean;
}> = ({ label, value, sub, trend, icon: Icon, color, alert }) => {
  const COLORS: Record<string, string> = {
    blue:   'bg-blue-500/10 border-blue-500/20 text-blue-400',
    green:  'bg-green-500/10 border-green-500/20 text-green-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
    red:    'bg-red-500/10 border-red-500/20 text-red-400',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
    slate:  'bg-slate-500/10 border-slate-500/20 text-slate-400',
  };
  return (
    <div className={`rounded-xl border p-4 ${COLORS[color] ?? COLORS.slate} ${alert ? 'animate-pulse' : ''}`}>
      <div className="flex items-start justify-between">
        <Icon size={16} />
        {trend !== undefined && (
          <span className={`text-[10px] font-bold flex items-center gap-0.5 ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="font-black text-white text-xl mt-2">{value}</div>
      <div className="text-[10px] uppercase tracking-widest mt-0.5 opacity-70">{label}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
};

// ── Section Header ────────────────────────────────────────────────────
const SectionHeader: React.FC<{ label: string; icon: React.ElementType }> = ({ label, icon: Icon }) => (
  <div className="flex items-center gap-2 mt-2">
    <Icon size={13} className="text-slate-500" />
    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{label}</span>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────
const MISDashboard: React.FC = () => {
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Raw data
  const [salesData, setSalesData]         = useState<any>({});
  const [financeData, setFinanceData]     = useState<any>({});
  const [productionData, setProductionData] = useState<any>({});
  const [procurementData, setProcurementData] = useState<any>({});
  const [hrData, setHrData]               = useState<any>({});
  const [agentData, setAgentData]         = useState<any>({});

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      // ── Sales ──────────────────────────────────────────────────
      const quotations = SalesService.getQuotations().filter(q => q.company === 'Glassco');
      const invoices   = SalesService.getInvoices().filter((i: any) => i.company === 'Glassco');
      const month      = thisMonth();

      const monthQuotes  = quotations.filter(q => q.date?.startsWith(month));
      const totalRevenue = invoices.reduce((s: number, i: any) => s + (i.amount || i.totalAmount || 0), 0);
      const monthRevenue = invoices
        .filter((i: any) => (i.date || i.invoiceDate || '')?.startsWith(month))
        .reduce((s: number, i: any) => s + (i.amount || i.totalAmount || 0), 0);

      setSalesData({
        totalQuotations:  quotations.length,
        monthQuotations:  monthQuotes.length,
        totalRevenue,
        monthRevenue,
        pendingInvoices:  invoices.filter((i: any) => i.status === 'Outstanding' || i.status === 'Partial' || i.status === 'Overdue').length,
      });

      // ── Finance ────────────────────────────────────────────────
      const ledger  = FinanceService.getLedger().filter((l: any) => l.company === 'Glassco');
      const petty   = FinanceService.getPettyCashEntries().filter((p: any) => p.company === 'Glassco');
      const monthPetty = petty.filter((p: any) => p.date?.startsWith(month));
      const monthExpenses = monthPetty.reduce((s: number, p: any) => s + (p.amount || 0), 0);

      setFinanceData({
        monthExpenses,
        totalPetty:     petty.reduce((s: number, p: any) => s + (p.amount || 0), 0),
        ledgerEntries:  ledger.length,
      });

      // ── Production ─────────────────────────────────────────────
      const pieces = ProductionService.getProductionPieces();
      const gPieces = pieces.filter(p => (p as any).company === 'Glassco' || true);
      setProductionData({
        activePieces:   gPieces.filter(p => !['Delivered','Broken'].includes(p.status)).length,
        readyDispatch:  gPieces.filter(p => p.status === 'Ready to Dispatch' || p.status === 'QC-Passed').length,
        qcFailed:       gPieces.filter(p => p.status === 'QC-Failed').length,
        broken:         gPieces.filter(p => p.status === 'Broken').length,
      });

      // ── Procurement ─────────────────────────────────────────────
      const reqs = InventoryService.getRequisitions().filter((r: any) => r.company === 'Glassco' || r.company === 'Factory');
      const pos  = InventoryService.getPurchaseOrders().filter((p: any) => p.company === 'Glassco');
      setProcurementData({
        pendingReqs:  reqs.filter((r: any) => r.status === 'Pending' || r.status === 'Draft').length,
        openPOs:      pos.filter((p: any) => !['GRN Done', 'Paid'].includes(p.status)).length,
        totalReqs:    reqs.length,
      });

      // ── HR ──────────────────────────────────────────────────────
      const emps = HRService.getEmployees().filter(e => e.company === 'Glassco');
      setHrData({
        totalEmployees: emps.filter(e => !['resigned', 'terminated'].includes(e.work?.status as string ?? '')).length,
      });

      // ── Agent data (Supabase) ───────────────────────────────────
      const [
        { count: urgentEvents },
        { count: unreadAlerts },
        { count: openTasks },
        { count: escalations },
        { count: openHSE },
      ] = await Promise.all([
        supabase.from('factory_events').select('id', { count: 'exact', head: true }).eq('priority', 'Urgent').in('status', ['Open', 'Pending']),
        supabase.from('agent_alert_history').select('id', { count: 'exact', head: true }).eq('read', false),
        supabase.from('agent_tasks').select('id', { count: 'exact', head: true }).in('status', ['Open', 'In Progress']),
        supabase.from('factory_escalation_alerts').select('id', { count: 'exact', head: true }).eq('resolved', false),
        supabase.from('hse_incidents').select('id', { count: 'exact', head: true }).eq('closed', false),
      ]);

      setAgentData({ urgentEvents, unreadAlerts, openTasks, escalations, openHSE });
    } catch (err) {
      console.error('MIS load error:', err);
    }
    setLoading(false);
    setLastRefresh(new Date());
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 size={24} className="animate-spin text-slate-500" />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">MIS Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            GlassCo · {lastRefresh.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Alert strip */}
      {(agentData.urgentEvents > 0 || agentData.escalations > 0) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
          <span className="text-red-400 text-xs font-bold">
            {agentData.urgentEvents} urgent events
            {agentData.escalations > 0 && ` · ${agentData.escalations} escalations`}
            {' '}— attention needed
          </span>
        </div>
      )}

      {/* ── Sales & Revenue ── */}
      <SectionHeader label="Sales & Revenue" icon={TrendingUp} />
      <div className="grid grid-cols-2 gap-2">
        <KPICard label="Month Revenue"  value={`PKR ${fmt(salesData.monthRevenue ?? 0)}`}   icon={DollarSign} color="green" />
        <KPICard label="Total Revenue"  value={`PKR ${fmt(salesData.totalRevenue ?? 0)}`}   icon={BarChart3}  color="blue"  />
        <KPICard label="Month Quotes"   value={salesData.monthQuotations ?? 0}               icon={TrendingUp} color="purple" />
        <KPICard label="Pending Invoice" value={salesData.pendingInvoices ?? 0}
          icon={Clock} color={salesData.pendingInvoices > 5 ? 'red' : 'yellow'}
          alert={salesData.pendingInvoices > 10} />
      </div>

      {/* ── Production ── */}
      <SectionHeader label="Production Floor" icon={Package} />
      <div className="grid grid-cols-2 gap-2">
        <KPICard label="Active Pieces"   value={productionData.activePieces ?? 0}   icon={Package}       color="blue"   />
        <KPICard label="Ready Dispatch"  value={productionData.readyDispatch ?? 0}  icon={CheckCircle2}  color="green"  />
        <KPICard label="QC Failed"       value={productionData.qcFailed ?? 0}
          icon={AlertTriangle} color={productionData.qcFailed > 0 ? 'red' : 'slate'}
          alert={productionData.qcFailed > 5} />
        <KPICard label="Broken Pieces"   value={productionData.broken ?? 0}
          icon={AlertTriangle} color={productionData.broken > 0 ? 'yellow' : 'slate'} />
      </div>

      {/* ── Finance ── */}
      <SectionHeader label="Finance" icon={DollarSign} />
      <div className="grid grid-cols-2 gap-2">
        <KPICard label="Month Expenses"  value={`PKR ${fmt(financeData.monthExpenses ?? 0)}`} icon={TrendingDown} color="red"    />
        <KPICard label="GL Entries"      value={financeData.ledgerEntries ?? 0}                icon={BarChart3}   color="slate"  />
      </div>

      {/* ── Procurement ── */}
      <SectionHeader label="Procurement" icon={ShoppingBag} />
      <div className="grid grid-cols-2 gap-2">
        <KPICard label="Pending Reqs"  value={procurementData.pendingReqs ?? 0}
          icon={Clock} color={procurementData.pendingReqs > 5 ? 'yellow' : 'slate'} />
        <KPICard label="Open POs"      value={procurementData.openPOs ?? 0}
          icon={ShoppingBag} color="blue" />
      </div>

      {/* ── Agent & Ops ── */}
      <SectionHeader label="Operations" icon={AlertTriangle} />
      <div className="grid grid-cols-2 gap-2">
        <KPICard label="Urgent Events"  value={agentData.urgentEvents ?? 0}
          icon={AlertTriangle} color={agentData.urgentEvents > 0 ? 'red' : 'slate'}
          alert={agentData.urgentEvents > 0} />
        <KPICard label="Unread Alerts"  value={agentData.unreadAlerts ?? 0}
          icon={Clock} color={agentData.unreadAlerts > 0 ? 'yellow' : 'slate'} />
        <KPICard label="Open Tasks"     value={agentData.openTasks ?? 0}
          icon={CheckCircle2} color="blue" />
        <KPICard label="HSE Incidents"  value={agentData.openHSE ?? 0}
          icon={AlertTriangle} color={agentData.openHSE > 0 ? 'orange' : 'slate'} />
      </div>

      {/* ── HR ── */}
      <SectionHeader label="Human Capital" icon={Users} />
      <div className="grid grid-cols-2 gap-2">
        <KPICard label="Active Staff (GlassCo)" value={hrData.totalEmployees ?? 0} icon={Users} color="purple" />
      </div>

      <div className="h-4" />
    </div>
  );
};

export default MISDashboard;
