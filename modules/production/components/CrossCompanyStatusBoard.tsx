/**
 * CrossCompanyStatusBoard.tsx — Phase 6D
 *
 * GTK/GTI users can see their glass orders at GlassCo in real-time.
 * Visual pipeline: Pending → Cutting → Processing → Tempering → Ready → Delivered
 * Read-only for GTK/GTI — only GlassCo updates status.
 * No phone calls needed.
 */

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionPiece, Quotation, Client } from '@/modules/shared/types';
import { 
  Scissors, Flame, Truck, CheckCircle2, Clock, Package,
  Building2, RefreshCw, Eye, ChevronRight, AlertTriangle
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

type OrderStage = 'Pending' | 'Cutting' | 'Processing' | 'Tempering' | 'Ready' | 'Delivered';

interface CrossCompanyOrder {
  orderId: string;
  orderRef: string;
  company: 'GTK' | 'GTI';    // the requesting company
  clientName: string;
  projectName: string;
  sqft: number;
  pieceCount: number;
  dueDate: string;
  stage: OrderStage;
  estimatedCompletion: string;
  lastUpdated: string;
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const STAGES: OrderStage[] = ['Pending', 'Cutting', 'Processing', 'Tempering', 'Ready', 'Delivered'];

const STAGE_CONFIG: Record<OrderStage, {
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  label: string;
}> = {
  Pending:    { icon: <Clock size={14} />,       color: 'text-slate-600',   bg: 'bg-slate-100',   border: 'border-slate-300',  label: 'Pending' },
  Cutting:    { icon: <Scissors size={14} />,    color: 'text-blue-700',    bg: 'bg-blue-100',    border: 'border-blue-300',   label: 'Cutting' },
  Processing: { icon: <Flame size={14} />,       color: 'text-amber-700',   bg: 'bg-amber-100',   border: 'border-amber-300',  label: 'Processing' },
  Tempering:  { icon: <Package size={14} />,     color: 'text-violet-700',  bg: 'bg-violet-100',  border: 'border-violet-300', label: 'Tempering' },
  Ready:      { icon: <CheckCircle2 size={14} />,color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-300',label: 'Ready' },
  Delivered:  { icon: <Truck size={14} />,       color: 'text-slate-500',   bg: 'bg-slate-50',    border: 'border-slate-200',  label: 'Delivered' },
};

const COMPANY_COLORS = {
  GTK: { badge: 'bg-emerald-600', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  GTI: { badge: 'bg-violet-600',  text: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200'  },
};

const daysUntil = (date: string) => {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
};

const stageFromPieces = (pieces: ProductionPiece[]): OrderStage => {
  if (pieces.length === 0) return 'Pending';
  const statuses = pieces.map(p => p.status);
  if (statuses.every(s => s === 'Delivered')) return 'Delivered';
  if (statuses.some(s => s === 'QC-Passed' || s === 'Delivered')) return 'Ready';
  if (statuses.some(s => s === 'Tempered')) return 'Tempering';
  if (statuses.some(s => ['Service-Pending', 'QC-Pending', 'Service-Done'].includes(s))) return 'Processing';
  if (statuses.some(s => s === 'Cut')) return 'Cutting';
  return 'Pending';
};

// ─────────────────────────────────────────────────────────────────────
// Order Card
// ─────────────────────────────────────────────────────────────────────

const OrderCard: React.FC<{ order: CrossCompanyOrder; expanded: boolean; onToggle: () => void }> = ({ order, expanded, onToggle }) => {
  const stageIdx = STAGES.indexOf(order.stage);
  const cc = COMPANY_COLORS[order.company];
  const due = daysUntil(order.dueDate);
  const isOverdue = due !== null && due < 0;
  const isUrgent  = due !== null && due >= 0 && due <= 2;

  return (
    <div className={`bg-white rounded-2xl border-2 transition-all ${isOverdue ? 'border-rose-300' : isUrgent ? 'border-amber-300' : 'border-slate-100'}`}>
      {/* Card header */}
      <button onClick={onToggle} className="w-full text-left p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black text-white ${cc.badge} flex-shrink-0`}>{order.company}</span>
            <p className="text-sm font-black text-slate-800 truncate">{order.orderRef}</p>
            {isOverdue && <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />}
            {isUrgent && !isOverdue && <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />}
          </div>
          <ChevronRight size={14} className={`text-slate-300 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`} />
        </div>

        <p className="text-xs text-slate-500 font-medium mb-3 truncate">{order.projectName || order.clientName}</p>

        {/* Pipeline progress */}
        <div className="flex items-center space-x-1">
          {STAGES.map((stage, idx) => {
            const cfg = STAGE_CONFIG[stage];
            const done = idx < stageIdx;
            const current = idx === stageIdx;
            return (
              <React.Fragment key={stage}>
                <div className={`flex items-center justify-center w-6 h-6 rounded-full border transition-all flex-shrink-0 ${
                  done    ? 'bg-emerald-500 border-emerald-500 text-white' :
                  current ? `${cfg.bg} ${cfg.border} ${cfg.color}` :
                             'bg-slate-100 border-slate-200 text-slate-300'
                }`}>
                  <span className="scale-75">{done ? <CheckCircle2 size={12} /> : cfg.icon}</span>
                </div>
                {idx < STAGES.length - 1 && (
                  <div className={`flex-1 h-0.5 ${idx < stageIdx ? 'bg-emerald-300' : 'bg-slate-100'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Stage label */}
        <div className="flex items-center justify-between mt-2">
          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${STAGE_CONFIG[order.stage].bg} ${STAGE_CONFIG[order.stage].color}`}>
            {order.stage}
          </span>
          {order.dueDate && (
            <span className={`text-[9px] font-bold ${isOverdue ? 'text-rose-600' : isUrgent ? 'text-amber-600' : 'text-slate-400'}`}>
              {isOverdue ? `${Math.abs(due!)}d overdue` : due === 0 ? 'Due today' : `Due in ${due}d`}
            </span>
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
              <p className="text-[8px] font-black uppercase text-slate-400">Pieces</p>
              <p className="text-lg font-black text-slate-700">{order.pieceCount}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
              <p className="text-[8px] font-black uppercase text-slate-400">SqFt</p>
              <p className="text-lg font-black text-slate-700">{order.sqft.toFixed(1)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
              <p className="text-[8px] font-black uppercase text-slate-400">Est. Done</p>
              <p className="text-xs font-black text-slate-700">{order.estimatedCompletion || '—'}</p>
            </div>
          </div>

          {/* Stage-by-stage status */}
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400 mb-2">Progress Detail</p>
            <div className="space-y-1.5">
              {STAGES.map((stage, idx) => {
                const done = idx < stageIdx;
                const current = idx === stageIdx;
                const cfg = STAGE_CONFIG[stage];
                return (
                  <div key={stage} className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg ${done ? 'bg-emerald-50' : current ? cfg.bg : ''}`}>
                    <span className={done ? 'text-emerald-500' : current ? cfg.color : 'text-slate-300'}>
                      {done ? <CheckCircle2 size={12} /> : cfg.icon}
                    </span>
                    <span className={`text-[10px] font-bold ${done ? 'text-emerald-600' : current ? cfg.color : 'text-slate-300'}`}>
                      {stage}
                    </span>
                    {current && <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full text-white ${cfg.border.replace('border-', 'bg-').replace('-300', '-500')}`}>In Progress</span>}
                    {done && <span className="text-[8px] text-emerald-500 font-bold ml-auto">Done</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {order.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
              <p className="text-[9px] font-bold text-amber-700">{order.notes}</p>
            </div>
          )}

          <div className="flex items-center text-[9px] text-slate-400 font-bold">
            <Clock size={9} className="mr-1" />
            Updated: {new Date(order.lastUpdated).toLocaleString('en-PK', { dateStyle: 'short', timeStyle: 'short' })}
          </div>

          {/* Read-only note */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center space-x-2">
            <Eye size={12} className="text-slate-400" />
            <p className="text-[9px] text-slate-400 font-bold">Read-only view. Contact GlassCo for updates.</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────

const CrossCompanyStatusBoard: React.FC = () => {
  const { selectedCompany } = useAppStore();
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterCompany, setFilterCompany] = useState<'all' | 'GTK' | 'GTI'>('all');
  const [filterStage, setFilterStage] = useState<OrderStage | 'all'>('all');

  // Load all cross-company orders
  const allPieces = useMemo(() => ProductionService.getProductionPieces(), [refreshKey]);
  const allJobs = useMemo(() => SalesService.getQuotations(), [refreshKey]);
  const allClients = useMemo(() => SalesService.getClients(), [refreshKey]);

  const orders = useMemo((): CrossCompanyOrder[] => {
    // Get jobs that belong to GTK or GTI companies
    const crossJobs = allJobs.filter(j =>
      j.company === 'GTK' || j.company === 'GTI' ||
      // Also catch GlassCo jobs that were placed by GTK/GTI
      j.subject?.toUpperCase().includes('GTK') ||
      j.subject?.toUpperCase().includes('GTI')
    );

    return crossJobs.map(job => {
      const pieces = allPieces.filter(p => p.orderId === job.id || p.orderId === job.orderNo);
      const client = allClients.find(c => c.id === job.clientId);
      const sqft = job.items?.reduce((s: number, it: any) => s + (it.totalSqFt || 0), 0) || 0;

      const company: 'GTK' | 'GTI' = job.company === 'GTI' ? 'GTI' : 'GTK';
      const stage = stageFromPieces(pieces);

      // Estimate completion based on stage
      const daysToComplete: Record<OrderStage, number> = {
        Pending: 5, Cutting: 4, Processing: 3, Tempering: 2, Ready: 0, Delivered: 0
      };
      const estDate = new Date();
      estDate.setDate(estDate.getDate() + daysToComplete[stage]);
      const estCompletion = stage === 'Delivered' || stage === 'Ready' ? 'Ready' :
        estDate.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });

      return {
        orderId: job.id,
        orderRef: job.orderNo || job.id,
        company,
        clientName: client?.name || job.clientId || '—',
        projectName: job.projectName || job.subject || '',
        sqft,
        pieceCount: pieces.length,
        dueDate: job.dueDate || job.reqDate || '',
        stage,
        estimatedCompletion: estCompletion,
        lastUpdated: pieces.length > 0
          ? pieces.sort((a, b) => new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime())[0].lastUpdated || job.date
          : job.date,
        notes: stage === 'Tempering' ? 'Glass dispatched to tempering plant' :
               stage === 'Ready' ? '✓ Ready for delivery/pickup' : undefined,
      };
    }).filter(o => o.pieceCount > 0 || o.stage === 'Pending');
  }, [allPieces, allJobs, allClients, refreshKey]);

  const filtered = orders.filter(o => {
    if (filterCompany !== 'all' && o.company !== filterCompany) return false;
    if (filterStage !== 'all' && o.stage !== filterStage) return false;
    return true;
  });

  // Stage counts
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STAGES.forEach(s => { counts[s] = orders.filter(o => o.stage === s).length; });
    return counts;
  }, [orders]);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl">
        <Building2 size={14} className="text-slate-600 shrink-0"/>
        <span className="text-xs font-black uppercase tracking-widest text-slate-700">Cross-Company Orders</span>
        <span className="text-[10px] text-slate-400 font-bold">GTK · GTI · GlassCo</span>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-3 flex-wrap gap-y-2">
        {(['all', 'GTK', 'GTI'] as const).map(co => (
          <button key={co} onClick={() => setFilterCompany(co)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${filterCompany === co ? 'bg-slate-800 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            {co === 'all' ? `All Companies (${orders.length})` : `${co} (${orders.filter(o => o.company === co).length})`}
          </button>
        ))}
        <select value={filterStage} onChange={e => setFilterStage(e.target.value as any)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-slate-400">
          <option value="all">All Stages</option>
          {STAGES.map(s => <option key={s} value={s}>{s} ({stageCounts[s] || 0})</option>)}
        </select>
      </div>

      {/* Order cards */}
      {filtered.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl py-20 text-center">
          <Building2 size={40} className="mx-auto text-slate-200 mb-4" />
          <p className="text-sm font-bold text-slate-400">No cross-company orders found</p>
          <p className="text-xs text-slate-300 mt-2">GTK/GTI orders in GlassCo production will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(order => (
            <OrderCard
              key={order.orderId}
              order={order}
              expanded={expandedId === order.orderId}
              onToggle={() => setExpandedId(expandedId === order.orderId ? null : order.orderId)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CrossCompanyStatusBoard;
