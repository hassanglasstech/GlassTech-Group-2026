import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, RefreshCw, Search, ChevronRight, Clock, CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import { ProductionService } from '@/modules/production/services/productionService';
import { ProductionPiece } from '@/modules/production/types/production';

// ── Order Flow Stages ─────────────────────────────────────────────────
const FLOW_STAGES = [
  { key: 'Cutting',     statuses: ['Cut'],                                           color: '#3b82f6' },
  { key: 'Services',    statuses: ['Service-Pending'],                               color: '#f59e0b' },
  { key: 'QC',          statuses: ['QC-Pending', 'QC-Failed', 'QC-Passed', 'Hold'], color: '#8b5cf6' },
  { key: 'Tempering',   statuses: ['Tempered', 'Received-From-Tempering'],           color: '#06b6d4' },
  { key: 'Dispatch',    statuses: ['Ready to Dispatch', 'Dispatched'],               color: '#22c55e' },
  { key: 'Delivered',   statuses: ['Delivered'],                                     color: '#64748b' },
];

interface OrderSummary {
  orderId: string;
  total: number;
  byStage: Record<string, number>;
  currentStage: string;
  progress: number;   // 0-100
  hasIssue: boolean;
  lastUpdated: string;
}

const getStageIndex = (status: string): number => {
  for (let i = 0; i < FLOW_STAGES.length; i++) {
    if (FLOW_STAGES[i].statuses.includes(status)) return i;
  }
  return 0;
};

const buildOrderSummary = (orderId: string, pieces: ProductionPiece[]): OrderSummary => {
  const byStage: Record<string, number> = {};
  FLOW_STAGES.forEach(s => { byStage[s.key] = 0; });

  let maxStageIdx = 0;
  let hasIssue = false;

  pieces.forEach(p => {
    const idx = getStageIndex(p.status);
    const stageName = FLOW_STAGES[idx]?.key ?? 'Cutting';
    byStage[stageName] = (byStage[stageName] || 0) + 1;
    if (idx > maxStageIdx) maxStageIdx = idx;
    if (p.status === 'QC-Failed' || p.status === 'Hold' || p.fault) hasIssue = true;
  });

  const progress = Math.round((maxStageIdx / (FLOW_STAGES.length - 1)) * 100);
  const lastUpdated = pieces.reduce((latest, p) =>
    p.lastUpdated > latest ? p.lastUpdated : latest, pieces[0]?.lastUpdated ?? '');

  return {
    orderId,
    total: pieces.length,
    byStage,
    currentStage: FLOW_STAGES[maxStageIdx]?.key ?? 'Cutting',
    progress,
    hasIssue,
    lastUpdated,
  };
};

// ── Progress Bar ──────────────────────────────────────────────────────
const OrderProgressBar: React.FC<{ summary: OrderSummary; animate: boolean }> = ({ summary, animate }) => (
  <div className="space-y-2">
    {/* Stage dots */}
    <div className="flex items-center gap-0">
      {FLOW_STAGES.map((stage, idx) => {
        const count     = summary.byStage[stage.key] ?? 0;
        const stageIdx  = FLOW_STAGES.findIndex(s => s.key === summary.currentStage);
        const isPast    = idx < stageIdx;
        const isCurrent = idx === stageIdx;
        const isFuture  = idx > stageIdx;

        return (
          <React.Fragment key={stage.key}>
            <div className="flex flex-col items-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black transition-all
                  ${isCurrent && animate ? 'ring-2 ring-offset-1 ring-offset-slate-800' : ''}
                  ${isPast    ? 'bg-green-500 text-white' :
                    isCurrent ? 'text-white' :
                    'bg-slate-700 text-slate-500'}`}
                style={isCurrent ? { backgroundColor: stage.color } : {}}
              >
                {isPast ? '✓' : count > 0 ? count : '·'}
              </div>
              <div className={`text-[8px] mt-0.5 whitespace-nowrap ${isFuture ? 'text-slate-600' : 'text-slate-400'}`}>
                {stage.key}
              </div>
            </div>
            {idx < FLOW_STAGES.length - 1 && (
              <div className={`flex-1 h-0.5 mb-3 ${isPast ? 'bg-green-500' : 'bg-slate-700'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────
const AnimatedOrderFlow: React.FC = () => {
  const [pieces, setPieces]         = useState<ProductionPiece[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<OrderSummary | null>(null);
  const [animating, setAnimating]   = useState(false);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    // Pulse animation every 5s
    const interval = setInterval(() => {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 800);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await ProductionService.getProductionPiecesAsync('Glassco');
      setPieces(data);
    } catch {
      setPieces(ProductionService.getProductionPieces());
    }
    setLoading(false);
  };

  const orders = useMemo(() => {
    const groups: Record<string, ProductionPiece[]> = {};
    pieces
      .filter(p => p.status !== 'Broken')
      .forEach(p => {
        if (!groups[p.orderId]) groups[p.orderId] = [];
        groups[p.orderId].push(p);
      });
    return Object.entries(groups)
      .map(([id, ps]) => buildOrderSummary(id, ps))
      .sort((a, b) => b.progress - a.progress);
  }, [pieces]);

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    return orders.filter(o => o.orderId.toLowerCase().includes(search.toLowerCase()));
  }, [orders, search]);

  // Order detail view
  if (selected) {
    const orderPieces = pieces.filter(p => p.orderId === selected.orderId);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-xs underline">← Back</button>
          <span className="font-black text-white">{selected.orderId}</span>
          {selected.hasIssue && <AlertTriangle size={14} className="text-red-400" />}
        </div>

        {/* Flow bar */}
        <div className="bg-slate-800 rounded-xl p-5">
          <OrderProgressBar summary={selected} animate={animating} />
        </div>

        {/* Stage breakdown */}
        <div className="grid grid-cols-3 gap-2">
          {FLOW_STAGES.filter(s => (selected.byStage[s.key] ?? 0) > 0).map(stage => (
            <div key={stage.key} className="bg-slate-800 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-white">{selected.byStage[stage.key]}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">{stage.key}</div>
            </div>
          ))}
        </div>

        {/* Piece list */}
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">All Pieces ({orderPieces.length})</div>
          <div className="space-y-1">
            {orderPieces.map(p => (
              <div key={p.id} className="bg-slate-800 rounded-lg px-3 py-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: FLOW_STAGES[getStageIndex(p.status)]?.color ?? '#64748b' }} />
                <span className="text-xs text-slate-300 flex-1 truncate">{p.specs?.slice(0, 45)}</span>
                <span className="text-[10px] text-slate-500 shrink-0">{p.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Order Flow</h2>
          <p className="text-xs text-slate-500 mt-0.5">Live order progress · GlassCo</p>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">{orders.length}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Orders</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-green-400">
            {orders.filter(o => o.progress >= 80).length}
          </div>
          <div className="text-[10px] text-green-400 uppercase tracking-widest mt-0.5">Near Done</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${orders.filter(o => o.hasIssue).length > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-800'}`}>
          <div className={`text-xl font-black ${orders.filter(o => o.hasIssue).length > 0 ? 'text-red-400' : 'text-white'}`}>
            {orders.filter(o => o.hasIssue).length}
          </div>
          <div className="text-[10px] text-red-400/70 uppercase tracking-widest mt-0.5">Issues</div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-4 py-2.5">
        <Search size={14} className="text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search order ID..."
          className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none" />
      </div>

      {/* Order cards */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">Koi orders nahi</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <button key={order.orderId} onClick={() => setSelected(order)}
              className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-left transition-all space-y-3">

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{order.orderId}</span>
                  {order.hasIssue && <AlertTriangle size={12} className="text-red-400" />}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{order.total} pcs</span>
                  <span className={`text-xs font-bold ${order.progress === 100 ? 'text-green-400' : 'text-slate-300'}`}>
                    {order.progress}%
                  </span>
                  <ChevronRight size={12} className="text-slate-500" />
                </div>
              </div>

              {/* Inline flow bar */}
              <div className="flex items-center gap-1">
                {FLOW_STAGES.map((stage, idx) => {
                  const count    = order.byStage[stage.key] ?? 0;
                  const stageIdx = FLOW_STAGES.findIndex(s => s.key === order.currentStage);
                  return (
                    <div key={stage.key} className="flex items-center gap-1 flex-1">
                      <div
                        className={`h-1.5 flex-1 rounded-full transition-all duration-500
                          ${idx < stageIdx ? 'opacity-100' :
                            idx === stageIdx ? 'opacity-100' : 'opacity-20'}`}
                        style={{ backgroundColor: stage.color }}
                      />
                      {count > 0 && idx === stageIdx && animating && (
                        <div className="w-2 h-2 rounded-full animate-pulse"
                          style={{ backgroundColor: stage.color }} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>Current: <span className="text-slate-300 font-medium">{order.currentStage}</span></span>
                <span>{new Date(order.lastUpdated).toLocaleDateString('en-PK')}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnimatedOrderFlow;
