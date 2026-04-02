import React, { useState } from 'react';
import { Clock, AlertTriangle, CheckCircle2, Circle, Loader2, ChevronDown } from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { FactoryEvent, EventStatus, Priority } from '../../pages/FactoryInchargeModule';

interface Props {
  events: FactoryEvent[];
  onRefresh: () => void;
}

const STATUS_OPTIONS: EventStatus[] = ['Open', 'Pending', 'In Progress', 'Resolved', 'Closed'];

const PRIORITY_COLOR: Record<Priority, string> = {
  Urgent: 'text-red-400',
  Medium: 'text-yellow-400',
  Low:    'text-slate-400',
};

const FactoryReqTracker: React.FC<Props> = ({ events, onRefresh }) => {
  const [filter, setFilter] = useState<EventStatus | 'All'>('All');
  const [updating, setUpdating] = useState<string | null>(null);

  const activeEvents = events.filter(e =>
    filter === 'All'
      ? e.status !== 'Closed'
      : e.status === filter
  );

  const updateStatus = async (event: FactoryEvent, newStatus: EventStatus) => {
    setUpdating(event.id);
    try {
      await supabase
        .from('factory_events')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
          ...(newStatus === 'Resolved' ? { resolved_at: new Date().toISOString() } : {}),
        })
        .eq('id', event.id);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
    setUpdating(null);
  };

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['All', ...STATUS_OPTIONS.slice(0, 4)] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s as EventStatus | 'All')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all
              ${filter === s ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Events */}
      {activeEvents.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">No events in this status</div>
      ) : (
        <div className="space-y-3">
          {activeEvents.map(ev => (
            <div key={ev.id} className="bg-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{ev.event_type}</span>
                    <span className={`text-xs font-bold ${PRIORITY_COLOR[ev.priority]}`}>
                      {ev.priority === 'Urgent' && <AlertTriangle size={11} className="inline mr-1" />}
                      {ev.priority}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{ev.sector}</div>
                </div>
                <span className="text-[10px] text-slate-500 shrink-0 mt-1">
                  {new Date(ev.created_at).toLocaleDateString('en-PK')}
                </span>
              </div>

              <p className="text-sm text-slate-400">{ev.detail}</p>

              {ev.req_id && (
                <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg">
                  📋 Requisition linked — pending procurement approval
                </div>
              )}

              {/* Status updater */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Status:</span>
                <div className="relative flex-1">
                  <select
                    value={ev.status}
                    onChange={e => updateStatus(ev, e.target.value as EventStatus)}
                    disabled={updating === ev.id}
                    className="w-full bg-slate-700 text-white text-xs rounded-lg px-3 py-2 outline-none appearance-none cursor-pointer"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-2.5 text-slate-400 pointer-events-none" />
                </div>
                {updating === ev.id && <Loader2 size={14} className="animate-spin text-slate-400" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FactoryReqTracker;
