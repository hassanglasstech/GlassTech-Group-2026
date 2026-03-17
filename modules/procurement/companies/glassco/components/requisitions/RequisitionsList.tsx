import React, { useState } from 'react';
import { Requisition } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import {
  Search, Plus, Edit, Trash2, FileText, Clock,
  CheckCircle2, AlertCircle, XCircle, ChevronDown,
  ChevronUp, BookOpen, Banknote, AlertTriangle, X
} from 'lucide-react';

interface Props {
  requisitions: Requisition[];
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  onNew: () => void;
  onEdit: (r: Requisition) => void;
  onDelete: (id: string) => void;
  onApprove: (r: Requisition) => void;
  onReject:  (r: Requisition, reason: string) => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Approved':       return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Rejected':       return 'bg-rose-100    text-rose-700    border-rose-200';
    case 'Pending':        return 'bg-amber-100   text-amber-700   border-amber-200';
    case 'Converted to PO':return 'bg-purple-100  text-purple-700  border-purple-200';
    default:               return 'bg-slate-100   text-slate-700   border-slate-200';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'Urgent': return 'text-rose-600';
    case 'Low':    return 'text-slate-400';
    default:       return 'text-blue-600';
  }
};

// ── Approval Detail Panel (shown inline when MD clicks a pending row) ──────
const ApprovalPanel: React.FC<{
  r: Requisition;
  onApprove: () => void;
  onReject:  (reason: string) => void;
  onClose:   () => void;
}> = ({ r, onApprove, onReject, onClose }) => {
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject]     = useState(false);

  // GL hint for this category
  const gl = FinanceService.resolveGLMapping(r.company as any, r.category || 'Procurement / Other');

  // Cost-center spend (first item's cost center)
  const primaryCC = r.items?.[0]?.costCenter;
  const spend = primaryCC
    ? FinanceService.getCostCenterSpend(r.company as any, primaryCC)
    : null;

  const amount = r.estimatedAmount ?? r.totalValue ?? 0;
  const needsPV = r.requiresCashPayment;

  return (
    <tr>
      <td colSpan={8} className="px-6 pb-4">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase text-slate-600 tracking-widest">
              MD Review — {r.id}
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Request summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3">Request Summary</p>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold">Category</span>
                <span className="font-black text-slate-700">{r.category || '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold">Requested by</span>
                <span className="font-black text-slate-700">{r.requisitioner}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold">Priority</span>
                <span className={`font-black uppercase text-xs ${getPriorityColor(r.priority)}`}>{r.priority}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold">Items</span>
                <span className="font-black text-slate-700">{r.items?.length ?? 0}</span>
              </div>
              <div className="border-t border-slate-100 pt-2 flex justify-between text-xs">
                <span className="text-slate-500 font-bold">Total Value</span>
                <span className="font-black text-emerald-700">PKR {amount.toLocaleString()}</span>
              </div>
            </div>

            {/* GL Impact (parked PV preview) */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3 flex items-center gap-1">
                <BookOpen size={10} /> GL Impact on Approval
              </p>
              {gl ? (
                <>
                  <div className="bg-rose-50 border border-rose-100 rounded-lg p-2">
                    <p className="text-[9px] font-black text-rose-400 uppercase">Debit (Expense)</p>
                    <p className="text-xs font-black text-rose-700">{gl.debitCode} — {gl.debitName}</p>
                    <p className="text-xs font-bold text-rose-600">PKR {amount.toLocaleString()}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2">
                    <p className="text-[9px] font-black text-emerald-400 uppercase">Credit (Cash out)</p>
                    <p className="text-xs font-black text-emerald-700">{gl.creditCode} — {gl.creditName}</p>
                    <p className="text-xs font-bold text-emerald-600">PKR {amount.toLocaleString()}</p>
                  </div>
                  {needsPV && (
                    <div className="flex items-center gap-1 mt-1">
                      <Banknote size={11} className="text-purple-500 shrink-0" />
                      <p className="text-[9px] font-bold text-purple-600">
                        Parked PV will be created — Finance must post before cash moves
                      </p>
                    </div>
                  )}
                  {!needsPV && (
                    <p className="text-[9px] text-slate-400 mt-1">No cash payment flagged. PV will not be auto-created.</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-400 italic">No GL category set — Finance will assign manually.</p>
              )}
            </div>

            {/* Cost-center budget this month */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3">
                Cost Center — This Month
              </p>
              {spend && primaryCC ? (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 font-bold">Posted spend</span>
                    <span className="font-black text-slate-700">PKR {spend.posted.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-500 font-bold">Parked (pending)</span>
                    <span className="font-black text-amber-600">PKR {spend.parked.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-2 flex justify-between text-xs">
                    <span className="text-slate-600 font-bold">Total committed</span>
                    <span className="font-black text-slate-800">PKR {spend.total.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-2 flex justify-between text-xs">
                    <span className="text-slate-600 font-bold">This req adds</span>
                    <span className="font-black text-blue-700">PKR {amount.toLocaleString()}</span>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 flex justify-between text-xs">
                    <span className="text-blue-600 font-bold">New total if approved</span>
                    <span className="font-black text-blue-800">PKR {(spend.total + amount).toLocaleString()}</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-slate-400">
                  <AlertTriangle size={14} />
                  <p className="text-xs font-bold">No cost center assigned on line items</p>
                </div>
              )}
            </div>
          </div>

          {/* Line items preview */}
          {r.items && r.items.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 tracking-widest">Description</th>
                    <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 tracking-widest w-16 text-center">Qty</th>
                    <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 tracking-widest w-20">Unit</th>
                    <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 tracking-widest w-28 text-right">Rate</th>
                    <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 tracking-widest w-28 text-right">Amount</th>
                    <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 tracking-widest w-28">Need by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {r.items.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2 text-xs font-bold text-slate-700 uppercase">{item.materialDesc || '—'}</td>
                      <td className="px-4 py-2 text-xs font-black text-slate-600 text-center">{item.qty}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{item.unit}</td>
                      <td className="px-4 py-2 text-xs font-bold text-slate-600 text-right">{item.estimatedRate.toLocaleString()}</td>
                      <td className="px-4 py-2 text-xs font-black text-emerald-700 text-right">
                        {(item.qty * item.estimatedRate).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-[10px] text-slate-400">{item.deliveryDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Reject reason input (shown when reject is clicked) */}
          {showReject && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                Rejection Reason (required)
              </label>
              <textarea
                rows={2}
                className="sap-input w-full text-xs font-bold resize-none"
                placeholder="State the reason for rejection..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            {!showReject ? (
              <>
                <button
                  onClick={() => setShowReject(true)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-rose-200 text-rose-600 text-xs font-black uppercase tracking-widest hover:bg-rose-50 transition-all">
                  <XCircle size={14} /> Reject
                </button>
                <button
                  onClick={onApprove}
                  className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200">
                  <CheckCircle2 size={14} /> Approve
                  {needsPV && <span className="ml-1 opacity-75">+ Create PV</span>}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowReject(false)}
                  className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button
                  disabled={!rejectReason.trim()}
                  onClick={() => { if (rejectReason.trim()) onReject(rejectReason); }}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <XCircle size={14} /> Confirm Rejection
                </button>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
};

// ── Main List ──────────────────────────────────────────────────────────────
export const RequisitionsList: React.FC<Props> = ({
  requisitions,
  searchTerm,
  setSearchTerm,
  onNew,
  onEdit,
  onDelete,
  onApprove,
  onReject,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pending = requisitions.filter(r => r.status === 'Pending');

  return (
    <div className="space-y-4 animate-in fade-in duration-500">

      {/* Pending approval banner */}
      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-amber-500 shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            {pending.length} requisition{pending.length > 1 ? 's' : ''} awaiting MD approval
            — click a row to review
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-200">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">Purchase Requisitions</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ME51N — Internal Procurement Requests</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search by ID, description, name..."
              className="sap-input pl-10 w-72 text-xs font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button onClick={onNew} className="sap-btn-primary flex items-center space-x-2">
            <Plus size={16} />
            <span>Create PR</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">PR Number</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">Description</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">Category</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">By</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Value (PKR)</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">Priority</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">Status</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requisitions.length > 0 ? requisitions.map((r) => (
              <React.Fragment key={r.id}>
                <tr
                  className={`group transition-colors cursor-pointer ${
                    expandedId === r.id
                      ? 'bg-blue-50/60'
                      : r.status === 'Pending'
                      ? 'hover:bg-amber-50/40'
                      : 'hover:bg-slate-50/50'
                  }`}
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {expandedId === r.id
                        ? <ChevronUp size={14} className="text-blue-500 shrink-0" />
                        : <ChevronDown size={14} className="text-slate-300 shrink-0 group-hover:text-slate-400" />
                      }
                      <span className="text-xs font-black text-blue-600 uppercase tracking-tight">{r.id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-bold text-slate-700 uppercase truncate max-w-[200px]">
                      {r.headerText || 'No Description'}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{r.category || '—'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-200 shrink-0">
                        {r.requisitioner.charAt(0)}
                      </div>
                      <span className="text-xs font-bold text-slate-600 uppercase truncate max-w-[80px]">
                        {r.requisitioner}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-xs font-black text-slate-700">
                      {(r.estimatedAmount ?? r.totalValue ?? 0).toLocaleString()}
                    </span>
                    {r.requiresCashPayment && (
                      <span className="ml-1 text-[9px] text-purple-500 font-bold" title="Cash payment required">PV</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-[10px] font-black uppercase flex items-center justify-center gap-1 ${getPriorityColor(r.priority)}`}>
                      {r.priority === 'Urgent' && <AlertCircle size={10} />}
                      {r.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border ${getStatusColor(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(r.status === 'Draft' || r.status === 'Pending') && (
                        <button
                          onClick={() => onEdit(r)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          title="Edit">
                          <Edit size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(r.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        title="Delete">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Inline approval panel for Pending rows */}
                {expandedId === r.id && r.status === 'Pending' && (
                  <ApprovalPanel
                    r={r}
                    onApprove={() => { onApprove(r); setExpandedId(null); }}
                    onReject={(reason) => { onReject(r, reason); setExpandedId(null); }}
                    onClose={() => setExpandedId(null)}
                  />
                )}

                {/* Read-only detail panel for non-pending rows */}
                {expandedId === r.id && r.status !== 'Pending' && (
                  <tr>
                    <td colSpan={8} className="px-6 pb-4">
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3 animate-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                            Requisition Detail — {r.status}
                          </p>
                          <button onClick={() => setExpandedId(null)} className="text-slate-400 hover:text-slate-600">
                            <X size={14} />
                          </button>
                        </div>
                        {r.approvedBy && (
                          <p className="text-xs text-slate-600 font-bold">
                            {r.status === 'Approved' ? '✓ Approved' : '✗ Rejected'} by {r.approvedBy}
                          </p>
                        )}
                        {r.paymentStatus && r.requiresCashPayment && (
                          <p className="text-xs font-bold text-purple-600">
                            Payment status: {r.paymentStatus}
                            {r.paymentRef && ` — Ref: ${r.paymentRef}`}
                          </p>
                        )}
                        {r.items && r.items.length > 0 && (
                          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                  <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400">Material</th>
                                  <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 w-16 text-center">Qty</th>
                                  <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 w-20">Unit</th>
                                  <th className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 w-28 text-right">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {r.items.map(item => (
                                  <tr key={item.id}>
                                    <td className="px-4 py-2 text-xs font-bold text-slate-700 uppercase">{item.materialDesc || '—'}</td>
                                    <td className="px-4 py-2 text-xs text-slate-500 text-center">{item.qty}</td>
                                    <td className="px-4 py-2 text-xs text-slate-500">{item.unit}</td>
                                    <td className="px-4 py-2 text-xs font-black text-emerald-700 text-right">
                                      {(item.qty * item.estimatedRate).toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )) : (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <Clock size={48} className="mb-4 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">No Requisitions Found</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
