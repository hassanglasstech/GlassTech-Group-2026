import React, { useState, useEffect } from 'react';
import { GatePass, TemperingDispatch, ProductionPiece, Quotation, Client, Vendor, Company } from '@/modules/shared/types';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { Truck, ShieldCheck, ClipboardList } from 'lucide-react';
import GateControl from '@/modules/procurement/components/logistics/GateControl';
import SecurityAudit from '@/modules/procurement/components/logistics/SecurityAudit';
import DispatchPlanner from '@/modules/procurement/components/logistics/DispatchPlanner';
import VehicleTripManager from '@/modules/procurement/components/logistics/VehicleTripManager';

const CompanyLogistics: React.FC<{ company: Company }> = ({ company }) => {
  const [activeTab, setActiveTab] = useState<'gate' | 'security' | 'dispatches' | 'vehicles'>('gate');
  const [gatePasses, setGatePasses] = useState<GatePass[]>([]);
  const [dispatches, setDispatches] = useState<TemperingDispatch[]>([]);
  const [pieces, setPieces] = useState<ProductionPiece[]>([]);
  const [jobOrders, setJobOrders] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    setGatePasses(ProductionService.getGatePasses().filter(g => g.company === company).sort((a,b) => b.id.localeCompare(a.id)));
    // Cross-company visibility — show all trips, not just own company
    setDispatches(ProductionService.getTemperingDispatches().sort((a,b) => b.id.localeCompare(a.id)));
    setPieces(ProductionService.getProductionPieces());
    
    const allQuos = SalesService.getQuotations();
    setJobOrders(allQuos.filter(q => q.status === 'Approved'));
    setClients(SalesService.getClients());
    setVendors(SalesService.getVendors());
  };

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-challan, .print-gate-pass { display: block !important; position: absolute; top: 0; left: 0; width: 100%; background: white !important; z-index: 9999; }
          @page { size: A4; margin: 10mm 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
          table { page-break-inside: auto; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          .challan-table { width: 100%; border-collapse: collapse; font-size: 10px; }
          .challan-table th { background: #f3f4f6 !important; color: #000 !important; font-weight: 800; padding: 4px 6px; border: 1px solid #ccc; text-transform: uppercase; }
          .challan-table td { padding: 4px 6px; border: 1px solid #ccc; text-align: center; }
        }
        .print-challan, .print-gate-pass { display: none; }
      `}</style>

      <div className="flex items-center space-x-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit no-print">
        <button onClick={() => setActiveTab('gate')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'gate' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <Truck size={16} /><span>Gate Control (MIGO_GATE)</span>
        </button>
        <button onClick={() => setActiveTab('security')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'security' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <ShieldCheck size={16} /><span>Security Check</span>
        </button>
        <button onClick={() => setActiveTab('dispatches')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'dispatches' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <ClipboardList size={16} /><span>Dispatch Matrix (VT01N)</span>
        </button>
        <button onClick={() => setActiveTab('vehicles')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'vehicles' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
          <Truck size={16} /><span>Vehicle Trip Manager</span>
        </button>
      </div>

      {activeTab === 'gate' && (
        <GateControl 
            company={company}
            gatePasses={gatePasses}
            dispatches={dispatches}
            refreshData={refreshData}
        />
      )}

      {activeTab === 'security' && (
        <SecurityAudit 
            gatePasses={gatePasses}
            pieces={pieces}
            dispatches={dispatches}
            jobOrders={jobOrders}
            clients={clients}
            refreshData={refreshData}
        />
      )}

      {activeTab === 'dispatches' && (
        <DispatchPlanner 
            company={company}
            dispatches={dispatches}
            pieces={pieces}
            jobOrders={jobOrders}
            clients={clients}
            vendors={vendors}
            refreshData={refreshData}
        />
      )}

      {activeTab === 'vehicles' && (
        <VehicleTripManager company={company} />
      )}
    </div>
  );
};

export default CompanyLogistics;
