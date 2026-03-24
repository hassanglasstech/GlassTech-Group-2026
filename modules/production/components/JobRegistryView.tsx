
import React, { useState, useMemo } from 'react';
import { Quotation, ProductionPiece, TemperingDispatch, Client } from '@/modules/shared/types';
import { Filter, CheckCircle2, Truck, AlertTriangle, CalendarDays } from 'lucide-react';
import { getGlassSize, isInternal, isDispatchOverdue } from './ProductionUtils';
import Pagination from '@/components/Pagination';

interface ServiceBreakdown {
    total: number;
    returned: number;
}

interface ServiceGroup {
    service: string;
    vendor: string;
    overdue: boolean;
    breakdown: Record<string, ServiceBreakdown>;
}

interface JobRegistryViewProps {
    jobOrders: Quotation[];
    pieces: ProductionPiece[];
    dispatches: TemperingDispatch[];
    clients: Client[];
    selectedClientFilter: string;
    setSelectedClientFilter: (val: string) => void;
    filterDate: string;
    setFilterDate: (val: string) => void;
}

const JobRegistryView: React.FC<JobRegistryViewProps> = ({ 
    jobOrders, pieces, dispatches, clients, 
    selectedClientFilter, setSelectedClientFilter, filterDate, setFilterDate 
}) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState('Active');
    const itemsPerPage = 10; 

    const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || 'Walk-in Partner';

    const getServiceShortName = (type: string) => {
        if (type === 'Double Glazing') return 'DG';
        if (type === 'Lamination') return 'Lam';
        return 'Tmp';
    };

    const getServiceBadgeColor = (type: string) => {
        switch(type) {
            case 'Lamination': return 'bg-orange-500';
            case 'Double Glazing': return 'bg-cyan-500';
            case 'Tempering': return 'bg-rose-500';
            default: return 'bg-slate-500';
        }
    };

    const filteredJobs = useMemo(() => {
        const result = jobOrders.filter(j => {
            const matchesClient = selectedClientFilter ? j.clientId === selectedClientFilter : true;
            const matchesPeriod = filterDate ? j.date.startsWith(filterDate) : true;
            
            if (!matchesClient || !matchesPeriod) return false;

            const jobPieces = pieces.filter(p => p.orderId === j.orderNo);
            const delivered = jobPieces.filter(p => p.status === 'Delivered').length;
            
            if (statusFilter === 'All') return true;
            if (statusFilter === 'Active') return !(delivered === jobPieces.length && jobPieces.length > 0); // everything except fully delivered
            if (jobPieces.length === 0) return statusFilter === 'Pending';
            
            if (statusFilter === 'Delivered') return delivered === jobPieces.length;
            if (statusFilter === 'WIP') return delivered < jobPieces.length && (delivered > 0 || jobPieces.some(p => p.status !== 'Cut'));
            if (statusFilter === 'Pending') return delivered === 0 && jobPieces.every(p => p.status === 'Cut');

            return true;
        });
        return result.sort((a,b) => {
            // Improved sorting: Extract base numeric part, ignoring revisions
            const idA = a.orderNo ? a.orderNo.split('-').filter(p => !p.startsWith('R')).pop() || '' : '';
            const idB = b.orderNo ? b.orderNo.split('-').filter(p => !p.startsWith('R')).pop() || '' : '';
            return idA.localeCompare(idB, undefined, { numeric: true });
        });
    }, [jobOrders, selectedClientFilter, filterDate, statusFilter, pieces]);

    const paginatedJobs = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredJobs.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredJobs, currentPage]);

    return (
        <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden animate-in fade-in duration-500 flex flex-col min-h-[600px]">
           <div className="flex-1 overflow-x-auto">
               <table className="w-full text-left sap-table">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 tracking-widest border-b">
                     <tr>
                        <th className="px-6 py-4">
                          <div className="flex flex-col space-y-2">
                            <span className="flex items-center space-x-1"><Filter size={10} /> <span>Entity Filters</span></span>
                            <div className="flex space-x-1">
                                <select 
                                    className="text-[9px] border border-slate-300 rounded px-2 py-1 text-slate-600 font-bold bg-white focus:outline-none w-32"
                                    value={selectedClientFilter}
                                    onChange={(e) => { setSelectedClientFilter(e.target.value); setCurrentPage(1); }}
                                >
                                    <option value="">All Clients</option>
                                    {Array.from(new Set(jobOrders.map(j => j.clientId))).map(clientId => {
                                        const client = clients.find(c => c.id === clientId);
                                        return <option key={clientId} value={clientId}>{client?.name || clientId}</option>
                                    })}
                                </select>
                                <select 
                                    className="text-[9px] border border-slate-300 rounded px-2 py-1 text-slate-600 font-bold bg-white focus:outline-none w-24"
                                    value={statusFilter}
                                    onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                >
                                    <option value="Active">Active (Pending + WIP)</option>
                                    <option value="All">All Status</option>
                                    <option value="Delivered">Delivered</option>
                                    <option value="WIP">WIP</option>
                                    <option value="Pending">Pending</option>
                                </select>
                            </div>
                            <div className="relative">
                                <CalendarDays size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/>
                                <input
                                    type="month"
                                    className="text-[9px] border border-slate-300 rounded pl-6 pr-2 py-1 text-slate-600 font-bold bg-white focus:outline-none w-full"
                                    value={filterDate}
                                    onChange={(e) => { setFilterDate(e.target.value); setCurrentPage(1); }}
                                />
                            </div>
                          </div>
                        </th>
                        <th className="px-6 py-4">Key Dates</th>
                        <th className="px-6 py-4 text-center">Glass Configuration</th>
                        <th className="px-6 py-4">External Processing (Detailed)</th>
                        <th className="px-6 py-4">Site Delivery (Final)</th>
                        <th className="px-6 py-4 w-56">Order SLA Timeline</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                     {paginatedJobs.map(j => {
                        const jobPieces = pieces.filter(p => p.orderId === j.orderNo);
                        
                        // Extract numeric ID only, filtering out any revision part like -R1
                        const numericId = j.orderNo 
                            ? j.orderNo.split('-').filter(p => !p.startsWith('R')).pop() || '-'
                            : '-';

                        const startDate = jobPieces.length > 0 && jobPieces.some(p => p.status !== 'Cut') 
                           ? jobPieces[0].lastUpdated.split('T')[0] 
                           : 'Not Started';

                        const sizeGroups = jobPieces.reduce((acc, p) => {
                           const size = getGlassSize(p.specs);
                           if(!acc[size]) acc[size] = { total: 0, done: 0 };
                           acc[size].total++;
                           if (['QC-Passed', 'Ready to Dispatch', 'Dispatched', 'Tempered', 'Delivered'].includes(p.status)) acc[size].done++;
                           return acc;
                        }, {} as Record<string, { total: number, done: number }>);

                        const externalDispatches = dispatches.filter(d => 
                           d.pieceIds.some(pid => jobPieces.some(jp => jp.id === pid)) &&
                           !isInternal(d.plantName) && 
                           d.serviceType !== 'Site Delivery'
                        );

                        const serviceGroups = externalDispatches.reduce((acc, d) => {
                            const key = `${d.serviceType}-${d.plantName}`;
                            if (!acc[key]) {
                                acc[key] = {
                                    service: d.serviceType,
                                    vendor: d.plantName,
                                    overdue: false,
                                    breakdown: {}
                                };
                            }
                            if (d.expectedReturnDate && isDispatchOverdue(d.expectedReturnDate)) {
                                acc[key].overdue = true;
                            }
                            d.pieceIds.forEach(pid => {
                                const p = jobPieces.find(jp => jp.id === pid);
                                if (p) {
                                    const size = getGlassSize(p.specs);
                                    if (!acc[key].breakdown[size]) acc[key].breakdown[size] = { total: 0, returned: 0 };
                                    acc[key].breakdown[size].total++;
                                    if (p.status !== 'Dispatched') {
                                        acc[key].breakdown[size].returned++;
                                    }
                                }
                            });
                            return acc;
                        }, {} as Record<string, ServiceGroup>);
                        
                        const deliverySummary = jobPieces.reduce((acc, p) => {
                            const size = getGlassSize(p.specs);
                            if (!acc[size]) acc[size] = { total: 0, delivered: 0, challans: new Set() };
                            acc[size].total++;
                            if (p.status === 'Delivered') {
                               acc[size].delivered++;
                               if (p.dispatchId) acc[size].challans.add(p.dispatchId);
                            }
                            return acc;
                        }, {} as Record<string, { total: number, delivered: number, challans: Set<string> }>);

                        let slaBadge = null;
                        const isAllDelivered = jobPieces.length > 0 && jobPieces.every(p => p.status === 'Delivered');
                        
                        if (isAllDelivered && j.dueDate) {
                            const deliveryDates = jobPieces.map(p => new Date(p.lastUpdated).getTime());
                            const actualFinishDate = new Date(Math.max(...deliveryDates));
                            const dueDate = new Date(j.dueDate);
                            const actualStr = actualFinishDate.toISOString().split('T')[0];
                            const diffDays = Math.floor((actualFinishDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
                            if (diffDays < 0) slaBadge = { label: `Early Delivery`, date: actualStr, color: 'bg-emerald-100 text-emerald-700', sub: `${Math.abs(diffDays)} Days Ahead` };
                            else if (diffDays === 0) slaBadge = { label: `On-Time`, date: actualStr, color: 'bg-blue-100 text-blue-700', sub: 'Target Met' };
                            else slaBadge = { label: `Delayed`, date: actualStr, color: 'bg-rose-100 text-rose-700', sub: `${diffDays} Days Overdue` };
                        }

                        return (
                          <tr key={j.id} className="hover:bg-slate-50 group transition-colors">
                             <td className="px-6 py-4 align-top">
                                <p className="text-sm font-black text-indigo-600 mb-1">{numericId}</p>
                                <p className="text-xs font-bold text-slate-800 uppercase leading-tight">{j.projectName || 'General Order'}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">{getClientName(j.clientId)}</p>
                             </td>
                             <td className="px-6 py-4 align-top space-y-1">
                                <div className="flex justify-between text-[10px]"><span className="text-slate-400 font-bold uppercase">Ord:</span> <span className="font-bold">{j.date}</span></div>
                                <div className="flex justify-between text-[10px]"><span className="text-slate-400 font-bold uppercase">WIP:</span> <span className={`font-bold ${startDate === 'Not Started' ? 'text-slate-300 italic' : 'text-blue-600'}`}>{startDate}</span></div>
                                <div className="flex justify-between text-[10px]"><span className="text-slate-400 font-bold uppercase">Due:</span> <span className="font-black text-rose-500">{j.dueDate || 'N/A'}</span></div>
                             </td>
                             <td className="px-6 py-4 align-top">
                                <div className="space-y-1.5">
                                   {Object.entries(sizeGroups).map(([size, val]) => {
                                      const counts = val as { total: number, done: number };
                                      return (
                                      <div key={size} className="flex items-center justify-between bg-slate-100 rounded px-2 py-1 border border-slate-200">
                                         <span className="text-[9px] font-black uppercase text-slate-600 w-10">{size}</span>
                                         <div className="flex-1 mx-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500" style={{ width: `${(counts.done/counts.total)*100}%` }}></div>
                                         </div>
                                         <span className="text-[9px] font-bold text-slate-800">{counts.done}/{counts.total}</span>
                                      </div>
                                   )})}
                                </div>
                             </td>
                             <td className="px-6 py-4 align-top">
                                {Object.values(serviceGroups).length > 0 ? (
                                   <div className="space-y-3">
                                      {Object.values(serviceGroups).map((group: ServiceGroup, idx) => {
                                          const breakdowns = Object.values(group.breakdown);
                                          const isFullyComplete = breakdowns.length > 0 && breakdowns.every(b => b.returned === b.total);
                                          const isOverdue = group.overdue && !isFullyComplete;
                                          return (
                                             <div key={idx} className={`p-2 rounded-xl border transition-all ${isFullyComplete ? 'bg-slate-50 border-slate-100 opacity-60 grayscale' : isOverdue ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200 shadow-sm'}`}>
                                                <div className="flex justify-between items-center mb-2">
                                                    <div className="flex items-center space-x-1.5">
                                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded text-white uppercase ${getServiceBadgeColor(group.service)}`}>{getServiceShortName(group.service)}</span>
                                                        <span className="text-[9px] font-bold text-slate-700 uppercase truncate max-w-[80px]" title={group.vendor}>{group.vendor.substring(0,10)}</span>
                                                    </div>
                                                    {isOverdue && !isFullyComplete && <AlertTriangle size={10} className="text-rose-500"/>}
                                                    {isFullyComplete && <CheckCircle2 size={12} className="text-emerald-500"/>}
                                                </div>
                                                <div className="space-y-1.5">
                                                    {Object.entries(group.breakdown).map(([size, counts]) => {
                                                        const isSizeComplete = counts.returned === counts.total;
                                                        return (
                                                            <div key={size} className="flex flex-col">
                                                                <div className="flex justify-between text-[8px] font-bold uppercase text-slate-500 mb-0.5"><span>{size}</span><span className={isSizeComplete ? 'text-emerald-600' : 'text-slate-700'}>{counts.returned}/{counts.total}</span></div>
                                                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200"><div className={`h-full ${isSizeComplete ? 'bg-emerald-500' : isOverdue ? 'bg-rose-400' : 'bg-blue-500'}`} style={{ width: `${(counts.returned / counts.total) * 100}%` }}></div></div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                             </div>
                                          );
                                      })}
                                   </div>
                                ) : (
                                   <div className="text-center py-2 bg-slate-50 rounded border border-slate-100 border-dashed"><span className="text-[10px] text-slate-400 font-bold italic uppercase tracking-tighter">Local Flow</span></div>
                                )}
                             </td>
                             <td className="px-6 py-4 align-top">
                                <div className="space-y-2">
                                   {Object.entries(deliverySummary).map(([size, val]) => {
                                     const stat = val as { total: number, delivered: number, challans: Set<string> };
                                     return (
                                     <div key={size} className={`flex flex-col rounded-xl px-3 py-2 border ${stat.delivered === stat.total ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50 border-blue-100'}`}>
                                        <div className="flex justify-between items-center mb-1">
                                           <span className="text-[9px] font-black text-slate-600 uppercase">{size}</span>
                                           <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${stat.delivered === stat.total ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>{stat.delivered}/{stat.total}</span>
                                        </div>
                                        {Array.from(stat.challans).map(cid => (
                                           <div key={cid} className="flex items-center space-x-1 text-[8px] font-bold text-slate-500 mt-0.5"><Truck size={8}/> <span>Ref: {cid}</span></div>
                                        ))}
                                        {stat.delivered === 0 && <span className="text-[8px] italic text-slate-400">In-Queue...</span>}
                                     </div>
                                   )})}
                                </div>
                             </td>
                             <td className="px-6 py-4 align-top">
                                {slaBadge ? (
                                    <div className="space-y-1.5">
                                       <div className={`flex items-center justify-between rounded px-2 py-1 border ${slaBadge.color.replace('text-', 'border-')} ${slaBadge.color}`}>
                                          <span className="text-[9px] font-black uppercase">{slaBadge.label}</span>
                                          <span className="text-[9px] font-bold">{slaBadge.sub}</span>
                                       </div>
                                       <div className="flex items-center justify-between bg-slate-100 rounded px-2 py-1 border border-slate-200">
                                          <span className="text-[9px] font-black uppercase text-slate-500">Actual</span>
                                          <span className="text-[9px] font-bold text-slate-700">{slaBadge.date}</span>
                                       </div>
                                       {j.dueDate && (
                                         <div className="flex items-center justify-between bg-slate-50 rounded px-2 py-1 border border-slate-100">
                                           <span className="text-[9px] font-black uppercase text-slate-400">Due</span>
                                           <span className="text-[9px] font-bold text-slate-500">{j.dueDate}</span>
                                         </div>
                                       )}
                                    </div>
                                ) : j.dueDate ? (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between bg-blue-50 rounded px-2 py-1 border border-blue-100">
                                           <span className="text-[9px] font-black uppercase text-blue-500">SLA</span>
                                           <span className="text-[9px] font-bold text-blue-700">Active</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${Math.min((jobPieces.filter(p => p.status === 'Delivered').length / (jobPieces.length || 1)) * 100, 100)}%` }}></div></div>
                                        <div className="flex items-center justify-between bg-slate-50 rounded px-2 py-1 border border-slate-100">
                                           <span className="text-[9px] font-black uppercase text-slate-400">Due</span>
                                           <span className="text-[9px] font-bold text-rose-500">{j.dueDate}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-slate-300 font-bold italic">No Deadline</span>
                                )}
                             </td>
                          </tr>
                        );
                     })}
                     {filteredJobs.length === 0 && (
                         <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-300 font-black uppercase italic text-xs">No matching workloads found</td></tr>
                     )}
                  </tbody>
               </table>
           </div>
           <Pagination totalItems={filteredJobs.length} itemsPerPage={itemsPerPage} currentPage={currentPage} onPageChange={setCurrentPage} />
        </div>
    );
};

export default React.memo(JobRegistryView);
