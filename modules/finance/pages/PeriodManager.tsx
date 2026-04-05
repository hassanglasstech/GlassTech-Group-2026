import React, { useState, useEffect } from 'react';
import { Company } from '@/modules/shared/types';
import { PeriodService, FiscalPeriod } from '@/modules/finance/services/periodService';
import { useAuthStore } from '@/modules/auth/authStore';
import { Lock, Unlock, Plus, AlertTriangle, CheckCircle2, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const PeriodManager: React.FC<{ company: Company }> = ({ company }) => {
  const { user } = useAuthStore();
  const actor = user?.fullName || user?.email || 'System';
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [newMonth, setNewMonth] = useState(new Date().toISOString().slice(0, 7));

  const refresh = () => setPeriods(PeriodService.listPeriods(company));

  useEffect(() => {
    PeriodService.ensureCurrentPeriod(company, actor);
    refresh();
  }, [company]);

  const handleOpen = async (month: string) => {
    await PeriodService.openPeriod(company, month, actor);
    refresh();
  };

  const handleClose = async (month: string) => {
    await PeriodService.closePeriod(company, month, actor);
    refresh();
  };

  const handleAdd = async () => {
    const exists = periods.find(p => p.month === newMonth);
    if (exists) { toast.error('Period already exists.'); return; }
    await PeriodService.openPeriod(company, newMonth, actor);
    refresh();
  };

  const openCount  = periods.filter(p => p.status === 'Open').length;
  const closedCount = periods.filter(p => p.status === 'Closed').length;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentOpen = periods.find(p => p.month === currentMonth && p.status === 'Open');

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Header */}
      <div className={`p-8 rounded-[2rem] shadow-xl text-white relative overflow-hidden ${currentOpen ? 'bg-emerald-700' : 'bg-rose-700'}`}>
        <div className="absolute top-0 right-0 p-8 opacity-10">
          {currentOpen ? <Unlock size={120}/> : <Lock size={120}/>}
        </div>
        <div className="relative z-10 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">Fiscal Period Control</h2>
            <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest mt-1">
              {company} — Period Locking & Month-End Close
            </p>
          </div>
          <div className="flex gap-8 text-right">
            <div>
              <p className="text-[9px] font-bold opacity-60 uppercase">Open Periods</p>
              <p className="text-3xl font-black">{openCount}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold opacity-60 uppercase">Closed</p>
              <p className="text-3xl font-black">{closedCount}</p>
            </div>
          </div>
        </div>
        {!currentOpen && (
          <div className="mt-4 bg-white/20 border border-white/30 rounded-xl p-3 flex items-center gap-2 relative z-10">
            <AlertTriangle size={16}/>
            <span className="text-sm font-black">Current month ({currentMonth}) is CLOSED — no GL entries can be posted.</span>
          </div>
        )}
      </div>

      {/* Add Period */}
      <div className="bg-white rounded-2xl border shadow-sm p-6 flex items-end gap-4">
        <div className="flex-1">
          <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Add / Open a Period</label>
          <input
            type="month"
            value={newMonth}
            onChange={e => setNewMonth(e.target.value)}
            className="sap-input w-full font-bold text-lg"
          />
        </div>
        <button
          onClick={handleAdd}
          className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 flex items-center gap-2 shadow-lg"
        >
          <Plus size={16}/> Open Period
        </button>
      </div>

      {/* Periods Table */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-slate-50">
          <h3 className="font-black uppercase text-slate-700 text-sm tracking-widest">Fiscal Period Register</h3>
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
            <tr>
              <th className="px-6 py-3">Period</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Opened By</th>
              <th className="px-6 py-3">Closed By</th>
              <th className="px-6 py-3">Closed At</th>
              <th className="px-6 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {periods.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-300 font-bold uppercase text-xs italic">
                  No periods configured. Add one above.
                </td>
              </tr>
            )}
            {periods.map(p => {
              const isCurrent = p.month === currentMonth;
              return (
                <tr key={p.id} className={`hover:bg-slate-50 ${isCurrent ? 'bg-blue-50/40' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400"/>
                      <span className="font-black text-slate-900">{p.month}</span>
                      {isCurrent && (
                        <span className="text-[9px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase">Current</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`flex items-center gap-1 w-fit px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                      p.status === 'Open'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}>
                      {p.status === 'Open' ? <Unlock size={10}/> : <Lock size={10}/>}
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 font-bold">{p.openedBy || '—'}</td>
                  <td className="px-6 py-4 text-xs text-slate-500 font-bold">{p.closedBy || '—'}</td>
                  <td className="px-6 py-4 text-xs text-slate-400">
                    {p.closedAt ? new Date(p.closedAt).toLocaleString('en-PK') : '—'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {p.status === 'Open' ? (
                      <button
                        onClick={() => handleClose(p.month)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase hover:bg-rose-700 mx-auto"
                      >
                        <Lock size={12}/> Close Period
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpen(p.month)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase hover:bg-emerald-700 mx-auto"
                      >
                        <Unlock size={12}/> Re-Open
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Info box */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3">
        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5"/>
        <div className="text-xs font-bold text-amber-800 space-y-1">
          <p>Closing a period prevents ALL new GL entries for that month — payroll, invoices, GRN, and manual journals.</p>
          <p>Re-opening a closed period requires Finance Manager authority. All re-opens are logged with name and timestamp.</p>
        </div>
      </div>

    </div>
  );
};

export default PeriodManager;
