/**
 * RouteVisualizer.tsx — Phase 5B
 *
 * Schematic route diagram (NO Google Maps):
 * - Fixed nodes: Factory, AGC Plant, PSG Plant, DG Plant, Client Sites
 * - Vehicle icons with plate on each node
 * - Color = status: blue=in transit, green=delivered, amber=waiting, red=overdue
 * - Click vehicle → trip details
 * - Simple SVG-based node-link diagram
 */

import React, { useState, useMemo } from 'react';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Vehicle, VehicleTrip } from '@/modules/procurement/types/inventory';
import { MapPin, Truck, X, RefreshCw, Info } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────
// Node definitions — fixed factory topology
// ─────────────────────────────────────────────────────────────────────

interface MapNode {
  id: string;
  label: string;
  shortLabel: string;
  x: number;  // percentage 0-100
  y: number;
  color: string;
  bgColor: string;
  icon: '🏭' | '🔷' | '🏢' | '📦' | '🏗️';
}

const MAP_NODES: MapNode[] = [
  { id: 'factory',  label: 'GlassCo Factory',  shortLabel: 'Factory',  x: 50, y: 50, color: '#1d4ed8', bgColor: '#dbeafe', icon: '🏭' },
  { id: 'agc',      label: 'AGC Tempering',     shortLabel: 'AGC',      x: 15, y: 20, color: '#7c3aed', bgColor: '#ede9fe', icon: '🔷' },
  { id: 'psg',      label: 'PSG Tempering',     shortLabel: 'PSG',      x: 80, y: 20, color: '#7c3aed', bgColor: '#ede9fe', icon: '🔷' },
  { id: 'dg',       label: 'DG Plant',          shortLabel: 'DG',       x: 50, y: 10, color: '#0891b2', bgColor: '#cffafe', icon: '🔷' },
  { id: 'client_a', label: 'Client Sites (N)',   shortLabel: 'Clients N', x: 20, y: 80, color: '#059669', bgColor: '#d1fae5', icon: '🏢' },
  { id: 'client_b', label: 'Client Sites (S)',   shortLabel: 'Clients S', x: 80, y: 80, color: '#059669', bgColor: '#d1fae5', icon: '🏢' },
  { id: 'warehouse',label: 'Warehouse/Store',   shortLabel: 'Store',    x: 50, y: 85, color: '#d97706', bgColor: '#fef3c7', icon: '📦' },
];

// Edges = allowed routes
const EDGES: [string, string][] = [
  ['factory', 'agc'], ['factory', 'psg'], ['factory', 'dg'],
  ['factory', 'client_a'], ['factory', 'client_b'], ['factory', 'warehouse'],
  ['agc', 'client_a'], ['psg', 'client_b'], ['dg', 'factory'],
];

// Map destination keywords → node id
const DEST_TO_NODE: [string, string][] = [
  ['agc', 'agc'], ['psg', 'psg'], ['dg plant', 'dg'], ['double glaze', 'dg'],
  ['warehouse', 'warehouse'], ['store', 'warehouse'],
  ['delivery', 'client_b'], ['client', 'client_a'], ['site', 'client_a'],
];

const inferNode = (destination: string): string => {
  const lower = destination.toLowerCase();
  for (const [keyword, nodeId] of DEST_TO_NODE) {
    if (lower.includes(keyword)) return nodeId;
  }
  return 'client_a'; // default → client sites
};

// ─────────────────────────────────────────────────────────────────────
// Status colors
// ─────────────────────────────────────────────────────────────────────

const tripStatusColor = (status: string): string => {
  if (status === 'Completed') return '#10b981';  // green
  if (status === 'Cancelled') return '#94a3b8';   // slate
  return '#3b82f6';                                // blue = scheduled/in transit
};

// ─────────────────────────────────────────────────────────────────────
// Vehicle popup
// ─────────────────────────────────────────────────────────────────────

interface VehiclePopupProps {
  vehicle: Vehicle;
  trips: VehicleTrip[];
  onClose: () => void;
}

const VehiclePopup: React.FC<VehiclePopupProps> = ({ vehicle, trips, onClose }) => (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
      <div className="bg-blue-50 border-b border-blue-200 p-5 rounded-t-2xl flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Truck size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-black text-blue-800 uppercase">{vehicle.plateNo}</p>
            <p className="text-[10px] text-blue-500 font-bold">{vehicle.type} · {vehicle.owner}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-blue-100 rounded-xl"><X size={16} className="text-blue-500" /></button>
      </div>
      <div className="p-5">
        <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Today's Trips ({trips.length})</p>
        {trips.length === 0 ? (
          <p className="text-xs text-slate-300 italic">No trips today</p>
        ) : (
          <div className="space-y-2">
            {trips.map(t => (
              <div key={t.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <p className="text-xs font-black text-slate-700">{t.destination}</p>
                  <p className="text-[9px] text-slate-400 font-bold">{t.company} · {t.serviceType || 'Delivery'}</p>
                </div>
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: tripStatusColor(t.status) }}>
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[10px]">
          <div><span className="text-slate-400">Driver: </span><span className="font-bold text-slate-600">{vehicle.driverName || '—'}</span></div>
          <div><span className="text-slate-400">Phone: </span><span className="font-bold text-slate-600">{vehicle.driverPhone || '—'}</span></div>
        </div>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────

const RouteVisualizer: React.FC = () => {
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  const vehicles = useMemo(() => InventoryService.getVehicles().filter(v => v.status === 'Active'), []);
  const allTrips = useMemo(() => InventoryService.getVehicleTrips(), []);

  const dayTrips = useMemo(() =>
    allTrips.filter(t => t.date === filterDate)
  , [allTrips, filterDate]);

  // For each trip, determine which node the vehicle is currently at/heading to
  const vehiclePositions = useMemo(() => {
    const positions: Record<string, { nodeId: string; trips: VehicleTrip[]; status: string }> = {};

    // Init all active vehicles at factory
    vehicles.forEach(v => {
      positions[v.id] = { nodeId: 'factory', trips: [], status: 'idle' };
    });

    // Place based on latest trip
    dayTrips.forEach(trip => {
      const nodeId = inferNode(trip.destination);
      if (!positions[trip.vehicleId]) {
        positions[trip.vehicleId] = { nodeId: 'factory', trips: [], status: 'idle' };
      }
      positions[trip.vehicleId].trips.push(trip);
      // Use most recent trip to determine location
      if (trip.status === 'Scheduled') {
        positions[trip.vehicleId].nodeId = nodeId;
        positions[trip.vehicleId].status = 'in-transit';
      } else if (trip.status === 'Completed') {
        positions[trip.vehicleId].nodeId = 'factory'; // returned
        positions[trip.vehicleId].status = 'completed';
      }
    });

    return positions;
  }, [vehicles, dayTrips]);

  // Group vehicles by node
  const vehiclesByNode = useMemo(() => {
    const grouped: Record<string, Vehicle[]> = {};
    MAP_NODES.forEach(n => { grouped[n.id] = []; });
    vehicles.forEach(v => {
      const pos = vehiclePositions[v.id];
      const nodeId = pos?.nodeId || 'factory';
      if (!grouped[nodeId]) grouped[nodeId] = [];
      grouped[nodeId].push(v);
    });
    return grouped;
  }, [vehicles, vehiclePositions]);

  const getVehicleStatusColor = (vehicleId: string): string => {
    const pos = vehiclePositions[vehicleId];
    if (!pos || pos.status === 'idle') return '#94a3b8'; // grey
    if (pos.status === 'completed') return '#10b981';     // green
    if (pos.status === 'in-transit') return '#3b82f6';   // blue
    return '#f59e0b';                                      // amber = waiting
  };

  const SVG_W = 800;
  const SVG_H = 500;
  const toSVG = (pct: number, dim: number) => (pct / 100) * dim;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-7 rounded-3xl shadow-xl flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <MapPin size={18} className="text-blue-400" />
            <h2 className="text-xl font-black uppercase">Route Visualizer</h2>
          </div>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Live vehicle positions · Schematic layout</p>
        </div>
        <div className="flex items-center space-x-3">
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <div className="bg-white/10 px-4 py-2.5 rounded-2xl text-center border border-white/10">
            <p className="text-[9px] font-black uppercase text-slate-400">On Road</p>
            <p className="text-xl font-black text-blue-400">{dayTrips.filter(t => t.status === 'Scheduled').length}</p>
          </div>
        </div>
      </div>

      {/* SVG Map */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
        <div className="relative w-full" style={{ paddingBottom: '62.5%' /* 500/800 */ }}>
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="absolute inset-0 w-full h-full"
            style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}
          >
            {/* Grid dots background */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="1" fill="#e2e8f0" />
              </pattern>
            </defs>
            <rect width={SVG_W} height={SVG_H} fill="url(#grid)" />

            {/* Edges */}
            {EDGES.map(([fromId, toId]) => {
              const from = MAP_NODES.find(n => n.id === fromId)!;
              const to = MAP_NODES.find(n => n.id === toId)!;
              const x1 = toSVG(from.x, SVG_W);
              const y1 = toSVG(from.y, SVG_H);
              const x2 = toSVG(to.x, SVG_W);
              const y2 = toSVG(to.y, SVG_H);
              return (
                <line
                  key={`${fromId}-${toId}`}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 4"
                />
              );
            })}

            {/* Nodes */}
            {MAP_NODES.map(node => {
              const cx = toSVG(node.x, SVG_W);
              const cy = toSVG(node.y, SVG_H);
              const vehiclesHere = vehiclesByNode[node.id] || [];
              const R = 36;

              return (
                <g key={node.id}>
                  {/* Node circle */}
                  <circle cx={cx} cy={cy} r={R} fill={node.bgColor} stroke={node.color} strokeWidth="2.5" />
                  {/* Emoji */}
                  <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle" fontSize="18">{node.icon}</text>
                  {/* Label */}
                  <text x={cx} y={cy + 14} textAnchor="middle" fill={node.color} fontWeight="800" fontSize="9" fontFamily="system-ui">
                    {node.shortLabel}
                  </text>
                  {/* Vehicle icons around node */}
                  {vehiclesHere.slice(0, 4).map((v, idx) => {
                    const angle = (idx / 4) * Math.PI * 2 - Math.PI / 2;
                    const r2 = R + 24;
                    const vx = cx + r2 * Math.cos(angle);
                    const vy = cy + r2 * Math.sin(angle);
                    const vColor = getVehicleStatusColor(v.id);

                    return (
                      <g key={v.id} style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedVehicle(v)}>
                        <circle cx={vx} cy={vy} r={14} fill={vColor} stroke="white" strokeWidth="2" />
                        <text x={vx} y={vy} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="7" fontWeight="800" fontFamily="system-ui">
                          {v.plateNo.slice(-4).toUpperCase()}
                        </text>
                      </g>
                    );
                  })}
                  {vehiclesHere.length > 4 && (
                    <text x={cx} y={cy + R + 14} textAnchor="middle" fill={node.color} fontSize="9" fontWeight="700">
                      +{vehiclesHere.length - 4} more
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Status Legend */}
      <div className="flex items-center space-x-6 flex-wrap gap-y-2">
        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Vehicle Status:</span>
        {[
          { label: 'Idle / Available', color: '#94a3b8' },
          { label: 'In Transit', color: '#3b82f6' },
          { label: 'Completed / Returned', color: '#10b981' },
          { label: 'Waiting at Plant', color: '#f59e0b' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center space-x-1.5 text-[10px] font-bold text-slate-500">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Info note */}
      <div className="flex items-start space-x-2 bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <Info size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-blue-600 font-medium leading-relaxed">
          Vehicle positions are inferred from trip destinations. Click any vehicle circle on the map for full trip details.
          As actual GPS is not integrated, positions update based on trip status entries.
        </p>
      </div>

      {/* Vehicle popup */}
      {selectedVehicle && (
        <VehiclePopup
          vehicle={selectedVehicle}
          trips={dayTrips.filter(t => t.vehicleId === selectedVehicle.id)}
          onClose={() => setSelectedVehicle(null)}
        />
      )}
    </div>
  );
};

export default RouteVisualizer;
