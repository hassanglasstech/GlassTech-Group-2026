import React, { useEffect, useState, useMemo } from 'react';
import {
  Brain, Plus, Loader2, X, Search,
  Star, Archive, CheckCircle2, Clock,
  AlertTriangle, Lightbulb, Target, Shield,
  TrendingUp, Trash2, RefreshCw, Tag
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';

// ── Types ─────────────────────────────────────────────────────────────
type MemoryCategory = 'Decision' | 'Insight' | 'Lesson' | 'Goal' | 'Risk' | 'Opportunity';
type MemoryPriority = 'Low' | 'Medium' | 'High' | 'Critical';
type MemoryStatus   = 'Active' | 'Archived' | 'Actioned';

interface StrategicMemory {
  id:                  string;
  category:            MemoryCategory;
  title:               string;
  body:                string;
  tags:                string[];
  company:             string;
  priority:            MemoryPriority;
  status:              MemoryStatus;
  outcome?:            string;
  remind_on?:          string;
  reminded:            boolean;
  linked_entity_type?: string;
  linked_entity_id?:   string;
  linked_entity_label?:string;
  created_by:          string;
  created_at:          string;
  updated_at:          string;
}

// ── Config ────────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<MemoryCategory, { icon: React.ElementType; color: string; bg: string }> = {
  Decision:    { icon: CheckCircle2, color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/30'    },
  Insight:     { icon: Lightbulb,   color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  Lesson:      { icon: Brain,       color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
  Goal:        { icon: Target,      color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30'   },
  Risk:        { icon: Shield,      color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30'       },
  Opportunity: { icon: TrendingUp,  color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-500/30'     },
};

const PRIORITY_STYLE: Record<MemoryPriority, string> = {
  Low:      'bg-slate-500/20 text-slate-400 border-slate-500/30',
  Medium:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  High:     'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Critical: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const CATEGORIES = Object.keys(CATEGORY_CONFIG) as MemoryCategory[];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as MemoryPriority[];

const EMPTY_FORM = {
  category:  'Decision' as MemoryCategory,
  title:     '',
  body:      '',
  tagInput:  '',
  tags:      [] as string[],
  priority:  'Medium' as MemoryPriority,
  remind_on: '',
  linked_entity_label: '',
};

// ── Component ─────────────────────────────────────────────────────────
const StrategicMemoryModule: React.FC = () => {
  const { user }                  = useAuthStore();
  const [memories, setMemories]   = useState<StrategicMemory[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [filterCat, setFilterCat] = useState<MemoryCategory | 'All'>('All');
  const [filterStatus, setFilterStatus] = useState<MemoryStatus | 'All'>('Active');
  const [selected, setSelected]   = useState<StrategicMemory | null>(null);
  const [showOutcomeForm, setShowOutcomeForm] = useState(false);
  const [outcomeText, setOutcomeText] = useState('');

  useEffect(() => { load(); }, [filterCat, filterStatus]);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('strategic_memory')
      .select('*')
      .order('created_at', { ascending: false });
    if (filterCat    !== 'All') q = q.eq('category', filterCat);
    if (filterStatus !== 'All') q = q.eq('status',   filterStatus);
    const { data } = await q;
    if (data) setMemories(data as StrategicMemory[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return memories;
    const q = search.toLowerCase();
    return memories.filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.body.toLowerCase().includes(q)  ||
      m.tags?.some(t => t.toLowerCase().includes(q))
    );
  }, [memories, search]);

  const addTag = () => {
    const t = form.tagInput.trim().toLowerCase();
    if (t && !form.tags.includes(t)) {
      setForm(p => ({ ...p, tags: [...p.tags, t], tagInput: '' }));
    }
  };

  const removeTag = (tag: string) =>
    setForm(p => ({ ...p, tags: p.tags.filter(t => t !== tag) }));

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    await supabase.from('strategic_memory').insert({
      category:   form.category,
      title:      form.title.trim(),
      body:       form.body.trim(),
      tags:       form.tags,
      company:    'GlassCo',
      priority:   form.priority,
      status:     'Active',
      remind_on:  form.remind_on || null,
      reminded:   false,
      linked_entity_label: form.linked_entity_label || null,
      created_by: user?.name || 'Hassan',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
    await load();
    setSaving(false);
  };

  const archive = async (id: string) => {
    await supabase.from('strategic_memory').update({ status: 'Archived', updated_at: new Date().toISOString() }).eq('id', id);
    setSelected(null);
    await load();
  };

  const action = async (id: string, outcome: string) => {
    await supabase.from('strategic_memory').update({
      status:     'Actioned',
      outcome,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    setSelected(null);
    setShowOutcomeForm(false);
    setOutcomeText('');
    await load();
  };

  const deleteMemory = async (id: string) => {
    await supabase.from('strategic_memory').delete().eq('id', id);
    setSelected(null);
    await load();
  };

  // Reminders due
  const dueReminders = memories.filter(m =>
    m.remind_on &&
    !m.reminded &&
    m.status === 'Active' &&
    new Date(m.remind_on) <= new Date()
  );

  // Stats
  const byCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    memories.filter(m => m.status === 'Active').forEach(m => {
      counts[m.category] = (counts[m.category] || 0) + 1;
    });
    return counts;
  }, [memories]);

  // ── Detail view ───────────────────────────────────────────────────
  if (selected) {
    const cfg = CATEGORY_CONFIG[selected.category];
    const Icon = cfg.icon;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelected(null); setShowOutcomeForm(false); }}
            className="text-slate-400 hover:text-white text-xs underline">← Back</button>
          <span className={`text-xs font-bold ${cfg.color}`}>{selected.category}</span>
        </div>

        <div className={`rounded-xl border p-5 space-y-3 ${cfg.bg}`}>
          <div className="flex items-start gap-3">
            <Icon size={20} className={cfg.color} />
            <div className="flex-1">
              <div className="font-black text-white text-base">{selected.title}</div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[selected.priority]}`}>
                  {selected.priority}
                </span>
                <span className="text-[10px] text-slate-500">{new Date(selected.created_at).toLocaleDateString('en-PK')}</span>
                <span className="text-[10px] text-slate-500">by {selected.created_by}</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{selected.body}</p>
          {selected.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selected.tags.map(t => (
                <span key={t} className="text-[10px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">#{t}</span>
              ))}
            </div>
          )}
          {selected.linked_entity_label && (
            <div className="text-xs text-slate-400">🔗 {selected.linked_entity_label}</div>
          )}
          {selected.remind_on && (
            <div className="text-xs text-slate-400">🔔 Reminder: {selected.remind_on}</div>
          )}
        </div>

        {selected.outcome && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <div className="text-xs text-green-400 uppercase tracking-widest mb-1">Outcome</div>
            <p className="text-sm text-white">{selected.outcome}</p>
          </div>
        )}

        {selected.status === 'Active' && !showOutcomeForm && (
          <div className="flex gap-2">
            <button onClick={() => setShowOutcomeForm(true)}
              className="flex-1 bg-green-500/20 border border-green-500/30 text-green-400 font-bold text-xs py-2.5 rounded-xl hover:bg-green-500/30 transition-all">
              Mark Actioned
            </button>
            <button onClick={() => archive(selected.id)}
              className="flex-1 bg-slate-700 text-slate-300 font-bold text-xs py-2.5 rounded-xl hover:bg-slate-600 transition-all">
              Archive
            </button>
            <button onClick={() => deleteMemory(selected.id)}
              className="bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-2.5 rounded-xl hover:bg-red-500/30 transition-all">
              <Trash2 size={14} />
            </button>
          </div>
        )}

        {showOutcomeForm && (
          <div className="space-y-3">
            <label className="text-xs text-slate-400 block">What was the outcome?</label>
            <textarea value={outcomeText} onChange={e => setOutcomeText(e.target.value)}
              rows={3} placeholder="Kya hua is decision ke baad..."
              className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-sm outline-none resize-none" />
            <div className="flex gap-2">
              <button onClick={() => action(selected.id, outcomeText)}
                disabled={!outcomeText.trim()}
                className="flex-1 bg-white text-slate-900 font-black py-2.5 rounded-xl text-sm disabled:opacity-40 transition-all">
                Save Outcome
              </button>
              <button onClick={() => setShowOutcomeForm(false)}
                className="px-4 bg-slate-700 text-slate-300 rounded-xl text-sm transition-all">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Strategic Memory</h2>
          <p className="text-xs text-slate-500 mt-0.5">Decisions · Insights · Goals · Lessons</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-white text-slate-900 font-bold text-xs px-4 py-2 rounded-xl hover:bg-slate-100 transition-all">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {/* Reminders */}
      {dueReminders.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <Clock size={14} className="text-yellow-400 shrink-0" />
          <span className="text-yellow-400 text-xs font-bold">
            {dueReminders.length} reminder{dueReminders.length > 1 ? 's' : ''} due — {dueReminders.map(r => r.title).slice(0, 2).join(', ')}
          </span>
        </div>
      )}

      {/* Category grid */}
      <div className="grid grid-cols-3 gap-2">
        {CATEGORIES.map(cat => {
          const cfg  = CATEGORY_CONFIG[cat];
          const Icon = cfg.icon;
          const cnt  = byCategory[cat] || 0;
          return (
            <button key={cat} onClick={() => setFilterCat(filterCat === cat ? 'All' : cat)}
              className={`rounded-xl border p-3 text-center transition-all
                ${filterCat === cat ? cfg.bg : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>
              <Icon size={16} className={filterCat === cat ? cfg.color : 'text-slate-500'} />
              <div className={`text-lg font-black mt-1 ${filterCat === cat ? cfg.color : 'text-white'}`}>{cnt}</div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 mt-0.5">{cat}</div>
            </button>
          );
        })}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 bg-slate-800 p-1 rounded-xl">
        {(['Active', 'Actioned', 'Archived', 'All'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all
              ${filterStatus === s ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-4 py-2.5">
        <Search size={14} className="text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search memories, tags..."
          className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none" />
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">New Memory</span>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-slate-400" /></button>
          </div>

          {/* Category selector */}
          <div>
            <label className="text-xs text-slate-400 mb-2 block">Category</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CATEGORIES.map(cat => {
                const cfg  = CATEGORY_CONFIG[cat];
                const Icon = cfg.icon;
                return (
                  <button key={cat} onClick={() => setForm(p => ({ ...p, category: cat }))}
                    className={`flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold transition-all
                      ${form.category === cat ? `${cfg.bg} ${cfg.color}` : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                    <Icon size={12} />{cat}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Title *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Short, clear title"
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Detail *</label>
            <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
              rows={3} placeholder="Full context, reasoning, what you learned..."
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Priority</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as MemoryPriority }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Remind On</label>
              <input type="date" value={form.remind_on}
                onChange={e => setForm(p => ({ ...p, remind_on: e.target.value }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Linked To (optional)</label>
            <input value={form.linked_entity_label}
              onChange={e => setForm(p => ({ ...p, linked_entity_label: e.target.value }))}
              placeholder="e.g. Vendor Ali Glass, SO-2473"
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tags</label>
            <div className="flex gap-2">
              <input value={form.tagInput}
                onChange={e => setForm(p => ({ ...p, tagInput: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="type + Enter"
                className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
              <button onClick={addTag} className="bg-slate-600 hover:bg-slate-500 text-white text-xs px-3 py-2 rounded-lg transition-all">
                Add
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.tags.map(t => (
                  <span key={t} onClick={() => removeTag(t)}
                    className="text-[10px] bg-slate-600 text-slate-300 px-2 py-0.5 rounded-full cursor-pointer hover:bg-red-500/30 transition-all">
                    #{t} ×
                  </span>
                ))}
              </div>
            )}
          </div>

          <button onClick={save} disabled={saving || !form.title.trim() || !form.body.trim()}
            className="w-full bg-white text-slate-900 font-black py-3 rounded-xl text-sm uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Memory'}
          </button>
        </div>
      )}

      {/* Memory list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          Koi memories nahi — Add se shuru karo
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => {
            const cfg  = CATEGORY_CONFIG[m.category];
            const Icon = cfg.icon;
            const isDue = m.remind_on && !m.reminded && new Date(m.remind_on) <= new Date();
            return (
              <button key={m.id} onClick={() => setSelected(m)}
                className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-left transition-all space-y-2">
                <div className="flex items-start gap-3">
                  <Icon size={15} className={`${cfg.color} shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{m.title}</span>
                      {isDue && <Clock size={11} className="text-yellow-400" />}
                      {m.status === 'Actioned' && <CheckCircle2 size={11} className="text-green-400" />}
                      {m.status === 'Archived' && <Archive size={11} className="text-slate-500" />}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{m.body.slice(0, 60)}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${PRIORITY_STYLE[m.priority]}`}>
                        {m.priority}
                      </span>
                      {m.tags?.slice(0, 3).map(t => (
                        <span key={t} className="text-[10px] text-slate-500">#{t}</span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-600 shrink-0">
                    {new Date(m.created_at).toLocaleDateString('en-PK')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StrategicMemoryModule;
