/**
 * CreditNoteModule.tsx — Phase 2 (EC-01)
 * List + Create credit notes linked to invoices.
 */

import React, { useState, useEffect } from 'react';
import { Company } from '@/modules/shared/types/core';
import { Invoice }  from '@/modules/finance/types/finance';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { getCreditNotes, issueCreditNote, approveCreditNote, rejectCreditNote, CreditNote } from '@/modules/sales/services/creditNoteService';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { useAuthStore } from '@/modules/auth/authStore';
import { FileMinus, Plus, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Props { company: Company; }

const REASONS = [
  'Price Correction',
  'Goods Returned',
  'Measurement Error',
  'Quality Issue',
  'Duplicate Invoice',
  'Discount Adjustment',
  'Other',
];

const CreditNoteModule: React.FC<Props> = ({ company }) => {
  const { user } = useAuthStore();
  const actor = user?.fullName || user?.email || 'System';

  const [invoices,     setInvoices]     = useState<Invoice[]>([]);
  const [creditNotes,  setCreditNotes]  = useState<CreditNote[]>([]);
  const [showForm,     setShowForm]     = useState(false);
  const [selInvoiceId, setSelInvoiceId] = useState('');
  const [amount,       setAmount]       = useState('');
  const [reason,       setReason]       = useState(REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [saving,       setSaving]       = useState(false);

  const load = async () => {
    const all = await AsyncSalesService.getInvoices() as any[];
    setInvoices(
      all.filter((i: any) =>
        i.company === company && i.status !== 'Voided' && i.balance > 0
      )
    );
    setCreditNotes(getCreditNotes(company));
  };

  useEffect(() => { load(); }, [company]);

  const selInvoice = invoices.find(i => i.id === selInvoiceId) ?? null;
  const finalReason = reason === 'Other' ? customReason : reason;

  const handleIssue = async () => {
    if (!selInvoice) { toast.error('Select an invoice.'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter valid amount.'); return; }
    if (amt > selInvoice.balance) {
      toast.error(`Max creditable: PKR ${selInvoice.balance.toLocaleString()}`); return;
    }
    if (!finalReason.trim()) { toast.error('Enter reason.'); return; }

    const ok = await confirmModal(
      `Raise Credit Note request of PKR ${amt.toLocaleString()} against ${selInvoice.id} (${selInvoice.clientName})?\n\nReason: ${finalReason}\n\nMaker-Checker: this CN will be PENDING APPROVAL. A different finance user must approve it before any GL entry or balance reduction.`
    );
    if (!ok) return;

    setSaving(true);
    try {
      const cn = await issueCreditNote({ invoice: selInvoice, amount: amt, reason: finalReason, company, createdBy: actor });
      toast.success(`Credit Note ${cn.id} raised — Pending Approval (PKR ${amt.toLocaleString()}).`);
      setShowForm(false);
      setSelInvoiceId(''); setAmount(''); setReason(REASONS[0]); setCustomReason('');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to raise credit note.');
    } finally {
      setSaving(false);
    }
  };

  // Checker approves a Pending Approval CN (must differ from maker).
  const handleApprove = async (cn: CreditNote) => {
    if (cn.createdBy === actor) {
      toast.error('Maker cannot approve their own credit note. Ask another finance user.');
      return;
    }
    const inv = invoices.find(i => i.id === cn.invoiceId)
      ?? (await AsyncSalesService.getInvoices() as any[]).find((i: any) => i.id === cn.invoiceId);
    if (!inv) { toast.error(`Invoice ${cn.invoiceId} not found.`); return; }
    if (!await confirmModal(`Approve Credit Note ${cn.id} (PKR ${cn.amount.toLocaleString()})? This posts the reversing GL entry.`)) return;
    try {
      await approveCreditNote({ cnId: cn.id, company, approver: actor, invoice: inv });
      toast.success(`Credit Note ${cn.id} approved & posted.`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Approval failed.');
    }
  };

  const handleReject = async (cn: CreditNote) => {
    if (cn.createdBy === actor) {
      toast.error('Maker cannot reject their own credit note.');
      return;
    }
    const reason = window.prompt(`Reject Credit Note ${cn.id} — enter reason:`);
    if (!reason || !reason.trim()) { toast.error('Rejection cancelled — reason required.'); return; }
    try {
      await rejectCreditNote({ cnId: cn.id, company, rejecter: actor, reason: reason.trim() });
      toast.success(`Credit Note ${cn.id} rejected.`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Rejection failed.');
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-purple-700 text-white p-6 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileMinus size={20} />
          <div>
            <p className="text-[10px] font-bold text-purple-200 uppercase tracking-widest">
              {company} — Credit Notes
            </p>
            <p className="font-black text-lg">
              {creditNotes.length} issued · PKR {creditNotes.reduce((s, cn) => s + cn.amount, 0).toLocaleString()} total credited
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-purple-700 rounded-xl font-black uppercase text-xs hover:bg-purple-50 shadow"
        >
          <Plus size={14} /> New Credit Note
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-purple-700 text-white px-8 py-5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <FileMinus size={18} />
                <span className="font-black uppercase tracking-widest text-sm">Issue Credit Note</span>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-white/10 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="p-8 space-y-5 bg-slate-50">

              {/* Invoice select */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
                  Original Invoice *
                </label>
                <select
                  value={selInvoiceId}
                  onChange={e => setSelInvoiceId(e.target.value)}
                  className="sap-input w-full font-bold"
                >
                  <option value="">— Select Invoice —</option>
                  {invoices.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.id} — {i.clientName} — Balance: PKR {i.balance.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Invoice info */}
              {selInvoice && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase">Client</p>
                      <p className="font-black text-slate-800">{selInvoice.clientName}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase">Outstanding Balance</p>
                      <p className="font-black text-purple-700">PKR {selInvoice.balance.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
                  Credit Amount (PKR) *
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  max={selInvoice?.balance}
                  placeholder="0"
                  className="sap-input w-full font-black text-lg"
                />
                {selInvoice && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Max: PKR {selInvoice.balance.toLocaleString()}
                    <button
                      className="ml-2 text-purple-600 font-black underline"
                      onClick={() => setAmount(String(selInvoice.balance))}
                    >
                      Full balance
                    </button>
                  </p>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
                  Reason *
                </label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="sap-input w-full font-bold"
                >
                  {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {reason === 'Other' && (
                  <input
                    className="sap-input w-full font-bold mt-2"
                    placeholder="Describe reason..."
                    value={customReason}
                    onChange={e => setCustomReason(e.target.value)}
                  />
                )}
              </div>

              {/* GL preview */}
              <div className="bg-white border rounded-xl p-4 space-y-1 text-xs font-mono">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">GL Preview</p>
                <p className="text-slate-600">Dr  Revenue Account ................ PKR {parseFloat(amount)||0}</p>
                <p className="text-slate-600">Cr  AR — {selInvoice?.clientName||'Client'} ........... PKR {parseFloat(amount)||0}</p>
              </div>
            </div>
            <div className="px-8 py-5 bg-white border-t flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border rounded-xl text-slate-500 font-black uppercase text-xs">
                Cancel
              </button>
              <button
                onClick={handleIssue}
                disabled={saving}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-black uppercase text-xs hover:bg-purple-700 shadow disabled:opacity-50"
              >
                {saving ? 'Posting…' : 'Issue Credit Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit notes list */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-slate-50">
          <p className="font-black uppercase text-slate-700 text-xs tracking-widest">
            Credit Notes Register — {company}
          </p>
        </div>
        <table className="w-full sap-table">
          <thead>
            <tr>
              <th className="px-5 py-3 text-left">CN No</th>
              <th className="px-5 py-3 text-left">Invoice</th>
              <th className="px-5 py-3 text-left">Client</th>
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-5 py-3 text-left">Reason</th>
              <th className="px-5 py-3 text-right">Amount (PKR)</th>
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-left">GL Ref</th>
              <th className="px-5 py-3 text-center">Approval</th>
            </tr>
          </thead>
          <tbody>
            {creditNotes.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-300 italic text-sm">
                  No credit notes issued yet.
                </td>
              </tr>
            )}
            {[...creditNotes].reverse().map(cn => {
              const badge =
                cn.status === 'Posted'           ? 'bg-emerald-100 text-emerald-700' :
                cn.status === 'Pending Approval' ? 'bg-amber-100 text-amber-700'    :
                cn.status === 'Rejected'         ? 'bg-rose-100 text-rose-700'       :
                                                   'bg-slate-100 text-slate-600';
              return (
              <tr key={cn.id}>
                <td className="px-5 py-3 font-black text-purple-700 text-sm">{cn.id}</td>
                <td className="px-5 py-3 text-slate-600 text-xs font-bold">{cn.invoiceId}</td>
                <td className="px-5 py-3 font-bold text-slate-800">{cn.clientName}</td>
                <td className="px-5 py-3 text-slate-500 text-xs">{cn.date}</td>
                <td className="px-5 py-3 text-slate-600 text-xs">{cn.reason}</td>
                <td className="px-5 py-3 text-right font-black text-purple-700">
                  {cn.amount.toLocaleString()}
                </td>
                <td className="px-5 py-3">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${badge}`}>
                    {cn.status === 'Posted' && <CheckCircle2 size={10} className="inline mr-0.5"/>}
                    {cn.status !== 'Posted' && <AlertTriangle size={10} className="inline mr-0.5"/>}
                    {cn.status}
                  </span>
                  {cn.status === 'Pending Approval' && (
                    <p className="text-[9px] text-slate-400 mt-1">Maker: {cn.createdBy}</p>
                  )}
                </td>
                <td className="px-5 py-3 text-xs text-slate-400 font-mono">{cn.glTxId || '—'}</td>
                <td className="px-5 py-3 text-center">
                  {cn.status === 'Pending Approval' ? (
                    cn.createdBy === actor ? (
                      <span className="text-[9px] text-slate-400 italic">Awaiting checker</span>
                    ) : (
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => handleApprove(cn)}
                          className="px-2 py-1 bg-emerald-600 text-white rounded text-[9px] font-black uppercase hover:bg-emerald-700"
                        >Approve</button>
                        <button
                          onClick={() => handleReject(cn)}
                          className="px-2 py-1 bg-rose-600 text-white rounded text-[9px] font-black uppercase hover:bg-rose-700"
                        >Reject</button>
                      </div>
                    )
                  ) : cn.approvedBy ? (
                    <span className="text-[9px] text-emerald-700">✓ {cn.approvedBy}</span>
                  ) : cn.rejectedBy ? (
                    <span className="text-[9px] text-rose-700" title={cn.rejectionReason}>✗ {cn.rejectedBy}</span>
                  ) : '—'}
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CreditNoteModule;
