import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Quotation, Client } from '../../shared/types';
import { formatNumber, formatDate } from '../../shared/utils/format';
import { RowActionsMenu } from './RowActionsMenu';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { Search, Plus, Edit2, Printer, FileSpreadsheet, FileJson, FileUp, Filter, Send, Trash2, SlidersHorizontal, X, FileText } from 'lucide-react';

// structured filter state shared between the toolbar (UI) and the parent
// (which applies it in its filteredQuotations memo). '' means "no constraint".
export interface QuoteFilters {
    status:   string; // exact status match, '' = all
    dateFrom: string; // yyyy-mm-dd, '' = open start
    dateTo:   string; // yyyy-mm-dd, '' = open end
    minValue: string; // numeric string, '' = no floor
    maxValue: string; // numeric string, '' = no ceiling
}

export const EMPTY_QUOTE_FILTERS: QuoteFilters = {
    status: '', dateFrom: '', dateTo: '', minValue: '', maxValue: '',
};

interface GlasscoListProps {
    quotations: Quotation[];
    isLoading?: boolean;
    clients: Client[];
    searchTerm: string;
    setSearchTerm: (val: string) => void;
    sortType: string;
    setSortType: (val: string) => void;
    filters: QuoteFilters;
    setFilters: (val: QuoteFilters) => void;
    onNew: () => void;
    onEdit: (q: Quotation) => void;
    onPrint: (q: Quotation) => void;
    onPrintJobCard: (q: Quotation) => void;
    onApprove: (q: Quotation) => void;
    onDelete: (id: string) => void;
    onExport: (q: Quotation) => void;
    onExportJson: (q: Quotation) => void;
    onBulkExportJson: () => void;
    onBulkExportExcel: () => void;
    onImportJson: (file: File) => void;
    onImportExcel: (file: File) => void;
    // Phase-6 (6.6) — status state machine actions
    onMarkSent?: (q: Quotation) => void;
    onReject?: (q: Quotation) => void;
    onMarkLost?: (q: Quotation) => void;
    onReopen?: (q: Quotation) => void;
    onBulkMarkSent?: (ids: string[]) => void;
    onBulkDelete?: (ids: string[]) => void;
}

// Phase-6 (6.6) — status pill colours used in row badge
const STATUS_PILL: Record<string, string> = {
    Draft:           'bg-slate-100 text-slate-500 border-slate-200',
    Sent:            'bg-indigo-50 text-indigo-700 border-indigo-200',
    Approved:        'bg-emerald-50 text-emerald-700 border-emerald-200',
    Rejected:        'bg-rose-50 text-rose-700 border-rose-200',
    Lost:            'bg-slate-200 text-slate-600 border-slate-300',
    Expired:         'bg-amber-50 text-amber-700 border-amber-200',
    Invoiced:        'bg-blue-50 text-blue-700 border-blue-200',
    'Partial Payment':'bg-blue-100 text-blue-800 border-blue-200',
    Paid:            'bg-emerald-100 text-emerald-800 border-emerald-200',
};

// status dropdown options — single source of truth is the pill map above.
const STATUS_OPTIONS = Object.keys(STATUS_PILL);

// plain-language hint per status — shown as a tooltip on the pill so the
// abbreviation-like labels aren't cryptic to a first-time user.
const STATUS_HINT: Record<string, string> = {
    Draft:            'Draft — not yet sent to the customer',
    Sent:             'Sent — awaiting the customer’s response',
    Approved:         'Approved — converted to a sales order',
    Rejected:         'Rejected — the customer declined',
    Lost:             'Lost — opportunity closed without an order',
    Expired:          'Expired — validity period has passed',
    Invoiced:         'Invoiced — a delivery invoice was generated',
    'Partial Payment':'Partial Payment — partially paid, balance outstanding',
    Paid:             'Paid — fully settled',
};

// total net value of a quote (same reduction the table cell uses).
const quoteValue = (q: Quotation): number =>
    q.items?.reduce((s, i) => s + (i.amount || 0), 0) || 0;

export const GlasscoList: React.FC<GlasscoListProps> = ({
    quotations, isLoading, clients, searchTerm, setSearchTerm, sortType, setSortType,
    filters, setFilters,
    onNew, onEdit, onPrint, onPrintJobCard, onApprove, onDelete, onExport,
    onExportJson, onBulkExportJson, onBulkExportExcel, onImportJson, onImportExcel,
    onMarkSent, onReject, onMarkLost, onReopen, onBulkMarkSent, onBulkDelete,
}) => {
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const excelInputRef = useRef<HTMLInputElement>(null);

    // simple client-side pagination so large lists don't render every row at once.
    const PAGE_SIZE = 25;
    const [page, setPage] = useState(1);
    const totalPages = Math.max(1, Math.ceil(quotations.length / PAGE_SIZE));
    // Reset to first page whenever the filtered/sorted set changes (search, sort, filters, deletes).
    useEffect(() => { setPage(1); }, [searchTerm, sortType, filters, quotations.length]);
    const safePage = Math.min(page, totalPages);
    const pagedQuotations = useMemo(
        () => quotations.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
        [quotations, safePage]
    );

    // P3: bulk multi-select over the current page.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const pageIds = pagedQuotations.map(q => q.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
    const toggleId = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const toggleAllPage = () => setSelectedIds(prev => { const n = new Set(prev); if (allPageSelected) pageIds.forEach(id => n.delete(id)); else pageIds.forEach(id => n.add(id)); return n; });
    const clearSelection = () => setSelectedIds(new Set());

    // advanced filter panel (date + value range) toggle + state helpers.
    const [showAdvanced, setShowAdvanced] = useState(false);
    const patchFilter = (patch: Partial<QuoteFilters>) => setFilters({ ...filters, ...patch });
    // Count of *advanced* constraints active (status has its own visible dropdown).
    const advancedCount =
        (filters.dateFrom ? 1 : 0) + (filters.dateTo ? 1 : 0) +
        (filters.minValue ? 1 : 0) + (filters.maxValue ? 1 : 0);
    const anyFilterActive = !!(filters.status || advancedCount > 0);
    const clearFilters = () => setFilters(EMPTY_QUOTE_FILTERS);

    return (
        <div className="space-y-4 animate-in fade-in">
            <div className="bg-white border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row justify-between items-center rounded-xl no-print gap-4">
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="relative w-full md:w-52">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                            type="text"
                            placeholder="Search..."
                            className="sap-input w-full pl-9 py-1.5 text-xs font-bold uppercase"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {/* status filter — '' shows all */}
                    <div className="relative w-full md:w-44">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <select
                            className="sap-input w-full pl-9 py-1.5 text-2xs font-black uppercase appearance-none cursor-pointer hover:bg-slate-50"
                            value={filters.status}
                            onChange={e => patchFilter({ status: e.target.value })}
                            aria-label="Filter by status"
                        >
                            <option value="">All Statuses</option>
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="relative w-full md:w-44">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <select
                            className="sap-input w-full pl-9 py-1.5 text-2xs font-black uppercase appearance-none cursor-pointer hover:bg-slate-50"
                            value={sortType}
                            onChange={e => setSortType(e.target.value)}
                            aria-label="Sort by"
                        >
                            <option value="date_desc">Date: Latest First</option>
                            <option value="date_asc">Date: Oldest First</option>
                            <option value="order_desc">Ref #: Newest</option>
                            <option value="order_asc">Ref #: Oldest</option>
                            <option value="client">By Client</option>
                        </select>
                    </div>
                    {/* advanced (date + value range) toggle */}
                    <button
                        onClick={() => setShowAdvanced(v => !v)}
                        aria-expanded={showAdvanced}
                        className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-2xs font-black uppercase border transition-all ${
                            showAdvanced || advancedCount > 0
                                ? 'bg-primary-subtle text-primary border-primary-border'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Date & value filters"
                    >
                        <SlidersHorizontal size={14} /> Filters
                        {advancedCount > 0 && (
                            <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-2xs font-black flex items-center justify-center tabular-nums">{advancedCount}</span>
                        )}
                    </button>
                </div>
                
                {/* flex-wrap + gap-y so the cluster wraps instead of overflowing on small screens */}
                <div className="flex flex-wrap gap-y-2 items-center space-x-2 w-full md:w-auto">
                    <input type="file" ref={jsonInputRef} onChange={e => e.target.files?.[0] && onImportJson(e.target.files[0])} className="hidden" accept=".json" />
                    <input type="file" ref={excelInputRef} onChange={e => e.target.files?.[0] && onImportExcel(e.target.files[0])} className="hidden" accept=".xlsx,.xls" />
                    
                    <button onClick={() => jsonInputRef.current?.click()} className="bg-slate-50 text-slate-600 px-3 py-2 rounded-xl text-2xs font-black uppercase border border-slate-200 hover:bg-slate-100 flex items-center gap-1.5 transition-all" title="Import JSON">
                        <FileUp size={14}/> JSON
                    </button>
                    <button onClick={() => excelInputRef.current?.click()} className="bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl text-2xs font-black uppercase border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1.5 transition-all" title="Import Excel">
                        <FileUp size={14}/> Excel
                    </button>
                    <button onClick={onBulkExportJson} className="bg-slate-900 text-white px-3 py-2 rounded-xl text-2xs font-black uppercase hover:bg-slate-800 flex items-center gap-1.5 transition-all" title="Export All to JSON">
                        <FileJson size={14}/> Bulk JSON
                    </button>
                    <button onClick={onBulkExportExcel} className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-2xs font-black uppercase hover:bg-emerald-700 flex items-center gap-1.5 transition-all" title="Export All to Excel">
                        <FileSpreadsheet size={14}/> Bulk Excel
                    </button>
                    <div className="h-6 w-px bg-slate-200 mx-2"></div>
                    <button onClick={onNew} className="sap-btn-primary flex items-center space-x-2 whitespace-nowrap">
                        <Plus size={14} /> <span>New Estimate</span>
                    </button>
                </div>
            </div>

            {/* advanced filter panel — date range + value range */}
            {showAdvanced && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm no-print flex flex-wrap items-end gap-4 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="flex flex-col gap-1">
                        <label className="text-2xs font-black uppercase tracking-widest text-slate-400">From Date</label>
                        <input type="date" value={filters.dateFrom} onChange={e => patchFilter({ dateFrom: e.target.value })} className="sap-input py-1.5 text-xs font-bold w-40" aria-label="Filter from date" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-2xs font-black uppercase tracking-widest text-slate-400">To Date</label>
                        <input type="date" value={filters.dateTo} onChange={e => patchFilter({ dateTo: e.target.value })} className="sap-input py-1.5 text-xs font-bold w-40" aria-label="Filter to date" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-2xs font-black uppercase tracking-widest text-slate-400">Min Value (PKR)</label>
                        <input type="number" min={0} placeholder="0" value={filters.minValue} onChange={e => patchFilter({ minValue: e.target.value })} className="sap-input py-1.5 text-xs font-bold w-32 tabular-nums" aria-label="Minimum net value" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-2xs font-black uppercase tracking-widest text-slate-400">Max Value (PKR)</label>
                        <input type="number" min={0} placeholder="∞" value={filters.maxValue} onChange={e => patchFilter({ maxValue: e.target.value })} className="sap-input py-1.5 text-xs font-bold w-32 tabular-nums" aria-label="Maximum net value" />
                    </div>
                    {anyFilterActive && (
                        <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-2xs font-black uppercase text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors ml-auto">
                            <X size={13} /> Clear Filters
                        </button>
                    )}
                </div>
            )}

            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between bg-primary-subtle border border-primary-border rounded-xl px-4 py-2.5 no-print">
                <span className="text-xs font-bold text-primary-hover uppercase tracking-wide">{selectedIds.size} selected</span>
                <div className="flex items-center gap-2">
                  {onBulkMarkSent && <button onClick={() => { onBulkMarkSent([...selectedIds]); clearSelection(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-bold uppercase bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"><Send size={13}/> Mark Sent</button>}
                  {onBulkDelete && <button onClick={() => { onBulkDelete([...selectedIds]); clearSelection(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-bold uppercase bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 transition-colors"><Trash2 size={13}/> Delete</button>}
                  <button onClick={clearSelection} className="px-3 py-1.5 rounded-lg text-2xs font-bold uppercase text-slate-400 hover:text-slate-700 transition-colors">Clear</button>
                </div>
              </div>
            )}

            <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden no-print">
                <div className="overflow-x-auto">
                    <table className="w-full text-left sap-table min-w-[1000px]">
                        <thead className="bg-slate-50 border-b border-slate-200 text-2xs font-black uppercase text-slate-500 tracking-widest">
                            <tr>
                                <th className="px-4 py-3 w-10"><input type="checkbox" checked={allPageSelected} onChange={toggleAllPage} aria-label="Select all on page" className="w-4 h-4 rounded border-slate-300 cursor-pointer align-middle" /></th>
                                <th className="px-4 py-3 w-32">Ref #</th>
                                <th className="px-4 py-3">Customer & Project Entity</th>
                                <th className="px-4 py-3 w-32">Date</th>
                                <th className="px-4 py-3 w-40">Delivery Due</th>
                                <th className="px-4 py-3 text-right">Net Value</th>
                                <th className="px-4 py-3 text-right w-64">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagedQuotations.map(q => {
                                const clientName = clients.find(c => c.id === q.clientId)?.name || 'Unknown';
                                
                                // Determine if this is a draft (DRF/DFT) or formal quote (QT) based on ID prefix
                                const refId = q.orderNo || q.id;
                                const isDraft = refId.startsWith('DRF-') || refId.startsWith('DFT-');
                                const isReplacement = (q as any).orderType === 'Replacement';
                                const numericId = refId.split('-').filter(part => !part.includes('R') && !isNaN(parseInt(part))).pop() || '---';

                                return (
                                    <tr key={q.id} className={`transition-colors ${selectedIds.has(q.id) ? 'bg-primary-subtle' : 'hover:bg-slate-50'}`}>
                                        <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(q.id)} onChange={() => toggleId(q.id)} aria-label="Select row" className="w-4 h-4 rounded border-slate-300 cursor-pointer align-middle" /></td>
                                        <td className="px-4 py-3">
                                            {isReplacement ? (
                                                <div className="flex flex-col">
                                                    <span className="font-black text-2xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded border border-orange-200 uppercase tracking-wider w-fit mb-0.5">REPLACEMENT</span>
                                                    <span className="font-black text-orange-700 text-sm">{numericId}</span>
                                                </div>
                                            ) : isDraft ? (
                                                <div className="flex flex-col">
                                                    <span className="font-black text-2xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 uppercase tracking-wider w-fit mb-0.5">DRAFT</span>
                                                    <span className="font-black text-slate-500 text-sm">{numericId}</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <span className="font-black text-2xs bg-primary-subtle text-primary px-1.5 py-0.5 rounded border border-blue-100 uppercase tracking-wider w-fit mb-0.5">QUOTE</span>
                                                    <span className="font-black text-primary-hover text-sm">{numericId}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <p className="font-black text-slate-800 uppercase text-xs leading-tight">{q.projectName ? q.projectName : clientName}</p>
                                                {/* Phase-6 (6.6) — status pill */}
                                                <span title={STATUS_HINT[(q.status as any) || 'Draft'] || STATUS_HINT.Draft} className="cursor-help">
                                                  <StatusBadge status={q.status || 'Draft'} size="sm" />
                                                </span>
                                            </div>
                                            {q.projectName && <p className="text-2xs text-slate-500 font-bold uppercase mt-0.5">{clientName}</p>}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-500 text-2xs">{formatDate(q.date)}</td>
                                        <td className="px-4 py-3 font-bold text-rose-500 text-2xs">{q.dueDate ? formatDate(q.dueDate) : 'N/A'}</td>
                                        <td className="px-4 py-3 font-black text-right text-sm text-slate-900 tabular-nums">{formatNumber(quoteValue(q))}</td>
                                        <td className="px-4 py-3 text-right">
                                            {/* Stable action cluster: Edit + Print always hold the same X
                                                position; every status/secondary action lives in the labelled
                                                ⋯ overflow menu (no more per-row column jitter). */}
                                            <div className="flex items-center justify-end gap-0.5">
                                                <button onClick={() => onEdit(q)} className="p-2 text-primary hover:bg-primary-subtle rounded-lg transition-colors" title="Edit" aria-label="Edit"><Edit2 size={15}/></button>
                                                <button onClick={() => onPrint(q)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="Print Estimate/Order" aria-label="Print"><Printer size={15}/></button>
                                                <RowActionsMenu
                                                    q={q}
                                                    onApprove={onApprove}
                                                    onPrintJobCard={onPrintJobCard}
                                                    onExport={onExport}
                                                    onExportJson={onExportJson}
                                                    onDelete={onDelete}
                                                    onMarkSent={onMarkSent}
                                                    onReject={onReject}
                                                    onMarkLost={onMarkLost}
                                                    onReopen={onReopen}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                            {/* Loading skeleton — distinct from the truly-empty state so a slow
                                fetch is never mistaken for "no data" (which led to duplicate re-entry). */}
                            {isLoading && quotations.length === 0 && Array.from({ length: 6 }).map((_, i) => (
                                <tr key={`sk-${i}`} className="animate-pulse">
                                    <td className="px-4 py-3"><div className="h-4 w-4 bg-slate-100 rounded" /></td>
                                    <td className="px-4 py-3"><div className="h-4 w-16 bg-slate-100 rounded" /></td>
                                    <td className="px-4 py-3"><div className="h-4 w-44 bg-slate-100 rounded" /></td>
                                    <td className="px-4 py-3"><div className="h-4 w-20 bg-slate-100 rounded" /></td>
                                    <td className="px-4 py-3"><div className="h-4 w-20 bg-slate-100 rounded" /></td>
                                    <td className="px-4 py-3"><div className="h-4 w-16 bg-slate-100 rounded ml-auto" /></td>
                                    <td className="px-4 py-3"><div className="h-4 w-24 bg-slate-100 rounded ml-auto" /></td>
                                </tr>
                            ))}
                            {!isLoading && quotations.length === 0 && (
                                <tr><td colSpan={7} className="p-0">
                                    <EmptyState
                                        icon={<FileText size={22} />}
                                        title={anyFilterActive || searchTerm ? 'No documents match your filters' : 'No sales documents yet'}
                                        description={anyFilterActive || searchTerm
                                            ? 'Try clearing the search or filters to see all documents.'
                                            : 'Create a new estimate to get started.'}
                                    />
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {/* pagination footer — only shown when more than one page */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50 no-print">
                        <span className="text-2xs font-black uppercase tracking-widest text-slate-400">
                            Page {safePage} of {totalPages} · {quotations.length} records
                        </span>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={safePage <= 1}
                                className="px-3 py-1.5 rounded-lg text-2xs font-black uppercase border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                Prev
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={safePage >= totalPages}
                                className="px-3 py-1.5 rounded-lg text-2xs font-black uppercase border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
