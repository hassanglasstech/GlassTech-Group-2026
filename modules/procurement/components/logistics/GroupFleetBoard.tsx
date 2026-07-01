/**
 * GroupFleetBoard.tsx — Phase 5A
 *
 * Cross-company fleet timeline:
 * - Y-axis = vehicle rows
 * - X-axis = time (hourly blocks 6am–10pm)
 * - Colored blocks = trips, company-badged
 * - Filter: company, vehicle, date
 * - Click block → detail popup
 */

import React, { useState, useMemo } from 'react';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Vehicle, VehicleTrip } from '@/modules/procurement/types/inventory';
import { Truck, Filter, X, Package, DollarSign, Building2, Clock, ChevronDown } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

const COMPANIES = ['Glassco', 'GTK', 'GTI', 'Factory', 'Nippon'] as const;
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am to 10pm

const COMPANY_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  Glassco: { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-300',   badge: 'bg-blue-600' },
  GTK:     { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300', badge: 'bg-emerald-600' },
  GTI:     { bg: 'bg-violet-100',  text: 'text-violet-800',  border: 'border-violet-300',  badge: 'bg-violet-600' },
  Factory: { bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-amber-300',   badge: 'bg-amber-600' },
  Nippon:  { bg: 'bg-rose-100',    text: 'text-rose-800',    border: 'border-rose-300',    badge: 'bg-rose-600' },
};

const STATUS_COLORS: Record<string, string> = {
  Scheduled:  'bg-blue-400',
  Completed:  'bg-emerald-500',
  Cancelled:  'bg-slate-300',
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('en-PK');

/** Parse "HH:MM" string → decimal hour (e.g. "08:30" → 8.5) */
const timeToDecimal = (t?: string): number => {
  if (!t) return 8; // default 8am
  const [h, m] = t.split(':').map(Number);
  return h + (m || 0) / 60;
};

/** Return position % and width % within the 6am-10pm grid */
const tripPosition = (startHour: number, durationHrs: number) => {
  const gridStart = 6;
  const gridEnd = 22;
  const gridSpan = gridEnd - gridStart;
  const left = Math.max(0, ((startHour - gridStart) / gridSpan) * 100);
  const width = Math.min(100 - left, (durationHrs / gridSpan) * 100);
  return { left: `${left}%`, width: `${Math.max(width, 2)}%` };
};

// ─────────────────────────────────────────────────────────────────────
// Trip Detail Popup
// ─────────────────────────────────────────────────────────────────────

interface TripPopupProps {
  trip: VehicleTrip;
  vehicle: Vehicle | undefined;
  onClose: () => void;
}

const TripPopup: React.FC<TripPopupProps> = ({ trip, vehicle, onClose }) => {
  const cc = COMPANY_COLORS[trip.company] || COMPANY_COLORS.Glassco;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className={`p-5 rounded-t-2xl ${cc.bg} border-b ${cc.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs font-black uppercase tracking-wider ${cc.text}`}>Trip Details</p>
              <p className="text-lg font-black text-slate-800 mt-0.5">{vehicle?.plateNo || 'Unknown'}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-xl transition-colors">
              <X size={16} className="text-slate-600" />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Company</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-black text-white ${cc.badge}`}>{trip.company}</span>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Status</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-black text-white ${STATUS_COLORS[trip.status] || 'bg-slate-400'}`}>{trip.status}</span>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Destination</p>
              <p className="text-sm font-black text-slate-700 mt-0.5">{trip.destination}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Service</p>
              <p className="text-sm font-bold text-slate-600 mt-0.5">{trip.serviceType || '—'}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Date</p>
              <p className="text-sm font-bold text-slate-600 mt-0.5">{trip.date}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Fare</p>
              <p className={`text-sm font-black mt-0.5 ${trip.fare > 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
                {trip.fare > 0 ? `PKR ${fmt(trip.fare)}` : 'Pending'}
              </p>
            </div>
            {trip.loadDirection && (
              <div className="col-span-2">
                <p className="text-[9px] font-black uppercase text-slate-400">Load Direction</p>
                <p className="text-xs font-bold text-slate-600 mt-0.5">{trip.loadDirection}</p>
              </div>
            )}
            {trip.glTxId && (
              <div className="col-span-2">
                <p className="text-[9px] font-black uppercase text-slate-400">GL Reference</p>
                <p className="text-xs font-mono text-slate-600 mt-0.5">{trip.glTxId}</p>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-slate-100">
            <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${trip.paidStatus === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {trip.paidStatus}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────

const GroupFleetBoard: React.FC = () => {
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterCompany, setFilterCompany] = useState<string>('');
  const [filterVehicle, setFilterVehicle] = useState<string>('');
  const [selectedTrip, setSelectedTrip] = useState<VehicleTrip | null>(null);

  const vehicles = useMemo(() => InventoryService.getVehicles(), []);
  const allTrips = useMemo(() => InventoryService.getVehicleTrips(), []);

  // Filter trips by date + company + vehicle
  const dayTrips = useMemo(() => {
    return allTrips.filter(t => {
      if (t.date !== filterDate) return false;
      if (filterCompany && t.company !== filterCompany) return false;
      if (filterVehicle && t.vehicleId !== filterVehicle) return false;
      return true;
    });
  }, [allTrips, filterDate, filterCompany, filterVehicle]);

  // Vehicles that have trips today OR all active vehicles
  const activeVehicles = useMemo(() => {
    const withTrips = new Set(dayTrips.map(t => t.vehicleId));
    return vehicles.filter(v =>
      v.status === 'Active' || withTrips.has(v.id)
    );
  }, [vehicles, dayTrips]);

  // Stats
  const totalFare = dayTrips.reduce((s, t) => s + (t.fare || 0), 0);
  const completedCount = dayTrips.filter(t => t.status === 'Completed').length;
  const companyBreakdown = useMemo(() => {
    const s: Record<string, number> = {};
    dayTrips.forEach(t => { s[t.company] = (s[t.company] || 0) + 1; });
    return s;
  }, [dayTrips]);

  const getVehicle = (id: string) => vehicles.find(v => v.id === id);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-7 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"><Truck size={160} className="absolute -right-4 -top-4" /></div>
        <div className="relative z-10 flex items-start justify-between">
          <div>
            
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">
              All companies · All vehicles · Live timeline
            </p>
          </div>
          <div className="flex space-x-3">
            <div className="bg-white/10 px-4 py-2.5 rounded-2xl text-center border border-white/10">
              <p className="text-[9px] font-black uppercase text-slate-400">Today Trips</p>
              <p className="text-xl font-black">{dayTrips.length}</p>
            </div>
            <div className="bg-emerald-500/20 px-4 py-2.5 rounded-2xl text-center border border-emerald-500/20">
              <p className="text-[9px] font-black uppercase text-emerald-400">Done</p>
              <p className="text-xl font-black text-emerald-400">{completedCount}</p>
            </div>
            <div className="bg-white/10 px-4 py-2.5 rounded-2xl text-center border border-white/10">
              <p className="text-[9px] font-black uppercase text-slate-400">Fare</p>
              <p className="text-lg font-black">PKR {fmt(totalFare)}</p>
            </div>
          </div>
        </div>

        {/* Company breakdown badges */}
        {Object.entries(companyBreakdown).length > 0 && (
          <div className="flex space-x-2 mt-4 relative z-10">
            {Object.entries(companyBreakdown).map(([co, count]) => {
              const cc = COMPANY_COLORS[co] || COMPANY_COLORS.Glassco;
              return (
                <span key={co} className={`px-3 py-1 rounded-full text-[10px] font-black text-white ${cc.badge}`}>
                  {co}: {count} trip{count !== 1 ? 's' : ''}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center space-x-3 flex-wrap gap-y-2">
        <Filter size={14} className="text-slate-400 flex-shrink-0" />
        <input
          type="date" value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white">
          <option value="">All Companies</option>
          {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white">
          <option value="">All Vehicles</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNo} ({v.type})</option>)}
        </select>
        {(filterCompany || filterVehicle) && (
          <button onClick={() => { setFilterCompany(''); setFilterVehicle(''); }}
            className="flex items-center space-x-1 px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors">
            <X size={12} /> <span>Clear</span>
          </button>
        )}
        <span className="ml-auto text-[10px] text-slate-400 font-bold">{dayTrips.length} trips for {filterDate}</span>
      </div>

      {/* Timeline Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {/* Hour header */}
        <div className="border-b border-slate-100 flex">
          {/* Vehicle label col */}
          <div className="w-36 flex-shrink-0 border-r border-slate-100 px-3 py-2.5">
            <p className="text-[9px] font-black uppercase text-slate-400">Vehicle</p>
          </div>
          {/* Hour columns */}
          <div className="flex-1 relative" style={{ minWidth: 0 }}>
            <div className="flex">
              {HOURS.map(h => (
                <div key={h} className="flex-1 text-center py-2.5 border-r border-slate-50 last:border-r-0">
                  <span className="text-[9px] font-black text-slate-300">
                    {h > 12 ? `${h - 12}pm` : h === 12 ? '12pm' : `${h}am`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Vehicle rows */}
        {activeVehicles.length === 0 ? (
          <div className="py-16 text-center">
            <Truck size={32} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm font-bold text-slate-300">No vehicles or trips for {filterDate}</p>
          </div>
        ) : (
          activeVehicles.map(vehicle => {
            const vTrips = dayTrips.filter(t => t.vehicleId === vehicle.id);

            return (
              <div key={vehicle.id} className="flex border-b border-slate-50 last:border-b-0 hover:bg-slate-50/30 transition-colors min-h-[52px]">
                {/* Vehicle info */}
                <div className="w-36 flex-shrink-0 border-r border-slate-100 px-3 py-3 flex flex-col justify-center">
                  <p className="text-xs font-black text-slate-800 uppercase">{vehicle.plateNo}</p>
                  <p className="text-[9px] text-slate-400 font-bold mt-0.5">{vehicle.type}</p>
                  {vTrips.length === 0 && (
                    <span className="text-[8px] text-slate-300 font-bold uppercase mt-0.5">Available</span>
                  )}
                </div>

                {/* Timeline area */}
                <div className="flex-1 relative py-2 px-1" style={{ minWidth: 0 }}>
                  {/* Hour grid lines */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {HOURS.map(h => (
                      <div key={h} className="flex-1 border-r border-slate-50 last:border-r-0" />
                    ))}
                  </div>

                  {/* Trip blocks */}
                  {vTrips.map(trip => {
                    const startHour = timeToDecimal(trip.date === filterDate ? '08:00' : undefined);
                    // Estimate duration: Completed = 2h avg, Scheduled = 3h
                    const duration = trip.status === 'Completed' ? 2 : 3;
                    const pos = tripPosition(startHour, duration);
                    const cc = COMPANY_COLORS[trip.company] || COMPANY_COLORS.Glassco;
                    const statusBg = trip.status === 'Completed' ? 'bg-emerald-500' :
                      trip.status === 'Cancelled' ? 'bg-slate-300' : 'bg-blue-500';

                    return (
                      <button
                        key={trip.id}
                        onClick={() => setSelectedTrip(trip)}
                        className={`absolute top-2 bottom-2 rounded-lg ${statusBg} text-white text-[9px] font-black px-2 flex items-center overflow-hidden cursor-pointer hover:opacity-90 hover:shadow-md transition-all z-10 group`}
                        style={{ left: pos.left, width: pos.width }}
                        title={`${trip.destination} — ${trip.company}`}
                      >
                        <div className="truncate">
                          <div className="truncate">{trip.destination}</div>
                          <div className={`text-[8px] opacity-80 ${cc.badge} rounded px-1 inline-block mt-0.5`}>{trip.company}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center space-x-4 text-[10px] font-bold text-slate-400 flex-wrap gap-y-2">
        <span className="font-black text-slate-500 uppercase text-[9px] tracking-wider">Status:</span>
        {[['Scheduled', 'bg-blue-500'], ['Completed', 'bg-emerald-500'], ['Cancelled', 'bg-slate-300']].map(([label, bg]) => (
          <div key={label} className="flex items-center space-x-1.5">
            <span className={`w-3 h-3 rounded-sm ${bg}`} />
            <span>{label}</span>
          </div>
        ))}
        <span className="font-black text-slate-500 uppercase text-[9px] tracking-wider ml-4">Companies:</span>
        {Object.entries(COMPANY_COLORS).map(([co, cc]) => (
          <div key={co} className="flex items-center space-x-1.5">
            <span className={`w-3 h-3 rounded-full ${cc.badge}`} />
            <span>{co}</span>
          </div>
        ))}
      </div>

      {/* Trip popup */}
      {selectedTrip && (
        <TripPopup
          trip={selectedTrip}
          vehicle={getVehicle(selectedTrip.vehicleId)}
          onClose={() => setSelectedTrip(null)}
        />
      )}
    </div>
  );
};

export default GroupFleetBoard;
