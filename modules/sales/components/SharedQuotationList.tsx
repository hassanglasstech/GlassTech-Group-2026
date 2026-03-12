import React from 'react';
import { Quotation, Client } from '../../shared/types';
import { Plus, Search, Edit2, Trash2, Printer, FileCheck, Eye, Download, FileJson } from 'lucide-react';

interface SharedQuotationListProps {
  companyName: string;
  quotations: Quotation[];
  clients: Client[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onNew: () => void;
  onEdit: (q: Quotation) => void;
  onPrint: (q: Quotation) => void;
  onPrintJobCard?: (q: Quotation) => void;
  onApprove?: (q: Quotation) => void;
  onDelete?: (id: string) => void;
  onExportExcel?: (q: Quotation) => void;
  onExportJson?: (q: Quotation) => void;
  onBulkExportExcel?: () => void;
  onBulkExportJson?: () => void;
  onImportExcel?: (file: File) => void;
  onImportJson?: (file: File) => void;
}

export const SharedQuotationList: React.FC<SharedQuotationListProps> = ({
  companyName,
  quotations,
  clients,
  searchTerm,
  setSearchTerm,
  onNew,
  onEdit,
  onPrint,
  onPrintJobCard,
  onApprove,
  onDelete,
  onExportExcel,
  onExportJson,
  onBulkExportExcel,
  onBulkExportJson,
  onImportExcel,
  onImportJson
}) => {
  return (
    <div className="space-y-4">
      <div className="bg-white p-4 border border-slate-200 shadow-sm flex justify-between items-center no-print rounded-xl">
        <div className="flex items-center space-x-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">{companyName} Sales Desk</h3>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search Quotations..." 
              className="sap-input w-full pl-8 py-1.5 text-xs font-bold" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {onBulkExportJson && <button onClick={onBulkExportJson} className="sap-btn-ghost text-xs">Export JSON</button>}
          {onBulkExportExcel && <button onClick={onBulkExportExcel} className="sap-btn-ghost text-xs">Export Excel</button>}
          
          {onImportJson && (
            <label className="sap-btn-ghost text-xs cursor-pointer">
              Import JSON
              <input type="file" className="hidden" accept=".json" onChange={e => e.target.files && onImportJson(e.target.files[0])} />
            </label>
          )}
          {onImportExcel && (
            <label className="sap-btn-ghost text-xs cursor-pointer">
              Import Excel
              <input type="file" className="hidden" accept=".xlsx" onChange={e => e.target.files && onImportExcel(e.target.files[0])} />
            </label>
          )}

          <button onClick={onNew} className="sap-btn-primary flex items-center space-x-2">
            <Plus size={14} /><span>Create Quote</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden no-print">
        <table className="w-full text-left sap-table">
          <thead>
            <tr>
              <th className="w-24">Status</th>
              <th className="w-40">Ref ID</th>
              <th>Client</th>
              <th>Date</th>
              <th className="text-right">Total Value</th>
              <th className="text-right w-48">Action</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map(q => {
              const client = clients.find(c => c.id === q.clientId);
              const total = q.items.reduce((s, i) => s + (i.amount || 0), 0);
              return (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${q.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="font-black text-blue-600">{q.orderNo || q.id}</td>
                  <td className="font-bold text-slate-700">{client?.name || 'Unknown'}</td>
                  <td className="font-medium text-slate-500 text-xs">{q.date}</td>
                  <td className="font-black text-right">PKR {total.toLocaleString()}</td>
                  <td className="text-right">
                    <div className="flex items-center justify-end space-x-1">
                      {q.status !== 'Approved' && (
                        <button onClick={() => onEdit(q)} className="p-1.5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100" title="Edit">
                          <Edit2 size={14}/>
                        </button>
                      )}
                      <button onClick={() => onPrint(q)} className="p-1.5 text-slate-600 bg-slate-50 rounded hover:bg-slate-200" title="Print">
                        <Printer size={14}/>
                      </button>
                      {onPrintJobCard && (
                        <button onClick={() => onPrintJobCard(q)} className="p-1.5 text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100" title="Print Job Card">
                          <Printer size={14}/>
                        </button>
                      )}
                      {q.status !== 'Approved' && onApprove && (
                        <button onClick={() => onApprove(q)} className="p-1.5 text-emerald-600 bg-emerald-50 rounded hover:bg-emerald-100" title="Approve">
                          <FileCheck size={14}/>
                        </button>
                      )}
                      {q.status === 'Approved' && (
                        <button onClick={() => onEdit(q)} className="p-1.5 text-slate-400 hover:text-blue-600" title="View">
                          <Eye size={14}/>
                        </button>
                      )}
                      {onExportExcel && (
                        <button onClick={() => onExportExcel(q)} className="p-1.5 text-green-600 bg-green-50 rounded hover:bg-green-100" title="Export Excel">
                          <Download size={14}/>
                        </button>
                      )}
                      {onExportJson && (
                        <button onClick={() => onExportJson(q)} className="p-1.5 text-orange-600 bg-orange-50 rounded hover:bg-orange-100" title="Export JSON">
                          <FileJson size={14}/>
                        </button>
                      )}
                      {q.status !== 'Approved' && onDelete && (
                        <button onClick={() => onDelete(q.id)} className="p-1.5 text-red-600 bg-red-50 rounded hover:bg-red-100" title="Delete">
                          <Trash2 size={14}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {quotations.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400 font-medium">
                  No quotations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
