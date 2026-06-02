import React, { useEffect, useState } from 'react';
import {
  Eye, Plus, Loader2, X, Bell, BellOff, Trash2,
  AlertTriangle, CheckCircle2, Clock, ChevronDown
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';

// ── Types ─────────────────────────────────────────────────────────────
type EntityType = 'event' | 'vendor' | 'employee' | 'order' | 'requisition' | 'asset';
type AlertOn    = 'overdue' | 'status_change' | 'value_threshold' | 'custom';
type Severity   = 'Low' | 'Medium' | 'High' | 'Critical';

interface Memory {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  entity_label: string;
  condition: string;
  alert_on: AlertOn;
  threshold?: number;
  active: boolean;
  triggered_count: number;
  last_triggered?: string;
  created_by: string;
  created_at: string;
}

interface AlertItem {
  id: string;
  memory_id: string;
  entity_label: string;
  entity_type: string;
  alert_type: string;
  message: string;
  severity: Severity;
  read: boolean;
  created_at: string;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  Low:      'bg-slate-500/20 text-slate-400 border-slate-500/30',
  Medium:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  High:     'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Critical: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const ENTITY_LABELS: Record<EntityType, string> = {
  event:       'Factory Event',
  vendor:      'Vendor',
  employee:    'Employee',
  order:       'Sales Order',
  requisition: 'Requisition',
  asset:       'Asset',
};

const ALERT_ON_LABELS: Record<AlertOn, string> = {
  overdue:         'Overdue (24hr)',
  status_change:   'Status Change',
  value_threshold: 'Value Threshold',
  custom:          'Custom Condition',
};

const EMPTY_FORM = {
  entity_type:  'event' as EntityType,
  entity_id:    '',
  entity_label: '',
  condition:    '',
  alert_on:     'overdue' as AlertOn,
  threshold:    '',
};

type Tab = 'watchlist' | 'alerts';

// ── Component ─────────────────────────────────────────────────────────
const AgentWatchlist: React.FC = () => {
  const { user } = useAuthStore();
  const [tab, setTab]           = useState<Tab>('alerts');
  const [memories, setMemories] = useState<Memory[]>([]);
  const [alerts, setAlerts]     = useState<AlertItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [saving, setSaving]     = useState(false);

  useEffect(() => { load(); }, [tab]);

  const load = async () => {
    setLoading(true);
    if (tab === 'watchlist') {
      const { data } = await supabase
        .from('agent_memories')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setMemories(data as Memory[]);
    } else {
      const { data } = await supabase
        .from('agent_alert_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setAlerts(data as AlertItem[]);
    }
    setLoading(false);
  };

  const saveMemory = async () => {
    if (!form.entity_label.trim() || !form.condition.trim()) return;
    setSaving(true);
    await supabase.from('agent_memories').insert({
      entity_type:  form.entity_type,
      entity_id:    form.entity_id || crypto.randomUUID(),
      entity_label: form.entity_label.trim(),
      condition:    form.condition.trim(),
      alert_on:     form.alert_on,
      threshold:    form.threshold ? parseFloat(form.threshold) : null,
      active:       true,
      triggered_count: 0,
      created_by:   user?.name || 'Hassan',
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    });
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
    setTab('watchlist');
    await load();
    setSaving(false);
  };

  const toggleActive = async (m: Memory) => {
    await supabase.from('agent_memories')
      .update({ active: !m.active, updated_at: new Date().toISOString() })
      .eq('id', m.id);
    setMemories(prev => prev.map(x => x.id === m.id ? { ...x, active: !x.active } : x));
  };

  const deleteMemory = async (id: string) => {
    await supabase.from('agent_memories').delete().eq('id', id);
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const markRead = async (id: string) => {
    await supabase.from('agent_alert_history')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  };

  const markAllRead = async () => {
    await supabase.from('agent_alert_history')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('read', false);
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  };

  const unreadCount = alerts.filter(a => !a.read).length;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">AI Agent</h2>
          <p className="text-xs text-slate-500 mt-0.5">Watchlist · Alerts · Memory</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-white text-slate-900 font-bold text-xs px-4 py-2 rounded-xl hover:bg-slate-100 transition-all">
          <Plus size={14} /> Add Watch
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 bg-slate-800 p-1 rounded-xl">
        <button onClick={() => setTab('alerts')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2
            ${tab === 'alerts' ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
          <Bell size={12} />
          Alerts
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{unreadCount}</span>
          )}
        </button>
        <button onClick={() => setTab('watchlist')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2
            ${tab === 'watchlist' ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
          <Eye size={12} /> Watchlist
        </button>
      </div>

      {/* Add Watch Form */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">Add to Watchlist</span>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-slate-400" /></button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Entity Type</label>
              <select value={form.entity_type}
                onChange={e => setForm(p => ({ ...p, entity_type: e.target.value as EntityType }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                {(Object.keys(ENTITY_LABELS) as EntityType[]).map(k => (
                  <option key={k} value={k}>{ENTITY_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Alert On</label>
              <select value={form.alert_on}
                onChange={e => setForm(p => ({ ...p, alert_on: e.target.value as AlertOn }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                {(Object.keys(ALERT_ON_LABELS) as AlertOn[]).map(k => (
                  <option key={k} value={k}>{ALERT_ON_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Label *</label>
            <input value={form.entity_label}
              onChange={e => setForm(p => ({ ...p, entity_label: e.target.value }))}
              placeholder="e.g. Vendor Ali Glass, SO-2473, Table #2"
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Condition *</label>
            <textarea value={form.condition}
              onChange={e => setForm(p => ({ ...p, condition: e.target.value }))}
              placeholder="e.g. Alert me if this vendor misses delivery SLA, or if this event is not resolved in 24hr"
              rows={2}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-white/20" />
          </div>

          {form.alert_on === 'value_threshold' && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Threshold Value (PKR)</label>
              <input type="number" value={form.threshold}
                onChange={e => setForm(p => ({ ...p, threshold: e.target.value }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
          )}

          <button onClick={saveMemory} disabled={saving || !form.entity_label.trim() || !form.condition.trim()}
            className="w-full bg-white text-slate-900 font-black py-3 rounded-xl text-sm uppercase tracking-wider hover:bg-slate-100 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Watch'}
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : tab === 'alerts' ? (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">No alerts yet</div>
          ) : (
            <>
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                  className="w-full text-xs text-slate-400 hover:text-white transition-colors py-1">
                  Mark all as read
                </button>
              )}
              {alerts.map(alert => (
                <div key={alert.id}
                  className={`rounded-xl p-4 transition-all ${alert.read ? 'bg-slate-800/50' : 'bg-slate-800 border border-slate-600'}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={15} className={
                      alert.severity === 'Critical' ? 'text-red-400' :
                      alert.severity === 'High'     ? 'text-orange-400' :
                      alert.severity === 'Medium'   ? 'text-yellow-400' : 'text-slate-400'
                    } />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm">{alert.entity_label}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[alert.severity]}`}>
                          {alert.severity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{alert.message}</p>
                      <div className="text-[10px] text-slate-600 mt-1">
                        {new Date(alert.created_at).toLocaleString('en-PK')}
                      </div>
                    </div>
                    {!alert.read && (
                      <button onClick={() => markRead(alert.id)}
                        className="shrink-0 text-slate-500 hover:text-white transition-colors">
                        <CheckCircle2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {memories.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              Koi watch nahi — Add Watch se start karo
            </div>
          ) : (
            memories.map(m => (
              <div key={m.id} className={`bg-slate-800 rounded-xl p-4 ${!m.active ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <Eye size={15} className={m.active ? 'text-blue-400' : 'text-slate-500'} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{m.entity_label}</span>
                      <span className="text-[10px] text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full">
                        {ENTITY_LABELS[m.entity_type]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{m.condition}</p>
                    <div className="text-[10px] text-slate-600 mt-1">
                      {ALERT_ON_LABELS[m.alert_on]}
                      {m.triggered_count > 0 && ` · Triggered ${m.triggered_count}x`}
                      {m.last_triggered && ` · Last: ${new Date(m.last_triggered).toLocaleDateString('en-PK')}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => toggleActive(m)}
                      className="text-slate-500 hover:text-white transition-colors">
                      {m.active ? <Bell size={14} /> : <BellOff size={14} />}
                    </button>
                    <button onClick={() => deleteMemory(m.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AgentWatchlist;
