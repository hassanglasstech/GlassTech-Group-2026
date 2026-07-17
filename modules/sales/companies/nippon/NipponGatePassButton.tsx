/**
 * NipponGatePassButton — reusable "Issue Gate Pass" control (Gate Pass B).
 *
 * Encapsulates the whole gate-pass issuance in ONE place so both the dedicated
 * Store Issue screen and the Sales → Store Issue tab share identical behaviour:
 *   • opens a modal (vehicle / driver / returnable / instructions),
 *   • generates a QR-verified GatePassInfo and saves it on the order,
 *   • pushes it cross-company to the Factory gatekeeper (#/gatekeeper) in real time,
 *   • once issued, also offers the Urdu driver slip (Gate Pass D).
 *
 * The order status is NOT changed here — the pass authorises the goods to leave;
 * the store still runs Issue / Deliver separately (which is when finance posts).
 */

import React, { useState } from 'react';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { activeCompany } from '@/modules/shared/utils/activeCompany';
import { useAuthStore } from '@/modules/auth/authStore';
import { Quotation, GatePassInfo } from '@/modules/shared/types';
import { pushCrossCompanyNotif } from '@/modules/shared/services/crossCompanyNotifService';
import UrduDriverSlip from '@/modules/shared/components/UrduDriverSlip';
import { toast } from 'sonner';
import { Truck, QrCode, X, Loader2, FileText } from 'lucide-react';

interface Props {
  order: Quotation;
  clientName?: string;
  /** Called with the updated order after a pass is issued (refresh the caller). */
  onIssued?: (updated: Quotation) => void;
  /** 'sm' for dense table rows, 'md' (default) for the pick-detail toolbar. */
  size?: 'sm' | 'md';
  /** Show the "اردو پرچی" slip button next to the gate-pass button. Default true. */
  showSlipButton?: boolean;
}

export const NipponGatePassButton: React.FC<Props> = ({ order, clientName, onIssued, size = 'md', showSlipButton = true }) => {
  const stampUser = useAuthStore(s => s.profile?.fullName || s.profile?.email || s.user?.email || 'store');
  const [open, setOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [showSlip, setShowSlip] = useState(false);
  const [form, setForm] = useState({ vehicleNo: '', driverName: '', driverPhone: '', isReturnable: false, instructions: '' });

  const pad = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2';

  const openModal = () => {
    const gp = order.gatePass;
    setForm({
      vehicleNo: gp?.vehicleNo || '', driverName: gp?.driverName || '',
      driverPhone: gp?.driverPhone || '', isReturnable: gp?.isReturnable || false,
      instructions: gp?.instructions || order.specialInstructions || '',
    });
    setOpen(true);
  };

  const issue = async () => {
    if (!form.vehicleNo.trim() || !form.driverName.trim()) { toast.error('Vehicle no. and driver name are required.'); return; }
    setIssuing(true);
    try {
      const qrToken = `GP-${order.id}-${Date.now().toString(36).toUpperCase()}`;
      const gatePass: GatePassInfo = {
        qrToken,
        vehicleNo: form.vehicleNo.trim().toUpperCase(),
        driverName: form.driverName.trim(),
        driverPhone: form.driverPhone.trim() || undefined,
        isReturnable: form.isReturnable,
        instructions: form.instructions.trim() || undefined,
        issuedAt: new Date().toISOString(),
        issuedBy: stampUser,
        status: 'Issued',
      };
      const updated: Quotation = { ...order, gatePass };
      const res = await AsyncSalesService.saveQuotations([updated]);
      if (res?.error) { toast.error(`Gate pass not saved — ${res.error}`, { duration: 8000 }); return; }
      // Real-time push to the Factory gatekeeper (cross-company). The gatekeeper
      // screen reads these + scans the qrToken to clear the vehicle IN/OUT.
      await pushCrossCompanyNotif({
        targetCompany: 'Factory',
        fromCompany: activeCompany(),
        title: `Gate Pass — ${order.orderNo || order.id}`,
        message: `${clientName || 'Customer'} · Vehicle ${gatePass.vehicleNo} · Driver ${gatePass.driverName}${gatePass.driverPhone ? ` (${gatePass.driverPhone})` : ''}${gatePass.isReturnable ? ' · RETURNABLE' : ''} · QR ${qrToken}`,
        type: 'general',
        referenceId: order.id,
        link: `#/gatekeeper`,
      });
      toast.success(`Gate pass issued for ${order.orderNo || order.id} — pushed to the Factory gate.`);
      setOpen(false);
      onIssued?.(updated);
    } catch (err) {
      toast.error(`Gate pass failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally { setIssuing(false); }
  };

  return (
    <>
      <button onClick={openModal}
        className={`flex items-center gap-1.5 ${pad} rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${order.gatePass ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-slate-700 hover:bg-slate-800 text-white'}`}>
        <Truck size={13}/> {order.gatePass ? 'Gate Pass ✓' : 'Issue Gate Pass'}
      </button>
      {showSlipButton && order.gatePass && (
        <button onClick={() => setShowSlip(true)}
          className={`flex items-center gap-1.5 ${pad} rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-800 hover:bg-amber-200 transition-all`}>
          <FileText size={13}/> اردو پرچی
        </button>
      )}

      {open && (
        <div className="fixed inset-0 bg-slate-900/60 z-[600] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><Truck size={16}/><span className="text-sm font-black uppercase">Issue Gate Pass</span></div>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/10 rounded"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{order.orderNo || order.id} · authorises goods to leave the gate</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Vehicle No *</label>
                  <input value={form.vehicleNo} onChange={e => setForm(f => ({ ...f, vehicleNo: e.target.value }))} className="sap-input w-full text-xs font-black uppercase" placeholder="ABC-123"/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Driver Name *</label>
                  <input value={form.driverName} onChange={e => setForm(f => ({ ...f, driverName: e.target.value }))} className="sap-input w-full text-xs font-bold"/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Driver Phone</label>
                  <input value={form.driverPhone} onChange={e => setForm(f => ({ ...f, driverPhone: e.target.value }))} className="sap-input w-full text-xs font-bold" placeholder="03xx-xxxxxxx"/>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs font-black uppercase text-slate-600 cursor-pointer pb-1.5">
                    <input type="checkbox" checked={form.isReturnable} onChange={e => setForm(f => ({ ...f, isReturnable: e.target.checked }))} className="w-4 h-4"/> Returnable
                  </label>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Driver / Gate Instructions</label>
                <input value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} className="sap-input w-full text-xs" placeholder="Fragile · call before delivery · deliver by…"/>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <QrCode size={16} className="text-indigo-600"/>
                <span className="text-[10px] font-bold text-indigo-800">A QR-verified pass is generated + pushed to the Factory gatekeeper in real time.</span>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-500 border rounded-lg">Cancel</button>
              <button onClick={issue} disabled={issuing} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-black uppercase hover:bg-slate-900 flex items-center gap-1.5 disabled:opacity-50">
                {issuing ? <Loader2 size={13} className="animate-spin"/> : <Truck size={13}/>} Issue Pass
              </button>
            </div>
          </div>
        </div>
      )}

      {showSlip && (
        <UrduDriverSlip order={order} clientName={clientName || ''} onClose={() => setShowSlip(false)} />
      )}
    </>
  );
};

export default NipponGatePassButton;
