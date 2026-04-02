import React, { useEffect, useState, useMemo } from 'react';
import {
  Loader2, RefreshCw, LayoutGrid, List,
  Clock, CheckCircle2, AlertTriangle, Package, Truck
} from 'lucide-react';
import { ProductionService } from '@/modules/production/services/productionService';
import { ProductionPiece, PieceStatus } from '@/modules/production/types/production';

// ── Board columns ─────────────────────────────────────────────────────
interface BoardColumn {
  key: string;
  label: string;
  statuses: PieceStatus[];
  color: string;
  icon: React.ElementType;
}

const COLUMNS: BoardColumn[] = [
  {
    key: 'cutting',
    label: 'Cutting',
    statuses: ['Cut'],
    color: 'border-blue-500/40 bg-blue-500/5',
    icon: Package,
  },
  {
    key: 'services',
    label: 'Services / QC',
    statuses: ['Service-Pending', 'QC-Pending', 'QC-Failed', 'Hold'],
    color: 'border-yellow-500/40 bg-yellow-500/5',
    icon: Clock,
  },
  {
    key: 'tempering',
    label: 'Tempering',
    statuses: ['Tempered', 'Received-From-Tempering'],
    color: 'border-purple-500/40 bg-purple-500/5',
    icon: AlertTriangle,
  },
  {
    key: 'ready',
    label: 'Ready / Dispatch',
    statuses: ['QC-Passed', 'Ready to Dispatch'],
    color: 'border-green-500/40 bg-green-500/5',
    icon: CheckCircle2,
  },
  {
    key: 'delivered',
    label: 'Delivered',
    statuses: ['Dispatched', 'Delivered'],
    color: 'border-slate-500/40 bg-slate-500/5',
    icon: Truck,
  },
];

const STATUS_DOT: Record<string, string> = {
  'Cut':                    'bg-blue-400',
  'Service-Pending':        'bg-yellow-400',
  'QC-Pending':             'bg-orange-400',
  'QC-Failed':              'bg-red-400',
  'QC-Passed':              'bg-green-400',
  'Hold':                   'bg-slate-400',
  'Tempered':               'bg-purple-400',
  'Received-From-Tempering':'bg-violet-400',
  'Ready to Dispatch':      'bg-emerald-400',
  'Dispatched':             'bg-cyan-400',
  'Delivered':              'bg-slate-500',
  'Broken':                 'bg-red-600',
};

// ── Component ─────────────────────────────────────────────────────────
const FactoryVisualBoard: React.FC = () => {
  const [pieces, setPieces]     = useState<ProductionPiece[]>([]);
  const [loading, setLoading]   = useState(true);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<ProductionPiece | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await ProductionService.getProductionPiecesAsync('Glassco');
      // Exclude delivered/broken for active board
      setPieces(data.filter(p => p.status !== 'Delivered' && p.status !== 'Broken'));
    } catch {
      setPieces(ProductionService.getProductionPieces().filter(
        p => p.status !== 'Delivered' && p.status !== 'Broken'
      ));
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return pieces;
    const q = search.toLowerCase();
    return pieces.filter(p =>
      p.specs?.toLowerCase().includes(q) ||
      p.orderId?.toLowerCase().includes(q)
    );
  }, [pieces, search]);

  // Group by orderId for summary
  const orderGroups = useMemo(() => {
    const groups: Record<string, ProductionPiece[]> = {};
    filtered.forEach(p => {
      if (!groups[p.orderId]) groups[p.orderId] = [];
      groups[p.orderId].push(p);
    });
    return groups;
  }, [filtered]);

  // KPIs
  const total     = pieces.length;
  const qcFailed  = pieces.filter(p => p.status === 'QC-Failed').length;
  const ready     = pieces.filter(p => p.status === 'Ready to Dispatch' || p.status === 'QC-Passed').length;
  const onHold    = pieces.filter(p => p.status === 'Hold').length;

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)}
            className="text-slate-400 hover:text-white text-xs underline">← Back</button>
          <span className="font-black text-white truncate">{selected.orderId}</span>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${STATUS_DOT[selected.status] ?? 'bg-slate-400'}`} />
            <span className="font-bold text-white">{selected.status}</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Order ID</span>
              <span className="text-white font-medium">{selected.orderId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Item</span>
              <span className="text-white font-medium">#{selected.itemIndex + 1}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Specs</span>
              <span className="text-white font-medium text-right max-w-[60%]">{selected.specs}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Last Updated</span>
              <span className="text-white font-medium">
                {new Date(selected.lastUpdated).toLocaleString('en-PK')}
              </span>
            </div>
            {selected.pendingServices && selected.pendingServices.length > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-400">Pending Services</span>
                <span className="text-white font-medium text-right">
                  {selected.pendingServices.join(', ')}
                </span>
              </div>
            )}
            {selected.fault && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <div className="text-xs text-red-400 font-bold mb-1">QC Fault</div>
                <div className="text-xs text-red-300">{selected.fault.description}</div>
              </div>
            )}
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
          <h2 className="font-black text-white text-lg">Factory Visual Board</h2>
          <p className="text-xs text-slate-500 mt-0.5">GlassCo · Live production status</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMode(viewMode === 'board' ? 'list' : 'board')}
            className="text-slate-400 hover:text-white transition-colors">
            {viewMode === 'board' ? <List size={18} /> : <LayoutGrid size={18} />}
          </button>
          <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-lg font-black text-white">{total}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Total</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
          <div className="text-lg font-black text-green-400">{ready}</div>
          <div className="text-[10px] text-green-400 uppercase tracking-widest mt-0.5">Ready</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${qcFailed > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-800'}`}>
          <div className={`text-lg font-black ${qcFailed > 0 ? 'text-red-400' : 'text-white'}`}>{qcFailed}</div>
          <div className="text-[10px] text-red-400/70 uppercase tracking-widest mt-0.5">QC Fail</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-lg font-black text-yellow-400">{onHold}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Hold</div>
        </div>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by order ID or specs..."
        className="w-full bg-slate-800 text-white rounded-xl px-4 py-2.5 text-sm placeholder-slate-500 outline-none" />

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : pieces.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">Koi active pieces nahi</div>
      ) : viewMode === 'board' ? (

        // ── BOARD VIEW ──────────────────────────────────────────────
        <div className="space-y-3">
          {COLUMNS.map(col => {
            const colPieces = filtered.filter(p => col.statuses.includes(p.status as PieceStatus));
            if (colPieces.length === 0) return null;
            const Icon = col.icon;
            return (
              <div key={col.key} className={`rounded-xl border p-4 ${col.color}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon size={14} className="text-slate-400" />
                  <span className="font-bold text-white text-sm uppercase tracking-wider">{col.label}</span>
                  <span className="ml-auto bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full font-bold">
                    {colPieces.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {colPieces.slice(0, 8).map(p => (
                    <button key={p.id} onClick={() => setSelected(p)}
                      className="w-full bg-slate-800/80 hover:bg-slate-700 rounded-lg px-3 py-2.5 text-left transition-all flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[p.status] ?? 'bg-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate">{p.orderId}</div>
                        <div className="text-[10px] text-slate-500 truncate">{p.specs?.slice(0, 40)}</div>
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">#{p.itemIndex + 1}</span>
                    </button>
                  ))}
                  {colPieces.length > 8 && (
                    <div className="text-center text-xs text-slate-500 pt-1">
                      +{colPieces.length - 8} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      ) : (

        // ── LIST VIEW (grouped by order) ────────────────────────────
        <div className="space-y-2">
          {Object.entries(orderGroups).map(([orderId, orderPieces]) => {
            const statuses = [...new Set(orderPieces.map(p => p.status))];
            return (
              <div key={orderId} className="bg-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-sm">{orderId}</span>
                  <span className="text-xs text-slate-500">{orderPieces.length} pieces</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {statuses.map(s => (
                    <span key={s} className="flex items-center gap-1 bg-slate-700 rounded-full px-2 py-0.5 text-[10px] text-slate-300">
                      <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s] ?? 'bg-slate-400'}`} />
                      {s} ({orderPieces.filter(p => p.status === s).length})
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FactoryVisualBoard;
