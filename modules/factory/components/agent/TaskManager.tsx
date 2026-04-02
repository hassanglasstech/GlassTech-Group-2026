import React, { useEffect, useState } from 'react';
import {
  CheckSquare, Plus, Loader2, X, Check,
  Clock, AlertTriangle, Circle, Trash2, ChevronDown
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';

// ── Types ─────────────────────────────────────────────────────────────
type Priority   = 'Low' | 'Medium' | 'High' | 'Urgent';
type TaskStatus = 'Open' | 'In Progress' | 'Done' | 'Cancelled';

interface Task {
  id: string;
  title: string;
  description?: string;
  assigned_to?: string;
  created_by: string;
  priority: Priority;
  status: TaskStatus;
  due_date?: string;
  entity_label?: string;
  completed_at?: string;
  created_at: string;
}

const PRIORITY_STYLE: Record<Priority, string> = {
  Low:    'bg-slate-500/20 text-slate-400 border-slate-500/30',
  Medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  High:   'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_OPTIONS: TaskStatus[] = ['Open', 'In Progress', 'Done', 'Cancelled'];
const PRIORITY_OPTIONS: Priority[] = ['Low', 'Medium', 'High', 'Urgent'];

// ── Natural language parser (client-side, lightweight) ─────────────────
const parseNaturalTask = (input: string): Partial<Task> => {
  const lower = input.toLowerCase();
  let priority: Priority = 'Medium';
  let due_date: string | undefined;

  if (lower.includes('urgent') || lower.includes('asap') || lower.includes('abhi'))
    priority = 'Urgent';
  else if (lower.includes('high') || lower.includes('important') || lower.includes('zaroor'))
    priority = 'High';
  else if (lower.includes('low') || lower.includes('baad mein') || lower.includes('later'))
    priority = 'Low';

  const todayDate = new Date();
  if (lower.includes('aaj') || lower.includes('today')) {
    due_date = todayDate.toISOString().split('T')[0];
  } else if (lower.includes('kal') || lower.includes('tomorrow')) {
    const d = new Date(todayDate); d.setDate(d.getDate() + 1);
    due_date = d.toISOString().split('T')[0];
  } else if (lower.includes('friday') || lower.includes('jumma')) {
    const d = new Date(todayDate);
    const day = d.getDay();
    const diff = (5 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    due_date = d.toISOString().split('T')[0];
  }

  return { priority, due_date };
};

// ── Component ─────────────────────────────────────────────────────────
const TaskManager: React.FC = () => {
  const { user } = useAuthStore();
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<'active' | 'done'>('active');
  const [showForm, setShowForm] = useState(false);
  const [nlInput, setNlInput]   = useState('');
  const [form, setForm]         = useState({
    title: '', description: '', assigned_to: '',
    priority: 'Medium' as Priority, due_date: '',
  });
  const [saving, setSaving]     = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    const statusFilter = filter === 'active' ? ['Open', 'In Progress'] : ['Done', 'Cancelled'];
    const { data } = await supabase
      .from('agent_tasks')
      .select('*')
      .in('status', statusFilter)
      .order('due_date', { ascending: true, nullsFirst: false });
    if (data) setTasks(data as Task[]);
    setLoading(false);
  };

  // Parse natural language into form
  const applyNL = () => {
    if (!nlInput.trim()) return;
    const parsed = parseNaturalTask(nlInput);
    setForm(p => ({
      ...p,
      title:    nlInput.trim(),
      priority: parsed.priority || 'Medium',
      due_date: parsed.due_date || '',
    }));
    setNlInput('');
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await supabase.from('agent_tasks').insert({
      title:       form.title.trim(),
      description: form.description.trim() || null,
      assigned_to: form.assigned_to.trim() || null,
      priority:    form.priority,
      due_date:    form.due_date || null,
      status:      'Open',
      created_by:  user?.name || 'Hassan',
      created_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    });
    setForm({ title: '', description: '', assigned_to: '', priority: 'Medium', due_date: '' });
    setShowForm(false);
    setFilter('active');
    await load();
    setSaving(false);
  };

  const updateStatus = async (task: Task, status: TaskStatus) => {
    setUpdating(task.id);
    await supabase.from('agent_tasks').update({
      status,
      updated_at:   new Date().toISOString(),
      completed_at: status === 'Done' ? new Date().toISOString() : null,
    }).eq('id', task.id);
    await load();
    setUpdating(null);
  };

  const deleteTask = async (id: string) => {
    await supabase.from('agent_tasks').delete().eq('id', id);
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const isOverdue = (t: Task) =>
    t.due_date && t.status !== 'Done' && new Date(t.due_date) < new Date();

  const openCount = tasks.filter(t => t.status === 'Open').length;
  const urgentCount = tasks.filter(t => t.priority === 'Urgent' && t.status !== 'Done').length;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Task Manager</h2>
          <p className="text-xs text-slate-500 mt-0.5">Natural language · Auto-priority</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-white text-slate-900 font-bold text-xs px-4 py-2 rounded-xl hover:bg-slate-100 transition-all">
          <Plus size={14} /> Add Task
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">{tasks.length}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">
            {filter === 'active' ? 'Active' : 'Done'}
          </div>
        </div>
        <div className={`rounded-xl p-3 text-center ${urgentCount > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-800'}`}>
          <div className={`text-xl font-black ${urgentCount > 0 ? 'text-red-400' : 'text-white'}`}>{urgentCount}</div>
          <div className="text-[10px] text-red-400/70 uppercase tracking-widest mt-0.5">Urgent</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">{openCount}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Open</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 bg-slate-800 p-1 rounded-xl">
        {(['active', 'done'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
              ${filter === f ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {f === 'active' ? 'Active' : 'Done'}
          </button>
        ))}
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">New Task</span>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-slate-400" /></button>
          </div>

          {/* Natural language input */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Type in Urdu/English (auto-parse)</label>
            <div className="flex gap-2">
              <input value={nlInput} onChange={e => setNlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyNL()}
                placeholder="e.g. Ali ko urgent call karo aaj"
                className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20" />
              <button onClick={applyNL}
                className="bg-slate-600 hover:bg-slate-500 text-white text-xs px-3 py-2 rounded-lg transition-all">
                Parse
              </button>
            </div>
          </div>

          <div className="border-t border-slate-700 pt-3 space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Title *</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Task title"
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20" />
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Description</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2} placeholder="Details..."
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Priority</label>
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as Priority }))}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                  {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Due Date</label>
                <input type="date" value={form.due_date}
                  onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Assign To</label>
              <input value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}
                placeholder="e.g. Ali, Incharge, Self"
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
          </div>

          <button onClick={save} disabled={saving || !form.title.trim()}
            className="w-full bg-white text-slate-900 font-black py-3 rounded-xl text-sm uppercase tracking-wider hover:bg-slate-100 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Task'}
          </button>
        </div>
      )}

      {/* Task List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          {filter === 'active' ? 'Koi active task nahi' : 'Koi completed task nahi'}
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <div key={task.id}
              className={`bg-slate-800 rounded-xl p-4 space-y-2 ${isOverdue(task) ? 'border border-red-500/20' : ''}`}>
              <div className="flex items-start gap-3">
                <button onClick={() => updateStatus(task, task.status === 'Done' ? 'Open' : 'Done')}
                  disabled={updating === task.id}
                  className="mt-0.5 shrink-0 text-slate-500 hover:text-green-400 transition-colors">
                  {updating === task.id
                    ? <Loader2 size={16} className="animate-spin" />
                    : task.status === 'Done' ? <Check size={16} className="text-green-400" /> : <Circle size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-bold text-sm ${task.status === 'Done' ? 'line-through text-slate-500' : 'text-white'}`}>
                      {task.title}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[task.priority]}`}>
                      {task.priority}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-xs text-slate-400 mt-1">{task.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {task.due_date && (
                      <span className={`text-[10px] flex items-center gap-1 ${isOverdue(task) ? 'text-red-400' : 'text-slate-500'}`}>
                        <Clock size={10} /> {task.due_date}
                        {isOverdue(task) && ' · OVERDUE'}
                      </span>
                    )}
                    {task.assigned_to && (
                      <span className="text-[10px] text-slate-500">→ {task.assigned_to}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => deleteTask(task.id)}
                  className="shrink-0 text-slate-600 hover:text-red-400 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Status updater */}
              {task.status !== 'Done' && (
                <div className="flex gap-1 pt-1">
                  {STATUS_OPTIONS.filter(s => s !== task.status && s !== 'Cancelled').map(s => (
                    <button key={s} onClick={() => updateStatus(task, s)}
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

export default TaskManager;
