import React from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { Truck } from 'lucide-react';
import CompanyLogistics from '@/modules/procurement/companies/glassco/GlasscoLogistics';
import NipponLogisticsGatePass from '@/modules/procurement/companies/nippon/NipponLogisticsGatePass';

// God Mode audit (Phase 2): Logistics is glass-factory only —
// gate passes, vehicle trips, dispatch planner, geofence alerts,
// security audit etc. all assume a manufacturing flow with physical
// dispatch to tempering vendors. Hardware traders (Nippon) and pure
// aluminium fab (GTK/GTI) don't need any of it.
//
// Tab is already hidden in ProcurementHub for Nippon, but if a user
// deep-links to /#/procurement?tab=logistics or switches company
// while on this page, we want a defensive stub — NOT a crashing
// GlasscoLogistics trying to render with no production_pieces.
const NON_GLASS_COMPANIES = new Set(['GTK', 'GTI', 'Factory']);

const LogisticsModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);

  // Nippon (trading) uses Logistics only for the office Gate Pass desk — the store
  // requests a pass, the office issues it here and it's pushed to the Factory gate.
  if (company === 'Nippon') {
    return <NipponLogisticsGatePass />;
  }

  if (NON_GLASS_COMPANIES.has(company as string)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="bg-slate-100 rounded-full p-6 mb-4">
          <Truck size={48} className="text-slate-400" />
        </div>
        <h3 className="text-base font-black uppercase tracking-widest text-slate-700 mb-2">
          Logistics — not configured for {company}
        </h3>
        <p className="text-xs font-bold text-slate-400 max-w-md leading-relaxed">
          Logistics planning (gate passes, vehicle trips, dispatch routing) is
          only available for Glassco (manufacturing flow). {company} uses direct
          GRN / Sales delivery without intermediate logistics tracking.
        </p>
      </div>
    );
  }

  return <CompanyLogistics company={company} />;
};

export default React.memo(LogisticsModule);
