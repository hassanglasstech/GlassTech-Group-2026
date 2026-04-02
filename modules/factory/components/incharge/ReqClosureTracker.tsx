import React, { useEffect, useState } from 'react';
import {
  Circle, Clock, Loader2, CheckCircle2, XCircle,
  ShoppingBag, AlertTriangle, ChevronDown, RefreshCw
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';

// ── Types ─────────────────────────────────────────────────────────────
type ReqStatus = 'Draft' | 'Pending' | 'Approved' | 'Converted to PO' | 'Rejected' | 'Completed' | 'Paid';
type EventStatus = 'Open' | 'Pending' | 'In Progress' | 'Resolved' | 'Closed';

interface LinkedReq {
  event_id: string;
  event_type: string;
  event_sector: string;
  event_priority: string;
  event_status: EventStatus;
  event_created_at: string;
  req_id: string | null;
  req_status: ReqStatus | null;
  req_header: string | null;
  req_date: string | null;
  hours_open: number;
}

// ── Status display config ─────────────────────────────────────────────
const EVENT_STATUS_COLOR: Record<EventStatus, string> = {
  'Open':        'text-red-400',
  'Pending':     'text-yellow-400',
  'In Progress': 'text-blue-400',
  'Resolved':    'text-green-400',
  'Closed':      'text-slate-500',
};

const REQ_STATUS_COLOR: Record<string, string> = {
  'Pending':        'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Approved':       'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Converted to PO':'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Completed':      'bg-green-500/20 text-green-400 border-green-500/30',
  'Rejected':       'bg-red-500/20 text-red-400 border-red-500/30',
  'Draft':          'bg-slate-500/20 text-slate-400 border-slate-500/30',
  'Paid':           'bg-green-500/20 text-green-400 border-green-500/30',
};

const EVENT_STATUS_OPTIONS: EventStatus[] = ['Open', 'Pending', 'In Progress', 'Resolved', 'Closed'];

// ── Component ─────────────────────────────────────────────────────────
const ReqClosureTracker: React.FC = () => {
  const [items, setItems]       = useState<LinkedReq[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<'active' | 'resolved'>('active');
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    try {
      // Fetch factory events
      const statusFilter = filter === 'active'
        ? ['Open', 'Pending', 'In Progress']
        : ['Resolved', 'Closed'];

      const { data: events } = await supabase
        .from('factory_events')
        .select('id, event_type, sector, priority, status, created_at, req_id')
        .in('status', statusFilter)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!events) { setLoading(false); return; }

      // For events with req_id, fetch requisition details
      const reqIds = events.filter(e => e.req_id).map(e => e.req_id);
      let reqMap: Record<string, { status: string; header_text: string; date: string }> = {};

      if (reqIds.length > 0) {
        const { data: reqs } = await supabase
          .from('requisitions')
          .select('id, status, header_text, date')
          .in('id', reqIds);

        if (reqs) {
          reqs.forEach(r => { reqMap[r.id] = r; });
        }
      }

      const now = Date.now();
      const linked: LinkedReq[] = events.map(ev => {
        const req = ev.req_id ? reqMap[ev.req_id] : null;
        return {
          event_id:        ev.id,
          event_type:      ev.event_type,
          event_sector:    ev.sector,
          event_priority:  ev.priority,
          event_status:    ev.status as EventStatus,
          event_created_at: ev.created_at,
          req_id:          ev.req_id ?? null,
          req_status:      req ? (req.status as ReqStatus) : null,
          req_header:      req ? req.header_text : null,
          req_date:        req ? req.date : null,
          hours_open:      Math.floor((now - new Date(ev.created_at).getTime()) / 3600000),
        };
      });

      setItems(linked);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const updateEventStatus = async (eventId: string, newStatus: EventStatus) => {
    setUpdating(eventId);
    await supabase
      .from('factory_events')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', eventId);
    await load();
    setUpdating(null);
  };

  // Summary counts
  const overdue   = items.filter(i => i.hours_open > 24 && i.event_status !== 'Resolved').length;
  const withReq   = items.filter(i => i.req_id).length;
  const noReq     = items.filter(i => !i.req_id).length;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Req Closure Tracker</h2>
          <p className="text-xs text-slate-500 mt-0.5">Event → Requisition pipeline status</p>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">{items.length}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">
            {filter === 'active' ? 'Active' : 'Resolved'}
          </div>
        </div>
        <div className={`rounded-xl p-3 text-center ${overdue > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-800'}`}>
          <div className={`text-xl font-black ${overdue > 0 ? 'text-red-400' : 'text-white'}`}>{overdue}</div>
          <div className="text-[10px] text-red-400/70 uppercase tracking-widest mt-0.5">Overdue 24hr</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-blue-400">{withReq}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Req Linked</div>
        </div>
      </div>

      {/* Filter toggle */}
      <div className="flex gap-2 bg-slate-800 p-1 rounded-xl">
        <button
          onClick={() => setFilter('active')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
            ${filter === 'active' ? 'bg-white text-slate-900' : 'text-slate-400'}`}
        >
          Active
        </button>
        <button
          onClick={() => setFilter('resolved')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
            ${filter === 'resolved' ? 'bg-white text-slate-900' : 'text-slate-400'}`}
        >
          Resolved
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin text-slate-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">No events in this view</div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div
              key={item.event_id}
              className={`bg-slate-800 rounded-xl p-4 space-y-3 ${
                item.hours_open > 24 && item.event_status !== 'Resolved'
                  ? 'border border-red-500/20'
                  : ''
              }`}
            >
              {/* Event row */}
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">{item.event_type}</span>
                    {item.event_priority === 'Urgent' && (
                      <AlertTriangle size={11} className="text-red-400" />
                    )}
                    <span className={`text-xs font-bold ${EVENT_STATUS_COLOR[item.event_status]}`}>
                      {item.event_status}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {item.event_sector} ·{' '}
                    <span className={item.hours_open > 24 ? 'text-red-400' : ''}>
                      {item.hours_open}hr open
                    </span>
                  </div>
                </div>

                {/* Status updater */}
                <div className="relative shrink-0">
                  <select
                    value={item.event_status}
                    onChange={e => updateEventStatus(item.event_id, e.target.value as EventStatus)}
                    disabled={updating === item.event_id}
                    className="bg-slate-700 text-white text-xs rounded-lg px-2 py-1.5 pr-6 outline-none appearance-none cursor-pointer"
                  >
                    {EVENT_STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {updating === item.event_id
                    ? <Loader2 size={10} className="absolute right-1.5 top-2 animate-spin text-slate-400" />
                    : <ChevronDown size={10} className="absolute right-1.5 top-2 text-slate-400 pointer-events-none" />
                  }
                </div>
              </div>

              {/* Requisition row */}
              {item.req_id ? (
                <div className="flex items-center gap-2 bg-slate-700/50 rounded-lg px-3 py-2">
                  <ShoppingBag size={13} className="text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-300 truncate">{item.req_header}</div>
                    <div className="text-[10px] text-slate-500">{item.req_date}</div>
                  </div>
                  {item.req_status && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${REQ_STATUS_COLOR[item.req_status] ?? 'bg-slate-600 text-slate-400'}`}>
                      {item.req_status}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-slate-700/30 rounded-lg px-3 py-2">
                  <Circle size={11} className="text-slate-500 shrink-0" />
                  <span className="text-xs text-slate-500">No requisition linked</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReqClosureTracker;
