/**
 * GlasscoWorkOrders.tsx — Phase 6 (6.2)
 *
 * Formal Work Order entity. WO# is distinct from SO# — one Sales Order
 * can spawn multiple Work Orders (e.g. partial production runs, rework
 * after NCR, buffer cuts on high-value contracts).
 *
 * The cutter / supervisor refers to WO#; the customer-facing identity
 * stays the SO. Production pieces continue to live under their orderId
 * (the SO number) — the WO is a planning + tracking wrapper that
 * groups them.
 *
 * Issued via the same `allocate_serial(...)` RPC as Phase-2 to avoid
 * collisions across browsers.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { allocateSerial } from '@/modules/sales/services/serialAllocator';
import { ProductionService } from '@/modules/production/services/productionService';
import { Plus, Trash2, Save, X, Wrench, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface WorkOrder {
  id?: string; company: string;
  salesOrderId?: string; clientId?: string; clientName?: string;
  projectName?: string; description?: string;
  status?: 'Open' | 'In-Progress' | 'Completed' | 'Cancelled' | string;
  priority?: 'Low' | 'Normal' | 'Urgent' | string;
  plannedStart?: string; plannedEnd?: string;
  actualStart?: string;  actualEnd?: string;
  piecesTotal?: number;  piecesDone?: number;
  notes?: string;
  createdAt?: string;
}

const STATUS_TONE: Record<string, string> = {
  Open:        'bg-slate-100 text-slate-600 border-slate-200',
  'In-Progress':'bg-blue-50 text-blue-700 border-blue-200',
  Completed:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled:   'bg-rose-50 text-rose-600 border-rose-200',
};
const PRIORITY_TONE: Record<string, string> = {
  Low:    'bg-slate-100 text-slate-500',
  Normal: 'bg-blue-50 text-blue-700',
  Urgent: 'bg-rose-100 text-rose-700',
};

const blank = (company: string): WorkOrder => ({
  company, status: 'Open', priority: 'Normal',
  piecesTotal: 0, piecesDone: 0,
});

const GlasscoWorkOrders: React.FC = () => {
  const company = (useAppStore(s => s.selectedCompany) as any) || 'Glassco';
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'completed'>('all');

  const refresh = useCallback(async () => {
    const [wos, qs, cs] = await Promise.all([
      AsyncSalesService.getWorkOrders(),
      AsyncSalesService.getQuotations(),
      AsyncSalesService.getClients(),
    ]);
    setWorkOrders((wos as any[]).filter(w => w.company === company));
    setSalesOrders((qs as any[]).filter((q: any) => q.company === company && q.status === 'Approved'));
    setClients((cs as any[]).filter(c => c.company === company));
  }, [company]);

  useEffect(() => { refresh(); }, [refresh]);

  const visible = workOrders.filter(w => {
    if (filter === 'all') return true;
    if (filter === 'open') return w.status === 'Open';
    if (filter === 'in_progress') return w.status === 'In-Progress';
    if (filter === 'completed') return w.status === 'Completed';
    return true;
  });

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.salesOrderId && !editing.clientId) { toast.error('Either a Sales Order OR a Client is required.'); return; }
    let id = editing.id;
    if (!id) {
      // Phase-2 (2.5) atomic serial — eliminates concurrency collisions.
      const seq = await allocateSerial(company, 'WO', new Date().getFullYear(), 1);
      const mmyy = new Date().toISOString().substring(2, 7).replace('-', ''); // YYMM
      id = `WO-${company.substring(0, 3).toUpperCase()}-${mmyy}-${String(seq).padStart(4, '0')}`;
    }

    // Auto-fill from Sales Order if linked
    let row: WorkOrder = { ...editing, id, company };
    if (row.salesOrderId) {
      const so: any = salesOrders.find(q => q.orderNo === row.salesOrderId || q.id === row.salesOrderId);
      if (so) {
        row.clientId = so.clientId || row.clientId;
        row.clientName = clients.find(c => c.id === so.clientId)?.name || row.clientName;
        row.projectName = so.projectName || row.projectName;
        // Compute pieces total from production_pieces under this SO
        const pcs = ProductionService.getProductionPieces().filter((p: any) => p.orderId === row.salesOrderId);
        if (pcs.length > 0 && !row.piecesTotal) row.piecesTotal = pcs.length;
        const done = pcs.filter((p: any) => p.status === 'Delivered').length;
        if (done > 0 && !row.piecesDone) row.piecesDone = done;
      }
    }
    if (!row.clientName && row.clientId) {
      row.clientName = clients.find(c => c.id === row.clientId)?.name || '';
    }

    await AsyncSalesService.saveWorkOrders([row]);
    toast.success(`${row.id} saved.`);
    setEditing(null);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this Work Order?')) return;
    await AsyncSalesService.deleteWorkOrder(id);
    toast.success('Work Order deleted.');
    await refresh();
  };

  const handleQuickStatus = async (wo: WorkOrder, status: string) => {
    const updated: WorkOrder = { ...wo, status };
    if (status === 'In-Progress' && !wo.actualStart) updated.actualStart = new Date().toISOString().split('T')[0];
    if (status === 'Completed' && !wo.actualEnd) updated.actualEnd = new Date().toISOString().split('T')[0];
    await AsyncSalesService.saveWorkOrders([updated]);
    await refresh();
  };

  const counts = {
    open: workOrders.filter(w => w.status === 'Open').length,
    inProg: workOrders.filter(w => w.status === 'In-Progress').length,
    done: workOrders.filter(w => w.status === 'Completed').length,
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="bg-gradient-to-br from-blue-700 to-cyan-700 text-white p-5 rounded-2xl flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <Wrench size={20}/>
          <div>
            <h2 className="text-lg font-black uppercase">Work Orders</h2>
            <p className="text-[10px] text-cyan-100 font-bold uppercase tracking-widest mt-0.5">
              {counts.open} open · {counts.inProg} in progress · {counts.done} completed
            </p>
          </div>
        </div>
        <button onClick={() => setEditing(blank(company))}
          className="bg-white text-blue-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-blue-50 shadow flex items-center gap-2"
        ><Plus size={14}/> New WO</button>
      </div>

      <div className="flex gap-2">
        {(['all','open','in_progress','completed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase ${filter === f ? 'bg-slate-900 text-white' : 'bg-white border text-slate-500 hover:bg-slate-50'}`}>
            {f === 'all' ? 'All' : f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-500 tracking-widest">
            <tr>
              <th className="px-4 py-3">WO #</th>
              <th className="px-4 py-3">SO Ref</th>
              <th className="px-4 py-3">Client / Project</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3 text-right">Pieces</th>
              <th className="px-4 py-3">Planned</th>
              <th className="px-4 py-3 text-right w-32">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 && <tr><td colSpan={8} className="p-12 text-center text-slate-300 italic font-bold">No Work Orders.</td></tr>}
            {visible.map(w => (
              <tr key={w.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-black text-blue-700">{w.id}</td>
                <td className="px-4 py-3 font-bold text-slate-600">{w.salesOrderId || '—'}</td>
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-800 truncate">{w.clientName || '—'}</p>
                  {w.projectName && <p className="text-[9px] text-slate-400 font-bold uppercase truncate">{w.projectName}</p>}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={w.status || 'Open'}
                    onChange={e => handleQuickStatus(w, e.target.value)}
                    className={`text-[9px] font-black px-2 py-1 rounded border uppercase tracking-wider cursor-pointer ${STATUS_TONE[w.status as any] || STATUS_TONE.Open}`}
                  >
                    {['Open','In-Progress','Completed','Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${PRIORITY_TONE[w.priority as any] || PRIORITY_TONE.Normal}`}>{w.priority}</span>
                </td>
                <td className="px-4 py-3 text-right font-bold text-slate-700">{w.piecesDone || 0} / {w.piecesTotal || 0}</td>
                <td className="px-4 py-3 text-[10px] text-slate-500 font-bold">
                  {w.plannedStart || '—'} → {w.plannedEnd || '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditing({ ...w })} className="text-[10px] font-bold text-blue-600 hover:underline mr-2">Edit</button>
                  <button onClick={() => w.id && handleDelete(w.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={12}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-slate-900/60 z-[500] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-blue-700 text-white px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-black uppercase">{editing.id ? `Edit ${editing.id}` : 'New Work Order'}</span>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-white/10 rounded"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Sales Order (link)</label>
                <select className="sap-input w-full text-xs" value={editing.salesOrderId || ''} onChange={e => setEditing({ ...editing, salesOrderId: e.target.value })}>
                  <option value="">— None (independent WO) —</option>
                  {salesOrders.map((q: any) => <option key={q.id} value={q.orderNo || q.id}>{q.orderNo || q.id} — {clients.find(c => c.id === q.clientId)?.name || q.projectName || 'No project'}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Client</label>
                  <select className="sap-input w-full text-xs" value={editing.clientId || ''} onChange={e => setEditing({ ...editing, clientId: e.target.value })}>
                    <option value="">— Select —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Project / Description</label>
                  <input className="sap-input w-full text-xs" value={editing.projectName || ''} onChange={e => setEditing({ ...editing, projectName: e.target.value })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Status</label>
                  <select className="sap-input w-full text-xs" value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as any })}>
                    {['Open','In-Progress','Completed','Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Priority</label>
                  <select className="sap-input w-full text-xs" value={editing.priority} onChange={e => setEditing({ ...editing, priority: e.target.value as any })}>
                    {['Low','Normal','Urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Planned Start</label>
                  <input type="date" className="sap-input w-full text-xs" value={editing.plannedStart || ''} onChange={e => setEditing({ ...editing, plannedStart: e.target.value })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Planned End</label>
                  <input type="date" className="sap-input w-full text-xs" value={editing.plannedEnd || ''} onChange={e => setEditing({ ...editing, plannedEnd: e.target.value })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Pieces Total</label>
                  <input type="number" className="sap-input w-full text-xs" value={editing.piecesTotal || 0} onChange={e => setEditing({ ...editing, piecesTotal: Number(e.target.value) })}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Pieces Done</label>
                  <input type="number" className="sap-input w-full text-xs" value={editing.piecesDone || 0} onChange={e => setEditing({ ...editing, piecesDone: Number(e.target.value) })}/>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">Notes</label>
                <textarea rows={2} className="sap-input w-full text-xs resize-none" value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })}/>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-xs font-bold text-slate-500 border rounded-lg">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-700 text-white rounded-lg text-xs font-black uppercase hover:bg-blue-800 flex items-center gap-1.5"><Save size={12}/> Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlasscoWorkOrders;
