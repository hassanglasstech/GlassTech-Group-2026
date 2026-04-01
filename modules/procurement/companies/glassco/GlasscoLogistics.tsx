import React, { useState, useEffect } from 'react';
import { GatePass, TemperingDispatch, ProductionPiece, Quotation, Client, Vendor, Company } from '@/modules/shared/types';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { Truck, ShieldCheck, ClipboardList, LayoutGrid, MapPin, Zap } from 'lucide-react';
import GateControl from '@/modules/procurement/components/logistics/GateControl';
import SecurityAudit from '@/modules/procurement/components/logistics/SecurityAudit';
import DispatchPlanner from '@/modules/procurement/components/logistics/DispatchPlanner';
import VehicleTripManager from '@/modules/procurement/components/logistics/VehicleTripManager';
import GroupFleetBoard from '@/modules/procurement/components/logistics/GroupFleetBoard';
import RouteVisualizer from '@/modules/procurement/components/logistics/RouteVisualizer';
import TripBatchAdvisor from '@/modules/procurement/components/logistics/TripBatchAdvisor';

type LogisticsTab = 'gate' | 'security' | 'dispatches' | 'vehicles' | 'fleet' | 'routes' | 'batching';

const CompanyLogistics: React.FC<{ company: Company }> = ({ company }) => {
  const [activeTab, setActiveTab] = useState<LogisticsTab>('gate');
  const [gatePasses, setGatePasses] = useState<GatePass[]>([]);
  const [dispatches, setDispatches] = useState<TemperingDispatch[]>([]);
  const [pieces, setPieces] = useState<ProductionPiece[]>([]);
  const [jobOrders, setJobOrders] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  useEffect(() => { refreshData(); }, []);

  const refreshData = () => {
    setGatePasses(ProductionService.getGatePasses().filter(g => g.company === company).sort((a,b) => b.id.localeCompare(a.id)));
    setDispatches(ProductionService.getTemperingDispatches().sort((a,b) => b.id.localeCompare(a.id)));
    setPieces(ProductionService.getProductionPieces());
    const allQuos = SalesService.getQuotations();
    setJobOrders(allQuos.filter(q => q.status === 'Approved'));
    setClients(SalesService.getClients());
    setVendors(SalesService.getVendors());
  };

  const tabs: { id: LogisticsTab; label: string; icon: React.ReactNode; activeClass: string }[] = [
    { id: 'gate',      label: 'Gate Control',    icon: <Truck size={14}/>,       activeClass: 'bg-slate-900 text-white' },
    { id: 'security',  label: 'Security',         icon: <ShieldCheck size={14}/>, activeClass: 'bg-emerald-600 text-white' },
    { id: 'dispatches',label: 'Dispatches',       icon: <ClipboardList size={14}/>,activeClass: 'bg-blue-600 text-white' },
    { id: 'vehicles',  label: 'Vehicle Trips',    icon: <Truck size={14}/>,       activeClass: 'bg-indigo-600 text-white' },
    { id: 'fleet',     label: 'Fleet Board',      icon: <LayoutGrid size={14}/>,  activeClass: 'bg-slate-800 text-white' },
    { id: 'routes',    label: 'Route Map',        icon: <MapPin size={14}/>,      activeClass: 'bg-blue-700 text-white' },
    { id: 'batching',  label: 'Batch Advisor',    icon: <Zap size={14}/>,         activeClass: 'bg-violet-600 text-white' },
  ];

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

      {/* Tab Nav */}
      <div className="flex items-center space-x-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm no-print overflow-x-auto flex-wrap gap-y-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
              activeTab === tab.id ? tab.activeClass + ' shadow-md' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'gate' && (
        <GateControl gatePasses={gatePasses} pieces={pieces} jobOrders={jobOrders} clients={clients} company={company} refreshData={refreshData} />
      )}
      {activeTab === 'security' && (
        <SecurityAudit gatePasses={gatePasses} company={company} />
      )}
      {activeTab === 'dispatches' && (
        <DispatchPlanner dispatches={dispatches} pieces={pieces} jobOrders={jobOrders} clients={clients} vendors={vendors} company={company} refreshData={refreshData} />
      )}
      {activeTab === 'vehicles' && (
        <VehicleTripManager company={company} />
      )}
      {activeTab === 'fleet' && (
        <GroupFleetBoard />
      )}
      {activeTab === 'routes' && (
        <RouteVisualizer />
      )}
      {activeTab === 'batching' && (
        <TripBatchAdvisor />
      )}
    </div>
  );
};

export default CompanyLogistics;
