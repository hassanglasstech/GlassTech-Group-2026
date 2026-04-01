/**
 * TripBatchAdvisor.tsx — Phase 5C
 *
 * Smart trip batching:
 * - Scans pieces with status 'QC-Passed' (ready for tempering dispatch)
 * - Groups by destination vendor → batch suggestion card
 * - "Create Batch Trip" one-click → pre-fills VehicleTrip form
 * - Also suggests DG batching (Tempered pieces needing DG)
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionPiece, Quotation } from '@/modules/shared/types';
import { VehicleTrip, Vehicle } from '@/modules/procurement/types/inventory';
import { Layers, Truck, Zap, Package, Plus, CheckCircle2, AlertCircle, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

const VEHICLE_CAPACITY: Record<string, number> = {
  Shehzore: 300,  // sqft approx
  Pickup:   150,
  Truck:    600,
  Loader:   200,
  Container: 1000,
  Other:    200,
};

const TEMPERING_VENDORS = ['AGC', 'PSG', 'Tempering', 'Temper'];
const DG_VENDORS = ['DG', 'Double Glaze', 'Double Glass'];

const fmt = (n: number, d = 0) => n.toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });
const nowDate = () => new Date().toISOString().split('T')[0];
const genId = () => `TRIP-BATCH-${Date.now()}`;

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

interface BatchGroup {
  destination: string;
  serviceType: 'Tempering' | 'DG' | 'Other';
  pieces: ProductionPiece[];
  orders: string[];      // unique order IDs
  totalSqft: number;
  suggestedVehicle: string;  // vehicle type
  fits: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Create Trip Modal
// ─────────────────────────────────────────────────────────────────────

interface CreateTripModalProps {
  batch: BatchGroup;
  vehicles: Vehicle[];
  company: string;
  onClose: () => void;
  onCreated: () => void;
}

const CreateTripModal: React.FC<CreateTripModalProps> = ({ batch, vehicles, company, onClose, onCreated }) => {
  const [form, setForm] = useState({
    vehicleId: vehicles[0]?.id || '',
    date: nowDate(),
    fare: 0,
    notes: '',
  });

  const selectedVehicle = vehicles.find(v => v.id === form.vehicleId);

  const handleCreate = () => {
    if (!form.vehicleId) { toast.error('Vehicle select karo'); return; }

    const trip: VehicleTrip = {
      id: genId(),
      vehicleId: form.vehicleId,
      company: company as any,
      date: form.date,
      destination: batch.destination,
      serviceType: batch.serviceType,
      fare: form.fare,
      status: 'Scheduled',
      paidStatus: 'Unpaid',
    };

    const all = InventoryService.getVehicleTrips();
    InventoryService.saveVehicleTrips([...all, trip]);
    toast.success(`Batch trip created → ${batch.destination} (${batch.pieces.length} pieces)`);
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="bg-blue-50 border-b border-blue-200 p-5 rounded-t-2xl flex items-center justify-between">
          <div>
            <p className="text-xs font-black text-blue-700 uppercase">Create Batch Trip</p>
            <p className="text-sm font-black text-slate-800 mt-0.5">{batch.destination}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-blue-100 rounded-xl"><X size={16} className="text-blue-500" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Summary */}
          <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Pieces</p>
              <p className="text-lg font-black text-blue-700">{batch.pieces.length}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Sqft</p>
              <p className="text-lg font-black text-blue-700">{fmt(batch.totalSqft, 1)}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Orders</p>
              <p className="text-lg font-black text-blue-700">{batch.orders.length}</p>
            </div>
          </div>

          {/* Vehicle select */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1.5">Vehicle</label>
            <select value={form.vehicleId} onChange={e => setForm(p => ({ ...p, vehicleId: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
              <option value="">— Select Vehicle —</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.plateNo} ({v.type}) — {v.driverName || 'No driver'}
                </option>
              ))}
            </select>
            {selectedVehicle && (
              <p className={`text-[10px] font-bold mt-1 ${batch.fits ? 'text-emerald-600' : 'text-amber-600'}`}>
                {selectedVehicle.type} capacity: ~{VEHICLE_CAPACITY[selectedVehicle.type] || 200} sqft
                {batch.fits ? ' ✓ Fits' : ' ⚠ Multiple trips may be needed'}
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1.5">Trip Date</label>
            <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          {/* Fare */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1.5">Agreed Fare (PKR) — optional</label>
            <input type="number" min={0} value={form.fare || ''}
              onChange={e => setForm(p => ({ ...p, fare: Number(e.target.value) }))}
              placeholder="Enter fare or set later"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex justify-end space-x-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-400 hover:bg-slate-50 rounded-xl">Cancel</button>
          <button onClick={handleCreate}
            className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-black uppercase rounded-xl hover:bg-blue-700 transition-colors">
            <Truck size={14} /> <span>Create Trip</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Batch Card
// ─────────────────────────────────────────────────────────────────────

interface BatchCardProps {
  batch: BatchGroup;
  vehicles: Vehicle[];
  company: string;
  onCreated: () => void;
}

const BatchCard: React.FC<BatchCardProps> = ({ batch, vehicles, company, onCreated }) => {
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isTemp = batch.serviceType === 'Tempering';
  const isDG = batch.serviceType === 'DG';

  const bgColor = isTemp ? 'bg-violet-50 border-violet-200' : isDG ? 'bg-cyan-50 border-cyan-200' : 'bg-slate-50 border-slate-200';
  const accentColor = isTemp ? 'bg-violet-600' : isDG ? 'bg-cyan-600' : 'bg-slate-600';
  const textColor = isTemp ? 'text-violet-700' : isDG ? 'text-cyan-700' : 'text-slate-700';

  const suggestedVehicles = vehicles.filter(v =>
    v.status === 'Active' && v.type === batch.suggestedVehicle
  );
  const availableVehicles = vehicles.filter(v => v.status === 'Active');

  return (
    <>
      <div className={`rounded-2xl border-2 p-5 ${bgColor}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl ${accentColor} text-white`}>
              {isTemp ? <Zap size={16} /> : isDG ? <Layers size={16} /> : <Package size={16} />}
            </div>
            <div>
              <p className={`text-sm font-black uppercase ${textColor}`}>{batch.destination}</p>
              <p className="text-[10px] text-slate-500 font-bold">{batch.serviceType} dispatch</p>
            </div>
          </div>
          <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black text-white uppercase ${accentColor}`}>
            {batch.pieces.length} pieces
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white/70 rounded-xl p-2.5 text-center">
            <p className="text-[9px] font-black uppercase text-slate-400">Total Sqft</p>
            <p className={`text-lg font-black ${textColor}`}>{fmt(batch.totalSqft, 1)}</p>
          </div>
          <div className="bg-white/70 rounded-xl p-2.5 text-center">
            <p className="text-[9px] font-black uppercase text-slate-400">Orders</p>
            <p className={`text-lg font-black ${textColor}`}>{batch.orders.length}</p>
          </div>
          <div className="bg-white/70 rounded-xl p-2.5 text-center">
            <p className="text-[9px] font-black uppercase text-slate-400">Suggested</p>
            <p className={`text-sm font-black ${textColor}`}>{batch.suggestedVehicle}</p>
          </div>
        </div>

        {/* Fit indicator */}
        <div className={`flex items-center space-x-2 text-xs font-bold mb-4 ${batch.fits ? 'text-emerald-600' : 'text-amber-600'}`}>
          {batch.fits ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span>
            {batch.fits
              ? `Fits in 1 ${batch.suggestedVehicle} (~${VEHICLE_CAPACITY[batch.suggestedVehicle] || 200} sqft capacity)`
              : `May need multiple trips — exceeds ${batch.suggestedVehicle} capacity`}
          </span>
        </div>

        {/* Order list (expandable) */}
        {batch.orders.length > 0 && (
          <div className="mb-4">
            <button onClick={() => setExpanded(p => !p)}
              className="flex items-center space-x-1 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-colors">
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              <span>{expanded ? 'Hide' : 'Show'} orders</span>
            </button>
            {expanded && (
              <div className="mt-2 space-y-1">
                {batch.orders.map(orderId => (
                  <div key={orderId} className="flex items-center space-x-2 text-[10px] font-bold text-slate-600 bg-white/60 px-2.5 py-1.5 rounded-lg">
                    <Package size={9} className="text-slate-400" />
                    <span>{orderId}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-400">{batch.pieces.filter(p => p.orderId === orderId).length} pieces</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action button */}
        <button
          onClick={() => setShowModal(true)}
          disabled={availableVehicles.length === 0}
          className={`w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
            availableVehicles.length > 0
              ? `${accentColor} text-white hover:opacity-90`
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          <Plus size={14} />
          <span>
            {availableVehicles.length > 0
              ? `Create Batch Trip${suggestedVehicles.length > 0 ? ` (${suggestedVehicles.length} ${batch.suggestedVehicle} available)` : ''}`
              : 'No active vehicles'}
          </span>
        </button>
      </div>

      {showModal && (
        <CreateTripModal
          batch={batch}
          vehicles={availableVehicles}
          company={company}
          onClose={() => setShowModal(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────

const TripBatchAdvisor: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [refreshKey, setRefreshKey] = useState(0);

  const pieces = useMemo(() => ProductionService.getProductionPieces().filter(p => p.company === company || !p.company), [refreshKey]);
  const vehicles = useMemo(() => InventoryService.getVehicles(), [refreshKey]);
  const vendors = useMemo(() => SalesService.getVendors().filter(v => v.company === company), [company]);

  // QC-Passed pieces → ready for tempering
  const qcPassed = useMemo(() => pieces.filter(p => p.status === 'QC-Passed'), [pieces]);
  // Tempered pieces → ready for DG
  const tempered = useMemo(() => pieces.filter(p => p.status === 'Tempered'), [pieces]);

  // Group QC-Passed by tempering vendor destination
  const temperingBatches = useMemo((): BatchGroup[] => {
    if (qcPassed.length === 0) return [];

    // Try to group by vendor from dispatch history, else group all together
    const temperingVendors = vendors.filter(v =>
      TEMPERING_VENDORS.some(kw => v.name?.toUpperCase().includes(kw.toUpperCase()))
    );

    if (temperingVendors.length > 0) {
      return temperingVendors.map(vendor => {
        const sqft = qcPassed.reduce((s, p) => {
          const job = SalesService.getQuotations().find(q => q.id === p.orderId || q.orderNo === p.orderId);
          const jobSqft = job?.items?.reduce((js: number, it: any) => js + (it.totalSqFt || 0), 0) || 0;
          return s + jobSqft / Math.max(1, qcPassed.length) * 1; // approximate per piece
        }, 0);

        const totalSqft = sqft * qcPassed.length;
        const suggestedVehicle = totalSqft <= 150 ? 'Pickup' : totalSqft <= 300 ? 'Shehzore' : 'Truck';

        return {
          destination: vendor.name,
          serviceType: 'Tempering' as const,
          pieces: qcPassed,
          orders: [...new Set(qcPassed.map(p => p.orderId))],
          totalSqft,
          suggestedVehicle,
          fits: totalSqft <= (VEHICLE_CAPACITY[suggestedVehicle] || 200),
        };
      });
    }

    // No specific vendor — single group
    const totalSqft = qcPassed.length * 8; // ~8 sqft per piece estimate
    const suggestedVehicle = totalSqft <= 150 ? 'Pickup' : totalSqft <= 300 ? 'Shehzore' : 'Truck';
    return [{
      destination: 'Tempering Plant',
      serviceType: 'Tempering',
      pieces: qcPassed,
      orders: [...new Set(qcPassed.map(p => p.orderId))],
      totalSqft,
      suggestedVehicle,
      fits: totalSqft <= (VEHICLE_CAPACITY[suggestedVehicle] || 200),
    }];
  }, [qcPassed, vendors]);

  // Group Tempered by DG vendor destination
  const dgBatches = useMemo((): BatchGroup[] => {
    if (tempered.length === 0) return [];
    const totalSqft = tempered.length * 10;
    const suggestedVehicle = totalSqft <= 150 ? 'Pickup' : totalSqft <= 300 ? 'Shehzore' : 'Truck';
    return [{
      destination: 'DG Plant',
      serviceType: 'DG',
      pieces: tempered,
      orders: [...new Set(tempered.map(p => p.orderId))],
      totalSqft,
      suggestedVehicle,
      fits: totalSqft <= (VEHICLE_CAPACITY[suggestedVehicle] || 200),
    }];
  }, [tempered]);

  const allBatches = [...temperingBatches, ...dgBatches];
  const totalPiecesReady = qcPassed.length + tempered.length;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-900 to-slate-900 text-white p-7 rounded-3xl shadow-xl flex items-center justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"><Zap size={160} className="absolute -right-4 top-0" /></div>
        <div className="relative z-10">
          <div className="flex items-center space-x-2 mb-1">
            <Zap size={18} className="text-violet-400" />
            <h2 className="text-xl font-black uppercase">Trip Batch Advisor</h2>
          </div>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
            Smart batching · QC-Passed → Tempering · Tempered → DG
          </p>
        </div>
        <div className="flex space-x-3 relative z-10">
          <div className="bg-violet-500/20 px-4 py-2.5 rounded-2xl text-center border border-violet-500/20">
            <p className="text-[9px] font-black uppercase text-violet-300">QC Passed</p>
            <p className="text-xl font-black text-violet-300">{qcPassed.length}</p>
          </div>
          <div className="bg-cyan-500/20 px-4 py-2.5 rounded-2xl text-center border border-cyan-500/20">
            <p className="text-[9px] font-black uppercase text-cyan-300">Tempered</p>
            <p className="text-xl font-black text-cyan-300">{tempered.length}</p>
          </div>
          <button onClick={() => setRefreshKey(p => p + 1)}
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors border border-white/10">
            <RefreshCw size={16} className="text-slate-300" />
          </button>
        </div>
      </div>

      {/* No data */}
      {totalPiecesReady === 0 && (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl py-20 text-center">
          <Truck size={40} className="mx-auto text-slate-200 mb-4" />
          <p className="text-sm font-bold text-slate-400">No pieces ready for dispatch</p>
          <p className="text-xs text-slate-300 mt-2">
            QC-Passed pieces → Tempering batches<br />
            Tempered pieces → DG batches
          </p>
        </div>
      )}

      {/* Batch cards */}
      {allBatches.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
              {allBatches.length} Batch{allBatches.length !== 1 ? 'es' : ''} Ready
            </p>
            <p className="text-[10px] text-slate-400 font-bold">{totalPiecesReady} pieces total</p>
          </div>
          {allBatches.map(batch => (
            <BatchCard
              key={`${batch.destination}-${batch.serviceType}`}
              batch={batch}
              vehicles={vehicles}
              company={company}
              onCreated={() => setRefreshKey(p => p + 1)}
            />
          ))}
        </div>
      )}

      {/* Fleet availability note */}
      {vehicles.filter(v => v.status === 'Active').length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start space-x-3">
          <AlertCircle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            No active vehicles in fleet. Go to Vehicle Trip Manager → Vehicles tab and add/activate vehicles first.
          </p>
        </div>
      )}
    </div>
  );
};


export default TripBatchAdvisor;
