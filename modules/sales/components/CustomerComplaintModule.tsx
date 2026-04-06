/**
 * CustomerComplaintModule.tsx — Phase 3 (BA-04)
 * Track post-delivery client complaints linked to invoices.
 * Extends the NCR philosophy into the customer-facing domain.
 */

import React, { useState, useEffect } from 'react';
import { Company } from '@/modules/shared/types/core';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { useAuthStore } from '@/modules/auth/authStore';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import {
  MessageSquareWarning, Plus, X, CheckCircle2,
  Clock, AlertTriangle, XCircle, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

interface Props { company: Company; }

export interface CustomerComplaint {
  id:           string;
  company:      Company;
  date:         string;
  clientId:     string;
  clientName:   string;
  invoiceId?:   string;
  orderNo?:     string;
  category:     ComplaintCategory;
  description:  string;
  status:       ComplaintStatus;
  priority:     'Low' | 'Medium' | 'High' | 'Critical';
  assignedTo?:  string;
  resolution?:  string;
  resolvedAt?:  string;
  resolvedBy?:  string;
  createdBy:    string;
  createdAt:    string;
}

type ComplaintCategory =
  | 'Measurement Error'
  | 'Quality Issue'
  | 'Breakage in Transit'
  | 'Wrong Specification'
  | 'Delay in Delivery'
  | 'Billing Dispute'
  | 'Partial Delivery'
  | 'Other';

type ComplaintStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed' | 'Rejected';

const CATEGORIES: ComplaintCategory[] = [
  'Measurement Error', 'Quality Issue', 'Breakage in Transit',
  'Wrong Specification', 'Delay in Delivery', 'Billing Dispute',
  'Partial Delivery', 'Other',
];

const STATUS_CONFIG: Record<ComplaintStatus, { color: string; icon: React.ReactNode }> = {
  'Open':        { color: 'bg-rose-100 text-rose-700',    icon: <AlertTriangle size={10}/> },
  'In Progress': { color: 'bg-amber-100 text-amber-700',  icon: <Clock size={10}/> },
  'Resolved':    { color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={10}/> },
  'Closed':      { color: 'bg-slate-100 text-slate-500',  icon: <CheckCircle2 size={10}/> },
  'Rejected':    { color: 'bg-slate-100 text-slate-500',  icon: <XCircle size={10}/> },
};

const PRIORITY_COLORS: Record<string, string> = {
  'Critical': 'bg-red-600 text-white',
  'High':     'bg-rose-100 text-rose-700',
  'Medium':   'bg-amber-100 text-amber-700',
  'Low':      'bg-slate-100 text-slate-600',
};

const CC_KEY = (co: Company) => `gtk_erp_customer_complaints_${co}`;
const getComplaints = (co: Company): CustomerComplaint[] => {
  try { return JSON.parse(localStorage.getItem(CC_KEY(co)) || '[]'); } catch { return []; }
};
const saveComplaints = (co: Company, d: CustomerComplaint[]) =>
  localStorage.setItem(CC_KEY(co), JSON.stringify(d));

let _seq = 0;
const nextId = (co: Company) => {
  const year = new Date().getFullYear();
  const key  = `gtk_erp_cc_seq_${co}_${year}`;
  const next = parseInt(localStorage.getItem(key) || '0', 10) + 1;
  localStorage.setItem(key, String(next));
  return `CC-${co.substring(0, 3).toUpperCase()}-${year}-${String(next).padStart(4, '0')}`;
};

const BLANK_FORM = {
  clientId: '', invoiceId: '', orderNo: '',
  category: CATEGORIES[0] as ComplaintCategory,
  description: '', priority: 'Medium' as CustomerComplaint['priority'],
  assignedTo: '',
};

const CustomerComplaintModule: React.FC<Props> = ({ company }) => {
  const { user } = useAuthStore();
  const actor = user?.fullName || user?.email || 'System';

  const [complaints, setComplaints] = useState<CustomerComplaint[]>([]);
  const [clients,    setClients]    = useState<any[]>([]);
  const [invoices,   setInvoices]   = useState<any[]>([]);
  const [showForm,   setShowForm]   = useState(false);
  const [selected,   setSelected]   = useState<CustomerComplaint | null>(null);
  const [form,       setForm]       = useState(BLANK_FORM);
  const [filterStatus, setFilterStatus] = useState<ComplaintStatus | 'All'>('All');
  const [resolution, setResolution] = useState('');

  const load = async () => {
    setComplaints(getComplaints(company));
    const [cls, invs] = await Promise.all([
      AsyncSalesService.getClients(),
      AsyncSalesService.getInvoices(),
    ]);
    setClients(cls.filter((c: any) => c.company === company || !c.company));
    setInvoices((invs as any[]).filter(i => i.company === company));
  };
  useEffect(() => { load(); }, [company]);

  const selectedClient = clients.find(c => c.id === form.clientId);
  const clientInvoices = invoices.filter(i => i.clientId === form.clientId);

  const handleCreate = () => {
    if (!form.clientId) { toast.error('Select a client.'); return; }
    if (!form.description.trim()) { toast.error('Enter description.'); return; }
    const cc: CustomerComplaint = {
      id: nextId(company), company,
      date: new Date().toISOString().split('T')[0],
      clientId:    form.clientId,
      clientName:  selectedClient?.name || form.clientId,
      invoiceId:   form.invoiceId || undefined,
      orderNo:     form.orderNo   || undefined,
      category:    form.category,
      description: form.description,
      status:      'Open',
      priority:    form.priority,
      assignedTo:  form.assignedTo || undefined,
      createdBy:   actor,
      createdAt:   new Date().toISOString(),
    };
    const updated = [...getComplaints(company), cc];
    saveComplaints(company, updated);
    setComplaints(updated);
    toast.success(`Complaint ${cc.id} logged.`);
    setShowForm(false);
    setForm(BLANK_FORM);
  };

  const updateStatus = async (cc: CustomerComplaint, newStatus: ComplaintStatus) => {
    const ok = await confirmModal(`Mark ${cc.id} as "${newStatus}"?`);
    if (!ok) return;
    const now = new Date().toISOString();
    const updated = getComplaints(company).map(c =>
      c.id === cc.id ? {
        ...c, status: newStatus,
        ...(newStatus === 'Resolved' || newStatus === 'Closed'
          ? { resolution, resolvedAt: now, resolvedBy: actor }
          : {}),
      } : c
    );
    saveComplaints(company, updated);
    setComplaints(updated);
    setSelected(null);
    setResolution('');
    toast.success(`Complaint updated → ${newStatus}`);
  };

  const visible = complaints.filter(c =>
    filterStatus === 'All' || c.status === filterStatus
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const counts = {
    Open:        complaints.filter(c => c.status === 'Open').length,
    'In Progress': complaints.filter(c => c.status === 'In Progress').length,
    Resolved:    complaints.filter(c => c.status === 'Resolved').length,
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-orange-700 text-white p-6 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquareWarning size={20} />
          <div>
            <p className="text-[10px] font-bold text-orange-200 uppercase tracking-widest">
              {company} — Customer Complaints
            </p>
            <p className="font-black text-lg">
              {counts.Open} open · {counts['In Progress']} in progress · {counts.Resolved} resolved
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-orange-700 rounded-xl font-black uppercase text-xs hover:bg-orange-50 shadow"
        >
          <Plus size={14} /> Log Complaint
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {(['All', 'Open', 'In Progress', 'Resolved', 'Closed', 'Rejected'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-black uppercase transition-all ${
              filterStatus === s ? 'bg-slate-900 text-white' : 'bg-white border text-slate-500 hover:bg-slate-50'
            }`}
          >
            {s}
            {s !== 'All' && ` (${complaints.filter(c => c.status === s).length})`}
          </button>
        ))}
      </div>

      {/* New complaint form */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-orange-700 text-white px-8 py-5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <MessageSquareWarning size={18}/>
                <span className="font-black uppercase tracking-widest text-sm">Log Customer Complaint</span>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-white/10 rounded-lg">
                <X size={18}/>
              </button>
            </div>
            <div className="p-8 space-y-4 bg-slate-50 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Client *</label>
                  <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value, invoiceId: '' }))} className="sap-input w-full font-bold">
                    <option value="">— Select Client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Invoice (optional)</label>
                  <select value={form.invoiceId} onChange={e => setForm(f => ({ ...f, invoiceId: e.target.value }))} className="sap-input w-full font-bold">
                    <option value="">— None —</option>
                    {clientInvoices.map(i => <option key={i.id} value={i.id}>{i.id} — PKR {i.totalAmount?.toLocaleString()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Order No (optional)</label>
                  <input value={form.orderNo} onChange={e => setForm(f => ({ ...f, orderNo: e.target.value }))} className="sap-input w-full font-bold" placeholder="ORD-2026-001"/>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Category *</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as ComplaintCategory }))} className="sap-input w-full font-bold">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as any }))} className="sap-input w-full font-bold">
                    {['Low', 'Medium', 'High', 'Critical'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Description *</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="sap-input w-full font-bold resize-none"
                    placeholder="Describe the complaint in detail..."
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Assigned To (optional)</label>
                  <input value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} className="sap-input w-full font-bold" placeholder="Employee name"/>
                </div>
              </div>
            </div>
            <div className="px-8 py-5 bg-white border-t flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border rounded-xl text-slate-500 font-black uppercase text-xs">Cancel</button>
              <button onClick={handleCreate} className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl font-black uppercase text-xs hover:bg-orange-700 shadow">Log Complaint</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-slate-800 text-white px-8 py-5 flex justify-between items-center">
              <div>
                <p className="font-black uppercase tracking-widest text-sm">{selected.id}</p>
                <p className="text-slate-400 text-xs mt-0.5">{selected.clientName}</p>
              </div>
              <button onClick={() => { setSelected(null); setResolution(''); }} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={18}/></button>
            </div>
            <div className="p-8 space-y-4 bg-slate-50">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[9px] font-black text-slate-400 uppercase">Category</p><p className="font-bold">{selected.category}</p></div>
                <div><p className="text-[9px] font-black text-slate-400 uppercase">Priority</p>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${PRIORITY_COLORS[selected.priority]}`}>{selected.priority}</span>
                </div>
                <div><p className="text-[9px] font-black text-slate-400 uppercase">Invoice</p><p className="font-bold font-mono text-xs">{selected.invoiceId || '—'}</p></div>
                <div><p className="text-[9px] font-black text-slate-400 uppercase">Order</p><p className="font-bold text-xs">{selected.orderNo || '—'}</p></div>
                <div className="col-span-2"><p className="text-[9px] font-black text-slate-400 uppercase">Description</p><p className="text-sm mt-1">{selected.description}</p></div>
                {selected.resolution && (
                  <div className="col-span-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <p className="text-[9px] font-black text-emerald-600 uppercase">Resolution</p>
                    <p className="text-sm mt-1">{selected.resolution}</p>
                    <p className="text-[9px] text-slate-400 mt-1">By {selected.resolvedBy} · {selected.resolvedAt?.slice(0,10)}</p>
                  </div>
                )}
              </div>
              {selected.status === 'Open' || selected.status === 'In Progress' ? (
                <div className="space-y-3">
                  <textarea
                    rows={2}
                    value={resolution}
                    onChange={e => setResolution(e.target.value)}
                    className="sap-input w-full resize-none text-sm"
                    placeholder="Resolution notes (required to close)..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateStatus(selected, 'In Progress')}
                      disabled={selected.status === 'In Progress'}
                      className="flex-1 py-2 bg-amber-500 text-white rounded-xl font-black uppercase text-xs disabled:opacity-40"
                    >
                      In Progress
                    </button>
                    <button
                      onClick={() => updateStatus(selected, 'Resolved')}
                      className="flex-1 py-2 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs"
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => updateStatus(selected, 'Rejected')}
                      className="flex-1 py-2 bg-slate-500 text-white rounded-xl font-black uppercase text-xs"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-center text-slate-400 text-xs font-bold uppercase">
                  {selected.status} — {selected.resolvedAt?.slice(0,10)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Complaints table */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <table className="w-full sap-table">
          <thead>
            <tr>
              <th className="px-5 py-3 text-left">ID</th>
              <th className="px-5 py-3 text-left">Client</th>
              <th className="px-5 py-3 text-left">Category</th>
              <th className="px-5 py-3 text-left">Priority</th>
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-5 py-3 text-left">Invoice</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-slate-300 italic text-sm">No complaints found.</td></tr>
            )}
            {visible.map(cc => (
              <tr key={cc.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(cc)}>
                <td className="px-5 py-3 font-black text-orange-700 text-sm">{cc.id}</td>
                <td className="px-5 py-3 font-bold text-slate-800">{cc.clientName}</td>
                <td className="px-5 py-3 text-xs text-slate-600">{cc.category}</td>
                <td className="px-5 py-3">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${PRIORITY_COLORS[cc.priority]}`}>
                    {cc.priority}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1 w-fit ${STATUS_CONFIG[cc.status].color}`}>
                    {STATUS_CONFIG[cc.status].icon} {cc.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-slate-400">{cc.date}</td>
                <td className="px-5 py-3 text-xs text-slate-400 font-mono">{cc.invoiceId || '—'}</td>
                <td className="px-5 py-3 text-right">
                  <button className="text-[9px] font-black text-slate-400 hover:text-slate-700 uppercase px-2 py-1 border rounded-lg">
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CustomerComplaintModule;
