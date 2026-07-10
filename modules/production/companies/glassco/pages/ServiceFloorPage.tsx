/**
 * ServiceFloorPage — routed Production-module home for the Service Floor.
 *
 * Revives the previously-orphaned ServiceFloorView: an operator marks each
 * glass service (Polishing / Grinding / Notching / Holes) done per piece with
 * a worker + sqft, which decrements the piece's pendingServices and advances it
 * to QC-Pending once the last service clears. Status-only, no GL.
 */
import React from 'react';
import { Navigate } from 'react-router-dom';
import { ProductionProvider, useProductionContext } from '@/modules/production/components/ProductionContext';
import { useAuthStore } from '@/modules/auth/authStore';
import { ProductionService } from '@/modules/production/services/productionService';
import ServiceFloorView, { ServiceJobLike } from '@/modules/production/components/ServiceFloorView';

const ALLOWED = new Set<string>([
  'super_admin', 'owner', 'hassan',
  'factory_manager', 'glassco_supervisor', 'glassco_admin', 'glassco_production',
]);

const ServiceFloorContent: React.FC = () => {
  const { pieces, jobOrders, clients, handleUpdatePieceStatus } = useProductionContext();
  const floorStaff = ProductionService.getFloorStaff('Glassco');
  const clientName = (id?: string): string => clients.find(c => c.id === id)?.name || '—';
  return (
    <div className="p-4">
      <ServiceFloorView
        pieces={pieces}
        onUpdateStatus={handleUpdatePieceStatus}
        floorStaff={floorStaff}
        jobs={jobOrders as unknown as ServiceJobLike[]}
        clientName={clientName}
      />
    </div>
  );
};

const ServiceFloorPage: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/" replace />;
  if (!ALLOWED.has(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-xl shadow border border-slate-200 p-8 max-w-sm text-center">
          <h2 className="text-lg font-black text-slate-800 mb-2">Restricted</h2>
          <p className="text-sm text-slate-500">
            The Service Floor is only available to production roles.
            Your role: <span className="font-mono font-bold">{user.role}</span>
          </p>
        </div>
      </div>
    );
  }
  return (
    <ProductionProvider company="Glassco">
      <ServiceFloorContent />
    </ProductionProvider>
  );
};

export default ServiceFloorPage;
