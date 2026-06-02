import React, { useEffect, useState } from 'react';
import {
  Zap, Plus, Loader2, X, TrendingUp,
  CheckCircle2, Clock, AlertTriangle, ChevronUp, BarChart3
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';

// ── Types ─────────────────────────────────────────────────────────────
type GapPriority = 'Low' | 'Medium' | 'High' | 'Critical';
type GapStatus   = 'Backlog' | 'Planned' | 'In Progress' | 'Done';

interface GapItem {
  id: string;
  feature_name: string;
  description?: string;
  request_count: number;
  priority: GapPriority;
  status: GapStatus;
  module?: string;
  reported_by?: string;
  first_seen_at: string;
  last_seen_at: string;
  done_at?: string;
  notes?: string;
}

const PRIORITY_STYLE: Record<GapPriority, string> = {
  Low:      'bg-slate-500/20 text-slate-400 border-slate-500/30',
  Medium:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  High:     'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Critical: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_STYLE: Record<GapStatus, string> = {
  Backlog:     'text-slate-400',
  Planned:     'text-blue-400',
  'In Progress': 'text-yellow-400',
  Done:        'text-green-400',
};

const MODULES = [
  'Factory Incharge', 'Production', 'Sales', 'Procurement',
  'Finance', 'HR', 'Logistics', 'Vendor', 'Reports', 'Other'
];

const EMPTY = {
  feature_name: '', description: '', priority: 'Medium' as GapPriority,
  module: 'Factory Incharge', reported_by: '',
};

// ── Component ─────────────────────────────────────────────────────────
const GapDetection: React.FC = () => {
  const { user }                = useAuthStore();
  const [items, setItems]       = useState<GapItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<GapStatus | 'All'>('All');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ ...EMPTY });
  const [saving, setSaving]     = useState(false);
  const [voting, setVoting]     = useState<string | null>(null);

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('build_backlog')
      .select('*')
      .order('request_count', { ascending: false });
    if (filter !== 'All') q = q.eq('status', filter);
    else q = q.neq('status', 'Done');
    const { data } = await q;
    if (data) setItems(data as GapItem[]);
    setLoading(false);
  };

  const save = async () => {
    if (!form.feature_name.trim()) return;
    setSaving(true);

    // Check if same feature already exists (dedup)
    const { data: existing } = await supabase
      .from('build_backlog')
      .select('id, request_count')
      .ilike('feature_name', `%${form.feature_name.trim()}%`)
      .neq('status', 'Done')
      .limit(1);

    if (existing && existing.length > 0) {
      // Increment count
      await supabase.from('build_backlog').update({
        request_count: existing[0].request_count + 1,
        last_seen_at:  new Date().toISOString(),
      }).eq('id', existing[0].id);
    } else {
      await supabase.from('build_backlog').insert({
        feature_name:  form.feature_name.trim(),
        description:   form.description.trim() || null,
        priority:      form.priority,
        status:        'Backlog',
        module:        form.module,
        reported_by:   form.reported_by || user?.name || 'Hassan',
        request_count: 1,
        first_seen_at: new Date().toISOString(),
        last_seen_at:  new Date().toISOString(),
      });
    }

    setForm({ ...EMPTY });
    setShowForm(false);
    await load();
    setSaving(false);
  };

  const vote = async (item: GapItem) => {
    setVoting(item.id);
    await supabase.from('build_backlog').update({
      request_count: item.request_count + 1,
      last_seen_at:  new Date().toISOString(),
    }).eq('id', item.id);
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, request_count: i.request_count + 1 }
      : i
    ).sort((a, b) => b.request_count - a.request_count));
    setVoting(null);
  };

  const updateStatus = async (id: string, status: GapStatus) => {
    await supabase.from('build_backlog').update({
      status,
      done_at: status === 'Done' ? new Date().toISOString() : null,
    }).eq('id', id);
    await load();
  };

  // Stats
  const total    = items.length;
  const critical = items.filter(i => i.priority === 'Critical' || i.priority === 'High').length;
  const topItem  = items[0];

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Gap Detection</h2>
          <p className="text-xs text-slate-500 mt-0.5">Missing features · Build backlog</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-white text-slate-900 font-bold text-xs px-4 py-2 rounded-xl hover:bg-slate-100 transition-all">
          <Plus size={14} /> Report Gap
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">{total}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Open Gaps</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${critical > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-800'}`}>
          <div className={`text-xl font-black ${critical > 0 ? 'text-red-400' : 'text-white'}`}>{critical}</div>
          <div className="text-[10px] text-red-400/70 uppercase tracking-widest mt-0.5">High/Critical</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-blue-400">{topItem?.request_count ?? 0}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Top Votes</div>
        </div>
      </div>

      {/* Top requested */}
      {topItem && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
          <div className="text-[10px] text-blue-400 uppercase tracking-widest mb-1">Most Requested</div>
          <div className="font-bold text-white text-sm">{topItem.feature_name}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {topItem.module} · {topItem.request_count} requests
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['All', 'Backlog', 'Planned', 'In Progress'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all
              ${filter === f ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">Report Missing Feature</span>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-slate-400" /></button>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Feature Name *</label>
            <input value={form.feature_name}
              onChange={e => setForm(p => ({ ...p, feature_name: e.target.value }))}
              placeholder="e.g. Tool Issue Register, Overtime Calculator"
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description</label>
            <textarea value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} placeholder="Kya karna chahiye ye feature?"
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Priority</label>
              <select value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: e.target.value as GapPriority }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                {(['Low', 'Medium', 'High', 'Critical'] as GapPriority[]).map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Module</label>
              <select value={form.module}
                onChange={e => setForm(p => ({ ...p, module: e.target.value }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                {MODULES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <button onClick={save} disabled={saving || !form.feature_name.trim()}
            className="w-full bg-white text-slate-900 font-black py-3 rounded-xl text-sm uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Submit Gap'}
          </button>
        </div>
      )}

      {/* Gap List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">Koi gap report nahi — sab features mojood hain 🎉</div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-start gap-3">
                {/* Vote button */}
                <button onClick={() => vote(item)} disabled={voting === item.id}
                  className="flex flex-col items-center shrink-0 bg-slate-700 hover:bg-slate-600 rounded-lg px-2 py-1.5 transition-all min-w-[36px]">
                  {voting === item.id
                    ? <Loader2 size={12} className="animate-spin text-slate-400" />
                    : <ChevronUp size={12} className="text-slate-400" />}
                  <span className="text-xs font-black text-white mt-0.5">{item.request_count}</span>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">{item.feature_name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[item.priority]}`}>
                      {item.priority}
                    </span>
                    <span className={`text-[10px] font-bold ${STATUS_STYLE[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                  )}
                  <div className="text-[10px] text-slate-600 mt-1">
                    {item.module && `${item.module} · `}
                    First seen: {new Date(item.first_seen_at).toLocaleDateString('en-PK')}
                  </div>
                </div>
              </div>

              {/* Status update */}
              {item.status !== 'Done' && (
                <div className="flex gap-1">
                  {(['Backlog', 'Planned', 'In Progress', 'Done'] as GapStatus[])
                    .filter(s => s !== item.status)
                    .map(s => (
                      <button key={s} onClick={() => updateStatus(item.id, s)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 transition-all">
                        → {s}
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GapDetection;
