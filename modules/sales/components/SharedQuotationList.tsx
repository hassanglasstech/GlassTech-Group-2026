import React from 'react';
import { Quotation, Client } from '../../shared/types';
import { Plus, Search, Edit2, Trash2, Printer, FileCheck, Eye, Download, FileJson, Ban } from 'lucide-react';

interface SharedQuotationListProps {
  companyName: string;
  /** Overrides the "Quotations" heading (e.g. "Customer Queries"). */
  title?: string;
  /** Overrides the "{company} Sales Desk" sub-heading. */
  subtitle?: string;
  /** Hide the "Create Quote" button (e.g. on a read-only customer-queries queue). */
  hideCreate?: boolean;
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
  onVoid?: (id: string) => void;
  onExportExcel?: (q: Quotation) => void;
  onExportJson?: (q: Quotation) => void;
  onBulkExportExcel?: () => void;
  onBulkExportJson?: () => void;
  onImportExcel?: (file: File) => void;
  onImportJson?: (file: File) => void;
}

export const SharedQuotationList: React.FC<SharedQuotationListProps> = ({
  companyName,
  title,
  subtitle,
  hideCreate,
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
  onVoid,
  onExportExcel,
  onExportJson,
  onBulkExportExcel,
  onBulkExportJson,
  onImportExcel,
  onImportJson
}) => {
  return (
    <div className="space-y-4">
      <div className="sales-page-head no-print">
        <div className="flex items-center space-x-4">
          <div>
            <h2 className="sales-page-title">{title || 'Quotations'}</h2>
            <p className="sales-page-sub">{subtitle || `${companyName} Sales Desk`}</p>
          </div>
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

          {!hideCreate && (
            <button onClick={onNew} className="sap-btn-primary flex items-center space-x-2">
              <Plus size={14} /><span>Create Quote</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto no-print">
        <table className="w-full text-left sap-table">
          <thead>
            <tr>
              <th className="w-24">Status</th>
              <th className="w-40">Ref ID</th>
              <th>Client</th>
              <th>Date</th>
              <th className="text-right">Total Value</th>
              <th className="text-right w-48 sticky right-0 bg-white z-10">Action</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map(q => {
              const client = clients.find(c => c.id === q.clientId);
              const total = q.items.reduce((s, i) => s + (i.amount || 0), 0);
              // Order statuses (approved-and-beyond) are locked from Edit/Approve/Delete.
              const isOrder = ['Approved', 'Invoiced', 'Partial Payment', 'Paid', 'Void'].includes(q.status as string);
              const isVoid = q.status === 'Void';
              const statusCls = isVoid ? 'bg-slate-200 text-slate-500 line-through'
                : (q.status === 'Approved' || q.status === 'Paid' || q.status === 'Invoiced') ? 'bg-emerald-100 text-emerald-700'
                : q.status === 'Partial Payment' ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-100 text-amber-700';
              return (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${statusCls}`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="font-black text-blue-600">
                    {q.customerPlaced && <span title="Placed by the customer via the portal — review &amp; approve to forward" className="mr-1.5 text-[8px] font-black uppercase bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded align-middle">Customer</span>}
                    {q.customerPlaced && q.paymentConfirmed && <span title="Payment confirmed by the office" className="mr-1.5 text-[8px] font-black uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded align-middle">Paid ✓</span>}
                    {q.customerPlaced && !q.paymentConfirmed && q.paymentSubmittedAt && <span title="Customer uploaded a payment proof — review &amp; confirm" className="mr-1.5 text-[8px] font-black uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded align-middle">Pay?</span>}
                    {q.orderNo || q.id}
                  </td>
                  <td className="font-bold text-slate-700">{client?.name || 'Unknown'}</td>
                  <td className="font-medium text-slate-500 text-xs">{q.date}</td>
                  <td className="font-black text-right">PKR {(Number(total) || 0).toLocaleString()}</td>
                  <td className="text-right sticky right-0 bg-white">
                    <div className="flex items-center justify-end space-x-1">
                      {!isOrder && (
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
                      {!isOrder && onApprove && (
                        <button onClick={() => onApprove(q)} className="p-1.5 text-emerald-600 bg-emerald-50 rounded hover:bg-emerald-100" title="Approve">
                          <FileCheck size={14}/>
                        </button>
                      )}
                      {/* Approved order + void capability → Revise + Void. */}
                      {q.status === 'Approved' && onVoid ? (
                        <>
                          <button onClick={() => onEdit(q)} className="p-1.5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100" title="Edit / Revise (adds -R tag)">
                            <Edit2 size={14}/>
                          </button>
                          <button onClick={() => onVoid(q.id)} className="p-1.5 text-rose-600 bg-rose-50 rounded hover:bg-rose-100" title="Void Order">
                            <Ban size={14}/>
                          </button>
                        </>
                      ) : isOrder && (
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
                      {!isOrder && onDelete && (
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
                <td colSpan={6} className="sales-empty">
                  {searchTerm
                    ? `No ${(title || 'quotations').toLowerCase()} match “${searchTerm}”.`
                    : hideCreate
                      ? 'No customer queries yet — they appear here the moment a customer places an order from the portal.'
                      : 'No quotations yet — click “Create Quote” to add your first one.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
