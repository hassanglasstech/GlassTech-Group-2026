import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, RefreshCw, Scissors, Wrench, Truck, Users, BarChart2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { ProductionService } from '@/modules/production/services/productionService';
import { ProductionPiece } from '@/modules/production/types/production';

// ── Types ─────────────────────────────────────────────────────────────
interface Asset {
  id: string;
  name: string;
  category: string;
  status: 'Active' | 'Maintenance' | 'Inactive' | 'Disposed';
  location?: string;
}

interface StationLoad {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  pieceStatuses: string[];
  assets: Asset[];
  pieceCount: number;
  utilization: number;  // 0-100
}

const STATIONS = [
  {
    id: 'cutting',
    label: 'Cutting Tables',
    icon: Scissors,
    color: 'blue',
    pieceStatuses: ['Cut'],
    assetCategory: 'Table',
  },
  {
    id: 'processing',
    label: 'Processing',
    icon: Wrench,
    color: 'purple',
    pieceStatuses: ['Service-Pending', 'QC-Pending', 'QC-Failed', 'Hold'],
    assetCategory: 'Machine',
  },
  {
    id: 'dispatch',
    label: 'Dispatch Bay',
    icon: Truck,
    color: 'green',
    pieceStatuses: ['QC-Passed', 'Ready to Dispatch'],
    assetCategory: 'Vehicle',
  },
];

const COLOR_STYLE: Record<string, { border: string; bg: string; text: string; bar: string }> = {
  blue:   { border: 'border-blue-500/30',   bg: 'bg-blue-500/5',   text: 'text-blue-400',   bar: 'bg-blue-500' },
  purple: { border: 'border-purple-500/30', bg: 'bg-purple-500/5', text: 'text-purple-400', bar: 'bg-purple-500' },
  green:  { border: 'border-green-500/30',  bg: 'bg-green-500/5',  text: 'text-green-400',  bar: 'bg-green-500' },
};

const STATUS_DOT: Record<string, string> = {
  Active:      'bg-green-400',
  Maintenance: 'bg-yellow-400',
  Inactive:    'bg-slate-500',
  Disposed:    'bg-red-400',
};

// ── Utilization Bar ───────────────────────────────────────────────────
const UtilizationBar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-[10px]">
      <span className="text-slate-500 uppercase tracking-widest">Utilization</span>
      <span className={`font-bold ${value > 80 ? 'text-red-400' : value > 50 ? 'text-yellow-400' : 'text-green-400'}`}>
        {value}%
      </span>
    </div>
    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${
          value > 80 ? 'bg-red-500' : value > 50 ? 'bg-yellow-500' : color
        }`}
        style={{ width: `${value}%` }}
      />
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────
const FloorPlannerUpgrade: React.FC = () => {
  const [assets, setAssets]   = useState<Asset[]>([]);
  const [pieces, setPieces]   = useState<ProductionPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState<'overview' | 'assets'>('overview');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: assetData }, pieceData] = await Promise.all([
        supabase.from('factory_assets').select('*').eq('company', 'Glassco').neq('status', 'Disposed'),
        ProductionService.getProductionPiecesAsync('Glassco'),
      ]);
      if (assetData) setAssets(assetData as Asset[]);
      setPieces(pieceData || ProductionService.getProductionPieces());
    } catch {
      setPieces(ProductionService.getProductionPieces());
    }
    setLoading(false);
  };

  const stations: StationLoad[] = useMemo(() => {
    return STATIONS.map(s => {
      const stationAssets = assets.filter(a =>
        a.category === s.assetCategory && a.status === 'Active'
      );
      const pieceCount = pieces.filter(p => s.pieceStatuses.includes(p.status)).length;
      const capacity   = stationAssets.length * 50; // 50 pieces per asset as baseline
      const utilization = capacity > 0 ? Math.min(100, Math.round((pieceCount / capacity) * 100)) : 0;

      return {
        id:           s.id,
        label:        s.label,
        icon:         s.icon,
        color:        s.color,
        pieceStatuses: s.pieceStatuses,
        assets:       stationAssets,
        pieceCount,
        utilization,
      };
    });
  }, [assets, pieces]);

  const maintenanceAssets = assets.filter(a => a.status === 'Maintenance');
  const totalActive       = assets.filter(a => a.status === 'Active').length;
  const totalPieces       = pieces.filter(p => p.status !== 'Delivered' && p.status !== 'Broken').length;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Floor Planner</h2>
          <p className="text-xs text-slate-500 mt-0.5">Assets · Utilization · Station load</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2 bg-slate-800 p-1 rounded-xl">
        <button onClick={() => setView('overview')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
            ${view === 'overview' ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
          Station Overview
        </button>
        <button onClick={() => setView('assets')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
            ${view === 'assets' ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
          Asset List
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">{totalActive}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Active Assets</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">{totalPieces}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Active Pieces</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${maintenanceAssets.length > 0 ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-slate-800'}`}>
          <div className={`text-xl font-black ${maintenanceAssets.length > 0 ? 'text-yellow-400' : 'text-white'}`}>
            {maintenanceAssets.length}
          </div>
          <div className="text-[10px] text-yellow-400/70 uppercase tracking-widest mt-0.5">In Maintenance</div>
        </div>
      </div>

      {/* Maintenance alert */}
      {maintenanceAssets.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
          <span className="text-yellow-400 text-xs">
            {maintenanceAssets.map(a => a.name).join(', ')} — maintenance mein
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : view === 'overview' ? (

        // ── STATION OVERVIEW ────────────────────────────────────────
        <div className="space-y-3">
          {stations.map(station => {
            const Icon  = station.icon;
            const style = COLOR_STYLE[station.color];
            return (
              <div key={station.id} className={`rounded-xl border p-4 space-y-3 ${style.border} ${style.bg}`}>
                {/* Station header */}
                <div className="flex items-center gap-2">
                  <Icon size={16} className={style.text} />
                  <span className="font-bold text-white text-sm">{station.label}</span>
                  <span className="ml-auto text-xs text-slate-400">
                    {station.pieceCount} pieces
                  </span>
                </div>

                {/* Utilization bar */}
                <UtilizationBar value={station.utilization} color={style.bar} />

                {/* Active assets */}
                {station.assets.length === 0 ? (
                  <div className="text-xs text-slate-500 italic">
                    Koi active asset nahi — Asset Register mein add karo
                  </div>
                ) : (
                  <div className="space-y-1">
                    {station.assets.map(asset => (
                      <div key={asset.id} className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[asset.status]}`} />
                        <span className="text-xs text-slate-300 flex-1">{asset.name}</span>
                        {asset.location && (
                          <span className="text-[10px] text-slate-500">{asset.location}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      ) : (

        // ── ASSET LIST ──────────────────────────────────────────────
        <div className="space-y-2">
          {assets.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              Koi assets nahi — Factory Incharge → Assets mein add karo
            </div>
          ) : (
            assets.map(asset => (
              <div key={asset.id} className="bg-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[asset.status]}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm">{asset.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {asset.category}{asset.location && ` · ${asset.location}`}
                  </div>
                </div>
                <span className={`text-[10px] font-bold ${
                  asset.status === 'Active'      ? 'text-green-400'  :
                  asset.status === 'Maintenance' ? 'text-yellow-400' : 'text-slate-500'
                }`}>{asset.status}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default FloorPlannerUpgrade;
