/**
 * ICOTransferPanel.tsx — Phase 6
 * UI for posting intercompany transfers with automatic dual-GL posting.
 */

import React, { useState, useEffect } from 'react';
import { Company } from '@/modules/shared/types/core';
import { IntercompanyService, TransferType, IntercompanyTransfer, postIntercompanyTransfer, reverseIntercompanyTransfer } from '@/modules/finance/services/intercompanyService';
import { useAuthStore } from '@/modules/auth/authStore';
import { ArrowRightLeft, Plus, RotateCcw, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';

const COMPANIES: Company[] = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];

const TRANSFER_TYPES: TransferType[] = [
  'Glass Supply', 'Aluminium Supply', 'Hardware Supply',
  'Services', 'Cash Transfer', 'Loan/Advance',
];

const ICOTransferPanel: React.FC<{ company: Company }> = ({ company }) => {
  const { user } = useAuthStore();
  const actor = user?.fullName || user?.email || 'System';

  const [transfers, setTransfers] = useState<IntercompanyTransfer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [posting, setPosting] = useState(false);

  const [form, setForm] = useState({
    fromCompany: company as Company,
    toCompany: 'GTK' as Company,
    type: 'Glass Supply' as TransferType,
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    referenceDoc: '',
  });

  const load = () => setTransfers(IntercompanyService.listTransfers(company));
  useEffect(() => { load(); }, [company]);

  const handlePost = async () => {
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      toast.error('Enter a valid amount.'); return;
    }
    if (form.fromCompany === form.toCompany) {
      toast.error('From and To company cannot be the same.'); return;
    }
    if (!form.description) { toast.error('Enter description.'); return; }

    setPosting(true);
    try {
      await postIntercompanyTransfer({
        fromCompany:  form.fromCompany,
        toCompany:    form.toCompany,
        type:         form.type,
        amount:       Number(form.amount),
        description:  form.description,
        date:         form.date,
        postedBy:     actor,
        referenceDoc: form.referenceDoc || undefined,
      });
      setShowForm(false);
      setForm(f => ({ ...f, amount: '', description: '', referenceDoc: '' }));
      load();
    } finally {
      setPosting(false);
    }
  };

  const handleReverse = async (id: string) => {
    if (!window.confirm(`Reverse transfer ${id}? This will post reversal GL entries in both companies.`)) return;
    await reverseIntercompanyTransfer(id, actor);
    load();
  };

  const posted  = transfers.filter(t => t.status === 'Posted').length;
  const reversed = transfers.filter(t => t.status === 'Reversed').length;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-indigo-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10"><ArrowRightLeft size={120}/></div>
        <div className="flex justify-between items-start relative z-10">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">Intercompany Transfer Automation</h2>
            <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mt-1">
              Dual GL posting — both companies updated simultaneously
            </p>
          </div>
          <div className="flex gap-8 text-right">
            <div><p className="text-[9px] font-bold text-indigo-300 uppercase">Posted</p><p className="text-3xl font-black">{posted}</p></div>
            <div><p className="text-[9px] font-bold text-indigo-300 uppercase">Reversed</p><p className="text-3xl font-black text-indigo-300">{reversed}</p></div>
          </div>
        </div>
      </div>

      {/* Post button */}
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs hover:bg-indigo-700 shadow-lg">
          <Plus size={14}/> Post New Transfer
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-700 uppercase text-sm tracking-widest">New Intercompany Transfer</h3>
            <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400"/></button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">From Company</label>
              <select value={form.fromCompany} onChange={e => setForm(f => ({ ...f, fromCompany: e.target.value as Company }))} className="sap-input w-full font-bold">
                {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex items-end justify-center pb-2">
              <ArrowRightLeft size={24} className="text-indigo-400"/>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">To Company</label>
              <select value={form.toCompany} onChange={e => setForm(f => ({ ...f, toCompany: e.target.value as Company }))} className="sap-input w-full font-bold">
                {COMPANIES.filter(c => c !== form.fromCompany).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Transfer Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as TransferType }))} className="sap-input w-full font-bold">
                {TRANSFER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Amount (PKR)</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="sap-input w-full font-bold text-lg" placeholder="0"/>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="sap-input w-full font-bold"/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="sap-input w-full font-bold" placeholder="e.g. Glass supply — DHA Project batch 3"/>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Reference Doc (optional)</label>
              <input value={form.referenceDoc} onChange={e => setForm(f => ({ ...f, referenceDoc: e.target.value }))} className="sap-input w-full font-bold" placeholder="e.g. GRN-00023"/>
            </div>
          </div>

          {/* Preview */}
          {form.amount && Number(form.amount) > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-xs space-y-1">
              <p className="font-black text-indigo-800 uppercase text-[10px] mb-2">GL Preview</p>
              <p className="text-indigo-700 font-bold">{form.fromCompany}: Dr Intercompany Receivable / Cr {form.type === 'Cash Transfer' ? 'Cash' : 'Revenue'} — PKR {Number(form.amount).toLocaleString()}</p>
              <p className="text-indigo-700 font-bold">{form.toCompany}: Dr {form.type} Inventory/Expense / Cr Intercompany Payable — PKR {Number(form.amount).toLocaleString()}</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-6 py-2.5 text-slate-400 font-black uppercase text-xs">Cancel</button>
            <button onClick={handlePost} disabled={posting}
              className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-black uppercase text-xs hover:bg-indigo-700 shadow-lg flex items-center gap-2 disabled:opacity-50">
              <ArrowRightLeft size={14}/> {posting ? 'Posting…' : 'Post Transfer'}
            </button>
          </div>
        </div>
      )}

      {/* Transfer log */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50">
          <h3 className="font-black uppercase text-slate-700 text-xs tracking-widest">Transfer Log — {company}</h3>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
            <tr>
              <th className="px-5 py-3 text-left">ID</th>
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-5 py-3 text-left">Flow</th>
              <th className="px-5 py-3 text-left">Type</th>
              <th className="px-5 py-3 text-left">Description</th>
              <th className="px-5 py-3 text-right">Amount (PKR)</th>
              <th className="px-5 py-3 text-center">Status</th>
              <th className="px-5 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transfers.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-slate-300 font-bold uppercase text-xs italic">No transfers yet.</td></tr>
            )}
            {transfers.map(t => (
              <tr key={t.id} className={`hover:bg-slate-50 ${t.status === 'Reversed' ? 'opacity-50' : ''}`}>
                <td className="px-5 py-3 font-black text-indigo-600">{t.id}</td>
                <td className="px-5 py-3 text-slate-500">{t.date}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1 text-[10px] font-black">
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{t.fromCompany}</span>
                    <ArrowRightLeft size={10} className="text-slate-400"/>
                    <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{t.toCompany}</span>
                  </div>
                </td>
                <td className="px-5 py-3 font-bold text-slate-600">{t.type}</td>
                <td className="px-5 py-3 text-slate-500 max-w-[180px] truncate">{t.description}</td>
                <td className="px-5 py-3 text-right font-black text-slate-900">{t.amount.toLocaleString()}</td>
                <td className="px-5 py-3 text-center">
                  <span className={`text-[9px] font-black px-2 py-1 rounded-full ${t.status === 'Posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-center">
                  {t.status === 'Posted' && (
                    <button onClick={() => handleReverse(t.id)}
                      className="text-[9px] font-black text-rose-500 hover:text-rose-700 flex items-center gap-1 mx-auto">
                      <RotateCcw size={11}/> Reverse
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ICOTransferPanel;
