/**
 * NipponLogisticsGatePass — the OFFICE gate-pass desk (Logistics module, Nippon).
 *
 * The store incharge REQUESTS a gate pass from the Store Issue screen; those
 * requests land here. The office issues the QR-verified pass (vehicle / driver)
 * which is pushed cross-company to the Factory gatekeeper. Segregation of duties:
 * store requests, office issues, gatekeeper verifies.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { activeCompany } from '@/modules/shared/utils/activeCompany';
import { Client, Quotation } from '@/modules/shared/types';
import { NipponGatePassButton } from '@/modules/sales/companies/nippon/NipponGatePassButton';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';
import { Truck, Loader2, RefreshCw, ClipboardList, Clock, CheckCircle2 } from 'lucide-react';

const fmt = (ts?: string): string => {
  if (!ts) return '';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const NipponLogisticsGatePass: React.FC = () => {
  const [orders, setOrders] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const { refreshKey } = useRealtimeRefresh('quotations');

  const load = useCallback(async () => {
    setLoading(true);
    const company = activeCompany();
    const [qs, cs] = await Promise.all([AsyncSalesService.getQuotations(), AsyncSalesService.getClients()]);
    setOrders(qs.filter(q => q.company === company && (q.gatePassRequested || q.gatePass)));
    setClients(cs.filter(c => c.company === company));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const clientName = (q: Quotation): string =>
    clients.find(c => c.id === q.clientId)?.name || (q as { clientName?: string }).clientName || '—';
  const patch = (u: Quotation) => setOrders(prev => prev.map(o => (o.id === u.id ? u : o)));

  const pending = useMemo(() => orders.filter(q => q.gatePassRequested && !q.gatePass), [orders]);
  const issued = useMemo(() => orders.filter(q => q.gatePass), [orders]);

  const Row: React.FC<{ q: Quotation }> = ({ q }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-3 flex-wrap">
      <span className="font-black text-blue-600 text-sm uppercase">{q.orderNo || q.id}</span>
      <span className="text-xs font-bold text-slate-600 uppercase">{clientName(q)}</span>
      {q.gatePassRequested && !q.gatePass && (
        <span className="flex items-center gap-1 text-[9px] font-black uppercase text-amber-600" title={`Requested by ${q.gatePassRequestedBy || 'store'}`}>
          <Clock size={11}/> Requested {fmt(q.gatePassRequestedAt)}
        </span>
      )}
      {q.gatePass && (
        <span className="flex items-center gap-1 text-[9px] font-black uppercase text-indigo-600" title={`QR ${q.gatePass.qrToken}`}>
          <Truck size={11}/> {q.gatePass.vehicleNo} · {q.gatePass.driverName}
          {q.gatePass.approvedAt ? <span className="text-emerald-600 ml-1">· Gate ✓</span> : null}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <NipponGatePassButton mode="issue" order={q} clientName={clientName(q)} onIssued={patch} size="sm" />
      </div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="bg-slate-900 text-white p-5 rounded-2xl flex items-center gap-3">
        <div className="p-2.5 bg-indigo-600 rounded-xl"><Truck size={22}/></div>
        <div>
          <h1 className="text-lg font-black uppercase tracking-tight">Gate Pass — Office Desk</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Issue passes for store requests · pushed to the Factory gate · Nippon</p>
        </div>
        <button onClick={load} className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
          <RefreshCw size={13}/> Refresh
        </button>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Loading gate-pass requests…</div>
      ) : (
        <>
          <div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <ClipboardList size={14} className="text-amber-600"/>
              <h3 className="text-[11px] font-black uppercase tracking-widest text-amber-700">Awaiting issue</h3>
              <span className="text-[10px] font-bold text-amber-600">{pending.length}</span>
            </div>
            {pending.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-300 font-black uppercase italic text-xs tracking-widest">
                No gate-pass requests from the store.
              </div>
            ) : (
              <div className="space-y-3">{pending.map(q => <Row key={q.id} q={q} />)}</div>
            )}
          </div>

          {issued.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <CheckCircle2 size={14} className="text-indigo-600"/>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-700">Issued</h3>
                <span className="text-[10px] font-bold text-indigo-600">{issued.length}</span>
              </div>
              <div className="space-y-3">{issued.map(q => <Row key={q.id} q={q} />)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default NipponLogisticsGatePass;
