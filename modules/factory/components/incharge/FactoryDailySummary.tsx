import React from 'react';
import { FactoryEvent, Sector } from '../../pages/FactoryInchargeModule';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props { events: FactoryEvent[]; }

const SECTORS: Sector[] = ['Production', 'Store', 'Maintenance', 'HR', 'Logistics', 'Office'];

const FactoryDailySummary: React.FC<Props> = ({ events }) => {
  const todayStr = new Date().toDateString();
  const today = events.filter(e => new Date(e.created_at).toDateString() === todayStr);

  const byPriority = {
    Urgent: today.filter(e => e.priority === 'Urgent'),
    Medium: today.filter(e => e.priority === 'Medium'),
    Low:    today.filter(e => e.priority === 'Low'),
  };

  const resolved = today.filter(e => e.status === 'Resolved' || e.status === 'Closed');
  const open     = today.filter(e => e.status === 'Open' || e.status === 'Pending');

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Daily Summary</div>
        <div className="text-white font-black text-lg">
          {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-white">{today.length}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Total</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-green-400">{resolved.length}</div>
          <div className="text-[10px] text-green-400 uppercase tracking-widest mt-1">Resolved</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-red-400">{open.length}</div>
          <div className="text-[10px] text-red-400 uppercase tracking-widest mt-1">Open</div>
        </div>
      </div>

      {/* Urgent items */}
      {byPriority.Urgent.length > 0 && (
        <div>
          <div className="text-xs text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1">
            <AlertTriangle size={11} /> Urgent Events Today
          </div>
          <div className="space-y-2">
            {byPriority.Urgent.map(ev => (
              <div key={ev.id} className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <div className="font-bold text-red-300 text-sm">{ev.event_type}</div>
                <div className="text-xs text-red-400/70 mt-0.5">{ev.sector} · {ev.detail.slice(0, 60)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By sector */}
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">By Sector</div>
        <div className="space-y-2">
          {SECTORS.map(s => {
            const count = today.filter(e => e.sector === s).length;
            if (count === 0) return null;
            return (
              <div key={s} className="bg-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-slate-300">{s}</span>
                <span className="text-sm font-bold text-white">{count} events</span>
              </div>
            );
          })}
        </div>
      </div>

      {today.length === 0 && (
        <div className="text-center py-16 text-slate-500 text-sm">No events logged today</div>
      )}
    </div>
  );
};

export default FactoryDailySummary;
