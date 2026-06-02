import React, { useEffect, useState, useMemo } from 'react';
import {
  Truck, Plus, Loader2, X, Package,
  AlertTriangle, CheckCircle2, RefreshCw, ChevronDown
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { ProductionService } from '@/modules/production/services/productionService';
import { ProductionPiece } from '@/modules/production/types/production';

// ── Vehicle configs ───────────────────────────────────────────────────
const VEHICLES = [
  { name: 'Shehzore',  maxWeight: 2500, maxSqft: 800,  color: 'blue'   },
  { name: 'Suzuki',    maxWeight: 800,  maxSqft: 300,  color: 'purple' },
  { name: 'Mini Truck',maxWeight: 1500, maxSqft: 500,  color: 'green'  },
  { name: 'Pickup',    maxWeight: 1000, maxSqft: 350,  color: 'orange' },
];

// Glass weight approx: sqft * thickness_mm * 2.5 kg/m²/mm
const estimateWeight = (sqft: number, thickness = 6): number =>
  Math.round(sqft * 0.0929 * thickness * 2.5);  // sqft → m² → kg

interface LoadItem {
  id: string;
  orderId: string;
  specs: string;
  sqft: number;
  weight: number;
  dueDate?: string;
  priority: 'Urgent' | 'Normal';
}

interface VehicleTrip {
  vehicleName: string;
  items: LoadItem[];
  totalSqft: number;
  totalWeight: number;
  utilization: number;
}

const COLOR_STYLE: Record<string, { border: string; bg: string; text: string; bar: string }> = {
  blue:   { border: 'border-blue-500/30',   bg: 'bg-blue-500/5',   text: 'text-blue-400',   bar: 'bg-blue-500'   },
  purple: { border: 'border-purple-500/30', bg: 'bg-purple-500/5', text: 'text-purple-400', bar: 'bg-purple-500' },
  green:  { border: 'border-green-500/30',  bg: 'bg-green-500/5',  text: 'text-green-400',  bar: 'bg-green-500'  },
  orange: { border: 'border-orange-500/30', bg: 'bg-orange-500/5', text: 'text-orange-400', bar: 'bg-orange-500' },
};

// ── Parse sqft from specs string ──────────────────────────────────────
const parseSqft = (specs: string): number => {
  // try to find WxH pattern in mm or inches
  const mmMatch = specs.match(/(\d+)\s*[xX×]\s*(\d+)/);
  if (mmMatch) {
    const w = parseInt(mmMatch[1]);
    const h = parseInt(mmMatch[2]);
    // if both < 300 assume inches, else mm
    if (w < 300 && h < 300) return (w * h) / 144;
    return (w * h) / 92900;
  }
  return 2; // default 2 sqft if can't parse
};

// Parse thickness from specs
const parseThickness = (specs: string): number => {
  const match = specs.match(/(\d+)\s*mm/i);
  return match ? parseInt(match[1]) : 6;
};

// ── Auto-allocate: Urgent first, fill Shehzore, overflow to Suzuki ────
const autoAllocate = (items: LoadItem[]): VehicleTrip[] => {
  const sorted = [...items].sort((a, b) => {
    if (a.priority === 'Urgent' && b.priority !== 'Urgent') return -1;
    if (b.priority === 'Urgent' && a.priority !== 'Urgent') return 1;
    return 0;
  });

  const trips: VehicleTrip[] = VEHICLES.map(v => ({
    vehicleName: v.name,
    items:       [],
    totalSqft:   0,
    totalWeight: 0,
    utilization: 0,
  }));

  sorted.forEach(item => {
    // Find first vehicle that fits
    for (let i = 0; i < VEHICLES.length; i++) {
      const v    = VEHICLES[i];
      const trip = trips[i];
      if (
        trip.totalSqft   + item.sqft   <= v.maxSqft &&
        trip.totalWeight + item.weight <= v.maxWeight
      ) {
        trip.items.push(item);
        trip.totalSqft   += item.sqft;
        trip.totalWeight += item.weight;
        trip.utilization  = Math.round((trip.totalSqft / v.maxSqft) * 100);
        break;
      }
    }
  });

  return trips.filter(t => t.items.length > 0);
};

// ── Main Component ────────────────────────────────────────────────────
const VehicleLoadOptimizer: React.FC = () => {
  const [pieces, setPieces]         = useState<ProductionPiece[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [trips, setTrips]           = useState<VehicleTrip[]>([]);
  const [showTrips, setShowTrips]   = useState(false);
  const [thickness, setThickness]   = useState(6);
  const [manualItems, setManualItems] = useState<LoadItem[]>([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await ProductionService.getProductionPiecesAsync('Glassco');
      setPieces(data.filter(p =>
        p.status === 'Ready to Dispatch' || p.status === 'QC-Passed'
      ));
    } catch {
      setPieces(ProductionService.getProductionPieces().filter(p =>
        p.status === 'Ready to Dispatch' || p.status === 'QC-Passed'
      ));
    }
    setLoading(false);
  };

  const loadItems: LoadItem[] = useMemo(() =>
    pieces.map(p => {
      const sqft   = parseSqft(p.specs || '');
      const thick  = parseThickness(p.specs || '') || thickness;
      const weight = estimateWeight(sqft, thick);
      return {
        id:       p.id,
        orderId:  p.orderId,
        specs:    p.specs || '',
        sqft:     parseFloat(sqft.toFixed(2)),
        weight,
        priority: 'Normal' as const,
      };
    }), [pieces, thickness]
  );

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(loadItems.map(i => i.id)));
  const clearAll  = () => setSelected(new Set());

  const optimize = () => {
    const toLoad = loadItems.filter(i => selected.has(i.id));
    if (toLoad.length === 0) return;
    setTrips(autoAllocate(toLoad));
    setShowTrips(true);
  };

  const totalSqft   = loadItems.filter(i => selected.has(i.id)).reduce((s, i) => s + i.sqft, 0);
  const totalWeight = loadItems.filter(i => selected.has(i.id)).reduce((s, i) => s + i.weight, 0);

  if (showTrips) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowTrips(false)}
            className="text-slate-400 hover:text-white text-xs underline">← Back</button>
          <span className="font-black text-white">Optimized Load Plan</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-xl font-black text-white">{trips.length}</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Vehicles</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-xl font-black text-white">
              {trips.reduce((s, t) => s + t.items.length, 0)}
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Pieces</div>
          </div>
        </div>

        {trips.map((trip, idx) => {
          const vConfig = VEHICLES.find(v => v.name === trip.vehicleName) ?? VEHICLES[0];
          const style   = COLOR_STYLE[vConfig.color];
          return (
            <div key={idx} className={`rounded-xl border p-4 space-y-3 ${style.border} ${style.bg}`}>
              <div className="flex items-center gap-2">
                <Truck size={16} className={style.text} />
                <span className="font-bold text-white text-sm">{trip.vehicleName}</span>
                <span className="ml-auto text-xs text-slate-400">
                  {trip.totalSqft.toFixed(1)} sqft · {trip.totalWeight} kg
                </span>
              </div>

              {/* Load bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Load</span>
                  <span className={trip.utilization > 90 ? 'text-red-400 font-bold' : ''}>{trip.utilization}%</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${trip.utilization > 90 ? 'bg-red-500' : vConfig.color === 'blue' ? 'bg-blue-500' : vConfig.color === 'purple' ? 'bg-purple-500' : 'bg-green-500'}`}
                    style={{ width: `${trip.utilization}%` }}
                  />
                </div>
              </div>

              {/* Pieces */}
              <div className="space-y-1">
                {trip.items.map(item => (
                  <div key={item.id} className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-slate-400 shrink-0">{item.orderId}</span>
                    <span className="text-xs text-slate-500 flex-1 truncate">{item.specs.slice(0, 35)}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">{item.sqft.toFixed(1)} ft²</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Vehicle Load</h2>
          <p className="text-xs text-slate-500 mt-0.5">Shehzore · Suzuki · Auto-optimize</p>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Thickness override */}
      <div className="bg-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
        <span className="text-xs text-slate-400">Default thickness</span>
        <select value={thickness} onChange={e => setThickness(parseInt(e.target.value))}
          className="bg-slate-700 text-white text-xs rounded-lg px-2 py-1.5 outline-none ml-auto">
          {[4, 5, 6, 8, 10, 12].map(t => <option key={t} value={t}>{t}mm</option>)}
        </select>
      </div>

      {/* Selection summary */}
      {selected.size > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <Package size={14} className="text-blue-400" />
          <span className="text-blue-400 text-xs flex-1">
            {selected.size} pieces · {totalSqft.toFixed(1)} sqft · ~{totalWeight} kg
          </span>
          <button onClick={optimize}
            className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all">
            Optimize
          </button>
        </div>
      )}

      {/* Select all / clear */}
      <div className="flex gap-2">
        <button onClick={selectAll}
          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 rounded-xl transition-all">
          Select All ({loadItems.length})
        </button>
        <button onClick={clearAll}
          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 rounded-xl transition-all">
          Clear
        </button>
      </div>

      {/* Vehicle capacity reference */}
      <div className="grid grid-cols-2 gap-2">
        {VEHICLES.map(v => {
          const style = COLOR_STYLE[v.color];
          return (
            <div key={v.name} className={`rounded-xl border p-3 ${style.border} ${style.bg}`}>
              <div className={`text-xs font-bold ${style.text}`}>{v.name}</div>
              <div className="text-[10px] text-slate-500 mt-1">
                Max {v.maxSqft} sqft · {v.maxWeight} kg
              </div>
            </div>
          );
        })}
      </div>

      {/* Ready pieces list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : loadItems.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          Koi Ready to Dispatch pieces nahi
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">
            Ready Pieces ({loadItems.length})
          </div>
          {loadItems.map(item => (
            <button key={item.id} onClick={() => toggleSelect(item.id)}
              className={`w-full rounded-xl px-3 py-2.5 text-left transition-all flex items-center gap-3
                ${selected.has(item.id)
                  ? 'bg-blue-500/20 border border-blue-500/40'
                  : 'bg-slate-800 hover:bg-slate-700'}`}>
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all
                ${selected.has(item.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-600'}`}>
                {selected.has(item.id) && <CheckCircle2 size={10} className="text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white truncate">{item.orderId}</div>
                <div className="text-[10px] text-slate-500 truncate">{item.specs.slice(0, 40)}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-slate-400">{item.sqft.toFixed(1)} ft²</div>
                <div className="text-[10px] text-slate-500">{item.weight} kg</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default VehicleLoadOptimizer;
