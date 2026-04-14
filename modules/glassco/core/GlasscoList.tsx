import React, { useRef } from 'react';
import { Quotation, Client } from '../../shared/types';
import { Search, Plus, Edit2, Printer, FileCheck, Trash2, FileSpreadsheet, FileJson, FileUp, Filter, FileText } from 'lucide-react';

interface GlasscoListProps {
    quotations: Quotation[];
    clients: Client[];
    searchTerm: string;
    setSearchTerm: (val: string) => void;
    sortType: string;
    setSortType: (val: string) => void;
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
}

export const GlasscoList: React.FC<GlasscoListProps> = ({ 
    quotations, clients, searchTerm, setSearchTerm, sortType, setSortType,
    onNew, onEdit, onPrint, onPrintJobCard, onApprove, onDelete, onExport,
    onExportJson, onBulkExportJson, onBulkExportExcel, onImportJson, onImportExcel
}) => {
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const excelInputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="space-y-4 animate-in fade-in">
            <div className="bg-white border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row justify-between items-center rounded-xl no-print gap-4">
                <div className="flex items-center space-x-4 w-full md:w-auto">
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input 
                            type="text" 
                            placeholder="Search..." 
                            className="sap-input w-full pl-9 py-1.5 text-xs font-bold uppercase" 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                        />
                    </div>
                    <div className="relative w-full md:w-48">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <select 
                            className="sap-input w-full pl-9 py-1.5 text-[10px] font-black uppercase appearance-none cursor-pointer hover:bg-slate-50"
                            value={sortType}
                            onChange={e => setSortType(e.target.value)}
                        >
                            <option value="date_desc">Date: Latest First</option>
                            <option value="date_asc">Date: Oldest First</option>
                            <option value="order_desc">Ref #: Newest</option>
                            <option value="order_asc">Ref #: Oldest</option>
                            <option value="client">By Client</option>
                        </select>
                    </div>
                </div>
                
                <div className="flex items-center space-x-2 w-full md:w-auto">
                    <input type="file" ref={jsonInputRef} onChange={e => e.target.files?.[0] && onImportJson(e.target.files[0])} className="hidden" accept=".json" />
                    <input type="file" ref={excelInputRef} onChange={e => e.target.files?.[0] && onImportExcel(e.target.files[0])} className="hidden" accept=".xlsx,.xls" />
                    
                    <button onClick={() => jsonInputRef.current?.click()} className="bg-slate-50 text-slate-600 px-3 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-100 flex items-center gap-1.5 transition-all" title="Import JSON">
                        <FileUp size={14}/> JSON
                    </button>
                    <button onClick={() => excelInputRef.current?.click()} className="bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl text-[10px] font-black uppercase border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1.5 transition-all" title="Import Excel">
                        <FileUp size={14}/> Excel
                    </button>
                    <button onClick={onBulkExportJson} className="bg-slate-900 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 flex items-center gap-1.5 transition-all" title="Export All to JSON">
                        <FileJson size={14}/> Bulk JSON
                    </button>
                    <button onClick={onBulkExportExcel} className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-700 flex items-center gap-1.5 transition-all" title="Export All to Excel">
                        <FileSpreadsheet size={14}/> Bulk Excel
                    </button>
                    <div className="h-6 w-px bg-slate-200 mx-2"></div>
                    <button onClick={onNew} className="sap-btn-primary flex items-center space-x-2 whitespace-nowrap">
                        <Plus size={14} /> <span>New Estimate</span>
                    </button>
                </div>
            </div>

            <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden no-print">
                <div className="overflow-x-auto">
                    <table className="w-full text-left sap-table min-w-[1000px]">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                            <tr>
                                <th className="px-4 py-3 w-32">Ref #</th>
                                <th className="px-4 py-3">Customer & Project Entity</th>
                                <th className="px-4 py-3 w-32">Date</th>
                                <th className="px-4 py-3 w-40">Delivery Due</th>
                                <th className="px-4 py-3 text-right">Net Value</th>
                                <th className="px-4 py-3 text-right w-64">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {quotations.map(q => {
                                const clientName = clients.find(c => c.id === q.clientId)?.name || 'Unknown';
                                
                                // Determine if this is a draft (DRF/DFT) or formal quote (QT) based on ID prefix
                                const refId = q.orderNo || q.id;
                                const isDraft = refId.startsWith('DRF-') || refId.startsWith('DFT-');
                                const isReplacement = (q as any).orderType === 'Replacement';
                                const numericId = refId.split('-').filter(part => !part.includes('R') && !isNaN(parseInt(part))).pop() || '---';

                                return (
                                    <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3">
                                            {isReplacement ? (
                                                <div className="flex flex-col">
                                                    <span className="font-black text-[9px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded border border-orange-200 uppercase tracking-wider w-fit mb-0.5">REPLACEMENT</span>
                                                    <span className="font-black text-orange-700 text-sm">{numericId}</span>
                                                </div>
                                            ) : isDraft ? (
                                                <div className="flex flex-col">
                                                    <span className="font-black text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 uppercase tracking-wider w-fit mb-0.5">DRAFT</span>
                                                    <span className="font-black text-slate-500 text-sm">{numericId}</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <span className="font-black text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 uppercase tracking-wider w-fit mb-0.5">QUOTE</span>
                                                    <span className="font-black text-blue-700 text-sm">{numericId}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-black text-slate-800 uppercase text-xs leading-tight">{q.projectName ? q.projectName : clientName}</p>
                                            {q.projectName && <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{clientName}</p>}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-500 text-[10px]">{q.date}</td>
                                        <td className="px-4 py-3 font-bold text-rose-500 text-[10px]">{q.dueDate || 'N/A'}</td>
                                        <td className="px-4 py-3 font-black text-right text-sm text-slate-900">{(q.items?.reduce((s,i) => s+i.amount, 0) || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end space-x-1">
                                                <button onClick={() => onEdit(q)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit"><Edit2 size={14}/></button>
                                                <button onClick={() => onPrint(q)} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded" title="Print Estimate/Order"><Printer size={14}/></button>
                                                {q.status !== 'Approved' && (
                                                    <button onClick={() => onApprove(q)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded" title="Approve & Generate SO"><FileCheck size={14}/></button>
                                                )}
                                                {q.status === 'Approved' && (
                                                    <button onClick={() => onPrintJobCard(q)} className="bg-orange-50 text-orange-700 hover:bg-orange-100 px-2 py-1 rounded border border-orange-200 flex items-center space-x-1 transition-all" title="Print Job Card">
                                                        <FileText size={12}/> <span className="text-[9px] font-black uppercase">Job Card</span>
                                                    </button>
                                                )}
                                                <div className="h-4 w-px bg-slate-200 mx-1"></div>
                                                <button onClick={() => onExportJson(q)} className="p-1.5 text-slate-400 hover:text-slate-900 rounded" title="Export JSON"><FileJson size={14}/></button>
                                                <button onClick={() => onExport(q)} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded" title="Export Excel"><FileSpreadsheet size={14}/></button>
                                                <button onClick={() => onDelete(q.id)} className="p-1.5 text-rose-300 hover:text-rose-600 rounded" title="Delete"><Trash2 size={14}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                            {quotations.length === 0 && (
                                <tr><td colSpan={6} className="px-6 py-20 text-center text-slate-300 font-black uppercase italic text-xs tracking-widest">No Sales Documents Found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
