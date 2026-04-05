import React, { useState, useEffect, useCallback } from 'react';
import { GTKJobOrder, getGTKJobOrders, updateJobOrderStatus } from '@/modules/sales/services/gtkJobOrderService';
import { Package, Layers, ChevronDown, ChevronRight, Printer, RefreshCw } from 'lucide-react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { Company } from '@/modules/shared/types/core';
import { toast } from 'sonner';

const STATUS_STYLES: Record<string, string> = {
  'Open':        'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Completed':   'bg-emerald-100 text-emerald-700',
  'Cancelled':   'bg-rose-100 text-rose-700',
};

const GTKJobOrderRegister: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany) as Company;
  const [orders,   setOrders]   = useState<GTKJobOrder[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view,     setView]     = useState<'list' | 'bom'>('list');
  const [loading,  setLoading]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getGTKJobOrders(company);
      setOrders(data);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const handleStatusUpdate = async (id: string, status: GTKJobOrder['status']) => {
    await updateJobOrderStatus(id, status);
    setOrders(prev => prev.map(jo => jo.id === id ? { ...jo, status } : jo));
    toast.success(`Job ${id} → ${status}`);
  };

  const openCount    = orders.filter(o => o.status === 'Open').length;
  const inProgCount  = orders.filter(o => o.status === 'In Progress').length;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10"><Package size={120}/></div>
        <div className="flex justify-between items-start relative z-10">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">GTK Job Order Register</h2>
            <p className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mt-1">Production — {company}</p>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex gap-8 text-right">
              <div><p className="text-[9px] font-bold text-blue-300 uppercase">Open</p><p className="text-3xl font-black text-blue-200">{openCount}</p></div>
              <div><p className="text-[9px] font-bold text-amber-300 uppercase">In Progress</p><p className="text-3xl font-black text-amber-200">{inProgCount}</p></div>
            </div>
            <button onClick={load} disabled={loading} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>
            </button>
          </div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        <button onClick={() => setView('list')} className={`px-5 py-2 rounded-xl text-xs font-black uppercase ${view === 'list' ? 'bg-slate-900 text-white' : 'bg-white border text-slate-500'}`}>
          <span className="flex items-center gap-1.5"><Package size={13}/> Job Orders</span>
        </button>
        <button onClick={() => setView('bom')} className={`px-5 py-2 rounded-xl text-xs font-black uppercase ${view === 'bom' ? 'bg-slate-900 text-white' : 'bg-white border text-slate-500'}`}>
          <span className="flex items-center gap-1.5"><Layers size={13}/> BOM Summary</span>
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-2xl border p-8 text-center text-slate-400 text-xs font-bold uppercase animate-pulse">
          Loading from Supabase…
        </div>
      )}

      {/* ── JOB ORDER LIST ── */}
      {!loading && view === 'list' && (
        <div className="space-y-3">
          {orders.length === 0 && (
            <div className="bg-white rounded-2xl border p-16 text-center text-slate-300 font-bold uppercase text-xs italic">
              No job orders yet. Convert a quotation from the GTK Quotation Builder.
            </div>
          )}
          {orders.map(jo => (
            <div key={jo.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div
                className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-slate-50"
                onClick={() => setExpanded(expanded === jo.id ? null : jo.id)}
              >
                {expanded === jo.id ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
                <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                  <div>
                    <p className="font-black text-blue-700 text-sm">{jo.id}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(jo.createdAt).toLocaleDateString('en-PK')}</p>
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-xs uppercase">{jo.clientName}</p>
                    <p className="text-[10px] text-slate-400">{jo.site}</p>
                  </div>
                  <div>
                    <p className="font-bold text-xs text-slate-700">{jo.profileType}</p>
                    <p className="text-[10px] text-slate-400">{jo.sectionSize} — {jo.optionLabel}</p>
                  </div>
                  <div className="text-center">
                    <p className="font-black text-slate-900 text-sm">{jo.items.length}</p>
                    <p className="text-[9px] text-slate-400 uppercase">items</p>
                  </div>
                  <div className="text-center">
                    <p className="font-black text-slate-700 text-sm">{jo.totalSqft.toFixed(1)}</p>
                    <p className="text-[9px] text-slate-400 uppercase">sqft</p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${STATUS_STYLES[jo.status]}`}>
                      {jo.status}
                    </span>
                    <button onClick={e => { e.stopPropagation(); window.print(); }} className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                      <Printer size={14}/>
                    </button>
                  </div>
                </div>
              </div>

              {expanded === jo.id && (
                <div className="border-t border-slate-100 bg-slate-50">
                  <div className="px-6 py-3 flex items-center gap-2 border-b border-slate-200 bg-white">
                    <span className="text-[10px] font-black uppercase text-slate-400 mr-2">Update Status:</span>
                    {(['Open', 'In Progress', 'Completed', 'Cancelled'] as GTKJobOrder['status'][]).map(s => (
                      <button
                        key={s}
                        onClick={() => handleStatusUpdate(jo.id, s)}
                        disabled={jo.status === s}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-all ${
                          jo.status === s
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'border-slate-200 text-slate-500 hover:border-slate-400'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 border-b border-slate-200">
                        <tr>
                          {['S.No','Window Type','Floor','Location','Qty','W×H (mm)','Glass Spec','Glass Sqft','Al. RFT','Netting'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left font-black uppercase text-[9px] text-slate-500 tracking-widest whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {jo.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-white">
                            <td className="px-4 py-2.5 font-black text-slate-700">{item.serial}</td>
                            <td className="px-4 py-2.5 font-bold text-slate-700">{item.windowType}</td>
                            <td className="px-4 py-2.5 text-slate-500">{item.floor}</td>
                            <td className="px-4 py-2.5 text-slate-500">{item.location || '—'}</td>
                            <td className="px-4 py-2.5 font-black text-slate-900 text-center">{item.qty}</td>
                            <td className="px-4 py-2.5 font-bold text-slate-700">{item.widthMM}×{item.heightMM}</td>
                            <td className="px-4 py-2.5 text-slate-600">{item.glassSpec}</td>
                            <td className="px-4 py-2.5 font-bold text-blue-700">{item.glassSqft.toFixed(1)}</td>
                            <td className="px-4 py-2.5 font-bold text-emerald-700">{item.alumRFT.toFixed(1)}</td>
                            <td className="px-4 py-2.5 text-slate-400">{item.netting === 'none' ? '—' : item.netting}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                        <tr>
                          <td colSpan={7} className="px-4 py-2.5 font-black text-xs text-slate-500 uppercase">Totals</td>
                          <td className="px-4 py-2.5 font-black text-blue-700">{jo.totalGlassSqft.toFixed(1)} sqft</td>
                          <td className="px-4 py-2.5 font-black text-emerald-700">{jo.totalAlumRFT.toFixed(1)} rft</td>
                          <td/>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── BOM SUMMARY ── */}
      {!loading && view === 'bom' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-slate-50">
            <h3 className="font-black uppercase text-slate-700 text-sm">Consolidated BOM — All Open Job Orders</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Aggregate material requirements across all Open and In-Progress jobs</p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
              <tr>
                <th className="px-6 py-3 text-left">Material</th>
                <th className="px-6 py-3 text-right">Required Qty</th>
                <th className="px-6 py-3 text-left">Unit</th>
                <th className="px-6 py-3 text-left">Job Orders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                const active = orders.filter(o => o.status === 'Open' || o.status === 'In Progress');
                const merged: Record<string, { qty: number; unit: string; jobs: string[] }> = {};
                for (const jo of active) {
                  for (const line of jo.bom) {
                    if (!merged[line.description]) merged[line.description] = { qty: 0, unit: line.unit, jobs: [] };
                    merged[line.description].qty += line.qty;
                    if (!merged[line.description].jobs.includes(jo.id)) merged[line.description].jobs.push(jo.id);
                  }
                }
                const rows = Object.entries(merged);
                if (rows.length === 0) return (
                  <tr><td colSpan={4} className="text-center py-12 text-slate-300 font-bold uppercase text-xs italic">No active job orders.</td></tr>
                );
                return rows.map(([desc, data]) => (
                  <tr key={desc} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-bold text-slate-800">{desc}</td>
                    <td className="px-6 py-3 text-right font-black text-slate-900 text-sm">{Math.ceil(data.qty).toLocaleString()}</td>
                    <td className="px-6 py-3 font-bold text-slate-500">{data.unit}</td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap gap-1">
                        {data.jobs.map(j => (
                          <span key={j} className="text-[9px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-black">{j}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GTKJobOrderRegister;
