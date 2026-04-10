/**
 * JobRegistryView.tsx — Design System v2
 *
 * UI Changes (business logic untouched):
 *  - Replaced bg-white rounded-[2rem] bloated container → CompactPageHeader + flex layout
 *  - Replaced raw <table> with px-6 py-4 cells → DataGridCard (py-1.5 px-3 density)
 *  - Alt+R wired via erp:refresh CustomEvent → triggers parent refresh
 *  - min-h-0 flex-1 pattern for internal scroll on factory tablets
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Quotation, ProductionPiece, TemperingDispatch, Client } from '@/modules/shared/types';
import { Filter, CheckCircle2, Truck, AlertTriangle, CalendarDays, Search, Zap, Loader2, RefreshCw } from 'lucide-react';
import { ProductionService } from '@/modules/production/services/productionService';
import { toast } from 'sonner';
import { getGlassSize, isInternal, isDispatchOverdue } from './ProductionUtils';
import Pagination from '@/components/Pagination';
import { CompactPageHeader } from '@/modules/shared/components/CompactPageHeader';
import { DataGridCard, GridColumn } from '@/modules/shared/components/DataGridCard';

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
    onPiecesGenerated?: () => void;
}

const JobRegistryView: React.FC<JobRegistryViewProps> = ({
    jobOrders, pieces, dispatches, clients,
    selectedClientFilter, setSelectedClientFilter, filterDate, setFilterDate
}) => {

  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const handleGeneratePieces = useCallback(async (job: Quotation) => {
    const existingPieces = pieces.filter(p => p.orderId === job.orderNo || p.orderId === job.id);
    if (existingPieces.length > 0) {
      toast.error(`${existingPieces.length} pieces already exist for this job.`);
      return;
    }
    if (!job.items?.length) {
      toast.error('Job has no line items — cannot generate pieces.');
      return;
    }
    setGeneratingId(job.id);
    try {
      const now = new Date().toISOString();
      const newPieces: ProductionPiece[] = [];
      job.items.forEach((item, itemIdx) => {
        const qty = Math.max(1, Math.round(item.qty || 1));
        const sizePart  = item.width && item.height
          ? `${item.width}×${item.height}`
          : item.glassSize || '';
        const typePart  = item.glazingSpecs || item.glassType || item.description || '';
        const specs     = [sizePart, typePart, item.locationCode].filter(Boolean).join(' | ');

        for (let i = 0; i < qty; i++) {
          newPieces.push({
            id:          `PC-${job.orderNo || job.id}-${itemIdx + 1}-${i + 1}-${Date.now().toString().slice(-4)}`,
            orderId:     job.orderNo || job.id,
            itemIndex:   itemIdx,
            specs:       specs || `Item ${itemIdx + 1} / Piece ${i + 1}`,
            status:      'Cut',
            lastUpdated: now,
          } as ProductionPiece);
        }
      });

      const allPieces = ProductionService.getProductionPieces();
      ProductionService.saveProductionPieces([...allPieces, ...newPieces]);
      toast.success(`${newPieces.length} pieces generated for ${job.projectName || job.orderNo || job.id}.`, { duration: 5000 });
      if (typeof (window as any).__jobRegistryRefresh === 'function') {
        (window as any).__jobRegistryRefresh();
      }
    } catch (e: any) {
      toast.error('Piece generation failed: ' + (e.message || 'unknown error'));
    } finally {
      setGeneratingId(null);
    }
  }, [pieces]);

    const [currentPage, setCurrentPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState('Active');
    const [searchTerm, setSearchTerm] = useState('');
    const itemsPerPage = 10;

    // ── Wire Alt+R global shortcut ────────────────────────────────────
    useEffect(() => {
      const handler = () => {
        if (typeof (window as any).__jobRegistryRefresh === 'function') {
          (window as any).__jobRegistryRefresh();
        }
      };
      window.addEventListener('erp:refresh', handler);
      return () => window.removeEventListener('erp:refresh', handler);
    }, []);

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

            if (searchTerm) {
                const lower = searchTerm.toLowerCase();
                const ref = (j.orderNo || j.id || '').toLowerCase();
                const clientName = (clients.find(c => c.id === j.clientId)?.name || '').toLowerCase();
                const project = (j.projectName || '').toLowerCase();
                const jobPcs = pieces.filter(p => p.orderId === (j.orderNo || j.id));
                const pieceMatch = jobPcs.some(p => p.id.toLowerCase().includes(lower));
                if (!ref.includes(lower) && !clientName.includes(lower) && !project.includes(lower) && !pieceMatch) return false;
            }

            const jobPieces = pieces.filter(p => p.orderId === j.orderNo || p.orderId === j.id);
            const delivered = jobPieces.filter(p => p.status === 'Delivered').length;

            if (statusFilter === 'All') return true;
            if (statusFilter === 'Active') return !(delivered === jobPieces.length && jobPieces.length > 0);
            if (jobPieces.length === 0) return statusFilter === 'Pending';

            if (statusFilter === 'Delivered') return delivered === jobPieces.length;
            if (statusFilter === 'WIP') return delivered < jobPieces.length && (delivered > 0 || jobPieces.some(p => p.status !== 'Cut'));
            if (statusFilter === 'Pending') return delivered === 0 && jobPieces.every(p => p.status === 'Cut');

            return true;
        });
        return result.sort((a,b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
        });
    }, [jobOrders, selectedClientFilter, filterDate, statusFilter, pieces, searchTerm]);

    const paginatedJobs = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredJobs.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredJobs, currentPage]);

    const handleRefresh = () => {
      window.dispatchEvent(new CustomEvent('erp:refresh'));
    };

    // ── Column definitions for DataGridCard ─────────────────────────
    const columns: GridColumn[] = [
      { key: 'order', header: 'Order / Client', width: '15%' },
      { key: 'dates', header: 'Key Dates', width: '12%' },
      { key: 'glass', header: 'Glass Configuration', width: '15%', align: 'center' },
      { key: 'external', header: 'External Processing', width: '20%' },
      { key: 'delivery', header: 'Site Delivery', width: '15%' },
      { key: 'sla', header: 'Order SLA', width: '14%' },
      { key: 'pieces', header: 'Pieces', width: '9%' },
    ];

    return (
        <div className="flex flex-col h-full min-h-0">
          <CompactPageHeader
            title="Production Floor"
            subtitle="Job Registry"
            breadcrumbs={[{ label: 'Production' }, { label: 'Jobs' }]}
            actions={[
              {
                label: 'Refresh',
                icon: <RefreshCw size={12} />,
                onClick: handleRefresh,
                variant: 'secondary',
                shortcut: 'Alt+R',
              },
            ]}
            meta={
              <span className="text-[10px] font-black text-slate-400 uppercase">{filteredJobs.length} Jobs</span>
            }
          />

          <div className="flex-1 flex flex-col min-h-0 p-4">
            <DataGridCard
              columns={columns}
              className="flex-1"
              toolbar={
                <div className="flex items-center gap-3 w-full flex-wrap">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                    <input
                      type="text"
                      placeholder="Search order no, piece no, client..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs font-bold uppercase border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-300"
                      value={searchTerm}
                      onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Filter size={10} className="text-slate-400" />
                    <select
                      className="text-[9px] border border-slate-200 rounded px-2 py-1.5 text-slate-600 font-bold bg-white focus:outline-none"
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
                      className="text-[9px] border border-slate-200 rounded px-2 py-1.5 text-slate-600 font-bold bg-white focus:outline-none"
                      value={statusFilter}
                      onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                    >
                      <option value="Active">Active (Pending + WIP)</option>
                      <option value="All">All Status</option>
                      <option value="Delivered">Delivered</option>
                      <option value="WIP">WIP</option>
                      <option value="Pending">Pending</option>
                    </select>
                    <div className="relative">
                      <CalendarDays size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/>
                      <input
                        type="month"
                        className="text-[9px] border border-slate-200 rounded pl-6 pr-2 py-1.5 text-slate-600 font-bold bg-white focus:outline-none"
                        value={filterDate}
                        onChange={(e) => { setFilterDate(e.target.value); setCurrentPage(1); }}
                      />
                    </div>
                  </div>
                </div>
              }
            >
              {paginatedJobs.map((j, ri) => {
                const jobPieces = pieces.filter(p => p.orderId === j.orderNo || p.orderId === j.id);
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
                    acc[key] = { service: d.serviceType, vendor: d.plantName, overdue: false, breakdown: {} };
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
                      if (p.status !== 'Dispatched') acc[key].breakdown[size].returned++;
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
                  <tr key={j.id} className={[
                    'border-b border-slate-100 last:border-0',
                    ri % 2 === 1 ? 'bg-slate-50/50' : 'bg-white',
                    'hover:bg-slate-50/70 transition-colors',
                  ].join(' ')}>
                    <td className="py-1.5 px-3 align-top">
                      <p className="text-xs font-black text-indigo-600">{numericId}</p>
                      <p className="text-[10px] font-bold text-slate-800 uppercase leading-tight">{j.projectName || 'General Order'}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{getClientName(j.clientId)}</p>
                    </td>
                    <td className="py-1.5 px-3 align-top space-y-0.5">
                      <div className="flex justify-between text-[10px]"><span className="text-slate-400 font-bold uppercase">Ord:</span> <span className="font-bold">{j.date}</span></div>
                      <div className="flex justify-between text-[10px]"><span className="text-slate-400 font-bold uppercase">WIP:</span> <span className={`font-bold ${startDate === 'Not Started' ? 'text-slate-300 italic' : 'text-blue-600'}`}>{startDate}</span></div>
                      <div className="flex justify-between text-[10px]"><span className="text-slate-400 font-bold uppercase">Due:</span> <span className="font-black text-rose-500">{j.dueDate || 'N/A'}</span></div>
                    </td>
                    <td className="py-1.5 px-3 align-top">
                      <div className="space-y-1">
                        {Object.entries(sizeGroups).map(([size, val]) => {
                          const counts = val as { total: number, done: number };
                          return (
                            <div key={size} className="flex items-center justify-between bg-slate-100 rounded px-2 py-0.5 border border-slate-200">
                              <span className="text-[9px] font-black uppercase text-slate-600 w-10">{size}</span>
                              <div className="flex-1 mx-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(counts.done/counts.total)*100}%` }}></div>
                              </div>
                              <span className="text-[9px] font-bold text-slate-800">{counts.done}/{counts.total}</span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-1.5 px-3 align-top">
                      {Object.values(serviceGroups).length > 0 ? (
                        <div className="space-y-1.5">
                          {Object.values(serviceGroups).map((group: ServiceGroup, idx) => {
                            const breakdowns = Object.values(group.breakdown);
                            const isFullyComplete = breakdowns.length > 0 && breakdowns.every(b => b.returned === b.total);
                            const isOverdue = group.overdue && !isFullyComplete;
                            return (
                              <div key={idx} className={`p-1.5 rounded border transition-all ${isFullyComplete ? 'bg-slate-50 border-slate-100 opacity-60 grayscale' : isOverdue ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                                <div className="flex justify-between items-center mb-1">
                                  <div className="flex items-center gap-1">
                                    <span className={`text-[8px] font-black px-1 py-0.5 rounded text-white uppercase ${getServiceBadgeColor(group.service)}`}>{getServiceShortName(group.service)}</span>
                                    <span className="text-[9px] font-bold text-slate-700 uppercase truncate max-w-[80px]" title={group.vendor}>{group.vendor.substring(0,10)}</span>
                                  </div>
                                  {isOverdue && !isFullyComplete && <AlertTriangle size={10} className="text-rose-500"/>}
                                  {isFullyComplete && <CheckCircle2 size={10} className="text-emerald-500"/>}
                                </div>
                                <div className="space-y-1">
                                  {Object.entries(group.breakdown).map(([size, counts]) => {
                                    const isSizeComplete = counts.returned === counts.total;
                                    return (
                                      <div key={size} className="flex flex-col">
                                        <div className="flex justify-between text-[8px] font-bold uppercase text-slate-500 mb-0.5"><span>{size}</span><span className={isSizeComplete ? 'text-emerald-600' : 'text-slate-700'}>{counts.returned}/{counts.total}</span></div>
                                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden border border-slate-200"><div className={`h-full ${isSizeComplete ? 'bg-emerald-500' : isOverdue ? 'bg-rose-400' : 'bg-blue-500'}`} style={{ width: `${(counts.returned / counts.total) * 100}%` }}></div></div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-1 bg-slate-50 rounded border border-slate-100 border-dashed"><span className="text-[9px] text-slate-400 font-bold italic uppercase tracking-tighter">Local Flow</span></div>
                      )}
                    </td>
                    <td className="py-1.5 px-3 align-top">
                      <div className="space-y-1">
                        {Object.entries(deliverySummary).map(([size, val]) => {
                          const stat = val as { total: number, delivered: number, challans: Set<string> };
                          return (
                            <div key={size} className={`flex flex-col rounded px-2 py-1 border ${stat.delivered === stat.total ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50 border-blue-100'}`}>
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="text-[9px] font-black text-slate-600 uppercase">{size}</span>
                                <span className={`text-[9px] font-black px-1 py-0.5 rounded ${stat.delivered === stat.total ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>{stat.delivered}/{stat.total}</span>
                              </div>
                              {Array.from(stat.challans).map(cid => (
                                <div key={cid} className="flex items-center gap-1 text-[8px] font-bold text-slate-500"><Truck size={8}/> <span>Ref: {cid}</span></div>
                              ))}
                              {stat.delivered === 0 && <span className="text-[8px] italic text-slate-400">In-Queue...</span>}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-1.5 px-3 align-top">
                      {slaBadge ? (
                        <div className="space-y-1">
                          <div className={`flex items-center justify-between rounded px-2 py-0.5 border ${slaBadge.color.replace('text-', 'border-')} ${slaBadge.color}`}>
                            <span className="text-[9px] font-black uppercase">{slaBadge.label}</span>
                            <span className="text-[9px] font-bold">{slaBadge.sub}</span>
                          </div>
                          <div className="flex items-center justify-between bg-slate-100 rounded px-2 py-0.5 border border-slate-200">
                            <span className="text-[9px] font-black uppercase text-slate-500">Actual</span>
                            <span className="text-[9px] font-bold text-slate-700">{slaBadge.date}</span>
                          </div>
                          {j.dueDate && (
                            <div className="flex items-center justify-between bg-slate-50 rounded px-2 py-0.5 border border-slate-100">
                              <span className="text-[9px] font-black uppercase text-slate-400">Due</span>
                              <span className="text-[9px] font-bold text-slate-500">{j.dueDate}</span>
                            </div>
                          )}
                        </div>
                      ) : j.dueDate ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between bg-blue-50 rounded px-2 py-0.5 border border-blue-100">
                            <span className="text-[9px] font-black uppercase text-blue-500">SLA</span>
                            <span className="text-[9px] font-bold text-blue-700">Active</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${Math.min((jobPieces.filter(p => p.status === 'Delivered').length / (jobPieces.length || 1)) * 100, 100)}%` }}></div></div>
                          <div className="flex items-center justify-between bg-slate-50 rounded px-2 py-0.5 border border-slate-100">
                            <span className="text-[9px] font-black uppercase text-slate-400">Due</span>
                            <span className="text-[9px] font-bold text-rose-500">{j.dueDate}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[9px] text-slate-300 font-bold italic">No Deadline</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 align-middle">
                      {jobPieces.length === 0 ? (
                        <button
                          onClick={() => handleGeneratePieces(j)}
                          disabled={generatingId === j.id}
                          title="Generate production pieces from quotation items"
                          className="flex items-center gap-1 px-2 py-1.5 bg-indigo-600 text-white rounded text-[10px] font-black uppercase hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          {generatingId === j.id
                            ? <Loader2 size={10} className="animate-spin"/>
                            : <Zap size={10}/>
                          }
                          Generate
                        </button>
                      ) : (
                        <span className="text-[9px] font-black text-emerald-600 uppercase flex items-center gap-1">
                          <CheckCircle2 size={10}/> {jobPieces.length} Pcs
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredJobs.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-300 font-black uppercase italic text-xs">No matching workloads found</td></tr>
              )}
            </DataGridCard>
            <div className="shrink-0">
              <Pagination totalItems={filteredJobs.length} itemsPerPage={itemsPerPage} currentPage={currentPage} onPageChange={setCurrentPage} />
            </div>
          </div>
        </div>
    );
};

export default React.memo(JobRegistryView);
